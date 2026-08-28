import { describe, expect, it } from "vitest";
import {
  createBlindedProjection,
  findForbiddenProjectionKeys,
  projectAgentChaosCase,
  redactGroundTruth,
  type AgentChaosCase,
  type JsonValue,
} from "./target-adapter";

describe("label-blinded target adapters", () => {
  const entry = {
    targetId: "ext-001",
    family: "unsupported-provenance",
    source: "agentchaosbench",
    caseUid: "SQLAssistant-H_A2A/corruption/case_01",
    faultType: "corruption",
    detectionSignal: "Corrupted tool output",
  };
  const sourceCase: AgentChaosCase = {
    schema: "agentic_fault_case/v1",
    case_uid: entry.caseUid,
    agent: "SQLAssistant-H_A2A",
    question: "Return the requested database record.",
    trace: {
      trace_id: null,
      spans: [
        { name: "get_database_schema", output: "tool returned corrupted payload" },
        { name: "final", output: "The record is 29-17-8." },
      ],
    },
  };

  it("removes structural labels while preserving observable trace evidence", () => {
    const projection = projectAgentChaosCase(entry, sourceCase);
    const serialized = JSON.stringify(projection);
    expect(projection.finalOutput).toBe("The record is 29-17-8.");
    expect(serialized).toContain("tool returned corrupted payload");
    expect(serialized).not.toContain(entry.caseUid);
    expect(serialized).not.toContain(entry.family);
    expect(serialized).not.toContain(entry.detectionSignal);
    expect(findForbiddenProjectionKeys(projection as unknown as JsonValue)).toEqual([]);
    expect(projection.projectionHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("recursively strips ground-truth and evaluator-result fields", () => {
    const redacted = redactGroundTruth({
      task: "x",
      nested: {
        groundTruth: "reject",
        fault_type: "corruption",
        evaluation_criteria: { reward_basis: ["DB"] },
        observation: "visible failure",
      },
    });
    expect(redacted).toEqual({ task: "x", nested: { observation: "visible failure" } });
  });

  it("rejects explicit locked values that survive normalization", () => {
    expect(() =>
      createBlindedProjection({
        entry,
        policy: "Reject unsupported source integrity.",
        task: "This task accidentally names corruption.",
        finalOutput: "done",
        rawTrace: [],
      }),
    ).toThrow(/Locked label value leaked/);
  });

  it("refuses a source case that does not match the pinned UID", () => {
    expect(() =>
      projectAgentChaosCase(entry, { ...sourceCase, case_uid: "different/case" }),
    ).toThrow(/does not match/);
  });
});
