# P26-002 candidate contribution scope

Version: 0.1.0

Verified against primary sources on 2026-08-28 and amended on 2026-08-29. Status: **redesign required before any empirical contribution is frozen**.

## Decision

The original broad framing is not defensible as a novelty claim. Prior work already covers signed Trust Certificates, capability-bound certificates, Ed25519 and SHA-256 ledgers, deterministic policy replay, evidence checklists with explicit Unknown outcomes, meta-evaluation of LLM judges, and matched provenance interventions.

An August 2026 audit added AgentChaosBench, which already provides controlled operational faults, aligned no-fault traces, held-out labels, and fault localization across multi-agent telemetry. P26-002 therefore also prohibits novelty claims around runtime-fault benchmarking, trace-based diagnosis, or localization.

P26-002 will therefore study evaluator error. The signed evidence bundle is an experimental treatment and reproducibility mechanism, not a new cryptographic primitive or a proof of semantic correctness.

## Candidate paper question

> Do precommitted, claim-specific evidence contracts with deterministic assertions and portable integrity verification reduce false acceptance of unreliable AI-agent runs relative to final-output, trace-presence, and frozen LLM-judge evaluators, without materially increasing false rejection on matched fault-free controls?

## Conditional contribution targets

These remain targets, not completed or frozen contributions:

1. A redesigned paired evaluator study covering operationally defined fault constructs, with matched grounded controls and an execution plan aligned to the unit of analysis.
2. A meta-evaluation of evaluator false acceptance and false rejection across identical artifacts, with uncertainty, paired tests, resampling at the approved clustering level, and error analysis by fault construct.
3. An ablation study separating precommitted plans, deterministic assertions, coverage accounting, hash-chain integrity, evidence-root integrity, signatures, and optional anchoring.
4. A portable, credential-free replication path and explicit release boundaries. This would be an engineering and reproducibility contribution, not a claim that the underlying cryptographic components are novel.

## Claims explicitly prohibited

- first trust certificate or pre-deployment certification framework for AI agents
- first cryptographically bound agent capability or identity
- first signed, hashed, tamper-evident, or portable agent trace
- first deterministic privilege-control or policy-enforcement mechanism
- first evidence-aware or provenance-aware agent evaluation
- proof that integrity establishes semantic correctness, safety, trustworthiness, or deployment readiness
- real-world efficacy claims from synthetic fixtures or the two-repeat engineering pilot
- novelty based only on combining known mechanisms

## Strongest collisions

| Work                                                                                 | Collision that constrains P26-002                                                      | Remaining empirical gap used by P26-002                                                             |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [Evidence-Supported Bounds](https://arxiv.org/abs/2605.10448)                        | Locked evidence checklists, Evidence Pass/Fail/Unknown, score-support audit            | Paired evaluator error under injected semantic and integrity faults                                 |
| [Pre-Deployment Assurance and Trust Certification](https://arxiv.org/abs/2606.04037) | Scenario-bound signed certificate, coverage, deployment gate                           | Deterministic checks and comparative false-acceptance study rather than LLM-judge-led certification |
| [Governing Dynamic Capabilities](https://arxiv.org/abs/2603.14332)                   | Capability certificates, Ed25519, SHA-256, hash chains, attack detection, overhead     | Claim-specific evaluator meta-evaluation across a broader semantic-fault taxonomy                   |
| [AgentBound](https://arxiv.org/abs/2606.30970)                                       | Signed receipts, policy provenance, deterministic replay, external verification        | Pre-deployment evaluator error rather than runtime governance receipts                              |
| [AgentRewardBench](https://arxiv.org/abs/2504.08942)                                 | Meta-evaluation of LLM judges against expert labels                                    | Same-artifact comparisons including deterministic contracts and portable integrity verification     |
| [Success Provenance](https://arxiv.org/abs/2607.24054)                               | Matched CLEAN/GOLD/SHAM interventions and paired analysis                              | Fault-specific evidence-contract treatment and false-acceptance localization                        |
| [AgentChaosBench](https://arxiv.org/abs/2608.14680)                                  | Ten runtime faults, aligned controls, 275 sanitized traces, diagnosis and localization | Accept/reject evaluator error under evidence contracts rather than top-k fault-type diagnosis       |

The full 12-work, feature-level audit is in `nearest-work-matrix.json`.

## Main-study gates

The project cannot move from candidate scope to empirical claims until all items pass:

Completed: a zero-cost local Qwen3-4B Q4_K_M judge, prompt, llama.cpp runtime, EBNF output constraint, and strict parser are frozen by model and runtime hash after a held-out calibration gate. Calibration is baseline selection only and is excluded from paper results.

Invalidated candidate: a prospective simulation evaluated 80 nominal fault slots, 80 matched-control slots, and 20 nested executions under an independent-configuration model. Its binding sensitivity estimate was 0.887 with a 95% Monte Carlo interval of 0.876 to 0.898, and no engineering-pilot effect was used. The current variants collapse to eight operational profiles and the source inventory cannot support the assumed repetitions, so this simulation is historical sensitivity evidence only and does not select the main design.

Completed: 80 public source units are locked across AgentChaosBench, AgentDojo, BFCL V4, and tau2-bench, with ten units per fault family. Revisions, licenses, upstream label authority, controls, construct limits, and the no-vendoring release boundary are pinned. Adapters and independent construct review remain pending.

Remaining gates:

1. Obtain independent review of the ten executable operational variant contracts, redesign the unit of analysis, and recompute power against the actual fault and control execution inventory.
2. Implement and verify read-only adapters for all locked source units under the approved redesign.
3. Obtain independent review of construct mappings and assertion authorship without exposing evaluator outcomes.
4. Acquire the approved number of distinct fault and control executions and report uncertainty at the precommitted clustering level.
5. Execute the full ablation and report utility costs, false rejection, untested claims, and Unknown coverage.
6. Reproduce from a clean environment and audit the public allowlist before release.

## Stop or pivot rules

Stop the current paper claim or pivot again if any condition holds:

- a prior work is verified to evaluate the same signed evidence-contract treatment against the same evaluator baselines and fault families;
- the full study shows no practically meaningful false-acceptance reduction after uncertainty and multiplicity correction;
- false rejection or operational overhead erases the practical benefit;
- results depend on fixtures authored to mirror AgentTrial implementation branches;
- the zero-cost replication path cannot reproduce the primary tables;
- independent ground-truth review identifies circular assertions or label leakage.

## Interpretation of the current engineering pilot

The regenerated 960-record pilot and nine-mutation suite validate only that the manifest, evaluator, analysis, and verifier paths execute as designed. Their perfect separation is expected because the fixtures were constructed to exercise known branches. Those values are prohibited from the paper's main results and power assumptions.
