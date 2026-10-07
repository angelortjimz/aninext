import { useEffect, useRef, useState, type ChangeEvent, type JSX } from "react";
import { searchAnime } from "../api/anilist";
import type { AnimeSearchResult } from "../models/anime";

interface SearchFieldProps {
  index: number;
  disabled: boolean;
  onSelectionChange: (selection: AnimeSearchResult | null) => void;
}

function meta(result: AnimeSearchResult): string {
  return [result.year, result.type, result.episodes ? `${result.episodes} eps` : null]
    .filter(Boolean)
    .join(" - ");
}

export function SearchField({ index, disabled, onSelectionChange }: SearchFieldProps): JSX.Element {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AnimeSearchResult | null>(null);
  const [matches, setMatches] = useState<AnimeSearchResult[]>([]);
  const [status, setStatus] = useState("");

  const inputRef = useRef<HTMLInputElement | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const controllerRef = useRef<AbortController | undefined>(undefined);
  const queryRef = useRef("");

  useEffect(() => {
    return () => {
      window.clearTimeout(timerRef.current);
      controllerRef.current?.abort();
    };
  }, []);

  function handleInput(event: ChangeEvent<HTMLInputElement>): void {
    const value = event.target.value;
    setQuery(value);
    queryRef.current = value;
    setSelected(null);
    onSelectionChange(null);
    window.clearTimeout(timerRef.current);
    controllerRef.current?.abort();
    setMatches([]);
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      setStatus(trimmed ? "Enter at least 2 characters" : "");
      return;
    }
    setStatus("Searching...");
    timerRef.current = window.setTimeout(async () => {
      controllerRef.current = new AbortController();
      try {
        const results = await searchAnime(trimmed, controllerRef.current.signal);
        if (queryRef.current.trim() !== trimmed) return;
        setMatches(results);
        setStatus(results.length ? "Choose a result" : "No anime found");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus("Search is unavailable. Try again.");
      }
    }, 300);
  }

  function handleSelect(match: AnimeSearchResult): void {
    window.clearTimeout(timerRef.current);
    controllerRef.current?.abort();
    setSelected(match);
    setQuery(match.title);
    queryRef.current = match.title;
    setMatches([]);
    setStatus("Selected");
    onSelectionChange(match);
  }

  function handleClear(): void {
    window.clearTimeout(timerRef.current);
    controllerRef.current?.abort();
    setSelected(null);
    setQuery("");
    queryRef.current = "";
    setMatches([]);
    setStatus("");
    onSelectionChange(null);
    inputRef.current?.focus();
  }

  return (
    <section className="search-field">
      <label htmlFor={`anime-search-${index}`}>Anime {index}</label>
      <div className="search-control">
        <input
          id={`anime-search-${index}`}
          ref={inputRef}
          type="search"
          autoComplete="off"
          placeholder="Search an anime"
          aria-describedby={`anime-status-${index}`}
          value={query}
          readOnly={selected !== null}
          disabled={disabled}
          onChange={handleInput}
        />
        <button
          className="clear-button"
          type="button"
          aria-label={`Clear Anime ${index}`}
          hidden={selected === null}
          disabled={disabled}
          onClick={handleClear}
        >
          Clear
        </button>
      </div>
      <p id={`anime-status-${index}`} className="field-status" aria-live="polite">
        {status}
      </p>
      <div className="search-results" role="listbox" aria-label="Anime search results">
        {matches.map((match) => (
          <button
            key={match.id}
            type="button"
            className="search-result"
            role="option"
            onClick={() => handleSelect(match)}
          >
            {match.imageUrl ? (
              <img src={encodeURI(match.imageUrl)} alt="" />
            ) : (
              <span className="image-placeholder"></span>
            )}
            <span>
              <strong>{match.title}</strong>
              <small>{meta(match) || "Anime"}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
