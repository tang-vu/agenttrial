import { createHash } from "node:crypto";
import type {
  ControlConfiguration,
  FaultFamily,
  ScenarioConfiguration,
  ScenarioVariant,
} from "./index";
import type { DesignValidityAudit } from "./design-validity";

export type HumanGateStatus = "pending-human-review" | "approved" | "rejected";
export type InputState = "locked" | "condition-only" | "missing";
export type ProjectionState = "ready" | "missing" | "excluded-not-gate-reconstructed";

interface BaseTargetEntry {
  targetId: string;
  family: FaultFamily;
  source: string;
  groundTruthAuthority: string;
}

export interface AgentChaosTargetEntry extends BaseTargetEntry {
  source: "agentchaosbench";
  repositoryPath: string;
  controlPath: string;
}

export interface AgentDojoTargetEntry extends BaseTargetEntry {
  source: "agentdojo";
  suite: string;
  benchmarkVersion: "v1.2.2";
  userTask: string;
  injectionTask: string;
  controlCondition: string;
}

export interface BfclTargetEntry extends BaseTargetEntry {
  source: "bfcl-v4";
  faultId: string;
  controlId: string;
  questionBlobSha: string;
  answerBlobSha: string;
  controlQuestionBlobSha: string;
  controlAnswerBlobSha: string;
}

export interface Tau2TargetEntry extends BaseTargetEntry {
  source: "tau2-bench";
  domain: "airline" | "retail";
  taskId: string;
  taskBlobSha: string;
  nlAssertions: string[] | null;
  rewardBasis: string[];
  auditIssue: "https://github.com/sierra-research/tau2-bench/issues/384";
  controlCondition: string;
}

export type IndependentTargetEntry =
  | AgentChaosTargetEntry
  | AgentDojoTargetEntry
  | BfclTargetEntry
  | Tau2TargetEntry;

export interface SourceAvailabilityAudit {
  schemaVersion: "p26-002-source-availability-audit-0.1.0";
  status: string;
  verifiedTotal: number;
  sources: {
    agentchaosbench: {
      revision: string;
      manifest: Array<{
        targetId: string;
        repositoryPath: string;
        blobSha: string;
        controlPath: string;
        controlBlobSha: string;
      }>;
    };
    agentdojo: {
      revision: string;
      manifest: Array<{ targetId: string; path: string; blobSha: string }>;
    };
    "bfcl-v4": {
      revision: string;
      ids: Array<{ targetId: string; faultId: string; controlId: string }>;
    };
    "tau2-bench": {
      revision: string;
      ids: Array<{ targetId: string; domain: string; taskId: string }>;
    };
  };
  releaseBoundary: { rawSourcesRetained: false };
}

export interface ProjectionRecord {
  targetId: string;
  projectionHash: string;
}

export interface ControlProjectionRecord extends ProjectionRecord {
  controlConfigurationId: string;
}

export interface ControlSourceRecord {
  targetId: string;
  controlConfigurationId: string;
  controlExecutionContractSha256: string;
  reference: string;
  artifactSha256: string;
}

export interface HumanGate {
  status: HumanGateStatus;
  decidedBy: string | null;
  decidedOn: string | null;
  evidence: {
    path: string;
    sha256: string;
    mainTrialInputDigest: string;
  } | null;
}

export interface G3Governance {
  schemaVersion: "p26-002-g3-human-approval-0.1.0";
  status: HumanGateStatus;
  humanOnly: true;
  gates: {
    constructMappingReview: HumanGate;
    targetAuthorization: HumanGate;
    dataGovernance: HumanGate;
    releaseBoundary: HumanGate;
  };
  releaseAllowed: false;
  submissionAllowed: false;
}

export interface MethodFreezeApproval {
  schemaVersion: "p26-002-method-freeze-human-approval-0.1.0";
  status: HumanGateStatus;
  humanOnly: true;
  decision: HumanGate;
  releaseAllowed: false;
  submissionAllowed: false;
}

export type ConstructReviewDecision = "approve" | "reject" | null;

export interface ConstructReviewPacket {
  schemaVersion: "p26-002-construct-review-packet-0.1.0";
  status: HumanGateStatus;
  humanOnly: true;
  rows: Array<{
    targetId: string;
    family: FaultFamily;
    source: IndependentTargetEntry["source"];
    targetDescriptorSha256: string;
    scenarioDescriptorSha256: string;
    targetDescriptor: IndependentTargetEntry;
    scenarioDescriptor: {
      fault: ScenarioConfiguration;
      control: ControlConfiguration;
    };
    proposedFaultConfigurationId: string;
    proposedControlConfigurationId: string;
    proposedScenarioVariant: ScenarioVariant;
    bindingMethod: "provisional-family-order-review-required";
    reviewerA: { decision: ConstructReviewDecision; reviewer: string | null; notes: string | null };
    reviewerB: { decision: ConstructReviewDecision; reviewer: string | null; notes: string | null };
    adjudication: {
      decision: ConstructReviewDecision;
      adjudicator: string | null;
      notes: string | null;
    };
  }>;
  releaseAllowed: false;
  submissionAllowed: false;
}

export interface TargetBinding {
  targetId: string;
  family: FaultFamily;
  source: IndependentTargetEntry["source"];
  targetDescriptorSha256: string;
  scenarioDescriptorSha256: string;
  faultConfigurationId: string;
  controlConfigurationId: string;
  scenarioVariant: ScenarioVariant;
  bindingMethod: "provisional-family-order-review-required";
  constructReviewStatus: HumanGateStatus;
  sourceEvidence: {
    faultInput: { state: InputState; reference: string | null };
    controlInput: { state: InputState; reference: string | null };
    faultProjection: { state: ProjectionState; sha256: string | null };
    controlProjection: { state: ProjectionState; sha256: string | null };
  };
}

export interface TargetBindingAudit {
  schemaVersion: "p26-002-target-binding-audit-0.3.0";
  status: "blocked" | "ready";
  scope: "pre-run-binding-and-readiness-audit-not-main-study-evidence";
  bindings: TargetBinding[];
  summary: {
    bindings: number;
    uniqueTargets: number;
    faultBindingsWithPinnedInput: number;
    uniqueFaultInputsPinned: number;
    controlBindingsWithPinnedInput: number;
    uniqueControlInputsPinned: number;
    reusedControlBindings: number;
    controlConditionsOnly: number;
    legacyFaultProjectionHashesExcluded: number;
    faultProjectionsReady: number;
    controlProjectionsReady: number;
    constructMappingsApproved: number;
    constructMappingsPending: number;
    constructMappingsRejected: number;
  };
  blockers: string[];
  mainTrialAllowed: boolean;
  submissionAllowed: false;
}

function fail(message: string): never {
  throw new Error(`Target binding audit failed: ${message}`);
}

function targetDescriptorSha256(entry: IndependentTargetEntry) {
  return sha256Canonical(entry);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Canonical(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function numericTargetId(targetId: string) {
  const match = /^ext-(\d{3})$/.exec(targetId);
  if (!match?.[1]) fail(`invalid target ID ${targetId}`);
  return Number(match[1]);
}

function exactlyOne<T>(items: T[], description: string): T {
  if (items.length !== 1) fail(`expected one ${description}, found ${items.length}`);
  return items[0]!;
}

function sourceEvidence(
  entry: IndependentTargetEntry,
  controlConfigurationId: string,
  availability: SourceAvailabilityAudit,
  supplementalControlByBinding: ReadonlyMap<string, ControlSourceRecord>,
): Pick<TargetBinding["sourceEvidence"], "faultInput" | "controlInput"> {
  if (entry.source === "agentchaosbench") {
    const record = exactlyOne(
      availability.sources.agentchaosbench.manifest.filter(
        (item) => item.targetId === entry.targetId,
      ),
      `AgentChaosBench availability record for ${entry.targetId}`,
    );
    if (record.repositoryPath !== entry.repositoryPath || record.controlPath !== entry.controlPath)
      fail(`AgentChaosBench source path drift for ${entry.targetId}`);
    return {
      faultInput: { state: "locked", reference: `${record.repositoryPath}@${record.blobSha}` },
      controlInput: {
        state: "locked",
        reference: `${record.controlPath}@${record.controlBlobSha}`,
      },
    };
  }

  if (entry.source === "agentdojo") {
    const record = exactlyOne(
      availability.sources.agentdojo.manifest.filter((item) => item.targetId === entry.targetId),
      `AgentDojo availability record for ${entry.targetId}`,
    );
    const expectedPath = `runs/command-r-plus/${entry.suite}/${entry.userTask}/important_instructions/${entry.injectionTask}.json`;
    if (record.path !== expectedPath) fail(`AgentDojo source path drift for ${entry.targetId}`);
    const control = supplementalControlByBinding.get(
      controlProjectionKey(entry.targetId, controlConfigurationId),
    );
    return {
      faultInput: { state: "locked", reference: `${record.path}@${record.blobSha}` },
      controlInput: control
        ? { state: "locked", reference: `${control.reference}@${control.artifactSha256}` }
        : { state: "condition-only", reference: entry.controlCondition },
    };
  }

  if (entry.source === "bfcl-v4") {
    const record = exactlyOne(
      availability.sources["bfcl-v4"].ids.filter((item) => item.targetId === entry.targetId),
      `BFCL availability record for ${entry.targetId}`,
    );
    if (record.faultId !== entry.faultId || record.controlId !== entry.controlId)
      fail(`BFCL source ID drift for ${entry.targetId}`);
    return {
      faultInput: {
        state: "locked",
        reference: `${entry.faultId}@${entry.questionBlobSha}+${entry.answerBlobSha}`,
      },
      controlInput: {
        state: "locked",
        reference: `${entry.controlId}@${entry.controlQuestionBlobSha}+${entry.controlAnswerBlobSha}`,
      },
    };
  }

  const record = exactlyOne(
    availability.sources["tau2-bench"].ids.filter((item) => item.targetId === entry.targetId),
    `tau2-bench availability record for ${entry.targetId}`,
  );
  if (record.domain !== entry.domain || record.taskId !== entry.taskId)
    fail(`tau2-bench source ID drift for ${entry.targetId}`);
  const control = supplementalControlByBinding.get(
    controlProjectionKey(entry.targetId, controlConfigurationId),
  );
  return {
    faultInput: {
      state: "locked",
      reference: `${entry.domain}/tasks.json#${entry.taskId}@${entry.taskBlobSha}`,
    },
    controlInput: control
      ? { state: "locked", reference: `${control.reference}@${control.artifactSha256}` }
      : { state: "condition-only", reference: entry.controlCondition },
  };
}

function projectionState(
  key: string,
  projectionByKey: ReadonlyMap<string, ProjectionRecord>,
  excludedByKey: ReadonlyMap<string, ProjectionRecord> = new Map(),
): { state: ProjectionState; sha256: string | null } {
  const record = projectionByKey.get(key);
  const excluded = excludedByKey.get(key);
  if (record && excluded) fail(`projection ${key} cannot be both ready and excluded`);
  if (record) {
    if (!/^[0-9a-f]{64}$/.test(record.projectionHash)) fail(`invalid projection hash for ${key}`);
    return { state: "ready", sha256: record.projectionHash };
  }
  if (excluded) {
    if (!/^[0-9a-f]{64}$/.test(excluded.projectionHash))
      fail(`invalid excluded projection hash for ${key}`);
    return { state: "excluded-not-gate-reconstructed", sha256: excluded.projectionHash };
  }
  return { state: "missing", sha256: null };
}

function controlProjectionKey(targetId: string, controlConfigurationId: string) {
  return `${targetId}::${controlConfigurationId}`;
}

function normalizedPerson(value: string) {
  return value.trim().toLocaleLowerCase("en-US");
}

function validCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function validateHumanGate(name: string, gate: HumanGate) {
  if (!["pending-human-review", "approved", "rejected"].includes(gate.status))
    fail(`${name} has an invalid status`);
  if (gate.status === "pending-human-review") {
    if (gate.decidedBy !== null || gate.decidedOn !== null || gate.evidence !== null)
      fail(`pending ${name} cannot contain decision metadata`);
    return;
  }
  if (gate.decidedBy === null || gate.decidedBy.trim() === "")
    fail(`decided ${name} requires a named person`);
  if (gate.decidedOn === null || !validCalendarDate(gate.decidedOn))
    fail(`decided ${name} requires a valid YYYY-MM-DD date`);
  if (
    gate.evidence === null ||
    !/^research\/governance\/evidence\/[A-Za-z0-9._/-]+$/.test(gate.evidence.path) ||
    gate.evidence.path.includes("..") ||
    ![gate.evidence.sha256, gate.evidence.mainTrialInputDigest].every((value) =>
      /^[0-9a-f]{64}$/.test(value),
    )
  )
    fail(`decided ${name} requires pinned governance evidence`);
}

function validateGovernance(governance: G3Governance) {
  if (governance.schemaVersion !== "p26-002-g3-human-approval-0.1.0")
    fail("unexpected G3 governance schema version");
  if (governance.humanOnly !== true) fail("G3 governance must remain human-only");
  if (governance.releaseAllowed !== false || governance.submissionAllowed !== false)
    fail("G3 governance cannot authorize release or submission");

  const expectedGateNames = [
    "constructMappingReview",
    "dataGovernance",
    "releaseBoundary",
    "targetAuthorization",
  ];
  const actualGateNames = Object.keys(governance.gates).sort();
  if (JSON.stringify(actualGateNames) !== JSON.stringify(expectedGateNames))
    fail("G3 governance must contain exactly the four required gates");
  const gates = Object.entries(governance.gates);
  for (const [name, gate] of gates) validateHumanGate(`G3 gate ${name}`, gate);

  const expectedStatus = gates.every(([, gate]) => gate.status === "approved")
    ? "approved"
    : gates.some(([, gate]) => gate.status === "rejected")
      ? "rejected"
      : "pending-human-review";
  if (governance.status !== expectedStatus) fail(`G3 governance status must be ${expectedStatus}`);
}

function validateMethodFreeze(approval: MethodFreezeApproval) {
  if (approval.schemaVersion !== "p26-002-method-freeze-human-approval-0.1.0")
    fail("unexpected method-freeze approval schema version");
  if (approval.humanOnly !== true) fail("method-freeze approval must remain human-only");
  if (approval.releaseAllowed !== false || approval.submissionAllowed !== false)
    fail("method-freeze approval cannot authorize release or submission");
  validateHumanGate("method-freeze decision", approval.decision);
  if (approval.status !== approval.decision.status)
    fail(`method-freeze approval status must be ${approval.decision.status}`);
}

function validateDesignValidity(audit: DesignValidityAudit | undefined) {
  if (!audit) fail("design-validity audit is required");
  const expectedCheckNames = [
    "executionRepetitionSupport",
    "legacyProjectionEligibility",
    "matchedControlIndependence",
    "sourceExecutionDerivation",
    "variantOperationalization",
  ];
  const actualCheckNames = Object.keys(audit.checks).sort();
  const expectedBlockerCodes = [
    "ineligible-legacy-projections",
    "non-operational-variants",
    "reused-matched-control-inputs",
    "static-target-repeat-mismatch",
    "unverified-source-execution-derivation",
  ];
  const blockerCodes = audit.blockers.map((blocker) => blocker.code).sort();
  const failedChecks = Object.values(audit.checks).filter((check) => !check.passed).length;
  const passedChecks = Object.values(audit.checks).length - failedChecks;
  const valid = failedChecks === 0 && audit.blockers.length === 0;
  if (
    audit.schemaVersion !== "p26-002-design-validity-audit-0.3.0" ||
    audit.scope !== "design-validity-only-no-human-approval-or-main-trial-evidence" ||
    JSON.stringify(actualCheckNames) !== JSON.stringify(expectedCheckNames) ||
    audit.summary.scenarios !== 80 ||
    audit.summary.sourceUnits !== 80 ||
    audit.summary.designChecksPassed !== passedChecks ||
    audit.summary.designChecksBlocked !== failedChecks ||
    audit.blockers.length !== failedChecks ||
    blockerCodes.length !== new Set(blockerCodes).size ||
    blockerCodes.some((code) => !expectedBlockerCodes.includes(code)) ||
    audit.blockers.some((blocker) => blocker.message.trim() === "") ||
    audit.designValidityPassed !== valid ||
    audit.status !== (valid ? "valid" : "blocked") ||
    audit.humanApprovalEvaluated !== false ||
    audit.mainTrialAllowed !== false ||
    audit.submissionAllowed !== false
  )
    fail("design-validity audit is inconsistent or incomplete");
  return audit.blockers.map((blocker) => `${blocker.code}: ${blocker.message}`);
}

function validateReviewer(
  targetId: string,
  label: string,
  review: { decision: ConstructReviewDecision; reviewer: string | null; notes: string | null },
) {
  if (![null, "approve", "reject"].includes(review.decision))
    fail(`${targetId} ${label} decision is invalid`);
  const fieldsAreNull = [review.decision, review.reviewer, review.notes].map(
    (value) => value === null,
  );
  if (!fieldsAreNull.every((value) => value === fieldsAreNull[0]))
    fail(`${targetId} ${label} must set decision, reviewer, and rationale together`);
  if (review.reviewer !== null && review.reviewer.trim() === "")
    fail(`${targetId} ${label} reviewer cannot be blank`);
  if (review.notes !== null && review.notes.trim() === "")
    fail(`${targetId} ${label} rationale cannot be blank`);
}

function constructReviewStatus(
  binding: Omit<TargetBinding, "constructReviewStatus">,
  packet: ConstructReviewPacket,
): HumanGateStatus {
  const row = exactlyOne(
    packet.rows.filter((item) => item.targetId === binding.targetId),
    `construct-review row for ${binding.targetId}`,
  );
  if (
    row.family !== binding.family ||
    row.source !== binding.source ||
    row.targetDescriptorSha256 !== binding.targetDescriptorSha256 ||
    row.scenarioDescriptorSha256 !== binding.scenarioDescriptorSha256 ||
    sha256Canonical(row.targetDescriptor) !== binding.targetDescriptorSha256 ||
    sha256Canonical(row.scenarioDescriptor) !== binding.scenarioDescriptorSha256 ||
    row.proposedFaultConfigurationId !== binding.faultConfigurationId ||
    row.proposedControlConfigurationId !== binding.controlConfigurationId ||
    row.proposedScenarioVariant !== binding.scenarioVariant ||
    row.bindingMethod !== binding.bindingMethod
  )
    fail(`construct-review packet drift for ${binding.targetId}`);

  validateReviewer(binding.targetId, "reviewer A", row.reviewerA);
  validateReviewer(binding.targetId, "reviewer B", row.reviewerB);
  if (
    row.reviewerA.reviewer !== null &&
    row.reviewerB.reviewer !== null &&
    normalizedPerson(row.reviewerA.reviewer) === normalizedPerson(row.reviewerB.reviewer)
  )
    fail(`${binding.targetId} requires two different human reviewers`);

  const decisions = [row.reviewerA.decision, row.reviewerB.decision];
  if (decisions.includes(null)) {
    if (
      row.adjudication.decision !== null ||
      row.adjudication.adjudicator !== null ||
      row.adjudication.notes !== null
    )
      fail(`${binding.targetId} cannot be adjudicated before both reviews exist`);
    return "pending-human-review";
  }
  if (decisions[0] === decisions[1]) {
    if (
      row.adjudication.decision !== null ||
      row.adjudication.adjudicator !== null ||
      row.adjudication.notes !== null
    )
      fail(`${binding.targetId} must not add adjudication when reviewers agree`);
    return decisions[0] === "approve" ? "approved" : "rejected";
  }
  if (
    ![row.adjudication.decision, row.adjudication.adjudicator, row.adjudication.notes]
      .map((value) => value === null)
      .every((value, _index, values) => value === values[0])
  )
    fail(`${binding.targetId} must set adjudication decision, adjudicator, and rationale together`);
  if (row.adjudication.decision === null) return "pending-human-review";
  if (!["approve", "reject"].includes(row.adjudication.decision))
    fail(`${binding.targetId} adjudication decision is invalid`);
  if (row.adjudication.adjudicator!.trim() === "")
    fail(`${binding.targetId} adjudicator cannot be blank`);
  if (row.adjudication.notes!.trim() === "")
    fail(`${binding.targetId} adjudication rationale cannot be blank`);
  if (
    normalizedPerson(row.adjudication.adjudicator!) === normalizedPerson(row.reviewerA.reviewer!) ||
    normalizedPerson(row.adjudication.adjudicator!) === normalizedPerson(row.reviewerB.reviewer!)
  )
    fail(`${binding.targetId} adjudicator must be independent of both reviewers`);
  return row.adjudication.decision === "approve" ? "approved" : "rejected";
}

export function buildTargetBindingAudit(input: {
  faultConfigurations: ScenarioConfiguration[];
  controlConfigurations: ControlConfiguration[];
  targets: IndependentTargetEntry[];
  availability: SourceAvailabilityAudit;
  faultProjections: ProjectionRecord[];
  excludedLegacyFaultProjections?: ProjectionRecord[];
  controlProjections: ControlProjectionRecord[];
  controlSources?: ControlSourceRecord[];
  designValidity: DesignValidityAudit;
  constructReview: ConstructReviewPacket;
  governance: G3Governance;
  methodFreeze: MethodFreezeApproval;
}): TargetBindingAudit {
  const methodValidityBlockers = validateDesignValidity(input.designValidity);
  if (input.constructReview.schemaVersion !== "p26-002-construct-review-packet-0.1.0")
    fail("unexpected construct-review packet schema version");
  if (input.constructReview.humanOnly !== true)
    fail("construct-review packet must remain human-only");
  if (
    input.constructReview.releaseAllowed !== false ||
    input.constructReview.submissionAllowed !== false
  )
    fail("construct-review packet cannot authorize release or submission");
  validateGovernance(input.governance);
  validateMethodFreeze(input.methodFreeze);
  if (
    input.availability.schemaVersion !== "p26-002-source-availability-audit-0.1.0" ||
    input.availability.status !== "passed" ||
    input.availability.verifiedTotal !== 80 ||
    input.availability.releaseBoundary.rawSourcesRetained !== false
  )
    fail("source availability audit is not the locked 80/80 pass");
  const expectedSourceRevisions = {
    agentchaosbench: "04a8a46d32be12dea1f020b7eed8c7e84e5f30ed",
    agentdojo: "089ed468cf3ed0322acc66b0211f26d9d90dbf60",
    "bfcl-v4": "6ea57973c7a6097fd7c5915698c54c17c5b1b6c8",
    "tau2-bench": "a2c024725189473d2d7cea3a5cfdbcc67478e41f",
  };
  for (const [source, revision] of Object.entries(expectedSourceRevisions)) {
    if (
      input.availability.sources[source as keyof SourceAvailabilityAudit["sources"]].revision !==
      revision
    )
      fail(`source availability revision drift for ${source}`);
  }
  if (input.faultConfigurations.length !== 80 || input.controlConfigurations.length !== 80)
    fail("the frozen design must contain 80 faults and 80 controls");
  if (input.targets.length !== 80) fail("the independent source lock must contain 80 targets");
  if (new Set(input.targets.map((entry) => entry.targetId)).size !== 80)
    fail("independent target IDs are not unique");
  if (new Set(input.faultConfigurations.map((entry) => entry.id)).size !== 80)
    fail("fault configuration IDs are not unique");
  if (new Set(input.controlConfigurations.map((entry) => entry.id)).size !== 80)
    fail("control configuration IDs are not unique");
  if (input.constructReview.rows.length !== 80)
    fail("construct-review packet must contain 80 rows");
  if (new Set(input.constructReview.rows.map((row) => row.targetId)).size !== 80)
    fail("construct-review target IDs are not unique");

  const faultProjectionByTarget = new Map(
    input.faultProjections.map((record) => [record.targetId, record]),
  );
  if (faultProjectionByTarget.size !== input.faultProjections.length)
    fail("fault projection IDs are not unique");
  const excludedLegacyFaultProjections = input.excludedLegacyFaultProjections ?? [];
  const excludedLegacyFaultProjectionByTarget = new Map(
    excludedLegacyFaultProjections.map((record) => [record.targetId, record]),
  );
  if (excludedLegacyFaultProjectionByTarget.size !== excludedLegacyFaultProjections.length)
    fail("excluded legacy fault projection IDs are not unique");
  const controlProjectionByConfiguration = new Map(
    input.controlProjections.map((record) => [
      controlProjectionKey(record.targetId, record.controlConfigurationId),
      record,
    ]),
  );
  if (controlProjectionByConfiguration.size !== input.controlProjections.length)
    fail("control projection IDs are not unique");

  const targetIds = new Set(input.targets.map((entry) => entry.targetId));
  const controlIds = new Set(input.controlConfigurations.map((entry) => entry.id));
  for (const record of input.faultProjections) {
    if (!targetIds.has(record.targetId)) fail(`unexpected fault projection ID ${record.targetId}`);
    if (!/^[0-9a-f]{64}$/.test(record.projectionHash))
      fail(`invalid projection hash for ${record.targetId}`);
  }
  for (const record of excludedLegacyFaultProjections) {
    if (!targetIds.has(record.targetId))
      fail(`unexpected excluded legacy fault projection ID ${record.targetId}`);
    if (!/^[0-9a-f]{64}$/.test(record.projectionHash))
      fail(`invalid excluded legacy projection hash for ${record.targetId}`);
    if (faultProjectionByTarget.has(record.targetId))
      fail(`fault projection ${record.targetId} cannot be both ready and excluded`);
  }
  for (const record of input.controlProjections) {
    if (!targetIds.has(record.targetId))
      fail(`unexpected control projection target ID ${record.targetId}`);
    if (!controlIds.has(record.controlConfigurationId))
      fail(`unexpected control projection configuration ID ${record.controlConfigurationId}`);
    if (!/^[0-9a-f]{64}$/.test(record.projectionHash))
      fail(`invalid projection hash for ${record.targetId}`);
  }
  const controlSources = input.controlSources ?? [];
  const supplementalControlByBinding = new Map(
    controlSources.map((record) => [
      controlProjectionKey(record.targetId, record.controlConfigurationId),
      record,
    ]),
  );
  if (supplementalControlByBinding.size !== controlSources.length)
    fail("supplemental control source target/configuration pairs are not unique");
  const sourceByTarget = new Map(input.targets.map((target) => [target.targetId, target.source]));
  for (const record of controlSources) {
    if (!targetIds.has(record.targetId))
      fail(`unexpected supplemental control source target ID ${record.targetId}`);
    const source = sourceByTarget.get(record.targetId);
    if (source !== "agentdojo" && source !== "tau2-bench")
      fail(`target ${record.targetId} does not require supplemental control source evidence`);
    if (!controlIds.has(record.controlConfigurationId))
      fail(`unexpected supplemental control configuration ID ${record.controlConfigurationId}`);
    if (
      record.reference.trim() === "" ||
      !/^[0-9a-f]{64}$/.test(record.artifactSha256) ||
      !/^[0-9a-f]{64}$/.test(record.controlExecutionContractSha256)
    )
      fail(`supplemental control source evidence is invalid for ${record.targetId}`);
  }

  const availabilityTargetIds = [
    ...input.availability.sources.agentchaosbench.manifest,
    ...input.availability.sources.agentdojo.manifest,
    ...input.availability.sources["bfcl-v4"].ids,
    ...input.availability.sources["tau2-bench"].ids,
  ].map((record) => record.targetId);
  if (
    availabilityTargetIds.length !== 80 ||
    new Set(availabilityTargetIds).size !== 80 ||
    availabilityTargetIds.some((targetId) => !targetIds.has(targetId))
  )
    fail("source availability target universe does not match the frozen 80 targets");

  const families = new Set(input.faultConfigurations.map((item) => item.family));
  const bindings: TargetBinding[] = [];
  for (const family of families) {
    const faults = input.faultConfigurations
      .filter((item) => item.family === family)
      .sort((left, right) => left.id.localeCompare(right.id));
    const controls = input.controlConfigurations.filter((item) => item.family === family);
    const targets = input.targets
      .filter((item) => item.family === family)
      .sort((left, right) => numericTargetId(left.targetId) - numericTargetId(right.targetId));
    if (faults.length !== 10 || controls.length !== 10 || targets.length !== 10)
      fail(`family ${family} does not have exactly 10 faults, controls, and targets`);

    for (const [index, fault] of faults.entries()) {
      const target = targets[index];
      if (!target) fail(`missing target ${index + 1} for ${family}`);
      const control = exactlyOne(
        controls.filter((item) => item.pairedFaultConfigurationId === fault.id),
        `matched control for ${fault.id}`,
      );
      const evidence = sourceEvidence(
        target,
        control.id,
        input.availability,
        supplementalControlByBinding,
      );
      const scenarioDescriptor = { fault, control };
      const provisionalBinding = {
        targetId: target.targetId,
        family,
        source: target.source,
        targetDescriptorSha256: targetDescriptorSha256(target),
        scenarioDescriptorSha256: sha256Canonical(scenarioDescriptor),
        faultConfigurationId: fault.id,
        controlConfigurationId: control.id,
        scenarioVariant: fault.variant,
        bindingMethod: "provisional-family-order-review-required",
        sourceEvidence: {
          ...evidence,
          faultProjection: projectionState(
            target.targetId,
            faultProjectionByTarget,
            excludedLegacyFaultProjectionByTarget,
          ),
          controlProjection: projectionState(
            controlProjectionKey(target.targetId, control.id),
            controlProjectionByConfiguration,
          ),
        },
      } as const;
      bindings.push({
        ...provisionalBinding,
        constructReviewStatus: constructReviewStatus(provisionalBinding, input.constructReview),
      });
    }
  }

  bindings.sort((left, right) => numericTargetId(left.targetId) - numericTargetId(right.targetId));
  const expectedControlProjectionKeys = new Set(
    bindings.map((binding) =>
      controlProjectionKey(binding.targetId, binding.controlConfigurationId),
    ),
  );
  for (const record of input.controlProjections) {
    const key = controlProjectionKey(record.targetId, record.controlConfigurationId);
    if (!expectedControlProjectionKeys.has(key))
      fail(`control projection ${key} does not match the provisional target binding`);
  }
  for (const record of controlSources) {
    const key = controlProjectionKey(record.targetId, record.controlConfigurationId);
    if (!expectedControlProjectionKeys.has(key))
      fail(`supplemental control source ${key} does not match the provisional target binding`);
  }
  const lockedFaultInputReferences = bindings
    .filter((item) => item.sourceEvidence.faultInput.state === "locked")
    .map((item) => item.sourceEvidence.faultInput.reference!);
  const lockedControlInputReferences = bindings
    .filter((item) => item.sourceEvidence.controlInput.state === "locked")
    .map((item) => item.sourceEvidence.controlInput.reference!);
  const summary = {
    bindings: bindings.length,
    uniqueTargets: new Set(bindings.map((item) => item.targetId)).size,
    faultBindingsWithPinnedInput: lockedFaultInputReferences.length,
    uniqueFaultInputsPinned: new Set(lockedFaultInputReferences).size,
    controlBindingsWithPinnedInput: lockedControlInputReferences.length,
    uniqueControlInputsPinned: new Set(lockedControlInputReferences).size,
    reusedControlBindings:
      lockedControlInputReferences.length - new Set(lockedControlInputReferences).size,
    controlConditionsOnly: bindings.filter(
      (item) => item.sourceEvidence.controlInput.state === "condition-only",
    ).length,
    legacyFaultProjectionHashesExcluded: bindings.filter(
      (item) => item.sourceEvidence.faultProjection.state === "excluded-not-gate-reconstructed",
    ).length,
    faultProjectionsReady: bindings.filter(
      (item) => item.sourceEvidence.faultProjection.state === "ready",
    ).length,
    controlProjectionsReady: bindings.filter(
      (item) => item.sourceEvidence.controlProjection.state === "ready",
    ).length,
    constructMappingsApproved: bindings.filter((item) => item.constructReviewStatus === "approved")
      .length,
    constructMappingsPending: bindings.filter(
      (item) => item.constructReviewStatus === "pending-human-review",
    ).length,
    constructMappingsRejected: bindings.filter((item) => item.constructReviewStatus === "rejected")
      .length,
  };

  const expectedConstructReviewStatus =
    summary.constructMappingsApproved === 80
      ? "approved"
      : summary.constructMappingsRejected > 0
        ? "rejected"
        : "pending-human-review";
  if (input.constructReview.status !== expectedConstructReviewStatus)
    fail(`construct-review packet status must be ${expectedConstructReviewStatus}`);

  const blockers: string[] = [];
  if (summary.faultBindingsWithPinnedInput !== 80)
    blockers.push(
      `Only ${summary.faultBindingsWithPinnedInput}/80 fault bindings have pinned inputs.`,
    );
  if (summary.uniqueFaultInputsPinned !== summary.faultBindingsWithPinnedInput)
    blockers.push(
      `Only ${summary.uniqueFaultInputsPinned}/${summary.faultBindingsWithPinnedInput} pinned fault bindings use unique source inputs.`,
    );
  if (summary.controlBindingsWithPinnedInput !== 80)
    blockers.push(
      `Only ${summary.controlBindingsWithPinnedInput}/80 matched-control bindings have pinned inputs; ${summary.controlConditionsOnly} remain condition-only.`,
    );
  if (summary.uniqueControlInputsPinned !== summary.controlBindingsWithPinnedInput)
    blockers.push(
      `Only ${summary.uniqueControlInputsPinned}/${summary.controlBindingsWithPinnedInput} pinned control bindings use unique source inputs; ${summary.reusedControlBindings} reuse an upstream execution.`,
    );
  if (summary.faultProjectionsReady !== 80)
    blockers.push(
      `Only ${summary.faultProjectionsReady}/80 fault projections are reconstructed by the gate from source-bound evidence; ${summary.legacyFaultProjectionHashesExcluded} legacy hashes are excluded.`,
    );
  if (summary.controlProjectionsReady !== 80)
    blockers.push(`Only ${summary.controlProjectionsReady}/80 control projections are ready.`);
  if (summary.constructMappingsPending > 0)
    blockers.push(
      `${summary.constructMappingsPending}/80 provisional bindings still require two independent human reviews.`,
    );
  if (summary.constructMappingsRejected > 0)
    blockers.push(
      `${summary.constructMappingsRejected}/80 provisional bindings were rejected and require a pre-specified remap or exclusion decision.`,
    );
  for (const [gate, decision] of Object.entries(input.governance.gates)) {
    if (decision.status !== "approved") blockers.push(`Human G3 gate ${gate} is not approved.`);
  }
  if (input.methodFreeze.decision.status !== "approved")
    blockers.push("Independent human method-freeze approval is not complete.");
  for (const blocker of methodValidityBlockers) {
    blockers.push(`Method validity: ${blocker}`);
  }

  const mainTrialAllowed = blockers.length === 0;
  return {
    schemaVersion: "p26-002-target-binding-audit-0.3.0",
    status: mainTrialAllowed ? "ready" : "blocked",
    scope: "pre-run-binding-and-readiness-audit-not-main-study-evidence",
    bindings,
    summary,
    blockers,
    mainTrialAllowed,
    submissionAllowed: false,
  };
}
