import { NextResponse } from "next/server";
import { persistenceReadiness } from "@agenttrial/runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  const persistence = await persistenceReadiness();
  const ready = persistence.database && persistence.worker;
  const openAIProvider =
    process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL
      ? "configured-optional"
      : process.env.OPENAI_API_KEY || process.env.OPENAI_MODEL
        ? "incomplete-configuration"
        : "not-configured";
  const easConfigured = Boolean(
    process.env.EAS_RPC_URL && process.env.EAS_PRIVATE_KEY && process.env.EAS_SCHEMA_UID,
  );
  return NextResponse.json(
    {
      ready,
      fixtureRuntime: true,
      plannerProvider: "deterministic",
      openAIProvider,
      persistence,
      attestation: easConfigured ? "configured" : "local-receipt-fallback",
    },
    { status: ready ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
