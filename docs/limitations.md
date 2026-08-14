# Limitations and future work

- The controlled fixture path is complete. External public URL/repository/API/A2A discovery is represented by interfaces/security policy but disabled in the public UI until the isolated worker exists.
- Runs and SSE listeners are stored in one Node process. Restarts lose reports; horizontal/serverless routing is unsupported without PostgreSQL, a durable queue, and pub-sub.
- The development signing key is ephemeral unless `AGENTTRIAL_SIGNING_SEED` is configured. Mathematical validity does not establish organizational trust; production needs a pinned public-key registry and rotation/revocation.
- EAS schema encoding and guarded Base Sepolia scripts are tested, but no live transaction was broadcast because no funded wallet was provided. Attestation lookup/revocation verification remains a deployment task.
- The OpenAI Responses provider compiles and handles missing configuration, but no live paid request was made. Controlled tests use the deterministic provider.
- The A2A 1.0 Agent Card advertises the implemented HTTP+JSON evaluation surface; it is not a full task/message lifecycle server.
- Canonicalization is deterministic for the emitted I-JSON subset but is not marketed as a complete RFC 8785 implementation for arbitrary uploaded numeric/string edge cases.
- Anonymous distributed rate limiting, ownership challenges, repository archive parsing, Playwright public-site navigation, and DNS socket pinning are required before external evaluation can be enabled.
- ERC-8004 is intentionally deferred while it remains a draft and because EAS already covers the receipt anchor.
- The production image layout was validated against Next.js standalone output, but an end-to-end `docker build` could not run in the authoring environment because its Docker daemon was unavailable.
