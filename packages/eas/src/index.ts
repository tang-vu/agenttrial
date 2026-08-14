import { SchemaEncoder } from "@ethereum-attestation-service/eas-sdk";

export const EAS_SCHEMA_VERSION = "1";
export const EAS_SCHEMA =
  "string targetIdentifier,bytes32 trialRoot,string methodologyVersion,uint32 scoreBasisPoints,uint32 coverageBasisPoints,bytes32 evidenceRoot,string reportURI,uint64 evaluatedAt";
export const BASE_SEPOLIA = {
  chainId: 84532,
  easContract: "0x4200000000000000000000000000000000000021",
  schemaRegistry: "0x4200000000000000000000000000000000000020",
  explorer: "https://sepolia.basescan.org",
} as const;

export interface AttestationFields {
  targetIdentifier: string;
  trialRoot: `0x${string}`;
  methodologyVersion: string;
  scoreBasisPoints: number;
  coverageBasisPoints: number;
  evidenceRoot: `0x${string}`;
  reportURI: string;
  evaluatedAt: bigint;
}
export function encodeAttestation(fields: AttestationFields): string {
  const encoder = new SchemaEncoder(EAS_SCHEMA);
  return encoder.encodeData([
    { name: "targetIdentifier", value: fields.targetIdentifier, type: "string" },
    { name: "trialRoot", value: fields.trialRoot, type: "bytes32" },
    { name: "methodologyVersion", value: fields.methodologyVersion, type: "string" },
    { name: "scoreBasisPoints", value: fields.scoreBasisPoints, type: "uint32" },
    { name: "coverageBasisPoints", value: fields.coverageBasisPoints, type: "uint32" },
    { name: "evidenceRoot", value: fields.evidenceRoot, type: "bytes32" },
    { name: "reportURI", value: fields.reportURI, type: "string" },
    { name: "evaluatedAt", value: fields.evaluatedAt, type: "uint64" },
  ]);
}

export function attestationStatus() {
  if (!process.env.EAS_SCHEMA_UID || !process.env.EAS_PRIVATE_KEY)
    return {
      status: "not_configured" as const,
      message: "Base Sepolia anchoring is optional; the signed local receipt is complete.",
    };
  return {
    status: "failed" as const,
    message:
      "Credentials are configured, but live broadcast requires the explicit attestation script.",
  };
}
