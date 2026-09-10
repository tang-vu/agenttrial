# P26-002 superseded power sensitivity analysis

This directory preserves the historical sensitivity simulation run before any main-study outcomes were observed. It is not a valid sample-size decision for the current source binding.

## Decision

The superseded candidate used 80 nominal fault slots, 80 matched-control slots, and 20 executions per slot. That is 3,200 shared execution artifacts, each scored by the same evaluator set.

The simulation assumed ten operationally distinct variants in each of eight fault families and independent configuration clusters. The current scenario matrix instead collapses to eight family-level semantic profiles, and the pinned source units do not supply the assumed independent executions. The table therefore reports only what the superseded model produced:

| Simulated candidate                | Shared execution artifacts | Pessimistic power | 95% Monte Carlo interval | Historical threshold |
| ---------------------------------- | -------------------------: | ----------------: | -----------------------: | -------------------- |
| 64 configurations x 20 repeats     |                      2,560 |             0.776 |           0.760 to 0.790 | Below                |
| 64 configurations x 30 repeats     |                      3,840 |             0.801 |           0.786 to 0.815 | Below lower bound    |
| **80 configurations x 20 repeats** |                  **3,200** |         **0.887** |       **0.876 to 0.898** | **Cleared**          |
| 96 configurations x 20 repeats     |                      3,840 |             0.921 |           0.910 to 0.930 | Cleared              |

The binding sensitivity case assumed a nine-percentage-point paired false-acceptance benefit and ICC 0.30. The 80-by-20 candidate also had estimated probability 0.943, interval 0.934 to 0.951, of establishing the five-point false-rejection noninferiority margin when true added harm is one point and ICC is 0.20. These figures are inapplicable until a redesigned study satisfies their unit and independence assumptions.

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

These are historical sensitivity assumptions, not effects estimated from the synthetic pilot. Clearing the simulated threshold does not establish an effect, statistical independence, a valid design, authorization, or method freeze. A redesigned study requires a new power analysis tied to its actual unit of analysis and execution inventory.
