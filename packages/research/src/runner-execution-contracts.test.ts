import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildRunnerExecutionContractArtifact,
  validateRunnerExecutionContractArtifact,
  type RunnerExecutionContractArtifact,
} from "./runner-execution-contracts";
import type { IndependentTargetEntry, SourceAvailabilityAudit } from "./target-binding";

function readJson<T>(path: string) {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as T;
}

describe("P26-002 missing runner execution contracts", () => {
  const input = {
    targets: readJson<{ entries: IndependentTargetEntry[] }>(
      "../../../research/independent-targets.json",
    ).entries,
    availability: readJson<SourceAvailabilityAudit>(
      "../../../research/targets/source-availability-audit.json",
    ),
  };

  it("matches the committed 30-contract candidate artifact", () => {
    const generated = buildRunnerExecutionContractArtifact(input);
    const committed = readJson<RunnerExecutionContractArtifact>(
      "../../../research/targets/runner-execution-contracts.json",
    );
    expect(generated).toEqual(committed);
    expect(() => validateRunnerExecutionContractArtifact(committed, input)).not.toThrow();
    expect(committed.summary).toEqual({
      expected: 30,
      defined: 30,
      bfclFault: 10,
      bfclControl: 10,
      tau2Fault: 10,
      executionsProvided: 0,
    });
    expect(committed.executionAllowed).toBe(false);
    expect(committed.humanReviewRequired).toBe(true);
  });

  it("preserves the upstream tau2 omission condition instead of applying control checks", () => {
    const artifact = buildRunnerExecutionContractArtifact(input);
    const tau2 = artifact.contracts.filter((contract) => contract.source === "tau2-bench");
    expect(tau2).toHaveLength(10);
    for (const contract of tau2) {
      expect(contract.runner).toEqual({
        entrypoint: "tau2.run.run_single_task",
        evaluationType: "ALL",
        requireFreshRun: true,
        supplementalControlChecks: "not-applied",
      });
      expect(contract.observation.upstreamRewardIsEligibilityThreshold).toBe(false);
      expect(contract.observation.preserveFrozenRewardBasis).toBe(true);
    }
  });

  it("binds every BFCL run to one isolated exact-ID manifest and two pinned stages", () => {
    const artifact = buildRunnerExecutionContractArtifact(input);
    const bfcl = artifact.contracts.filter((contract) => contract.source === "bfcl-v4");
    expect(bfcl).toHaveLength(20);
    for (const contract of bfcl) {
      expect(contract.selectionManifest.exactContents).toEqual({
        [contract.category]: [contract.caseId],
      });
      expect(contract.runner.runIds).toBe(true);
      expect(contract.runner.requireIsolatedProjectRoot).toBe(true);
      expect(contract.runner.partialEval).toBe(true);
      expect(contract.observation.upstreamValidityIsEligibilityThreshold).toBe(false);
    }
  });
});
