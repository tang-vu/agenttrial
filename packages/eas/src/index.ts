import { AbiCoder } from "ethers";

export const EAS_SCHEMA_VERSION = "1";
export const EAS_SCHEMA =
  "string targetIdentifier,bytes32 trialRoot,string methodologyVersion,uint32 scoreBasisPoints,uint32 coverageBasisPoints,bytes32 evidenceRoot,string reportURI,uint64 evaluatedAt";
export const BASE_SEPOLIA = {
  chainId: 84532,
  easContract: "0x4200000000000000000000000000000000000021",
  schemaRegistry: "0x4200000000000000000000000000000000000020",
  explorer: "https://sepolia.basescan.org",
  attestationExplorer: "https://base-sepolia.easscan.org/attestation/view",
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
  return AbiCoder.defaultAbiCoder().encode(
    ["string", "bytes32", "string", "uint32", "uint32", "bytes32", "string", "uint64"],
    [
      fields.targetIdentifier,
      fields.trialRoot,
      fields.methodologyVersion,
      fields.scoreBasisPoints,
      fields.coverageBasisPoints,
      fields.evidenceRoot,
      fields.reportURI,
      fields.evaluatedAt,
    ],
  );
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

export interface AttestationTransport {
  attest(encodedData: string): Promise<{ uid: string; transactionHash: string }>;
}
export async function submitAttestation(
  transport: AttestationTransport,
  fields: AttestationFields,
) {
  const result = await transport.attest(encodeAttestation(fields));
  if (
    !/^0x[0-9a-fA-F]{64}$/.test(result.uid) ||
    !/^0x[0-9a-fA-F]{64}$/.test(result.transactionHash)
  )
    throw new Error("Attestation transport returned an invalid UID or transaction hash");
  return { ...result, explorerUrl: `${BASE_SEPOLIA.attestationExplorer}/${result.uid}` };
}

export interface EasRecord {
  id: string;
  schemaId: string;
  attester: string;
  time: number;
  expirationTime: number;
  revocationTime: number;
  data: string;
}
export function verifyAttestationRecord(
  record: EasRecord,
  expected: { uid: string; schemaUid: string; attestor?: string },
) {
  const checks = {
    uid: record.id.toLowerCase() === expected.uid.toLowerCase(),
    schema: record.schemaId.toLowerCase() === expected.schemaUid.toLowerCase(),
    attestor:
      !expected.attestor || record.attester.toLowerCase() === expected.attestor.toLowerCase(),
    unrevoked: record.revocationTime === 0,
    unexpired: record.expirationTime === 0 || record.expirationTime > Math.floor(Date.now() / 1000),
    hasData: /^0x[0-9a-f]*$/i.test(record.data) && record.data.length > 2,
  };
  return { valid: Object.values(checks).every(Boolean), checks };
}
