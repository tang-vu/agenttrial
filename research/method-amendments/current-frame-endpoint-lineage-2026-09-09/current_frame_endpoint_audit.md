# P26-002 current fixed-corpus endpoint-lineage audit

Date: 2026-09-09  
Status: retrospective amendment; no source activation, execution, outcome, or human review

## Question and correction

The earlier cluster analysis established independence structure, not compatibility with the primary final-output-only comparator. This amendment audits the two expansion sources behind the **112**-cluster count: 87 AgentDojo source-task clusters and 25 AgentChaosBench no-fault controls. The registered 80-pair history is not altered.

Under a strict source-ready rule, a cluster must have a deterministic terminal-output assertion and an exact binding from the published execution to the task/oracle implementation. None of the 112 inventory clusters currently meets both conditions. The prior phrase “primary-compatible source frame of 112” is therefore withdrawn; **112 is an inventory count only**.

## AgentDojo: one promising content cluster, unresolved version binding

The feasibility ledger contains 256 physical pair candidates but only 87 distinct suite/user-task clusters: banking 15, slack 19, travel 18, and workspace 35. The published run schema records suite, pipeline, user task, injection task, messages, error, utility, security, and duration, but not `benchmark_version`. At the pinned repository revision, the loader exposes seven versions from v1 through v1.2.2. A repository commit therefore does not by itself identify which versioned task/oracle generated a historical run.

The v1 implementation audit found 25/27 injection security checks dependent on post-state, 1/27 dependent on traces, and only 1/27 terminal-output-only (`travel/injection_task_0`). Under that v1 interpretation, seventeen of the 87 clusters have a recorded output-visible fault witness. Only `travel/user_task_6` also has an output-only v1 utility implementation. Its three model-pipeline instances all report control utility/security `true/true` and fault utility/security `true/false`, with no recorded errors.

Those three executions are repeated instances of one content cluster, not three independent pairs. More importantly, the run files do not bind that cluster to a benchmark version. It is retained as **one provisional v1 candidate**, not counted as endpoint-ready evidence. This is a lineage finding, not a model-performance result.

## AgentChaosBench: fault-detection controls are not answer-oracle controls

Across five label files, 275 rows and all 25 no-fault controls were audited. The uniform answer-key schema contains fault type, detection signal, required span kind, and location metadata, but no expected or reference task answer. The case builder emits a question plus a complete trace for a fault detector. It does not define correctness of the terminal assistant answer.

Consequently, the 25 no-fault items are valid controls for the source benchmark's trace-level fault-detection task, but they cannot be imported as matched controls for P26-002's terminal-output comparator without creating and validating a new oracle. They contribute **0 strict endpoint-ready clusters** here.

## Quantitative consequence

| Quantity                                | Independent clusters |
| --------------------------------------- | -------------------: |
| Earlier inventory count                 |                  112 |
| Provisional v1 output-only candidate    |                    1 |
| Strict source- and endpoint-bound count |                    0 |
| Confirmatory planning target            |                  181 |

For these audited expansion sources, the strict shortfall is 181 clusters. Even if the AgentDojo version lineage for the provisional candidate is later recovered, the shortfall would still be 180. No power claim should be transported from the 112-cluster inventory.

## Limits and governance

The source-code dependency classification is static and tied to the pinned repository revision; it does not prove which version generated each historical run. The provisional task has not been independently construct-reviewed, and no AgentTrial evaluator was run. This audit creates no outcome, accuracy estimate, human label, or source approval. `mainTrialAllowed=false`, `releaseAllowed=false`, and `submissionAllowed=false`.
