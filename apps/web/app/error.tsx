"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="empty-state">
      <span className="huge-code">ERR</span>
      <h1>The evaluator hit a fault.</h1>
      <p>No capability verdict was inferred from this request failure.</p>
      <button className="button" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
