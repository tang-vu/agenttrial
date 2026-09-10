import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildBlankOraclePacket,
  validateOraclePacket,
  type OracleAdjudicationPacket,
} from "./oracle-adjudication";

const execution = {
  targetId: "ext-061",
  condition: "fault" as const,
  executionReference: `p26-002-execution:${"a".repeat(64)}`,
  sourceLockSha256: "b".repeat(64),
  oracleCriteriaSha256: "c".repeat(64),
};

describe("P26-002 blinded oracle adjudication", () => {
  it("builds an empty fail-closed template until execution evidence exists", () => {
    const committed = JSON.parse(
      readFileSync(
        new URL("../../../research/governance/oracle-adjudication-template.json", import.meta.url),
        "utf8",
      ),
    ) as OracleAdjudicationPacket;
    expect(committed).toEqual(buildBlankOraclePacket([]));
    expect(validateOraclePacket(committed)).toEqual({ rows: 0, resolved: 0, pending: 0 });
    expect(committed.status).toBe("awaiting-execution-evidence");
    expect(committed.submissionAllowed).toBe(false);
  });

  it("requires two independent complete reviews and a third adjudicator on disagreement", () => {
    const packet = buildBlankOraclePacket([execution]);
    packet.rows[0]!.reviewerA = {
      decision: "unreliable",
      reviewer: "reviewer-a",
      rationale: "Locked criterion one failed.",
    };
    packet.rows[0]!.reviewerB = {
      decision: "reliable",
      reviewer: "reviewer-b",
      rationale: "The trace meets my reading of the criterion.",
    };
    expect(validateOraclePacket(packet)).toEqual({ rows: 1, resolved: 0, pending: 1 });
    packet.rows[0]!.adjudication = {
      decision: "indeterminate",
      adjudicator: "reviewer-c",
      rationale: "The frozen criterion does not resolve the conflicting trace evidence.",
    };
    packet.status = "resolved";
    expect(validateOraclePacket(packet)).toEqual({ rows: 1, resolved: 1, pending: 0 });
  });

  it("rejects evaluator leakage, aliased reviewers, and premature adjudication", () => {
    const leaked = buildBlankOraclePacket([execution]) as OracleAdjudicationPacket & {
      evaluatorVerdict?: string;
    };
    leaked.evaluatorVerdict = "reject";
    expect(() => validateOraclePacket(leaked)).toThrow(/packet envelope is invalid/);

    const aliased = buildBlankOraclePacket([execution]);
    aliased.rows[0]!.reviewerA = {
      decision: "unreliable",
      reviewer: "Reviewer One",
      rationale: "Criterion failed.",
    };
    aliased.rows[0]!.reviewerB = {
      decision: "unreliable",
      reviewer: " reviewer one ",
      rationale: "Criterion failed independently.",
    };
    expect(() => validateOraclePacket(aliased)).toThrow(/two independent reviewers/);

    const premature = buildBlankOraclePacket([execution]);
    premature.rows[0]!.adjudication = {
      decision: "unreliable",
      adjudicator: "reviewer-c",
      rationale: "Cannot adjudicate yet.",
    };
    expect(() => validateOraclePacket(premature)).toThrow(/before both reviews/);
  });
});
