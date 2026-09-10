# P26-002 source-task cluster sensitivity

Status: sensitivity only; no method freeze or trial evidence  
Date: 2026-09-09  
Parent PR head: `07a5ec2580fb2b35857e1611de01d457f52465a2`

## Question

Can the 281 nominal physical fault/control candidates support the n=181 design after repeated AgentDojo tasks across model pipelines are treated as dependent content clusters?

## Main result

No, not under a conservative one-pair-per-content-cluster route. The 256 AgentDojo physical candidates collapse to **87 suite/user-task clusters**. Treating the **25 distinct AgentChaosBench no-fault control artifacts** as singleton clusters gives **112 source-task clusters**, leaving **69 additional independent clusters** below n=181.

If the physical-unit planning probabilities are transported unchanged to one independent Bernoulli pair per cluster, n=112 gives benefit power **0.654782**, safety power **0.691495**, and a correlation-agnostic co-primary joint lower bound of **0.346277**. This is far below 0.80. The calculation is an estimand sensitivity, not a claim that task-cluster event probabilities equal the earlier physical-unit assumptions.

| Unit interpretation                |   n | Benefit power | Safety power | Joint lower bound |
| ---------------------------------- | --: | ------------: | -----------: | ----------------: |
| AgentDojo task clusters only       |  87 |      0.539437 |     0.417121 |          0.000000 |
| All source-task clusters           | 112 |      0.654782 |     0.691495 |          0.346277 |
| Previous independent-pair boundary | 181 |      0.856854 |     0.963670 |          0.820525 |
| Naive physical count               | 281 |      0.964156 |     0.992049 |          0.956205 |

The naive n=281 row is displayed only to quantify the pseudoreplication gap. It is not an admissible analysis.

## Pipeline-priority sensitivity

All 120 orders of the five pipeline names were enumerated. Exactly 15 AgentDojo clusters occur in one pipeline and are priority invariant; the representative for the other **72 clusters** changes with pipeline priority. The number assigned to any one pipeline ranges from 0 to 73. No priority order is selected because doing so after published upstream outcomes are visible would add another post-hoc degree of freedom.

## ICC diagnostic

For an equally weighted physical-execution mean, the observed cluster sizes give `sum m(m-1)=646`. The design-effect identity places effective n at 181 when the exchangeable within-task ICC is approximately **0.240323**. This is not a validity threshold: the exact safety acceptance boundary is discrete and non-monotone, the ICC is unobserved, and effective-n substitution is not a clustered binary test.

The diagnostic therefore does not rescue the 281-row analysis. A physical-execution estimand would require a prospectively frozen pipeline population and a cluster-aware analysis contract; a task-cluster estimand requires at least 69 additional independent clusters under the current transported planning assumptions.

## Governance boundary

No evaluator was run, no trial outcome or ICC was observed, no representative pipeline order was selected, and no human review was created. The registered frame is unchanged. `mainTrialAllowed=false`, `releaseAllowed=false`, and `submissionAllowed=false`.
