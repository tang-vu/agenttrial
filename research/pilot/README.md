# P26-002 credential-free engineering pilot

This directory contains a deterministic integration run for the P26-002 measurement pipeline.

- `run-manifest.ndjson` contains 960 records from 80 synthetic fault configurations, 80 matched synthetic controls, two repeats, and three credential-free evaluation modes.
- `summary.json` exercises the registered interval, paired-test, and hierarchical-bootstrap paths.
- `tamper-summary.json` records first-mismatch checks for the nine locked bundle mutations.

## Interpretation boundary

These are synthetic engineering fixtures constructed to exercise known evaluator branches. The results validate plumbing only. They are not evidence of real-world efficacy, superiority, generalization, novelty, or publication-ready findings, and they must not be used in a paper's main results.

The engineering pilot excludes the now-frozen zero-cost local LLM judge, so its three-mode manifest remains a fast deterministic plumbing check. Judge selection and both calibration attempts are isolated under `research/llm-judge`; a separate smoke run must validate judge integration before the preregistered main run. The nearest-work audit supports only a conditional, narrowed evaluator-meta-evaluation claim. Power analysis is frozen; the main study remains blocked on independent targets, independent ground truth, authorization and data-governance approval, and the full 20-repeat run.

Regenerate locally without GitHub Actions:

```bash
pnpm research:freeze
pnpm research:power
pnpm research:pilot
```
