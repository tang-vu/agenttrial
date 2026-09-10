import { createHash } from "node:crypto";
import { CONTROL_MATRIX, SCENARIO_MATRIX } from "./index";
import type { SourceBlobLock } from "./control-execution-contracts";
import type {
  BfclTargetEntry,
  IndependentTargetEntry,
  SourceAvailabilityAudit,
  Tau2TargetEntry,
} from "./target-binding";

export const RUNNER_EXECUTION_CONTRACTS_PATH = "research/targets/runner-execution-contracts.json";

interface RunnerSourceLock {
  repository: string;
  revision: string;
  unitKind: "benchmark-task";
  unitId: string;
  sourceBlobs: SourceBlobLock[];
  runnerBlobs: SourceBlobLock[];
}

interface BaseRunnerExecutionContract {
  targetId: string;
  configurationId: string;
  bindingMethod: "provisional-family-order-review-required";
  executionState: "not-executed";
  sourceLock: RunnerSourceLock;
}

interface BfclRunnerExecutionContractBody extends BaseRunnerExecutionContract {
  source: "bfcl-v4";
  condition: "fault" | "control";
  category: "multi_turn_miss_param" | "multi_turn_base";
  caseId: string;
  selectionManifest: {
    path: "test_case_ids_to_generate.json";
    exactContents: Record<string, [string]>;
  };
  runner: {
    generationEntrypoint: "bfcl_eval._llm_response_generation.main";
    evaluationEntrypoint: "bfcl_eval.eval_checker.eval_runner.main";
    runIds: true;
    allowOverwrite: false;
    numThreads: 1;
    requireIsolatedProjectRoot: true;
    partialEval: true;
  };
  observation: {
    requireExactCaseOnce: true;
    requireNoOtherCaseIds: true;
    requireNonemptyModelResult: true;
    requireNonemptyInferenceLog: true;
    requireEvaluatedCaseCountOne: true;
    requireUpstreamValidityRecorded: true;
    upstreamValidityIsEligibilityThreshold: false;
  };
}

interface Tau2FaultRunnerExecutionContractBody extends BaseRunnerExecutionContract {
  source: "tau2-bench";
  condition: "fault";
  domain: "airline" | "retail";
  taskId: string;
  auditIssue: "https://github.com/sierra-research/tau2-bench/issues/384";
  runner: {
    entrypoint: "tau2.run.run_single_task";
    evaluationType: "ALL";
    requireFreshRun: true;
    supplementalControlChecks: "not-applied";
  };
  observation: {
    requireExactDomainAndTask: true;
    requireNonemptyTrace: true;
    requireUpstreamRewardRecorded: true;
    requireUpstreamRewardBreakdownRecorded: true;
    upstreamRewardIsEligibilityThreshold: false;
    preserveFrozenRewardBasis: true;
  };
}

export type RunnerExecutionContractBody =
  | BfclRunnerExecutionContractBody
  | Tau2FaultRunnerExecutionContractBody;
export type RunnerExecutionContract = RunnerExecutionContractBody & {
  contractSha256: string;
};

export interface RunnerExecutionContractArtifact {
  schemaVersion: "p26-002-runner-execution-contracts-0.1.0";
  status: "candidate-method-contracts-review-required";
  scope: "predeclared-missing-runner-methods-not-execution-evidence";
  preparedOn: "2026-09-01";
  contracts: RunnerExecutionContract[];
  summary: {
    expected: 30;
    defined: 30;
    bfclFault: 10;
    bfclControl: 10;
    tau2Fault: 10;
    executionsProvided: 0;
  };
  unresolvedBeforeExecution: readonly [
    "redesigned estimand and repetition plan",
    "exact model and pipeline freeze",
    "deterministic seed schedule",
    "active trusted-runner policy with a human-registered key",
    "independent method-freeze and G3 approval",
  ];
  humanReviewRequired: true;
  executionAllowed: false;
  releaseAllowed: false;
  submissionAllowed: false;
}

const BFCL_REPOSITORY = "ShishirPatil/gorilla";
const BFCL_REVISION = "6ea57973c7a6097fd7c5915698c54c17c5b1b6c8";
const TAU2_REPOSITORY = "sierra-research/tau2-bench";
const TAU2_REVISION = "a2c024725189473d2d7cea3a5cfdbcc67478e41f";

const BFCL_RUNNER_BLOBS: SourceBlobLock[] = [
  {
    path: "berkeley-function-call-leaderboard/bfcl_eval/__main__.py",
    blobSha: "42f6aaf3fc0844fbc1423849516dfe6e1d16a360",
  },
  {
    path: "berkeley-function-call-leaderboard/bfcl_eval/_llm_response_generation.py",
    blobSha: "8997958de58c896d6cb3c6e03a513fe6b5094b7d",
  },
  {
    path: "berkeley-function-call-leaderboard/bfcl_eval/constants/eval_config.py",
    blobSha: "813d6de70333b6137f5fb62e116956b13bb339d3",
  },
  {
    path: "berkeley-function-call-leaderboard/bfcl_eval/eval_checker/eval_runner.py",
    blobSha: "2d5c41aac41cd2f1caedf741fb01dfdfd57b1990",
  },
  {
    path: "berkeley-function-call-leaderboard/bfcl_eval/eval_checker/multi_turn_eval/multi_turn_checker.py",
    blobSha: "34b36715cdfaa4464ba1be137af4d30e85da8efb",
  },
  {
    path: "berkeley-function-call-leaderboard/bfcl_eval/eval_checker/multi_turn_eval/multi_turn_utils.py",
    blobSha: "dfcf6512a2eeb592820f3a0fa0fb564a117facc4",
  },
  {
    path: "berkeley-function-call-leaderboard/bfcl_eval/utils.py",
    blobSha: "552a10f36ec10840773f75e50fed01ca19b4bfc6",
  },
];

const TAU2_RUNNER_BLOBS: SourceBlobLock[] = [
  {
    path: "src/tau2/evaluator/evaluator.py",
    blobSha: "76c95a83e9049d70a5570b93989797c0626974b6",
  },
  {
    path: "src/tau2/run.py",
    blobSha: "7a15803220eb9e44a598cc9aa330ce51c83d52eb",
  },
  {
    path: "src/tau2/runner/simulation.py",
    blobSha: "25330c9d831f548b72edfd959757faefb901da9a",
  },
];

const TAU2_DOMAIN_SOURCE_BLOBS: Record<"airline" | "retail", SourceBlobLock[]> = {
  airline: [
    {
      path: "data/tau2/domains/airline/db.json",
      blobSha: "c6a1e817aa9102c5822e83affb3595acbc312701",
    },
    {
      path: "data/tau2/domains/airline/policy.md",
      blobSha: "8098be7db3f47de943fad39d1e057ede6cc6cd04",
    },
    {
      path: "data/tau2/domains/airline/tasks.json",
      blobSha: "ea4ff5e3f5e3d97ca391846a6e8dd9eb3437dc80",
    },
  ],
  retail: [
    {
      path: "data/tau2/domains/retail/db.json",
      blobSha: "4d67b03b2d39ade5a7ab6facb2edd7ab3e013d48",
    },
    {
      path: "data/tau2/domains/retail/policy.md",
      blobSha: "d127e6b074654926f337d0d98b0e669ebe90d19e",
    },
    {
      path: "data/tau2/domains/retail/tasks.json",
      blobSha: "e95a9f898b2d1f6568ea8faec78edc3767ce747d",
    },
  ],
};

function fail(message: string): never {
  throw new Error(`Runner execution contract validation failed: ${message}`);
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

function sha256(body: RunnerExecutionContractBody) {
  return createHash("sha256").update(canonicalJson(body)).digest("hex");
}

function numericTargetId(targetId: string) {
  const match = /^ext-(\d{3})$/.exec(targetId);
  if (!match?.[1]) fail(`invalid target ID ${targetId}`);
  return Number(match[1]);
}

function sortedBlobs(blobs: SourceBlobLock[]) {
  const sorted = [...blobs].sort((left, right) => left.path.localeCompare(right.path));
  if (
    new Set(sorted.map((blob) => blob.path)).size !== sorted.length ||
    sorted.some((blob) => !/^[0-9a-f]{40}$/.test(blob.blobSha))
  )
    fail("source blob locks are invalid or duplicated");
  return sorted;
}

function configurationFor(
  target: IndependentTargetEntry,
  condition: "fault" | "control",
  targets: IndependentTargetEntry[],
) {
  const familyTargets = targets
    .filter((candidate) => candidate.family === target.family)
    .sort((left, right) => numericTargetId(left.targetId) - numericTargetId(right.targetId));
  const index = familyTargets.findIndex((candidate) => candidate.targetId === target.targetId);
  const configurations = condition === "fault" ? SCENARIO_MATRIX : CONTROL_MATRIX;
  const familyConfigurations = configurations
    .filter((candidate) => candidate.family === target.family)
    .sort((left, right) => left.id.localeCompare(right.id));
  const configuration = familyConfigurations[index];
  if (
    index < 0 ||
    !configuration ||
    familyTargets.length !== 10 ||
    familyConfigurations.length !== 10
  )
    fail(`cannot resolve ${condition} configuration for ${target.targetId}`);
  return configuration.id;
}

function bfclContract(
  target: BfclTargetEntry,
  condition: "fault" | "control",
  targets: IndependentTargetEntry[],
  availability: SourceAvailabilityAudit,
): BfclRunnerExecutionContractBody {
  if (availability.sources["bfcl-v4"].revision !== BFCL_REVISION)
    fail(`BFCL revision drift for ${target.targetId}`);
  const category = condition === "fault" ? "multi_turn_miss_param" : "multi_turn_base";
  const caseId = condition === "fault" ? target.faultId : target.controlId;
  const sourceBlobs =
    condition === "fault"
      ? [
          {
            path: "berkeley-function-call-leaderboard/bfcl_eval/data/BFCL_v4_multi_turn_miss_param.json",
            blobSha: target.questionBlobSha,
          },
          {
            path: "berkeley-function-call-leaderboard/bfcl_eval/data/possible_answer/BFCL_v4_multi_turn_miss_param.json",
            blobSha: target.answerBlobSha,
          },
        ]
      : [
          {
            path: "berkeley-function-call-leaderboard/bfcl_eval/data/BFCL_v4_multi_turn_base.json",
            blobSha: target.controlQuestionBlobSha,
          },
          {
            path: "berkeley-function-call-leaderboard/bfcl_eval/data/possible_answer/BFCL_v4_multi_turn_base.json",
            blobSha: target.controlAnswerBlobSha,
          },
        ];
  return {
    targetId: target.targetId,
    configurationId: configurationFor(target, condition, targets),
    bindingMethod: "provisional-family-order-review-required",
    executionState: "not-executed",
    source: "bfcl-v4",
    condition,
    category,
    caseId,
    sourceLock: {
      repository: BFCL_REPOSITORY,
      revision: BFCL_REVISION,
      unitKind: "benchmark-task",
      unitId: caseId,
      sourceBlobs: sortedBlobs(sourceBlobs),
      runnerBlobs: sortedBlobs(BFCL_RUNNER_BLOBS),
    },
    selectionManifest: {
      path: "test_case_ids_to_generate.json",
      exactContents: { [category]: [caseId] },
    },
    runner: {
      generationEntrypoint: "bfcl_eval._llm_response_generation.main",
      evaluationEntrypoint: "bfcl_eval.eval_checker.eval_runner.main",
      runIds: true,
      allowOverwrite: false,
      numThreads: 1,
      requireIsolatedProjectRoot: true,
      partialEval: true,
    },
    observation: {
      requireExactCaseOnce: true,
      requireNoOtherCaseIds: true,
      requireNonemptyModelResult: true,
      requireNonemptyInferenceLog: true,
      requireEvaluatedCaseCountOne: true,
      requireUpstreamValidityRecorded: true,
      upstreamValidityIsEligibilityThreshold: false,
    },
  };
}

function tau2FaultContract(
  target: Tau2TargetEntry,
  targets: IndependentTargetEntry[],
  availability: SourceAvailabilityAudit,
): Tau2FaultRunnerExecutionContractBody {
  if (
    availability.sources["tau2-bench"].revision !== TAU2_REVISION ||
    target.auditIssue !== "https://github.com/sierra-research/tau2-bench/issues/384"
  )
    fail(`tau2 revision or audit lock drift for ${target.targetId}`);
  const sourceBlobs = TAU2_DOMAIN_SOURCE_BLOBS[target.domain];
  const taskBlob = sourceBlobs.find((blob) => blob.path.endsWith("/tasks.json"));
  if (!taskBlob || taskBlob.blobSha !== target.taskBlobSha)
    fail(`tau2 task blob drift for ${target.targetId}`);
  return {
    targetId: target.targetId,
    configurationId: configurationFor(target, "fault", targets),
    bindingMethod: "provisional-family-order-review-required",
    executionState: "not-executed",
    source: "tau2-bench",
    condition: "fault",
    domain: target.domain,
    taskId: target.taskId,
    auditIssue: "https://github.com/sierra-research/tau2-bench/issues/384",
    sourceLock: {
      repository: TAU2_REPOSITORY,
      revision: TAU2_REVISION,
      unitKind: "benchmark-task",
      unitId: `${target.domain}/tasks.json#${target.taskId}`,
      sourceBlobs: sortedBlobs(sourceBlobs),
      runnerBlobs: sortedBlobs(TAU2_RUNNER_BLOBS),
    },
    runner: {
      entrypoint: "tau2.run.run_single_task",
      evaluationType: "ALL",
      requireFreshRun: true,
      supplementalControlChecks: "not-applied",
    },
    observation: {
      requireExactDomainAndTask: true,
      requireNonemptyTrace: true,
      requireUpstreamRewardRecorded: true,
      requireUpstreamRewardBreakdownRecorded: true,
      upstreamRewardIsEligibilityThreshold: false,
      preserveFrozenRewardBasis: true,
    },
  };
}

export function buildRunnerExecutionContractArtifact(input: {
  targets: IndependentTargetEntry[];
  availability: SourceAvailabilityAudit;
}): RunnerExecutionContractArtifact {
  const targets = input.targets
    .filter((target) => target.source === "bfcl-v4" || target.source === "tau2-bench")
    .sort((left, right) => numericTargetId(left.targetId) - numericTargetId(right.targetId));
  if (
    targets.length !== 20 ||
    targets[0]?.targetId !== "ext-061" ||
    targets[19]?.targetId !== "ext-080"
  )
    fail("runner-contract target universe is not the expected BFCL/tau2 partition");

  const bodies: RunnerExecutionContractBody[] = [];
  for (const target of targets) {
    if (target.source === "bfcl-v4") {
      bodies.push(
        bfclContract(target, "fault", input.targets, input.availability),
        bfclContract(target, "control", input.targets, input.availability),
      );
    } else {
      bodies.push(tau2FaultContract(target, input.targets, input.availability));
    }
  }
  const contracts = bodies.map((body) => ({ ...body, contractSha256: sha256(body) }));
  if (
    contracts.length !== 30 ||
    new Set(contracts.map((contract) => contract.contractSha256)).size !== 30
  )
    fail("runner contracts are incomplete or hashes are duplicated");

  return {
    schemaVersion: "p26-002-runner-execution-contracts-0.1.0",
    status: "candidate-method-contracts-review-required",
    scope: "predeclared-missing-runner-methods-not-execution-evidence",
    preparedOn: "2026-09-01",
    contracts,
    summary: {
      expected: 30,
      defined: 30,
      bfclFault: contracts.filter(
        (contract) => contract.source === "bfcl-v4" && contract.condition === "fault",
      ).length as 10,
      bfclControl: contracts.filter(
        (contract) => contract.source === "bfcl-v4" && contract.condition === "control",
      ).length as 10,
      tau2Fault: contracts.filter((contract) => contract.source === "tau2-bench").length as 10,
      executionsProvided: 0,
    },
    unresolvedBeforeExecution: [
      "redesigned estimand and repetition plan",
      "exact model and pipeline freeze",
      "deterministic seed schedule",
      "active trusted-runner policy with a human-registered key",
      "independent method-freeze and G3 approval",
    ],
    humanReviewRequired: true,
    executionAllowed: false,
    releaseAllowed: false,
    submissionAllowed: false,
  };
}

export function validateRunnerExecutionContractArtifact(
  artifact: RunnerExecutionContractArtifact,
  input: { targets: IndependentTargetEntry[]; availability: SourceAvailabilityAudit },
) {
  const expected = buildRunnerExecutionContractArtifact(input);
  if (canonicalJson(artifact) !== canonicalJson(expected))
    fail("artifact bytes do not match the executable predeclared contracts");
  return artifact;
}

export function runnerExecutionContractForJob(
  artifact: RunnerExecutionContractArtifact,
  targetId: string,
  condition: "fault" | "control",
) {
  const matches = artifact.contracts.filter(
    (contract) => contract.targetId === targetId && contract.condition === condition,
  );
  if (matches.length !== 1)
    fail(`expected one ${condition} runner contract for ${targetId}, found ${matches.length}`);
  return matches[0]!;
}
