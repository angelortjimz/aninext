# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Component tests for `App`, `SearchField` and `ResultRegion`, covering
  the selection state machine, every `UiState` branch, search debouncing
  and abort isolation, stale-response rejection, combobox keyboard
  navigation with wrap-around, and combobox ARIA wiring
- `@testing-library/react` and `jsdom` as devDependencies; component
  tests opt into a `jsdom` environment per file so the pure-logic suite
  keeps running in `node`
- A design-token layer for colour, type scale, spacing and layout
  constants, consumed through `var()` so no raw hex or magic number
  remains in the component rules
- A minimum text size of `0.875rem`, replacing the previous
  `0.78`–`0.9rem` status, label and metadata sizes
- A `prefers-reduced-motion` guard that stops the loading spinner
- An explicit disabled treatment for the submit button, replacing
  `opacity: 0.45`, so the control stays readable while disabled
- `::-webkit-search-cancel-button` suppression, so the browser's own
  clear affordance no longer duplicates the field's Clear button

### Changed

- Focus outlines now meet WCAG 1.4.11 (3:1 non-text contrast) against
  the page surface, with an inner surface-coloured ring so they stay
  visible on both light and dark fills
- Muted text, the search input border and the suggestion meta text were
  darkened to meet WCAG 1.4.5 (4.5:1 text contrast)
- Element-level selectors (`h1, h2, h3, p`, `label`, `input`, `ul`)
  replaced with component classes, and the stylesheet is split into
  `reset`, `tokens`, `base` and `components` cascade layers
- `Inter` was dropped from the font stack in favour of a system font
  stack; it was never loaded, so every visitor already received
  `system-ui`
- `.cover-placeholder`, which had no matching rule, is now
  `.cover--placeholder`, and the search-result placeholder shares a
  single `.suggestion-thumb` class
- `.page-shell` is now the `<main>` landmark, and the search field is
  a `<div>` rather than an unattributed `<section>`
- Body text now inherits a `1.5` line height, and long body copy is
  constrained to a `68ch` measure

- ESLint 9 (flat config, type-aware via `typescript-eslint`) and Prettier
  as devDependencies, with `lint`, `lint:fix`, `format`, `format:check`,
  `typecheck` and `check` scripts. `check` runs lint, format, tests and
  build in one command
- Search suggestions are keyboard navigable: arrow keys move the active
  option, `Enter` selects it, `Escape` dismisses the list
- Test coverage for the recommendation engine: `recommend()` validation,
  the no-match path, adult and missing candidates being dropped, never
  recommending a selection, determinism across repeated calls and
  reordered inputs, and propagation of lookup failures
- Test coverage for retry backoff timing, retry exhaustion, cache
  eviction on failure, batch splitting above the AniList page limit, and
  abort isolation between concurrent searches
- Ranking assertions now cover each tie-breaker in turn (score, source
  count, popularity, id) plus input-order independence and non-mutation
- `AGENTS.md` — instructions and restrictions for AI coding agents
  (pnpm-only workflow, deterministic recommendations, zero runtime deps)
- Community recommendations from AniList (`Media.recommendations`, sorted
  by rating) as a candidate signal alongside franchise relations
- `SAME_UNIVERSE` relations are now eligible discovery candidates
- Batched media fetching (`Page.media(id_in)`) — selection and candidate
  details load in a single request instead of up to 24
- Metadata scoring: main-studio similarity, release-era proximity, and a
  popularity tie-breaker
- React 19 (`react`, `react-dom`) with `@vitejs/plugin-react` — the UI is
  now component-based (`src/App.tsx`, `src/main.tsx`, `src/ui/`)

### Changed

- Retry decisions in the API client go through a single `isRetryable(status)`
  helper instead of repeating the condition in the request and catch paths
- Tunable numbers moved into config modules: reason caps
  (`MAX_REASON_GENRES`, `MAX_REASON_THEMES`), the shared-selection
  threshold (`MIN_SHARED_SELECTIONS`), `REQUIRED_SELECTIONS`, and the
  search debounce (`SEARCH_DEBOUNCE_MS`). Reason text now derives its
  counts from the selection list instead of hardcoding "3" and "2"
- `tsconfig.json` gained `paths` for the `@` alias plus
  `noUncheckedIndexedAccess`, `noImplicitOverride` and
  `verbatimModuleSyntax`. All cross-directory imports under `src/` use `@/`
- Config objects use `as const satisfies`, so a misspelled weight key read
  is a compile error rather than a silent `undefined`. Lookups go through
  the new `relationWeight()` helper, which also rejects inherited keys
- `package.json` declares `packageManager` and `engines.node`, so the
  pnpm-only rule is enforced by the tooling
- Studio lookups ask AniList for main studios directly
  (`studios(isMain: true)`) rather than fetching every studio and
  filtering on `isMain` client-side
- Recommendation hydration builds scored `Candidate`s directly instead of
  returning `{ seed, anime }` tuples for a second mapping pass, and
  `recommend()` no longer mutates the winning candidate to attach reasons
- The "Find a recommendation" button and the debounced search timer call
  their async handlers through a `void` wrapper rather than passing a
  promise-returning function where a void return is expected
- The three search fields render from the `selections` array rather than a
  second `Array.from` over the same count
- Test infrastructure hardened: fetch mocks use real `Headers` objects
  rather than `Map`, retry and abort tests drive fake timers instead of
  sleeping, `vi.stubGlobal` is undone with `vi.unstubAllGlobals()`, and
  the response cache is cleared in `beforeEach`. The previous `Map` mock
  returned `undefined` where a real `Headers` returns `null`, which is
  what allowed the broken retry backoff to pass CI
- Recommendation tests split to mirror `src/`: `similarity.test.ts`,
  `candidates.test.ts`, `scoring.test.ts`, `reasons.test.ts` and
  `recommend.test.ts`, sharing `fixtures.ts`. The previous
  `recommendation.test.ts` covered four modules in one file
- `UiState` moved from `src/ui/ResultRegion.tsx` to `src/models/ui.ts`
- `style.css` moved to `src/styles.css`
- Tests run in the default node environment; `jsdom` is no longer
  configured globally now that the API layer no longer uses `window`
- Recommendation engine re-keyed from MyAnimeList ids to AniList ids;
  titles without a MAL id are now selectable and can be recommended
- Relation eligibility and weights now keyed by AniList relation enums
  instead of display labels
- UI migrated from vanilla TypeScript DOM manipulation to React;
  `src/ui/search.ts` and `src/ui/results.ts` replaced by
  `src/ui/SearchField.tsx` and `src/ui/ResultRegion.tsx`, state is now
  managed with hooks, and `escapeHtml` was dropped (React escapes by
  default). Behavior and markup structure are unchanged
- `README.md` and `AGENTS.md` — use `pnpm` commands instead of `npm`

### Removed

- `getAnime()` and its dedicated `MEDIA_QUERY`. The app only ever fetched
  single anime through `getAnimeBatch`; nothing in `src/` called it
  outside tests
- Unused fields on the domain model that were populated but never read:
  `Anime.malId`, `Anime.studios`, and the six per-dimension score fields
  on `Candidate` (`genreScore`, `themeScore`, `typeScore`, `studioScore`,
  `eraScore`, `metadataScore`)
- `CandidateSeed.title`, which was carried through scoring but never
  displayed; `anime.title` is used instead
- Six `as` casts in the AniList client, replaced by an `isId()` type guard
  and explicit `typeof` checks
- Five `FORMAT_LABELS` entries that were identical to the existing
  underscore-to-space fallback (`TV`, `SPECIAL`, `OVA`, `ONA`, `MUSIC`)
- `jsdom` devDependency. Tests run in the node environment and the only
  `window` usage is in the untested UI layer
- `src/main.ts` — replaced by `src/main.tsx` as the Vite entry point
  (`index.html` updated accordingly)
- Per-candidate detail request fan-out (replaced by the batched fetch)
- `DETAIL_CONCURRENCY` (no longer needed with batched fetching)

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
  were `<button role="option">` inside a `role="listbox"` container; they
  are now `<li role="option">` with `aria-selected`, and the input
  exposes `aria-expanded`, `aria-controls`, `aria-autocomplete` and
  `aria-activedescendant`
- An anime that AniList no longer lists now shows "One selection is no
  longer available" instead of the generic failure message. The previous
  code threw an error that was immediately caught and discarded

## [0.1.0]

### Added

- Initial release: anime search UI with three selection slots
- AniList API client (search, details, relations)
- Deterministic recommendation engine (candidates, similarity, scoring, reasons)
- Vitest + jsdom test suite
