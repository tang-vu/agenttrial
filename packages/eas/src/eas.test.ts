import { describe, expect, it } from "vitest";
import { BASE_SEPOLIA, EAS_SCHEMA, encodeAttestation } from "./index";
describe("EAS encoding", () => {
  it("uses official Base Sepolia predeploys", () => {
    expect(BASE_SEPOLIA.chainId).toBe(84532);
    expect(BASE_SEPOLIA.easContract).toBe("0x4200000000000000000000000000000000000021");
  });
  it("encodes the schema deterministically", () => {
    const input = {
      targetIdentifier: "fixture:test",
      trialRoot: `0x${"11".repeat(32)}` as `0x${string}`,
      methodologyVersion: "1",
      scoreBasisPoints: 8000,
      coverageBasisPoints: 10000,
      evidenceRoot: `0x${"22".repeat(32)}` as `0x${string}`,
      reportURI: "ipfs://report",
      evaluatedAt: 1n,
    };
    expect(EAS_SCHEMA).toContain("evidenceRoot");
    expect(encodeAttestation(input)).toBe(encodeAttestation(input));
    expect(encodeAttestation(input)).toMatch(/^0x/);
  });
});
