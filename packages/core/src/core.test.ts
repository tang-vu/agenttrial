import { describe, expect, it } from "vitest";
import { TrialStateMachine } from "./state-machine";
import { calculateScore, DIMENSION_POINTS } from "./scoring";
import type { AssertionResult, Claim } from "./types";
const claim = (id: string): Claim => ({
  id,
  capability: id,
  advertisedInput: "input",
  advertisedOutput: "output",
  dependencies: [],
  requiredPermissions: [],
  successCondition: "works",
  evidenceSource: "fixture",
  confidence: 1,
  discoveryLocation: "card",
});
const assertions = (passed: boolean): AssertionResult[] =>
  Object.keys(DIMENSION_POINTS).map((dimension, i) => ({
    id: `a${i}`,
    trialId: "t",
    dimension: dimension as AssertionResult["dimension"],
    weight: 1,
    passed,
    description: "assertion",
    actual: passed,
    expected: true,
    evidenceIds: ["e"],
  }));
describe("trial state machine", () => {
  it("accepts the complete legal path", () => {
    const m = new TrialStateMachine();
    for (const state of [
      "DISCOVERING",
      "CLAIMS_EXTRACTED",
      "PLANNING",
      "PLAN_SEALED",
      "EXECUTING",
      "VERIFYING",
      "SCORING",
      "RECEIPT_SIGNED",
      "ATTESTING",
      "COMPLETED",
    ] as const)
      expect(m.transition(state)).toBe(state);
  });
  it("rejects illegal transitions and keeps terminal states terminal", () => {
    const m = new TrialStateMachine();
    expect(() => m.transition("EXECUTING")).toThrow(/Illegal/);
    m.transition("CANCELLED");
    expect(() => m.transition("DISCOVERING")).toThrow();
  });
});
describe("deterministic scoring", () => {
  it("is bounded entirely by assertion outcomes", () => {
    expect(calculateScore(assertions(true), [claim("c")], new Set(["c"])).overall).toBe(100);
    expect(calculateScore(assertions(false), [claim("c")], new Set(["c"])).overall).toBe(0);
  });
  it("marks low coverage as not verified", () => {
    const result = calculateScore(
      assertions(true),
      [claim("a"), claim("b"), claim("c")],
      new Set(["a"]),
    );
    expect(result.coverage).toBe(33.3);
    expect(result.badge).toBe("not-verified");
    expect(result.untestedClaims).toEqual(["b", "c"]);
  });
  it("ignores unknown claim IDs when calculating coverage", () => {
    expect(calculateScore(assertions(true), [claim("a")], new Set(["a", "forged"])).coverage).toBe(
      100,
    );
  });
});
