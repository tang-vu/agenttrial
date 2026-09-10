# Trusted-runner evidence boundary

Controlled BFCL, AgentDojo-control, and tau2 executions may enter a readiness artifact only after the gate verifies an Ed25519 attestation over the exact source lock, runner-method digest, run identity, seed, task, final output, and raw trace.

`../trusted-runner-policy.json` is deliberately pending and contains no key. Registering a key and activating the policy is an attributable pre-run human action. Automated agents must not invent a runner identity, activate the policy, or create an attestation. An active policy remains unable to authorize the main trial, release, or submission.

Fixed upstream artifacts do not use this trust path. Their bytes remain subject to immutable-revision fetch, Git-blob verification, and deterministic adapter reconstruction.
