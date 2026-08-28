import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

interface Matrix {
  schemaVersion: string;
  works: Array<{
    id: string;
    url: string;
    features: Record<string, string>;
  }>;
}

const matrix = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../research/nearest-work-matrix.json", import.meta.url)),
    "utf8",
  ),
) as Matrix;

describe("P26-002 nearest-work freeze", () => {
  it("tracks a unique primary-source set with the strongest collisions", () => {
    expect(matrix.schemaVersion).toBe("p26-002-nearest-work-0.1.0");
    expect(matrix.works.length).toBeGreaterThanOrEqual(10);
    expect(new Set(matrix.works.map((work) => work.id)).size).toBe(matrix.works.length);
    expect(new Set(matrix.works.map((work) => work.url)).size).toBe(matrix.works.length);
    expect(matrix.works.map((work) => work.id)).toEqual(
      expect.arrayContaining([
        "gao-zhou-2026-evidence-bounds",
        "tuan-2026-predeployment-assurance",
        "zhou-2026-dynamic-capabilities",
        "agentbound-2026",
        "lu-et-al-2025-agentrewardbench",
        "gao-zhou-2026-success-provenance",
        "zhang-et-al-2026-agentchaosbench",
      ]),
    );
  });

  it("uses only the locked feature-rating vocabulary", () => {
    const allowed = new Set(["yes", "partial", "no", "not-reported"]);
    for (const work of matrix.works) {
      expect(work.url).toMatch(/^https:\/\/arxiv\.org\/abs\/[0-9.]+$/);
      expect(Object.values(work.features).every((value) => allowed.has(value))).toBe(true);
    }
  });
});
