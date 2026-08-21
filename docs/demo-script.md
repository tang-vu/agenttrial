# 100–115-second demo script

Reproduce the silent, captioned product capture against the live origin with `pnpm demo:record`.
Set `DEMO_BASE_URL` to capture another reviewed deployment. The command creates
`docs/demo/agenttrial-live-demo.mp4` and refreshes the principal screenshots from real runs.

For the narrated edition, set a rotated **regular/pay-as-you-go** MiMo API key locally and run
`pnpm demo:voice`. The pipeline uses `mimo-v2.5-tts` for narration, runs the generated WAV back
through `mimo-v2.5-asr`, enforces a word-error-rate quality gate, normalizes loudness, and writes
`docs/demo/agenttrial-live-demo-narrated.mp4`. It deliberately rejects `tp-` Token Plan keys because
MiMo limits those keys to coding tools and prohibits non-coding automation.

**0–10s — The gap.** “Orion can verify that an agent exists. AgentTrial proves that it works. Every agent claim deserves evidence.” Click **Run both agents live**.

**10–32s — The proof moment.** Launch both controlled agents together. Point out the two fresh run IDs, independently sealed seeds, progressing event counts, and identical deterministic methodology. Nothing is prerecorded and no account, API key, or wallet is required.

**32–48s — Deterministic separation.** Let the arena resolve to 100 versus 26.7 and the 73.3-point evidence gap. Explain that the gap is not an LLM preference: it is the sum of 28 visible assertion outcomes across two signed bundles.

**48–68s — Autonomy visible.** Open the secure run timeline or report. Call out discovery, normalized claims, pre-execution plan sealing, the real transient failure and bounded retry, repeat execution, evidence capture, and code-driven scoring.

**68–88s — Independent proof.** Open **Verify receipt**. Show the seed opening, evaluator-build and assertion-registry commitments, hash chain, and Ed25519 check running locally in the browser. Click **Modify one byte** and show the first mismatch.

**88–105s — Onchain and marketplace layer.** Open the report's Base Sepolia anchor and show the live EAS schema, attestor, evidence-bound payload, and transaction. Flash the machine-readable methodology manifest and ownership-gated A2A evaluator. Close: “Identity says who the agent is. AgentTrial proves what it did. AI agents make claims. AgentTrial makes them prove it.”
