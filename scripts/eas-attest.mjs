import { EAS, SchemaEncoder } from "@ethereum-attestation-service/eas-sdk";
import { Wallet, JsonRpcProvider, ZeroAddress } from "ethers";
import { readFileSync } from "node:fs";
import { verifyBundle } from "../packages/evidence/src/index.ts";
const file = process.argv.find((x) => x.endsWith(".json"));
if (!file) throw new Error("Usage: pnpm eas:attest bundle.json --confirm-base-sepolia");
if (!process.argv.includes("--confirm-base-sepolia"))
  throw new Error("Refusing to broadcast without --confirm-base-sepolia.");
if (!process.env.EAS_PRIVATE_KEY || !process.env.EAS_RPC_URL || !process.env.EAS_SCHEMA_UID)
  throw new Error("EAS_PRIVATE_KEY, EAS_RPC_URL, and EAS_SCHEMA_UID are required.");
if (!process.env.AGENTTRIAL_TRUSTED_PUBLIC_KEY)
  throw new Error("AGENTTRIAL_TRUSTED_PUBLIC_KEY is required to reject forged bundles.");
const bundle = JSON.parse(readFileSync(file, "utf8"));
const verification = verifyBundle(bundle, {
  trustedPublicKeys: [process.env.AGENTTRIAL_TRUSTED_PUBLIC_KEY],
});
if (!verification.valid)
  throw new Error(
    `Bundle verification failed at ${verification.firstMismatch}. Refusing to attest.`,
  );
const provider = new JsonRpcProvider(process.env.EAS_RPC_URL);
const network = await provider.getNetwork();
if (network.chainId !== 84532n)
  throw new Error(`Expected Base Sepolia (84532), received ${network.chainId}.`);
const schema =
  "string targetIdentifier,bytes32 trialRoot,string methodologyVersion,uint32 scoreBasisPoints,uint32 coverageBasisPoints,bytes32 evidenceRoot,string reportURI,uint64 evaluatedAt";
const encoder = new SchemaEncoder(schema);
const data = encoder.encodeData([
  { name: "targetIdentifier", value: bundle.receipt.payload.targetId, type: "string" },
  { name: "trialRoot", value: `0x${bundle.receipt.payload.planHash}`, type: "bytes32" },
  { name: "methodologyVersion", value: bundle.receipt.payload.methodologyVersion, type: "string" },
  { name: "scoreBasisPoints", value: bundle.receipt.payload.scoreBasisPoints, type: "uint32" },
  {
    name: "coverageBasisPoints",
    value: bundle.receipt.payload.coverageBasisPoints,
    type: "uint32",
  },
  { name: "evidenceRoot", value: `0x${bundle.receipt.payload.evidenceRoot}`, type: "bytes32" },
  { name: "reportURI", value: process.env.REPORT_URI ?? "", type: "string" },
  {
    name: "evaluatedAt",
    value: BigInt(Math.floor(Date.parse(bundle.receipt.payload.issuedAt) / 1000)),
    type: "uint64",
  },
]);
const eas = new EAS("0x4200000000000000000000000000000000000021");
eas.connect(new Wallet(process.env.EAS_PRIVATE_KEY, provider));
const transaction = await eas.attest({
  schema: process.env.EAS_SCHEMA_UID,
  data: { recipient: ZeroAddress, expirationTime: 0n, revocable: false, data },
});
console.log(
  JSON.stringify(
    {
      transactionHash: transaction.data.hash,
      attestationUID: await transaction.wait(),
      explorer: "https://base-sepolia.easscan.org",
    },
    null,
    2,
  ),
);
