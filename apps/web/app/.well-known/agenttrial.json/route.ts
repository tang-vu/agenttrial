import { NextResponse } from "next/server";

export function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return NextResponse.json({
    schema: `${origin}/schemas/agent-descriptor-v1.json`,
    name: "AgentTrial",
    version: "0.1.0",
    description: "Autonomous adversarial evaluator producing deterministic evidence receipts.",
    endpoints: {
      openapi: `${origin}/openapi.json`,
      createTrial: `${origin}/api/runs`,
      signingKeys: `${origin}/api/signing-keys`,
      health: `${origin}/api/health`,
      readiness: `${origin}/api/ready`,
    },
    modes: ["active-controlled", "passive-external"],
    a2a: {
      supported: false,
      reason: "AgentTrial does not yet implement the complete A2A 1.0 task lifecycle.",
    },
  });
}
