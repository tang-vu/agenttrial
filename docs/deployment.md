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

The least-privilege scheduled task starts Compose after login, waits for PostgreSQL, worker, and
signer readiness, then starts the tunnel. Every container uses `restart: unless-stopped`; the
supervisor also repairs an unhealthy stack or tunnel. Run `stop-local-tunnel.ps1` for a scoped stop.
Use `AGENTTRIAL_IMPORT_DIR` with `scripts/import-snapshots.mts` once when migrating prior
single-node JSON receipts into PostgreSQL.

For a single-node deployment, set `AGENTTRIAL_DATA_DIR` to an access-controlled persistent directory. The in-process executor then writes each run snapshot atomically, so completed reports and bundles survive application or machine restarts. `AGENTTRIAL_RETENTION_DAYS` defaults to 30 and cleanup runs during readiness checks. Terminal in-memory runs are capped separately. This is not a substitute for PostgreSQL and the worker queue when horizontally scaling.

For Vercel, use the repository root for web only and point `DATABASE_URL` at managed PostgreSQL; deploy the worker target to Railway/Render/Fly. Do not rely on a serverless request continuing background execution.

## Production hardening still required

1. Managed migrations/backups and idempotency records. The worker enforces terminal-run retention;
   production operators must still use migration-only credentials and test encrypted restores.
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
