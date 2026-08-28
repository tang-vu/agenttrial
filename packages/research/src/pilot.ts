import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hierarchicalBootstrap, pairedFalseAcceptance, wilson, type BinaryPair } from "./analysis";
import { executeControlledAgent, FIXTURE_SCOPE } from "./controlled-agents";
import {
  CONTROL_MATRIX,
  SCENARIO_MATRIX,
  evaluateBaseline,
  researchDesignHash,
  type EvaluationMode,
  type TrialConfiguration,
} from "./index";
import { runTamperSuite } from "./tamper";

const RUN_ID = "p26-002-engineering-pilot-0.1.0";
const PILOT_REPEATS = 2;
const CREDENTIAL_FREE_MODES = [
  "final-output-only",
  "trace-presence",
  "agenttrial",
] as const satisfies readonly EvaluationMode[];

type CredentialFreeMode = (typeof CREDENTIAL_FREE_MODES)[number];

interface PilotRecord {
  runId: typeof RUN_ID;
  claimUse: "pipeline-validation-only";
  fixtureScope: typeof FIXTURE_SCOPE;
  designHash: string;
  configurationId: string;
  pairedConfigurationId: string;
  family: string;
  variant: string;
  repeat: number;
  agentId: string;
  groundTruth: "accept" | "reject";
  evaluationMode: CredentialFreeMode;
  verdict: "accept" | "reject";
  classification: "true-accept" | "true-reject" | "false-accept" | "false-reject";
  artifactChecks: {
    eventCount: number;
    failedAssertions: number;
    claimCoverage: number;
    independentVerificationValid: boolean;
  };
}

function pairedConfigurationId(configuration: TrialConfiguration) {
  return "pairedFaultConfigurationId" in configuration
    ? configuration.pairedFaultConfigurationId
    : configuration.id;
}

function classification(
  groundTruth: "accept" | "reject",
  verdict: "accept" | "reject",
): PilotRecord["classification"] {
  if (groundTruth === "accept") return verdict === "accept" ? "true-accept" : "false-reject";
  return verdict === "reject" ? "true-reject" : "false-accept";
}

function modeSummary(mode: CredentialFreeMode, records: PilotRecord[]) {
  const selected = records.filter((record) => record.evaluationMode === mode);
  const count = (value: PilotRecord["classification"]) =>
    selected.filter((record) => record.classification === value).length;
  const trueAccept = count("true-accept");
  const trueReject = count("true-reject");
  const falseAccept = count("false-accept");
  const falseReject = count("false-reject");
  const faultTotal = trueReject + falseAccept;
  const controlTotal = trueAccept + falseReject;
  return {
    mode,
    records: selected.length,
    confusion: { trueAccept, trueReject, falseAccept, falseReject },
    falseAcceptance: wilson(falseAccept, faultTotal),
    falseRejection: wilson(falseReject, controlTotal),
    faultDetectionPrecision:
      trueReject + falseReject === 0 ? 0 : trueReject / (trueReject + falseReject),
    faultDetectionRecall: faultTotal === 0 ? 0 : trueReject / faultTotal,
  };
}

function pairedEffect(baseline: Exclude<CredentialFreeMode, "agenttrial">, records: PilotRecord[]) {
  const faultRecords = records.filter((record) => record.groundTruth === "reject");
  const pairs: BinaryPair[] = [];
  for (const record of faultRecords.filter((item) => item.evaluationMode === baseline)) {
    const agenttrial = faultRecords.find(
      (item) =>
        item.configurationId === record.configurationId &&
        item.repeat === record.repeat &&
        item.evaluationMode === "agenttrial",
    );
    if (!agenttrial)
      throw new Error(`Missing paired AgentTrial record for ${record.configurationId}.`);
    pairs.push({
      configurationId: record.configurationId,
      repeat: record.repeat,
      baselineFalseAccept: record.verdict === "accept",
      agenttrialFalseAccept: agenttrial.verdict === "accept",
    });
  }
  return {
    baseline,
    comparison: pairedFalseAcceptance(pairs),
    hierarchicalBootstrap95: hierarchicalBootstrap(pairs, 1000, 2026002),
  };
}

const designHash = researchDesignHash();
const configurations: TrialConfiguration[] = [...SCENARIO_MATRIX, ...CONTROL_MATRIX];
const records: PilotRecord[] = [];

for (const configuration of configurations) {
  for (let repeat = 0; repeat < PILOT_REPEATS; repeat++) {
    const execution = executeControlledAgent(configuration, repeat);
    for (const mode of CREDENTIAL_FREE_MODES) {
      const result = evaluateBaseline(mode, execution.artifact);
      if (result.verdict === "not-evaluated")
        throw new Error(`Credential-free mode ${mode} unexpectedly returned not-evaluated.`);
      records.push({
        runId: RUN_ID,
        claimUse: "pipeline-validation-only",
        fixtureScope: execution.fixtureScope,
        designHash,
        configurationId: configuration.id,
        pairedConfigurationId: pairedConfigurationId(configuration),
        family: configuration.family,
        variant: configuration.variant,
        repeat,
        agentId: execution.agentId,
        groundTruth: execution.groundTruth,
        evaluationMode: mode,
        verdict: result.verdict,
        classification: classification(execution.groundTruth, result.verdict),
        artifactChecks: {
          eventCount: execution.artifact.events.length,
          failedAssertions: execution.artifact.assertionResults.filter((item) => !item.passed)
            .length,
          claimCoverage: execution.artifact.claimCoverage,
          independentVerificationValid: execution.artifact.independentVerificationValid,
        },
      });
    }
  }
}

const tamper = runTamperSuite();
const summary = {
  schemaVersion: "p26-002-engineering-pilot-0.1.0",
  runId: RUN_ID,
  claimUse: "pipeline-validation-only",
  fixtureScope: FIXTURE_SCOPE,
  interpretationBoundary:
    "Synthetic fixtures validate measurement plumbing only. They are not evidence of real-world efficacy, superiority, or publication-ready findings.",
  designHash,
  inputs: {
    faultConfigurations: SCENARIO_MATRIX.length,
    matchedControlConfigurations: CONTROL_MATRIX.length,
    repeatsPerConfiguration: PILOT_REPEATS,
    evaluationModes: CREDENTIAL_FREE_MODES,
    llmJudgeStatus: "excluded-until-local-model-and-runtime-are-frozen",
  },
  manifestRecords: records.length,
  outcomes: CREDENTIAL_FREE_MODES.map((mode) => modeSummary(mode, records)),
  pairedFalseAcceptanceEffects: [
    pairedEffect("final-output-only", records),
    pairedEffect("trace-presence", records),
  ],
  tamperVerification: {
    validBundleAccepted: tamper.validBundleAccepted,
    mutationCount: tamper.mutationCount,
    detectedCount: tamper.detectedCount,
    localizedCount: tamper.localizedCount,
  },
};

const tamperSummary = {
  schemaVersion: "p26-002-tamper-pilot-0.1.0",
  runId: RUN_ID,
  claimUse: "pipeline-validation-only",
  interpretationBoundary:
    "This deterministic mutation suite validates verifier wiring and first-mismatch localization, not external attack coverage.",
  ...tamper,
};

const repositoryRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const outputDirectory = resolve(repositoryRoot, "research/pilot");
await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(
    resolve(outputDirectory, "run-manifest.ndjson"),
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
    "utf8",
  ),
  writeFile(
    resolve(outputDirectory, "summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  ),
  writeFile(
    resolve(outputDirectory, "tamper-summary.json"),
    `${JSON.stringify(tamperSummary, null, 2)}\n`,
    "utf8",
  ),
]);

console.log(
  JSON.stringify({
    outputDirectory,
    designHash,
    manifestRecords: records.length,
    tamperDetected: `${tamper.detectedCount}/${tamper.mutationCount}`,
  }),
);
