FROM mcr.microsoft.com/playwright:v1.61.1-noble@sha256:5b8f294aff9041b7191c34a4bab3ac270157a28774d4b0660e9743297b697e48

ARG PNPM_VERSION=10.29.3
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git && rm -rf /var/lib/apt/lists/*
RUN npm install -g "pnpm@${PNPM_VERSION}"
COPY workers/*.mjs /opt/mc-worker/
RUN useradd --create-home --uid 10001 worker
USER worker
WORKDIR /home/worker
ENV MC_FLY_TRANSPORT=polled
ENTRYPOINT ["node", "/opt/mc-worker/polled.mjs"]

