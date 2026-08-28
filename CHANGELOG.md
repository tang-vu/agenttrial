# Changelog

## 0.7.0 - 2026-08-28

- Locked and verified 80 independent research targets, then projected all 50 AgentChaosBench traces
  and ten independently labeled AgentDojo fault runs through label-blinded adapters without retaining
  upstream payloads.
- Added a durable PM2 workstation supervisor for the PostgreSQL, worker, signer, and Cloudflare
  Tunnel deployment while preserving least-privilege service boundaries.
- Reduced the deterministic selected-design Monte Carlo gate from more than 30 seconds to about five
  seconds under load without changing its 3,000-replicate assumptions, seed, or pass criteria.
- Replaced the TypeScript E2E web-server launcher with a dependency-free Node launcher so the same
  quality-gate command starts in restricted cloud environments as well as GitHub and Windows.
- Published an explicit Orion review snapshot and an owner-only final submission checklist.

## 0.6.0 — 2026-08-22

- Published a narrated 116-second live demo with a credential-free Windows narration fallback,
  while retaining the MiMo 2.5 TTS + ASR quality-gated pipeline for regular API keys.
- Anchored and attached a production receipt on Base Sepolia EAS, and added the complete narrated
  proof path to the submission documentation.
- Made the public machine descriptor proxy-safe by pinning endpoint URLs to the configured canonical
  origin and added regression coverage for internal-host leakage.
- Added branded Open Graph, Twitter and application icons plus canonical metadata, robots policy,
  and a sitemap for stronger submission previews and discovery.
- Hardened standalone deployment builds, fixed report capture readiness, and normalized Apache-2.0
  license metadata for the submission release.

## 0.5.0 — 2026-08-17

- Opened post-execution random seeds against their pre-execution commitments and added browser-side
  verification of that opening.
- Bound evaluator build, runtime version, assertion-registry hash, and canonical report schema into
  both the signed report and receipt payload.
- Bumped the deterministic methodology to `agenttrial-1.1.0`; legacy 1.0 receipts remain locally
  verifiable with their explicitly narrower provenance contract.
- Added a live head-to-head benchmark that executes both controlled agents concurrently and exposes
  the dimension-level evidence gap only after two fresh signed receipts complete.
- Published a machine-readable methodology manifest containing the assertion-registry commitment,
  score authority, dimension weights, coverage thresholds, and evaluator build provenance.

## 0.4.0 — 2026-08-16

- Added one-time HTTPS domain-control authorization and a strict, bounded A2A HTTP+JSON 1.0 active
  evaluator with exact card/interface/skill/scope binding.
- Split network execution from receipt signing in durable deployments; the no-egress signer
  recomputes deterministic outputs before issuing a receipt.
- Added renewable fenced worker leases, clean retry-from-input behavior, serialized checkpoints,
  atomic durable cancellation, shared PostgreSQL quotas, queue caps, and terminal-data retention.
- Persisted Base Sepolia EAS attachment lifecycle with idempotent broadcast and decoded onchain-field
  verification, while keeping local receipt completion independent.
- Enforced nonce-based CSP, HSTS on the HTTPS origin, explicit special-use IPv4/IPv6 policy, strict A2A
  schemas, independently pinned verifier keys, and complete OpenAPI evaluation schemas.

## 0.3.0 â€” 2026-08-16

- Added atomic single-node report snapshots, 30-day configurable retention, bounded terminal-run memory, and verified recovery across a killed/restarted web process.
- Added a least-privilege Windows supervisor and Named Tunnel deployment at `agenttrial.tangvu.dev`; neither the repository nor public evaluator runs as `SYSTEM`.
- Removed paid planner calls from anonymous evaluation, rejected secret-bearing URL queries/fragments before run creation, and published a canonical `security.txt` disclosure route.
- Added SSE reconnect/fallback behavior, explicit failed/cancelled screens, and scoped passive reports that show capability score `N/A` instead of a misleading agent score.
- Clarified cryptographic integrity versus independent issuer trust and expanded secret scanning to the working tree, ignored environment files, and full Git history.

## 0.2.0 — 2026-08-15

- Added DNS-pinned passive website, API, OpenAI-compatible, A2A Card, and GitHub discovery.
- Bound the complete report, final event head, and every evidence object to independently trusted receipts; added RFC 8785/JCS and deterministic verdict recomputation.
- Added PostgreSQL snapshots, a durable `SKIP LOCKED` queue, separate worker, cross-process SSE, and cancellation capabilities.
- Replaced simulated retry/repeat flags with measured fixture attempts and independent repeated executions.
- Hardened EAS preflight verification, attestation record checks, OpenAPI schemas, redaction, accessibility coverage, and refreshed product screenshots.
- Added PostgreSQL CI smoke coverage and approval-gated GHCR/Base Sepolia delivery workflows.

## 0.1.0 — 2026-08-14

- Credential-free secure and vulnerable controlled benchmark runs.
- Explicit state machine, seeded plan sealing, deterministic assertion/scoring engine.
- Hash-chained timeline, canonical evidence bundle, Ed25519 signing and browser-local tamper verification.
- Responsive forensic UI, methodology, security, API and error screens.
- OpenAI Responses provider abstraction, SSRF/redaction/budget primitives, Base Sepolia EAS encoding and guarded scripts.
- Unit, integration, Playwright desktop/mobile, API cancellation/consent, and axe accessibility coverage.
