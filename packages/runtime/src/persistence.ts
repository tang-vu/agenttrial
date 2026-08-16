import postgres from "postgres";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { RuntimeRun } from "./index";
import type { AuthorizationRecord } from "@agenttrial/core";
import { appendEvent } from "@agenttrial/evidence";

let client: ReturnType<typeof postgres> | undefined;
let initialized: Promise<void> | undefined;
const localWrites = new Map<string, Promise<void>>();

export interface JobLease {
  id: string;
  workerId: string;
  token: string;
  leaseMs: number;
  attempt: number;
  initialRun?: RuntimeRun;
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
      await db`CREATE TABLE IF NOT EXISTS agenttrial_signing_jobs (
        id uuid PRIMARY KEY REFERENCES agenttrial_runs(id) ON DELETE CASCADE,
        status text NOT NULL DEFAULT 'queued',
        attempts integer NOT NULL DEFAULT 0,
        worker_id text,
        lease_token text,
        locked_until timestamptz,
        available_at timestamptz NOT NULL DEFAULT now(),
        finished_at timestamptz,
        last_error text
      )`;
      await db`CREATE INDEX IF NOT EXISTS agenttrial_signing_jobs_queue_idx
        ON agenttrial_signing_jobs(status, available_at)`;
      await db`CREATE TABLE IF NOT EXISTS agenttrial_signing_keys (
        key_id text PRIMARY KEY,
        public_key text NOT NULL,
        status text NOT NULL,
        registered_at timestamptz NOT NULL DEFAULT now()
      )`;
      await db`CREATE TABLE IF NOT EXISTS agenttrial_attestations (
        run_id uuid PRIMARY KEY REFERENCES agenttrial_runs(id) ON DELETE CASCADE,
        chain_id integer NOT NULL,
        eas_contract text NOT NULL,
        schema_uid text NOT NULL,
        status text NOT NULL,
        payload_hash text NOT NULL,
        report_uri text NOT NULL,
        uid text UNIQUE,
        transaction_hash text,
        attestor text,
        block_number bigint,
        attempts integer NOT NULL DEFAULT 1,
        last_error text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`;
      await db`CREATE TABLE IF NOT EXISTS agenttrial_authorizations (
        id uuid PRIMARY KEY,
        status text NOT NULL,
        token_hash text NOT NULL,
        expires_at timestamptz NOT NULL,
        snapshot jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`;
      await db`CREATE TABLE IF NOT EXISTS agenttrial_rate_limits (
        bucket_key text PRIMARY KEY,
        count integer NOT NULL,
        reset_at timestamptz NOT NULL
      )`;
      await db`CREATE INDEX IF NOT EXISTS agenttrial_authorizations_expiry_idx
        ON agenttrial_authorizations(status, expires_at)`;
    })();
  return initialized;
}

export async function saveRun(run: RuntimeRun, lease?: JobLease) {
  if (!persistenceConfigured()) return saveLocalSnapshot(run);
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
    return saveLocalSnapshot(run);
  }
  await db`INSERT INTO agenttrial_runs ${db({ id: run.id, state: run.state, revision, snapshot: db.json(run as never) })}
    ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, revision = EXCLUDED.revision,
      snapshot = EXCLUDED.snapshot, updated_at = now()
    WHERE agenttrial_runs.revision <= EXCLUDED.revision
      AND (agenttrial_runs.state <> 'CANCELLED' OR EXCLUDED.state = 'CANCELLED')`;
  await saveLocalSnapshot(run);
}

export async function loadRun(id: string): Promise<RuntimeRun | undefined> {
  if (!persistenceConfigured()) return loadLocalSnapshot(id);
  await initialize();
  const rows = await sql()`SELECT snapshot FROM agenttrial_runs WHERE id = ${id}::uuid LIMIT 1`;
  const run = (rows[0]?.snapshot as RuntimeRun | undefined) ?? (await loadLocalSnapshot(id));
  if (!run?.bundle) return run;
  const attachment = await loadAttestation(id);
  if (attachment) run.bundle.attestation = attachment;
  return run;
}

export async function enqueueRun(run: RuntimeRun) {
  await initialize();
  const db = sql();
  await db.begin(async (transaction) => {
    const tx = transaction as unknown as ReturnType<typeof sql>;
    const maxQueued = Math.min(
      1_000,
      Math.max(1, Number(process.env.AGENTTRIAL_MAX_QUEUED_RUNS ?? 100)),
    );
    const counts = await tx`SELECT count(*)::int AS count FROM agenttrial_jobs
      WHERE status IN ('queued','running')`;
    if (Number(counts[0]?.count ?? 0) >= maxQueued)
      throw new Error("Evaluator queue is at capacity; retry later.");
    await tx`INSERT INTO agenttrial_runs ${db({ id: run.id, state: run.state, revision: run.events.length, snapshot: db.json(run as never) })} ON CONFLICT (id) DO NOTHING`;
    await tx`INSERT INTO agenttrial_jobs ${db({ id: run.id, payload: db.json({ initialRun: run } as never) })} ON CONFLICT (id) DO NOTHING`;
  });
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
    WHERE id = (SELECT id FROM next_job) RETURNING id, attempts, payload`;
  const id = rows[0]?.id as string | undefined;
  const payload = rows[0]?.payload as { initialRun?: RuntimeRun } | undefined;
  return id
    ? {
        id,
        workerId,
        token,
        leaseMs,
        attempt: Number(rows[0]?.attempts ?? 1),
        ...(payload?.initialRun ? { initialRun: payload.initialRun } : {}),
      }
    : undefined;
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
      AND worker_id = ${lease.workerId} AND lease_token = ${lease.token}
      AND locked_until > now() RETURNING id`;
  return rows.length === 1;
}
export async function cancelQueuedJob(id: string) {
  if (!persistenceConfigured()) return;
  await initialize();
  await sql()`UPDATE agenttrial_jobs SET status = 'cancelled', finished_at = now(), locked_until = null,
    lease_token = null WHERE id = ${id}::uuid AND status IN ('queued', 'running')`;
}

export async function cancelRunDurably(id: string, cancelTokenHash: string) {
  if (!persistenceConfigured()) return undefined;
  await initialize();
  return sql().begin(async (transaction) => {
    const tx = transaction as unknown as ReturnType<typeof sql>;
    const rows = await tx`SELECT snapshot, state FROM agenttrial_runs
      WHERE id = ${id}::uuid FOR UPDATE`;
    const run = rows[0]?.snapshot as RuntimeRun | undefined;
    if (
      !run ||
      run.cancelTokenHash !== cancelTokenHash ||
      ["COMPLETED", "FAILED", "CANCELLED"].includes(String(rows[0]?.state))
    )
      return undefined;
    run.cancelled = true;
    run.state = "CANCELLED";
    appendEvent(run.events, {
      at: new Date().toISOString(),
      state: "CANCELLED",
      type: "run.cancelled",
      message: "Trial cancelled with the private cancellation capability",
    });
    await tx`UPDATE agenttrial_jobs SET status = 'cancelled', finished_at = now(),
      locked_until = null, lease_token = null WHERE id = ${id}::uuid
      AND status IN ('queued','running')`;
    await tx`UPDATE agenttrial_signing_jobs SET status = 'cancelled', finished_at = now(),
      locked_until = null, lease_token = null WHERE id = ${id}::uuid
      AND status IN ('queued','running')`;
    const db = sql();
    await tx`UPDATE agenttrial_runs SET state = 'CANCELLED', revision = ${run.events.length},
      snapshot = ${db.json(run as never)}, updated_at = now() WHERE id = ${id}::uuid`;
    return run;
  });
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
          signer: true,
          localSnapshots: false,
          message: "local snapshot directory unavailable",
        };
      }
    }
    return {
      configured: false,
      database: true,
      worker: true,
      signer: true,
      localSnapshots,
      message: localSnapshots
        ? "single-node runtime with durable snapshots"
        : "in-process demo mode",
    };
  }
  try {
    await initialize();
    await sql()`SELECT 1`;
    const workers = await sql()`SELECT count(*)::int AS count FROM agenttrial_workers
      WHERE worker_id LIKE 'agenttrial-worker-%' AND last_seen > now() - interval '30 seconds'`;
    const signers = await sql()`SELECT count(*)::int AS count FROM agenttrial_workers
      WHERE worker_id LIKE 'agenttrial-signer-%' AND last_seen > now() - interval '30 seconds'`;
    const worker = Number(workers[0]?.count ?? 0) > 0;
    const signer = Number(signers[0]?.count ?? 0) > 0;
    return {
      configured: true,
      database: true,
      worker,
      signer,
      localSnapshots: Boolean(snapshotDirectory()),
      message:
        worker && signer
          ? "database, worker, and signer ready"
          : !worker
            ? "no recent worker heartbeat"
            : "no recent signer heartbeat",
    };
  } catch {
    return {
      configured: true,
      database: false,
      worker: false,
      signer: false,
      localSnapshots: Boolean(snapshotDirectory()),
      message: "database unavailable",
    };
  }
}

export async function enqueueSigningJob(run: RuntimeRun) {
  await initialize();
  const db = sql();
  await db`UPDATE agenttrial_runs SET state = ${run.state}, revision = ${run.events.length},
    snapshot = ${db.json(run as never)}, updated_at = now() WHERE id = ${run.id}::uuid`;
  await db`INSERT INTO agenttrial_signing_jobs (id) VALUES (${run.id}::uuid)
    ON CONFLICT (id) DO NOTHING`;
}

export async function claimSigningJob(
  workerId: string,
  leaseMs = 30_000,
): Promise<JobLease | undefined> {
  await initialize();
  const token = randomUUID();
  const rows = await sql()`WITH next_job AS (
      SELECT id FROM agenttrial_signing_jobs
      WHERE ((status = 'queued' AND available_at <= now())
        OR (status = 'running' AND locked_until < now())) AND attempts < 3
      ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 1
    ) UPDATE agenttrial_signing_jobs SET status = 'running', worker_id = ${workerId},
      lease_token = ${token}, attempts = attempts + 1,
      locked_until = now() + (${leaseMs} * interval '1 millisecond')
    WHERE id = (SELECT id FROM next_job) RETURNING id, attempts`;
  const id = rows[0]?.id as string | undefined;
  return id ? { id, workerId, token, leaseMs, attempt: Number(rows[0]?.attempts ?? 1) } : undefined;
}

export async function saveSignedRun(run: RuntimeRun, lease: JobLease) {
  await initialize();
  const db = sql();
  const rows =
    await db`UPDATE agenttrial_runs SET state = ${run.state}, revision = ${run.events.length},
    snapshot = ${db.json(run as never)}, updated_at = now()
    WHERE id = ${run.id}::uuid AND EXISTS (
      SELECT 1 FROM agenttrial_signing_jobs WHERE id = ${run.id}::uuid
        AND status = 'running' AND worker_id = ${lease.workerId}
        AND lease_token = ${lease.token} AND locked_until > now()
    ) RETURNING id`;
  if (rows.length !== 1) throw new LeaseLostError();
}

export async function finishSigningJob(lease: JobLease, error?: string) {
  const rows =
    await sql()`UPDATE agenttrial_signing_jobs SET status = ${error ? "failed" : "completed"},
    finished_at = now(), locked_until = null, lease_token = null, last_error = ${error ?? null}
    WHERE id = ${lease.id}::uuid AND status = 'running' AND worker_id = ${lease.workerId}
      AND lease_token = ${lease.token} AND locked_until > now() RETURNING id`;
  return rows.length === 1;
}

export async function registerSigningPublicKey(publicKey: string) {
  await initialize();
  const keyId = `ed25519:${publicKey.slice(0, 16)}`;
  await sql()`UPDATE agenttrial_signing_keys SET status = 'previous' WHERE status = 'active' AND key_id <> ${keyId}`;
  await sql()`INSERT INTO agenttrial_signing_keys (key_id, public_key, status)
    VALUES (${keyId}, ${publicKey}, 'active') ON CONFLICT (key_id) DO UPDATE SET status = 'active'`;
}

export async function loadSigningPublicKeys() {
  if (!persistenceConfigured()) return [];
  await initialize();
  return (await sql()`SELECT key_id AS "keyId", public_key AS "publicKey", status,
    registered_at AS "registeredAt" FROM agenttrial_signing_keys ORDER BY registered_at DESC`) as Array<{
    keyId: string;
    publicKey: string;
    status: "active" | "previous" | "revoked";
    registeredAt: Date;
  }>;
}

export interface PersistedAttestation {
  status: "pending" | "submitted" | "anchored" | "failed";
  chainId: number;
  easContract: string;
  schemaUid: string;
  payloadHash: string;
  reportURI: string;
  uid?: string;
  transactionHash?: string;
  explorerUrl?: string;
  message: string;
}

function mapAttestation(row: Record<string, unknown>): PersistedAttestation {
  const uid = row.uid as string | undefined;
  const status = row.status as PersistedAttestation["status"];
  return {
    status,
    chainId: Number(row.chain_id),
    easContract: String(row.eas_contract),
    schemaUid: String(row.schema_uid),
    payloadHash: String(row.payload_hash),
    reportURI: String(row.report_uri),
    ...(uid
      ? { uid, explorerUrl: `https://base-sepolia.easscan.org/attestation/view/${uid}` }
      : {}),
    ...(row.transaction_hash ? { transactionHash: String(row.transaction_hash) } : {}),
    message:
      status === "anchored"
        ? "Receipt anchor confirmed on Base Sepolia."
        : status === "failed"
          ? String(row.last_error ?? "Attestation failed; local receipt remains valid.")
          : status === "submitted"
            ? "Attestation transaction submitted and awaiting confirmation."
            : "Attestation queued for Base Sepolia.",
  };
}

export async function loadAttestation(runId: string) {
  if (!persistenceConfigured()) return undefined;
  await initialize();
  const rows = await sql()`SELECT * FROM agenttrial_attestations WHERE run_id = ${runId}::uuid`;
  return rows[0] ? mapAttestation(rows[0] as Record<string, unknown>) : undefined;
}

export async function beginAttestation(input: {
  runId: string;
  chainId: number;
  easContract: string;
  schemaUid: string;
  payloadHash: string;
  reportURI: string;
}) {
  await initialize();
  const db = sql();
  const rows = await db`INSERT INTO agenttrial_attestations ${db({
    run_id: input.runId,
    chain_id: input.chainId,
    eas_contract: input.easContract,
    schema_uid: input.schemaUid,
    status: "pending",
    payload_hash: input.payloadHash,
    report_uri: input.reportURI,
  })} ON CONFLICT (run_id) DO UPDATE SET
    attempts = agenttrial_attestations.attempts + 1,
    updated_at = now(),
    status = CASE WHEN agenttrial_attestations.status IN ('anchored','submitted')
      THEN agenttrial_attestations.status ELSE 'pending' END
    WHERE agenttrial_attestations.payload_hash = EXCLUDED.payload_hash RETURNING *`;
  if (!rows[0])
    throw new Error("Attestation retry payload does not match the existing run binding.");
  return mapAttestation(rows[0] as Record<string, unknown>);
}

export async function recordAttestationSubmitted(runId: string, transactionHash: string) {
  const rows = await sql()`UPDATE agenttrial_attestations SET status = 'submitted',
    transaction_hash = ${transactionHash}, updated_at = now() WHERE run_id = ${runId}::uuid
    AND status <> 'anchored' RETURNING *`;
  return rows[0] ? mapAttestation(rows[0] as Record<string, unknown>) : undefined;
}

export async function confirmAttestation(input: {
  runId: string;
  uid: string;
  transactionHash: string;
  attestor: string;
  blockNumber: bigint;
}) {
  const rows =
    await sql()`UPDATE agenttrial_attestations SET status = 'anchored', uid = ${input.uid},
    transaction_hash = ${input.transactionHash}, attestor = ${input.attestor},
    block_number = ${input.blockNumber.toString()}, last_error = null, updated_at = now()
    WHERE run_id = ${input.runId}::uuid AND status IN ('pending','submitted') RETURNING *`;
  if (!rows[0]) throw new Error("Attestation could not be confirmed from its current state.");
  return mapAttestation(rows[0] as Record<string, unknown>);
}

export async function failAttestation(runId: string, error: string) {
  const rows = await sql()`UPDATE agenttrial_attestations SET status = 'failed',
    last_error = ${error.slice(0, 1000)}, updated_at = now() WHERE run_id = ${runId}::uuid
    AND status <> 'anchored' RETURNING *`;
  return rows[0] ? mapAttestation(rows[0] as Record<string, unknown>) : undefined;
}

export async function saveAuthorizationRecord(record: AuthorizationRecord) {
  if (!persistenceConfigured()) return;
  await initialize();
  const db = sql();
  await db`INSERT INTO agenttrial_authorizations ${db({
    id: record.id,
    status: record.status,
    token_hash: record.verificationTokenHash,
    expires_at: record.expiresAt,
    snapshot: db.json(record as never),
  })} ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status,
    expires_at = EXCLUDED.expires_at, snapshot = EXCLUDED.snapshot, updated_at = now()`;
}

export async function loadAuthorizationRecord(id: string) {
  if (!persistenceConfigured()) return undefined;
  await initialize();
  const rows = await sql()`SELECT snapshot FROM agenttrial_authorizations WHERE id = ${id}::uuid`;
  return rows[0]?.snapshot as AuthorizationRecord | undefined;
}

export async function transitionAuthorizationRecord(
  id: string,
  expectedStatus: AuthorizationRecord["status"],
  record: AuthorizationRecord,
) {
  if (!persistenceConfigured()) return true;
  await initialize();
  const db = sql();
  const rows = await db`UPDATE agenttrial_authorizations SET status = ${record.status},
    snapshot = ${db.json(record as never)}, updated_at = now()
    WHERE id = ${id}::uuid AND status = ${expectedStatus} AND expires_at > now()
    RETURNING id`;
  return rows.length === 1;
}

export async function consumeDistributedRateLimit(key: string, limit: number, windowMs: number) {
  if (!persistenceConfigured()) return undefined;
  await initialize();
  const boundedWindow = Math.min(24 * 60 * 60 * 1000, Math.max(1_000, windowMs));
  const rows = await sql()`INSERT INTO agenttrial_rate_limits (bucket_key, count, reset_at)
    VALUES (${key}, 1, now() + (${boundedWindow} * interval '1 millisecond'))
    ON CONFLICT (bucket_key) DO UPDATE SET
      count = CASE WHEN agenttrial_rate_limits.reset_at <= now() THEN 1
        ELSE agenttrial_rate_limits.count + 1 END,
      reset_at = CASE WHEN agenttrial_rate_limits.reset_at <= now()
        THEN now() + (${boundedWindow} * interval '1 millisecond')
        ELSE agenttrial_rate_limits.reset_at END
    RETURNING count, reset_at`;
  const count = Number(rows[0]?.count ?? limit + 1);
  const resetAt = new Date(rows[0]?.reset_at as string | Date).getTime();
  return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetAt };
}
