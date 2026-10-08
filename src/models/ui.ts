import type { Recommendation } from "./anime";

export type UiState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "recommendation"; results: Recommendation[]; index: number }
  | { kind: "no-match" }
  | { kind: "unavailable" }
  | { kind: "error" };
