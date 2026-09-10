#!/usr/bin/env python3
"""Quantify P26-002 confirmatory-power dependence on construct-review cases."""

from __future__ import annotations

import argparse
import csv
import functools
import hashlib
import json
from io import StringIO
from pathlib import Path

from scipy.stats import beta, binom


EXPECTED_BLOBS = {
    "design": "6b668735a10aeb92786a9f808c35ea9eb6c792af",
    "frame": "942f08b724528984c704681791868df5d05c63d5",
    "oracle": "427cffac17dbc8a69c2195d641ad56749cc28288",
}
ALPHA = 0.05
BASELINE_ONLY = 0.14
AGENTTRIAL_ONLY = 0.05
SAFETY_TRUE_RATE = 0.01
SAFETY_MARGIN = 0.05


def git_blob_sha(path: Path) -> str:
    payload = path.read_bytes()
    return hashlib.sha1(f"blob {len(payload)}\0".encode() + payload).hexdigest()


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def canonical_json(value: object) -> bytes:
    text = json.dumps(value, indent=2, sort_keys=True) + "\n"
    text = text.replace('  "passing_retained_sizes": [\n    181\n  ],', '  "passing_retained_sizes": [181],')
    return text.encode()


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
    discordance = BASELINE_ONLY + AGENTTRIAL_ONLY
    q = BASELINE_ONLY / discordance
    return float(
        sum(
            binom.pmf(d, n, discordance) * conditional_rejection_power(d, q)
            for d in range(n + 1)
        )
    )


def cp_upper(events: int, n: int) -> float:
    return 1.0 if events == n else float(beta.ppf(1 - ALPHA, events + 1, n - events))


def safety_power(n: int) -> tuple[float, int]:
    passing = [k for k in range(n + 1) if cp_upper(k, n) <= SAFETY_MARGIN]
    max_events = max(passing, default=-1)
    power = 0.0 if max_events < 0 else float(binom.cdf(max_events, n, SAFETY_TRUE_RATE))
    return power, max_events


def row_for_n(n: int, direct_cases: int) -> dict:
    benefit = benefit_power(n)
    safety, max_events = safety_power(n)
    return {
        "retained_total_cases": n,
        "retained_construct_review_cases": n - direct_cases,
        "excluded_construct_review_cases": direct_cases + 57 - n,
        "pessimistic_benefit_power": round(benefit, 9),
        "safety_power": round(safety, 9),
        "safety_max_passing_events": max_events,
        "joint_power_lower_bound": round(max(0.0, benefit + safety - 1), 9),
        "joint_target_met": max(0.0, benefit + safety - 1) >= 0.80,
    }


def csv_bytes(rows: list[dict]) -> bytes:
    stream = StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue().encode()


def figure(rows: list[dict]) -> bytes:
    width, height = 940, 500
    left, top, chart_w, chart_h = 95, 80, 780, 320
    x = lambda excluded: left + excluded / 57 * chart_w
    y = lambda value: top + chart_h - value * chart_h
    points = " ".join(
        f'{x(row["excluded_construct_review_cases"]):.2f},{y(row["joint_power_lower_bound"]):.2f}'
        for row in reversed(rows)
    )
    ticks = []
    for value in (0.0, 0.2, 0.4, 0.6, 0.8, 1.0):
        yy = y(value)
        ticks.append(f'<line x1="{left}" y1="{yy:.2f}" x2="{left + chart_w}" y2="{yy:.2f}" stroke="#e5e7eb"/>')
        ticks.append(f'<text x="55" y="{yy + 5:.2f}" font-size="13">{value:.1f}</text>')
    for excluded in (0, 10, 20, 30, 40, 50, 57):
        xx = x(excluded)
        ticks.append(f'<text x="{xx:.2f}" y="425" text-anchor="middle" font-size="13">{excluded}</text>')
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title desc">
<title id="title">P26-002 joint-power lower bound under construct-case exclusion</title>
<desc id="desc">The joint-power lower bound meets 0.80 only when all 57 construct-review cases are retained.</desc>
<rect width="100%" height="100%" fill="white"/>
<text x="30" y="32" font-size="22" font-weight="700">Confirmatory feasibility has zero construct-case attrition tolerance</text>
<text x="30" y="56" font-size="14" fill="#4b5563">Exact design assumptions; operating characteristics, not observed outcomes</text>
{''.join(ticks)}
<line x1="{left}" y1="{y(0.8):.2f}" x2="{left + chart_w}" y2="{y(0.8):.2f}" stroke="#dc2626" stroke-width="2" stroke-dasharray="7 5"/>
<text x="{left + chart_w - 5}" y="{y(0.8) - 8:.2f}" text-anchor="end" font-size="13" fill="#b91c1c">planned joint lower-bound target 0.80</text>
<polyline points="{points}" fill="none" stroke="#2563eb" stroke-width="4"/>
<circle cx="{x(0):.2f}" cy="{y(rows[-1]['joint_power_lower_bound']):.2f}" r="6" fill="#16a34a"/>
<circle cx="{x(1):.2f}" cy="{y(rows[-2]['joint_power_lower_bound']):.2f}" r="6" fill="#f59e0b"/>
<circle cx="{x(57):.2f}" cy="{y(rows[0]['joint_power_lower_bound']):.2f}" r="6" fill="#7c3aed"/>
<text x="{left + chart_w / 2}" y="468" text-anchor="middle" font-size="15">Construct-review cases excluded from the 181-row frame</text>
<text x="18" y="250" transform="rotate(-90 18 250)" text-anchor="middle" font-size="15">Joint power lower bound</text>
</svg>
'''
    return svg.encode()


def report(result: dict) -> bytes:
    c = result["checkpoints"]
    return f'''# P26-002 BIPIA frame and oracle-power sensitivity

Date: 2026-09-10  
Status: retrospective design-feasibility amendment; no trial execution or outcome

## Question

Does the 181-row confirmatory plan remain feasible if cases that still require independent construct review cannot be used?

## Bound inputs

The analysis joins three public, exact-blob inputs from the P26-002 research branch: the narrowed co-primary design, the frozen 181-row BIPIA source frame, and the deterministic final-output oracle policy. The frame contains 124 direct short-answer rows and 57 review-dependent rows: 26 EmailQA `unknown` sentinels and 31 CodeQA references. Operational comparator behavior is specified for all 57, but construct validity remains unapproved.

## Result

The exact planning target has zero attrition tolerance with respect to those 57 cases. With all 181 rows retained, pessimistic benefit power is {c['all_181']['pessimistic_benefit_power']:.6f}, safety power is {c['all_181']['safety_power']:.6f}, and the correlation-agnostic joint lower bound is {c['all_181']['joint_power_lower_bound']:.6f}. This is the only retained size from 124 through 181 that reaches the planned 0.80 joint lower bound.

Excluding only one review-dependent row gives n=180. Benefit power remains {c['exclude_one']['pessimistic_benefit_power']:.6f}, but the exact one-sided Clopper-Pearson safety rule then permits at most three events rather than four. Safety power falls from {c['all_181']['safety_power']:.6f} to {c['exclude_one']['safety_power']:.6f}, and the joint lower bound falls to {c['exclude_one']['joint_power_lower_bound']:.6f}.

If all 57 review-dependent rows are excluded, the 124 direct short-answer cases provide benefit power {c['direct_only_124']['pessimistic_benefit_power']:.6f}, safety power {c['direct_only_124']['safety_power']:.6f}, and a joint lower bound of {c['direct_only_124']['joint_power_lower_bound']:.6f}. Thus the direct subset alone is not confirmatory under the stated pessimistic assumptions.

## Interpretation

The 181-row source count closes numerical availability only conditionally. It does not provide slack for an independent review to reject even one sentinel or code comparator while preserving the registered confirmatory operating characteristic. The discontinuity at 181 is a property of the exact finite-sample safety rule and should be disclosed rather than smoothed away.

This does not invalidate the BIPIA rows or approve their constructs. It shows that feasibility and oracle validity are coupled: the source frame reaches its target only if all 57 ambiguous cases are retained. A robust confirmatory design would need additional pre-outcome source rows or a prospectively justified operating characteristic with explicit attrition allowance.

## Boundaries

- The powers are design operating characteristics under declared probabilities, not observed effect estimates.
- No BIPIA response, AgentTrial judgment, human label, or execution artifact was created.
- The analysis does not widen the oracle policy or mark any construct as valid.
- `mainTrialAllowed=false`, `releaseAllowed=false`, and `submissionAllowed=false` remain unchanged.
'''.encode()


def amendment() -> bytes:
    return b'''# P26-002 retrospective amendment: BIPIA frame and oracle-power sensitivity

Date: 2026-09-10

This analysis was specified after the exact n=181 design and the BIPIA source and oracle packets existed. It joins those frozen machine records to ask how confirmatory operating characteristics change when construct-review-dependent cases are excluded. It is retrospective and is not represented as a preregistered result.

The amendment does not alter the historical protocol, source selection rule, endpoint, oracle policy, power assumptions, or human gates. It does not approve the 26 sentinel cases or 31 code-reference cases. It creates no execution, response, trial outcome, independent review, release, merge, or submission authorization.

The resulting curve is an operating-characteristic sensitivity, not an empirical effect estimate. All P26-002 research gates remain fail closed.
'''


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--design", type=Path, required=True)
    parser.add_argument("--frame", type=Path, required=True)
    parser.add_argument("--oracle", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()

    observed_blobs = {
        "design": git_blob_sha(args.design),
        "frame": git_blob_sha(args.frame),
        "oracle": git_blob_sha(args.oracle),
    }
    if observed_blobs != EXPECTED_BLOBS:
        raise SystemExit(f"input blob mismatch: {observed_blobs}")

    design = json.loads(args.design.read_text())
    frame = json.loads(args.frame.read_text())
    oracle = json.loads(args.oracle.read_text())
    direct = frame["counts"]["shortAnswerSelected"]
    review_dependent = frame["counts"]["constructReviewRequired"]
    confirmatory_n = design["frame_feasibility"]["confirmatory_n"]

    rows = [row_for_n(n, direct) for n in range(direct, confirmatory_n + 1)]
    passing = [row for row in rows if row["joint_target_met"]]
    checkpoints = {
        "direct_only_124": rows[0],
        "exclude_one": rows[-2],
        "all_181": rows[-1],
    }
    result = {
        "schema_version": "p26-002-bipia-frame-oracle-power-sensitivity/v1",
        "date": "2026-09-10",
        "scope": "retrospective_design_operating_characteristic_no_outcomes",
        "inputs": {"git_blobs": observed_blobs, "source_head": "70e5eb4e88b146f4785fcf14a2c6fb83ec3a0c5c"},
        "frame": {
            "selected_rows": frame["counts"]["selectedRows"],
            "direct_short_answer_rows": direct,
            "construct_review_dependent_rows": review_dependent,
            "unknown_sentinel_rows": frame["counts"]["unknownSentinelSelected"],
            "code_reference_rows": frame["counts"]["codeReferenceSelected"],
            "confirmatory_n": confirmatory_n,
        },
        "assumptions": {
            "alpha_each_co_primary": ALPHA,
            "pessimistic_baseline_only": BASELINE_ONLY,
            "pessimistic_agenttrial_only": AGENTTRIAL_ONLY,
            "safety_true_rate": SAFETY_TRUE_RATE,
            "safety_margin": SAFETY_MARGIN,
            "joint_rule": "max(0, benefit_power + safety_power - 1)",
        },
        "checkpoints": checkpoints,
        "passing_retained_sizes": [row["retained_total_cases"] for row in passing],
        "minimum_construct_review_cases_required": passing[0]["retained_construct_review_cases"] if passing else None,
        "attrition_tolerance_cases": review_dependent - passing[0]["retained_construct_review_cases"] if passing else None,
        "operating_characteristic_only": True,
        "outcomes_created": 0,
        "construct_review_complete": oracle["gates"]["constructReviewComplete"],
        "main_trial_allowed": False,
        "release_allowed": False,
        "submission_allowed": False,
    }

    payloads = {
        "frame_oracle_power_sensitivity.csv": csv_bytes(rows),
        "frame_oracle_power_sensitivity.json": canonical_json(result),
        "frame_oracle_power_sensitivity.md": report(result),
        "frame_oracle_power_sensitivity.svg": figure(rows),
        "retrospective_amendment_20260910.md": amendment(),
    }
    checks = {
        "input_blobs_exact": observed_blobs == EXPECTED_BLOBS,
        "frame_181": confirmatory_n == 181 and frame["counts"]["selectedRows"] == 181,
        "direct_124": direct == 124,
        "review_dependent_57": review_dependent == 57,
        "review_classes_26_plus_31": frame["counts"]["unknownSentinelSelected"] == 26 and frame["counts"]["codeReferenceSelected"] == 31,
        "oracle_review_still_open": oracle["gates"]["constructReviewComplete"] is False,
        "curve_has_58_sizes": len(rows) == 58,
        "only_181_passes": result["passing_retained_sizes"] == [181],
        "zero_attrition_tolerance": result["attrition_tolerance_cases"] == 0,
        "n180_joint_matches": checkpoints["exclude_one"]["joint_power_lower_bound"] == 0.747186784,
        "n181_joint_matches": checkpoints["all_181"]["joint_power_lower_bound"] == 0.82052457,
        "n124_joint_matches": checkpoints["direct_only_124"]["joint_power_lower_bound"] == 0.571881389,
        "safety_event_cutoff_jumps": checkpoints["exclude_one"]["safety_max_passing_events"] == 3 and checkpoints["all_181"]["safety_max_passing_events"] == 4,
        "no_outcomes": result["outcomes_created"] == 0,
        "all_gates_closed": not result["main_trial_allowed"] and not result["release_allowed"] and not result["submission_allowed"],
        "no_em_dash": all(b"\xe2\x80\x94" not in payload for payload in payloads.values()),
    }
    validation = {
        "schema_version": "p26-002-bipia-frame-oracle-power-sensitivity-validation/v1",
        "all_passed": all(checks.values()),
        "checks": checks,
        "checks_passed": sum(checks.values()),
        "checks_total": len(checks),
        "artifacts": {name: sha256_bytes(payload) for name, payload in payloads.items()},
    }
    payloads["validation.json"] = canonical_json(validation)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for name, payload in payloads.items():
        (args.output_dir / name).write_bytes(payload)
    if not validation["all_passed"]:
        raise SystemExit("validation failed")


if __name__ == "__main__":
    main()
