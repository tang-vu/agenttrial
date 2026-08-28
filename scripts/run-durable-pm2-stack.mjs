import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(scriptsDirectory);
const stateDirectory = process.env.AGENTTRIAL_STATE_DIRECTORY;
const docker = process.env.AGENTTRIAL_DOCKER_PATH;
const port = Number(process.env.AGENTTRIAL_PORT ?? 4179);
let stopping = false;

if (!stateDirectory) throw new Error("AGENTTRIAL_STATE_DIRECTORY is not configured.");
if (!docker) throw new Error("AGENTTRIAL_DOCKER_PATH is not configured.");

process.once("SIGINT", () => {
  stopping = true;
});
process.once("SIGTERM", () => {
  stopping = true;
});

async function composeEnvironment() {
  const seed = (await readFile(path.join(stateDirectory, "signing-seed.txt"), "utf8")).trim();
  if (!/^[0-9a-f]{64}$/i.test(seed)) throw new Error("Managed signing seed is invalid.");
  const commit = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
    encoding: "utf8",
    windowsHide: true,
  }).trim();
  const forwarded = [
    process.env.WSLENV,
    "AGENTTRIAL_SIGNING_SEED/u",
    "AGENTTRIAL_BUILD_COMMIT/u",
    "AGENTTRIAL_PORT/u",
    "NEXT_PUBLIC_APP_URL/u",
  ].filter(Boolean);
  return {
    ...process.env,
    AGENTTRIAL_SIGNING_SEED: seed,
    AGENTTRIAL_BUILD_COMMIT: commit,
    AGENTTRIAL_PORT: String(port),
    NEXT_PUBLIC_APP_URL: "https://agenttrial.tangvu.dev",
    WSLENV: forwarded.join(":"),
  };
}

async function compose(...args) {
  const env = await composeEnvironment();
  const dockerArgs = ["compose", "-p", "agenttrial", ...args];
  const dockerWslDistro = process.env.AGENTTRIAL_DOCKER_WSL_DISTRO;
  const command = dockerWslDistro
    ? path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "wsl.exe")
    : docker;
  const commandArgs = dockerWslDistro
    ? ["-d", dockerWslDistro, "--", "docker", ...dockerArgs]
    : dockerArgs;
  await new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: root,
      env,
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Docker Compose failed with exit code ${code}.`));
    });
  });
}

async function startStack(attempts = 60, delaySeconds = 10) {
  let lastError;
  for (let attempt = 1; attempt <= attempts && !stopping; attempt += 1) {
    try {
      await compose("up", "-d", "--remove-orphans");
      return;
    } catch (error) {
      lastError = error;
      console.warn(
        `Docker stack start attempt ${attempt}/${attempts} failed; retrying in ${delaySeconds} seconds.`,
      );
      if (attempt < attempts) await delay(delaySeconds * 1000);
    }
  }
  if (stopping) return;
  throw new Error(`Docker did not become available: ${lastError?.message ?? "unknown error"}`);
}

async function ready() {
  try {
    const response = await globalThis.fetch(`http://127.0.0.1:${port}/api/ready`, {
      signal: globalThis.AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const status = await response.json();
    return Boolean(
      status.ready &&
        status.persistence?.database &&
        status.persistence?.worker &&
        status.persistence?.signer,
    );
  } catch {
    return false;
  }
}

async function waitReady(attempts) {
  for (let attempt = 0; attempt < attempts && !stopping; attempt += 1) {
    if (await ready()) return true;
    await delay(1000);
  }
  return false;
}

async function repairStack() {
  await startStack(12, 5);
  if (stopping || (await waitReady(30))) return;

  // Docker restart policies can launch consumers before PostgreSQL finishes crash recovery.
  console.warn("Worker or signer heartbeat is stale; restarting database consumers.");
  await compose("restart", "worker", "signer");
  if (!(await waitReady(120))) throw new Error("Durable AgentTrial stack did not become ready.");
}

async function writeState() {
  await writeFile(
    path.join(stateDirectory, "processes.json"),
    JSON.stringify(
      {
        mode: "pm2-docker-durable",
        supervisorPid: process.pid,
        port,
        composeProject: "agenttrial",
        repo: root,
        checkedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );
}

await mkdir(stateDirectory, { recursive: true });
await repairStack();

let consecutiveFailures = 0;
while (!stopping) {
  await writeState();
  await delay(10_000);
  if (await ready()) {
    consecutiveFailures = 0;
  } else if (++consecutiveFailures >= 3) {
    await repairStack();
    consecutiveFailures = 0;
  }
}
