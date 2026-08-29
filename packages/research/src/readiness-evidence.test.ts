import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseEvidenceProjection, parseReadinessEvidenceArtifact } from "./audit-target-bindings";
import type { BfclTargetEntry } from "./target-binding";

const target: BfclTargetEntry = {
  targetId: "ext-061",
  family: "tool-parameter-error",
  source: "bfcl-v4",
  groundTruthAuthority: "upstream executable ground truth",
  faultId: "multi_turn_miss_param_0",
  controlId: "multi_turn_base_0",
  questionBlobSha: "1".repeat(40),
  answerBlobSha: "2".repeat(40),
  controlQuestionBlobSha: "3".repeat(40),
  controlAnswerBlobSha: "4".repeat(40),
};

function projectionFixture(
  rawTrace: Record<string, unknown> = {
    calls: [{ function: "lookup", arguments: {} }],
  },
) {
  const projectionJson = JSON.stringify({
    schemaVersion: "p26-002-evaluator-projection-0.1.0",
    targetId: "ext-061",
    source: "bfcl-v4",
    policy:
      "Check whether tool selection and arguments satisfy the user request and available tool contract. Reject missing or incorrect material parameters and unsupported calls.",
    task: "Call the requested function with complete parameters.",
    finalOutput: "Candidate output",
    rawTrace,
  });
  const sourceExecutionJson = JSON.stringify({
    schemaVersion: "p26-002-candidate-execution-0.1.0",
    targetId: "ext-061",
    source: "bfcl-v4",
    condition: "fault",
    sourceReference: "bfcl/multi_turn_miss_param_0/run-01",
    task: "Call the requested function with complete parameters.",
    finalOutput: "Candidate output",
    rawTrace,
  });
  return {
    targetId: "ext-061",
    projectionHash: createHash("sha256").update(projectionJson).digest("hex"),
    projectionJson,
    sourceExecutionReference: "bfcl/multi_turn_miss_param_0/run-01",
    sourceExecutionSha256: createHash("sha256").update(sourceExecutionJson).digest("hex"),
    sourceExecutionJson,
  };
}

function evidenceEnvelope(checks: Record<string, boolean>) {
  return Buffer.from(
    JSON.stringify({
      schemaVersion: "p26-002-readiness-evidence-0.1.0",
      status: "passed",
      checks,
      faultProjections: [],
      controlProjections: [],
      controlSources: [],
      releaseBoundary: { rawSourcePayloadsRetained: false },
      submissionAllowed: false,
    }),
  );
}

describe("structured readiness evidence", () => {
  it("recomputes a projection digest and binds its target source", () => {
    expect(parseEvidenceProjection(projectionFixture(), target, "a".repeat(64), "fault")).toEqual({
      targetId: "ext-061",
      projectionHash: projectionFixture().projectionHash,
      sourceExecutionReference: "bfcl/multi_turn_miss_param_0/run-01",
      sourceExecutionSha256: projectionFixture().sourceExecutionSha256,
      evidenceArtifactSha256: "a".repeat(64),
    });
  });

  it("rejects both forged projection hashes and forbidden label payloads", () => {
    expect(() =>
      parseEvidenceProjection(
        { ...projectionFixture(), projectionHash: "b".repeat(64) },
        target,
        "a".repeat(64),
        "fault",
      ),
    ).toThrow(/adapter hash/);
    expect(() =>
      parseEvidenceProjection(
        projectionFixture({ ground_truth: "reject" }),
        target,
        "a".repeat(64),
        "fault",
      ),
    ).toThrow(/payload is invalid/);
    expect(() =>
      parseEvidenceProjection(
        projectionFixture({ leakedFamily: "tool-parameter-error" }),
        target,
        "a".repeat(64),
        "fault",
      ),
    ).toThrow(/payload is invalid/);
  });

  it("rejects an empty object masquerading as a candidate execution", () => {
    const invalid = projectionFixture();
    invalid.sourceExecutionJson = "{}";
    invalid.sourceExecutionSha256 = createHash("sha256").update("{}").digest("hex");
    expect(() => parseEvidenceProjection(invalid, target, "a".repeat(64), "fault")).toThrow(
      /Source execution payload is invalid/,
    );
  });

  it("rejects a projection that does not derive from its bound execution", () => {
    const invalid = projectionFixture();
    const execution = JSON.parse(invalid.sourceExecutionJson) as Record<string, unknown>;
    execution.finalOutput = "A different candidate output";
    invalid.sourceExecutionJson = JSON.stringify(execution);
    invalid.sourceExecutionSha256 = createHash("sha256")
      .update(invalid.sourceExecutionJson)
      .digest("hex");
    expect(() => parseEvidenceProjection(invalid, target, "a".repeat(64), "fault")).toThrow(
      /Projection evidence payload is invalid/,
    );
  });

  it("requires the exact non-vacuous readiness checks", () => {
    const checks = {
      artifactHashesRecomputed: true,
      labelBlind: true,
      projectionHashesRecomputed: true,
      sourceBound: true,
      targetControlPairBound: true,
    };
    expect(parseReadinessEvidenceArtifact(evidenceEnvelope(checks), "evidence.json").status).toBe(
      "passed",
    );
    expect(() => parseReadinessEvidenceArtifact(evidenceEnvelope({}), "evidence.json")).toThrow(
      /envelope is invalid/,
    );
  });
});
