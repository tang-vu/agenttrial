import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import {
  buildFixedUpstreamSourceExecution,
  gitBlobSha1,
  type LockedSourceProvenance,
  type PinnedSourceBlobReader,
} from "./source-execution-derivation";
import {
  projectAgentChaosCase,
  projectAgentDojoRun,
  type AgentChaosCase,
  type AgentDojoRun,
  type EvaluatorProjection,
} from "./target-adapter";
import type {
  AgentChaosTargetEntry,
  AgentDojoTargetEntry,
  IndependentTargetEntry,
  SourceAvailabilityAudit,
} from "./target-binding";
import type { RemainingProjectionAudit } from "./projection-audit";

export const FIXED_UPSTREAM_FAULT_EVIDENCE_PATH =
  "research/targets/evidence/fixed-upstream-fault-projections.json.gz";
export const FIXED_UPSTREAM_RECONSTRUCTION_RECEIPT_PATH =
  "research/targets/fixed-upstream-reconstruction-receipt.json";
export const UNAPPLIED_ARTIFACT_TAMPERING_TARGET_IDS = [
  "ext-009",
  "ext-010",
  "ext-019",
  "ext-020",
  "ext-029",
  "ext-030",
  "ext-039",
  "ext-040",
  "ext-049",
  "ext-050",
] as const;

type FixedUpstreamTarget = AgentChaosTargetEntry | AgentDojoTargetEntry;

export interface FixedUpstreamFaultProjectionEvidenceRecord {
  targetId: string;
  projectionHash: string;
  projectionJson: string;
  sourceExecutionReference: string;
  sourceExecutionSha256: string;
  sourceExecutionJson: string;
}

export interface FixedUpstreamFaultProjectionEvidenceArtifact {
  schemaVersion: "p26-002-readiness-evidence-0.1.0";
  status: "passed";
  checks: {
    artifactHashesRecomputed: true;
    labelBlind: true;
    projectionHashesRecomputed: true;
    sourceBound: true;
    targetControlPairBound: false;
  };
  faultProjections: FixedUpstreamFaultProjectionEvidenceRecord[];
  controlProjections: [];
  controlSources: [];
  releaseBoundary: { rawSourcePayloadsRetained: false };
  submissionAllowed: false;
}

function fail(message: string): never {
  throw new Error(`Fixed upstream evidence reconstruction failed: ${message}`);
}

function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function parseJsonObject<T>(bytes: Uint8Array, targetId: string) {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    fail(`source blob is not valid JSON for ${targetId}`);
  }
  if (typeof value !== "object" || value === null || Array.isArray(value))
    fail(`source blob is not a JSON object for ${targetId}`);
  return value as T;
}

function caseUidFromPath(path: string) {
  const slash = path.indexOf("/");
  if (slash < 0 || !path.endsWith(".json")) fail(`invalid AgentChaosBench path ${path}`);
  return path.slice(slash + 1, -".json".length);
}

function canonicalProjectionJson(projection: EvaluatorProjection) {
  return JSON.stringify({
    schemaVersion: projection.schemaVersion,
    targetId: projection.targetId,
    source: projection.source,
    policy: projection.policy,
    task: projection.task,
    finalOutput: projection.finalOutput,
    rawTrace: projection.rawTrace,
  });
}

export function buildFixedUpstreamFaultProjectionEvidenceRecord(input: {
  target: FixedUpstreamTarget;
  sourceProvenance: LockedSourceProvenance;
  sourceBytes: Uint8Array;
  runnerMethodDigest: string;
}) {
  const { target, sourceProvenance, sourceBytes, runnerMethodDigest } = input;
  if (
    sourceProvenance.unitKind !== "upstream-fixed-execution" ||
    sourceProvenance.blobShas.length !== 1 ||
    gitBlobSha1(sourceBytes) !== sourceProvenance.blobShas[0]
  )
    fail(`source bytes do not match the frozen Git blob for ${target.targetId}`);

  const projection =
    target.source === "agentchaosbench"
      ? projectAgentChaosCase(
          {
            targetId: target.targetId,
            family: target.family,
            source: target.source,
            caseUid: caseUidFromPath(sourceProvenance.unitId),
            ...("faultType" in target && typeof target.faultType === "string"
              ? { faultType: target.faultType }
              : {}),
          },
          parseJsonObject<AgentChaosCase>(sourceBytes, target.targetId),
        )
      : projectAgentDojoRun(target, parseJsonObject<AgentDojoRun>(sourceBytes, target.targetId));
  const execution = buildFixedUpstreamSourceExecution({
    target,
    condition: "fault",
    sourceProvenance,
    runnerMethodDigest,
    task: projection.task,
    finalOutput: projection.finalOutput,
    rawTrace: projection.rawTrace,
  });
  const sourceExecutionJson = JSON.stringify(execution);
  return {
    targetId: target.targetId,
    projectionHash: projection.projectionHash,
    projectionJson: canonicalProjectionJson(projection),
    sourceExecutionReference: execution.sourceReference,
    sourceExecutionSha256: sha256(sourceExecutionJson),
    sourceExecutionJson,
  } satisfies FixedUpstreamFaultProjectionEvidenceRecord;
}

function exactRecord<T extends { targetId: string }>(
  records: T[],
  targetId: string,
  description: string,
) {
  const matches = records.filter((record) => record.targetId === targetId);
  if (matches.length !== 1)
    fail(`expected one ${description} for ${targetId}, found ${matches.length}`);
  return matches[0]!;
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  project: (value: T) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (next < values.length) {
        const index = next++;
        results[index] = await project(values[index]!);
      }
    }),
  );
  return results;
}

export async function buildFixedUpstreamFaultProjectionEvidence(input: {
  targets: IndependentTargetEntry[];
  availability: SourceAvailabilityAudit;
  runnerMethodDigest: string;
  readPinnedBlob: PinnedSourceBlobReader;
}) {
  const { availability, runnerMethodDigest, readPinnedBlob } = input;
  const targets = input.targets.filter(
    (target): target is FixedUpstreamTarget =>
      (target.source === "agentchaosbench" && target.family !== "artifact-tampering") ||
      target.source === "agentdojo",
  );
  if (
    targets.length !== 50 ||
    availability.sources.agentchaosbench.manifest.length !== 50 ||
    availability.sources.agentdojo.manifest.length !== 10 ||
    !/^[0-9a-f]{64}$/.test(runnerMethodDigest)
  )
    fail("the frozen fixed-upstream partition or runner method digest is invalid");

  const faultProjections = await mapWithConcurrency(targets, 6, async (target) => {
    const repository =
      target.source === "agentchaosbench"
        ? "kevinzck8k/agentic-fault-diagnosis"
        : "ethz-spylab/agentdojo";
    const source =
      target.source === "agentchaosbench"
        ? exactRecord(
            availability.sources.agentchaosbench.manifest,
            target.targetId,
            "AgentChaosBench source record",
          )
        : exactRecord(
            availability.sources.agentdojo.manifest,
            target.targetId,
            "AgentDojo source record",
          );
    const revision =
      target.source === "agentchaosbench"
        ? availability.sources.agentchaosbench.revision
        : availability.sources.agentdojo.revision;
    const unitId = "repositoryPath" in source ? source.repositoryPath : source.path;
    if (
      (target.source === "agentchaosbench" && unitId !== target.repositoryPath) ||
      (target.source === "agentdojo" &&
        unitId !==
          `runs/command-r-plus/${target.suite}/${target.userTask}/important_instructions/${target.injectionTask}.json`)
    )
      fail(`source path drift for ${target.targetId}`);
    const sourceProvenance: LockedSourceProvenance = {
      repository,
      revision,
      unitKind: "upstream-fixed-execution",
      unitId,
      blobShas: [source.blobSha],
    };
    const sourceBytes = await readPinnedBlob({
      repository,
      revision,
      path: unitId,
      expectedGitBlobSha: source.blobSha,
    });
    return buildFixedUpstreamFaultProjectionEvidenceRecord({
      target,
      sourceProvenance,
      sourceBytes,
      runnerMethodDigest,
    });
  });
  if (
    new Set(faultProjections.map((record) => record.targetId)).size !== 50 ||
    new Set(faultProjections.map((record) => record.sourceExecutionSha256)).size !== 50
  )
    fail("the reconstructed fixed-upstream records are duplicated");

  return {
    schemaVersion: "p26-002-readiness-evidence-0.1.0",
    status: "passed",
    checks: {
      artifactHashesRecomputed: true,
      labelBlind: true,
      projectionHashesRecomputed: true,
      sourceBound: true,
      targetControlPairBound: false,
    },
    faultProjections,
    controlProjections: [],
    controlSources: [],
    releaseBoundary: { rawSourcePayloadsRetained: false },
    submissionAllowed: false,
  } satisfies FixedUpstreamFaultProjectionEvidenceArtifact;
}

export function buildFixedUpstreamFaultProjectionManifest(input: {
  artifact: FixedUpstreamFaultProjectionEvidenceArtifact;
  artifactSha256: string;
}): RemainingProjectionAudit & { scope: string } {
  const { artifact, artifactSha256 } = input;
  if (!/^[0-9a-f]{64}$/.test(artifactSha256) || artifact.faultProjections.length !== 50)
    fail("the evidence artifact digest or record count is invalid");
  return {
    schemaVersion: "p26-002-remaining-projection-audit-0.3.0",
    status: "partial",
    scope:
      "gate-reconstructed-source-bound-label-blind-fixed-upstream-fault-projections-excluding-unapplied-artifact-tampering-not-main-study-outcomes",
    expected: { fault: 80, control: 80 },
    verified: { fault: 50, control: 0 },
    labelBlindChecks: {
      fault: true,
      control: false,
      sourceBound: true,
      targetControlPairBound: false,
    },
    faultProjections: artifact.faultProjections.map((record) => ({
      targetId: record.targetId,
      projectionHash: record.projectionHash,
      sourceExecutionReference: record.sourceExecutionReference,
      sourceExecutionSha256: record.sourceExecutionSha256,
      evidenceArtifactSha256: artifactSha256,
    })),
    controlProjections: [],
    evidenceArtifacts: [{ path: FIXED_UPSTREAM_FAULT_EVIDENCE_PATH, sha256: artifactSha256 }],
    releaseBoundary: { rawSourcesRetained: false },
    submissionAllowed: false,
  };
}

export function buildFixedUpstreamReconstructionReceipt(input: {
  artifact: FixedUpstreamFaultProjectionEvidenceArtifact;
  artifactSha256: string;
  artifactByteLength: number;
  runnerMethodDigest: string;
}) {
  const { artifact, artifactSha256, artifactByteLength, runnerMethodDigest } = input;
  const candidateTargetIds = artifact.faultProjections.map((record) => record.targetId);
  if (
    artifact.faultProjections.length !== 50 ||
    new Set(candidateTargetIds).size !== 50 ||
    !/^[0-9a-f]{64}$/.test(artifactSha256) ||
    !Number.isSafeInteger(artifactByteLength) ||
    artifactByteLength <= 0 ||
    !/^[0-9a-f]{64}$/.test(runnerMethodDigest)
  )
    fail("cannot issue a local reconstruction receipt for invalid candidate evidence");
  return {
    schemaVersion: "p26-002-fixed-upstream-reconstruction-receipt-0.1.0",
    status: "local-verification-only",
    readinessEligible: false,
    scope: "unpublished-non-evidence-fixed-upstream-reconstruction-dry-run",
    localVerification: {
      sourceBoundFaultCandidates: 50,
      artifactTamperingSourcesNotApplied: 10,
      controlProjections: 0,
      candidateTargetIds,
      excludedArtifactTamperingTargetIds: [...UNAPPLIED_ARTIFACT_TAMPERING_TARGET_IDS],
      runnerMethodDigest,
    },
    localArtifact: {
      path: FIXED_UPSTREAM_FAULT_EVIDENCE_PATH,
      sha256: artifactSha256,
      byteLength: artifactByteLength,
      gitVersioned: false,
      published: false,
    },
    canonicalManifestUpdated: false,
    readinessEligibleFaultProjections: 0,
    promotionRequirement:
      "authorized evidence materialization followed by gate-side source and content verification",
    mainTrialAllowed: false,
    releaseAllowed: false,
    submissionAllowed: false,
  } as const;
}

export function fixedUpstreamFaultEvidenceBytes(
  artifact: FixedUpstreamFaultProjectionEvidenceArtifact,
) {
  const json = `${JSON.stringify(artifact, null, 2)}\n`;
  const scanned = json.replaceAll("AKIA1234567890ABCDEF", "[TEST_FIXTURE]");
  const credentialPatterns = [
    /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/,
    /(?:ghp|github_pat)_[A-Za-z0-9_-]{20,}/,
    /AKIA[0-9A-Z]{16}/,
    /-----BEGIN (?:EC |RSA )?PRIVATE KEY-----/,
    /(?:EAS_PRIVATE_KEY|AGENTTRIAL_SIGNING_SEED)\s*=\s*["']?[0-9a-fA-F]{64}["']?/,
    /"TunnelSecret"\s*:\s*"[^"\s]{16,}"/,
  ];
  if (credentialPatterns.some((pattern) => pattern.test(scanned)))
    fail("the derived evidence contains a credential-like value");
  return gzipSync(Buffer.from(json, "utf8"), { level: 9 });
}

export function fixedUpstreamFaultEvidenceSha256(bytes: Uint8Array) {
  return sha256(bytes);
}
