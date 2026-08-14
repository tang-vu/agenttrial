"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const options = [
  {
    id: "evidence-researcher",
    name: "Evidence Researcher",
    verdict: "Secure benchmark",
    description:
      "Cites sources, resists injected instructions, reconciles conflicts, and recovers within budget.",
    traits: ["Grounded", "Bounded retry", "Injection resistant"],
  },
  {
    id: "gullible-researcher",
    name: "Gullible Researcher",
    verdict: "Vulnerable benchmark",
    description:
      "Intentionally trusts stale evidence, follows injected instructions, and overstates confidence.",
    traits: ["Controlled fixture", "Known failures", "Safe to test"],
  },
];
export function NewTrialForm() {
  const router = useRouter();
  const [selected, setSelected] = useState(options[0]!.id);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function start() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fixture: selected, activeConsent: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/live/${data.runId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the trial");
      setLoading(false);
    }
  }
  return (
    <div className="new-grid">
      <section>
        <div className="section-label">
          <span>01</span>
          <div>
            <strong>Controlled benchmark</strong>
            <small>Recommended — no credentials required</small>
          </div>
        </div>
        <div className="fixture-list" role="radiogroup" aria-label="Benchmark agent">
          {options.map((o) => (
            <button
              type="button"
              role="radio"
              aria-checked={selected === o.id}
              onClick={() => setSelected(o.id)}
              className={`fixture-card ${selected === o.id ? "selected" : ""}`}
              key={o.id}
            >
              <span className="radio" />
              <span className="fixture-main">
                <span className="fixture-top">
                  <strong>{o.name}</strong>
                  <small>{o.verdict}</small>
                </span>
                <span className="fixture-description">{o.description}</span>
                <span className="trait-row">
                  {o.traits.map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </span>
              </span>
            </button>
          ))}
        </div>
        <label className="consent">
          <input type="checkbox" checked readOnly />
          <span>
            <strong>Authorized controlled evaluation</strong>
            <small>
              These fixtures belong to AgentTrial and are safe for active adversarial tests.
            </small>
          </span>
        </label>
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
        <button className="button full" onClick={start} disabled={loading}>
          {loading ? "Creating sealed workspace…" : "Run live trial →"}
        </button>
      </section>
      <section className="external-card">
        <div className="section-label">
          <span>02</span>
          <div>
            <strong>Your public agent</strong>
            <small>Passive discovery mode</small>
          </div>
        </div>
        <label>
          Public URL, repository, API, or Agent Card
          <input placeholder="https://example.com/.well-known/agent-card.json" disabled />
        </label>
        <div className="notice">
          <strong>External worker not configured</strong>
          <p>
            This deployment only executes controlled fixtures. Public-target submission stays
            disabled until an isolated egress-restricted worker is attached—never a fake scan.
          </p>
        </div>
        <button className="button secondary full" disabled>
          Configure worker to continue
        </button>
      </section>
    </div>
  );
}
