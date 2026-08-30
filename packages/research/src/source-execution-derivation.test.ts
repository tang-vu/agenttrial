import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  assertSourceExecutionDerivationSupported,
  createGithubPinnedSourceBlobReader,
  gitBlobSha1,
  verifyGateObservedSourceExecutionDerivation,
  type ClaimedSourceExecution,
  type LockedSourceProvenance,
} from "./source-execution-derivation";
import { projectAgentChaosCase, type AgentChaosCase } from "./target-adapter";
import type {
  AgentChaosTargetEntry,
  BfclTargetEntry,
  IndependentTargetEntry,
} from "./target-binding";

const targets = JSON.parse(
  readFileSync(new URL("../../../research/independent-targets.json", import.meta.url), "utf8"),
) as { entries: IndependentTargetEntry[] };
const agentChaosTarget = targets.entries.find(
  (entry) => entry.targetId === "ext-001",
) as AgentChaosTargetEntry & { faultType: string };
const controlledTarget = targets.entries.find(
  (entry) => entry.targetId === "ext-061",
) as BfclTargetEntry;

function fixedFixture(condition: "fault" | "control" = "fault") {
  const path =
    condition === "fault" ? agentChaosTarget.repositoryPath : agentChaosTarget.controlPath;
  const caseUid = path.slice(path.indexOf("/") + 1, -".json".length);
  const sourceCase: AgentChaosCase = {
    schema: "agentic_fault_case/v1",
    case_uid: caseUid,
    agent: "fixture-agent",
    question: "Assess this public pinned execution.",
    trace: {
      trace_id: "trace-01",
      spans: [{ name: "answer", output: "Observed final output" }],
    },
  };
  const bytes = Buffer.from(JSON.stringify(sourceCase), "utf8");
  const sourceProvenance: LockedSourceProvenance = {
    repository: "kevinzck8k/agentic-fault-diagnosis",
    revision: "04a8a46d32be12dea1f020b7eed8c7e84e5f30ed",
    unitKind: "upstream-fixed-execution",
    unitId: path,
    blobShas: [gitBlobSha1(bytes)],
  };
  const projection = projectAgentChaosCase(
    {
      targetId: agentChaosTarget.targetId,
      family: agentChaosTarget.family,
      source: agentChaosTarget.source,
      caseUid,
      faultType: agentChaosTarget.faultType,
    },
    sourceCase,
  );
  const executionProvenance = {
    kind: "fixed-upstream" as const,
    runnerMethodDigest: "5".repeat(64),
    fixedRunIdentity: `${sourceProvenance.repository}@${sourceProvenance.revision}:${sourceProvenance.unitId}@${sourceProvenance.blobShas[0]}`,
    runId: null,
    seed: null,
  };
  const execution: ClaimedSourceExecution = {
    targetId: agentChaosTarget.targetId,
    source: agentChaosTarget.source,
    condition,
    task: projection.task,
    finalOutput: projection.finalOutput,
    rawTrace: projection.rawTrace,
    sourceProvenance,
    executionProvenance,
  };
  return { bytes, execution, projection };
}

describe("gate-observed source execution derivation", () => {
  it("verifies Git blob bytes and independently derives the fixed upstream projection", async () => {
    const fixture = fixedFixture();
    const result = await verifyGateObservedSourceExecutionDerivation({
      target: agentChaosTarget,
      execution: fixture.execution,
      readPinnedBlob: async () => fixture.bytes,
    });
    expect(result).toEqual({
      targetId: agentChaosTarget.targetId,
      source: "agentchaosbench",
      condition: "fault",
      gitBlobSha: fixture.execution.sourceProvenance.blobShas[0],
      projectionHash: fixture.projection.projectionHash,
    });
  });

  it("derives an AgentChaosBench control from the pinned control path, not the fault UID", async () => {
    const fixture = fixedFixture("control");
    await expect(
      verifyGateObservedSourceExecutionDerivation({
        target: agentChaosTarget,
        execution: fixture.execution,
        readPinnedBlob: async () => fixture.bytes,
      }),
    ).resolves.toMatchObject({ condition: "control" });
  });

  it("rejects both substituted source bytes and a self-consistent forged output", async () => {
    const fixture = fixedFixture();
    await expect(
      verifyGateObservedSourceExecutionDerivation({
        target: agentChaosTarget,
        execution: fixture.execution,
        readPinnedBlob: async () => Buffer.from("{}", "utf8"),
      }),
    ).rejects.toThrow(/Git blob SHA mismatch/);

    await expect(
      verifyGateObservedSourceExecutionDerivation({
        target: agentChaosTarget,
        execution: { ...fixture.execution, finalOutput: "Forged output" },
        readPinnedBlob: async () => fixture.bytes,
      }),
    ).rejects.toThrow(/do not match the deterministic adapter/);
  });

  it("fails closed for a controlled run before any source fetch", () => {
    const source: LockedSourceProvenance = {
      repository: "ShishirPatil/gorilla",
      revision: "6ea57973c7a6097fd7c5915698c54c17c5b1b6c8",
      unitKind: "benchmark-task",
      unitId: controlledTarget.faultId,
      blobShas: [controlledTarget.questionBlobSha, controlledTarget.answerBlobSha],
    };
    expect(() =>
      assertSourceExecutionDerivationSupported(controlledTarget.targetId, source, {
        kind: "controlled-run",
        runnerMethodDigest: "5".repeat(64),
        fixedRunIdentity: null,
        runId: "controlled-run-01",
        seed: 1,
      }),
    ).toThrow(/has no gate reexecution or precommitted trusted-runner attestation verifier/);
  });

  it("uses an immutable raw URL, rejects unsafe paths, and caches exact blob reads", async () => {
    const bytes = Buffer.from('{"ok":true}', "utf8");
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response(bytes, { status: 200 }),
    );
    const reader = createGithubPinnedSourceBlobReader(fetchMock as typeof fetch);
    const request = {
      repository: "kevinzck8k/agentic-fault-diagnosis",
      revision: "04a8a46d32be12dea1f020b7eed8c7e84e5f30ed",
      path: "dataset/example.json",
      expectedGitBlobSha: gitBlobSha1(bytes),
    };
    await reader(request);
    await reader(request);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://raw.githubusercontent.com/kevinzck8k/agentic-fault-diagnosis/04a8a46d32be12dea1f020b7eed8c7e84e5f30ed/dataset/example.json",
    );
    await expect(reader({ ...request, path: "../escape.json" })).rejects.toThrow(
      /unsafe pinned source path/,
    );
  });
});
