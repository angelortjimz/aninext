import { describe, expect, it } from "vitest";
import { buildCandidateSeeds } from "./candidates";
import { COMMUNITY_RELATION_TYPE, MAX_REASON_GENRES, MAX_REASON_THEMES } from "./config";
import { anime, communityRecommendation, relation, selectedThree } from "./fixtures";
import { generateReasons } from "./reasons";
import { scoreCandidate } from "./scoring";

const selected = selectedThree();

function candidateFrom(
  relations: ReturnType<typeof relation>[][],
  recommendations: ReturnType<typeof communityRecommendation>[][] = [[], [], []],
  overrides = {},
) {
  const seed = buildCandidateSeeds(selected, relations, recommendations)[0];
  if (!seed) throw new Error("expected a candidate seed");
  return scoreCandidate(seed, anime(10, overrides), selected);
}

describe("generateReasons", () => {
  it("produces factual reasons including community recommendations", () => {
    const reasons = generateReasons(
      candidateFrom(
        [[relation(1, 10, "SIDE_STORY")], [relation(2, 10, "SPIN_OFF")], []],
        [[], [], [communityRecommendation(3, 10)]],
      ),
      selected,
    );
    expect(reasons).toContain("Connected to 3 of your 3 selections");
    expect(reasons).toContain("Frequently recommended by fans of your selections");
    expect(reasons).toContain("Shares Drama with at least 2 selections");
  });

  it("counts the actual number of selections", () => {
    const two = [anime(1), anime(2)];
    const seed = buildCandidateSeeds(two, [[relation(1, 10, "SIDE_STORY")], []], [[], []])[0];
    if (!seed) throw new Error("expected a candidate seed");
    const reasons = generateReasons(scoreCandidate(seed, anime(10), two), two);
    expect(reasons[0]).toBe("Connected to 1 of your 2 selections");
  });

  it("only cites labels shared by at least two selections", () => {
    const reasons = generateReasons(
      candidateFrom([[relation(1, 10, "OTHER")], [], []], [[], [], []], {
        genres: ["Drama", "Action", "Sci-Fi"],
      }),
      selected,
    );
    expect(reasons).toContain("Shares Drama with at least 2 selections");
    expect(reasons.some((reason) => reason.includes("Action"))).toBe(false);
    expect(reasons.some((reason) => reason.includes("Sci-Fi"))).toBe(false);
  });

  it("caps the number of genre and theme reasons", () => {
    const reasons = generateReasons(
      candidateFrom([[relation(1, 10, "OTHER")], [], []], [[], [], []], {
        genres: ["Drama", "Mystery", "Action"],
        themes: ["Psychological", "Time Travel", "School Life"],
      }),
      [anime(1, { genres: ["Drama", "Mystery", "Action"], themes: ["Psychological", "Time Travel", "School Life"] }), anime(2, { genres: ["Drama", "Mystery", "Action"], themes: ["Psychological", "Time Travel", "School Life"] }), anime(3)],
    );
    const genreReasons = reasons.filter((reason) => reason.startsWith("Shares ") && !reason.includes("theme"));
    const themeReasons = reasons.filter((reason) => reason.includes("theme"));
    expect(genreReasons).toHaveLength(MAX_REASON_GENRES);
    expect(themeReasons).toHaveLength(MAX_REASON_THEMES);
  });

  it("falls back to a metadata match when nothing else applies", () => {
    const unconnected = scoreCandidate(
      {
        id: 10,
        relations: [],
        sourceCount: 0,
        relationScore: 0,
      },
      anime(10, { genres: [], themes: [], mainStudios: [], type: null, year: null }),
      selected,
    );
    expect(generateReasons(unconnected, selected)).toEqual(["Strong overall metadata match"]);
  });

  it("does not claim a community link without one", () => {
    const reasons = generateReasons(
      candidateFrom([[relation(1, 10, "SIDE_STORY")], [], []], [[], [], []], { genres: [], themes: [] }),
      selected,
    );
    expect(reasons.some((reason) => reason.includes("fans"))).toBe(false);
  });

  it("claims a community link when one is present", () => {
    const candidate = candidateFrom(
      [[], [], []],
      [[communityRecommendation(1, 10)], [], []],
    );
    expect(candidate.relations.some((item) => item.relationType === COMMUNITY_RELATION_TYPE)).toBe(true);
    expect(generateReasons(candidate, selected)).toContain(
      "Frequently recommended by fans of your selections",
    );
  });
});
