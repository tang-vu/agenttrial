#!/usr/bin/env python3
"""Build the P26-002 public fixed-upstream source-expansion feasibility audit."""
from __future__ import annotations

import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
INPUT = ROOT / "source_expansion_snapshot.json"
OUT_JSON = ROOT / "source_expansion_feasibility.json"
OUT_MD = ROOT / "source_expansion_feasibility.md"
VALIDATION = ROOT / "validation.json"


def canonical_json(value: object) -> str:
    return json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    snap = json.loads(INPUT.read_text(encoding="utf-8"))
    chaos = snap["agentchaosbench"]["artifacts"]
    controls = snap["agentdojo"]["controlsAssessed"]
    attacks = snap["agentdojo"]["importantInstructionsRunsAssessedForEligibleControls"]

    chaos_faults = [x for x in chaos if x["condition"] == "fault"]
    chaos_controls = [x for x in chaos if x["condition"] == "control"]
    chaos_registered = [x for x in chaos if x["registeredTargetId"]]
    chaos_additional = [x for x in chaos if not x["registeredTargetId"]]
    eligible_controls = [
        x for x in controls
        if x["utility"] is True and x["security"] is True and x["error"] is None
    ]
    eligible_faults = [
        x for x in attacks if x["security"] is False and x["error"] is None
    ]
    fault_counts = Counter(x["key"] for x in eligible_faults)
    pairable_controls = [x for x in eligible_controls if fault_counts[x["key"]] > 0]
    registered_pairable = [x for x in pairable_controls if x["registeredTargetId"]]

    n_required = snap["confirmatoryDesign"]["requiredPairedUniqueExecutionIdentities"]
    archival_pair_ceiling = len(chaos_controls) + len(pairable_controls)
    gap = n_required - archival_pair_ceiling

    chaos_by_type = dict(sorted(Counter(x["faultType"] for x in chaos).items()))
    chaos_by_system = dict(sorted(Counter(x["system"] for x in chaos).items()))
    dojo_by_suite = {}
    for suite in sorted({x["suite"] for x in controls}):
        suite_controls = [x for x in controls if x["suite"] == suite]
        suite_eligible = [x for x in pairable_controls if x["suite"] == suite]
        suite_faults = [x for x in eligible_faults if x["suite"] == suite]
        dojo_by_suite[suite] = {
            "noAttackRunsAssessed": len(suite_controls),
            "eligiblePairableControlIdentities": len(suite_eligible),
            "eligibleFaultArtifacts": len(suite_faults),
        }

    result = {
        "schemaVersion": "p26-002-source-expansion-feasibility-0.1.0",
        "status": "feasibility-only-blocked-for-confirmatory-use",
        "scope": snap["scope"],
        "createdOn": snap["createdOn"],
        "parentStudyCommit": snap["parentStudyCommit"],
        "inputSha256": sha256_bytes(INPUT.read_bytes()),
        "confirmatoryRequirement": {
            "pairedUniqueExecutionIdentities": n_required,
            "publicFixedUpstreamArchivalPairCeiling": archival_pair_ceiling,
            "remainingGap": gap,
            "ceilingInterpretation": "At most one fault artifact is paired to each distinct control execution identity.",
        },
        "agentchaosbench": {
            "allTraceArtifacts": len(chaos),
            "faultArtifacts": len(chaos_faults),
            "controlArtifacts": len(chaos_controls),
            "uniqueGitBlobs": len({x["gitBlobSha"] for x in chaos}),
            "registeredArtifacts": len(chaos_registered),
            "additionalArtifactsOutsideRegisteredFrame": len(chaos_additional),
            "additionalFaultArtifacts": sum(x["condition"] == "fault" for x in chaos_additional),
            "additionalControlArtifacts": sum(x["condition"] == "control" for x in chaos_additional),
            "byFaultType": chaos_by_type,
            "bySystem": chaos_by_system,
        },
        "agentdojoCommandRPlus": {
            "noAttackRunsAssessed": len(controls),
            "noAttackRunsPassingPublishedUtilitySecurityAndErrorRule": len(eligible_controls),
            "importantInstructionsRunsAssessedOnEligibleControlKeys": len(attacks),
            "publishedSecurityFailuresOnEligibleControlKeys": len(eligible_faults),
            "pairableUniqueControlExecutionIdentities": len(pairable_controls),
            "registeredPairableControlIdentities": len(registered_pairable),
            "faultMultiplicityAcrossPairableControls": {
                "minimum": min((fault_counts[x["key"]] for x in pairable_controls), default=0),
                "maximum": max((fault_counts[x["key"]] for x in pairable_controls), default=0),
                "counts": dict(sorted((x["key"], fault_counts[x["key"]]) for x in pairable_controls)),
            },
            "bySuite": dojo_by_suite,
        },
        "decision": {
            "finding": "The fault side is numerically abundant, but unique successful control executions are the binding constraint.",
            "registeredFrameChanged": False,
            "mainTrialEvidenceCreated": False,
            "mainTrialAllowed": False,
            "submissionAllowed": False,
            "machineRecommendation": "Do not reinterpret the archival pool as a powered confirmatory frame. A prospective source/execution amendment needs at least 133 additional unique matched controls or a separately powered estimand, plus independent construct and method approval.",
        },
        "limitations": [
            "The two sources instantiate different systems and fault mechanisms; counts are not exchangeable effect observations.",
            "AgentChaosBench has 250 distinct fault artifacts but only 25 aligned no-fault artifacts, so reusing controls does not create independent pairs.",
            "AgentDojo rows were filtered after published utility and security outcomes were available; this is feasibility evidence, not a prospectively sampled confirmatory cohort.",
            "Published upstream labels are not independent P26-002 review and do not satisfy construct approval or gate-side evidence reconstruction.",
            "Only the command-r-plus AgentDojo pipeline was inspected to preserve the already registered pipeline context; other pipelines were not silently added.",
        ],
    }

    table = []
    for row in pairable_controls:
        table.append({
            "key": row["key"],
            "suite": row["suite"],
            "controlPath": row["path"],
            "controlGitBlobSha": row["gitBlobSha"],
            "eligiblePublishedFaultArtifacts": fault_counts[row["key"]],
            "registeredTargetId": row["registeredTargetId"],
        })
    result["agentdojoPairableControlMatrix"] = table

    md = f"""# P26-002 public fixed-upstream source-expansion feasibility audit

Status: feasibility only; no main-trial evidence  
Date: {snap["createdOn"]}  
Parent study commit: `{snap["parentStudyCommit"]}`

## Question

Can the already pinned public archives supply the {n_required} unique fault/control execution pairs required by the 2026-09-09 exact design, without treating reused bindings or replayed files as new observations?

## Result

The fault side is not the numerical bottleneck. The pinned AgentChaosBench revision contains **{len(chaos_faults)} distinct fault artifacts** across {len(chaos_by_type) - 1 if "no_fault" in chaos_by_type else len(chaos_by_type)} fault types and **{len(chaos_controls)} distinct no-fault artifacts** across {len(chaos_by_system)} systems. Of its {len(chaos)} trace artifacts, {len(chaos_additional)} lie outside the registered 50-artifact subset ({sum(x["condition"] == "fault" for x in chaos_additional)} faults and {sum(x["condition"] == "control" for x in chaos_additional)} controls).

For the already registered AgentDojo `command-r-plus` context, the audit read all **{len(controls)}** published no-attack runs. **{len(eligible_controls)}** have `utility=true`, `security=true`, and no run error. Among their {len(attacks)} published `important_instructions` runs, {len(eligible_faults)} have `security=false` and no run error, spanning **{len(pairable_controls)} unique control execution identities**. Only {len(registered_pairable)} of those identities correspond to a currently registered target.

Counting at most one pair per physical control identity, the two fixed upstream archives provide a ceiling of **{archival_pair_ceiling} pairs** ({len(chaos_controls)} AgentChaosBench plus {len(pairable_controls)} AgentDojo), leaving **{gap} pairs** below the required {n_required}. The 143 AgentDojo fault artifacts do not become 143 independent pairs because they share 23 controls. Likewise, pairing 250 AgentChaosBench faults to 25 no-fault traces would reuse controls.

## Source-specific counts

| Source | Fault artifacts available | Unique qualifying control identities | Maximum one-to-one archival pairs |
|---|---:|---:|---:|
| AgentChaosBench at pinned revision | {len(chaos_faults)} | {len(chaos_controls)} | {len(chaos_controls)} |
| AgentDojo `command-r-plus` published runs | {len(eligible_faults)} | {len(pairable_controls)} | {len(pairable_controls)} |
| **Combined ceiling** | **{len(chaos_faults) + len(eligible_faults)}** | **{archival_pair_ceiling}** | **{archival_pair_ceiling}** |

AgentDojo suite breakdown:

| Suite | No-attack runs assessed | Pairable qualifying controls | Published security-failure artifacts |
|---|---:|---:|---:|
"""
    for suite, vals in dojo_by_suite.items():
        md += f"| {suite} | {vals['noAttackRunsAssessed']} | {vals['eligiblePairableControlIdentities']} | {vals['eligibleFaultArtifacts']} |\n"
    md += f"""
## Interpretation

This closes a source-feasibility question but does not unlock the trial. The existing public archives cannot satisfy the current {n_required}-pair design under unique physical control identity. A powered confirmatory extension therefore requires at least **{gap} additional unique matched control executions** (with corresponding faults) or a prospectively justified and independently approved change of estimand and power target.

The imbalance is structural, not a missing-file problem. More AgentChaosBench fault paths increase fault diversity without increasing independent controls. More AgentDojo injection variants increase fault multiplicity while reusing the same no-attack execution. Those increments must not be counted as new paired observations.

## Retrospective status and non-use

This audit was performed after upstream outcomes were published. AgentDojo candidates were identified using published utility and security fields, so the matrix is outcome-conditioned feasibility evidence. It may guide a prospective amendment, but it cannot be inserted into the confirmatory denominator or described as an unbiased sample. The registered 80-target frame, human construct-review gate, method-freeze gate, trusted-runner requirements, and all submission restrictions remain unchanged.

No source payload, prompt, trajectory, private datum, credential, human label, signature, or approval is stored here. The snapshot contains only public paths, Git blob identifiers, sizes, and published boolean outcome fields needed to reproduce the counts.

## Decision

Do not run or report the current trial as confirmatory from these archives. The machine-valid next route is a prospective source/execution amendment that adds at least {gap} unique matched controls, freezes a selection rule before evaluator outcomes, and obtains the existing independent approvals. If that route is infeasible, a separately powered fixed-corpus estimand must be proposed rather than weakening the uniqueness rule.
"""
    OUT_JSON.write_text(canonical_json(result), encoding="utf-8")
    OUT_MD.write_text(md, encoding="utf-8")

    checks = {
        "snapshotSchema": snap["schemaVersion"] == "p26-002-source-expansion-snapshot-0.1.0",
        "chaosTraceCount": len(chaos) == 275,
        "chaosUniqueBlobCount": len({x["gitBlobSha"] for x in chaos}) == 275,
        "chaosFaultCount": len(chaos_faults) == 250,
        "chaosControlCount": len(chaos_controls) == 25,
        "chaosRegisteredCount": len(chaos_registered) == 50,
        "dojoControlsAssessed": len(controls) == 97,
        "dojoEligibleControls": len(eligible_controls) == 24,
        "dojoAttacksAssessed": len(attacks) == 160,
        "dojoEligibleFaults": len(eligible_faults) == 143,
        "dojoPairableControls": len(pairable_controls) == 23,
        "archivalPairCeiling": archival_pair_ceiling == 48,
        "remainingGap": gap == 133,
        "noReadinessPromotion": result["decision"]["mainTrialEvidenceCreated"] is False and result["decision"]["mainTrialAllowed"] is False,
        "noSubmissionPromotion": result["decision"]["submissionAllowed"] is False,
    }
    validation = {
        "schemaVersion": "p26-002-source-expansion-validation-0.1.0",
        "status": "passed" if all(checks.values()) else "failed",
        "checks": checks,
        "inputSha256": result["inputSha256"],
        "outputSha256": {
            OUT_JSON.name: sha256_bytes(OUT_JSON.read_bytes()),
            OUT_MD.name: sha256_bytes(OUT_MD.read_bytes()),
        },
    }
    VALIDATION.write_text(canonical_json(validation), encoding="utf-8")
    if validation["status"] != "passed":
        raise SystemExit("validation failed")


if __name__ == "__main__":
    main()

