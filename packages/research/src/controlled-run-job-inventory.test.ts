import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ControlExecutionContractArtifact } from "./control-execution-contracts";
import {
  buildControlledRunJobInventory,
  validateControlledRunJobInventory,
  type ControlledRunJobInventory,
} from "./controlled-run-job-inventory";
import type { IndependentTargetEntry, SourceAvailabilityAudit } from "./target-binding";

function readJson<T>(path: string) {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as T;
}

describe("P26-002 controlled-run job inventory", () => {
  const input = {
    targets: readJson<{ entries: IndependentTargetEntry[] }>(
      "../../../research/independent-targets.json",
    ).entries,
    availability: readJson<SourceAvailabilityAudit>(
      "../../../research/targets/source-availability-audit.json",
    ),
    controlContracts: readJson<ControlExecutionContractArtifact>(
      "../../../research/targets/control-execution-contracts.json",
    ),
  };

  it("matches the committed fail-closed inventory", () => {
    const generated = buildControlledRunJobInventory(input);
    const committed = readJson<ControlledRunJobInventory>(
      "../../../research/targets/controlled-run-job-inventory.json",
    );
    expect(generated).toEqual(committed);
    expect(() => validateControlledRunJobInventory(committed)).not.toThrow();
    expect(committed.summary).toEqual({
      expectedJobs: 50,
      inventoriedJobs: 50,
      faultJobs: 20,
      controlJobs: 30,
      controlContractDefined: 20,
      runnerContractMissing: 30,
      runnableJobs: 0,
      scheduledJobs: 0,
      executedJobs: 0,
    });
  });

  it("rejects scheduling or evidence promotion", () => {
    const inventory = buildControlledRunJobInventory(input);
    const scheduled = structuredClone(inventory) as unknown as Record<string, unknown>;
    scheduled.executionAllowed = true;
    expect(() =>
      validateControlledRunJobInventory(scheduled as unknown as ControlledRunJobInventory),
    ).toThrow(/fail-closed/);
    const promoted = structuredClone(inventory) as unknown as {
      jobs: Array<Record<string, unknown>>;
    };
    promoted.jobs[0]!.evidenceEligible = true;
    expect(() =>
      validateControlledRunJobInventory(promoted as unknown as ControlledRunJobInventory),
    ).toThrow(/job contract/);
  });
});
