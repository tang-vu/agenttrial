import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import nacl from "tweetnacl";
import type { EvidenceItem, RunEvent, TrialReport } from "@agenttrial/core";

export const RECEIPT_VERSION = "1.0.0";
export const SIGNING_CONTEXT = "AgentTrialReceipt\0v1\0";

export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical JSON rejects non-finite numbers");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .filter((k) => record[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalize(record[k])}`)
      .join(",")}}`;
  }
  throw new Error(`Unsupported canonical value: ${typeof value}`);
}

export function hashObject(value: unknown): string {
  return bytesToHex(sha256(utf8ToBytes(canonicalize(value))));
}
export function hashText(value: string): string {
  return bytesToHex(sha256(utf8ToBytes(value)));
}

export function appendEvent(
  events: RunEvent[],
  input: Omit<RunEvent, "index" | "id" | "previousHash" | "hash">,
): RunEvent {
  const previousHash = events.at(-1)?.hash ?? "0".repeat(64);
  const base = {
    index: events.length,
    id: `evt_${String(events.length + 1).padStart(3, "0")}`,
    ...input,
    previousHash,
  };
  const event = { ...base, hash: hashObject(base) };
  events.push(event);
  return event;
}

export interface ReceiptPayload {
  receiptVersion: string;
  methodologyVersion: string;
  runId: string;
  targetId: string;
  mode: string;
  planHash: string;
  seedCommitment: string;
  evidenceRoot: string;
  eventChainHead: string;
  scoreBasisPoints: number;
  coverageBasisPoints: number;
  issuedAt: string;
  keyId: string;
}
export interface SignedReceipt {
  payload: ReceiptPayload;
  signature: string;
  publicKey: string;
  algorithm: "Ed25519";
}
export interface EvidenceBundle {
  schemaVersion: "1.0.0";
  report: TrialReport;
  events: RunEvent[];
  evidenceRoot: string;
  receipt: SignedReceipt;
  attestation?: {
    status: "anchored" | "failed" | "not_configured";
    uid?: string;
    transactionHash?: string;
    explorerUrl?: string;
    message: string;
  };
}

export function evidenceRoot(items: EvidenceItem[]): string {
  if (items.length === 0) return hashObject([]);
  let layer = items.map((item) => hashObject(item));
  while (layer.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < layer.length; i += 2)
      next.push(hashText(`${layer[i]}${layer[i + 1] ?? layer[i]}`));
    layer = next;
  }
  return layer[0]!;
}

export function createSigningKey(seed?: Uint8Array) {
  return nacl.sign.keyPair.fromSeed(seed ?? nacl.randomBytes(32));
}
export function signReceipt(
  payload: ReceiptPayload,
  secretKey: Uint8Array,
  publicKey: Uint8Array,
): SignedReceipt {
  const message = utf8ToBytes(`${SIGNING_CONTEXT}${canonicalize(payload)}`);
  return {
    payload,
    signature: bytesToHex(nacl.sign.detached(message, secretKey)),
    publicKey: bytesToHex(publicKey),
    algorithm: "Ed25519",
  };
}
export function verifySignature(receipt: SignedReceipt): boolean {
  try {
    return nacl.sign.detached.verify(
      utf8ToBytes(`${SIGNING_CONTEXT}${canonicalize(receipt.payload)}`),
      hexToBytes(receipt.signature),
      hexToBytes(receipt.publicKey),
    );
  } catch {
    return false;
  }
}

export interface VerificationResult {
  valid: boolean;
  checks: { name: string; valid: boolean; detail: string }[];
  firstMismatch?: string;
}
export function verifyBundle(bundle: EvidenceBundle): VerificationResult {
  const checks: VerificationResult["checks"] = [];
  const add = (name: string, valid: boolean, detail: string) =>
    checks.push({ name, valid, detail });
  let previous = "0".repeat(64);
  let eventMismatch: string | undefined;
  for (const event of bundle.events) {
    const { hash, ...base } = event;
    if (event.previousHash !== previous || hashObject(base) !== hash) {
      eventMismatch = event.id;
      break;
    }
    previous = hash;
  }
  add(
    "event-chain",
    !eventMismatch,
    eventMismatch ? `First mismatch at ${eventMismatch}` : `${bundle.events.length} events linked`,
  );
  const computedEvidenceRoot = evidenceRoot(bundle.report.evidence);
  add(
    "evidence-root",
    computedEvidenceRoot === bundle.evidenceRoot,
    computedEvidenceRoot === bundle.evidenceRoot
      ? "Evidence root matches"
      : "Evidence object mismatch",
  );
  const computedPlanHash = hashObject(bundle.report.plan);
  add(
    "sealed-plan",
    computedPlanHash === bundle.report.planHash &&
      computedPlanHash === bundle.receipt.payload.planHash,
    computedPlanHash === bundle.report.planHash
      ? "Plan was sealed before execution"
      : "Trial plan mismatch",
  );
  const reportMatches =
    bundle.receipt.payload.runId === bundle.report.runId &&
    bundle.receipt.payload.scoreBasisPoints === Math.round(bundle.report.score.overall * 100) &&
    bundle.receipt.payload.coverageBasisPoints === Math.round(bundle.report.score.coverage * 100);
  add(
    "receipt-claims",
    reportMatches,
    reportMatches ? "Receipt matches report" : "Report score, coverage, or run ID mismatch",
  );
  add(
    "signature",
    verifySignature(bundle.receipt),
    verifySignature(bundle.receipt) ? "Ed25519 signature valid" : "Signature invalid",
  );
  const first = checks.find((c) => !c.valid);
  return { valid: !first, checks, ...(first ? { firstMismatch: first.name } : {}) };
}
