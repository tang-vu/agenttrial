import {
  closePersistence,
  createFixtureRun,
  getRun,
  getSigningPublicKey,
  processNextRun,
} from "../packages/runtime/src/index.ts";
import { verifyBundle } from "../packages/evidence/src/index.ts";

async function main() {
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL is required for the durable smoke test");
  if (!process.env.AGENTTRIAL_SIGNING_SEED) throw new Error("AGENTTRIAL_SIGNING_SEED is required");

  const created = createFixtureRun("evidence-researcher");
  let claimed = false;
  for (let attempt = 0; attempt < 30 && !claimed; attempt += 1) {
    claimed = await processNextRun("ci-smoke-worker");
    if (!claimed) await new Promise((resolve) => setTimeout(resolve, 100));
  }
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
}

main().finally(closePersistence);
