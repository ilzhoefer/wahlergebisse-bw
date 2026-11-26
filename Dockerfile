FROM oven/bun:1 AS build
WORKDIR /app

COPY package.json bun.lock ./
COPY patches ./patches
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# Vite/Rollup doesn't bundle every server dependency into build/ (graphql-yoga in particular resolves
# some of its internals via runtime module resolution) — the runtime image needs a real node_modules,
# installed separately here so it only contains production dependencies, not the build stage's devDeps.
FROM oven/bun:1 AS prod-deps
WORKDIR /app
COPY package.json bun.lock ./
COPY patches ./patches
RUN bun install --frozen-lockfile --production

FROM oven/bun:1-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./package.json
COPY --from=prod-deps /app/node_modules ./node_modules

# The image's unprivileged user instead of root: a compromised app can't modify its own image.
USER bun
EXPOSE 3000
# /healthz checks the database too, so Docker/Dokploy see a hung app or lost DB connection.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
	CMD bun -e "fetch('http://127.0.0.1:' + (process.env.PORT ?? 3000) + '/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["bun", "./build/index.js"]
