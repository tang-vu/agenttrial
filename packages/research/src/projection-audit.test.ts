import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  excludeReplacedLegacyProjectionHashes,
  validateAgentChaosProjectionAudit,
  validateAgentDojoProjectionAudit,
  validateRemainingControlSourceAudit,
  validateRemainingProjectionAudit,
  type AgentChaosProjectionAudit,
  type AgentDojoProjectionAudit,
  type RemainingControlSourceAudit,
  type RemainingProjectionAudit,
} from "./projection-audit";
import type { IndependentTargetEntry, SourceAvailabilityAudit } from "./target-binding";

function readJson<T>(path: string) {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as T;
}

const targets = readJson<{ entries: IndependentTargetEntry[] }>(
  "../../../research/independent-targets.json",
).entries;
const availability = readJson<SourceAvailabilityAudit>(
  "../../../research/targets/source-availability-audit.json",
);
const agentChaos = readJson<AgentChaosProjectionAudit>(
  "../../../research/targets/agentchaos-projection-audit.json",
);
const agentDojo = readJson<AgentDojoProjectionAudit>(
  "../../../research/targets/agentdojo-projection-audit.json",
);
const remaining = readJson<RemainingProjectionAudit>(
  "../../../research/targets/remaining-projection-audit.json",
);
const remainingControls = readJson<RemainingControlSourceAudit>(
  "../../../research/targets/remaining-control-source-audit.json",
);

function completeRemainingProjectionAudit(): RemainingProjectionAudit {
  const evidenceArtifactSha256 = "f".repeat(64);
  const recordHash = (index: number) => index.toString(16).padStart(64, "0");
  return {
    ...structuredClone(remaining),
    status: "passed",
    expected: { fault: 80, control: 80 },
    verified: { fault: 80, control: 80 },
    labelBlindChecks: {
      fault: true,
      control: true,
      sourceBound: true,
      targetControlPairBound: true,
    },
    faultProjections: targets.map((target, index) => ({
      targetId: target.targetId,
      projectionHash: recordHash(index + 1),
      sourceExecutionReference: `${target.source}/${target.targetId}/fault`,
      sourceExecutionSha256: recordHash(index + 161),
      evidenceArtifactSha256,
    })),
    controlProjections: targets.map((target, index) => ({
      targetId: target.targetId,
      controlConfigurationId: `control-${target.targetId}`,
      projectionHash: recordHash(index + 81),
      sourceExecutionReference: `${target.source}/${target.targetId}/control`,
      sourceExecutionSha256: recordHash(index + 241),
      evidenceArtifactSha256,
    })),
    evidenceArtifacts: [
      {
        path: "research/targets/evidence/all-frozen-targets.json",
        sha256: evidenceArtifactSha256,
      },
    ],
  };
}

describe("projection audit provenance gates", () => {
  it("accepts the complete legacy hash inventories without promoting them to readiness", () => {
    expect(agentChaos.readinessEligible).toBe(false);
    expect(agentDojo.readinessEligible).toBe(false);
    expect(validateAgentChaosProjectionAudit(agentChaos, availability, targets)).toHaveLength(50);
    expect(validateAgentDojoProjectionAudit(agentDojo, availability, targets)).toHaveLength(10);
  });

  it("rejects a legacy inventory that claims readiness eligibility", () => {
    const invalid = { ...structuredClone(agentChaos), readinessEligible: true };
    expect(() =>
      validateAgentChaosProjectionAudit(
        invalid as unknown as AgentChaosProjectionAudit,
        availability,
        targets,
      ),
    ).toThrow(/envelope is not the frozen 50\/50 label-blind pass/);
  });

  it("rejects a projection envelope whose audit did not pass", () => {
    const invalid = structuredClone(agentChaos);
    invalid.status = "failed";
    expect(() => validateAgentChaosProjectionAudit(invalid, availability, targets)).toThrow(
      /envelope is not the frozen 50\/50 label-blind pass/,
    );
  });

  it("rejects a projection record moved across source partitions", () => {
    const invalid = structuredClone(agentDojo);
    invalid.projections[0]!.targetId = "ext-001";
    expect(() => validateAgentDojoProjectionAudit(invalid, availability, targets)).toThrow(
      /do not match the frozen source partition/,
    );
  });

  it("treats the canonical remaining-projection manifest as non-evidence while pending", () => {
    expect(remaining.expected).toEqual({ fault: 80, control: 80 });
    expect(validateRemainingProjectionAudit(remaining, targets)).toEqual({
      faultProjections: [],
      controlProjections: [],
      evidenceArtifacts: [],
    });
    const invalid = structuredClone(remaining);
    invalid.evidenceArtifacts.push({
      path: "research/targets/evidence/not-real.json",
      sha256: "a".repeat(64),
    });
    expect(() => validateRemainingProjectionAudit(invalid, targets)).toThrow(
      /pending remaining projection audit cannot contribute evidence/,
    );
  });

  it("requires gate-reconstructed fault projections for all 80 frozen targets", () => {
    const complete = completeRemainingProjectionAudit();
    expect(validateRemainingProjectionAudit(complete, targets).faultProjections).toHaveLength(80);

    const futureFamiliesOnly = structuredClone(complete);
    futureFamiliesOnly.faultProjections = futureFamiliesOnly.faultProjections.filter((record) =>
      ["bfcl-v4", "tau2-bench"].includes(
        targets.find((target) => target.targetId === record.targetId)!.source,
      ),
    );
    futureFamiliesOnly.verified.fault = futureFamiliesOnly.faultProjections.length;
    expect(() => validateRemainingProjectionAudit(futureFamiliesOnly, targets)).toThrow(
      /complete 80-fault\/80-control pass/,
    );
  });

  it("rejects a complete-length fault manifest that omits a frozen target", () => {
    const invalid = completeRemainingProjectionAudit();
    invalid.faultProjections[0]!.targetId = invalid.faultProjections[1]!.targetId;
    expect(() => validateRemainingProjectionAudit(invalid, targets)).toThrow(
      /do not match the frozen source partition/,
    );
  });

  it("lets gate-reconstructed replacements supersede per-target legacy exclusion state", () => {
    const legacy = [
      { targetId: "ext-001", projectionHash: "a".repeat(64) },
      { targetId: "ext-002", projectionHash: "b".repeat(64) },
    ];
    const gateReconstructed = [{ targetId: "ext-001", projectionHash: "c".repeat(64) }];
    expect(excludeReplacedLegacyProjectionHashes(legacy, gateReconstructed)).toEqual([legacy[1]]);
  });

  it("keeps future AgentDojo and tau2 control executions fail-closed while pending", () => {
    expect(validateRemainingControlSourceAudit(remainingControls, targets)).toEqual({
      controls: [],
      evidenceArtifacts: [],
    });
  });
});
