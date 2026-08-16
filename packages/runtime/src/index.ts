import { randomBytes, randomUUID } from "node:crypto";
import {
  discoverPublicTarget,
  parseA2AAgentCard,
  safeAuthorizedA2ASend,
  safePublicFetch,
  validateAuthorizedA2ASelection,
} from "@agenttrial/adapters";
import {
  TrialStateMachine,
  calculateScore,
  evaluateAssertions,
  METHODOLOGY_VERSION,
  type EvidenceItem,
  type Observation,
  type PipelineState,
  type RunEvent,
  type TrialReport,
  type TrialPlan,
  type AuthorizationRecord,
} from "@agenttrial/core";
import {
  appendEvent,
  createSigningKey,
  evidenceRoot,
  hashObject,
  hashText,
  signReceipt,
  type EvidenceBundle,
} from "@agenttrial/evidence";
import { attestationStatus } from "@agenttrial/eas";
import {
  discoverFixtureClaims,
  executeFixture,
  fixtures,
  generateFixturePlan,
  type FixtureId,
} from "@agenttrial/fixtures";
import { normalizeTargetUrl, redact } from "@agenttrial/security";
import {
  cancelQueuedJob,
  cancelRunDurably,
  claimRun,
  LeaseLostError,
  enqueueRun,
  enqueueSigningJob,
  finishRunJob,
  finishSigningJob,
  claimSigningJob,
  loadRun,
  persistenceConfigured,
  renewRunLease,
  registerSigningPublicKey,
  loadSigningPublicKeys,
  snapshotPersistenceConfigured,
  runCancellationRequested,
  saveRun,
  saveSignedRun,
} from "./persistence";
import type { JobLease } from "./persistence";
export {
  consumeAuthorization,
  issueAuthorizationChallenge,
  publicAuthorization,
  verifyAuthorizationChallenge,
} from "./authorizations";
export {
  cleanupExpiredDatabaseRecords,
  closePersistence,
  heartbeatWorker,
  persistenceReadiness,
} from "./persistence";
export { consumeDistributedRateLimit } from "./persistence";

export interface RuntimeRun {
  id: string;
  state: PipelineState;
  events: RunEvent[];
  report?: TrialReport;
  bundle?: EvidenceBundle;
  error?: string;
  cancelled: boolean;
  fixture?: FixtureId;
  targetUrl?: string;
  capabilityDescription?: string;
  authorization?: AuthorizationRecord;
  pendingFinalization?: {
    report: TrialReport;
    mode: "active-controlled" | "passive-external" | "active-external";
  };
  mode: "active-controlled" | "passive-external" | "active-external";
  cancelTokenHash: string;
}
export type EventListener = (event: RunEvent) => void;

const globalStore = globalThis as typeof globalThis & {
  __agenttrialRuns?: Map<string, RuntimeRun>;
  __agenttrialListeners?: Map<string, Set<EventListener>>;
  __agenttrialKey?: ReturnType<typeof createSigningKey>;
};
export const runs = (globalStore.__agenttrialRuns ??= new Map());
const listeners = (globalStore.__agenttrialListeners ??= new Map());
const cancellationCapabilities = new Map<string, string>();
const activeLeases = new Map<
  string,
  {
    lease: JobLease;
    lost: boolean;
    controller: AbortController;
    checkpoint: Promise<void>;
  }
>();
const MAX_IN_MEMORY_TERMINAL_RUNS = 200;
const signingSeedHex = process.env.AGENTTRIAL_SIGNING_SEED;
if (signingSeedHex && !/^[0-9a-fA-F]{64}$/.test(signingSeedHex))
  throw new Error(
    "AGENTTRIAL_SIGNING_SEED must be exactly 32 bytes encoded as 64 hexadecimal characters",
  );
function requireSigningKey() {
  if (process.env.AGENTTRIAL_EXECUTION_ONLY === "true")
    throw new Error("Execution workers cannot access receipt signing authority.");
  if (process.env.DATABASE_URL && !signingSeedHex)
    throw new Error("The dedicated signer requires AGENTTRIAL_SIGNING_SEED.");
  return (globalStore.__agenttrialKey ??= createSigningKey(
    signingSeedHex ? Uint8Array.from(Buffer.from(signingSeedHex, "hex")) : undefined,
  ));
}
export function getSigningPublicKey() {
  const configured = process.env.AGENTTRIAL_SIGNING_PUBLIC_KEY;
  if (configured) {
    if (!/^[0-9a-fA-F]{64}$/.test(configured))
      throw new Error("AGENTTRIAL_SIGNING_PUBLIC_KEY must be 32 bytes of hexadecimal data.");
    return configured.toLowerCase();
  }
  return Buffer.from(requireSigningKey().publicKey).toString("hex");
}
export async function getSigningKeyRegistry() {
  const persisted = await loadSigningPublicKeys();
  if (persisted.length)
    return persisted.map((key) => ({ ...key, registeredAt: key.registeredAt.toISOString() }));
  if (persistenceConfigured() && !signingSeedHex && !process.env.AGENTTRIAL_SIGNING_PUBLIC_KEY)
    return [];
  const publicKey = getSigningPublicKey();
  return [
    {
      keyId: `ed25519:${publicKey.slice(0, 16)}`,
      publicKey,
      status: "active" as const,
      registeredAt: new Date().toISOString(),
    },
  ];
}

export function subscribe(runId: string, listener: EventListener) {
  const set = listeners.get(runId) ?? new Set();
  set.add(listener);
  listeners.set(runId, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(runId);
  };
}
function emit(
  run: RuntimeRun,
  state: PipelineState,
  type: string,
  message: string,
  detail?: Record<string, unknown>,
) {
  run.state = state;
  const event = appendEvent(run.events, {
    at: new Date().toISOString(),
    state,
    type,
    message,
    ...(detail ? { detail } : {}),
  });
  listeners.get(run.id)?.forEach((fn) => fn(event));
  const leaseState = activeLeases.get(run.id);
  if (leaseState) {
    const snapshot = structuredClone(run);
    leaseState.checkpoint = leaseState.checkpoint
      .then(async () => {
        if (leaseState.lost) return;
        await saveRun(snapshot, leaseState.lease);
      })
      .catch((error) => {
        leaseState.lost = true;
        leaseState.controller.abort(error instanceof LeaseLostError ? error : new LeaseLostError());
      });
  } else {
    void saveRun(structuredClone(run)).catch(() => undefined);
  }
  return event;
}
const pause = (ms = 90) => new Promise((resolve) => setTimeout(resolve, ms));
async function ensureActive(run: RuntimeRun) {
  if (activeLeases.get(run.id)?.lost) throw new LeaseLostError();
  if (run.cancelled || (await runCancellationRequested(run.id))) throw new Error("CANCELLED");
}
async function persistExecutionRun(run: RuntimeRun) {
  const leaseState = activeLeases.get(run.id);
  if (leaseState) await leaseState.checkpoint;
  if (leaseState?.lost) throw new LeaseLostError();
  await saveRun(run, leaseState?.lease);
}
async function queueSigningIfSeparated(
  run: RuntimeRun,
  report: TrialReport,
  mode: RuntimeRun["mode"],
) {
  if (!(persistenceConfigured() && process.env.AGENTTRIAL_EXECUTION_ONLY === "true")) return false;
  run.pendingFinalization = { report, mode };
  run.state = "SCORING";
  await enqueueSigningJob(run);
  return true;
}

export function createFixtureRun(fixture: FixtureId): RuntimeRun {
  pruneTerminalRuns();
  if (!fixtures[fixture]) throw new Error("Unknown fixture");
  const cancelToken = randomBytes(32).toString("hex");
  const run: RuntimeRun = {
    id: randomUUID(),
    state: "CREATED",
    events: [],
    cancelled: false,
    fixture,
    mode: "active-controlled",
    cancelTokenHash: hashText(cancelToken),
  };
  cancellationCapabilities.set(run.id, cancelToken);
  runs.set(run.id, run);
  emit(run, "CREATED", "run.created", "Trial workspace created", {
    target: fixtures[fixture].name,
    mode: "active",
    authorization: "controlled fixture",
  });
  if (persistenceConfigured()) void enqueueRun(run).catch((error) => failQueuedRun(run, error));
  else void executeRun(run);
  return run;
}
export function createExternalRun(targetUrl: string, capabilityDescription?: string): RuntimeRun {
  pruneTerminalRuns();
  const normalizedTargetUrl = normalizeTargetUrl(targetUrl).toString();
  const cancelToken = randomBytes(32).toString("hex");
  const run: RuntimeRun = {
    id: randomUUID(),
    state: "CREATED",
    events: [],
    cancelled: false,
    targetUrl: normalizedTargetUrl,
    ...(capabilityDescription ? { capabilityDescription } : {}),
    mode: "passive-external",
    cancelTokenHash: hashText(cancelToken),
  };
  cancellationCapabilities.set(run.id, cancelToken);
  runs.set(run.id, run);
  emit(run, "CREATED", "run.created", "Passive evaluation workspace created", {
    target: normalizedTargetUrl,
    mode: "passive",
    authorization: "public metadata discovery only",
  });
  if (persistenceConfigured()) void enqueueRun(run).catch((error) => failQueuedRun(run, error));
  else void executeExternalRun(run);
  return run;
}
export function createAuthorizedA2ARun(authorization: AuthorizationRecord): RuntimeRun {
  pruneTerminalRuns();
  if (authorization.status !== "consumed") throw new Error("Authorization must be consumed.");
  const cancelToken = randomBytes(32).toString("hex");
  const run: RuntimeRun = {
    id: randomUUID(),
    state: "CREATED",
    events: [],
    cancelled: false,
    targetUrl: authorization.cardUrl,
    authorization,
    mode: "active-external",
    cancelTokenHash: hashText(cancelToken),
  };
  cancellationCapabilities.set(run.id, cancelToken);
  runs.set(run.id, run);
  emit(run, "CREATED", "run.created", "Authorized A2A evaluation workspace created", {
    target: authorization.origin,
    mode: "active",
    authorizationId: authorization.id,
    scopeHash: authorization.scopeHash,
  });
  if (persistenceConfigured()) void enqueueRun(run).catch((error) => failQueuedRun(run, error));
  else void executeAuthorizedExternalRun(run);
  return run;
}
function pruneTerminalRuns() {
  const terminal = [...runs.values()]
    .filter((run) => ["COMPLETED", "FAILED", "CANCELLED"].includes(run.state))
    .sort((a, b) => (a.events.at(-1)?.at ?? "").localeCompare(b.events.at(-1)?.at ?? ""));
  for (const run of terminal.slice(0, Math.max(0, terminal.length - MAX_IN_MEMORY_TERMINAL_RUNS)))
    runs.delete(run.id);
}
function failQueuedRun(run: RuntimeRun, error: unknown) {
  run.error = error instanceof Error ? error.message : "Could not enqueue run";
  emit(run, "FAILED", "run.failed", "Durable queue submission failed", { error: run.error });
}
export async function getRun(id: string) {
  return snapshotPersistenceConfigured() ? ((await loadRun(id)) ?? runs.get(id)) : runs.get(id);
}
export async function processNextRun(workerId = `worker-${process.pid}`) {
  if (!persistenceConfigured()) return false;
  const lease = await claimRun(workerId);
  if (!lease) return false;
  let run = await loadRun(lease.id);
  if (!run) {
    await finishRunJob(lease, "Run snapshot missing");
    return true;
  }
  if (lease.attempt > 1 && lease.initialRun) {
    run = structuredClone(lease.initialRun);
  }
  runs.set(lease.id, run);
  const leaseState = {
    lease,
    lost: false,
    controller: new AbortController(),
    checkpoint: Promise.resolve(),
  };
  activeLeases.set(lease.id, leaseState);
  if (lease.attempt > 1)
    emit(run, "CREATED", "worker.recovered", "Worker restarted the trial from its sealed input", {
      attempt: lease.attempt,
      discardedPartialAttempt: lease.attempt - 1,
    });
  let renewalPromise: Promise<void> | undefined;
  const renewal = setInterval(
    () => {
      if (renewalPromise || leaseState.lost) return;
      renewalPromise = renewRunLease(lease)
        .then((renewed) => {
          if (!renewed) {
            leaseState.lost = true;
            leaseState.controller.abort(new LeaseLostError());
          }
        })
        .catch(() => {
          leaseState.lost = true;
          leaseState.controller.abort(new LeaseLostError());
        })
        .finally(() => {
          renewalPromise = undefined;
        });
    },
    Math.max(250, Math.floor(lease.leaseMs / 3)),
  );
  try {
    if (run.mode === "passive-external") await executeExternalRun(run);
    else if (run.mode === "active-external") await executeAuthorizedExternalRun(run);
    else await executeRun(run);
    clearInterval(renewal);
    if (renewalPromise) await renewalPromise;
    await leaseState.checkpoint;
    if (leaseState.lost) throw new LeaseLostError();
    await saveRun(run, lease);
    if (!(await finishRunJob(lease, run.state === "FAILED" ? run.error : undefined)))
      throw new LeaseLostError();
  } catch (error) {
    await finishRunJob(lease, error instanceof Error ? error.message : "Worker failure");
  } finally {
    clearInterval(renewal);
    leaseState.controller.abort();
    activeLeases.delete(lease.id);
  }
  return true;
}
export function cancelRun(id: string) {
  const run = runs.get(id);
  if (!run || ["COMPLETED", "FAILED", "CANCELLED"].includes(run.state)) return false;
  run.cancelled = true;
  return true;
}
export function takeCancellationCapability(id: string) {
  const token = cancellationCapabilities.get(id);
  cancellationCapabilities.delete(id);
  return token;
}
export async function cancelRunAuthorized(id: string, token: string) {
  if (persistenceConfigured()) {
    const cancelled = await cancelRunDurably(id, hashText(token));
    if (!cancelled) return false;
    runs.set(id, cancelled);
    const event = cancelled.events.at(-1);
    if (event) listeners.get(id)?.forEach((listener) => listener(event));
    return true;
  }
  const run = await getRun(id);
  if (
    !run ||
    hashText(token) !== run.cancelTokenHash ||
    ["COMPLETED", "FAILED", "CANCELLED"].includes(run.state)
  )
    return false;
  run.cancelled = true;
  run.state = "CANCELLED";
  emit(
    run,
    "CANCELLED",
    "run.cancelled",
    "Trial cancelled with the private cancellation capability",
  );
  runs.set(id, run);
  await cancelQueuedJob(id);
  await saveRun(run);
  return true;
}

async function executeRun(run: RuntimeRun) {
  const machine = new TrialStateMachine();
  const startedAt = new Date().toISOString();
  try {
    await pause();
    await ensureActive(run);
    machine.transition("DISCOVERING");
    emit(
      run,
      machine.state,
      "discovery.started",
      "Inspecting Agent Card and advertised constraints",
    );
    const claims = discoverFixtureClaims(run.fixture!);
    await pause();
    await ensureActive(run);
    machine.transition("CLAIMS_EXTRACTED");
    emit(run, machine.state, "claims.normalized", `${claims.length} typed claims extracted`, {
      claims: claims.map((c) => c.capability),
      untrustedContent: "isolated",
    });
    machine.transition("PLANNING");
    emit(run, machine.state, "planner.started", "Constructing claim-specific hidden trials", {
      provider: "deterministic fixture planner",
      methodology: METHODOLOGY_VERSION,
    });
    const seed = randomBytes(16).toString("hex");
    const plan = generateFixturePlan(hashObject({ seed, runId: run.id }));
    await pause();
    await ensureActive(run);
    machine.transition("PLAN_SEALED");
    const planHash = hashObject(plan);
    emit(
      run,
      machine.state,
      "plan.sealed",
      "Trial plan and seed commitment sealed before execution",
      { planHash, trials: plan.trials.length },
    );
    machine.transition("EXECUTING");
    emit(
      run,
      machine.state,
      "execution.started",
      `Executing ${plan.trials.length} authorized scenarios`,
    );
    const observations: Observation[] = [];
    const evidence: EvidenceItem[] = [];
    for (const trial of plan.trials) {
      await ensureActive(run);
      emit(run, machine.state, "tool.call", `${trial.category}: ${String(trial.input.scenario)}`, {
        trialId: trial.id,
        maxCalls: trial.maxCalls,
        timeoutMs: trial.timeoutMs,
      });
      const observation = await executeFixture(run.fixture!, trial);
      if (observation.retryCount > 0)
        emit(
          run,
          machine.state,
          "tool.retry",
          "Transient source timeout observed; bounded retry executed",
          { trialId: trial.id, attempts: observation.calls, retries: observation.retryCount },
        );
      observations.push(observation);
      evidence.push({
        id: observation.evidenceIds[0]!,
        kind: "fixture-observation",
        trialId: trial.id,
        capturedAt: observation.completedAt,
        data: redact({
          input: trial.input,
          output: observation.output,
          latencyMs: observation.latencyMs,
          calls: observation.calls,
        }) as Record<string, unknown>,
        redactions: [],
      });
      emit(run, machine.state, "evidence.captured", `Observation captured for ${trial.id}`, {
        trialId: trial.id,
        latencyMs: observation.latencyMs,
        calls: observation.calls,
      });
    }
    await ensureActive(run);
    machine.transition("VERIFYING");
    emit(run, machine.state, "verification.started", "Running versioned deterministic assertions");
    const assertions = plan.trials.flatMap((trial) =>
      evaluateAssertions(trial.assertions, observations.find((o) => o.trialId === trial.id)!),
    );
    for (const result of assertions)
      emit(
        run,
        machine.state,
        result.passed ? "assertion.passed" : "assertion.failed",
        result.description,
        { assertionId: result.id, trialId: result.trialId, dimension: result.dimension },
      );
    machine.transition("SCORING");
    const tested = new Set(plan.trials.flatMap((t) => t.claimIds));
    const score = calculateScore(assertions, claims, tested);
    emit(run, machine.state, "score.calculated", `Deterministic score: ${score.overall}/100`, {
      dimensions: score.dimensions,
      coverage: score.coverage,
      methodology: score.methodologyVersion,
    });
    const report: TrialReport = {
      runId: run.id,
      target: fixtures[run.fixture!],
      state: "COMPLETED",
      claims,
      plan,
      planHash,
      observations,
      assertions,
      evidence,
      score,
      startedAt,
      completedAt: new Date().toISOString(),
    };
    if (await queueSigningIfSeparated(run, report, "active-controlled")) return;
    machine.transition("RECEIPT_SIGNED");
    emit(run, machine.state, "receipt.signed", "Evidence root committed with an Ed25519 receipt", {
      algorithm: "Ed25519",
    });
    const root = evidenceRoot(evidence);
    machine.transition("ATTESTING");
    const attestation = attestationStatus();
    emit(run, machine.state, "attestation.status", attestation.message, {
      status: attestation.status,
      network: "Base Sepolia",
    });
    machine.transition("COMPLETED");
    emit(
      run,
      machine.state,
      "run.completed",
      "Trial complete; report and evidence bundle are ready",
      { score: score.overall, coverage: score.coverage },
    );
    const publicKey = getSigningPublicKey();
    const receipt = signReceipt(
      {
        receiptVersion: "1.0.0",
        methodologyVersion: METHODOLOGY_VERSION,
        runId: run.id,
        targetId: report.target.id,
        mode: "active-controlled",
        planHash,
        seedCommitment: plan.seedCommitment,
        evidenceRoot: root,
        evidenceItemHashes: evidence.map(hashObject),
        reportHash: hashObject(report),
        eventChainHead: run.events.at(-1)!.hash,
        scoreBasisPoints: Math.round(score.overall * 100),
        coverageBasisPoints: Math.round(score.coverage * 100),
        issuedAt: new Date().toISOString(),
        keyId: `ed25519:${publicKey.slice(0, 16)}`,
      },
      requireSigningKey().secretKey,
      requireSigningKey().publicKey,
    );
    run.report = report;
    run.bundle = {
      schemaVersion: "1.0.0",
      report,
      events: run.events,
      evidenceRoot: root,
      receipt,
      attestation,
    };
    run.state = "COMPLETED";
    await persistExecutionRun(run);
  } catch (error) {
    if ((error as Error).message === "CANCELLED") {
      run.state = "CANCELLED";
      emit(
        run,
        "CANCELLED",
        "run.cancelled",
        "Trial cancelled; incomplete observations were discarded and no receipt was issued",
      );
    } else {
      run.state = "FAILED";
      run.error = error instanceof Error ? error.message : "Unknown failure";
      emit(run, "FAILED", "run.failed", "Trial stopped because the evaluator failed", {
        error: run.error,
      });
    }
    await persistExecutionRun(run);
  }
}

async function executeExternalRun(run: RuntimeRun) {
  const machine = new TrialStateMachine();
  const startedAt = new Date().toISOString();
  try {
    machine.transition("DISCOVERING");
    emit(
      run,
      machine.state,
      "discovery.started",
      "Fetching bounded public metadata through a DNS-pinned connection",
    );
    await ensureActive(run);
    const discovery = await discoverPublicTarget(run.targetUrl!, {
      ...(activeLeases.get(run.id)?.controller.signal
        ? { signal: activeLeases.get(run.id)!.controller.signal }
        : {}),
    });
    let claims = discovery.claims;
    if (run.capabilityDescription)
      claims = [
        ...claims,
        {
          id: "claim_user_1",
          capability: run.capabilityDescription.slice(0, 240),
          advertisedInput: "User-described input",
          advertisedOutput: "User-described capability outcome",
          dependencies: [],
          requiredPermissions: [],
          successCondition: run.capabilityDescription.slice(0, 500),
          evidenceSource: "user-provided capability description",
          confidence: 0.4,
          discoveryLocation: "trial submission",
        },
      ].slice(0, 20);
    machine.transition("CLAIMS_EXTRACTED");
    emit(
      run,
      machine.state,
      "claims.normalized",
      `${claims.length} typed claims extracted from untrusted content`,
      { descriptorKind: discovery.descriptorKind, untrustedContent: "isolated" },
    );
    machine.transition("PLANNING");
    emit(run, machine.state, "planner.started", "Constructing passive, non-invasive checks", {
      provider: "deterministic passive planner",
      methodology: METHODOLOGY_VERSION,
    });
    const seed = randomBytes(16).toString("hex");
    const seedCommitment = hashObject({ seed, runId: run.id });
    const plan: TrialPlan = {
      version: METHODOLOGY_VERSION,
      seedCommitment,
      trials: [
        {
          id: "trial_public_surface",
          claimIds: [],
          category: "Passive availability and provenance",
          input: { url: discovery.response.url, method: "GET", contentLimitBytes: 1_000_000 },
          expectedBehavior:
            "The public surface responds within strict transport and resource budgets without active interaction.",
          assertions: [
            {
              id: "assert_http_success",
              type: "equals",
              field: "reachable",
              expected: true,
              dimension: "evidence",
              weight: 1,
              description: "Public agent surface returned a successful HTTP response",
            },
            {
              id: "assert_provenance",
              type: "equals",
              field: "provenanceCaptured",
              expected: true,
              dimension: "evidence",
              weight: 1,
              description: "Discovery evidence retains its public source URL",
            },
            {
              id: "assert_https",
              type: "equals",
              field: "secureTransport",
              expected: true,
              dimension: "evidence",
              weight: 1,
              description: "Public surface uses HTTPS transport",
            },
            {
              id: "assert_calls",
              type: "lte",
              field: "$calls",
              expected: 2,
              dimension: "efficiency",
              weight: 1,
              description: "Discovery and passive verification stayed within their request budget",
            },
            {
              id: "assert_latency",
              type: "lte",
              field: "$latency",
              expected: 6000,
              dimension: "efficiency",
              weight: 1,
              description: "Public response completed within the latency budget",
            },
          ],
          timeoutMs: 6_000,
          maxCalls: 2,
          severity: "medium",
          seed: seedCommitment.slice(0, 16),
          mode: "passive",
          authorizationRequired: false,
        },
      ],
    };
    machine.transition("PLAN_SEALED");
    const planHash = hashObject(plan);
    emit(
      run,
      machine.state,
      "plan.sealed",
      "Passive trial plan and seed commitment sealed before verification fetch",
      { planHash, trials: 1 },
    );
    machine.transition("EXECUTING");
    emit(
      run,
      machine.state,
      "tool.call",
      "Performing one DNS-pinned GET with redirect, byte, and timeout budgets",
      { evaluationCalls: 2, thisStepCalls: 1, timeoutMs: 6_000 },
    );
    await ensureActive(run);
    const response = await safePublicFetch(discovery.response.url, {
      timeoutMs: 6_000,
      maxBytes: 1_000_000,
      maxRedirects: 3,
      ...(activeLeases.get(run.id)?.controller.signal
        ? { signal: activeLeases.get(run.id)!.controller.signal }
        : {}),
    });
    const completedAt = new Date().toISOString();
    const observation: Observation = {
      trialId: "trial_public_surface",
      startedAt,
      completedAt,
      latencyMs: response.latencyMs,
      calls: 2,
      status: response.status >= 200 && response.status < 400 ? "completed" : "capability_failed",
      output: {
        reachable: response.status >= 200 && response.status < 400,
        provenanceCaptured: true,
        secureTransport: response.url.startsWith("https:"),
        status: response.status,
        descriptorKind: discovery.descriptorKind,
      },
      evidenceIds: ["ev_discovery", "ev_passive_verification"],
      retryCount: 0,
    };
    const evidence: EvidenceItem[] = [
      discovery.evidence,
      {
        id: "ev_passive_verification",
        kind: "passive-http-verification",
        trialId: "trial_public_surface",
        capturedAt: completedAt,
        data: redact({
          url: response.url,
          status: response.status,
          headers: response.headers,
          bytes: response.bytes,
          latencyMs: response.latencyMs,
          redirects: response.redirects,
          remoteAddress: response.remoteAddress,
        }) as Record<string, unknown>,
        redactions: [],
      },
    ];
    emit(run, machine.state, "evidence.captured", "Bounded passive response evidence captured", {
      status: response.status,
      bytes: response.bytes,
      latencyMs: response.latencyMs,
    });
    machine.transition("VERIFYING");
    const assertions = evaluateAssertions(plan.trials[0]!.assertions, observation);
    for (const result of assertions)
      emit(
        run,
        machine.state,
        result.passed ? "assertion.passed" : "assertion.failed",
        result.description,
        { assertionId: result.id, dimension: result.dimension },
      );
    machine.transition("SCORING");
    const score = calculateScore(assertions, claims, new Set());
    emit(
      run,
      machine.state,
      "score.calculated",
      `Deterministic passive surface score: ${score.overall}/100; capabilities remain untested`,
      { coverage: score.coverage, untestedClaims: score.untestedClaims.length },
    );
    const report: TrialReport = {
      runId: run.id,
      target: discovery.target,
      state: "COMPLETED",
      claims,
      plan,
      planHash,
      observations: [observation],
      assertions,
      evidence,
      score,
      startedAt,
      completedAt,
    };
    if (await queueSigningIfSeparated(run, report, "passive-external")) return;
    machine.transition("RECEIPT_SIGNED");
    emit(
      run,
      machine.state,
      "receipt.signed",
      "Preparing a receipt over the completed passive record",
      { algorithm: "Ed25519" },
    );
    machine.transition("ATTESTING");
    const attestation = attestationStatus();
    emit(run, machine.state, "attestation.status", attestation.message, {
      status: attestation.status,
      network: "Base Sepolia",
    });
    machine.transition("COMPLETED");
    emit(
      run,
      machine.state,
      "run.completed",
      "Passive evaluation complete; advertised behavior remains explicitly untested",
      { score: score.overall, coverage: score.coverage },
    );
    const root = evidenceRoot(evidence);
    const publicKey = getSigningPublicKey();
    const receipt = signReceipt(
      {
        receiptVersion: "1.0.0",
        methodologyVersion: METHODOLOGY_VERSION,
        runId: run.id,
        targetId: report.target.id,
        mode: "passive-external",
        planHash,
        seedCommitment,
        evidenceRoot: root,
        evidenceItemHashes: evidence.map(hashObject),
        reportHash: hashObject(report),
        eventChainHead: run.events.at(-1)!.hash,
        scoreBasisPoints: Math.round(score.overall * 100),
        coverageBasisPoints: Math.round(score.coverage * 100),
        issuedAt: new Date().toISOString(),
        keyId: `ed25519:${publicKey.slice(0, 16)}`,
      },
      requireSigningKey().secretKey,
      requireSigningKey().publicKey,
    );
    run.report = report;
    run.bundle = {
      schemaVersion: "1.0.0",
      report,
      events: run.events,
      evidenceRoot: root,
      receipt,
      attestation,
    };
    run.state = "COMPLETED";
    await persistExecutionRun(run);
  } catch (error) {
    if ((error as Error).message === "CANCELLED") {
      run.state = "CANCELLED";
      emit(run, "CANCELLED", "run.cancelled", "Passive trial cancelled");
    } else {
      run.state = "FAILED";
      run.error = error instanceof Error ? error.message : "Unknown external evaluation failure";
      emit(
        run,
        "FAILED",
        "run.failed",
        "Public target request failed; no capability verdict was inferred",
        { error: run.error, failureClass: "request_failed" },
      );
    }
    await persistExecutionRun(run);
  }
}

async function executeAuthorizedExternalRun(run: RuntimeRun) {
  const machine = new TrialStateMachine();
  const startedAt = new Date().toISOString();
  const authorization = run.authorization;
  if (!authorization || authorization.status !== "consumed")
    throw new Error("A consumed authorization is required for active execution.");
  try {
    machine.transition("DISCOVERING");
    emit(
      run,
      machine.state,
      "discovery.started",
      "Revalidating the authorized Agent Card before active execution",
      { authorizationId: authorization.id, scopeHash: authorization.scopeHash },
    );
    await ensureActive(run);
    const cardResponse = await safePublicFetch(authorization.cardUrl, {
      timeoutMs: 5_000,
      maxBytes: 64 * 1024,
      maxRedirects: 0,
      ...(activeLeases.get(run.id)?.controller.signal
        ? { signal: activeLeases.get(run.id)!.controller.signal }
        : {}),
    });
    if (hashText(cardResponse.body) !== authorization.cardHash)
      throw new Error("Agent Card changed after authorization; active execution was blocked.");
    const card = parseA2AAgentCard(cardResponse.body);
    const selected = validateAuthorizedA2ASelection(
      card,
      authorization.interfaceUrl,
      authorization.skillId,
    );
    const claims = [
      {
        id: `claim_a2a_${authorization.skillId}`,
        capability: selected.skill.name.slice(0, 240),
        advertisedInput: "A2A text/plain message",
        advertisedOutput: selected.skill.description.slice(0, 500),
        dependencies: ["A2A HTTP+JSON 1.0"],
        requiredPermissions: ["HTTPS domain-control authorization"],
        successCondition: `Response contains the authorized expected marker: ${authorization.expectedSubstring}`,
        evidenceSource: authorization.cardUrl,
        confidence: 0.98,
        discoveryLocation: `skills[id=${authorization.skillId}]`,
      },
    ];
    machine.transition("CLAIMS_EXTRACTED");
    emit(run, machine.state, "claims.normalized", "One authorized A2A skill claim selected", {
      skillId: authorization.skillId,
    });
    machine.transition("PLANNING");
    emit(run, machine.state, "planner.started", "Constructing a bounded A2A SendMessage trial", {
      provider: "deterministic A2A planner",
      maxMessages: authorization.grant.maxMessages,
    });
    const seed = randomBytes(16).toString("hex");
    const seedCommitment = hashObject({ seed, runId: run.id, scopeHash: authorization.scopeHash });
    const trialId = "trial_authorized_a2a_send";
    const plan: TrialPlan = {
      version: METHODOLOGY_VERSION,
      seedCommitment,
      trials: [
        {
          id: trialId,
          claimIds: [claims[0]!.id],
          category: "Authorized A2A functionality and structured output",
          input: {
            protocol: "A2A HTTP+JSON 1.0",
            skillId: authorization.skillId,
            messageHash: hashText(authorization.testMessage),
            authorizationId: authorization.id,
            scopeHash: authorization.scopeHash,
          },
          expectedBehavior:
            "The authorized skill returns a conforming text response containing the builder-declared marker on two independent executions.",
          assertions: [
            {
              id: "assert_a2a_expected_marker",
              type: "contains",
              field: "responseText",
              expected: authorization.expectedSubstring,
              dimension: "capability",
              weight: 3,
              description: "Authorized A2A output contains the expected capability marker",
            },
            {
              id: "assert_a2a_protocol",
              type: "equals",
              field: "protocolValid",
              expected: true,
              dimension: "evidence",
              weight: 2,
              description: "Response conforms to the bounded A2A HTTP+JSON profile",
            },
            {
              id: "assert_a2a_repeatable",
              type: "repeatable",
              field: "repeatable",
              expected: true,
              dimension: "reliability",
              weight: 2,
              description: "Independent authorized executions return the same normalized text",
            },
            {
              id: "assert_a2a_budget",
              type: "lte",
              field: "$calls",
              expected: authorization.grant.maxMessages,
              dimension: "efficiency",
              weight: 1,
              description: "Active A2A execution stayed within the authorized message budget",
            },
            {
              id: "assert_a2a_latency",
              type: "lte",
              field: "$latency",
              expected: authorization.grant.timeoutMs * authorization.grant.maxMessages,
              dimension: "efficiency",
              weight: 1,
              description: "Authorized messages completed within the sealed wall-clock budget",
            },
          ],
          timeoutMs: authorization.grant.timeoutMs * authorization.grant.maxMessages,
          maxCalls: authorization.grant.maxMessages,
          severity: "high",
          seed: seedCommitment.slice(0, 16),
          mode: "active",
          authorizationRequired: true,
        },
      ],
    };
    machine.transition("PLAN_SEALED");
    const planHash = hashObject(plan);
    emit(run, machine.state, "plan.sealed", "Authorized A2A plan sealed before execution", {
      planHash,
      authorizationId: authorization.id,
    });
    machine.transition("EXECUTING");
    const results = [];
    for (let index = 0; index < authorization.grant.maxMessages; index += 1) {
      await ensureActive(run);
      emit(run, machine.state, "tool.call", "Sending one authorized A2A message", {
        trialId,
        call: index + 1,
        maxCalls: authorization.grant.maxMessages,
      });
      results.push(
        await safeAuthorizedA2ASend(authorization.interfaceUrl, authorization.testMessage, run.id, {
          timeoutMs: authorization.grant.timeoutMs,
          maxRequestBytes: authorization.grant.maxRequestBytes,
          maxResponseBytes: authorization.grant.maxResponseBytes,
          ...(authorization.tenant ? { tenant: authorization.tenant } : {}),
          ...(activeLeases.get(run.id)?.controller.signal
            ? { signal: activeLeases.get(run.id)!.controller.signal }
            : {}),
        }),
      );
    }
    const completedAt = new Date().toISOString();
    const normalizedTexts = results.map((result) => result.text.trim().replace(/\s+/g, " "));
    const evidence: EvidenceItem[] = results.map((result, index) => ({
      id: `ev_a2a_${index + 1}`,
      kind: "authorized-a2a-response",
      trialId,
      capturedAt: completedAt,
      data: redact({
        authorizationId: authorization.id,
        scopeHash: authorization.scopeHash,
        ...(authorization.verificationEvidence?.proofHash
          ? { proofHash: authorization.verificationEvidence.proofHash }
          : {}),
        url: result.response.url,
        status: result.response.status,
        latencyMs: result.response.latencyMs,
        bytes: result.response.bytes,
        protocolValid: result.protocolValid,
        ...(result.taskState ? { taskState: result.taskState } : {}),
        responseText: result.text,
      }) as Record<string, unknown>,
      redactions: [],
    }));
    const observation: Observation = {
      trialId,
      startedAt,
      completedAt,
      latencyMs: results.reduce((sum, result) => sum + result.response.latencyMs, 0),
      calls: results.length,
      status: results.some((result) => result.capabilityFailed) ? "capability_failed" : "completed",
      output: {
        responseText: results[0]?.text ?? "",
        protocolValid: results.every((result) => result.protocolValid),
        repeatable:
          normalizedTexts.length === authorization.grant.maxMessages &&
          new Set(normalizedTexts).size === 1,
      },
      evidenceIds: evidence.map((item) => item.id),
      retryCount: 0,
    };
    emit(run, machine.state, "evidence.captured", "Authorized A2A responses captured", {
      calls: observation.calls,
      evidenceIds: observation.evidenceIds,
    });
    machine.transition("VERIFYING");
    const assertions = evaluateAssertions(plan.trials[0]!.assertions, observation);
    for (const result of assertions)
      emit(
        run,
        machine.state,
        result.passed ? "assertion.passed" : "assertion.failed",
        result.description,
        { assertionId: result.id, evidenceIds: result.evidenceIds },
      );
    machine.transition("SCORING");
    const score = calculateScore(assertions, claims, new Set([claims[0]!.id]));
    emit(
      run,
      machine.state,
      "score.calculated",
      `Authorized capability score: ${score.overall}/100`,
      {
        coverage: score.coverage,
      },
    );
    const report: TrialReport = {
      runId: run.id,
      target: {
        id: `a2a:${authorization.origin}:${authorization.skillId}`,
        name: card.name,
        type: "a2a",
        locator: authorization.cardUrl,
        controlled: false,
      },
      state: "COMPLETED",
      claims,
      plan,
      planHash,
      observations: [observation],
      assertions,
      evidence,
      score,
      startedAt,
      completedAt,
    };
    if (await queueSigningIfSeparated(run, report, "active-external")) return;
    machine.transition("RECEIPT_SIGNED");
    emit(run, machine.state, "receipt.signed", "Preparing receipt for authorized A2A evidence", {
      algorithm: "Ed25519",
    });
    machine.transition("ATTESTING");
    const attestation = attestationStatus();
    emit(run, machine.state, "attestation.status", attestation.message, {
      status: attestation.status,
      network: "Base Sepolia",
    });
    machine.transition("COMPLETED");
    emit(run, machine.state, "run.completed", "Authorized A2A evaluation complete", {
      score: score.overall,
      coverage: score.coverage,
    });
    const root = evidenceRoot(evidence);
    const publicKey = getSigningPublicKey();
    const receipt = signReceipt(
      {
        receiptVersion: "1.0.0",
        methodologyVersion: METHODOLOGY_VERSION,
        runId: run.id,
        targetId: report.target.id,
        mode: "active-external",
        planHash,
        seedCommitment,
        evidenceRoot: root,
        evidenceItemHashes: evidence.map(hashObject),
        reportHash: hashObject(report),
        eventChainHead: run.events.at(-1)!.hash,
        scoreBasisPoints: Math.round(score.overall * 100),
        coverageBasisPoints: Math.round(score.coverage * 100),
        issuedAt: new Date().toISOString(),
        keyId: `ed25519:${publicKey.slice(0, 16)}`,
      },
      requireSigningKey().secretKey,
      requireSigningKey().publicKey,
    );
    run.report = report;
    run.bundle = {
      schemaVersion: "1.0.0",
      report,
      events: run.events,
      evidenceRoot: root,
      receipt,
      attestation,
    };
    run.state = "COMPLETED";
    await persistExecutionRun(run);
  } catch (error) {
    if ((error as Error).message === "CANCELLED") {
      run.state = "CANCELLED";
      emit(run, "CANCELLED", "run.cancelled", "Authorized A2A trial cancelled");
    } else if (error instanceof LeaseLostError) {
      throw error;
    } else {
      run.state = "FAILED";
      run.error = error instanceof Error ? error.message : "Unknown authorized A2A failure";
      emit(
        run,
        "FAILED",
        "run.failed",
        "Authorized target request failed; no capability verdict was inferred",
        {
          error: run.error,
          failureClass: "request_failed",
        },
      );
    }
    await persistExecutionRun(run);
  }
}

function appendSignerEvent(
  run: RuntimeRun,
  state: PipelineState,
  type: string,
  message: string,
  detail?: Record<string, unknown>,
) {
  run.state = state;
  appendEvent(run.events, {
    at: new Date().toISOString(),
    state,
    type,
    message,
    ...(detail ? { detail } : {}),
  });
}

function validatePendingReport(report: TrialReport) {
  if (hashObject(report.plan) !== report.planHash) throw new Error("Unsigned plan hash mismatch.");
  const claimIds = new Set(report.claims.map((claim) => claim.id));
  const trialIds = new Set(report.plan.trials.map((trial) => trial.id));
  const evidenceIds = new Set(report.evidence.map((item) => item.id));
  if (
    claimIds.size !== report.claims.length ||
    trialIds.size !== report.plan.trials.length ||
    evidenceIds.size !== report.evidence.length
  )
    throw new Error("Unsigned evaluation contains duplicate identifiers.");
  if (
    report.observations.length !== report.plan.trials.length ||
    report.observations.some(
      (observation) =>
        !trialIds.has(observation.trialId) ||
        observation.evidenceIds.some((id) => !evidenceIds.has(id)),
    )
  )
    throw new Error("Unsigned evaluation contains missing or dangling observations.");
  const assertions = report.plan.trials.flatMap((trial) => {
    const observation = report.observations.find((item) => item.trialId === trial.id);
    if (!observation) throw new Error(`Missing observation for ${trial.id}.`);
    return evaluateAssertions(trial.assertions, observation);
  });
  const testedClaims = new Set(
    report.plan.trials
      .filter((trial) =>
        report.observations.some(
          (observation) => observation.trialId === trial.id && observation.status !== "not_tested",
        ),
      )
      .flatMap((trial) => trial.claimIds),
  );
  const score = calculateScore(assertions, report.claims, testedClaims);
  if (
    hashObject(assertions) !== hashObject(report.assertions) ||
    hashObject(score) !== hashObject(report.score)
  )
    throw new Error("Unsigned assertions or score failed deterministic recomputation.");
}

function finalizePendingRun(run: RuntimeRun) {
  const pending = run.pendingFinalization;
  if (!pending) throw new Error("Unsigned finalization payload is missing.");
  validatePendingReport(pending.report);
  appendSignerEvent(
    run,
    "RECEIPT_SIGNED",
    "receipt.signed",
    "Dedicated signer validated and signed the deterministic evaluation",
    {
      algorithm: "Ed25519",
      trustBoundary: "no target-network access",
    },
  );
  const attestation = attestationStatus();
  appendSignerEvent(run, "ATTESTING", "attestation.status", attestation.message, {
    status: attestation.status,
    network: "Base Sepolia",
  });
  appendSignerEvent(run, "COMPLETED", "run.completed", "Signed evidence bundle is ready", {
    score: pending.report.score.overall,
    coverage: pending.report.score.coverage,
  });
  const root = evidenceRoot(pending.report.evidence);
  const publicKey = getSigningPublicKey();
  const key = requireSigningKey();
  const receipt = signReceipt(
    {
      receiptVersion: "1.0.0",
      methodologyVersion: METHODOLOGY_VERSION,
      runId: run.id,
      targetId: pending.report.target.id,
      mode: pending.mode,
      planHash: pending.report.planHash,
      seedCommitment: pending.report.plan.seedCommitment,
      evidenceRoot: root,
      evidenceItemHashes: pending.report.evidence.map(hashObject),
      reportHash: hashObject(pending.report),
      eventChainHead: run.events.at(-1)!.hash,
      scoreBasisPoints: Math.round(pending.report.score.overall * 100),
      coverageBasisPoints: Math.round(pending.report.score.coverage * 100),
      issuedAt: new Date().toISOString(),
      keyId: `ed25519:${publicKey.slice(0, 16)}`,
    },
    key.secretKey,
    key.publicKey,
  );
  run.report = pending.report;
  run.bundle = {
    schemaVersion: "1.0.0",
    report: pending.report,
    events: run.events,
    evidenceRoot: root,
    receipt,
    attestation,
  };
  delete run.pendingFinalization;
  run.state = "COMPLETED";
}

export async function processNextSigningJob(workerId = `signer-${process.pid}`) {
  if (!persistenceConfigured()) return false;
  const key = requireSigningKey();
  const publicKey = Buffer.from(key.publicKey).toString("hex");
  await registerSigningPublicKey(publicKey);
  const lease = await claimSigningJob(workerId);
  if (!lease) return false;
  const run = await loadRun(lease.id);
  if (!run) {
    await finishSigningJob(lease, "Unsigned run snapshot missing");
    return true;
  }
  try {
    finalizePendingRun(run);
    await saveSignedRun(run, lease);
    if (!(await finishSigningJob(lease))) throw new LeaseLostError();
    runs.set(run.id, run);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Signer validation failed";
    run.error = message;
    delete run.bundle;
    delete run.report;
    delete run.pendingFinalization;
    appendSignerEvent(
      run,
      "FAILED",
      "run.failed",
      "Dedicated signer rejected the unsigned evaluation",
      {
        error: message,
      },
    );
    await saveSignedRun(run, lease).catch(() => undefined);
    await finishSigningJob(lease, message);
  }
  return true;
}
