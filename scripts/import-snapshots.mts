import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { RuntimeRun } from "../packages/runtime/src/index.ts";
import { saveRun } from "../packages/runtime/src/persistence.ts";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
if (!process.env.AGENTTRIAL_IMPORT_DIR) throw new Error("AGENTTRIAL_IMPORT_DIR is required.");

const directory = resolve(process.env.AGENTTRIAL_IMPORT_DIR);
const files = (await readdir(directory)).filter((file) => /^[0-9a-f-]{36}\.json$/i.test(file));
let imported = 0;
for (const file of files) {
  const run = JSON.parse(await readFile(resolve(directory, file), "utf8")) as RuntimeRun;
  if (file !== `${run.id}.json` || !Array.isArray(run.events) || typeof run.state !== "string")
    throw new Error(`Invalid snapshot ${file}`);
  await saveRun(run);
  imported += 1;
}
console.log(`Imported ${imported} AgentTrial snapshots into PostgreSQL.`);
