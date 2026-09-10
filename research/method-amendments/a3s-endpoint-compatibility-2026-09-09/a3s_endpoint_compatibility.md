# P26-002 A3S endpoint compatibility and frame correction

Status: revised inactive candidate frame; zero endpoint-ready pairs  
Date: 2026-09-09  
Parent PR head: `986ca587e754b751c42cc5dfa84d1c966dcaac29`

## Result

The prior 69-pair A3S source frame closed the numerical content gap but did not establish endpoint feasibility. Direct inspection of all 201 eligible source pairs found no deterministic expected-final-output, assertion, gold-answer, or oracle field. A3S instead evaluates harmful and benign runs with LLM-as-Judge, including tool-chain evidence. Those upstream verdicts cannot be transported into P26-002's deterministic final-output-only primary comparator.

Accordingly, **0/69 pairs are endpoint-ready**. No pair is activated, executed, or counted toward achieved power.

## Retrospective frame correction

The previous source-only selection placed 44/69 pairs (63.8%) in one risk category. The revised inactive frame uses max-min water-filled risk quotas and proportional scenario quotas. It reduces the largest risk cell to 13/69 (18.8%) while retaining all ten risks and six scenarios.

| Risk category               | Available | Previous | Revised |
| --------------------------- | --------: | -------: | ------: |
| Configuration Tampering     |        16 |        5 |      12 |
| Dangerous Command Execution |        16 |        5 |      12 |
| Data Exfiltration           |         6 |        1 |       6 |
| Information Leakage         |         7 |        4 |       7 |
| Jailbreak Attack            |         1 |        1 |       1 |
| Malicious Skill             |       116 |       44 |      13 |
| Memory Tampering            |        33 |        6 |      12 |
| Privilege Escalation        |         2 |        1 |       2 |
| Resource Exhaustion         |         1 |        1 |       1 |
| Sandbox Escape              |         3 |        1 |       3 |

| Scenario              | Available | Previous | Revised |
| --------------------- | --------: | -------: | ------: |
| Code Development      |        38 |       13 |      13 |
| Data Analysis         |        35 |       12 |      12 |
| Document Review       |        41 |       14 |      14 |
| File Management       |        30 |       11 |      11 |
| System Administration |        30 |       10 |      10 |
| Web Browsing          |        27 |        9 |       9 |

## Paired-source isolation

Among the revised 69 pairs, 24 preserve setup, turn count, tool-name sequence, and every unflagged corresponding turn. The remaining 45 differ on at least one of those dimensions. Structural exactness is maximized subject to the frozen risk and scenario margins, but it is only an isolation diagnostic; it is not construct validation or an outcome.

## Scientific boundary

The revised ledger is selected without target-model outputs, benchmark verdicts, or human labels. It supersedes only the previous inactive A3S candidate selection. The registered 80-pair frame, historical protocol evidence, and all governance gates remain unchanged.

Before any A3S pair can enter the trial, it needs source-locked deterministic final-output criteria, independent blinded construct review, and unique fault/control executions. `candidateSourceActivated=false`, `mainTrialAllowed=false`, `releaseAllowed=false`, and `submissionAllowed=false`.
