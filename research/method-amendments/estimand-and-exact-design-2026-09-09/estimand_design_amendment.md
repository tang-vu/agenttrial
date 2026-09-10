# P26-002 estimand and exact design amendment

Date: 2026-09-09  
Status: reversible machine selection pending independent method review and all execution gates

## Primary design

Within a prospectively frozen set of unique fault and matched-control executions, does AgentTrial reduce false acceptance relative to final-output-only evaluation while keeping AgentTrial-only false rejection below a five-percentage-point margin?

The primary benefit estimand is the paired false-acceptance risk difference between final-output-only and AgentTrial on unique fault executions. The co-primary safety estimand is the AgentTrial-only false-rejection probability on unique matched controls, with a 0.05 noninferiority margin. Both components must pass. Trace-presence and the frozen local LLM judge are secondary comparators.

The unit is one unique physical execution artifact under one condition and one source-unit binding. Replaying an evaluator, reusing a control, or renaming a family-order binding never creates another observation.

## Exact operating characteristics

| Scenario    | Benefit power at n=80 | First n with benefit power >=0.80 |
| ----------- | --------------------: | --------------------------------: |
| pessimistic |              0.500390 |                               156 |
| planning    |              0.899393 |                                62 |
| optimistic  |              0.997149 |                                33 |

Safety alone first reaches 0.80 power at n=124 under a true AgentTrial-only control error rate of 0.01. Requiring both pessimistic benefit and safety to succeed gives the first correlation-agnostic joint-power lower-bound crossing at n=181.

At n=181, pessimistic benefit power is 0.856854, safety power is 0.963670, the largest passing safety event count is 4, and the joint lower bound is 0.820525.

## Feasibility consequence

The registered 80-pair frame is not confirmatory under this design. The exact confirmatory target is 181 unique fault/control pairs, requiring 101 additional fault slots and 101 additional control slots beyond the registered frame. Relative to current evidence, 121 additional unique fault executions and 161 additional unique controls are needed.

The existing frame may still be analyzed as a finite-frame descriptive census or pilot estimate, but not as confirmatory evidence and not as a population-general result.

## Governance boundary

This amendment changes no historical protocol artifact and creates no trial outcome, human construct mapping, independent review, source authorization, private-data upload, execution permission, release, merge, fee, or submission. All gates remain closed.
