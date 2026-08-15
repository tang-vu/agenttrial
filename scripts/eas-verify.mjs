import { Contract, JsonRpcProvider } from "ethers";
import { readFileSync } from "node:fs";
import { verifyBundle } from "../packages/evidence/src/index.ts";
import {
  BASE_SEPOLIA,
  verifyAttestationPayload,
  verifyAttestationRecord,
} from "../packages/eas/src/index.ts";

const file = process.argv.find((value) => value.endsWith(".json"));
const uid = process.argv.find((value) => /^0x[0-9a-fA-F]{64}$/.test(value));
if (!file || !uid) throw new Error("Usage: pnpm eas:verify bundle.json 0x<attestation-uid>");
if (!process.env.EAS_RPC_URL || !process.env.EAS_SCHEMA_UID)
  throw new Error("EAS_RPC_URL and EAS_SCHEMA_UID are required.");
if (!process.env.AGENTTRIAL_TRUSTED_PUBLIC_KEY)
  throw new Error("AGENTTRIAL_TRUSTED_PUBLIC_KEY is required to reject forged bundles.");

const bundle = JSON.parse(readFileSync(file, "utf8"));
const verification = verifyBundle(bundle, {
  trustedPublicKeys: [process.env.AGENTTRIAL_TRUSTED_PUBLIC_KEY],
});
if (!verification.valid)
  throw new Error(`Bundle verification failed at ${verification.firstMismatch}.`);

const provider = new JsonRpcProvider(process.env.EAS_RPC_URL);
const network = await provider.getNetwork();
if (network.chainId !== BigInt(BASE_SEPOLIA.chainId))
  throw new Error(`Expected Base Sepolia (${BASE_SEPOLIA.chainId}), received ${network.chainId}.`);
const eas = new Contract(
  BASE_SEPOLIA.easContract,
  [
    "function getAttestation(bytes32 uid) view returns ((bytes32 uid,bytes32 schema,uint64 time,uint64 expirationTime,uint64 revocationTime,bytes32 refUID,address recipient,address attester,bool revocable,bytes data))",
  ],
  provider,
);
const onchain = await eas.getAttestation(uid);
const record = {
  id: onchain.uid,
  schemaId: onchain.schema,
  attester: onchain.attester,
  time: Number(onchain.time),
  expirationTime: Number(onchain.expirationTime),
  revocationTime: Number(onchain.revocationTime),
  data: onchain.data,
};
const identity = verifyAttestationRecord(record, {
  uid,
  schemaUid: process.env.EAS_SCHEMA_UID,
  ...(process.env.EAS_EXPECTED_ATTESTOR ? { attestor: process.env.EAS_EXPECTED_ATTESTOR } : {}),
});
const payload = verifyAttestationPayload(record, {
  targetIdentifier: bundle.receipt.payload.targetId,
  trialRoot: `0x${bundle.receipt.payload.planHash}`,
  methodologyVersion: bundle.receipt.payload.methodologyVersion,
  scoreBasisPoints: bundle.receipt.payload.scoreBasisPoints,
  coverageBasisPoints: bundle.receipt.payload.coverageBasisPoints,
  evidenceRoot: `0x${bundle.receipt.payload.evidenceRoot}`,
  reportURI: process.env.REPORT_URI ?? "",
  evaluatedAt: BigInt(Math.floor(Date.parse(bundle.receipt.payload.issuedAt) / 1000)),
});
if (!identity.valid || !payload.valid)
  throw new Error("Onchain attestation does not match the trusted receipt or is inactive.");

console.log(
  JSON.stringify(
    {
      valid: true,
      uid,
      attester: record.attester,
      explorer: `${BASE_SEPOLIA.attestationExplorer}/${uid}`,
      checks: { identity: identity.checks, payload: payload.checks },
    },
    null,
    2,
  ),
);
