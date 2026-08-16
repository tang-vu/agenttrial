import type { Metadata } from "next";
export const metadata: Metadata = { title: "Security & responsible use" };
export default function Security() {
  return (
    <main id="main" className="article-shell">
      <header>
        <span className="kicker">SECURITY & RESPONSIBLE USE</span>
        <h1>
          Pressure testing
          <br />
          with hard boundaries.
        </h1>
        <p>
          AgentTrial is a defensive evaluator. Arbitrary public targets are passive-only; active
          adversarial tests require controlled fixtures or explicit ownership authorization.
        </p>
      </header>
      <section className="two-col">
        <div>
          <h2>What we test</h2>
          <ul>
            <li>Advertised behavior and structured outputs</li>
            <li>Grounding, provenance, and conflicting evidence</li>
            <li>Prompt injection and permission boundaries</li>
            <li>Timeout recovery, consistency, and budgets</li>
          </ul>
        </div>
        <div>
          <h2>What we never test</h2>
          <ul>
            <li>Destructive or exploitative payloads</li>
            <li>Credential access or persistence</li>
            <li>Denial-of-service behavior</li>
            <li>Fund transfers or unauthorised mutations</li>
          </ul>
        </div>
      </section>
      <section>
        <h2>Control surface</h2>
        <div className="definition-list">
          <div>
            <strong>Network</strong>
            <p>
              HTTP/S allowlist, all-answer DNS checks, private/reserved/metadata range blocking,
              manual redirect revalidation, bounded bodies and deadlines.
            </p>
          </div>
          <div>
            <strong>Content</strong>
            <p>
              Target text stays untrusted data. It cannot change system policy, grant authorization,
              raise budgets, or choose unrestricted tools.
            </p>
          </div>
          <div>
            <strong>Evidence</strong>
            <p>
              Redaction happens before persistence and hashing. Private signing and wallet keys
              remain server-side and outside browser workers.
            </p>
          </div>
        </div>
      </section>
      <section>
        <h2>Threat model</h2>
        <p>
          We explicitly model target prompt injection, SSRF and DNS rebinding, browser escape,
          secrets exposure, malicious repositories, forged or replayed receipts, cost amplification,
          scoring manipulation, and target-owner impersonation.
        </p>
        <aside>
          A browser sandbox reduces risk but cannot prove containment against an unknown browser
          zero-day. Production browser workers require independent network and container isolation.
        </aside>
      </section>
      <section>
        <h2>Report abuse</h2>
        <p>
          For security reports, include the affected surface, a safe reproduction, and impact. Do
          not include live secrets or test third-party targets without permission. Use the project’s{" "}
          <a href="https://github.com/tang-vu/agenttrial/security/advisories/new">
            private GitHub security advisory form
          </a>
          .
        </p>
      </section>
      <section>
        <h2>Data handling</h2>
        <p>
          Public targets cannot include credentials, query parameters, or fragments. Bounded
          response evidence is redacted before persistence and hashing. This single-node service
          retains durable run snapshots for 30 days by default; operators of PostgreSQL deployments
          must configure an equivalent retention and backup policy.
        </p>
      </section>
    </main>
  );
}
