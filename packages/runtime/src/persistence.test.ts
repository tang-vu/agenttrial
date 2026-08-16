import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RuntimeRun } from "./index";
import {
  cleanupExpiredLocalSnapshots,
  loadRun,
  persistenceReadiness,
  saveRun,
} from "./persistence";

const directories: string[] = [];

afterEach(async () => {
  delete process.env.AGENTTRIAL_DATA_DIR;
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("single-node snapshot persistence", () => {
  it("atomically restores a completed report after memory is gone", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agenttrial-snapshots-"));
    directories.push(directory);
    process.env.AGENTTRIAL_DATA_DIR = directory;
    const run = {
      id: "7b4378d7-241c-4cc0-a8ca-88c557ded1ee",
      state: "COMPLETED",
      events: [],
      cancelled: false,
      mode: "active-controlled",
      cancelTokenHash: "redacted",
      report: { runId: "7b4378d7-241c-4cc0-a8ca-88c557ded1ee" },
    } as unknown as RuntimeRun;

    await saveRun(run);
    const restored = await loadRun(run.id);

    expect(restored).toEqual(run);
    await expect(persistenceReadiness()).resolves.toMatchObject({
      database: true,
      worker: true,
      localSnapshots: true,
    });
  });

  it("rejects path-shaped run identifiers", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agenttrial-snapshots-"));
    directories.push(directory);
    process.env.AGENTTRIAL_DATA_DIR = directory;
    await expect(loadRun("../../secret")).rejects.toThrow("Invalid run identifier");
  });

  it("expires old local artifacts under the configured retention policy", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agenttrial-snapshots-"));
    directories.push(directory);
    process.env.AGENTTRIAL_DATA_DIR = directory;
    const run = {
      id: "8d72b7bd-f3ec-48a9-9719-4256596dab5f",
      state: "COMPLETED",
      events: [],
      cancelled: false,
      mode: "active-controlled",
      cancelTokenHash: "redacted",
    } as RuntimeRun;
    await saveRun(run);

    expect(await cleanupExpiredLocalSnapshots(Date.now() + 31 * 86_400_000, 30)).toBe(1);
    await expect(loadRun(run.id)).resolves.toBeUndefined();
  });
});
