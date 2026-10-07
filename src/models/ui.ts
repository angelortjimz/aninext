import type { Recommendation } from "./anime";

export type UiState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "recommendation"; recommendation: Recommendation }
  | { kind: "no-match" }
  | { kind: "unavailable" }
  | { kind: "error" };
