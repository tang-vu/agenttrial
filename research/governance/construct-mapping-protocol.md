# P26-002 construct-mapping review protocol

## Purpose

This review determines whether each independent source unit operationalizes the proposed fault scenario and its target-specific matched control. It does not review projection readiness, evaluator performance, or study outcomes.

## Prerequisite

Scenario variants such as `minimal`, `boundary`, and `nested` require pre-specified operational definitions. A variant name appended to a common injection is not an operational definition. Reviewers must reject a proposed mapping when the frozen descriptor does not provide enough observable criteria to distinguish that variant.

## Independent review

Two human reviewers work independently and do not inspect each other's decisions before both records are complete. Each reviewer must:

1. compare the full target descriptor, ground-truth authority, adaptation boundary, fault scenario, and matched-control scenario;
2. decide `approve` or `reject`;
3. provide a stable reviewer identity and a row-specific rationale;
4. avoid using evaluator outputs, projection readiness, or study outcomes.

Matching by family and ordinal position is only a deterministic proposal. It is not evidence for approval.

## Disagreement and rejection

A third independent human adjudicator reviews only rows where the first two decisions disagree and records a rationale. A rejected row remains a main-trial blocker. Before any remap or exclusion, the construct-mapping G3 evidence must document a pre-specified replacement rule, preserve one-to-one target allocation, and record the affected design and target digests. Automated agents cannot make or fill any of these decisions.

## Interpretation boundary

Benchmark source and fault family are partly confounded in the current target universe. Construct approval does not remove that limitation. Primary reporting must retain source-stratified sensitivity analysis and avoid generalizing a family effect beyond the benchmark systems that instantiate it.
