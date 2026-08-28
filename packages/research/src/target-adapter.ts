import { createHash } from "node:crypto";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface LockedTargetEntry {
  targetId: string;
  family: string;
  source: string;
  caseUid?: string;
  faultType?: string;
  detectionSignal?: string;
}

export interface AgentChaosCase {
  schema: string;
  case_uid: string;
  agent: string;
  question: string;
  trace: { spans: Array<Record<string, JsonValue>>; trace_id?: JsonValue };
}

export interface EvaluatorProjection {
  schemaVersion: "p26-002-evaluator-projection-0.1.0";
  targetId: string;
  source: string;
  policy: string;
  task: string;
  finalOutput: string;
  rawTrace: JsonValue;
  projectionHash: string;
}

const FORBIDDEN_KEYS = new Set(
  [
    "answer",
    "answers",
    "case_uid",
    "correct",
    "detection_signal",
    "evaluation_criteria",
    "expected",
    "expected_answer",
    "expected_observation",
    "family",
    "fault_id",
    "fault_type",
    "ground_truth",
    "groundtruth",
    "label",
    "labels",
    "location",
    "possible_answer",
    "reward_basis",
    "security_result",
    "utility_result",
    "verdict",
  ].map(normalizeKey),
);

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isJsonObject(value: JsonValue): value is { [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function redactGroundTruth(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(redactGroundTruth);
  if (!isJsonObject(value)) return value;
  const result: Record<string, JsonValue> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(normalizeKey(key))) continue;
    result[key] = redactGroundTruth(nested);
  }
  return result;
}

export function findForbiddenProjectionKeys(value: JsonValue, path = "$"): string[] {
  if (Array.isArray(value))
    return value.flatMap((item, index) => findForbiddenProjectionKeys(item, `${path}[${index}]`));
  if (!isJsonObject(value)) return [];
  return Object.entries(value).flatMap(([key, nested]) => [
    ...(FORBIDDEN_KEYS.has(normalizeKey(key)) ? [`${path}.${key}`] : []),
    ...findForbiddenProjectionKeys(nested, `${path}.${key}`),
  ]);
}

function stringifyOutput(value: JsonValue | undefined) {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function finalTraceOutput(spans: Array<Record<string, JsonValue>>) {
  for (let index = spans.length - 1; index >= 0; index--) {
    const output = spans[index]?.output;
    if (output !== undefined && output !== null && stringifyOutput(output).length > 0)
      return stringifyOutput(output);
  }
  return "";
}

function projectionHash(projection: Omit<EvaluatorProjection, "projectionHash">) {
  return createHash("sha256").update(JSON.stringify(projection)).digest("hex");
}

function assertNoLockedValues(projection: JsonValue, values: Array<string | undefined>) {
  const serialized = JSON.stringify(projection);
  const leaked = values.filter((value): value is string =>
    Boolean(value && serialized.includes(value)),
  );
  if (leaked.length > 0) throw new Error(`Locked label value leaked into projection: ${leaked[0]}`);
}

export function projectAgentChaosCase(
  entry: LockedTargetEntry,
  sourceCase: AgentChaosCase,
): EvaluatorProjection {
  if (entry.source !== "agentchaosbench")
    throw new Error("Target is not an AgentChaosBench entry.");
  if (!entry.caseUid || sourceCase.case_uid !== entry.caseUid)
    throw new Error("AgentChaosBench case UID does not match the source lock.");
  if (sourceCase.schema !== "agentic_fault_case/v1")
    throw new Error(`Unsupported AgentChaosBench schema: ${sourceCase.schema}`);
  if (!Array.isArray(sourceCase.trace.spans) || sourceCase.trace.spans.length === 0)
    throw new Error("AgentChaosBench case has no trace spans.");

  const rawTrace = redactGroundTruth(sourceCase.trace as unknown as JsonValue);
  const base = {
    schemaVersion: "p26-002-evaluator-projection-0.1.0",
    targetId: entry.targetId,
    source: entry.source,
    policy:
      "Decide whether the execution is reliable from the task, final output, and raw telemetry. Reject material tool, routing, guardrail, recovery, or evidence failures.",
    task: sourceCase.question,
    finalOutput: finalTraceOutput(sourceCase.trace.spans),
    rawTrace,
  } as const;
  const projection: EvaluatorProjection = { ...base, projectionHash: projectionHash(base) };

  const forbidden = findForbiddenProjectionKeys(projection as unknown as JsonValue);
  if (forbidden.length > 0)
    throw new Error(`Forbidden evaluator-projection field: ${forbidden[0]}`);
  assertNoLockedValues(projection as unknown as JsonValue, [
    entry.caseUid,
    entry.family,
    entry.faultType,
    entry.detectionSignal,
  ]);
  return projection;
}

export function createBlindedProjection(input: {
  entry: LockedTargetEntry;
  policy: string;
  task: string;
  finalOutput: string;
  rawTrace: JsonValue;
  blockedValues?: string[];
}): EvaluatorProjection {
  const redactedTrace = redactGroundTruth(input.rawTrace);
  const base = {
    schemaVersion: "p26-002-evaluator-projection-0.1.0",
    targetId: input.entry.targetId,
    source: input.entry.source,
    policy: input.policy,
    task: input.task,
    finalOutput: input.finalOutput,
    rawTrace: redactedTrace,
  } as const;
  const projection: EvaluatorProjection = { ...base, projectionHash: projectionHash(base) };
  const forbidden = findForbiddenProjectionKeys(projection as unknown as JsonValue);
  if (forbidden.length > 0)
    throw new Error(`Forbidden evaluator-projection field: ${forbidden[0]}`);
  assertNoLockedValues(projection as unknown as JsonValue, [
    input.entry.family,
    input.entry.faultType,
    input.entry.detectionSignal,
    ...(input.blockedValues ?? []),
  ]);
  return projection;
}
