#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path


def canonical_json(value: object) -> str:
    return json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate(o: dict) -> list[str]:
    checks: list[tuple[bool, str]] = []
    prior = o["priorInventory"]
    dojo = o["agentDojo"]
    chaos = o["agentChaosBench"]
    decision = o["decision"]
    checks.append((prior["agentDojoClusters"] + prior["agentChaosBenchControlClusters"] == prior["independentContentClusters"], "87 + 25 equals 112"))
    checks.append((sum(prior["agentDojoClustersBySuite"].values()) == prior["agentDojoClusters"], "AgentDojo suite counts sum to 87"))
    checks.append((len(dojo["registeredSuiteVersionsAtPinnedRevision"]) == 7, "seven suite versions are registered"))
    checks.append(("benchmark_version" not in dojo["publishedRunSchemaFields"], "published run schema omits benchmark_version"))
    counts = dojo["v1InjectionSecurityImplementationCounts"]
    checks.append((counts["postStateDependent"] + counts["traceDependent"] + counts["terminalOutputOnly"] == counts["total"], "v1 injection implementation categories sum to 27"))
    checks.append((dojo["clustersWithRecordedOutputVisibleFaultWitness"] + dojo["clustersWithoutRecordedOutputVisibleFaultWitness"] == prior["agentDojoClusters"], "AgentDojo witness partition sums to 87"))
    checks.append((len(dojo["provisionalPhysicalInstances"]) == 3, "one provisional content cluster has three physical instances"))
    checks.append((all(x["controlUtility"] and x["controlSecurity"] and x["faultUtility"] and not x["faultSecurity"] and x["errors"] == 0 for x in dojo["provisionalPhysicalInstances"]), "all provisional instances match published utility/security pattern"))
    checks.append((chaos["labelRowsAudited"] == 5 * 55, "five AgentChaosBench label files contain 275 rows"))
    checks.append((chaos["noFaultControlRowsAudited"] == 25, "25 no-fault control labels audited"))
    checks.append((not chaos["labelHasExpectedTaskAnswer"], "AgentChaosBench label schema has no expected task answer"))
    checks.append((dojo["strictEndpointReadyClusters"] + chaos["strictEndpointReadyControlClusters"] == decision["strictEndpointReadyClustersAcrossAuditedExpansionSources"], "strict endpoint-ready total is internally consistent"))
    checks.append((decision["strictShortfallTo181"] == o["confirmatoryTargetIndependentPairs"] - decision["strictEndpointReadyClustersAcrossAuditedExpansionSources"], "strict shortfall is 181"))
    checks.append((decision["provisionalShortfallTo181"] == o["confirmatoryTargetIndependentPairs"] - decision["provisionalV1EndpointCandidateClusters"], "provisional shortfall is 180"))
    checks.append((not any([decision["registered80FrameChanged"], decision["outcomeCreated"], decision["humanLabelCreated"], decision["sourceActivated"], decision["mainTrialAllowed"], decision["releaseAllowed"], decision["submissionAllowed"]]), "all governance gates remain closed"))
    failed = [label for ok, label in checks if not ok]
    if failed:
        raise ValueError("validation failed: " + "; ".join(failed))
    return [label for _, label in checks]


def make_report(o: dict) -> str:
    p = o["priorInventory"]
    d = o["agentDojo"]
    c = o["agentChaosBench"]
    q = o["decision"]
    return f"""# P26-002 current fixed-corpus endpoint-lineage audit

Date: 2026-09-09  
Status: retrospective amendment; no source activation, execution, outcome, or human review

## Question and correction

The earlier cluster analysis established independence structure, not compatibility with the primary final-output-only comparator. This amendment audits the two expansion sources behind the **{p['independentContentClusters']}**-cluster count: {p['agentDojoClusters']} AgentDojo source-task clusters and {p['agentChaosBenchControlClusters']} AgentChaosBench no-fault controls. The registered 80-pair history is not altered.

Under a strict source-ready rule, a cluster must have a deterministic terminal-output assertion and an exact binding from the published execution to the task/oracle implementation. None of the {p['independentContentClusters']} inventory clusters currently meets both conditions. The prior phrase “primary-compatible source frame of 112” is therefore withdrawn; **112 is an inventory count only**.

## AgentDojo: one promising content cluster, unresolved version binding

The feasibility ledger contains {p['agentDojoPhysicalPairCandidates']} physical pair candidates but only {p['agentDojoClusters']} distinct suite/user-task clusters: banking {p['agentDojoClustersBySuite']['banking']}, slack {p['agentDojoClustersBySuite']['slack']}, travel {p['agentDojoClustersBySuite']['travel']}, and workspace {p['agentDojoClustersBySuite']['workspace']}. The published run schema records suite, pipeline, user task, injection task, messages, error, utility, security, and duration, but not `benchmark_version`. At the pinned repository revision, the loader exposes seven versions from v1 through v1.2.2. A repository commit therefore does not by itself identify which versioned task/oracle generated a historical run.

The v1 implementation audit found {d['v1InjectionSecurityImplementationCounts']['postStateDependent']}/27 injection security checks dependent on post-state, {d['v1InjectionSecurityImplementationCounts']['traceDependent']}/27 dependent on traces, and only {d['v1InjectionSecurityImplementationCounts']['terminalOutputOnly']}/27 terminal-output-only (`travel/injection_task_0`). Under that v1 interpretation, seventeen of the 87 clusters have a recorded output-visible fault witness. Only `travel/user_task_6` also has an output-only v1 utility implementation. Its three model-pipeline instances all report control utility/security `true/true` and fault utility/security `true/false`, with no recorded errors.

Those three executions are repeated instances of one content cluster, not three independent pairs. More importantly, the run files do not bind that cluster to a benchmark version. It is retained as **one provisional v1 candidate**, not counted as endpoint-ready evidence. This is a lineage finding, not a model-performance result.

## AgentChaosBench: fault-detection controls are not answer-oracle controls

Across five label files, {c['labelRowsAudited']} rows and all {c['noFaultControlRowsAudited']} no-fault controls were audited. The uniform answer-key schema contains fault type, detection signal, required span kind, and location metadata, but no expected or reference task answer. The case builder emits a question plus a complete trace for a fault detector. It does not define correctness of the terminal assistant answer.

Consequently, the 25 no-fault items are valid controls for the source benchmark's trace-level fault-detection task, but they cannot be imported as matched controls for P26-002's terminal-output comparator without creating and validating a new oracle. They contribute **0 strict endpoint-ready clusters** here.

## Quantitative consequence

| Quantity                                | Independent clusters |
| --------------------------------------- | -------------------: |
| Earlier inventory count                 |                  {p['independentContentClusters']} |
| Provisional v1 output-only candidate    |                    {q['provisionalV1EndpointCandidateClusters']} |
| Strict source- and endpoint-bound count |                    {q['strictEndpointReadyClustersAcrossAuditedExpansionSources']} |
| Confirmatory planning target            |                  {o['confirmatoryTargetIndependentPairs']} |

For these audited expansion sources, the strict shortfall is {q['strictShortfallTo181']} clusters. Even if the AgentDojo version lineage for the provisional candidate is later recovered, the shortfall would still be {q['provisionalShortfallTo181']}. No power claim should be transported from the 112-cluster inventory.

## Limits and governance

The source-code dependency classification is static and tied to the pinned repository revision; it does not prove which version generated each historical run. The provisional task has not been independently construct-reviewed, and no AgentTrial evaluator was run. This audit creates no outcome, accuracy estimate, human label, or source approval. `mainTrialAllowed=false`, `releaseAllowed=false`, and `submissionAllowed=false`.
"""


def make_svg(o: dict) -> str:
    prior = o["priorInventory"]["independentContentClusters"]
    provisional = o["decision"]["provisionalV1EndpointCandidateClusters"]
    strict = o["decision"]["strictEndpointReadyClustersAcrossAuditedExpansionSources"]
    target = o["confirmatoryTargetIndependentPairs"]
    values = [("Inventory", prior, "#718096"), ("Provisional v1", provisional, "#d69e2e"), ("Strict ready", strict, "#c53030"), ("Target", target, "#2b6cb0")]
    scale = 520 / target
    rows = []
    for i, (label, value, color) in enumerate(values):
        y = 70 + i * 58
        width = max(2 if value == 0 else 0, value * scale)
        rows.append(f'<text x="18" y="{y + 19}" font-size="15" fill="#1a202c">{label}</text><rect x="145" y="{y}" width="{width:.2f}" height="26" rx="4" fill="{color}"/><text x="{max(153, 153 + width):.2f}" y="{y + 19}" font-size="15" fill="#1a202c">{value}</text>')
    return "\n".join([
        '<svg xmlns="http://www.w3.org/2000/svg" width="760" height="330" viewBox="0 0 760 330" role="img" aria-labelledby="title desc">',
        '<title id="title">P26-002 endpoint-lineage audit</title>',
        '<desc id="desc">The earlier inventory has 112 clusters, one is a provisional v1 candidate, zero are strictly endpoint-ready, and the confirmatory target is 181.</desc>',
        '<rect width="760" height="330" fill="#ffffff"/>',
        '<text x="18" y="32" font-size="20" font-weight="700" fill="#1a202c">Inventory is not endpoint readiness</text>',
        *rows,
        '<text x="145" y="306" font-size="12" fill="#4a5568">Counts apply only to the two audited expansion sources; the registered 80-pair history is unchanged.</text>',
        '</svg>',
        ''
    ])


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: build_current_frame_endpoint_audit.py SOURCE_OBSERVATION.json OUTPUT_DIR")
    src = Path(sys.argv[1])
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    observation = json.loads(src.read_text(encoding="utf-8"))
    checks = validate(observation)
    result = {
        "schemaVersion": "p26-002-current-frame-endpoint-lineage-result-0.1.0",
        "createdOn": observation["createdOn"],
        "sourceObservationSha256": sha256(src),
        "priorInventoryClusters": observation["priorInventory"]["independentContentClusters"],
        "strictEndpointReadyClusters": observation["decision"]["strictEndpointReadyClustersAcrossAuditedExpansionSources"],
        "provisionalV1CandidateClusters": observation["decision"]["provisionalV1EndpointCandidateClusters"],
        "strictShortfallTo181": observation["decision"]["strictShortfallTo181"],
        "provisionalShortfallTo181": observation["decision"]["provisionalShortfallTo181"],
        "machineDisposition": "WITHDRAW_112_AS_PRIMARY_COMPATIBLE; RETAIN_AS_INVENTORY_ONLY",
        "registered80FrameChanged": False,
        "mainTrialAllowed": False,
        "releaseAllowed": False,
        "submissionAllowed": False
    }
    (out / "current_frame_endpoint_audit.json").write_text(canonical_json(result), encoding="utf-8")
    (out / "current_frame_endpoint_audit.md").write_text(make_report(observation), encoding="utf-8")
    (out / "current_frame_endpoint_audit.svg").write_text(make_svg(observation), encoding="utf-8")
    validation = {
        "schemaVersion": "p26-002-current-frame-endpoint-lineage-validation-0.1.0",
        "status": "PASS",
        "checksPassed": len(checks),
        "checks": checks,
        "outputSha256": {
            name: sha256(out / name)
            for name in ["current_frame_endpoint_audit.json", "current_frame_endpoint_audit.md", "current_frame_endpoint_audit.svg"]
        }
    }
    (out / "validation.json").write_text(canonical_json(validation), encoding="utf-8")


if __name__ == "__main__":
    main()
