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
    "/api/methodology": {
      get: {
        summary: "Get the versioned deterministic scoring and commitment manifest",
        responses: {
          "200": {
            description: "Methodology and assertion-registry manifest",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/MethodologyManifest" } },
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
      MethodologyManifest: {
        type: "object",
        additionalProperties: false,
        required: [
          "schemaVersion",
          "methodologyVersion",
          "evaluatorBuild",
          "scoreAuthority",
          "assertionRegistry",
          "assertionRegistryHash",
          "dimensions",
          "coverage",
          "commitments",
          "schemas",
          "disclaimer",
        ],
        properties: {
          schemaVersion: { const: "agenttrial.methodology-manifest.v1" },
          methodologyVersion: { type: "string" },
          evaluatorBuild: { type: "string" },
          scoreAuthority: { const: "deterministic-code-only" },
          assertionRegistry: { type: "object" },
          assertionRegistryHash: { type: "string", pattern: "^[0-9a-f]{64}$" },
          dimensions: { type: "object", additionalProperties: { type: "number" } },
          coverage: { type: "object" },
          commitments: { type: "object" },
          schemas: { type: "object" },
          disclaimer: { type: "string" },
        },
      },
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
      Target: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "type", "locator", "controlled"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          type: { enum: ["fixture", "website", "repository", "api", "openai", "a2a"] },
          locator: { type: "string" },
          controlled: { type: "boolean" },
        },
      },
      Claim: {
        type: "object",
        required: [
          "id",
          "capability",
          "advertisedInput",
          "advertisedOutput",
          "dependencies",
          "requiredPermissions",
          "successCondition",
          "evidenceSource",
          "confidence",
          "discoveryLocation",
        ],
        properties: {
          id: { type: "string" },
          capability: { type: "string" },
          advertisedInput: { type: "string" },
          advertisedOutput: { type: "string" },
          dependencies: { type: "array", items: { type: "string" } },
          requiredPermissions: { type: "array", items: { type: "string" } },
          successCondition: { type: "string" },
          evidenceSource: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          discoveryLocation: { type: "string" },
        },
      },
      AssertionSpec: {
        type: "object",
        required: ["id", "type", "field", "expected", "dimension", "weight", "description"],
        properties: {
          id: { type: "string" },
          type: {
            enum: [
              "contains",
              "not_contains",
              "equals",
              "lte",
              "gte",
              "valid_json",
              "citation",
              "refusal",
              "repeatable",
            ],
          },
          field: { type: "string" },
          expected: {},
          dimension: {
            enum: ["capability", "evidence", "safety", "reliability", "efficiency", "recovery"],
          },
          weight: { type: "number", exclusiveMinimum: 0 },
          description: { type: "string" },
        },
      },
      Trial: {
        type: "object",
        required: [
          "id",
          "claimIds",
          "category",
          "input",
          "expectedBehavior",
          "assertions",
          "timeoutMs",
          "maxCalls",
          "severity",
          "seed",
          "mode",
          "authorizationRequired",
        ],
        properties: {
          id: { type: "string" },
          claimIds: { type: "array", items: { type: "string" } },
          category: { type: "string" },
          input: { type: "object" },
          expectedBehavior: { type: "string" },
          assertions: { type: "array", items: { $ref: "#/components/schemas/AssertionSpec" } },
          timeoutMs: { type: "integer", minimum: 1 },
          maxCalls: { type: "integer", minimum: 1 },
          severity: { enum: ["low", "medium", "high", "critical"] },
          seed: { type: "string" },
          mode: { enum: ["passive", "active"] },
          authorizationRequired: { type: "boolean" },
        },
      },
      Observation: {
        type: "object",
        required: [
          "trialId",
          "startedAt",
          "completedAt",
          "latencyMs",
          "calls",
          "status",
          "output",
          "evidenceIds",
          "retryCount",
        ],
        properties: {
          trialId: { type: "string" },
          startedAt: { type: "string", format: "date-time" },
          completedAt: { type: "string", format: "date-time" },
          latencyMs: { type: "number", minimum: 0 },
          calls: { type: "integer", minimum: 0 },
          status: { enum: ["completed", "request_failed", "capability_failed", "not_tested"] },
          output: { type: "object" },
          evidenceIds: { type: "array", items: { type: "string" } },
          retryCount: { type: "integer", minimum: 0 },
        },
      },
      AssertionResult: {
        type: "object",
        required: [
          "id",
          "trialId",
          "dimension",
          "weight",
          "passed",
          "description",
          "actual",
          "expected",
          "evidenceIds",
        ],
        properties: {
          id: { type: "string" },
          trialId: { type: "string" },
          dimension: {
            enum: ["capability", "evidence", "safety", "reliability", "efficiency", "recovery"],
          },
          weight: { type: "number" },
          passed: { type: "boolean" },
          description: { type: "string" },
          actual: {},
          expected: {},
          evidenceIds: { type: "array", items: { type: "string" } },
        },
      },
      EvidenceItem: {
        type: "object",
        required: ["id", "kind", "capturedAt", "data", "redactions"],
        properties: {
          id: { type: "string" },
          kind: { type: "string" },
          trialId: { type: "string" },
          capturedAt: { type: "string", format: "date-time" },
          data: { type: "object" },
          redactions: { type: "array", items: { type: "string" } },
        },
      },
      Score: {
        type: "object",
        required: [
          "overall",
          "dimensions",
          "coverage",
          "confidence",
          "criticalFindings",
          "untestedClaims",
          "methodologyVersion",
          "badge",
        ],
        properties: {
          overall: { type: "number", minimum: 0, maximum: 100 },
          dimensions: { type: "object", additionalProperties: { type: "number" } },
          coverage: { type: "number", minimum: 0, maximum: 100 },
          confidence: { enum: ["low", "moderate", "high"] },
          criticalFindings: { type: "array", items: { type: "string" } },
          untestedClaims: { type: "array", items: { type: "string" } },
          methodologyVersion: { type: "string" },
          badge: { enum: ["evidence-backed", "partial", "not-verified"] },
        },
      },
      Report: {
        type: "object",
        required: [
          "runId",
          "target",
          "state",
          "claims",
          "plan",
          "planHash",
          "observations",
          "assertions",
          "evidence",
          "score",
          "seedReveal",
          "provenance",
          "startedAt",
          "completedAt",
        ],
        properties: {
          runId: { type: "string", format: "uuid" },
          target: { $ref: "#/components/schemas/Target" },
          state: { $ref: "#/components/schemas/PipelineState" },
          claims: { type: "array", items: { $ref: "#/components/schemas/Claim" } },
          plan: {
            type: "object",
            required: ["version", "seedCommitment", "trials"],
            properties: {
              version: { type: "string" },
              seedCommitment: { type: "string", pattern: "^[0-9a-f]{64}$" },
              trials: { type: "array", items: { $ref: "#/components/schemas/Trial" } },
            },
          },
          planHash: { type: "string", pattern: "^[0-9a-f]{64}$" },
          observations: { type: "array", items: { $ref: "#/components/schemas/Observation" } },
          assertions: { type: "array", items: { $ref: "#/components/schemas/AssertionResult" } },
          evidence: { type: "array", items: { $ref: "#/components/schemas/EvidenceItem" } },
          score: { $ref: "#/components/schemas/Score" },
          seedReveal: { type: "string", pattern: "^[0-9a-f]{32}$" },
          provenance: {
            type: "object",
            additionalProperties: false,
            required: ["evaluatorBuild", "runtimeVersion", "assertionRegistryHash", "reportSchema"],
            properties: {
              evaluatorBuild: { type: "string" },
              runtimeVersion: { type: "string" },
              assertionRegistryHash: { type: "string", pattern: "^[0-9a-f]{64}$" },
              reportSchema: { type: "string", format: "uri-reference" },
            },
          },
          startedAt: { type: "string", format: "date-time" },
          completedAt: { type: "string", format: "date-time" },
        },
      },
      Run: {
        type: "object",
        required: ["id", "state", "events", "mode", "cancelled"],
        properties: {
          id: { type: "string", format: "uuid" },
          state: { $ref: "#/components/schemas/PipelineState" },
          events: { type: "array", items: { $ref: "#/components/schemas/Event" } },
          mode: { enum: ["active-controlled", "passive-external", "active-external"] },
          cancelled: { type: "boolean" },
          report: { $ref: "#/components/schemas/Report" },
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
              "evaluatorBuild",
              "assertionRegistryHash",
              "reportSchema",
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
              evaluatorBuild: { type: "string" },
              assertionRegistryHash: { type: "string", pattern: "^[0-9a-f]{64}$" },
              reportSchema: { type: "string", format: "uri-reference" },
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
          report: { $ref: "#/components/schemas/Report" },
          events: { type: "array", items: { $ref: "#/components/schemas/Event" } },
          evidenceRoot: { type: "string", pattern: "^[0-9a-f]{64}$" },
          receipt: { $ref: "#/components/schemas/Receipt" },
          attestation: {
            type: "object",
            required: ["status", "message"],
            properties: {
              status: {
                enum: [
                  "not_configured",
                  "disabled",
                  "queued",
                  "pending",
                  "submitted",
                  "anchored",
                  "failed",
                ],
              },
              message: { type: "string" },
              chainId: { type: "integer" },
              schemaUid: { type: "string" },
              uid: { type: "string" },
              transactionHash: { type: "string" },
              explorerUrl: { type: "string", format: "uri" },
            },
          },
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
              required: [
                "keyId",
                "algorithm",
                "publicKey",
                "status",
                "notBefore",
                "notAfter",
                "revokedAt",
              ],
              properties: {
                keyId: { type: "string" },
                algorithm: { const: "Ed25519" },
                publicKey: { type: "string", pattern: "^[0-9a-f]{64}$" },
                status: { enum: ["active", "previous", "revoked"] },
                notBefore: { type: "string", format: "date-time" },
                notAfter: { type: ["string", "null"], format: "date-time" },
                revokedAt: { type: ["string", "null"], format: "date-time" },
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
