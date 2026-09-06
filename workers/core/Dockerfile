FROM node:24.18.0-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d

ARG PNPM_VERSION=10.29.3
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git && rm -rf /var/lib/apt/lists/*
RUN npm install -g "pnpm@${PNPM_VERSION}"
RUN useradd --create-home --uid 10001 worker
COPY workers/*.mjs /opt/mc-worker/
USER worker
WORKDIR /home/worker
ENV MC_FLY_TRANSPORT=polled
ENTRYPOINT ["node", "/opt/mc-worker/polled.mjs"]

