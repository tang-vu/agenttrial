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

The remaining technical gate is source-specific verification and label-blinded projection for all 80 pinned records. Active external testing remains disabled.
