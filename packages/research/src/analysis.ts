export interface BinaryPair {
  configurationId: string;
  repeat: number;
  baselineFalseAccept: boolean;
  agenttrialFalseAccept: boolean;
}

export interface Interval {
  estimate: number;
  lower: number;
  upper: number;
}

function nonNegativeInteger(value: number, description: string) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(`${description} must be a non-negative integer`);
}

function validateBinaryPairs(records: BinaryPair[]) {
  const keys = new Set<string>();
  for (const record of records) {
    if (record.configurationId.trim() === "") throw new Error("Configuration ID must not be empty");
    nonNegativeInteger(record.repeat, `Repeat for ${record.configurationId}`);
    if (
      typeof record.baselineFalseAccept !== "boolean" ||
      typeof record.agenttrialFalseAccept !== "boolean"
    )
      throw new Error(`Paired outcomes must be boolean for ${record.configurationId}`);
    const key = `${record.configurationId}\u0000${record.repeat}`;
    if (keys.has(key))
      throw new Error(`Duplicate paired outcome ${record.configurationId}/${record.repeat}`);
    keys.add(key);
  }
}

export function wilson(successes: number, total: number, z = 1.96): Interval {
  nonNegativeInteger(successes, "Wilson successes");
  nonNegativeInteger(total, "Wilson total");
  if (successes > total) throw new Error("Wilson successes cannot exceed total");
  if (!Number.isFinite(z) || z <= 0) throw new Error("Wilson z must be positive and finite");
  if (total === 0) return { estimate: 0, lower: 0, upper: 0 };
  const estimate = successes / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const center = (estimate + z2 / (2 * total)) / denominator;
  const half =
    (z / denominator) * Math.sqrt((estimate * (1 - estimate)) / total + z2 / (4 * total * total));
  return { estimate, lower: Math.max(0, center - half), upper: Math.min(1, center + half) };
}

function combination(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  const limit = Math.min(k, n - k);
  let value = 1;
  for (let index = 1; index <= limit; index++) value = (value * (n - limit + index)) / index;
  return value;
}

export function exactMcNemar(discordantBaselineOnly: number, discordantAgentTrialOnly: number) {
  nonNegativeInteger(discordantBaselineOnly, "McNemar baseline-only discordance");
  nonNegativeInteger(discordantAgentTrialOnly, "McNemar AgentTrial-only discordance");
  const discordant = discordantBaselineOnly + discordantAgentTrialOnly;
  if (discordant === 0) return 1;
  const lowerTail = Math.min(discordantBaselineOnly, discordantAgentTrialOnly);
  let probability = 0;
  for (let count = 0; count <= lowerTail; count++)
    probability += combination(discordant, count) * 0.5 ** discordant;
  return Math.min(1, 2 * probability);
}

export function pairedFalseAcceptance(records: BinaryPair[]) {
  validateBinaryPairs(records);
  const baselineCount = records.filter((record) => record.baselineFalseAccept).length;
  const agenttrialCount = records.filter((record) => record.agenttrialFalseAccept).length;
  const baselineOnly = records.filter(
    (record) => record.baselineFalseAccept && !record.agenttrialFalseAccept,
  ).length;
  const agenttrialOnly = records.filter(
    (record) => !record.baselineFalseAccept && record.agenttrialFalseAccept,
  ).length;
  return {
    total: records.length,
    baseline: wilson(baselineCount, records.length),
    agenttrial: wilson(agenttrialCount, records.length),
    absoluteDifference: (baselineCount - agenttrialCount) / records.length,
    discordantBaselineOnly: baselineOnly,
    discordantAgentTrialOnly: agenttrialOnly,
    pValue: exactMcNemar(baselineOnly, agenttrialOnly),
  };
}

export function holmAdjust(pValues: number[]): number[] {
  if (pValues.some((value) => !Number.isFinite(value) || value < 0 || value > 1))
    throw new Error("Holm p-values must be finite values between zero and one");
  const ranked = pValues
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);
  const adjusted = Array<number>(pValues.length).fill(1);
  let previous = 0;
  ranked.forEach((item, rank) => {
    const current = Math.min(1, item.value * (pValues.length - rank));
    previous = Math.max(previous, current);
    adjusted[item.index] = previous;
  });
  return adjusted;
}

function random(seedState: { value: number }) {
  seedState.value = (1664525 * seedState.value + 1013904223) >>> 0;
  return seedState.value / 2 ** 32;
}

export function hierarchicalBootstrap(
  records: BinaryPair[],
  iterations = 2000,
  seed = 2026002,
): Interval {
  validateBinaryPairs(records);
  if (!Number.isSafeInteger(iterations) || iterations <= 0)
    throw new Error("Bootstrap iterations must be a positive integer");
  nonNegativeInteger(seed, "Bootstrap seed");
  const groups = new Map<string, BinaryPair[]>();
  records.forEach((record) =>
    groups.set(record.configurationId, [...(groups.get(record.configurationId) ?? []), record]),
  );
  const ids = [...groups.keys()];
  if (ids.length === 0) return { estimate: 0, lower: 0, upper: 0 };
  const state = { value: seed >>> 0 };
  const estimates: number[] = [];
  for (let iteration = 0; iteration < iterations; iteration++) {
    const sample: BinaryPair[] = [];
    for (let groupIndex = 0; groupIndex < ids.length; groupIndex++) {
      const id = ids[Math.floor(random(state) * ids.length)]!;
      const group = groups.get(id)!;
      for (let repeat = 0; repeat < group.length; repeat++)
        sample.push(group[Math.floor(random(state) * group.length)]!);
    }
    const baseline = sample.filter((record) => record.baselineFalseAccept).length;
    const agenttrial = sample.filter((record) => record.agenttrialFalseAccept).length;
    estimates.push(sample.length === 0 ? 0 : (baseline - agenttrial) / sample.length);
  }
  estimates.sort((a, b) => a - b);
  const observed = pairedFalseAcceptance(records).absoluteDifference;
  return {
    estimate: observed,
    lower: estimates[Math.floor(iterations * 0.025)] ?? observed,
    upper: estimates[Math.floor(iterations * 0.975)] ?? observed,
  };
}
