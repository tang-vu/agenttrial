FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm COREPACK_HOME=/pnpm/corepack PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack install --global pnpm@11.20.0 && chmod -R a+rX /pnpm
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/signer/package.json apps/signer/package.json
COPY packages/adapters/package.json packages/adapters/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/eas/package.json packages/eas/package.json
COPY packages/evidence/package.json packages/evidence/package.json
COPY packages/fixtures/package.json packages/fixtures/package.json
COPY packages/planner/package.json packages/planner/package.json
COPY packages/runtime/package.json packages/runtime/package.json
COPY packages/security/package.json packages/security/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY . .
RUN pnpm build
# Next's standalone file tracer can omit the ESM half of @swc/helpers when pnpm
# stores both CJS and ESM exports behind a workspace symlink. Repair that traced
# artifact during the build so the read-only production image is self-contained.
RUN swc_source="$(find /app/node_modules/.pnpm -path '*/node_modules/@swc/helpers/esm' -type d | head -n 1)" && \
    swc_target="$(find /app/apps/web/.next/standalone/node_modules/.pnpm -path '*/node_modules/@swc/helpers' -type d | head -n 1)" && \
    test -n "$swc_source" && test -n "$swc_target" && cp -a "$swc_source" "$swc_target/esm"

FROM deps AS worker
ARG AGENTTRIAL_BUILD_COMMIT=development
ENV NODE_ENV=production AGENTTRIAL_BUILD_COMMIT=$AGENTTRIAL_BUILD_COMMIT
COPY . .
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs worker
USER worker
CMD ["pnpm", "--filter", "@agenttrial/worker", "start"]

FROM deps AS signer
ARG AGENTTRIAL_BUILD_COMMIT=development
ENV NODE_ENV=production AGENTTRIAL_BUILD_COMMIT=$AGENTTRIAL_BUILD_COMMIT
COPY . .
RUN groupadd --system --gid 1002 nodejs && useradd --system --uid 1002 --gid nodejs signer
USER signer
CMD ["pnpm", "--filter", "@agenttrial/signer", "start"]

FROM node:24-bookworm-slim AS runner
ARG AGENTTRIAL_BUILD_COMMIT=development
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 AGENTTRIAL_BUILD_COMMIT=$AGENTTRIAL_BUILD_COMMIT
WORKDIR /app
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
