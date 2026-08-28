/* global AbortSignal, fetch */
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { URL } from "node:url";

const strict = process.argv.includes("--strict");
const root = new URL("../", import.meta.url);
const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
const localCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();

const endpoints = [
  { name: "product", url: "https://agenttrial.tangvu.dev", type: "text/html" },
  { name: "benchmark", url: "https://agenttrial.tangvu.dev/benchmark", type: "text/html" },
  {
    name: "methodology",
    url: "https://agenttrial.tangvu.dev/api/methodology",
    type: "application/json",
  },
  {
    name: "production-report",
    url: "https://agenttrial.tangvu.dev/reports/17462463-066f-485d-87b7-ae011b0de19f",
    type: "text/html",
  },
  {
    name: "narrated-demo",
    url: "https://agenttrial.tangvu.dev/demo/agenttrial-live-demo-narrated.mp4",
    type: "video/mp4",
    range: true,
  },
  {
    name: "eas-attestation",
    url: "https://base-sepolia.easscan.org/attestation/view/0xc62f196d7486b6463668aff181fe52daa87f362fa665823d44bb9ad348ff594c",
    type: "text/html",
  },
];

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(45_000) });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}.`);
  return response.json();
}

async function checkEndpoint(endpoint) {
  const startedAt = performance.now();
  try {
    const response = await fetch(endpoint.url, {
      headers: endpoint.range ? { Range: "bytes=0-0" } : undefined,
      redirect: "follow",
      signal: AbortSignal.timeout(45_000),
    });
    const contentType = response.headers.get("content-type") ?? "";
    await response.body?.cancel();
    return {
      name: endpoint.name,
      url: endpoint.url,
      status: response.status,
      contentType,
      milliseconds: Math.round(performance.now() - startedAt),
      passed:
        (response.ok || (endpoint.range && response.status === 206)) &&
        contentType.startsWith(endpoint.type),
    };
  } catch (error) {
    return {
      name: endpoint.name,
      url: endpoint.url,
      status: null,
      contentType: null,
      milliseconds: Math.round(performance.now() - startedAt),
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const [health, ready, orionStatus, gallery, endpointResults] = await Promise.all([
  fetchJson("https://agenttrial.tangvu.dev/api/health"),
  fetchJson("https://agenttrial.tangvu.dev/api/ready"),
  fetchJson("https://orionagents.org/api/hackathon/status"),
  fetchJson("https://orionagents.org/api/hackathon/entries"),
  Promise.all(endpoints.map(checkEndpoint)),
]);

const entry = (gallery.entries ?? []).find(
  (candidate) => candidate.name?.trim().toLowerCase() === "agenttrial",
);
const endpointGatePassed = endpointResults.every((endpoint) => endpoint.passed);
const durableRuntimeReady = Boolean(
  ready.ready &&
    ready.persistence?.database &&
    ready.persistence?.worker &&
    ready.persistence?.signer,
);
const productionVersionMatchesRelease = health.version === packageJson.version;
const productionBuildMatchesCheckout = health.build === localCommit;
const listedInOrion = Boolean(entry);
const strictGatePassed =
  endpointGatePassed &&
  durableRuntimeReady &&
  productionVersionMatchesRelease &&
  productionBuildMatchesCheckout &&
  listedInOrion;

const report = {
  checkedAt: new Date().toISOString(),
  release: { version: packageJson.version, commit: localCommit },
  production: {
    version: health.version,
    build: health.build,
    versionMatchesRelease: productionVersionMatchesRelease,
    buildMatchesCheckout: productionBuildMatchesCheckout,
    durableRuntimeReady,
    ready,
  },
  orion: {
    submissionsOpen: orionStatus.submissionsOpen,
    deadline: orionStatus.endsAt,
    galleryEntryCount: gallery.entries?.length ?? 0,
    listed: listedInOrion,
    entry: entry
      ? {
          id: entry.id,
          status: entry.status,
          intelligenceScore: entry.intelligenceScore,
          votes: entry.votes,
        }
      : null,
  },
  endpoints: endpointResults,
  gates: {
    endpointGatePassed,
    durableRuntimeReady,
    productionVersionMatchesRelease,
    productionBuildMatchesCheckout,
    listedInOrion,
    strictGatePassed,
  },
};

console.log(JSON.stringify(report, null, 2));
if (strict && !strictGatePassed) process.exitCode = 1;
