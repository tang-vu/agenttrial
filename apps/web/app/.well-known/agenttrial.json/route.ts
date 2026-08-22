import { NextResponse } from "next/server";
import { descriptorPublicOrigin } from "../../../lib/site";

export function GET(request: Request) {
  const origin = descriptorPublicOrigin(request.url);
  return NextResponse.json({
    schema: `${origin}/schemas/agent-descriptor-v1.json`,
    name: "AgentTrial",
    version: "0.6.0",
    description: "Autonomous adversarial evaluator producing deterministic evidence receipts.",
    endpoints: {
      openapi: `${origin}/openapi.json`,
      createTrial: `${origin}/api/runs`,
      signingKeys: `${origin}/api/signing-keys`,
      methodology: `${origin}/api/methodology`,
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
