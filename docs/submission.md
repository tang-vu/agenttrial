# Orion submission copy

## Submission links

- Live product: https://agenttrial.tangvu.dev
- Head-to-head benchmark: https://agenttrial.tangvu.dev/benchmark
- Narrated 116-second demo: https://agenttrial.tangvu.dev/demo/agenttrial-live-demo-narrated.mp4
- Source and reproducibility: https://github.com/tang-vu/agenttrial
- Immutable source snapshot: https://github.com/tang-vu/agenttrial/releases/tag/v0.7.0
- Anchored production report: https://agenttrial.tangvu.dev/reports/17462463-066f-485d-87b7-ae011b0de19f
- Base Sepolia attestation: https://base-sepolia.easscan.org/attestation/view/0xc62f196d7486b6463668aff181fe52daa87f362fa665823d44bb9ad348ff594c
- Machine-readable methodology: https://agenttrial.tangvu.dev/api/methodology

## Orion field map

- Category: Risk
- Target chain: Base
- Website: https://agenttrial.tangvu.dev
- Demo: https://agenttrial.tangvu.dev/demo/agenttrial-live-demo-narrated.mp4
- GitHub: https://github.com/tang-vu/agenttrial
- Strategy: Evidence-first capability verification with sealed adversarial trials and deterministic scoring
- Required social fields: the project X profile plus either its Discord or Telegram link must be supplied by the owner at submission time

## Submission boundary

The v0.7.0 release is the immutable source snapshot for judging. Later research commits do not alter
the signed production report, its evaluator-build commitment, or its onchain attestation. The live
deployment, benchmark, methodology endpoint, production report, video, and EAS attestation were all
verified reachable on 2026-08-28.

The Orion gallery API did not yet list AgentTrial at the time of this audit. Registration requires a
free signature from the submitting wallet. Final submission then requires that registered wallet on
Base, the standard non-refundable ignition fee of about USD 10 in ETH plus gas, and the required
social links. These wallet actions are intentionally not automated by the repository.

## Name

AgentTrial

## Tagline

AI agents make claims. AgentTrial makes them prove it.

## One-line positioning

The evidence layer for agent marketplaces.

## Description

Orion verifies that an agent exists. AgentTrial proves that it works.

AgentTrial autonomously discovers advertised capabilities, constructs claim-specific hidden trials, seals the plan before execution, runs bounded functional and adversarial scenarios, verifies concrete observations with deterministic assertions, and signs a tamper-evident evidence receipt. Scores never come from an LLM. Every finding links to inspectable evidence; missing coverage stays explicit.

The public demo needs no account or paid credential. Its live head-to-head arena launches both controlled research agents, seals two independent plans, and reveals a 73.3-point deterministic evidence gap only after both fresh receipts complete. Judges can inspect every state/tool event, report, assertion, and evidence object; download either bundle; verify its seed opening, evaluator build, assertion-registry commitment, hash chain, and Ed25519 signature locally; then change one byte to see the first mismatch. A production receipt is [anchored and independently inspectable on Base Sepolia EAS](https://base-sepolia.easscan.org/attestation/view/0xc62f196d7486b6463668aff181fe52daa87f362fa665823d44bb9ad348ff594c); anchoring remains optional and never blocks the core receipt.

Unlike current Base wallet/token risk entries, AgentTrial serves every agent in Orion Store: builders get reproducible evidence, marketplaces get an interoperable vetting layer, and users can distinguish identity from demonstrated behavior.

## AI role

AgentTrial uses a provider-pluggable AI planner to turn untrusted advertised capabilities into typed,
claim-specific trial plans. The model never assigns points: versioned code assertions remain the
sole score authority. The credential-free controlled benchmark pairs the same deterministic planner
with both fixtures so judges can reproduce the comparison without an account or paid key; the
OpenAI Responses structured-output provider is implemented for authenticated, quota-controlled use.

## Honest status

Controlled evaluation, signed reproducible receipts, passive public discovery, short-lived HTTPS domain-control authorization, the bounded A2A HTTP+JSON 1.0 active adapter, the machine-readable methodology manifest, and the PostgreSQL worker/signer queue are complete and tested. Generic REST execution and public browser navigation remain disabled. ERC-8004 is deferred because the standard remains draft.

## Final submission checklist

1. Deploy the v0.7.0 tag and run `pnpm orion:verify`; confirm production version and build match the checked-out release.
2. Register the intended submission wallet at https://orionagents.org/hackathon.
3. Open https://orionagents.org/submit?hackathon=1 from the same wallet on Base.
4. Copy the field values and description from this document; add the real project X profile and one real Discord or Telegram link.
5. Pay the displayed ignition fee only after confirming the recipient, Base chain, and amount in the wallet.
6. Confirm that AgentTrial appears in https://orionagents.org/api/hackathon/entries and that every public link on its card resolves.
7. Run `pnpm orion:verify --strict`; preserve the JSON output with the final submission record.
8. Record the Orion entry URL or ID in this document without moving the v0.7.0 tag.
