# Limitations and future work

- Passive public URL discovery is implemented with pinned network requests. External active tests, repository cloning/execution, and browser navigation remain disabled until ownership proof and stronger network/container isolation exist.
- PostgreSQL snapshots and a durable `SKIP LOCKED` worker queue with bounded lease recovery and worker readiness heartbeats are implemented. The credential-free `pnpm dev` fallback is intentionally process-local; production must configure `DATABASE_URL`.
- The development signing key is ephemeral unless `AGENTTRIAL_SIGNING_SEED` is configured. Durable mode refuses to start without a shared stable seed. Rotation/revocation metadata remains future work.
- EAS schema encoding plus guarded registration, attestation, and onchain payload verification scripts are tested, but no live transaction was broadcast because no funded wallet was provided.
- The OpenAI Responses provider is optionally wired into external claim discovery and handles missing configuration, but no live paid request was made. Controlled tests use the deterministic provider.
- AgentTrial publishes a neutral machine descriptor and does not claim A2A 1.0 lifecycle support. It can passively discover current A2A Agent Cards.
- Canonicalization uses an RFC 8785/JCS implementation and rejects non-finite, unsupported, or cyclic values. Browser uploads are size- and schema-bounded, but duplicate JSON keys cannot be distinguished after the browser's native `JSON.parse` step.
- Distributed anonymous rate limiting, ownership challenges, repository archive parsing, and Playwright public-site navigation remain future work. Passive HTTP requests already pin an approved DNS result and verify the connected address.
- ERC-8004 is intentionally deferred while it remains a draft and because EAS already covers the receipt anchor.
- Production web and worker images are built and published by the approval-gated GitHub workflow; the authoring workstation itself has no Docker daemon.
