import { useEffect, useRef, useState, type FormEvent, type JSX } from "react";
import { getAnimeBatch } from "@/api/anilist";
import type { AnimeSearchResult } from "@/models/anime";
import type { UiState } from "@/models/ui";
import { recommend } from "@/recommendation/recommend";
import { SearchField } from "@/ui/SearchField";
import { ResultRegion } from "@/ui/ResultRegion";

const FIELD_COUNT = 3;

export function App(): JSX.Element {
  const [selections, setSelections] = useState<(AnimeSearchResult | null)[]>(() =>
    Array<AnimeSearchResult | null>(FIELD_COUNT).fill(null),
  );
  const [ui, setUi] = useState<UiState>({ kind: "idle" });
  const [scoredSelections, setScoredSelections] = useState<(AnimeSearchResult | null)[] | null>(
    null,
  );
  const [restorePoint, setRestorePoint] = useState<(AnimeSearchResult | null)[] | null>(null);
  const [restoreToken, setRestoreToken] = useState(0);

  const submitRef = useRef<HTMLButtonElement | null>(null);
  const firstFieldRef = useRef<HTMLDivElement | null>(null);

  const selected = selections.filter(
    (selection): selection is AnimeSearchResult => selection !== null,
  );
  const hasDuplicate = new Set(selected.map((item) => item.id)).size !== selected.length;
  const loading = ui.kind === "loading";
  const canSubmit = selected.length === FIELD_COUNT && !hasDuplicate && !loading;

  const hasResult = ui.kind === "recommendation";
  const isStale =
    hasResult && scoredSelections !== null && scoredKey(scoredSelections) !== scoredKey(selections);

  function scoredKey(items: (AnimeSearchResult | null)[]): string {
    return items.map((item) => (item ? String(item.id) : "-")).join(",");
  }

  function handleSelectionChange(index: number, selection: AnimeSearchResult | null): void {
    if (selections[index]?.id === selection?.id) return;
    if (hasResult) setRestorePoint(selections);
    setSelections((previous) => {
      const next = [...previous];
      next[index] = selection;
      return next;
    });
  }

  function handleUndo(): void {
    if (!restorePoint) return;
    setSelections(restorePoint);
    setRestoreToken((current) => current + 1);
  }

  function handleEditPicks(): void {
    const first = firstFieldRef.current?.querySelector<HTMLInputElement>("input");
    first?.focus();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (selected.length !== FIELD_COUNT) return;
    setUi({ kind: "loading" });
    setRestorePoint(null);
    try {
      const detailed = await getAnimeBatch(selected.map((item) => item.id));
      if (detailed.length !== selected.length) {
        setUi({ kind: "unavailable" });
        return;
      }
      const result = await recommend(detailed);
      if (result.kind === "recommendation") {
        setScoredSelections([...selections]);
        setUi({ kind: "recommendation", results: result.results, index: 0 });
      } else {
        setUi({ kind: "no-match" });
      }
    } catch {
      setUi({ kind: "error" });
    }
  }

  function handleReroll(): void {
    setUi((previous) =>
      previous.kind === "recommendation" ? { ...previous, index: previous.index + 1 } : previous,
    );
  }

  function handleBack(): void {
    setUi((previous) =>
      previous.kind === "recommendation"
        ? { ...previous, index: Math.max(previous.index - 1, 0) }
        : previous,
    );
  }

  useEffect(() => {
    if (canSubmit) submitRef.current?.focus();
  }, [canSubmit]);

  const pickedIds = selections
    .filter((selection): selection is AnimeSearchResult => selection !== null)
    .map((selection) => selection.id);

  return (
    <main className="page">
      <header className="masthead">
        <p className="eyebrow">Anime discovery engine</p>
        <h1 className="display-title">What should you watch next?</h1>
        <p className="lead">
          Pick three anime you enjoyed. We will find one adjacent discovery, not the next franchise
          installment.
        </p>
      </header>
      <form
        className="selector"
        aria-labelledby="selection-title"
        onSubmit={(event) => void handleSubmit(event)}
      >
        <div className="section-heading">
          <h2 className="section-title" id="selection-title">
            Your three
          </h2>
          <p className="section-note">
            {selected.length < FIELD_COUNT
              ? `Choose ${FIELD_COUNT - selected.length} more — pick an exact match from each search.`
              : "All three chosen. Press Enter to find your recommendation."}
          </p>
        </div>
        <div className="search-grid" ref={firstFieldRef}>
          {selections.map((_, index) => (
            <SearchField
              key={index}
              index={index + 1}
              disabled={loading}
              pickedIds={pickedIds}
              restoreToken={restoreToken}
              restoredSelection={restorePoint?.[index] ?? null}
              onSelectionChange={(next) => handleSelectionChange(index, next)}
            />
          ))}
        </div>
        {hasDuplicate ? (
          <p className="field-error" role="alert">
            Please select three different anime.
          </p>
        ) : null}
        <button className="submit-button" type="submit" ref={submitRef} disabled={!canSubmit}>
          Find a recommendation
        </button>
      </form>
      <ResultRegion
        ui={ui}
        isStale={isStale}
        onReroll={handleReroll}
        onBack={handleBack}
        onUndo={isStale && restorePoint ? handleUndo : undefined}
        onEditPicks={isStale ? handleEditPicks : undefined}
      />
      <footer className="credit">
        Anime data and cover art from{" "}
        <a href="https://anilist.co" target="_blank" rel="noopener noreferrer">
          AniList
        </a>
        . Recommendations are generated on your device and are not affiliated with AniList.
      </footer>
    </main>
  );
}
