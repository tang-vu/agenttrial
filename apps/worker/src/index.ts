import { heartbeatWorker, processNextRun } from "@agenttrial/runtime";

const workerId = `agenttrial-worker-${process.pid}`;
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
      await heartbeatWorker(workerId);
      lastHeartbeat = Date.now();
    }
    const processed = await processNextRun(workerId);
    if (!processed) await new Promise((resolve) => setTimeout(resolve, 500));
  } catch (error) {
    console.error("Worker loop failed", error instanceof Error ? error.message : "unknown error");
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}
