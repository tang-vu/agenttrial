import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONTROL_MATRIX, SCENARIO_MATRIX } from "./index";
import type { DesignValidityAudit } from "./design-validity";
import {
  buildTargetBindingAudit,
  type ConstructReviewPacket,
  type G3Governance,
  type IndependentTargetEntry,
  type MethodFreezeApproval,
  type ProjectionRecord,
  type SourceAvailabilityAudit,
  type TargetBindingAudit,
} from "./target-binding";

function readJson<T>(path: string) {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as T;
}

const targetFreeze = readJson<{ entries: IndependentTargetEntry[] }>(
  "../../../research/independent-targets.json",
);
const availability = readJson<SourceAvailabilityAudit>(
  "../../../research/targets/source-availability-audit.json",
);
const agentChaos = readJson<{ projections: ProjectionRecord[] }>(
  "../../../research/targets/agentchaos-projection-audit.json",
);
const agentDojo = readJson<{ projections: ProjectionRecord[] }>(
  "../../../research/targets/agentdojo-projection-audit.json",
);
const constructReview = readJson<ConstructReviewPacket>(
  "../../../research/governance/construct-review-packet.json",
);
const governance = readJson<G3Governance>("../../../research/governance/g3-approval.json");
const methodFreeze = readJson<MethodFreezeApproval>(
  "../../../research/governance/method-freeze-approval.json",
);
const designValidity = readJson<DesignValidityAudit>(
  "../../../research/design-validity-audit.json",
);
const committedAuditPath = new URL(
  "../../../research/targets/target-binding-audit.json",
  import.meta.url,
);
const reviewPacketPath = new URL(
  "../../../research/governance/construct-review-packet.json",
  import.meta.url,
);

function buildAudit() {
  return buildTargetBindingAudit({
    faultConfigurations: SCENARIO_MATRIX,
    controlConfigurations: CONTROL_MATRIX,
    targets: targetFreeze.entries,
    availability,
    faultProjections: [],
    excludedLegacyFaultProjections: [...agentChaos.projections, ...agentDojo.projections],
    controlProjections: [],
    designValidity,
    constructReview,
    governance,
    methodFreeze,
  });
}

describe("independent-target binding and G3 gate", () => {
  it("creates a one-to-one but explicitly provisional 80-target crosswalk", () => {
    const audit = buildAudit();
    expect(audit.bindings).toHaveLength(80);
    expect(new Set(audit.bindings.map((item) => item.targetId)).size).toBe(80);
    expect(new Set(audit.bindings.map((item) => item.faultConfigurationId)).size).toBe(80);
    expect(new Set(audit.bindings.map((item) => item.controlConfigurationId)).size).toBe(80);
    expect(
      audit.bindings.every(
        (item) =>
          item.bindingMethod === "provisional-family-order-review-required" &&
          item.constructReviewStatus === "pending-human-review",
      ),
    ).toBe(true);
  });

  it("reports exactly what is and is not ready without promoting fixtures to evidence", () => {
    const audit = buildAudit();
    expect(audit.summary).toEqual({
      bindings: 80,
      uniqueTargets: 80,
      faultBindingsWithPinnedInput: 80,
      uniqueFaultInputsPinned: 80,
      controlBindingsWithPinnedInput: 60,
      uniqueControlInputsPinned: 20,
      reusedControlBindings: 40,
      controlConditionsOnly: 20,
      legacyFaultProjectionHashesExcluded: 60,
      faultProjectionsReady: 0,
      controlProjectionsReady: 0,
      constructMappingsApproved: 0,
      constructMappingsPending: 80,
      constructMappingsRejected: 0,
    });
    expect(
      audit.bindings
        .filter((item) => item.sourceEvidence.faultProjection.state === "missing")
        .map((item) => item.targetId),
    ).toEqual(
      Array.from({ length: 20 }, (_, index) => `ext-${String(index + 61).padStart(3, "0")}`),
    );
    expect(
      audit.bindings
        .filter(
          (item) => item.sourceEvidence.faultProjection.state === "excluded-not-gate-reconstructed",
        )
        .map((item) => item.targetId),
    ).toEqual(
      Array.from({ length: 60 }, (_, index) => `ext-${String(index + 1).padStart(3, "0")}`),
    );
    expect(audit.status).toBe("blocked");
    expect(audit.mainTrialAllowed).toBe(false);
    expect(audit.submissionAllowed).toBe(false);
  });

  it("cannot omit or empty the design-validity gate", () => {
    const input = {
      faultConfigurations: SCENARIO_MATRIX,
      controlConfigurations: CONTROL_MATRIX,
      targets: targetFreeze.entries,
      availability,
      faultProjections: [],
      excludedLegacyFaultProjections: [...agentChaos.projections, ...agentDojo.projections],
      controlProjections: [],
      designValidity,
      constructReview,
      governance,
      methodFreeze,
    };
    delete (input as { designValidity?: DesignValidityAudit }).designValidity;
    expect(() =>
      buildTargetBindingAudit(input as Parameters<typeof buildTargetBindingAudit>[0]),
    ).toThrow(/design-validity audit is required/);

    const inconsistent = structuredClone(designValidity);
    inconsistent.blockers = [];
    expect(() => buildTargetBindingAudit({ ...input, designValidity: inconsistent })).toThrow(
      /design-validity audit is inconsistent or incomplete/,
    );
  });

  it("keeps every G3 approval human-only and unset", () => {
    expect(governance.humanOnly).toBe(true);
    expect(
      Object.values(governance.gates).every((gate) => gate.status === "pending-human-review"),
    ).toBe(true);
    expect(Object.values(governance.gates).every((gate) => gate.decidedBy === null)).toBe(true);
    expect(governance.submissionAllowed).toBe(false);
    expect(methodFreeze.humanOnly).toBe(true);
    expect(methodFreeze.decision.status).toBe("pending-human-review");
    expect(methodFreeze.decision.decidedBy).toBeNull();
  });

  it("pins the generated blocked audit and blank two-reviewer packet", () => {
    const committed = readJson<
      TargetBindingAudit & {
        inputs: {
          constructReviewPacketSha256: string;
          independentTargetsSha256: string;
        };
      }
    >(committedAuditPath.pathname);
    const generated = buildAudit();
    const packetBytes = readFileSync(reviewPacketPath);
    const packet = JSON.parse(packetBytes.toString("utf8")) as {
      rows: Array<{
        reviewerA: { decision: null };
        reviewerB: { decision: null };
        adjudication: { decision: null };
      }>;
      releaseAllowed: boolean;
      submissionAllowed: boolean;
    };
    expect(committed.bindings).toEqual(generated.bindings);
    expect(committed.summary).toEqual(generated.summary);
    expect(committed.blockers).toEqual(generated.blockers);
    expect(
      committed.blockers
        .filter((blocker) => blocker.startsWith("Method validity:"))
        .every((blocker) => blocker.startsWith("Method validity:")),
    ).toBe(true);
    expect(
      committed.blockers.filter((blocker) => blocker.startsWith("Method validity:")),
    ).toHaveLength(5);
    expect(committed.mainTrialAllowed).toBe(false);
    expect(packet.rows).toHaveLength(80);
    expect(
      packet.rows.every(
        (row) =>
          row.reviewerA.decision === null &&
          row.reviewerB.decision === null &&
          row.adjudication.decision === null,
      ),
    ).toBe(true);
    expect(packet.releaseAllowed).toBe(false);
    expect(packet.submissionAllowed).toBe(false);
    expect(createHash("sha256").update(packetBytes).digest("hex")).toBe(
      committed.inputs.constructReviewPacketSha256,
    );
    expect(
      createHash("sha256")
        .update(
          readFileSync(new URL("../../../research/independent-targets.json", import.meta.url)),
        )
        .digest("hex"),
    ).toBe(committed.inputs.independentTargetsSha256);
  });

  it("fails closed if the frozen target universe is incomplete", () => {
    expect(() =>
      buildTargetBindingAudit({
        faultConfigurations: SCENARIO_MATRIX,
        controlConfigurations: CONTROL_MATRIX,
        targets: targetFreeze.entries.slice(1),
        availability,
        faultProjections: [],
        excludedLegacyFaultProjections: [...agentChaos.projections, ...agentDojo.projections],
        controlProjections: [],
        designValidity,
        constructReview,
        governance,
        methodFreeze,
      }),
    ).toThrow(/must contain 80 targets/);
  });

  it("rejects projection records outside the frozen target universe", () => {
    expect(() =>
      buildTargetBindingAudit({
        faultConfigurations: SCENARIO_MATRIX,
        controlConfigurations: CONTROL_MATRIX,
        targets: targetFreeze.entries,
        availability,
        faultProjections: [{ targetId: "ext-999", projectionHash: "a".repeat(64) }],
        controlProjections: [],
        designValidity,
        constructReview,
        governance,
        methodFreeze,
      }),
    ).toThrow(/unexpected fault projection ID ext-999/);
  });

  it("rejects an approval with no attributable human decision record", () => {
    const invalidGovernance = structuredClone(governance);
    invalidGovernance.gates.targetAuthorization.status = "approved";
    expect(() =>
      buildTargetBindingAudit({
        faultConfigurations: SCENARIO_MATRIX,
        controlConfigurations: CONTROL_MATRIX,
        targets: targetFreeze.entries,
        availability,
        faultProjections: [],
        excludedLegacyFaultProjections: [...agentChaos.projections, ...agentDojo.projections],
        controlProjections: [],
        designValidity,
        constructReview,
        governance: invalidGovernance,
        methodFreeze,
      }),
    ).toThrow(/requires a named person/);
  });

  it("rejects a G3 record that omits any required gate", () => {
    const invalidGovernance = structuredClone(governance);
    delete (invalidGovernance.gates as Partial<G3Governance["gates"]>).releaseBoundary;
    expect(() =>
      buildTargetBindingAudit({
        faultConfigurations: SCENARIO_MATRIX,
        controlConfigurations: CONTROL_MATRIX,
        targets: targetFreeze.entries,
        availability,
        faultProjections: [],
        excludedLegacyFaultProjections: [...agentChaos.projections, ...agentDojo.projections],
        controlProjections: [],
        designValidity,
        constructReview,
        governance: invalidGovernance,
        methodFreeze,
      }),
    ).toThrow(/exactly the four required gates/);
  });

  it("invalidates construct approval if executable scenario semantics drift", () => {
    const changedScenarios = structuredClone(SCENARIO_MATRIX);
    changedScenarios[0]!.injection = "Changed after review";
    expect(() =>
      buildTargetBindingAudit({
        faultConfigurations: changedScenarios,
        controlConfigurations: CONTROL_MATRIX,
        targets: targetFreeze.entries,
        availability,
        faultProjections: [],
        excludedLegacyFaultProjections: [...agentChaos.projections, ...agentDojo.projections],
        controlProjections: [],
        designValidity,
        constructReview,
        governance,
        methodFreeze,
      }),
    ).toThrow(/construct-review packet drift for ext-001/);
  });

  it("recognizes complete independent approvals but preserves non-review blockers", () => {
    const approvedReview = structuredClone(constructReview);
    approvedReview.status = "approved";
    for (const row of approvedReview.rows) {
      row.reviewerA = {
        decision: "approve",
        reviewer: "reviewer-a",
        notes: `Independent rationale A for ${row.targetId}`,
      };
      row.reviewerB = {
        decision: "approve",
        reviewer: "reviewer-b",
        notes: `Independent rationale B for ${row.targetId}`,
      };
    }
    const audit = buildTargetBindingAudit({
      faultConfigurations: SCENARIO_MATRIX,
      controlConfigurations: CONTROL_MATRIX,
      targets: targetFreeze.entries,
      availability,
      faultProjections: [],
      excludedLegacyFaultProjections: [...agentChaos.projections, ...agentDojo.projections],
      controlProjections: [],
      designValidity,
      constructReview: approvedReview,
      governance,
      methodFreeze,
    });
    expect(audit.summary.constructMappingsApproved).toBe(80);
    expect(audit.summary.constructMappingsPending).toBe(0);
    expect(audit.mainTrialAllowed).toBe(false);
  });

  it("rejects reviewer identity aliases that are not independent", () => {
    const invalidReview = structuredClone(constructReview);
    invalidReview.rows[0]!.reviewerA = {
      decision: "approve",
      reviewer: "Reviewer One",
      notes: "Independent construct rationale A",
    };
    invalidReview.rows[0]!.reviewerB = {
      decision: "approve",
      reviewer: " reviewer one ",
      notes: "Independent construct rationale B",
    };
    expect(() =>
      buildTargetBindingAudit({
        faultConfigurations: SCENARIO_MATRIX,
        controlConfigurations: CONTROL_MATRIX,
        targets: targetFreeze.entries,
        availability,
        faultProjections: [],
        excludedLegacyFaultProjections: [...agentChaos.projections, ...agentDojo.projections],
        controlProjections: [],
        designValidity,
        constructReview: invalidReview,
        governance,
        methodFreeze,
      }),
    ).toThrow(/requires two different human reviewers/);
  });
});
