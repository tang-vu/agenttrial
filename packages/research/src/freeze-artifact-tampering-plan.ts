import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ARTIFACT_TAMPERING_PLAN_PATH,
  buildArtifactTamperingMutationPlan,
} from "./artifact-tampering-plan";
import type { IndependentTargetEntry, SourceAvailabilityAudit } from "./target-binding";

const repositoryRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

async function readJson<T>(path: string) {
  return JSON.parse(await readFile(resolve(repositoryRoot, path), "utf8")) as T;
}

async function writeAtomic(path: string, content: string) {
  const destination = resolve(repositoryRoot, path);
  const temporary = resolve(dirname(destination), `.${process.pid}.${Date.now()}.tmp`);
  await writeFile(temporary, content, "utf8");
  await rename(temporary, destination);
}

const [targets, availability] = await Promise.all([
  readJson<{ entries: IndependentTargetEntry[] }>("research/independent-targets.json"),
  readJson<SourceAvailabilityAudit>("research/targets/source-availability-audit.json"),
]);
const plan = buildArtifactTamperingMutationPlan({
  targets: targets.entries,
  availability,
});
await writeAtomic(ARTIFACT_TAMPERING_PLAN_PATH, `${JSON.stringify(plan, null, 2)}\n`);
console.log(
  JSON.stringify({
    status: plan.status,
    entries: plan.entries.length,
    evidenceMaterialized: plan.evidenceMaterialized,
    applicationAllowed: plan.entries.some((entry) => entry.applicationAllowed),
    mainTrialAllowed: plan.mainTrialAllowed,
    releaseAllowed: plan.releaseAllowed,
    submissionAllowed: plan.submissionAllowed,
  }),
);
