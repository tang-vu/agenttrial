#!/usr/bin/env python3
"""Reproducible P26-002 fixed-frame estimand and confirmatory feasibility analysis."""

from __future__ import annotations

import argparse
import functools
import json
import math
from pathlib import Path

from scipy.stats import beta, binom


ALPHA = 0.05
NONINFERIORITY_MARGIN = 0.05
SAFETY_TRUE_RATE = 0.01
FRAME_FAULTS = 80
FRAME_CONTROLS = 80
OBSERVED_FIXED_FAULT_EXECUTIONS = 60
UNIQUE_PINNED_CONTROL_INPUTS = 20

SCENARIOS = {
    "pessimistic": {"baseline_only": 0.14, "agenttrial_only": 0.05},
    "planning": {"baseline_only": 0.20, "agenttrial_only": 0.04},
    "optimistic": {"baseline_only": 0.28, "agenttrial_only": 0.03},
}


@functools.lru_cache(maxsize=None)
def conditional_rejection_power(discordant: int, q: float, alpha: float) -> float:
    if discordant == 0:
        return 0.0
    critical = next(
        (b for b in range(discordant + 1) if binom.sf(b - 1, discordant, 0.5) <= alpha),
        None,
    )
    return 0.0 if critical is None else float(binom.sf(critical - 1, discordant, q))


def exact_mcnemar_power(n: int, baseline_only: float, agenttrial_only: float, alpha: float) -> float:
    discordance = baseline_only + agenttrial_only
    q = baseline_only / discordance
    return float(
        sum(
            binom.pmf(d, n, discordance) * conditional_rejection_power(d, q, alpha)
            for d in range(n + 1)
        )
    )


def clopper_pearson_upper(events: int, n: int, alpha: float) -> float:
    return 1.0 if events == n else float(beta.ppf(1 - alpha, events + 1, n - events))


@functools.lru_cache(maxsize=None)
def safety_operating_characteristic(n: int, true_rate: float, margin: float, alpha: float) -> dict:
    passing = [k for k in range(n + 1) if clopper_pearson_upper(k, n, alpha) <= margin]
    max_events = max(passing, default=-1)
    power = 0.0 if max_events < 0 else float(binom.cdf(max_events, n, true_rate))
    return {
        "n": n,
        "max_passing_events": max_events,
        "upper_at_max": None if max_events < 0 else clopper_pearson_upper(max_events, n, alpha),
        "upper_at_next": None if max_events >= n else clopper_pearson_upper(max_events + 1, n, alpha),
        "power_if_true_rate_0_01": power,
    }


def first_n(predicate, limit: int = 1000) -> int:
    for n in range(1, limit + 1):
        if predicate(n):
            return n
    raise RuntimeError("no passing n in scan")


def build() -> dict:
    benefit = {}
    for name, probs in SCENARIOS.items():
        first = first_n(
            lambda n, p=probs: exact_mcnemar_power(
                n, p["baseline_only"], p["agenttrial_only"], ALPHA
            )
            >= 0.80
        )
        benefit[name] = {
            **probs,
            "power_at_80": exact_mcnemar_power(
                80, probs["baseline_only"], probs["agenttrial_only"], ALPHA
            ),
            "first_n_with_power_at_least_0_80": first,
            "power_at_first_n": exact_mcnemar_power(
                first, probs["baseline_only"], probs["agenttrial_only"], ALPHA
            ),
        }

    safety_first = first_n(
        lambda n: safety_operating_characteristic(
            n, SAFETY_TRUE_RATE, NONINFERIORITY_MARGIN, ALPHA
        )["power_if_true_rate_0_01"]
        >= 0.80
    )

    def combined_lower(n: int) -> float:
        benefit_power = exact_mcnemar_power(n, 0.14, 0.05, ALPHA)
        safety_power = safety_operating_characteristic(
            n, SAFETY_TRUE_RATE, NONINFERIORITY_MARGIN, ALPHA
        )["power_if_true_rate_0_01"]
        return max(0.0, benefit_power + safety_power - 1.0)

    combined_first = first_n(lambda n: combined_lower(n) >= 0.80)
    checkpoints = {}
    for n in sorted({80, safety_first, combined_first, 243}):
        s = safety_operating_characteristic(n, SAFETY_TRUE_RATE, NONINFERIORITY_MARGIN, ALPHA)
        checkpoints[str(n)] = {
            "pessimistic_benefit_power": exact_mcnemar_power(n, 0.14, 0.05, ALPHA),
            "safety": s,
            "correlation_agnostic_joint_power_lower_bound": combined_lower(n),
        }

    return {
        "schema_version": "p26-002-estimand-design-amendment-0.1.0",
        "date": "2026-09-09",
        "status": "machine_selected_reversible_design_pending_independent_review_and_execution_gates",
        "scope": "method_design_and_feasibility_only_no_trial_outcomes",
        "primary_question": "Within a prospectively frozen set of unique fault and matched-control executions, does AgentTrial reduce false acceptance relative to final-output-only evaluation while keeping AgentTrial-only false rejection below a five-percentage-point margin?",
        "primary_estimands": {
            "benefit": {
                "name": "paired false-acceptance risk difference",
                "definition": "Pr(final-output-only accepts and AgentTrial rejects) minus Pr(AgentTrial accepts and final-output-only rejects) over unique fault execution pairs",
                "direction": "positive favors AgentTrial",
                "primary_comparator": "final-output-only",
                "test": "one-sided exact conditional McNemar test at alpha 0.05",
            },
            "safety": {
                "name": "AgentTrial-only false-rejection probability",
                "definition": "probability that AgentTrial rejects while final-output-only accepts on a unique matched-control execution",
                "margin": NONINFERIORITY_MARGIN,
                "test": "one-sided exact Clopper-Pearson upper bound at alpha 0.05",
            },
        },
        "success_rule": "Both benefit superiority and safety noninferiority must pass. Because success requires intersection, each component uses alpha 0.05; no claim succeeds when only one component passes.",
        "secondary_comparators": ["trace-presence", "frozen-local-llm-judge"],
        "secondary_policy": "Estimate paired effects with intervals and apply Holm only to explicitly inferential secondary tests; no secondary result can rescue failure of either primary component.",
        "unit_and_dependence": {
            "unit": "unique physical execution artifact under exactly one condition and one source-unit binding",
            "prohibited": [
                "reusing one execution identity as multiple observations",
                "counting repeated evaluator replay as repeated agent execution",
                "treating family-order bindings as validated construct mappings",
            ],
            "source_stratification": "Report each pinned benchmark source separately before any fixed-frame aggregate.",
        },
        "planning_assumptions": {
            "alpha_each_co_primary": ALPHA,
            "target_marginal_power": 0.80,
            "target_joint_power_lower_bound": 0.80,
            "benefit_scenarios": SCENARIOS,
            "safety_true_agenttrial_only_rate": SAFETY_TRUE_RATE,
            "safety_margin": NONINFERIORITY_MARGIN,
            "joint_power_method": "correlation-agnostic Bonferroni lower bound P(A and B) >= P(A) + P(B) - 1",
        },
        "operating_characteristics": {
            "benefit": benefit,
            "safety_first_n_with_power_at_least_0_80": safety_first,
            "combined_pessimistic_first_n_with_lower_bound_at_least_0_80": combined_first,
            "checkpoints": checkpoints,
        },
        "frame_feasibility": {
            "registered_fault_slots": FRAME_FAULTS,
            "registered_control_slots": FRAME_CONTROLS,
            "observed_fixed_fault_executions": OBSERVED_FIXED_FAULT_EXECUTIONS,
            "unique_pinned_control_inputs": UNIQUE_PINNED_CONTROL_INPUTS,
            "confirmatory_n": combined_first,
            "additional_unique_fault_executions_needed_vs_registered_frame": max(0, combined_first - FRAME_FAULTS),
            "additional_unique_control_executions_needed_vs_registered_frame": max(0, combined_first - FRAME_CONTROLS),
            "additional_observed_fault_executions_needed_vs_current_evidence": max(0, combined_first - OBSERVED_FIXED_FAULT_EXECUTIONS),
            "additional_unique_control_inputs_needed_vs_current_evidence": max(0, combined_first - UNIQUE_PINNED_CONTROL_INPUTS),
            "current_eighty_pair_frame_is_confirmatory": False,
            "permitted_use_of_eighty_pair_frame": "finite-frame descriptive census and pilot estimation only, with no confirmatory or population-general claim",
        },
        "retrospective_change_log": [
            "Replaces the six-component three-comparator co-primary frontier with one primary comparator and two co-primary endpoints.",
            "Does not change historical design files or reinterpret 243 as a monotone minimum.",
            "Selects an exact confirmatory n only for the stated one-comparator estimand and planning assumptions.",
            "Keeps all source, construct-review, independent-review, private-visibility, execution, release, and submission gates closed.",
        ],
        "gates": {
            "independent_method_review_complete": False,
            "construct_mappings_approved": 0,
            "construct_mappings_required": 80,
            "runnable_jobs": 0,
            "scheduled_jobs": 0,
            "executed_jobs": 0,
            "main_trial_allowed": False,
            "release_allowed": False,
            "submission_allowed": False,
        },
    }


def render(data: dict) -> str:
    oc = data["operating_characteristics"]
    n = oc["combined_pessimistic_first_n_with_lower_bound_at_least_0_80"]
    cp = oc["checkpoints"][str(n)]
    lines = [
        "# P26-002 estimand and exact design amendment",
        "",
        "Date: 2026-09-09  ",
        "Status: reversible machine selection pending independent method review and all execution gates",
        "",
        "## Primary design",
        "",
        data["primary_question"],
        "",
        "The primary benefit estimand is the paired false-acceptance risk difference between final-output-only and AgentTrial on unique fault executions. The co-primary safety estimand is the AgentTrial-only false-rejection probability on unique matched controls, with a 0.05 noninferiority margin. Both components must pass. Trace-presence and the frozen local LLM judge are secondary comparators.",
        "",
        "The unit is one unique physical execution artifact under one condition and one source-unit binding. Replaying an evaluator, reusing a control, or renaming a family-order binding never creates another observation.",
        "",
        "## Exact operating characteristics",
        "",
        "| Scenario    | Benefit power at n=80 | First n with benefit power >=0.80 |",
        "| ----------- | --------------------: | --------------------------------: |",
    ]
    for name, result in oc["benefit"].items():
        lines.append(
            f"| {name:<11} | {result['power_at_80']:>21.6f} | {result['first_n_with_power_at_least_0_80']:>33} |"
        )
    lines += [
        "",
        f"Safety alone first reaches 0.80 power at n={oc['safety_first_n_with_power_at_least_0_80']} under a true AgentTrial-only control error rate of 0.01. Requiring both pessimistic benefit and safety to succeed gives the first correlation-agnostic joint-power lower-bound crossing at n={n}.",
        "",
        f"At n={n}, pessimistic benefit power is {cp['pessimistic_benefit_power']:.6f}, safety power is {cp['safety']['power_if_true_rate_0_01']:.6f}, the largest passing safety event count is {cp['safety']['max_passing_events']}, and the joint lower bound is {cp['correlation_agnostic_joint_power_lower_bound']:.6f}.",
        "",
        "## Feasibility consequence",
        "",
        f"The registered 80-pair frame is not confirmatory under this design. The exact confirmatory target is {n} unique fault/control pairs, requiring {data['frame_feasibility']['additional_unique_fault_executions_needed_vs_registered_frame']} additional fault slots and {data['frame_feasibility']['additional_unique_control_executions_needed_vs_registered_frame']} additional control slots beyond the registered frame. Relative to current evidence, {data['frame_feasibility']['additional_observed_fault_executions_needed_vs_current_evidence']} additional unique fault executions and {data['frame_feasibility']['additional_unique_control_inputs_needed_vs_current_evidence']} additional unique controls are needed.",
        "",
        "The existing frame may still be analyzed as a finite-frame descriptive census or pilot estimate, but not as confirmatory evidence and not as a population-general result.",
        "",
        "## Governance boundary",
        "",
        "This amendment changes no historical protocol artifact and creates no trial outcome, human construct mapping, independent review, source authorization, private-data upload, execution permission, release, merge, fee, or submission. All gates remain closed.",
        "",
    ]
    return "\n".join(lines)


def validate(data: dict, markdown: str) -> dict:
    checks = []

    def add(name: str, passed: bool) -> None:
        checks.append({"name": name, "passed": bool(passed)})

    oc = data["operating_characteristics"]
    n = oc["combined_pessimistic_first_n_with_lower_bound_at_least_0_80"]
    prev = oc["checkpoints"].get(str(n - 1))
    add("one_primary_comparator", data["primary_estimands"]["benefit"]["primary_comparator"] == "final-output-only")
    add("two_co_primary_endpoints", len(data["primary_estimands"]) == 2)
    add("intersection_success_rule", data["success_rule"].startswith("Both benefit superiority"))
    add("alpha_is_0_05", data["planning_assumptions"]["alpha_each_co_primary"] == 0.05)
    add("safety_margin_is_0_05", data["primary_estimands"]["safety"]["margin"] == 0.05)
    add("registered_frame_preserved", data["frame_feasibility"]["registered_fault_slots"] == 80 and data["frame_feasibility"]["registered_control_slots"] == 80)
    add("current_evidence_counts_preserved", data["frame_feasibility"]["observed_fixed_fault_executions"] == 60 and data["frame_feasibility"]["unique_pinned_control_inputs"] == 20)
    add("confirmatory_n_exceeds_frame", n > 80)
    add("confirmatory_n_joint_lower_passes", oc["checkpoints"][str(n)]["correlation_agnostic_joint_power_lower_bound"] >= 0.80)
    add("previous_n_joint_lower_fails", combined_lower_for_validation(n - 1) < 0.80)
    add("eighty_not_confirmatory", data["frame_feasibility"]["current_eighty_pair_frame_is_confirmatory"] is False)
    add("replay_prohibited", "counting repeated evaluator replay as repeated agent execution" in data["unit_and_dependence"]["prohibited"])
    add(
        "all_gates_closed",
        data["gates"]["independent_method_review_complete"] is False
        and data["gates"]["construct_mappings_approved"] == 0
        and data["gates"]["runnable_jobs"] == 0
        and data["gates"]["scheduled_jobs"] == 0
        and data["gates"]["executed_jobs"] == 0
        and data["gates"]["main_trial_allowed"] is False
        and data["gates"]["release_allowed"] is False
        and data["gates"]["submission_allowed"] is False,
    )
    add("no_em_dash", "\u2014" not in markdown)
    passed = sum(x["passed"] for x in checks)
    result = {"checks": checks, "passed": passed, "total": len(checks), "all_passed": passed == len(checks)}
    if not result["all_passed"]:
        raise SystemExit(json.dumps(result, indent=2))
    return result


def combined_lower_for_validation(n: int) -> float:
    benefit = exact_mcnemar_power(n, 0.14, 0.05, ALPHA)
    safety = safety_operating_characteristic(n, SAFETY_TRUE_RATE, NONINFERIORITY_MARGIN, ALPHA)[
        "power_if_true_rate_0_01"
    ]
    return max(0.0, benefit + safety - 1.0)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    data = build()
    # Include n-1 as an explicit minimality checkpoint after selection.
    n = data["operating_characteristics"]["combined_pessimistic_first_n_with_lower_bound_at_least_0_80"]
    s = safety_operating_characteristic(n - 1, SAFETY_TRUE_RATE, NONINFERIORITY_MARGIN, ALPHA)
    data["operating_characteristics"]["checkpoints"][str(n - 1)] = {
        "pessimistic_benefit_power": exact_mcnemar_power(n - 1, 0.14, 0.05, ALPHA),
        "safety": s,
        "correlation_agnostic_joint_power_lower_bound": combined_lower_for_validation(n - 1),
    }
    markdown = render(data)
    validation = validate(data, markdown)
    json_text = json.dumps(data, indent=2) + "\n"
    json_text = json_text.replace(
        '  "secondary_comparators": [\n    "trace-presence",\n    "frozen-local-llm-judge"\n  ],',
        '  "secondary_comparators": ["trace-presence", "frozen-local-llm-judge"],',
    )
    (args.output_dir / "estimand_design_amendment.json").write_text(json_text, encoding="utf-8")
    (args.output_dir / "estimand_design_amendment.md").write_text(markdown, encoding="utf-8")
    (args.output_dir / "validation.json").write_text(
        json.dumps(validation, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
