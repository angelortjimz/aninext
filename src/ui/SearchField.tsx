import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type JSX,
  type KeyboardEvent,
} from "react";
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
        setActiveIndex(results.length > 0 ? 0 : -1);
        setStatus(results.length ? "Choose a result" : "No anime found");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus("Search is unavailable. Try again.");
      }
    }, 300);
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
      handleSelect(match);
    }
  }

  function handleSelect(match: AnimeSearchResult): void {
    window.clearTimeout(timerRef.current);
    controllerRef.current?.abort();
    setSelected(match);
    setQuery(match.title);
    queryRef.current = match.title;
    dismissMatches();
    setStatus("Selected");
    onSelectionChange(match);
  }

  function handleClear(): void {
    window.clearTimeout(timerRef.current);
    controllerRef.current?.abort();
    setSelected(null);
    setQuery("");
    queryRef.current = "";
    dismissMatches();
    setStatus("");
    onSelectionChange(null);
    inputRef.current?.focus();
  }

  const hasMatches = matches.length > 0;

  return (
    <section className="search-field">
      <label htmlFor={`anime-search-${index}`}>Anime {index}</label>
      <div className="search-control">
        <input
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
      {hasMatches ? (
        <ul id={listId} className="search-results" role="listbox" aria-label="Anime search results">
          {matches.map((match, position) => (
            <li
              key={match.id}
              id={optionId(position)}
              role="option"
              aria-selected={position === activeIndex}
              className={position === activeIndex ? "search-result is-active" : "search-result"}
            >
              <button type="button" tabIndex={-1} onClick={() => handleSelect(match)}>
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
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
