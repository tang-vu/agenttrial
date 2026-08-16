import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("deployment trust boundaries", () => {
  it("keeps signing authority out of the network execution worker", async () => {
    const compose = await readFile("docker-compose.yml", "utf8");
    const worker = compose.match(/\n {2}worker:[\s\S]*?\n {2}signer:/)?.[0] ?? "";
    const signer = compose.match(/\n {2}signer:[\s\S]*?\n\nvolumes:/)?.[0] ?? "";
    expect(worker).toContain('AGENTTRIAL_EXECUTION_ONLY: "true"');
    expect(worker).not.toContain("AGENTTRIAL_SIGNING_SEED");
    expect(signer).toContain("AGENTTRIAL_SIGNING_SEED");
    expect(signer).toContain("networks: [backend]");
  });
});
