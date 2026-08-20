# Signing-key rotation and compromise response

AgentTrial separates receipt integrity from issuer trust. A receipt keeps its mathematical Ed25519
validity forever, while the versioned registry states whether the signer was authorized when the
receipt was issued.

## Planned rotation

1. Back up PostgreSQL and the current secret-manager entry.
2. Generate a new 32-byte seed in the secret manager. Never put it in the repository, browser,
   web container, or execution worker.
3. Replace `AGENTTRIAL_SIGNING_SEED` only on the signer and restart that service.
4. Wait for `/api/ready` to report `signer: true`, then inspect `/api/signing-keys`.
5. Confirm the new key is `active`; the old key must be `previous` with `notAfter` equal to the
   rotation time.
6. Run a controlled fixture, download its bundle, and verify it against both the service registry
   and a public key copied through an independently authenticated channel.
7. Publish the new public key and registry snapshot in a signed GitHub release.

Previous keys remain trusted only for receipts whose signed `issuedAt` is within their
`notBefore`/`notAfter` window.

## Compromise response

Immediately isolate the signer, rotate the seed, and revoke the affected key:

```powershell
$env:DATABASE_URL = "postgres://..."
$env:CONFIRM_REVOKE_SIGNING_KEY = "ed25519:0123456789abcdef"
pnpm signing-key:revoke ed25519:0123456789abcdef
```

Revocation is deliberately fail-closed: the browser still reports whether the signature is
mathematically correct, but issuer trust fails for every receipt under that key. Publish the key
ID, incident window, and remediation in a signed release and security advisory. Do not delete the
registry row or rewrite historical receipts.

## Recovery validation

- Ensure web and execution-worker environments do not contain the seed.
- Ensure the signer has no target-network egress.
- Verify a new receipt under the active key.
- Verify an old planned-rotation receipt within its issuance window.
- Verify a revoked-key receipt fails the `trusted-signer` check.
- Review signing-job and run records for the suspected compromise interval.
