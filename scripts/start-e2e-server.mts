import { cp, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const standaloneRoot = resolve("apps/web/.next/standalone/apps/web");
await mkdir(resolve(standaloneRoot, ".next"), { recursive: true });
await cp(resolve("apps/web/.next/static"), resolve(standaloneRoot, ".next/static"), {
  recursive: true,
  force: true,
});
await cp(resolve("apps/web/public"), resolve(standaloneRoot, "public"), {
  recursive: true,
  force: true,
});
const server = spawn(process.execPath, [resolve(standaloneRoot, "server.js")], {
  cwd: standaloneRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    HOSTNAME: "127.0.0.1",
    PORT: "4178",
    AGENTTRIAL_E2E: "true",
  },
});
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => server.kill(signal));
server.on("exit", (code) => process.exit(code ?? 0));
