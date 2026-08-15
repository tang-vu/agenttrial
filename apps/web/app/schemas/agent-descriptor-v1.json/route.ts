import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "/schemas/agent-descriptor-v1.json",
    title: "AgentTrial machine descriptor",
    type: "object",
    additionalProperties: false,
    required: ["schema", "name", "version", "description", "endpoints", "modes", "a2a"],
    properties: {
      schema: { type: "string", format: "uri" },
      name: { type: "string" },
      version: { type: "string" },
      description: { type: "string" },
      endpoints: {
        type: "object",
        additionalProperties: { type: "string", format: "uri" },
      },
      modes: { type: "array", items: { enum: ["active-controlled", "passive-external"] } },
      a2a: {
        type: "object",
        additionalProperties: false,
        required: ["supported", "reason"],
        properties: { supported: { type: "boolean" }, reason: { type: "string" } },
      },
    },
  });
}
