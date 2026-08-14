"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
type Event = {
  id: string;
  at: string;
  state: string;
  type: string;
  message: string;
  detail?: Record<string, unknown>;
};
const states = [
  "DISCOVERING",
  "PLANNING",
  "PLAN_SEALED",
  "EXECUTING",
  "VERIFYING",
  "SCORING",
  "RECEIPT_SIGNED",
  "COMPLETED",
];
export function LiveRun({ runId }: { runId: string }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [state, setState] = useState("CREATED");
  const [error, setError] = useState("");
  useEffect(() => {
    let source: EventSource | undefined;
    fetch(`/api/runs/${runId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Run not found");
        const data = await r.json();
        setEvents(data.events);
        setState(data.state);
        if (!["COMPLETED", "FAILED", "CANCELLED"].includes(data.state)) {
          source = new EventSource(`/api/runs/${runId}/events`);
          source.onmessage = (m) => {
            const e = JSON.parse(m.data);
            setEvents((old) => (old.some((x) => x.id === e.id) ? old : [...old, e]));
            setState(e.state);
            if (["COMPLETED", "FAILED", "CANCELLED"].includes(e.state)) source?.close();
          };
          source.onerror = () => source?.close();
        }
      })
      .catch((e) => setError(e.message));
    return () => source?.close();
  }, [runId]);
  const activeIndex = useMemo(() => states.indexOf(state), [state]);
  const completed = state === "COMPLETED";
  if (error)
    return (
      <div className="empty-state">
        <h1>Trial unavailable</h1>
        <p>{error}</p>
        <Link className="button" href="/new">
          Start another trial
        </Link>
      </div>
    );
  return (
    <>
      <div className="live-head">
        <div>
          <span className="eyebrow">
            <span className={`pulse ${completed ? "done" : ""}`} />
            {completed ? "TRIAL COMPLETE" : "LIVE EXECUTION"}
          </span>
          <h1>{completed ? "Evidence sealed." : "Agent under examination."}</h1>
          <p className="mono">RUN {runId}</p>
        </div>
        <div className="live-actions">
          {completed && (
            <Link className="button" href={`/reports/${runId}`}>
              Open full report →
            </Link>
          )}
          <button
            className="icon-button"
            aria-label="Copy run ID"
            onClick={() => navigator.clipboard.writeText(runId)}
          >
            ⌘
          </button>
        </div>
      </div>
      <div className="live-layout">
        <aside className="state-rail" aria-label="Pipeline progress">
          {states.map((s, i) => (
            <div
              className={`${i < activeIndex || completed ? "passed" : i === activeIndex ? "active" : ""}`}
              key={s}
            >
              <span>{i < activeIndex || completed ? "✓" : String(i + 1).padStart(2, "0")}</span>
              <p>
                <strong>{s.replaceAll("_", " ")}</strong>
                <small>
                  {i < activeIndex || completed
                    ? "Complete"
                    : i === activeIndex
                      ? "In progress"
                      : "Pending"}
                </small>
              </p>
            </div>
          ))}
        </aside>
        <section className="timeline-panel">
          <div className="panel-title">
            <div>
              <span className="kicker">EVENT STREAM</span>
              <h2>Autonomy, made visible.</h2>
            </div>
            <span className="event-count">{events.length} events</span>
          </div>
          <div className="timeline" aria-live="polite">
            {events.map((e) => (
              <article
                key={e.id}
                className={
                  e.type.includes("failed")
                    ? "event-fail"
                    : e.type.includes("passed")
                      ? "event-pass"
                      : ""
                }
              >
                <span className="event-node" />
                <time>{new Date(e.at).toLocaleTimeString([], { hour12: false })}</time>
                <div>
                  <span className="event-type">{e.type}</span>
                  <p>{e.message}</p>
                  {e.detail && (
                    <code>
                      {Object.entries(e.detail)
                        .slice(0, 3)
                        .map(([k, v]) => `${k}=${typeof v === "object" ? "[…]" : v}`)
                        .join(" · ")}
                    </code>
                  )}
                </div>
              </article>
            ))}
            {!completed && (
              <div className="thinking">
                <i />
                <i />
                <i />
                <span>Evaluator is working</span>
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
