import {
  closePersistence,
  cancelRunAuthorized,
  createFixtureRun,
  getRun,
  getSigningPublicKey,
  processNextRun,
  processNextSigningJob,
  takeCancellationCapability,
} from "../packages/runtime/src/index.ts";
import { randomUUID } from "node:crypto";
import { attestationBindingHash, verifyBundle } from "../packages/evidence/src/index.ts";
import {
  beginAttestation,
  claimRun,
  confirmAttestation,
  finishRunJob,
  recordAttestationSubmitted,
  renewRunLease,
  saveRun,
  saveAuthorizationRecord,
  transitionAuthorizationRecord,
} from "../packages/runtime/src/persistence.ts";

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL is required for the durable smoke test");
  if (!process.env.AGENTTRIAL_SIGNING_SEED) throw new Error("AGENTTRIAL_SIGNING_SEED is required");

  const authorizationId = randomUUID();
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const authorization = {
    id: authorizationId,
    status: "issued" as const,
    origin: "https://agent.example",
    cardUrl: "https://agent.example/.well-known/agent-card.json",
    cardHash: "11".repeat(32),
    interfaceUrl: "https://agent.example/a2a/",
    protocolBinding: "HTTP+JSON" as const,
    protocolVersion: "1.0" as const,
    skillId: "research",
    proofUrl: "https://agent.example/.well-known/agenttrial-proof.json",
    scopeHash: "22".repeat(32),
    documentHash: "33".repeat(32),
    nonceHash: "44".repeat(32),
    verificationTokenHash: "55".repeat(32),
    actorId: "ci-session",
    grant: {
      mode: "active" as const,
      actions: ["SendMessage"] as ["SendMessage"],
      trialCategories: ["core-functionality" as const],
      maxMessages: 2,
      maxRequestBytes: 16_384,
      maxResponseBytes: 1_000_000,
      timeoutMs: 15_000,
    },
    testMessage: "test",
    expectedSubstring: "ok",
    issuedAt,
    expiresAt,
  };
  await saveAuthorizationRecord(authorization);
  const verifiedAuthorization = {
    ...authorization,
    status: "verified" as const,
    verifiedAt: new Date().toISOString(),
    verificationEvidence: {
      proofHash: "66".repeat(32),
      verifiedAt: new Date().toISOString(),
      cardHash: authorization.cardHash,
      proofUrl: authorization.proofUrl,
    },
  };
  const verifyRaces = await Promise.all([
    transitionAuthorizationRecord(authorizationId, "issued", verifiedAuthorization),
    transitionAuthorizationRecord(authorizationId, "issued", verifiedAuthorization),
  ]);
  if (verifyRaces.filter(Boolean).length !== 1)
    throw new Error("Authorization verification transition was not atomic");
  const consumedAuthorization = {
    ...verifiedAuthorization,
    status: "consumed" as const,
    consumedAt: new Date().toISOString(),
  };
  const consumeRaces = await Promise.all([
    transitionAuthorizationRecord(authorizationId, "verified", consumedAuthorization),
    transitionAuthorizationRecord(authorizationId, "verified", consumedAuthorization),
  ]);
  if (consumeRaces.filter(Boolean).length !== 1)
    throw new Error("Authorization consumption transition was not one-time");

  const fenced = createFixtureRun("evidence-researcher");
  let firstLease: Awaited<ReturnType<typeof claimRun>>;
  for (let attempt = 0; attempt < 30 && !firstLease; attempt += 1) {
    firstLease = await claimRun("lease-worker-a", 200);
    if (!firstLease) await pause(50);
  }
  if (!firstLease || firstLease.id !== fenced.id) throw new Error("Lease probe was not claimed");
  await pause(80);
  if (!(await renewRunLease(firstLease))) throw new Error("Current lease did not renew");
  await pause(140);
  if (await claimRun("lease-worker-b", 200)) throw new Error("Renewed job was reclaimed");
  const forgedLease = { ...firstLease, token: "00000000-0000-4000-8000-000000000000" };
  if (await renewRunLease(forgedLease)) throw new Error("Foreign fencing token renewed a lease");
  if (await finishRunJob(forgedLease)) throw new Error("Foreign fencing token finished a job");
  if (!(await finishRunJob(firstLease, "lease fencing probe complete")))
    throw new Error("Current fencing token could not finish its job");

  const reclaimed = createFixtureRun("evidence-researcher");
  let staleLease: Awaited<ReturnType<typeof claimRun>>;
  for (let attempt = 0; attempt < 30 && !staleLease; attempt += 1) {
    staleLease = await claimRun("stale-worker", 80);
    if (!staleLease) await pause(50);
  }
  if (!staleLease || staleLease.id !== reclaimed.id) throw new Error("Stale probe was not claimed");
  await pause(120);
  const replacement = await claimRun("replacement-worker", 500);
  if (!replacement || replacement.id !== reclaimed.id)
    throw new Error("Expired lease was not reclaimed");
  if (await renewRunLease(staleLease)) throw new Error("Stale worker renewed after fencing");
  if (await finishRunJob(staleLease)) throw new Error("Stale worker finished after fencing");
  if (!(await finishRunJob(replacement, "reclaim probe complete")))
    throw new Error("Replacement worker could not finish reclaimed job");

  const cancellable = createFixtureRun("evidence-researcher");
  const cancelToken = takeCancellationCapability(cancellable.id);
  if (!cancelToken) throw new Error("Cancellation capability was not issued");
  let cancellationLease: Awaited<ReturnType<typeof claimRun>>;
  for (let attempt = 0; attempt < 30 && !cancellationLease; attempt += 1) {
    cancellationLease = await claimRun("cancelled-worker", 5_000);
    if (!cancellationLease) await pause(50);
  }
  if (!cancellationLease || cancellationLease.id !== cancellable.id)
    throw new Error("Cancellation probe was not claimed");
  if (!(await cancelRunAuthorized(cancellable.id, cancelToken)))
    throw new Error("Authorized durable cancellation was rejected");
  if (await finishRunJob(cancellationLease))
    throw new Error("Cancelled worker retained its queue fence");
  if ((await getRun(cancellable.id))?.state !== "CANCELLED")
    throw new Error("Durable cancellation did not atomically update the run snapshot");

  const created = createFixtureRun("evidence-researcher");
  process.env.AGENTTRIAL_EXECUTION_ONLY = "true";
  let claimed = false;
  for (let attempt = 0; attempt < 30 && !claimed; attempt += 1) {
    claimed = await processNextRun("ci-smoke-worker");
    if (!claimed) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!claimed) throw new Error("Worker did not claim the queued run");
  const unsigned = await getRun(created.id);
  if (unsigned?.state !== "SCORING" || !unsigned.pendingFinalization || unsigned.bundle)
    throw new Error("Execution worker did not stop at the unsigned signing boundary");
  delete process.env.AGENTTRIAL_EXECUTION_ONLY;
  let signed = false;
  for (let attempt = 0; attempt < 30 && !signed; attempt += 1) {
    signed = await processNextSigningJob("ci-smoke-signer");
    if (!signed) await pause(100);
  }
  if (!signed) throw new Error("Signer did not claim the unsigned run");
  const completed = await getRun(created.id);
  if (!completed?.bundle || completed.state !== "COMPLETED")
    throw new Error(`Durable run did not complete: ${completed?.state ?? "missing"}`);
  const verification = verifyBundle(completed.bundle, {
    trustedPublicKeys: [getSigningPublicKey()],
  });
  if (!verification.valid)
    throw new Error(`Persisted bundle failed verification at ${verification.firstMismatch}`);
  const attachmentDescriptor = {
    chainId: 84532,
    easContract: "0x4200000000000000000000000000000000000021",
    schemaUid: `0x${"11".repeat(32)}`,
    reportURI: `https://agenttrial.tangvu.dev/reports/${created.id}`,
  };
  const payloadHash = attestationBindingHash(
    completed.bundle.receipt.payload,
    attachmentDescriptor,
  );
  await beginAttestation({ runId: created.id, ...attachmentDescriptor, payloadHash });
  await recordAttestationSubmitted(created.id, `0x${"22".repeat(32)}`);
  await confirmAttestation({
    runId: created.id,
    uid: `0x${"33".repeat(32)}`,
    transactionHash: `0x${"22".repeat(32)}`,
    attestor: `0x${"44".repeat(20)}`,
    blockNumber: 123n,
  });
  const attached = await getRun(created.id);
  if (attached?.bundle?.attestation?.status !== "anchored")
    throw new Error("Confirmed EAS attachment was not joined into the durable bundle");
  if (!verifyBundle(attached.bundle, { trustedPublicKeys: [getSigningPublicKey()] }).valid)
    throw new Error("Persisted EAS attachment did not bind to the signed receipt");
  await beginAttestation({
    runId: created.id,
    ...attachmentDescriptor,
    payloadHash: "00".repeat(32),
  }).then(
    () => {
      throw new Error("Mismatched EAS retry payload was accepted");
    },
    () => undefined,
  );

  const malicious = createFixtureRun("evidence-researcher");
  process.env.AGENTTRIAL_EXECUTION_ONLY = "true";
  let maliciousExecuted = false;
  for (let attempt = 0; attempt < 30 && !maliciousExecuted; attempt += 1) {
    maliciousExecuted = await processNextRun("ci-malicious-worker");
    if (!maliciousExecuted) await pause(100);
  }
  if (!maliciousExecuted) throw new Error("Malicious unsigned probe was not executed");
  const mutated = await getRun(malicious.id);
  if (!mutated?.pendingFinalization) throw new Error("Unsigned probe payload missing");
  mutated.pendingFinalization.report.score.overall = 1000;
  await saveRun(mutated);
  delete process.env.AGENTTRIAL_EXECUTION_ONLY;
  if (!(await processNextSigningJob("ci-validating-signer")))
    throw new Error("Signer did not inspect malicious unsigned probe");
  const rejected = await getRun(malicious.id);
  if (rejected?.state !== "FAILED" || rejected.bundle)
    throw new Error("Signer accepted a manipulated deterministic score");
  console.log(`Durable PostgreSQL queue smoke passed for ${created.id}`);
}

main().finally(closePersistence);
