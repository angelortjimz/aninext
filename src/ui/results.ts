import type { Recommendation } from "../models/anime";

function details(recommendation: Recommendation): string {
  const anime = recommendation.anime;
  return [anime.year, anime.type, anime.episodes ? `${anime.episodes} episodes` : null].filter(Boolean).join(" - ");
}

function escapeHtml(value: string): string {
  const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
  return value.replace(/[&<>"]/g, (character) => entities[character] ?? character);
}

export function renderRecommendation(target: HTMLElement, recommendation: Recommendation): void {
  const anime = recommendation.anime;
  target.innerHTML = `
    <section class="recommendation" aria-labelledby="recommendation-title">
      <p class="eyebrow">Your recommendation</p>
      <div class="recommendation-layout">
        ${anime.imageUrl ? `<img class="cover" src="${encodeURI(anime.imageUrl)}" alt="Cover art for ${escapeHtml(anime.title)}" />` : "<div class=\"cover cover-placeholder\" aria-hidden=\"true\"></div>"}
        <div>
          <h2 id="recommendation-title">${escapeHtml(anime.title)}</h2>
          <p class="muted">${escapeHtml(details(recommendation) || "Anime")}</p>
          <h3>Why this one</h3>
          <ul>${recommendation.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>
        </div>
      </div>
      <p class="based-on">Based on ${recommendation.basedOn.map((item) => escapeHtml(item.title)).join(" / ")}</p>
    </section>
  `;
}

export function renderNoMatch(target: HTMLElement): void {
  target.innerHTML = `<section class="message-card"><h2>No discovery match yet</h2><p>These choices only led to direct franchise continuations or unavailable titles. Try a different mix of anime.</p></section>`;
}

export function renderError(target: HTMLElement): void {
  target.innerHTML = `<section class="message-card"><h2>We could not find a recommendation</h2><p>AniList is temporarily unavailable. Please try again in a moment.</p></section>`;
}
