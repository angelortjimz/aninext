import { afterEach, describe, expect, it, vi } from "vitest";
import { clearJikanCache, normalizeAnime, normalizeSearchResult, searchAnime } from "./jikan";

afterEach(() => {
  clearJikanCache();
  vi.restoreAllMocks();
});

const record = { mal_id: 1, title: "Cowboy Bebop", images: { jpg: { image_url: "cover.jpg" } }, type: "TV", year: 1998, episodes: 26, genres: [{ name: "Sci-Fi" }], themes: [{ name: "Space" }], studios: [{ name: "Sunrise" }], rating: "R - 17+" };

describe("Jikan normalization", () => {
  it("keeps the application model narrow", () => {
    expect(normalizeSearchResult(record)).toMatchObject({ malId: 1, title: "Cowboy Bebop", type: "TV" });
    expect(normalizeAnime(record)).toMatchObject({ genres: ["Sci-Fi"], themes: ["Space"], studios: ["Sunrise"] });
  });

  it("caches identical searches", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [record] }) });
    vi.stubGlobal("fetch", fetchMock);
    await Promise.all([searchAnime("Cowboy"), searchAnime("Cowboy")]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("sfw=true");
  });
});
