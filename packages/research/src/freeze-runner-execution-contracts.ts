import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildRunnerExecutionContractArtifact,
  RUNNER_EXECUTION_CONTRACTS_PATH,
} from "./runner-execution-contracts";
import type { IndependentTargetEntry, SourceAvailabilityAudit } from "./target-binding";

const repositoryRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
async function readJson<T>(path: string) {
  return JSON.parse(await readFile(resolve(repositoryRoot, path), "utf8")) as T;
}

const [targets, availability] = await Promise.all([
  readJson<{ entries: IndependentTargetEntry[] }>("research/independent-targets.json"),
  readJson<SourceAvailabilityAudit>("research/targets/source-availability-audit.json"),
]);
const artifact = buildRunnerExecutionContractArtifact({
  targets: targets.entries,
  availability,
});
const destination = resolve(repositoryRoot, RUNNER_EXECUTION_CONTRACTS_PATH);
const temporary = `${destination}.${process.pid}.tmp`;
await writeFile(temporary, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
await rename(temporary, destination);
console.log(JSON.stringify(artifact.summary));
