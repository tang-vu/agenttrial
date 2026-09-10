#!/usr/bin/env python3
"""Build the P26-002 A3S-Bench source-expansion feasibility packet."""
from __future__ import annotations

import hashlib
import json
import math
import subprocess
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "source_observation.json"
OUT_JSON = ROOT / "a3s_source_expansion.json"
OUT_MD = ROOT / "a3s_source_expansion.md"
OUT_SVG = ROOT / "a3s_source_frame.svg"
VALIDATION = ROOT / "validation.json"

TARGET_ADDITIONAL_CLUSTERS = 69
EXISTING_CLUSTERS = 112
CONFIRMATORY_TARGET = 181
SALT = "p26-002-a3s-candidate-frame-v1"


def canonical_json(value: object) -> str:
    return json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_path(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def rank(row: dict) -> str:
    payload = f"{SALT}|{row['seed_id']}|{row['variant_id']}".encode()
    return sha256_bytes(payload)


def largest_remainder_quotas(counts: Counter, target: int) -> dict[str, int]:
    total = sum(counts.values())
    exact = {key: target * count / total for key, count in counts.items()}
    quotas = {key: math.floor(value) for key, value in exact.items()}
    remaining = target - sum(quotas.values())
    order = sorted(counts, key=lambda key: (-(exact[key] - quotas[key]), key))
    for key in order[:remaining]:
        quotas[key] += 1
    return dict(sorted(quotas.items()))


def select(candidates: list[dict]) -> tuple[list[dict], list[dict], dict[str, int]]:
    scenario_counts = Counter(row["scenario"] for row in candidates)
    quotas = largest_remainder_quotas(scenario_counts, TARGET_ADDITIONAL_CLUSTERS)
    ranked = sorted(candidates, key=lambda row: (rank(row), row["seed_id"], row["variant_id"]))
    selected: list[dict] = []
    used: set[str] = set()
    used_by_scenario: Counter = Counter()

    # Coverage first: keep every risk category represented without using outcomes.
    risk_counts = Counter(row["risk_category"] for row in candidates)
    for risk in sorted(risk_counts, key=lambda key: (risk_counts[key], key)):
        choice = next(
            row
            for row in ranked
            if row["risk_category"] == risk
            and row["seed_id"] not in used
            and used_by_scenario[row["scenario"]] < quotas[row["scenario"]]
        )
        selected.append(choice)
        used.add(choice["seed_id"])
        used_by_scenario[choice["scenario"]] += 1

    # Fill each scenario quota by source-bound hash rank.
    for scenario in sorted(quotas):
        for row in ranked:
            if used_by_scenario[scenario] >= quotas[scenario]:
                break
            if row["scenario"] == scenario and row["seed_id"] not in used:
                selected.append(row)
                used.add(row["seed_id"])
                used_by_scenario[scenario] += 1

    selected = sorted(selected, key=lambda row: row["seed_id"])
    reserve = sorted(
        (row for row in candidates if row["seed_id"] not in used),
        key=lambda row: row["seed_id"],
    )
    return selected, reserve, quotas


def histogram(rows: list[dict], key: str) -> dict[str, int]:
    return dict(sorted(Counter(row[key] for row in rows).items()))


def render_svg(eligible: int, selected: int) -> str:
    width, height = 820, 330
    scale = 2.25
    x0 = 150
    existing_w = EXISTING_CLUSTERS * scale
    selected_w = selected * scale
    eligible_w = eligible * scale
    return "\n".join(
        [
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
            '<rect width="100%" height="100%" fill="#ffffff"/>',
            '<style>text{font-family:Arial,sans-serif;fill:#172033}.title{font-size:20px;font-weight:700}.label{font-size:14px}.small{font-size:12px;fill:#4b5563}.value{font-size:14px;font-weight:700}</style>',
            '<text x="28" y="34" class="title">P26-002 candidate source-task expansion</text>',
            '<text x="28" y="57" class="small">Counts are task clusters, not executed observations</text>',
            '<text x="28" y="105" class="label">Design frame</text>',
            f'<rect x="{x0}" y="84" width="{existing_w:.1f}" height="34" rx="4" fill="#5276c3"/>',
            f'<rect x="{x0 + existing_w:.1f}" y="84" width="{selected_w:.1f}" height="34" rx="4" fill="#d07a41"/>',
            f'<text x="{x0 + existing_w / 2:.1f}" y="106" text-anchor="middle" fill="#fff" class="value">112 existing</text>',
            f'<text x="{x0 + existing_w + selected_w / 2:.1f}" y="106" text-anchor="middle" fill="#fff" class="value">69 candidate</text>',
            f'<text x="{x0 + existing_w + selected_w + 10:.1f}" y="106" class="value">= 181</text>',
            '<text x="28" y="175" class="label">A3S eligible</text>',
            f'<rect x="{x0}" y="154" width="{eligible_w:.1f}" height="34" rx="4" fill="#4f9c78"/>',
            f'<text x="{x0 + eligible_w / 2:.1f}" y="176" text-anchor="middle" fill="#fff" class="value">{eligible} linked, non-null clusters</text>',
            f'<line x1="{x0 + selected_w:.1f}" y1="146" x2="{x0 + selected_w:.1f}" y2="202" stroke="#111827" stroke-dasharray="5 4"/>',
            f'<text x="{x0 + selected_w:.1f}" y="220" text-anchor="middle" class="small">69 frozen candidates</text>',
            '<text x="28" y="266" class="small">Frame sufficiency does not imply construct validity, successful execution, outcome evidence, or power.</text>',
            '<text x="28" y="288" class="small">A3S source rows: 1,150; arXiv v2 reports 2,254 test cases. The version discrepancy remains unresolved.</text>',
            '</svg>',
            '',
        ]
    )


def build() -> tuple[dict, str, str, dict]:
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    candidates = source["candidates"]
    selected, reserve, quotas = select(candidates)
    selected_ids = [f"{row['seed_id']}:{row['variant_id']}" for row in selected]
    result = {
        "schemaVersion": "p26-002-a3s-source-expansion-feasibility-0.1.0",
        "createdOn": "2026-09-09",
        "status": "candidate-source-frame-frozen-inactive-pending-method-construct-and-execution-gates",
        "parentHead": "af93adc92c85edcb4bed8273aa0e940c9d3e2563",
        "input": {
            "path": str(SOURCE.relative_to(ROOT.parents[2])),
            "sha256": sha256_path(SOURCE),
            "sourceCommit": source["source"]["commit_sha"],
            "seedBlob": source["source"]["seeds"]["git_blob_sha"],
            "injectedBlob": source["source"]["injected"]["git_blob_sha"],
        },
        "sourceAudit": source["observed"],
        "eligibilityPolicy": source["eligibility_policy"],
        "candidateFrame": {
            "eligibleClusters": len(candidates),
            "neededClusters": TARGET_ADDITIONAL_CLUSTERS,
            "selectedClusters": len(selected),
            "reserveClusters": len(reserve),
            "selectionSalt": SALT,
            "selectionRule": "Coverage-first one case per risk category, then SHA-256 rank within proportional scenario quotas; no model output or benchmark outcome used.",
            "scenarioQuotas": quotas,
            "selectedByScenario": histogram(selected, "scenario"),
            "selectedByRisk": histogram(selected, "risk_category"),
            "selectedBySourceModel": histogram(selected, "source_model"),
            "selectedPairIdsSha256": sha256_bytes(("\n".join(selected_ids) + "\n").encode()),
            "selected": selected,
            "reservePairIds": [f"{row['seed_id']}:{row['variant_id']}" for row in reserve],
        },
        "designConsequence": {
            "existingSourceTaskClusters": EXISTING_CLUSTERS,
            "candidateAdditionalClusters": len(selected),
            "candidateFrameTotal": EXISTING_CLUSTERS + len(selected),
            "confirmatoryTarget": CONFIRMATORY_TARGET,
            "contentFrameCanReachTarget": EXISTING_CLUSTERS + len(selected) >= CONFIRMATORY_TARGET,
            "executionEvidenceCreated": False,
            "powerClaimCreated": False,
            "interpretation": "The public source can close the 69-cluster content-frame gap if the 69 frozen pairs later pass construct review and produce one unique fault and control execution each. It does not close the execution or outcome-evidence gap.",
        },
        "versionDiscrepancy": {
            "repositoryRowsAtPinnedCommit": source["observed"]["repo_total_rows"],
            "paperV2ReportedTestCases": source["source"]["paper"]["reported_test_cases"],
            "difference": source["observed"]["paper_repo_row_difference"],
            "resolution": "unresolved; analyses must cite the pinned repository snapshot rather than silently use the paper total",
        },
        "retrospectiveChangeLog": [
            "Adds A3S-Bench as an inactive candidate source frame after the previous cluster analysis found a 69-cluster gap.",
            "Does not replace the registered 80-pair frame, the n=181 planning calculation, or any historical protocol record.",
            "Uses only public identifiers and structural fields; raw prompts, setup commands, trajectories, model outputs, and private data are not copied.",
            "Keeps the source-paper count discrepancy explicit and keeps all activation, review, execution, release, and submission gates closed.",
        ],
        "gates": {
            "candidateSourceFrameFrozen": True,
            "candidateSourceActivated": False,
            "constructMappingsApproved": 0,
            "independentMethodReviewComplete": False,
            "runnableJobs": 0,
            "scheduledJobs": 0,
            "executedJobs": 0,
            "mainTrialAllowed": False,
            "releaseAllowed": False,
            "submissionAllowed": False,
        },
        "limitations": [
            "A3S seeds and attacks are generated benchmark inputs, not AgentTrial execution artifacts or validated trial outcomes.",
            "The selected frame is source-structure complete only; construct compatibility with final-output-only and AgentTrial remains unreviewed.",
            "A3S uses multi-turn, action-grounded evaluation, so transporting the earlier physical-pair event probabilities would be an unvalidated assumption.",
            "The source snapshot has 1,150 rows while arXiv v2 reports 2,254 test cases; completeness and version lineage are unresolved.",
            "Public source availability does not guarantee a zero-cost target-agent execution path or eliminate governance requirements.",
        ],
    }

    md = f"""# P26-002 A3S-Bench source-expansion feasibility

Status: inactive candidate source frame; no trial evidence  
Date: 2026-09-09  
Parent PR head: `af93adc92c85edcb4bed8273aa0e940c9d3e2563`

## Result

The pinned public A3S-Bench repository contains **{source['observed']['seeds']} benign seeds** and **{source['observed']['injected']} injected variants**. All injected rows reference an existing seed; {source['observed']['linked_seed_clusters']} seed clusters have at least one injected variant. Restricting the machine source audit to clusters with no null `tool_response` in either the seed or the chosen injected variant leaves **{len(candidates)} candidate source-task clusters**.

The previous P26-002 dependence audit found 112 existing source-task clusters and a 69-cluster gap to the n=181 planning boundary. This packet freezes **{len(selected)} A3S seed–variant pairs** selected without model outputs or benchmark outcomes. If every frozen pair later passes construct review and yields one unique control and one unique fault execution, the content frame would reach **{EXISTING_CLUSTERS} + {len(selected)} = {EXISTING_CLUSTERS + len(selected)} clusters**. This is frame feasibility, not execution evidence or achieved power.

| Source-frame stage | Clusters |
| --- | ---: |
| Existing AgentDojo + AgentChaosBench clusters | {EXISTING_CLUSTERS} |
| A3S eligible linked, non-null clusters | {len(candidates)} |
| Frozen A3S candidate pairs | {len(selected)} |
| Candidate combined frame | {EXISTING_CLUSTERS + len(selected)} |
| Unused A3S reserve | {len(reserve)} |

## Prospective selection

Selection uses only pinned source structure. It first assigns proportional quotas across the six scenarios, selects one hash-ranked pair for every observed risk category, and fills each scenario quota by SHA-256 rank over `seed_id:variant_id` with salt `{SALT}`. The selected-pair ledger hash is `{result['candidateFrame']['selectedPairIdsSha256']}`.

| Scenario | Eligible | Selected |
| --- | ---: | ---: |
"""
    eligible_scenarios = Counter(row["scenario"] for row in candidates)
    for scenario in sorted(eligible_scenarios):
        md += f"| {scenario} | {eligible_scenarios[scenario]} | {result['candidateFrame']['selectedByScenario'][scenario]} |\n"
    md += "\nAll ten source risk categories and all three seed-generation models remain represented in the 69-pair candidate frame. One injected variant is bound per seed; repeated variants do not create additional clusters.\n"
    md += f"""

## Source-version finding

The pinned repository has **{source['observed']['repo_total_rows']} rows** ({source['observed']['seeds']} seeds plus {source['observed']['injected']} injected variants), whereas arXiv v2 reports **{source['source']['paper']['reported_test_cases']} executable test cases**. The **{source['observed']['paper_repo_row_difference']}-case difference is unresolved**. P26-002 therefore binds the exact repository commit and blob SHAs and does not substitute the paper total.

The stricter diagnostic requiring identical setup, turn count, tool-name sequence, unchanged non-injection turns, and no null tool responses retains {source['observed']['strict_exact_clusters_no_null']} clusters. That count also exceeds 69, but it covers only a narrower subset of perturbations; ASEval explicitly permits perturbations to add turns or change the initialized environment. The primary eligibility rule therefore uses explicit `seed_id` linkage and non-null scripted responses, with construct review still required.

## Scientific boundary

A3S-Bench is a candidate input source, not P26-002 outcome evidence. Its paper evaluates complete trajectories with an action-grounded oracle, while P26-002's primary comparator is final-output-only. No event probabilities, oracle agreement, or reported benchmark outcomes are transported into P26-002.

No target agent or judge was run, no human label or review was created, no private payload was uploaded, and no registered frame was overwritten. `candidateSourceActivated=false`, `mainTrialAllowed=false`, `releaseAllowed=false`, and `submissionAllowed=false`.
"""

    svg = render_svg(len(candidates), len(selected))
    checks = []

    def add(name: str, passed: bool) -> None:
        checks.append({"name": name, "passed": bool(passed)})

    add("source_unique_seed_ids", source["observed"]["unique_seed_ids"] == 424)
    add("source_unique_injected_ids", source["observed"]["unique_injected_ids"] == 726)
    add("source_no_orphan_links", source["observed"]["orphan_injected_seed_refs"] == [])
    add("source_count_discrepancy_preserved", source["observed"]["paper_repo_row_difference"] == 1104)
    add("eligible_cluster_count", len(candidates) == 201)
    add("selected_cluster_count", len(selected) == TARGET_ADDITIONAL_CLUSTERS)
    add("selected_seed_ids_unique", len({row["seed_id"] for row in selected}) == len(selected))
    add("selected_variant_ids_unique", len({row["variant_id"] for row in selected}) == len(selected))
    add("reserve_cluster_count", len(reserve) == len(candidates) - len(selected))
    add("selected_reserve_disjoint", not ({row["seed_id"] for row in selected} & {row["seed_id"] for row in reserve}))
    add("scenario_quotas_sum_to_target", sum(quotas.values()) == TARGET_ADDITIONAL_CLUSTERS)
    add("all_six_scenarios_represented", len(result["candidateFrame"]["selectedByScenario"]) == 6)
    add("all_ten_risks_represented", len(result["candidateFrame"]["selectedByRisk"]) == 10)
    add("all_three_source_models_represented", len(result["candidateFrame"]["selectedBySourceModel"]) == 3)
    add("candidate_frame_reaches_n181", result["designConsequence"]["candidateFrameTotal"] == CONFIRMATORY_TARGET)
    add("no_execution_evidence", result["designConsequence"]["executionEvidenceCreated"] is False)
    add("source_inactive", result["gates"]["candidateSourceActivated"] is False)
    add("all_trial_release_submission_gates_closed", not any(result["gates"][key] for key in ("mainTrialAllowed", "releaseAllowed", "submissionAllowed")))
    validation = {
        "schemaVersion": "p26-002-a3s-source-expansion-validation-0.1.0",
        "checks": checks,
        "passed": all(check["passed"] for check in checks),
        "passedCount": sum(check["passed"] for check in checks),
        "checkCount": len(checks),
    }
    return result, md, svg, validation


def main() -> None:
    result, md, svg, validation = build()
    OUT_JSON.write_text(canonical_json(result), encoding="utf-8")
    OUT_MD.write_text(md, encoding="utf-8")
    OUT_SVG.write_text(svg, encoding="utf-8")
    VALIDATION.write_text(canonical_json(validation), encoding="utf-8")
    subprocess.run(
        [
            "npx",
            "--no-install",
            "prettier@3.6.2",
            "--write",
            str(SOURCE),
            str(OUT_JSON),
            str(OUT_MD),
            str(VALIDATION),
        ],
        check=True,
        cwd=ROOT.parents[2],
    )
    if not validation["passed"]:
        raise SystemExit("validation failed")


if __name__ == "__main__":
    main()
