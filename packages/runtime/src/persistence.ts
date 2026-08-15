import postgres from "postgres";
import type { RuntimeRun } from "./index";

let client: ReturnType<typeof postgres> | undefined;
let initialized: Promise<void> | undefined;

export function persistenceConfigured() {
  return Boolean(process.env.DATABASE_URL);
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
      await db`CREATE INDEX IF NOT EXISTS agenttrial_jobs_queue_idx ON agenttrial_jobs(status, available_at)`;
    })();
  return initialized;
}

export async function saveRun(run: RuntimeRun) {
  if (!persistenceConfigured()) return;
  await initialize();
  const db = sql();
  const revision = run.events.length;
  await db`INSERT INTO agenttrial_runs ${db({ id: run.id, state: run.state, revision, snapshot: db.json(run as never) })}
    ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, revision = EXCLUDED.revision,
      snapshot = EXCLUDED.snapshot, updated_at = now()
    WHERE agenttrial_runs.revision <= EXCLUDED.revision`;
}

export async function loadRun(id: string): Promise<RuntimeRun | undefined> {
  if (!persistenceConfigured()) return undefined;
  await initialize();
  const rows = await sql()`SELECT snapshot FROM agenttrial_runs WHERE id = ${id}::uuid LIMIT 1`;
  return rows[0]?.snapshot as RuntimeRun | undefined;
}

export async function enqueueRun(run: RuntimeRun) {
  await initialize();
  const db = sql();
  await db`INSERT INTO agenttrial_runs ${db({ id: run.id, state: run.state, revision: run.events.length, snapshot: db.json(run as never) })} ON CONFLICT (id) DO NOTHING`;
  await db`INSERT INTO agenttrial_jobs ${db({ id: run.id, payload: db.json({ id: run.id }) })} ON CONFLICT (id) DO NOTHING`;
}

export async function claimRun(workerId: string): Promise<string | undefined> {
  await initialize();
  const rows = await sql()`WITH next_job AS (
      SELECT id FROM agenttrial_jobs WHERE status = 'queued' AND available_at <= now()
      ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 1
    ) UPDATE agenttrial_jobs SET status = 'running', worker_id = ${workerId},
      attempts = attempts + 1, started_at = now()
    WHERE id = (SELECT id FROM next_job) RETURNING id`;
  return rows[0]?.id as string | undefined;
}

export async function finishRunJob(id: string, error?: string) {
  const status = error ? "failed" : "completed";
  await sql()`UPDATE agenttrial_jobs SET status = ${status}, finished_at = now(), last_error = ${error ?? null} WHERE id = ${id}::uuid`;
}
export async function cancelQueuedJob(id: string) {
  if (!persistenceConfigured()) return;
  await initialize();
  await sql()`UPDATE agenttrial_jobs SET status = 'cancelled', finished_at = now() WHERE id = ${id}::uuid AND status = 'queued'`;
}
