import { Contract, Wallet, JsonRpcProvider, ZeroAddress, solidityPackedKeccak256 } from "ethers";
import { BASE_SEPOLIA, EAS_SCHEMA as schema } from "../packages/eas/src/index.ts";
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
const abi = [
  "function register(string schema,address resolver,bool revocable) returns (bytes32)",
  "function getSchema(bytes32 uid) view returns ((bytes32 uid,address resolver,bool revocable,string schema))",
];
const registry = new Contract(
  BASE_SEPOLIA.schemaRegistry,
  abi,
  new Wallet(process.env.EAS_PRIVATE_KEY, provider),
);
// EAS defines the UID as the packed hash of the immutable schema fields. Resolve
// it before broadcasting and make re-running this operator command idempotent.
const schemaUID = solidityPackedKeccak256(
  ["string", "address", "bool"],
  [schema, ZeroAddress, false],
);
const existing = await registry.getSchema(schemaUID);
if (existing.uid === schemaUID) {
  console.log(JSON.stringify({ schemaUID, schema, alreadyRegistered: true }, null, 2));
  process.exit(0);
}
const transaction = await registry.register(schema, ZeroAddress, false);
const receipt = await transaction.wait();
if (receipt.status !== 1) throw new Error("Schema registration transaction reverted.");
console.log(JSON.stringify({ transactionHash: transaction.hash, schemaUID, schema }, null, 2));
