import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildBlockerLedger } from "./blocker-ledger";
import type { DesignValidityAudit } from "./design-validity";
import type { TargetBindingAudit } from "./target-binding";
import type { TrustedRunnerPolicy } from "./trusted-runner";
import type { ArtifactTamperingMutationPlan } from "./artifact-tampering-plan";
import type { ControlledRunJobInventory } from "./controlled-run-job-inventory";

function readJson<T>(path: string) {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as T;
}

describe("P26-002 readiness blocker ledger", () => {
  it("accounts for every remaining blocker and reports no machine-only blocker", () => {
    const input = {
      audit: readJson<TargetBindingAudit>("../../../research/targets/target-binding-audit.json"),
      designValidity: readJson<DesignValidityAudit>("../../../research/design-validity-audit.json"),
      trustedRunnerPolicy: readJson<TrustedRunnerPolicy>(
        "../../../research/targets/trusted-runner-policy.json",
      ),
      artifactTamperingPlan: readJson<ArtifactTamperingMutationPlan>(
        "../../../research/targets/artifact-tampering-mutation-plan.json",
      ),
      controlledRunJobInventory: readJson<ControlledRunJobInventory>(
        "../../../research/targets/controlled-run-job-inventory.json",
      ),
    };
    const generated = buildBlockerLedger(input);
    const committed = readJson<ReturnType<typeof buildBlockerLedger>>(
      "../../../research/readiness-blocker-ledger.json",
    );
    expect(generated).toEqual(committed);
    expect(generated.counts).toEqual({
      total: 13,
      machineOnly: 0,
      humanOnly: 6,
      executionOrSourceEvidence: 7,
    });
    expect(new Set(generated.blockers.map((item) => item.id)).size).toBe(13);
    expect(generated.completedMachineGates).toHaveLength(4);
    expect(generated.mainTrialAllowed).toBe(false);
    expect(generated.submissionAllowed).toBe(false);
  });
});
