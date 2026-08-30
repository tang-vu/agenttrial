import type { ScenarioConfiguration } from "./index";
import { SOURCE_EXECUTION_DERIVATION_CAPABILITY } from "./source-execution-derivation";
import type { SourceAvailabilityAudit } from "./target-binding";

export interface DesignRepetitionPlan {
  repetitionsPerScenario: number;
  matchedControlCount: number;
  totalSharedExecutionArtifacts: number;
}

type RepeatExecutionSource = keyof SourceAvailabilityAudit["sources"];
type RepeatExecutionCondition = "fault" | "control";

interface RepeatExecutionInventoryRecordBase {
  source: RepeatExecutionSource;
  executionIdentity: string;
  bindings: Array<{ condition: RepeatExecutionCondition; targetId: string }>;
}

export type RepeatExecutionInventoryRecord =
  | (RepeatExecutionInventoryRecordBase & {
      evidenceKind: "fixed-upstream-artifact";
    })
  | (RepeatExecutionInventoryRecordBase & {
      evidenceKind: "candidate-execution-declaration";
      evidenceArtifactSha256: string;
    });

export interface RepeatExecutionInventory {
  schemaVersion: "p26-002-repeat-execution-inventory-0.1.0";
  status: "observed";
  scope: "pre-run-repeat-execution-identity-inventory-not-outcome-evidence";
  requiredIndependentExecutionsPerTarget: number;
  executions: RepeatExecutionInventoryRecord[];
  releaseBoundary: { rawExecutionsRetained: false };
  submissionAllowed: false;
}

export interface ConditionRepeatExecutionSummary {
  uniqueExecutionIdentities: number;
  executionBindings: number;
  fixedUpstreamExecutionIdentities: number;
  declaredCandidateExecutionIdentities: number;
  gateVerifiedCandidateExecutionIdentities: number;
  reusedExecutionBindings: number;
  targetsMeetingRequiredExecutions: number;
  fixedUpstreamSingleExecutionTargets: number;
  otherPartiallyPopulatedTargets: number;
  targetsWithoutAnyExecution: number;
}

export interface RepeatExecutionInventorySummary {
  targetCount: number;
  requiredExecutionsPerTarget: number;
  observedUniqueExecutionIdentities: number;
  crossConditionExecutionIdentities: number;
  fault: ConditionRepeatExecutionSummary;
  control: ConditionRepeatExecutionSummary;
}

export interface ConditionProjectionCounts {
  observed: number;
  mainTrialEligible: number;
  legacy: number;
  excludedLegacy: number;
  gateReconstructedLegacy: number;
}

export interface DesignProjectionCounts {
  fault: ConditionProjectionCounts;
  control: ConditionProjectionCounts;
}

export interface DesignValidityInputs {
  scenarios: readonly ScenarioConfiguration[];
  sourceAvailability: SourceAvailabilityAudit;
  projectionCounts: DesignProjectionCounts;
  repetitionPlan: DesignRepetitionPlan;
  repeatExecutionInventory: RepeatExecutionInventory;
}

export type DesignValidityBlockerCode =
  | "non-operational-variants"
  | "static-target-repeat-mismatch"
  | "reused-matched-control-inputs"
  | "ineligible-legacy-projections"
  | "unverified-source-execution-derivation";

export interface DesignValidityBlocker {
  code: DesignValidityBlockerCode;
  message: string;
}

interface VariantFamilyAudit {
  family: string;
  nominalVariants: number;
  operationalProfiles: number;
  appendedLabelOnly: boolean;
}

export interface DesignValidityAudit {
  schemaVersion: "p26-002-design-validity-audit-0.3.0";
  status: "blocked" | "valid";
  scope: "design-validity-only-no-human-approval-or-main-trial-evidence";
  checks: {
    variantOperationalization: {
      passed: boolean;
      nominalVariants: number;
      operationalProfiles: number;
      families: VariantFamilyAudit[];
    };
    executionRepetitionSupport: {
      passed: boolean;
      targetCount: number;
      requiredExecutionsPerTarget: number;
      requiredSharedExecutionArtifacts: number;
      observedUniqueExecutionIdentities: number;
      crossConditionExecutionIdentities: number;
      fault: ConditionRepeatExecutionSummary;
      control: ConditionRepeatExecutionSummary;
    };
    matchedControlIndependence: {
      passed: boolean;
      requiredBindings: number;
      lockedBindings: number;
      uniqueReferences: number;
      reusedBindings: number;
    };
    legacyProjectionEligibility: {
      passed: boolean;
      required: { fault: number; control: number };
      observed: { fault: number; control: number };
      mainTrialEligible: { fault: number; control: number };
      legacy: { fault: number; control: number };
      excludedLegacy: { fault: number; control: number };
      gateReconstructedLegacy: { fault: number; control: number };
      notGateReconstructedLegacy: { fault: number; control: number };
      notGateReconstructedIncludedLegacy: { fault: number; control: number };
    };
    sourceExecutionDerivation: {
      passed: boolean;
      capabilityStatus: typeof SOURCE_EXECUTION_DERIVATION_CAPABILITY.status;
      fixedUpstreamVerification: typeof SOURCE_EXECUTION_DERIVATION_CAPABILITY.fixedUpstreamVerification;
      controlledRunVerification: typeof SOURCE_EXECUTION_DERIVATION_CAPABILITY.controlledRunVerification;
      readinessEvidenceAllowed: boolean;
    };
  };
  summary: {
    scenarios: number;
    sourceUnits: number;
    designChecksPassed: number;
    designChecksBlocked: number;
  };
  blockers: DesignValidityBlocker[];
  designValidityPassed: boolean;
  humanApprovalEvaluated: false;
  mainTrialAllowed: false;
  submissionAllowed: false;
}

function fail(message: string): never {
  throw new Error(`Design validity audit failed: ${message}`);
}

function assertNonNegativeInteger(value: number, description: string) {
  if (!Number.isSafeInteger(value) || value < 0)
    fail(`${description} must be a non-negative integer`);
}

function assertNonEmpty(value: string, description: string) {
  if (value.trim().length === 0) fail(`${description} must not be empty`);
}

function validateProjectionCounts(
  counts: ConditionProjectionCounts,
  condition: "fault" | "control",
) {
  for (const [key, value] of Object.entries(counts))
    assertNonNegativeInteger(value, `${condition} projection count ${key}`);

  if (counts.mainTrialEligible > counts.observed)
    fail(`${condition} main-trial-eligible projections exceed observed projections`);
  if (counts.legacy > counts.observed)
    fail(`${condition} legacy projections exceed observed projections`);
  if (counts.excludedLegacy > counts.legacy)
    fail(`${condition} excluded legacy projections exceed legacy projections`);

  if (counts.gateReconstructedLegacy > counts.legacy)
    fail(`${condition} gate-reconstructed legacy projections exceed legacy projections`);

  const notGateReconstructedLegacy = counts.legacy - counts.gateReconstructedLegacy;
  const conservativelyIneligibleLegacy = Math.min(
    counts.legacy,
    counts.excludedLegacy + notGateReconstructedLegacy,
  );
  const maximumEligible = counts.observed - conservativelyIneligibleLegacy;
  if (counts.mainTrialEligible > maximumEligible)
    fail(`${condition} eligibility counts excluded or not gate-reconstructed legacy projections`);

  return {
    notGateReconstructedLegacy,
    notGateReconstructedIncludedLegacy: Math.max(
      0,
      counts.legacy - counts.excludedLegacy - counts.gateReconstructedLegacy,
    ),
  };
}

function normalizedScenarioSemantics(scenario: ScenarioConfiguration) {
  const appendedVariantLabel = ` Variant: ${scenario.variant}.`;
  const injection = scenario.injection.endsWith(appendedVariantLabel)
    ? scenario.injection.slice(0, -appendedVariantLabel.length)
    : scenario.injection;
  return JSON.stringify({
    targetAgent: scenario.targetAgent,
    claimType: scenario.claimType,
    injection,
    expectedObservation: scenario.expectedObservation,
    groundTruth: scenario.groundTruth,
    repetitions: scenario.repetitions,
  });
}

function validateAndAuditVariants(
  scenarios: readonly ScenarioConfiguration[],
  repetitionsPerScenario: number,
) {
  const scenarioIds = new Set<string>();
  const familyVariants = new Set<string>();
  const byFamily = new Map<string, ScenarioConfiguration[]>();

  for (const scenario of scenarios) {
    assertNonEmpty(scenario.id, "scenario ID");
    assertNonEmpty(scenario.family, `family for ${scenario.id}`);
    assertNonEmpty(scenario.variant, `variant for ${scenario.id}`);
    assertNonEmpty(scenario.injection, `injection for ${scenario.id}`);
    if (scenarioIds.has(scenario.id)) fail(`duplicate scenario ID ${scenario.id}`);
    scenarioIds.add(scenario.id);

    const familyVariant = `${scenario.family}\u0000${scenario.variant}`;
    if (familyVariants.has(familyVariant))
      fail(`duplicate family/variant pair ${scenario.family}/${scenario.variant}`);
    familyVariants.add(familyVariant);

    if (scenario.repetitions !== repetitionsPerScenario)
      fail(`${scenario.id} does not match the audited candidate execution requirement`);
    const familyScenarios = byFamily.get(scenario.family) ?? [];
    familyScenarios.push(scenario);
    byFamily.set(scenario.family, familyScenarios);
  }

  const families = [...byFamily.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([family, entries]): VariantFamilyAudit => {
      const operationalProfiles = new Set(entries.map(normalizedScenarioSemantics)).size;
      return {
        family,
        nominalVariants: entries.length,
        operationalProfiles,
        appendedLabelOnly: entries.length > 1 && operationalProfiles === 1,
      };
    });

  return {
    passed: families.every((family) => family.operationalProfiles === family.nominalVariants),
    nominalVariants: scenarios.length,
    operationalProfiles: families.reduce((total, family) => total + family.operationalProfiles, 0),
    families,
  };
}

function validateSourceAvailability(availability: SourceAvailabilityAudit) {
  if (
    availability.schemaVersion !== "p26-002-source-availability-audit-0.1.0" ||
    availability.status !== "passed" ||
    availability.releaseBoundary.rawSourcesRetained !== false
  )
    fail("source availability envelope is not a passed, non-retaining audit");

  const targetRecords: Array<{
    targetId: string;
    source: RepeatExecutionSource;
    reference: string;
    fixedFaultExecutionIdentity?: string;
    fixedControlExecutionIdentity?: string;
  }> = [
    ...availability.sources.agentchaosbench.manifest.map((record) => ({
      targetId: record.targetId,
      source: "agentchaosbench" as const,
      reference: record.repositoryPath,
      fixedFaultExecutionIdentity: `agentchaosbench@${availability.sources.agentchaosbench.revision}:${record.repositoryPath}@git-sha1:${record.blobSha}`,
      fixedControlExecutionIdentity: `agentchaosbench@${availability.sources.agentchaosbench.revision}:${record.controlPath}@git-sha1:${record.controlBlobSha}`,
    })),
    ...availability.sources.agentdojo.manifest.map((record) => ({
      targetId: record.targetId,
      source: "agentdojo" as const,
      reference: record.path,
      fixedFaultExecutionIdentity: `agentdojo@${availability.sources.agentdojo.revision}:${record.path}@git-sha1:${record.blobSha}`,
    })),
    ...availability.sources["bfcl-v4"].ids.map((record) => ({
      targetId: record.targetId,
      source: "bfcl-v4" as const,
      reference: record.faultId,
    })),
    ...availability.sources["tau2-bench"].ids.map((record) => ({
      targetId: record.targetId,
      source: "tau2-bench" as const,
      reference: `${record.domain}/${record.taskId}`,
    })),
  ];

  for (const record of targetRecords) {
    assertNonEmpty(record.targetId, "source target ID");
    assertNonEmpty(record.reference, `source reference for ${record.targetId}`);
  }
  const targetIds = targetRecords.map((record) => record.targetId);
  if (new Set(targetIds).size !== targetIds.length)
    fail("source availability has duplicate targets");
  if (availability.verifiedTotal !== targetRecords.length)
    fail("verified source total does not match the source manifests");

  const controlReferences = [
    ...availability.sources.agentchaosbench.manifest.map(
      (record) =>
        `agentchaosbench@${availability.sources.agentchaosbench.revision}:${record.controlPath}`,
    ),
    ...availability.sources["bfcl-v4"].ids.map(
      (record) => `bfcl-v4@${availability.sources["bfcl-v4"].revision}:${record.controlId}`,
    ),
  ];
  for (const reference of controlReferences) assertNonEmpty(reference, "matched-control reference");

  return {
    targetCount: targetRecords.length,
    targetSourceById: new Map(targetRecords.map((record) => [record.targetId, record.source])),
    fixedFaultExecutionIdentityByTarget: new Map(
      targetRecords.flatMap((record) =>
        record.fixedFaultExecutionIdentity
          ? ([[record.targetId, record.fixedFaultExecutionIdentity]] as const)
          : [],
      ),
    ),
    fixedControlExecutionIdentityByTarget: new Map(
      targetRecords.flatMap((record) =>
        record.fixedControlExecutionIdentity
          ? ([[record.targetId, record.fixedControlExecutionIdentity]] as const)
          : [],
      ),
    ),
    lockedControlBindings: controlReferences.length,
    uniqueControlReferences: new Set(controlReferences).size,
  };
}

export function validateRepeatExecutionInventory(
  inventory: RepeatExecutionInventory,
  availability: SourceAvailabilityAudit,
  requiredExecutionsPerTarget: number,
): RepeatExecutionInventorySummary {
  const expectedKeys = [
    "executions",
    "releaseBoundary",
    "requiredIndependentExecutionsPerTarget",
    "schemaVersion",
    "scope",
    "status",
    "submissionAllowed",
  ];
  if (
    inventory.schemaVersion !== "p26-002-repeat-execution-inventory-0.1.0" ||
    inventory.status !== "observed" ||
    inventory.scope !== "pre-run-repeat-execution-identity-inventory-not-outcome-evidence" ||
    JSON.stringify(Object.keys(inventory).sort()) !== JSON.stringify(expectedKeys) ||
    !Array.isArray(inventory.executions) ||
    inventory.releaseBoundary.rawExecutionsRetained !== false ||
    inventory.submissionAllowed !== false
  )
    fail("repeat-execution inventory envelope is invalid");
  assertNonNegativeInteger(requiredExecutionsPerTarget, "required executions per target");
  if (
    requiredExecutionsPerTarget === 0 ||
    inventory.requiredIndependentExecutionsPerTarget !== requiredExecutionsPerTarget
  )
    fail("repeat-execution inventory does not match the audited candidate requirement");

  const sourceSummary = validateSourceAvailability(availability);
  const countsByConditionAndTarget: Record<RepeatExecutionCondition, Map<string, number>> = {
    fault: new Map(),
    control: new Map(),
  };
  const declaredCountsByConditionAndTarget: Record<
    RepeatExecutionCondition,
    Map<string, number>
  > = {
    fault: new Map(),
    control: new Map(),
  };
  const executionIdentities = new Set<string>();
  for (const record of inventory.executions) {
    const expectedRecordKeys =
      record.evidenceKind === "candidate-execution-declaration"
        ? ["bindings", "evidenceArtifactSha256", "evidenceKind", "executionIdentity", "source"]
        : ["bindings", "evidenceKind", "executionIdentity", "source"];
    if (JSON.stringify(Object.keys(record).sort()) !== JSON.stringify(expectedRecordKeys))
      fail("repeat-execution inventory record has unexpected fields");
    if (!Array.isArray(record.bindings) || record.bindings.length === 0)
      fail(`execution ${record.executionIdentity} must bind at least one target`);
    const bindingKeys = record.bindings.map(
      (binding) => `${binding.condition}\u0000${binding.targetId}`,
    );
    if (new Set(bindingKeys).size !== bindingKeys.length)
      fail(`execution ${record.executionIdentity} repeats a target binding`);
    for (const binding of record.bindings) {
      if (
        JSON.stringify(Object.keys(binding).sort()) !== JSON.stringify(["condition", "targetId"]) ||
        !["fault", "control"].includes(binding.condition)
      )
        fail("repeat-execution inventory binding is invalid");
      const expectedSource = sourceSummary.targetSourceById.get(binding.targetId);
      if (!expectedSource)
        fail(`repeat-execution inventory has unknown target ${binding.targetId}`);
      if (record.source !== expectedSource)
        fail(`repeat-execution inventory source mismatch for ${binding.targetId}`);
    }
    assertNonEmpty(record.executionIdentity, "execution identity");
    if (executionIdentities.has(record.executionIdentity))
      fail(`duplicate execution identity ${record.executionIdentity}`);
    executionIdentities.add(record.executionIdentity);

    if (record.evidenceKind === "fixed-upstream-artifact") {
      if (
        record.bindings.some((binding) => {
          const fixedIdentityByTarget =
            binding.condition === "fault"
              ? sourceSummary.fixedFaultExecutionIdentityByTarget
              : sourceSummary.fixedControlExecutionIdentityByTarget;
          return fixedIdentityByTarget.get(binding.targetId) !== record.executionIdentity;
        })
      )
        fail(
          `fixed upstream execution identity mismatch for ${record.bindings
            .map((binding) => binding.targetId)
            .join(",")}`,
        );
    } else if (record.evidenceKind === "candidate-execution-declaration") {
      if (!/^sha256:[0-9a-f]{64}$/.test(record.executionIdentity))
        fail(
          `candidate execution identity is invalid for ${record.bindings
            .map((binding) => binding.targetId)
            .join(",")}`,
        );
      if (!/^[0-9a-f]{64}$/.test(record.evidenceArtifactSha256))
        fail("candidate execution declaration lacks a pinned evidence-artifact hash");
      if (record.bindings.length !== 1)
        fail("a candidate execution cannot be reused across target bindings");
    } else {
      fail("repeat-execution evidence kind is invalid");
    }

    for (const binding of record.bindings) {
      const declaredCountsByTarget = declaredCountsByConditionAndTarget[binding.condition];
      const nextDeclaredCount = (declaredCountsByTarget.get(binding.targetId) ?? 0) + 1;
      if (nextDeclaredCount > requiredExecutionsPerTarget)
        fail(`${binding.condition} ${binding.targetId} exceeds the candidate execution count`);
      declaredCountsByTarget.set(binding.targetId, nextDeclaredCount);
      if (record.evidenceKind === "fixed-upstream-artifact") {
        const countsByTarget = countsByConditionAndTarget[binding.condition];
        countsByTarget.set(binding.targetId, (countsByTarget.get(binding.targetId) ?? 0) + 1);
      }
    }
  }

  function summarizeCondition(
    condition: RepeatExecutionCondition,
  ): ConditionRepeatExecutionSummary {
    const records = inventory.executions.filter((record) =>
      record.bindings.some((binding) => binding.condition === condition),
    );
    const countsByTarget = countsByConditionAndTarget[condition];
    const executionCounts = [...sourceSummary.targetSourceById.keys()].map((targetId) => ({
      targetId,
      count: countsByTarget.get(targetId) ?? 0,
    }));
    const fixedRecords = records.filter(
      (record) => record.evidenceKind === "fixed-upstream-artifact",
    );
    const declaredCandidateRecords = records.filter(
      (record) => record.evidenceKind === "candidate-execution-declaration",
    );
    const fixedSingleTargets = new Set(
      fixedRecords.flatMap((record) =>
        record.bindings
          .filter((binding) => binding.condition === condition)
          .map((binding) => binding.targetId)
          .filter((targetId) => countsByTarget.get(targetId) === 1),
      ),
    );
    return {
      uniqueExecutionIdentities: fixedRecords.length,
      executionBindings: fixedRecords.reduce(
        (total, record) =>
          total + record.bindings.filter((binding) => binding.condition === condition).length,
        0,
      ),
      fixedUpstreamExecutionIdentities: fixedRecords.length,
      declaredCandidateExecutionIdentities: declaredCandidateRecords.length,
      gateVerifiedCandidateExecutionIdentities: 0,
      reusedExecutionBindings: fixedRecords.reduce(
        (total, record) =>
          total +
          Math.max(
            0,
            record.bindings.filter((binding) => binding.condition === condition).length - 1,
          ),
        0,
      ),
      targetsMeetingRequiredExecutions: executionCounts.filter(
        ({ count }) => count === requiredExecutionsPerTarget,
      ).length,
      fixedUpstreamSingleExecutionTargets: fixedSingleTargets.size,
      otherPartiallyPopulatedTargets: executionCounts.filter(
        ({ targetId, count }) =>
          count > 0 && count < requiredExecutionsPerTarget && !fixedSingleTargets.has(targetId),
      ).length,
      targetsWithoutAnyExecution: executionCounts.filter(({ count }) => count === 0).length,
    };
  }

  return {
    targetCount: sourceSummary.targetCount,
    requiredExecutionsPerTarget,
    observedUniqueExecutionIdentities: inventory.executions.filter(
      (record) => record.evidenceKind === "fixed-upstream-artifact",
    ).length,
    crossConditionExecutionIdentities: inventory.executions.filter(
      (record) =>
        record.evidenceKind === "fixed-upstream-artifact" &&
        new Set(record.bindings.map((binding) => binding.condition)).size > 1,
    ).length,
    fault: summarizeCondition("fault"),
    control: summarizeCondition("control"),
  };
}

export function buildDesignValidityAudit(inputs: DesignValidityInputs): DesignValidityAudit {
  const {
    scenarios,
    sourceAvailability,
    projectionCounts,
    repetitionPlan,
    repeatExecutionInventory,
  } = inputs;
  if (scenarios.length !== 80)
    fail(`the audited candidate matrix must contain 80 slots, found ${scenarios.length}`);

  assertNonNegativeInteger(repetitionPlan.repetitionsPerScenario, "repetitions per scenario");
  assertNonNegativeInteger(repetitionPlan.matchedControlCount, "matched-control count");
  assertNonNegativeInteger(
    repetitionPlan.totalSharedExecutionArtifacts,
    "total shared execution artifacts",
  );
  if (repetitionPlan.repetitionsPerScenario !== 20)
    fail("the audited candidate matrix must retain 20 required executions per slot");
  if (repetitionPlan.matchedControlCount !== scenarios.length)
    fail("the matched-control count must equal the scenario count");
  const requiredSharedExecutionArtifacts =
    (scenarios.length + repetitionPlan.matchedControlCount) * repetitionPlan.repetitionsPerScenario;
  if (repetitionPlan.totalSharedExecutionArtifacts !== requiredSharedExecutionArtifacts)
    fail("shared execution-artifact count is inconsistent with slots and repetitions");
  const variantOperationalization = validateAndAuditVariants(
    scenarios,
    repetitionPlan.repetitionsPerScenario,
  );
  const sourceSummary = validateSourceAvailability(sourceAvailability);
  if (sourceSummary.targetCount !== scenarios.length)
    fail("source-unit count does not match the audited candidate slot count");
  const executionInventorySummary = validateRepeatExecutionInventory(
    repeatExecutionInventory,
    sourceAvailability,
    repetitionPlan.repetitionsPerScenario,
  );

  const faultLegacyValidity = validateProjectionCounts(projectionCounts.fault, "fault");
  const controlLegacyValidity = validateProjectionCounts(projectionCounts.control, "control");

  const executionRepetitionSupport = {
    passed:
      executionInventorySummary.fault.targetsMeetingRequiredExecutions ===
        sourceSummary.targetCount &&
      executionInventorySummary.control.targetsMeetingRequiredExecutions ===
        sourceSummary.targetCount &&
      executionInventorySummary.fault.reusedExecutionBindings === 0 &&
      executionInventorySummary.control.reusedExecutionBindings === 0 &&
      executionInventorySummary.crossConditionExecutionIdentities === 0,
    targetCount: sourceSummary.targetCount,
    requiredExecutionsPerTarget: repetitionPlan.repetitionsPerScenario,
    requiredSharedExecutionArtifacts,
    observedUniqueExecutionIdentities: executionInventorySummary.observedUniqueExecutionIdentities,
    crossConditionExecutionIdentities: executionInventorySummary.crossConditionExecutionIdentities,
    fault: executionInventorySummary.fault,
    control: executionInventorySummary.control,
  };
  const matchedControlIndependence = {
    passed:
      sourceSummary.lockedControlBindings === repetitionPlan.matchedControlCount &&
      sourceSummary.uniqueControlReferences === sourceSummary.lockedControlBindings,
    requiredBindings: repetitionPlan.matchedControlCount,
    lockedBindings: sourceSummary.lockedControlBindings,
    uniqueReferences: sourceSummary.uniqueControlReferences,
    reusedBindings: sourceSummary.lockedControlBindings - sourceSummary.uniqueControlReferences,
  };
  const legacyProjectionEligibility = {
    passed:
      projectionCounts.fault.mainTrialEligible >= scenarios.length &&
      projectionCounts.control.mainTrialEligible >= repetitionPlan.matchedControlCount &&
      faultLegacyValidity.notGateReconstructedIncludedLegacy === 0 &&
      controlLegacyValidity.notGateReconstructedIncludedLegacy === 0,
    required: { fault: scenarios.length, control: repetitionPlan.matchedControlCount },
    observed: {
      fault: projectionCounts.fault.observed,
      control: projectionCounts.control.observed,
    },
    mainTrialEligible: {
      fault: projectionCounts.fault.mainTrialEligible,
      control: projectionCounts.control.mainTrialEligible,
    },
    legacy: { fault: projectionCounts.fault.legacy, control: projectionCounts.control.legacy },
    excludedLegacy: {
      fault: projectionCounts.fault.excludedLegacy,
      control: projectionCounts.control.excludedLegacy,
    },
    gateReconstructedLegacy: {
      fault: projectionCounts.fault.gateReconstructedLegacy,
      control: projectionCounts.control.gateReconstructedLegacy,
    },
    notGateReconstructedLegacy: {
      fault: faultLegacyValidity.notGateReconstructedLegacy,
      control: controlLegacyValidity.notGateReconstructedLegacy,
    },
    notGateReconstructedIncludedLegacy: {
      fault: faultLegacyValidity.notGateReconstructedIncludedLegacy,
      control: controlLegacyValidity.notGateReconstructedIncludedLegacy,
    },
  };
  const sourceExecutionDerivation = {
    passed: SOURCE_EXECUTION_DERIVATION_CAPABILITY.readinessEvidenceAllowed,
    capabilityStatus: SOURCE_EXECUTION_DERIVATION_CAPABILITY.status,
    fixedUpstreamVerification: SOURCE_EXECUTION_DERIVATION_CAPABILITY.fixedUpstreamVerification,
    controlledRunVerification: SOURCE_EXECUTION_DERIVATION_CAPABILITY.controlledRunVerification,
    readinessEvidenceAllowed: SOURCE_EXECUTION_DERIVATION_CAPABILITY.readinessEvidenceAllowed,
  };

  const blockers: DesignValidityBlocker[] = [];
  if (!variantOperationalization.passed)
    blockers.push({
      code: "non-operational-variants",
      message: `${variantOperationalization.nominalVariants} nominal scenarios collapse to ${variantOperationalization.operationalProfiles} operational semantic profiles after appended variant labels are removed.`,
    });
  if (!executionRepetitionSupport.passed)
    blockers.push({
      code: "static-target-repeat-mismatch",
      message: `The design requires ${executionRepetitionSupport.requiredExecutionsPerTarget} independent fault and matched-control executions per target (${executionRepetitionSupport.requiredSharedExecutionArtifacts} shared execution artifacts across evaluator modes). Fault inventory: ${executionRepetitionSupport.fault.targetsMeetingRequiredExecutions}/${executionRepetitionSupport.targetCount} targets complete, ${executionRepetitionSupport.fault.fixedUpstreamSingleExecutionTargets} have exactly one fixed upstream execution, and ${executionRepetitionSupport.fault.targetsWithoutAnyExecution} have none. Control inventory: ${executionRepetitionSupport.control.targetsMeetingRequiredExecutions}/${executionRepetitionSupport.targetCount} targets complete, ${executionRepetitionSupport.control.fixedUpstreamSingleExecutionTargets} bind one fixed upstream execution, ${executionRepetitionSupport.control.targetsWithoutAnyExecution} have none, and ${executionRepetitionSupport.control.reusedExecutionBindings} bindings reuse an execution identity. ${executionRepetitionSupport.crossConditionExecutionIdentities} physical identities are bound in both fault and control conditions. Candidate declarations (${executionRepetitionSupport.fault.declaredCandidateExecutionIdentities} fault, ${executionRepetitionSupport.control.declaredCandidateExecutionIdentities} control) do not count until gate-side evidence verification is implemented.`,
    });
  if (!matchedControlIndependence.passed)
    blockers.push({
      code: "reused-matched-control-inputs",
      message: `${matchedControlIndependence.lockedBindings} locked matched-control bindings resolve to ${matchedControlIndependence.uniqueReferences} unique references for ${matchedControlIndependence.requiredBindings} required controls.`,
    });
  if (!legacyProjectionEligibility.passed)
    blockers.push({
      code: "ineligible-legacy-projections",
      message: `Main-trial-eligible projection coverage is ${legacyProjectionEligibility.mainTrialEligible.fault}/${legacyProjectionEligibility.required.fault} fault and ${legacyProjectionEligibility.mainTrialEligible.control}/${legacyProjectionEligibility.required.control} control; ${legacyProjectionEligibility.excludedLegacy.fault + legacyProjectionEligibility.excludedLegacy.control} legacy projections are excluded, and ${legacyProjectionEligibility.notGateReconstructedLegacy.fault + legacyProjectionEligibility.notGateReconstructedLegacy.control} legacy projections were not reconstructed by the gate from pinned source-execution and canonical projection bytes.`,
    });
  if (!sourceExecutionDerivation.passed)
    blockers.push({
      code: "unverified-source-execution-derivation",
      message:
        "The gate now fetches exact fixed upstream bytes, verifies their Git blob SHA, and reruns the deterministic source adapter. Controlled BFCL and tau2 executions and AgentDojo/tau2 controls still cannot be promoted until the gate reexecutes the pinned runner or verifies a precommitted trusted-runner attestation over the exact inputs and execution hash.",
    });

  const designChecksPassed = 5 - blockers.length;
  return {
    schemaVersion: "p26-002-design-validity-audit-0.3.0",
    status: blockers.length === 0 ? "valid" : "blocked",
    scope: "design-validity-only-no-human-approval-or-main-trial-evidence",
    checks: {
      variantOperationalization,
      executionRepetitionSupport,
      matchedControlIndependence,
      legacyProjectionEligibility,
      sourceExecutionDerivation,
    },
    summary: {
      scenarios: scenarios.length,
      sourceUnits: sourceSummary.targetCount,
      designChecksPassed,
      designChecksBlocked: blockers.length,
    },
    blockers,
    designValidityPassed: blockers.length === 0,
    humanApprovalEvaluated: false,
    mainTrialAllowed: false,
    submissionAllowed: false,
  };
}
