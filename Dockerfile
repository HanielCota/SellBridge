# Build tools stay in intermediate stages; each runtime gets its production dependency graph.
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app
ENV CI=true

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/marketplaces/package.json packages/marketplaces/package.json
COPY packages/shared/package.json packages/shared/package.json
# The build context has no Git checkout for the prepare hook; esbuild uses its platform package.
RUN --mount=type=cache,id=sellbridge-pnpm-store,target=/root/.local/share/pnpm/store,sharing=locked \
    --mount=type=cache,id=sellbridge-pnpm-metadata,target=/root/.cache/pnpm,sharing=locked \
    pnpm install --frozen-lockfile --ignore-scripts

FROM dependencies AS source
COPY . .

FROM source AS web-build
# Vite evaluates configuration separately for client and server; generate the ID once here.
ARG SOURCE_COMMIT
RUN VITE_BUILD_ID="${SOURCE_COMMIT:-$(node -e 'process.stdout.write(crypto.randomUUID())')}" pnpm --filter @sellbridge/web build

FROM web-build AS web-dependencies
RUN --mount=type=cache,id=sellbridge-pnpm-store,target=/root/.local/share/pnpm/store,sharing=locked \
    --mount=type=cache,id=sellbridge-pnpm-metadata,target=/root/.cache/pnpm,sharing=locked \
    pnpm --filter @sellbridge/web --prod deploy /out/web --prefer-offline --ignore-scripts

FROM source AS worker-dependencies
RUN --mount=type=cache,id=sellbridge-pnpm-store,target=/root/.local/share/pnpm/store,sharing=locked \
    --mount=type=cache,id=sellbridge-pnpm-metadata,target=/root/.cache/pnpm,sharing=locked \
    pnpm --filter @sellbridge/worker --prod deploy /out/worker --prefer-offline --ignore-scripts

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Workspace packages expose TypeScript and inherit this small configuration package.
COPY --from=source /app/packages/config/*.json ./node_modules/@sellbridge/config/

FROM runtime AS worker
ENV WORKER_HEALTH_PORT=8080
COPY --from=worker-dependencies --chown=node:node /out/worker/node_modules ./node_modules
COPY --from=source --chown=node:node /app/apps/worker/package.json /app/apps/worker/tsconfig.json ./
COPY --from=source --chown=node:node /app/apps/worker/src ./src
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD wget -q -O /dev/null "http://127.0.0.1:${WORKER_HEALTH_PORT:-8080}/health" || exit 1
CMD ["node", "--import", "tsx", "src/index.ts"]

FROM runtime AS web
ENV PORT=3000
ENV HOST=0.0.0.0
ENV UPLOADS_DIR=/data/uploads
ENV WEB_ASSETS_DIR=/data/uploads/.web-assets
COPY --from=web-dependencies --chown=node:node /out/web/node_modules ./node_modules
COPY --from=web-build --chown=node:node /app/apps/web/dist ./dist
COPY --from=source --chown=node:node /app/apps/web/package.json /app/apps/web/tsconfig.json /app/apps/web/server.ts ./
COPY --from=source --chown=node:node /app/apps/web/src/lib/server/production-assets.ts /app/apps/web/src/lib/server/request-body-limit.ts ./src/lib/server/
RUN mkdir -p /data/uploads && chown node:node /data/uploads
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=15s --start-period=90s \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1
# A migration failure prevents startup so the deployment can retain the previous web container.
CMD ["sh", "-c", "node --import tsx node_modules/@sellbridge/database/src/migrate.ts && exec node --import tsx server.ts"]
