# Build context: repository root (npm workspaces share one lockfile)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
RUN npm ci --workspace @mentor-loop/api --include-workspace-root=false
COPY apps/api apps/api
RUN npx --workspace @mentor-loop/api prisma generate \
 && npm run build --workspace @mentor-loop/api

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
# Production deps only. The Prisma CLI and tsx are runtime deps: they run migrations and the seed on start.
RUN npm ci --omit=dev --workspace @mentor-loop/api --include-workspace-root=false && npm cache clean --force
COPY apps/api/prisma apps/api/prisma
RUN npx --workspace @mentor-loop/api prisma generate
COPY --from=build /app/apps/api/dist apps/api/dist
COPY apps/api/docker-entrypoint.sh apps/api/
WORKDIR /app/apps/api
USER node
EXPOSE 4000
ENTRYPOINT ["sh", "docker-entrypoint.sh"]
