#!/usr/bin/env python3
"""Extract non-sensitive oracle features from pinned BIPIA source rows."""

from __future__ import annotations

import argparse
import ast
import csv
import hashlib
import json
import re
from pathlib import Path

UPSTREAM_COMMIT = "a004b69ec0dd446e0afd461d98cb5e96e120a5d0"
EMAIL_BLOB = "ad8f5aeb3f7ab665fe9d3efdb345476ad4338e20"
CODE_BLOB = "b8c7d00b3a536f0ad12a908e47e11f510b12c043"
EMAIL_BUILDER_BLOB = "4cdb0d1f198a8e014e898c21b43ce2319c2e9611"
CODE_BUILDER_BLOB = "755e66299a61014d1f75d8d880104a53543c9e33"


def digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def load_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def canonical_code(value: object) -> str:
    if isinstance(value, list):
        value = "\n".join(str(line) for line in value)
    if not isinstance(value, str):
        raise TypeError("Code reference must be a string or list of lines")
    return value.replace("\r\n", "\n").replace("\r", "\n").strip()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--code-jsonl", type=Path, required=True)
    parser.add_argument("--email-jsonl", type=Path, required=True)
    parser.add_argument("--candidate-ledger", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    code_rows = load_jsonl(args.code_jsonl)
    email_rows = load_jsonl(args.email_jsonl)
    with args.candidate_ledger.open(encoding="utf-8", newline="") as handle:
        candidates = list(csv.DictReader(handle))

    selected_code = [row for row in candidates if row["dataset"] == "code"]
    selected_email_unknown = [
        row
        for row in candidates
        if row["dataset"] == "email" and email_rows[int(row["row_index"])]["ideal"] == "unknown"
    ]

    code_features = []
    for candidate in selected_code:
        index = int(candidate["row_index"])
        reference = canonical_code(code_rows[index]["ideal"])
        tree = ast.parse(reference)
        ast_dump = ast.dump(tree, include_attributes=False)
        unparsed = ast.unparse(tree)
        round_trip_dump = ast.dump(ast.parse(unparsed), include_attributes=False)
        appended_pass_dump = ast.dump(ast.parse(reference + "\npass"), include_attributes=False)
        code_features.append(
            {
                "candidateId": candidate["candidate_id"],
                "rowIndex": index,
                "referenceSha256": digest(reference),
                "astSha256": digest(ast_dump),
                "lineCount": len(reference.splitlines()),
                "pythonParseable": True,
                "astRoundTripStable": ast_dump == round_trip_dump,
                "exactTextRoundTripStable": reference == unparsed,
                "astRejectsAppendedPass": ast_dump != appended_pass_dump,
                "topLevelKinds": [type(node).__name__ for node in tree.body],
                "functionCount": sum(isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) for node in ast.walk(tree)),
            }
        )

    sentinel_features = []
    for candidate in selected_email_unknown:
        index = int(candidate["row_index"])
        sentinel_features.append(
            {
                "candidateId": candidate["candidate_id"],
                "rowIndex": index,
                "idealSha256": digest(email_rows[index]["ideal"]),
                "sourceIdeal": "unknown",
            }
        )

    observation = {
        "schemaVersion": "p26-002-bipia-oracle-observation-0.1.0",
        "observedAt": "2026-09-09",
        "upstream": {
            "repository": "microsoft/BIPIA",
            "commit": UPSTREAM_COMMIT,
            "files": [
                {"path": "benchmark/email/test.jsonl", "blob": EMAIL_BLOB},
                {"path": "benchmark/code/test.jsonl", "blob": CODE_BLOB},
                {"path": "bipia/data/email.py", "blob": EMAIL_BUILDER_BLOB},
                {"path": "bipia/data/code.py", "blob": CODE_BUILDER_BLOB},
            ],
        },
        "sourceIssue": {
            "datasetLiteral": "unknown",
            "constructorLiteral": "unkown",
            "observedConstructorOutput": "Answer: unknown.",
            "intendedSpecialCaseOutput": "There is no information about the question in the email.",
        },
        "counts": {
            "selectedAmbiguousCases": len(code_features) + len(sentinel_features),
            "selectedUnknownSentinels": len(sentinel_features),
            "selectedCodeReferences": len(code_features),
        },
        "sentinelCases": sentinel_features,
        "codeCases": code_features,
    }
    serialized = json.dumps(observation, indent=2, sort_keys=True)

    # Prettier keeps short string-only arrays on one line. Mirror that stable
    # representation for the only such field in this observation so a direct
    # rebuild is byte-identical to the repository artifact.
    pattern = re.compile(
        r'(?m)^(?P<indent>\s*)"topLevelKinds": \[\n'
        r'(?P<body>(?:\s+"[^"]+",?\n)+)'
        r'(?P=indent)\]'
    )

    def compact_string_array(match: re.Match[str]) -> str:
        values = re.findall(r'"([^"]+)"', match.group("body"))
        line = f'{match.group("indent")}"topLevelKinds": {json.dumps(values)}'
        return line if len(values) <= 4 and len(line) <= 100 else match.group(0)

    serialized = pattern.sub(compact_string_array, serialized)
    args.output.write_text(serialized + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
