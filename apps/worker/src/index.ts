import { processNextRun } from "@agenttrial/runtime";

const workerId = `agenttrial-worker-${process.pid}`;
let stopping = false;
process.once("SIGTERM", () => {
  stopping = true;
});
process.once("SIGINT", () => {
  stopping = true;
});

while (!stopping) {
  try {
    const processed = await processNextRun(workerId);
    if (!processed) await new Promise((resolve) => setTimeout(resolve, 500));
  } catch (error) {
    console.error("Worker loop failed", error instanceof Error ? error.message : "unknown error");
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}
