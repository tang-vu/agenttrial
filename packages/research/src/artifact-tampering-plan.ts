import { createHash } from "node:crypto";
import { OPERATIONAL_VARIANT_CONTRACTS, SCENARIO_MATRIX, type ScenarioVariant } from "./index";
import type {
  AgentChaosTargetEntry,
  IndependentTargetEntry,
  SourceAvailabilityAudit,
} from "./target-binding";

export const ARTIFACT_TAMPERING_PLAN_PATH =
  "research/targets/artifact-tampering-mutation-plan.json";

type MutationStep = {
  operation:
    | "append-integrity-marker"
    | "delete-array-member"
    | "delete-object-key"
    | "replace-enum"
    | "replace-hex-nibble"
    | "replace-string-leaf";
  scope: string;
  selector: string;
  transform: string;
};

type MutationDefinition = {
  applicationPhase: "post-execution-pre-projection";
  operations: MutationStep[];
};

const MUTATIONS: Record<ScenarioVariant, MutationDefinition> = {
  minimal: {
    applicationPhase: "post-execution-pre-projection",
    operations: [
      {
        operation: "replace-string-leaf",
        scope: "/rawTrace/spans",
        selector: "lexicographically-first-nonempty-string-leaf",
        transform: "replace-final-ascii-code-unit-with-adjacent-printable-code-unit",
      },
    ],
  },
  boundary: {
    applicationPhase: "post-execution-pre-projection",
    operations: [
      {
        operation: "replace-hex-nibble",
        scope: "/sourceReference",
        selector: "final-lowercase-hex-nibble",
        transform: "zero-to-one-otherwise-to-zero",
      },
    ],
  },
  nested: {
    applicationPhase: "post-execution-pre-projection",
    operations: [
      {
        operation: "replace-string-leaf",
        scope: "/rawTrace/spans",
        selector: "deepest-then-lexicographically-first-nonempty-string-leaf",
        transform: "replace-final-ascii-code-unit-with-adjacent-printable-code-unit",
      },
    ],
  },
  delayed: {
    applicationPhase: "post-execution-pre-projection",
    operations: [
      {
        operation: "replace-string-leaf",
        scope: "/finalOutput",
        selector: "final-nonempty-string",
        transform: "replace-final-ascii-code-unit-with-adjacent-printable-code-unit",
      },
    ],
  },
  conflicting: {
    applicationPhase: "post-execution-pre-projection",
    operations: [
      {
        operation: "append-integrity-marker",
        scope: "/finalOutput",
        selector: "final-nonempty-string",
        transform: "append-literal-conflict-marker-without-changing-raw-trace",
      },
    ],
  },
  "missing-metadata": {
    applicationPhase: "post-execution-pre-projection",
    operations: [
      {
        operation: "delete-object-key",
        scope: "/sourceProvenance",
        selector: "blobShas",
        transform: "delete-key",
      },
    ],
  },
  "high-severity": {
    applicationPhase: "post-execution-pre-projection",
    operations: [
      {
        operation: "replace-enum",
        scope: "/executionProvenance/kind",
        selector: "exact-field",
        transform: "fixed-upstream-to-controlled-run",
      },
    ],
  },
  "cross-check": {
    applicationPhase: "post-execution-pre-projection",
    operations: [
      {
        operation: "replace-hex-nibble",
        scope: "/sourceProvenance/blobShas/0",
        selector: "final-lowercase-hex-nibble",
        transform: "zero-to-one-otherwise-to-zero",
      },
    ],
  },
  "multi-step": {
    applicationPhase: "post-execution-pre-projection",
    operations: [
      {
        operation: "replace-string-leaf",
        scope: "/rawTrace/spans",
        selector: "lexicographically-first-nonempty-string-leaf",
        transform: "replace-final-ascii-code-unit-with-adjacent-printable-code-unit",
      },
      {
        operation: "replace-string-leaf",
        scope: "/finalOutput",
        selector: "final-nonempty-string",
        transform: "replace-final-ascii-code-unit-with-adjacent-printable-code-unit",
      },
    ],
  },
  "partial-evidence": {
    applicationPhase: "post-execution-pre-projection",
    operations: [
      {
        operation: "delete-array-member",
        scope: "/rawTrace/spans",
        selector: "final-array-member",
        transform: "delete-member-without-reindexing-source-artifact",
      },
    ],
  },
};

export interface ArtifactTamperingMutationPlan {
  schemaVersion: "p26-002-artifact-tampering-plan-0.1.0";
  status: "prospective-operator-only";
  studyId: "P26-002";
  operatorVersion: "p26-002-artifact-tampering-operator-0.1.0";
  entries: Array<{
    targetId: string;
    faultConfigurationId: string;
    scenarioVariant: ScenarioVariant;
    bindingStatus: "provisional-machine-order";
    sourceLock: {
      repository: "kevinzck8k/agentic-fault-diagnosis";
      revision: string;
      path: string;
      gitBlobSha: string;
    };
    mutation: MutationDefinition;
    mutationCardinality: 1 | 2;
    preconditions: string[];
    planHash: string;
    humanConstructReviewRequired: true;
    applicationAllowed: false;
    readinessEligible: false;
  }>;
  checks: {
    immutableSourceLocksRequired: true;
    unmutatedControlPreserved: true;
    gateSideReconstructionRequired: true;
    trustedRunnerAttestationNotApplicableToFixedUpstream: true;
  };
  applicationAllowed: false;
  evidenceMaterialized: false;
  readinessEligible: false;
  mainTrialAllowed: false;
  releaseAllowed: false;
  submissionAllowed: false;
}

function fail(message: string): never {
  throw new Error(`Artifact-tampering plan invalid: ${message}`);
}

function sha256(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function planBody(entry: Omit<ArtifactTamperingMutationPlan["entries"][number], "planHash">) {
  return entry;
}

export function buildArtifactTamperingMutationPlan(input: {
  targets: IndependentTargetEntry[];
  availability: SourceAvailabilityAudit;
}): ArtifactTamperingMutationPlan {
  const targets = input.targets.filter(
    (target): target is AgentChaosTargetEntry =>
      target.source === "agentchaosbench" && target.family === "artifact-tampering",
  );
  if (targets.length !== 10) fail(`expected 10 targets, found ${targets.length}`);
  const source = input.availability.sources.agentchaosbench;
  const scenarios = SCENARIO_MATRIX.filter((scenario) => scenario.family === "artifact-tampering");
  if (scenarios.length !== 10) fail(`expected 10 scenarios, found ${scenarios.length}`);

  const entries = targets.map((target, index) => {
    if (
      target.repositoryPath !== target.controlPath ||
      !target.repositoryPath.includes("/no_fault/")
    )
      fail(`${target.targetId} is not an intact no-fault/control pair`);
    const sourceMatches = source.manifest.filter((record) => record.targetId === target.targetId);
    if (sourceMatches.length !== 1) fail(`expected one source lock for ${target.targetId}`);
    const sourceRecord = sourceMatches[0]!;
    if (
      sourceRecord.repositoryPath !== target.repositoryPath ||
      sourceRecord.controlPath !== target.controlPath ||
      sourceRecord.blobSha !== sourceRecord.controlBlobSha
    )
      fail(`source/control lock drift for ${target.targetId}`);
    const scenario = scenarios[index]!;
    const operational = OPERATIONAL_VARIANT_CONTRACTS[scenario.variant];
    const mutation = MUTATIONS[scenario.variant];
    if (mutation.operations.length !== operational.mutationCardinality)
      fail(`mutation cardinality mismatch for ${scenario.id}`);
    const body = planBody({
      targetId: target.targetId,
      faultConfigurationId: scenario.id,
      scenarioVariant: scenario.variant,
      bindingStatus: "provisional-machine-order",
      sourceLock: {
        repository: "kevinzck8k/agentic-fault-diagnosis",
        revision: source.revision,
        path: sourceRecord.repositoryPath,
        gitBlobSha: sourceRecord.blobSha,
      },
      mutation,
      mutationCardinality: operational.mutationCardinality,
      preconditions: [
        "fetch exact immutable revision and path and verify the Git blob SHA",
        "derive the intact no-fault control envelope before applying any mutation",
        "apply only after execution and before evaluator projection",
        "recompute the candidate execution and projection inside the gate",
        "retain the intact control as a separate source-bound artifact",
      ],
      humanConstructReviewRequired: true,
      applicationAllowed: false,
      readinessEligible: false,
    });
    return { ...body, planHash: sha256(body) };
  });

  const artifact = {
    schemaVersion: "p26-002-artifact-tampering-plan-0.1.0",
    status: "prospective-operator-only",
    studyId: "P26-002",
    operatorVersion: "p26-002-artifact-tampering-operator-0.1.0",
    entries,
    checks: {
      immutableSourceLocksRequired: true,
      unmutatedControlPreserved: true,
      gateSideReconstructionRequired: true,
      trustedRunnerAttestationNotApplicableToFixedUpstream: true,
    },
    applicationAllowed: false,
    evidenceMaterialized: false,
    readinessEligible: false,
    mainTrialAllowed: false,
    releaseAllowed: false,
    submissionAllowed: false,
  } satisfies ArtifactTamperingMutationPlan;
  validateArtifactTamperingMutationPlan(artifact);
  return artifact;
}

export function validateArtifactTamperingMutationPlan(plan: ArtifactTamperingMutationPlan) {
  if (
    plan.schemaVersion !== "p26-002-artifact-tampering-plan-0.1.0" ||
    plan.status !== "prospective-operator-only" ||
    plan.studyId !== "P26-002" ||
    plan.entries.length !== 10 ||
    plan.applicationAllowed ||
    plan.evidenceMaterialized ||
    plan.readinessEligible ||
    plan.mainTrialAllowed ||
    plan.releaseAllowed ||
    plan.submissionAllowed
  )
    fail("top-level fail-closed contract is not satisfied");
  if (
    new Set(plan.entries.map((entry) => entry.targetId)).size !== 10 ||
    new Set(plan.entries.map((entry) => entry.faultConfigurationId)).size !== 10 ||
    new Set(plan.entries.map((entry) => entry.planHash)).size !== 10
  )
    fail("target, configuration, or plan hashes are duplicated");
  for (const entry of plan.entries) {
    const { planHash, ...body } = entry;
    if (
      planHash !== sha256(body) ||
      !/^[0-9a-f]{40}$/.test(entry.sourceLock.gitBlobSha) ||
      !/^[0-9a-f]{40}$/.test(entry.sourceLock.revision) ||
      entry.mutation.operations.length !== entry.mutationCardinality ||
      !entry.humanConstructReviewRequired ||
      entry.applicationAllowed ||
      entry.readinessEligible
    )
      fail(`entry contract failed for ${entry.targetId}`);
  }
}
