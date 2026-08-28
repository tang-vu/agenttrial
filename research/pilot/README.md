# P26-002 credential-free engineering pilot

This directory contains a deterministic integration run for the P26-002 measurement pipeline.

- `run-manifest.ndjson` contains 768 records from 64 synthetic fault configurations, 64 matched synthetic controls, two repeats, and three credential-free evaluation modes.
- `summary.json` exercises the registered interval, paired-test, and hierarchical-bootstrap paths.
- `tamper-summary.json` records first-mismatch checks for the nine locked bundle mutations.

## Interpretation boundary

These are synthetic engineering fixtures constructed to exercise known evaluator branches. The results validate plumbing only. They are not evidence of real-world efficacy, superiority, generalization, novelty, or publication-ready findings, and they must not be used in a paper's main results.

The LLM-judge baseline remains excluded until a zero-cost local model, runtime, prompt, and output schema are frozen. The nearest-work audit now supports only a conditional, narrowed evaluator-meta-evaluation claim. The preregistered main study remains blocked on power analysis, independent targets, authorization and data-governance approval, and the full 20-repeat run.

Regenerate locally without GitHub Actions:

```bash
pnpm research:freeze
pnpm research:pilot
```
