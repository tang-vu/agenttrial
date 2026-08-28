# P26-002 credential-free LLM judge freeze

The frozen baseline is the official `Qwen/Qwen3-4B-GGUF` Q4_K_M artifact under Apache-2.0, executed locally with a pinned CPU build of `llama.cpp`. The model binary is not committed.

## Integrity pins

- Model revision: `bc640142c66e1fdd12af0bd68f40445458f3869b`
- Model SHA-256: `7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5`
- Model bytes: `2497280256`
- llama.cpp release: `v0.3.0`
- llama.cpp commit: `c1d0e7a004015f23bc0233470b747b596f29b264`
- CPU threads: `8`
- Context: `4096`
- Temperature: `0`
- Seed: `26002`
- Reasoning: `off`

## Selection record

Attempt 0 is retained and failed: unconstrained rationales reached the 80-token output limit, so only 24 of 48 outputs parsed. No selection threshold was changed.

Attempt 1 changed only the EBNF output grammar to cap the rationale at 120 safe characters and retained the same model, rubric, 24 cases, two repeats, seed, and gates. It passed 48 of 48 strict parses, 48 of 48 verdicts, zero false acceptances, zero false rejections, and complete verdict repeatability. These deliberately clear held-out synthetic cases select a baseline; they are not efficacy evidence and must never be pooled with the main study.

The pinned runtime's generic JSON Schema sampler failed during initialization. The frozen path therefore uses the versioned minimal EBNF grammar plus strict application parsing. This limitation must remain visible in replication instructions.

## Files

- `calibration-attempt-0-summary.json` and `calibration-attempt-0-manifest.ndjson`: immutable failed attempt
- `calibration-summary.json` and `calibration-manifest.ndjson`: passing attempt 1
- `runtime-benchmark.json`: local hardware and throughput used to choose eight CPU threads

Regenerate without a paid API:

```bash
AGENTTRIAL_LLAMA_SERVER=/path/to/llama-server \
AGENTTRIAL_LLM_MODEL=/path/to/Qwen3-4B-Q4_K_M.gguf \
pnpm research:calibrate-judge
```
