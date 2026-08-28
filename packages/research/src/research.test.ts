import { describe, expect, it } from "vitest";
import {
  CONTROLLED_AGENTS,
  CONTROL_MATRIX,
  FAULT_FAMILIES,
  SCENARIO_MATRIX,
  evaluateBaseline,
  researchDesignHash,
} from "./index";
import {
  exactMcNemar,
  hierarchicalBootstrap,
  holmAdjust,
  pairedFalseAcceptance,
  wilson,
} from "./analysis";
import { executeControlledAgent, FIXTURE_SCOPE } from "./controlled-agents";
import {
  TAMPER_MUTATIONS,
  createPortableEvidenceBundle,
  runTamperSuite,
  verifyPortableEvidenceBundle,
} from "./tamper";

describe("P26-002 frozen research design", () => {
  it("contains at least 60 unique configurations across all locked families", () => {
    expect(SCENARIO_MATRIX).toHaveLength(64);
    expect(new Set(SCENARIO_MATRIX.map((item) => item.id)).size).toBe(64);
    expect(new Set(SCENARIO_MATRIX.map((item) => item.family))).toEqual(new Set(FAULT_FAMILIES));
    expect(SCENARIO_MATRIX.every((item) => item.repetitions >= 20)).toBe(true);
  });

  it("defines every controlled agent required by the protocol", () => {
    expect(CONTROLLED_AGENTS.map((agent) => agent.id)).toEqual([
      "grounded-reference",
      "gullible-agent",
      "over-privileged-agent",
      "evidence-omitting-agent",
      "timeout-prone-agent",
      "non-repeatable-agent",
    ]);
  });

  it("pairs every fault configuration with a positive control", () => {
    expect(CONTROL_MATRIX).toHaveLength(SCENARIO_MATRIX.length);
    expect(new Set(CONTROL_MATRIX.map((item) => item.id)).size).toBe(64);
    expect(CONTROL_MATRIX.every((item) => item.groundTruth === "accept")).toBe(true);
    expect(CONTROL_MATRIX.map((item) => item.pairedFaultConfigurationId)).toEqual(
      SCENARIO_MATRIX.map((item) => item.id),
    );
  });

  it("executes all six deterministic controlled-agent profiles", () => {
    const executions = [...SCENARIO_MATRIX, CONTROL_MATRIX[0]!].map((configuration) =>
      executeControlledAgent(configuration, 0),
    );
    expect(new Set(executions.map((item) => item.agentId))).toEqual(
      new Set(CONTROLLED_AGENTS.map((item) => item.id)),
    );
    expect(executions.every((item) => item.fixtureScope === FIXTURE_SCOPE)).toBe(true);
    for (const execution of executions) {
      const verdict = evaluateBaseline("agenttrial", execution.artifact).verdict;
      expect(verdict).toBe(execution.groundTruth);
    }
  });

  it("keeps final-output and trace baselines vulnerable to plausible bad artifacts", () => {
    const artifact = {
      finalStatus: "success" as const,
      outputText: "Completed successfully with a confident answer.",
      events: [{ index: 0, type: "completed" }],
      assertionResults: [{ severity: "critical" as const, passed: false }],
      claimCoverage: 0.5,
      independentVerificationValid: false,
    };
    expect(evaluateBaseline("final-output-only", artifact).verdict).toBe("accept");
    expect(evaluateBaseline("trace-presence", artifact).verdict).toBe("accept");
    expect(evaluateBaseline("agenttrial", artifact).verdict).toBe("reject");
    expect(evaluateBaseline("llm-judge", artifact).verdict).toBe("not-evaluated");
  });

  it("produces a stable design hash", () => {
    expect(researchDesignHash()).toMatch(/^[0-9a-f]{64}$/);
    expect(researchDesignHash()).toBe(researchDesignHash());
  });
});

describe("portable evidence tamper suite", () => {
  it("accepts an intact signed bundle", () => {
    expect(verifyPortableEvidenceBundle(createPortableEvidenceBundle())).toEqual({
      valid: true,
      firstMismatch: null,
    });
  });

  it("detects and localizes all nine preregistered mutations", () => {
    expect(TAMPER_MUTATIONS).toHaveLength(9);
    const result = runTamperSuite();
    expect(result.validBundleAccepted).toBe(true);
    expect(result.detectedCount).toBe(9);
    expect(result.localizedCount).toBe(9);
    expect(result.mutations.every((item) => item.detected && item.localized)).toBe(true);
  });
});

describe("registered analysis functions", () => {
  const records = Array.from({ length: 20 }, (_, repeat) => ({
    configurationId: repeat < 10 ? "a" : "b",
    repeat,
    baselineFalseAccept: repeat < 12,
    agenttrialFalseAccept: repeat < 2,
  }));

  it("computes Wilson intervals and paired effects", () => {
    expect(wilson(5, 10).estimate).toBe(0.5);
    const result = pairedFalseAcceptance(records);
    expect(result.absoluteDifference).toBe(0.5);
    expect(result.discordantBaselineOnly).toBe(10);
    expect(result.discordantAgentTrialOnly).toBe(0);
    expect(result.pValue).toBeLessThan(0.01);
  });

  it("implements exact paired testing, Holm correction, and hierarchical bootstrap", () => {
    expect(exactMcNemar(0, 0)).toBe(1);
    expect(holmAdjust([0.01, 0.04, 0.03])).toEqual([0.03, 0.06, 0.06]);
    const interval = hierarchicalBootstrap(records, 200, 7);
    expect(interval.lower).toBeLessThanOrEqual(interval.estimate);
    expect(interval.upper).toBeGreaterThanOrEqual(interval.estimate);
  });
});
