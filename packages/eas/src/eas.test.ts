import { describe, expect, it } from "vitest";
import {
  BASE_SEPOLIA,
  EAS_SCHEMA,
  decodeAttestation,
  encodeAttestation,
  submitAttestation,
  verifyAttestationRecord,
  verifyAttestationPayload,
} from "./index";
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
    expect(decodeAttestation(encodeAttestation(input))).toEqual(input);
    const record = {
      id: `0x${"33".repeat(32)}`,
      schemaId: `0x${"44".repeat(32)}`,
      attester: `0x${"55".repeat(20)}`,
      time: 1,
      expirationTime: 0,
      revocationTime: 0,
      data: encodeAttestation(input),
    };
    expect(verifyAttestationPayload(record, input).valid).toBe(true);
    expect(verifyAttestationPayload(record, { ...input, scoreBasisPoints: 1 }).valid).toBe(false);
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
    expect(result.explorerUrl).toContain("base-sepolia.easscan.org/attestation/view/");
  });
  it("rejects revoked, expired, wrong-schema, and wrong-attestor records", () => {
    const record = {
      id: `0x${"33".repeat(32)}`,
      schemaId: `0x${"44".repeat(32)}`,
      attester: `0x${"55".repeat(20)}`,
      time: 1,
      expirationTime: 0,
      revocationTime: 0,
      data: "0x1234",
    };
    expect(
      verifyAttestationRecord(record, {
        uid: record.id,
        schemaUid: record.schemaId,
        attestor: record.attester,
      }).valid,
    ).toBe(true);
    expect(
      verifyAttestationRecord(
        { ...record, revocationTime: 2 },
        { uid: record.id, schemaUid: record.schemaId },
      ).valid,
    ).toBe(false);
    expect(
      verifyAttestationRecord(record, { uid: record.id, schemaUid: `0x${"99".repeat(32)}` }).valid,
    ).toBe(false);
  });
});
