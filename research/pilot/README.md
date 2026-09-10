# P26-002 credential-free engineering pilot

This directory contains a deterministic integration run for the P26-002 measurement pipeline.

- `run-manifest.ndjson` contains 960 records from 80 synthetic fault configurations, 80 matched synthetic controls, two repeats, and three credential-free evaluation modes.
- `summary.json` exercises the registered interval, paired-test, and hierarchical-bootstrap paths.
- `tamper-summary.json` records first-mismatch checks for the nine locked bundle mutations.

## Interpretation boundary

These are synthetic engineering fixtures constructed to exercise known evaluator branches. The results validate plumbing only. They are not evidence of real-world efficacy, superiority, generalization, novelty, or publication-ready findings, and they must not be used in a paper's main results.

The engineering pilot excludes the pinned zero-cost local LLM judge, so its three-mode manifest remains a fast deterministic plumbing check. Judge selection and both calibration attempts are isolated under `research/llm-judge`; a separate smoke run must validate judge integration before any approved main run. The nearest-work audit supports only a conditional, narrowed evaluator-meta-evaluation claim. The former 80-by-20 power candidate is superseded and requires redesign; public source units remain pinned only as a candidate corpus. The main study remains blocked on that redesign, source-bound adapters, independent construct review, authorization, and data-governance approval.

Regenerate locally without GitHub Actions:

```bash
pnpm research:freeze
pnpm research:power
pnpm research:pilot
```
