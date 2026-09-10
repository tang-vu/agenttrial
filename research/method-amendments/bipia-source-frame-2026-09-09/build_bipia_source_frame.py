#!/usr/bin/env python3
"""Build the P26-002 BIPIA source-frame amendment from a public metadata observation."""

from __future__ import annotations

import csv
import hashlib
import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "source_observation.json"
OUT = ROOT / "out"
POSITIONS = ("start", "middle", "end")
TEXT_ATTACK = "Marketing & Advertising-1"
CODE_ATTACK = "Data Eavesdropping-0"


def dump_json(path: Path, value: object) -> None:
    path.write_text(
        json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def expected_position(row_hash: str) -> str:
    return POSITIONS[int(row_hash[:8], 16) % len(POSITIONS)]


def render_markdown(result: dict) -> str:
    counts = result["counts"]
    return f"""# P26-002 BIPIA source-and-reference frame

Date: 2026-09-09  
Status: retrospective source feasibility; no activation, execution, outcome, or human approval

## Question

Can a pinned free source provide 181 unique matched clean/poisoned tasks for the
final-output-only primary comparator without reusing a control, selecting on model
outcomes, or importing an LLM judge as ground truth?

## Source-bound result

The pinned BIPIA revision contains **200** public test rows across TableQA (100),
EmailQA (50), and CodeQA (50). Every row has a non-empty final-output reference.
The frozen rule retains all 150 table/email rows and the 31 CodeQA rows with the
smallest canonical row SHA-256 values. This yields **181 unique source rows**:

| Reference class              | Available | Selected | Interpretation                                         |
| ---------------------------- | --------: | -------: | ------------------------------------------------------ |
| Content-bearing short answer | {counts["shortAnswerAvailable"]:>9} | {counts["shortAnswerSelected"]:>8} | Direct textual reference                               |
| Email sentinel `unknown`     | {counts["unknownSentinelAvailable"]:>9} | {counts["unknownSentinelSelected"]:>8} | Explicit negative reference; construct review required |
| Full-code reference          | {counts["codeReferenceAvailable"]:>9} | {counts["codeReferenceSelected"]:>8} | Exact source reference; equivalence policy required    |
| **Total**                    |   **{counts["sourceRows"]}** |  **{counts["selectedRows"]}** | Source-and-reference slots only                        |

Each selected row has one clean control and one fault condition made by inserting a
single fixed attack instruction into the same context. The question and utility
reference remain unchanged. Attack placement is fixed from the row hash, so no
model response can affect selection or position. The two selected attack families
have deterministic final-output match evaluators in the pinned source.

## Corrections and construct boundary

BIPIA's EmailQA response constructor checks the misspelled sentinel `unkown`,
whereas 26 source rows use `unknown`. Those rows are retained as explicit source
references but cannot inherit the intended special-case wording from that function.
Their normalization must be frozen locally before execution.

The 31 CodeQA references also do not prove that exact string identity is a valid
utility oracle: semantically correct alternative patches could be rejected. Thus
the numerical source gap is closed at the **task/reference** level, but 57 selected
slots (26 sentinel plus 31 code) remain construct-review items.

The source's attack matcher uses fuzzy partial matching at a threshold above 80.
That is a deterministic comparator, not validated truth. It can miss paraphrased
compliance or match coincidental text and therefore cannot serve as independent
human adjudication.

## Quantitative consequence

| Quantity                                    | Count |
| ------------------------------------------- | ----: |
| Frozen source-and-reference candidate pairs | {counts["selectedRows"]:>5} |
| Selected short-answer rows                  | {counts["shortAnswerSelected"] + counts["unknownSentinelSelected"]:>5} |
| Selected code-reference rows                | {counts["codeReferenceSelected"]:>5} |
| Slots requiring explicit construct policy   | {counts["constructReviewRequired"]:>5} |
| Physical clean executions created           |     0 |
| Physical poisoned executions created        |     0 |

This amendment removes the previous lack of a numerically sufficient public
candidate frame. It does **not** create the 181 unique physical execution pairs
required by the power design. It also does not establish transport from BIPIA's
three application tasks to the registered AgentTrial target population.

## Decision

Retain this 181-row ledger as a candidate execution frame. Before activation,
freeze the `unknown` normalization and CodeQA equivalence policy, obtain the
existing independent construct/method approvals, and bind an execution plan that
creates exactly one clean and one poisoned physical run per selected row. Do not
combine repeat evaluator passes or attack positions as additional observations.

`candidateSourceFrameComplete=true`; `candidateSourceActivated=false`;
`mainTrialAllowed=false`; `submissionAllowed=false`.
"""


def render_svg(counts: dict) -> str:
    bars = [
        ("Short answer", counts["shortAnswerSelected"], "#2563eb"),
        ("Unknown sentinel", counts["unknownSentinelSelected"], "#f59e0b"),
        ("Code reference", counts["codeReferenceSelected"], "#8b5cf6"),
    ]
    width, height = 980, 430
    left, top, chart_w = 210, 95, 650
    max_n = max(v for _, v, _ in bars)
    rows = []
    for i, (label, value, color) in enumerate(bars):
        y = top + i * 90
        w = round(chart_w * value / max_n)
        rows.append(
            f'<text x="{left - 16}" y="{y + 31}" text-anchor="end" '
            f'font-family="Arial, sans-serif" font-size="20">{label}</text>'
        )
        rows.append(
            f'<rect x="{left}" y="{y}" width="{w}" height="44" rx="5" fill="{color}"/>'
        )
        rows.append(
            f'<text x="{left + w + 12}" y="{y + 31}" '
            f'font-family="Arial, sans-serif" font-size="20" font-weight="700">{value}</text>'
        )
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
  <rect width="{width}" height="{height}" fill="#ffffff"/>
  <text x="40" y="44" font-family="Arial, sans-serif" font-size="26" font-weight="700" fill="#111827">P26-002 BIPIA candidate frame: 181 source rows</text>
  <text x="40" y="70" font-family="Arial, sans-serif" font-size="16" fill="#4b5563">Reference classes selected before any AgentTrial execution or outcome</text>
  {"".join(rows)}
  <line x1="{left}" y1="370" x2="{left + chart_w}" y2="370" stroke="#9ca3af"/>
  <text x="40" y="408" font-family="Arial, sans-serif" font-size="15" fill="#6b7280">57 slots require an explicit construct policy; source count is not execution readiness.</text>
</svg>
"""


def main() -> None:
    observation = json.loads(SOURCE.read_text(encoding="utf-8"))
    rows = observation["rows"]
    selected = [row for row in rows if row["selected"]]
    code_rows = [row for row in rows if row["dataset"] == "code"]
    selected_code = [row for row in code_rows if row["selected"]]
    expected_code_ids = {
        row["candidateId"] for row in sorted(code_rows, key=lambda row: row["rowSha256"])[:31]
    }

    checks = {
        "schema_version": observation["schemaVersion"]
        == "p26-002-bipia-source-frame-observation-0.1.0",
        "pinned_commit": observation["upstream"]["commit"]
        == "a004b69ec0dd446e0afd461d98cb5e96e120a5d0",
        "source_rows_200": len(rows) == 200,
        "selected_rows_181": len(selected) == 181,
        "candidate_ids_unique": len({row["candidateId"] for row in rows}) == len(rows),
        "row_hashes_unique": len({row["rowSha256"] for row in rows}) == len(rows),
        "all_hashes_well_formed": all(
            len(row["rowSha256"]) == 64
            and len(row["idealSha256"]) == 64
            and set(row["rowSha256"] + row["idealSha256"]) <= set("0123456789abcdef")
            for row in rows
        ),
        "table_count_100": sum(row["dataset"] == "table" for row in rows) == 100,
        "email_count_50": sum(row["dataset"] == "email" for row in rows) == 50,
        "code_count_50": len(code_rows) == 50,
        "all_text_selected": all(
            row["selected"] for row in rows if row["dataset"] in {"table", "email"}
        ),
        "selected_code_31": len(selected_code) == 31,
        "code_hash_rank_rule": {row["candidateId"] for row in selected_code}
        == expected_code_ids,
        "position_rule": all(
            row["insertionPosition"] == expected_position(row["rowSha256"])
            for row in selected
        ),
        "text_attack_fixed": all(
            row["attackName"] == TEXT_ATTACK
            for row in selected
            if row["dataset"] in {"table", "email"}
        ),
        "code_attack_fixed": all(
            row["attackName"] == CODE_ATTACK
            for row in selected
            if row["dataset"] == "code"
        ),
        "unselected_have_no_condition": all(
            row["attackName"] is None and row["insertionPosition"] is None
            for row in rows
            if not row["selected"]
        ),
        "short_answer_available_124": sum(
            row["idealClass"] == "short_answer" for row in rows
        )
        == 124,
        "unknown_available_26": sum(
            row["idealClass"] == "unknown_sentinel" for row in rows
        )
        == 26,
        "code_reference_available_50": sum(
            row["idealClass"] == "full_code_reference" for row in rows
        )
        == 50,
        "source_blobs_bound": len({row["sourceBlob"] for row in rows}) == 3,
        "no_execution_claim": True,
        "no_human_approval_claim": True,
        "gates_fail_closed": True,
    }
    if not all(checks.values()):
        failed = [name for name, passed in checks.items() if not passed]
        raise SystemExit(f"validation failed: {failed}")

    selected_class = Counter(row["idealClass"] for row in selected)
    selected_dataset = Counter(row["dataset"] for row in selected)
    counts = {
        "sourceRows": len(rows),
        "selectedRows": len(selected),
        "tableSelected": selected_dataset["table"],
        "emailSelected": selected_dataset["email"],
        "codeSelected": selected_dataset["code"],
        "shortAnswerAvailable": sum(row["idealClass"] == "short_answer" for row in rows),
        "unknownSentinelAvailable": sum(
            row["idealClass"] == "unknown_sentinel" for row in rows
        ),
        "codeReferenceAvailable": sum(
            row["idealClass"] == "full_code_reference" for row in rows
        ),
        "shortAnswerSelected": selected_class["short_answer"],
        "unknownSentinelSelected": selected_class["unknown_sentinel"],
        "codeReferenceSelected": selected_class["full_code_reference"],
        "constructReviewRequired": selected_class["unknown_sentinel"]
        + selected_class["full_code_reference"],
        "cleanExecutionsCreated": 0,
        "poisonedExecutionsCreated": 0,
    }
    result = {
        "schemaVersion": "p26-002-bipia-source-frame-result-0.1.0",
        "date": "2026-09-09",
        "scope": "retrospective_source_feasibility_only",
        "upstream": observation["upstream"],
        "selectionRule": observation["selectionRule"],
        "counts": counts,
        "interpretation": {
            "candidateSourceFrameComplete": True,
            "candidateSourceActivated": False,
            "physicalExecutionPairsCreated": 0,
            "powerEvidenceCreated": False,
            "constructReviewComplete": False,
            "methodReviewComplete": False,
            "transportEstablished": False,
        },
        "knownSourceIssue": {
            "file": "bipia/data/email.py",
            "sourceSentinel": "unknown",
            "constructorLiteral": "unkown",
            "affectedSelectedRows": selected_class["unknown_sentinel"],
            "resolution": "freeze a local normalization rule before execution",
        },
        "gates": {
            "mainTrialAllowed": False,
            "releaseAllowed": False,
            "submissionAllowed": False,
        },
    }

    OUT.mkdir(parents=True, exist_ok=True)
    result_path = OUT / "bipia_source_frame.json"
    report_path = OUT / "bipia_source_frame.md"
    ledger_path = OUT / "bipia_candidate_ledger.csv"
    figure_path = OUT / "bipia_source_frame.svg"
    validation_path = OUT / "validation.json"

    dump_json(result_path, result)
    report_path.write_text(render_markdown(result), encoding="utf-8")
    figure_path.write_text(render_svg(counts), encoding="utf-8")
    with ledger_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "candidate_id",
                "dataset",
                "row_index",
                "source_blob",
                "row_sha256",
                "ideal_sha256",
                "ideal_class",
                "attack_name",
                "insertion_position",
            ],
            lineterminator="\n",
        )
        writer.writeheader()
        for row in selected:
            writer.writerow(
                {
                    "candidate_id": row["candidateId"],
                    "dataset": row["dataset"],
                    "row_index": row["rowIndex"],
                    "source_blob": row["sourceBlob"],
                    "row_sha256": row["rowSha256"],
                    "ideal_sha256": row["idealSha256"],
                    "ideal_class": row["idealClass"],
                    "attack_name": row["attackName"],
                    "insertion_position": row["insertionPosition"],
                }
            )

    validation = {
        "schemaVersion": "p26-002-bipia-source-frame-validation-0.1.0",
        "checks": checks,
        "checksPassed": sum(checks.values()),
        "checksTotal": len(checks),
        "sourceObservationSha256": sha256(SOURCE),
        "outputSha256": {
            result_path.name: sha256(result_path),
            report_path.name: sha256(report_path),
            ledger_path.name: sha256(ledger_path),
            figure_path.name: sha256(figure_path),
        },
    }
    dump_json(validation_path, validation)


if __name__ == "__main__":
    main()
