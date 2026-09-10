#!/usr/bin/env python3
"""Build sharp finite-frame selection bounds for the P26-002 BIPIA pool."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from io import StringIO
from pathlib import Path


EXPECTED_BLOBS = {
    "design": "6b668735a10aeb92786a9f808c35ea9eb6c792af",
    "reserve": "0f7fa1dd56695abc46a7b66542339367c1badd99",
    "transport": "488ce45560dc6e60b2e65691edf87ffaf740eab7",
}
SOURCE_HEAD = "f0502c9fabbe96e0588525d508d06c39cc6eee62"


def git_blob_sha(path: Path) -> str:
    payload = path.read_bytes()
    return hashlib.sha1(f"blob {len(payload)}\0".encode() + payload).hexdigest()


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def canonical_json(value: object) -> bytes:
    text = json.dumps(value, indent=2, sort_keys=True) + "\n"
    for values in ([31, 50], [40, 41]):
        expanded = "[\n      " + ",\n      ".join(str(value) for value in values) + "\n    ]"
        text = text.replace(expanded, "[" + ", ".join(str(value) for value in values) + "]")
    return text.encode()


def csv_bytes(rows: list[dict]) -> bytes:
    stream = StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=list(rows[0]), lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue().encode()


def selection_row(code_selected: int) -> dict:
    email_selected = 81 - code_selected
    email_missing = 50 - email_selected
    code_missing = 50 - code_selected
    return {
        "code_selected": code_selected,
        "email_selected": email_selected,
        "table_selected": 100,
        "code_missing": code_missing,
        "email_missing": email_missing,
        "total_missing": code_missing + email_missing,
        "full_pool_bounded_mean_interval_width": round((code_missing + email_missing) / 200, 9),
        "full_pool_paired_contrast_interval_width": round(2 * (code_missing + email_missing) / 200, 9),
        "code_bounded_mean_interval_width": round(code_missing / 50, 9),
        "email_bounded_mean_interval_width": round(email_missing / 50, 9),
        "worst_source_bounded_mean_interval_width": round(max(code_missing, email_missing) / 50, 9),
        "worst_source_paired_contrast_interval_width": round(2 * max(code_missing, email_missing) / 50, 9),
    }


def safety_row(selected_failures: int) -> dict:
    missing = 19
    max_total_for_five_percent = 10
    maximum_failures = selected_failures + missing
    required_missing_nonfailures = max(0, missing - (max_total_for_five_percent - selected_failures))
    return {
        "selected_failures_among_181": selected_failures,
        "full_pool_rate_lower": round(selected_failures / 200, 9),
        "full_pool_rate_upper": round(maximum_failures / 200, 9),
        "missing_cases_that_must_be_resolved_as_nonfailures_for_empirical_rate_at_most_5_percent": required_missing_nonfailures,
        "worst_case_meets_empirical_5_percent": maximum_failures <= max_total_for_five_percent,
    }


def figure(rows: list[dict]) -> bytes:
    width, height = 920, 500
    left, top, chart_w, chart_h = 95, 85, 730, 300
    x = lambda c: left + (c - 31) / 19 * chart_w
    y = lambda v: top + chart_h - v / 0.40 * chart_h
    source_points = " ".join(
        f"{x(row['code_selected']):.2f},{y(row['worst_source_bounded_mean_interval_width']):.2f}"
        for row in rows
    )
    overall_points = " ".join(
        f"{x(row['code_selected']):.2f},{y(row['full_pool_bounded_mean_interval_width']):.2f}"
        for row in rows
    )
    ticks = []
    for c in (31, 35, 40, 45, 50):
        ticks.append(f'<text x="{x(c):.2f}" y="414" text-anchor="middle" font-size="13">{c}</text>')
    for v in (0.0, 0.1, 0.2, 0.3, 0.4):
        ticks.append(f'<text x="82" y="{y(v)+5:.2f}" text-anchor="end" font-size="13">{v:.0%}</text>')
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title desc">
<title id="title">Sharp selection-bound widths across feasible 181-case BIPIA frames</title>
<desc id="desc">The full-pool bounded-mean interval width is always 9.5 percent. The worst source-specific interval width is at least 20 percent and is 38 percent for the current frame.</desc>
<rect width="100%" height="100%" fill="white"/>
<text x="35" y="36" font-size="22" font-weight="700">Balancing sources cannot identify outcomes for excluded cases</text>
<text x="35" y="62" font-size="14" fill="#4b5563">Sharp interval width with no assumption on the 19 excluded construct cases</text>
<line x1="{left}" y1="{top+chart_h}" x2="{left+chart_w}" y2="{top+chart_h}" stroke="#475569"/>
<line x1="{left}" y1="{top}" x2="{left}" y2="{top+chart_h}" stroke="#475569"/>
<polyline points="{source_points}" fill="none" stroke="#dc2626" stroke-width="4"/>
<polyline points="{overall_points}" fill="none" stroke="#2563eb" stroke-width="4"/>
<circle cx="{x(31):.2f}" cy="{y(0.38):.2f}" r="6" fill="#991b1b"/>
<circle cx="{x(40):.2f}" cy="{y(0.20):.2f}" r="6" fill="#16a34a"/>
<text x="115" y="111" font-size="13" fill="#991b1b">worst source: 38% current, minimum 20%</text>
<text x="610" y="{y(0.095)-10:.2f}" font-size="13" fill="#1d4ed8">full pool: 9.5%</text>
{''.join(ticks)}
<text x="{left+chart_w/2:.2f}" y="453" text-anchor="middle" font-size="15">Selected CodeQA cases (selected EmailQA cases = 81 - x)</text>
<text x="25" y="245" transform="rotate(-90 25 245)" text-anchor="middle" font-size="15">Bounded-outcome interval width</text>
<text x="95" y="482" font-size="13" fill="#4b5563">Paired-contrast widths are twice these values because the contrast is bounded in [-1, 1].</text>
</svg>
'''.encode()


def report(result: dict) -> bytes:
    s = result["summary"]
    return f'''# P26-002 BIPIA sharp selection bounds

Date: 2026-09-10  
Status: retrospective pre-execution partial-identification analysis; no outcomes

## Question

How much uncertainty remains when a confirmatory frame retains 181 of the 200 pinned BIPIA cases and the 19 excluded construct cases have no outcomes?

## Sharp finite-frame bounds

Let `m181` be a bounded outcome mean among the selected 181 cases. With no assumption about the 19 excluded cases, the full-pool mean lies in `[181*m181/200, (181*m181+19)/200]`. The interval width is therefore **{s['full_pool_mean_interval_width']:.1%}**. For a paired contrast bounded in [-1, 1], the corresponding interval width is **{s['full_pool_contrast_interval_width']:.1%}**.

These bounds are sharp: every value in the interval can be attained by assigning admissible outcomes to the excluded cases. They are conditional formulas, not confidence intervals, and they do not require observed trial outcomes.

## Source-specific consequences

The current frame observes all 50 EmailQA cases but only 31 of 50 CodeQA cases. Consequently, a bounded CodeQA mean has interval width **{s['current_worst_source_mean_width']:.1%}**, and a CodeQA paired contrast has width **{s['current_worst_source_contrast_width']:.1%}**. Moving construct acceptances between EmailQA and CodeQA trades uncertainty between the two sources. The best balance occurs at 40 or 41 selected CodeQA cases, but the larger source-specific mean width is still **{s['minimum_worst_source_mean_width']:.1%}** and the paired-contrast width is still **{s['minimum_worst_source_contrast_width']:.1%}**.

Source balancing therefore reduces the largest source-specific ignorance region from 38% to 20%, but cannot identify a source-level effect. The prior composition bounds and these selection bounds address different mechanisms: composition changes the weights of observed sources, while selection leaves outcomes missing within a source.

## Safety interpretation

Even if the selected 181 cases produced zero false rejections, the full 200-row finite pool could contain 19 failures, for a worst-case empirical rate of **9.5%**. The worst-case full-pool rate ranges from 9.5% to 11.5% over the 0 through 4 selected failures allowed by the pooled planning gate. To guarantee an empirical full-pool rate no greater than 5% with zero selected failures, at least **9 of the 19** excluded cases would have to be resolved as non-failures; more are required when selected failures occur.

This finite-frame statement is not a replacement for the registered exact upper confidence bound. It shows that the pooled 181-case safety result cannot be transported to the full pool under unrestricted missing outcomes.

## Decision-safe contract

1. Label any 181-case claim as applying to that selected finite frame.
2. Report the 200-row full-pool partial-identification interval when excluded outcomes remain unavailable.
3. Report EmailQA and CodeQA bounds separately; do not substitute source balance for missing-outcome assumptions.
4. Do not call the 181-case safety gate evidence for the full source pool without a declared missingness restriction.

## Boundary

No missing outcome was imputed, no construct was approved, and no target was executed. The bounds do not assess comparator accuracy, semantic validity, or exchangeability. `mainTrialAllowed=false`, `releaseAllowed=false`, and `submissionAllowed=false` remain unchanged.
'''.encode()


def manuscript_section(result: dict) -> bytes:
    s = result["summary"]
    return f'''## Partial identification under construct-based exclusion

The 181-case analysis frame excludes 19 of the 200 pinned BIPIA cases. We did not assume that excluded construct cases were exchangeable with retained cases and did not impute their outcomes. If `m181` denotes a retained-case outcome mean bounded in [0, 1], the full-pool mean is identified only within `[181*m181/200, (181*m181+19)/200]`, an interval {s['full_pool_mean_interval_width']:.3f} wide. For a paired contrast bounded in [-1, 1], the analogous interval is {s['full_pool_contrast_interval_width']:.3f} wide.

The uncertainty is larger within individual sources. In the current frame, 19 of 50 CodeQA cases are excluded, yielding a sharp {s['current_worst_source_mean_width']:.3f}-wide interval for a bounded CodeQA mean and a {s['current_worst_source_contrast_width']:.3f}-wide interval for its paired contrast. Redistributing the 57 retained construct cases can minimize the larger EmailQA or CodeQA mean interval at {s['minimum_worst_source_mean_width']:.3f}, attained when 40 or 41 CodeQA cases are retained, but it cannot eliminate partial identification.

These are finite-frame identification bounds rather than confidence intervals. They isolate uncertainty from missing outcomes and complement the separate sensitivity analysis for changed source weights. Accordingly, pooled results are restricted to the selected 181-case frame unless a missingness assumption is declared and justified.
'''.encode()


def amendment() -> bytes:
    return b'''# P26-002 retrospective amendment: sharp bounds for construct-based exclusion

Date: 2026-09-10

This partial-identification analysis was specified after the 181-case frame, reserve rule, full-pool comparator policy, and source-composition sensitivity existed, but before any trial execution or outcome. It treats all 19 excluded outcomes as unrestricted within their natural bounds and reports finite-frame identification intervals.

The analysis does not revise historical gates or impute outcomes. It limits interpretation by separating the selected-frame estimand from the full 200-row pool and by keeping EmailQA and CodeQA ignorance regions explicit. No construct approval, execution, outcome, human label, release, merge, or submission is authorized.
'''


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--design", type=Path, required=True)
    parser.add_argument("--reserve", type=Path, required=True)
    parser.add_argument("--transport", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()

    paths = {"design": args.design, "reserve": args.reserve, "transport": args.transport}
    observed = {name: git_blob_sha(path) for name, path in paths.items()}
    if observed != EXPECTED_BLOBS:
        raise SystemExit(f"input blob mismatch: {observed}")

    design = json.loads(args.design.read_text())
    reserve = json.loads(args.reserve.read_text())
    transport = json.loads(args.transport.read_text())
    rows = [selection_row(code) for code in range(31, 51)]
    current = rows[0]
    minimum_worst = min(row["worst_source_bounded_mean_interval_width"] for row in rows)
    minimizers = [row["code_selected"] for row in rows if row["worst_source_bounded_mean_interval_width"] == minimum_worst]
    safety = [safety_row(k) for k in range(5)]
    result = {
        "schema_version": "p26-002-bipia-sharp-selection-bounds/v1",
        "date": "2026-09-10",
        "scope": "retrospective_pre_execution_partial_identification",
        "inputs": {"git_blobs": observed, "source_head": SOURCE_HEAD},
        "formulas": {
            "bounded_mean": "[n*m/N, (n*m + N-n)/N]",
            "paired_contrast": "[n*d/N - (N-n)/N, n*d/N + (N-n)/N]",
        },
        "composition_grid": rows,
        "finite_frame_safety_grid": safety,
        "summary": {
            "full_pool_mean_interval_width": current["full_pool_bounded_mean_interval_width"],
            "full_pool_contrast_interval_width": current["full_pool_paired_contrast_interval_width"],
            "current_worst_source_mean_width": current["worst_source_bounded_mean_interval_width"],
            "current_worst_source_contrast_width": current["worst_source_paired_contrast_interval_width"],
            "minimum_worst_source_mean_width": minimum_worst,
            "minimum_worst_source_contrast_width": 2 * minimum_worst,
            "minimizing_code_selected": minimizers,
            "zero_selected_failure_full_pool_rate_upper": safety[0]["full_pool_rate_upper"],
            "four_selected_failures_full_pool_rate_upper": safety[4]["full_pool_rate_upper"],
            "minimum_excluded_nonfailures_needed_when_selected_failures_zero": safety[0]["missing_cases_that_must_be_resolved_as_nonfailures_for_empirical_rate_at_most_5_percent"],
        },
        "interpretation": {
            "bounds_are_confidence_intervals": False,
            "bounds_are_sharp_under_natural_ranges": True,
            "missingness_assumption_used": False,
            "source_balance_identifies_source_effects": False,
        },
        "construct_approved": 0,
        "outcomes_created": 0,
        "main_trial_allowed": False,
        "release_allowed": False,
        "submission_allowed": False,
    }

    payloads = {
        "bipia_selection_bound_grid.csv": csv_bytes(rows),
        "bipia_finite_frame_safety_grid.csv": csv_bytes(safety),
        "bipia_sharp_selection_bounds.json": canonical_json(result),
        "bipia_sharp_selection_bounds.md": report(result),
        "bipia_sharp_selection_bounds.svg": figure(rows),
        "manuscript_results_section.md": manuscript_section(result),
        "retrospective_amendment_20260910.md": amendment(),
    }
    checks = {
        "input_blobs_exact": observed == EXPECTED_BLOBS,
        "source_pool_200": sum(transport["full_pool_counts"].values()) == 200,
        "retained_181": reserve["counts"]["direct_rows"] + reserve["counts"]["minimum_construct_acceptances"] == 181,
        "excluded_19": reserve["counts"]["maximum_construct_rejections"] == 19,
        "composition_rows_20": len(rows) == 20,
        "every_row_missing_19": all(row["total_missing"] == 19 for row in rows),
        "current_code_selected_31": current["code_selected"] == 31,
        "current_email_selected_50": current["email_selected"] == 50,
        "current_source_width_38_percent": current["worst_source_bounded_mean_interval_width"] == 0.38,
        "full_pool_mean_width_9_5_percent": current["full_pool_bounded_mean_interval_width"] == 0.095,
        "full_pool_contrast_width_19_percent": current["full_pool_paired_contrast_interval_width"] == 0.19,
        "minimum_worst_source_width_20_percent": minimum_worst == 0.20,
        "minimum_at_code_40_or_41": minimizers == [40, 41],
        "source_widths_symmetric": all(rows[i]["worst_source_bounded_mean_interval_width"] == rows[-1-i]["worst_source_bounded_mean_interval_width"] for i in range(20)),
        "safety_rows_0_to_4": [row["selected_failures_among_181"] for row in safety] == list(range(5)),
        "zero_failure_upper_9_5_percent": safety[0]["full_pool_rate_upper"] == 0.095,
        "four_failure_upper_11_5_percent": safety[4]["full_pool_rate_upper"] == 0.115,
        "nine_excluded_nonfailures_needed_at_zero": safety[0]["missing_cases_that_must_be_resolved_as_nonfailures_for_empirical_rate_at_most_5_percent"] == 9,
        "pooled_gate_allows_four_selected_failures": design["operating_characteristics"]["checkpoints"]["181"]["safety"]["max_passing_events"] == 4,
        "no_missingness_assumption": result["interpretation"]["missingness_assumption_used"] is False,
        "no_construct_approval": result["construct_approved"] == 0,
        "no_outcomes": result["outcomes_created"] == 0,
        "all_gates_closed": not result["main_trial_allowed"] and not result["release_allowed"] and not result["submission_allowed"],
        "no_em_dash": all(b"\xe2\x80\x94" not in payload for payload in payloads.values()),
    }
    validation = {
        "schema_version": "p26-002-bipia-sharp-selection-bounds-validation/v1",
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
