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
  const [active, setActive] = useState({
    cardUrl: "",
    interfaceUrl: "",
    skillId: "",
    proofUrl: "",
    testMessage: "",
    expectedSubstring: "",
  });
  const [challenge, setChallenge] = useState<{
    id: string;
    verificationToken: string;
    document: Record<string, unknown>;
    proofUrl: string;
  }>();
  const [authorizationVerified, setAuthorizationVerified] = useState(false);
  const [activeLoading, setActiveLoading] = useState(false);
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
  async function createChallenge() {
    setActiveLoading(true);
    setError("");
    try {
      const res = await fetch("/api/authorizations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(active),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setChallenge(data);
      setAuthorizationVerified(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create authorization challenge");
    } finally {
      setActiveLoading(false);
    }
  }
  async function verifyChallenge() {
    if (!challenge) return;
    setActiveLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/authorizations/${challenge.id}/verify`, {
        method: "POST",
        headers: { "x-agenttrial-verification-token": challenge.verificationToken },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAuthorizationVerified(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not verify domain control");
    } finally {
      setActiveLoading(false);
    }
  }
  async function startAuthorized() {
    if (!challenge) return;
    setActiveLoading(true);
    setError("");
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-agenttrial-verification-token": challenge.verificationToken,
        },
        body: JSON.stringify({
          mode: "active",
          authorizationId: challenge.id,
          activeConsent: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      sessionStorage.setItem(`agenttrial:cancel:${data.runId}`, data.cancelToken);
      router.push(`/live/${data.runId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start authorized evaluation");
      setActiveLoading(false);
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
      <section className="external-card">
        <div className="section-label">
          <span>03</span>
          <div>
            <strong>Authorized A2A agent</strong>
            <small>Active HTTP+JSON 1.0 evaluation</small>
          </div>
        </div>
        <div className="notice">
          <strong>HTTPS domain-control authorization</strong>
          <p>
            Publish one short-lived challenge on the target origin. This proves control of the HTTPS
            domain for the exact card, interface, skill, message, and two-call budget—not legal
            ownership or safety.
          </p>
        </div>
        {(
          [
            ["cardUrl", "Agent Card URL", "https://agent.example/.well-known/agent-card.json"],
            ["interfaceUrl", "A2A interface URL", "https://agent.example/a2a/"],
            ["skillId", "Advertised skill ID", "research"],
            [
              "proofUrl",
              "Proof document URL",
              "https://agent.example/.well-known/agenttrial-proof.json",
            ],
            ["testMessage", "Bounded test message", "Return the marker EVIDENCE-OK."],
            ["expectedSubstring", "Expected response marker", "EVIDENCE-OK"],
          ] as const
        ).map(([key, label, placeholder]) => (
          <label key={key}>
            {label}
            <input
              type={key.endsWith("Url") ? "url" : "text"}
              value={active[key]}
              onChange={(event) =>
                setActive((current) => ({ ...current, [key]: event.target.value }))
              }
              placeholder={placeholder}
              disabled={Boolean(challenge)}
            />
          </label>
        ))}
        {!challenge ? (
          <button
            className="button secondary full"
            onClick={createChallenge}
            disabled={activeLoading || Object.values(active).some((value) => !value)}
          >
            {activeLoading ? "Inspecting Agent Card…" : "Create authorization challenge →"}
          </button>
        ) : (
          <div className="evidence-card">
            <strong>Publish this exact JSON at {challenge.proofUrl}</strong>
            <pre>{JSON.stringify(challenge.document, null, 2)}</pre>
            <small>
              The private verification token stays only in this browser session and is never
              included in the public proof or evidence bundle.
            </small>
            {!authorizationVerified ? (
              <button
                className="button secondary full"
                onClick={verifyChallenge}
                disabled={activeLoading}
              >
                {activeLoading ? "Verifying proof…" : "Verify published proof →"}
              </button>
            ) : (
              <button className="button full" onClick={startAuthorized} disabled={activeLoading}>
                {activeLoading ? "Sealing active trial…" : "Run authorized A2A trial →"}
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
