# P26-002 flagship research protocol

Protocol version: 0.2
Created: 2026-08-27  
Updated: 2026-08-29
Study ID: P26-002  
Status: G2 executable design prepared; independent method-freeze sign-off and G3 governance pending
Primary repository: tang-vu/agenttrial

## Objective

Evaluate whether claim-specific sealed adversarial trials with deterministic assertions and portable signed evidence reduce false acceptance of unreliable AI agents compared with common evaluation baselines.

Cryptographic mechanisms are evaluated as integrity and provenance controls. They are not treated as proof that an agent is semantically correct.

## Primary hypotheses

- H1: AgentTrial has a lower false-acceptance rate than final-output-only evaluation on controlled fault injections.
- H2: AgentTrial has a lower false-acceptance rate than a documented LLM-judge baseline.
- H3: Independent verification detects every covered single-artifact tampering operation and localizes the first mismatch.
- H4: Evidence capture and verification overhead remain bounded and are reported with uncertainty, without claiming a universal production threshold.

## Unit of analysis

The primary unit is a unique capability-claim, scenario, and injected-fault configuration. Repeated executions measure stochastic reliability and are not counted as independent scenarios.

## Locked failure families

1. Unsupported evidence and fabricated provenance
2. Prompt-injection compliance
3. Permission or scope violation
4. Tool-selection or parameter error
5. Timeout, malformed response, and failed recovery
6. Non-repeatable or state-dependent behavior
7. Evidence omission or selective logging
8. Score or report tampering after execution

A versioned taxonomy file must define each fault, ground-truth label, expected observation, and assertion before the main run.

## Controlled agents

The credential-free benchmark must include at least:

- grounded reference agent
- gullible agent
- over-privileged agent
- evidence-omitting agent
- timeout-prone agent
- non-repeatable agent

Each agent must expose the same claim interface where technically possible. Differences in supported capabilities and missing coverage must remain explicit.

## Evaluation modes

Evaluate the same run artifacts with:

1. Final-output-only baseline
2. Trace-presence and schema-validity baseline
3. LLM-as-judge baseline with frozen model identifier, prompt, temperature, and output schema
4. AgentTrial sealed-plan, deterministic-assertion, signed-evidence evaluation

Prefer a locally runnable open-weight judge for the zero-cost replication path. Any paid model run requires explicit cost approval and a separate cost ledger.

## Sample and repetitions

- Minimum 60 unique scenario-fault configurations across the locked failure families.
- One matched, fault-free grounded control for every scenario-fault configuration, preserving family, claim type, and variant.
- Minimum 20 repeated executions per stochastic configuration.
- Deterministic configurations may use fewer repetitions only with a documented invariance check.
- Seeds, environment, agent build, evaluator build, assertion registry, and planner configuration are locked before execution.

The final sample-size rationale must use expected paired disagreement rates or a simulation-based power analysis. The minimum counts above are floors, not a substitute for that rationale.

The frozen prospective power analysis expands the design to 80 unique fault configurations and 80 matched controls, with 20 nested repetitions per configuration. This yields 3,200 run artifacts. Selection uses conservative multiplicity planning, configuration-level clustering, plausible paired-disagreement sensitivity ranges, and a false-rejection noninferiority margin. The synthetic pilot contributes no effect estimate to this calculation.

The independent source lock uses 50 AgentChaosBench traces, ten AgentDojo prompt-injection tasks, ten BFCL V4 missing-parameter tasks with matched base entries, and ten tau2-bench scoring-contract omission stress cases. All sources are pinned, public, and MIT or Apache-2.0. Source labels and task criteria remain blinded from evaluator inputs; adapters cannot alter them after results are observed.

Source-family membership does not by itself justify a source-unit-to-scenario mapping. `research/targets/target-binding-audit.json` binds each source unit to a draft-frozen fault and control slot provisionally by family order only to prepare a reviewable crosswalk. Two independent human reviewers must assess every row, record a rationale, and use a third independent adjudicator only for disagreements. The packet binds the full target, fault, and control semantics rather than projection-readiness state. No provisional binding may enter the main trial or be described as validated evidence.

Before a main run, all 80 fault source units and 80 target-specific matched-control source or execution units must be pinned, all 160 projections must pass source-bound label-blind audits, the construct review packet must be complete, the design artifact must have independent method-freeze sign-off, and every G3 gate in `research/governance/g3-approval.json` must have documented human approval. The gate verifies named decision metadata, current-input digests, and the bytes of each evidence artifact; human identity remains a governance-process responsibility. Audit regeneration never overwrites any human record. `pnpm research:gate-main-trial` fails closed while any condition is unmet.

The two-repeat credential-free engineering pilot is excluded from hypothesis testing. Its synthetic fixtures validate only manifest generation, evaluator wiring, analysis functions, and tamper localization. Main-study claims require the locked 20-repeat design on independent authorized targets.

## Outcomes

### Primary

- false-acceptance rate
- false-rejection rate
- fault-detection precision and recall
- paired difference in false-acceptance rate between AgentTrial and each baseline

### Secondary

- claim coverage and explicitly untested claims
- verdict repeatability
- first-mismatch localization accuracy
- verification time
- evidence-bundle size
- execution latency and resource overhead
- planner cost and token use, when an LLM planner is enabled

## Tamper study

Apply versioned mutations to a valid evidence bundle:

- modify one observation byte
- delete an event
- reorder events
- replace an assertion result
- change the plan after sealing
- change the evaluator build identifier
- alter the evidence root
- replace the signer public key
- alter optional anchor metadata

Record detection, localization, verification time, and false alarms. Do not infer resistance to attacks that are outside the implemented threat model.

## Ablations

Run paired ablations for:

- plan commitment
- event hash chain
- evidence Merkle root
- deterministic assertions
- coverage accounting
- Ed25519 signature
- optional external attestation

The optional blockchain anchor is not part of the primary scientific claim and must never be required for the credential-free replication path.

## Analysis

- Report Wilson or exact binomial intervals for proportions.
- Use paired tests for evaluator comparisons on the same configurations.
- Use a hierarchical bootstrap over scenario-fault configurations, with repeats nested inside configurations.
- Correct for multiple primary baseline comparisons.
- Report absolute effects and uncertainty, not only p-values.
- Perform error analysis by failure family and claim type.
- Report source-stratified sensitivity analyses because benchmark source and fault family are partly confounded.
- Do not interpret a family effect beyond the benchmark systems that instantiate it.
- Keep exploratory analyses clearly separated from locked primary analyses.

## Reproducibility

- Local-first execution; GitHub Actions is manual only.
- No paid compute or model use without approval.
- Generate results, tables, and figures from machine-readable run manifests.
- Preserve configuration, seeds, hashes, versions, and environment metadata.
- Provide a credential-free benchmark and browser or CLI verification path.
- Export the public artifact through a clean allowlist after license, privacy, venue, and human approval.

## Safety and authorization

All active testing is limited to controlled fixtures or targets with explicit authorization. Passive discovery of public metadata does not authorize active trials. Credentials, private reports, signing seeds, and service internals remain excluded from public artifacts.

## Nearest-work boundary

The novelty matrix must cover auditable agent systems, AgentReputation, pre-deployment assurance and trust certification, dynamic capability binding, behavioral integrity verification, and agent benchmark frameworks.

AgentChaosBench is a direct collision on runtime-fault telemetry, aligned controls, detection, and localization. P26-002 does not claim fault-benchmark or diagnosis novelty; it studies accept/reject evaluator error under evidence-contract treatments.

A defensible contribution requires comparative evidence for the complete combination of precommitted claim-specific trials, deterministic score authority, explicit missing coverage, portable evidence, and tamper localization. Product polish, signatures, Merkle trees, and on-chain anchoring alone are not novel.

The verified nearest-work audit is maintained in `research/nearest-work-matrix.json`; the narrowed empirical claim, prohibited claims, and stop rules are frozen in `research/contribution-freeze.md`. The cryptographic layer is an experimental treatment and reproducibility mechanism, not the paper's primitive novelty claim.

## Gate exit criteria

G1 passes only when the nearest-work matrix supports a distinct claim. G2 passes only when the fault taxonomy, scenario set, baselines, outcomes, sample-size rationale, and analysis script interface are frozen. G3 passes only after authorization, data provenance, retention, privacy, and release boundaries are approved. G4 passes only after the preregistered runs, ablations, and error analysis reproduce from a clean environment.
