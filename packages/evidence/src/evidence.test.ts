import { describe, expect, it } from "vitest";
import {
  appendEvent,
  attestationBindingHash,
  canonicalize,
  createSigningKey,
  evidenceRoot,
  hashObject,
  signReceipt,
  verifyBundle,
  verifySignature,
  type EvidenceBundle,
} from "./index";
import { METHODOLOGY_VERSION, type TrialReport } from "@agenttrial/core";
function bundle(): EvidenceBundle {
  const events: EvidenceBundle["events"] = [];
  appendEvent(events, {
    at: "2026-01-01T00:00:00.000Z",
    state: "CREATED",
    type: "created",
    message: "created",
  });
  const evidence = [
    {
      id: "e1",
      kind: "observation",
      capturedAt: "2026-01-01T00:00:00.000Z",
      data: { answer: 42 },
      redactions: [],
    },
  ];
  const plan = { version: "1", seedCommitment: "seed", trials: [] };
  const planHash = hashObject(plan);
  const report = {
    runId: "run",
    target: { id: "target", name: "Target", type: "fixture", locator: "fixture", controlled: true },
    state: "COMPLETED",
    claims: [],
    plan,
    planHash,
    observations: [],
    assertions: [],
    evidence,
    score: {
      overall: 0,
      dimensions: {
        capability: 0,
        evidence: 0,
        safety: 0,
        reliability: 0,
        efficiency: 0,
        recovery: 0,
      },
      coverage: 0,
      confidence: "low",
      criticalFindings: [],
      untestedClaims: [],
      methodologyVersion: METHODOLOGY_VERSION,
      badge: "not-verified",
    },
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
  } satisfies TrialReport;
  const root = evidenceRoot(evidence);
  const key = createSigningKey(new Uint8Array(32).fill(7));
  const payload = {
    receiptVersion: "1.0.0",
    methodologyVersion: METHODOLOGY_VERSION,
    runId: "run",
    targetId: "target",
    mode: "active-controlled",
    planHash,
    seedCommitment: "seed",
    evidenceRoot: root,
    evidenceItemHashes: evidence.map(hashObject),
    reportHash: hashObject(report),
    eventChainHead: events[0]!.hash,
    scoreBasisPoints: 0,
    coverageBasisPoints: 0,
    issuedAt: "2026-01-01T00:00:01.000Z",
    keyId: `ed25519:${Buffer.from(key.publicKey).toString("hex").slice(0, 16)}`,
  };
  return {
    schemaVersion: "1.0.0",
    report,
    events,
    evidenceRoot: root,
    receipt: signReceipt(payload, key.secretKey, key.publicKey),
  };
}
describe("canonical evidence", () => {
  it("sorts keys deterministically", () =>
    expect(canonicalize({ z: 1, a: [true, "x"] })).toBe('{"a":[true,"x"],"z":1}'));
  it("verifies chain and signature", () => {
    const b = bundle();
    expect(verifySignature(b.receipt)).toBe(true);
    expect(verifyBundle(b, { trustedPublicKeys: [b.receipt.publicKey] }).valid).toBe(true);
  });
  it("detects one-byte tampering at the first mismatched object", () => {
    const b = bundle();
    b.report.evidence[0]!.data.answer = 43;
    expect(verifyBundle(b, { trustedPublicKeys: [b.receipt.publicKey] }).firstMismatch).toBe(
      "evidence-items",
    );
  });
  it("rejects an otherwise valid receipt from an untrusted injected key", () => {
    const b = bundle();
    expect(verifyBundle(b).firstMismatch).toBe("trusted-signer");
    const attacker = createSigningKey(new Uint8Array(32).fill(9));
    b.receipt = signReceipt(b.receipt.payload, attacker.secretKey, attacker.publicKey);
    expect(verifyBundle(b, { trustedPublicKeys: ["00".repeat(32)] }).valid).toBe(false);
  });
  it("does not collide when the final evidence leaf is duplicated", () => {
    const b = bundle();
    expect(evidenceRoot(b.report.evidence)).not.toBe(
      evidenceRoot([...b.report.evidence, b.report.evidence[0]!]),
    );
  });
  it("detects forged events and signatures", () => {
    const b = bundle();
    b.events[0]!.message = "forged";
    expect(verifyBundle(b).firstMismatch).toBe("event-chain");
    const fresh = bundle();
    fresh.receipt.signature = `00${fresh.receipt.signature.slice(2)}`;
    expect(verifySignature(fresh.receipt)).toBe(false);
  });
  it("binds persisted Base Sepolia attachment metadata to the signed receipt", () => {
    const b = bundle();
    const descriptor = {
      chainId: 84532,
      easContract: "0x4200000000000000000000000000000000000021",
      schemaUid: `0x${"11".repeat(32)}`,
      reportURI: "https://agenttrial.tangvu.dev/reports/run",
    };
    b.attestation = {
      status: "anchored",
      ...descriptor,
      payloadHash: attestationBindingHash(b.receipt.payload, descriptor),
      uid: `0x${"22".repeat(32)}`,
      transactionHash: `0x${"33".repeat(32)}`,
      explorerUrl: `https://base-sepolia.easscan.org/attestation/view/0x${"22".repeat(32)}`,
      message: "confirmed",
    };
    expect(verifyBundle(b, { trustedPublicKeys: [b.receipt.publicKey] }).valid).toBe(true);
    b.attestation.reportURI = "https://attacker.invalid/report";
    expect(verifyBundle(b, { trustedPublicKeys: [b.receipt.publicKey] }).firstMismatch).toBe(
      "attestation-attachment",
    );
  });
});
