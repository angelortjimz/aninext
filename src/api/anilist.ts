import type {
  Anime,
  AnimeConnections,
  AnimeSearchResult,
  CommunityRecommendation,
  RelatedAnime,
} from "@/models/anime";

const BASE_URL = "https://graphql.anilist.co";
const SEARCH_LIMIT = 5;
export const SEARCH_MIN_LENGTH = 2;
const BATCH_LIMIT = 50;
const RECOMMENDATION_LIMIT = 25;
const MAX_RETRIES = 2;

export class AnilistError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "AnilistError";
  }
}

interface AnilistTitle {
  romaji?: string | null;
  english?: string | null;
  native?: string | null;
}

interface AnilistTag {
  name?: string | null;
  category?: string | null;
}

interface AnilistCoverImage {
  large?: string | null;
  medium?: string | null;
}

interface AnilistStudio {
  name?: string | null;
}

interface AnilistStudioEdge {
  node?: AnilistStudio | null;
}

interface AnilistRecommendationNode {
  rating?: number | null;
  mediaRecommendation?: AnilistMedia | null;
}

interface AnilistMedia {
  id?: number;
  title?: AnilistTitle;
  format?: string | null;
  seasonYear?: number | null;
  episodes?: number | null;
  genres?: Array<string | null>;
  tags?: AnilistTag[];
  studios?: { edges?: Array<AnilistStudioEdge | null> };
  coverImage?: AnilistCoverImage;
  isAdult?: boolean | null;
  type?: string | null;
  popularity?: number | null;
  relations?: {
    edges?: Array<{
      relationType?: string | null;
      node?: AnilistMedia | null;
    } | null>;
  };
  recommendations?: {
    edges?: Array<{
      node?: AnilistRecommendationNode | null;
    } | null>;
  };
}

interface AnilistResponse<T> {
  data?: T | null;
  errors?: Array<{ message?: string; status?: number }>;
}

interface AnilistPageResponse {
  Page?: { media?: AnilistMedia[] };
}

interface AnilistMediaResponse {
  Media?: AnilistMedia | null;
}

const SEARCH_QUERY = `
  query ($search: String, $page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      media(search: $search, type: ANIME, isAdult: false) {
        id
        title { romaji english native }
        format
        seasonYear
        episodes
        coverImage { large medium }
      }
    }
  }
`;

const CONNECTIONS_QUERY = `
  query ($id: Int, $perPage: Int) {
    Media(id: $id) {
      relations {
        edges {
          relationType
          node {
            id
            title { romaji english native }
            format
            type
          }
        }
      }
      recommendations(sort: RATING_DESC, perPage: $perPage) {
        edges {
          node {
            rating
            mediaRecommendation {
              id
              title { romaji english native }
              format
              type
            }
          }
        }
      }
    }
  }
`;

const BATCH_QUERY = `
  query ($ids: [Int], $page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      media(id_in: $ids, type: ANIME, isAdult: false) {
        id
        title { romaji english native }
        format
        seasonYear
        episodes
        genres
        tags { name category }
        studios(isMain: true) { edges { node { name } } }
        coverImage { large medium }
        isAdult
        popularity
      }
    }
  }
`;

const FORMAT_LABELS: Readonly<Record<string, string>> = {
  TV_SHORT: "TV Short",
  MOVIE: "Movie",
};

// AniList files MAL-style themes under "Theme-*" and "Setting-*" tag
// categories (e.g. "Space" is a "Setting-Universe" tag).
function isThemeCategory(category: string | null | undefined): boolean {
  return category?.startsWith("Theme-") === true || category?.startsWith("Setting-") === true;
}

function imageUrl(media: AnilistMedia): string | null {
  return media.coverImage?.large ?? media.coverImage?.medium ?? null;
}

function isId(value: number | undefined | null): value is number {
  return Number.isInteger(value);
}

function requiredId(media: AnilistMedia): number {
  if (!isId(media.id)) {
    throw new AnilistError("The anime response did not include a valid identifier.");
  }
  return media.id;
}

function titleOf(media: Pick<AnilistMedia, "title">): string | null {
  const title = [media.title?.english, media.title?.romaji, media.title?.native].find((value) =>
    value?.trim(),
  );
  return title?.trim() ?? null;
}

function requiredTitle(media: AnilistMedia): string {
  const title = titleOf(media);
  if (!title) {
    throw new AnilistError("The anime response did not include a title.");
  }
  return title;
}

function formatLabel(media: Pick<AnilistMedia, "format">): string | null {
  const format = media.format;
  if (!format) return null;
  return FORMAT_LABELS[format] ?? format.replace(/_/g, " ");
}

function mainStudios(media: AnilistMedia): string[] {
  return (media.studios?.edges ?? []).flatMap((edge) => {
    const name = edge?.node?.name?.trim();
    return name ? [name] : [];
  });
}

function themes(media: AnilistMedia): string[] {
  return (media.tags ?? []).flatMap((tag) =>
    isThemeCategory(tag.category) && tag.name?.trim() ? [tag.name] : [],
  );
}

function genres(media: AnilistMedia): string[] {
  return (media.genres ?? []).flatMap((genre) => (genre?.trim() ? [genre] : []));
}

function mediaTypeLabel(media: AnilistMedia): string | null {
  return media.type === "ANIME" ? "anime" : media.type === "MANGA" ? "manga" : null;
}

function nativeTitleOf(media: Pick<AnilistMedia, "title">, display: string): string | null {
  const native = media.title?.native?.trim();
  return native && native !== display ? native : null;
}

export function normalizeSearchResult(media: AnilistMedia): AnimeSearchResult {
  const title = requiredTitle(media);
  return {
    id: requiredId(media),
    title,
    nativeTitle: nativeTitleOf(media, title),
    imageUrl: imageUrl(media),
    type: formatLabel(media),
    year: media.seasonYear ?? null,
    episodes: media.episodes ?? null,
  };
}

export function normalizeAnime(media: AnilistMedia): Anime {
  return {
    ...normalizeSearchResult(media),
    genres: genres(media),
    themes: themes(media),
    mainStudios: mainStudios(media),
    popularity: media.popularity ?? 0,
    isAdult: media.isAdult ?? false,
  };
}

function toRelatedAnime(
  edge: { relationType?: string | null; node?: AnilistMedia | null } | null | undefined,
  sourceId: number,
): RelatedAnime | null {
  const node = edge?.node;
  const id = node?.id;
  const title = node ? titleOf(node) : null;
  const mediaType = node ? mediaTypeLabel(node) : null;
  const relationType = edge?.relationType?.trim() ?? null;
  if (!node || !isId(id) || !title || !mediaType || !relationType) return null;
  return { id, title, mediaType, sourceId, relationType };
}

function toCommunityRecommendation(
  edge: { node?: AnilistRecommendationNode | null } | null | undefined,
  sourceId: number,
): CommunityRecommendation | null {
  const node = edge?.node;
  const media = node?.mediaRecommendation;
  const id = media?.id;
  const title = media ? titleOf(media) : null;
  const mediaType = media ? mediaTypeLabel(media) : null;
  if (!node || !media || !isId(id) || !title || !mediaType) return null;
  return {
    id,
    title,
    mediaType,
    sourceId,
    rating: typeof node.rating === "number" && Number.isFinite(node.rating) ? node.rating : 0,
  };
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("The request was cancelled.", "AbortError"));
      return;
    }
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    function onAbort(): void {
      clearTimeout(timeout);
      reject(new DOMException("The request was cancelled.", "AbortError"));
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function retryAfterMs(response: Response): number | null {
  const header = response.headers.get("Retry-After");
  if (header === null || header.trim() === "") return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null;
}

function isRetryable(status: number | undefined): boolean {
  return status === 429 || (status ?? 0) >= 500;
}

async function fetchJson<T>(
  query: string,
  variables: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const backoff = 500 * 2 ** attempt;
    try {
      const response = await fetch(BASE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
        signal,
      });
      const payload = (await response.json()) as AnilistResponse<T>;
      const graphQlError = payload.errors?.[0];
      const status = response.ok ? (graphQlError?.status ?? 200) : response.status;
      if (response.ok && !graphQlError) {
        if (payload.data === null || payload.data === undefined) {
          throw new AnilistError("AniList returned no data.");
        }
        return payload.data;
      }
      if (!isRetryable(status)) {
        throw new AnilistError("AniList could not retrieve this anime.", status);
      }
      lastError = new AnilistError("AniList is temporarily unavailable.", status);
      if (attempt < MAX_RETRIES) {
        await delay(retryAfterMs(response) ?? backoff, signal);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      if (error instanceof AnilistError && !isRetryable(error.status)) throw error;
      lastError = error;
      if (attempt < MAX_RETRIES) await delay(backoff, signal);
    }
  }
  if (lastError instanceof AnilistError) throw lastError;
  throw new AnilistError("We could not connect to AniList. Please try again.");
}

// One map holds every response type, so reads need a cast back to the caller's T.
const cache = new Map<string, Promise<unknown>>();

// A cached promise is bound to the creating call's AbortSignal, so abortable
// callers bypass the cache rather than inherit someone else's abort.
function cached<T>(key: string, load: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal) return load();
  const current = cache.get(key) as Promise<T> | undefined;
  if (current) return current;
  const request = load().catch((error: unknown) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, request);
  return request;
}

export async function searchAnime(
  query: string,
  signal?: AbortSignal,
): Promise<AnimeSearchResult[]> {
  const cleanQuery = query.trim();
  if (cleanQuery.length < SEARCH_MIN_LENGTH) return [];
  const variables = { search: cleanQuery, page: 1, perPage: SEARCH_LIMIT };
  const key = `search:${cleanQuery}`;
  return cached(
    key,
    async () => {
      const response = await fetchJson<AnilistPageResponse>(SEARCH_QUERY, variables, signal);
      const media = response.Page?.media;
      if (!Array.isArray(media))
        throw new AnilistError("AniList returned an invalid search response.");
      return media.map(normalizeSearchResult);
    },
    signal,
  );
}

export function getAnimeConnections(id: number): Promise<AnimeConnections> {
  return cached(`connections:${id}`, async () => {
    const response = await fetchJson<AnilistMediaResponse>(CONNECTIONS_QUERY, {
      id,
      perPage: RECOMMENDATION_LIMIT,
    });
    const media = response.Media;
    if (!media) throw new AnilistError("AniList returned no anime details.");
    const relationEdges = media.relations?.edges;
    if (!Array.isArray(relationEdges)) {
      throw new AnilistError("AniList returned invalid relation data.");
    }
    const relations = relationEdges
      .map((edge) => toRelatedAnime(edge, id))
      .filter((relation): relation is RelatedAnime => relation !== null);
    const recommendationEdges = media.recommendations?.edges ?? [];
    const recommendations = recommendationEdges
      .map((edge) => toCommunityRecommendation(edge, id))
      .filter(
        (recommendation): recommendation is CommunityRecommendation => recommendation !== null,
      );
    return { relations, recommendations };
  });
}

export async function getAnimeBatch(ids: number[]): Promise<Anime[]> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return [];
  const anime: Anime[] = [];
  for (let offset = 0; offset < uniqueIds.length; offset += BATCH_LIMIT) {
    const chunk = uniqueIds.slice(offset, offset + BATCH_LIMIT);
    const response = await fetchJson<AnilistPageResponse>(BATCH_QUERY, {
      ids: chunk,
      page: 1,
      perPage: chunk.length,
    });
    const media = response.Page?.media;
    if (!Array.isArray(media))
      throw new AnilistError("AniList returned an invalid batch response.");
    anime.push(...media.map(normalizeAnime));
  }
  return anime;
}

export function clearAnilistCache(): void {
  cache.clear();
}
