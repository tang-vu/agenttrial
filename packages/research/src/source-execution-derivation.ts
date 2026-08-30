import { createHash } from "node:crypto";
import {
  projectAgentChaosCase,
  projectAgentDojoRun,
  type AgentChaosCase,
  type AgentDojoRun,
  type JsonValue,
} from "./target-adapter";
import type { IndependentTargetEntry } from "./target-binding";

export const SOURCE_EXECUTION_DERIVATION_CAPABILITY = {
  schemaVersion: "p26-002-source-execution-derivation-capability-0.2.0",
  status: "fixed-upstream-supported-controlled-run-blocked",
  fixedUpstreamVerification: "git-blob-sha-and-deterministic-adapter",
  controlledRunVerification: "not-implemented-no-reexecution-or-trusted-attestation",
  readinessEvidenceAllowed: false,
} as const;

export interface LockedSourceProvenance {
  repository: string;
  revision: string;
  unitKind: "upstream-fixed-execution" | "benchmark-task";
  unitId: string;
  blobShas: string[];
}

export interface ExecutionProvenance {
  kind: "fixed-upstream" | "controlled-run";
  runnerMethodDigest: string;
  fixedRunIdentity: string | null;
  runId: string | null;
  seed: number | null;
}

export interface ClaimedSourceExecution {
  targetId: string;
  source: IndependentTargetEntry["source"];
  condition: "fault" | "control";
  task: string;
  finalOutput: string;
  rawTrace: JsonValue;
  sourceProvenance: LockedSourceProvenance;
  executionProvenance: ExecutionProvenance;
}

export interface PinnedSourceBlobRequest {
  repository: string;
  revision: string;
  path: string;
  expectedGitBlobSha: string;
}

export type PinnedSourceBlobReader = (request: PinnedSourceBlobRequest) => Promise<Uint8Array>;

const SOURCE_REPOSITORIES: Record<IndependentTargetEntry["source"], string> = {
  agentchaosbench: "kevinzck8k/agentic-fault-diagnosis",
  agentdojo: "ethz-spylab/agentdojo",
  "bfcl-v4": "ShishirPatil/gorilla",
  "tau2-bench": "sierra-research/tau2-bench",
};

const MAX_PINNED_BLOB_BYTES = 32 * 1024 * 1024;

function fail(message: string): never {
  throw new Error(`Source execution derivation failed: ${message}`);
}

function canonicalEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertSafePinnedPath(path: string) {
  if (
    path === "" ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  )
    fail(`unsafe pinned source path ${JSON.stringify(path)}`);
}

function parseJsonObject(bytes: Uint8Array, targetId: string) {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    fail(`pinned source blob is not valid JSON for ${targetId}`);
  }
  if (typeof value !== "object" || value === null || Array.isArray(value))
    fail(`pinned source blob is not a JSON object for ${targetId}`);
  return value;
}

function fixedRunIdentity(source: LockedSourceProvenance) {
  return `${source.repository}@${source.revision}:${source.unitId}@${source.blobShas.join("+")}`;
}

function expectedAgentChaosCaseUid(path: string) {
  const firstSlash = path.indexOf("/");
  if (firstSlash < 0 || !path.endsWith(".json"))
    fail(`unsupported AgentChaosBench source path ${path}`);
  return path.slice(firstSlash + 1, -".json".length);
}

function optionalFaultType(target: IndependentTargetEntry): { faultType?: string } {
  return "faultType" in target && typeof target.faultType === "string"
    ? { faultType: target.faultType }
    : {};
}

export function gitBlobSha1(bytes: Uint8Array) {
  return createHash("sha1").update(`blob ${bytes.byteLength}\0`).update(bytes).digest("hex");
}

export function createGithubPinnedSourceBlobReader(
  fetchImplementation: typeof fetch = globalThis.fetch,
): PinnedSourceBlobReader {
  if (typeof fetchImplementation !== "function")
    fail("the runtime does not provide a source-blob fetch implementation");
  const cache = new Map<string, Promise<Uint8Array>>();

  return async (request) => {
    assertSafePinnedPath(request.path);
    if (!/^[0-9a-f]{40}$/.test(request.revision))
      fail(`invalid pinned revision for ${request.repository}`);
    if (!/^[0-9a-f]{40}$/.test(request.expectedGitBlobSha))
      fail(`invalid Git blob SHA for ${request.repository}:${request.path}`);
    const key = `${request.repository}@${request.revision}:${request.path}@${request.expectedGitBlobSha}`;
    const existing = cache.get(key);
    if (existing) return existing;

    const pending = (async () => {
      const encodedPath = request.path.split("/").map(encodeURIComponent).join("/");
      const url = `https://raw.githubusercontent.com/${request.repository}/${request.revision}/${encodedPath}`;
      const response = await fetchImplementation(url, {
        headers: { accept: "application/octet-stream" },
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok)
        fail(
          `pinned source fetch returned HTTP ${response.status} for ${request.repository}:${request.path}`,
        );
      const declaredLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > MAX_PINNED_BLOB_BYTES)
        fail(`pinned source blob exceeds the byte limit for ${request.repository}:${request.path}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_PINNED_BLOB_BYTES)
        fail(`pinned source blob has an invalid size for ${request.repository}:${request.path}`);
      return bytes;
    })();
    cache.set(key, pending);
    return pending;
  };
}

export function requireGateObservedSourceExecutionDerivation(evidenceArtifactCount: number) {
  if (!Number.isSafeInteger(evidenceArtifactCount) || evidenceArtifactCount < 0)
    throw new Error("Readiness evidence artifact count must be a non-negative integer");
  if (evidenceArtifactCount > 0 && !SOURCE_EXECUTION_DERIVATION_CAPABILITY.readinessEvidenceAllowed)
    throw new Error(
      "Complete readiness evidence cannot be promoted: fixed upstream verification is implemented, but controlled runs are not yet gate-reexecuted or bound to a precommitted trusted-runner attestation",
    );
}

export function assertSourceExecutionDerivationSupported(
  targetId: string,
  source: LockedSourceProvenance,
  execution: ExecutionProvenance,
) {
  if (source.unitKind !== "upstream-fixed-execution" || execution.kind !== "fixed-upstream")
    fail(
      `controlled execution ${targetId} has no gate reexecution or precommitted trusted-runner attestation verifier`,
    );
}

export async function verifyGateObservedSourceExecutionDerivation(input: {
  target: IndependentTargetEntry;
  execution: ClaimedSourceExecution;
  readPinnedBlob: PinnedSourceBlobReader;
}) {
  const { target, execution, readPinnedBlob } = input;
  const source = execution.sourceProvenance;
  const provenance = execution.executionProvenance;
  if (
    execution.targetId !== target.targetId ||
    execution.source !== target.source ||
    source.repository !== SOURCE_REPOSITORIES[target.source]
  )
    fail(`target or repository mismatch for ${target.targetId}`);
  assertSourceExecutionDerivationSupported(target.targetId, source, provenance);
  if (
    !/^[0-9a-f]{40}$/.test(source.revision) ||
    source.blobShas.length !== 1 ||
    !/^[0-9a-f]{40}$/.test(source.blobShas[0] ?? "")
  )
    fail(`fixed upstream source lock is invalid for ${target.targetId}`);
  assertSafePinnedPath(source.unitId);
  if (
    provenance.fixedRunIdentity !== fixedRunIdentity(source) ||
    provenance.runId !== null ||
    provenance.seed !== null
  )
    fail(`fixed upstream execution identity mismatch for ${target.targetId}`);

  const bytes = await readPinnedBlob({
    repository: source.repository,
    revision: source.revision,
    path: source.unitId,
    expectedGitBlobSha: source.blobShas[0]!,
  });
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0)
    fail(`source-blob reader returned no bytes for ${target.targetId}`);
  const observedBlobSha = gitBlobSha1(bytes);
  if (observedBlobSha !== source.blobShas[0]) fail(`Git blob SHA mismatch for ${target.targetId}`);

  const sourceObject = parseJsonObject(bytes, target.targetId);
  const projection =
    target.source === "agentchaosbench"
      ? projectAgentChaosCase(
          {
            targetId: target.targetId,
            family: target.family,
            source: target.source,
            caseUid: expectedAgentChaosCaseUid(source.unitId),
            ...optionalFaultType(target),
          },
          sourceObject as unknown as AgentChaosCase,
        )
      : target.source === "agentdojo" && execution.condition === "fault"
        ? projectAgentDojoRun(target, sourceObject as unknown as AgentDojoRun)
        : fail(`source ${target.source} is not a derivable fixed execution for ${target.targetId}`);

  if (
    execution.task !== projection.task ||
    execution.finalOutput !== projection.finalOutput ||
    !canonicalEqual(execution.rawTrace, projection.rawTrace)
  )
    fail(`claimed execution bytes do not match the deterministic adapter for ${target.targetId}`);

  return {
    targetId: target.targetId,
    source: target.source,
    condition: execution.condition,
    gitBlobSha: observedBlobSha,
    projectionHash: projection.projectionHash,
  } as const;
}
