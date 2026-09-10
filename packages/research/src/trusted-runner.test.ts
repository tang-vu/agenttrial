import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { BfclTargetEntry } from "./target-binding";
import {
  buildTrustedRunnerAttestationPayload,
  canonicalJson,
  validateTrustedRunnerPolicy,
  verifyTrustedRunnerAttestation,
  type ControlledExecutionForAttestation,
  type TrustedRunnerAttestation,
  type TrustedRunnerPolicy,
} from "./trusted-runner";

const DESIGN_HASH = "1".repeat(64);
const METHOD_DIGEST = "2".repeat(64);
const target: BfclTargetEntry = {
  targetId: "ext-061",
  family: "tool-parameter-error",
  source: "bfcl-v4",
  groundTruthAuthority: "Pinned BFCL V4 answer record",
  faultId: "BFCL_v4_parallel_001",
  controlId: "BFCL_v4_simple_001",
  questionBlobSha: "a".repeat(40),
  answerBlobSha: "b".repeat(40),
  controlQuestionBlobSha: "c".repeat(40),
  controlAnswerBlobSha: "d".repeat(40),
};

function fixture() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicDer = publicKey.export({ format: "der", type: "spki" });
  const key = {
    keyId: "runner-a-2026",
    algorithm: "ed25519" as const,
    publicKeySpkiBase64: publicDer.toString("base64"),
    publicKeySpkiSha256: createHash("sha256").update(publicDer).digest("hex"),
  };
  const policy: TrustedRunnerPolicy = {
    schemaVersion: "p26-002-trusted-runner-policy-0.1.0",
    status: "active",
    studyId: "P26-002",
    designHash: DESIGN_HASH,
    runnerMethodDigest: METHOD_DIGEST,
    keys: [key],
    keyRegistrationHumanRequired: true,
    releaseAllowed: false,
    submissionAllowed: false,
  };
  const execution: ControlledExecutionForAttestation = {
    targetId: target.targetId,
    source: target.source,
    condition: "fault",
    task: "Call the weather tool for Boston.",
    finalOutput: "The tool call completed.",
    rawTrace: { calls: [{ name: "weather", arguments: { city: "Boston" } }] },
    sourceProvenance: {
      repository: "ShishirPatil/gorilla",
      revision: "6ea57973c7a6097fd7c5915698c54c17c5b1b6c8",
      unitKind: "benchmark-task",
      unitId: target.faultId,
      blobShas: [target.questionBlobSha, target.answerBlobSha],
    },
    executionProvenance: {
      kind: "controlled-run",
      runnerMethodDigest: METHOD_DIGEST,
      fixedRunIdentity: null,
      runId: "bfcl-ext-061-fault-0001",
      seed: 260020001,
    },
  };
  const payload = buildTrustedRunnerAttestationPayload({ execution, designHash: DESIGN_HASH });
  const attestation: TrustedRunnerAttestation = {
    schemaVersion: "p26-002-trusted-runner-attestation-0.1.0",
    algorithm: "ed25519",
    keyId: key.keyId,
    payload,
    signatureBase64: sign(null, Buffer.from(canonicalJson(payload), "utf8"), privateKey).toString(
      "base64",
    ),
  };
  return { execution, policy, attestation };
}

describe("P26-002 trusted-runner attestation contract", () => {
  it("verifies a precommitted Ed25519 signer and every execution-content hash", () => {
    const { execution, policy, attestation } = fixture();
    expect(
      verifyTrustedRunnerAttestation({
        execution,
        policy,
        attestation,
        expectedDesignHash: DESIGN_HASH,
        expectedRunnerMethodDigest: METHOD_DIGEST,
      }),
    ).toMatchObject({
      targetId: target.targetId,
      condition: "fault",
      runId: "bfcl-ext-061-fault-0001",
      seed: 260020001,
      keyId: "runner-a-2026",
    });
  });

  it("rejects output, trace, source-lock, and signature substitution", () => {
    const { execution, policy, attestation } = fixture();
    for (const changed of [
      { ...execution, finalOutput: "Substituted output" },
      { ...execution, rawTrace: { calls: [] } },
      {
        ...execution,
        sourceProvenance: { ...execution.sourceProvenance, unitId: "substituted-task" },
      },
    ]) {
      expect(() =>
        verifyTrustedRunnerAttestation({
          execution: changed,
          policy,
          attestation,
          expectedDesignHash: DESIGN_HASH,
          expectedRunnerMethodDigest: METHOD_DIGEST,
        }),
      ).toThrow(/signed payload does not match/);
    }
    const forged = structuredClone(attestation);
    forged.signatureBase64 = Buffer.alloc(64, 7).toString("base64");
    expect(() =>
      verifyTrustedRunnerAttestation({
        execution,
        policy,
        attestation: forged,
        expectedDesignHash: DESIGN_HASH,
        expectedRunnerMethodDigest: METHOD_DIGEST,
      }),
    ).toThrow(/signature does not verify/);
  });

  it("rejects pending policies, untrusted keys, and method drift", () => {
    const { execution, policy, attestation } = fixture();
    expect(() =>
      verifyTrustedRunnerAttestation({
        execution,
        policy: {
          ...policy,
          status: "pending-key-registration",
          designHash: null,
          runnerMethodDigest: null,
          keys: [],
        },
        attestation,
        expectedDesignHash: DESIGN_HASH,
        expectedRunnerMethodDigest: METHOD_DIGEST,
      }),
    ).toThrow(/policy is not active/);

    expect(() =>
      verifyTrustedRunnerAttestation({
        execution,
        policy: { ...policy, keys: [{ ...policy.keys[0]!, keyId: "different-runner" }] },
        attestation,
        expectedDesignHash: DESIGN_HASH,
        expectedRunnerMethodDigest: METHOD_DIGEST,
      }),
    ).toThrow(/signer is not in the precommitted trust policy/);

    expect(() =>
      verifyTrustedRunnerAttestation({
        execution,
        policy,
        attestation,
        expectedDesignHash: DESIGN_HASH,
        expectedRunnerMethodDigest: "3".repeat(64),
      }),
    ).toThrow(/policy is not bound/);
  });

  it("keeps the committed policy unkeyed and unable to accept evidence", () => {
    expect(
      validateTrustedRunnerPolicy({
        schemaVersion: "p26-002-trusted-runner-policy-0.1.0",
        status: "pending-key-registration",
        studyId: "P26-002",
        designHash: null,
        runnerMethodDigest: null,
        keys: [],
        keyRegistrationHumanRequired: true,
        releaseAllowed: false,
        submissionAllowed: false,
      }).status,
    ).toBe("pending-key-registration");
  });
});
