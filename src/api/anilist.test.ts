import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AnilistError,
  clearAnilistCache,
  getAnime,
  getAnimeRelations,
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
  studios: { nodes: [{ name: "Sunrise" }] },
  coverImage: { large: "cover.jpg" },
  isAdult: false,
};

describe("AniList normalization", () => {
  it("keeps the application model narrow", () => {
    expect(normalizeSearchResult(media)).toMatchObject({
      malId: 1,
      title: "Cowboy Bebop",
      imageUrl: "cover.jpg",
      type: "TV",
      year: 1998,
      episodes: 26,
    });
    expect(normalizeAnime(media)).toMatchObject({
      genres: ["Sci-Fi"],
      themes: ["Space", "Philosophy"],
      studios: ["Sunrise"],
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

  it("maps relation enums and drops entries without a MAL id", async () => {
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
          },
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const relations = await getAnimeRelations(1);
    expect(relations).toEqual([
      { malId: 5, title: "The Movie", mediaType: "anime", sourceMalId: 1, relationType: "Side Story" },
      { malId: 173, title: "The Manga", mediaType: "manga", sourceMalId: 1, relationType: "Adaptation" },
    ]);
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
    expect(anime.malId).toBe(1);
  });
});
