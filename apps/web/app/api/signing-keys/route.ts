import { NextResponse } from "next/server";
import { getSigningKeyRegistry } from "@agenttrial/runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  const keys = await getSigningKeyRegistry();
  return NextResponse.json(
    {
      version: "1",
      trustModel: "service-distributed-current-key",
      independentReference: "https://github.com/tang-vu/agenttrial/releases",
      keys: keys.map((key) => ({ ...key, algorithm: "Ed25519" })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
