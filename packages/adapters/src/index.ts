import http from "node:http";
import https from "node:https";
import { performance } from "node:perf_hooks";
import { isIP } from "node:net";
import { z } from "zod";
import type { Claim, EvidenceItem, TargetDescriptor } from "@agenttrial/core";
import {
  BudgetGuard,
  UnsafeTargetError,
  isPublicIp,
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
  let current = raw;
  for (let redirect = 0; redirect <= maxRedirects; redirect++) {
    const validated = await validateTargetUrl(current);
    const response = await pinnedRequest(
      validated.url,
      validated.addresses,
      timeoutMs,
      maxBytes - budget.bytes,
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
): Promise<Omit<SafeResponse, "redirects">> {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const pinned = approvedAddresses[0]!;
    const family = isIP(pinned);
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.request(url, {
      method: "GET",
      headers: {
        accept: "application/json, application/yaml, text/plain, text/html;q=0.9",
        "accept-encoding": "identity",
        "user-agent": "AgentTrial-Passive-Evaluator/1.0 (+https://agenttrial.dev/security)",
      },
      lookup: (_hostname, _options, callback) => callback(null, pinned, family),
      servername: url.hostname,
      timeout: timeoutMs,
    });
    request.once("socket", (socket) => {
      const verify = () => {
        const remote = socket.remoteAddress?.replace(/^::ffff:/, "") ?? "";
        const testPrivateAllowed = process.env.AGENTTRIAL_ALLOW_PRIVATE_TEST_TARGETS === "true";
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
    request.end();
  });
}

const A2ACardSchema = z.object({
  name: z.string(),
  description: z.string(),
  version: z.string(),
  skills: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      tags: z.array(z.string()),
    }),
  ),
  supportedInterfaces: z
    .array(z.object({ url: z.string(), protocolBinding: z.string(), protocolVersion: z.string() }))
    .optional(),
});
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

export async function discoverPublicTarget(raw: string): Promise<ExternalDiscovery> {
  const response = await safePublicFetch(raw);
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
    url.hostname.toLowerCase().endsWith(".githubusercontent.com")
  ) {
    descriptorKind = "github";
    name =
      extractTitle(response.body) ?? url.pathname.split("/").filter(Boolean).at(-1) ?? url.hostname;
    claims = extractTextClaims(response.body, response.url, "README");
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
