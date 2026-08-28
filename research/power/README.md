# P26-002 prospective power analysis

This directory freezes the sample-size rationale before any main-study outcomes are observed.

## Decision

The main design uses 80 unique fault configurations, 80 matched controls, and 20 executions per configuration. That is 3,200 run artifacts, each evaluated by the same frozen evaluator set.

The design expands the earlier 64-configuration floor to ten variants in each of eight fault families. Under clustering, adding independent configurations produces more information than adding repeats to the same configurations:

| Design                             | Total fault and control runs | Pessimistic power | 95% Monte Carlo interval | Gate                  |
| ---------------------------------- | ---------------------------: | ----------------: | -----------------------: | --------------------- |
| 64 configurations x 20 repeats     |                        2,560 |             0.776 |           0.760 to 0.790 | Fail                  |
| 64 configurations x 30 repeats     |                        3,840 |             0.801 |           0.786 to 0.815 | Fail lower-bound rule |
| **80 configurations x 20 repeats** |                    **3,200** |         **0.887** |       **0.876 to 0.898** | **Pass**              |
| 96 configurations x 20 repeats     |                        3,840 |             0.921 |           0.910 to 0.930 | Pass, higher workload |

The binding sensitivity case assumes a nine-percentage-point paired false-acceptance benefit and ICC 0.30. The selected design also has estimated probability 0.943, interval 0.934 to 0.951, of establishing the five-point false-rejection noninferiority margin when true added harm is one point and ICC is 0.20.

## Method

- Each configuration receives a Dirichlet draw over four paired outcomes: neither evaluator errs, comparator only errs, AgentTrial only errs, or both err.
- Repetitions are categorical draws nested within that configuration.
- The primary statistic is the studentized mean of within-configuration paired error-rate differences.
- Planning uses a one-sided Bonferroni alpha of 0.05 / 3, conservative relative to the frozen Holm procedure.
- Every cell uses 3,000 simulations and a fixed seed. Selection requires the 95% Monte Carlo lower bound, not only the point estimate, to reach 0.80.

`power-analysis.json` contains every assumption and result cell. Regenerate it with:

```bash
pnpm research:power
```

## Interpretation boundary

These are prospective sensitivity assumptions, not effects estimated from the synthetic pilot. Passing the power gate does not establish an effect and cannot replace independent targets, independent ground truth, authorization, or the preregistered main trial.
