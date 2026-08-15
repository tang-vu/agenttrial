# AgentTrial

> **AI agents make claims. AgentTrial makes them prove it.**

The evidence layer for agent marketplaces. AgentTrial discovers an agent’s advertised capabilities, seals claim-specific adversarial trials before execution, verifies observations with deterministic assertions, and signs a tamper-evident evidence bundle.

![AgentTrial landing page](docs/screenshots/landing.png)

The credential-free demo is real execution, not a replay: each run receives a new UUID and seed commitment, executes nine controlled scenarios, streams hash-chained events, calculates a code-driven score, and signs a new Ed25519 receipt.

## Three-minute local quickstart

Requirements: Node.js 24+, Corepack, and pnpm 11.

```bash
corepack enable
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), choose **Run a live trial**, then select either controlled fixture. No OpenAI key, wallet, GitHub token, database, or account is required.

```bash
# Full quality gate
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:durable # requires DATABASE_URL and AGENTTRIAL_SIGNING_SEED
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
pnpm audit
pnpm secret-scan
```

## What is implemented

- Explicit 13-state pipeline from `CREATED` through `COMPLETED`, with illegal-transition rejection and typed cancellation/failure.
- Two live controlled research fixtures: evidence-grounded and intentionally gullible.
- Nine seeded trials spanning core behavior, provenance, injection, conflicts, malformed JSON, timeout recovery, permission scope, efficiency, and repeatability.
- Versioned 100-point deterministic scoring with coverage, confidence, critical findings, and untested claims.
- Canonical JSON hashing, sealed plan, hash-chained events, evidence Merkle root, Ed25519 receipt, and browser-only verifier with first-mismatch reporting.
- Real SSE timeline, full report, bundle download, tamper demo, methodology/security/developer screens, polished errors, and responsive accessibility.
- Current OpenAI Responses API provider with structured Zod output plus a deterministic no-key provider.
- Passive website/OpenAPI/OpenAI-compatible/A2A/GitHub discovery with DNS/IP pinning, redirect revalidation, byte/time budgets, redaction, and explicit low coverage.
- Base Sepolia EAS schema encoding, guarded registration/attestation scripts, and local receipt fallback.
- PostgreSQL snapshots, a `SKIP LOCKED` durable job queue, separate worker, cross-process SSE polling, and private cancellation capabilities.
- OpenAPI 3.1 schemas, a truthful machine descriptor, `llms.txt`, health, and readiness endpoints. A2A is not advertised until its full task lifecycle exists.

## Architecture

```mermaid
flowchart LR
    J[Judge / builder] --> W[Next.js web + API]
    W --> P[(PostgreSQL + durable queue)]
    P --> R[Isolated trial worker]
    R --> D[Discovery + deterministic planner]
    R --> F[Controlled fixture adapter]
    F --> A[Code assertions]
    A --> S[Versioned scorer]
    S --> E[Canonical evidence + Ed25519]
    E --> V[Browser-local verifier]
    E -. optional .-> B[Base Sepolia EAS]
```

Workspace packages separate typed domain logic (`core`), adapters, fixtures, evidence, network safety, planner providers, runtime orchestration, and EAS encoding. Without `DATABASE_URL`, local development intentionally falls back to one process; Docker Compose enables the durable PostgreSQL/worker path.

## Environment

Copy `.env.example` to `.env.local`. All values are optional for the controlled demo.

| Variable                        | Purpose                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| `OPENAI_API_KEY`                | Enables the optional real planner; server-only.                                            |
| `OPENAI_MODEL`                  | Required with the key; deliberately no hard-coded model default.                           |
| `AGENTTRIAL_SIGNING_SEED`       | 64 hex characters for a stable Ed25519 development/service identity. Use a secret manager. |
| `NEXT_PUBLIC_APP_URL`           | Canonical deployment origin.                                                               |
| `EAS_RPC_URL`                   | Base Sepolia RPC URL.                                                                      |
| `EAS_PRIVATE_KEY`               | Testnet attestor wallet; server/script only.                                               |
| `EAS_SCHEMA_UID`                | Registered AgentTrial schema UID.                                                          |
| `REPORT_URI`                    | Optional public evidence/report URI for the attestation.                                   |
| `AGENTTRIAL_TRUSTED_PUBLIC_KEY` | Pinned Ed25519 public key required by the guarded attestation script.                      |
| `DATABASE_URL`                  | Enables durable snapshots and queued worker execution.                                     |
| `AGENTTRIAL_TRUST_PROXY`        | Trust `x-real-ip` only behind a configured sanitizing proxy.                               |

Never prefix private values with `NEXT_PUBLIC_`. An ephemeral signing key is generated at process start when no seed is configured; that is convenient locally but not a stable production identity.

## Base Sepolia / EAS

The schema uses Base Sepolia chain ID `84532`, EAS `0x4200…0021`, and Schema Registry `0x4200…0020`. Scripts refuse to broadcast unless the exact `--confirm-base-sepolia` flag is supplied.

```bash
pnpm eas:register --confirm-base-sepolia
pnpm eas:attest agenttrial-RUN_ID.json --confirm-base-sepolia
pnpm eas:verify agenttrial-RUN_ID.json 0xATTESTATION_UID
```

These commands spend Base Sepolia test ETH. Mainnet broadcasting is intentionally unsupported by the scripts. Attestation failure never blocks the signed local report.

## Deploy

For the durable local stack, generate a shared signing seed and start PostgreSQL, web, and worker:

```bash
$env:AGENTTRIAL_SIGNING_SEED = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
docker compose up --build
```

The containers run as non-root users with read-only filesystems, no Linux capabilities, and `no-new-privileges`. Passive HTTP discovery is enabled; browser navigation and arbitrary external active tests remain disabled.

GitHub Actions runs the complete quality gate with PostgreSQL. Manually approved workflows can publish immutable web/worker images to GHCR or attest a reviewed bundle on Base Sepolia; both require an explicit confirmation input and protected environment approval.

## Documentation

- [Architecture](docs/architecture.md)
- [Evaluation methodology](docs/methodology.md)
- [Threat model](docs/threat-model.md)
- [Responsible use](docs/responsible-use.md)
- [API](docs/api.md)
- [Deployment](docs/deployment.md)
- [Demo script](docs/demo-script.md)
- [Orion submission copy](docs/submission.md)
- [Judging map](docs/judging-map.md)
- [Launch plan](docs/launch-plan.md)
- [Limitations](docs/limitations.md)
- [Contributing](CONTRIBUTING.md)

## License

Apache-2.0. See [LICENSE](LICENSE).
