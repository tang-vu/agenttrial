import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { wilson } from "./analysis";
import {
  JUDGE_CALIBRATION_CASES,
  JUDGE_GRAMMAR,
  JUDGE_SYSTEM_PROMPT,
  LOCAL_JUDGE_CANDIDATE,
  parseJudgeOutput,
  renderJudgeCase,
} from "./local-judge";

const serverExecutable = process.env.AGENTTRIAL_LLAMA_SERVER;
const modelPath = process.env.AGENTTRIAL_LLM_MODEL;
if (!serverExecutable || !modelPath)
  throw new Error("Set AGENTTRIAL_LLAMA_SERVER and AGENTTRIAL_LLM_MODEL.");

async function sha256(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

const actualModelSha256 = await sha256(modelPath);
if (actualModelSha256 !== LOCAL_JUDGE_CANDIDATE.modelSha256)
  throw new Error(`Model SHA-256 mismatch: ${actualModelSha256}.`);

const port = 8097;
let stderr = "";
const server = spawn(
  serverExecutable,
  [
    "-m",
    modelPath,
    "-t",
    String(LOCAL_JUDGE_CANDIDATE.threads),
    "-tb",
    String(LOCAL_JUDGE_CANDIDATE.threads),
    "-c",
    String(LOCAL_JUDGE_CANDIDATE.contextTokens),
    "-np",
    "1",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--reasoning",
    "off",
    "--no-warmup",
    "--no-webui",
    "--log-disable",
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);
server.stderr?.on("data", (chunk: Buffer) => {
  stderr = `${stderr}${chunk.toString()}`.slice(-8000);
});

async function waitForHealth() {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error(`Judge server exited early. ${stderr}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return;
    } catch {
      // The local server is still loading.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error(`Judge server did not become healthy. ${stderr}`);
}

interface ServerResponse {
  choices: Array<{ message: { content: string } }>;
  timings?: { prompt_ms?: number; predicted_ms?: number };
}

const records: Array<Record<string, unknown>> = [];
try {
  await waitForHealth();
  for (let repeat = 0; repeat < 2; repeat++) {
    for (const item of JUDGE_CALIBRATION_CASES) {
      const started = performance.now();
      const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "local",
          temperature: LOCAL_JUDGE_CANDIDATE.temperature,
          seed: LOCAL_JUDGE_CANDIDATE.seed,
          max_tokens: LOCAL_JUDGE_CANDIDATE.maxOutputTokens,
          grammar: JUDGE_GRAMMAR,
          messages: [
            { role: "system", content: JUDGE_SYSTEM_PROMPT },
            { role: "user", content: renderJudgeCase(item) },
          ],
        }),
      });
      if (!response.ok)
        throw new Error(`Judge request failed: ${response.status} ${await response.text()}`);
      const body = (await response.json()) as ServerResponse;
      const raw = body.choices[0]?.message.content ?? "";
      let parsed: ReturnType<typeof parseJudgeOutput> | null = null;
      let parseError: string | null = null;
      try {
        parsed = parseJudgeOutput(raw);
      } catch (error) {
        parseError = error instanceof Error ? error.message : String(error);
      }
      records.push({
        caseId: item.id,
        family: item.family,
        groundTruth: item.groundTruth,
        repeat,
        verdict: parsed?.verdict ?? null,
        rationale: parsed?.rationale ?? null,
        rawOutput: raw,
        parseError,
        correct: parsed?.verdict === item.groundTruth,
        falseAcceptance: item.groundTruth === "reject" && parsed?.verdict === "accept",
        falseRejection: item.groundTruth === "accept" && parsed?.verdict === "reject",
        elapsedMs: Math.round((performance.now() - started) * 1000) / 1000,
        promptMs: body.timings?.prompt_ms ?? null,
        generationMs: body.timings?.predicted_ms ?? null,
      });
    }
  }
} finally {
  server.kill("SIGTERM");
  await new Promise<void>((resolveExit) => {
    if (server.exitCode !== null) resolveExit();
    else server.once("exit", () => resolveExit());
  });
}

const parsedRecords = records.filter((record) => record.parseError === null);
const faultyRecords = records.filter((record) => record.groundTruth === "reject");
const controlRecords = records.filter((record) => record.groundTruth === "accept");
const falseAcceptances = faultyRecords.filter((record) => record.falseAcceptance).length;
const falseRejections = controlRecords.filter((record) => record.falseRejection).length;
const correct = records.filter((record) => record.correct).length;
const repeatabilityPairs = JUDGE_CALIBRATION_CASES.map((item) => {
  const verdicts = records
    .filter((record) => record.caseId === item.id)
    .map((record) => record.verdict);
  return verdicts.length === 2 && verdicts[0] !== null && verdicts[0] === verdicts[1];
});
const gate = {
  parseRateIs100Percent: parsedRecords.length === records.length,
  accuracyAtLeast80Percent: correct / records.length >= 0.8,
  falseAcceptanceAtMost25Percent: falseAcceptances / faultyRecords.length <= 0.25,
  falseRejectionAtMost25Percent: falseRejections / controlRecords.length <= 0.25,
  verdictRepeatability100Percent: repeatabilityPairs.every(Boolean),
};
const summary = {
  schemaVersion: "p26-002-local-judge-calibration-0.1.0",
  attempt: 1,
  priorAttempt:
    "Attempt 0 is retained. It failed the parse gate because unconstrained rationales reached the output-token limit; no selection threshold was changed.",
  claimUse: "baseline-selection-only",
  interpretationBoundary:
    "This held-out synthetic calibration selects a reproducible baseline. It is not a paper result and must not be pooled with the main study.",
  candidate: LOCAL_JUDGE_CANDIDATE,
  runtimeNote:
    "llama.cpp JSON Schema sampler initialization failed in this pinned runtime, so the frozen path uses an explicit minimal EBNF grammar plus strict application parsing.",
  calibration: {
    uniqueCases: JUDGE_CALIBRATION_CASES.length,
    repeatsPerCase: 2,
    totalRecords: records.length,
    faultyRecords: faultyRecords.length,
    controlRecords: controlRecords.length,
  },
  outcomes: {
    parsed: parsedRecords.length,
    parseRate: parsedRecords.length / records.length,
    correct,
    accuracy: correct / records.length,
    falseAcceptance: wilson(falseAcceptances, faultyRecords.length),
    falseRejection: wilson(falseRejections, controlRecords.length),
    verdictRepeatability: repeatabilityPairs.filter(Boolean).length / repeatabilityPairs.length,
  },
  gate,
  status: Object.values(gate).every(Boolean) ? "pass" : "fail",
};

const repositoryRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const outputDirectory = resolve(repositoryRoot, "research/llm-judge");
await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(
    resolve(outputDirectory, "calibration-manifest.ndjson"),
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
    "utf8",
  ),
  writeFile(
    resolve(outputDirectory, "calibration-summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  ),
]);

console.log(
  JSON.stringify({ outputDirectory, status: summary.status, outcomes: summary.outcomes }),
);
if (summary.status !== "pass") process.exitCode = 2;
