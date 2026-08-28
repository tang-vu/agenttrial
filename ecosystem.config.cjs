/* eslint-disable @typescript-eslint/no-require-imports -- PM2 loads ecosystem files as CommonJS. */
/* global require, __dirname, process, module */
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const stateDirectory = path.join(process.env.LOCALAPPDATA, "AgentTrial", "tunnel");
const tunnelConfig = path.join(stateDirectory, "cloudflared-agenttrial.yml");
const stackScript = path.join(root, "scripts", "run-durable-pm2-stack.mjs");
const dockerCandidates = [
  process.env.AGENTTRIAL_DOCKER_PATH,
  path.join(process.env.USERPROFILE ?? "", ".local", "bin", "docker.cmd"),
  "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe",
].filter(Boolean);
const docker = dockerCandidates.find((candidate) => fs.existsSync(candidate));
const dockerWslMatch =
  docker?.toLowerCase().endsWith(".cmd") &&
  fs
    .readFileSync(docker, "utf8")
    .match(/wsl(?:\.exe)?\s+-d\s+(?:"([^"]+)"|(\S+))\s+--\s+docker\s+%\*/i);
const dockerWslDistro = dockerWslMatch && (dockerWslMatch[1] ?? dockerWslMatch[2]);
const cloudflaredCandidates = [
  process.env.AGENTTRIAL_CLOUDFLARED_PATH,
  "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe",
  "C:\\Program Files\\cloudflared\\cloudflared.exe",
].filter(Boolean);
const cloudflared = cloudflaredCandidates.find((candidate) => fs.existsSync(candidate));

if (!process.env.LOCALAPPDATA) throw new Error("LOCALAPPDATA is not configured.");
if (!fs.existsSync(stackScript)) throw new Error(`Stack supervisor is missing at ${stackScript}.`);
if (!docker) throw new Error("Docker CLI was not found. Set AGENTTRIAL_DOCKER_PATH.");
if (docker.toLowerCase().endsWith(".cmd") && !dockerWslDistro) {
  throw new Error(`Unsupported Docker command wrapper at ${docker}.`);
}
if (!fs.existsSync(tunnelConfig)) {
  throw new Error(`Cloudflare Tunnel config is missing at ${tunnelConfig}.`);
}
if (!cloudflared) {
  throw new Error("cloudflared.exe was not found. Set AGENTTRIAL_CLOUDFLARED_PATH.");
}

const shared = {
  cwd: root,
  namespace: "agenttrial",
  autorestart: true,
  watch: false,
  time: true,
  restart_delay: 10_000,
  max_restarts: 100,
  kill_timeout: 15_000,
};

module.exports = {
  apps: [
    {
      ...shared,
      name: "agenttrial-stack",
      script: stackScript,
      interpreter: process.execPath,
      env: {
        AGENTTRIAL_STATE_DIRECTORY: stateDirectory,
        AGENTTRIAL_DOCKER_PATH: docker,
        ...(dockerWslDistro ? { AGENTTRIAL_DOCKER_WSL_DISTRO: dockerWslDistro } : {}),
      },
      min_uptime: 30_000,
    },
    {
      ...shared,
      name: "agenttrial-tunnel",
      script: cloudflared,
      interpreter: "none",
      args: ["tunnel", "--no-autoupdate", "--config", tunnelConfig, "run"],
      min_uptime: 10_000,
    },
  ],
};
