import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CONTROLLED_AGENTS,
  CONTROL_MATRIX,
  FAULT_FAMILIES,
  LLM_JUDGE_FREEZE,
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
import {
  JUDGE_CALIBRATION_CASES,
  JUDGE_GRAMMAR,
  LOCAL_JUDGE_CANDIDATE,
  parseJudgeOutput,
  renderJudgeCase,
} from "./local-judge";
import { POWER_ANALYSIS_PLAN, runPowerAnalysis } from "./power";

describe("P26-002 frozen research design", () => {
  it("contains at least 60 unique configurations across all locked families", () => {
    expect(SCENARIO_MATRIX).toHaveLength(80);
    expect(new Set(SCENARIO_MATRIX.map((item) => item.id)).size).toBe(80);
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
    expect(new Set(CONTROL_MATRIX.map((item) => item.id)).size).toBe(80);
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

describe("superseded power sensitivity analysis", () => {
  it("retains the invalidated 80-by-20 candidate without treating it as eligible", () => {
    expect(POWER_ANALYSIS_PLAN.status).toBe("superseded-redesign-required");
    expect(POWER_ANALYSIS_PLAN.candidateDesign).toMatchObject({
      nominalFaultSlots: 80,
      matchedControlSlots: 80,
      requiredExecutionsPerSlot: 20,
      totalSharedExecutionArtifacts: 3200,
    });
  });

  it("preserves the historical threshold result but blocks design selection", () => {
    const result = runPowerAnalysis({ candidateDesignOnly: true });
    expect(result.status).toBe("superseded-redesign-required");
    expect(result.candidateSensitivity.sensitivityThresholdPassed).toBe(true);
    expect(result.candidateSensitivity.designEligible).toBe(false);
    expect(result.candidateSensitivity.candidateSuperiority).toHaveLength(3);
    expect(
      result.candidateSensitivity.candidateSuperiority.every(
        (item) => item.power.lower >= POWER_ANALYSIS_PLAN.minimumPower,
      ),
    ).toBe(true);
  }, 15_000);
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

describe("local LLM judge candidate", () => {
  const passingCalibration = JSON.parse(
    readFileSync(new URL("../../../research/llm-judge/calibration-summary.json", import.meta.url), {
      encoding: "utf8",
    }),
  ) as {
    attempt: number;
    outcomes: { parseRate: number; accuracy: number; verdictRepeatability: number };
    status: string;
  };
  const failedCalibration = JSON.parse(
    readFileSync(
      new URL("../../../research/llm-judge/calibration-attempt-0-summary.json", import.meta.url),
      { encoding: "utf8" },
    ),
  ) as { outcomes: { parseRate: number }; status: string };

  it("has a balanced, disjoint 24-case calibration set", () => {
    expect(JUDGE_CALIBRATION_CASES).toHaveLength(24);
    expect(new Set(JUDGE_CALIBRATION_CASES.map((item) => item.id)).size).toBe(24);
    expect(JUDGE_CALIBRATION_CASES.filter((item) => item.groundTruth === "reject")).toHaveLength(
      16,
    );
    expect(JUDGE_CALIBRATION_CASES.filter((item) => item.groundTruth === "accept")).toHaveLength(8);
    const familyCounts = new Map<string, number>();
    for (const item of JUDGE_CALIBRATION_CASES)
      familyCounts.set(item.family, (familyCounts.get(item.family) ?? 0) + 1);
    expect([...familyCounts.values()].every((count) => count === 3)).toBe(true);
    expect(
      JUDGE_CALIBRATION_CASES.every((item) => !renderJudgeCase(item).includes("groundTruth")),
    ).toBe(true);
  });

  it("pins a credential-free model and strict output parser", () => {
    expect(LOCAL_JUDGE_CANDIDATE.license).toBe("Apache-2.0");
    expect(LOCAL_JUDGE_CANDIDATE.modelSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(JUDGE_GRAMMAR).toContain('\\"accept\\"');
    expect(parseJudgeOutput('{"verdict":"reject","rationale":"critical scope failure"}')).toEqual({
      verdict: "reject",
      rationale: "critical scope failure",
    });
    expect(() => parseJudgeOutput('{"verdict":"fail","rationale":"x"}')).toThrow();
    expect(() => parseJudgeOutput('{"verdict":"accept","rationale":"x","extra":1}')).toThrow();
  });

  it("freezes the calibrated judge in the research design", () => {
    expect(LLM_JUDGE_FREEZE.status).toBe("frozen-credential-free");
    expect(LLM_JUDGE_FREEZE.modelSha256).toBe(LOCAL_JUDGE_CANDIDATE.modelSha256);
    expect(LLM_JUDGE_FREEZE.excludedInputs).toContain("ground-truth label");
    expect(LLM_JUDGE_FREEZE.calibration.status).toBe("pass");
  });

  it("retains the failed calibration attempt and pins the passing artifact", () => {
    expect(failedCalibration.status).toBe("fail");
    expect(failedCalibration.outcomes.parseRate).toBeLessThan(1);
    expect(passingCalibration).toMatchObject({
      attempt: 1,
      outcomes: { parseRate: 1, accuracy: 1, verdictRepeatability: 1 },
      status: "pass",
    });
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

  it("fails closed on malformed counts, duplicated pairs, and invalid analysis controls", () => {
    expect(() => wilson(2, 1)).toThrow(/cannot exceed total/);
    expect(() => exactMcNemar(-1, 2)).toThrow(/non-negative integer/);
    expect(() => holmAdjust([0.01, Number.NaN])).toThrow(/finite values/);
    expect(() => pairedFalseAcceptance([...records, records[0]!])).toThrow(/Duplicate paired/);
    expect(() => hierarchicalBootstrap(records, 0, 7)).toThrow(/positive integer/);
  });
});
