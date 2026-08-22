import { access, cp, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const installedStore = join(repositoryRoot, "node_modules", ".pnpm");
const standaloneStore = join(
  repositoryRoot,
  "apps",
  "web",
  ".next",
  "standalone",
  "node_modules",
  ".pnpm",
);

const standaloneEntries = await readdir(standaloneStore, { withFileTypes: true });
const helperEntries = standaloneEntries.filter(
  (entry) => entry.isDirectory() && entry.name.startsWith("@swc+helpers@"),
);

if (helperEntries.length === 0) {
  throw new Error("Next standalone output did not contain an @swc/helpers package.");
}

for (const entry of helperEntries) {
  const source = join(installedStore, entry.name, "node_modules", "@swc", "helpers", "esm");
  const target = join(standaloneStore, entry.name, "node_modules", "@swc", "helpers", "esm");
  await access(source);
  await cp(source, target, { recursive: true, force: true });
  await access(join(target, "_interop_require_default.js"));
}

console.log(`Repaired ${helperEntries.length} standalone @swc/helpers ESM package(s).`);
