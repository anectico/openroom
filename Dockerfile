FROM node:24.21.0-trixie-slim AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24.21.0-trixie-slim AS litestream
ARG TARGETARCH
ARG LITESTREAM_VERSION=0.5.17
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
RUN set -eu; \
	case "$TARGETARCH" in amd64) arch=x86_64 ;; arm64) arch=arm64 ;; *) echo "unsupported $TARGETARCH"; exit 1 ;; esac; \
	file="litestream-${LITESTREAM_VERSION}-linux-${arch}.tar.gz"; \
	base="https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}"; \
	curl -fsSLo "/tmp/$file" "$base/$file"; \
	curl -fsSLo /tmp/checksums.txt "$base/checksums.txt"; \
	cd /tmp && grep " $file\$" checksums.txt | sha256sum -c -; \
	tar -xzf "/tmp/$file" -C /usr/local/bin litestream

FROM node:24.21.0-trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends tini ca-certificates && rm -rf /var/lib/apt/lists/*
ARG OPENROOM_VERSION=dev
ENV NODE_ENV=production DATA_DIR=/data PORT=3000 OPENROOM_VERSION=${OPENROOM_VERSION}
WORKDIR /app
COPY --from=litestream /usr/local/bin/litestream /usr/local/bin/litestream
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/src/launcher ./src/launcher
COPY --from=build /app/src/server ./src/server
COPY --from=build /app/src/lib/server ./src/lib/server
COPY --from=build /app/src/lib/schemas ./src/lib/schemas
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD ["node", "-e", "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
ENTRYPOINT ["tini", "--"]
CMD ["node", "src/launcher/index.ts"]
