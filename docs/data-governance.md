# Data governance

AgentTrial minimizes retained data by design. Anonymous fixture runs contain controlled inputs only.
Passive external runs retain the normalized target descriptor, bounded and redacted response evidence,
request timing, assertions, and the signed report. Credentials, URL query strings, fragments, cookies,
and arbitrary request headers are rejected rather than stored.

## Default retention

- Completed, failed, and cancelled run snapshots: 30 days (`AGENTTRIAL_RETENTION_DAYS`, bounded to
  1–365 days).
- Expired domain-control authorization records: expiry plus 24 hours.
- Expired quota buckets and stale worker heartbeats: 24 hours.
- Active queue jobs are never removed by retention cleanup.

The worker runs cleanup hourly. PostgreSQL foreign keys remove execution, signing, and attestation rows
with their terminal run. Single-node snapshots use the same run-retention setting and are removed
during readiness checks.

## Receipt semantics after deletion

A downloaded bundle remains independently verifiable after its server copy expires. Deleting the
hosted snapshot does not revoke or rewrite a signed receipt. An EAS attachment, when explicitly
created, remains public on Base Sepolia according to that network's retention characteristics.

## Operator controls

Production operators should encrypt database storage and backups, restrict database roles, document
the backup region, and perform restoration drills. Do not place wallet keys, planner credentials, or
Cloudflare tunnel credentials in the run database. Security and deletion requests use the private
[GitHub advisory channel](https://github.com/tang-vu/agenttrial/security/advisories/new).
