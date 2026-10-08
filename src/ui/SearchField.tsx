import { useEffect, useRef, useState, type ChangeEvent, type JSX, type KeyboardEvent } from "react";
import { SEARCH_MIN_LENGTH, searchAnime } from "@/api/anilist";
import type { AnimeSearchResult } from "@/models/anime";
import { SEARCH_DEBOUNCE_MS } from "./config";
import { metaLine } from "./format";

interface SearchFieldProps {
  index: number;
  disabled: boolean;
  pickedIds: number[];
  restoreToken: number;
  restoredSelection: AnimeSearchResult | null;
  onSelectionChange: (selection: AnimeSearchResult | null) => void;
}

export function SearchField({
  index,
  disabled,
  pickedIds,
  restoreToken,
  restoredSelection,
  onSelectionChange,
}: SearchFieldProps): JSX.Element {
  const [query, setQuery] = useState(restoredSelection?.title ?? "");
  const [selected, setSelected] = useState<AnimeSearchResult | null>(restoredSelection);
  const [matches, setMatches] = useState<AnimeSearchResult[]>([]);
  const [status, setStatus] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const controllerRef = useRef<AbortController | undefined>(undefined);
  const queryRef = useRef("");

  const listId = `anime-results-${index}`;
  const optionId = (position: number) => `${listId}-option-${position}`;

  useEffect(() => {
    return () => {
      window.clearTimeout(timerRef.current);
      controllerRef.current?.abort();
    };
  }, []);

  function applySelection(match: AnimeSearchResult | null): void {
    window.clearTimeout(timerRef.current);
    controllerRef.current?.abort();
    setSelected(match);
    setQuery(match?.title ?? "");
    queryRef.current = match?.title ?? "";
    setMatches([]);
    setActiveIndex(-1);
    setStatus(match ? "Selected" : "");
  }

  const appliedRestore = useRef(restoreToken);
  useEffect(() => {
    if (appliedRestore.current === restoreToken) return;
    appliedRestore.current = restoreToken;
    window.clearTimeout(timerRef.current);
    controllerRef.current?.abort();
    setSelected(restoredSelection);
    setQuery(restoredSelection?.title ?? "");
    queryRef.current = restoredSelection?.title ?? "";
    setMatches([]);
    setActiveIndex(-1);
    setStatus(restoredSelection ? "Selected" : "");
  }, [restoreToken, restoredSelection]);

  function dismissMatches(): void {
    setMatches([]);
    setActiveIndex(-1);
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>): void {
    const value = event.target.value;
    setQuery(value);
    queryRef.current = value;
    setSelected(null);
    onSelectionChange(null);
    window.clearTimeout(timerRef.current);
    controllerRef.current?.abort();
    dismissMatches();
    const trimmed = value.trim();
    if (trimmed.length < SEARCH_MIN_LENGTH) {
      setStatus(trimmed ? `Enter at least ${SEARCH_MIN_LENGTH} characters` : "");
      return;
    }
    setStatus("Searching...");
    timerRef.current = window.setTimeout(() => {
      void runSearch(trimmed);
    }, SEARCH_DEBOUNCE_MS);
  }

  async function runSearch(trimmed: string): Promise<void> {
    controllerRef.current = new AbortController();
    try {
      const results = await searchAnime(trimmed, controllerRef.current.signal);
      if (queryRef.current.trim() !== trimmed) return;
      setMatches(results);
      setActiveIndex(results.length > 0 ? 0 : -1);
      setStatus(results.length ? "Choose a result" : "No anime found");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus("Search is unavailable. Try again.");
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Escape") {
      if (matches.length > 0) {
        event.preventDefault();
        dismissMatches();
        setStatus("");
      }
      return;
    }
    if (matches.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % matches.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current <= 0 ? matches.length - 1 : current - 1));
      return;
    }
    if (event.key === "Enter") {
      const match = activeIndex >= 0 ? matches[activeIndex] : undefined;
      if (!match) return;
      event.preventDefault();
      applySelection(match);
      onSelectionChange(match);
    }
  }

  function handleClear(): void {
    applySelection(null);
    onSelectionChange(null);
    inputRef.current?.focus();
  }

  const hasMatches = matches.length > 0;

  return (
    <div className="field">
      <label className="field-label" htmlFor={`anime-search-${index}`}>
        Anime {index}
      </label>
      <div className="field-control">
        <input
          className="field-input"
          id={`anime-search-${index}`}
          ref={inputRef}
          type="search"
          role="combobox"
          autoComplete="off"
          placeholder="Search an anime"
          aria-describedby={`anime-status-${index}`}
          aria-expanded={hasMatches}
          aria-controls={hasMatches ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
          value={query}
          readOnly={selected !== null}
          disabled={disabled}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
        />
        <button
          className="field-clear"
          type="button"
          aria-label={`Clear Anime ${index}`}
          hidden={selected === null}
          disabled={disabled}
          onClick={handleClear}
        >
          Clear
        </button>
      </div>
      <p className="field-detail">{selected ? metaLine(selected) || "Anime" : ""}</p>
      <p id={`anime-status-${index}`} className="field-status" aria-live="polite">
        {status}
      </p>
      {hasMatches ? (
        <ul id={listId} className="suggestions" role="listbox" aria-label="Anime search results">
          {matches.map((match, position) => {
            const taken = selected?.id === match.id || pickedIds.includes(match.id);
            return (
              <li
                key={match.id}
                id={optionId(position)}
                role="option"
                aria-selected={position === activeIndex}
                className={position === activeIndex ? "suggestion is-active" : "suggestion"}
              >
                <button
                  className="suggestion-button"
                  type="button"
                  tabIndex={-1}
                  disabled={taken}
                  onClick={() => {
                    applySelection(match);
                    onSelectionChange(match);
                  }}
                >
                  {match.imageUrl ? (
                    <img className="suggestion-thumb" src={encodeURI(match.imageUrl)} alt="" />
                  ) : (
                    <span className="suggestion-thumb"></span>
                  )}
                  <span>
                    <strong className="suggestion-title">{match.title}</strong>
                    <small className="suggestion-meta">
                      {taken ? "Already chosen" : metaLine(match) || "Anime"}
                    </small>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
