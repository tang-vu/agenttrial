# P26-002 A3S-Bench source-expansion feasibility

Status: inactive candidate source frame; no trial evidence  
Date: 2026-09-09  
Parent PR head: `af93adc92c85edcb4bed8273aa0e940c9d3e2563`

## Result

The pinned public A3S-Bench repository contains **424 benign seeds** and **726 injected variants**. All injected rows reference an existing seed; 423 seed clusters have at least one injected variant. Restricting the machine source audit to clusters with no null `tool_response` in either the seed or the chosen injected variant leaves **201 candidate source-task clusters**.

The previous P26-002 dependence audit found 112 existing source-task clusters and a 69-cluster gap to the n=181 planning boundary. This packet freezes **69 A3S seed–variant pairs** selected without model outputs or benchmark outcomes. If every frozen pair later passes construct review and yields one unique control and one unique fault execution, the content frame would reach **112 + 69 = 181 clusters**. This is frame feasibility, not execution evidence or achieved power.

| Source-frame stage                            | Clusters |
| --------------------------------------------- | -------: |
| Existing AgentDojo + AgentChaosBench clusters |      112 |
| A3S eligible linked, non-null clusters        |      201 |
| Frozen A3S candidate pairs                    |       69 |
| Candidate combined frame                      |      181 |
| Unused A3S reserve                            |      132 |

## Prospective selection

Selection uses only pinned source structure. It first assigns proportional quotas across the six scenarios, selects one hash-ranked pair for every observed risk category, and fills each scenario quota by SHA-256 rank over `seed_id:variant_id` with salt `p26-002-a3s-candidate-frame-v1`. The selected-pair ledger hash is `7d98607b03d03a4e0f5e3ba6146b0cd456a4c1d3d0bf592afbafd0c57152970b`.

| Scenario              | Eligible | Selected |
| --------------------- | -------: | -------: |
| Code Development      |       38 |       13 |
| Data Analysis         |       35 |       12 |
| Document Review       |       41 |       14 |
| File Management       |       30 |       11 |
| System Administration |       30 |       10 |
| Web Browsing          |       27 |        9 |

All ten source risk categories and all three seed-generation models remain represented in the 69-pair candidate frame. One injected variant is bound per seed; repeated variants do not create additional clusters.

## Source-version finding

The pinned repository has **1150 rows** (424 seeds plus 726 injected variants), whereas arXiv v2 reports **2254 executable test cases**. The **1104-case difference is unresolved**. P26-002 therefore binds the exact repository commit and blob SHAs and does not substitute the paper total.

The stricter diagnostic requiring identical setup, turn count, tool-name sequence, unchanged non-injection turns, and no null tool responses retains 77 clusters. That count also exceeds 69, but it covers only a narrower subset of perturbations; ASEval explicitly permits perturbations to add turns or change the initialized environment. The primary eligibility rule therefore uses explicit `seed_id` linkage and non-null scripted responses, with construct review still required.

## Scientific boundary

A3S-Bench is a candidate input source, not P26-002 outcome evidence. Its paper evaluates complete trajectories with an action-grounded oracle, while P26-002's primary comparator is final-output-only. No event probabilities, oracle agreement, or reported benchmark outcomes are transported into P26-002.

No target agent or judge was run, no human label or review was created, no private payload was uploaded, and no registered frame was overwritten. `candidateSourceActivated=false`, `mainTrialAllowed=false`, `releaseAllowed=false`, and `submissionAllowed=false`.
