import { z } from "zod";

export const PipelineStateSchema = z.enum([
  "CREATED", "DISCOVERING", "CLAIMS_EXTRACTED", "PLANNING", "PLAN_SEALED", "EXECUTING",
  "VERIFYING", "SCORING", "RECEIPT_SIGNED", "ATTESTING", "COMPLETED", "FAILED", "CANCELLED",
]);
export type PipelineState = z.infer<typeof PipelineStateSchema>;

export const ClaimSchema = z.object({
  id: z.string(), capability: z.string(), advertisedInput: z.string(), advertisedOutput: z.string(),
  dependencies: z.array(z.string()), requiredPermissions: z.array(z.string()), successCondition: z.string(),
  evidenceSource: z.string(), confidence: z.number().min(0).max(1), discoveryLocation: z.string(),
});
export type Claim = z.infer<typeof ClaimSchema>;

export const DimensionSchema = z.enum(["capability", "evidence", "safety", "reliability", "efficiency", "recovery"]);
export type Dimension = z.infer<typeof DimensionSchema>;

export const AssertionSpecSchema = z.object({
  id: z.string(), type: z.enum(["contains", "not_contains", "equals", "lte", "gte", "valid_json", "citation", "refusal", "repeatable"]),
  field: z.string(), expected: z.unknown(), dimension: DimensionSchema, weight: z.number().positive(), description: z.string(),
});
export type AssertionSpec = z.infer<typeof AssertionSpecSchema>;

export const TrialSchema = z.object({
  id: z.string(), claimIds: z.array(z.string()), category: z.string(), input: z.record(z.string(), z.unknown()),
  expectedBehavior: z.string(), assertions: z.array(AssertionSpecSchema), timeoutMs: z.number().int().positive(),
  maxCalls: z.number().int().positive(), severity: z.enum(["low", "medium", "high", "critical"]), seed: z.string(),
  mode: z.enum(["passive", "active"]), authorizationRequired: z.boolean(),
});
export type Trial = z.infer<typeof TrialSchema>;

export const ObservationSchema = z.object({
  trialId: z.string(), startedAt: z.string(), completedAt: z.string(), latencyMs: z.number(), calls: z.number(),
  status: z.enum(["completed", "request_failed", "capability_failed", "not_tested"]),
  output: z.record(z.string(), z.unknown()), evidenceIds: z.array(z.string()), retryCount: z.number(),
});
export type Observation = z.infer<typeof ObservationSchema>;

export const AssertionResultSchema = z.object({
  id: z.string(), trialId: z.string(), dimension: DimensionSchema, weight: z.number(), passed: z.boolean(),
  description: z.string(), actual: z.unknown(), expected: z.unknown(), evidenceIds: z.array(z.string()),
});
export type AssertionResult = z.infer<typeof AssertionResultSchema>;

export const ScoreSchema = z.object({
  overall: z.number(), dimensions: z.record(DimensionSchema, z.number()), coverage: z.number(),
  confidence: z.enum(["low", "moderate", "high"]), criticalFindings: z.array(z.string()),
  untestedClaims: z.array(z.string()), methodologyVersion: z.string(), badge: z.enum(["evidence-backed", "partial", "not-verified"]),
});
export type Score = z.infer<typeof ScoreSchema>;

export interface TargetDescriptor { id: string; name: string; type: "fixture" | "website" | "repository" | "api" | "openai" | "a2a"; locator: string; controlled: boolean; }
export interface EvidenceItem { id: string; kind: string; trialId?: string; capturedAt: string; data: Record<string, unknown>; redactions: string[]; }
export interface RunEvent { index: number; id: string; at: string; state: PipelineState; type: string; message: string; detail?: Record<string, unknown>; previousHash: string; hash: string; }
export interface TrialPlan { version: string; seedCommitment: string; trials: Trial[]; }
export interface TrialReport { runId: string; target: TargetDescriptor; state: PipelineState; claims: Claim[]; plan: TrialPlan; planHash: string; observations: Observation[]; assertions: AssertionResult[]; evidence: EvidenceItem[]; score: Score; startedAt: string; completedAt: string; }
