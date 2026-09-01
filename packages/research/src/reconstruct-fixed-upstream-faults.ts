import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { executableMethodFileHashes } from "./audit-target-bindings";
import {
  FIXED_UPSTREAM_FAULT_EVIDENCE_PATH,
  FIXED_UPSTREAM_RECONSTRUCTION_RECEIPT_PATH,
  buildFixedUpstreamFaultProjectionEvidence,
  buildFixedUpstreamReconstructionReceipt,
  fixedUpstreamFaultEvidenceBytes,
  fixedUpstreamFaultEvidenceSha256,
} from "./fixed-upstream-projection-evidence";
import { createGithubPinnedSourceBlobReader } from "./source-execution-derivation";
import type { RemainingProjectionAudit } from "./projection-audit";
import type { IndependentTargetEntry, SourceAvailabilityAudit } from "./target-binding";

const repositoryRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

async function readJson<T>(path: string) {
  return JSON.parse(await readFile(resolve(repositoryRoot, path), "utf8")) as T;
}

async function writeAtomic(path: string, bytes: Uint8Array) {
  const destination = resolve(repositoryRoot, path);
  const temporary = resolve(dirname(destination), `.${process.pid}.${Date.now()}.tmp`);
  await writeFile(temporary, bytes);
  await rename(temporary, destination);
}

function assertCanonicalManifestPending(current: RemainingProjectionAudit) {
  if (
    current.status !== "pending" ||
    current.verified.fault !== 0 ||
    current.verified.control !== 0 ||
    current.faultProjections.length > 0 ||
    current.controlProjections.length > 0 ||
    current.evidenceArtifacts.length > 0
  )
    throw new Error(
      "Local reconstruction requires the canonical projection manifest to remain pending and empty",
    );
}

const [targets, availability, currentManifest, methodFileHashes] = await Promise.all([
  readJson<{ entries: IndependentTargetEntry[] }>("research/independent-targets.json"),
  readJson<SourceAvailabilityAudit>("research/targets/source-availability-audit.json"),
  readJson<RemainingProjectionAudit>("research/targets/remaining-projection-audit.json"),
  executableMethodFileHashes(),
]);
assertCanonicalManifestPending(currentManifest);
const runnerMethodDigest = createHash("sha256")
  .update(JSON.stringify(methodFileHashes))
  .digest("hex");
const artifact = await buildFixedUpstreamFaultProjectionEvidence({
  targets: targets.entries,
  availability,
  runnerMethodDigest,
  readPinnedBlob: createGithubPinnedSourceBlobReader(),
});
const artifactBytes = fixedUpstreamFaultEvidenceBytes(artifact);
const artifactSha256 = fixedUpstreamFaultEvidenceSha256(artifactBytes);
const receipt = buildFixedUpstreamReconstructionReceipt({
  artifact,
  artifactSha256,
  artifactByteLength: artifactBytes.byteLength,
  runnerMethodDigest,
});

await writeAtomic(FIXED_UPSTREAM_FAULT_EVIDENCE_PATH, artifactBytes);
await writeAtomic(
  FIXED_UPSTREAM_RECONSTRUCTION_RECEIPT_PATH,
  Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8"),
);
console.log(
  JSON.stringify({
    status: receipt.status,
    localFaultCandidates: receipt.localVerification.sourceBoundFaultCandidates,
    readinessEligibleFaultProjections: receipt.readinessEligibleFaultProjections,
    artifactGitVersioned: receipt.localArtifact.gitVersioned,
    runnerMethodDigest,
    artifactSha256,
    mainTrialAllowed: false,
    submissionAllowed: false,
  }),
);
