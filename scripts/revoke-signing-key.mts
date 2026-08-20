import { closePersistence, revokeSigningPublicKey } from "@agenttrial/runtime";

const keyId = process.argv[2]?.toLowerCase();
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
if (!keyId || !/^ed25519:[0-9a-f]{16}$/.test(keyId))
  throw new Error("Usage: pnpm signing-key:revoke ed25519:<16 hex characters>");
if (process.env.CONFIRM_REVOKE_SIGNING_KEY !== keyId)
  throw new Error(
    `Set CONFIRM_REVOKE_SIGNING_KEY=${keyId} to confirm this irreversible trust action.`,
  );

try {
  const revoked = await revokeSigningPublicKey(keyId);
  if (!revoked) throw new Error("Key was not found or was already revoked.");
  console.log(
    `Revoked ${keyId}. Existing signatures remain mathematically valid but are untrusted.`,
  );
} finally {
  await closePersistence();
}
