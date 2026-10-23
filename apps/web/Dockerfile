# Build context: repository root (npm workspaces share one lockfile)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @mentor-loop/web --include-workspace-root=false
COPY apps/web apps/web
# Public OAuth client ID, baked in so the Google button doesn't wait for the API.
ARG VITE_GOOGLE_CLIENT_ID=
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
RUN npm run build --workspace @mentor-loop/web

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
