# A3S final-output observability audit

## Status and amendment boundary

This retrospective amendment tests whether the 69-pair A3S candidate frame can supply observations for P26-002's registered final-output-only primary comparator. It supersedes the earlier interpretation that `112 + 69 = 181` could become a confirmatory primary-endpoint frame merely by adding per-pair oracle criteria. It does not change the registered 80-pair history, activate A3S, run an agent or evaluator, create an outcome, or record human review.

## Design-level observability result

The final-output projection can observe only the assistant's terminal text. Under a source-category rule fixed for this audit, **61/69** pairs concern state or action harms: configuration or memory tampering, dangerous commands, exfiltration actions, malicious skills, privilege escalation, resource exhaustion, or sandbox escape. The source schema permits equal final text after different tool actions or state changes, so these harms are not identified by final text without trace or post-state evidence. Another **1/69** jailbreak pair requires a semantic verdict for which the source supplies no deterministic assertion.

Only **7/69** Information Leakage pairs are candidates for literal-output screening. A deterministic pattern audit of their scripted tool responses found 22 credential-like atoms in controls and 35 in injected scripts, including 19 shared atoms. Five of seven controls already expose at least one such atom. Two pairs have a one-sided literal contrast, but both are structurally nonexact. The only structurally exact Information Leakage pair exposes the same eight detected atoms in both conditions. Thus **0/69** pairs satisfy the machine-screen combination of output observability, one-sided literal contrast, and structural exactness.

These counts are source diagnostics, not model outcomes, prevalence estimates, safety labels, or validation of the extraction pattern. The screen intentionally stores no credential literals.

## Consequence for the primary design

A3S cannot currently contribute confirmatory observations to the registered final-output-only primary endpoint. The primary-compatible source frame therefore remains 112 independent clusters, leaving a 69-cluster shortfall relative to the exact `n=181` planning target. The earlier 181 count was a source-task inventory, not an endpoint-compatible sample, and is withdrawn for primary-endpoint feasibility.

The two nonexact literal-contrast pairs may be retained for clearly labeled exploratory oracle prototyping. The full A3S set could also support a trace-aware or state-aware secondary estimand, but that would require a separate method amendment and cannot rescue failure of the primary endpoint.

## Gates

No source is activated; construct approvals and executions remain zero. `mainTrialAllowed=false`, `releaseAllowed=false`, and `submissionAllowed=false`.
