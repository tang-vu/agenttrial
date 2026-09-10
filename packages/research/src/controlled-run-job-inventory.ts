import { createHash } from "node:crypto";
import { CONTROL_MATRIX, SCENARIO_MATRIX } from "./index";
import type { ControlExecutionContractArtifact } from "./control-execution-contracts";
import {
  runnerExecutionContractForJob,
  type RunnerExecutionContractArtifact,
} from "./runner-execution-contracts";
import type {
  BfclTargetEntry,
  IndependentTargetEntry,
  SourceAvailabilityAudit,
  Tau2TargetEntry,
} from "./target-binding";

export const CONTROLLED_RUN_JOB_INVENTORY_PATH =
  "research/targets/controlled-run-job-inventory.json";

interface JobSourceLock {
  repository: string;
  revision: string;
  unitKind: "benchmark-task";
  unitId: string;
  blobShas: string[];
}
type RunnerContractStatus =
  | "candidate-control-contract-review-required"
  | "candidate-runner-contract-review-required";

interface ControlledRunJobBody {
  jobId: string;
  targetId: string;
  source: "agentdojo" | "bfcl-v4" | "tau2-bench";
  condition: "fault" | "control";
  configurationId: string;
  bindingStatus: "provisional-family-order-review-required";
  sourceLock: JobSourceLock;
  controlExecutionContractSha256: string | null;
  runnerExecutionContractSha256: string | null;
  runnerContractStatus: RunnerContractStatus;
  scheduleState: "not-scheduled";
  modelAndPipeline: null;
  runId: null;
  seed: null;
  trustedRunnerKeyId: null;
  executionAllowed: false;
  evidenceEligible: false;
}

export type ControlledRunJob = ControlledRunJobBody & { planHash: string };

export interface ControlledRunJobInventory {
  schemaVersion: "p26-002-controlled-run-job-inventory-0.1.0";
  status: "blocked-before-scheduling";
  studyId: "P26-002";
  scope: "prospective-job-envelopes-not-execution-evidence";
  jobs: ControlledRunJob[];
  summary: {
    expectedJobs: number;
    inventoriedJobs: number;
    faultJobs: number;
    controlJobs: number;
    controlContractDefined: number;
    supplementalRunnerContractDefined: number;
    runnerContractDefined: number;
    runnerContractMissing: number;
    runnableJobs: number;
    scheduledJobs: number;
    executedJobs: number;
  };
  prerequisites: readonly [
    "redesigned estimand and repetition plan",
    "independent construct review and method-freeze approval",
    "G3 target authorization and data-governance approval",
    "exact model, pipeline, runner contract, and deterministic seed schedule",
    "active trusted-runner policy with a human-registered key",
    "gate-observed execution or a valid content-bound attestation",
  ];
  executionAllowed: false;
  evidenceMaterialized: false;
  readinessEligible: false;
  mainTrialAllowed: false;
  releaseAllowed: false;
  submissionAllowed: false;
}

function fail(message: string): never {
  throw new Error(`Controlled-run job inventory invalid: ${message}`);
}

function sha256(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function configurationsForTarget(
  target: IndependentTargetEntry,
  targetsByFamily: Map<string, IndependentTargetEntry[]>,
) {
  const familyTargets = targetsByFamily.get(target.family) ?? [];
  const index = familyTargets.findIndex((candidate) => candidate.targetId === target.targetId);
  const fault = SCENARIO_MATRIX.filter((candidate) => candidate.family === target.family)[index];
  const control = CONTROL_MATRIX.filter((candidate) => candidate.family === target.family)[index];
  if (index < 0 || !fault || !control) fail(`configuration binding missing for ${target.targetId}`);
  return { fault: fault.id, control: control.id };
}

function exactControlContract(artifact: ControlExecutionContractArtifact, targetId: string) {
  const matches = artifact.contracts.filter((candidate) => candidate.targetId === targetId);
  if (matches.length !== 1) fail(`expected one control contract for ${targetId}`);
  return matches[0]!;
}

function verifyRunnerContractBinding(
  contract: ReturnType<typeof runnerExecutionContractForJob>,
  sourceLock: JobSourceLock,
  configurationId: string,
) {
  const contractBlobShas = new Set(contract.sourceLock.sourceBlobs.map((blob) => blob.blobSha));
  if (
    contract.configurationId !== configurationId ||
    contract.sourceLock.repository !== sourceLock.repository ||
    contract.sourceLock.revision !== sourceLock.revision ||
    contract.sourceLock.unitId !== sourceLock.unitId ||
    sourceLock.blobShas.some((blobSha) => !contractBlobShas.has(blobSha))
  )
    fail(`runner contract binding drift for ${contract.targetId}/${contract.condition}`);
}

function bfclSourceLock(
  target: BfclTargetEntry,
  condition: "fault" | "control",
  availability: SourceAvailabilityAudit,
): JobSourceLock {
  return {
    repository: "ShishirPatil/gorilla",
    revision: availability.sources["bfcl-v4"].revision,
    unitKind: "benchmark-task",
    unitId: condition === "fault" ? target.faultId : target.controlId,
    blobShas:
      condition === "fault"
        ? [target.questionBlobSha, target.answerBlobSha]
        : [target.controlQuestionBlobSha, target.controlAnswerBlobSha],
  };
}

function tau2FaultSourceLock(
  target: Tau2TargetEntry,
  availability: SourceAvailabilityAudit,
): JobSourceLock {
  return {
    repository: "sierra-research/tau2-bench",
    revision: availability.sources["tau2-bench"].revision,
    unitKind: "benchmark-task",
    unitId: `${target.domain}/tasks.json#${target.taskId}`,
    blobShas: [target.taskBlobSha],
  };
}

export function buildControlledRunJobInventory(input: {
  targets: IndependentTargetEntry[];
  availability: SourceAvailabilityAudit;
  controlContracts: ControlExecutionContractArtifact;
  runnerContracts: RunnerExecutionContractArtifact;
}): ControlledRunJobInventory {
  const targetsByFamily = new Map<string, IndependentTargetEntry[]>();
  for (const target of input.targets)
    targetsByFamily.set(target.family, [...(targetsByFamily.get(target.family) ?? []), target]);

  const bodies: ControlledRunJobBody[] = [];
  for (const target of input.targets) {
    const configurations = configurationsForTarget(target, targetsByFamily);
    const conditions: Array<"fault" | "control"> =
      target.source === "agentdojo"
        ? ["control"]
        : target.source === "bfcl-v4" || target.source === "tau2-bench"
          ? ["fault", "control"]
          : [];
    for (const condition of conditions) {
      const controlContract =
        condition === "control" && (target.source === "agentdojo" || target.source === "tau2-bench")
          ? exactControlContract(input.controlContracts, target.targetId)
          : null;
      const runnerContract = controlContract
        ? null
        : runnerExecutionContractForJob(input.runnerContracts, target.targetId, condition);
      const sourceLock = controlContract
        ? {
            repository: controlContract.sourceLock.repository,
            revision: controlContract.sourceLock.revision,
            unitKind: controlContract.sourceLock.unitKind,
            unitId: controlContract.sourceLock.unitId,
            blobShas: controlContract.sourceLock.sourceBlobs.map((blob) => blob.blobSha),
          }
        : target.source === "bfcl-v4"
          ? bfclSourceLock(target, condition, input.availability)
          : target.source === "tau2-bench" && condition === "fault"
            ? tau2FaultSourceLock(target, input.availability)
            : fail(`source lock missing for ${target.targetId}/${condition}`);
      if (runnerContract)
        verifyRunnerContractBinding(runnerContract, sourceLock, configurations[condition]);
      bodies.push({
        jobId: `p26-002-${target.targetId}-${condition}`,
        targetId: target.targetId,
        source: target.source as "agentdojo" | "bfcl-v4" | "tau2-bench",
        condition,
        configurationId: configurations[condition],
        bindingStatus: "provisional-family-order-review-required",
        sourceLock,
        controlExecutionContractSha256: controlContract?.contractSha256 ?? null,
        runnerExecutionContractSha256: runnerContract?.contractSha256 ?? null,
        runnerContractStatus: controlContract
          ? "candidate-control-contract-review-required"
          : "candidate-runner-contract-review-required",
        scheduleState: "not-scheduled",
        modelAndPipeline: null,
        runId: null,
        seed: null,
        trustedRunnerKeyId: null,
        executionAllowed: false,
        evidenceEligible: false,
      });
    }
  }
  const jobs = bodies.map((body) => ({ ...body, planHash: sha256(body) }));
  const artifact = {
    schemaVersion: "p26-002-controlled-run-job-inventory-0.1.0",
    status: "blocked-before-scheduling",
    studyId: "P26-002",
    scope: "prospective-job-envelopes-not-execution-evidence",
    jobs,
    summary: {
      expectedJobs: 50,
      inventoriedJobs: jobs.length,
      faultJobs: jobs.filter((job) => job.condition === "fault").length,
      controlJobs: jobs.filter((job) => job.condition === "control").length,
      controlContractDefined: jobs.filter(
        (job) => job.runnerContractStatus === "candidate-control-contract-review-required",
      ).length,
      supplementalRunnerContractDefined: jobs.filter(
        (job) => job.runnerContractStatus === "candidate-runner-contract-review-required",
      ).length,
      runnerContractDefined: jobs.filter(
        (job) =>
          job.runnerContractStatus === "candidate-control-contract-review-required" ||
          job.runnerContractStatus === "candidate-runner-contract-review-required",
      ).length,
      runnerContractMissing: 0,
      runnableJobs: 0,
      scheduledJobs: 0,
      executedJobs: 0,
    },
    prerequisites: [
      "redesigned estimand and repetition plan",
      "independent construct review and method-freeze approval",
      "G3 target authorization and data-governance approval",
      "exact model, pipeline, runner contract, and deterministic seed schedule",
      "active trusted-runner policy with a human-registered key",
      "gate-observed execution or a valid content-bound attestation",
    ],
    executionAllowed: false,
    evidenceMaterialized: false,
    readinessEligible: false,
    mainTrialAllowed: false,
    releaseAllowed: false,
    submissionAllowed: false,
  } satisfies ControlledRunJobInventory;
  validateControlledRunJobInventory(artifact);
  return artifact;
}

export function validateControlledRunJobInventory(
  artifact: ControlledRunJobInventory,
  input?: {
    targets: IndependentTargetEntry[];
    availability: SourceAvailabilityAudit;
    controlContracts: ControlExecutionContractArtifact;
    runnerContracts: RunnerExecutionContractArtifact;
  },
) {
  if (
    artifact.schemaVersion !== "p26-002-controlled-run-job-inventory-0.1.0" ||
    artifact.status !== "blocked-before-scheduling" ||
    artifact.studyId !== "P26-002" ||
    artifact.jobs.length !== 50 ||
    artifact.summary.expectedJobs !== 50 ||
    artifact.summary.inventoriedJobs !== 50 ||
    artifact.summary.faultJobs !== 20 ||
    artifact.summary.controlJobs !== 30 ||
    artifact.summary.controlContractDefined !== 20 ||
    artifact.summary.supplementalRunnerContractDefined !== 30 ||
    artifact.summary.runnerContractDefined !== 50 ||
    artifact.summary.runnerContractMissing !== 0 ||
    artifact.summary.runnableJobs !== 0 ||
    artifact.summary.scheduledJobs !== 0 ||
    artifact.summary.executedJobs !== 0 ||
    artifact.executionAllowed ||
    artifact.evidenceMaterialized ||
    artifact.readinessEligible ||
    artifact.mainTrialAllowed ||
    artifact.releaseAllowed ||
    artifact.submissionAllowed
  )
    fail("top-level fail-closed contract is not satisfied");
  if (
    new Set(artifact.jobs.map((job) => job.jobId)).size !== 50 ||
    new Set(artifact.jobs.map((job) => job.planHash)).size !== 50
  )
    fail("job identities or plan hashes are duplicated");
  for (const job of artifact.jobs) {
    const { planHash, ...body } = job;
    if (
      planHash !== sha256(body) ||
      job.scheduleState !== "not-scheduled" ||
      job.modelAndPipeline !== null ||
      job.runId !== null ||
      job.seed !== null ||
      job.trustedRunnerKeyId !== null ||
      (job.controlExecutionContractSha256 === null) ===
        (job.runnerExecutionContractSha256 === null) ||
      (job.controlExecutionContractSha256 !== null &&
        !/^[0-9a-f]{64}$/.test(job.controlExecutionContractSha256)) ||
      (job.runnerExecutionContractSha256 !== null &&
        !/^[0-9a-f]{64}$/.test(job.runnerExecutionContractSha256)) ||
      job.executionAllowed ||
      job.evidenceEligible ||
      !/^[0-9a-f]{40}$/.test(job.sourceLock.revision) ||
      job.sourceLock.blobShas.length === 0 ||
      job.sourceLock.blobShas.some((blobSha) => !/^[0-9a-f]{40}$/.test(blobSha))
    )
      fail(`job contract failed for ${job.jobId}`);
  }
  if (input && JSON.stringify(artifact) !== JSON.stringify(buildControlledRunJobInventory(input)))
    fail("inventory does not match the current source-bound candidate contracts");
}
