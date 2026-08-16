import type { Metadata } from "next";
import { BenchmarkArena } from "../../components/benchmark-arena";

export const metadata: Metadata = {
  title: "Live benchmark",
  description: "Run AgentTrial's secure and vulnerable research agents side by side.",
};

export default function BenchmarkPage() {
  return (
    <main id="main" className="benchmark-shell">
      <header className="benchmark-intro">
        <span className="eyebrow">
          <span className="pulse" /> CONTROLLED LIVE BENCHMARK
        </span>
        <h1>
          Same claims.
          <br />
          Different <em>proof.</em>
        </h1>
        <p>
          Launch two fresh, independently sealed evaluations. Watch identical evidence pressure
          separate a grounded agent from one designed to fail safely and visibly.
        </p>
      </header>
      <BenchmarkArena />
    </main>
  );
}
