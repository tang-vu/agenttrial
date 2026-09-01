import type {
  ControlProjectionRecord,
  ControlSourceRecord,
  IndependentTargetEntry,
  ProjectionRecord,
  SourceAvailabilityAudit,
} from "./target-binding";
import type { ControlExecutionContractArtifact } from "./control-execution-contracts";
import { controlExecutionContractForTarget } from "./control-execution-contracts";

interface AgentChaosProjectionRecord extends ProjectionRecord {
  blobSha: string;
  forbiddenKeyCount: number;
}

export interface AgentChaosProjectionAudit {
  schemaVersion: string;
  status: string;
  readinessEligible: false;
  exclusionReason: string;
  adapterSchemaVersion: string;
  source: { revision: string };
  selected: number;
  passed: number;
  labelBlindChecks: {
    forbiddenKeyCount: number;
    structuralGroundTruthRemoved: boolean;
    uniqueLockedIdentifiersRejected: boolean;
    naturalObservableTermsPermitted: boolean;
  };
  projections: AgentChaosProjectionRecord[];
  releaseBoundary: { rawSourcesRetained: boolean };
}

interface AgentDojoProjectionRecord extends ProjectionRecord {
  blobSha: string;
  forbiddenKeyCount: number;
  upstreamSecurity: boolean;
}

export interface AgentDojoProjectionAudit {
  schemaVersion: string;
  status: string;
  readinessEligible: false;
  exclusionReason: string;
  source: { revision: string };
  selected: number;
  passed: number;
  upstreamSecurityFalse: number;
  labelBlindChecks: {
    forbiddenKeyCount: number;
    attackSetupExcluded: boolean;
    utilityAndSecurityExcludedFromEvaluatorInput: boolean;
    sourceIdentifiersExcluded: boolean;
  };
  projections: AgentDojoProjectionRecord[];
  releaseBoundary: { rawSourcesRetained: boolean };
}

export interface ProjectionEvidenceArtifact {
  path: string;
  sha256: string;
}

export interface RemainingProjectionAudit {
  schemaVersion: string;
  status: "pending" | "partial" | "passed";
  expected: { fault: number; control: number };
  verified: { fault: number; control: number };
  labelBlindChecks: {
    fault: boolean;
    control: boolean;
    sourceBound: boolean;
    targetControlPairBound: boolean;
  };
  faultProjections: Array<
    ProjectionRecord & {
      sourceExecutionReference: string;
      sourceExecutionSha256: string;
      evidenceArtifactSha256: string;
    }
  >;
  controlProjections: Array<
    ControlProjectionRecord & {
      sourceExecutionReference: string;
      sourceExecutionSha256: string;
      evidenceArtifactSha256: string;
    }
  >;
  evidenceArtifacts: ProjectionEvidenceArtifact[];
  releaseBoundary: { rawSourcesRetained: boolean };
  submissionAllowed: false;
}

export interface RemainingControlSourceAudit {
  schemaVersion: string;
  status: "pending" | "passed";
  expected: number;
  verified: number;
  controlContracts: {
    path: "research/targets/control-execution-contracts.json";
    required: 20;
  };
  controls: Array<ControlSourceRecord & { evidenceArtifactSha256: string }>;
  evidenceArtifacts: ProjectionEvidenceArtifact[];
  releaseBoundary: { rawExecutionsRetained: boolean };
  submissionAllowed: false;
}

function fail(message: string): never {
  throw new Error(`Projection audit validation failed: ${message}`);
}

function assertExactIds(actual: string[], expected: string[], description: string) {
  const actualSorted = [...actual].sort();
  const expectedSorted = [...expected].sort();
  if (
    actualSorted.length !== new Set(actualSorted).size ||
    JSON.stringify(actualSorted) !== JSON.stringify(expectedSorted)
  )
    fail(`${description} do not match the frozen source partition`);
}

function assertProjectionHashes(records: ProjectionRecord[], description: string) {
  for (const record of records) {
    if (!/^[0-9a-f]{64}$/.test(record.projectionHash))
      fail(`${description} has an invalid projection hash for ${record.targetId}`);
  }
}

export function excludeReplacedLegacyProjectionHashes(
  legacy: ProjectionRecord[],
  gateReconstructed: ProjectionRecord[],
) {
  const gateReconstructedTargetIds = new Set(gateReconstructed.map((record) => record.targetId));
  return legacy.filter((record) => !gateReconstructedTargetIds.has(record.targetId));
}

export function validateAgentChaosProjectionAudit(
  audit: AgentChaosProjectionAudit,
  availability: SourceAvailabilityAudit,
  targets: IndependentTargetEntry[],
) {
  if (
    audit.schemaVersion !== "p26-002-agentchaos-projection-audit-0.1.0" ||
    audit.status !== "passed" ||
    audit.readinessEligible !== false ||
    audit.exclusionReason.trim() === "" ||
    audit.adapterSchemaVersion !== "p26-002-evaluator-projection-0.1.0" ||
    audit.source.revision !== availability.sources.agentchaosbench.revision ||
    audit.selected !== 50 ||
    audit.passed !== 50 ||
    audit.projections.length !== 50 ||
    audit.labelBlindChecks.forbiddenKeyCount !== 0 ||
    audit.labelBlindChecks.structuralGroundTruthRemoved !== true ||
    audit.labelBlindChecks.uniqueLockedIdentifiersRejected !== true ||
    audit.labelBlindChecks.naturalObservableTermsPermitted !== true ||
    audit.releaseBoundary.rawSourcesRetained !== false
  )
    fail("AgentChaosBench audit envelope is not the frozen 50/50 label-blind pass");

  const expectedTargets = targets
    .filter((target) => target.source === "agentchaosbench")
    .map((target) => target.targetId);
  assertExactIds(
    audit.projections.map((record) => record.targetId),
    expectedTargets,
    "AgentChaosBench projection IDs",
  );
  assertProjectionHashes(audit.projections, "AgentChaosBench audit");
  const availabilityByTarget = new Map(
    availability.sources.agentchaosbench.manifest.map((record) => [record.targetId, record]),
  );
  for (const record of audit.projections) {
    if (
      record.forbiddenKeyCount !== 0 ||
      availabilityByTarget.get(record.targetId)?.blobSha !== record.blobSha
    )
      fail(`AgentChaosBench record ${record.targetId} is not source-bound and label-blind`);
  }
  return audit.projections;
}

export function validateAgentDojoProjectionAudit(
  audit: AgentDojoProjectionAudit,
  availability: SourceAvailabilityAudit,
  targets: IndependentTargetEntry[],
) {
  if (
    audit.schemaVersion !== "p26-002-agentdojo-projection-audit-0.1.0" ||
    audit.status !== "passed" ||
    audit.readinessEligible !== false ||
    audit.exclusionReason.trim() === "" ||
    audit.source.revision !== availability.sources.agentdojo.revision ||
    audit.selected !== 10 ||
    audit.passed !== 10 ||
    audit.upstreamSecurityFalse !== 10 ||
    audit.projections.length !== 10 ||
    audit.labelBlindChecks.forbiddenKeyCount !== 0 ||
    audit.labelBlindChecks.attackSetupExcluded !== true ||
    audit.labelBlindChecks.utilityAndSecurityExcludedFromEvaluatorInput !== true ||
    audit.labelBlindChecks.sourceIdentifiersExcluded !== true ||
    audit.releaseBoundary.rawSourcesRetained !== false
  )
    fail("AgentDojo audit envelope is not the frozen 10/10 label-blind pass");

  const expectedTargets = targets
    .filter((target) => target.source === "agentdojo")
    .map((target) => target.targetId);
  assertExactIds(
    audit.projections.map((record) => record.targetId),
    expectedTargets,
    "AgentDojo projection IDs",
  );
  assertProjectionHashes(audit.projections, "AgentDojo audit");
  const availabilityByTarget = new Map(
    availability.sources.agentdojo.manifest.map((record) => [record.targetId, record]),
  );
  for (const record of audit.projections) {
    if (
      record.forbiddenKeyCount !== 0 ||
      record.upstreamSecurity !== false ||
      availabilityByTarget.get(record.targetId)?.blobSha !== record.blobSha
    )
      fail(`AgentDojo record ${record.targetId} is not source-bound and label-blind`);
  }
  return audit.projections;
}

export function validateRemainingProjectionAudit(
  audit: RemainingProjectionAudit,
  targets: IndependentTargetEntry[],
) {
  if (
    audit.schemaVersion !== "p26-002-remaining-projection-audit-0.3.0" ||
    !["pending", "partial", "passed"].includes(audit.status) ||
    audit.expected.fault !== 80 ||
    audit.expected.control !== 80 ||
    audit.releaseBoundary.rawSourcesRetained !== false ||
    audit.submissionAllowed !== false
  )
    fail("remaining projection audit envelope is invalid");
  if (
    audit.verified.fault !== audit.faultProjections.length ||
    audit.verified.control !== audit.controlProjections.length
  )
    fail("remaining projection verified counts do not match their records");

  if (audit.status === "pending") {
    if (
      audit.faultProjections.length !== 0 ||
      audit.controlProjections.length !== 0 ||
      audit.evidenceArtifacts.length !== 0
    )
      fail("pending remaining projection audit cannot contribute evidence");
    return { faultProjections: [], controlProjections: [], evidenceArtifacts: [] };
  }

  if (
    (audit.status === "passed" &&
      (audit.faultProjections.length !== 80 || audit.controlProjections.length !== 80)) ||
    (audit.status === "partial" &&
      (audit.faultProjections.length + audit.controlProjections.length === 0 ||
        (audit.faultProjections.length === 80 && audit.controlProjections.length === 80))) ||
    audit.evidenceArtifacts.length === 0 ||
    JSON.stringify(Object.keys(audit.labelBlindChecks).sort()) !==
      JSON.stringify(["control", "fault", "sourceBound", "targetControlPairBound"]) ||
    audit.labelBlindChecks.sourceBound !== true ||
    audit.labelBlindChecks.fault !== audit.faultProjections.length > 0 ||
    audit.labelBlindChecks.control !== audit.controlProjections.length > 0 ||
    (audit.controlProjections.length > 0 &&
      audit.labelBlindChecks.targetControlPairBound !== true) ||
    (audit.controlProjections.length === 0 &&
      audit.labelBlindChecks.targetControlPairBound !== false)
  )
    fail("remaining projection evidence is not a valid partial or complete gate pass");
  const targetIds = new Set(targets.map((target) => target.targetId));
  for (const [description, records] of [
    ["remaining fault projection IDs", audit.faultProjections],
    ["matched-control projection target IDs", audit.controlProjections],
  ] as const) {
    const ids = records.map((record) => record.targetId);
    if (new Set(ids).size !== ids.length || ids.some((targetId) => !targetIds.has(targetId)))
      fail(`${description} are duplicated or outside the frozen source partition`);
  }
  assertProjectionHashes(audit.faultProjections, "remaining fault audit");
  assertProjectionHashes(audit.controlProjections, "matched-control audit");
  for (const record of [...audit.faultProjections, ...audit.controlProjections]) {
    if (
      record.sourceExecutionReference.trim() === "" ||
      !/^[0-9a-f]{64}$/.test(record.sourceExecutionSha256)
    )
      fail(`projection ${record.targetId} is not bound to a source execution`);
  }
  for (const evidence of audit.evidenceArtifacts) {
    if (
      !/^research\/targets\/evidence\/[A-Za-z0-9._/-]+$/.test(evidence.path) ||
      evidence.path.includes("..") ||
      !/^[0-9a-f]{64}$/.test(evidence.sha256)
    )
      fail("remaining projection evidence artifact reference is invalid");
  }
  const evidenceHashes = new Set(audit.evidenceArtifacts.map((evidence) => evidence.sha256));
  if (evidenceHashes.size !== audit.evidenceArtifacts.length)
    fail("remaining projection evidence artifact hashes are not unique");
  if (
    [...audit.faultProjections, ...audit.controlProjections].some(
      (record) => !evidenceHashes.has(record.evidenceArtifactSha256),
    )
  )
    fail("remaining projection record is not bound to a pinned evidence artifact");
  const usedEvidenceHashes = new Set(
    [...audit.faultProjections, ...audit.controlProjections].map(
      (record) => record.evidenceArtifactSha256,
    ),
  );
  if (usedEvidenceHashes.size !== evidenceHashes.size)
    fail("remaining projection audit lists an unused evidence artifact");
  return {
    faultProjections: audit.faultProjections,
    controlProjections: audit.controlProjections,
    evidenceArtifacts: audit.evidenceArtifacts,
  };
}

export function validateRemainingControlSourceAudit(
  audit: RemainingControlSourceAudit,
  targets: IndependentTargetEntry[],
  contracts: ControlExecutionContractArtifact,
) {
  if (
    audit.schemaVersion !== "p26-002-remaining-control-source-audit-0.2.0" ||
    !["pending", "passed"].includes(audit.status) ||
    audit.expected !== 20 ||
    audit.verified !== audit.controls.length ||
    audit.controlContracts.path !== "research/targets/control-execution-contracts.json" ||
    audit.controlContracts.required !== 20 ||
    audit.releaseBoundary.rawExecutionsRetained !== false ||
    audit.submissionAllowed !== false
  )
    fail("remaining control source audit envelope is invalid");
  if (audit.status === "pending") {
    if (audit.controls.length !== 0 || audit.evidenceArtifacts.length !== 0)
      fail("pending remaining control source audit cannot contribute evidence");
    return { controls: [], evidenceArtifacts: [] };
  }

  if (audit.controls.length !== 20 || audit.evidenceArtifacts.length === 0)
    fail("passed remaining control source audit is not the complete 20/20 pass");
  const expectedTargets = targets
    .filter((target) => target.source === "agentdojo" || target.source === "tau2-bench")
    .map((target) => target.targetId);
  assertExactIds(
    audit.controls.map((record) => record.targetId),
    expectedTargets,
    "remaining control source IDs",
  );
  for (const record of audit.controls) {
    const contract = controlExecutionContractForTarget(contracts, record.targetId);
    if (
      record.controlConfigurationId !== contract.controlConfigurationId ||
      record.controlExecutionContractSha256 !== contract.contractSha256 ||
      record.reference.trim() === "" ||
      !/^[0-9a-f]{64}$/.test(record.artifactSha256)
    )
      fail(`remaining control source ${record.targetId} has invalid evidence`);
  }
  for (const evidence of audit.evidenceArtifacts) {
    if (
      !/^research\/targets\/evidence\/[A-Za-z0-9._/-]+$/.test(evidence.path) ||
      evidence.path.includes("..") ||
      !/^[0-9a-f]{64}$/.test(evidence.sha256)
    )
      fail("remaining control source evidence artifact reference is invalid");
  }
  const evidenceHashes = new Set(audit.evidenceArtifacts.map((evidence) => evidence.sha256));
  if (evidenceHashes.size !== audit.evidenceArtifacts.length)
    fail("remaining control source evidence artifact hashes are not unique");
  if (audit.controls.some((record) => !evidenceHashes.has(record.evidenceArtifactSha256)))
    fail("remaining control source record is not bound to a pinned evidence artifact");
  if (
    new Set(audit.controls.map((record) => record.evidenceArtifactSha256)).size !==
    evidenceHashes.size
  )
    fail("remaining control source audit lists an unused evidence artifact");
  return { controls: audit.controls, evidenceArtifacts: audit.evidenceArtifacts };
}
