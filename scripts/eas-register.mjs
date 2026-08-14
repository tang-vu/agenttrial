import { SchemaRegistry } from "@ethereum-attestation-service/eas-sdk";
import { Wallet, JsonRpcProvider, ZeroAddress } from "ethers";
const schema =
  "string targetIdentifier,bytes32 trialRoot,string methodologyVersion,uint32 scoreBasisPoints,uint32 coverageBasisPoints,bytes32 evidenceRoot,string reportURI,uint64 evaluatedAt";
if (!process.argv.includes("--confirm-base-sepolia"))
  throw new Error(
    "Refusing to broadcast. Re-run with --confirm-base-sepolia after reviewing network and cost.",
  );
if (!process.env.EAS_PRIVATE_KEY || !process.env.EAS_RPC_URL)
  throw new Error("EAS_PRIVATE_KEY and EAS_RPC_URL are required.");
const provider = new JsonRpcProvider(process.env.EAS_RPC_URL);
const network = await provider.getNetwork();
if (network.chainId !== 84532n)
  throw new Error(`Expected Base Sepolia (84532), received ${network.chainId}.`);
const registry = new SchemaRegistry("0x4200000000000000000000000000000000000020");
registry.connect(new Wallet(process.env.EAS_PRIVATE_KEY, provider));
const transaction = await registry.register({
  schema,
  resolverAddress: ZeroAddress,
  revocable: false,
});
console.log(
  JSON.stringify(
    { transactionHash: transaction.data.hash, schemaUID: await transaction.wait(), schema },
    null,
    2,
  ),
);
