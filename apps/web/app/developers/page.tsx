import type { Metadata } from "next";
export const metadata: Metadata = { title: "Developer quickstart" };
export default function Developers() {
  return (
    <main id="main" className="article-shell">
      <header>
        <span className="kicker">DEVELOPER QUICKSTART</span>
        <h1>
          Evidence is an API,
          <br />
          not a screenshot.
        </h1>
        <p>
          Start controlled evaluations, stream state transitions, and retrieve canonical receipt
          bundles.
        </p>
      </header>
      <section>
        <h2>Start a controlled run</h2>
        <pre>
          <code>{`curl -X POST http://localhost:3000/api/runs \\\n  -H "content-type: application/json" \\\n  -d '{"fixture":"evidence-researcher","activeConsent":true}'`}</code>
        </pre>
      </section>
      <section>
        <h2>Read and stream</h2>
        <pre>
          <code>{`curl http://localhost:3000/api/runs/{runId}\n\ncurl -N http://localhost:3000/api/runs/{runId}/events\n\ncurl -o evidence.json \\\n  http://localhost:3000/api/runs/{runId}/bundle`}</code>
        </pre>
      </section>
      <section>
        <h2>Machine-readable surfaces</h2>
        <div className="link-list">
          <a href="/openapi.json">
            OpenAPI 3.1 schema <span>↗</span>
          </a>
          <a href="/.well-known/agenttrial.json">
            Machine descriptor <span>↗</span>
          </a>
          <a href="/api/methodology">
            Methodology manifest + registry hash <span>â†—</span>
          </a>
          <a href="/llms.txt">
            llms.txt <span>↗</span>
          </a>
          <a href="/api/health">
            Health status <span>↗</span>
          </a>
        </div>
      </section>
      <aside>
        The public deployment accepts controlled fixtures by default. External passive adapters
        require the isolated worker service described in the deployment guide.
      </aside>
    </main>
  );
}
