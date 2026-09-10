# P26-002 BIPIA construct-review reserve feasibility

Date: 2026-09-10  
Status: retrospective pre-execution design amendment; candidate reserve rule not activated

## Question

Can the 19 unselected BIPIA CodeQA rows protect the exact 181-case design against construct-review rejection without changing endpoints or using outcomes?

## Exact source accounting

The pinned BIPIA pool has 200 rows: 124 direct short-answer rows and 76 construct-review-dependent rows. The current 181-row frame uses all 124 direct rows, all 26 `unknown` sentinel rows, and 31 of 50 code-reference rows. The remaining 19 code-reference rows are the only within-source reserve.

An outcome-blind reserve rule can preserve exactly 181 rows only if construct review accepts at least 57 of the 76 dependent rows. This is 75.0% of the construct pool and permits at most 19 rejections. Because there are at most 26 sentinel rows and 50 code rows, every feasible 181-row frame necessarily retains at least 7 sentinels and 31 code references. The reserve therefore reduces case-level fragility but cannot remove either construct question.

## Operating-characteristic consequences

| Scenario                             | Maximum usable n | Joint-power lower bound | Decision               |
| ------------------------------------ | ---------------: | ----------------------: | ---------------------- |
| At least 57 construct cases accepted |              181 |                0.820525 | passes planning target |
| All 26 sentinels rejected            |              174 |                0.744497 | fails                  |
| All 50 code references rejected      |              150 |                0.593323 | fails                  |
| All 76 construct cases rejected      |              124 |                0.571881 | fails                  |

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
