import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FAULT_FAMILIES, INDEPENDENT_TARGET_FREEZE } from "./index";

interface TargetFreeze {
  activeNetworkTesting: boolean;
  entries: Array<{ family: string; targetId: string }>;
  selection: { byFamily: Record<string, number>; total: number };
  sources: Array<{ id: string; license: string; revision: string; selected: number }>;
  status: string;
}

const path = fileURLToPath(new URL("../../../research/independent-targets.json", import.meta.url));
const raw = readFileSync(path, "utf8");
const freeze = JSON.parse(raw) as TargetFreeze;

describe("independent target source lock", () => {
  it("pins the artifact hash and keeps all active network testing disabled", () => {
    expect(createHash("sha256").update(raw).digest("hex")).toBe(
      INDEPENDENT_TARGET_FREEZE.artifactSha256,
    );
    expect(freeze.activeNetworkTesting).toBe(false);
    expect(freeze.status).toBe("source-locked-adapter-pending");
  });

  it("selects exactly ten unique source units for every fault family", () => {
    expect(freeze.selection.total).toBe(80);
    expect(freeze.entries).toHaveLength(80);
    expect(new Set(freeze.entries.map((item) => item.targetId)).size).toBe(80);
    expect(new Set(freeze.entries.map((item) => item.family))).toEqual(new Set(FAULT_FAMILIES));
    expect(Object.values(freeze.selection.byFamily).every((count) => count === 10)).toBe(true);
  });

  it("uses only pinned public MIT or Apache sources", () => {
    expect(freeze.sources.map((source) => source.selected).reduce((a, b) => a + b, 0)).toBe(80);
    expect(freeze.sources.every((source) => /^(MIT|Apache-2\.0)$/.test(source.license))).toBe(true);
    expect(freeze.sources.every((source) => /^[0-9a-f]{40}$/.test(source.revision))).toBe(true);
  });
});
