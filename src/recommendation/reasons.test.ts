import { describe, expect, it } from "vitest";
import { buildCandidateSeeds } from "./candidates";
import { COMMUNITY_RELATION_TYPE, MAX_REASONS, MIN_SHARED_SELECTIONS } from "./config";
import { anime, communityRecommendation, relation, reversed, selectedThree } from "./fixtures";
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
  it("names the user's own titles instead of counting selections", () => {
    const reasons = generateReasons(
      candidateFrom(
        [[relation(1, 10, "SIDE_STORY")], [relation(2, 10, "SPIN_OFF")], []],
        [[], [], [communityRecommendation(3, 10)]],
      ),
      selected,
    );
    expect(reasons[0]).toBe("Fans of Anime 1, Anime 2 and Anime 3 also went on to watch this.");
    expect(reasons.join(" ")).not.toMatch(/at least|of your|Strong overall/);
  });

  it("credits community recommendations in plain language", () => {
    const candidate = candidateFrom([[], [], []], [[communityRecommendation(1, 10)], [], []]);
    expect(candidate.relations.some((item) => item.relationType === COMMUNITY_RELATION_TYPE)).toBe(
      true,
    );
    expect(generateReasons(candidate, selected)[0]).toBe(
      "Fans of Anime 1 also went on to watch this.",
    );
  });

  it("describes a plain relation without claiming fan consensus", () => {
    const reasons = generateReasons(
      candidateFrom([[relation(1, 10, "SIDE_STORY")], [], []], [[], [], []], {
        genres: [],
        themes: [],
      }),
      selected,
    );
    expect(reasons[0]).toBe(
      "Sits alongside Anime 1, a neighbouring story rather than the next episode.",
    );
    expect(reasons.some((reason) => reason.includes("fans"))).toBe(false);
  });

  it("names the selections that share a genre or theme", () => {
    const unlinked = scoreCandidate(
      { id: 10, relations: [], sourceCount: 0, relationScore: 0 },
      anime(10, { genres: ["Drama"], themes: ["Psychological"] }),
      selected,
    );
    expect(generateReasons(unlinked, selected)).toEqual([
      "The Drama streak runs through Anime 1, Anime 2 and Anime 3.",
      "It also carries the Psychological of Anime 1, Anime 2 and Anime 3.",
    ]);
  });

  it("lets the connection outrank the metadata when both are available", () => {
    const reasons = generateReasons(
      candidateFrom([[relation(1, 10, "OTHER")], [], []], [[], [], []], {
        genres: ["Drama"],
        themes: ["Psychological"],
      }),
      selected,
    );
    expect(reasons[0]).toContain("Anime 1");
    expect(reasons[0]).not.toContain("Drama");
    expect(reasons.some((reason) => reason.includes("Psychological"))).toBe(false);
  });

  it(`only cites labels shared by at least ${MIN_SHARED_SELECTIONS} selections`, () => {
    const reasons = generateReasons(
      candidateFrom([[relation(1, 10, "OTHER")], [], []], [[], [], []], {
        genres: ["Drama", "Action", "Sci-Fi"],
      }),
      selected,
    );
    expect(reasons.some((reason) => reason.includes("Action"))).toBe(false);
    expect(reasons.some((reason) => reason.includes("Sci-Fi"))).toBe(false);
  });

  it("leads with the strongest signal and caps the list", () => {
    const reasons = generateReasons(
      candidateFrom(
        [[relation(1, 10, "SIDE_STORY")], [], []],
        [[], [], [communityRecommendation(2, 10)]],
        { genres: ["Drama", "Mystery", "Action"], themes: ["Psychological"] },
      ),
      selected,
    );
    expect(reasons).toHaveLength(MAX_REASONS);
    expect(reasons[0]).toContain("Fans of Anime 1 and Anime 2");
  });

  it("falls back to a metadata sentence when nothing else applies", () => {
    const unconnected = scoreCandidate(
      { id: 10, relations: [], sourceCount: 0, relationScore: 0 },
      anime(10, { genres: [], themes: [], mainStudios: [], type: null, year: null }),
      selected,
    );
    expect(generateReasons(unconnected, selected)).toEqual([
      "Closest match on genre, era and studio we could find.",
    ]);
  });

  it("is deterministic regardless of selection order", () => {
    const candidate = candidateFrom(
      [[relation(1, 10, "SIDE_STORY")], [relation(2, 10, "OTHER")], []],
      [[communityRecommendation(3, 10)], [], []],
      { genres: ["Drama"], themes: ["Psychological"] },
    );
    const forward = generateReasons(candidate, selected);
    const backward = generateReasons(candidate, reversed(selected));
    expect(forward).toEqual(backward);
  });
});
