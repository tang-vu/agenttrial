import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  CONTROLLED_AGENTS,
  CONTROL_MATRIX,
  CONTRIBUTION_SCOPE,
  EVALUATION_MODES,
  FAULT_FAMILIES,
  INDEPENDENT_TARGET_FREEZE,
  LLM_JUDGE_FREEZE,
  POWER_ANALYSIS_PLAN,
  SCENARIO_MATRIX,
  researchDesignHash,
} from "./index";

const artifact = {
  schemaVersion: "p26-002-design-0.5.0",
  status: "redesign-required",
  designHash: researchDesignHash(),
  primaryUnit:
    "Not frozen: the candidate source-unit/scenario-slot mapping requires operational and statistical redesign.",
  faultFamilies: FAULT_FAMILIES,
  controlledAgents: CONTROLLED_AGENTS,
  evaluationModes: EVALUATION_MODES,
  llmJudge: LLM_JUDGE_FREEZE,
  contributionScope: CONTRIBUTION_SCOPE,
  powerAnalysis: POWER_ANALYSIS_PLAN,
  independentTargets: INDEPENDENT_TARGET_FREEZE,
  nearestWorkStatus: "frozen-scope-audit-redesign-required-2026-08-29",
  scenarioCount: SCENARIO_MATRIX.length,
  matchedControlCount: CONTROL_MATRIX.length,
  candidateExecutionsPerSlot: POWER_ANALYSIS_PLAN.candidateDesign.requiredExecutionsPerSlot,
  candidateSharedExecutionArtifacts:
    POWER_ANALYSIS_PLAN.candidateDesign.totalSharedExecutionArtifacts,
  scenarios: SCENARIO_MATRIX,
  matchedControls: CONTROL_MATRIX,
  primaryOutcomes: [
    "false-acceptance rate",
    "false-rejection rate",
    "fault-detection precision",
    "fault-detection recall",
    "paired false-acceptance difference",
  ],
  analysis: {
    intervals: "Wilson 95%",
    pairedTest:
      "one-sided studentized mean of paired error-rate differences with configuration as the independent cluster",
    sensitivityTest: "execution-level exact McNemar, reported as a non-primary sensitivity check",
    resampling:
      "hierarchical bootstrap over configurations with repeats nested within configuration",
    multiplicity: "Holm correction across primary baseline comparisons",
  },
  interpretationBoundary:
    "Synthetic controlled fixtures and the credential-free engineering pilot validate measurement plumbing only. The former 80-by-20 candidate is superseded; publication claims require a redesigned, independently reviewed method on authorized source units.",
  blockers: [
    "The ten scenario variants per family are labels, not operationally distinct scenario definitions.",
    "Fixed upstream artifacts do not supply the 20 independent executions per target assumed by the current repetition and power plan.",
    "Sixty historical fault projection hashes are not currently reconstructed by the gate and are excluded from readiness.",
    "Sixty pinned control bindings resolve to only 20 unique input references, so independence is not established.",
    "The gate validates exact source-lock metadata but does not yet derive execution bytes from pinned blobs or reexecute/attest controlled runs.",
    "Candidate public source units are locked; source-bound evidence and independent construct review remain pending.",
    "Human authorization, data governance, and release boundary approval are pending.",
    "No main-trial method is frozen or authorized, and no main trial has been executed.",
  ],
};

const repositoryRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const output = resolve(repositoryRoot, "research/design-freeze.json");
await mkdir(resolve(repositoryRoot, "research"), { recursive: true });
await writeFile(output, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify({
    output,
    designHash: artifact.designHash,
    faultScenarios: artifact.scenarioCount,
    matchedControls: artifact.matchedControlCount,
  }),
);
