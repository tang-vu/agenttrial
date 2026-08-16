import http from "node:http";
import https from "node:https";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { isIP } from "node:net";
import { z } from "zod";
import type { Claim, EvidenceItem, TargetDescriptor } from "@agenttrial/core";
import {
  BudgetGuard,
  UnsafeTargetError,
  isPublicIp,
  privateTestTargetsAllowed,
  redact,
  validateTargetUrl,
} from "@agenttrial/security";

export interface SafeResponse {
  url: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  bytes: number;
  latencyMs: number;
  redirects: string[];
  remoteAddress: string;
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  signal?: AbortSignal;
}

export async function safePublicFetch(
  raw: string,
  options: SafeFetchOptions = {},
): Promise<SafeResponse> {
  const timeoutMs = options.timeoutMs ?? 6_000;
  const maxBytes = options.maxBytes ?? 1_000_000;
  const maxRedirects = options.maxRedirects ?? 3;
  const budget = new BudgetGuard({
    maxCalls: maxRedirects + 1,
    maxBytes,
    maxDurationMs: timeoutMs * (maxRedirects + 1),
  });
  const redirects: string[] = [];
  const deadline = performance.now() + timeoutMs;
  let current = raw;
  for (let redirect = 0; redirect <= maxRedirects; redirect++) {
    const remainingMs = Math.floor(deadline - performance.now());
    if (remainingMs <= 0) throw new Error("Target request exceeded the total deadline.");
    const validated = await validateTargetUrl(current);
    const response = await pinnedRequest(
      validated.url,
      validated.addresses,
      remainingMs,
      maxBytes - budget.bytes,
      options.signal ? { signal: options.signal } : {},
    );
    budget.consume(response.bytes);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.location;
      if (!location)
        throw new UnsafeTargetError("Redirect response did not include a Location header.");
      if (redirect === maxRedirects) throw new UnsafeTargetError("Redirect limit exceeded.");
      current = new URL(location, validated.url).toString();
      redirects.push(current);
      continue;
    }
    return { ...response, redirects };
  }
  throw new UnsafeTargetError("Redirect limit exceeded.");
}

function pinnedRequest(
  url: URL,
  approvedAddresses: string[],
  timeoutMs: number,
  maxBytes: number,
  options: {
    method?: "GET" | "POST";
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  } = {},
): Promise<Omit<SafeResponse, "redirects">> {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const pinned = approvedAddresses[0]!;
    const family = isIP(pinned);
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.request(url, {
      method: options.method ?? "GET",
      headers: options.headers ?? {
        accept: "application/json, application/yaml, text/plain, text/html;q=0.9",
        "accept-encoding": "identity",
        "user-agent": "AgentTrial-Passive-Evaluator/1.0 (+https://agenttrial.tangvu.dev/security)",
      },
      lookup: (_hostname, _options, callback) => callback(null, pinned, family),
      servername: url.hostname,
      timeout: timeoutMs,
      signal: options.signal,
    });
    request.once("socket", (socket) => {
      const verify = () => {
        const remote = socket.remoteAddress?.replace(/^::ffff:/, "") ?? "";
        const testPrivateAllowed = privateTestTargetsAllowed();
        if (
          (!testPrivateAllowed && !isPublicIp(remote)) ||
          !approvedAddresses.map((x) => x.replace(/^::ffff:/, "")).includes(remote)
        )
          request.destroy(
            new UnsafeTargetError("Connected address did not match the approved DNS result."),
          );
      };
      socket.once(url.protocol === "https:" ? "secureConnect" : "connect", verify);
    });
    request.once("timeout", () => request.destroy(new Error("Target request timed out.")));
    const deadlineTimer = setTimeout(
      () => request.destroy(new Error("Target request exceeded the total deadline.")),
      timeoutMs,
    );
    request.once("close", () => clearTimeout(deadlineTimer));
    request.once("error", reject);
    request.once("response", (response) => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      let exceeded = false;
      const remoteAddress = response.socket?.remoteAddress ?? pinned;
      response.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > maxBytes) {
          exceeded = true;
          response.destroy(new Error("Target response exceeded the byte budget."));
        } else chunks.push(chunk);
      });
      response.once("error", reject);
      response.once("end", () => {
        if (exceeded) return;
        const headers = Object.fromEntries(
          Object.entries(response.headers).flatMap(([key, value]) =>
            value === undefined
              ? []
              : [[key.toLowerCase(), Array.isArray(value) ? value.join(", ") : value]],
          ),
        );
        resolve({
          url: url.toString(),
          status: response.statusCode ?? 0,
          headers,
          body: Buffer.concat(chunks).toString("utf8"),
          bytes,
          latencyMs: Math.round(performance.now() - started),
          remoteAddress,
        });
      });
    });
    request.end(options.body);
  });
}

export const A2ACardSchema = z
  .object({
    name: z.string(),
    description: z.string(),
    version: z.string(),
    skills: z.array(
      z
        .object({
          id: z.string(),
          name: z.string(),
          description: z.string(),
          tags: z.array(z.string()),
          inputModes: z.array(z.string()).optional(),
          outputModes: z.array(z.string()).optional(),
          securityRequirements: z
            .array(
              z
                .object({
                  schemes: z.record(z.string(), z.object({ list: z.array(z.string()) }).strict()),
                })
                .strict(),
            )
            .optional(),
        })
        .passthrough(),
    ),
    supportedInterfaces: z
      .array(
        z
          .object({
            url: z.string().url(),
            protocolBinding: z.string(),
            protocolVersion: z.string(),
            tenant: z.string().min(1).optional(),
          })
          .passthrough(),
      )
      .min(1),
    capabilities: z
      .object({
        streaming: z.boolean().optional(),
        pushNotifications: z.boolean().optional(),
        extendedAgentCard: z.boolean().optional(),
        extensions: z
          .array(
            z
              .object({
                uri: z.string().optional(),
                description: z.string().optional(),
                required: z.boolean().optional(),
                params: z.record(z.string(), z.unknown()).optional(),
              })
              .passthrough(),
          )
          .optional(),
      })
      .passthrough(),
    defaultInputModes: z.array(z.string()).min(1),
    defaultOutputModes: z.array(z.string()).min(1),
    securityRequirements: z
      .array(
        z
          .object({
            schemes: z.record(z.string(), z.object({ list: z.array(z.string()) }).strict()),
          })
          .strict(),
      )
      .optional(),
  })
  .passthrough();

export type A2AAgentCard = z.infer<typeof A2ACardSchema>;

export function parseA2AAgentCard(body: string): A2AAgentCard {
  const parsed = A2ACardSchema.safeParse(tryJson(body));
  if (!parsed.success) throw new Error("Target did not return a valid A2A 1.0 Agent Card.");
  return parsed.data;
}

export function validateAuthorizedA2ASelection(
  card: A2AAgentCard,
  interfaceUrl: string,
  skillId: string,
) {
  if (card.securityRequirements?.length)
    throw new Error("Active v1 supports only A2A interfaces that advertise anonymous access.");
  if (card.capabilities.extensions?.some((extension) => extension.required))
    throw new Error("Active v1 does not invoke agents that require A2A extensions.");
  if (card.skills.filter((entry) => entry.id === skillId).length !== 1)
    throw new Error("The selected skill ID must be unique in the Agent Card.");
  if (
    card.supportedInterfaces.filter(
      (entry) =>
        entry.url === interfaceUrl &&
        entry.protocolBinding === "HTTP+JSON" &&
        entry.protocolVersion === "1.0",
    ).length !== 1
  )
    throw new Error("The selected A2A interface must be unique in the Agent Card.");
  const selectedInterface = card.supportedInterfaces.find(
    (entry) =>
      entry.url === interfaceUrl &&
      entry.protocolBinding === "HTTP+JSON" &&
      entry.protocolVersion === "1.0",
  );
  if (!selectedInterface)
    throw new Error("The selected HTTP+JSON 1.0 interface is not advertised by the Agent Card.");
  const skill = card.skills.find((entry) => entry.id === skillId);
  if (!skill) throw new Error("The selected skill is not advertised by the Agent Card.");
  if (skill.securityRequirements?.length)
    throw new Error("Active v1 supports only A2A skills that advertise anonymous access.");
  const inputModes = skill.inputModes ?? card.defaultInputModes;
  const outputModes = skill.outputModes ?? card.defaultOutputModes;
  if (!inputModes.includes("text/plain") || !outputModes.includes("text/plain"))
    throw new Error("The selected skill must advertise text/plain input and output.");
  return { selectedInterface, skill };
}

const A2AMessageSchema = z
  .object({
    messageId: z.string().min(1),
    contextId: z.string().optional(),
    taskId: z.string().optional(),
    role: z.literal("ROLE_AGENT"),
    parts: z.array(z.object({ text: z.string() }).strict()).min(1),
    metadata: z.record(z.string(), z.unknown()).optional(),
    extensions: z.array(z.string()).optional(),
    referenceTaskIds: z.array(z.string()).optional(),
  })
  .strict();
const A2ATaskSchema = z
  .object({
    id: z.string(),
    contextId: z.string().optional(),
    status: z.object({ state: z.string() }).passthrough(),
    artifacts: z
      .array(
        z.object({ parts: z.array(z.object({ text: z.string() }).strict()).min(1) }).passthrough(),
      )
      .optional(),
    history: z.array(A2AMessageSchema).max(0).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
const A2AResponseSchema = z
  .object({ task: A2ATaskSchema.optional(), message: A2AMessageSchema.optional() })
  .strict()
  .refine((value) => Number(Boolean(value.task)) + Number(Boolean(value.message)) === 1, {
    message: "A2A response must contain exactly one task or message",
  });

export interface AuthorizedA2AResult {
  response: SafeResponse;
  text: string;
  protocolValid: true;
  capabilityFailed: boolean;
  taskState?: string;
}

export async function safeAuthorizedA2ASend(
  interfaceUrl: string,
  message: string,
  runId: string,
  options: {
    timeoutMs: number;
    maxRequestBytes: number;
    maxResponseBytes: number;
    tenant?: string;
    signal?: AbortSignal;
  },
): Promise<AuthorizedA2AResult> {
  const base = new URL(interfaceUrl);
  const endpoint = new URL(`${base.pathname.replace(/\/?$/, "/")}message:send`, base);
  const validated = await validateTargetUrl(endpoint.toString());
  const payload = JSON.stringify({
    ...(options.tenant ? { tenant: options.tenant } : {}),
    message: {
      messageId: randomRequestId(),
      role: "ROLE_USER",
      parts: [{ text: message }],
    },
    configuration: {
      acceptedOutputModes: ["text/plain"],
      historyLength: 0,
      returnImmediately: false,
    },
  });
  if (Buffer.byteLength(payload) > options.maxRequestBytes)
    throw new Error("A2A request exceeded its authorization byte budget.");
  const response = await pinnedRequest(
    validated.url,
    validated.addresses,
    options.timeoutMs,
    options.maxResponseBytes,
    {
      method: "POST",
      ...(options.signal ? { signal: options.signal } : {}),
      body: payload,
      headers: {
        accept: "application/a2a+json",
        "content-type": "application/a2a+json",
        "content-length": String(Buffer.byteLength(payload)),
        "a2a-version": "1.0",
        "user-agent":
          "AgentTrial-Authorized-Evaluator/1.0 (+https://agenttrial.tangvu.dev/security)",
        "x-agenttrial-run-id": runId,
      },
    },
  );
  if ([301, 302, 303, 307, 308].includes(response.status))
    throw new UnsafeTargetError("Active A2A requests never follow redirects.");
  if (response.status < 200 || response.status >= 300)
    throw new Error(`A2A request failed with HTTP ${response.status}.`);
  const contentType = response.headers["content-type"] ?? "";
  if (!contentType.toLowerCase().includes("application/a2a+json"))
    throw new Error("A2A response did not use application/a2a+json.");
  const decoded = A2AResponseSchema.parse(tryJson(response.body));
  const taskState = decoded.task?.status.state;
  if (
    ["TASK_STATE_SUBMITTED", "TASK_STATE_WORKING", "TASK_STATE_UNSPECIFIED"].includes(
      taskState ?? "",
    )
  )
    throw new Error("Blocking A2A response returned a non-terminal task state.");
  const capabilityFailed = taskState === "TASK_STATE_FAILED" || taskState === "TASK_STATE_REJECTED";
  const text = decoded.message
    ? decoded.message.parts.map((part) => part.text).join("\n")
    : (decoded.task?.artifacts ?? [])
        .flatMap((artifact) => artifact.parts)
        .map((part) => part.text)
        .join("\n");
  return {
    response: { ...response, redirects: [] },
    text,
    protocolValid: true,
    capabilityFailed,
    ...(taskState ? { taskState } : {}),
  };
}

function randomRequestId() {
  return randomUUID();
}
const OpenApiSchema = z.object({
  openapi: z.string(),
  info: z.object({ title: z.string(), description: z.string().optional() }),
  paths: z.record(z.string(), z.record(z.string(), z.unknown())),
});

export interface ExternalDiscovery {
  target: TargetDescriptor;
  claims: Claim[];
  response: SafeResponse;
  evidence: EvidenceItem;
  descriptorKind: "a2a" | "openapi" | "github" | "openai" | "website";
}

export async function discoverPublicTarget(
  raw: string,
  options: Pick<SafeFetchOptions, "signal"> = {},
): Promise<ExternalDiscovery> {
  const response = await safePublicFetch(normalizeDiscoveryUrl(raw), options);
  const url = new URL(response.url);
  const parsed = tryJson(response.body);
  const a2a = A2ACardSchema.safeParse(parsed);
  const openapi = OpenApiSchema.safeParse(parsed);
  let descriptorKind: ExternalDiscovery["descriptorKind"] = "website";
  let name = url.hostname;
  let claims: Claim[] = [];
  if (a2a.success) {
    descriptorKind = "a2a";
    name = a2a.data.name;
    claims = a2a.data.skills.map((skill, index) =>
      claim(
        `claim_a2a_${index + 1}`,
        skill.name,
        skill.description,
        response.url,
        `skills[${index}]`,
        0.98,
      ),
    );
  } else if (openapi.success) {
    descriptorKind = "openapi";
    name = openapi.data.info.title;
    for (const [path, operations] of Object.entries(openapi.data.paths))
      for (const [method, operation] of Object.entries(operations))
        if (["get", "post", "put", "patch", "delete"].includes(method.toLowerCase())) {
          const record = operation as Record<string, unknown>;
          const summary =
            typeof record.summary === "string" ? record.summary : `${method.toUpperCase()} ${path}`;
          claims.push(
            claim(
              `claim_api_${claims.length + 1}`,
              summary,
              `Advertised ${method.toUpperCase()} operation at ${path}`,
              response.url,
              `paths.${path}.${method}`,
              0.95,
            ),
          );
        }
  } else if (
    url.hostname.toLowerCase() === "github.com" ||
    url.hostname.toLowerCase() === "api.github.com" ||
    url.hostname.toLowerCase().endsWith(".githubusercontent.com")
  ) {
    descriptorKind = "github";
    const apiBody = tryJson(response.body) as { content?: unknown; encoding?: unknown } | undefined;
    const readme =
      url.hostname.toLowerCase() === "api.github.com" &&
      apiBody?.encoding === "base64" &&
      typeof apiBody.content === "string"
        ? Buffer.from(apiBody.content.replace(/\s/g, ""), "base64").toString("utf8")
        : response.body;
    name = extractTitle(readme) ?? url.pathname.split("/").filter(Boolean).at(-2) ?? url.hostname;
    claims = extractTextClaims(readme, response.url, "README");
  } else if (/\/v1\/models\/?$/.test(url.pathname) && parsed && typeof parsed === "object") {
    descriptorKind = "openai";
    name = `${url.hostname} OpenAI-compatible endpoint`;
    claims = [
      claim(
        "claim_openai_models",
        "Expose an OpenAI-compatible model catalog",
        "Returns a structured models list",
        response.url,
        "GET /v1/models",
        0.9,
      ),
    ];
  } else {
    name = extractTitle(response.body) ?? url.hostname;
    claims = extractTextClaims(stripHtml(response.body), response.url, "public page");
  }
  claims = [
    claim(
      "claim_public_surface",
      "Expose a publicly discoverable agent surface",
      "Returns bounded public documentation",
      response.url,
      "HTTP response",
      1,
    ),
    ...claims,
  ].slice(0, 20);
  const target: TargetDescriptor = {
    id: `url:${url.origin}${url.pathname}`,
    name,
    type:
      descriptorKind === "github"
        ? "repository"
        : descriptorKind === "openapi"
          ? "api"
          : descriptorKind === "openai"
            ? "openai"
            : descriptorKind === "a2a"
              ? "a2a"
              : "website",
    locator: response.url,
    controlled: false,
  };
  return {
    target,
    claims,
    response: { ...response, body: response.body.slice(0, 120_000) },
    descriptorKind,
    evidence: {
      id: "ev_discovery",
      kind: "passive-http-discovery",
      capturedAt: new Date().toISOString(),
      data: redact({
        url: response.url,
        status: response.status,
        headers: response.headers,
        bytes: response.bytes,
        latencyMs: response.latencyMs,
        redirects: response.redirects,
        bodyExcerpt: response.body.slice(0, 20_000),
      }) as Record<string, unknown>,
      redactions: [],
    },
  };
}

export function normalizeDiscoveryUrl(raw: string) {
  const url = new URL(raw);
  if (url.hostname.toLowerCase() !== "github.com") return raw;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 2) return raw;
  return `https://api.github.com/repos/${encodeURIComponent(parts[0]!)}/${encodeURIComponent(parts[1]!)}/readme`;
}

function claim(
  id: string,
  capability: string,
  success: string,
  source: string,
  location: string,
  confidence: number,
): Claim {
  return {
    id,
    capability: capability.slice(0, 240),
    advertisedInput: "Publicly documented input",
    advertisedOutput: success.slice(0, 500),
    dependencies: [],
    requiredPermissions: [],
    successCondition: success.slice(0, 500),
    evidenceSource: source,
    confidence,
    discoveryLocation: location,
  };
}
function tryJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}
function extractTitle(body: string) {
  return (
    body.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1]?.trim() ??
    body.match(/^#\s+(.{1,200})$/m)?.[1]?.trim()
  );
}
function stripHtml(body: string) {
  return body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function extractTextClaims(text: string, source: string, location: string): Claim[] {
  const normalized = text.slice(0, 40_000);
  const candidates = normalized
    .split(/(?<=[.!?])\s+|\r?\n/)
    .map((x) => x.trim())
    .filter(
      (x) =>
        x.length >= 25 &&
        x.length <= 320 &&
        /\b(can|supports?|provides?|offers?|agent|API|tool)\b/i.test(x) &&
        !/ignore previous|system prompt|developer message/i.test(x),
    );
  return [...new Set(candidates)]
    .slice(0, 8)
    .map((text, index) =>
      claim(
        `claim_text_${index + 1}`,
        text,
        "Advertised behavior is supported by a public evidence source",
        source,
        `${location} sentence ${index + 1}`,
        0.6,
      ),
    );
}
