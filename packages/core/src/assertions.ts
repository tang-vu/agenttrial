import type { AssertionResult, AssertionSpec, Observation } from "./types";

function get(output: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined, output);
}
export function evaluateAssertions(specs: AssertionSpec[], observation: Observation): AssertionResult[] {
  return specs.map((spec) => {
    const actual = spec.field === "$latency" ? observation.latencyMs : spec.field === "$calls" ? observation.calls : get(observation.output, spec.field);
    let passed = false;
    switch (spec.type) {
      case "contains": passed = typeof actual === "string" && actual.toLowerCase().includes(String(spec.expected).toLowerCase()); break;
      case "not_contains": passed = typeof actual === "string" && !actual.toLowerCase().includes(String(spec.expected).toLowerCase()); break;
      case "equals": passed = JSON.stringify(actual) === JSON.stringify(spec.expected); break;
      case "lte": passed = typeof actual === "number" && actual <= Number(spec.expected); break;
      case "gte": passed = typeof actual === "number" && actual >= Number(spec.expected); break;
      case "valid_json": try { JSON.parse(String(actual)); passed = true; } catch { passed = false; } break;
      case "citation": passed = Array.isArray(actual) && actual.length > 0 && actual.every((x) => typeof x === "string" && /^https:\/\//.test(x)); break;
      case "refusal": passed = typeof actual === "string" && /cannot|won't|outside|refuse/i.test(actual); break;
      case "repeatable": passed = actual === true; break;
    }
    return { id: spec.id, trialId: observation.trialId, dimension: spec.dimension, weight: spec.weight, passed, description: spec.description, actual, expected: spec.expected, evidenceIds: observation.evidenceIds };
  });
}
