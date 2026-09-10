import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildFixedUpstreamFaultProjectionEvidenceRecord,
  buildFixedUpstreamReconstructionReceipt,
  fixedUpstreamFaultEvidenceBytes,
  type FixedUpstreamFaultProjectionEvidenceArtifact,
} from "./fixed-upstream-projection-evidence";
import { gitBlobSha1 } from "./source-execution-derivation";
import type { AgentChaosCase } from "./target-adapter";
import type { AgentChaosTargetEntry, IndependentTargetEntry } from "./target-binding";

const targets = JSON.parse(
  readFileSync(new URL("../../../research/independent-targets.json", import.meta.url), "utf8"),
) as { entries: IndependentTargetEntry[] };
const target = targets.entries.find(
  (candidate) => candidate.targetId === "ext-001",
) as AgentChaosTargetEntry;

function recordFixture() {
  const sourceCase: AgentChaosCase = {
    schema: "agentic_fault_case/v1",
    case_uid: target.repositoryPath.slice("dataset/".length, -".json".length),
    agent: "fixture-agent",
    question: "Assess the fixed upstream trace.",
    trace: { spans: [{ name: "failed-step", output: null }] },
  };
  const sourceBytes = Buffer.from(JSON.stringify(sourceCase), "utf8");
  return buildFixedUpstreamFaultProjectionEvidenceRecord({
    target,
    sourceProvenance: {
      repository: "kevinzck8k/agentic-fault-diagnosis",
      revision: "0".repeat(40),
      unitKind: "upstream-fixed-execution",
      unitId: target.repositoryPath,
      blobShas: [gitBlobSha1(sourceBytes)],
    },
    sourceBytes,
    runnerMethodDigest: "5".repeat(64),
  });
}

describe("fixed upstream projection evidence reconstruction", () => {
  it("preserves a genuinely empty fixed-run output instead of inventing a sentinel", () => {
    const record = recordFixture();
    const execution = JSON.parse(record.sourceExecutionJson) as { finalOutput: string };
    const projection = JSON.parse(record.projectionJson) as { finalOutput: string };
    expect(execution.finalOutput).toBe("");
    expect(projection.finalOutput).toBe("");
    expect(record.sourceExecutionSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects substituted source bytes before producing an evidence record", () => {
    const sourceBytes = Buffer.from("{}", "utf8");
    expect(() =>
      buildFixedUpstreamFaultProjectionEvidenceRecord({
        target,
        sourceProvenance: {
          repository: "kevinzck8k/agentic-fault-diagnosis",
          revision: "0".repeat(40),
          unitKind: "upstream-fixed-execution",
          unitId: target.repositoryPath,
          blobShas: ["0".repeat(40)],
        },
        sourceBytes,
        runnerMethodDigest: "5".repeat(64),
      }),
    ).toThrow(/do not match the frozen Git blob/);
  });

  it("emits deterministic compressed bytes with an honest fault-only pair check", () => {
    const artifact: FixedUpstreamFaultProjectionEvidenceArtifact = {
      schemaVersion: "p26-002-readiness-evidence-0.1.0",
      status: "passed",
      checks: {
        artifactHashesRecomputed: true,
        labelBlind: true,
        projectionHashesRecomputed: true,
        sourceBound: true,
        targetControlPairBound: false,
      },
      faultProjections: [recordFixture()],
      controlProjections: [],
      controlSources: [],
      releaseBoundary: { rawSourcePayloadsRetained: false },
      submissionAllowed: false,
    };
    const first = fixedUpstreamFaultEvidenceBytes(artifact);
    const second = fixedUpstreamFaultEvidenceBytes(artifact);
    expect(first.equals(second)).toBe(true);
    expect(JSON.parse(gunzipSync(first).toString("utf8"))).toEqual(artifact);
    expect(() =>
      buildFixedUpstreamReconstructionReceipt({
        artifact,
        artifactSha256: "a".repeat(64),
        artifactByteLength: first.byteLength,
        runnerMethodDigest: "5".repeat(64),
      }),
    ).toThrow(/invalid candidate evidence/);
  });

  it("pins a local-only receipt that cannot satisfy readiness", () => {
    const receipt = JSON.parse(
      readFileSync(
        new URL(
          "../../../research/targets/fixed-upstream-reconstruction-receipt.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as {
      status: string;
      readinessEligible: boolean;
      canonicalManifestUpdated: boolean;
      readinessEligibleFaultProjections: number;
      localVerification: {
        sourceBoundFaultCandidates: number;
        artifactTamperingSourcesNotApplied: number;
        candidateTargetIds: string[];
      };
      localArtifact: { gitVersioned: boolean; published: boolean; sha256: string };
      mainTrialAllowed: boolean;
      submissionAllowed: boolean;
    };
    expect(receipt).toMatchObject({
      status: "local-verification-only",
      readinessEligible: false,
      canonicalManifestUpdated: false,
      readinessEligibleFaultProjections: 0,
      localVerification: {
        sourceBoundFaultCandidates: 50,
        artifactTamperingSourcesNotApplied: 10,
      },
      localArtifact: { gitVersioned: false, published: false },
      mainTrialAllowed: false,
      submissionAllowed: false,
    });
    expect(receipt.localVerification.candidateTargetIds).toHaveLength(50);
    expect(receipt.localArtifact.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
