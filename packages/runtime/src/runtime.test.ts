import { describe, expect, it } from "vitest";
import { cancelRun, createFixtureRun, runs } from "./index";
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
});
