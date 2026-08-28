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
  schemaVersion: "p26-002-design-0.4.0",
  status: "draft-freeze",
  designHash: researchDesignHash(),
  primaryUnit: "unique capability-claim, scenario, and injected-fault configuration",
  faultFamilies: FAULT_FAMILIES,
  controlledAgents: CONTROLLED_AGENTS,
  evaluationModes: EVALUATION_MODES,
  llmJudge: LLM_JUDGE_FREEZE,
  contributionScope: CONTRIBUTION_SCOPE,
  powerAnalysis: POWER_ANALYSIS_PLAN,
  independentTargets: INDEPENDENT_TARGET_FREEZE,
  nearestWorkStatus: "frozen-conditional-go-2026-08-28",
  scenarioCount: SCENARIO_MATRIX.length,
  matchedControlCount: CONTROL_MATRIX.length,
  repetitionsPerScenario: POWER_ANALYSIS_PLAN.selectedDesign.repetitionsPerConfiguration,
  plannedRunCountPerEvaluationMode: POWER_ANALYSIS_PLAN.selectedDesign.totalRunArtifacts,
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
    "Synthetic controlled fixtures and the credential-free engineering pilot validate measurement plumbing only. Publication claims require the preregistered main trial on independent targets.",
  blockers: [
    "Independent target sources are locked; adapters and independent construct review remain pending.",
    "Human authorization, data governance, and release boundary approval are pending.",
    "The preregistered main trial on independent targets has not been executed.",
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
