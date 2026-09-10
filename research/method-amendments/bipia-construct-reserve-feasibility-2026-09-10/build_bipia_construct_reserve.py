#!/usr/bin/env python3
"""Build the P26-002 BIPIA construct-review reserve feasibility packet."""

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
    "source_observation": "085f54f17e3d71771bdfffc593975633c1890edb",
    "source_frame": "942f08b724528984c704681791868df5d05c63d5",
    "oracle_policy": "427cffac17dbc8a69c2195d641ad56749cc28288",
}
SOURCE_HEAD = "b2be79972110cb00bde2aba6c2d80c9135005703"


def git_blob_sha(path: Path) -> str:
    payload = path.read_bytes()
    return hashlib.sha1(f"blob {len(payload)}\0".encode() + payload).hexdigest()


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def canonical_json(value: object) -> bytes:
    text = json.dumps(value, indent=2, sort_keys=True) + "\n"
    for left, right in ((31, 50), (100, 100)):
        expanded = f"[\n      {left},\n      {right}\n    ]"
        text = text.replace(expanded, f"[{left}, {right}]")
    return text.encode()


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
    baseline_only = assumptions["benefit_scenarios"]["pessimistic"]["baseline_only"]
    agenttrial_only = assumptions["benefit_scenarios"]["pessimistic"]["agenttrial_only"]
    safety_rate = assumptions["safety_true_agenttrial_only_rate"]
    safety_margin = assumptions["safety_margin"]
    discordance = baseline_only + agenttrial_only
    q = baseline_only / discordance
    benefit = float(
        sum(
            binom.pmf(d, n, discordance) * conditional_rejection_power(d, q, alpha)
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
    joint = max(0.0, benefit + safety - 1)
    return {
        "n": n,
        "pessimistic_benefit_power": round(benefit, 9),
        "safety_power": round(safety, 9),
        "safety_max_passing_events": max_events,
        "joint_power_lower_bound": round(joint, 9),
        "joint_target_met": joint >= assumptions["target_joint_power_lower_bound"],
    }


def csv_bytes(rows: list[dict]) -> bytes:
    stream = StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=list(rows[0]), lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue().encode()


def reserve_ledger(observation: dict, oracle: dict) -> list[dict]:
    construct = [
        row
        for row in observation["rows"]
        if row["idealClass"] in {"unknown_sentinel", "full_code_reference"}
    ]
    unknown = sorted(
        (row for row in construct if row["idealClass"] == "unknown_sentinel"),
        key=lambda row: row["rowSha256"],
    )
    code = sorted(
        (row for row in construct if row["idealClass"] == "full_code_reference"),
        key=lambda row: row["rowSha256"],
    )
    ordered = unknown + code
    oracle_covered = oracle["counts"]["casesCoveredByDeterministicComparator"]
    rows = []
    for priority, row in enumerate(ordered, 1):
        current_selected = bool(row["selected"])
        rows.append(
            {
                "priority": priority,
                "candidate_id": row["candidateId"],
                "dataset": row["dataset"],
                "row_index": row["rowIndex"],
                "ideal_class": row["idealClass"],
                "row_sha256": row["rowSha256"],
                "current_selected": current_selected,
                "reserve_role": "current_frame" if current_selected else "code_reserve",
                "current_oracle_policy_covered": current_selected and priority <= oracle_covered,
                "construct_approved": False,
            }
        )
    return rows


def figure() -> bytes:
    width, height = 920, 570
    left, top, chart_w, chart_h = 105, 90, 700, 360
    x = lambda code: left + code / 50 * chart_w
    y = lambda unknown: top + chart_h - unknown / 26 * chart_h
    cells = []
    for code in range(51):
        for unknown in range(27):
            color = "#dbeafe" if code + unknown >= 57 else "#f3f4f6"
            cells.append(
                f'<rect x="{x(code)-5:.2f}" y="{y(unknown)-5:.2f}" width="10" height="10" fill="{color}"/>'
            )
    ticks = []
    for code in (0, 10, 20, 30, 40, 50):
        ticks.append(f'<text x="{x(code):.2f}" y="476" text-anchor="middle" font-size="13">{code}</text>')
    for unknown in (0, 5, 10, 15, 20, 26):
        ticks.append(f'<text x="88" y="{y(unknown)+5:.2f}" text-anchor="end" font-size="13">{unknown}</text>')
    boundary = " ".join(
        f"{x(code):.2f},{y(57-code):.2f}" for code in range(31, 51)
    )
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title desc">
<title id="title">BIPIA construct acceptance combinations needed for a 181-case frame</title>
<desc id="desc">At least 57 of 76 construct-review cases must be accepted, including at least 31 code cases and 7 unknown-sentinel cases.</desc>
<rect width="100%" height="100%" fill="white"/>
<text x="30" y="34" font-size="22" font-weight="700">The 19-row reserve does not remove either construct dependency</text>
<text x="30" y="60" font-size="14" fill="#4b5563">Blue combinations can supply 57 construct cases; gray combinations cannot</text>
{''.join(cells)}
<polyline points="{boundary}" fill="none" stroke="#1d4ed8" stroke-width="4"/>
<circle cx="{x(31):.2f}" cy="{y(26):.2f}" r="7" fill="#7c3aed"/>
<circle cx="{x(50):.2f}" cy="{y(7):.2f}" r="7" fill="#ea580c"/>
<circle cx="{x(50):.2f}" cy="{y(26):.2f}" r="7" fill="#16a34a"/>
{''.join(ticks)}
<text x="{left + chart_w/2:.2f}" y="515" text-anchor="middle" font-size="15">Code-reference cases accepted (maximum 50)</text>
<text x="24" y="270" transform="rotate(-90 24 270)" text-anchor="middle" font-size="15">Unknown-sentinel cases accepted (maximum 26)</text>
<text x="105" y="548" font-size="13" fill="#4b5563">Sharp condition: accepted code + accepted sentinel >= 57. Current approvals: 0/76.</text>
</svg>
'''.encode()


def report(result: dict) -> bytes:
    s = result["scenarios"]
    c = result["counts"]
    return f'''# P26-002 BIPIA construct-review reserve feasibility

Date: 2026-09-10  
Status: retrospective pre-execution design amendment; candidate reserve rule not activated

## Question

Can the 19 unselected BIPIA CodeQA rows protect the exact 181-case design against construct-review rejection without changing endpoints or using outcomes?

## Exact source accounting

The pinned BIPIA pool has 200 rows: 124 direct short-answer rows and 76 construct-review-dependent rows. The current 181-row frame uses all 124 direct rows, all 26 `unknown` sentinel rows, and 31 of 50 code-reference rows. The remaining 19 code-reference rows are the only within-source reserve.

An outcome-blind reserve rule can preserve exactly 181 rows only if construct review accepts at least 57 of the 76 dependent rows. This is {c['minimum_construct_acceptance_fraction']:.1%} of the construct pool and permits at most {c['maximum_construct_rejections']} rejections. Because there are at most 26 sentinel rows and 50 code rows, every feasible 181-row frame necessarily retains at least {c['minimum_unknown_acceptances']} sentinels and {c['minimum_code_acceptances']} code references. The reserve therefore reduces case-level fragility but cannot remove either construct question.

## Operating-characteristic consequences

| Scenario                             | Maximum usable n | Joint-power lower bound | Decision               |
| ------------------------------------ | ---------------: | ----------------------: | ---------------------- |
| At least 57 construct cases accepted | {s['minimum_confirmatory']['n']:>16} | {s['minimum_confirmatory']['joint_power_lower_bound']:>23.6f} | passes planning target |
| All 26 sentinels rejected            | {s['all_unknown_rejected']['n']:>16} | {s['all_unknown_rejected']['joint_power_lower_bound']:>23.6f} | fails                  |
| All 50 code references rejected      | {s['all_code_rejected']['n']:>16} | {s['all_code_rejected']['joint_power_lower_bound']:>23.6f} | fails                  |
| All 76 construct cases rejected      | {s['all_construct_rejected']['n']:>16} | {s['all_construct_rejected']['joint_power_lower_bound']:>23.6f} | fails                  |

For a fixed 181-row analysis frame, the dataset composition is not fixed by the reserve rule. TableQA remains 100 rows, while EmailQA and CodeQA can each range from 31 to 50 rows depending on construct decisions. Source-stratified estimates therefore remain necessary; the reserve rule does not establish transport.

## Operational gap

The current deterministic oracle policy covers the 57 construct cases in the present frame but not the 19 reserve CodeQA rows. Thus the reserve rule is numerically defined but not operationally complete. Activating it would require pre-outcome construct review of all 76 dependent rows, deterministic comparator coverage for any reserve row that can enter, and method approval. None is inferred here.

## Candidate rule for prospective consideration

Keep all 124 direct rows. Review all 76 construct-dependent rows before any execution or outcome. Rank eligible construct rows with the existing source rule: sentinel rows first, then code rows by canonical row SHA-256. Retain the first 57 approved rows. If fewer than 57 are approved, do not call the frame confirmatory under the frozen design.

This candidate rule is recorded after the current design and source frame. It is not represented as preregistered, approved, or active.

## Boundaries

- Powers are planning operating characteristics, not observed effects.
- `construct_approved=false` remains recorded for every ledger row.
- No execution, response, trial outcome, human label, release, merge, or submission was created.
- `mainTrialAllowed=false`, `releaseAllowed=false`, and `submissionAllowed=false` remain unchanged.
'''.encode()


def amendment() -> bytes:
    return b'''# P26-002 retrospective amendment: BIPIA construct-review reserve feasibility

Date: 2026-09-10

This analysis was specified after the exact n=181 design, the 181-row BIPIA source frame, and its 57-case deterministic oracle policy existed. It evaluates whether the 19 previously unselected CodeQA rows could serve as an outcome-blind reserve if construct review rejects candidate cases.

The amendment does not change the historical protocol or activate a reserve. It records a reversible candidate rule for prospective consideration before any execution or outcome: retain all 124 direct rows and the first 57 construct-approved rows under the existing sentinel-first and code-hash order. Fewer than 57 approvals fail the frozen confirmatory target.

No construct decision, comparator extension, execution, outcome, independent review, release, merge, or submission authorization is created. All gates remain fail closed.
'''


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--design", type=Path, required=True)
    parser.add_argument("--source-observation", type=Path, required=True)
    parser.add_argument("--source-frame", type=Path, required=True)
    parser.add_argument("--oracle-policy", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()

    paths = {
        "design": args.design,
        "source_observation": args.source_observation,
        "source_frame": args.source_frame,
        "oracle_policy": args.oracle_policy,
    }
    observed_blobs = {name: git_blob_sha(path) for name, path in paths.items()}
    if observed_blobs != EXPECTED_BLOBS:
        raise SystemExit(f"input blob mismatch: {observed_blobs}")

    design = json.loads(args.design.read_text())
    observation = json.loads(args.source_observation.read_text())
    frame = json.loads(args.source_frame.read_text())
    oracle = json.loads(args.oracle_policy.read_text())
    assumptions = design["planning_assumptions"]
    direct = frame["counts"]["shortAnswerAvailable"]
    construct = frame["counts"]["unknownSentinelAvailable"] + frame["counts"]["codeReferenceAvailable"]
    confirmatory_n = design["frame_feasibility"]["confirmatory_n"]
    needed_construct = confirmatory_n - direct
    reserve = len(observation["rows"]) - confirmatory_n
    ledger = reserve_ledger(observation, oracle)

    feasibility = []
    for rejected in range(construct + 1):
        approved = construct - rejected
        usable_n = direct + approved
        oc = operating_characteristic(usable_n, assumptions)
        feasibility.append(
            {
                "construct_cases_rejected": rejected,
                "construct_cases_accepted": approved,
                "maximum_usable_n": usable_n,
                "source_can_supply_181": usable_n >= confirmatory_n,
                "pessimistic_benefit_power_at_maximum_n": oc["pessimistic_benefit_power"],
                "safety_power_at_maximum_n": oc["safety_power"],
                "safety_max_passing_events": oc["safety_max_passing_events"],
                "joint_power_lower_bound_at_maximum_n": oc["joint_power_lower_bound"],
                "joint_target_met_at_maximum_n": oc["joint_target_met"],
            }
        )

    result = {
        "schema_version": "p26-002-bipia-construct-reserve-feasibility/v1",
        "date": "2026-09-10",
        "scope": "retrospective_pre_execution_reserve_feasibility_no_outcomes",
        "inputs": {"git_blobs": observed_blobs, "source_head": SOURCE_HEAD},
        "counts": {
            "source_rows": len(observation["rows"]),
            "direct_rows": direct,
            "construct_review_rows": construct,
            "current_selected_construct_rows": frame["counts"]["constructReviewRequired"],
            "within_source_code_reserve_rows": reserve,
            "current_oracle_covered_construct_rows": oracle["counts"]["casesCoveredByDeterministicComparator"],
            "reserve_oracle_covered_rows": sum(row["current_oracle_policy_covered"] for row in ledger if row["reserve_role"] == "code_reserve"),
            "minimum_construct_acceptances": needed_construct,
            "minimum_construct_acceptance_fraction": needed_construct / construct,
            "maximum_construct_rejections": reserve,
            "minimum_unknown_acceptances": needed_construct - frame["counts"]["codeReferenceAvailable"],
            "minimum_code_acceptances": needed_construct - frame["counts"]["unknownSentinelAvailable"],
        },
        "fixed_181_composition_bounds": {
            "table_rows": [100, 100],
            "email_rows": [31, 50],
            "code_rows": [31, 50],
        },
        "candidate_reserve_rule": {
            "status": "not_activated_pending_pre_outcome_construct_and_method_review",
            "direct_rows_retained": direct,
            "construct_rows_needed": needed_construct,
            "priority": "unknown_sentinel_by_row_sha256_then_full_code_reference_by_row_sha256",
            "selection_uses_agent_outcomes": False,
            "failure_rule": "fewer_than_57_construct_approvals_is_not_confirmatory",
        },
        "scenarios": {
            "all_source_rows": operating_characteristic(200, assumptions),
            "minimum_confirmatory": operating_characteristic(181, assumptions),
            "all_unknown_rejected": operating_characteristic(174, assumptions),
            "all_code_rejected": operating_characteristic(150, assumptions),
            "all_construct_rejected": operating_characteristic(124, assumptions),
        },
        "construct_review_complete": False,
        "outcomes_created": 0,
        "main_trial_allowed": False,
        "release_allowed": False,
        "submission_allowed": False,
    }

    payloads = {
        "bipia_construct_reserve_ledger.csv": csv_bytes(ledger),
        "bipia_construct_reserve_feasibility.csv": csv_bytes(feasibility),
        "bipia_construct_reserve.json": canonical_json(result),
        "bipia_construct_reserve.md": report(result),
        "bipia_construct_reserve.svg": figure(),
        "retrospective_amendment_20260910.md": amendment(),
    }
    checks = {
        "input_blobs_exact": observed_blobs == EXPECTED_BLOBS,
        "source_pool_200": len(observation["rows"]) == 200,
        "direct_124": direct == 124,
        "construct_76": construct == 76,
        "ledger_76": len(ledger) == 76,
        "current_construct_57": sum(row["current_selected"] for row in ledger) == 57,
        "reserve_19": sum(row["reserve_role"] == "code_reserve" for row in ledger) == 19,
        "reserve_all_code": all(row["ideal_class"] == "full_code_reference" for row in ledger if row["reserve_role"] == "code_reserve"),
        "reserve_oracle_coverage_zero": result["counts"]["reserve_oracle_covered_rows"] == 0,
        "minimum_acceptances_57": needed_construct == 57,
        "maximum_rejections_19": reserve == 19,
        "minimum_unknown_7": result["counts"]["minimum_unknown_acceptances"] == 7,
        "minimum_code_31": result["counts"]["minimum_code_acceptances"] == 31,
        "feasibility_curve_77": len(feasibility) == 77,
        "only_rejections_0_through_19_supply_181": [row["construct_cases_rejected"] for row in feasibility if row["source_can_supply_181"]] == list(range(20)),
        "n181_joint_matches": result["scenarios"]["minimum_confirmatory"]["joint_power_lower_bound"] == 0.82052457,
        "n174_joint_matches": result["scenarios"]["all_unknown_rejected"]["joint_power_lower_bound"] == 0.744497452,
        "n150_joint_matches": result["scenarios"]["all_code_rejected"]["joint_power_lower_bound"] == 0.593322769,
        "all_construct_flags_false": all(not row["construct_approved"] for row in ledger),
        "no_outcomes": result["outcomes_created"] == 0,
        "all_gates_closed": not result["main_trial_allowed"] and not result["release_allowed"] and not result["submission_allowed"],
        "no_em_dash": all(b"\xe2\x80\x94" not in payload for payload in payloads.values()),
    }
    validation = {
        "schema_version": "p26-002-bipia-construct-reserve-validation/v1",
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
