import { describe, expect, it } from "vitest";
import { BudgetGuard, consumeRateLimit, isPublicIp, redact, validateTargetUrl } from "./index";
describe("SSRF policy", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "172.16.1.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
  ])("blocks %s", (ip) => expect(isPublicIp(ip)).toBe(false));
  it.each(["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"])("allows %s", (ip) =>
    expect(isPublicIp(ip)).toBe(true),
  );
  it("rejects unsafe schemes, credentials, and local names", async () => {
    await expect(validateTargetUrl("file:///etc/passwd")).rejects.toThrow(/HTTP/);
    await expect(validateTargetUrl("https://user:pass@example.com")).rejects.toThrow(/Credentials/);
    await expect(validateTargetUrl("http://localhost:3000")).rejects.toThrow(/Local/);
  });
});
describe("budgets and redaction", () => {
  it("stops over-budget calls", () => {
    const guard = new BudgetGuard({ maxCalls: 1, maxBytes: 10, maxDurationMs: 1000 });
    guard.consume(2);
    expect(() => guard.consume(2)).toThrow(/budget/);
  });
  it("redacts nested credentials", () =>
    expect(
      redact({ headers: { authorization: "Bearer abc" }, token: "secret", safe: "ok" }),
    ).toEqual({ headers: { authorization: "[REDACTED]" }, token: "[REDACTED]", safe: "ok" }));
  it("rate limits repeated anonymous work", () => {
    const key = `test-${Math.random()}`;
    expect(consumeRateLimit(key, 1, 1000, 1).allowed).toBe(true);
    expect(consumeRateLimit(key, 1, 1000, 2).allowed).toBe(false);
    expect(consumeRateLimit(key, 1, 1000, 1002).allowed).toBe(true);
  });
});
