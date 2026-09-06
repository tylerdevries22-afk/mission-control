# Fly Agent Workers

Mission Control remains the scheduler and source of truth. Fly Machines are disposable execution workers: a worker receives one task, clones one approved repository into a unique branch, reports its lifecycle, pushes its branch, then exits and is deleted.

## Architecture and routing

```text
Mac telemetry ─┐
Task queue ────┼─ Mission Control scheduler ── Mac-only job (Xcode/iOS/macOS)
Cost governor ─┘                │
                                ├─ core worker (API/Git/light coding)
                                └─ browser worker (Playwright/build/e2e)
                                      │
                              isolated branch → review → cleanup
```

`MC_FLY_ENABLED` is false by default. With it enabled, a job is sent to Fly only when all of the following are true:

- It is not tagged/configured as macOS-only and does not mention Xcode, iOS, a simulator, or SwiftUI.
- Its repository is explicitly present in `MC_FLY_ALLOWED_REPOS`.
- The worker image, callback URL, and hourly price for the selected size are configured.
- The per-job, daily, and monthly budget reservations fit.
- The current Fleet concurrency limit permits another worker.

Browser, Playwright, e2e, build, compile, and Docker-like task descriptions select a performance browser worker. Other jobs are sized from the p95 CPU/RAM history retained in `fly_worker_jobs`. When Fly configuration, pricing, or the network is unavailable, eligible work uses the existing local dispatcher. A budget or concurrency denial leaves the task assigned for the next scheduler pass; it does not silently run locally.

## Ruflo and Claude topology

Keep the Ruflo swarm coordinator in the local Claude Code session. It retains the working context, local skills, worktree state, and the user's desktop authentication. Mission Control is the only component that schedules Fly Machines. A Fly worker is an isolated, short-lived **leaf**: it receives one pinned commit, one approved repository, and one explicit runtime (`claude` or `codex`), then pushes a fresh `mc/fly-task-*` branch for review.

Do not send a whole Ruflo swarm, its coordinator, or an unpushed local worktree to Fly. For Claude tasks, use a dedicated `ANTHROPIC_API_KEY` with a worker-only spend cap; do not copy a personal Claude Code OAuth session into a Machine. The Claude leaf command is non-interactive (`claude -p`) and bounded by `--max-turns`.

Every Fly task must include a full, already-pushed Git commit SHA and an allowlisted setup profile. For the Stillpoint Builders browser/build canary:

```json
{
  "execution_target": "fly",
  "fly_runtime": "claude",
  "fly_base_sha": "<40-character pushed commit SHA>",
  "fly_setup": "npm-ci-playwright",
  "fly_memory_mb": 8192,
  "fly_budget_usd": 2.00
}
```

Set the task's assigned runtime to `claude` as well. A disagreement between task runtime and metadata, an unpinned revision, an unsupported setup profile, or an unapproved repository is rejected before a Machine is created. The browser profile uses a 4 CPU / 8 GB performance worker only when historical p95 or declared memory supports it; otherwise it starts at 2 CPU / 4 GB.

## One-time Fly setup

Run these commands from the Mission Control checkout. The configured worker app is `mission-control-workers-tyler` in `iad`; replace it if you use another Fly organization.

```bash
fly auth login
fly apps create mission-control-workers-tyler
fly auth docker
docker buildx build --platform linux/amd64 --provenance=false --push --build-arg CODEX_VERSION=0.153.4 --build-arg CLAUDE_CODE_VERSION=2.1.261 -f workers/core/Dockerfile -t registry.fly.io/mission-control-workers-tyler:core-0.153.4-2.1.261-r4-amd64 .
docker buildx build --platform linux/amd64 --provenance=false --push --build-arg CODEX_VERSION=0.153.4 --build-arg CLAUDE_CODE_VERSION=2.1.261 -f workers/browser/Dockerfile -t registry.fly.io/mission-control-workers-tyler:browser-0.153.4-2.1.261-r4-amd64 .
fly tokens create deploy -a mission-control-workers-tyler -x 720h
fly platform vm-sizes
```

For the configured `mission-control-workers-tyler` production environment, use immutable AMD64 image digests. Fly Machines accepts digest references, so Mission Control rejects mutable tags at admission.

```env
MC_FLY_CORE_IMAGE=registry.fly.io/mission-control-workers-tyler@sha256:9742819f867c433a327308b11e0cd3356eaf4d40c0beda75ceec4e79dccbc5c3
MC_FLY_BROWSER_IMAGE=registry.fly.io/mission-control-workers-tyler@sha256:512e69c6faab69bae002ef628f305ab87dce42d8b0a58ab5d4924cb855ba209a
```

The verified r4 registry digests are `9742819f867c433a327308b11e0cd3356eaf4d40c0beda75ceec4e79dccbc5c3` (core) and `512e69c6faab69bae002ef628f305ab87dce42d8b0a58ab5d4924cb855ba209a` (browser). The hardened entrypoint accepts only the supported Claude or Codex runtime rather than a configurable shell command.

Use a deploy token scoped to the worker application only. Put its value in the Mission Control runtime as `FLY_API_TOKEN`; never put it in task metadata, source control, browser code, or a worker Machine. The control URL must be reachable from a worker. For a public deployment use HTTPS; for a private same-organization deployment use the Fly private address of the Mission Control app.

## Doppler setup

The local checkout is configured for Doppler project `mission-control`, config `prd`. Its Fly token is restricted in Doppler; it is never written to this repository. Start a deployed control plane with the same selected config using:

```bash
doppler run --project mission-control --config prd -- pnpm start
```

Use a restricted Doppler service token for the deployment runtime, not the personal CLI token. Keep `MC_FLY_ENABLED=false` until the control URL is HTTPS-reachable from a Fly Machine and both versioned images have been pushed.

## Stateful control-plane deployment

Use the separate Fly app `mission-control-control-tyler`, not Vercel: this Mission Control release keeps its SQLite queue, scheduler, and event bus in one durable process. The encrypted `mc_data` volume in `iad` has 14-day snapshots. Deploy exactly one Machine (`--ha=false`); do not add a replica until queue/reservation state moves to Postgres.

First grant the Doppler service token access to restricted `mission-control/prd` secrets. Verify presence only, then copy only the required runtime values into Fly secrets:

```bash
doppler run --project mission-control --config prd -- node -e 'for (const key of ["AUTH_USER","AUTH_PASS","AUTH_SECRET","API_KEY","FLY_API_TOKEN","ANTHROPIC_API_KEY","MC_FLY_GIT_AUTH_TOKEN"]) console.log(`${key}=${process.env[key] ? "set" : "missing"}`)'
doppler run --project mission-control --config prd -- sh -c 'fly secrets set -a mission-control-control-tyler AUTH_USER="$AUTH_USER" AUTH_PASS="$AUTH_PASS" AUTH_SECRET="$AUTH_SECRET" API_KEY="$API_KEY" FLY_API_TOKEN="$FLY_API_TOKEN" ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" MC_FLY_GIT_AUTH_TOKEN="$MC_FLY_GIT_AUTH_TOKEN"'
fly secrets set -a mission-control-control-tyler MC_FLY_CONTROL_URL=https://mission-control-control-tyler.fly.dev MC_FLY_ENABLED=false FLY_APP_NAME=mission-control-workers-tyler FLY_REGION=iad
fly deploy --local-only --ha=false --config fly.toml
```

Use `--local-only` for this checkout: the default Depot builder was OOM-killed while Next.js type-checked. A local Docker build retains type checking and pushes the image; do not work around this by disabling TypeScript validation. [Fly builder options](https://fly.io/docs/flyctl/integrating/) · [Fly Next.js OOM guidance](https://fly.io/docs/js/frameworks/nextjs/)

## Required Mission Control configuration

Add these to the Mission Control runtime environment or secret store. The hourly rates must be copied from the current Fly pricing page for the selected region; Mission Control deliberately refuses a remote launch with unknown pricing.

```env
MC_FLY_ENABLED=true
FLY_API_TOKEN=replace-with-worker-app-deploy-token
FLY_APP_NAME=mission-control-workers
FLY_REGION=iad
MC_FLY_CONTROL_URL=https://mission-control.example.com
MC_FLY_ALLOWED_REPOS=https://github.com/your-org/repo.git,git@github.com:your-org/repo.git
MC_FLY_CORE_IMAGE=registry.fly.io/mission-control-workers@sha256:<immutable-digest>
MC_FLY_BROWSER_IMAGE=registry.fly.io/mission-control-workers@sha256:<immutable-digest>
MC_FLY_MAX_WORKERS=12
MC_FLY_JOB_TTL_SECONDS=3600
MC_FLY_COMMAND_TIMEOUT_SECONDS=3300
MC_FLY_HEARTBEAT_MAX_SECONDS=180
MC_FLY_HEARTBEAT_SECONDS=30
MC_FLY_DAILY_BUDGET_USD=10
MC_FLY_MONTHLY_BUDGET_USD=150
MC_FLY_CORE_SMALL_HOURLY_USD=replace-with-current-price
MC_FLY_CORE_STANDARD_HOURLY_USD=replace-with-current-price
MC_FLY_CORE_PERFORMANCE_HOURLY_USD=replace-with-current-price
MC_FLY_BROWSER_STANDARD_HOURLY_USD=replace-with-current-price
MC_FLY_BROWSER_LARGE_HOURLY_USD=replace-with-current-price
MC_FLY_SETUP_TIMEOUT_SECONDS=1200
MC_FLY_WORKER_SECRET_NAMES=ANTHROPIC_API_KEY,MC_FLY_GIT_AUTH_TOKEN
```

`MC_FLY_WORKER_SECRET_NAMES` is an allowlist of values already present in the Mission Control server environment. Only `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, and `MC_FLY_GIT_AUTH_TOKEN` can be injected. `FLY_API_TOKEN`, `AUTH_SECRET`, `API_KEY`, OpenAI keys, and desktop OAuth credentials cannot cross into a worker. Prefer a dedicated model key with a worker-only spend limit and a short-lived, fine-grained GitHub token restricted to the approved repository's contents.

For private Git access, configure a least-privilege credential mechanism in the worker image or environment (for example, an installation token and `GIT_ASKPASS`). Do not embed a personal access token in `MC_FLY_REPOSITORY` or a Docker layer.

## Cost model

Mission Control reserves `predicted runtime seconds × configured hourly price / 3600` before creating a Machine. It refuses a job that crosses its task, day, or month cap. The worker reports container CPU/RAM/swap heartbeats; the control plane derives observed compute spend from trusted elapsed time and the configured class rate. Raw agent output is never persisted to the task record.

For a rough forecast, use this calculation before setting budgets:

```text
monthly compute = jobs/month × average runtime minutes / 60 × current class hourly price
```

For example, using Fly's published `shared-cpu-1x` 1GB reference price of about $0.0082/hour in one listed region, 100 light 30-minute jobs are roughly $0.41 of compute. Browser and performance workloads must be priced with the current regional rate rather than this light-worker example. Started Machines are billed per second; deleting them after completion also avoids stopped-rootfs storage accrual.

## Operations and safety

- The scheduler reconciles worker leases every 15 seconds. A worker with an expired TTL or heartbeat is destroyed and its task returns to `assigned` for safe retry.
- Workers have no public Fly service, restart policy `no`, automatic destruction after process exit, and a unique `mc/fly-task-*` branch.
- Each worker uses a job-scoped random token. The callback route accepts neither Mission Control sessions nor broad API keys.
- Machine API requests have a 15-second timeout and retry network failures, 408, 429, and 5xx responses twice with exponential backoff. Authentication errors are never retried.
- Use the **Fly Fleet** panel for queue, worker state, cost headroom, and bottlenecks. Use **Monitor** for host CPU/RAM/swap. `GET /api/fly/telemetry` and `/api/workload` provide the same snapshot for automation.

## Rollout, rollback, and incident response

1. Build and push the two images, set configuration with `MC_FLY_ENABLED=false`, and verify the Fly Fleet panel displays `disabled`.
2. Set all price values and `MC_FLY_ALLOWED_REPOS`, then enable Fly for a single low-risk coding task. Confirm a branch is pushed and the Machine disappears after completion.
3. Raise `MC_FLY_MAX_WORKERS` gradually from 2 to 12 after observing queue time, cost, and worker failure rate.
4. To stop new launches immediately, set `MC_FLY_ENABLED=false` and restart Mission Control. Existing jobs will be reconciled by TTL; use `fly machines list -a mission-control-workers` and `fly machines destroy <id> -a mission-control-workers` for emergency cleanup.
5. Roll back by restoring the previously verified immutable image digests in `MC_FLY_CORE_IMAGE`/`MC_FLY_BROWSER_IMAGE`, then restart Mission Control. Existing Machines are disposable and should not be reused.

## Verification

```bash
pnpm test -- src/lib/__tests__/fly-workers.test.ts src/lib/__tests__/fly-worker-protocol.test.ts src/components/panels/fly-orchestration-panel.test.tsx
pnpm lint
pnpm typecheck
pnpm test:e2e
```

The focused tests cover routing, p95 autosizing, cost ceilings, retry behavior, job-token authorization, telemetry aggregation, and the live-flow panel. Before every production release, also run a staged failure drill: missing Fly token, 503 from Machines API, duplicate worker callback, expired heartbeat, worker TTL, budget refusal, and a network partition. No production task should be used as a chaos test.
