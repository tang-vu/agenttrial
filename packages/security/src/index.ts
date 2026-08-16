import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

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

const blockedIps = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blockedIps.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const)
  blockedIps.addSubnet(network, prefix, "ipv6");

export function isPublicIp(address: string): boolean {
  address = address.replace(/^\[|\]$/g, "");
  if (address.startsWith("::ffff:")) return isPublicIp(address.slice(7));
  const version = isIP(address);
  if (version === 4) return !blockedIps.check(address, "ipv4");
  if (version === 6) return !blockedIps.check(address, "ipv6");
  return false;
}

export function normalizeTargetUrl(raw: string) {
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
  if (url.search)
    throw new UnsafeTargetError(
      "Query parameters are not accepted because public evaluation URLs must not contain secrets.",
    );
  if (url.hash)
    throw new UnsafeTargetError("URL fragments are not accepted for evaluation targets.");
  return url;
}

export async function validateTargetUrl(raw: string): Promise<{ url: URL; addresses: string[] }> {
  const url = normalizeTargetUrl(raw);
  const privateTestTarget = privateTestTargetsAllowed();
  const effectivePort = url.port || (url.protocol === "https:" ? "443" : "80");
  const hostname = url.hostname
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
    .toLowerCase();
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
    (!privateTestTarget && direct.some((item) => !isPublicIp(item.address)))
  )
    throw new UnsafeTargetError("Target resolves to a private, reserved, or non-routable address.");
  if (!privateTestTarget && !["80", "443"].includes(effectivePort))
    throw new UnsafeTargetError("Public targets are restricted to HTTP ports 80 and 443.");
  return { url, addresses: direct.map((x) => x.address) };
}

export function privateTestTargetsAllowed() {
  return (
    process.env.NODE_ENV === "test" && process.env.AGENTTRIAL_ALLOW_PRIVATE_TEST_TARGETS === "true"
  );
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
    return value
      .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "[REDACTED]")
      .replace(/(?:sk|ghp|github_pat)_[A-Za-z0-9_-]{12,}/g, "[REDACTED]")
      .replace(/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED]")
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED]")
      .replace(
        /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
        "[REDACTED]",
      )
      .replace(/([?&](?:token|key|secret|password|signature)=)[^&#\s]+/gi, "$1[REDACTED]");
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
