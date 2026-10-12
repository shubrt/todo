# The web app for Railway (service settings: docs/web.md#hosting): builds apps/web from the repository root and
# serves the static files with Caddy. CONVEX_SITE_URL is a Railway service variable; the build
# compiles it into the app and its CSP and fails without it.
FROM node:24 AS build
ENV CI=1 COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# pnpm in the version of packageManager in package.json.
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter @todo/web...
ARG CONVEX_SITE_URL
# Railway's commit becomes the build id in /version.json.
ARG RAILWAY_GIT_COMMIT_SHA
RUN pnpm --filter @todo/web build

FROM caddy:2-alpine
COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
EXPOSE 8080
