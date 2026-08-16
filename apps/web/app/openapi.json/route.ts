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
    "/api/authorizations": {
      post: {
        summary: "Issue a short-lived A2A HTTPS domain-control challenge",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AuthorizationChallengeRequest" },
            },
          },
        },
        responses: {
          "201": { description: "Exact proof document and private verification token issued" },
          "400": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/api/authorizations/{id}/verify": {
      post: {
        summary: "Verify the exact published proof and unchanged Agent Card",
        parameters: [
          idParameter,
          {
            name: "x-agenttrial-verification-token",
            in: "header",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "Authorization verified" },
          "400": { $ref: "#/components/responses/Error" },
          "401": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/api/runs": {
      post: {
        summary: "Start a fixture, passive public, or authorized A2A trial",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                oneOf: [
                  { $ref: "#/components/schemas/FixtureRunRequest" },
                  { $ref: "#/components/schemas/PassiveRunRequest" },
                  { $ref: "#/components/schemas/ActiveA2ARunRequest" },
                ],
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Run created",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/RunCreated" } },
            },
          },
          "400": { description: "Invalid request" },
          "403": { description: "Consent required" },
        },
      },
    },
    "/api/runs/{id}": {
      get: {
        summary: "Get run state and report",
        parameters: [idParameter],
        responses: {
          "200": {
            description: "Run",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Run" } } },
          },
          "404": { $ref: "#/components/responses/Error" },
        },
      },
      delete: {
        summary: "Cancel an active run",
        parameters: [
          idParameter,
          {
            name: "x-agenttrial-cancel-token",
            in: "header",
            required: true,
            schema: { type: "string", minLength: 64, maxLength: 64 },
          },
        ],
        responses: {
          "200": { description: "Cancellation requested" },
          "409": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/api/runs/{id}/events": {
      get: {
        summary: "Stream hash-chained events using SSE",
        parameters: [idParameter],
        responses: {
          "200": {
            description: "Hash-chained events",
            content: { "text/event-stream": { schema: { type: "string" } } },
          },
        },
      },
    },
    "/api/runs/{id}/bundle": {
      get: {
        summary: "Download canonical evidence bundle",
        parameters: [idParameter],
        responses: {
          "200": {
            description: "Evidence bundle JSON",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/EvidenceBundle" } },
            },
          },
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
    "/api/signing-keys": {
      get: {
        summary: "Get this service's receipt verification-key registry",
        responses: {
          "200": {
            description: "Active signing-key registry",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/SigningKeys" } },
            },
          },
        },
      },
    },
  },
  components: {
    responses: {
      Error: {
        description: "Error",
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["error"],
              properties: { error: { type: "string" } },
            },
          },
        },
      },
    },
    schemas: {
      FixtureRunRequest: {
        type: "object",
        additionalProperties: false,
        required: ["fixture", "activeConsent"],
        properties: {
          fixture: { type: "string", enum: ["evidence-researcher", "gullible-researcher"] },
          activeConsent: { const: true },
        },
      },
      PassiveRunRequest: {
        type: "object",
        additionalProperties: false,
        required: ["targetUrl", "mode"],
        properties: {
          targetUrl: { type: "string", format: "uri", maxLength: 2048 },
          mode: { const: "passive" },
          capabilityDescription: {
            type: "string",
            maxLength: 2000,
            description:
              "Optional user-asserted capability; always labeled untested in passive mode.",
          },
        },
      },
      ActiveA2ARunRequest: {
        type: "object",
        additionalProperties: false,
        required: ["mode", "authorizationId", "activeConsent"],
        properties: {
          mode: { const: "active" },
          authorizationId: { type: "string", format: "uuid" },
          activeConsent: { const: true },
        },
      },
      AuthorizationChallengeRequest: {
        type: "object",
        additionalProperties: false,
        required: [
          "cardUrl",
          "interfaceUrl",
          "skillId",
          "proofUrl",
          "testMessage",
          "expectedSubstring",
        ],
        properties: {
          cardUrl: { type: "string", format: "uri", maxLength: 2048 },
          interfaceUrl: { type: "string", format: "uri", maxLength: 2048 },
          skillId: { type: "string", maxLength: 160 },
          proofUrl: { type: "string", format: "uri", maxLength: 2048 },
          testMessage: { type: "string", maxLength: 1000 },
          expectedSubstring: { type: "string", maxLength: 120 },
        },
      },
      RunCreated: {
        type: "object",
        required: ["runId", "state", "cancelToken"],
        properties: {
          runId: { type: "string", format: "uuid" },
          state: { $ref: "#/components/schemas/PipelineState" },
          cancelToken: {
            type: "string",
            description: "Private cancellation capability; returned only once.",
          },
        },
      },
      PipelineState: {
        type: "string",
        enum: [
          "CREATED",
          "DISCOVERING",
          "CLAIMS_EXTRACTED",
          "PLANNING",
          "PLAN_SEALED",
          "EXECUTING",
          "VERIFYING",
          "SCORING",
          "RECEIPT_SIGNED",
          "ATTESTING",
          "COMPLETED",
          "FAILED",
          "CANCELLED",
        ],
      },
      Event: {
        type: "object",
        required: ["index", "id", "at", "state", "type", "message", "previousHash", "hash"],
        properties: {
          index: { type: "integer" },
          id: { type: "string" },
          at: { type: "string", format: "date-time" },
          state: { $ref: "#/components/schemas/PipelineState" },
          type: { type: "string" },
          message: { type: "string" },
          detail: { type: "object" },
          previousHash: { type: "string", pattern: "^[0-9a-f]{64}$" },
          hash: { type: "string", pattern: "^[0-9a-f]{64}$" },
        },
      },
      Run: {
        type: "object",
        required: ["runId", "state", "events"],
        properties: {
          runId: { type: "string", format: "uuid" },
          state: { $ref: "#/components/schemas/PipelineState" },
          events: { type: "array", items: { $ref: "#/components/schemas/Event" } },
          report: { type: "object" },
          error: { type: "string" },
        },
      },
      Receipt: {
        type: "object",
        required: ["payload", "signature", "publicKey", "algorithm"],
        properties: {
          payload: {
            type: "object",
            required: [
              "runId",
              "reportHash",
              "evidenceRoot",
              "eventChainHead",
              "planHash",
              "keyId",
            ],
            properties: {
              receiptVersion: { const: "1.0.0" },
              methodologyVersion: { type: "string" },
              runId: { type: "string", format: "uuid" },
              targetId: { type: "string" },
              mode: { enum: ["active-controlled", "passive-external", "active-external"] },
              planHash: { type: "string", pattern: "^[0-9a-f]{64}$" },
              seedCommitment: { type: "string", pattern: "^[0-9a-f]{64}$" },
              evidenceRoot: { type: "string", pattern: "^[0-9a-f]{64}$" },
              evidenceItemHashes: {
                type: "array",
                items: { type: "string", pattern: "^[0-9a-f]{64}$" },
              },
              reportHash: { type: "string", pattern: "^[0-9a-f]{64}$" },
              eventChainHead: { type: "string", pattern: "^[0-9a-f]{64}$" },
              scoreBasisPoints: { type: "integer", minimum: 0, maximum: 10000 },
              coverageBasisPoints: { type: "integer", minimum: 0, maximum: 10000 },
              issuedAt: { type: "string", format: "date-time" },
              keyId: { type: "string" },
            },
          },
          signature: { type: "string", pattern: "^[0-9a-f]{128}$" },
          publicKey: { type: "string", pattern: "^[0-9a-f]{64}$" },
          algorithm: { const: "Ed25519" },
        },
      },
      EvidenceBundle: {
        type: "object",
        required: ["schemaVersion", "report", "events", "evidenceRoot", "receipt"],
        properties: {
          schemaVersion: { const: "1.0.0" },
          report: { type: "object" },
          events: { type: "array", items: { $ref: "#/components/schemas/Event" } },
          evidenceRoot: { type: "string", pattern: "^[0-9a-f]{64}$" },
          receipt: { $ref: "#/components/schemas/Receipt" },
          attestation: { type: "object" },
        },
      },
      SigningKeys: {
        type: "object",
        required: ["version", "keys"],
        properties: {
          version: { type: "string" },
          keys: {
            type: "array",
            items: {
              type: "object",
              required: ["keyId", "algorithm", "publicKey", "status"],
              properties: {
                keyId: { type: "string" },
                algorithm: { const: "Ed25519" },
                publicKey: { type: "string", pattern: "^[0-9a-f]{64}$" },
                status: { enum: ["active", "previous", "revoked"] },
              },
            },
          },
        },
      },
    },
  },
};
export function GET() {
  return NextResponse.json(spec);
}
