#!/usr/bin/env python3
"""Build the P26-002 A3S final-output observability amendment."""

from __future__ import annotations

import hashlib
import json
import subprocess
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parent
PREVIOUS = ROOT.parent / "a3s-endpoint-compatibility-2026-09-09" / "a3s_endpoint_compatibility.json"
OBSERVATION = ROOT / "literal_observation.json"
OUT_JSON = ROOT / "a3s_final_output_observability.json"
OUT_MD = ROOT / "a3s_final_output_observability.md"
OUT_SVG = ROOT / "a3s_final_output_observability.svg"
VALIDATION = ROOT / "validation.json"

ACTION_RISKS = {
    "Configuration Tampering",
    "Dangerous Command Execution",
    "Data Exfiltration",
    "Malicious Skill",
    "Memory Tampering",
    "Privilege Escalation",
    "Resource Exhaustion",
    "Sandbox Escape",
}
OUTPUT_RISKS = {"Information Leakage"}
SEMANTIC_RISKS = {"Jailbreak Attack"}


def dump_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def sha256_text(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def locus(risk: str) -> str:
    if risk in ACTION_RISKS:
        return "state_or_action"
    if risk in OUTPUT_RISKS:
        return "output_literal_candidate"
    if risk in SEMANTIC_RISKS:
        return "semantic_mixed"
    raise ValueError(f"Unmapped risk category: {risk}")


def render_svg(summary: dict) -> str:
    rows = [
        ("State/action dependent", summary["state_or_action"]["pairs"], "#8c4f45"),
        ("Literal-output candidates", summary["output_literal_candidate"]["pairs"], "#2f6f8f"),
        ("Semantic/mixed", summary["semantic_mixed"]["pairs"], "#92723d"),
        ("Strictly usable now", 0, "#4f5965"),
    ]
    bars = []
    for index, (label, value, colour) in enumerate(rows):
        y = 72 + index * 48
        width = max(2, value * 7)
        bars.append(
            f'<text x="30" y="{y + 18}" class="label">{label}</text>'
            f'<rect x="250" y="{y}" width="{width}" height="26" rx="4" fill="{colour}"/>'
            f'<text x="{262 + width}" y="{y + 18}" class="value">{value} / 69</text>'
        )
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="800" height="330" viewBox="0 0 800 330">
<rect width="800" height="330" fill="#fff"/>
<style>.title{{font:700 20px Arial;fill:#152238}}.label{{font:14px Arial;fill:#27364d}}.value{{font:700 14px Arial;fill:#152238}}.note{{font:12px Arial;fill:#58677c}}</style>
<text x="30" y="36" class="title">P26-002 A3S final-output observability</text>
{''.join(bars)}
<text x="30" y="286" class="note">Seven Information Leakage pairs were screened for credential-like literal contrast.</text>
<text x="30" y="306" class="note">No pair combined structural exactness with one-sided literal contrast.</text>
</svg>
'''


def main() -> None:
    previous = json.loads(PREVIOUS.read_text(encoding="utf-8"))
    observation = json.loads(OBSERVATION.read_text(encoding="utf-8"))
    selected = previous["revisedFrame"]["selected"]
    grouped: dict[str, dict] = {}
    for group in ("state_or_action", "output_literal_candidate", "semantic_mixed"):
        rows = [row for row in selected if locus(row["riskCategory"]) == group]
        grouped[group] = {
            "pairs": len(rows),
            "structuralExact": sum(bool(row["structuralExact"]) for row in rows),
            "structuralNonExact": sum(not bool(row["structuralExact"]) for row in rows),
            "byRisk": dict(sorted(Counter(row["riskCategory"] for row in rows).items())),
        }

    literal_rows = observation["pairs"]
    control_exposure = [row for row in literal_rows if row["controlAtoms"] > 0]
    one_sided = [
        row
        for row in literal_rows
        if row["controlAtoms"] == 0 and row["faultOnlyAtoms"] > 0
    ]
    strict = [row for row in one_sided if row["structuralExact"]]
    literal_summary = {
        "pairsScreened": len(literal_rows),
        "controlCredentialExposurePairs": len(control_exposure),
        "controlCredentialExposurePairIds": [row["pairId"] for row in control_exposure],
        "oneSidedLiteralContrastPairs": len(one_sided),
        "oneSidedLiteralContrastPairIds": [row["pairId"] for row in one_sided],
        "oneSidedContrastStructuralExactPairs": len(strict),
        "controlAtoms": sum(row["controlAtoms"] for row in literal_rows),
        "faultAtoms": sum(row["faultAtoms"] for row in literal_rows),
        "sharedAtoms": sum(row["sharedAtoms"] for row in literal_rows),
        "faultOnlyAtoms": sum(row["faultOnlyAtoms"] for row in literal_rows),
        "interpretation": "Counts are a deterministic pattern screen over scripted tool_response text, not observed agent outcomes or validated safety labels.",
    }

    result = {
        "schemaVersion": "p26-002-a3s-final-output-observability-0.1.0",
        "createdOn": "2026-09-09",
        "parentHead": observation["parentHead"],
        "source": observation["source"],
        "status": "a3s_not_compatible_with_confirmatory_final_output_primary_endpoint",
        "locusRule": {
            "state_or_action": sorted(ACTION_RISKS),
            "output_literal_candidate": sorted(OUTPUT_RISKS),
            "semantic_mixed": sorted(SEMANTIC_RISKS),
            "scope": "design-level mapping from the upstream risk-category construct to what the registered final-output projection can observe; not an outcome label",
        },
        "observability": grouped,
        "literalScreen": literal_summary,
        "identifiabilityArgument": {
            "projection": "pi(execution) = final assistant text only",
            "stateActionCounterexample": "The source schema permits two executions with the same final text and different tool actions or resulting environment state. Therefore state/action harm is not identified by pi without an additional source invariant or trace/state evidence.",
            "semanticCounterexample": "A jailbreak verdict requires semantic interpretation absent a deterministic source assertion; a text-only projection does not supply a source-locked binary oracle.",
            "literalBoundary": "Literal matching is mechanically possible only after defining forbidden values. It is not construct-faithful when the matched control exposes the same credential-like atoms, and nonexact source pairs do not isolate the injected condition.",
        },
        "strictEligibility": {
            "requirements": [
                "risk construct observable from final text",
                "source-derivable one-sided forbidden-literal contrast",
                "structural exactness between seed and injected scripts",
                "independent construct approval",
                "unique paired executions",
            ],
            "machineScreenPassBeforeHumanReview": len(strict),
            "endpointReadyPairs": 0,
        },
        "designConsequence": {
            "a3sConfirmatoryPrimaryUse": False,
            "a3sExploratoryLiteralCandidates": len(one_sided),
            "a3sTraceAwareSecondaryUseRequiresSeparateEstimand": True,
            "candidateCombinedClustersForPrimaryEndpoint": 112,
            "confirmatoryTarget": 181,
            "primaryEndpointClusterShortfall": 69,
            "previous181CountFrameSuperseded": True,
        },
        "gates": {
            "candidateSourceActivated": False,
            "constructMappingsApproved": 0,
            "executedPairs": 0,
            "mainTrialAllowed": False,
            "releaseAllowed": False,
            "submissionAllowed": False,
        },
        "retrospectiveChangeLog": [
            "The prior amendment correctly set endpointReadyPairs to zero but left open whether source-locked oracle construction might recover all 69 pairs.",
            "This audit narrows that possibility: 61 pairs are state/action-dependent, one is semantic/mixed, and the seven literal-output candidates yield zero pairs satisfying structural exactness plus one-sided literal contrast.",
            "Accordingly, the 112 + 69 = 181 frame is withdrawn for the registered primary endpoint while remaining available as an inactive source inventory for separately specified secondary work.",
        ],
    }
    dump_json(OUT_JSON, result)

    md = f"""# A3S final-output observability audit

## Status and amendment boundary

This retrospective amendment tests whether the 69-pair A3S candidate frame can supply observations for P26-002's registered final-output-only primary comparator. It supersedes the earlier interpretation that `112 + 69 = 181` could become a confirmatory primary-endpoint frame merely by adding per-pair oracle criteria. It does not change the registered 80-pair history, activate A3S, run an agent or evaluator, create an outcome, or record human review.

## Design-level observability result

The final-output projection can observe only the assistant's terminal text. Under a source-category rule fixed for this audit, **{grouped['state_or_action']['pairs']}/69** pairs concern state or action harms: configuration or memory tampering, dangerous commands, exfiltration actions, malicious skills, privilege escalation, resource exhaustion, or sandbox escape. The source schema permits equal final text after different tool actions or state changes, so these harms are not identified by final text without trace or post-state evidence. Another **{grouped['semantic_mixed']['pairs']}/69** jailbreak pair requires a semantic verdict for which the source supplies no deterministic assertion.

Only **{grouped['output_literal_candidate']['pairs']}/69** Information Leakage pairs are candidates for literal-output screening. A deterministic pattern audit of their scripted tool responses found {literal_summary['controlAtoms']} credential-like atoms in controls and {literal_summary['faultAtoms']} in injected scripts, including {literal_summary['sharedAtoms']} shared atoms. Five of seven controls already expose at least one such atom. Two pairs have a one-sided literal contrast, but both are structurally nonexact. The only structurally exact Information Leakage pair exposes the same eight detected atoms in both conditions. Thus **0/69** pairs satisfy the machine-screen combination of output observability, one-sided literal contrast, and structural exactness.

These counts are source diagnostics, not model outcomes, prevalence estimates, safety labels, or validation of the extraction pattern. The screen intentionally stores no credential literals.

## Consequence for the primary design

A3S cannot currently contribute confirmatory observations to the registered final-output-only primary endpoint. The primary-compatible source frame therefore remains 112 independent clusters, leaving a 69-cluster shortfall relative to the exact `n=181` planning target. The earlier 181 count was a source-task inventory, not an endpoint-compatible sample, and is withdrawn for primary-endpoint feasibility.

The two nonexact literal-contrast pairs may be retained for clearly labeled exploratory oracle prototyping. The full A3S set could also support a trace-aware or state-aware secondary estimand, but that would require a separate method amendment and cannot rescue failure of the primary endpoint.

## Gates

No source is activated; construct approvals and executions remain zero. `mainTrialAllowed=false`, `releaseAllowed=false`, and `submissionAllowed=false`.
"""
    OUT_MD.write_text(md, encoding="utf-8")
    OUT_SVG.write_text(render_svg(grouped), encoding="utf-8")

    subprocess.run(
        [
            "npx",
            "--no-install",
            "prettier@3.6.2",
            "--write",
            str(OBSERVATION),
            str(OUT_JSON),
            str(OUT_MD),
        ],
        check=True,
    )

    checks = {
        "selected_count_69": len(selected) == 69,
        "locus_partition_69": sum(value["pairs"] for value in grouped.values()) == 69,
        "state_action_61": grouped["state_or_action"]["pairs"] == 61,
        "output_candidate_7": grouped["output_literal_candidate"]["pairs"] == 7,
        "semantic_mixed_1": grouped["semantic_mixed"]["pairs"] == 1,
        "structural_exact_total_24": sum(value["structuralExact"] for value in grouped.values()) == 24,
        "literal_rows_7": len(literal_rows) == 7,
        "literal_ids_match_selected_information_leakage": {row["pairId"] for row in literal_rows} == {row["pairId"] for row in selected if row["riskCategory"] == "Information Leakage"},
        "control_exposure_5": len(control_exposure) == 5,
        "one_sided_contrast_2": len(one_sided) == 2,
        "strict_machine_screen_0": len(strict) == 0,
        "credential_literals_not_retained": all(not isinstance(value, str) or "=" not in value for row in literal_rows for value in row.values()),
        "endpoint_ready_zero": result["strictEligibility"]["endpointReadyPairs"] == 0,
        "primary_frame_reverts_to_112": result["designConsequence"]["candidateCombinedClustersForPrimaryEndpoint"] == 112,
        "shortfall_69": result["designConsequence"]["primaryEndpointClusterShortfall"] == 69,
        "a3s_inactive": result["gates"]["candidateSourceActivated"] is False,
        "no_construct_approvals": result["gates"]["constructMappingsApproved"] == 0,
        "no_executions": result["gates"]["executedPairs"] == 0,
        "main_trial_closed": result["gates"]["mainTrialAllowed"] is False,
        "release_closed": result["gates"]["releaseAllowed"] is False,
        "submission_closed": result["gates"]["submissionAllowed"] is False,
    }
    validation = {
        "schemaVersion": "p26-002-a3s-final-output-observability-validation-0.1.0",
        "createdOn": "2026-09-09",
        "passed": all(checks.values()),
        "passedChecks": sum(checks.values()),
        "totalChecks": len(checks),
        "checks": checks,
        "artifactSha256": {
            OUT_JSON.name: sha256_text(OUT_JSON),
            OUT_MD.name: sha256_text(OUT_MD),
            OUT_SVG.name: sha256_text(OUT_SVG),
            OBSERVATION.name: sha256_text(OBSERVATION),
        },
    }
    dump_json(VALIDATION, validation)
    subprocess.run(
        [
            "npx",
            "--no-install",
            "prettier@3.6.2",
            "--write",
            str(VALIDATION),
        ],
        check=True,
    )
    if not validation["passed"]:
        raise SystemExit("validation failed")


if __name__ == "__main__":
    main()
