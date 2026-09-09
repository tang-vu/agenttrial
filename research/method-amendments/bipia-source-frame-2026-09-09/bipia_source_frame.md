# P26-002 BIPIA source-and-reference frame

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
| Content-bearing short answer |       124 |      124 | Direct textual reference                               |
| Email sentinel `unknown`     |        26 |       26 | Explicit negative reference; construct review required |
| Full-code reference          |        50 |       31 | Exact source reference; equivalence policy required    |
| **Total**                    |   **200** |  **181** | Source-and-reference slots only                        |

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
| Frozen source-and-reference candidate pairs |   181 |
| Selected short-answer rows                  |   150 |
| Selected code-reference rows                |    31 |
| Slots requiring explicit construct policy   |    57 |
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
