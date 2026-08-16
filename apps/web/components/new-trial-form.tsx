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
  const [externalUrl, setExternalUrl] = useState("");
  const [capabilityDescription, setCapabilityDescription] = useState("");
  const [externalLoading, setExternalLoading] = useState(false);
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
      sessionStorage.setItem(`agenttrial:cancel:${data.runId}`, data.cancelToken);
      router.push(`/live/${data.runId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the trial");
      setLoading(false);
    }
  }
  async function startExternal() {
    setExternalLoading(true);
    setError("");
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetUrl: externalUrl,
          mode: "passive",
          ...(capabilityDescription ? { capabilityDescription } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      sessionStorage.setItem(`agenttrial:cancel:${data.runId}`, data.cancelToken);
      router.push(`/live/${data.runId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start passive discovery");
      setExternalLoading(false);
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
          <input
            type="url"
            value={externalUrl}
            onChange={(event) => setExternalUrl(event.target.value)}
            placeholder="https://example.com/.well-known/agent-card.json"
            required
          />
        </label>
        <label>
          Optional capability description
          <textarea
            value={capabilityDescription}
            onChange={(event) => setCapabilityDescription(event.target.value.slice(0, 2000))}
            placeholder="Describe what the agent claims to do."
            rows={4}
          />
          <small>User-asserted context; passive evaluation will leave the claim untested.</small>
        </label>
        <div className="notice">
          <strong>Passive by default</strong>
          <p>
            Two bounded, DNS-pinned public GETs. No login, forms, exploit payloads, or inferred
            capability passes.
          </p>
        </div>
        <button
          className="button secondary full"
          onClick={startExternal}
          disabled={externalLoading || !externalUrl}
        >
          {externalLoading ? "Starting passive evaluation…" : "Evaluate public surface →"}
        </button>
      </section>
    </div>
  );
}
