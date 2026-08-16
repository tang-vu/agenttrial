import { NextResponse } from "next/server";
import { getSigningPublicKey } from "@agenttrial/runtime";

export const dynamic = "force-dynamic";

export function GET() {
  const publicKey = getSigningPublicKey();
  return NextResponse.json(
    {
      version: "1",
      trustModel: "service-distributed-current-key",
      independentReference: "https://github.com/tang-vu/agenttrial/releases",
      keys: [
        {
          keyId: `ed25519:${publicKey.slice(0, 16)}`,
          algorithm: "Ed25519",
          publicKey,
          status: "active",
        },
      ],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
