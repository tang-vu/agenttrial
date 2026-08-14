# Deployment

## Single-instance judge deployment

```bash
docker build -t agenttrial .
docker run --read-only --tmpfs /tmp -p 3000:3000 \
  -e AGENTTRIAL_SIGNING_SEED=<64-hex-secret> agenttrial
```

Use one instance because run state and SSE subscriptions are process-local. Terminating or redeploying it loses active/completed in-memory reports; judges should download bundles.

For Vercel, use the repository root, Node 24, `pnpm install --frozen-lockfile`, and `pnpm build`. Serverless route isolation is not a supported durable configuration for the current runtime; prefer the Docker service for the live demo.

## Production evolution

1. PostgreSQL for runs, plans, events, evidence metadata, authorization and idempotency records.
2. Durable queue plus Redis/Postgres pub-sub for SSE fan-out.
3. Separate browser worker on Railway/Render/Fly with denied private-network egress, non-root Chromium, no receipt key, and strict quotas.
4. Web/receipt service with signing key in managed KMS/secret storage.
5. Immutable object storage for canonical bundles and a pinned public-key registry.

## Base Sepolia

Fund a dedicated testnet-only wallet, set `EAS_RPC_URL`, `EAS_PRIVATE_KEY`, and run the guarded registration script. Store the returned schema UID as `EAS_SCHEMA_UID`. Review the bundle and report URI before the guarded attestation script. Never reuse a mainnet private key. Mainnet is intentionally blocked by the scripts.
