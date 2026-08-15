import { closePersistence, createFixtureRun, getRun, getSigningPublicKey, processNextRun } from "@agenttrial/runtime";
import { verifyBundle } from "@agenttrial/evidence";

if (!process.env.DATABASE_URL)
  throw new Error("DATABASE_URL is required for the durable smoke test");
if (!process.env.AGENTTRIAL_SIGNING_SEED) throw new Error("AGENTTRIAL_SIGNING_SEED is required");

const created = createFixtureRun("evidence-researcher");
const claimed = await processNextRun("ci-smoke-worker");
if (!claimed) throw new Error("Worker did not claim the queued run");
const completed = await getRun(created.id);
if (!completed?.bundle || completed.state !== "COMPLETED")
  throw new Error(`Durable run did not complete: ${completed?.state ?? "missing"}`);
const verification = verifyBundle(completed.bundle, {
  trustedPublicKeys: [getSigningPublicKey()],
});
if (!verification.valid)
  throw new Error(`Persisted bundle failed verification at ${verification.firstMismatch}`);
console.log(`Durable PostgreSQL queue smoke passed for ${created.id}`);
await closePersistence();
