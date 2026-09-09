#!/usr/bin/env python3
"""Build the P26-002 cluster-unit power and pipeline-priority sensitivity audit."""
from __future__ import annotations

import functools
import hashlib
import itertools
import json
import math
import subprocess
from collections import Counter, defaultdict
from pathlib import Path

from scipy.stats import beta, binom

ROOT = Path(__file__).resolve().parent
MULTI_INPUT = ROOT.parent / "multi-pipeline-fixed-corpus-feasibility-2026-09-09" / "multi_pipeline_feasibility.json"
SOURCE_INPUT = ROOT.parent / "source-expansion-feasibility-2026-09-09" / "source_expansion_snapshot.json"
OUT_JSON = ROOT / "cluster_unit_sensitivity.json"
OUT_MD = ROOT / "cluster_unit_sensitivity.md"
OUT_SVG = ROOT / "cluster_unit_power.svg"
VALIDATION = ROOT / "validation.json"

ALPHA = 0.05
BENEFIT_BASELINE_ONLY = 0.14
BENEFIT_AGENTTRIAL_ONLY = 0.05
SAFETY_TRUE_RATE = 0.01
SAFETY_MARGIN = 0.05
REQUIRED_INDEPENDENT_UNITS = 181
ICC_GRID = (0.0, 0.05, 0.10, 0.20, 0.24, 0.25, 0.30, 0.50, 1.0)


def canonical_json(value: object) -> str:
    return json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def format_files(*paths: Path) -> None:
    subprocess.run(
        ["npx", "--no-install", "prettier@3.6.2", "--write", *map(str, paths)],
        check=True,
        cwd=ROOT.parents[2],
    )


@functools.lru_cache(maxsize=None)
def conditional_rejection_power(discordant: int, q: float) -> float:
    if discordant == 0:
        return 0.0
    critical = next(
        (b for b in range(discordant + 1) if binom.sf(b - 1, discordant, 0.5) <= ALPHA),
        None,
    )
    return 0.0 if critical is None else float(binom.sf(critical - 1, discordant, q))


def benefit_power(n: int) -> float:
    discordance = BENEFIT_BASELINE_ONLY + BENEFIT_AGENTTRIAL_ONLY
    q = BENEFIT_BASELINE_ONLY / discordance
    return float(
        sum(
            binom.pmf(d, n, discordance) * conditional_rejection_power(d, q)
            for d in range(n + 1)
        )
    )


def clopper_pearson_upper(events: int, n: int) -> float:
    return 1.0 if events == n else float(beta.ppf(1 - ALPHA, events + 1, n - events))


@functools.lru_cache(maxsize=None)
def safety_power(n: int) -> dict:
    passing = [k for k in range(n + 1) if clopper_pearson_upper(k, n) <= SAFETY_MARGIN]
    max_events = max(passing, default=-1)
    power = 0.0 if max_events < 0 else float(binom.cdf(max_events, n, SAFETY_TRUE_RATE))
    return {"maxPassingEvents": max_events, "power": power}


def power_row(n: int) -> dict:
    benefit = benefit_power(n)
    safety = safety_power(n)
    return {
        "n": n,
        "benefitPower": benefit,
        "safetyPower": safety["power"],
        "safetyMaxPassingEvents": safety["maxPassingEvents"],
        "jointLowerBound": max(0.0, benefit + safety["power"] - 1.0),
    }


def render_svg(rows: list[dict]) -> str:
    width, height = 760, 390
    left, chart_width = 250, 450
    bar_height, gap = 34, 22
    colors = ["#5875d1", "#c1645a", "#3c8d73"]
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        '<rect width="100%" height="100%" fill="#ffffff"/>',
        '<style>text{font-family:Arial,sans-serif;fill:#1f2937}.title{font-size:20px;font-weight:700}.label{font-size:14px}.value{font-size:14px;font-weight:700}.axis{font-size:12px;fill:#4b5563}</style>',
        '<text x="28" y="36" class="title">P26-002 co-primary power sensitivity</text>',
        '<text x="28" y="60" class="axis">Exact binomial sensitivity under transported planning probabilities</text>',
    ]
    for tick in (0.0, 0.2, 0.4, 0.6, 0.8, 1.0):
        x = left + chart_width * tick
        parts.append(f'<line x1="{x:.1f}" y1="86" x2="{x:.1f}" y2="326" stroke="#e5e7eb"/>')
        parts.append(f'<text x="{x:.1f}" y="346" text-anchor="middle" class="axis">{tick:.1f}</text>')
    for index, row in enumerate(rows):
        y = 102 + index * (bar_height + gap)
        value = row["jointLowerBound"]
        parts.append(f'<text x="28" y="{y + 22}" class="label">{row["label"]}</text>')
        parts.append(
            f'<rect x="{left}" y="{y}" width="{chart_width * value:.1f}" height="{bar_height}" rx="4" fill="{colors[index]}"/>'
        )
        parts.append(f'<text x="{left + chart_width * value + 8:.1f}" y="{y + 22}" class="value">{value:.3f}</text>')
    threshold_x = left + chart_width * 0.8
    parts.append(f'<line x1="{threshold_x:.1f}" y1="82" x2="{threshold_x:.1f}" y2="326" stroke="#111827" stroke-dasharray="5 4"/>')
    parts.append(f'<text x="{threshold_x:.1f}" y="374" text-anchor="middle" class="axis">target 0.80</text>')
    parts.append("</svg>\n")
    return "\n".join(parts)


def main() -> None:
    multi = json.loads(MULTI_INPUT.read_text(encoding="utf-8"))
    source = json.loads(SOURCE_INPUT.read_text(encoding="utf-8"))

    task_pipelines: dict[str, set[str]] = defaultdict(set)
    for pair in multi["pairMatrix"]:
        task_pipelines[pair["key"]].add(pair["pipeline"])

    agentdojo_multiplicity = Counter(len(pipelines) for pipelines in task_pipelines.values())
    chaos_controls = [
        row for row in source["agentchaosbench"]["artifacts"] if row["condition"] == "control"
    ]
    pipelines = sorted(multi["byPipeline"])

    selection_ranges = {pipeline: [math.inf, -math.inf] for pipeline in pipelines}
    for order in itertools.permutations(pipelines):
        rank = {pipeline: index for index, pipeline in enumerate(order)}
        selected = Counter(
            min(cluster_pipelines, key=lambda pipeline: rank[pipeline])
            for cluster_pipelines in task_pipelines.values()
        )
        for pipeline in pipelines:
            selection_ranges[pipeline][0] = min(selection_ranges[pipeline][0], selected[pipeline])
            selection_ranges[pipeline][1] = max(selection_ranges[pipeline][1], selected[pipeline])

    agentdojo_physical = sum(len(x) for x in task_pipelines.values())
    agentdojo_clusters = len(task_pipelines)
    chaos_singletons = len(chaos_controls)
    physical_total = agentdojo_physical + chaos_singletons
    cluster_total = agentdojo_clusters + chaos_singletons
    cluster_sizes = [len(x) for x in task_pipelines.values()] + [1] * chaos_singletons
    correlated_pairs = sum(size * (size - 1) for size in cluster_sizes)
    cluster_gap = REQUIRED_INDEPENDENT_UNITS - cluster_total

    icc_rows = []
    for rho in ICC_GRID:
        effective_n = physical_total**2 / (physical_total + rho * correlated_pairs)
        plug_in_n = math.floor(effective_n)
        icc_rows.append(
            {
                "icc": rho,
                "effectiveN": effective_n,
                "floorEffectiveN": plug_in_n,
                "heuristicPowerAtFloorEffectiveN": power_row(plug_in_n),
            }
        )
    icc_at_effective_n_181 = (
        physical_total**2 / REQUIRED_INDEPENDENT_UNITS - physical_total
    ) / correlated_pairs

    checkpoints = {
        str(n): power_row(n)
        for n in (agentdojo_clusters, cluster_total, REQUIRED_INDEPENDENT_UNITS, physical_total)
    }
    result = {
        "schemaVersion": "p26-002-cluster-unit-sensitivity-0.1.0",
        "createdOn": "2026-09-09",
        "status": "sensitivity-only-no-outcomes-no-method-freeze",
        "parentHead": "07a5ec2580fb2b35857e1611de01d457f52465a2",
        "inputs": {
            str(MULTI_INPUT.relative_to(ROOT.parents[2])): sha256(MULTI_INPUT),
            str(SOURCE_INPUT.relative_to(ROOT.parents[2])): sha256(SOURCE_INPUT),
        },
        "observedStructure": {
            "agentdojoPhysicalPairCandidates": agentdojo_physical,
            "agentdojoSourceTaskClusters": agentdojo_clusters,
            "agentchaosbenchSingletonControlClusters": chaos_singletons,
            "nominalPhysicalPairCandidates": physical_total,
            "sourceTaskClusters": cluster_total,
            "additionalIndependentClustersNeededForN181": cluster_gap,
            "clusterSizeDistribution": dict(sorted(Counter(cluster_sizes).items())),
            "sumMtimesMminus1": correlated_pairs,
        },
        "pipelinePrioritySensitivity": {
            "ordersEnumerated": math.factorial(len(pipelines)),
            "priorityInvariantSinglePipelineClusters": agentdojo_multiplicity[1],
            "priorityDependentMultiPipelineClusters": agentdojo_clusters - agentdojo_multiplicity[1],
            "agentdojoMultiplicityDistribution": dict(sorted(agentdojo_multiplicity.items())),
            "representativeCountRangeAcrossOrders": {
                pipeline: {"minimum": int(bounds[0]), "maximum": int(bounds[1])}
                for pipeline, bounds in selection_ranges.items()
            },
            "interpretation": "All priority orders retain 87 AgentDojo task clusters, but 72 cluster representatives depend on the pipeline order. No order is selected here.",
        },
        "independentClusterSensitivity": {
            "assumption": "One independent Bernoulli fault/control pair per source-task cluster, with the physical-unit planning probabilities transported unchanged.",
            "checkpoints": checkpoints,
            "result": "At 112 clusters the co-primary joint-power lower bound is below 0.80; 69 additional independent clusters are required to reach the previously derived n=181 boundary under the transported assumptions.",
        },
        "physicalWeightIccSensitivity": {
            "formula": "N_eff = (sum m)^2 / sum[m + rho*m*(m-1)] for an equally weighted physical-execution mean under exchangeable within-cluster correlation",
            "iccAtWhichEffectiveNEquals181": icc_at_effective_n_181,
            "rows": icc_rows,
            "warning": "Effective-N plug-in power is diagnostic only. It is not a valid clustered binary test, does not repair the non-monotone exact safety boundary, and cannot select an ICC before outcomes exist.",
        },
        "decision": {
            "machineDisposition": "FREE_FIXED_CORPUS_NOT_CONFIRMATORY_AT_CONTENT_CLUSTER_LEVEL",
            "registeredFrameChanged": False,
            "methodFrozen": False,
            "mainTrialEvidenceCreated": False,
            "mainTrialAllowed": False,
            "releaseAllowed": False,
            "submissionAllowed": False,
        },
        "limitations": [
            "The 112-cluster power calculation transports physical-unit discordance probabilities to a different estimand and is therefore a sensitivity analysis, not evidence that those probabilities hold by task cluster.",
            "AgentChaosBench no-fault artifact identities and AgentDojo suite/user-task keys are structurally different cluster definitions.",
            "Pipeline availability is not uniform across AgentDojo tasks, and 72 of 87 representative choices change with pipeline priority.",
            "No AgentTrial outcome or within-task intraclass correlation was observed, so a mixed-effects or generalized estimating equation power model cannot yet be identified from study data.",
        ],
    }

    md = f"""# P26-002 source-task cluster sensitivity

Status: sensitivity only; no method freeze or trial evidence  
Date: 2026-09-09  
Parent PR head: `07a5ec2580fb2b35857e1611de01d457f52465a2`

## Question

Can the 281 nominal physical fault/control candidates support the n=181 design after repeated AgentDojo tasks across model pipelines are treated as dependent content clusters?

## Main result

No, not under a conservative one-pair-per-content-cluster route. The 256 AgentDojo physical candidates collapse to **{agentdojo_clusters} suite/user-task clusters**. Treating the **{chaos_singletons} distinct AgentChaosBench no-fault control artifacts** as singleton clusters gives **{cluster_total} source-task clusters**, leaving **{cluster_gap} additional independent clusters** below n={REQUIRED_INDEPENDENT_UNITS}.

If the physical-unit planning probabilities are transported unchanged to one independent Bernoulli pair per cluster, n={cluster_total} gives benefit power **{checkpoints[str(cluster_total)]['benefitPower']:.6f}**, safety power **{checkpoints[str(cluster_total)]['safetyPower']:.6f}**, and a correlation-agnostic co-primary joint lower bound of **{checkpoints[str(cluster_total)]['jointLowerBound']:.6f}**. This is far below 0.80. The calculation is an estimand sensitivity, not a claim that task-cluster event probabilities equal the earlier physical-unit assumptions.

| Unit interpretation | n | Benefit power | Safety power | Joint lower bound |
|---|---:|---:|---:|---:|
| AgentDojo task clusters only | {agentdojo_clusters} | {checkpoints[str(agentdojo_clusters)]['benefitPower']:.6f} | {checkpoints[str(agentdojo_clusters)]['safetyPower']:.6f} | {checkpoints[str(agentdojo_clusters)]['jointLowerBound']:.6f} |
| All source-task clusters | {cluster_total} | {checkpoints[str(cluster_total)]['benefitPower']:.6f} | {checkpoints[str(cluster_total)]['safetyPower']:.6f} | {checkpoints[str(cluster_total)]['jointLowerBound']:.6f} |
| Previous independent-pair boundary | {REQUIRED_INDEPENDENT_UNITS} | {checkpoints[str(REQUIRED_INDEPENDENT_UNITS)]['benefitPower']:.6f} | {checkpoints[str(REQUIRED_INDEPENDENT_UNITS)]['safetyPower']:.6f} | {checkpoints[str(REQUIRED_INDEPENDENT_UNITS)]['jointLowerBound']:.6f} |
| Naive physical count | {physical_total} | {checkpoints[str(physical_total)]['benefitPower']:.6f} | {checkpoints[str(physical_total)]['safetyPower']:.6f} | {checkpoints[str(physical_total)]['jointLowerBound']:.6f} |

The naive n={physical_total} row is displayed only to quantify the pseudoreplication gap. It is not an admissible analysis.

## Pipeline-priority sensitivity

All {math.factorial(len(pipelines))} orders of the five pipeline names were enumerated. Exactly {agentdojo_multiplicity[1]} AgentDojo clusters occur in one pipeline and are priority invariant; the representative for the other **{agentdojo_clusters - agentdojo_multiplicity[1]} clusters** changes with pipeline priority. The number assigned to any one pipeline ranges from {min(x[0] for x in selection_ranges.values())} to {max(x[1] for x in selection_ranges.values())}. No priority order is selected because doing so after published upstream outcomes are visible would add another post-hoc degree of freedom.

## ICC diagnostic

For an equally weighted physical-execution mean, the observed cluster sizes give `sum m(m-1)={correlated_pairs}`. The design-effect identity places effective n at 181 when the exchangeable within-task ICC is approximately **{icc_at_effective_n_181:.6f}**. This is not a validity threshold: the exact safety acceptance boundary is discrete and non-monotone, the ICC is unobserved, and effective-n substitution is not a clustered binary test.

The diagnostic therefore does not rescue the 281-row analysis. A physical-execution estimand would require a prospectively frozen pipeline population and a cluster-aware analysis contract; a task-cluster estimand requires at least {cluster_gap} additional independent clusters under the current transported planning assumptions.

## Governance boundary

No evaluator was run, no trial outcome or ICC was observed, no representative pipeline order was selected, and no human review was created. The registered frame is unchanged. `mainTrialAllowed=false`, `releaseAllowed=false`, and `submissionAllowed=false`.
"""

    figure_rows = [
        {"label": f"task clusters (n={cluster_total})", **checkpoints[str(cluster_total)]},
        {"label": f"design boundary (n={REQUIRED_INDEPENDENT_UNITS})", **checkpoints[str(REQUIRED_INDEPENDENT_UNITS)]},
        {"label": f"naive physical (n={physical_total})", **checkpoints[str(physical_total)]},
    ]
    OUT_JSON.write_text(canonical_json(result), encoding="utf-8")
    OUT_MD.write_text(md, encoding="utf-8")
    OUT_SVG.write_text(render_svg(figure_rows), encoding="utf-8")
    format_files(OUT_JSON, OUT_MD)

    checks = {
        "agentdojoPhysicalCandidates": agentdojo_physical == 256,
        "agentdojoTaskClusters": agentdojo_clusters == 87,
        "agentchaosSingletonClusters": chaos_singletons == 25,
        "combinedPhysicalCandidates": physical_total == 281,
        "combinedTaskClusters": cluster_total == 112,
        "clusterGap": cluster_gap == 69,
        "priorityOrders": math.factorial(len(pipelines)) == 120,
        "priorityInvariantClusters": agentdojo_multiplicity[1] == 15,
        "priorityDependentClusters": agentdojo_clusters - agentdojo_multiplicity[1] == 72,
        "sumMtimesMminus1": correlated_pairs == 646,
        "clusterJointPowerBelowTarget": checkpoints["112"]["jointLowerBound"] < 0.80,
        "n181JointPowerMeetsTarget": checkpoints["181"]["jointLowerBound"] >= 0.80,
        "noReadinessPromotion": result["decision"]["mainTrialAllowed"] is False,
        "noSubmissionPromotion": result["decision"]["submissionAllowed"] is False,
    }
    validation = {
        "schemaVersion": "p26-002-cluster-unit-sensitivity-validation-0.1.0",
        "status": "passed" if all(checks.values()) else "failed",
        "checks": checks,
        "inputSha256": result["inputs"],
        "outputSha256": {
            OUT_JSON.name: sha256(OUT_JSON),
            OUT_MD.name: sha256(OUT_MD),
            OUT_SVG.name: sha256(OUT_SVG),
        },
    }
    VALIDATION.write_text(canonical_json(validation), encoding="utf-8")
    format_files(VALIDATION)
    if validation["status"] != "passed":
        raise SystemExit("validation failed")


if __name__ == "__main__":
    main()
