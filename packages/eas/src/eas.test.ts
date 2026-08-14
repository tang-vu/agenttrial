import { describe, expect, it } from "vitest";
import { BASE_SEPOLIA, EAS_SCHEMA, encodeAttestation, submitAttestation } from "./index";
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
  it("supports a mocked attestation transport without a wallet", async () => {
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
    let received = "";
    const result = await submitAttestation(
      {
        async attest(encoded) {
          received = encoded;
          return { uid: `0x${"33".repeat(32)}`, transactionHash: `0x${"44".repeat(32)}` };
        },
      },
      input,
    );
    expect(received).toMatch(/^0x/);
    expect(result.uid).toHaveLength(66);
    expect(result.explorerUrl).toContain("sepolia.basescan.org/tx/");
  });
});
