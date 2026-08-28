# Deployment

## Durable deployment

```bash
export AGENTTRIAL_SIGNING_SEED=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
docker compose up --build
```

Compose starts PostgreSQL, the Next.js web service, a separately scalable queue worker, and a dedicated signer. Only the signer receives the managed seed; web and the target-facing worker have no signing authority. The signer is attached only to the internal database network, recomputes the plan, observations, assertions, score, roots, and references, then publishes the public key registry through PostgreSQL.

### Durable workstation origin

On the AgentTrial Windows origin, Docker Engine can run that same topology behind the named
Cloudflare Tunnel on loopback port 4179. The existing managed signing seed remains outside the
repository under `%LOCALAPPDATA%\AgentTrial\tunnel` and is forwarded only to the signer container.

```powershell
.\scripts\install-durable-autostart.ps1
```

The installer adds `agenttrial-stack` and `agenttrial-tunnel` to the workstation's existing PM2
process list, saves that list for resurrection after login, and removes the legacy per-project
scheduled task. The stack supervisor waits for Docker and PostgreSQL, repairs stale worker/signer
connections after Docker daemon restarts, and continuously checks readiness. Every container also
uses `restart: unless-stopped`. Run `stop-local-tunnel.ps1` for a scoped stop, or pass
`-DisableAutostart` to remove the two AgentTrial entries from the saved PM2 process list.
`install-local-autostart.ps1` is intentionally guarded as an ephemeral demo-only fallback; it must
never be used for the public origin because it has no durable queue or isolated signer.
Use `AGENTTRIAL_IMPORT_DIR` with `scripts/import-snapshots.mts` once when migrating prior
single-node JSON receipts into PostgreSQL.

The installer also registers a least-privilege daily PostgreSQL backup at 03:00 local time.
Backups are custom-format `pg_dump` archives under `%LOCALAPPDATA%\AgentTrial\backups`, are
validated with `pg_restore --list`, receive a SHA-256 metadata sidecar, and retain the newest 14
archives. Run an immediate backup with:

```powershell
.\scripts\backup-durable.ps1
pnpm test:restore
```

The restore drill loads the newest archive into a uniquely named temporary database, validates the
restored schema and run rows, then removes only that isolated database. It never overwrites the live
`agenttrial` database.

Copy backups to a separately encrypted/off-host location for real disaster recovery. A local
backup protects against database/container loss, not physical disk or account compromise.

For a single-node deployment, set `AGENTTRIAL_DATA_DIR` to an access-controlled persistent directory. The in-process executor then writes each run snapshot atomically, so completed reports and bundles survive application or machine restarts. `AGENTTRIAL_RETENTION_DAYS` defaults to 30 and cleanup runs during readiness checks. Terminal in-memory runs are capped separately. This is not a substitute for PostgreSQL and the worker queue when horizontally scaling.

For Vercel, use the repository root for web only and point `DATABASE_URL` at managed PostgreSQL; deploy the worker target to Railway/Render/Fly. Do not rely on a serverless request continuing background execution.

## Production hardening still required

1. Versioned migration-only credentials and API idempotency records. The worker enforces
   terminal-run retention and the workstation creates verified local backups; production operators
   must additionally test encrypted off-host restores.
2. LISTEN/NOTIFY or Redis pub-sub can replace the current bounded PostgreSQL SSE polling at higher scale.
3. A separate browser worker with denied private-network egress, non-root Chromium, no receipt key, and strict quotas before enabling browser tests.
4. Replace the dedicated signer container's seed with managed KMS/HSM signing for higher-assurance deployments.
5. Immutable object storage for canonical bundles and a pinned public-key registry.

## Base Sepolia

Fund a dedicated testnet-only wallet, set `EAS_RPC_URL`, `EAS_PRIVATE_KEY`, `EAS_SCHEMA_UID`, `AGENTTRIAL_TRUSTED_PUBLIC_KEY`, and `EAS_ATTESTATION_ENABLED=true`. Review the completed receipt and report URI, then run `pnpm eas:attest RUN_UUID --confirm-base-sepolia`. The workflow is idempotent, persists transaction/UID state, and verifies the mined chain, schema, attestor, revocation/expiry, and every decoded receipt field before marking the attachment anchored. Never reuse a mainnet private key. Mainnet is intentionally blocked.

## GitHub delivery workflows

- `quality-gate` provisions PostgreSQL and verifies the durable queue in addition to all unit, build, browser and security checks.
- `publish-deployment-images` builds separate web, worker, and signer targets and pushes them to GHCR only after the operator types `PUBLISH` and approves the `production` environment.
- `attest-base-sepolia` downloads a reviewed HTTPS bundle, verifies its trusted receipt locally, and broadcasts only after `ATTEST_BASE_SEPOLIA` plus approval of the protected `base-sepolia` environment.
