import { NextResponse } from "next/server";
export function GET() {
  return NextResponse.json({
    ready: true,
    fixtureRuntime: true,
    plannerProvider: process.env.OPENAI_API_KEY ? "openai" : "deterministic",
    attestation: process.env.EAS_PRIVATE_KEY ? "configured" : "local-receipt-fallback",
  });
}
