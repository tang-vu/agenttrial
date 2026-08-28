# P26-002 contribution freeze

Version: 0.1.0

Verified against primary sources on 2026-08-28. Status: **conditional go with a narrowed empirical contribution**.

## Decision

The original broad framing is not defensible as a novelty claim. Prior work already covers signed Trust Certificates, capability-bound certificates, Ed25519 and SHA-256 ledgers, deterministic policy replay, evidence checklists with explicit Unknown outcomes, meta-evaluation of LLM judges, and matched provenance interventions.

P26-002 will therefore study evaluator error. The signed evidence bundle is an experimental treatment and reproducibility mechanism, not a new cryptographic primitive or a proof of semantic correctness.

## Locked paper question

> Do precommitted, claim-specific evidence contracts with deterministic assertions and portable integrity verification reduce false acceptance of unreliable AI-agent runs relative to final-output, trace-presence, and frozen LLM-judge evaluators, without materially increasing false rejection on matched fault-free controls?

## Locked primary contributions

1. A paired benchmark design covering eight fault families, with one matched grounded control for every injected-fault configuration and repeated runs nested within configurations.
2. A meta-evaluation of evaluator false acceptance and false rejection across identical artifacts, with uncertainty, paired tests, hierarchical resampling, and error analysis by fault family.
3. An ablation study separating precommitted plans, deterministic assertions, coverage accounting, hash-chain integrity, evidence-root integrity, signatures, and optional anchoring.
4. A portable, credential-free replication path and explicit release boundaries. This is an engineering and reproducibility contribution, not a claim that the underlying cryptographic components are novel.

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

| Work                                                                                 | Collision that constrains P26-002                                                  | Remaining empirical gap used by P26-002                                                             |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [Evidence-Supported Bounds](https://arxiv.org/abs/2605.10448)                        | Locked evidence checklists, Evidence Pass/Fail/Unknown, score-support audit        | Paired evaluator error under injected semantic and integrity faults                                 |
| [Pre-Deployment Assurance and Trust Certification](https://arxiv.org/abs/2606.04037) | Scenario-bound signed certificate, coverage, deployment gate                       | Deterministic checks and comparative false-acceptance study rather than LLM-judge-led certification |
| [Governing Dynamic Capabilities](https://arxiv.org/abs/2603.14332)                   | Capability certificates, Ed25519, SHA-256, hash chains, attack detection, overhead | Claim-specific evaluator meta-evaluation across a broader semantic-fault taxonomy                   |
| [AgentBound](https://arxiv.org/abs/2606.30970)                                       | Signed receipts, policy provenance, deterministic replay, external verification    | Pre-deployment evaluator error rather than runtime governance receipts                              |
| [AgentRewardBench](https://arxiv.org/abs/2504.08942)                                 | Meta-evaluation of LLM judges against expert labels                                | Same-artifact comparisons including deterministic contracts and portable integrity verification     |
| [Success Provenance](https://arxiv.org/abs/2607.24054)                               | Matched CLEAN/GOLD/SHAM interventions and paired analysis                          | Fault-specific evidence-contract treatment and false-acceptance localization                        |

The full 12-work, feature-level audit is in `nearest-work-matrix.json`.

## Main-study gates

The paper cannot move from conditional go to empirical claims until all items pass:

1. Freeze a zero-cost local open-weight LLM judge, prompt, runtime, and structured output parser.
2. Complete a simulation-based power analysis using plausible paired-disagreement ranges, not pilot effects.
3. Select independent, authorized targets that were not built to satisfy AgentTrial's assertions.
4. Freeze assertion authorship and ground truth independently of the evaluated system.
5. Run at least 20 repetitions per stochastic configuration and report configuration-clustered uncertainty.
6. Execute the full ablation and report utility costs, false rejection, untested claims, and Unknown coverage.
7. Reproduce from a clean environment and audit the public allowlist before release.

## Stop or pivot rules

Stop the current paper claim or pivot again if any condition holds:

- a prior work is verified to evaluate the same signed evidence-contract treatment against the same evaluator baselines and fault families;
- the full study shows no practically meaningful false-acceptance reduction after uncertainty and multiplicity correction;
- false rejection or operational overhead erases the practical benefit;
- results depend on fixtures authored to mirror AgentTrial implementation branches;
- the zero-cost replication path cannot reproduce the primary tables;
- independent ground-truth review identifies circular assertions or label leakage.

## Interpretation of the current engineering pilot

The 768-record pilot and nine-mutation suite validate only that the manifest, evaluator, analysis, and verifier paths execute as designed. Their perfect separation is expected because the fixtures were constructed to exercise known branches. Those values are prohibited from the paper's main results and power assumptions.
