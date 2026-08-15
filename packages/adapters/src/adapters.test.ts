import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeDiscoveryUrl, safePublicFetch } from "./index";

describe("safe public adapter", () => {
  afterEach(() => delete process.env.AGENTTRIAL_ALLOW_PRIVATE_TEST_TARGETS);
  it("refuses loopback targets in normal operation", async () =>
    await expect(safePublicFetch("http://127.0.0.1:9")).rejects.toThrow(
      /private|reserved|non-routable/i,
    ));
  it("enforces response byte budgets on a controlled test server", async () => {
    process.env.AGENTTRIAL_ALLOW_PRIVATE_TEST_TARGETS = "true";
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("x".repeat(100));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    await expect(safePublicFetch(`http://127.0.0.1:${port}`, { maxBytes: 10 })).rejects.toThrow(
      /byte budget/i,
    );
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  it("enforces an absolute deadline against slow-drip responses", async () => {
    process.env.AGENTTRIAL_ALLOW_PRIVATE_TEST_TARGETS = "true";
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/plain" });
      const timer = setInterval(() => response.write("x"), 40);
      response.once("close", () => clearInterval(timer));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const started = Date.now();
    await expect(safePublicFetch(`http://127.0.0.1:${port}`, { timeoutMs: 220 })).rejects.toThrow(
      /deadline/i,
    );
    expect(Date.now() - started).toBeLessThan(1_000);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
describe("descriptor routing", () => {
  it("uses the bounded GitHub README API for repository roots", () => {
    expect(normalizeDiscoveryUrl("https://github.com/openai/openai-node")).toBe(
      "https://api.github.com/repos/openai/openai-node/readme",
    );
    expect(normalizeDiscoveryUrl("https://example.com/agent-card.json")).toBe(
      "https://example.com/agent-card.json",
    );
  });
});
