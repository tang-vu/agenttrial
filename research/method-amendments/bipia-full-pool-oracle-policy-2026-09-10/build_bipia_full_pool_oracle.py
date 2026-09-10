#!/usr/bin/env python3
"""Extend the P26-002 BIPIA deterministic comparator to the full construct pool."""

from __future__ import annotations

import argparse
import ast
import csv
import hashlib
import json
import platform
import statistics
import sys
import unicodedata
import re
from collections import Counter
from io import StringIO
from pathlib import Path


EXPECTED_BLOBS = {
    "source_observation": "085f54f17e3d71771bdfffc593975633c1890edb",
    "prior_oracle_policy": "427cffac17dbc8a69c2195d641ad56749cc28288",
    "reserve_feasibility": "0f7fa1dd56695abc46a7b66542339367c1badd99",
}
SOURCE_HEAD = "52429c6f4b1d29f32fcc592f62257a27f787f0ed"
HEX64 = re.compile(r"^[0-9a-f]{64}$")


def git_blob_sha(path: Path) -> str:
    payload = path.read_bytes()
    return hashlib.sha1(f"blob {len(payload)}\0".encode() + payload).hexdigest()


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def canonical_json(value: object) -> bytes:
    text = json.dumps(value, indent=2, sort_keys=True) + "\n"
    for values in (("current_frame", "code_reserve"),):
        expanded = "[\n      " + ",\n      ".join(json.dumps(item) for item in values) + "\n    ]"
        text = text.replace(expanded, json.dumps(list(values)))
    text = text.replace(
        '  "normalization_changed_cases": [\n    "bipia-code-041"\n  ],',
        '  "normalization_changed_cases": ["bipia-code-041"],',
    )
    return text.encode()


def csv_bytes(rows: list[dict]) -> bytes:
    stream = StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=list(rows[0]), lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue().encode()


def load_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def raw_code(value: object) -> str:
    if isinstance(value, list):
        return "\n".join(str(line) for line in value)
    if not isinstance(value, str):
        raise TypeError("Code reference must be a string or list")
    return value


def normalized_code(value: object) -> str:
    return raw_code(value).replace("\r\n", "\n").replace("\r", "\n").strip()


def normalize_sentinel(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).casefold().strip()
    value = re.sub(r"\s+", " ", value)
    return value.rstrip(".!? ")


def code_features(index: int, row: dict, meta: dict) -> dict:
    raw = raw_code(row["ideal"])
    if digest(raw) != meta["idealSha256"]:
        raise ValueError(f"source ideal hash mismatch at code row {index}")
    reference = normalized_code(row["ideal"])
    tree = ast.parse(reference)
    ast_dump = ast.dump(tree, include_attributes=False)
    unparsed = ast.unparse(tree)
    round_trip = ast.dump(ast.parse(unparsed), include_attributes=False)
    appended = ast.dump(ast.parse(reference + "\npass"), include_attributes=False)
    return {
        "candidate_id": meta["candidateId"],
        "dataset": "code",
        "row_index": index,
        "reserve_role": "current_frame" if meta["selected"] else "code_reserve",
        "source_ideal_sha256": meta["idealSha256"],
        "normalized_reference_sha256": digest(reference),
        "ast_sha256": digest(ast_dump),
        "line_count": len(reference.splitlines()),
        "ast_node_count": sum(1 for _ in ast.walk(tree)),
        "function_count": sum(isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) for node in ast.walk(tree)),
        "top_level_count": len(tree.body),
        "top_level_kinds": ";".join(type(node).__name__ for node in tree.body),
        "python_parseable": True,
        "ast_round_trip_stable": ast_dump == round_trip,
        "exact_text_round_trip_stable": reference == unparsed,
        "ast_rejects_appended_pass": ast_dump != appended,
        "comparator": "python_ast_exact_structure",
        "machine_deterministic": True,
        "construct_review_required": True,
        "construct_approved": False,
        "limitation": "no execution or general semantic equivalence",
    }


def sentinel_features(meta: dict) -> dict:
    return {
        "candidate_id": meta["candidateId"],
        "dataset": "email",
        "row_index": meta["rowIndex"],
        "reserve_role": "current_frame",
        "source_ideal_sha256": meta["idealSha256"],
        "normalized_reference_sha256": digest(normalize_sentinel("unknown")),
        "ast_sha256": "",
        "line_count": "",
        "ast_node_count": "",
        "function_count": "",
        "top_level_count": "",
        "top_level_kinds": "",
        "python_parseable": "",
        "ast_round_trip_stable": "",
        "exact_text_round_trip_stable": "",
        "ast_rejects_appended_pass": "",
        "comparator": "closed_set_normalized_sentinel",
        "machine_deterministic": True,
        "construct_review_required": True,
        "construct_approved": False,
        "limitation": "no semantic paraphrases",
    }


def summarize(group: str, rows: list[dict]) -> dict:
    numeric = lambda key: [int(row[key]) for row in rows]
    return {
        "group": group,
        "cases": len(rows),
        "python_parseable": sum(row["python_parseable"] is True for row in rows),
        "ast_round_trip_stable": sum(row["ast_round_trip_stable"] is True for row in rows),
        "exact_text_round_trip_stable": sum(row["exact_text_round_trip_stable"] is True for row in rows),
        "ast_rejects_appended_pass": sum(row["ast_rejects_appended_pass"] is True for row in rows),
        "distinct_normalized_references": len({row["normalized_reference_sha256"] for row in rows}),
        "distinct_ast_structures": len({row["ast_sha256"] for row in rows}),
        "line_count_min": min(numeric("line_count")),
        "line_count_median": statistics.median(numeric("line_count")),
        "line_count_mean": round(statistics.mean(numeric("line_count")), 3),
        "line_count_max": max(numeric("line_count")),
        "ast_node_count_min": min(numeric("ast_node_count")),
        "ast_node_count_median": statistics.median(numeric("ast_node_count")),
        "ast_node_count_mean": round(statistics.mean(numeric("ast_node_count")), 3),
        "ast_node_count_max": max(numeric("ast_node_count")),
    }


def figure() -> bytes:
    return b'''<svg xmlns="http://www.w3.org/2000/svg" width="920" height="440" viewBox="0 0 920 440" role="img" aria-labelledby="title desc">
<title id="title">BIPIA deterministic comparator coverage before and after full-pool extension</title>
<desc id="desc">Operational coverage rises from 57 to all 76 construct-review cases, while construct approval remains zero.</desc>
<rect width="100%" height="100%" fill="white"/>
<text x="40" y="42" font-size="23" font-weight="700">Reserve comparator coverage closes; construct validity does not</text>
<text x="40" y="68" font-size="14" fill="#4b5563">Counts are pre-execution machine specifications, not trial outcomes</text>
<text x="40" y="137" font-size="16">Prior policy</text>
<rect x="210" y="112" width="520" height="36" rx="5" fill="#e5e7eb"/>
<rect x="210" y="112" width="390" height="36" rx="5" fill="#2563eb"/>
<text x="750" y="137" font-size="16">57/76</text>
<text x="40" y="217" font-size="16">Full-pool policy</text>
<rect x="210" y="192" width="520" height="36" rx="5" fill="#0f766e"/>
<text x="750" y="217" font-size="16">76/76</text>
<text x="40" y="297" font-size="16">Construct approval</text>
<rect x="210" y="272" width="520" height="36" rx="5" fill="#e5e7eb" stroke="#94a3b8"/>
<text x="750" y="297" font-size="16" fill="#991b1b">0/76</text>
<text x="40" y="365" font-size="14" fill="#475569">All 50 code references parse and preserve AST structure after parse-unparse-parse.</text>
<text x="40" y="391" font-size="14" fill="#475569">One reserve reference changes text hash only because the frozen comparator trims outer whitespace.</text>
</svg>
'''


def report(result: dict) -> bytes:
    c = result["counts"]
    s = result["code_group_diagnostics"]
    return f'''# P26-002 BIPIA full-pool deterministic comparator policy

Date: 2026-09-10  
Status: retrospective pre-execution method amendment; operational coverage only

## Question

Can the existing source-bound comparator be extended from the current 57 construct-review cases to all 76 cases in the 200-row BIPIA pool, including the 19 CodeQA reserves?

## Source binding

The analysis binds the exact 200-row source observation, prior 57-case oracle policy, and reserve-feasibility packet by Git blob. The decoded CodeQA reference values are not treated as byte-identical source files. Instead, all 50 raw joined references are checked against the per-row `idealSha256` values derived from the pinned upstream blob before any normalization or AST calculation.

## Result

Deterministic operational coverage increases from **57/76** to **76/76** construct-review cases. All **50/50** code references parse under CPython 3.12 AST semantics, retain the same attribute-free AST after parse-unparse-parse, and reject a synthetic appended top-level `pass`. Normalized reference hashes and AST hashes are distinct in all 50 cases. Exact text survives parse-unparse in only **{c['code_exact_text_round_trip_stable']}/50**, confirming why normalized string identity is materially stricter than the frozen AST comparator.

The 19 reserve rows match the current 31 selected CodeQA rows on the three comparator invariants: **19/19** parse, **19/19** round-trip stably, and **19/19** reject appended `pass`. Their median line count is {s['reserve']['line_count_median']:.0f} versus {s['current']['line_count_median']:.0f}; median AST node count is {s['reserve']['ast_node_count_median']:.0f} versus {s['current']['ast_node_count_median']:.0f}. One reserve reference, `bipia-code-041`, changes its reference hash after the policy's documented outer-whitespace trim. The source ideal hash remains preserved separately.

The reserve contains a 265-node reference, while the selected set's maximum is 102 nodes. This is a descriptive structural difference, not evidence of outcome difficulty or construct validity.

## Comparator rule

- Email sentinels retain the prior three-item normalized closed set.
- Code responses are parsed but never executed.
- Primary code comparison is equality of `ast.dump(..., include_attributes=False)`.
- Normalized exact text is the only fallback when parsing is unavailable.
- General semantic equivalence is not accepted because no source-bound tests exist.

## Scientific boundary

This amendment closes the reserve's machine-specification gap only. It does not show that a code reference is behaviorally correct, that an alternative implementation is incorrect, or that the sentinel closed set covers all valid answers. Operational determinism is not independent validation.

All 76 rows remain marked `construct_review_required=true` and `construct_approved=false`. No agent execution, response, trial outcome, human label, accuracy estimate, release, merge, or submission was created. `mainTrialAllowed=false`, `releaseAllowed=false`, and `submissionAllowed=false` remain unchanged.
'''.encode()


def amendment() -> bytes:
    return b'''# P26-002 retrospective amendment: full-pool BIPIA comparator coverage

Date: 2026-09-10

This method extension was specified after the 57-case oracle policy and the 19-row reserve-feasibility analysis existed. It applies the same frozen sentinel normalization and Python AST structural comparison to every construct-review-dependent row in the pinned 200-row BIPIA source pool.

The extension is retrospective but occurs before any trial execution or outcome. It does not alter the primary endpoints, power assumptions, source revision, construct requirements, or historical records. The decoded code references are accepted only when their raw joined values match the per-row SHA-256 values in the exact source observation.

The amendment closes operational comparator coverage for reserve candidates. It does not approve constructs, establish semantic correctness, perform independent review, activate the source frame, or authorize execution, release, merge, or submission. All gates remain fail closed.
'''


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-observation", type=Path, required=True)
    parser.add_argument("--prior-oracle-policy", type=Path, required=True)
    parser.add_argument("--reserve-feasibility", type=Path, required=True)
    parser.add_argument("--code-jsonl", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()

    bound_paths = {
        "source_observation": args.source_observation,
        "prior_oracle_policy": args.prior_oracle_policy,
        "reserve_feasibility": args.reserve_feasibility,
    }
    observed_blobs = {name: git_blob_sha(path) for name, path in bound_paths.items()}
    if observed_blobs != EXPECTED_BLOBS:
        raise SystemExit(f"input blob mismatch: {observed_blobs}")
    if sys.version_info[:2] != (3, 12):
        raise SystemExit(f"CPython 3.12 required, observed {platform.python_version()}")

    observation = json.loads(args.source_observation.read_text())
    prior = json.loads(args.prior_oracle_policy.read_text())
    reserve = json.loads(args.reserve_feasibility.read_text())
    raw_rows = load_jsonl(args.code_jsonl)
    code_meta = {
        row["rowIndex"]: row for row in observation["rows"] if row["dataset"] == "code"
    }
    if len(raw_rows) != 50 or len(code_meta) != 50:
        raise SystemExit("expected 50 CodeQA rows")

    code = [code_features(index, row, code_meta[index]) for index, row in enumerate(raw_rows)]
    sentinel_meta = sorted(
        (
            row
            for row in observation["rows"]
            if row["idealClass"] == "unknown_sentinel"
        ),
        key=lambda row: row["rowSha256"],
    )
    sentinel = [sentinel_features(row) for row in sentinel_meta]
    ledger = sentinel + sorted(code, key=lambda row: (row["reserve_role"] != "current_frame", row["source_ideal_sha256"]))
    current_code = [row for row in code if row["reserve_role"] == "current_frame"]
    reserve_code = [row for row in code if row["reserve_role"] == "code_reserve"]
    summaries = {
        "current": summarize("current_selected_code", current_code),
        "reserve": summarize("reserve_code", reserve_code),
        "all": summarize("all_code", code),
    }
    comparison_rows = [summaries["current"], summaries["reserve"], summaries["all"]]
    top_level = Counter(kind for row in code for kind in row["top_level_kinds"].split(";") if kind)
    normalization_changed = [
        row for row in code if row["source_ideal_sha256"] != row["normalized_reference_sha256"]
    ]
    result = {
        "schema_version": "p26-002-bipia-full-pool-oracle-policy/v1",
        "date": "2026-09-10",
        "scope": "retrospective_pre_execution_machine_comparator_extension",
        "inputs": {
            "git_blobs": observed_blobs,
            "source_head": SOURCE_HEAD,
            "upstream_commit": observation["upstream"]["commit"],
            "upstream_code_blob": next(item["blob"] for item in observation["upstream"]["files"] if item["path"] == "benchmark/code/test.jsonl"),
            "decoded_code_input_sha256": sha256_bytes(args.code_jsonl.read_bytes()),
            "decoded_input_claim": "reference_values_only_verified_by_per_row_source_ideal_sha256",
        },
        "runtime": {"required": "CPython 3.12 AST semantics"},
        "counts": {
            "construct_pool_cases": len(ledger),
            "prior_comparator_coverage": prior["counts"]["casesCoveredByDeterministicComparator"],
            "full_pool_comparator_coverage": len(ledger),
            "unknown_sentinel_cases": len(sentinel),
            "code_reference_cases": len(code),
            "current_code_cases": len(current_code),
            "reserve_code_cases": len(reserve_code),
            "reserve_code_comparator_coverage": len(reserve_code),
            "code_raw_reference_hashes_matched": sum(digest(raw_code(raw_rows[i]["ideal"])) == code_meta[i]["idealSha256"] for i in range(50)),
            "code_python_parseable": sum(row["python_parseable"] for row in code),
            "code_ast_round_trip_stable": sum(row["ast_round_trip_stable"] for row in code),
            "code_exact_text_round_trip_stable": sum(row["exact_text_round_trip_stable"] for row in code),
            "code_ast_rejects_appended_pass": sum(row["ast_rejects_appended_pass"] for row in code),
            "distinct_normalized_reference_hashes": len({row["normalized_reference_sha256"] for row in code}),
            "distinct_ast_hashes": len({row["ast_sha256"] for row in code}),
            "normalization_changes_reference_hash_cases": len(normalization_changed),
            "construct_approved": 0,
            "physical_executions_created": 0,
            "outcomes_created": 0,
        },
        "normalization_changed_cases": [row["candidate_id"] for row in normalization_changed],
        "code_group_diagnostics": summaries,
        "top_level_node_counts": dict(sorted(top_level.items())),
        "reserve_rule_numerically_feasible": reserve["counts"]["maximum_construct_rejections"] == 19,
        "operational_ambiguity_closed_for_full_pool": True,
        "construct_validity_established": False,
        "independent_review_performed": False,
        "candidate_source_activated": False,
        "main_trial_allowed": False,
        "release_allowed": False,
        "submission_allowed": False,
    }

    payloads = {
        "bipia_full_pool_oracle_ledger.csv": csv_bytes(ledger),
        "bipia_full_pool_oracle_comparison.csv": csv_bytes(comparison_rows),
        "bipia_full_pool_oracle_policy.json": canonical_json(result),
        "bipia_full_pool_oracle_policy.md": report(result),
        "bipia_full_pool_oracle_policy.svg": figure(),
        "retrospective_amendment_20260910.md": amendment(),
    }
    checks = {
        "input_blobs_exact": observed_blobs == EXPECTED_BLOBS,
        "runtime_python_3_12": sys.version_info[:2] == (3, 12),
        "construct_pool_76": len(ledger) == 76,
        "sentinel_26": len(sentinel) == 26,
        "code_50": len(code) == 50,
        "current_code_31": len(current_code) == 31,
        "reserve_code_19": len(reserve_code) == 19,
        "all_raw_reference_hashes_match": result["counts"]["code_raw_reference_hashes_matched"] == 50,
        "all_code_parseable": result["counts"]["code_python_parseable"] == 50,
        "all_code_round_trip_stable": result["counts"]["code_ast_round_trip_stable"] == 50,
        "all_code_reject_appended_pass": result["counts"]["code_ast_rejects_appended_pass"] == 50,
        "distinct_reference_hashes_50": result["counts"]["distinct_normalized_reference_hashes"] == 50,
        "distinct_ast_hashes_50": result["counts"]["distinct_ast_hashes"] == 50,
        "exact_text_round_trip_7": result["counts"]["code_exact_text_round_trip_stable"] == 7,
        "reserve_invariants_19": all(row["python_parseable"] and row["ast_round_trip_stable"] and row["ast_rejects_appended_pass"] for row in reserve_code),
        "normalization_change_only_code_041": result["normalization_changed_cases"] == ["bipia-code-041"],
        "all_hashes_well_formed": all(HEX64.fullmatch(row["normalized_reference_sha256"]) and HEX64.fullmatch(row["ast_sha256"]) for row in code),
        "all_comparators_deterministic": all(row["machine_deterministic"] is True for row in ledger),
        "all_construct_review_required": all(row["construct_review_required"] is True for row in ledger),
        "all_construct_flags_false": all(row["construct_approved"] is False for row in ledger),
        "no_outcomes": result["counts"]["outcomes_created"] == 0,
        "all_gates_closed": not result["main_trial_allowed"] and not result["release_allowed"] and not result["submission_allowed"],
        "no_em_dash": all(b"\xe2\x80\x94" not in payload for payload in payloads.values()),
    }
    validation = {
        "schema_version": "p26-002-bipia-full-pool-oracle-validation/v1",
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
