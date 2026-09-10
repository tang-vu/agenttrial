# P26-002 BIPIA frame and oracle-power sensitivity

Date: 2026-09-10  
Status: retrospective design-feasibility amendment; no trial execution or outcome

## Question

Does the 181-row confirmatory plan remain feasible if cases that still require independent construct review cannot be used?

## Bound inputs

The analysis joins three public, exact-blob inputs from the P26-002 research branch: the narrowed co-primary design, the frozen 181-row BIPIA source frame, and the deterministic final-output oracle policy. The frame contains 124 direct short-answer rows and 57 review-dependent rows: 26 EmailQA `unknown` sentinels and 31 CodeQA references. Operational comparator behavior is specified for all 57, but construct validity remains unapproved.

## Result

The exact planning target has zero attrition tolerance with respect to those 57 cases. With all 181 rows retained, pessimistic benefit power is 0.856854, safety power is 0.963670, and the correlation-agnostic joint lower bound is 0.820525. This is the only retained size from 124 through 181 that reaches the planned 0.80 joint lower bound.

Excluding only one review-dependent row gives n=180. Benefit power remains 0.854923, but the exact one-sided Clopper-Pearson safety rule then permits at most three events rather than four. Safety power falls from 0.963670 to 0.892264, and the joint lower bound falls to 0.747187.

If all 57 review-dependent rows are excluded, the 124 direct short-answer cases provide benefit power 0.700328, safety power 0.871554, and a joint lower bound of 0.571881. Thus the direct subset alone is not confirmatory under the stated pessimistic assumptions.

## Interpretation

The 181-row source count closes numerical availability only conditionally. It does not provide slack for an independent review to reject even one sentinel or code comparator while preserving the registered confirmatory operating characteristic. The discontinuity at 181 is a property of the exact finite-sample safety rule and should be disclosed rather than smoothed away.

This does not invalidate the BIPIA rows or approve their constructs. It shows that feasibility and oracle validity are coupled: the source frame reaches its target only if all 57 ambiguous cases are retained. A robust confirmatory design would need additional pre-outcome source rows or a prospectively justified operating characteristic with explicit attrition allowance.

## Boundaries

- The powers are design operating characteristics under declared probabilities, not observed effect estimates.
- No BIPIA response, AgentTrial judgment, human label, or execution artifact was created.
- The analysis does not widen the oracle policy or mark any construct as valid.
- `mainTrialAllowed=false`, `releaseAllowed=false`, and `submissionAllowed=false` remain unchanged.
