import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { safePublicFetch } from "./index";

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
});
