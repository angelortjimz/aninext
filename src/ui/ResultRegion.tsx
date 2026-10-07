import type { JSX } from "react";
import type { Recommendation } from "../models/anime";
import type { UiState } from "../models/ui";

function details(recommendation: Recommendation): string {
  const anime = recommendation.anime;
  return [anime.year, anime.type, anime.episodes ? `${anime.episodes} episodes` : null]
    .filter(Boolean)
    .join(" - ");
}

function RecommendationCard({ recommendation }: { recommendation: Recommendation }): JSX.Element {
  const anime = recommendation.anime;
  return (
    <section className="recommendation" aria-labelledby="recommendation-title">
      <p className="eyebrow">Your recommendation</p>
      <div className="recommendation-layout">
        {anime.imageUrl ? (
          <img
            className="cover"
            src={encodeURI(anime.imageUrl)}
            alt={`Cover art for ${anime.title}`}
          />
        ) : (
          <div className="cover cover-placeholder" aria-hidden="true"></div>
        )}
        <div>
          <h2 id="recommendation-title">{anime.title}</h2>
          <p className="muted">{details(recommendation) || "Anime"}</p>
          <h3>Why this one</h3>
          <ul>
            {recommendation.reasons.map((reason, position) => (
              <li key={position}>{reason}</li>
            ))}
          </ul>
        </div>
      </div>
      <p className="based-on">
        Based on {recommendation.basedOn.map((item) => item.title).join(" / ")}
      </p>
    </section>
  );
}

export function ResultRegion({ ui }: { ui: UiState }): JSX.Element | null {
  if (ui.kind === "idle") return null;
  if (ui.kind === "loading") {
    return (
      <section className="message-card loading">
        <span className="spinner" aria-hidden="true"></span>
        <p>Finding your next frame...</p>
      </section>
    );
  }
  if (ui.kind === "no-match") {
    return (
      <section className="message-card">
        <h2>No discovery match yet</h2>
        <p>
          These choices only led to direct franchise continuations or unavailable titles. Try a
          different mix of anime.
        </p>
      </section>
    );
  }
  if (ui.kind === "unavailable") {
    return (
      <section className="message-card">
        <h2>One selection is no longer available</h2>
        <p>AniList no longer lists one of the anime you picked. Clear that field and try again.</p>
      </section>
    );
  }
  if (ui.kind === "error") {
    return (
      <section className="message-card">
        <h2>We could not find a recommendation</h2>
        <p>AniList is temporarily unavailable. Please try again in a moment.</p>
      </section>
    );
  }
  return <RecommendationCard recommendation={ui.recommendation} />;
}
