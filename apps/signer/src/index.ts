import { heartbeatWorker, processNextSigningJob } from "@agenttrial/runtime";

if (!process.env.DATABASE_URL) throw new Error("Signer requires DATABASE_URL.");
if (!process.env.AGENTTRIAL_SIGNING_SEED)
  throw new Error("Signer requires AGENTTRIAL_SIGNING_SEED from a secret manager.");

const signerId = `agenttrial-signer-${process.pid}`;
let stopping = false;
let lastHeartbeat = 0;
process.once("SIGTERM", () => {
  stopping = true;
});
process.once("SIGINT", () => {
  stopping = true;
});

while (!stopping) {
  try {
    if (Date.now() - lastHeartbeat > 10_000) {
      await heartbeatWorker(signerId);
      lastHeartbeat = Date.now();
    }
    const processed = await processNextSigningJob(signerId);
    if (!processed) await new Promise((resolve) => setTimeout(resolve, 500));
  } catch (error) {
    console.error("Signer loop failed", error instanceof Error ? error.message : "unknown error");
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}
