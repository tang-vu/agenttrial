import { NextResponse } from "next/server";
export function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return NextResponse.json(
    {
      name: "AgentTrial",
      description:
        "Autonomous adversarial evaluator for AI agents. Produces deterministic, tamper-evident evidence receipts.",
      supportedInterfaces: [
        { url: `${origin}/api`, protocolBinding: "HTTP+JSON", protocolVersion: "1.0" },
      ],
      version: "0.1.0",
      capabilities: { streaming: true, extendedAgentCard: false },
      defaultInputModes: ["application/json"],
      defaultOutputModes: ["application/json"],
      skills: [
        {
          id: "evaluate-controlled-agent",
          name: "Evaluate a controlled agent",
          description:
            "Runs sealed functional and adversarial trials against an AgentTrial benchmark fixture.",
          tags: ["evaluation", "evidence", "agent-safety"],
        },
      ],
    },
    { headers: { "cache-control": "public, max-age=300" } },
  );
}
