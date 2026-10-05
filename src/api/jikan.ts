import type { Anime, AnimeSearchResult, RelatedAnime } from "../models/anime";

const BASE_URL = "https://api.jikan.moe/v4";
const SEARCH_LIMIT = 5;
const MAX_RETRIES = 2;

export class JikanError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "JikanError";
  }
}

interface JikanImage {
  image_url?: string | null;
}

interface JikanAnimeRecord {
  mal_id?: number;
  title?: string;
  images?: { jpg?: JikanImage; webp?: JikanImage };
  type?: string | null;
  year?: number | null;
  episodes?: number | null;
  genres?: Array<{ name?: string }>;
  themes?: Array<{ name?: string }>;
  studios?: Array<{ name?: string }>;
  rating?: string | null;
}

interface JikanRelationResponse {
  data?: Array<{
    relation?: string;
    entry?: Array<{ mal_id?: number; name?: string; type?: string }>;
  }>;
}

const cache = new Map<string, Promise<unknown>>();

function imageUrl(record: JikanAnimeRecord): string | null {
  return record.images?.webp?.image_url ?? record.images?.jpg?.image_url ?? null;
}

function requiredId(record: JikanAnimeRecord): number {
  if (!Number.isInteger(record.mal_id) || record.mal_id === undefined) {
    throw new JikanError("The anime response did not include a valid identifier.");
  }
  return record.mal_id;
}

function requiredTitle(record: JikanAnimeRecord): string {
  if (!record.title?.trim()) {
    throw new JikanError("The anime response did not include a title.");
  }
  return record.title;
}

function names(items: Array<{ name?: string }> | undefined): string[] {
  return (items ?? []).flatMap((item) => (item.name?.trim() ? [item.name] : []));
}

export function normalizeSearchResult(record: JikanAnimeRecord): AnimeSearchResult {
  return {
    malId: requiredId(record),
    title: requiredTitle(record),
    imageUrl: imageUrl(record),
    type: record.type ?? null,
    year: record.year ?? null,
    episodes: record.episodes ?? null,
  };
}

export function normalizeAnime(record: JikanAnimeRecord): Anime {
  return {
    ...normalizeSearchResult(record),
    genres: names(record.genres),
    themes: names(record.themes),
    studios: names(record.studios),
    rating: record.rating ?? null,
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

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, { signal });
      if (response.ok) {
        return (await response.json()) as T;
      }
      if (response.status !== 429 && response.status < 500) {
        throw new JikanError("Jikan could not retrieve this anime.", response.status);
      }
      lastError = new JikanError("Jikan is temporarily unavailable.", response.status);
      const retryAfter = Number(response.headers.get("Retry-After"));
      if (attempt < MAX_RETRIES) {
        await delay(Number.isFinite(retryAfter) ? retryAfter * 1000 : 500 * 2 ** attempt, signal);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      if (error instanceof JikanError && error.status !== 429 && (error.status ?? 0) < 500) throw error;
      lastError = error;
      if (attempt < MAX_RETRIES) await delay(500 * 2 ** attempt, signal);
    }
  }
  if (lastError instanceof JikanError) throw lastError;
  throw new JikanError("We could not connect to Jikan. Please try again.");
}

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
  const params = new URLSearchParams({ q: cleanQuery, limit: String(SEARCH_LIMIT), sfw: "true" });
  const key = `search:${params.toString()}`;
  return cached(key, async () => {
    const response = await fetchJson<{ data?: JikanAnimeRecord[] }>(`${BASE_URL}/anime?${params}`, signal);
    if (!Array.isArray(response.data)) throw new JikanError("Jikan returned an invalid search response.");
    return response.data.map(normalizeSearchResult);
  });
}

export function getAnime(id: number): Promise<Anime> {
  return cached(`anime:${id}`, async () => {
    const response = await fetchJson<{ data?: JikanAnimeRecord }>(`${BASE_URL}/anime/${id}`);
    if (!response.data) throw new JikanError("Jikan returned no anime details.");
    return normalizeAnime(response.data);
  });
}

export function getAnimeRelations(id: number): Promise<RelatedAnime[]> {
  return cached(`relations:${id}`, async () => {
    const response = await fetchJson<JikanRelationResponse>(`${BASE_URL}/anime/${id}/relations`);
    if (!Array.isArray(response.data)) throw new JikanError("Jikan returned invalid relation data.");
    return response.data.flatMap((group) =>
      (group.entry ?? []).flatMap((entry) => {
        if (!Number.isInteger(entry.mal_id) || !entry.name || !entry.type || !group.relation) return [];
        return [{ malId: entry.mal_id as number, title: entry.name, mediaType: entry.type, sourceMalId: id, relationType: group.relation }];
      }),
    );
  });
}

export function clearJikanCache(): void {
  cache.clear();
}
