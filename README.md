# Next Frame

A small, deterministic anime recommendation app powered by the AniList API. Pick three distinct anime and receive one SFW, discovery-first recommendation based on eligible related titles, community recommendations, and metadata similarity.

## Run locally

Install dependencies, then start the Vite development server:

```bash
pnpm install
pnpm dev
```

## Checks

```bash
pnpm check
```

That runs everything in sequence. Individually:

| Command             | Purpose                           |
| ------------------- | --------------------------------- |
| `pnpm test`         | Run the test suite once           |
| `pnpm test:watch`   | Watch mode                        |
| `pnpm lint`         | ESLint (type-aware)               |
| `pnpm lint:fix`     | ESLint with autofix               |
| `pnpm format`       | Format with Prettier              |
| `pnpm format:check` | Verify formatting without writing |
| `pnpm typecheck`    | `tsc --noEmit`                    |
| `pnpm build`        | Type-check, then build to `dist/` |

## How it works

1. **Search** — `src/api/anilist.ts` queries AniList's GraphQL API, with debounced, cancellable search and an in-memory response cache.
2. **Connect** — for each of the three selections it fetches franchise relations and community recommendations.
3. **Score** — eligible related titles become candidates. Each is scored on relation strength plus metadata similarity (genre, theme, format, main studio, release era).
4. **Recommend** — the highest-scoring candidate wins, with a deterministic tie-break chain so identical inputs always produce the same answer.

Tunables — scoring weights, limits, reason caps — live in `src/recommendation/config.ts`.

## Notes

The app stores selections only in memory. It does not use accounts, a database, a backend, or an AI service. See [AGENTS.md](AGENTS.md) for the conventions this repository follows.
