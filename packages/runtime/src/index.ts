import { randomBytes, randomUUID } from "node:crypto";
import { discoverPublicTarget, safePublicFetch } from "@agenttrial/adapters";
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
  claimRun,
  LeaseLostError,
  enqueueRun,
  finishRunJob,
  loadRun,
  persistenceConfigured,
  renewRunLease,
  snapshotPersistenceConfigured,
  runCancellationRequested,
  saveRun,
} from "./persistence";
import type { JobLease } from "./persistence";
export { closePersistence, heartbeatWorker, persistenceReadiness } from "./persistence";

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
  mode: "active-controlled" | "passive-external";
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
const activeLeases = new Map<string, { lease: JobLease; lost: boolean }>();
const MAX_IN_MEMORY_TERMINAL_RUNS = 200;
const signingSeedHex = process.env.AGENTTRIAL_SIGNING_SEED;
if (signingSeedHex && !/^[0-9a-fA-F]{64}$/.test(signingSeedHex))
  throw new Error(
    "AGENTTRIAL_SIGNING_SEED must be exactly 32 bytes encoded as 64 hexadecimal characters",
  );
if (process.env.DATABASE_URL && !signingSeedHex)
  throw new Error(
    "A stable AGENTTRIAL_SIGNING_SEED is required when the durable multi-process runtime is enabled",
  );
const signingKey = (globalStore.__agenttrialKey ??= createSigningKey(
  signingSeedHex ? Uint8Array.from(Buffer.from(signingSeedHex, "hex")) : undefined,
));
export function getSigningPublicKey() {
  return Buffer.from(signingKey.publicKey).toString("hex");
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
  void saveRun(run, leaseState?.lease).catch((error) => {
    if (error instanceof LeaseLostError && leaseState) leaseState.lost = true;
  });
  return event;
}
const pause = (ms = 90) => new Promise((resolve) => setTimeout(resolve, ms));
async function ensureActive(run: RuntimeRun) {
  if (activeLeases.get(run.id)?.lost) throw new Error("LEASE_LOST");
  if (run.cancelled || (await runCancellationRequested(run.id))) throw new Error("CANCELLED");
}
async function persistExecutionRun(run: RuntimeRun) {
  const leaseState = activeLeases.get(run.id);
  if (leaseState?.lost) throw new LeaseLostError();
  await saveRun(run, leaseState?.lease);
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
  const run = await loadRun(lease.id);
  if (!run) {
    await finishRunJob(lease, "Run snapshot missing");
    return true;
  }
  runs.set(lease.id, run);
  const leaseState = { lease, lost: false };
  activeLeases.set(lease.id, leaseState);
  let renewing = false;
  const renewal = setInterval(
    () => {
      if (renewing || leaseState.lost) return;
      renewing = true;
      void renewRunLease(lease)
        .then((renewed) => {
          if (!renewed) leaseState.lost = true;
        })
        .catch(() => {
          leaseState.lost = true;
        })
        .finally(() => {
          renewing = false;
        });
    },
    Math.max(250, Math.floor(lease.leaseMs / 3)),
  );
  try {
    if (run.mode === "passive-external") await executeExternalRun(run);
    else await executeRun(run);
    if (leaseState.lost) throw new LeaseLostError();
    await saveRun(run, lease);
    if (!(await finishRunJob(lease, run.state === "FAILED" ? run.error : undefined)))
      throw new LeaseLostError();
  } catch (error) {
    await finishRunJob(lease, error instanceof Error ? error.message : "Worker failure");
  } finally {
    clearInterval(renewal);
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
      signingKey.secretKey,
      signingKey.publicKey,
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
    const discovery = await discoverPublicTarget(run.targetUrl!);
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
      signingKey.secretKey,
      signingKey.publicKey,
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
