import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CONTROL_MATRIX, SCENARIO_MATRIX } from "./index";
import {
  buildBlankConstructReviewPacket,
  type ConstructReviewPacket,
  type IndependentTargetEntry,
} from "./target-binding";

const repositoryRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const packetPath = resolve(repositoryRoot, "research/governance/construct-review-packet.json");

const current = JSON.parse(await readFile(packetPath, "utf8")) as ConstructReviewPacket;
if (
  current.status !== "pending-human-review" ||
  current.rows.some((row) =>
    [
      row.reviewerA.decision,
      row.reviewerA.reviewer,
      row.reviewerA.notes,
      row.reviewerB.decision,
      row.reviewerB.reviewer,
      row.reviewerB.notes,
      row.adjudication.decision,
      row.adjudication.adjudicator,
      row.adjudication.notes,
    ].some((value) => value !== null),
  )
)
  throw new Error("Refusing to overwrite a construct-review packet containing human decisions");

const targets = JSON.parse(
  await readFile(resolve(repositoryRoot, "research/independent-targets.json"), "utf8"),
) as { entries: IndependentTargetEntry[] };
const refreshed = buildBlankConstructReviewPacket({
  faultConfigurations: SCENARIO_MATRIX,
  controlConfigurations: CONTROL_MATRIX,
  targets: targets.entries,
});
const temporary = `${packetPath}.${process.pid}.tmp`;
await writeFile(temporary, `${JSON.stringify(refreshed, null, 2)}\n`, "utf8");
await rename(temporary, packetPath);
console.log(JSON.stringify({ rows: refreshed.rows.length, status: refreshed.status }));
