#!/usr/bin/env python3
"""Build the P26-002 multi-pipeline fixed-corpus and dependence audit."""
from __future__ import annotations

import hashlib
import json
import subprocess
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PRIOR_DIR = ROOT.parent / "source-expansion-feasibility-2026-09-09"
PRIOR_RESULT = PRIOR_DIR / "source_expansion_feasibility.json"
PRIOR_SNAPSHOT = PRIOR_DIR / "source_expansion_snapshot.json"
PIPELINE_FILES = [
    ROOT / "pipeline_gpt-4-0125-preview.json",
    ROOT / "pipeline_gpt-4o-2024-05-13.json",
    ROOT / "pipeline_claude-3-5-sonnet-20240620.json",
    ROOT / "pipeline_gpt-4-turbo-2024-04-09.json",
]
OUT_JSON = ROOT / "multi_pipeline_feasibility.json"
OUT_MD = ROOT / "multi_pipeline_feasibility.md"
VALIDATION = ROOT / "validation.json"


def canonical_json(value: object) -> str:
    return json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def format_markdown(path: Path) -> None:
    """Apply the repository-pinned formatter before recording artifact hashes."""
    subprocess.run(
        ["npx", "--no-install", "prettier@3.6.2", "--write", str(path)],
        check=True,
        cwd=ROOT.parents[2],
    )


def command_r_plus_from_prior() -> dict:
    snap = json.loads(PRIOR_SNAPSHOT.read_text(encoding="utf-8"))
    controls = snap["agentdojo"]["controlsAssessed"]
    attacks = snap["agentdojo"]["importantInstructionsRunsAssessedForEligibleControls"]
    eligible = [
        x for x in controls
        if x["utility"] is True and x["security"] is True and x["error"] is None
    ]
    faults = [x for x in attacks if x["security"] is False and x["error"] is None]
    by_key: dict[str, list[dict]] = {}
    for fault in faults:
        by_key.setdefault(fault["key"], []).append(fault)
    pairs = []
    for control in eligible:
        if control["key"] not in by_key:
            continue
        witnesses = sorted(by_key[control["key"]], key=lambda x: x["path"])
        witness = witnesses[0]
        pairs.append({
            "pipeline": "command-r-plus",
            "key": control["key"],
            "suite": control["suite"],
            "userTaskId": control["userTaskId"],
            "path": control["path"],
            "gitBlobSha": control["gitBlobSha"],
            "size": control["size"],
            "durationSeconds": control["durationSeconds"],
            "eligiblePublishedFaultArtifacts": len(witnesses),
            "faultWitnessPath": witness["path"],
            "faultWitnessGitBlobSha": witness["gitBlobSha"],
            "faultWitnessSize": witness["size"],
            "faultWitnessInjectionTaskId": witness["injectionTaskId"],
        })
    return {
        "pipeline": "command-r-plus",
        "controlsAssessed": len(controls),
        "qualifyingControls": len(eligible),
        "attacksAssessed": len(attacks),
        "qualifyingFaultArtifacts": len(faults),
        "pairableControls": len(pairs),
        "pairs": sorted(pairs, key=lambda x: x["key"]),
    }


def main() -> None:
    prior = json.loads(PRIOR_RESULT.read_text(encoding="utf-8"))
    pipelines = [command_r_plus_from_prior()] + [
        json.loads(path.read_text(encoding="utf-8")) for path in PIPELINE_FILES
    ]
    all_pairs = [
        {**pair, "pipeline": pipeline["pipeline"]}
        for pipeline in pipelines
        for pair in pipeline["pairs"]
    ]
    pipeline_sets = {
        pipeline["pipeline"]: {pair["key"] for pair in pipeline["pairs"]}
        for pipeline in pipelines
    }
    task_counts = Counter(pair["key"] for pair in all_pairs)
    task_clusters = set(task_counts)
    chaos_controls = prior["agentchaosbench"]["controlArtifacts"]
    required = prior["confirmatoryRequirement"]["pairedUniqueExecutionIdentities"]

    physical_agentdojo = len(all_pairs)
    physical_combined = physical_agentdojo + chaos_controls
    task_cluster_combined = len(task_clusters) + chaos_controls
    multiplicity = Counter(task_counts.values())

    overlap = {}
    names = [pipeline["pipeline"] for pipeline in pipelines]
    for left in names:
        overlap[left] = {
            right: len(pipeline_sets[left] & pipeline_sets[right])
            for right in names
        }

    by_pipeline = {
        pipeline["pipeline"]: {
            "controlsAssessed": pipeline["controlsAssessed"],
            "qualifyingControls": pipeline["qualifyingControls"],
            "attacksAssessed": pipeline["attacksAssessed"],
            "qualifyingFaultArtifacts": pipeline["qualifyingFaultArtifacts"],
            "pairablePhysicalControlExecutions": pipeline["pairableControls"],
            "uniqueSourceTaskKeys": len(pipeline_sets[pipeline["pipeline"]]),
        }
        for pipeline in pipelines
    }

    result = {
        "schemaVersion": "p26-002-multi-pipeline-fixed-corpus-feasibility-0.1.0",
        "status": "nominal-physical-count-feasible-cluster-validity-unresolved",
        "scope": "post-hoc-source-and-dependence-feasibility-not-main-trial-evidence",
        "createdOn": "2026-09-09",
        "parentStudyCommit": "f38d0e3f2821caab3e22b3810b9bf0e669f4909f",
        "sourceRevision": "ethz-spylab/agentdojo@089ed468cf3ed0322acc66b0211f26d9d90dbf60",
        "inputSha256": {
            path.name: sha256(path)
            for path in [PRIOR_RESULT, PRIOR_SNAPSHOT, *PIPELINE_FILES]
        },
        "selectionDisclosure": (
            "command-r-plus is the registered context. The four additional pipelines "
            "were purposefully selected after published aggregate results were visible "
            "to test whether the archive can numerically cross n=181; this is not a "
            "random or prospective pipeline sample."
        ),
        "requirement": {
            "exactDesignPhysicalPairs": required,
            "fivePipelineAgentDojoPhysicalPairs": physical_agentdojo,
            "plusAgentChaosPhysicalPairs": physical_combined,
            "nominalPhysicalSurplus": physical_combined - required,
            "uniqueAgentDojoSuiteUserTaskClusters": len(task_clusters),
            "uniqueSourceTaskClustersIncludingAgentChaos": task_cluster_combined,
            "sourceTaskClusterShortfall": required - task_cluster_combined,
        },
        "byPipeline": by_pipeline,
        "agentdojoDependence": {
            "pairablePhysicalExecutions": physical_agentdojo,
            "uniqueSuiteUserTaskClusters": len(task_clusters),
            "meanExecutionsPerTaskCluster": physical_agentdojo / len(task_clusters),
            "clusterMultiplicity": {
                str(multiplicity_value): count
                for multiplicity_value, count in sorted(multiplicity.items())
            },
            "pipelineTaskOverlapMatrix": overlap,
        },
        "decision": {
            "registeredFrameChanged": False,
            "mainTrialEvidenceCreated": False,
            "mainTrialAllowed": False,
            "submissionAllowed": False,
            "finding": (
                "A no-cost fixed corpus can cross 181 physical pairs only by adding "
                "four model pipelines and repeatedly instantiating the same AgentDojo tasks."
            ),
            "machineDisposition": (
                "NUMERICALLY_FEASIBLE_ONLY_UNDER_MULTI_PIPELINE_PHYSICAL_EXECUTION_UNIT; "
                "EXACT_POWER_NOT_TRANSPORTABLE_UNTIL_CLUSTERING_AND_PIPELINE_SCOPE_ARE_FROZEN"
            ),
        },
        "limitations": [
            "The five pipelines share suite/user-task content, so 256 AgentDojo executions collapse to fewer source-task clusters and may be correlated.",
            "The exact n=181 design did not quantify dependence induced by reusing the same task across models.",
            "AgentChaosBench and AgentDojo instantiate different fault mechanisms and cannot be assumed exchangeable.",
            "All eligibility fields are upstream published outcomes; no AgentTrial evaluator was run and no efficacy result was observed.",
            "Only five of the 29 archived run directories were inspected; the audit answers a feasibility question, not archive-wide prevalence.",
        ],
        "pairMatrix": all_pairs,
    }

    md = f"""# P26-002 multi-pipeline fixed-corpus feasibility and dependence audit

Status: nominal physical count feasible; cluster validity unresolved  
Date: 2026-09-09  
Parent study commit: `f38d0e3f2821caab3e22b3810b9bf0e669f4909f`

## Question

Can a zero-cost retrospective fixed corpus reach the exact-design target of {required} unique physical fault/control execution pairs by extending AgentDojo beyond the registered `command-r-plus` pipeline, and what dependence is introduced by repeating the same source tasks across models?

## Result

Across five pinned AgentDojo pipelines, the audit assessed **{sum(p["controlsAssessed"] for p in pipelines)} no-attack executions** and **{sum(p["attacksAssessed"] for p in pipelines)} attack executions** attached to qualifying controls. It found **{physical_agentdojo} physical control executions** with at least one published security-failure witness. Adding the **{chaos_controls}** distinct AgentChaosBench no-fault executions gives a nominal ceiling of **{physical_combined} physical pairs**, which exceeds {required} by **{physical_combined-required}**.

That numerical success depends on repeatedly instantiating the same AgentDojo task under different model pipelines. The {physical_agentdojo} AgentDojo executions represent only **{len(task_clusters)} distinct suite/user-task keys**. Even after adding the {chaos_controls} AgentChaosBench control identities, the content-level ceiling is **{task_cluster_combined} source-task clusters**, **{required-task_cluster_combined} below** the n={required} target.

## Pipeline counts

| Pipeline | Controls assessed | Qualifying controls | Attacks assessed | Security-failure artifacts | Pairable physical controls |
|---|---:|---:|---:|---:|---:|
"""
    for name, values in by_pipeline.items():
        md += (
            f"| {name} | {values['controlsAssessed']} | "
            f"{values['qualifyingControls']} | {values['attacksAssessed']} | "
            f"{values['qualifyingFaultArtifacts']} | "
            f"{values['pairablePhysicalControlExecutions']} |\n"
        )
    md += f"""| **AgentDojo total** | **{sum(v['controlsAssessed'] for v in by_pipeline.values())}** | **{sum(v['qualifyingControls'] for v in by_pipeline.values())}** | **{sum(v['attacksAssessed'] for v in by_pipeline.values())}** | **{sum(v['qualifyingFaultArtifacts'] for v in by_pipeline.values())}** | **{physical_agentdojo}** |

## Dependence result

Mean AgentDojo multiplicity is **{physical_agentdojo/len(task_clusters):.3f} executions per source-task cluster**. Cluster multiplicities are {", ".join(f"{count} task(s) observed in {mult} pipeline(s)" for mult, count in sorted(multiplicity.items()))}. The extra model executions are real physical artifacts but not new task content. Treating all {physical_agentdojo} as independent would ignore shared prompts, tools, policies, and ground-truth functions.

The current exact power result can be transported to this corpus only after a prospective amendment freezes the multi-pipeline target population and a dependence model. A task-cluster analysis has at most {task_cluster_combined} clusters in these two archives and cannot inherit the n={required} independent-pair calculation.

## Retrospective boundary

`command-r-plus` is the registered pipeline. The other four pipelines were purposefully selected after aggregate upstream results were visible to test numerical feasibility. The selection did not use AgentTrial outcomes because no AgentTrial evaluator was run, but it is still post-hoc source-frame construction. This audit is not a confirmatory cohort, independent review, construct approval, or trial evidence.

No trajectory or prompt payload is stored. The snapshots record public path/blob witnesses, counts, and upstream eligibility fields. The registered 80-target frame and all gates remain unchanged.

## Decision

A free fixed-corpus route is **numerically possible at the physical-execution level** ({physical_combined} candidate pairs) but not scientifically ready. The next admissible design decision is between:

1. a prospectively frozen multi-pipeline physical-execution estimand with task-cluster-aware inference; or
2. a source-task-cluster estimand with a new power calculation and additional task sources.

Until one route is independently approved, these {physical_combined} candidates must not be called a powered sample and `mainTrialAllowed=false`.
"""
    OUT_JSON.write_text(canonical_json(result), encoding="utf-8")
    OUT_MD.write_text(md, encoding="utf-8")
    format_markdown(OUT_MD)

    checks = {
        "pipelineCount": len(pipelines) == 5,
        "controlsAssessed": sum(p["controlsAssessed"] for p in pipelines) == 485,
        "commandRPlusReproducesPrior": by_pipeline["command-r-plus"]["pairablePhysicalControlExecutions"] == 23,
        "physicalPairsAgentDojo": physical_agentdojo == 256,
        "physicalPairsCombined": physical_combined == 281,
        "physicalTargetCrossed": physical_combined >= required,
        "taskClustersBelowPhysicalPairs": len(task_clusters) < physical_agentdojo,
        "taskClusterTargetNotAssumed": task_cluster_combined < required,
        "noFrameChange": result["decision"]["registeredFrameChanged"] is False,
        "noTrialPromotion": result["decision"]["mainTrialAllowed"] is False,
        "noSubmissionPromotion": result["decision"]["submissionAllowed"] is False,
    }
    validation = {
        "schemaVersion": "p26-002-multi-pipeline-validation-0.1.0",
        "status": "passed" if all(checks.values()) else "failed",
        "checks": checks,
        "inputSha256": result["inputSha256"],
        "outputSha256": {
            OUT_JSON.name: sha256(OUT_JSON),
            OUT_MD.name: sha256(OUT_MD),
        },
    }
    VALIDATION.write_text(canonical_json(validation), encoding="utf-8")
    if validation["status"] != "passed":
        raise SystemExit("validation failed")


if __name__ == "__main__":
    main()
