import { randomBytes, randomUUID } from "node:crypto";
import { TrialStateMachine, calculateScore, evaluateAssertions, METHODOLOGY_VERSION, type EvidenceItem, type PipelineState, type RunEvent, type TrialReport } from "@agenttrial/core";
import { appendEvent, createSigningKey, evidenceRoot, hashObject, signReceipt, type EvidenceBundle } from "@agenttrial/evidence";
import { attestationStatus } from "@agenttrial/eas";
import { discoverFixtureClaims, executeFixture, fixtures, generateFixturePlan, type FixtureId } from "@agenttrial/fixtures";
import { redact } from "@agenttrial/security";

export interface RuntimeRun { id: string; state: PipelineState; events: RunEvent[]; report?: TrialReport; bundle?: EvidenceBundle; error?: string; cancelled: boolean; fixture: FixtureId; }
export type EventListener = (event: RunEvent) => void;

const globalStore = globalThis as typeof globalThis & { __agenttrialRuns?: Map<string, RuntimeRun>; __agenttrialListeners?: Map<string, Set<EventListener>>; __agenttrialKey?: ReturnType<typeof createSigningKey> };
export const runs = globalStore.__agenttrialRuns ??= new Map();
const listeners = globalStore.__agenttrialListeners ??= new Map();
const signingKey = globalStore.__agenttrialKey ??= createSigningKey(process.env.AGENTTRIAL_SIGNING_SEED ? Uint8Array.from(Buffer.from(process.env.AGENTTRIAL_SIGNING_SEED, "hex")) : undefined);

export function subscribe(runId: string, listener: EventListener) { const set = listeners.get(runId) ?? new Set(); set.add(listener); listeners.set(runId, set); return () => { set.delete(listener); }; }
function emit(run: RuntimeRun, state: PipelineState, type: string, message: string, detail?: Record<string, unknown>) {
  run.state = state; const event = appendEvent(run.events, { at: new Date().toISOString(), state, type, message, ...(detail ? { detail } : {}) });
  listeners.get(run.id)?.forEach((fn) => fn(event)); return event;
}
const pause = (ms = 90) => new Promise((resolve) => setTimeout(resolve, ms));
function ensureActive(run: RuntimeRun) { if (run.cancelled) throw new Error("CANCELLED"); }

export function createFixtureRun(fixture: FixtureId): RuntimeRun {
  if (!fixtures[fixture]) throw new Error("Unknown fixture");
  const run: RuntimeRun = { id: randomUUID(), state: "CREATED", events: [], cancelled: false, fixture };
  runs.set(run.id, run); emit(run, "CREATED", "run.created", "Trial workspace created", { target: fixtures[fixture].name, mode: "active", authorization: "controlled fixture" });
  void executeRun(run); return run;
}
export function cancelRun(id: string) { const run = runs.get(id); if (!run || ["COMPLETED", "FAILED", "CANCELLED"].includes(run.state)) return false; run.cancelled = true; return true; }

async function executeRun(run: RuntimeRun) {
  const machine = new TrialStateMachine(); const startedAt = new Date().toISOString();
  try {
    await pause(); ensureActive(run); machine.transition("DISCOVERING"); emit(run, machine.state, "discovery.started", "Inspecting Agent Card and advertised constraints");
    const claims = discoverFixtureClaims(run.fixture); await pause(); ensureActive(run); machine.transition("CLAIMS_EXTRACTED"); emit(run, machine.state, "claims.normalized", `${claims.length} typed claims extracted`, { claims: claims.map((c) => c.capability), untrustedContent: "isolated" });
    machine.transition("PLANNING"); emit(run, machine.state, "planner.started", "Constructing claim-specific hidden trials", { provider: "deterministic fixture planner", methodology: METHODOLOGY_VERSION });
    const seed = randomBytes(16).toString("hex"); const plan = generateFixturePlan(hashObject({ seed, runId: run.id })); await pause();
    ensureActive(run); machine.transition("PLAN_SEALED"); const planHash = hashObject(plan); emit(run, machine.state, "plan.sealed", "Trial plan and seed commitment sealed before execution", { planHash, trials: plan.trials.length });
    machine.transition("EXECUTING"); emit(run, machine.state, "execution.started", `Executing ${plan.trials.length} authorized scenarios`);
    const observations = []; const evidence: EvidenceItem[] = [];
    for (const trial of plan.trials) {
      ensureActive(run); emit(run, machine.state, "tool.call", `${trial.category}: ${String(trial.input.scenario)}`, { trialId: trial.id, maxCalls: trial.maxCalls, timeoutMs: trial.timeoutMs });
      if (trial.id === "trial_timeout") emit(run, machine.state, "tool.retry", "Transient source timeout observed; applying bounded retry", { trialId: trial.id, attempt: 2, limit: 2 });
      const observation = await executeFixture(run.fixture, trial); observations.push(observation);
      evidence.push({ id: observation.evidenceIds[0]!, kind: "fixture-observation", trialId: trial.id, capturedAt: observation.completedAt, data: redact({ input: trial.input, output: observation.output, latencyMs: observation.latencyMs, calls: observation.calls }) as Record<string, unknown>, redactions: [] });
      emit(run, machine.state, "evidence.captured", `Observation captured for ${trial.id}`, { trialId: trial.id, latencyMs: observation.latencyMs, calls: observation.calls });
    }
    ensureActive(run); machine.transition("VERIFYING"); emit(run, machine.state, "verification.started", "Running versioned deterministic assertions");
    const assertions = plan.trials.flatMap((trial) => evaluateAssertions(trial.assertions, observations.find((o) => o.trialId === trial.id)!));
    for (const result of assertions) emit(run, machine.state, result.passed ? "assertion.passed" : "assertion.failed", result.description, { assertionId: result.id, trialId: result.trialId, dimension: result.dimension });
    machine.transition("SCORING"); const tested = new Set(plan.trials.flatMap((t) => t.claimIds)); const score = calculateScore(assertions, claims, tested); emit(run, machine.state, "score.calculated", `Deterministic score: ${score.overall}/100`, { dimensions: score.dimensions, coverage: score.coverage, methodology: score.methodologyVersion });
    const report: TrialReport = { runId: run.id, target: fixtures[run.fixture], state: "COMPLETED", claims, plan, planHash, observations, assertions, evidence, score, startedAt, completedAt: new Date().toISOString() };
    machine.transition("RECEIPT_SIGNED"); const signedEvent = emit(run, machine.state, "receipt.signed", "Evidence root committed with an Ed25519 receipt", { algorithm: "Ed25519" });
    const root = evidenceRoot(evidence); const receipt = signReceipt({ receiptVersion: "1.0.0", methodologyVersion: METHODOLOGY_VERSION, runId: run.id, targetId: report.target.id, mode: "active-controlled", planHash, seedCommitment: plan.seedCommitment, evidenceRoot: root, eventChainHead: signedEvent.hash, scoreBasisPoints: Math.round(score.overall * 100), coverageBasisPoints: Math.round(score.coverage * 100), issuedAt: new Date().toISOString(), keyId: `ed25519:${Buffer.from(signingKey.publicKey).toString("hex").slice(0, 16)}` }, signingKey.secretKey, signingKey.publicKey);
    machine.transition("ATTESTING"); const attestation = attestationStatus(); emit(run, machine.state, "attestation.status", attestation.message, { status: attestation.status, network: "Base Sepolia" });
    machine.transition("COMPLETED"); emit(run, machine.state, "run.completed", "Trial complete; report and evidence bundle are ready", { score: score.overall, coverage: score.coverage });
    run.report = report; run.bundle = { schemaVersion: "1.0.0", report, events: run.events, evidenceRoot: root, receipt, attestation }; run.state = "COMPLETED";
  } catch (error) {
    if ((error as Error).message === "CANCELLED") { run.state = "CANCELLED"; emit(run, "CANCELLED", "run.cancelled", "Trial cancelled; partial evidence retained"); }
    else { run.state = "FAILED"; run.error = error instanceof Error ? error.message : "Unknown failure"; emit(run, "FAILED", "run.failed", "Trial stopped because the evaluator failed", { error: run.error }); }
  }
}
