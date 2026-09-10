#!/usr/bin/env python3
"""Build a versioned claim-novelty and venue-fit audit for P26-002."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from io import StringIO
from pathlib import Path


SOURCE_HEAD = "ed758e55905e8432352c5063d671380e46c61b4d"
MANUSCRIPT_BLOB = "4169a31f72ab189e928a56e3c8addd9031401a44"
AS_OF = "2026-09-10"


SOURCES = [
    {
        "source_id": "S01",
        "title": "Benchmarking and Defending Against Indirect Prompt Injection Attacks on Large Language Models",
        "date": "2023",
        "url": "https://arxiv.org/abs/2312.14197",
        "role": "BIPIA source benchmark; does not report the P26-002 frame audit.",
        "version_note": "arXiv record inspected; P26-002 remains bound to its pinned upstream Git revision.",
    },
    {
        "source_id": "S02",
        "title": "Datasheets for Datasets",
        "date": "2021",
        "url": "https://doi.org/10.1145/3458723",
        "role": "Prior art for documenting motivation, composition, collection, and recommended uses.",
        "version_note": "Published Communications of the ACM article.",
    },
    {
        "source_id": "S03",
        "title": "Benchmark Transparency: Measuring the Impact of Data on Evaluation",
        "date": "2024-03-31",
        "url": "https://arxiv.org/abs/2404.00748",
        "role": "Prior empirical evidence that benchmark data distribution changes absolute scores and rankings.",
        "version_note": "arXiv record and abstract inspected.",
    },
    {
        "source_id": "S04",
        "title": "ELT-Bench-Verified: Benchmark Quality Issues Underestimate AI Agent Capabilities",
        "date": "2026-04-02",
        "url": "https://arxiv.org/abs/2603.29399",
        "role": "Prior agent-benchmark audit separating rigid evaluators, ambiguous specifications, and faulty ground truth; includes human validation.",
        "version_note": "arXiv v2 dated 2026-04-02 inspected.",
    },
    {
        "source_id": "S05",
        "title": "BenchGuard: Who Guards the Benchmarks? Automated Auditing of LLM Agent Benchmarks",
        "date": "2026-04-27",
        "url": "https://arxiv.org/abs/2604.24955",
        "role": "Direct prior art for automated cross-verification of benchmark artifacts as a complement to human review.",
        "version_note": "arXiv v1 dated 2026-04-27 inspected.",
    },
    {
        "source_id": "S06",
        "title": "Auditing Automated Evaluation, Error Propagation, and Runtime Mitigation in Tool-Using Language Agents",
        "date": "2026-04-17",
        "url": "https://arxiv.org/abs/2604.16706",
        "role": "Direct prior art for validating automated agent scorers against independent human annotation.",
        "version_note": "arXiv record and abstract inspected.",
    },
    {
        "source_id": "S07",
        "title": "Evaluation Cards: An Interpretive Layer for AI Evaluation Reporting",
        "date": "2026-06-08",
        "url": "https://arxiv.org/abs/2606.09809",
        "role": "Prior art for composing benchmark metadata, run data, model metadata, provenance, reproducibility, and comparability signals.",
        "version_note": "arXiv record and abstract inspected.",
    },
    {
        "source_id": "S08",
        "title": "Safety, or Just Capability? A Validity Audit of Agent-Safety Benchmarks",
        "date": "2026-07-30",
        "url": "https://arxiv.org/abs/2607.28685",
        "role": "Direct prior art for benchmark-as-measurement validity audits and claim restriction to benchmark, metric, behavior, and panel.",
        "version_note": "arXiv v1 dated 2026-07-30 inspected.",
    },
    {
        "source_id": "S09",
        "title": "When Guardrails Look Effective: Construct Validity Failures in LLM Agent Commerce Evaluation",
        "date": "2026-09-01",
        "url": "https://arxiv.org/abs/2609.01519",
        "role": "Very recent direct prior art for claim-gating construct validity, protocol isolation, stochastic stability, and Invalid/Inconclusive outputs.",
        "version_note": "arXiv v1 dated 2026-09-01 inspected.",
    },
    {
        "source_id": "S10",
        "title": "The Use of Confidence or Fiducial Limits Illustrated in the Case of the Binomial",
        "date": "1934",
        "url": "https://doi.org/10.1093/biomet/26.4.404",
        "role": "Established exact-binomial method used by the P26-002 safety gate.",
        "version_note": "Published Biometrika article.",
    },
    {
        "source_id": "S11",
        "title": "Nonparametric Bounds and Sensitivity Analysis of Treatment Effects",
        "date": "2015",
        "url": "https://arxiv.org/abs/1503.01598",
        "role": "Established partial-identification context; P26-002 uses elementary finite-frame worst-case bounds, not a new estimator.",
        "version_note": "arXiv record inspected.",
    },
    {
        "source_id": "V01",
        "title": "Empirical Software Engineering: Aims and scope",
        "date": AS_OF,
        "url": "https://link.springer.com/journal/10664/aims-and-scope",
        "role": "Official venue scope: empirical software engineering, replicated studies, and infrastructure supporting empirical research.",
        "version_note": f"Official journal page accessed {AS_OF}.",
    },
    {
        "source_id": "V02",
        "title": "Empirical Software Engineering: Submission guidelines",
        "date": AS_OF,
        "url": "https://link.springer.com/journal/10664/submission-guidelines",
        "role": "Official requirements: single-blind review, Word or LaTeX, 150-250-word abstract, 4-6 keywords, required declarations, LLM use documented in Methods, and no mandatory publication fee on the standard route.",
        "version_note": f"Official journal page accessed {AS_OF}.",
    },
]


CLAIMS = [
    {
        "claim_id": "P002-N001",
        "claim": "Agent benchmarks should be audited before aggregate results are interpreted.",
        "classification": "PRIOR_ART",
        "sources": "S04;S05;S06;S08;S09",
        "disposition": "Retain as motivation with citations; do not claim novelty.",
    },
    {
        "claim_id": "P002-N002",
        "claim": "Automated cross-verification is useful but is not independent human validation.",
        "classification": "PRIOR_ART",
        "sources": "S04;S05;S06",
        "disposition": "Retain as an explicit methodological boundary.",
    },
    {
        "claim_id": "P002-N003",
        "claim": "A deterministic scorer can be operationally complete while construct validity remains unresolved.",
        "classification": "PRIOR_ART",
        "sources": "S04;S06;S08;S09",
        "disposition": "Retain as framing; avoid presenting the distinction as new.",
    },
    {
        "claim_id": "P002-N004",
        "claim": "Version, provenance, benchmark metadata, and result comparability must be reported together.",
        "classification": "PRIOR_ART",
        "sources": "S02;S07",
        "disposition": "Retain as reproducibility practice, not contribution.",
    },
    {
        "claim_id": "P002-N005",
        "claim": "Benchmark source composition can change aggregate scores and rankings.",
        "classification": "PRIOR_ART",
        "sources": "S03",
        "disposition": "Retain with attribution; the P26-002 numeric bound remains source-specific.",
    },
    {
        "claim_id": "P002-N006",
        "claim": "Failed validity gates should yield Invalid or Inconclusive rather than a substantive claim.",
        "classification": "PRIOR_ART",
        "sources": "S09",
        "disposition": "Do not claim a new gating framework or new decision vocabulary.",
    },
    {
        "claim_id": "P002-N007",
        "claim": "Only n=181 crosses the P26-002 frozen joint-power target; n=180 does not.",
        "classification": "SOURCE_SPECIFIC_RESULT",
        "sources": "S01;S10",
        "disposition": "Keep as a BIPIA-frame design result, not a general power theorem.",
    },
    {
        "claim_id": "P002-N008",
        "claim": "The 181-case frame is feasible iff at least 57 of 76 construct cases are accepted, with minima of 7 sentinel and 31 code cases.",
        "classification": "SOURCE_SPECIFIC_RESULT",
        "sources": "S01",
        "disposition": "Keep as finite-pool counting result.",
    },
    {
        "claim_id": "P002-N009",
        "claim": "All 76 construct cases have deterministic comparator coverage while construct approval remains 0 of 76.",
        "classification": "SOURCE_SPECIFIC_RESULT",
        "sources": "S01",
        "disposition": "Keep as machine-specification result and unresolved boundary; never call this validated accuracy.",
    },
    {
        "claim_id": "P002-N010",
        "claim": "The current frame permits a 7.873-point composition-only mean difference and 15.746-point contrast difference.",
        "classification": "SOURCE_SPECIFIC_RESULT",
        "sources": "S01;S03",
        "disposition": "Keep as a sharp bounded-mixture result for the pinned frame.",
    },
    {
        "claim_id": "P002-N011",
        "claim": "Excluding 19 cases leaves 9.5-point full-pool mean and 19-point paired-contrast identification widths.",
        "classification": "SOURCE_SPECIFIC_RESULT",
        "sources": "S01;S11",
        "disposition": "Keep as elementary finite-frame bounds; do not call them confidence intervals or a new estimator.",
    },
    {
        "claim_id": "P002-N012",
        "claim": "Provenance, scorer specification, construct validity, and estimand adequacy form a four-part diagnostic sequence.",
        "classification": "SYNTHESIS_NOT_METHOD_NOVELTY",
        "sources": "S02;S05;S07;S08;S09",
        "disposition": "Keep only as the paper's organizing synthesis; delete any implication that the sequence is a validated general framework.",
    },
]


def canonical_json(value: object) -> bytes:
    return (json.dumps(value, indent=2, sort_keys=True) + "\n").encode()


def csv_bytes(rows: list[dict[str, str]]) -> bytes:
    stream = StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=list(rows[0]), lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue().encode()


def sha256(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def novelty_report() -> bytes:
    return f"""# P26-002 claim-level novelty audit

Audit date: {AS_OF}  
Bound manuscript head: `{SOURCE_HEAD}`  
Bound manuscript blob: `{MANUSCRIPT_BLOB}`

## Decision

**Disposition: `KEEP_AS_SOURCE_SPECIFIC_CASE_STUDY_NOT_STANDALONE_READY`.**

The literature search does not support novelty claims for benchmark auditing, automated artifact cross-verification, separation of scoring from construct validity, provenance-rich reporting, source-distribution sensitivity, or validity-gate abstention. Direct precedents published in 2026 include automated agent-benchmark auditing, human-validated benchmark repair, scorer validation against human annotation, agent-safety validity audits, evaluation cards, and a construct-validity contract that returns Invalid or Inconclusive before substantive interpretation.

P26-002 retains five defensible, source-specific results for its pinned BIPIA frame: the `n=181` exact-rule cliff, the `57/76` reserve condition, complete deterministic coverage with zero construct approvals, the `7.873/15.746` composition bounds, and the `9.5/19` full-pool identification widths. A search did not locate another public report with these exact BIPIA-frame quantities. That absence is **not** a confirmation of novelty or priority.

The four-part diagnostic sequence may remain as an organizing synthesis. It must not be called a new framework, validated methodology, or generally sufficient readiness standard. The manuscript's current wording already rejects a novel-method claim; the related-work section should nevertheless cite the 2026 direct precedents before any submission package is built.

## Claim accounting

- 6 claims are classified as prior art.
- 5 claims are retained only as source-specific empirical or finite-frame results.
- 1 claim is an organizing synthesis without method novelty.
- 0 claims establish a novel general estimator, validated comparator, or agent-performance effect.

## Scientific implication

The paper is strongest as a transparent pre-execution case study showing how a concrete evaluation plan changes under exact frame accounting. It is not yet a competitive standalone Research Article because it has no agent outcomes and `0/76` independent construct approvals. The five numeric results can support a methods/design section of the eventual P26-002 trial paper even if the standalone case-study route is later abandoned.

## Search boundary

The audit covered the named primary papers and official venue pages available through web search as of {AS_OF}. It is not an exhaustive systematic review, citation search, or peer-review decision. Classification therefore uses `SOURCE_SPECIFIC_RESULT`, not `NOVEL`, for exact quantities not found in the searched literature.
""".encode()


def venue_report() -> bytes:
    return f"""# P26-002 venue-fit assessment

Assessment date: {AS_OF}

## Candidate venue

**Empirical Software Engineering (EMSE), Research Article, standard non-open-access route.**

The official scope covers applied software-engineering research with a strong empirical component, replicated studies, and infrastructure supporting empirical research. The standard publication route has no submission or publication fee; optional open access carries a fee. This satisfies the no-fee constraint only if the standard route is selected by the author.

## Fit judgment

**Topical fit: plausible. Evidence maturity: insufficient for submission. Desk-reject risk: high in the current pre-execution-only form.**

The artifact-binding, comparator, frame, power, and transport analyses fit empirical-research infrastructure and verification/validation. However, the present manuscript reports design diagnostics rather than executed agent outcomes, comparator accuracy, independently reviewed constructs, or a multi-benchmark validation. Recent papers already provide broader benchmark-auditing frameworks and human-validated empirical demonstrations. Formatting a Word file now would not repair this evidence gap.

## Minimum scientific strengthening before an EMSE package

1. Preserve the five source-specific results and cite direct 2026 precedents; claim no general benchmark-audit framework.
2. Obtain independent construct decisions for the 76 sentinel/code policies, with the reviewer identities and agreement procedure supplied by real humans. Automated checks cannot substitute.
3. If execution becomes authorized, report outcomes at the source-case unit, retain source-specific estimands, and carry partial-identification bounds for excluded cases.
4. If execution remains unavailable, add a second independently sourced benchmark or a human-validated comparator study; otherwise retain this work as a methods section within the eventual main trial rather than a standalone article.

## Mechanical fit already met or nearly met

- Current abstract is within EMSE's 150-250-word range.
- Current manuscript length is compatible with a full Research Article.
- Language-model use is documented in Methods, as required by the official guideline.
- Editable Word or LaTeX would be acceptable.
- The standard route can be published without mandatory author fees.

## Mechanical changes still required

- Reduce keywords from 7 to the required 4-6.
- Convert numeric citations to EMSE's author-year style and alphabetize references.
- Add confirmed author names, affiliation or residence, corresponding email, and any ORCID.
- Complete funding, competing-interest, author-contribution, data-availability, and final tool-disclosure statements under human accountability.

## Gate decision

`P002-NOVELTY-PASS = false`  
`P002-VENUE-FIT-CONDITIONAL = true`  
`submissionAllowed = false`

No submission, fee, authorship confirmation, disclosure confirmation, or venue contact is authorized by this assessment.
""".encode()


def amendment() -> bytes:
    return f"""# P26-002 retrospective amendment: novelty and venue positioning

Date: {AS_OF}

After the main working manuscript was assembled, a claim-level literature and venue audit found direct 2026 precedents for automated benchmark auditing, human-validated benchmark correction, scorer validation, provenance-rich evaluation reporting, construct-validity gating, and benchmark-as-measurement validity audits.

This amendment narrows the paper retrospectively. General claims about a new audit framework, a new separation of operational scoring from construct validity, or a new Invalid/Inconclusive gate are not permitted. The five quantitative BIPIA-frame findings remain eligible only as source-specific case-study results. Failure to locate the same exact quantities is not recorded as a novelty pass.

EMSE is recorded as a conditional venue fit, not a submission target or readiness decision. No Word package will be labeled submission-ready until the scientific evidence gap is addressed. The historical experiment protocol, original gates, `0/76` construct-approval status, and prohibition on execution, release, merge, fees, and submission remain unchanged.
""".encode()


def build(output: Path) -> None:
    output.mkdir(parents=True, exist_ok=True)
    artifacts = {
        "claim_novelty_crosswalk.csv": csv_bytes(CLAIMS),
        "source_ledger.json": canonical_json(SOURCES),
        "novelty_report.md": novelty_report(),
        "venue_assessment.md": venue_report(),
        "retrospective_amendment_20260910.md": amendment(),
    }
    for name, payload in artifacts.items():
        (output / name).write_bytes(payload)

    counts: dict[str, int] = {}
    for claim in CLAIMS:
        counts[claim["classification"]] = counts.get(claim["classification"], 0) + 1

    checks = {
        "bound_to_expected_head": SOURCE_HEAD == "ed758e55905e8432352c5063d671380e46c61b4d",
        "bound_to_expected_manuscript_blob": MANUSCRIPT_BLOB == "4169a31f72ab189e928a56e3c8addd9031401a44",
        "claim_count_12": len(CLAIMS) == 12,
        "prior_art_count_6": counts.get("PRIOR_ART") == 6,
        "source_specific_count_5": counts.get("SOURCE_SPECIFIC_RESULT") == 5,
        "synthesis_count_1": counts.get("SYNTHESIS_NOT_METHOD_NOVELTY") == 1,
        "source_count_13": len(SOURCES) == 13,
        "direct_2026_precedents_present": all(x in {s["source_id"] for s in SOURCES} for x in ["S04", "S05", "S06", "S07", "S08", "S09"]),
        "official_venue_sources_present": all(x in {s["source_id"] for s in SOURCES} for x in ["V01", "V02"]),
        "novelty_gate_closed": b"P002-NOVELTY-PASS = false" in artifacts["venue_assessment.md"],
        "submission_gate_closed": b"submissionAllowed = false" in artifacts["venue_assessment.md"],
        "zero_general_novel_claims": not any(c["classification"] == "NOVEL_GENERAL_METHOD" for c in CLAIMS),
        "no_accuracy_claim": b"validated comparator" in artifacts["novelty_report.md"],
        "human_review_not_substituted": b"Automated checks cannot substitute" in artifacts["venue_assessment.md"],
        "search_not_exhaustive_disclosed": b"not an exhaustive systematic review" in artifacts["novelty_report.md"],
        "no_fee_boundary": b"standard route" in artifacts["venue_assessment.md"],
        "historical_protocol_preserved": b"historical experiment protocol" in artifacts["retrospective_amendment_20260910.md"],
        "no_submission_authorization": b"No submission" in artifacts["venue_assessment.md"],
    }
    if not all(checks.values()):
        failed = [name for name, ok in checks.items() if not ok]
        raise SystemExit(f"validation failed: {failed}")

    manifest = {
        "schema_version": "p26-002-novelty-venue-validation/v1",
        "as_of": AS_OF,
        "source_head": SOURCE_HEAD,
        "manuscript_blob": MANUSCRIPT_BLOB,
        "disposition": "KEEP_AS_SOURCE_SPECIFIC_CASE_STUDY_NOT_STANDALONE_READY",
        "novelty_pass": False,
        "venue_fit_conditional": True,
        "submission_allowed": False,
        "claim_counts": counts,
        "source_count": len(SOURCES),
        "checks": checks,
        "artifact_sha256": {name: sha256(payload) for name, payload in artifacts.items()},
    }
    (output / "validation.json").write_bytes(canonical_json(manifest))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    build(args.output)
