import { describe, expect, it } from "vitest";
import {
  appendEvent,
  canonicalize,
  createSigningKey,
  evidenceRoot,
  hashObject,
  signReceipt,
  verifyBundle,
  verifySignature,
  type EvidenceBundle,
} from "./index";
import type { TrialReport } from "@agenttrial/core";
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
      methodologyVersion: "1",
      badge: "not-verified",
    },
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
  } satisfies TrialReport;
  const root = evidenceRoot(evidence);
  const key = createSigningKey(new Uint8Array(32).fill(7));
  const payload = {
    receiptVersion: "1",
    methodologyVersion: "1",
    runId: "run",
    targetId: "target",
    mode: "active-controlled",
    planHash,
    seedCommitment: "seed",
    evidenceRoot: root,
    eventChainHead: events[0]!.hash,
    scoreBasisPoints: 0,
    coverageBasisPoints: 0,
    issuedAt: "2026-01-01T00:00:01.000Z",
    keyId: "test",
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
    expect(verifyBundle(b).valid).toBe(true);
  });
  it("detects one-byte tampering at the first mismatched object", () => {
    const b = bundle();
    b.report.evidence[0]!.data.answer = 43;
    expect(verifyBundle(b).firstMismatch).toBe("evidence-root");
  });
  it("detects forged events and signatures", () => {
    const b = bundle();
    b.events[0]!.message = "forged";
    expect(verifyBundle(b).firstMismatch).toBe("event-chain");
    const fresh = bundle();
    fresh.receipt.signature = `00${fresh.receipt.signature.slice(2)}`;
    expect(verifySignature(fresh.receipt)).toBe(false);
  });
});
