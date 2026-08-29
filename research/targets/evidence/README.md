# P26-002 readiness evidence artifacts

This directory is reserved for sanitized, machine-verifiable readiness evidence. It must not contain raw private sources, credentials, main-study outcomes, or synthetic fixtures presented as study evidence.

Each JSON artifact uses schema `p26-002-readiness-evidence-0.1.0`, status `passed`, the five exact boolean checks required by the gate, and these arrays:

- `faultProjections`: `targetId`, `projectionHash`, canonical `projectionJson`, and a source-execution reference, SHA-256, and canonical JSON payload;
- `controlProjections`: the same fields plus `controlConfigurationId`;
- `controlSources`: `targetId`, `controlConfigurationId`, `reference`, `artifactSha256`, and the canonical control-execution `artifactJson` payload.

The canonical projection manifest is an all-or-nothing completeness gate. A `passed` manifest must contain one fault projection and one matched-control projection for every frozen target, each recomputed by the gate from its pinned source execution. The 60 historical AgentChaosBench and AgentDojo hashes are excluded inventories, so they cannot fill any part of this 80-target requirement.

Projection JSON must use the exact field order and serialization used by `evaluatorProjectionHash`. Source-execution and control-source JSON must use schema `p26-002-candidate-execution-0.2.0`, identify the target, source, condition, derived source reference, and target-specific control configuration when applicable, and contain a nonempty task, final output, and trace. Each candidate contains two exact provenance objects:

- `sourceProvenance`: frozen repository, revision, unit kind, source path or task ID, and ordered Git blob SHA list. The gate derives these values from the pinned target and source-availability records and rejects any difference.
- `executionProvenance`: the runner or reconstruction-method digest recomputed by the gate from the current executable sources and lockfile, plus either the exact identity of a fixed upstream run or a nonempty controlled-run ID and non-negative integer seed. A different but well-formed digest is rejected. Fixed-run identity is derived from the frozen repository, revision, unit ID, and blob list.

`sourceExecutionReference` is not free text. It is `p26-002-execution:` plus the SHA-256 of the canonical source and execution provenance objects. The low-level parser verifies that each projection derives from the embedded claimed execution and uses the source-specific evaluator policy. A benchmark task definition is not itself an execution.

The current parser verifies exact source-lock metadata, embedded hashes, the target-control pair, and canonical manifest matches. It does not yet prove that the embedded task, output, and trace were derived from the pinned upstream blob or produced by the claimed controlled runner. Recomputed self-consistent metadata is therefore insufficient. The main gate rejects every nonempty readiness-evidence set while `SOURCE_EXECUTION_DERIVATION_CAPABILITY.readinessEvidenceAllowed=false`.

Promotion requires a gate-observed derivation path. For fixed upstream runs, the gate must read or fetch exact blob bytes, verify the Git blob SHA, run the deterministic source adapter, and byte-compare the canonical execution and projection. For controlled runs, it must verify the task blob and rerun the exact pinned method with the frozen seed and environment, or verify a precommitted trusted-runner attestation over those inputs and the execution hash. AgentDojo and tau2 controls additionally lack pinned control provenance. A target-specific hash does not turn a reused upstream execution into an independent control.

The envelope also fixes `releaseBoundary.rawSourcePayloadsRetained=false` and `submissionAllowed=false`. Human G2/G3 approvals remain separate and must bind the aggregate main-trial input digest after all evidence is final.
