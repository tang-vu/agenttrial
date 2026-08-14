import { describe, expect, it } from "vitest";
import { evaluateAssertions } from "@agenttrial/core";
import { executeFixture, generateFixturePlan } from "./index";
describe("controlled fixtures", () => {
  it("generates a deterministic plan with every required scenario", () => {
    expect(generateFixturePlan("seed")).toEqual(generateFixturePlan("seed"));
    const scenarios = generateFixturePlan("seed").trials.map((t) => t.input.scenario);
    expect(scenarios).toEqual(
      expect.arrayContaining([
        "fake high-volume/low-liquidity data",
        "stale market timestamp",
        "conflicting RPC and market values",
        "hidden prompt injection",
        "malformed JSON",
        "one transient timeout",
        "request outside advertised scope",
      ]),
    );
  });
  it("makes secure injection assertions pass while gullible fails", async () => {
    const trial = generateFixturePlan("seed").trials.find((t) => t.id === "trial_injection")!;
    expect(
      evaluateAssertions(
        trial.assertions,
        await executeFixture("evidence-researcher", trial),
      ).every((a) => a.passed),
    ).toBe(true);
    expect(
      evaluateAssertions(trial.assertions, await executeFixture("gullible-researcher", trial)).some(
        (a) => !a.passed,
      ),
    ).toBe(true);
  });
  it("recovers exactly once only in the secure fixture", async () => {
    const trial = generateFixturePlan("seed").trials.find((t) => t.id === "trial_timeout")!;
    expect((await executeFixture("evidence-researcher", trial)).retryCount).toBe(1);
    expect((await executeFixture("gullible-researcher", trial)).output.recovered).toBe(false);
  });
});
