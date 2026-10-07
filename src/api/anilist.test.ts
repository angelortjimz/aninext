import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Anime } from "../models/anime";
import {
  AnilistError,
  clearAnilistCache,
  getAnimeBatch,
  getAnimeConnections,
  normalizeAnime,
  normalizeSearchResult,
  searchAnime,
} from "./anilist";

beforeEach(() => {
  clearAnilistCache();
});

afterEach(() => {
  clearAnilistCache();
  vi.useRealTimers();
  // restoreAllMocks does not undo stubGlobal; without this a stubbed `fetch`
  // silently leaks into every later test in this file.
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const media = {
  id: 1,
  title: { romaji: "Cowboy Bebop", english: "Cowboy Bebop", native: "カウボーイビバップ" },
  format: "TV",
  seasonYear: 1998,
  episodes: 26,
  genres: ["Sci-Fi"],
  tags: [
    { name: "Space", category: "Setting-Universe" },
    { name: "Philosophy", category: "Theme-Other" },
    { name: "Ensemble Cast", category: "Cast-Main Cast" },
  ],
  studios: { edges: [{ node: { name: "Sunrise" } }] },
  coverImage: { large: "cover.jpg" },
  isAdult: false,
  popularity: 1000,
};

/**
 * Builds a fetch-Response stand-in with a real `Headers` instance. An earlier
 * version used `new Map()`, whose `get` returns `undefined` where a real
 * `Headers.get` returns `null`; that difference hid a broken `Retry-After`
 * fallback from these tests.
 */
function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): unknown {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(init.headers ?? {}),
    json: async () => body,
  };
}

function dataResponse(data: unknown, status = 200): unknown {
  return jsonResponse({ data }, { status });
}

function errorResponse(status: number, headers: Record<string, string> = {}): unknown {
  return jsonResponse({ errors: [{ message: "Boom", status }] }, { status, headers });
}

function stubFetch(...responses: unknown[]): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn();
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
  // Deliberately a *retryable* server error rather than a 200 with `data: null`,
  // which the client treats as a terminal error and would stop the retry loop.
  fetchMock.mockResolvedValue(errorResponse(503));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** A fetch stub that honours `signal` the way the real one does. */
function signalAwareFetch(
  handler: (call: number, init: RequestInit) => unknown,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    if (init.signal?.aborted) throw abortError();
    return handler(fetchMock.mock.calls.length, init);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>, call = 0): {
  query: string;
  variables: Record<string, unknown>;
} {
  const init = fetchMock.mock.calls[call]?.[1] as RequestInit;
  return JSON.parse(init.body as string) as { query: string; variables: Record<string, unknown> };
}

function abortError(): DOMException {
  return new DOMException("The request was cancelled.", "AbortError");
}

/** `getAnime` was removed in favour of the batch endpoint; this keeps the
 * single-anime tests readable. */
async function loadAnime(id: number): Promise<Anime> {
  const [anime] = await getAnimeBatch([id]);
  if (!anime) throw new AnilistError(`AniList returned no details for ${id}.`);
  return anime;
}

describe("AniList normalization", () => {
  it("keeps the application model narrow", () => {
    expect(normalizeSearchResult(media)).toEqual({
      id: 1,
      title: "Cowboy Bebop",
      imageUrl: "cover.jpg",
      type: "TV",
      year: 1998,
      episodes: 26,
    });
    expect(normalizeAnime(media)).toMatchObject({
      id: 1,
      genres: ["Sci-Fi"],
      themes: ["Space", "Philosophy"],
      mainStudios: ["Sunrise"],
      popularity: 1000,
      isAdult: false,
    });
  });

  it("maps AniList format casing to display labels", () => {
    expect(normalizeSearchResult({ ...media, format: "MOVIE" }).type).toBe("Movie");
    expect(normalizeSearchResult({ ...media, format: "TV_SHORT" }).type).toBe("TV Short");
  });

  it("falls back through title languages", () => {
    expect(normalizeSearchResult({ ...media, title: { romaji: "R", native: "N" } }).title).toBe("R");
    expect(normalizeSearchResult({ ...media, title: { native: "N" } }).title).toBe("N");
  });

  it("drops blank and unnamed studio edges", () => {
    const candidate = normalizeAnime({
      ...media,
      studios: { edges: [{ node: { name: "Sunrise" } }, { node: { name: "   " } }, {}, null] },
    });
    expect(candidate.mainStudios).toEqual(["Sunrise"]);
  });

  it("throws a typed error when required fields are missing", () => {
    expect(() => normalizeSearchResult({ ...media, id: undefined })).toThrow(AnilistError);
    expect(() => normalizeSearchResult({ ...media, title: {} })).toThrow(AnilistError);
  });
});

describe("AniList requests", () => {
  it("caches identical searches and keeps them SFW", async () => {
    const fetchMock = stubFetch(dataResponse({ Page: { media: [media] } }));
    await Promise.all([searchAnime("Cowboy"), searchAnime("Cowboy")]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://graphql.anilist.co");
    expect(init.method).toBe("POST");
    const body = requestBody(fetchMock);
    expect(body.query).toContain("isAdult: false");
    expect(body.variables).toMatchObject({ search: "Cowboy", perPage: 5 });
  });

  it("skips the request for queries shorter than two characters", async () => {
    const fetchMock = stubFetch();
    expect(await searchAnime("a")).toEqual([]);
    expect(await searchAnime("   ")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps relation enums and keeps anime without a MAL id", async () => {
    stubFetch(
      dataResponse({
        Media: {
          relations: {
            edges: [
              { relationType: "SIDE_STORY", node: { id: 5, idMal: 5, title: { english: "The Movie" }, format: "MOVIE", type: "ANIME" } },
              { relationType: "ADAPTATION", node: { id: 30173, idMal: 173, title: { english: "The Manga" }, format: "MANGA", type: "MANGA" } },
              { relationType: "SPIN_OFF", node: { id: 9, idMal: null, title: { english: "No MAL id" }, format: "TV", type: "ANIME" } },
              { relationType: "OTHER", node: { id: 10, idMal: 10, title: { english: "Unknown type" }, format: "TV" } },
            ],
          },
          recommendations: { edges: [] },
        },
      }),
    );
    const connections = await getAnimeConnections(1);
    expect(connections.relations).toEqual([
      { id: 5, title: "The Movie", mediaType: "anime", sourceId: 1, relationType: "SIDE_STORY" },
      { id: 30173, title: "The Manga", mediaType: "manga", sourceId: 1, relationType: "ADAPTATION" },
      { id: 9, title: "No MAL id", mediaType: "anime", sourceId: 1, relationType: "SPIN_OFF" },
    ]);
    expect(connections.recommendations).toEqual([]);
  });

  it("collects community recommendations and keeps unrated ones", async () => {
    stubFetch(
      dataResponse({
        Media: {
          relations: { edges: [] },
          recommendations: {
            edges: [
              { node: { rating: 42, mediaRecommendation: { id: 20, idMal: 20, title: { english: "Top Pick" }, format: "TV", type: "ANIME" } } },
              { node: { rating: null, mediaRecommendation: { id: 21, idMal: 21, title: { english: "Unrated" }, format: "TV", type: "ANIME" } } },
              { node: { rating: 10, mediaRecommendation: null } },
              { node: { rating: 5, mediaRecommendation: { id: 22, idMal: 22, title: { english: "Manga Rec" }, format: "MANGA", type: "MANGA" } } },
            ],
          },
        },
      }),
    );
    const connections = await getAnimeConnections(1);
    expect(connections.recommendations).toEqual([
      { id: 20, title: "Top Pick", mediaType: "anime", sourceId: 1, rating: 42 },
      { id: 21, title: "Unrated", mediaType: "anime", sourceId: 1, rating: 0 },
      { id: 22, title: "Manga Rec", mediaType: "manga", sourceId: 1, rating: 5 },
    ]);
  });

  it("fetches multiple anime in one batched request", async () => {
    const fetchMock = stubFetch(
      dataResponse({ Page: { media: [media, { ...media, id: 2, idMal: 2 }] } }),
    );
    const anime = await getAnimeBatch([2, 1, 2]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = requestBody(fetchMock);
    expect(body.query).toContain("id_in");
    expect(body.variables).toMatchObject({ ids: [2, 1], perPage: 2 });
    expect(anime.map((item) => item.id)).toEqual([1, 2]);
  });

  it("splits batches larger than the AniList page limit into separate requests", async () => {
    const ids = Array.from({ length: 51 }, (_, index) => index + 1);
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { variables: { ids: number[] } };
      return jsonResponse({ data: { Page: { media: body.variables.ids.map((id) => ({ ...media, id })) } } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const anime = await getAnimeBatch(ids);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestBody(fetchMock, 0).variables.ids).toHaveLength(50);
    expect(requestBody(fetchMock, 1).variables.ids).toEqual([51]);
    expect(anime.map((item) => item.id)).toEqual(ids);
  });

  it("returns an empty batch without requesting", async () => {
    const fetchMock = stubFetch();
    expect(await getAnimeBatch([])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces GraphQL errors returned with a 200 response", async () => {
    stubFetch(jsonResponse({ data: null, errors: [{ message: "Not Found.", status: 404 }] }));
    await expect(loadAnime(999999999)).rejects.toThrow(AnilistError);
  });

  it("does not retry a client error", async () => {
    const fetchMock = stubFetch(errorResponse(404));
    await expect(loadAnime(1)).rejects.toThrow(AnilistError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries transient failures", async () => {
    const fetchMock = stubFetch(
      errorResponse(429, { "Retry-After": "0" }),
      dataResponse({ Page: { media: [{ ...media }] } }),
    );
    const anime = await loadAnime(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(anime.id).toBe(1);
  });

  it("gives up with a friendly error once retries are exhausted", async () => {
    const fetchMock = stubFetch(errorResponse(429, { "Retry-After": "0" }));
    await expect(loadAnime(1)).rejects.toThrow(AnilistError);
    // One initial attempt plus MAX_RETRIES (2) retries.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("never surfaces the raw API error text to callers", async () => {
    stubFetch(errorResponse(404));
    await expect(loadAnime(1)).rejects.toThrow(/AniList could not retrieve this anime/);
  });

  it("drops a failed request from the cache so the next call retries", async () => {
    vi.useFakeTimers();
    const failing = vi.fn(async () => errorResponse(503));
    vi.stubGlobal("fetch", failing);
    const failed = loadAnime(1).catch(() => undefined);
    await vi.advanceTimersByTimeAsync(1500);
    await failed;
    expect(failing).toHaveBeenCalledTimes(3);

    const succeeding = stubFetch(dataResponse({ Page: { media: [{ ...media }] } }));
    expect((await loadAnime(1)).id).toBe(1);
    expect(succeeding).toHaveBeenCalledTimes(1);
  });
});

describe("AniList retry backoff", () => {
  it("waits progressively longer when no Retry-After header is present", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => errorResponse(503));
    vi.stubGlobal("fetch", fetchMock);

    const outcome = loadAnime(1).then(
      (value) => ({ ok: true, value }),
      (error: unknown) => ({ ok: false, error }),
    );

    // Attempt 1 fires immediately.
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The first backoff is 500ms. Before it elapses there is no second attempt.
    await vi.advanceTimersByTimeAsync(499);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // The second backoff is 1000ms, so the third attempt is still pending here.
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // Retries are exhausted, so the call rejects.
    const settled = await outcome;
    expect(settled.ok).toBe(false);
    expect((settled as { error: unknown }).error).toBeInstanceOf(AnilistError);
  });

  it("does not treat a missing Retry-After header as a zero-second retry", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => errorResponse(503));
    vi.stubGlobal("fetch", fetchMock);

    const outcome = loadAnime(1).catch(() => undefined);

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A zero-length delay would have produced a second attempt by now.
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(500);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Drain the remaining retry so the promise settles and cannot dangle.
    await vi.advanceTimersByTimeAsync(1000);
    await outcome;
  });

  it("honours an explicit Retry-After header over the exponential backoff", async () => {
    vi.useFakeTimers();
    const fetchMock = stubFetch(
      errorResponse(429, { "Retry-After": "2" }),
      dataResponse({ Page: { media: [{ ...media }] } }),
    );

    const pending = loadAnime(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The header asks for 2s, longer than the 500ms default backoff.
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    expect((await pending).id).toBe(1);
  });

  it("ignores an unparseable Retry-After header and falls back to backoff", async () => {
    vi.useFakeTimers();
    const fetchMock = stubFetch(
      errorResponse(429, { "Retry-After": "soon" }),
      dataResponse({ Page: { media: [{ ...media }] } }),
    );

    const pending = loadAnime(1);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(499);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    expect((await pending).id).toBe(1);
  });
});

describe("AniList cancellation", () => {
  it("does not let one caller's abort fail a concurrent search for the same query", async () => {
    const resolvers: Array<(value: unknown) => void> = [];
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise((resolve, reject) => {
          resolvers.push(resolve);
          init.signal?.addEventListener("abort", () => reject(abortError()), { once: true });
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const first = new AbortController();
    const second = new AbortController();
    const firstSearch = searchAnime("Cowboy", first.signal);
    const secondSearch = searchAnime("Cowboy", second.signal);
    await vi.waitFor(() => expect(resolvers).toHaveLength(2));

    // The two calls must not share one in-flight request.
    expect(fetchMock).toHaveBeenCalledTimes(2);

    first.abort();
    await expect(firstSearch).rejects.toThrow(/cancelled/);

    resolvers[1]?.(dataResponse({ Page: { media: [media] } }));
    await expect(secondSearch).resolves.toHaveLength(1);
  });

  it("does not let an abortable search read a cached promise", async () => {
    const fetchMock = stubFetch(dataResponse({ Page: { media: [media] } }));
    await searchAnime("Cowboy");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const fetchMockAfter = stubFetch(dataResponse({ Page: { media: [media] } }));
    await searchAnime("Cowboy", new AbortController().signal);
    expect(fetchMockAfter).toHaveBeenCalledTimes(1);
  });

  it("still deduplicates signal-less requests", async () => {
    const fetchMock = stubFetch(dataResponse({ Page: { media: [media] } }));
    await Promise.all([searchAnime("Cowboy"), searchAnime("Cowboy"), searchAnime("Cowboy")]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects immediately when the signal is already aborted", async () => {
    const fetchMock = signalAwareFetch(() => dataResponse({ Page: { media: [media] } }));
    const controller = new AbortController();
    controller.abort();

    await expect(searchAnime("Cowboy", controller.signal)).rejects.toThrow(/cancelled/);
    // An abort is terminal: the request must not be retried.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops retrying once the caller aborts", async () => {
    vi.useFakeTimers();
    const fetchMock = signalAwareFetch(() => errorResponse(503));

    const controller = new AbortController();
    const pending = searchAnime("Cowboy", controller.signal).catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    controller.abort();
    const outcome = await pending;
    expect(outcome).toBeInstanceOf(DOMException);
    expect((outcome as DOMException).name).toBe("AbortError");

    // No further retries may be scheduled after an abort.
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
