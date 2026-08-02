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

EXPOSE 3000
CMD ["bun", "./build/index.js"]
