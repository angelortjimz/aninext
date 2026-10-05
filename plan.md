# Anime Recommendation Micro-MVP — Implementation Plan

## 1. Project Goal

Build a small TypeScript web application that recommends **one anime** based on **three anime selected by the user**.

The core recommendation flow is:

3 selected anime
→ fetch anime metadata from Jikan
→ fetch related anime for each input
→ build a candidate pool
→ remove the three inputs
→ score candidates based on relatedness and metadata similarity
→ return the highest-scoring anime
→ explain why it was recommended

The application should be deterministic and understandable.

Do NOT use AI, machine learning, a database, authentication, or a backend in the initial version.

---

# 2. Technology Stack

Use:

- TypeScript
- Vite
- Vanilla HTML
- Vanilla CSS
- Jikan API
- Fetch API

Do NOT use:

- React
- Next.js
- Node backend
- Laravel
- Hono
- Database
- Authentication
- AI/LLM APIs

The goal is to keep the project as small as possible.

---

# 3. Project Structure

Use the following structure:

```text
anime-recommender/
├── src/
│   ├── api/
│   │   └── jikan.ts
│   │
│   ├── models/
│   │   └── anime.ts
│   │
│   ├── recommendation/
│   │   ├── candidates.ts
│   │   ├── similarity.ts
│   │   ├── scoring.ts
│   │   └── recommend.ts
│   │
│   ├── ui/
│   │   ├── search.ts
│   │   ├── results.ts
│   │   └── loading.ts
│   │
│   └── main.ts
│
├── index.html
├── style.css
├── package.json
├── tsconfig.json
└── README.md
```

# 4. Jikan API

Use Jikan as the only external API.

Base URL:

```
https://api.jikan.moe/v4
```

Relevant operations:

## Search anime

Use the Jikan anime search endpoint to resolve a user-entered title into a MAL anime ID.

Conceptually:

```
GET /anime?q={query}
```

The search UI should display a small list of matching results.

The user must explicitly select one result.

Do not automatically select the first result.

---

## Get anime

Use:

```
GET /anime/{mal_id}
```

Retrieve the complete anime information required by the application.

---

## Get related anime

Use:

```
GET /anime/{mal_id}/relations
```

Use the relations endpoint to build the initial recommendation candidate pool.

Do not fetch every possible anime in Jikan.

---

# 5. Internal Anime Model

Do not pass raw Jikan responses throughout the application.

Create an internal normalized model.

Example:

```
export interface Anime {
  malId: number;
  title: string;
  imageUrl: string;

  genres: string[];
  themes: string[];

  type: string | null;
  episodes: number | null;

  score: number | null;
  popularity: number | null;

  studios: string[];
}
```

Only include fields actually needed by the recommendation engine or UI.

---

# 6. Related Anime Model

Create an internal representation for relationships.

Example:

```
export interface RelatedAnime {
  malId: number;
  title: string;
  relationType: string;
}
```

The application needs to know:

- Which anime is related
- Which input anime it came from
- What relationship type it has

---

# 7. Candidate Model

Create a model representing a recommendation candidate.

Example:

```
export interface Candidate {
  anime: Anime;

  relatedTo: number[];

  relationshipTypes: string[];

  sourceCount: number;

  relationScore: number;

  genreScore: number;

  themeScore: number;

  typeScore: number;

  studioScore: number;

  finalScore: number;

  reasons: string[];
}
```

The exact fields can be adjusted during implementation.

---

# 8. User Flow

The UI should have exactly three anime inputs.

Example:

```
What should you watch next?

Anime #1
[ Search anime... ]

Anime #2
[ Search anime... ]

Anime #3
[ Search anime... ]

[ Recommend ]
```

Each search input should provide autocomplete/search results.

Example:

```
Monster

Monster
2004 · TV · 74 episodes

Monster Musume
2015 · TV · 12 episodes

Monster Rancher
1999 · TV · 73 episodes
```

The user selects one result.

Store the MAL ID internally.

---

# 9. Input Validation

The recommendation button should only work when:

- Exactly three anime have been selected
- All three selections are valid Jikan anime
- The three selected MAL IDs are different

If the same anime is selected twice, display an error.

Example:

```
Please select three different anime.
```

---

# 10. API Client

Create `src/api/jikan.ts`.

It should contain functions such as:

```
searchAnime(query: string): Promise<AnimeSearchResult[]>

getAnime(id: number): Promise<Anime>

getAnimeRelations(id: number): Promise<RelatedAnime[]>
```

The API module should be the only part of the application that knows the Jikan endpoint URLs.

Do not put Jikan fetch calls inside recommendation logic or UI code.

---

# 11. API Error Handling

Handle:

- Network errors
- HTTP errors
- Empty search results
- Missing anime data
- Jikan API errors
- Rate limiting

The UI should display a friendly error instead of crashing.

Example:

```
We couldn't retrieve the anime data.
Please try again in a moment.
```

Do not expose raw API errors to the user.

---

# 12. API Request Strategy

Avoid unnecessary API requests.

The basic flow should be:

```
Search anime × 3
        ↓
Get anime details × 3
        ↓
Get relations × 3
        ↓
Build candidate pool
        ↓
Score candidates
```

Do NOT fetch full details for every candidate initially.

Use the data already available from Jikan relations wherever possible.

If additional candidate metadata is required for scoring, fetch only the candidates needed.

Prefer batching/concurrent requests where appropriate using `Promise.all`.

Example:

```
const anime = await Promise.all(
  selectedIds.map(id => getAnime(id))
);
```

---

# 13. Simple In-Memory Cache

Implement a very small in-memory cache for Jikan requests.

Example:

```
const cache = new Map<string, unknown>();
```

Cache:

- Anime details
- Anime relations
- Search results

The cache only needs to persist while the page is running.

No database is required.

---

# 14. Candidate Generation

Create:

```
src/recommendation/candidates.ts
```

The function should:

```
Input:
3 selected anime

        ↓

Get relations for each anime

        ↓

Extract related anime

        ↓

Merge all relations

        ↓

Deduplicate by MAL ID

        ↓

Remove the 3 selected anime

        ↓

Return candidate pool
```

Example:

```
Monster
 ├── Pluto
 ├── 20th Century Boys
 └── Death Note

Death Note
 ├── Monster
 ├── Psycho-Pass
 └── Code Geass

Psycho-Pass
 ├── Monster
 ├── Ghost in the Shell
 └── Ergo Proxy
```

Candidate pool:

```
Pluto
20th Century Boys
Code Geass
Ghost in the Shell
Ergo Proxy
```

Do not include:

```
Monster
Death Note
Psycho-Pass
```

because they were already selected.

---

# 15. Cross-Input Relatedness

A major part of the recommendation algorithm should be:

> How many of the user's three anime are connected to this candidate?

Example:

```
Monster       ─────┐
                   │
Death Note    ─────┼──→ Pluto
                   │
Psycho-Pass   ─────┘
```

Pluto is related to all three.

Therefore:

```
sourceCount = 3
```

Another candidate might only be related to Monster:

```
Monster       ─────→ Candidate A

Death Note

Psycho-Pass
```

Then:

```
sourceCount = 1
```

Calculate:

```
relationScore = sourceCount / 3;
```

Therefore:

```
3/3 → 1.00
2/3 → 0.67
1/3 → 0.33
```

This should be one of the strongest recommendation signals.

---

# 16. Relationship Types

Jikan relations have different relationship types.

Do not treat every relation as equally useful.

For the initial implementation, use a simple relationship weighting system.

Suggested starting weights:

```
Sequel              1.0
Prequel             1.0
Side Story          0.8
Spin-off            0.7
Alternative Version 0.6
Other               0.4
```

These values are experimental.

Keep them in one configuration object so they can easily be changed later.

Example:

```
const RELATION_WEIGHTS: Record<string, number> = {
  "Sequel": 1,
  "Prequel": 1,
  "Side Story": 0.8,
  "Spin-off": 0.7,
  "Alternative Version": 0.6,
  "Other": 0.4,
};
```

For the first version, consider excluding obvious franchise continuations such as direct sequels from the final recommendation.

The goal is:

> Recommend something similar, not simply the next installment.

This behavior can be changed later.

---

# 17. Taste Profile

Do not immediately create one large unweighted list of all metadata.

Instead, preserve the three original anime independently.

For every candidate calculate:

```
candidate ↔ anime 1
candidate ↔ anime 2
candidate ↔ anime 3
```

Example:

```
Pluto

Similarity to Monster:      0.90
Similarity to Death Note:   0.72
Similarity to Psycho-Pass:  0.81
```

Then aggregate those scores.

This allows better explanations later.

---

# 18. Genre Similarity

Implement:

```
genreSimilarity(a: Anime, b: Anime): number
```

Use Jaccard similarity.

Formula:

```
intersection / union
```

Example:

```
Anime A:
Drama
Mystery
Psychological

Anime B:
Drama
Mystery
Psychological
Sci-Fi
```

Intersection:

```
Drama
Mystery
Psychological
```

Union:

```
Drama
Mystery
Psychological
Sci-Fi
```

Score:

```
3 / 4 = 0.75
```

Implementation example:

```
function jaccardSimilarity(
  a: string[],
  b: string[]
): number {
  const setA = new Set(a);
  const setB = new Set(b);

  const intersection = [...setA]
    .filter(value => setB.has(value));

  const union = new Set([
    ...setA,
    ...setB
  ]);

  if (union.size === 0) {
    return 0;
  }

  return intersection.length / union.size;
}
```

---

# 19. Theme Similarity

Implement:

```
themeSimilarity(a: Anime, b: Anime): number
```

Use the same Jaccard similarity approach.

Themes should have a lower weight than genres initially.

---

# 20. Type Similarity

Implement:

```
typeSimilarity(a: Anime, b: Anime): number
```

Simple rule:

```
same type → 1
different type → 0
```

Examples:

```
TV → TV = 1
TV → Movie = 0
Movie → Movie = 1
```

This is intentionally simple.

---

# 21. Studio Similarity

Implement:

```
studioSimilarity(a: Anime, b: Anime): number
```

Use Jaccard similarity between studio names.

This should have a low weight.

A shared studio should be a supporting signal, not a dominant recommendation factor.

---

# 22. Metadata Similarity

For each candidate and each selected anime:

```
metadataSimilarity =
    genreSimilarity * 0.50
  + themeSimilarity * 0.30
  + typeSimilarity * 0.10
  + studioSimilarity * 0.10
```

These weights are initial values and should be easy to modify.

---

# 23. Aggregate Similarity

Calculate similarity against each of the three selected anime.

Example:

```
Candidate: Pluto

Monster       0.90
Death Note    0.72
Psycho-Pass   0.81
```

Use the average:

```
averageSimilarity =
  (0.90 + 0.72 + 0.81) / 3
```

The average represents how generally compatible the candidate is with the three selections.

---

# 24. Final Recommendation Score

Use a simple weighted score.

Initial weights:

```
Cross-input relatedness     40%
Metadata similarity         60%
```

Formula:

```
finalScore =
  relationScore * 0.40 +
  averageSimilarity * 0.60;
```

Keep the formula simple.

Do not add popularity, MAL score, episode count, release year, etc. yet.

Those can be experimented with later.

---

# 25. Recommendation Ranking

After calculating scores:

```
candidates.sort(
  (a, b) => b.finalScore - a.finalScore
);
```

The first candidate becomes the recommendation.

Return more than one candidate internally, even if the UI only displays one.

Example:

```
[
  {
    anime: Pluto,
    finalScore: 0.84
  },
  {
    anime: Ergo Proxy,
    finalScore: 0.79
  },
  {
    anime: Paranoia Agent,
    finalScore: 0.76
  }
]
```

This makes it easy to display the top 3 later without changing the recommendation engine.

---

# 26. Recommendation Reasons

Do not use AI to generate the initial explanation.

Generate deterministic reasons from the recommendation data.

Possible reasons:

```
Related to 3 of your 3 selections
```

```
Shares the Psychological genre with all three selections
```

```
Shares the Mystery genre with two of your selections
```

```
Shares the Drama genre with two of your selections
```

```
Has similar themes to Monster and Psycho-Pass
```

Create:

```
generateReasons(
  candidate,
  selectedAnime
): string[]
```

Return structured reasons.

Example:

```
[
  "Related to all 3 of your selections",
  "Shares the Psychological genre with 3 selections",
  "Shares the Mystery genre with 2 selections"
]
```

---

# 27. Recommendation Result

The main recommendation function should return something like:

```
export interface Recommendation {
  anime: Anime;

  finalScore: number;

  relatedTo: number[];

  reasons: string[];
}
```

The UI should receive this object and not need to understand the scoring algorithm.

---

# 28. Main Recommendation Function

Create:

```
src/recommendation/recommend.ts
```

Expose:

```
recommend(
  selectedAnime: Anime[]
): Promise<Recommendation>
```

The function should orchestrate:

```
selected anime
      ↓
fetch relations
      ↓
build candidates
      ↓
score candidates
      ↓
sort
      ↓
generate reasons
      ↓
return top recommendation
```

The UI should only call this function.

---

# 29. UI States

The application should support these states:

## Initial

```
Select three anime
```

## Searching

```
Searching...
```

## Ready

```
Three anime selected
[ Recommend ]
```

## Loading recommendation

```
Finding your recommendation...
```

## Result

```
Your recommendation:

PLUTO
```

## Error

```
Something went wrong.
Please try again.
```

---

# 30. Result UI

Display:

```
Your recommendation

[ Anime Cover ]

PLUTO

2023 · TV · 8 episodes

Why this anime?

✓ Related to all 3 of your selections
✓ Shares Psychological with your selections
✓ Shares Mystery with 2 of your selections
✓ Similar overall metadata
```

Also display the three selected anime:

```
Based on:

Monster · Death Note · Psycho-Pass
```

Do not expose the raw numerical score initially.

The score is an internal mechanism.

---

# 31. No Database

Do not persist anything.

The application should be completely stateless.

Refreshing the page clears the current selection.

This keeps the MVP simple.

---

# 32. No Authentication

Do not implement:

- Login
- Registration
- MyAnimeList OAuth
- User accounts

Those belong to a future version.

---

# 33. No MyAnimeList User Integration Yet

Do not implement the original idea of:

```
MAL username
→ user list
→ analyze hundreds of anime
```

yet.

The three-anime input is the prototype for the recommendation engine.

Later the input layer can be replaced with:

```
MyAnimeList user
→ select highly-rated anime
→ recommendation engine
```

The recommendation engine should not need to change substantially.

---

# 34. No AI

Do not use an LLM.

All recommendations and explanations should be based on actual Jikan data and deterministic calculations.

This is important because the first goal is to understand whether the recommendation algorithm itself works.

AI can be introduced later for natural-language explanations.

---

# 35. Testing

Add unit tests for the recommendation logic.

At minimum test:

## Jaccard similarity

```
Same arrays → 1
No overlap → 0
Partial overlap → correct fraction
Both empty → 0
```

## Relation score

```
3/3 → 1
2/3 → 0.67
1/3 → 0.33
```

## Candidate deduplication

If an anime is related to multiple inputs, it should only appear once.

## Input exclusion

The three selected anime must never appear as recommendations.

## Ranking

A candidate with a higher final score should appear before a candidate with a lower score.

---

# 36. Development Order

Implement in this exact order.

## Step 1

Create the Vite TypeScript project.

Verify:

```
npm run dev
```

works.

---

## Step 2

Create the Jikan client.

Implement:

```
searchAnime()
getAnime()
getAnimeRelations()
```

Test them independently.

---

## Step 3

Create the internal models.

Implement:

```
Anime
RelatedAnime
Candidate
Recommendation
```

---

## Step 4

Implement anime search UI.

The user should be able to select three anime.

Do not implement recommendation logic yet.

---

## Step 5

Implement candidate generation.

Given:

```
[
  monster,
  deathNote,
  psychoPass
]
```

return the deduplicated related anime pool.

---

## Step 6

Implement similarity functions.

Build and test:

```
genreSimilarity()
themeSimilarity()
typeSimilarity()
studioSimilarity()
```

---

## Step 7

Implement scoring.

Combine:

```
relationScore
+
metadata similarity
```

and return ranked candidates.

---

## Step 8

Implement recommendation explanations.

Generate deterministic reasons.

---

## Step 9

Connect the recommendation engine to the UI.

The complete flow should now work:

```
Search
→ Select 3
→ Recommend
→ Show result
```

---

## Step 10

Polish the UI.

Only after the algorithm works.

---

# 37. Initial Algorithm Summary

The entire recommendation algorithm should initially be:

```
INPUT
3 anime
   │
   ▼
Get relations
   │
   ▼
Build candidate pool
   │
   ▼
Remove input anime
   │
   ▼
Deduplicate
   │
   ▼
For each candidate:
   │
   ├── Calculate relation score
   │
   ├── Compare with Anime #1
   │      ├── Genre
   │      ├── Theme
   │      ├── Type
   │      └── Studio
   │
   ├── Compare with Anime #2
   │
   └── Compare with Anime #3
   │
   ▼
Average metadata similarity
   │
   ▼
Final score:
40% relation
60% metadata similarity
   │
   ▼
Sort candidates
   │
   ▼
Select highest scoring candidate
   │
   ▼
Generate explanation
```

---

# 38. Important Constraints

Keep the implementation simple.

Do NOT:

- Add a database
- Add authentication
- Add React
- Add an LLM
- Build a backend
- Build a complex recommendation model
- Analyze the entire Jikan database
- Fetch unnecessary candidate details
- Over-optimize the scoring algorithm

The purpose of this version is experimentation.

---

# 39. Future Improvements

Only consider these after the MVP works:

### More input anime

Allow 5 or 10 anime.

### Ratings

Allow:

```
Monster       10/10
Death Note     9/10
Psycho-Pass    8/10
```

Weight the selections accordingly.

### Positive and negative examples

Allow users to specify:

```
I like:
Monster
Death Note
Psycho-Pass

I dislike:
Sword Art Online
```

Use negative metadata as a penalty.

### Better candidate generation

Combine:

```
Related anime
+
Genre search
+
Theme search
```

### More metadata

Experiment with:

- Episodes
- Duration
- Year
- Season
- Source
- Popularity
- MAL score

### Recommendation categories

Eventually return:

```
Best Match
Something Different
Hidden Gem
Short Watch
```

### MAL user integration

Replace the three manual inputs with a public MAL profile.

### Manga

Apply the same recommendation system to manga.

### AI explanations

Use an LLM only after the deterministic recommendation system is stable.

---

# 40. Definition of Done

The micro-MVP is complete when a user can:

1. Open the application.
2. Search for an anime.
3. Select three different anime.
4. Click "Recommend".
5. The application retrieves their Jikan data.
6. The application retrieves related anime.
7. The application builds a deduplicated candidate pool.
8. The selected anime are excluded.
9. Candidates are scored using the recommendation algorithm.
10. The highest-scoring candidate is displayed.
11. The application displays several factual reasons for the recommendation.
12. Errors are handled gracefully.

Example complete flow:

```
User selects:

Monster
Death Note
Psycho-Pass

        ↓

Jikan

        ↓

Related anime

        ↓

Candidate pool

        ↓

Similarity + relatedness scoring

        ↓

PLUTO

        ↓

Why?

• Related to all 3 selections
• Shares Psychological
• Shares Mystery
• Shares Drama
• Strong overall metadata similarity
```

This is the entire first version.

The most important goal is not to make the recommendation algorithm perfect. The goal is to create a **small, understandable system that can be tested with many combinations of three anime and iteratively improved**.
