import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SCENARIO_MATRIX } from "./index";
import {
  buildDesignValidityAudit,
  validateRepeatExecutionInventory,
  type DesignProjectionCounts,
  type DesignRepetitionPlan,
  type RepeatExecutionInventory,
  type RepeatExecutionInventoryRecord,
} from "./design-validity";
import type { SourceAvailabilityAudit } from "./target-binding";

function readJson<T>(path: string) {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as T;
}

const sourceAvailability = readJson<SourceAvailabilityAudit>(
  "../../../research/targets/source-availability-audit.json",
);
const repeatExecutionInventory = readJson<RepeatExecutionInventory>(
  "../../../research/targets/repeat-execution-inventory.json",
);
const agentChaosProjectionCount = readJson<{ projections: unknown[] }>(
  "../../../research/targets/agentchaos-projection-audit.json",
).projections.length;
const agentDojoProjectionCount = readJson<{ projections: unknown[] }>(
  "../../../research/targets/agentdojo-projection-audit.json",
).projections.length;

const repetitionPlan: DesignRepetitionPlan = {
  repetitionsPerScenario: 20,
  matchedControlCount: 80,
  totalSharedExecutionArtifacts: 3_200,
};

const projectionCounts: DesignProjectionCounts = {
  fault: {
    observed: agentChaosProjectionCount + agentDojoProjectionCount,
    mainTrialEligible: 0,
    legacy: agentChaosProjectionCount + agentDojoProjectionCount,
    excludedLegacy: agentChaosProjectionCount + agentDojoProjectionCount,
    gateReconstructedLegacy: 0,
  },
  control: {
    observed: 0,
    mainTrialEligible: 0,
    legacy: 0,
    excludedLegacy: 0,
    gateReconstructedLegacy: 0,
  },
};

function buildCurrentAudit() {
  return buildDesignValidityAudit({
    scenarios: SCENARIO_MATRIX,
    sourceAvailability,
    projectionCounts,
    repetitionPlan,
    repeatExecutionInventory,
  });
}

describe("P26-002 design validity audit", () => {
  it("fails closed on all five current design-validity blockers", () => {
    const audit = buildCurrentAudit();

    expect(audit.status).toBe("blocked");
    expect(audit.summary).toEqual({
      scenarios: 80,
      sourceUnits: 80,
      designChecksPassed: 0,
      designChecksBlocked: 5,
    });
    expect(audit.blockers.map((blocker) => blocker.code)).toEqual([
      "non-operational-variants",
      "static-target-repeat-mismatch",
      "reused-matched-control-inputs",
      "ineligible-legacy-projections",
      "unverified-source-execution-derivation",
    ]);
    expect(audit.checks.variantOperationalization).toMatchObject({
      passed: false,
      nominalVariants: 80,
      operationalProfiles: 8,
    });
    expect(
      audit.checks.variantOperationalization.families.every(
        (family) =>
          family.nominalVariants === 10 &&
          family.operationalProfiles === 1 &&
          family.appendedLabelOnly,
      ),
    ).toBe(true);
    expect(audit.checks.executionRepetitionSupport).toMatchObject({
      passed: false,
      targetCount: 80,
      requiredExecutionsPerTarget: 20,
      requiredSharedExecutionArtifacts: 3_200,
      observedUniqueExecutionIdentities: 60,
      crossConditionExecutionIdentities: 10,
      fault: {
        uniqueExecutionIdentities: 60,
        executionBindings: 60,
        fixedUpstreamExecutionIdentities: 60,
        declaredCandidateExecutionIdentities: 0,
        gateVerifiedCandidateExecutionIdentities: 0,
        reusedExecutionBindings: 0,
        targetsMeetingRequiredExecutions: 0,
        fixedUpstreamSingleExecutionTargets: 60,
        otherPartiallyPopulatedTargets: 0,
        targetsWithoutAnyExecution: 20,
      },
      control: {
        uniqueExecutionIdentities: 10,
        executionBindings: 50,
        fixedUpstreamExecutionIdentities: 10,
        declaredCandidateExecutionIdentities: 0,
        gateVerifiedCandidateExecutionIdentities: 0,
        reusedExecutionBindings: 40,
        targetsMeetingRequiredExecutions: 0,
        fixedUpstreamSingleExecutionTargets: 50,
        otherPartiallyPopulatedTargets: 0,
        targetsWithoutAnyExecution: 30,
      },
    });
    expect(audit.checks.matchedControlIndependence).toEqual({
      passed: false,
      requiredBindings: 80,
      lockedBindings: 60,
      uniqueReferences: 20,
      reusedBindings: 40,
    });
    expect(audit.checks.legacyProjectionEligibility).toMatchObject({
      passed: false,
      observed: { fault: 60, control: 0 },
      mainTrialEligible: { fault: 0, control: 0 },
      legacy: { fault: 60, control: 0 },
      excludedLegacy: { fault: 60, control: 0 },
      gateReconstructedLegacy: { fault: 0, control: 0 },
      notGateReconstructedLegacy: { fault: 60, control: 0 },
    });
    expect(audit.checks.sourceExecutionDerivation).toEqual({
      passed: false,
      capabilityStatus: "not-implemented",
      fixedUpstreamVerification: "metadata-only-source-bytes-not-read-by-gate",
      controlledRunVerification: "contract-and-metadata-only-runner-not-reexecuted-or-attested",
      readinessEvidenceAllowed: false,
    });
    expect(audit.designValidityPassed).toBe(false);
    expect(audit.humanApprovalEvaluated).toBe(false);
    expect(audit.mainTrialAllowed).toBe(false);
    expect(audit.submissionAllowed).toBe(false);
  });

  it("rejects an adversarial attempt to downgrade the audited candidate requirement", () => {
    const downgradedScenarios = structuredClone(SCENARIO_MATRIX);
    for (const scenario of downgradedScenarios)
      (scenario as { repetitions: number }).repetitions = 1;

    expect(() =>
      buildDesignValidityAudit({
        scenarios: downgradedScenarios,
        sourceAvailability,
        projectionCounts,
        repetitionPlan: {
          ...repetitionPlan,
          repetitionsPerScenario: 1,
          totalSharedExecutionArtifacts: 160,
        },
        repeatExecutionInventory,
      }),
    ).toThrow(/must retain 20 required executions/);
  });

  it("rejects counts that promote excluded legacy projections to eligible evidence", () => {
    const forgedCounts = structuredClone(projectionCounts);
    forgedCounts.fault.mainTrialEligible = 60;

    expect(() =>
      buildDesignValidityAudit({
        scenarios: SCENARIO_MATRIX,
        sourceAvailability,
        projectionCounts: forgedCounts,
        repetitionPlan,
        repeatExecutionInventory,
      }),
    ).toThrow(/eligibility counts excluded or not gate-reconstructed legacy projections/);
  });

  it("derives current fault and control repeat counts from explicit execution identities", () => {
    const summary = validateRepeatExecutionInventory(
      repeatExecutionInventory,
      sourceAvailability,
      20,
    );

    expect(summary.fault).toMatchObject({
      uniqueExecutionIdentities: 60,
      executionBindings: 60,
      fixedUpstreamSingleExecutionTargets: 60,
      targetsWithoutAnyExecution: 20,
    });
    expect(summary.control).toMatchObject({
      uniqueExecutionIdentities: 10,
      executionBindings: 50,
      reusedExecutionBindings: 40,
      fixedUpstreamSingleExecutionTargets: 50,
      targetsWithoutAnyExecution: 30,
    });
  });

  it("rejects a duplicate physical execution identity even across conditions", () => {
    const invalid = structuredClone(repeatExecutionInventory);
    const repeated = structuredClone(invalid.executions[0]!);
    invalid.executions.push(repeated);

    expect(() => validateRepeatExecutionInventory(invalid, sourceAvailability, 20)).toThrow(
      /duplicate execution identity/,
    );
  });

  it("represents 20 candidate declarations per condition and target without promoting them", () => {
    const complete: RepeatExecutionInventory = {
      ...structuredClone(repeatExecutionInventory),
      executions: [],
    };
    const targetIds = [
      ...sourceAvailability.sources.agentchaosbench.manifest,
      ...sourceAvailability.sources.agentdojo.manifest,
      ...sourceAvailability.sources["bfcl-v4"].ids,
      ...sourceAvailability.sources["tau2-bench"].ids,
    ].map((record) => record.targetId);
    const sourceByTarget = new Map<string, RepeatExecutionInventoryRecord["source"]>([
      ...sourceAvailability.sources.agentchaosbench.manifest.map(
        (record) => [record.targetId, "agentchaosbench"] as const,
      ),
      ...sourceAvailability.sources.agentdojo.manifest.map(
        (record) => [record.targetId, "agentdojo"] as const,
      ),
      ...sourceAvailability.sources["bfcl-v4"].ids.map(
        (record) => [record.targetId, "bfcl-v4"] as const,
      ),
      ...sourceAvailability.sources["tau2-bench"].ids.map(
        (record) => [record.targetId, "tau2-bench"] as const,
      ),
    ]);
    for (const condition of ["fault", "control"] as const) {
      for (const targetId of targetIds) {
        for (let repeat = 0; repeat < 20; repeat += 1) {
          complete.executions.push({
            source: sourceByTarget.get(targetId)!,
            evidenceKind: "candidate-execution-declaration",
            executionIdentity: `sha256:${createHash("sha256")
              .update(`${condition}:${targetId}:${repeat}`)
              .digest("hex")}`,
            evidenceArtifactSha256: createHash("sha256")
              .update(`evidence:${condition}:${targetId}:${repeat}`)
              .digest("hex"),
            bindings: [{ condition, targetId }],
          });
        }
      }
    }

    const summary = validateRepeatExecutionInventory(complete, sourceAvailability, 20);
    expect(summary.fault.declaredCandidateExecutionIdentities).toBe(1_600);
    expect(summary.control.declaredCandidateExecutionIdentities).toBe(1_600);
    expect(summary.fault.gateVerifiedCandidateExecutionIdentities).toBe(0);
    expect(summary.control.gateVerifiedCandidateExecutionIdentities).toBe(0);
    expect(summary.fault.targetsMeetingRequiredExecutions).toBe(0);
    expect(summary.control.targetsMeetingRequiredExecutions).toBe(0);
    expect(summary.fault.reusedExecutionBindings).toBe(0);
    expect(summary.control.reusedExecutionBindings).toBe(0);
  });

  it("rejects invented candidate identities with no pinned evidence link", () => {
    const invalid = structuredClone(repeatExecutionInventory) as RepeatExecutionInventory & {
      executions: Array<Record<string, unknown>>;
    };
    invalid.executions.push({
      source: "bfcl-v4",
      evidenceKind: "candidate-execution-declaration",
      executionIdentity: `sha256:${"a".repeat(64)}`,
      bindings: [{ condition: "fault", targetId: "ext-061" }],
    });

    expect(() =>
      validateRepeatExecutionInventory(
        invalid as unknown as RepeatExecutionInventory,
        sourceAvailability,
        20,
      ),
    ).toThrow(/unexpected fields/);
  });
});
