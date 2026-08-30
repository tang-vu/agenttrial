import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildArtifactTamperingMutationPlan,
  validateArtifactTamperingMutationPlan,
  type ArtifactTamperingMutationPlan,
} from "./artifact-tampering-plan";
import type { IndependentTargetEntry, SourceAvailabilityAudit } from "./target-binding";

function readJson<T>(path: string) {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as T;
}

describe("P26-002 prospective artifact-tampering plan", () => {
  const targets = readJson<{ entries: IndependentTargetEntry[] }>(
    "../../../research/independent-targets.json",
  );
  const availability = readJson<SourceAvailabilityAudit>(
    "../../../research/targets/source-availability-audit.json",
  );

  it("matches the committed plan without materializing evidence", () => {
    const generated = buildArtifactTamperingMutationPlan({
      targets: targets.entries,
      availability,
    });
    const committed = readJson<ArtifactTamperingMutationPlan>(
      "../../../research/targets/artifact-tampering-mutation-plan.json",
    );
    expect(generated).toEqual(committed);
    expect(() => validateArtifactTamperingMutationPlan(committed)).not.toThrow();
    expect(committed.entries).toHaveLength(10);
    expect(committed.applicationAllowed).toBe(false);
    expect(committed.entries.every((entry) => !entry.applicationAllowed)).toBe(true);
    expect(committed.readinessEligible).toBe(false);
    expect(committed.entries.every((entry) => !entry.readinessEligible)).toBe(true);
    expect(committed.evidenceMaterialized).toBe(false);
    expect(committed.releaseAllowed).toBe(false);
    expect(committed.submissionAllowed).toBe(false);
  });

  it("binds every variant to the registered mutation cardinality", () => {
    const plan = buildArtifactTamperingMutationPlan({
      targets: targets.entries,
      availability,
    });
    expect(plan.entries.map((entry) => entry.scenarioVariant)).toEqual([
      "minimal",
      "boundary",
      "nested",
      "delayed",
      "conflicting",
      "missing-metadata",
      "high-severity",
      "cross-check",
      "multi-step",
      "partial-evidence",
    ]);
    expect(plan.entries.map((entry) => entry.mutationCardinality)).toEqual([
      1, 1, 1, 1, 1, 1, 1, 1, 2, 1,
    ]);
  });

  it("rejects a promoted or modified plan", () => {
    const plan = buildArtifactTamperingMutationPlan({
      targets: targets.entries,
      availability,
    });
    const promoted = structuredClone(plan) as unknown as Record<string, unknown>;
    promoted.evidenceMaterialized = true;
    expect(() =>
      validateArtifactTamperingMutationPlan(promoted as unknown as ArtifactTamperingMutationPlan),
    ).toThrow(/fail-closed/);
    const modified = structuredClone(plan) as unknown as {
      entries: Array<Record<string, unknown>>;
    };
    modified.entries[0]!.applicationAllowed = true;
    expect(() =>
      validateArtifactTamperingMutationPlan(modified as unknown as ArtifactTamperingMutationPlan),
    ).toThrow(/entry contract/);
  });
});
