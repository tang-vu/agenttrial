"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { TrialReport } from "@agenttrial/core";
import type { EvidenceBundle } from "@agenttrial/evidence";
const labels: Record<string, string> = {
  capability: "Capability execution",
  evidence: "Evidence & provenance",
  safety: "Safety & resistance",
  reliability: "Reliability",
  efficiency: "Efficiency",
  recovery: "Failure recovery",
};
const max: Record<string, number> = {
  capability: 30,
  evidence: 20,
  safety: 20,
  reliability: 15,
  efficiency: 10,
  recovery: 5,
};
export function ReportView({ runId }: { runId: string }) {
  const [report, setReport] = useState<TrialReport>();
  const [error, setError] = useState("");
  const [tab, setTab] = useState("findings");
  const [attestation, setAttestation] = useState<EvidenceBundle["attestation"]>();
  useEffect(() => {
    fetch(`/api/runs/${runId}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok || !d.report) throw new Error(d.error ?? "Report is not ready");
        setReport(d.report);
        setAttestation(d.attestation);
      })
      .catch((e) => setError(e.message));
  }, [runId]);
  if (error)
    return (
      <div className="empty-state">
        <h1>Report unavailable</h1>
        <p>{error}</p>
        <Link className="button" href="/new">
          Run a trial
        </Link>
      </div>
    );
  if (!report)
    return (
      <div className="report-loading">
        <span className="spinner" />
        <p>Opening sealed evidence…</p>
      </div>
    );
  const passed = report.assertions.filter((a) => a.passed).length;
  const failed = report.assertions.length - passed;
  const untestedClaims = new Set(report.score.untestedClaims);
  const verdictHeadline =
    report.score.badge === "not-verified"
      ? "Capability claims remain unverified."
      : report.score.overall >= 75
        ? "Tested claims held up under pressure."
        : "Material tested claims failed under pressure.";
  function revealEvidence(id: string) {
    setTab("evidence");
    window.setTimeout(() => document.getElementById(`evidence-${id}`)?.scrollIntoView(), 0);
  }
  return (
    <>
      <div className="report-header">
        <div>
          <span className="kicker">EVIDENCE REPORT / {report.score.methodologyVersion}</span>
          <h1>{report.target.name}</h1>
          <p>
            {report.target.controlled ? "Controlled benchmark fixture" : "Passive public surface"}
            {" · evaluated "}
            {new Date(report.completedAt).toLocaleString()}
          </p>
        </div>
        <div className="report-actions">
          <a className="button secondary" href={`/api/runs/${runId}/bundle`} download>
            Download bundle ↓
          </a>
          <Link className="button" href={`/verify?run=${runId}`}>
            Verify receipt →
          </Link>
        </div>
      </div>
      <section className="verdict-card">
        <div
          className="score-orbit"
          style={{ "--score": `${report.score.overall * 3.6}deg` } as React.CSSProperties}
        >
          <div>
            <strong>{report.score.overall}</strong>
            <span>/100</span>
          </div>
        </div>
        <div className="verdict-copy">
          <span className={`badge ${report.score.overall >= 75 ? "good" : "bad"}`}>
            {report.score.badge.replace("-", " ")}
          </span>
          <h2>{verdictHeadline}</h2>
          <p>
            {failed === 0
              ? "Every deterministic assertion passed."
              : `${failed} of ${report.assertions.length} deterministic assertions failed.`}{" "}
            Coverage is {report.score.coverage}% with {report.score.confidence} confidence.
          </p>
          <div className="summary-stats">
            <span>
              <strong>{report.claims.length}</strong> claims
            </span>
            <span>
              <strong>{report.plan.trials.length}</strong> trials
            </span>
            <span>
              <strong>{passed}</strong> passed
            </span>
            <span className={failed ? "red" : ""}>
              <strong>{failed}</strong> failed
            </span>
          </div>
        </div>
        <div className="receipt-mini">
          <span className="kicker">RECEIPT</span>
          <p>
            <i className="seal">✓</i> Signature sealed
          </p>
          <code>{report.planHash.slice(0, 18)}…</code>
          <small>Plan sealed before execution</small>
          {attestation?.status === "anchored" && attestation.explorerUrl ? (
            <a href={attestation.explorerUrl} target="_blank" rel="noreferrer">
              View Base Sepolia attestation ↗
            </a>
          ) : (
            <small>
              {attestation?.status === "failed"
                ? `Attestation failed: ${attestation.message}`
                : "Signed local receipt · onchain anchor optional"}
            </small>
          )}
        </div>
      </section>
      <section className="dimension-grid">
        {Object.entries(report.score.dimensions).map(([key, value]) => (
          <div key={key}>
            <span>{labels[key]}</span>
            <strong>
              {value}
              <small>/{max[key]}</small>
            </strong>
            <div className="bar">
              <i style={{ width: `${(value / max[key]!) * 100}%` }} />
            </div>
          </div>
        ))}
      </section>
      <div className="report-tabs" role="tablist">
        <button role="tab" aria-selected={tab === "findings"} onClick={() => setTab("findings")}>
          Findings
        </button>
        <button role="tab" aria-selected={tab === "claims"} onClick={() => setTab("claims")}>
          Claims & coverage
        </button>
        <button role="tab" aria-selected={tab === "evidence"} onClick={() => setTab("evidence")}>
          Evidence objects
        </button>
      </div>
      {tab === "findings" && (
        <section className="findings">
          <div className="table-head">
            <span>Assertion</span>
            <span>Dimension</span>
            <span>Verdict</span>
            <span>Evidence</span>
          </div>
          {report.assertions.map((a) => (
            <article key={a.id}>
              <div>
                <strong>{a.description}</strong>
                <small>
                  {a.trialId} · expected {String(a.expected)}
                </small>
              </div>
              <span>{labels[a.dimension]}</span>
              <span className={a.passed ? "pass" : "fail"}>{a.passed ? "PASS" : "FAIL"}</span>
              <span className="evidence-links">
                {a.evidenceIds.map((id) => (
                  <button type="button" key={id} onClick={() => revealEvidence(id)}>
                    {id}
                  </button>
                ))}
              </span>
            </article>
          ))}
        </section>
      )}
      {tab === "claims" && (
        <section className="claim-cards">
          {report.claims.map((c) => (
            <article key={c.id}>
              <span className={untestedClaims.has(c.id) ? "untested" : "pass"}>
                {untestedClaims.has(c.id) ? "NOT TESTED" : "TESTED"}
              </span>
              <h3>{c.capability}</h3>
              <p>{c.successCondition}</p>
              <dl>
                <div>
                  <dt>Discovery</dt>
                  <dd>{c.discoveryLocation}</dd>
                </div>
                <div>
                  <dt>Confidence</dt>
                  <dd>{Math.round(c.confidence * 100)}%</dd>
                </div>
                <div>
                  <dt>Permission</dt>
                  <dd>{c.requiredPermissions.join(", ") || "None"}</dd>
                </div>
              </dl>
            </article>
          ))}
        </section>
      )}
      {tab === "evidence" && (
        <section className="evidence-list">
          {report.evidence.map((e) => (
            <details key={e.id} id={`evidence-${e.id}`}>
              <summary>
                <span>
                  <strong>{e.id}</strong>
                  <small>
                    {e.kind} · {e.trialId}
                  </small>
                </span>
                <code>{new Date(e.capturedAt).toLocaleTimeString()}</code>
              </summary>
              <pre>{JSON.stringify(e.data, null, 2)}</pre>
            </details>
          ))}
        </section>
      )}
      <div className="report-disclaimer">
        <strong>What this verdict means</strong>
        <p>
          This report records bounded behavior observed during one seeded evaluation. It is not
          legal certification, an audit opinion, or a guarantee of future safety. Untested behavior
          is never assumed to pass.
        </p>
      </div>
    </>
  );
}
