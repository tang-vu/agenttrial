import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  sign as signBytes,
  verify as verifyBytes,
} from "node:crypto";

interface EvidenceEvent {
  index: number;
  type: string;
  data: Record<string, unknown>;
  previousHash: string;
  hash: string;
}

interface SignedPayload {
  planHash: string;
  eventRoot: string;
  assertionsHash: string;
  evaluatorBuild: string;
  evidenceRoot: string;
  signerPublicKey: string;
  anchorMetadataHash: string;
}

export interface PortableEvidenceBundle {
  schemaVersion: "agenttrial-portable-bundle-0.1.0";
  plan: Record<string, unknown>;
  planHash: string;
  events: EvidenceEvent[];
  assertions: Array<{ id: string; passed: boolean }>;
  assertionsHash: string;
  evaluatorBuild: string;
  evidenceRoot: string;
  signerPublicKey: string;
  anchorMetadata: Record<string, unknown>;
  anchorMetadataHash: string;
  signedPayload: SignedPayload;
  signature: string;
}

export interface BundleVerification {
  valid: boolean;
  firstMismatch: string | null;
}

function canonical(value: unknown) {
  return JSON.stringify(value);
}

function digest(value: unknown) {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function eventDigest(event: Omit<EvidenceEvent, "hash">) {
  return digest(event);
}

export function createPortableEvidenceBundle(): PortableEvidenceBundle {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const signerPublicKey = publicKey.export({ type: "spki", format: "pem" }).toString();
  const plan = { capability: "public-read", maxCalls: 2, requiredEvidenceSlots: 2 };
  const assertions = [
    { id: "scope", passed: true },
    { id: "grounding", passed: true },
  ];
  const rawEvents = [
    { type: "plan-sealed", data: { maxCalls: 2 } },
    { type: "observation", data: { source: "fixture://source-a", value: "supported" } },
    { type: "assertions-evaluated", data: { passed: 2, total: 2 } },
  ];
  let previousHash = "GENESIS";
  const events: EvidenceEvent[] = rawEvents.map((event, index) => {
    const unsigned = { index, ...event, previousHash };
    const sealed = { ...unsigned, hash: eventDigest(unsigned) };
    previousHash = sealed.hash;
    return sealed;
  });
  const evaluatorBuild = "agenttrial-evaluator-fixture-0.1.0";
  const assertionsHash = digest(assertions);
  const evidenceRoot = digest({ eventRoot: previousHash, assertionsHash });
  const anchorMetadata = { network: "fixture", sequence: 1, status: "anchored" };
  const anchorMetadataHash = digest(anchorMetadata);
  const signedPayload: SignedPayload = {
    planHash: digest(plan),
    eventRoot: previousHash,
    assertionsHash,
    evaluatorBuild,
    evidenceRoot,
    signerPublicKey,
    anchorMetadataHash,
  };
  return {
    schemaVersion: "agenttrial-portable-bundle-0.1.0",
    plan,
    planHash: signedPayload.planHash,
    events,
    assertions,
    assertionsHash,
    evaluatorBuild,
    evidenceRoot,
    signerPublicKey,
    anchorMetadata,
    anchorMetadataHash,
    signedPayload,
    signature: signBytes(null, Buffer.from(canonical(signedPayload)), privateKey).toString(
      "base64",
    ),
  };
}

export function verifyPortableEvidenceBundle(bundle: PortableEvidenceBundle): BundleVerification {
  if (digest(bundle.plan) !== bundle.planHash) return { valid: false, firstMismatch: "planHash" };

  let previousHash = "GENESIS";
  for (const [position, event] of bundle.events.entries()) {
    if (event.index !== position)
      return { valid: false, firstMismatch: `events[${position}].index` };
    if (event.previousHash !== previousHash)
      return { valid: false, firstMismatch: `events[${position}].previousHash` };
    const { hash, ...unsigned } = event;
    if (eventDigest(unsigned) !== hash)
      return { valid: false, firstMismatch: `events[${position}].hash` };
    previousHash = hash;
  }

  if (digest(bundle.assertions) !== bundle.assertionsHash)
    return { valid: false, firstMismatch: "assertionsHash" };
  if (
    digest({ eventRoot: previousHash, assertionsHash: bundle.assertionsHash }) !==
    bundle.evidenceRoot
  )
    return { valid: false, firstMismatch: "evidenceRoot" };
  if (bundle.planHash !== bundle.signedPayload.planHash)
    return { valid: false, firstMismatch: "signedPayload.planHash" };
  if (previousHash !== bundle.signedPayload.eventRoot)
    return { valid: false, firstMismatch: "signedPayload.eventRoot" };
  if (bundle.assertionsHash !== bundle.signedPayload.assertionsHash)
    return { valid: false, firstMismatch: "signedPayload.assertionsHash" };
  if (bundle.evaluatorBuild !== bundle.signedPayload.evaluatorBuild)
    return { valid: false, firstMismatch: "evaluatorBuild" };
  if (bundle.evidenceRoot !== bundle.signedPayload.evidenceRoot)
    return { valid: false, firstMismatch: "evidenceRoot" };
  if (bundle.signerPublicKey !== bundle.signedPayload.signerPublicKey)
    return { valid: false, firstMismatch: "signerPublicKey" };
  if (digest(bundle.anchorMetadata) !== bundle.anchorMetadataHash)
    return { valid: false, firstMismatch: "anchorMetadataHash" };
  if (bundle.anchorMetadataHash !== bundle.signedPayload.anchorMetadataHash)
    return { valid: false, firstMismatch: "signedPayload.anchorMetadataHash" };

  try {
    const valid = verifyBytes(
      null,
      Buffer.from(canonical(bundle.signedPayload)),
      createPublicKey(bundle.signerPublicKey),
      Buffer.from(bundle.signature, "base64"),
    );
    return valid
      ? { valid: true, firstMismatch: null }
      : { valid: false, firstMismatch: "signature" };
  } catch {
    return { valid: false, firstMismatch: "signature" };
  }
}

export interface TamperMutation {
  id: string;
  expectedFirstMismatch: string;
  mutate: (bundle: PortableEvidenceBundle) => void;
}

export const TAMPER_MUTATIONS: TamperMutation[] = [
  {
    id: "modify-observation-byte",
    expectedFirstMismatch: "events[1].hash",
    mutate: (bundle) => {
      bundle.events[1]!.data.value = "supportee";
    },
  },
  {
    id: "delete-event",
    expectedFirstMismatch: "events[1].index",
    mutate: (bundle) => {
      bundle.events.splice(1, 1);
    },
  },
  {
    id: "reorder-events",
    expectedFirstMismatch: "events[0].index",
    mutate: (bundle) => {
      [bundle.events[0], bundle.events[1]] = [bundle.events[1]!, bundle.events[0]!];
    },
  },
  {
    id: "replace-assertion-result",
    expectedFirstMismatch: "assertionsHash",
    mutate: (bundle) => {
      bundle.assertions[0]!.passed = false;
    },
  },
  {
    id: "change-sealed-plan",
    expectedFirstMismatch: "planHash",
    mutate: (bundle) => {
      bundle.plan.maxCalls = 3;
    },
  },
  {
    id: "change-evaluator-build",
    expectedFirstMismatch: "evaluatorBuild",
    mutate: (bundle) => {
      bundle.evaluatorBuild = "agenttrial-evaluator-fixture-0.1.1";
    },
  },
  {
    id: "alter-evidence-root",
    expectedFirstMismatch: "evidenceRoot",
    mutate: (bundle) => {
      bundle.evidenceRoot = "0".repeat(64);
    },
  },
  {
    id: "replace-signer-public-key",
    expectedFirstMismatch: "signerPublicKey",
    mutate: (bundle) => {
      const { publicKey } = generateKeyPairSync("ed25519");
      bundle.signerPublicKey = publicKey.export({ type: "spki", format: "pem" }).toString();
    },
  },
  {
    id: "alter-anchor-metadata",
    expectedFirstMismatch: "anchorMetadataHash",
    mutate: (bundle) => {
      bundle.anchorMetadata.status = "replaced";
    },
  },
];

export function runTamperSuite() {
  const validBundle = createPortableEvidenceBundle();
  const validResult = verifyPortableEvidenceBundle(validBundle);
  const mutations = TAMPER_MUTATIONS.map((mutation) => {
    const bundle = structuredClone(validBundle);
    mutation.mutate(bundle);
    const result = verifyPortableEvidenceBundle(bundle);
    return {
      mutation: mutation.id,
      expectedFirstMismatch: mutation.expectedFirstMismatch,
      actualFirstMismatch: result.firstMismatch,
      detected: !result.valid,
      localized: result.firstMismatch === mutation.expectedFirstMismatch,
    };
  });
  return {
    validBundleAccepted: validResult.valid,
    mutationCount: mutations.length,
    detectedCount: mutations.filter((item) => item.detected).length,
    localizedCount: mutations.filter((item) => item.localized).length,
    mutations,
  };
}
