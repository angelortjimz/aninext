import { searchAnime } from "../api/anilist";
import type { AnimeSearchResult } from "../models/anime";

export interface AnimeSearchField {
  element: HTMLElement;
  getSelection(): AnimeSearchResult | null;
  setDisabled(disabled: boolean): void;
}

function meta(result: AnimeSearchResult): string {
  return [result.year, result.type, result.episodes ? `${result.episodes} eps` : null].filter(Boolean).join(" - ");
}

function escapeHtml(value: string): string {
  const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
  return value.replace(/[&<>"]/g, (character) => entities[character] ?? character);
}

export function createAnimeSearchField(index: number, onSelectionChange: () => void): AnimeSearchField {
  const element = document.createElement("section");
  element.className = "search-field";
  element.innerHTML = `
    <label for="anime-search-${index}">Anime ${index}</label>
    <div class="search-control">
      <input id="anime-search-${index}" type="search" autocomplete="off" placeholder="Search an anime" aria-describedby="anime-status-${index}" />
      <button class="clear-button" type="button" aria-label="Clear Anime ${index}" hidden>Clear</button>
    </div>
    <p id="anime-status-${index}" class="field-status" aria-live="polite"></p>
    <div class="search-results" role="listbox" aria-label="Anime search results"></div>
  `;
  const input = element.querySelector<HTMLInputElement>("input")!;
  const clearButton = element.querySelector<HTMLButtonElement>(".clear-button")!;
  const status = element.querySelector<HTMLParagraphElement>(".field-status")!;
  const results = element.querySelector<HTMLElement>(".search-results")!;
  let selected: AnimeSearchResult | null = null;
  let timer: number | undefined;
  let controller: AbortController | undefined;

  const renderResults = (matches: AnimeSearchResult[]) => {
    results.replaceChildren();
    matches.forEach((match) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "search-result";
      option.setAttribute("role", "option");
      option.innerHTML = `${match.imageUrl ? `<img src="${encodeURI(match.imageUrl)}" alt="" />` : "<span class=\"image-placeholder\"></span>"}<span><strong>${escapeHtml(match.title)}</strong><small>${escapeHtml(meta(match) || "Anime")}</small></span>`;
      option.addEventListener("click", () => {
        selected = match;
        input.value = match.title;
        input.readOnly = true;
        clearButton.hidden = false;
        results.replaceChildren();
        status.textContent = "Selected";
        onSelectionChange();
      });
      results.append(option);
    });
  };

  input.addEventListener("input", () => {
    selected = null;
    clearButton.hidden = true;
    onSelectionChange();
    const query = input.value.trim();
    window.clearTimeout(timer);
    controller?.abort();
    results.replaceChildren();
    if (query.length < 2) {
      status.textContent = query ? "Enter at least 2 characters" : "";
      return;
    }
    status.textContent = "Searching...";
    timer = window.setTimeout(async () => {
      controller = new AbortController();
      try {
        const matches = await searchAnime(query, controller.signal);
        if (input.value.trim() !== query) return;
        renderResults(matches);
        status.textContent = matches.length ? "Choose a result" : "No anime found";
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        status.textContent = "Search is unavailable. Try again.";
      }
    }, 300);
  });

  clearButton.addEventListener("click", () => {
    controller?.abort();
    selected = null;
    input.value = "";
    input.readOnly = false;
    input.focus();
    clearButton.hidden = true;
    results.replaceChildren();
    status.textContent = "";
    onSelectionChange();
  });

  return {
    element,
    getSelection: () => selected,
    setDisabled: (disabled) => {
      input.disabled = disabled;
      clearButton.disabled = disabled;
    },
  };
}
