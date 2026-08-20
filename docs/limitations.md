# Limitations and future work

- Passive public URL discovery is implemented with pinned network requests. External active evaluation is limited to an exact A2A HTTP+JSON 1.0 `SendMessage` profile after a short-lived, one-time HTTPS domain-control proof. Generic REST invocation, repository execution, authenticated agents, and public browser navigation remain disabled.
- PostgreSQL snapshots and a durable `SKIP LOCKED` worker queue with bounded lease recovery and worker readiness heartbeats are implemented. The credential-free `pnpm dev` fallback is intentionally process-local; production must configure `DATABASE_URL`.
- The development signing key is ephemeral unless `AGENTTRIAL_SIGNING_SEED` is configured. Durable mode refuses to start without a stable signer-only seed. The registry retains validity windows, previous keys, and explicit revocation timestamps; independent distribution still requires an operator-published signed release or onchain anchor.
- Browser verification checks integrity against the current key registry served by AgentTrial. The UI explicitly distinguishes that from independent issuer trust; production consumers should pin a separately distributed release key or validate the optional onchain anchor.
- EAS schema encoding, guarded idempotent broadcast, durable attachment state, receipt binding, and onchain payload verification are tested with deterministic/mocked paths. No live transaction was broadcast because no funded Base Sepolia wallet was provided.
- The OpenAI Responses provider is implemented and tested as an adapter, but anonymous public runs intentionally never invoke a paid model. A future authenticated builder API must add explicit opt-in, token/cost ceilings, and durable quotas before wiring it into production discovery.
- AgentTrial publishes a neutral machine descriptor and does not claim A2A 1.0 lifecycle support. It can passively discover current A2A Agent Cards.
- Canonicalization uses an RFC 8785/JCS implementation and rejects non-finite, unsupported, or cyclic values. Browser uploads are size- and schema-bounded, but duplicate JSON keys cannot be distinguished after the browser's native `JSON.parse` step.
- PostgreSQL deployments share anonymous/origin quotas and queue caps across web instances. The
  single-node fallback uses bounded in-memory limits; alias-host quotas, repository archive parsing,
  and Playwright public-site navigation remain future work. Passive and authorized A2A requests pin
  an approved DNS result and verify the connected address.
- ERC-8004 is intentionally deferred while it remains a draft and because EAS already covers the receipt anchor.
- Production web and worker images are built by the approval-gated GitHub workflow. The workstation deployment uses the same isolated Docker topology behind a named Cloudflare Tunnel; it is a single-node deployment, so host and tunnel availability remain residual risks.
