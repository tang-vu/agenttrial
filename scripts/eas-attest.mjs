import { EAS, SchemaEncoder } from "@ethereum-attestation-service/eas-sdk";
import { Wallet, JsonRpcProvider, ZeroAddress } from "ethers";
import { readFileSync } from "node:fs";
const file = process.argv.find((x) => x.endsWith(".json"));
if (!file) throw new Error("Usage: node scripts/eas-attest.mjs bundle.json --confirm-base-sepolia");
if (!process.argv.includes("--confirm-base-sepolia"))
  throw new Error("Refusing to broadcast without --confirm-base-sepolia.");
if (!process.env.EAS_PRIVATE_KEY || !process.env.EAS_RPC_URL || !process.env.EAS_SCHEMA_UID)
  throw new Error("EAS_PRIVATE_KEY, EAS_RPC_URL, and EAS_SCHEMA_UID are required.");
const bundle = JSON.parse(readFileSync(file, "utf8"));
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
  { name: "evidenceRoot", value: `0x${bundle.evidenceRoot}`, type: "bytes32" },
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
