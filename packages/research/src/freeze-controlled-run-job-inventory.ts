import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ControlExecutionContractArtifact } from "./control-execution-contracts";
import {
  buildControlledRunJobInventory,
  CONTROLLED_RUN_JOB_INVENTORY_PATH,
} from "./controlled-run-job-inventory";
import type { IndependentTargetEntry, SourceAvailabilityAudit } from "./target-binding";

const repositoryRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
async function readJson<T>(path: string) {
  return JSON.parse(await readFile(resolve(repositoryRoot, path), "utf8")) as T;
}

const [targets, availability, controlContracts] = await Promise.all([
  readJson<{ entries: IndependentTargetEntry[] }>("research/independent-targets.json"),
  readJson<SourceAvailabilityAudit>("research/targets/source-availability-audit.json"),
  readJson<ControlExecutionContractArtifact>("research/targets/control-execution-contracts.json"),
]);
const artifact = buildControlledRunJobInventory({
  targets: targets.entries,
  availability,
  controlContracts,
});
const destination = resolve(repositoryRoot, CONTROLLED_RUN_JOB_INVENTORY_PATH);
const temporary = `${destination}.${process.pid}.tmp`;
await writeFile(temporary, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
await rename(temporary, destination);
console.log(JSON.stringify(artifact.summary));
