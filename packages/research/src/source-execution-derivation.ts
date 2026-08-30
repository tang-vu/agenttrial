export const SOURCE_EXECUTION_DERIVATION_CAPABILITY = {
  schemaVersion: "p26-002-source-execution-derivation-capability-0.1.0",
  status: "not-implemented",
  fixedUpstreamVerification: "metadata-only-source-bytes-not-read-by-gate",
  controlledRunVerification: "contract-and-metadata-only-runner-not-reexecuted-or-attested",
  readinessEvidenceAllowed: false,
} as const;

export function requireGateObservedSourceExecutionDerivation(evidenceArtifactCount: number) {
  if (!Number.isSafeInteger(evidenceArtifactCount) || evidenceArtifactCount < 0)
    throw new Error("Readiness evidence artifact count must be a non-negative integer");
  if (evidenceArtifactCount > 0 && !SOURCE_EXECUTION_DERIVATION_CAPABILITY.readinessEvidenceAllowed)
    throw new Error(
      "Readiness evidence cannot be promoted: the gate does not yet derive fixed executions from pinned source bytes or reexecute/attest controlled runs",
    );
}
