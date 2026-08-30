import { createHash } from "node:crypto";
import type { ControlConfiguration } from "./index";
import type {
  AgentDojoTargetEntry,
  IndependentTargetEntry,
  SourceAvailabilityAudit,
  Tau2TargetEntry,
} from "./target-binding";

export interface SourceBlobLock {
  path: string;
  blobSha: string;
}

export interface ControlSourceLock {
  repository: string;
  revision: string;
  unitKind: "benchmark-task";
  unitId: string;
  sourceBlobs: SourceBlobLock[];
}

interface BaseControlExecutionContract {
  targetId: string;
  controlConfigurationId: string;
  bindingMethod: "provisional-family-order-review-required";
  executionState: "not-executed";
  sourceLock: ControlSourceLock;
}

interface AgentDojoControlExecutionContractBody extends BaseControlExecutionContract {
  source: "agentdojo";
  benchmarkVersion: "v1.2.2";
  suite: string;
  userTask: string;
  runner: {
    entrypoint: "agentdojo.benchmark.benchmark_suite_without_injections";
    attackArgument: null;
    injectionTaskId: null;
    injections: Record<string, never>;
    forceRerun: true;
    cachedResultEligible: false;
  };
  acceptance: {
    requireExactSuiteAndUserTask: true;
    requireNonemptyTrace: true;
    requireUpstreamUtilityTrue: true;
    requireReportedSecurityTrue: true;
    reportedSecurityIsIndependentAcceptance: false;
  };
}

export type Tau2RequiredCheck =
  | { kind: "upstream-nl-assertion"; assertion: string }
  | { kind: "trace-action"; action: "transfer_to_human_agents" }
  | {
      kind: "state-derived-communication";
      field: "tracking_number" | "estimated_delivery_date";
    };

interface Tau2ControlExecutionContractBody extends BaseControlExecutionContract {
  source: "tau2-bench";
  domain: "airline" | "retail";
  taskId: string;
  auditIssue: "https://github.com/sierra-research/tau2-bench/issues/384";
  runner: {
    entrypoint: "tau2.run.run_single_task";
    evaluationType: "ALL_WITH_NL_ASSERTIONS";
    requireFreshRun: true;
  };
  acceptance: {
    requireExactDomainAndTask: true;
    requireNonemptyTrace: true;
    requireUpstreamRewardOne: true;
    upstreamRewardIsSoleAcceptance: false;
    requiredChecks: Tau2RequiredCheck[];
  };
}

export type ControlExecutionContractBody =
  | AgentDojoControlExecutionContractBody
  | Tau2ControlExecutionContractBody;

export type ControlExecutionContract = ControlExecutionContractBody & {
  contractSha256: string;
};

export interface ControlExecutionContractArtifact {
  schemaVersion: "p26-002-control-execution-contracts-0.1.0";
  status: "candidate-method-contracts-review-required";
  scope: "predeclared-control-acceptance-not-execution-evidence";
  preparedOn: "2026-08-30";
  contracts: ControlExecutionContract[];
  summary: {
    expected: 20;
    defined: 20;
    agentdojo: 10;
    tau2: 10;
    executionsProvided: 0;
  };
  unresolvedBeforeExecution: readonly [
    "redesigned estimand and repetition plan",
    "exact model and pipeline freeze",
    "gate-observed rerun or precommitted trusted-runner attestation",
    "independent method-freeze and G3 approval",
  ];
  humanReviewRequired: true;
  releaseAllowed: false;
  submissionAllowed: false;
}

const AGENTDOJO_REPOSITORY = "ethz-spylab/agentdojo";
const AGENTDOJO_REVISION = "089ed468cf3ed0322acc66b0211f26d9d90dbf60";
const TAU2_REPOSITORY = "sierra-research/tau2-bench";
const TAU2_REVISION = "a2c024725189473d2d7cea3a5cfdbcc67478e41f";

const AGENTDOJO_GLOBAL_BLOBS: SourceBlobLock[] = [
  {
    path: "src/agentdojo/benchmark.py",
    blobSha: "162bd6a8af3ca607f893ad3d631db4d238501523",
  },
  {
    path: "src/agentdojo/task_suite/load_suites.py",
    blobSha: "918869e62928d2e5ec9bd82b047caa771a90f42c",
  },
  {
    path: "src/agentdojo/task_suite/task_suite.py",
    blobSha: "da0f3bd18f058ef4d74decad25658d434338a993",
  },
];

const AGENTDOJO_SUITE_BLOBS: Record<string, SourceBlobLock[]> = {
  workspace: [
    {
      path: "src/agentdojo/default_suites/v1/workspace/task_suite.py",
      blobSha: "cb4155984be34f16180da3730870248013374bd0",
    },
    {
      path: "src/agentdojo/data/suites/workspace/environment.yaml",
      blobSha: "8cce08c9b5242920aec9a676a839fc2dda0f472b",
    },
    {
      path: "src/agentdojo/data/suites/workspace/injection_vectors.yaml",
      blobSha: "e1212b54134e63edbb6dcc73e184fc357a47f717",
    },
  ],
  banking: [
    {
      path: "src/agentdojo/default_suites/v1/banking/task_suite.py",
      blobSha: "2a0eb32a09f94ab3d177ee1cd55eed52b030682a",
    },
    {
      path: "src/agentdojo/data/suites/banking/environment.yaml",
      blobSha: "f8ca06277c11aad83c92658aa31727f01b32f9a6",
    },
    {
      path: "src/agentdojo/data/suites/banking/injection_vectors.yaml",
      blobSha: "dcaad0a354bcae278034262e715aaf7a0152380e",
    },
  ],
  slack: [
    {
      path: "src/agentdojo/default_suites/v1/slack/task_suite.py",
      blobSha: "1fac40091fc24c9e758e992df4d7e9946b781f9e",
    },
    {
      path: "src/agentdojo/data/suites/slack/environment.yaml",
      blobSha: "1529623a6f748311c0eb5e25454db57f6f1c334b",
    },
    {
      path: "src/agentdojo/data/suites/slack/injection_vectors.yaml",
      blobSha: "f02689af9aae5ddfa114d8c876eb10a32c8379d1",
    },
  ],
  travel: [
    {
      path: "src/agentdojo/default_suites/v1/travel/task_suite.py",
      blobSha: "8b527c86fc8158f4da5c5401d28ccba892e3b9be",
    },
    {
      path: "src/agentdojo/data/suites/travel/environment.yaml",
      blobSha: "bfdee61d435646b78961ef2c97f9227905fe71b3",
    },
    {
      path: "src/agentdojo/data/suites/travel/injection_vectors.yaml",
      blobSha: "d1506d2a59566fd595edc9d9768ef3a00db24e9d",
    },
  ],
};

const AGENTDOJO_EFFECTIVE_TASK_BLOB: Record<string, SourceBlobLock> = {
  "workspace:user_task_0": {
    path: "src/agentdojo/default_suites/v1_2/workspace/user_tasks.py",
    blobSha: "f742906b6b6202a62356cd06a9d8ed3ff57ed7a5",
  },
  "workspace:user_task_1": {
    path: "src/agentdojo/default_suites/v1/workspace/user_tasks.py",
    blobSha: "15f72f17305629f16cd7d754e47640e8b2613985",
  },
  "workspace:user_task_2": {
    path: "src/agentdojo/default_suites/v1/workspace/user_tasks.py",
    blobSha: "15f72f17305629f16cd7d754e47640e8b2613985",
  },
  "banking:user_task_0": {
    path: "src/agentdojo/default_suites/v1/banking/user_tasks.py",
    blobSha: "cb19278cfee4a622407c065022fde0b6e48f9f71",
  },
  "banking:user_task_2": {
    path: "src/agentdojo/default_suites/v1/banking/user_tasks.py",
    blobSha: "cb19278cfee4a622407c065022fde0b6e48f9f71",
  },
  "banking:user_task_6": {
    path: "src/agentdojo/default_suites/v1_2_2/banking/user_tasks.py",
    blobSha: "bde0330cdb72cddb0fb4bb3df1cb36d6bee66c78",
  },
  "slack:user_task_0": {
    path: "src/agentdojo/default_suites/v1/slack/user_tasks.py",
    blobSha: "912f521f6e5e3849db97bbb296293f574359266d",
  },
  "slack:user_task_1": {
    path: "src/agentdojo/default_suites/v1/slack/user_tasks.py",
    blobSha: "912f521f6e5e3849db97bbb296293f574359266d",
  },
  "travel:user_task_0": {
    path: "src/agentdojo/default_suites/v1_1/travel/user_tasks.py",
    blobSha: "2346517950b605989295b1a0b4669f66505f54c9",
  },
  "travel:user_task_1": {
    path: "src/agentdojo/default_suites/v1_2/travel/user_tasks.py",
    blobSha: "b3106f61d84d1bc1a56bea96ddc3abf23b9a187c",
  },
};

const TAU2_GLOBAL_BLOBS: SourceBlobLock[] = [
  {
    path: "src/tau2/evaluator/evaluator.py",
    blobSha: "76c95a83e9049d70a5570b93989797c0626974b6",
  },
  {
    path: "src/tau2/evaluator/evaluator_communicate.py",
    blobSha: "1bac18fd8830304894da767d2e6b7efe6e779e89",
  },
  {
    path: "src/tau2/evaluator/evaluator_nl_assertions.py",
    blobSha: "1f5397c5b8f8b105bf3d76027518d3bc3eb3e0f7",
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

const TAU2_DOMAIN_BLOBS: Record<"airline" | "retail", SourceBlobLock[]> = {
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

const RETAIL_REQUIRED_CHECKS: Record<string, Tau2RequiredCheck[]> = {
  "ext-076": [{ kind: "trace-action", action: "transfer_to_human_agents" }],
  "ext-077": [{ kind: "trace-action", action: "transfer_to_human_agents" }],
  "ext-078": [{ kind: "state-derived-communication", field: "tracking_number" }],
  "ext-079": [{ kind: "trace-action", action: "transfer_to_human_agents" }],
  "ext-080": [{ kind: "state-derived-communication", field: "estimated_delivery_date" }],
};

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

function contractSha256(body: ControlExecutionContractBody) {
  return createHash("sha256").update(canonicalJson(body)).digest("hex");
}

function fail(message: string): never {
  throw new Error(`Control execution contract validation failed: ${message}`);
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

function controlForTarget(
  target: IndependentTargetEntry,
  targets: IndependentTargetEntry[],
  controls: ControlConfiguration[],
) {
  const familyTargets = targets
    .filter((candidate) => candidate.family === target.family)
    .sort((left, right) => numericTargetId(left.targetId) - numericTargetId(right.targetId));
  const familyControls = controls
    .filter((candidate) => candidate.family === target.family)
    .sort((left, right) => left.id.localeCompare(right.id));
  const index = familyTargets.findIndex((candidate) => candidate.targetId === target.targetId);
  const control = familyControls[index];
  if (index < 0 || !control || familyTargets.length !== 10 || familyControls.length !== 10)
    fail(`cannot resolve provisional matched control for ${target.targetId}`);
  return control;
}

function agentDojoContract(
  target: AgentDojoTargetEntry,
  controlConfigurationId: string,
  availability: SourceAvailabilityAudit,
): AgentDojoControlExecutionContractBody {
  if (
    availability.sources.agentdojo.revision !== AGENTDOJO_REVISION ||
    target.benchmarkVersion !== "v1.2.2"
  )
    fail(`AgentDojo source lock drift for ${target.targetId}`);
  const taskBlob = AGENTDOJO_EFFECTIVE_TASK_BLOB[`${target.suite}:${target.userTask}`];
  const suiteBlobs = AGENTDOJO_SUITE_BLOBS[target.suite];
  if (!taskBlob || !suiteBlobs) fail(`unsupported AgentDojo task identity ${target.targetId}`);
  return {
    targetId: target.targetId,
    controlConfigurationId,
    bindingMethod: "provisional-family-order-review-required",
    executionState: "not-executed",
    source: "agentdojo",
    benchmarkVersion: "v1.2.2",
    suite: target.suite,
    userTask: target.userTask,
    sourceLock: {
      repository: AGENTDOJO_REPOSITORY,
      revision: AGENTDOJO_REVISION,
      unitKind: "benchmark-task",
      unitId: `v1.2.2/${target.suite}/${target.userTask}/without-injections`,
      sourceBlobs: sortedBlobs([...AGENTDOJO_GLOBAL_BLOBS, ...suiteBlobs, taskBlob]),
    },
    runner: {
      entrypoint: "agentdojo.benchmark.benchmark_suite_without_injections",
      attackArgument: null,
      injectionTaskId: null,
      injections: {},
      forceRerun: true,
      cachedResultEligible: false,
    },
    acceptance: {
      requireExactSuiteAndUserTask: true,
      requireNonemptyTrace: true,
      requireUpstreamUtilityTrue: true,
      requireReportedSecurityTrue: true,
      reportedSecurityIsIndependentAcceptance: false,
    },
  };
}

function tau2Checks(target: Tau2TargetEntry): Tau2RequiredCheck[] {
  if (target.domain === "airline") {
    if (!target.nlAssertions || target.nlAssertions.length === 0)
      fail(`airline control lacks required assertions for ${target.targetId}`);
    return target.nlAssertions.map((assertion) => ({
      kind: "upstream-nl-assertion" as const,
      assertion,
    }));
  }
  const checks = RETAIL_REQUIRED_CHECKS[target.targetId];
  if (!checks || checks.length === 0)
    fail(`retail control lacks a predeclared operational check for ${target.targetId}`);
  return checks;
}

function tau2Contract(
  target: Tau2TargetEntry,
  controlConfigurationId: string,
  availability: SourceAvailabilityAudit,
): Tau2ControlExecutionContractBody {
  if (
    availability.sources["tau2-bench"].revision !== TAU2_REVISION ||
    target.auditIssue !== "https://github.com/sierra-research/tau2-bench/issues/384" ||
    !["airline", "retail"].includes(target.domain)
  )
    fail(`tau2 source lock drift for ${target.targetId}`);
  const domain = target.domain as "airline" | "retail";
  const domainBlobs = TAU2_DOMAIN_BLOBS[domain];
  const taskBlob = domainBlobs.find((blob) => blob.path.endsWith("/tasks.json"));
  if (!taskBlob || taskBlob.blobSha !== target.taskBlobSha)
    fail(`tau2 task blob drift for ${target.targetId}`);
  return {
    targetId: target.targetId,
    controlConfigurationId,
    bindingMethod: "provisional-family-order-review-required",
    executionState: "not-executed",
    source: "tau2-bench",
    domain,
    taskId: target.taskId,
    auditIssue: "https://github.com/sierra-research/tau2-bench/issues/384",
    sourceLock: {
      repository: TAU2_REPOSITORY,
      revision: TAU2_REVISION,
      unitKind: "benchmark-task",
      unitId: `${domain}/tasks.json#${target.taskId}`,
      sourceBlobs: sortedBlobs([...TAU2_GLOBAL_BLOBS, ...domainBlobs]),
    },
    runner: {
      entrypoint: "tau2.run.run_single_task",
      evaluationType: "ALL_WITH_NL_ASSERTIONS",
      requireFreshRun: true,
    },
    acceptance: {
      requireExactDomainAndTask: true,
      requireNonemptyTrace: true,
      requireUpstreamRewardOne: true,
      upstreamRewardIsSoleAcceptance: false,
      requiredChecks: tau2Checks(target),
    },
  };
}

export function buildControlExecutionContractArtifact(input: {
  targets: IndependentTargetEntry[];
  controls: ControlConfiguration[];
  availability: SourceAvailabilityAudit;
}): ControlExecutionContractArtifact {
  const targets = input.targets
    .filter((target) => target.source === "agentdojo" || target.source === "tau2-bench")
    .sort((left, right) => numericTargetId(left.targetId) - numericTargetId(right.targetId));
  const expectedIds = [
    ...Array.from({ length: 10 }, (_, index) => `ext-${String(51 + index).padStart(3, "0")}`),
    ...Array.from({ length: 10 }, (_, index) => `ext-${String(71 + index).padStart(3, "0")}`),
  ];
  if (
    targets.length !== 20 ||
    JSON.stringify(targets.map((target) => target.targetId)) !== JSON.stringify(expectedIds)
  )
    fail("control-contract target universe is not the expected AgentDojo and tau2 partition");

  const contracts = targets.map((target) => {
    const control = controlForTarget(target, input.targets, input.controls);
    const body =
      target.source === "agentdojo"
        ? agentDojoContract(target, control.id, input.availability)
        : tau2Contract(target, control.id, input.availability);
    return { ...body, contractSha256: contractSha256(body) } as ControlExecutionContract;
  });
  if (new Set(contracts.map((contract) => contract.contractSha256)).size !== 20)
    fail("control contract hashes are not unique");

  return {
    schemaVersion: "p26-002-control-execution-contracts-0.1.0",
    status: "candidate-method-contracts-review-required",
    scope: "predeclared-control-acceptance-not-execution-evidence",
    preparedOn: "2026-08-30",
    contracts,
    summary: {
      expected: 20,
      defined: 20,
      agentdojo: contracts.filter((contract) => contract.source === "agentdojo").length as 10,
      tau2: contracts.filter((contract) => contract.source === "tau2-bench").length as 10,
      executionsProvided: 0,
    },
    unresolvedBeforeExecution: [
      "redesigned estimand and repetition plan",
      "exact model and pipeline freeze",
      "gate-observed rerun or precommitted trusted-runner attestation",
      "independent method-freeze and G3 approval",
    ],
    humanReviewRequired: true,
    releaseAllowed: false,
    submissionAllowed: false,
  };
}

export function validateControlExecutionContractArtifact(
  artifact: ControlExecutionContractArtifact,
  input: {
    targets: IndependentTargetEntry[];
    controls: ControlConfiguration[];
    availability: SourceAvailabilityAudit;
  },
) {
  const expected = buildControlExecutionContractArtifact(input);
  if (canonicalJson(artifact) !== canonicalJson(expected))
    fail("artifact bytes do not match the executable predeclared contracts");
  return artifact;
}

export function controlExecutionContractForTarget(
  artifact: ControlExecutionContractArtifact,
  targetId: string,
) {
  const matches = artifact.contracts.filter((contract) => contract.targetId === targetId);
  if (matches.length !== 1) fail(`expected one contract for ${targetId}, found ${matches.length}`);
  return matches[0]!;
}
