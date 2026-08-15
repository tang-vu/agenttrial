import { Contract, Interface, Wallet, JsonRpcProvider, ZeroAddress } from "ethers";
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
  "event Registered(bytes32 indexed uid,address indexed registerer)",
];
const registry = new Contract(
  BASE_SEPOLIA.schemaRegistry,
  abi,
  new Wallet(process.env.EAS_PRIVATE_KEY, provider),
);
const transaction = await registry.register(schema, ZeroAddress, false);
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
  .find((log) => log?.name === "Registered");
if (!parsed) throw new Error("Schema transaction mined without a Registered event.");
console.log(
  JSON.stringify(
    { transactionHash: transaction.hash, schemaUID: parsed.args.uid, schema },
    null,
    2,
  ),
);
