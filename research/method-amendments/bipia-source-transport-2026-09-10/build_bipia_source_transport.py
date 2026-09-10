#!/usr/bin/env python3
"""Build the P26-002 source-composition and transport sensitivity packet."""

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
    "source_frame": "942f08b724528984c704681791868df5d05c63d5",
    "reserve": "0f7fa1dd56695abc46a7b66542339367c1badd99",
    "full_pool_oracle": "b17126c6c503c99dff4d5effe5fc976afdc341bc",
}
SOURCE_HEAD = "2c39aec17c1e368420795371cab2348d4af11a3f"


def git_blob_sha(path: Path) -> str:
    payload = path.read_bytes()
    return hashlib.sha1(f"blob {len(payload)}\0".encode() + payload).hexdigest()


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def canonical_json(value: object) -> bytes:
    text = json.dumps(value, indent=2, sort_keys=True) + "\n"
    text = text.replace("[\n      36,\n      45\n    ]", "[36, 45]")
    return text.encode()


def csv_bytes(rows: list[dict]) -> bytes:
    stream = StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=list(rows[0]), lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue().encode()


@functools.lru_cache(maxsize=None)
def conditional_rejection_power(discordant: int, q: float, alpha: float) -> float:
    if discordant == 0:
        return 0.0
    critical = next(
        (b for b in range(discordant + 1) if binom.sf(b - 1, discordant, 0.5) <= alpha),
        None,
    )
    return 0.0 if critical is None else float(binom.sf(critical - 1, discordant, q))


def operating_characteristic(n: int, assumptions: dict) -> dict:
    alpha = assumptions["alpha_each_co_primary"]
    scenario = assumptions["benefit_scenarios"]["pessimistic"]
    baseline_only = scenario["baseline_only"]
    agenttrial_only = scenario["agenttrial_only"]
    safety_rate = assumptions["safety_true_agenttrial_only_rate"]
    safety_margin = assumptions["safety_margin"]
    discordance = baseline_only + agenttrial_only
    q = baseline_only / discordance
    benefit = float(
        sum(
            binom.pmf(d, n, discordance)
            * conditional_rejection_power(d, q, alpha)
            for d in range(n + 1)
        )
    )
    passing = [
        k
        for k in range(n + 1)
        if (1.0 if k == n else float(beta.ppf(1 - alpha, k + 1, n - k)))
        <= safety_margin
    ]
    max_events = max(passing, default=-1)
    safety = 0.0 if max_events < 0 else float(binom.cdf(max_events, n, safety_rate))
    return {
        "n": n,
        "pessimistic_benefit_power": round(benefit, 9),
        "safety_max_passing_events": max_events,
        "safety_power": round(safety, 9),
        "joint_power_lower_bound": round(max(0.0, benefit + safety - 1), 9),
    }


def zero_event_upper(n: int, alpha: float) -> float:
    return float(beta.ppf(1 - alpha, 1, n))


def composition_row(code_construct: int) -> dict:
    sentinel_construct = 57 - code_construct
    table = 100
    email = 24 + sentinel_construct
    code = code_construct
    n = table + email + code
    weights = {"table": table / n, "email": email / n, "code": code / n}
    target = {"table": 0.5, "email": 0.25, "code": 0.25}
    l1 = sum(abs(weights[key] - target[key]) for key in target)
    return {
        "code_construct_accepted": code_construct,
        "email_sentinel_accepted": sentinel_construct,
        "table_cases": table,
        "email_cases": email,
        "code_cases": code,
        "table_weight": round(weights["table"], 9),
        "email_weight": round(weights["email"], 9),
        "code_weight": round(weights["code"], 9),
        "total_variation_from_full_pool": round(l1 / 2, 9),
        "sharp_bounded_mean_gap": round(l1 / 2, 9),
        "sharp_paired_contrast_gap": round(l1, 9),
    }


def figure(rows: list[dict]) -> bytes:
    width, height = 920, 500
    left, top, chart_w, chart_h = 95, 85, 730, 300
    x = lambda c: left + (c - 31) / 19 * chart_w
    y = lambda v: top + chart_h - (v - 0.04) / 0.05 * chart_h
    tv_points = " ".join(
        f"{x(row['code_construct_accepted']):.2f},{y(row['total_variation_from_full_pool']):.2f}"
        for row in rows
    )
    contrast_points = " ".join(
        f"{x(row['code_construct_accepted']):.2f},{y(row['sharp_paired_contrast_gap']/2):.2f}"
        for row in rows
    )
    ticks = []
    for c in (31, 35, 40, 45, 50):
        ticks.append(f'<text x="{x(c):.2f}" y="414" text-anchor="middle" font-size="13">{c}</text>')
    for v in (0.05, 0.06, 0.07, 0.08):
        ticks.append(f'<text x="82" y="{y(v)+5:.2f}" text-anchor="end" font-size="13">{v:.0%}</text>')
    best = min(rows, key=lambda row: row["total_variation_from_full_pool"])
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title desc">
<title id="title">Composition-only transport gap for feasible 181-case BIPIA frames</title>
<desc id="desc">The sharp bounded-mean gap from the full 200-row pool ranges from 5.25 to 7.87 percentage points as accepted code cases range from 31 to 50.</desc>
<rect width="100%" height="100%" fill="white"/>
<text x="35" y="36" font-size="22" font-weight="700">A pooled 181-case effect depends on which source enters</text>
<text x="35" y="62" font-size="14" fill="#4b5563">Sharp composition-only gap versus the full 200-row source pool</text>
<line x1="{left}" y1="{top+chart_h}" x2="{left+chart_w}" y2="{top+chart_h}" stroke="#475569"/>
<line x1="{left}" y1="{top}" x2="{left}" y2="{top+chart_h}" stroke="#475569"/>
<polyline points="{tv_points}" fill="none" stroke="#2563eb" stroke-width="4"/>
<circle cx="{x(best['code_construct_accepted']):.2f}" cy="{y(best['total_variation_from_full_pool']):.2f}" r="6" fill="#16a34a"/>
<text x="{x(best['code_construct_accepted'])+12:.2f}" y="{y(best['total_variation_from_full_pool'])-10:.2f}" font-size="13" fill="#166534">minimum {best['total_variation_from_full_pool']:.2%}</text>
{''.join(ticks)}
<text x="{left+chart_w/2:.2f}" y="453" text-anchor="middle" font-size="15">Accepted CodeQA construct cases (EmailQA sentinel cases = 57 - x)</text>
<text x="25" y="245" transform="rotate(-90 25 245)" text-anchor="middle" font-size="15">Bounded-mean gap</text>
<text x="95" y="482" font-size="13" fill="#4b5563">For a paired contrast bounded in [-1, 1], the corresponding sharp gap is twice the plotted value.</text>
</svg>
'''.encode()


def report(result: dict) -> bytes:
    s = result["summary"]
    return f'''# P26-002 BIPIA source-composition and transport sensitivity

Date: 2026-09-10  
Status: retrospective pre-execution estimand amendment; no outcomes

## Question

Does the feasible 181-case BIPIA frame identify the same pooled estimand as the full pinned 200-row source pool, and can its joint-power result support claims for each source?

## Source composition

The full pool contains 100 TableQA, 50 EmailQA, and 50 CodeQA cases, with weights 50%, 25%, and 25%. A feasible 181-case frame always contains all 100 TableQA direct cases and any 57 of 76 construct-dependent cases. Depending on construct acceptance, EmailQA and CodeQA can each range from 31 to 50 cases.

The current 181-case frame has weights **55.25% TableQA, 27.62% EmailQA, and 17.13% CodeQA**. Relative to the full pool, its total-variation distance is **{s['current_frame_tv']:.2%}**. For any source-specific scalar outcome bounded in [0, 1], the sharp composition-only difference between the current-frame mean and the full-pool-standardized mean can therefore reach **{s['current_frame_mean_gap']:.2%}**. For a paired contrast bounded in [-1, 1], the sharp gap can reach **{s['current_frame_contrast_gap']:.2%}**.

Across every feasible 181-case composition, the smallest scalar-outcome gap is still **{s['minimum_mean_gap']:.2%}**, attained throughout the plateau from 36 CodeQA and 45 EmailQA cases through 45 CodeQA and 36 EmailQA cases. This irreducible gap comes from keeping all 100 TableQA cases in a frame of 181, which fixes TableQA at 55.25% rather than 50%. Source selection within a stratum can add further bias; these bounds isolate composition only.

## Per-source claim feasibility

The amended planning calculation uses one-sided alpha `0.05` for each of its two co-primary gates and a 5% false-rejection safety margin. At this alpha, a zero-event Clopper-Pearson upper bound falls below 5% only at **n >= {s['minimum_zero_event_n_for_safety']}**. TableQA has 100 cases, but EmailQA and CodeQA have at most 50 each. Their best possible zero-event upper bound is **{s['max_50_zero_event_upper']:.2%}**, so neither source can pass the 5% safety gate separately within this pool.

Under the same pessimistic planning assumptions, the pooled 181-case frame has a joint-power lower bound of **{s['pooled_181_joint_power_lower_bound']:.6f}**. By contrast, the 100-case TableQA stratum has **{s['table_100_joint_power_lower_bound']:.6f}**, and every EmailQA or CodeQA stratum of at most 50 cases has a zero joint lower bound because even zero safety events cannot meet the margin. The pooled power result therefore supports only a predeclared mixture-average claim. It cannot be described as evidence of adequate power for every source or as a transportable common effect.

## Decision-safe estimand contract

1. Keep source-specific paired outcome tables as mandatory descriptive results.
2. If a pooled confirmatory endpoint is retained, define it as the finite-frame average under one frozen source weighting scheme.
3. Use the full-pool 50/25/25 weights only as a standardization target, not as a claim that rejected construct cases were observed or exchangeable.
4. Do not infer source-level noninferiority from the pooled gate.
5. Treat within-source construct selection as unresolved unless a prospective, outcome-blind inclusion rule and its assumptions are accepted.

## Boundary

This is a design sensitivity analysis, not an empirical effect. No construct was approved, no target was executed, and no evaluator outcome or accuracy estimate was created. Comparator coverage remains 76/76 operationally, while construct approval remains 0/76. `mainTrialAllowed=false`, `releaseAllowed=false`, and `submissionAllowed=false` remain unchanged.
'''.encode()


def manuscript_section(result: dict) -> bytes:
    s = result["summary"]
    return f'''## Source composition, estimand, and transport

The pinned BIPIA pool is source-heterogeneous: 100 TableQA, 50 EmailQA, and 50 CodeQA cases. The 181-case planning frame is not a proportional sample of this pool. It retains all 100 TableQA cases and 57 of 76 construct-dependent cases, so its EmailQA and CodeQA counts can each range from 31 to 50. The current frame weights the three sources at 55.25%, 27.62%, and 17.13%, respectively.

We therefore distinguish source-specific paired outcomes from a mixture-average endpoint. Relative to the full-pool 50/25/25 weights, the current composition has total-variation distance {s['current_frame_tv']:.3f}. Consequently, even without selection differences within sources, a bounded outcome mean can differ by as much as {s['current_frame_mean_gap']:.3f}, and a paired contrast bounded in [-1, 1] can differ by as much as {s['current_frame_contrast_gap']:.3f}, solely because the source weights changed. Across all feasible 181-case frames, the smallest such bounded-mean gap is {s['minimum_mean_gap']:.3f}; retaining all 100 TableQA cases makes an exact full-pool weighting impossible.

The pooled planning power must also not be interpreted source by source. With one-sided alpha 0.05 for the safety gate, at least {s['minimum_zero_event_n_for_safety']} independent cases are needed for a zero-event exact upper bound below the 5% false-rejection margin. EmailQA and CodeQA contain at most 50 cases each, for which the zero-event upper bound is {s['max_50_zero_event_upper']:.3f}. Thus the 181-case joint-power lower bound of {s['pooled_181_joint_power_lower_bound']:.3f} applies only to a frozen mixture-average estimand; it does not establish adequate source-level safety or a common effect across sources.
'''.encode()


def amendment() -> bytes:
    return b'''# P26-002 retrospective amendment: source composition and transport

Date: 2026-09-10

This analysis was specified after the 181-case frame, reserve feasibility rule, and full-pool comparator policy existed, but before any trial execution or outcome. It quantifies how feasible construct decisions alter source weights and separates a finite-frame mixture-average estimand from source-specific descriptive results.

The amendment does not replace historical power calculations. It restricts their interpretation: the pooled joint-power result applies only to a frozen mixture weighting and cannot be read as source-level adequacy. Full-pool standardization is a sensitivity target, not an exchangeability claim. No construct approval, execution, outcome, human label, release, merge, or submission is authorized.
'''


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--design", type=Path, required=True)
    parser.add_argument("--source-frame", type=Path, required=True)
    parser.add_argument("--reserve", type=Path, required=True)
    parser.add_argument("--full-pool-oracle", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()

    paths = {
        "design": args.design,
        "source_frame": args.source_frame,
        "reserve": args.reserve,
        "full_pool_oracle": args.full_pool_oracle,
    }
    observed = {name: git_blob_sha(path) for name, path in paths.items()}
    if observed != EXPECTED_BLOBS:
        raise SystemExit(f"input blob mismatch: {observed}")

    design = json.loads(args.design.read_text())
    frame = json.loads(args.source_frame.read_text())
    reserve = json.loads(args.reserve.read_text())
    oracle = json.loads(args.full_pool_oracle.read_text())
    assumptions = design["planning_assumptions"]
    alpha = assumptions["alpha_each_co_primary"]

    rows = [composition_row(code) for code in range(31, 51)]
    current = rows[0]
    best = min(rows, key=lambda row: row["total_variation_from_full_pool"])
    minimum_zero_n = next(n for n in range(1, 1000) if zero_event_upper(n, alpha) <= assumptions["safety_margin"])
    source_oc = [
        {"source": "TableQA", **operating_characteristic(100, assumptions), "zero_event_upper": round(zero_event_upper(100, alpha), 9)},
        {"source": "EmailQA maximum", **operating_characteristic(50, assumptions), "zero_event_upper": round(zero_event_upper(50, alpha), 9)},
        {"source": "CodeQA current", **operating_characteristic(31, assumptions), "zero_event_upper": round(zero_event_upper(31, alpha), 9)},
        {"source": "CodeQA maximum", **operating_characteristic(50, assumptions), "zero_event_upper": round(zero_event_upper(50, alpha), 9)},
        {"source": "Pooled current frame", **operating_characteristic(181, assumptions), "zero_event_upper": round(zero_event_upper(181, alpha), 9)},
    ]
    result = {
        "schema_version": "p26-002-bipia-source-transport/v1",
        "date": "2026-09-10",
        "scope": "retrospective_pre_execution_estimand_and_transport_sensitivity",
        "inputs": {"git_blobs": observed, "source_head": SOURCE_HEAD},
        "full_pool_counts": {"TableQA": 100, "EmailQA": 50, "CodeQA": 50},
        "feasible_181_compositions": rows,
        "source_operating_characteristics": source_oc,
        "summary": {
            "current_frame_tv": current["total_variation_from_full_pool"],
            "current_frame_mean_gap": current["sharp_bounded_mean_gap"],
            "current_frame_contrast_gap": current["sharp_paired_contrast_gap"],
            "minimum_mean_gap": best["sharp_bounded_mean_gap"],
        "minimum_gap_code_case_range": [36, 45],
        "minimum_gap_email_case_range": [36, 45],
            "maximum_mean_gap": max(row["sharp_bounded_mean_gap"] for row in rows),
            "minimum_zero_event_n_for_safety": minimum_zero_n,
            "max_50_zero_event_upper": round(zero_event_upper(50, alpha), 9),
            "pooled_181_joint_power_lower_bound": source_oc[-1]["joint_power_lower_bound"],
            "table_100_joint_power_lower_bound": source_oc[0]["joint_power_lower_bound"],
        },
        "interpretation": {
            "pooled_estimand_requires_frozen_weights": True,
            "pooled_power_implies_source_level_adequacy": False,
            "composition_bound_includes_within_source_selection": False,
            "full_pool_standardization_implies_exchangeability": False,
        },
        "construct_approved": 0,
        "outcomes_created": 0,
        "main_trial_allowed": False,
        "release_allowed": False,
        "submission_allowed": False,
    }

    payloads = {
        "bipia_source_composition_grid.csv": csv_bytes(rows),
        "bipia_source_operating_characteristics.csv": csv_bytes(source_oc),
        "bipia_source_transport.json": canonical_json(result),
        "bipia_source_transport.md": report(result),
        "bipia_source_transport.svg": figure(rows),
        "manuscript_results_section.md": manuscript_section(result),
        "retrospective_amendment_20260910.md": amendment(),
    }
    checks = {
        "input_blobs_exact": observed == EXPECTED_BLOBS,
        "source_rows_200": frame["counts"]["sourceRows"] == 200,
        "current_rows_181": frame["counts"]["selectedRows"] == 181,
        "direct_rows_124": reserve["counts"]["direct_rows"] == 124,
        "construct_rows_76": reserve["counts"]["construct_review_rows"] == 76,
        "minimum_acceptances_57": reserve["counts"]["minimum_construct_acceptances"] == 57,
        "oracle_coverage_76": oracle["counts"]["full_pool_comparator_coverage"] == 76,
        "composition_rows_20": len(rows) == 20,
        "every_frame_n_181": all(row["table_cases"] + row["email_cases"] + row["code_cases"] == 181 for row in rows),
        "table_fixed_100": all(row["table_cases"] == 100 for row in rows),
        "email_range_31_50": {row["email_cases"] for row in rows} == set(range(31, 51)),
        "code_range_31_50": {row["code_cases"] for row in rows} == set(range(31, 51)),
        "current_counts_100_50_31": (current["table_cases"], current["email_cases"], current["code_cases"]) == (100, 50, 31),
        "current_tv_14_over_181": abs(current["total_variation_from_full_pool"] - 14.25 / 181) < 1e-9,
        "minimum_tv_9_5_over_181": abs(best["total_variation_from_full_pool"] - 9.5 / 181) < 1e-9,
        "minimum_gap_plateau_code_36_to_45": all(
            abs(row["total_variation_from_full_pool"] - best["total_variation_from_full_pool"]) < 1e-9
            for row in rows
            if 36 <= row["code_cases"] <= 45
        ),
        "zero_event_minimum_n_59": minimum_zero_n == 59,
        "n58_fails_safety": zero_event_upper(58, alpha) > assumptions["safety_margin"],
        "n59_passes_safety": zero_event_upper(59, alpha) <= assumptions["safety_margin"],
        "email_code_max_50_cannot_pass_safety": zero_event_upper(50, alpha) > assumptions["safety_margin"],
        "pooled_181_matches_design": abs(source_oc[-1]["joint_power_lower_bound"] - 0.82052457) < 1e-9,
        "no_construct_approval": result["construct_approved"] == 0,
        "no_outcomes": result["outcomes_created"] == 0,
        "all_gates_closed": not result["main_trial_allowed"] and not result["release_allowed"] and not result["submission_allowed"],
        "no_em_dash": all(b"\xe2\x80\x94" not in payload for payload in payloads.values()),
    }
    validation = {
        "schema_version": "p26-002-bipia-source-transport-validation/v1",
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
