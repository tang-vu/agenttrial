# P26-002 public fixed-upstream source-expansion feasibility audit

Status: feasibility only; no main-trial evidence  
Date: 2026-09-09  
Parent study commit: `cf32bf5bfc0bdd11738feda3b814f4d0ed77947f`

## Question

Can the already pinned public archives supply the 181 unique fault/control execution pairs required by the 2026-09-09 exact design, without treating reused bindings or replayed files as new observations?

## Result

The fault side is not the numerical bottleneck. The pinned AgentChaosBench revision contains **250 distinct fault artifacts** across 10 fault types and **25 distinct no-fault artifacts** across 5 systems. Of its 275 trace artifacts, 225 lie outside the registered 50-artifact subset (210 faults and 15 controls).

For the already registered AgentDojo `command-r-plus` context, the audit read all **97** published no-attack runs. **24** have `utility=true`, `security=true`, and no run error. Among their 160 published `important_instructions` runs, 143 have `security=false` and no run error, spanning **23 unique control execution identities**. Only 3 of those identities correspond to a currently registered target.

Counting at most one pair per physical control identity, the two fixed upstream archives provide a ceiling of **48 pairs** (25 AgentChaosBench plus 23 AgentDojo), leaving **133 pairs** below the required 181. The 143 AgentDojo fault artifacts do not become 143 independent pairs because they share 23 controls. Likewise, pairing 250 AgentChaosBench faults to 25 no-fault traces would reuse controls.

## Source-specific counts

| Source                                    | Fault artifacts available | Unique qualifying control identities | Maximum one-to-one archival pairs |
| ----------------------------------------- | ------------------------: | -----------------------------------: | --------------------------------: |
| AgentChaosBench at pinned revision        |                       250 |                                   25 |                                25 |
| AgentDojo `command-r-plus` published runs |                       143 |                                   23 |                                23 |
| **Combined ceiling**                      |                   **393** |                               **48** |                            **48** |

AgentDojo suite breakdown:

| Suite     | No-attack runs assessed | Pairable qualifying controls | Published security-failure artifacts |
| --------- | ----------------------: | ---------------------------: | -----------------------------------: |
| banking   |                      16 |                            6 |                                   51 |
| slack     |                      21 |                            2 |                                   10 |
| travel    |                      20 |                            0 |                                    0 |
| workspace |                      40 |                           15 |                                   82 |

## Interpretation

This closes a source-feasibility question but does not unlock the trial. The existing public archives cannot satisfy the current 181-pair design under unique physical control identity. A powered confirmatory extension therefore requires at least **133 additional unique matched control executions** (with corresponding faults) or a prospectively justified and independently approved change of estimand and power target.

The imbalance is structural, not a missing-file problem. More AgentChaosBench fault paths increase fault diversity without increasing independent controls. More AgentDojo injection variants increase fault multiplicity while reusing the same no-attack execution. Those increments must not be counted as new paired observations.

## Retrospective status and non-use

This audit was performed after upstream outcomes were published. AgentDojo candidates were identified using published utility and security fields, so the matrix is outcome-conditioned feasibility evidence. It may guide a prospective amendment, but it cannot be inserted into the confirmatory denominator or described as an unbiased sample. The registered 80-target frame, human construct-review gate, method-freeze gate, trusted-runner requirements, and all submission restrictions remain unchanged.

No source payload, prompt, trajectory, private datum, credential, human label, signature, or approval is stored here. The snapshot contains only public paths, Git blob identifiers, sizes, and published boolean outcome fields needed to reproduce the counts.

## Decision

Do not run or report the current trial as confirmatory from these archives. The machine-valid next route is a prospective source/execution amendment that adds at least 133 unique matched controls, freezes a selection rule before evaluator outcomes, and obtains the existing independent approvals. If that route is infeasible, a separately powered fixed-corpus estimand must be proposed rather than weakening the uniqueness rule.
