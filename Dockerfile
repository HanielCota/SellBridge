# Imagem única do monorepo, com dois alvos: `web` (app + migrations) e `worker`.
# Os pacotes do workspace são consumidos como TypeScript (tsx/vite), por isso
# as dependências vão inteiras para o runtime.
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
# --ignore-scripts pula o `prepare` (lefthook precisa de .git); o esbuild instala o binário por pacote opcional.
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM dependencies AS source
COPY . .

FROM source AS web-build
RUN pnpm --filter @sellbridge/web build

FROM source AS worker
ENV NODE_ENV=production
WORKDIR /app/apps/worker
USER node
CMD ["node", "--import", "tsx", "src/index.ts"]

FROM web-build AS web
ENV NODE_ENV=production
ENV PORT=3000
# IPv4 explícito: o healthcheck do Coolify consulta 127.0.0.1 dentro do container.
ENV HOST=0.0.0.0
ENV UPLOADS_DIR=/data/uploads
RUN mkdir -p /data/uploads && chown node:node /data/uploads
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1
# Migrations antes de subir: o deploy falha (e o Coolify mantém a versão anterior) se uma delas falhar.
CMD ["sh", "-c", "cd /app/packages/database && node --import tsx src/migrate.ts && cd /app/apps/web && exec node_modules/.bin/srvx serve --prod --entry ./dist/server/server.js --static ../client"]
