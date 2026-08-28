import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CONFIGURATION_COUNTS = [64, 80, 96] as const;
const REPETITION_COUNTS = [10, 20, 30] as const;

const CRITICAL_VALUES: Record<(typeof CONFIGURATION_COUNTS)[number], number> = {
  64: 2.175742481602217,
  80: 2.165916943646196,
  96: 2.159447872365497,
};

interface JointOutcomeAssumption {
  id: string;
  interpretation: string;
  probabilities: {
    neitherError: number;
    baselineOnlyError: number;
    agenttrialOnlyError: number;
    bothError: number;
  };
  intraclassCorrelation: number;
}

export const POWER_ANALYSIS_PLAN = {
  schemaVersion: "p26-002-power-plan-0.1.0",
  claimUse: "prospective-design-only",
  sourceBoundary:
    "Assumptions are sensitivity values, not effects estimated from the synthetic engineering pilot.",
  faultFamilies: 8,
  candidateConfigurationCounts: CONFIGURATION_COUNTS,
  candidateRepetitionsPerConfiguration: REPETITION_COUNTS,
  minimumConfigurations: 60,
  minimumRepetitions: 20,
  primaryBaselineComparisons: 3,
  familywiseAlpha: 0.05,
  planningAlphaPerComparison: 0.05 / 3,
  sidedness: "one-sided-superiority",
  primaryTest:
    "studentized mean of within-configuration paired error-rate differences, with configuration as the independent cluster",
  finalMultiplicityProcedure: "Holm across the three primary baseline comparisons",
  planningMultiplicityProcedure:
    "Bonferroni critical value for all three comparisons, conservative relative to Holm",
  simulationReplicates: 3000,
  seed: 2600201,
  minimumPower: 0.8,
  selectionUsesMonteCarloLowerBound: true,
  monteCarloConfidenceLevel: 0.95,
  falseAcceptanceScenarios: [
    {
      id: "pessimistic",
      interpretation:
        "Nine-point paired benefit with strong configuration clustering; this is the binding superiority scenario.",
      probabilities: {
        neitherError: 0.7,
        baselineOnlyError: 0.14,
        agenttrialOnlyError: 0.05,
        bothError: 0.11,
      },
      intraclassCorrelation: 0.3,
    },
    {
      id: "planning",
      interpretation: "Sixteen-point paired benefit with moderate configuration clustering.",
      probabilities: {
        neitherError: 0.68,
        baselineOnlyError: 0.2,
        agenttrialOnlyError: 0.04,
        bothError: 0.08,
      },
      intraclassCorrelation: 0.2,
    },
    {
      id: "optimistic",
      interpretation: "Twenty-five-point paired benefit with low configuration clustering.",
      probabilities: {
        neitherError: 0.62,
        baselineOnlyError: 0.28,
        agenttrialOnlyError: 0.03,
        bothError: 0.07,
      },
      intraclassCorrelation: 0.1,
    },
  ] satisfies JointOutcomeAssumption[],
  falseRejectionNoninferiority: {
    margin: 0.05,
    direction: "AgentTrial minus comparator",
    scenarios: [
      {
        id: "safe-plausible",
        interpretation:
          "AgentTrial has one percentage point more false rejection than the comparator.",
        probabilities: {
          neitherError: 0.94,
          baselineOnlyError: 0.01,
          agenttrialOnlyError: 0.02,
          bothError: 0.03,
        },
        intraclassCorrelation: 0.2,
      },
      {
        id: "near-margin-stress",
        interpretation:
          "AgentTrial has three percentage points more false rejection; reported as sensitivity, not a selection gate.",
        probabilities: {
          neitherError: 0.91,
          baselineOnlyError: 0.01,
          agenttrialOnlyError: 0.04,
          bothError: 0.04,
        },
        intraclassCorrelation: 0.2,
      },
    ] satisfies JointOutcomeAssumption[],
  },
  selectedDesign: {
    uniqueFaultConfigurations: 80,
    matchedControlConfigurations: 80,
    repetitionsPerConfiguration: 20,
    totalRunArtifacts: 3200,
    variantsPerFaultFamily: 10,
  },
} as const;

interface RandomState {
  value: number;
  spareNormal: number | null;
}

function uniform(state: RandomState) {
  state.value = (1664525 * state.value + 1013904223) >>> 0;
  return Math.max(Number.EPSILON, state.value / 2 ** 32);
}

function normal(state: RandomState) {
  if (state.spareNormal !== null) {
    const value = state.spareNormal;
    state.spareNormal = null;
    return value;
  }
  const radius = Math.sqrt(-2 * Math.log(uniform(state)));
  const angle = 2 * Math.PI * uniform(state);
  state.spareNormal = radius * Math.sin(angle);
  return radius * Math.cos(angle);
}

function gamma(shape: number, state: RandomState): number {
  if (shape <= 0) throw new Error("Gamma shape must be positive.");
  if (shape < 1) return gamma(shape + 1, state) * uniform(state) ** (1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    const z = normal(state);
    const base = 1 + c * z;
    if (base <= 0) continue;
    const value = base ** 3;
    const u = uniform(state);
    if (u < 1 - 0.0331 * z ** 4) return d * value;
    if (Math.log(u) < 0.5 * z * z + d * (1 - value + Math.log(value))) return d * value;
  }
}

function drawClusterProbabilities(
  assumption: JointOutcomeAssumption,
  state: RandomState,
): number[] {
  const concentration = 1 / assumption.intraclassCorrelation - 1;
  const means = [
    assumption.probabilities.neitherError,
    assumption.probabilities.baselineOnlyError,
    assumption.probabilities.agenttrialOnlyError,
    assumption.probabilities.bothError,
  ];
  const draws = means.map((mean) => gamma(mean * concentration, state));
  const total = draws.reduce((sum, value) => sum + value, 0);
  return draws.map((value) => value / total);
}

function drawCategory(probabilities: number[], state: RandomState) {
  const value = uniform(state);
  let cumulative = 0;
  for (let index = 0; index < probabilities.length; index++) {
    cumulative += probabilities[index]!;
    if (value <= cumulative) return index;
  }
  return probabilities.length - 1;
}

function clusterStandardError(values: number[]) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const squared = values.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  return {
    mean,
    standardError: Math.sqrt(squared / (values.length - 1)) / Math.sqrt(values.length),
  };
}

function simulateEffects(
  assumption: JointOutcomeAssumption,
  configurations: number,
  repetitions: number,
  state: RandomState,
  direction: "baseline-minus-agenttrial" | "agenttrial-minus-baseline",
) {
  const effects: number[] = [];
  for (let configuration = 0; configuration < configurations; configuration++) {
    const probabilities = drawClusterProbabilities(assumption, state);
    let baselineOnly = 0;
    let agenttrialOnly = 0;
    for (let repeat = 0; repeat < repetitions; repeat++) {
      const category = drawCategory(probabilities, state);
      if (category === 1) baselineOnly++;
      if (category === 2) agenttrialOnly++;
    }
    const difference = (baselineOnly - agenttrialOnly) / repetitions;
    effects.push(direction === "baseline-minus-agenttrial" ? difference : -difference);
  }
  return clusterStandardError(effects);
}

function wilson(successes: number, total: number) {
  const estimate = successes / total;
  const z = 1.96;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const center = (estimate + z2 / (2 * total)) / denominator;
  const half =
    (z / denominator) * Math.sqrt((estimate * (1 - estimate)) / total + z2 / (4 * total ** 2));
  return {
    estimate,
    lower: Math.max(0, center - half),
    upper: Math.min(1, center + half),
  };
}

function scenarioSeed(base: number, configurations: number, repetitions: number, index: number) {
  return (base + configurations * 1009 + repetitions * 9176 + index * 65537) >>> 0;
}

export function runPowerAnalysis() {
  const superiority = [];
  const noninferiority = [];
  for (const configurations of CONFIGURATION_COUNTS) {
    const criticalValue = CRITICAL_VALUES[configurations];
    for (const repetitions of REPETITION_COUNTS) {
      for (const [
        scenarioIndex,
        assumption,
      ] of POWER_ANALYSIS_PLAN.falseAcceptanceScenarios.entries()) {
        const state: RandomState = {
          value: scenarioSeed(POWER_ANALYSIS_PLAN.seed, configurations, repetitions, scenarioIndex),
          spareNormal: null,
        };
        let rejected = 0;
        for (
          let simulation = 0;
          simulation < POWER_ANALYSIS_PLAN.simulationReplicates;
          simulation++
        ) {
          const effect = simulateEffects(
            assumption,
            configurations,
            repetitions,
            state,
            "baseline-minus-agenttrial",
          );
          const statistic =
            effect.standardError === 0
              ? Number.POSITIVE_INFINITY
              : effect.mean / effect.standardError;
          if (statistic > criticalValue) rejected++;
        }
        superiority.push({
          scenario: assumption.id,
          configurations,
          repetitions,
          totalFaultAndControlRuns: configurations * repetitions * 2,
          criticalValue,
          assumedAbsoluteEffect:
            assumption.probabilities.baselineOnlyError -
            assumption.probabilities.agenttrialOnlyError,
          intraclassCorrelation: assumption.intraclassCorrelation,
          power: wilson(rejected, POWER_ANALYSIS_PLAN.simulationReplicates),
        });
      }

      for (const [
        scenarioIndex,
        assumption,
      ] of POWER_ANALYSIS_PLAN.falseRejectionNoninferiority.scenarios.entries()) {
        const state: RandomState = {
          value: scenarioSeed(
            POWER_ANALYSIS_PLAN.seed + 1,
            configurations,
            repetitions,
            scenarioIndex,
          ),
          spareNormal: null,
        };
        let established = 0;
        for (
          let simulation = 0;
          simulation < POWER_ANALYSIS_PLAN.simulationReplicates;
          simulation++
        ) {
          const harm = simulateEffects(
            assumption,
            configurations,
            repetitions,
            state,
            "agenttrial-minus-baseline",
          );
          const upperBound = harm.mean + criticalValue * harm.standardError;
          if (upperBound < POWER_ANALYSIS_PLAN.falseRejectionNoninferiority.margin) established++;
        }
        noninferiority.push({
          scenario: assumption.id,
          selectionGate: assumption.id === "safe-plausible",
          configurations,
          repetitions,
          totalFaultAndControlRuns: configurations * repetitions * 2,
          criticalValue,
          assumedHarm:
            assumption.probabilities.agenttrialOnlyError -
            assumption.probabilities.baselineOnlyError,
          noninferiorityMargin: POWER_ANALYSIS_PLAN.falseRejectionNoninferiority.margin,
          intraclassCorrelation: assumption.intraclassCorrelation,
          probabilityOfEstablishingNoninferiority: wilson(
            established,
            POWER_ANALYSIS_PLAN.simulationReplicates,
          ),
        });
      }
    }
  }

  const selected = POWER_ANALYSIS_PLAN.selectedDesign;
  const selectedSuperiority = superiority.filter(
    (item) =>
      item.configurations === selected.uniqueFaultConfigurations &&
      item.repetitions === selected.repetitionsPerConfiguration,
  );
  const selectedNoninferiority = noninferiority.filter(
    (item) =>
      item.configurations === selected.uniqueFaultConfigurations &&
      item.repetitions === selected.repetitionsPerConfiguration &&
      item.selectionGate,
  );
  const selectionPassed =
    selectedSuperiority.every((item) => item.power.lower >= POWER_ANALYSIS_PLAN.minimumPower) &&
    selectedNoninferiority.every(
      (item) =>
        item.probabilityOfEstablishingNoninferiority.lower >= POWER_ANALYSIS_PLAN.minimumPower,
    );

  const planHash = createHash("sha256").update(JSON.stringify(POWER_ANALYSIS_PLAN)).digest("hex");
  return {
    schemaVersion: "p26-002-power-analysis-0.1.0",
    generatedBy: "@agenttrial/research power simulation",
    claimUse: POWER_ANALYSIS_PLAN.claimUse,
    sourceBoundary: POWER_ANALYSIS_PLAN.sourceBoundary,
    planHash,
    simulation: {
      replicates: POWER_ANALYSIS_PLAN.simulationReplicates,
      seed: POWER_ANALYSIS_PLAN.seed,
      clusterModel:
        "A Dirichlet draw generates each configuration's four paired outcome probabilities; repetitions are categorical draws nested inside that configuration.",
      intraclassCorrelationMapping:
        "Dirichlet concentration is 1 / ICC - 1, giving the specified exchangeable within-configuration correlation for category indicators.",
      test: POWER_ANALYSIS_PLAN.primaryTest,
      planningMultiplicity: POWER_ANALYSIS_PLAN.planningMultiplicityProcedure,
      monteCarloIntervals: "Wilson 95% intervals around simulated success proportions",
    },
    assumptions: {
      falseAcceptanceScenarios: POWER_ANALYSIS_PLAN.falseAcceptanceScenarios,
      falseRejectionNoninferiority: POWER_ANALYSIS_PLAN.falseRejectionNoninferiority,
    },
    results: { superiority, noninferiority },
    selection: {
      ...selected,
      rule: "Meet protocol floors and require the 95% Monte Carlo lower bound to be at least 0.80 for all superiority scenarios and the safe-plausible noninferiority scenario.",
      passed: selectionPassed,
      selectedSuperiority,
      selectedNoninferiority,
      rationale:
        "Independent configurations buy more power under clustering than extra repeats. The 80-by-20 design is lower workload than 64-by-30 and protects the pessimistic nine-point scenario.",
    },
    interpretationBoundary:
      "Power is conditional on prospective sensitivity assumptions. It does not validate an effect, replace independent targets, or convert synthetic pilot outputs into paper evidence.",
  };
}

async function writePowerArtifact() {
  const artifact = runPowerAnalysis();
  if (!artifact.selection.passed) throw new Error("Frozen power-selection gate did not pass.");
  const repositoryRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
  const outputDirectory = resolve(repositoryRoot, "research/power");
  const output = resolve(outputDirectory, "power-analysis.json");
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(output, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify({
      output,
      planHash: artifact.planHash,
      selected: artifact.selection,
    }),
  );
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entry) await writePowerArtifact();
