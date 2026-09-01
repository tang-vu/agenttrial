import { createHash, createPublicKey, verify } from "node:crypto";
import type { JsonValue } from "./target-adapter";
import type { IndependentTargetEntry } from "./target-binding";

export interface TrustedRunnerKey {
  keyId: string;
  algorithm: "ed25519";
  publicKeySpkiBase64: string;
  publicKeySpkiSha256: string;
}

export interface TrustedRunnerPolicy {
  schemaVersion: "p26-002-trusted-runner-policy-0.1.0";
  status: "pending-key-registration" | "active";
  studyId: "P26-002";
  designHash: string | null;
  runnerMethodDigest: string | null;
  keys: TrustedRunnerKey[];
  keyRegistrationHumanRequired: true;
  releaseAllowed: false;
  submissionAllowed: false;
}

export interface TrustedRunnerAttestationPayload {
  schemaVersion: "p26-002-trusted-runner-attestation-payload-0.1.0";
  studyId: "P26-002";
  designHash: string;
  runnerMethodDigest: string;
  targetId: string;
  source: IndependentTargetEntry["source"];
  condition: "fault" | "control";
  sourceProvenanceSha256: string;
  runId: string;
  seed: number;
  taskSha256: string;
  finalOutputSha256: string;
  rawTraceSha256: string;
  executionPayloadSha256: string;
}

export interface TrustedRunnerAttestation {
  schemaVersion: "p26-002-trusted-runner-attestation-0.1.0";
  algorithm: "ed25519";
  keyId: string;
  payload: TrustedRunnerAttestationPayload;
  signatureBase64: string;
}

export interface ControlledExecutionForAttestation {
  targetId: string;
  source: IndependentTargetEntry["source"];
  condition: "fault" | "control";
  task: string;
  finalOutput: string;
  rawTrace: JsonValue;
  sourceProvenance: {
    repository: string;
    revision: string;
    unitKind: "benchmark-task";
    unitId: string;
    blobShas: string[];
  };
  executionProvenance: {
    kind: "controlled-run";
    runnerMethodDigest: string;
    fixedRunIdentity: null;
    runId: string;
    seed: number;
  };
}

function fail(message: string): never {
  throw new Error(`Trusted runner attestation failed: ${message}`);
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) fail("undefined is not canonical JSON");
  return encoded;
}

export function sha256Canonical(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function exactKeys(value: object, keys: string[]) {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function validSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function validNonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateTrustedRunnerPolicy(policy: TrustedRunnerPolicy) {
  if (
    !exactKeys(policy, [
      "designHash",
      "keyRegistrationHumanRequired",
      "keys",
      "releaseAllowed",
      "runnerMethodDigest",
      "schemaVersion",
      "status",
      "studyId",
      "submissionAllowed",
    ]) ||
    policy.schemaVersion !== "p26-002-trusted-runner-policy-0.1.0" ||
    policy.studyId !== "P26-002" ||
    policy.keyRegistrationHumanRequired !== true ||
    policy.releaseAllowed !== false ||
    policy.submissionAllowed !== false ||
    !Array.isArray(policy.keys)
  )
    fail("policy envelope is invalid");

  if (policy.status === "pending-key-registration") {
    if (
      policy.designHash !== null ||
      policy.runnerMethodDigest !== null ||
      policy.keys.length !== 0
    )
      fail("pending policy cannot contain active trust material");
    return policy;
  }
  if (
    policy.status !== "active" ||
    !validSha256(policy.designHash) ||
    !validSha256(policy.runnerMethodDigest) ||
    policy.keys.length === 0
  )
    fail("active policy lacks a frozen design, method, or trusted key");

  const keyIds = new Set<string>();
  for (const key of policy.keys) {
    if (
      !exactKeys(key, ["algorithm", "keyId", "publicKeySpkiBase64", "publicKeySpkiSha256"]) ||
      key.algorithm !== "ed25519" ||
      !/^[a-z0-9][a-z0-9._-]{2,63}$/.test(key.keyId) ||
      !validNonempty(key.publicKeySpkiBase64) ||
      !validSha256(key.publicKeySpkiSha256) ||
      keyIds.has(key.keyId)
    )
      fail("trusted key record is invalid or duplicated");
    keyIds.add(key.keyId);
    let der: Buffer;
    try {
      der = Buffer.from(key.publicKeySpkiBase64, "base64");
    } catch {
      fail(`trusted key ${key.keyId} is not base64`);
    }
    if (
      der.length === 0 ||
      der.toString("base64") !== key.publicKeySpkiBase64 ||
      createHash("sha256").update(der).digest("hex") !== key.publicKeySpkiSha256
    )
      fail(`trusted key ${key.keyId} does not match its SPKI hash`);
    let publicKey;
    try {
      publicKey = createPublicKey({ key: der, format: "der", type: "spki" });
    } catch {
      fail(`trusted key ${key.keyId} is not valid SPKI`);
    }
    if (publicKey.asymmetricKeyType !== "ed25519") fail(`trusted key ${key.keyId} is not Ed25519`);
  }
  return policy;
}

function executionPayload(execution: ControlledExecutionForAttestation) {
  return {
    targetId: execution.targetId,
    source: execution.source,
    condition: execution.condition,
    sourceProvenance: execution.sourceProvenance,
    executionProvenance: execution.executionProvenance,
    task: execution.task,
    finalOutput: execution.finalOutput,
    rawTrace: execution.rawTrace,
  };
}

export function buildTrustedRunnerAttestationPayload(input: {
  execution: ControlledExecutionForAttestation;
  designHash: string;
}): TrustedRunnerAttestationPayload {
  const { execution, designHash } = input;
  if (!validSha256(designHash)) fail("design hash is invalid");
  if (
    execution.sourceProvenance.unitKind !== "benchmark-task" ||
    execution.executionProvenance.kind !== "controlled-run" ||
    !validSha256(execution.executionProvenance.runnerMethodDigest) ||
    !validNonempty(execution.executionProvenance.runId) ||
    !Number.isSafeInteger(execution.executionProvenance.seed) ||
    execution.executionProvenance.seed < 0 ||
    !validNonempty(execution.task) ||
    !validNonempty(execution.finalOutput)
  )
    fail("controlled execution identity or content is invalid");

  return {
    schemaVersion: "p26-002-trusted-runner-attestation-payload-0.1.0",
    studyId: "P26-002",
    designHash,
    runnerMethodDigest: execution.executionProvenance.runnerMethodDigest,
    targetId: execution.targetId,
    source: execution.source,
    condition: execution.condition,
    sourceProvenanceSha256: sha256Canonical(execution.sourceProvenance),
    runId: execution.executionProvenance.runId,
    seed: execution.executionProvenance.seed,
    taskSha256: sha256Canonical(execution.task),
    finalOutputSha256: sha256Canonical(execution.finalOutput),
    rawTraceSha256: sha256Canonical(execution.rawTrace),
    executionPayloadSha256: sha256Canonical(executionPayload(execution)),
  };
}

export function verifyTrustedRunnerAttestation(input: {
  execution: ControlledExecutionForAttestation;
  attestation: TrustedRunnerAttestation;
  policy: TrustedRunnerPolicy;
  expectedDesignHash: string;
  expectedRunnerMethodDigest: string;
}) {
  const { execution, attestation, expectedDesignHash, expectedRunnerMethodDigest } = input;
  const policy = validateTrustedRunnerPolicy(input.policy);
  if (policy.status !== "active") fail("trusted-runner policy is not active");
  if (
    policy.designHash !== expectedDesignHash ||
    policy.runnerMethodDigest !== expectedRunnerMethodDigest
  )
    fail("active policy is not bound to the current design and runner method");
  if (
    !exactKeys(attestation, [
      "algorithm",
      "keyId",
      "payload",
      "schemaVersion",
      "signatureBase64",
    ]) ||
    attestation.schemaVersion !== "p26-002-trusted-runner-attestation-0.1.0" ||
    attestation.algorithm !== "ed25519" ||
    !validNonempty(attestation.keyId) ||
    !validNonempty(attestation.signatureBase64)
  )
    fail("attestation envelope is invalid");

  const expectedPayload = buildTrustedRunnerAttestationPayload({
    execution,
    designHash: expectedDesignHash,
  });
  if (
    !exactKeys(attestation.payload, Object.keys(expectedPayload)) ||
    canonicalJson(attestation.payload) !== canonicalJson(expectedPayload) ||
    attestation.payload.runnerMethodDigest !== expectedRunnerMethodDigest
  )
    fail("signed payload does not match the controlled execution");

  const trustedKey = policy.keys.find((key) => key.keyId === attestation.keyId);
  if (!trustedKey || trustedKey.algorithm !== attestation.algorithm)
    fail("attestation signer is not in the precommitted trust policy");
  const signature = Buffer.from(attestation.signatureBase64, "base64");
  if (signature.length !== 64 || signature.toString("base64") !== attestation.signatureBase64)
    fail("attestation signature encoding is invalid");
  const publicKey = createPublicKey({
    key: Buffer.from(trustedKey.publicKeySpkiBase64, "base64"),
    format: "der",
    type: "spki",
  });
  if (!verify(null, Buffer.from(canonicalJson(attestation.payload), "utf8"), publicKey, signature))
    fail("Ed25519 signature does not verify");

  return {
    targetId: execution.targetId,
    condition: execution.condition,
    runId: execution.executionProvenance.runId,
    seed: execution.executionProvenance.seed,
    executionPayloadSha256: expectedPayload.executionPayloadSha256,
    keyId: trustedKey.keyId,
  } as const;
}
