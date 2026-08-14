# Contributing

Use Node 24 and pnpm 11. Create focused branches and do not weaken authorization, deterministic scoring, evidence links, or receipt verification to make a test pass.

```bash
pnpm install
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm audit
pnpm secret-scan
```

Security reports should be private and contain no live secrets. Active testing of third-party targets is out of scope. New assertion types need deterministic unit tests, methodology documentation, and a version bump when score semantics change.

Project workflow: commit and push after each coherent, passing milestone; do not commit generated `.next`, Playwright output, environment files, keys, or TypeScript build caches.
