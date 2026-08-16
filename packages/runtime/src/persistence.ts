import postgres from "postgres";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { RuntimeRun } from "./index";

let client: ReturnType<typeof postgres> | undefined;
let initialized: Promise<void> | undefined;
const localWrites = new Map<string, Promise<void>>();

export interface JobLease {
  id: string;
  workerId: string;
  token: string;
  leaseMs: number;
}

export class LeaseLostError extends Error {
  constructor() {
    super("Worker lease is no longer current");
    this.name = "LeaseLostError";
  }
}

export function persistenceConfigured() {
  return Boolean(process.env.DATABASE_URL);
}
export function snapshotPersistenceConfigured() {
  return persistenceConfigured() || Boolean(process.env.AGENTTRIAL_DATA_DIR);
}
export async function closePersistence() {
  if (client) await client.end({ timeout: 5 });
  client = undefined;
  initialized = undefined;
}

function sql() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  return (client ??= postgres(process.env.DATABASE_URL, { max: 5, idle_timeout: 20 }));
}

function snapshotDirectory() {
  const configured = process.env.AGENTTRIAL_DATA_DIR;
  return configured ? resolve(configured, "runs") : undefined;
}

function snapshotPath(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
    throw new Error("Invalid run identifier");
  const directory = snapshotDirectory();
  return directory ? join(directory, `${id}.json`) : undefined;
}

async function saveLocalSnapshot(run: RuntimeRun) {
  const path = snapshotPath(run.id);
  const directory = snapshotDirectory();
  if (!path || !directory) return;
  const serialized = JSON.stringify(run);
  const previous = localWrites.get(run.id) ?? Promise.resolve();
  const write = previous
    .catch(() => undefined)
    .then(async () => {
      await mkdir(directory, { recursive: true });
      const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(temporary, serialized, { encoding: "utf8", mode: 0o600 });
      try {
        await replaceSnapshot(temporary, path);
      } finally {
        await unlink(temporary).catch(() => undefined);
      }
    });
  localWrites.set(run.id, write);
  try {
    await write;
  } finally {
    if (localWrites.get(run.id) === write) localWrites.delete(run.id);
  }
}

async function replaceSnapshot(temporary: string, destination: string) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(temporary, destination);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!(["EPERM", "EACCES"] as Array<string | undefined>).includes(code) || attempt >= 10)
        throw error;
      await delay(Math.min(250, 10 * 2 ** attempt));
    }
  }
}

async function loadLocalSnapshot(id: string): Promise<RuntimeRun | undefined> {
  const path = snapshotPath(id);
  if (!path) return undefined;
  try {
    return JSON.parse(await readFile(path, "utf8")) as RuntimeRun;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function cleanupExpiredLocalSnapshots(
  now = Date.now(),
  retentionDays = Number(process.env.AGENTTRIAL_RETENTION_DAYS ?? 30),
) {
  const directory = snapshotDirectory();
  if (!directory) return 0;
  const boundedDays = Math.min(365, Math.max(1, retentionDays));
  const cutoff = now - boundedDays * 24 * 60 * 60 * 1000;
  await mkdir(directory, { recursive: true });
  const entries = await readdir(directory);
  let removed = 0;
  for (const entry of entries) {
    const path = join(directory, entry);
    if (/^[0-9a-f-]{36}\.json\.\d+\.\d+\.tmp$/i.test(entry)) {
      if ((await stat(path)).mtimeMs < now - 5 * 60 * 1000) {
        await unlink(path);
        removed += 1;
      }
      continue;
    }
    if (!/^[0-9a-f-]{36}\.json$/i.test(entry)) continue;
    if ((await stat(path)).mtimeMs >= cutoff) continue;
    await unlink(path);
    removed += 1;
  }
  return removed;
}

async function initialize() {
  if (!initialized)
    initialized = (async () => {
      const db = sql();
      await db`CREATE TABLE IF NOT EXISTS agenttrial_runs (
        id uuid PRIMARY KEY,
        state text NOT NULL,
        revision integer NOT NULL,
        snapshot jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`;
      await db`CREATE TABLE IF NOT EXISTS agenttrial_jobs (
        id uuid PRIMARY KEY REFERENCES agenttrial_runs(id) ON DELETE CASCADE,
        payload jsonb NOT NULL,
        status text NOT NULL DEFAULT 'queued',
        attempts integer NOT NULL DEFAULT 0,
        worker_id text,
        available_at timestamptz NOT NULL DEFAULT now(),
        started_at timestamptz,
        finished_at timestamptz,
        last_error text
      )`;
      await db`ALTER TABLE agenttrial_jobs ADD COLUMN IF NOT EXISTS locked_until timestamptz`;
      await db`ALTER TABLE agenttrial_jobs ADD COLUMN IF NOT EXISTS lease_token text`;
      await db`CREATE INDEX IF NOT EXISTS agenttrial_jobs_queue_idx ON agenttrial_jobs(status, available_at)`;
      await db`CREATE TABLE IF NOT EXISTS agenttrial_workers (
        worker_id text PRIMARY KEY,
        last_seen timestamptz NOT NULL DEFAULT now()
      )`;
    })();
  return initialized;
}

export async function saveRun(run: RuntimeRun, lease?: JobLease) {
  await saveLocalSnapshot(run);
  if (!persistenceConfigured()) return;
  await initialize();
  const db = sql();
  const revision = run.events.length;
  if (lease) {
    const updated =
      await db`UPDATE agenttrial_runs SET state = ${run.state}, revision = ${revision},
        snapshot = ${db.json(run as never)}, updated_at = now()
      WHERE id = ${run.id}::uuid
        AND revision <= ${revision}
        AND EXISTS (
          SELECT 1 FROM agenttrial_jobs
          WHERE id = ${run.id}::uuid AND status = 'running'
            AND worker_id = ${lease.workerId} AND lease_token = ${lease.token}
            AND locked_until > now()
        ) RETURNING id`;
    if (updated.length === 0) throw new LeaseLostError();
    return;
  }
  await db`INSERT INTO agenttrial_runs ${db({ id: run.id, state: run.state, revision, snapshot: db.json(run as never) })}
    ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, revision = EXCLUDED.revision,
      snapshot = EXCLUDED.snapshot, updated_at = now()
    WHERE agenttrial_runs.revision <= EXCLUDED.revision
      AND (agenttrial_runs.state <> 'CANCELLED' OR EXCLUDED.state = 'CANCELLED')`;
}

export async function loadRun(id: string): Promise<RuntimeRun | undefined> {
  if (!persistenceConfigured()) return loadLocalSnapshot(id);
  await initialize();
  const rows = await sql()`SELECT snapshot FROM agenttrial_runs WHERE id = ${id}::uuid LIMIT 1`;
  return (rows[0]?.snapshot as RuntimeRun | undefined) ?? loadLocalSnapshot(id);
}

export async function enqueueRun(run: RuntimeRun) {
  await initialize();
  const db = sql();
  await db`INSERT INTO agenttrial_runs ${db({ id: run.id, state: run.state, revision: run.events.length, snapshot: db.json(run as never) })} ON CONFLICT (id) DO NOTHING`;
  await db`INSERT INTO agenttrial_jobs ${db({ id: run.id, payload: db.json({ id: run.id }) })} ON CONFLICT (id) DO NOTHING`;
}

async function failExhaustedJobs() {
  const message = "Evaluator job exhausted its retry budget after repeated worker lease loss";
  await sql()`WITH exhausted AS (
      UPDATE agenttrial_jobs SET status = 'failed', finished_at = now(), locked_until = null,
        lease_token = null, last_error = ${message}
      WHERE status = 'running' AND locked_until < now() AND attempts >= 3
      RETURNING id
    ) UPDATE agenttrial_runs AS runs SET state = 'FAILED', updated_at = now(),
      snapshot = jsonb_set(jsonb_set(runs.snapshot, '{state}', '"FAILED"'::jsonb),
        '{error}', to_jsonb(${message}::text))
    FROM exhausted WHERE runs.id = exhausted.id`;
}

export async function claimRun(workerId: string, leaseMs = 30_000): Promise<JobLease | undefined> {
  await initialize();
  await failExhaustedJobs();
  const token = randomUUID();
  const rows = await sql()`WITH next_job AS (
      SELECT id FROM agenttrial_jobs
      WHERE ((status = 'queued' AND available_at <= now())
        OR (status = 'running' AND locked_until < now()))
        AND attempts < 3
      ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 1
    ) UPDATE agenttrial_jobs SET status = 'running', worker_id = ${workerId},
      lease_token = ${token}, attempts = attempts + 1, started_at = COALESCE(started_at, now()),
      locked_until = now() + (${leaseMs} * interval '1 millisecond')
    WHERE id = (SELECT id FROM next_job) RETURNING id`;
  const id = rows[0]?.id as string | undefined;
  return id ? { id, workerId, token, leaseMs } : undefined;
}

export async function renewRunLease(lease: JobLease) {
  const rows = await sql()`UPDATE agenttrial_jobs
    SET locked_until = now() + (${lease.leaseMs} * interval '1 millisecond')
    WHERE id = ${lease.id}::uuid AND status = 'running'
      AND worker_id = ${lease.workerId} AND lease_token = ${lease.token}
      AND locked_until > now() RETURNING id`;
  return rows.length === 1;
}

export async function finishRunJob(lease: JobLease, error?: string) {
  const status = error ? "failed" : "completed";
  const rows = await sql()`UPDATE agenttrial_jobs SET status = ${status}, finished_at = now(),
    locked_until = null, lease_token = null, last_error = ${error ?? null}
    WHERE id = ${lease.id}::uuid AND status = 'running'
      AND worker_id = ${lease.workerId} AND lease_token = ${lease.token} RETURNING id`;
  return rows.length === 1;
}
export async function cancelQueuedJob(id: string) {
  if (!persistenceConfigured()) return;
  await initialize();
  await sql()`UPDATE agenttrial_jobs SET status = 'cancelled', finished_at = now(), locked_until = null,
    lease_token = null WHERE id = ${id}::uuid AND status IN ('queued', 'running')`;
}

export async function runCancellationRequested(id: string) {
  if (!persistenceConfigured()) return false;
  await initialize();
  const rows =
    await sql()`SELECT state, snapshot->>'cancelled' AS cancelled FROM agenttrial_runs WHERE id = ${id}::uuid LIMIT 1`;
  return rows[0]?.state === "CANCELLED" || rows[0]?.cancelled === "true";
}

export async function heartbeatWorker(workerId: string) {
  if (!persistenceConfigured()) return;
  await initialize();
  await sql()`INSERT INTO agenttrial_workers (worker_id, last_seen) VALUES (${workerId}, now())
    ON CONFLICT (worker_id) DO UPDATE SET last_seen = now()`;
}

export async function persistenceReadiness() {
  if (!persistenceConfigured()) {
    const localSnapshots = Boolean(snapshotDirectory());
    if (localSnapshots) {
      try {
        await cleanupExpiredLocalSnapshots();
      } catch {
        return {
          configured: false,
          database: false,
          worker: true,
          localSnapshots: false,
          message: "local snapshot directory unavailable",
        };
      }
    }
    return {
      configured: false,
      database: true,
      worker: true,
      localSnapshots,
      message: localSnapshots
        ? "single-node runtime with durable snapshots"
        : "in-process demo mode",
    };
  }
  try {
    await initialize();
    await sql()`SELECT 1`;
    const workers =
      await sql()`SELECT count(*)::int AS count FROM agenttrial_workers WHERE last_seen > now() - interval '30 seconds'`;
    const worker = Number(workers[0]?.count ?? 0) > 0;
    return {
      configured: true,
      database: true,
      worker,
      localSnapshots: Boolean(snapshotDirectory()),
      message: worker ? "database and worker ready" : "no recent worker heartbeat",
    };
  } catch {
    return {
      configured: true,
      database: false,
      worker: false,
      localSnapshots: Boolean(snapshotDirectory()),
      message: "database unavailable",
    };
  }
}
