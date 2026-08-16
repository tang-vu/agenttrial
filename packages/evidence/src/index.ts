import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import nacl from "tweetnacl";
import canonicalizeJcs from "canonicalize";
import {
  calculateScore,
  evaluateAssertions,
  type EvidenceItem,
  type RunEvent,
  type TrialReport,
} from "@agenttrial/core";

export const RECEIPT_VERSION = "1.0.0";
export const SIGNING_CONTEXT = "AgentTrialReceipt\0v1\0";

export function canonicalize(value: unknown): string {
  assertCanonicalInput(value, new Set());
  const canonical = canonicalizeJcs(value);
  if (canonical === undefined) throw new Error("Value cannot be represented as canonical JSON");
  return canonical;
}

function assertCanonicalInput(value: unknown, seen: Set<object>) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical JSON rejects non-finite numbers");
    return;
  }
  if (typeof value !== "object") throw new Error(`Unsupported canonical value: ${typeof value}`);
  if (seen.has(value)) throw new Error("Canonical JSON rejects cyclic values");
  seen.add(value);
  const values = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>);
  for (const child of values) assertCanonicalInput(child, seen);
  seen.delete(value);
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
  evaluatorBuild: string;
  assertionRegistryHash: string;
  reportSchema: string;
  evidenceRoot: string;
  evidenceItemHashes: string[];
  reportHash: string;
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
    status:
      | "disabled"
      | "not_configured"
      | "queued"
      | "pending"
      | "submitted"
      | "anchored"
      | "failed";
    chainId?: number;
    easContract?: string;
    schemaUid?: string;
    payloadHash?: string;
    reportURI?: string;
    uid?: string;
    transactionHash?: string;
    explorerUrl?: string;
    message: string;
  };
}

export function attestationBindingHash(
  payload: ReceiptPayload,
  attachment: {
    chainId: number;
    easContract: string;
    schemaUid: string;
    reportURI: string;
  },
) {
  return hashObject({
    chainId: attachment.chainId,
    easContract: attachment.easContract.toLowerCase(),
    schemaUid: attachment.schemaUid.toLowerCase(),
    targetIdentifier: payload.targetId,
    trialRoot: payload.planHash,
    methodologyVersion: payload.methodologyVersion,
    scoreBasisPoints: payload.scoreBasisPoints,
    coverageBasisPoints: payload.coverageBasisPoints,
    evidenceRoot: payload.evidenceRoot,
    reportURI: attachment.reportURI,
    evaluatedAt: Math.floor(Date.parse(payload.issuedAt) / 1000),
  });
}

export function evidenceRoot(items: EvidenceItem[]): string {
  if (items.length === 0) return hashText("AgentTrialEvidence\0empty");
  let layer = items.map((item) => hashText(`AgentTrialEvidence\0leaf\0${hashObject(item)}`));
  while (layer.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < layer.length; i += 2)
      next.push(hashText(`AgentTrialEvidence\0node\0${layer[i]}\0${layer[i + 1] ?? ""}`));
    layer = next;
  }
  return hashText(`AgentTrialEvidence\0root\0${items.length}\0${layer[0]}`);
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
export interface VerificationOptions {
  trustedPublicKeys?: readonly string[];
}
export function verifyBundle(
  bundle: EvidenceBundle,
  options: VerificationOptions = {},
): VerificationResult {
  const checks: VerificationResult["checks"] = [];
  const add = (name: string, valid: boolean, detail: string) =>
    checks.push({ name, valid, detail });
  let previous = "0".repeat(64);
  let eventMismatch: string | undefined;
  const eventIds = new Set<string>();
  for (const [index, event] of bundle.events.entries()) {
    const { hash, ...base } = event;
    if (
      event.index !== index ||
      event.id !== `evt_${String(index + 1).padStart(3, "0")}` ||
      eventIds.has(event.id) ||
      event.previousHash !== previous ||
      hashObject(base) !== hash
    ) {
      eventMismatch = event.id;
      break;
    }
    eventIds.add(event.id);
    previous = hash;
  }
  add(
    "event-chain",
    !eventMismatch && previous === bundle.receipt.payload.eventChainHead,
    eventMismatch
      ? `First mismatch at ${eventMismatch}`
      : previous === bundle.receipt.payload.eventChainHead
        ? `${bundle.events.length} events linked and signed`
        : "Event chain head is not the signed checkpoint",
  );
  const itemHashes = bundle.report.evidence.map(hashObject);
  const expectedItemHashes = bundle.receipt.payload.evidenceItemHashes;
  const evidenceMismatchIndex = itemHashes.findIndex(
    (hash, index) => hash !== expectedItemHashes?.[index],
  );
  const evidenceItemsMatch =
    evidenceMismatchIndex === -1 && itemHashes.length === expectedItemHashes?.length;
  add(
    "evidence-items",
    evidenceItemsMatch,
    evidenceItemsMatch
      ? `${itemHashes.length} evidence objects individually committed`
      : evidenceMismatchIndex >= 0
        ? `First mismatch at ${bundle.report.evidence[evidenceMismatchIndex]?.id ?? `index ${evidenceMismatchIndex}`}`
        : "Evidence object count mismatch",
  );
  const computedEvidenceRoot = evidenceRoot(bundle.report.evidence);
  add(
    "evidence-root",
    computedEvidenceRoot === bundle.evidenceRoot &&
      computedEvidenceRoot === bundle.receipt.payload.evidenceRoot,
    computedEvidenceRoot === bundle.evidenceRoot &&
      computedEvidenceRoot === bundle.receipt.payload.evidenceRoot
      ? "Evidence root matches signed receipt"
      : "Evidence object mismatch",
  );
  const computedReportHash = hashObject(bundle.report);
  add(
    "report",
    computedReportHash === bundle.receipt.payload.reportHash,
    computedReportHash === bundle.receipt.payload.reportHash
      ? "Entire report matches signed receipt"
      : "Report content mismatch",
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
  const seedOpened = bundle.report.seedReveal
    ? hashObject({ seed: bundle.report.seedReveal, runId: bundle.report.runId }) ===
      bundle.report.plan.seedCommitment
    : bundle.report.score.methodologyVersion === "agenttrial-1.0.0";
  add(
    "seed-opening",
    seedOpened,
    seedOpened
      ? bundle.report.seedReveal
        ? "Revealed seed matches the pre-execution commitment"
        : "Legacy methodology did not require seed opening"
      : "Revealed seed does not match the sealed commitment",
  );
  const legacyMethodology = bundle.report.score.methodologyVersion === "agenttrial-1.0.0";
  const provenanceMatches =
    legacyMethodology ||
    Boolean(
      bundle.report.provenance &&
        bundle.receipt.payload.evaluatorBuild === bundle.report.provenance.evaluatorBuild &&
        bundle.receipt.payload.assertionRegistryHash ===
          bundle.report.provenance.assertionRegistryHash &&
        bundle.receipt.payload.reportSchema === bundle.report.provenance.reportSchema,
    );
  add(
    "evaluator-provenance",
    provenanceMatches,
    provenanceMatches
      ? legacyMethodology
        ? "Legacy methodology did not commit evaluator provenance"
        : `Build ${bundle.report.provenance!.evaluatorBuild.slice(0, 12)} and assertion registry committed`
      : "Evaluator build or assertion registry provenance mismatch",
  );
  const recomputedAssertions = bundle.report.plan.trials.flatMap((trial) => {
    const observation = bundle.report.observations.find(
      (candidate) => candidate.trialId === trial.id,
    );
    return observation ? evaluateAssertions(trial.assertions, observation) : [];
  });
  const testedClaims = new Set(
    bundle.report.plan.trials
      .filter((trial) =>
        bundle.report.observations.some(
          (observation) => observation.trialId === trial.id && observation.status !== "not_tested",
        ),
      )
      .flatMap((trial) => trial.claimIds),
  );
  const recomputedScore = calculateScore(recomputedAssertions, bundle.report.claims, testedClaims);
  const deterministic =
    hashObject(recomputedAssertions) === hashObject(bundle.report.assertions) &&
    hashObject(recomputedScore) === hashObject(bundle.report.score);
  add(
    "deterministic-verdict",
    deterministic,
    deterministic
      ? "Assertions and score recompute from sealed inputs"
      : "Assertion outcomes or score do not recompute",
  );
  const reportMatches =
    bundle.schemaVersion === "1.0.0" &&
    bundle.receipt.payload.receiptVersion === RECEIPT_VERSION &&
    bundle.receipt.algorithm === "Ed25519" &&
    bundle.receipt.payload.runId === bundle.report.runId &&
    bundle.receipt.payload.targetId === bundle.report.target.id &&
    bundle.receipt.payload.methodologyVersion === bundle.report.score.methodologyVersion &&
    bundle.receipt.payload.seedCommitment === bundle.report.plan.seedCommitment &&
    bundle.receipt.payload.mode ===
      (bundle.report.target.controlled
        ? "active-controlled"
        : bundle.report.plan.trials.some(
              (trial) => trial.mode === "active" && trial.authorizationRequired,
            )
          ? "active-external"
          : "passive-external") &&
    bundle.receipt.payload.keyId === `ed25519:${bundle.receipt.publicKey.slice(0, 16)}` &&
    bundle.receipt.payload.scoreBasisPoints === Math.round(bundle.report.score.overall * 100) &&
    bundle.receipt.payload.coverageBasisPoints === Math.round(bundle.report.score.coverage * 100);
  add(
    "receipt-claims",
    reportMatches,
    reportMatches ? "Receipt matches report" : "Report score, coverage, or run ID mismatch",
  );
  const signatureValid = verifySignature(bundle.receipt);
  add(
    "signature",
    signatureValid,
    signatureValid ? "Ed25519 self-signature valid" : "Signature invalid",
  );
  const trusted =
    options.trustedPublicKeys?.some(
      (key) => key.toLowerCase() === bundle.receipt.publicKey.toLowerCase(),
    ) ?? false;
  add(
    "trusted-signer",
    trusted,
    trusted
      ? "Signer matches the supplied AgentTrial trust-key set"
      : "Signer is not in the supplied trust-key set",
  );
  if (bundle.attestation?.status === "anchored") {
    const attachment = bundle.attestation;
    const structurallyValid =
      attachment.chainId === 84532 &&
      /^0x[0-9a-f]{40}$/i.test(attachment.easContract ?? "") &&
      /^0x[0-9a-f]{64}$/i.test(attachment.schemaUid ?? "") &&
      /^0x[0-9a-f]{64}$/i.test(attachment.uid ?? "") &&
      /^0x[0-9a-f]{64}$/i.test(attachment.transactionHash ?? "") &&
      attachment.payloadHash ===
        attestationBindingHash(bundle.receipt.payload, {
          chainId: attachment.chainId,
          easContract: attachment.easContract!,
          schemaUid: attachment.schemaUid!,
          reportURI: attachment.reportURI ?? "",
        });
    add(
      "attestation-attachment",
      structurallyValid,
      structurallyValid
        ? "Base Sepolia attachment is bound to the signed receipt; onchain status is a separate check"
        : "Attestation attachment does not bind to this receipt",
    );
  }
  const first = checks.find((c) => !c.valid);
  return { valid: !first, checks, ...(first ? { firstMismatch: first.name } : {}) };
}
