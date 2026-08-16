import { NextResponse } from "next/server";
import {
  ASSERTION_REGISTRY_MANIFEST,
  DIMENSION_POINTS,
  METHODOLOGY_VERSION,
} from "@agenttrial/core";
import { hashObject } from "@agenttrial/evidence";

export const dynamic = "force-dynamic";

export function GET() {
  const build = process.env.AGENTTRIAL_BUILD_COMMIT ?? process.env.GITHUB_SHA ?? "development";
  return NextResponse.json(
    {
      schemaVersion: "agenttrial.methodology-manifest.v1",
      methodologyVersion: METHODOLOGY_VERSION,
      evaluatorBuild: /^[0-9a-f]{7,64}$/i.test(build) ? build : "development",
      scoreAuthority: "deterministic-code-only",
      assertionRegistry: ASSERTION_REGISTRY_MANIFEST,
      assertionRegistryHash: hashObject(ASSERTION_REGISTRY_MANIFEST),
      dimensions: DIMENSION_POINTS,
      coverage: {
        formula: "tested known claim IDs / discovered claim IDs * 100",
        noClaims: 0,
        evidenceBackedMinimum: 85,
        partialMinimum: 50,
      },
      commitments: {
        canonicalization: "AgentTrial canonical JSON v1 (recursive lexical object-key ordering)",
        plan: "sealed before execution",
        seed: "committed before execution and revealed after completion",
        events: "SHA-256 hash chain with signed terminal head",
        receipt: "Ed25519 domain-separated signature",
      },
      schemas: {
        report: "https://agenttrial.tangvu.dev/openapi.json#/components/schemas/Report",
        evidenceBundle:
          "https://agenttrial.tangvu.dev/openapi.json#/components/schemas/EvidenceBundle",
      },
      disclaimer: "Technical evaluation evidence; not legal certification or a safety guarantee.",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
