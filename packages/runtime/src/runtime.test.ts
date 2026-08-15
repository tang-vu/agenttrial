import { describe, expect, it } from "vitest";
import { createServer } from "node:http";
import {
  cancelRun,
  cancelRunAuthorized,
  createExternalRun,
  createFixtureRun,
  runs,
  takeCancellationCapability,
} from "./index";
async function complete(id: string) {
  for (let i = 0; i < 100; i++) {
    const run = runs.get(id)!;
    if (["COMPLETED", "FAILED", "CANCELLED"].includes(run.state)) return run;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error("run timeout");
}
describe("pipeline integration", () => {
  it("executes fresh runs instead of replaying reports", async () => {
    const [a, b] = await Promise.all([
      complete(createFixtureRun("evidence-researcher").id),
      complete(createFixtureRun("evidence-researcher").id),
    ]);
    expect(a.id).not.toBe(b.id);
    expect(a.bundle?.receipt.payload.seedCommitment).not.toBe(
      b.bundle?.receipt.payload.seedCommitment,
    );
    expect(a.report?.score.overall).toBe(100);
  });
  it("produces a materially lower vulnerable verdict", async () => {
    const secure = await complete(createFixtureRun("evidence-researcher").id);
    const gullible = await complete(createFixtureRun("gullible-researcher").id);
    expect(secure.report!.score.overall).toBeGreaterThan(gullible.report!.score.overall + 30);
    expect(gullible.report!.score.criticalFindings.length).toBeGreaterThan(0);
  });
  it("terminates an in-flight run as cancelled with typed evidence", async () => {
    const run = createFixtureRun("evidence-researcher");
    expect(cancelRun(run.id)).toBe(true);
    const result = await complete(run.id);
    expect(result.state).toBe("CANCELLED");
    expect(result.events.at(-1)?.type).toBe("run.cancelled");
  });
  it("requires the private cancellation capability", async () => {
    const run = createFixtureRun("evidence-researcher");
    const token = takeCancellationCapability(run.id)!;
    expect(await cancelRunAuthorized(run.id, "wrong-token")).toBe(false);
    expect(await cancelRunAuthorized(run.id, token)).toBe(true);
  });
  it("executes bounded passive discovery without marking advertised behavior as tested", async () => {
    process.env.AGENTTRIAL_ALLOW_PRIVATE_TEST_TARGETS = "true";
    const server = createServer((_request, response) => {
      response.setHeader("content-type", "text/html");
      response.end(
        "<title>Test Agent</title><p>This agent can summarize public records with citations.</p>",
      );
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      const result = await complete(createExternalRun(`http://127.0.0.1:${port}`).id);
      expect(result.state).toBe("COMPLETED");
      expect(result.report?.target.controlled).toBe(false);
      expect(result.report?.score.coverage).toBeLessThan(100);
      expect(result.report?.score.untestedClaims.length).toBeGreaterThan(0);
      expect(result.events.some((event) => event.type === "tool.call")).toBe(true);
    } finally {
      delete process.env.AGENTTRIAL_ALLOW_PRIVATE_TEST_TARGETS;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
