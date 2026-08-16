"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type BenchmarkRun = {
  id: string;
  state: string;
  events: Array<{ id: string; type: string; message: string }>;
  report?: {
    score: {
      overall: number;
      coverage: number;
      dimensions: Record<string, number>;
      criticalFindings: string[];
    };
    assertions: Array<{ passed: boolean }>;
  };
};

const agents = [
  {
    fixture: "evidence-researcher",
    name: "Evidence Researcher",
    label: "CONTROL",
    summary: "Grounded, bounded, and injection-resistant.",
  },
  {
    fixture: "gullible-researcher",
    name: "Gullible Researcher",
    label: "ADVERSARIAL BASELINE",
    summary: "Deliberately stale, credulous, and inconsistent.",
  },
] as const;

const orderedStates = [
  "CREATED",
  "DISCOVERING",
  "CLAIMS_EXTRACTED",
  "PLANNING",
  "PLAN_SEALED",
  "EXECUTING",
  "VERIFYING",
  "SCORING",
  "RECEIPT_SIGNED",
  "ATTESTING",
  "COMPLETED",
];
const dimensionMaximums: Record<string, number> = {
  capability: 30,
  evidence: 20,
  safety: 20,
  reliability: 15,
  efficiency: 10,
  recovery: 5,
};

export function BenchmarkArena() {
  const [runs, setRuns] = useState<BenchmarkRun[]>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const runIds = runs.map((run) => run.id).join(",");

  useEffect(() => {
    const ids = runIds.split(",").filter(Boolean);
    if (!ids.length) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function refresh() {
      const snapshots = await Promise.all(
        ids.map(async (id) => {
          const response = await fetch(`/api/runs/${id}`, { cache: "no-store" });
          if (!response.ok) return undefined;
          const snapshot = (await response.json()) as Omit<BenchmarkRun, "id"> & { runId: string };
          return { ...snapshot, id: snapshot.runId } as BenchmarkRun;
        }),
      );
      if (disposed) return;
      const available: BenchmarkRun[] = [];
      for (const snapshot of snapshots) if (snapshot) available.push(snapshot);
      if (available.length) setRuns(available);
      if (available.some((run) => !["COMPLETED", "FAILED", "CANCELLED"].includes(run.state)))
        timer = setTimeout(() => void refresh(), 250);
    }
    void refresh().catch(() => {
      if (!disposed) timer = setTimeout(() => void refresh(), 750);
    });
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
    };
  }, [runIds]);

  async function launch() {
    setStarting(true);
    setError("");
    setRuns([]);
    try {
      const created = await Promise.all(
        agents.map(async (agent) => {
          const response = await fetch("/api/runs", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ fixture: agent.fixture, activeConsent: true }),
          });
          const body = (await response.json()) as {
            runId?: string;
            state?: string;
            cancelToken?: string;
            error?: string;
          };
          if (!response.ok || !body.runId) throw new Error(body.error ?? "Benchmark launch failed");
          if (body.cancelToken)
            sessionStorage.setItem(`agenttrial:cancel:${body.runId}`, body.cancelToken);
          return { id: body.runId, state: body.state ?? "CREATED", events: [] };
        }),
      );
      setRuns(created);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Benchmark launch failed");
    } finally {
      setStarting(false);
    }
  }

  const entries = useMemo(
    () => agents.map((agent, index) => ({ ...agent, run: runs[index] })),
    [runs],
  );
  const complete =
    entries.length === 2 && entries.every((entry) => entry.run?.state === "COMPLETED");
  const scoreGap = complete
    ? Math.abs((runs[0]?.report?.score.overall ?? 0) - (runs[1]?.report?.score.overall ?? 0))
    : undefined;

  return (
    <section className="benchmark-arena" aria-label="Live agent comparison">
      <div className="arena-command">
        <div>
          <span className="kicker">THE CONTROLLED EXPERIMENT</span>
          <h2>{complete ? "The evidence separated them." : "Two agents. One standard."}</h2>
          <p>
            Each run gets a new ID, seed commitment, sealed plan, event chain, and signed receipt.
            Scores come only from versioned assertions.
          </p>
        </div>
        <button className="button" onClick={launch} disabled={starting}>
          {starting ? "Sealing two workspaces…" : runs.length ? "Run again ↻" : "Run both live →"}
        </button>
      </div>

      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}

      <div className="benchmark-grid">
        {entries.map((agent) => {
          const { run } = agent;
          const report = run?.report;
          const progress = run ? Math.max(0, orderedStates.indexOf(run.state)) : 0;
          const assertionPasses = report?.assertions.filter((item) => item.passed).length ?? 0;
          return (
            <article
              className={`benchmark-agent ${agent.fixture === "gullible-researcher" ? "vulnerable" : ""}`}
              key={agent.fixture}
            >
              <header>
                <span className="kicker">{agent.label}</span>
                <h3>{agent.name}</h3>
                <p>{agent.summary}</p>
              </header>
              {!run ? (
                <div className="benchmark-awaiting">
                  <span>AWAITING TRIAL</span>
                  <p>Nothing is precomputed. Launch to create fresh evidence.</p>
                </div>
              ) : (
                <>
                  <div className="benchmark-state">
                    <span className={run.state === "COMPLETED" ? "sealed" : ""} />
                    <strong>{run.state.replaceAll("_", " ")}</strong>
                    <small>{run.events.length} events</small>
                  </div>
                  <div className="benchmark-progress" aria-label={`${agent.name} progress`}>
                    <i
                      style={{
                        width: `${Math.min(100, (progress / (orderedStates.length - 1)) * 100)}%`,
                      }}
                    />
                  </div>
                  {report ? (
                    <>
                      <div className="benchmark-score">
                        <strong>{report.score.overall}</strong>
                        <span>/100</span>
                        <small>{report.score.coverage}% claim coverage</small>
                      </div>
                      <div className="benchmark-dimensions">
                        {Object.entries(report.score.dimensions).map(([name, value]) => (
                          <div key={name}>
                            <span>{name.replaceAll("_", " ")}</span>
                            <i>
                              <b
                                style={{
                                  width: `${(value / (dimensionMaximums[name] ?? 100)) * 100}%`,
                                }}
                              />
                            </i>
                            <strong>
                              {value}/{dimensionMaximums[name] ?? 100}
                            </strong>
                          </div>
                        ))}
                      </div>
                      <div className="benchmark-findings">
                        <strong>
                          {assertionPasses}/{report.assertions.length} assertions passed
                        </strong>
                        <p>
                          {report.score.criticalFindings[0] ??
                            "No critical deterministic failures."}
                        </p>
                      </div>
                      <div className="benchmark-links">
                        <Link href={`/reports/${run.id}`}>Inspect report →</Link>
                        <Link href={`/verify?run=${run.id}`}>Verify receipt</Link>
                      </div>
                    </>
                  ) : (
                    <div className="benchmark-latest">
                      <span>LATEST EVIDENCE ACTIVITY</span>
                      <p>
                        {run.events.at(-1)?.message ?? "Workspace created. Waiting for evaluator."}
                      </p>
                      <Link href={`/live/${run.id}`}>Open live timeline ↗</Link>
                    </div>
                  )}
                </>
              )}
            </article>
          );
        })}
      </div>

      {scoreGap !== undefined && (
        <div className="benchmark-conclusion" role="status">
          <span className="kicker">DETERMINISTIC SEPARATION</span>
          <strong>{scoreGap}-point evidence gap</strong>
          <p>
            Not a model preference. The gap is fully traceable to assertion outcomes in two
            independently verifiable bundles.
          </p>
        </div>
      )}
    </section>
  );
}
