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
  const [runError, setRunError] = useState("");
  const [connection, setConnection] = useState<"connecting" | "live" | "reconnecting">(
    "connecting",
  );
  useEffect(() => {
    let source: EventSource | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    let terminal = false;
    let reconnectAttempt = 0;
    const terminalStates = ["COMPLETED", "FAILED", "CANCELLED"];
    function applySnapshot(data: { events: Event[]; state: string; error?: string }) {
      if (disposed) return;
      setEvents(data.events);
      setState(data.state);
      setRunError(data.error ?? "");
      terminal = terminalStates.includes(data.state);
    }
    async function refresh() {
      const response = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Run not found");
      applySnapshot(await response.json());
    }
    function connect() {
      if (disposed || terminal) return;
      source = new EventSource(`/api/runs/${runId}/events`);
      source.onopen = () => {
        reconnectAttempt = 0;
        setConnection("live");
      };
      source.onmessage = (message) => {
        const event = JSON.parse(message.data) as Event;
        setEvents((old) => (old.some((item) => item.id === event.id) ? old : [...old, event]));
        setState(event.state);
        if (event.state === "FAILED" && typeof event.detail?.error === "string")
          setRunError(event.detail.error);
        if (terminalStates.includes(event.state)) {
          terminal = true;
          source?.close();
        }
      };
      source.onerror = () => {
        source?.close();
        if (disposed || terminal) return;
        setConnection("reconnecting");
        const delay = Math.min(8_000, 500 * 2 ** reconnectAttempt++);
        reconnectTimer = setTimeout(() => {
          void refresh()
            .then(() => connect())
            .catch(() => connect());
        }, delay);
      };
    }
    void refresh()
      .then(() => {
        if (!terminal) connect();
      })
      .catch((caught: Error) => setError(caught.message));
    return () => {
      disposed = true;
      source?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [runId]);
  const activeIndex = useMemo(() => {
    const latestPipelineState = [...events]
      .reverse()
      .find((event) => states.includes(event.state))?.state;
    return states.indexOf(latestPipelineState ?? state);
  }, [events, state]);
  const completed = state === "COMPLETED";
  const failed = state === "FAILED";
  const cancelled = state === "CANCELLED";
  const terminal = completed || failed || cancelled;
  async function cancel() {
    const token = sessionStorage.getItem(`agenttrial:cancel:${runId}`) ?? "";
    const response = await fetch(`/api/runs/${runId}`, {
      method: "DELETE",
      headers: { "x-agenttrial-cancel-token": token },
    });
    if (response.ok) setState("CANCELLED");
  }
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
            <span className={`pulse ${terminal ? "done" : ""}`} />
            {completed
              ? "TRIAL COMPLETE"
              : failed
                ? "EVALUATOR FAILURE"
                : cancelled
                  ? "TRIAL CANCELLED"
                  : "LIVE EXECUTION"}
          </span>
          <h1>
            {completed
              ? "Evidence sealed."
              : failed
                ? "Evaluation stopped safely."
                : cancelled
                  ? "Trial cancelled."
                  : "Agent under examination."}
          </h1>
          <p className="mono">RUN {runId}</p>
        </div>
        <div className="live-actions">
          {!completed && !["FAILED", "CANCELLED"].includes(state) && (
            <button className="button secondary" onClick={cancel}>
              Cancel trial
            </button>
          )}
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
      {(failed || cancelled) && (
        <section className={`terminal-notice ${failed ? "failed" : ""}`} role="status">
          <div>
            <span className="kicker">{failed ? "REQUEST / EVALUATOR FAILURE" : "CANCELLED"}</span>
            <h2>{failed ? "No capability verdict was inferred." : "No receipt was issued."}</h2>
            <p>
              {failed
                ? runError || "The evaluator could not complete the bounded request."
                : "Incomplete observations were discarded to avoid presenting partial work as a verdict."}
            </p>
          </div>
          <Link className="button secondary" href="/new">
            Start a new trial â†’
          </Link>
        </section>
      )}
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
            {!terminal && <span className={`connection-state ${connection}`}>{connection}</span>}
          </div>
          <div
            className="timeline"
            aria-live="polite"
            aria-label="Hash-chained evaluation events"
            tabIndex={0}
          >
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
            {!terminal && (
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
