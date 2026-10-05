import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AnilistError,
  clearAnilistCache,
  getAnime,
  getAnimeBatch,
  getAnimeConnections,
  normalizeAnime,
  normalizeSearchResult,
  searchAnime,
} from "./anilist";

afterEach(() => {
  clearAnilistCache();
  vi.restoreAllMocks();
});

const media = {
  id: 1,
  idMal: 1,
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
  studios: { edges: [{ isMain: true, node: { name: "Sunrise" } }] },
  coverImage: { large: "cover.jpg" },
  isAdult: false,
  popularity: 1000,
};

describe("AniList normalization", () => {
  it("keeps the application model narrow", () => {
    expect(normalizeSearchResult(media)).toMatchObject({
      id: 1,
      malId: 1,
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
      studios: ["Sunrise"],
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

  it("keeps titles without a MAL id and ignores non-main studios", () => {
    expect(normalizeSearchResult({ ...media, idMal: null }).malId).toBeNull();
    const candidate = normalizeAnime({
      ...media,
      studios: {
        edges: [
          { isMain: true, node: { name: "Sunrise" } },
          { isMain: false, node: { name: "Other" } },
        ],
      },
    });
    expect(candidate.studios).toEqual(["Sunrise", "Other"]);
    expect(candidate.mainStudios).toEqual(["Sunrise"]);
  });
});

describe("AniList requests", () => {
  it("caches identical searches and keeps them SFW", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, headers: new Map(), json: async () => ({ data: { Page: { media: [media] } } }) });
    vi.stubGlobal("fetch", fetchMock);
    await Promise.all([searchAnime("Cowboy"), searchAnime("Cowboy")]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://graphql.anilist.co");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.query).toContain("isAdult: false");
    expect(body.variables).toMatchObject({ search: "Cowboy", perPage: 5 });
  });

  it("maps relation enums and keeps anime without a MAL id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map(),
      json: async () => ({
        data: {
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
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const connections = await getAnimeConnections(1);
    expect(connections.relations).toEqual([
      { id: 5, title: "The Movie", mediaType: "anime", sourceId: 1, relationType: "SIDE_STORY" },
      { id: 30173, title: "The Manga", mediaType: "manga", sourceId: 1, relationType: "ADAPTATION" },
      { id: 9, title: "No MAL id", mediaType: "anime", sourceId: 1, relationType: "SPIN_OFF" },
    ]);
    expect(connections.recommendations).toEqual([]);
  });

  it("collects community recommendations and keeps unrated ones", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map(),
      json: async () => ({
        data: {
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
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const connections = await getAnimeConnections(1);
    expect(connections.recommendations).toEqual([
      { id: 20, title: "Top Pick", mediaType: "anime", sourceId: 1, rating: 42 },
      { id: 21, title: "Unrated", mediaType: "anime", sourceId: 1, rating: 0 },
      { id: 22, title: "Manga Rec", mediaType: "manga", sourceId: 1, rating: 5 },
    ]);
  });

  it("fetches multiple anime in one batched request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, headers: new Map(), json: async () => ({ data: { Page: { media: [media, { ...media, id: 2, idMal: 2 }] } } }) });
    vi.stubGlobal("fetch", fetchMock);
    const anime = await getAnimeBatch([2, 1, 2]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.query).toContain("id_in");
    expect(body.variables).toMatchObject({ ids: [2, 1], perPage: 2 });
    expect(anime.map((item) => item.id)).toEqual([1, 2]);
  });

  it("returns an empty batch without requesting", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await getAnimeBatch([])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces GraphQL errors returned with a 200 response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, headers: new Map(), json: async () => ({ data: null, errors: [{ message: "Not Found.", status: 404 }] }) });
    vi.stubGlobal("fetch", fetchMock);
    await expect(getAnime(999999999)).rejects.toThrow(AnilistError);
  });

  it("retries transient failures", async () => {
    const limited = {
      ok: false,
      status: 429,
      headers: new Map([["Retry-After", "0"]]),
      json: async () => ({ errors: [{ message: "Rate limited", status: 429 }] }),
    };
    const ok = {
      ok: true,
      status: 200,
      headers: new Map(),
      json: async () => ({ data: { Media: { ...media } } }),
    };
    const fetchMock = vi.fn().mockResolvedValueOnce(limited).mockResolvedValueOnce(ok);
    vi.stubGlobal("fetch", fetchMock);
    const anime = await getAnime(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(anime.id).toBe(1);
  });
});
