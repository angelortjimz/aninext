# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Fixed

- Retry backoff was effectively disabled. A missing `Retry-After` header
  returned `null`, and `Number(null)` is `0`, which passed the
  `Number.isFinite` check — so every 429/5xx retry waited 0 ms instead of
  backing off exponentially
- Aborting one search no longer fails a concurrent search for the same
  query. The response cache stored a promise bound to the first caller's
  `AbortSignal`, so a second caller inherited it and died with its
  `AbortError`; abortable calls now bypass the cache
- Search suggestions use a valid ARIA combobox/listbox pattern. Options
  were `<button role="option">` inside a `role="listbox"` container;
  they are now `<li role="option">` with `aria-selected`, and the input
  exposes `aria-expanded`, `aria-controls`, `aria-autocomplete` and
  `aria-activedescendant`
- Search suggestions are keyboard navigable: arrow keys move the active
  option, `Enter` selects it, `Escape` dismisses the list
- An anime that AniList no longer lists now shows "One selection is no
  longer available" instead of the generic failure message. The previous
  code threw an error that was immediately caught and discarded

### Added

- React 19 (`react`, `react-dom`) with `@vitejs/plugin-react` — the UI is
  now component-based (`src/App.tsx`, `src/main.tsx`, `src/ui/`)

### Changed

- UI migrated from vanilla TypeScript DOM manipulation to React;
  `src/ui/search.ts` and `src/ui/results.ts` replaced by
  `src/ui/SearchField.tsx` and `src/ui/ResultRegion.tsx`, state is now
  managed with hooks, and `escapeHtml` was dropped (React escapes by
  default). Behavior, markup structure, and `style.css` are unchanged

### Removed

- `src/main.ts` — replaced by `src/main.tsx` as the Vite entry point
  (`index.html` updated accordingly)

### Added

- `AGENTS.md` — instructions and restrictions for AI coding agents
  (pnpm-only workflow, deterministic recommendations, zero runtime deps)
- Community recommendations from AniList (`Media.recommendations`, sorted
  by rating) as a candidate signal alongside franchise relations
- `SAME_UNIVERSE` relations are now eligible discovery candidates
- Batched media fetching (`Page.media(id_in)`) — selection and candidate
  details load in a single request instead of up to 24
- Metadata scoring: main-studio similarity, release-era proximity, and a
  popularity tie-breaker

### Changed

- `README.md` — use `pnpm` commands instead of `npm`
- Recommendation engine re-keyed from MyAnimeList ids to AniList ids;
  titles without a MAL id are now selectable and can be recommended
- Relation eligibility and weights now keyed by AniList relation enums
  instead of display labels

### Removed

- Per-candidate detail request fan-out (replaced by the batched fetch)
- `DETAIL_CONCURRENCY` (no longer needed with batched fetching)

## [0.1.0]

### Added

- Initial release: anime search UI with three selection slots
- AniList API client (search, details, relations)
- Deterministic recommendation engine (candidates, similarity, scoring, reasons)
- Vitest + jsdom test suite
