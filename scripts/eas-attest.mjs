import { Contract, Interface, Wallet, JsonRpcProvider, ZeroAddress } from "ethers";
import { readFileSync } from "node:fs";
import { verifyBundle } from "../packages/evidence/src/index.ts";
import { BASE_SEPOLIA, encodeAttestation } from "../packages/eas/src/index.ts";
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
const data = encodeAttestation({
  targetIdentifier: bundle.receipt.payload.targetId,
  trialRoot: `0x${bundle.receipt.payload.planHash}`,
  methodologyVersion: bundle.receipt.payload.methodologyVersion,
  scoreBasisPoints: bundle.receipt.payload.scoreBasisPoints,
  coverageBasisPoints: bundle.receipt.payload.coverageBasisPoints,
  evidenceRoot: `0x${bundle.receipt.payload.evidenceRoot}`,
  reportURI: process.env.REPORT_URI ?? "",
  evaluatedAt: BigInt(Math.floor(Date.parse(bundle.receipt.payload.issuedAt) / 1000)),
});
const abi = [
  "function attest((bytes32 schema,(address recipient,uint64 expirationTime,bool revocable,bytes32 refUID,bytes data,uint256 value) data) request) payable returns (bytes32)",
  "event Attested(address indexed recipient,address indexed attester,bytes32 uid,bytes32 indexed schemaUID)",
];
const signer = new Wallet(process.env.EAS_PRIVATE_KEY, provider);
const eas = new Contract(BASE_SEPOLIA.easContract, abi, signer);
const transaction = await eas.attest({
  schema: process.env.EAS_SCHEMA_UID,
  data: {
    recipient: ZeroAddress,
    expirationTime: 0n,
    revocable: false,
    refUID: `0x${"0".repeat(64)}`,
    data,
    value: 0n,
  },
});
const receipt = await transaction.wait();
const iface = new Interface(abi);
const parsed = receipt.logs
  .map((log) => {
    try {
      return iface.parseLog(log);
    } catch {
      return null;
    }
  })
  .find((log) => log?.name === "Attested");
if (!parsed) throw new Error("EAS transaction mined without an Attested event.");
const attestationUID = parsed.args.uid;
console.log(
  JSON.stringify(
    {
      transactionHash: transaction.hash,
      attestationUID,
      explorer: `${BASE_SEPOLIA.attestationExplorer}/${attestationUID}`,
    },
    null,
    2,
  ),
);
