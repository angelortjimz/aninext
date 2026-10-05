import type { Anime, AnimeSearchResult, RelatedAnime } from "../models/anime";

const BASE_URL = "https://graphql.anilist.co";
const SEARCH_LIMIT = 5;
const MAX_RETRIES = 2;

export class AnilistError extends Error {
  constructor(message: string, public readonly status?: number) {
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

interface AnilistMedia {
  id?: number;
  idMal?: number | null;
  title?: AnilistTitle;
  format?: string | null;
  seasonYear?: number | null;
  episodes?: number | null;
  genres?: Array<string | null>;
  tags?: AnilistTag[];
  studios?: { nodes?: Array<{ name?: string | null }> };
  coverImage?: AnilistCoverImage;
  isAdult?: boolean | null;
  type?: string | null;
  relations?: {
    edges?: Array<{
      relationType?: string | null;
      node?: AnilistMedia;
    }>;
  };
}

interface AnilistResponse<T> {
  data?: T | null;
  errors?: Array<{ message?: string; status?: number }>;
}

interface AnilistSearchResponse {
  Page?: { media?: AnilistMedia[] };
}

interface AnilistMediaResponse {
  Media?: AnilistMedia | null;
}

interface AnilistRelationsResponse {
  Media?: AnilistMedia;
}

const SEARCH_QUERY = `
  query ($search: String, $page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      media(search: $search, type: ANIME, isAdult: false) {
        id
        idMal
        title { romaji english native }
        format
        seasonYear
        episodes
        coverImage { large medium }
      }
    }
  }
`;

const MEDIA_QUERY = `
  query ($idMal: Int) {
    Media(idMal: $idMal) {
      id
      idMal
      title { romaji english native }
      format
      seasonYear
      episodes
      genres
      tags { name category }
      studios { nodes { name } }
      coverImage { large medium }
      isAdult
    }
  }
`;

const RELATIONS_QUERY = `
  query ($idMal: Int) {
    Media(idMal: $idMal) {
      relations {
        edges {
          relationType
          node {
            id
            idMal
            title { romaji english native }
            format
            type
          }
        }
      }
    }
  }
`;

const FORMAT_LABELS: Readonly<Record<string, string>> = {
  TV: "TV",
  TV_SHORT: "TV Short",
  MOVIE: "Movie",
  SPECIAL: "Special",
  OVA: "OVA",
  ONA: "ONA",
  MUSIC: "Music",
};

const RELATION_TYPES: Readonly<Record<string, string>> = {
  ADAPTATION: "Adaptation",
  PREQUEL: "Prequel",
  SEQUEL: "Sequel",
  PARENT: "Parent",
  SIDE_STORY: "Side Story",
  CHARACTER: "Character",
  SUMMARY: "Summary",
  ALTERNATIVE: "Alternative Version",
  SPIN_OFF: "Spin-off",
  OTHER: "Other",
  SOURCE: "Source",
  COMPILATION: "Compilation",
  CONTAINS: "Contains",
  SAME_UNIVERSE: "Same Universe",
};

// AniList files MAL-style themes under "Theme-*" and "Setting-*" tag
// categories (e.g. "Space" is a "Setting-Universe" tag).
function isThemeCategory(category: string | null | undefined): boolean {
  return category?.startsWith("Theme-") === true || category?.startsWith("Setting-") === true;
}

function imageUrl(media: AnilistMedia): string | null {
  return media.coverImage?.large ?? media.coverImage?.medium ?? null;
}

function requiredId(media: AnilistMedia): number {
  if (!Number.isInteger(media.idMal)) {
    throw new AnilistError("The anime response did not include a valid identifier.");
  }
  return media.idMal as number;
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

function names(items: Array<{ name?: string | null }> | undefined): string[] {
  return (items ?? []).flatMap((item) => (item.name?.trim() ? [item.name] : []));
}

function studios(media: AnilistMedia): string[] {
  return names(media.studios?.nodes);
}

function themes(media: AnilistMedia): string[] {
  return (media.tags ?? []).flatMap((tag) =>
    isThemeCategory(tag.category) && tag.name?.trim() ? [tag.name] : [],
  );
}

function genres(media: AnilistMedia): string[] {
  return (media.genres ?? []).flatMap((genre) => (genre?.trim() ? [genre] : []));
}

function relationLabel(relationType: string | null | undefined): string | null {
  if (!relationType) return null;
  return RELATION_TYPES[relationType] ?? relationType.replace(/_/g, " ");
}

function mediaTypeLabel(media: AnilistMedia): string | null {
  return media.type === "ANIME" ? "anime" : media.type === "MANGA" ? "manga" : null;
}

export function normalizeSearchResult(media: AnilistMedia): AnimeSearchResult {
  return {
    malId: requiredId(media),
    title: requiredTitle(media),
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
    studios: studios(media),
    isAdult: media.isAdult ?? false,
  };
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        reject(new DOMException("The request was cancelled.", "AbortError"));
      },
      { once: true },
    );
  });
}

async function fetchJson<T>(
  query: string,
  variables: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(BASE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
        signal,
      });
      const payload = (await response.json()) as AnilistResponse<T>;
      // AniList reports GraphQL failures in the response body, sometimes with
      // a 200 status, so the error list decides whether a request succeeded.
      const graphQlError = payload.errors?.[0];
      const status = response.ok ? (graphQlError?.status ?? 200) : response.status;
      if (response.ok && !graphQlError) {
        if (payload.data === null || payload.data === undefined) {
          throw new AnilistError("AniList returned no data.");
        }
        return payload.data;
      }
      if (status !== 429 && status < 500) {
        throw new AnilistError("AniList could not retrieve this anime.", status);
      }
      lastError = new AnilistError("AniList is temporarily unavailable.", status);
      const retryAfter = Number(response.headers.get("Retry-After"));
      if (attempt < MAX_RETRIES) {
        await delay(Number.isFinite(retryAfter) ? retryAfter * 1000 : 500 * 2 ** attempt, signal);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      if (error instanceof AnilistError && error.status !== 429 && (error.status ?? 0) < 500) throw error;
      lastError = error;
      if (attempt < MAX_RETRIES) await delay(500 * 2 ** attempt, signal);
    }
  }
  if (lastError instanceof AnilistError) throw lastError;
  throw new AnilistError("We could not connect to AniList. Please try again.");
}

const cache = new Map<string, Promise<unknown>>();

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const current = cache.get(key) as Promise<T> | undefined;
  if (current) return current;
  const request = load().catch((error: unknown) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, request);
  return request;
}

export async function searchAnime(query: string, signal?: AbortSignal): Promise<AnimeSearchResult[]> {
  const cleanQuery = query.trim();
  if (cleanQuery.length < 2) return [];
  const variables = { search: cleanQuery, page: 1, perPage: SEARCH_LIMIT };
  const key = `search:${cleanQuery}`;
  return cached(key, async () => {
    const response = await fetchJson<AnilistSearchResponse>(SEARCH_QUERY, variables, signal);
    const media = response.Page?.media;
    if (!Array.isArray(media)) throw new AnilistError("AniList returned an invalid search response.");
    return media.map(normalizeSearchResult);
  });
}

export function getAnime(id: number): Promise<Anime> {
  return cached(`media:${id}`, async () => {
    const response = await fetchJson<AnilistMediaResponse>(MEDIA_QUERY, { idMal: id });
    const media = response.Media;
    if (!media) throw new AnilistError("AniList returned no anime details.");
    return normalizeAnime(media);
  });
}

export function getAnimeRelations(id: number): Promise<RelatedAnime[]> {
  return cached(`relations:${id}`, async () => {
    const response = await fetchJson<AnilistRelationsResponse>(RELATIONS_QUERY, { idMal: id });
    const edges = response.Media?.relations?.edges;
    if (!Array.isArray(edges)) throw new AnilistError("AniList returned invalid relation data.");
    return edges.flatMap((edge) => {
      const node = edge.node;
      const malId = node?.idMal;
      const title = node ? titleOf(node) : null;
      const mediaType = node ? mediaTypeLabel(node) : null;
      const relationType = relationLabel(edge.relationType);
      if (!node || !Number.isInteger(malId) || !title || !mediaType || !relationType) return [];
      return [
        { malId: malId as number, title, mediaType, sourceMalId: id, relationType },
      ];
    });
  });
}

export function clearAnilistCache(): void {
  cache.clear();
}
