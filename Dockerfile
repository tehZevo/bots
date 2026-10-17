FROM node:26-slim AS build
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@11.28.4
WORKDIR /app
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm deploy --filter=@bots/server --prod /deploy/server

FROM docker:cli AS dockercli

FROM node:26-slim
WORKDIR /app
COPY --from=build /deploy/server packages/server
COPY --from=build /app/packages/web/dist packages/web/dist
COPY --from=dockercli /usr/local/bin/docker /usr/local/bin/docker
ENV NODE_ENV=production \
  PORT=8787 \
  DATA_DIR=/data
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e 'fetch("http://127.0.0.1:"+(process.env.PORT||8787)+"/api/health").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))'
CMD ["node", "packages/server/dist/index.js"]
