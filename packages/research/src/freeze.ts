import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  CONTROLLED_AGENTS,
  EVALUATION_MODES,
  FAULT_FAMILIES,
  LLM_JUDGE_FREEZE,
  SCENARIO_MATRIX,
  researchDesignHash,
} from "./index";

const artifact = {
  schemaVersion: "p26-002-design-0.2.0",
  status: "draft-freeze",
  designHash: researchDesignHash(),
  primaryUnit: "unique capability-claim, scenario, and injected-fault configuration",
  faultFamilies: FAULT_FAMILIES,
  controlledAgents: CONTROLLED_AGENTS,
  evaluationModes: EVALUATION_MODES,
  llmJudge: LLM_JUDGE_FREEZE,
  scenarioCount: SCENARIO_MATRIX.length,
  repetitionsPerScenario: 20,
  plannedRunCountPerEvaluationMode: SCENARIO_MATRIX.length * 20,
  scenarios: SCENARIO_MATRIX,
  primaryOutcomes: [
    "false-acceptance rate",
    "false-rejection rate",
    "fault-detection precision",
    "fault-detection recall",
    "paired false-acceptance difference",
  ],
  analysis: {
    intervals: "Wilson 95%",
    pairedTest: "exact McNemar",
    resampling:
      "hierarchical bootstrap over configurations with repeats nested within configuration",
    multiplicity: "Holm correction across primary baseline comparisons",
  },
  blockers: [
    "Nearest-work matrix and distinct contribution claim are not frozen.",
    "Local open-weight LLM judge model and runtime are not frozen.",
    "Human authorization, data governance, and release boundary approval are pending.",
    "Controlled fixtures beyond the grounded and gullible agents are not implemented yet.",
  ],
};

const repositoryRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const output = resolve(repositoryRoot, "research/design-freeze.json");
await mkdir(resolve(repositoryRoot, "research"), { recursive: true });
await writeFile(output, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify({ output, designHash: artifact.designHash, scenarios: artifact.scenarioCount }),
);
