import "../style.css";
import { getAnime } from "./api/anilist";
import type { AnimeSearchResult } from "./models/anime";
import { recommend } from "./recommendation/recommend";
import { createAnimeSearchField, type AnimeSearchField } from "./ui/search";
import { renderError, renderNoMatch, renderRecommendation } from "./ui/results";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("Application root was not found.");

app.innerHTML = `
  <div class="page-shell">
    <header class="masthead">
      <p class="eyebrow">Anime discovery engine</p>
      <h1>What should you watch next?</h1>
      <p>Pick three anime you enjoyed. We will find one adjacent discovery, not the next franchise installment.</p>
    </header>
    <section class="selector" aria-labelledby="selection-title">
      <div class="section-heading"><h2 id="selection-title">Your three</h2><p>Select an exact match from each search.</p></div>
      <div id="search-fields" class="search-grid"></div>
      <p id="selection-error" class="selection-error" role="alert"></p>
      <button id="recommend-button" class="recommend-button" type="button" disabled>Find a recommendation</button>
    </section>
    <div id="result-region" class="result-region" aria-live="polite"></div>
  </div>
`;

const fieldsContainer = document.querySelector<HTMLElement>("#search-fields")!;
const action = document.querySelector<HTMLButtonElement>("#recommend-button")!;
const error = document.querySelector<HTMLElement>("#selection-error")!;
const resultRegion = document.querySelector<HTMLElement>("#result-region")!;
let fields: AnimeSearchField[] = [];

function selections(): AnimeSearchResult[] {
  return fields.flatMap((field) => {
    const selection = field.getSelection();
    return selection ? [selection] : [];
  });
}

function refreshAction(): void {
  const selected = selections();
  const hasDuplicate = new Set(selected.map((item) => item.malId)).size !== selected.length;
  error.textContent = hasDuplicate ? "Please select three different anime." : "";
  action.disabled = selected.length !== 3 || hasDuplicate;
}

fields = [1, 2, 3].map((index) => createAnimeSearchField(index, refreshAction));
fields.forEach((field) => fieldsContainer.append(field.element));

action.addEventListener("click", async () => {
  const selected = selections();
  if (selected.length !== 3) return;
  action.disabled = true;
  fields.forEach((field) => field.setDisabled(true));
  resultRegion.innerHTML = `<section class="message-card loading"><span class="spinner" aria-hidden="true"></span><p>Finding your next frame...</p></section>`;
  try {
    const detailed = await Promise.all(selected.map((item) => getAnime(item.malId)));
    const result = await recommend(detailed);
    if (result.kind === "recommendation") renderRecommendation(resultRegion, result.recommendation);
    else renderNoMatch(resultRegion);
  } catch {
    renderError(resultRegion);
  } finally {
    fields.forEach((field) => field.setDisabled(false));
    refreshAction();
  }
});
