import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class UnsafeTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeTargetError";
  }
}
const blockedHostnames = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "instance-data.ec2.internal",
]);

export function isPublicIp(address: string): boolean {
  if (address.startsWith("::ffff:")) return isPublicIp(address.slice(7));
  const version = isIP(address);
  if (version === 4) {
    const parts = address.split(".").map(Number);
    const [a = 0, b = 0] = parts;
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224 ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51) ||
      (a === 203 && b === 0)
    );
  }
  if (version === 6) {
    const n = address.toLowerCase();
    return !(
      n === "::" ||
      n === "::1" ||
      n.startsWith("fc") ||
      n.startsWith("fd") ||
      /^fe[89ab]/.test(n) ||
      n.startsWith("ff") ||
      n.startsWith("2001:db8:")
    );
  }
  return false;
}

export async function validateTargetUrl(raw: string): Promise<{ url: URL; addresses: string[] }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeTargetError("Enter a valid absolute URL.");
  }
  if (!(["https:", "http:"] as string[]).includes(url.protocol))
    throw new UnsafeTargetError("Only HTTP and HTTPS targets are allowed.");
  if (url.username || url.password)
    throw new UnsafeTargetError("Credentials in target URLs are not allowed.");
  const hostname = url.hostname.replace(/\.$/, "").toLowerCase();
  if (
    blockedHostnames.has(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  )
    throw new UnsafeTargetError("Local and metadata targets are blocked.");
  const direct = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (
    direct.length === 0 ||
    (process.env.AGENTTRIAL_ALLOW_PRIVATE_TEST_TARGETS !== "true" &&
      direct.some((item) => !isPublicIp(item.address)))
  )
    throw new UnsafeTargetError("Target resolves to a private, reserved, or non-routable address.");
  return { url, addresses: direct.map((x) => x.address) };
}

export function redact(value: unknown): unknown {
  const secret = /authorization|cookie|api[-_]?key|token|secret|password/i;
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        secret.test(k) ? "[REDACTED]" : redact(v),
      ]),
    );
  if (typeof value === "string")
    return value.replace(/(?:sk|ghp|github_pat)_[A-Za-z0-9_-]{12,}/g, "[REDACTED]");
  return value;
}

export interface Budget {
  maxCalls: number;
  maxBytes: number;
  maxDurationMs: number;
}
export class BudgetGuard {
  calls = 0;
  bytes = 0;
  readonly started = Date.now();
  constructor(readonly budget: Budget) {}
  consume(bytes = 0) {
    this.calls++;
    this.bytes += bytes;
    if (this.calls > this.budget.maxCalls) throw new Error("Request budget exceeded");
    if (this.bytes > this.budget.maxBytes) throw new Error("Response-size budget exceeded");
    if (Date.now() - this.started > this.budget.maxDurationMs)
      throw new Error("Time budget exceeded");
  }
}

const rateState = globalThis as typeof globalThis & {
  __agenttrialRateLimits?: Map<string, { count: number; resetAt: number }>;
};
const rateLimits = (rateState.__agenttrialRateLimits ??= new Map());
export function consumeRateLimit(key: string, limit = 10, windowMs = 60_000, now = Date.now()) {
  const current = rateLimits.get(key);
  if (!current || current.resetAt <= now) {
    rateLimits.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }
  if (current.count >= limit) return { allowed: false, remaining: 0, resetAt: current.resetAt };
  current.count++;
  return { allowed: true, remaining: limit - current.count, resetAt: current.resetAt };
}
