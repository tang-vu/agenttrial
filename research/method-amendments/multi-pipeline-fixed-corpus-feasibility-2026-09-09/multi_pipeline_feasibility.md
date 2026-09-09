# P26-002 multi-pipeline fixed-corpus feasibility and dependence audit

Status: nominal physical count feasible; cluster validity unresolved  
Date: 2026-09-09  
Parent study commit: `f38d0e3f2821caab3e22b3810b9bf0e669f4909f`

## Question

Can a zero-cost retrospective fixed corpus reach the exact-design target of 181 unique physical fault/control execution pairs by extending AgentDojo beyond the registered `command-r-plus` pipeline, and what dependence is introduced by repeating the same source tasks across models?

## Result

Across five pinned AgentDojo pipelines, the audit assessed **485 no-attack executions** and **1900 attack executions** attached to qualifying controls. It found **256 physical control executions** with at least one published security-failure witness. Adding the **25** distinct AgentChaosBench no-fault executions gives a nominal ceiling of **281 physical pairs**, which exceeds 181 by **100**.

That numerical success depends on repeatedly instantiating the same AgentDojo task under different model pipelines. The 256 AgentDojo executions represent only **87 distinct suite/user-task keys**. Even after adding the 25 AgentChaosBench control identities, the content-level ceiling is **112 source-task clusters**, **69 below** the n=181 target.

## Pipeline counts

| Pipeline                   | Controls assessed | Qualifying controls | Attacks assessed | Security-failure artifacts | Pairable physical controls |
| -------------------------- | ----------------: | ------------------: | ---------------: | -------------------------: | -------------------------: |
| command-r-plus             |                97 |                  24 |              160 |                        143 |                         23 |
| gpt-4-0125-preview         |                97 |                  64 |              415 |                        165 |                         52 |
| gpt-4o-2024-05-13          |                97 |                  67 |              434 |                        193 |                         54 |
| claude-3-5-sonnet-20240620 |                97 |                  77 |              492 |                        316 |                         73 |
| gpt-4-turbo-2024-04-09     |                97 |                  63 |              399 |                        272 |                         54 |
| **AgentDojo total**        |           **485** |             **295** |         **1900** |                   **1089** |                    **256** |

## Dependence result

Mean AgentDojo multiplicity is **2.943 executions per source-task cluster**. Cluster multiplicities are 15 task(s) observed in 1 pipeline(s), 19 task(s) observed in 2 pipeline(s), 22 task(s) observed in 3 pipeline(s), 18 task(s) observed in 4 pipeline(s), 13 task(s) observed in 5 pipeline(s). The extra model executions are real physical artifacts but not new task content. Treating all 256 as independent would ignore shared prompts, tools, policies, and ground-truth functions.

The current exact power result can be transported to this corpus only after a prospective amendment freezes the multi-pipeline target population and a dependence model. A task-cluster analysis has at most 112 clusters in these two archives and cannot inherit the n=181 independent-pair calculation.

## Retrospective boundary

`command-r-plus` is the registered pipeline. The other four pipelines were purposefully selected after aggregate upstream results were visible to test numerical feasibility. The selection did not use AgentTrial outcomes because no AgentTrial evaluator was run, but it is still post-hoc source-frame construction. This audit is not a confirmatory cohort, independent review, construct approval, or trial evidence.

No trajectory or prompt payload is stored. The snapshots record public path/blob witnesses, counts, and upstream eligibility fields. The registered 80-target frame and all gates remain unchanged.

## Decision

A free fixed-corpus route is **numerically possible at the physical-execution level** (281 candidate pairs) but not scientifically ready. The next admissible design decision is between:

1. a prospectively frozen multi-pipeline physical-execution estimand with task-cluster-aware inference; or
2. a source-task-cluster estimand with a new power calculation and additional task sources.

Until one route is independently approved, these 281 candidates must not be called a powered sample and `mainTrialAllowed=false`.
