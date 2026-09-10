# P26-002 BIPIA source-composition and transport sensitivity

Date: 2026-09-10  
Status: retrospective pre-execution estimand amendment; no outcomes

## Question

Does the feasible 181-case BIPIA frame identify the same pooled estimand as the full pinned 200-row source pool, and can its joint-power result support claims for each source?

## Source composition

The full pool contains 100 TableQA, 50 EmailQA, and 50 CodeQA cases, with weights 50%, 25%, and 25%. A feasible 181-case frame always contains all 100 TableQA direct cases and any 57 of 76 construct-dependent cases. Depending on construct acceptance, EmailQA and CodeQA can each range from 31 to 50 cases.

The current 181-case frame has weights **55.25% TableQA, 27.62% EmailQA, and 17.13% CodeQA**. Relative to the full pool, its total-variation distance is **7.87%**. For any source-specific scalar outcome bounded in [0, 1], the sharp composition-only difference between the current-frame mean and the full-pool-standardized mean can therefore reach **7.87%**. For a paired contrast bounded in [-1, 1], the sharp gap can reach **15.75%**.

Across every feasible 181-case composition, the smallest scalar-outcome gap is still **5.25%**, attained throughout the plateau from 36 CodeQA and 45 EmailQA cases through 45 CodeQA and 36 EmailQA cases. This irreducible gap comes from keeping all 100 TableQA cases in a frame of 181, which fixes TableQA at 55.25% rather than 50%. Source selection within a stratum can add further bias; these bounds isolate composition only.

## Per-source claim feasibility

The amended planning calculation uses one-sided alpha `0.05` for each of its two co-primary gates and a 5% false-rejection safety margin. At this alpha, a zero-event Clopper-Pearson upper bound falls below 5% only at **n >= 59**. TableQA has 100 cases, but EmailQA and CodeQA have at most 50 each. Their best possible zero-event upper bound is **5.82%**, so neither source can pass the 5% safety gate separately within this pool.

Under the same pessimistic planning assumptions, the pooled 181-case frame has a joint-power lower bound of **0.820525**. By contrast, the 100-case TableQA stratum has **0.339311**, and every EmailQA or CodeQA stratum of at most 50 cases has a zero joint lower bound because even zero safety events cannot meet the margin. The pooled power result therefore supports only a predeclared mixture-average claim. It cannot be described as evidence of adequate power for every source or as a transportable common effect.

## Decision-safe estimand contract

1. Keep source-specific paired outcome tables as mandatory descriptive results.
2. If a pooled confirmatory endpoint is retained, define it as the finite-frame average under one frozen source weighting scheme.
3. Use the full-pool 50/25/25 weights only as a standardization target, not as a claim that rejected construct cases were observed or exchangeable.
4. Do not infer source-level noninferiority from the pooled gate.
5. Treat within-source construct selection as unresolved unless a prospective, outcome-blind inclusion rule and its assumptions are accepted.

## Boundary

This is a design sensitivity analysis, not an empirical effect. No construct was approved, no target was executed, and no evaluator outcome or accuracy estimate was created. Comparator coverage remains 76/76 operationally, while construct approval remains 0/76. `mainTrialAllowed=false`, `releaseAllowed=false`, and `submissionAllowed=false` remain unchanged.
