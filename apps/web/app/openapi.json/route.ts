import { NextResponse } from "next/server";

const idParameter = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
};
const spec = {
  openapi: "3.1.0",
  info: {
    title: "AgentTrial API",
    version: "1.0.0",
    description: "Autonomous adversarial agent evaluation with deterministic evidence receipts.",
  },
  servers: [{ url: "/" }],
  paths: {
    "/api/runs": {
      post: {
        summary: "Start a controlled trial",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["fixture", "activeConsent"],
                properties: {
                  fixture: { type: "string", enum: ["evidence-researcher", "gullible-researcher"] },
                  activeConsent: { const: true },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Run created" },
          "400": { description: "Invalid request" },
          "403": { description: "Consent required" },
        },
      },
    },
    "/api/runs/{id}": {
      get: {
        summary: "Get run state and report",
        parameters: [idParameter],
        responses: { "200": { description: "Run" }, "404": { description: "Not found" } },
      },
      delete: {
        summary: "Cancel an active run",
        parameters: [idParameter],
        responses: { "200": { description: "Cancellation requested" } },
      },
    },
    "/api/runs/{id}/events": {
      get: {
        summary: "Stream hash-chained events using SSE",
        parameters: [idParameter],
        responses: { "200": { description: "text/event-stream" } },
      },
    },
    "/api/runs/{id}/bundle": {
      get: {
        summary: "Download canonical evidence bundle",
        parameters: [idParameter],
        responses: {
          "200": { description: "Evidence bundle JSON" },
          "409": { description: "Not ready" },
        },
      },
    },
    "/api/health": {
      get: { summary: "Liveness", responses: { "200": { description: "Healthy" } } },
    },
    "/api/ready": {
      get: {
        summary: "Readiness and optional-provider status",
        responses: { "200": { description: "Ready" } },
      },
    },
  },
};
export function GET() {
  return NextResponse.json(spec);
}
