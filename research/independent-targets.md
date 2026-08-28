# P26-002 independent target source lock

The prospective main-study source set now contains 80 configurations, exactly ten for each frozen fault family. Every source is public, pinned by commit and blob hash where applicable, and licensed MIT or Apache-2.0. No paid API or third-party service probing is required.

| Source                                                                                          | Selected | Primary role                                                                  | License    |
| ----------------------------------------------------------------------------------------------- | -------: | ----------------------------------------------------------------------------- | ---------- |
| [AgentChaosBench](https://github.com/kevinzck8k/agentic-fault-diagnosis)                        |       50 | Sanitized, aligned runtime-fault and no-fault traces across five systems      | MIT        |
| [AgentDojo](https://github.com/ethz-spylab/agentdojo)                                           |       10 | Prompt-injection tasks with upstream utility and security functions           | MIT        |
| [BFCL V4](https://github.com/ShishirPatil/gorilla/tree/main/berkeley-function-call-leaderboard) |       10 | Missing-parameter tasks with executable ground truth and matched base entries | Apache-2.0 |
| [tau2-bench](https://github.com/sierra-research/tau2-bench)                                     |       10 | Scoring-contract omission stress cases independently documented in issue 384  | MIT        |

`independent-targets.json` is the machine-readable source lock. It contains each source revision, selected ID, matched control, label authority, relevant upstream blob hashes, and release boundary.

## Independence controls

- Source revisions and labels were locked before adapter implementation or evaluator outcomes.
- Upstream ground-truth fields are prohibited from evaluator inputs.
- Adapters may translate schemas but may not change labels after results are observed.
- A second reviewer must approve construct mappings before the main run.
- Large upstream traces are not vendored. The public artifact contains identifiers, adapters, hashes, and derived aggregates.

## Construct limits

Three mappings remain deliberately narrow:

- AgentChaosBench `corruption` supports corrupted tool-output grounding, not a general claim about citation provenance.
- `agent_misroute` and `infinite_loop` are aligned routing/loop divergence proxies, not stochastic instability.
- tau2 issue 384 is an independently reported open audit. These entries are an evaluator-omission stress set, not a claim that maintainers have adjudicated the issue.

The first read-only adapter smoke test now passes against the pinned 203,596-byte AgentChaosBench trace for `ext-001`: 70 spans were projected, no forbidden key or locked label value leaked, and only the derived projection hash is retained in `targets/agentchaos-adapter-smoke.json`. The source trace is not vendored.

Source-schema smoke tests also pass for the three remaining source families. An upstream-published AgentDojo run was projected without utility, security, attack setup, or source identifiers. Pinned BFCL and tau2 source records were validated with synthetic candidate executions used only to exercise adapter paths; ground truth, reference paths, initial state, and evaluation criteria were excluded. Derived hashes are recorded in `targets/multi-source-adapter-smoke.json`, and no upstream source payload was retained.

The source-availability audit now verifies all 80 frozen units at their pinned revisions: 50 AgentChaosBench trace and control paths plus label blobs, 10 AgentDojo task/attack pairs against public run schemas, all 10 BFCL fault and control question/answer pairs, and all 10 tau2 task records against the frozen field extraction. `targets/source-availability-audit.json` publishes only identifiers, blob hashes, sizes, and derived checks. Upstream payloads and AgentDojo utility/security outcomes are not retained.

All 50 independent AgentChaosBench traces now pass the real label-blinded adapter. The audit processed 25,063,408 source bytes and 11,621 trace spans, produced 50 pinned projection hashes, and found zero forbidden keys. Forty upstream records have a null `question`, so the adapter assigns a neutral task fallback while preserving the full observable telemetry. Natural words such as “corruption” remain observable evidence; only structural ground truth and unique locked identifiers are blocked. `targets/agentchaos-projection-audit.json` contains the derived audit, not the source traces.

The remaining technical gate is creation of controlled candidate executions for the 10 AgentDojo, 10 BFCL, and 10 tau2 targets. Public AgentDojo runs are schema validation only, the two synthetic adapter candidates are not study evidence, and active external testing remains disabled. Independent construct-mapping review is still required before main-study inference.
