import { useState, type JSX } from "react";
import { getAnimeBatch } from "./api/anilist";
import type { AnimeSearchResult } from "./models/anime";
import type { UiState } from "./models/ui";
import { recommend } from "./recommendation/recommend";
import { SearchField } from "./ui/SearchField";
import { ResultRegion } from "./ui/ResultRegion";

const FIELD_COUNT = 3;

export function App(): JSX.Element {
  const [selections, setSelections] = useState<(AnimeSearchResult | null)[]>(
    () => Array<AnimeSearchResult | null>(FIELD_COUNT).fill(null),
  );
  const [ui, setUi] = useState<UiState>({ kind: "idle" });

  const selected = selections.filter((selection): selection is AnimeSearchResult => selection !== null);
  const hasDuplicate = new Set(selected.map((item) => item.id)).size !== selected.length;
  const loading = ui.kind === "loading";
  const canSubmit = selected.length === FIELD_COUNT && !hasDuplicate && !loading;

  function handleSelectionChange(index: number, selection: AnimeSearchResult | null): void {
    setSelections((previous) => {
      const next = [...previous];
      next[index] = selection;
      return next;
    });
  }

  async function handleSubmit(): Promise<void> {
    if (selected.length !== FIELD_COUNT) return;
    setUi({ kind: "loading" });
    try {
      const detailed = await getAnimeBatch(selected.map((item) => item.id));
      if (detailed.length !== selected.length) {
        setUi({ kind: "unavailable" });
        return;
      }
      const result = await recommend(detailed);
      setUi(
        result.kind === "recommendation"
          ? { kind: "recommendation", recommendation: result.recommendation }
          : { kind: "no-match" },
      );
    } catch {
      setUi({ kind: "error" });
    }
  }

  return (
    <div className="page-shell">
      <header className="masthead">
        <p className="eyebrow">Anime discovery engine</p>
        <h1>What should you watch next?</h1>
        <p>Pick three anime you enjoyed. We will find one adjacent discovery, not the next franchise installment.</p>
      </header>
      <section className="selector" aria-labelledby="selection-title">
        <div className="section-heading">
          <h2 id="selection-title">Your three</h2>
          <p>Select an exact match from each search.</p>
        </div>
        <div className="search-grid">
          {selections.map((_, index) => (
            <SearchField
              key={index}
              index={index + 1}
              disabled={loading}
              onSelectionChange={(selection) => handleSelectionChange(index, selection)}
            />
          ))}
        </div>
        <p className="selection-error" role="alert">
          {hasDuplicate ? "Please select three different anime." : ""}
        </p>
        <button className="recommend-button" type="button" disabled={!canSubmit} onClick={handleSubmit}>
          Find a recommendation
        </button>
      </section>
      <div className="result-region" aria-live="polite">
        <ResultRegion ui={ui} />
      </div>
    </div>
  );
}
