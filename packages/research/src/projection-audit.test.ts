import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
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

describe("projection audit provenance gates", () => {
  it("accepts only the complete source-bound current fault audits", () => {
    expect(validateAgentChaosProjectionAudit(agentChaos, availability, targets)).toHaveLength(50);
    expect(validateAgentDojoProjectionAudit(agentDojo, availability, targets)).toHaveLength(10);
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

  it("keeps future AgentDojo and tau2 control executions fail-closed while pending", () => {
    expect(validateRemainingControlSourceAudit(remainingControls, targets)).toEqual({
      controls: [],
      evidenceArtifacts: [],
    });
  });
});
