import { Contract, Interface, Wallet, JsonRpcProvider, ZeroAddress } from "ethers";
import { readFileSync } from "node:fs";
import { attestationBindingHash, verifyBundle } from "../packages/evidence/src/index.ts";
import {
  BASE_SEPOLIA,
  encodeAttestation,
  verifyAttestationPayload,
  verifyAttestationRecord,
} from "../packages/eas/src/index.ts";
import {
  beginAttestation,
  closePersistence,
  confirmAttestation,
  failAttestation,
  loadRun,
  recordAttestationSubmitted,
} from "../packages/runtime/src/persistence.ts";

const input = process.argv[2];
if (!input) throw new Error("Usage: pnpm eas:attest <run-id|bundle.json> --confirm-base-sepolia");
if (!process.argv.includes("--confirm-base-sepolia"))
  throw new Error("Refusing to broadcast without --confirm-base-sepolia.");
if (!process.env.EAS_PRIVATE_KEY || !process.env.EAS_RPC_URL || !process.env.EAS_SCHEMA_UID)
  throw new Error("EAS_PRIVATE_KEY, EAS_RPC_URL, and EAS_SCHEMA_UID are required.");
if (!process.env.AGENTTRIAL_TRUSTED_PUBLIC_KEY)
  throw new Error("AGENTTRIAL_TRUSTED_PUBLIC_KEY is required to reject forged bundles.");

const runId = /^[0-9a-f-]{36}$/i.test(input) ? input : undefined;
const run = runId ? await loadRun(runId) : undefined;
const bundle = runId ? run?.bundle : JSON.parse(readFileSync(input, "utf8"));
if (!bundle) throw new Error("A completed evidence bundle is required.");
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
const reportURI = process.env.REPORT_URI ?? "";
const attachmentDescriptor = {
  chainId: BASE_SEPOLIA.chainId,
  easContract: BASE_SEPOLIA.easContract,
  schemaUid: process.env.EAS_SCHEMA_UID,
  reportURI,
};
const payloadHash = attestationBindingHash(bundle.receipt.payload, attachmentDescriptor);
const fields = {
  targetIdentifier: bundle.receipt.payload.targetId,
  trialRoot: `0x${bundle.receipt.payload.planHash}`,
  methodologyVersion: bundle.receipt.payload.methodologyVersion,
  scoreBasisPoints: bundle.receipt.payload.scoreBasisPoints,
  coverageBasisPoints: bundle.receipt.payload.coverageBasisPoints,
  evidenceRoot: `0x${bundle.receipt.payload.evidenceRoot}`,
  reportURI,
  evaluatedAt: BigInt(Math.floor(Date.parse(bundle.receipt.payload.issuedAt) / 1000)),
};
const data = encodeAttestation(fields);
const abi = [
  "function attest((bytes32 schema,(address recipient,uint64 expirationTime,bool revocable,bytes32 refUID,bytes data,uint256 value) data) request) payable returns (bytes32)",
  "function getAttestation(bytes32 uid) view returns ((bytes32 uid,bytes32 schema,uint64 time,uint64 expirationTime,uint64 revocationTime,bytes32 refUID,address recipient,address attester,bool revocable,bytes data))",
  "event Attested(address indexed recipient,address indexed attester,bytes32 uid,bytes32 indexed schemaUID)",
];
const signer = new Wallet(process.env.EAS_PRIVATE_KEY, provider);
const eas = new Contract(BASE_SEPOLIA.easContract, abi, signer);

try {
  let persisted = runId
    ? await beginAttestation({ runId, ...attachmentDescriptor, payloadHash })
    : undefined;
  if (persisted?.status === "anchored") {
    console.log(JSON.stringify(persisted, null, 2));
    process.exitCode = 0;
  } else {
    let transaction;
    let receipt;
    if (persisted?.status === "submitted" && persisted.transactionHash) {
      transaction = await provider.getTransaction(persisted.transactionHash);
      if (!transaction)
        throw new Error("Previously submitted attestation transaction was not found.");
      receipt = await transaction.wait();
    } else {
      transaction = await eas.attest({
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
      if (runId) persisted = await recordAttestationSubmitted(runId, transaction.hash);
      receipt = await transaction.wait();
    }
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
    const uid = parsed.args.uid;
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
    const metadataCheck = verifyAttestationRecord(record, {
      uid,
      schemaUid: process.env.EAS_SCHEMA_UID,
      attestor: await signer.getAddress(),
    });
    const payloadCheck = verifyAttestationPayload(record, fields);
    if (!metadataCheck.valid || !payloadCheck.valid)
      throw new Error("Mined EAS record did not match the trusted signed receipt.");
    const result = runId
      ? await confirmAttestation({
          runId,
          uid,
          transactionHash: transaction.hash,
          attestor: await signer.getAddress(),
          blockNumber: BigInt(receipt.blockNumber),
        })
      : {
          uid,
          transactionHash: transaction.hash,
          explorerUrl: `${BASE_SEPOLIA.attestationExplorer}/${uid}`,
        };
    console.log(JSON.stringify(result, null, 2));
  }
} catch (error) {
  if (runId)
    await failAttestation(runId, error instanceof Error ? error.message : "Attestation failed");
  throw error;
} finally {
  await closePersistence();
}
