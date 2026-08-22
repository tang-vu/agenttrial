import Link from "next/link";

const steps = [
  { n: "01", title: "Discover", text: "Extract typed claims from the agent’s public surface." },
  {
    n: "02",
    title: "Challenge",
    text: "Seal hidden functional and adversarial trials before execution.",
  },
  {
    n: "03",
    title: "Prove",
    text: "Verify assertions and sign a tamper-evident evidence receipt.",
  },
];
export default function Home() {
  return (
    <main id="main">
      <section className="hero">
        <div className="eyebrow">
          <span className="pulse" />
          Autonomous adversarial evaluation
        </div>
        <h1>
          Every agent claim
          <br />
          deserves <em>evidence.</em>
        </h1>
        <p className="lede">
          AI agents make claims. AgentTrial makes them prove it — with sealed trials, deterministic
          assertions, and receipts anyone can verify.
        </p>
        <div className="hero-actions">
          <Link className="button" href="/new">
            Run a live trial <span>↗</span>
          </Link>
          <Link className="text-link" href="/verify">
            Inspect a receipt <span>→</span>
          </Link>
          <a className="text-link" href="/demo/agenttrial-live-demo-narrated.mp4">
            Watch 116s demo <span>▶</span>
          </a>
        </div>
        <div className="trust-strip">
          <span>No account</span>
          <span>No API key</span>
          <span>Runs locally verifiable</span>
          <span>Base Sepolia ready</span>
        </div>
      </section>
      <section className="proof-panel" aria-label="How AgentTrial works">
        <div className="proof-head">
          <div>
            <span className="kicker">ANATOMY OF A VERDICT</span>
            <h2>Claims in. Evidence out.</h2>
          </div>
          <p>The model can plan. Only code can score.</p>
        </div>
        <div className="steps">
          {steps.map((s) => (
            <article key={s.n}>
              <span className="step-number">{s.n}</span>
              <div className="step-icon">{s.n === "01" ? "⌁" : s.n === "02" ? "◇" : "✓"}</div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="split-section">
        <div>
          <span className="kicker">BUILT FOR SCRUTINY</span>
          <h2>A report, not a reputation score.</h2>
        </div>
        <div className="principles">
          <p>
            <strong>Every finding traces to an observation.</strong> Inspect inputs, outputs,
            retries, timing, and the exact assertion that produced a verdict.
          </p>
          <p>
            <strong>Failure is typed, not hidden.</strong> Request failures, capability failures,
            and untested claims remain visibly distinct.
          </p>
          <p>
            <strong>Verification stays independent.</strong> Download the canonical bundle and
            validate its hash chain and signature in your browser.
          </p>
        </div>
      </section>
      <section className="cta-band">
        <span className="kicker">CONTROLLED LIVE BENCHMARK</span>
        <h2>See two agents face the same evidence.</h2>
        <p>
          One resists manipulation. One takes the bait. Both trials execute live with new run IDs.
        </p>
        <Link className="button ivory" href="/benchmark">
          Run both agents live <span>→</span>
        </Link>
      </section>
    </main>
  );
}
