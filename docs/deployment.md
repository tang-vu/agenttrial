# Deployment

## Durable deployment

```bash
export AGENTTRIAL_SIGNING_SEED=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
docker compose up --build
```

Compose starts PostgreSQL, the Next.js web service, and a separately scalable queue worker. Both web and worker must receive the same managed signing seed. PostgreSQL snapshots allow GET, bundle, and SSE endpoints to work across processes and restarts.

For Vercel, use the repository root for web only and point `DATABASE_URL` at managed PostgreSQL; deploy the worker target to Railway/Render/Fly. Do not rely on a serverless request continuing background execution.

## Production hardening still required

1. Managed migrations/backups, retention, distributed per-target limits, and idempotency records.
2. LISTEN/NOTIFY or Redis pub-sub can replace the current bounded PostgreSQL SSE polling at higher scale.
3. A separate browser worker with denied private-network egress, non-root Chromium, no receipt key, and strict quotas before enabling browser tests.
4. Web/receipt service with signing key in managed KMS/secret storage.
5. Immutable object storage for canonical bundles and a pinned public-key registry.

## Base Sepolia

Fund a dedicated testnet-only wallet, set `EAS_RPC_URL`, `EAS_PRIVATE_KEY`, and run the guarded registration script. Store the returned schema UID as `EAS_SCHEMA_UID`. Review the bundle and report URI before the guarded attestation script. Never reuse a mainnet private key. Mainnet is intentionally blocked by the scripts.
