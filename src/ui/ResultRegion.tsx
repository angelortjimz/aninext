import type { JSX } from "react";
import type { Recommendation } from "@/models/anime";
import type { UiState } from "@/models/ui";

function details(recommendation: Recommendation): string {
  const anime = recommendation.anime;
  return [anime.year, anime.type, anime.episodes ? `${anime.episodes} episodes` : null]
    .filter(Boolean)
    .join(" - ");
}

function RecommendationCard({ recommendation }: { recommendation: Recommendation }): JSX.Element {
  const anime = recommendation.anime;
  return (
    <section className="result-card" aria-labelledby="recommendation-title">
      <p className="eyebrow">Your recommendation</p>
      <div className="result-layout">
        {anime.imageUrl ? (
          <img
            className="cover"
            src={encodeURI(anime.imageUrl)}
            alt={`Cover art for ${anime.title}`}
          />
        ) : (
          <div className="cover cover--placeholder" aria-hidden="true"></div>
        )}
        <div>
          <h2 className="result-title" id="recommendation-title">
            {anime.title}
          </h2>
          <p className="meta">{details(recommendation) || "Anime"}</p>
          <h3 className="reason-heading">Why this one</h3>
          <ul className="reason-list">
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
        <p className="message-body">Finding your next anime...</p>
      </section>
    );
  }
  if (ui.kind === "no-match") {
    return (
      <section className="message-card">
        <h2 className="card-title">No discovery match yet</h2>
        <p className="message-body">
          These choices only led to direct franchise continuations or unavailable titles. Try a
          different mix of anime.
        </p>
      </section>
    );
  }
  if (ui.kind === "unavailable") {
    return (
      <section className="message-card">
        <h2 className="card-title">One selection is no longer available</h2>
        <p className="message-body">
          AniList no longer lists one of the anime you picked. Clear that field and try again.
        </p>
      </section>
    );
  }
  if (ui.kind === "error") {
    return (
      <section className="message-card">
        <h2 className="card-title">We could not find a recommendation</h2>
        <p className="message-body">
          AniList is temporarily unavailable. Please try again in a moment.
        </p>
      </section>
    );
  }
  return <RecommendationCard recommendation={ui.recommendation} />;
}
