#!/usr/bin/env python3
"""Build the P26-002 main manuscript from pinned pre-execution analyses."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from io import StringIO
from pathlib import Path


EXPECTED_BLOBS = {
    "power": "18a1136ee0fda5772e6508e38e2c68f6fc31d98c",
    "reserve": "0f7fa1dd56695abc46a7b66542339367c1badd99",
    "oracle": "b17126c6c503c99dff4d5effe5fc976afdc341bc",
    "transport": "488ce45560dc6e60b2e65691edf87ffaf740eab7",
    "selection": "d807a205830a542bb87e666b72642697d3366bb7",
}
SOURCE_HEAD = "8c4fe61d2afa74b8dad5fb1a289356585e5a46c0"


def git_blob_sha(path: Path) -> str:
    payload = path.read_bytes()
    return hashlib.sha1(f"blob {len(payload)}\0".encode() + payload).hexdigest()


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def canonical_json(value: object) -> bytes:
    return (json.dumps(value, indent=2, sort_keys=True) + "\n").encode()


def csv_bytes(rows: list[dict]) -> bytes:
    stream = StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=list(rows[0]), lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue().encode()


def manuscript(values: dict) -> bytes:
    return f'''# Auditing an Agent Evaluation Before Execution: Frame Fragility, Source Transport, and Partial Identification in a 200-Case Indirect Prompt-Injection Corpus

Author details: pending author confirmation  
Manuscript status: pre-author-confirmation working draft  
Article type: empirical methods case study

## Abstract

Agent evaluations can be reproducible at the file level while remaining scientifically unidentified at the claim level. We report a pre-execution audit of a proposed paired evaluation built from a pinned 200-case release of the Benchmarking and Defending Against Indirect Prompt Injection Attacks corpus (BIPIA). The audit separates four questions that are often collapsed: whether an answer can be scored deterministically, whether the answer key represents the intended construct, whether the selected frame supports its planned decision rule, and whether a pooled result transports across source mixtures. The source contains 100 TableQA, 50 EmailQA, and 50 CodeQA cases. A planned 181-case frame combines 124 direct short-answer cases with 57 cases requiring construct review. Under the amended joint-power rule, all 181 cases are needed: the lower bound is 0.820525 at 181 but 0.747187 at 180. The remaining 19 CodeQA cases can serve as an outcome-blind reserve only if at least 57 of 76 construct-dependent cases are accepted. Deterministic comparator coverage can be extended to all 76 cases, but this does not validate the constructs. The current frame changes source weights enough to permit a 7.873-percentage-point composition-only difference in a bounded mean and a 15.746-point difference in a paired contrast. Excluding 19 cases leaves the full-pool bounded mean only partially identified over an interval 9.5 points wide; the current CodeQA interval is 38 points wide. These are design results, not model outcomes. They show why operational completeness, construct validity, power, and transport should be gated separately before an agent benchmark is executed.

Keywords: agent evaluation; indirect prompt injection; benchmark design; partial identification; transportability; exact binomial inference; reproducibility

## 1. Introduction

Evaluation results for language-model agents are usually presented after systems have been run and aggregate scores have been calculated. At that stage, design decisions about the target population, answer keys, source composition, missing cases, and aggregation have already influenced the result. A high score can therefore be computationally reproducible while its scientific interpretation remains ambiguous. Re-running the same code does not determine whether a comparator represents the intended construct, whether a selected benchmark frame is adequate for a claim, or whether a pooled average applies beyond the exact mixture that was executed.

Indirect prompt injection is a demanding setting for these distinctions. The attack places instructions in content that an application treats as data, creating a conflict between the user's task and untrusted text. BIPIA was introduced to benchmark this threat across several content and task forms [1]. Its public release makes exact, source-bound analysis possible, but heterogeneous tasks also create choices about how answers are compared and combined. Table answers can often be treated as short strings, EmailQA includes both short answers and an `unknown` sentinel, and CodeQA expects executable-looking Python text. A single pooled score across these sources is meaningful only after the comparison rules and target mixture are defined.

This paper asks what can be learned before any candidate agent is executed. We audit a proposed paired design that compares AgentTrial with a baseline evaluator over a fixed BIPIA source release. The historical protocol and its closed gates are retained. The audit does not generate responses, apply attacks, assign human labels, or estimate accuracy. Instead, it binds source artifacts, reconstructs the finite frame, evaluates exact operating characteristics, extends deterministic comparator specifications, and derives composition and missing-outcome bounds.

The contribution is a source-specific empirical case study rather than a claim of a new statistical method. Exact binomial limits, outcome-blind reserve rules, total-variation bounds, and worst-case missing-outcome bounds are established tools [4-6]. Their combination exposes a concrete design failure mode: a benchmark can cross a pooled power threshold only when it retains cases whose constructs remain unapproved, while the resulting mixture is neither source-proportional nor sufficiently large for source-level safety claims. The case therefore clarifies which claims the present design could support if execution were later authorized and which claims remain unidentified.

We address four research questions:

- **RQ1:** How sensitive is the planned joint decision rule to loss of construct-dependent cases?
- **RQ2:** Can every construct-dependent case be scored by a frozen deterministic comparator without executing candidate agents?
- **RQ3:** How much can the pooled estimand change solely because feasible frames use different source weights?
- **RQ4:** What remains unidentified when 19 of the 200 source cases have no outcomes?

## 2. Background and related work

### 2.1 Indirect prompt injection and BIPIA

Yi et al. introduced BIPIA as a benchmark for indirect prompt injection and evaluated attacks and defenses across external-content tasks [1]. The benchmark is relevant to agent evaluation because it distinguishes the nominal user task from injected instructions embedded in retrieved material. Our analysis uses a pinned upstream revision and exact file identities rather than treating the benchmark name as a stable data object. This distinction matters because repositories and benchmark releases can change after a paper is published.

The present study does not reproduce BIPIA's model-vulnerability findings and does not evaluate its defenses. It uses the corpus as a finite source pool for examining an evaluation design. The unit of analysis is a pinned source case, not an independently sampled task from an undefined population. Consequently, descriptive finite-frame claims are separated from probability-sampled generalization.

### 2.2 Benchmark documentation and source composition

Datasheets for Datasets argues that dataset motivation, composition, collection, and recommended uses should be documented rather than inferred from a single aggregate score [2]. Recent benchmark-transparency work further demonstrates that data distribution can materially alter absolute performance and model ranking [3]. These concerns apply directly when a benchmark combines sources with different answer forms and when a subset is selected from only one source.

Our source accounting therefore precedes power or outcome analysis. We preserve TableQA, EmailQA, and CodeQA identities, distinguish direct short answers from construct-dependent sentinels and code references, and retain row-level hashes. A pooled estimator is treated as a weighted mixture of source-specific estimands. Changing source weights changes the estimand even if every source-specific outcome remains fixed.

### 2.3 Exact gates and partial identification

The planning design uses an exact one-sided binomial upper bound for a false-rejection safety endpoint and an exact unconditional sensitivity calculation for a paired benefit endpoint. Clopper and Pearson's construction is conservative by design and can change discretely when the allowed event count changes [4,5]. This discreteness is a property of the decision rule, not evidence of an underlying discontinuity in model behavior.

When cases are excluded without outcome information, point identification requires assumptions about the missing cases. Partial-identification analysis instead reports the set of values compatible with observed quantities and natural outcome ranges [6]. We apply elementary worst-case bounds. They are sharp for the stated finite frame because excluded bounded outcomes can be assigned any admissible value. They are not confidence intervals and do not imply that extreme assignments are likely.

## 3. Materials and methods

### 3.1 Version-bound source pool

All calculations were bound to exact Git blobs from the research branch. The pinned BIPIA observation contains 200 rows: 100 TableQA, 50 EmailQA, and 50 CodeQA. TableQA contributes 100 direct short-answer rows. EmailQA contributes 24 direct short-answer rows and 26 `unknown` sentinel rows. CodeQA contributes 50 full-code references. Thus, 124 rows have direct short-answer comparators and 76 rows require a construct decision about a sentinel or code-reference policy.

The existing 181-row frame retains all 124 direct rows, all 26 sentinel rows, and 31 CodeQA rows. The 19 unselected CodeQA rows are the complete within-source reserve. Selection among CodeQA rows is deterministic and outcome-blind, using canonical row hashes. Outcome blindness prevents selection based on later scores, but it does not make the selected rows a probability sample or establish exchangeability with excluded rows.

### 3.2 Construct and comparator separation

We distinguish **operational comparator coverage** from **construct approval**. Operational coverage asks whether a response can be transformed and compared by a deterministic machine rule. Construct approval asks whether that rule represents the scientific meaning of a correct answer. These are different properties.

For EmailQA sentinel cases, the candidate comparator retains a frozen normalized three-item closed set inherited from the earlier policy. For CodeQA, source reference values are verified against row-level SHA-256 digests before normalization. Candidate and reference strings are parsed under CPython 3.12 but never executed [8]. The primary code comparison is equality of attribute-free abstract syntax trees after parsing. Normalized exact text is a fallback only when parsing is unavailable. This rule intentionally does not accept arbitrary semantic equivalence because source-bound behavioral tests are absent.

We evaluated the comparator specification on the 50 source references and a synthetic mutation that appends a top-level `pass`. This is a machine-invariant check, not an accuracy study. Passing it demonstrates that the rule is deterministic for the known references and rejects one specified perturbation. It does not demonstrate correctness on independently labeled agent responses.

### 3.3 Planned paired decision rule

The amended design has co-primary benefit and safety gates. The benefit calculation uses an exact paired-proportion formulation derived from McNemar's test [7], with pessimistic discordance assumptions of 0.14 for baseline-only failure and 0.05 for AgentTrial-only failure. The safety endpoint limits the AgentTrial-only false-rejection rate to 0.05 using a one-sided exact upper bound at alpha 0.05. The assumed true rate for safety-power calculations is 0.01.

For each retained sample size `n`, we recomputed the exact benefit power and safety power. Their joint probability is lower-bounded without a correlation assumption by

`max(0, benefit power + safety power - 1)`.

The planning target is a joint lower bound of at least 0.80. These are operating characteristics under assumptions, not observed performance. Repeated evaluation of the same artifact would measure evaluator stability and does not increase the number of independent source cases.

### 3.4 Outcome-blind reserve analysis

The 200-row pool contains 76 construct-dependent rows but the 181-case frame needs 57 of them. We enumerated every feasible count of accepted sentinel and code cases. A frame can retain 181 cases if and only if at least 57 of 76 construct-dependent cases are approved. Because there are only 26 sentinel rows and 50 code rows, every feasible frame contains at least 7 sentinels and at least 31 code references. The reserve can absorb at most 19 construct rejections.

The reserve policy is retrospective because it was specified after the original frame. It remains outcome-blind and pre-execution. It ranks approved construct cases using the existing source rule and retains the first 57. If fewer than 57 are approved, the design is not described as confirmatory under the frozen operating-characteristic target.

### 3.5 Source-mixture sensitivity

The full-pool source weights are `(0.50, 0.25, 0.25)` for TableQA, EmailQA, and CodeQA. A feasible 181-case frame always contains 100 TableQA rows and has EmailQA and CodeQA counts between 31 and 50. For each feasible composition, we calculated total-variation distance from the full-pool weights.

For a source-specific mean bounded in `[0,1]`, total variation is the sharp maximum difference between two weighted averages caused by weights alone. For a paired source-specific contrast bounded in `[-1,1]`, the sharp maximum is the L1 distance between the weight vectors, which equals twice total variation. These bounds isolate composition. They exclude additional differences caused by non-random selection within a source.

We also recomputed the planned operating characteristics within each source-size limit. This determines whether pooled adequacy could be interpreted as source-level adequacy under the same assumptions and exact safety rule.

### 3.6 Missing-outcome bounds

Let `m181` be a bounded mean among 181 retained cases. If the 19 excluded outcomes are unrestricted in `[0,1]`, the full-pool mean belongs to

`[181*m181/200, (181*m181 + 19)/200]`.

The interval width is 19/200. If `d181` is a paired contrast in `[-1,1]`, the full-pool contrast belongs to

`[181*d181/200 - 19/200, 181*d181/200 + 19/200]`.

We derived the same bounds separately for EmailQA and CodeQA across every feasible split of the 57 construct cases. Because the missing values can take either natural endpoint independently, the bounds are sharp under the stated restrictions.

### 3.7 Reproducibility and tool use

All analyses were implemented as deterministic Python 3.12 builders. Each builder checks exact input Git blobs, writes canonical JSON, CSV, Markdown, and SVG artifacts, and emits a validation manifest with SHA-256 hashes. Independent clean builds were compared byte for byte, figures were rendered for visual inspection, and published Git blobs were read back and matched to expected object identities.

Language-model assistance was used for code generation, analysis drafting, and consistency checking under author direction. The computations were executed by scripts and all numerical claims in this manuscript trace to generated artifacts. Automated checking is not represented as independent human review. No system response, outcome, label, authorship confirmation, or disclosure decision was generated on behalf of an author.

## 4. Results

### 4.1 The planned joint-power gate has zero case-level attrition tolerance

Table 1 reports the exact checkpoints. At all 181 cases, pessimistic benefit power is {values['n181_benefit']:.6f}, safety power is {values['n181_safety']:.6f}, and the correlation-agnostic joint lower bound is **{values['n181_joint']:.6f}**. The joint target is met.

Removing a single case changes the maximum safety-passing event count from four to three. At `n=180`, safety power falls to {values['n180_safety']:.6f} and the joint lower bound falls to **{values['n180_joint']:.6f}**, below 0.80. Restricting the frame to 124 direct short-answer cases yields **{values['n124_joint']:.6f}**. Only 181 appears among the passing retained sizes.

| Retained cases | Construct-dependent cases | Benefit power | Safety power | Joint lower bound | Target met |
| -------------: | ------------------------: | ------------: | -----------: | ----------------: | :--------- |
|            181 |                        57 |      {values['n181_benefit']:.6f} |     {values['n181_safety']:.6f} |          {values['n181_joint']:.6f} | Yes        |
|            180 |                        56 |      {values['n180_benefit']:.6f} |     {values['n180_safety']:.6f} |          {values['n180_joint']:.6f} | No         |
|            124 |                         0 |      {values['n124_benefit']:.6f} |     {values['n124_safety']:.6f} |          {values['n124_joint']:.6f} | No         |

**Table 1.** Planning operating characteristics. Values are assumption-dependent design quantities, not outcomes.

The discontinuity is induced by an exact event-count rule. It should not be smoothed, but neither should it be interpreted as a physical threshold in agent quality. Scientifically, it means the current confirmatory designation depends on retaining every planned case despite 57 of them awaiting construct approval.

### 4.2 The reserve removes case-count fragility only under a 75% construct-acceptance condition

Using all 19 unselected CodeQA rows as a reserve changes the feasibility question. Exactly 181 cases can be retained if at least **57 of 76**, or **75%**, of construct-dependent rows are accepted. Up to 19 rejections can be absorbed. This eliminates the earlier dependence on the exact original 57 rows but does not eliminate dependence on either construct class.

Rejecting every sentinel leaves at most 174 cases and a joint lower bound of **{values['all_sentinel_rejected_joint']:.6f}**. Rejecting every code reference leaves at most 150 cases and a joint lower bound of **{values['all_code_rejected_joint']:.6f}**. Both are below target. Every feasible 181-case frame therefore contains at least seven sentinels and 31 code references.

### 4.3 Comparator coverage can be complete while construct approval remains absent

The deterministic policy was extended from 57 to all **76/76** construct-dependent rows. All **50/50** CodeQA references matched their row-level source hashes before normalization, parsed successfully, preserved their attribute-free AST through parse-unparse-parse, and rejected the appended-`pass` mutation. All 50 normalized references and all 50 AST representations were distinct.

Only **7/50** references preserved normalized exact text after parse-unparse. Thus, exact text equality is materially stricter than the frozen AST rule. One reserve case changed its normalized text hash solely because the documented policy trims outer whitespace. The reserve also contains a 265-node AST compared with a maximum of 102 in the selected code set. This is evidence of structural heterogeneity, not outcome difficulty.

Operational coverage is now complete for the finite construct pool, but construct approval remains **0/76**. The AST policy can reject known structural changes without establishing behavioral equivalence. Likewise, the EmailQA closed set can be deterministic without proving that it exhausts valid answers. RQ2 is therefore answered asymmetrically: machine specification is complete, but scientific validation is not.

### 4.4 The current frame changes the pooled estimand

The current 181-case source weights are **55.25% TableQA, 27.62% EmailQA, and 17.13% CodeQA**, rather than the full-pool weights of 50%, 25%, and 25%. The total-variation distance is **{values['current_tv']:.3%}**. Accordingly, source weighting alone can change a bounded mean by **{values['current_mean_gap']:.3%}** and a paired contrast by **{values['current_contrast_gap']:.3%}**.

Across every feasible 181-case composition, the bounded-mean gap cannot fall below **{values['minimum_mean_gap']:.3%}**. The minimum is a plateau spanning 36 through 45 selected CodeQA cases because TableQA remains fixed at 100/181, or 55.25%. No reserve split reproduces the full-pool mixture exactly.

The power calculation also fails to support source-level interpretations. Under the same pessimistic assumptions, the 100-case TableQA joint lower bound is **{values['table_joint']:.6f}**. EmailQA and CodeQA contain at most 50 cases each. At `n=50`, even zero safety failures have a one-sided exact upper bound of **{values['n50_zero_upper']:.3%}**, above the 5% margin, so their joint lower bound is zero under the frozen rule. A zero-event bound first meets the margin at `n=59`. Therefore, the pooled `n=181` result applies only to a declared mixture-average estimand and cannot establish adequate evidence within every source.

### 4.5 Excluding 19 cases leaves full-pool and source-level claims partially identified

With no assumption on excluded outcomes, the full-pool bounded-mean interval is **{values['pool_mean_width']:.1%}** wide and the paired-contrast interval is **{values['pool_contrast_width']:.1%}** wide. These widths persist regardless of the observed selected-case value.

The current frame excludes 19 of 50 CodeQA rows. Its CodeQA bounded-mean interval is therefore **{values['current_source_mean_width']:.1%}** wide, and its paired-contrast interval is **{values['current_source_contrast_width']:.1%}** wide. Reallocating retained construct rows shifts missingness between EmailQA and CodeQA. The smallest possible value of the larger source-specific mean width is **{values['minimum_source_mean_width']:.1%}**, attained at 40 or 41 selected CodeQA cases; the paired-contrast width remains **{values['minimum_source_contrast_width']:.1%}**.

The safety implication is concrete. Even if all 181 retained cases have no false rejection, the 19 missing cases allow a full-pool empirical false-rejection rate of **{values['zero_failure_pool_upper']:.1%}**. If four failures occur, which the pooled planning gate permits at `n=181`, the finite-pool upper value becomes **{values['four_failure_pool_upper']:.1%}**. With zero retained-case failures, at least nine excluded cases must be resolved as non-failures merely to guarantee that the finite-pool empirical rate does not exceed 5%. This is a deterministic finite-frame statement and does not replace the exact confidence procedure.

## 5. Discussion

### 5.1 Four gates that should not be collapsed

The case separates four properties. First, **provenance completeness** establishes which source bytes and rows are being discussed. Second, **operational comparator completeness** establishes that every response has a deterministic scoring route. Third, **construct validity** establishes whether that route represents the intended answer concept. Fourth, **estimand adequacy** establishes what population or finite mixture the pooled result describes.

The present audit reaches the first property and closes the machine-specification portion of the second for the 76 construct-dependent cases. It does not reach construct validity or execution readiness. Completing an AST comparator is not evidence that alternative correct programs will be accepted. Defining a sentinel set is not evidence that all acceptable natural-language answers are included. These limitations are not software defects that can be removed by adding a checksum; they require a construct decision supported by evidence external to the same automated workflow.

### 5.2 A power target can amplify construct dependence

The 181-case power result initially appears favorable because its joint lower bound exceeds 0.80. The attrition analysis changes its interpretation. A single lost case takes the lower bound below target because the exact safety gate allows one fewer failure at 180. The design is therefore not merely powered by the construct-dependent cases; its confirmatory label is discretely contingent on retaining all 57 planned cases or replacing rejected cases from the reserve.

The 19-case reserve is useful. It converts zero case-level tolerance into tolerance for up to 19 construct rejections. Yet the reserve does not solve the underlying validity problem: at least 57 of 76 construct cases must still be approved, including both sentinels and code references. Reporting the reserve without this condition would overstate robustness.

### 5.3 Pooled adequacy is not source-level adequacy

Heterogeneous benchmark aggregation is often treated as a reporting choice. Here it is part of the estimand. The selected frame overweights TableQA and underweights CodeQA relative to the full source pool. This change alone permits material movement in bounded outcomes. Moreover, the source strata are too small to satisfy the same safety rule separately, even though their pooled count crosses the joint threshold.

Two decision-safe reporting strategies follow. A study may define the 181-case mixture as its finite target and restrict all confirmatory language to that exact frame. Alternatively, it may report source-specific descriptive outcomes and standardize them to a predeclared target mixture. The second strategy still needs assumptions or bounds for excluded cases. Neither strategy supports an unqualified claim about indirect prompt injection tasks in general.

### 5.4 Partial identification is more informative than silent imputation

The missing-outcome bounds are deliberately assumption-light. Their width is large within CodeQA, which may seem unsatisfactory. Replacing them with an imputed point estimate would be narrower but would shift uncertainty into an untestable model. Because construct rejection can be related to answer ambiguity, a missing-at-random assumption is not automatic.

The sharp bounds identify what additional evidence would matter. Executing only the selected frame can answer questions about that frame but cannot identify the full 200-case mean. Reviewing or observing excluded cases narrows the bounds directly. A justified monotonicity or exchangeability restriction could also narrow them, but it must be declared as an assumption rather than hidden in an aggregate score.

### 5.5 Implications for agent-evaluation practice

The workflow generalizes as a diagnostic sequence, not as a novel estimator. Benchmark users should pin source versions, reconstruct row classes, separate scorer determinism from construct validity, inspect exact decision-rule discontinuities, quantify source-mixture changes, and retain worst-case bounds for excluded outcomes. Each step can be automated while leaving human scientific decisions explicit.

This sequence is especially relevant to agent evaluations that combine tool use, natural-language answers, and generated code. Such outputs rarely share a common comparator or error process. A single headline score can still be reported, but its weights, missingness rules, and source-level limitations should be part of the claim rather than relegated to implementation details.

## 6. Threats to validity

**Source validity.** The audit concerns one pinned BIPIA revision and one reconstructed 200-row pool. It does not establish that the pool represents deployed agents, current indirect-prompt-injection distributions, or other benchmark versions.

**Construct validity.** The 26 sentinel and 50 code-reference policies have not received independent construct approval. Machine invariants establish reproducibility, not semantic correctness. AST equality can reject behaviorally equivalent implementations, while an exact sentinel set can reject legitimate paraphrases.

**Statistical assumptions.** Power values depend on specified discordance probabilities, a 1% safety rate, a 5% margin, independence at the case level, and a correlation-agnostic lower bound. They are not empirical probabilities of study success. The sharp missing-outcome bounds use only natural ranges; they are valid under minimal assumptions but can be wide.

**Transport.** Total-variation bounds isolate differences in source weights. They do not cover non-random selection within sources, distribution shift beyond the three BIPIA sources, or changes to prompts, models, tools, and execution environments.

**Automation.** Deterministic regeneration and readback reduce transcription and version errors but do not supply independent human review. The workflow itself generated the code and prose used in the audit, so its internal checks cannot be treated as external validation.

## 7. Conclusion

The pre-execution audit changes what the proposed BIPIA evaluation can responsibly claim. A 181-case mixture crosses its assumption-dependent joint-power target, but the threshold has zero single-case attrition tolerance without a reserve and depends on construct approval for 57 cases. All construct cases can now be scored by a deterministic machine policy, yet none has been independently approved as a valid construct. The current source mixture permits a 7.873-point composition-only change in a bounded mean, and exclusion of 19 cases leaves the full-pool mean in a 9.5-point identification interval. Source-level intervals are wider.

These findings do not show that AgentTrial is more or less accurate than a baseline. They show that running the systems now would produce numbers whose broader interpretation is not yet secured. The appropriate next scientific action is to preserve source-specific estimands, resolve construct validity independently of the automated workflow, and either restrict claims to the selected finite frame or retain transparent partial-identification bounds for the full source pool.

## Declarations

**Funding:** No external funding statement has been confirmed for this manuscript.  
**Competing interests:** Pending author confirmation.  
**Data and code availability:** The analysis uses version-pinned public BIPIA source artifacts. Reproducible derived code and non-sensitive outputs are stored on the draft research branch.  
**Author contributions:** Pending author confirmation.  
**Ethics:** No human participants, personal data collection, or live agent execution occurred in this pre-execution audit.  
**Generative-tool disclosure:** Language-model assistance was used for code generation and drafting under author direction. Numerical results were generated by deterministic scripts and remain subject to author verification. The automated workflow was not treated as independent human review.

## References

1. Yi J, Xie Y, Zhu B, Kiciman E, Sun G, Xie X, Wu F. Benchmarking and Defending Against Indirect Prompt Injection Attacks on Large Language Models. arXiv:2312.14197. 2023. https://arxiv.org/abs/2312.14197
2. Gebru T, Morgenstern J, Vecchione B, Vaughan JW, Wallach H, Daume III H, Crawford K. Datasheets for Datasets. Communications of the ACM. 2021;64(12):86-92. https://doi.org/10.1145/3458723
3. Kovatchev V, Lease M. Benchmark Transparency: Measuring the Impact of Data on Evaluation. arXiv:2404.00748. 2024. https://arxiv.org/abs/2404.00748
4. Clopper CJ, Pearson ES. The Use of Confidence or Fiducial Limits Illustrated in the Case of the Binomial. Biometrika. 1934;26(4):404-413. https://doi.org/10.1093/biomet/26.4.404
5. Brown LD, Cai TT, DasGupta A. Interval Estimation for a Binomial Proportion. Statistical Science. 2001;16(2):101-133. https://doi.org/10.1214/ss/1009213286
6. Richardson A, Hudgens MG, Gilbert PB, Fine JP. Nonparametric Bounds and Sensitivity Analysis of Treatment Effects. arXiv:1503.01598. 2015. https://arxiv.org/abs/1503.01598
7. McNemar Q. Note on the Sampling Error of the Difference Between Correlated Proportions or Percentages. Psychometrika. 1947;12:153-157. https://doi.org/10.1007/BF02295996
8. Python Software Foundation. `ast` - Abstract Syntax Trees. Python 3.12 documentation. Accessed 2026-09-10. https://docs.python.org/3.12/library/ast.html
'''.encode()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--power", type=Path, required=True)
    parser.add_argument("--reserve", type=Path, required=True)
    parser.add_argument("--oracle", type=Path, required=True)
    parser.add_argument("--transport", type=Path, required=True)
    parser.add_argument("--selection", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    paths = {
        "power": args.power,
        "reserve": args.reserve,
        "oracle": args.oracle,
        "transport": args.transport,
        "selection": args.selection,
    }
    observed = {name: git_blob_sha(path) for name, path in paths.items()}
    if observed != EXPECTED_BLOBS:
        raise SystemExit(f"input blob mismatch: {observed}")

    power = json.loads(args.power.read_text())
    reserve = json.loads(args.reserve.read_text())
    oracle = json.loads(args.oracle.read_text())
    transport = json.loads(args.transport.read_text())
    selection = json.loads(args.selection.read_text())
    p = power["checkpoints"]
    values = {
        "n181_benefit": p["all_181"]["pessimistic_benefit_power"],
        "n181_safety": p["all_181"]["safety_power"],
        "n181_joint": p["all_181"]["joint_power_lower_bound"],
        "n180_benefit": p["exclude_one"]["pessimistic_benefit_power"],
        "n180_safety": p["exclude_one"]["safety_power"],
        "n180_joint": p["exclude_one"]["joint_power_lower_bound"],
        "n124_benefit": p["direct_only_124"]["pessimistic_benefit_power"],
        "n124_safety": p["direct_only_124"]["safety_power"],
        "n124_joint": p["direct_only_124"]["joint_power_lower_bound"],
        "all_sentinel_rejected_joint": reserve["scenarios"]["all_unknown_rejected"]["joint_power_lower_bound"],
        "all_code_rejected_joint": reserve["scenarios"]["all_code_rejected"]["joint_power_lower_bound"],
        "current_tv": transport["summary"]["current_frame_tv"],
        "current_mean_gap": transport["summary"]["current_frame_mean_gap"],
        "current_contrast_gap": transport["summary"]["current_frame_contrast_gap"],
        "minimum_mean_gap": transport["summary"]["minimum_mean_gap"],
        "table_joint": transport["summary"]["table_100_joint_power_lower_bound"],
        "n50_zero_upper": transport["summary"]["max_50_zero_event_upper"],
        "pool_mean_width": selection["summary"]["full_pool_mean_interval_width"],
        "pool_contrast_width": selection["summary"]["full_pool_contrast_interval_width"],
        "current_source_mean_width": selection["summary"]["current_worst_source_mean_width"],
        "current_source_contrast_width": selection["summary"]["current_worst_source_contrast_width"],
        "minimum_source_mean_width": selection["summary"]["minimum_worst_source_mean_width"],
        "minimum_source_contrast_width": selection["summary"]["minimum_worst_source_contrast_width"],
        "zero_failure_pool_upper": selection["summary"]["zero_selected_failure_full_pool_rate_upper"],
        "four_failure_pool_upper": selection["summary"]["four_selected_failures_full_pool_rate_upper"],
    }
    manuscript_bytes = manuscript(values)
    references = [
        {"id": i, "cited": True}
        for i in range(1, 9)
    ]
    claims = [
        {"claim_id": "P002-M001", "claim": "Only n=181 crosses the frozen joint-power target.", "source": "power", "status": "design_operating_characteristic"},
        {"claim_id": "P002-M002", "claim": "The reserve tolerates at most 19 construct rejections.", "source": "reserve", "status": "sharp_counting_result"},
        {"claim_id": "P002-M003", "claim": "All 76 construct cases have deterministic comparator coverage.", "source": "oracle", "status": "machine_specification_result"},
        {"claim_id": "P002-M004", "claim": "The current bounded-mean composition gap is 7.873 percentage points.", "source": "transport", "status": "sharp_weight_bound"},
        {"claim_id": "P002-M005", "claim": "The full-pool missing-outcome interval width is 9.5 percentage points.", "source": "selection", "status": "sharp_identification_bound"},
        {"claim_id": "P002-M006", "claim": "No model outcome or accuracy estimate is reported.", "source": "all", "status": "scope_boundary"},
    ]
    word_count = len(re.findall(r"\b[\w'-]+\b", manuscript_bytes.decode()))
    state = {
        "schema_version": "p26-002-main-manuscript-state/v1",
        "date": "2026-09-10",
        "title": "Auditing an Agent Evaluation Before Execution: Frame Fragility, Source Transport, and Partial Identification in a 200-Case Indirect Prompt-Injection Corpus",
        "source_head": SOURCE_HEAD,
        "input_git_blobs": observed,
        "word_count": word_count,
        "reference_count": len(references),
        "claim_count": len(claims),
        "article_type": "empirical_methods_case_study",
        "novel_method_claimed": False,
        "model_outcomes_reported": 0,
        "construct_approved": 0,
        "author_confirmation_required": True,
        "main_trial_allowed": False,
        "release_allowed": False,
        "submission_allowed": False,
    }
    amendment = b'''# P26-002 retrospective amendment: main-manuscript synthesis

Date: 2026-09-10

The main working manuscript is reframed as a pre-execution empirical methods case study that synthesizes the existing frame-power, reserve, comparator, transport, and partial-identification analyses. This does not replace or erase the historical experimental protocol. It prevents design operating characteristics from being reported as model outcomes and makes the current scientific contribution explicit while execution remains blocked.

The manuscript does not claim a novel estimator, comparator accuracy, construct validity, or an AgentTrial performance advantage. Author identity, contributions, competing interests, final disclosure wording, venue choice, and submission remain pending author confirmation. No construct approval, execution, outcome, release, merge, or submission is authorized.
'''
    payloads = {
        "main_manuscript.md": manuscript_bytes,
        "manuscript_state.json": canonical_json(state),
        "references.json": canonical_json(references),
        "claim_evidence_crosswalk.csv": csv_bytes(claims),
        "retrospective_amendment_20260910.md": amendment,
    }
    checks = {
        "input_blobs_exact": observed == EXPECTED_BLOBS,
        "manuscript_over_3500_words": word_count >= 3500,
        "eight_references": len(references) == 8,
        "six_claims_traced": len(claims) == 6,
        "power_values_match": values["n181_joint"] == 0.82052457 and values["n180_joint"] == 0.747186784,
        "reserve_values_match": reserve["counts"]["minimum_construct_acceptances"] == 57 and reserve["counts"]["maximum_construct_rejections"] == 19,
        "oracle_coverage_76": oracle["counts"]["full_pool_comparator_coverage"] == 76,
        "construct_approval_zero": oracle["counts"]["construct_approved"] == 0,
        "transport_values_match": values["current_mean_gap"] == 0.078729282 and values["current_contrast_gap"] == 0.157458564,
        "selection_values_match": values["pool_mean_width"] == 0.095 and values["current_source_mean_width"] == 0.38,
        "no_model_outcomes": state["model_outcomes_reported"] == 0,
        "no_novel_method_claim": state["novel_method_claimed"] is False,
        "author_confirmation_retained": state["author_confirmation_required"] is True,
        "all_gates_closed": not state["main_trial_allowed"] and not state["release_allowed"] and not state["submission_allowed"],
        "tool_use_disclosed": b"Language-model assistance" in manuscript_bytes,
        "independent_review_not_claimed": b"not represented as independent human review" in manuscript_bytes,
        "no_em_dash": all(b"\xe2\x80\x94" not in payload for payload in payloads.values()),
    }
    validation = {
        "schema_version": "p26-002-main-manuscript-validation/v1",
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
