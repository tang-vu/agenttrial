#!/usr/bin/env python3
"""Build the P26-002 A3S endpoint-compatibility amendment."""

from __future__ import annotations

import hashlib
import json
import math
import subprocess
from collections import Counter, defaultdict, deque
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parent
OBSERVATION = ROOT / "compatibility_observation.json"
PREVIOUS = (
    ROOT.parent
    / "a3s-source-expansion-feasibility-2026-09-09"
    / "a3s_source_expansion.json"
)
OUT_JSON = ROOT / "a3s_endpoint_compatibility.json"
OUT_MD = ROOT / "a3s_endpoint_compatibility.md"
OUT_SVG = ROOT / "a3s_endpoint_compatibility.svg"
VALIDATION = ROOT / "validation.json"

TARGET = 69
EXISTING_CLUSTERS = 112
CONFIRMATORY_TARGET = 181
SALT = "p26-002-a3s-dual-margin-frame-v1"
NONEXACT_PENALTY = 100_000


def dump_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def stable_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def largest_remainder(counts: dict[str, int], target: int) -> dict[str, int]:
    total = sum(counts.values())
    exact = {key: target * value / total for key, value in counts.items()}
    quotas = {key: math.floor(value) for key, value in exact.items()}
    remainder = target - sum(quotas.values())
    order = sorted(counts, key=lambda key: (-(exact[key] - quotas[key]), key))
    for key in order[:remainder]:
        quotas[key] += 1
    return dict(sorted(quotas.items()))


def waterfill(counts: dict[str, int], target: int) -> dict[str, int]:
    level = 0
    while sum(min(value, level + 1) for value in counts.values()) <= target:
        level += 1
    quotas = {key: min(value, level) for key, value in counts.items()}
    remainder = target - sum(quotas.values())
    eligible = sorted(
        (key for key, value in counts.items() if value > quotas[key]),
        key=lambda key: (-counts[key], key),
    )
    for key in eligible[:remainder]:
        quotas[key] += 1
    return dict(sorted(quotas.items()))


@dataclass
class Edge:
    to: int
    rev: int
    cap: int
    cost: int


def add_edge(graph: list[list[Edge]], left: int, right: int, cap: int, cost: int) -> int:
    forward_index = len(graph[left])
    graph[left].append(Edge(right, len(graph[right]), cap, cost))
    graph[right].append(Edge(left, forward_index, 0, -cost))
    return forward_index


def dual_margin_select(
    candidates: list[dict], risk_quotas: dict[str, int], scenario_quotas: dict[str, int]
) -> list[dict]:
    risks = sorted(risk_quotas)
    scenarios = sorted(scenario_quotas)
    source = 0
    risk_start = 1
    candidate_start = risk_start + len(risks)
    scenario_start = candidate_start + len(candidates)
    sink = scenario_start + len(scenarios)
    graph: list[list[Edge]] = [[] for _ in range(sink + 1)]
    risk_node = {key: risk_start + index for index, key in enumerate(risks)}
    scenario_node = {
        key: scenario_start + index for index, key in enumerate(scenarios)
    }

    for key in risks:
        add_edge(graph, source, risk_node[key], risk_quotas[key], 0)
    for key in scenarios:
        add_edge(graph, scenario_node[key], sink, scenario_quotas[key], 0)

    hash_order = sorted(
        range(len(candidates)),
        key=lambda index: stable_hash(f"{SALT}|{candidates[index]['pairId']}"),
    )
    hash_rank = {candidate_index: rank for rank, candidate_index in enumerate(hash_order)}
    selection_edges: list[tuple[int, int]] = []
    for index, candidate in enumerate(candidates):
        candidate_node = candidate_start + index
        cost = hash_rank[index]
        if not candidate["structuralExact"]:
            cost += NONEXACT_PENALTY
        edge_index = add_edge(
            graph, risk_node[candidate["riskCategory"]], candidate_node, 1, cost
        )
        selection_edges.append((risk_node[candidate["riskCategory"]], edge_index))
        add_edge(graph, candidate_node, scenario_node[candidate["scenario"]], 1, 0)

    flow = 0
    while flow < TARGET:
        distance = [10**30] * len(graph)
        parent: list[tuple[int, int] | None] = [None] * len(graph)
        in_queue = [False] * len(graph)
        distance[source] = 0
        queue: deque[int] = deque([source])
        in_queue[source] = True
        while queue:
            node = queue.popleft()
            in_queue[node] = False
            for edge_index, edge in enumerate(graph[node]):
                if edge.cap and distance[edge.to] > distance[node] + edge.cost:
                    distance[edge.to] = distance[node] + edge.cost
                    parent[edge.to] = (node, edge_index)
                    if not in_queue[edge.to]:
                        queue.append(edge.to)
                        in_queue[edge.to] = True
        if parent[sink] is None:
            raise RuntimeError("Dual-margin frame is infeasible")
        node = sink
        while node != source:
            previous, edge_index = parent[node]  # type: ignore[misc]
            edge = graph[previous][edge_index]
            edge.cap -= 1
            graph[node][edge.rev].cap += 1
            node = previous
        flow += 1

    selected = []
    for index, (node, edge_index) in enumerate(selection_edges):
        if graph[node][edge_index].cap == 0:
            selected.append(candidates[index])
    return sorted(selected, key=lambda row: row["pairId"])


def describe(rows: list[dict]) -> dict:
    risk = Counter(row["riskCategory"] for row in rows)
    scenario = Counter(row["scenario"] for row in rows)
    surfaces = Counter(
        surface for row in rows for surface in row.get("injectionSurfaces", [])
    )
    exact = sum(row["structuralExact"] for row in rows)
    return {
        "clusters": len(rows),
        "byRisk": dict(sorted(risk.items())),
        "byScenario": dict(sorted(scenario.items())),
        "byInjectionSurface": dict(sorted(surfaces.items())),
        "structuralExact": exact,
        "structuralNonExact": len(rows) - exact,
        "setupChanged": sum(not row["setupEqual"] for row in rows),
        "turnCountChanged": sum(not row["turnCountEqual"] for row in rows),
        "toolSequenceChanged": sum(not row["toolSequenceEqual"] for row in rows),
        "maxRiskCell": max(risk.values()),
        "largestRiskShare": max(risk.values()) / len(rows),
        "riskHerfindahl": sum((value / len(rows)) ** 2 for value in risk.values()),
    }


def render_svg(previous: dict, revised: dict) -> str:
    scale = 8
    previous_width = previous["maxRiskCell"] * scale
    revised_width = revised["maxRiskCell"] * scale
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="760" height="280" viewBox="0 0 760 280">
<rect width="760" height="280" fill="#fff"/>
<style>.title{{font:700 20px Arial;fill:#152238}}.label{{font:14px Arial;fill:#27364d}}.value{{font:700 14px Arial;fill:#152238}}.note{{font:12px Arial;fill:#58677c}}</style>
<text x="30" y="36" class="title">P26-002 A3S candidate-frame correction</text>
<text x="30" y="78" class="label">Largest risk cell, previous frame</text>
<rect x="300" y="60" width="{previous_width}" height="28" rx="4" fill="#b94a48"/>
<text x="{310 + previous_width}" y="80" class="value">{previous['maxRiskCell']} / 69</text>
<text x="30" y="132" class="label">Largest risk cell, revised frame</text>
<rect x="300" y="114" width="{revised_width}" height="28" rx="4" fill="#2f6f8f"/>
<text x="{310 + revised_width}" y="134" class="value">{revised['maxRiskCell']} / 69</text>
<text x="30" y="184" class="label">Endpoint-ready pairs</text>
<rect x="300" y="166" width="2" height="28" fill="#666"/>
<text x="312" y="186" class="value">0 / 69</text>
<text x="30" y="232" class="note">Dual margins preserve all six scenarios and ten risk categories.</text>
<text x="30" y="252" class="note">No source row contains a deterministic final-output oracle; the frame remains inactive.</text>
</svg>
'''


def main() -> None:
    observation = json.loads(OBSERVATION.read_text(encoding="utf-8"))
    previous_packet = json.loads(PREVIOUS.read_text(encoding="utf-8"))
    candidates = observation["candidates"]
    candidate_by_pair = {row["pairId"]: row for row in candidates}
    previous_ids = [
        f"{row['seed_id']}:{row['variant_id']}"
        for row in previous_packet["candidateFrame"]["selected"]
    ]
    previous_rows = [candidate_by_pair[pair_id] for pair_id in previous_ids]

    available_risks = Counter(row["riskCategory"] for row in candidates)
    available_scenarios = Counter(row["scenario"] for row in candidates)
    risk_quotas = waterfill(dict(available_risks), TARGET)
    scenario_quotas = largest_remainder(dict(available_scenarios), TARGET)
    selected = dual_margin_select(candidates, risk_quotas, scenario_quotas)
    selected_ids = {row["pairId"] for row in selected}
    reserve = [row["pairId"] for row in candidates if row["pairId"] not in selected_ids]

    previous_summary = describe(previous_rows)
    revised_summary = describe(selected)
    selected_ledger_sha = stable_hash("\n".join(sorted(selected_ids)) + "\n")

    result = {
        "schemaVersion": "p26-002-a3s-endpoint-compatibility-0.1.0",
        "createdOn": "2026-09-09",
        "parentHead": observation["parentHead"],
        "status": "revised_inactive_candidate_frame_not_endpoint_ready",
        "source": observation["source"],
        "previousFrame": {
            **previous_summary,
            "selectionLedgerSha256": previous_packet["candidateFrame"][
                "selectedPairIdsSha256"
            ],
        },
        "revisedFrame": {
            **revised_summary,
            "riskQuotas": risk_quotas,
            "scenarioQuotas": scenario_quotas,
            "selectionRule": "max-min water-filled risk quotas plus proportional largest-remainder scenario quotas; among feasible frames, maximize structural-exact pairs then SHA-256 rank",
            "selectionSalt": SALT,
            "selectedPairIdsSha256": selected_ledger_sha,
            "selected": selected,
            "reservePairIds": reserve,
            "candidateCombinedClusters": EXISTING_CLUSTERS + len(selected),
        },
        "endpointCompatibility": {
            "candidatePairsAudited": len(selected),
            "pairsWithSourceDeterministicFinalOutputOracle": 0,
            "endpointReadyPairs": 0,
            "reason": "A3S source rows provide setup, scripted turns, and injection metadata but no deterministic expected final output or assertion set. Upstream outcome classification is LLM-as-Judge and uses full conversation plus tool-chain evidence.",
            "requiredBeforeActivation": [
                "source-locked deterministic final-output oracle criteria for each pair",
                "independent construct review without evaluator verdicts",
                "one unique control and one unique fault execution per approved pair",
            ],
        },
        "designConsequence": {
            "countFrameWouldReach": CONFIRMATORY_TARGET,
            "countFrameInterpretation": "Only a source-task count if all 69 pairs later pass oracle construction, construct review, and unique paired execution.",
            "confirmatorySampleAchieved": False,
            "powerAchieved": False,
        },
        "retrospectiveChangeLog": [
            "The earlier inactive 69-pair selection preserved scenario proportions and risk coverage but concentrated 44 pairs in Malicious Skill.",
            "This amendment supersedes only that inactive candidate selection with dual risk/scenario margins; it does not alter the registered 80-pair frame or historical evidence.",
            "The endpoint audit corrects the earlier count-feasibility interpretation: zero A3S pairs are directly endpoint-ready from source fields alone.",
        ],
        "gates": {
            "candidateSourceFrameRevised": True,
            "candidateSourceActivated": False,
            "constructMappingsApproved": 0,
            "executedPairs": 0,
            "mainTrialAllowed": False,
            "releaseAllowed": False,
            "submissionAllowed": False,
        },
    }
    dump_json(OUT_JSON, result)

    risks = sorted(risk_quotas)
    scenarios = sorted(scenario_quotas)
    lines = [
        "# P26-002 A3S endpoint compatibility and frame correction",
        "",
        "Status: revised inactive candidate frame; zero endpoint-ready pairs  ",
        "Date: 2026-09-09  ",
        f"Parent PR head: `{observation['parentHead']}`",
        "",
        "## Result",
        "",
        "The prior 69-pair A3S source frame closed the numerical content gap but did not establish endpoint feasibility. Direct inspection of all 201 eligible source pairs found no deterministic expected-final-output, assertion, gold-answer, or oracle field. A3S instead evaluates harmful and benign runs with LLM-as-Judge, including tool-chain evidence. Those upstream verdicts cannot be transported into P26-002's deterministic final-output-only primary comparator.",
        "",
        "Accordingly, **0/69 pairs are endpoint-ready**. No pair is activated, executed, or counted toward achieved power.",
        "",
        "## Retrospective frame correction",
        "",
        f"The previous source-only selection placed {previous_summary['maxRiskCell']}/69 pairs ({previous_summary['largestRiskShare']:.1%}) in one risk category. The revised inactive frame uses max-min water-filled risk quotas and proportional scenario quotas. It reduces the largest risk cell to {revised_summary['maxRiskCell']}/69 ({revised_summary['largestRiskShare']:.1%}) while retaining all ten risks and six scenarios.",
        "",
        "| Risk category | Available | Previous | Revised |",
        "| --- | ---: | ---: | ---: |",
    ]
    for risk in risks:
        lines.append(
            f"| {risk} | {available_risks[risk]} | {previous_summary['byRisk'].get(risk, 0)} | {revised_summary['byRisk'].get(risk, 0)} |"
        )
    lines.extend(
        [
            "",
            "| Scenario | Available | Previous | Revised |",
            "| --- | ---: | ---: | ---: |",
        ]
    )
    for scenario in scenarios:
        lines.append(
            f"| {scenario} | {available_scenarios[scenario]} | {previous_summary['byScenario'].get(scenario, 0)} | {revised_summary['byScenario'].get(scenario, 0)} |"
        )
    lines.extend(
        [
            "",
            "## Paired-source isolation",
            "",
            f"Among the revised 69 pairs, {revised_summary['structuralExact']} preserve setup, turn count, tool-name sequence, and every unflagged corresponding turn. The remaining {revised_summary['structuralNonExact']} differ on at least one of those dimensions. Structural exactness is maximized subject to the frozen risk and scenario margins, but it is only an isolation diagnostic; it is not construct validation or an outcome.",
            "",
            "## Scientific boundary",
            "",
            "The revised ledger is selected without target-model outputs, benchmark verdicts, or human labels. It supersedes only the previous inactive A3S candidate selection. The registered 80-pair frame, historical protocol evidence, and all governance gates remain unchanged.",
            "",
            "Before any A3S pair can enter the trial, it needs source-locked deterministic final-output criteria, independent blinded construct review, and unique fault/control executions. `candidateSourceActivated=false`, `mainTrialAllowed=false`, `releaseAllowed=false`, and `submissionAllowed=false`.",
            "",
        ]
    )
    OUT_MD.write_text("\n".join(lines), encoding="utf-8")
    OUT_SVG.write_text(render_svg(previous_summary, revised_summary), encoding="utf-8")

    checks = [
        ("candidate_count_201", len(candidates) == 201),
        ("candidate_pair_ids_unique", len(candidate_by_pair) == len(candidates)),
        ("previous_count_69", len(previous_rows) == TARGET),
        ("previous_pair_ids_unique", len(set(previous_ids)) == TARGET),
        ("previous_malicious_skill_44", previous_summary["byRisk"].get("Malicious Skill") == 44),
        ("risk_quotas_sum_69", sum(risk_quotas.values()) == TARGET),
        ("scenario_quotas_sum_69", sum(scenario_quotas.values()) == TARGET),
        ("revised_count_69", len(selected) == TARGET),
        ("revised_pair_ids_unique", len(selected_ids) == TARGET),
        ("risk_quotas_exact", revised_summary["byRisk"] == risk_quotas),
        ("scenario_quotas_exact", revised_summary["byScenario"] == scenario_quotas),
        ("all_ten_risks_retained", len(revised_summary["byRisk"]) == 10),
        ("all_six_scenarios_retained", len(revised_summary["byScenario"]) == 6),
        ("largest_risk_cell_reduced", revised_summary["maxRiskCell"] < previous_summary["maxRiskCell"]),
        ("reserve_count_132", len(reserve) == 132),
        ("selected_reserve_disjoint", not selected_ids.intersection(reserve)),
        ("source_oracle_fields_absent", observation["fieldAudit"]["candidateRowsWithMatchingField"] == 0),
        ("endpoint_ready_zero", result["endpointCompatibility"]["endpointReadyPairs"] == 0),
        ("count_frame_181", result["revisedFrame"]["candidateCombinedClusters"] == CONFIRMATORY_TARGET),
        ("sample_not_achieved", result["designConsequence"]["confirmatorySampleAchieved"] is False),
        ("power_not_achieved", result["designConsequence"]["powerAchieved"] is False),
        ("candidate_source_inactive", result["gates"]["candidateSourceActivated"] is False),
        ("no_construct_approvals", result["gates"]["constructMappingsApproved"] == 0),
        ("no_executions", result["gates"]["executedPairs"] == 0),
        ("all_release_trial_submission_gates_closed", not any(result["gates"][key] for key in ["mainTrialAllowed", "releaseAllowed", "submissionAllowed"])),
    ]
    validation = {
        "schemaVersion": "p26-002-a3s-endpoint-compatibility-validation-0.1.0",
        "passed": all(value for _, value in checks),
        "checkCount": len(checks),
        "passedCount": sum(value for _, value in checks),
        "checks": [{"name": name, "passed": value} for name, value in checks],
    }
    dump_json(VALIDATION, validation)
    subprocess.run(
        [
            "npx",
            "--no-install",
            "prettier@3.6.2",
            "--write",
            str(OBSERVATION),
            str(OUT_JSON),
            str(OUT_MD),
            str(VALIDATION),
        ],
        check=True,
    )
    if not validation["passed"]:
        raise SystemExit("validation failed")


if __name__ == "__main__":
    main()
