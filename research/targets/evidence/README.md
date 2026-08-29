# P26-002 readiness evidence artifacts

This directory is reserved for sanitized, machine-verifiable readiness evidence. It must not contain raw private sources, credentials, main-study outcomes, or synthetic fixtures presented as study evidence.

Each JSON artifact uses schema `p26-002-readiness-evidence-0.1.0`, status `passed`, the five exact boolean checks required by the gate, and these arrays:

- `faultProjections`: `targetId`, `projectionHash`, canonical `projectionJson`, and a source-execution reference, SHA-256, and canonical JSON payload;
- `controlProjections`: the same fields plus `controlConfigurationId`;
- `controlSources`: `targetId`, `controlConfigurationId`, `reference`, `artifactSha256`, and the canonical control-execution `artifactJson` payload.

Projection JSON must use the exact field order and serialization used by `evaluatorProjectionHash`. Source-execution and control-source JSON must use schema `p26-002-candidate-execution-0.1.0`, identify the target, source, condition, source reference, and target-specific control configuration when applicable, and contain a nonempty task, final output, and trace. Each projection must use the source-specific frozen evaluator policy and must exactly derive its task, final output, and redacted trace from the bound source execution.

The gate parses every embedded JSON payload, recomputes its digest with the shared adapter algorithm, checks forbidden label keys and locked identifiers, verifies the target source and target-control pair, and requires an exact record match with the canonical manifests. A manifest cannot become evidence merely by naming an arbitrary file hash.

The envelope also fixes `releaseBoundary.rawSourcePayloadsRetained=false` and `submissionAllowed=false`. Human G2/G3 approvals remain separate and must bind the aggregate main-trial input digest after all evidence is final.
