import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildControlExecutionContractArtifact,
  validateControlExecutionContractArtifact,
  type ControlExecutionContractArtifact,
} from "./control-execution-contracts";
import { CONTROL_MATRIX } from "./index";
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
const artifact = readJson<ControlExecutionContractArtifact>(
  "../../../research/targets/control-execution-contracts.json",
);

function expectedArtifact() {
  return buildControlExecutionContractArtifact({
    targets,
    controls: CONTROL_MATRIX,
    availability,
  });
}

describe("source-specific control execution contracts", () => {
  it("matches the generated candidate contract artifact exactly", () => {
    expect(
      validateControlExecutionContractArtifact(artifact, {
        targets,
        controls: CONTROL_MATRIX,
        availability,
      }),
    ).toEqual(expectedArtifact());
    expect(artifact.summary).toEqual({
      expected: 20,
      defined: 20,
      agentdojo: 10,
      tau2: 10,
      executionsProvided: 0,
    });
    expect(new Set(artifact.contracts.map((contract) => contract.contractSha256)).size).toBe(20);
  });

  it("uses the official AgentDojo no-injection path rather than an attack named none", () => {
    const contracts = artifact.contracts.filter((contract) => contract.source === "agentdojo");
    expect(contracts).toHaveLength(10);
    for (const contract of contracts) {
      expect(contract.runner).toEqual({
        entrypoint: "agentdojo.benchmark.benchmark_suite_without_injections",
        attackArgument: null,
        injectionTaskId: null,
        injections: {},
        forceRerun: true,
        cachedResultEligible: false,
      });
      expect(contract.acceptance.requireUpstreamUtilityTrue).toBe(true);
      expect(contract.sourceLock.unitKind).toBe("benchmark-task");
    }
  });

  it("pins the effective AgentDojo task definitions and clean environment inputs", () => {
    const byTarget = new Map(artifact.contracts.map((contract) => [contract.targetId, contract]));
    const workspace = byTarget.get("ext-051")!;
    const banking = byTarget.get("ext-056")!;
    const travel = byTarget.get("ext-060")!;
    expect(workspace.sourceLock.sourceBlobs).toContainEqual({
      path: "src/agentdojo/default_suites/v1_2/workspace/user_tasks.py",
      blobSha: "f742906b6b6202a62356cd06a9d8ed3ff57ed7a5",
    });
    expect(banking.sourceLock.sourceBlobs).toContainEqual({
      path: "src/agentdojo/default_suites/v1_2_2/banking/user_tasks.py",
      blobSha: "bde0330cdb72cddb0fb4bb3df1cb36d6bee66c78",
    });
    expect(travel.sourceLock.sourceBlobs).toContainEqual({
      path: "src/agentdojo/default_suites/v1_2/travel/user_tasks.py",
      blobSha: "b3106f61d84d1bc1a56bea96ddc3abf23b9a187c",
    });
    for (const contract of [workspace, banking, travel]) {
      expect(
        contract.sourceLock.sourceBlobs.some((blob) => blob.path.endsWith("environment.yaml")),
      ).toBe(true);
      expect(
        contract.sourceLock.sourceBlobs.some((blob) =>
          blob.path.endsWith("injection_vectors.yaml"),
        ),
      ).toBe(true);
    }
  });

  it("never accepts a tau2 reward as the sole control criterion", () => {
    const contracts = artifact.contracts.filter((contract) => contract.source === "tau2-bench");
    expect(contracts).toHaveLength(10);
    for (const contract of contracts) {
      expect(contract.acceptance.requireUpstreamRewardOne).toBe(true);
      expect(contract.acceptance.upstreamRewardIsSoleAcceptance).toBe(false);
      expect(contract.acceptance.requiredChecks.length).toBeGreaterThan(0);
      expect(contract.auditIssue).toBe("https://github.com/sierra-research/tau2-bench/issues/384");
    }
  });

  it("predeclares the five missing retail operational checks", () => {
    const byTarget = new Map(artifact.contracts.map((contract) => [contract.targetId, contract]));
    const contract = (targetId: string) => {
      const value = byTarget.get(targetId);
      if (value?.source !== "tau2-bench") throw new Error(`Missing tau2 contract ${targetId}`);
      return value;
    };
    expect(contract("ext-076").acceptance.requiredChecks).toEqual([
      { kind: "trace-action", action: "transfer_to_human_agents" },
    ]);
    expect(contract("ext-077").acceptance.requiredChecks).toEqual([
      { kind: "trace-action", action: "transfer_to_human_agents" },
    ]);
    expect(contract("ext-078").acceptance.requiredChecks).toEqual([
      { kind: "state-derived-communication", field: "tracking_number" },
    ]);
    expect(contract("ext-079").acceptance.requiredChecks).toEqual([
      { kind: "trace-action", action: "transfer_to_human_agents" },
    ]);
    expect(contract("ext-080").acceptance.requiredChecks).toEqual([
      { kind: "state-derived-communication", field: "estimated_delivery_date" },
    ]);
  });

  it("rejects any artifact drift while retaining human-review and release boundaries", () => {
    expect(artifact.humanReviewRequired).toBe(true);
    expect(artifact.releaseAllowed).toBe(false);
    expect(artifact.submissionAllowed).toBe(false);
    const changed = structuredClone(artifact);
    changed.contracts[0]!.sourceLock.sourceBlobs[0]!.blobSha = "0".repeat(40);
    expect(() =>
      validateControlExecutionContractArtifact(changed, {
        targets,
        controls: CONTROL_MATRIX,
        availability,
      }),
    ).toThrow(/artifact bytes do not match/);
  });
});
