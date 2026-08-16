import {
  closePersistence,
  createFixtureRun,
  getRun,
  getSigningPublicKey,
  processNextRun,
  processNextSigningJob,
} from "../packages/runtime/src/index.ts";
import { attestationBindingHash, verifyBundle } from "../packages/evidence/src/index.ts";
import {
  beginAttestation,
  claimRun,
  confirmAttestation,
  finishRunJob,
  recordAttestationSubmitted,
  renewRunLease,
  saveRun,
} from "../packages/runtime/src/persistence.ts";

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL is required for the durable smoke test");
  if (!process.env.AGENTTRIAL_SIGNING_SEED) throw new Error("AGENTTRIAL_SIGNING_SEED is required");

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
