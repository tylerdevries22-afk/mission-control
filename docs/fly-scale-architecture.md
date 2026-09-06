# Fly scale architecture: 500-task Ruflo/Claude workloads

## Verdict

Keep Ruflo and Claude Code as local coordinators. Mission Control is the one durable control plane. Fly Machines execute only independent, stateless, pinned-revision leaf jobs. Do **not** map 20–30 logical swarm agents to 20–30 immediate Machine-create calls.

The current implementation is a one-worker canary. It is intentionally not approved for 20–30 concurrent workers: the cross-client MCP bridge and visualizer exist, but durable admission, atomic global reservation, idempotent create recovery, and authoritative running-cost reconciliation still need to land before a ramp.

```text
Claude Code + Ruflo coordinator (local, 20–30 logical agents)
                 │
      classify and split only safe leaves
                 │
Mission Control: durable queue + budget/capacity reservation
                 │       │            │
              local    core pool    browser pool
                         │              │
                  Fly Machines: one pinned leaf / branch / TTL
                         │
                branch result → review → destroy
```

## Why the design uses admission rather than direct fan-out

Fly allows only one Machine Create request per second per app, with a short burst of three. A cold 30-agent swarm must therefore queue and pace creates at roughly 0.8 per second; launching all leaves directly will rate-limit or create ambiguous failure states. Use Fly's Machines API through Mission Control, not `fly` from agents. [Fly API rate limits](https://fly.io/docs/machines/api/working-with-machines-api/#rate-limits)

After the admission controller can lease them safely, use a warm **stopped** reserve: 20 core and 8 browser Machines, no public services or volumes. Fly recommends stopped Machines for bursty demand because start is faster than create while stopped capacity releases CPU/RAM. A lease updates a stopped Machine with exactly one pinned job, starts it, verifies the callback, then stops or destroys it after the TTL. Do not provision this reserve before leasing support exists; the current create-per-job implementation cannot use it. [Fly stopped-capacity guidance](https://fly.io/docs/launch/scale-count/)

Shared CPU has a 6.25% baseline scheduling quota. Use it only for API/network-bound leaves; builds, TypeScript compilation, Playwright, and browsers need performance CPUs. [Fly CPU performance](https://fly.io/docs/machines/cpu-performance/)

## Target operating limits

Logical agent count and remote-Machine count are separate controls.

| Phase | Core | Browser | Global | Purpose |
| --- | ---: | ---: | ---: | --- |
| Canopy | 1 | 0 | 1 | Current live smoke-test state |
| Canary | 4 | 2 | 6 | Validate a real repository callback and branch push |
| Ramp | 12 | 6 | 18 | Run after p95 and failure SLOs hold for a week |
| Burst reserve | 20 | 8 | 28 stopped / 28 active ceiling | Implement after leasing support and load test |
| Expansion | 24 | 10 | 30 active ceiling | Only after 500-job load, capacity, and cost evidence |

Per repository, allow one active write leaf by default. Let read-only analysis leaves use a separate cap. Keep browser-large (4 CPU/8 GB) rare and explicitly justified by p95 memory or tests.

Use placement preference `iad → dfw → ord` after retrying a capacity failure. Do not create **running** idle Machines or a cold 30-Machine burst. The stopped reserve is the correct fast-start mechanism once it can be leased; Fly documents that all-or-nothing scaling can fail on capacity. [Machine placement](https://fly.io/docs/machines/guides-examples/machine-placement/)

## Required control-plane work before ramping above one worker

1. Add a provider-neutral `mc-submit-leaf` bridge and authenticated `POST /api/fly/submit`. It must derive repository, clean pushed SHA, runtime, setup, job class, and placement server-side; no agent may call Fly directly or choose an arbitrary image/budget. Add launcher adapters for Claude, Ruflo, Codex, and non-Ruflo agents; hooks must prevent duplicate local execution only after a reservation succeeds.
2. Add a durable Fly admission queue with priority aging, `not_before`, retry attempts, dependency state, per-repo limits, separate core/browser quotas, and a dead-letter state.
3. Use one DB-backed global reservation transaction to atomically reserve concurrency, worst-case compute cost, and provider budget before any API call. A workspace-local count cannot enforce a global cap.
4. Add stopped-pool leasing: deterministic class machine identities, job-specific update/start/stop, no volumes, one job per root filesystem, and an idempotent terminal destroy. Retain a paced cold-create fallback (0.8 create/sec, burst three) with full-jitter retry for 408/429/5xx and a `create_unknown` state.
5. Reconcile every 10–15 seconds from Fly's authoritative Machine state. Enforce a runtime cost ceiling during execution, not only at worker callbacks. Destroy terminal, stale, over-budget, and orphaned Machines idempotently.
6. Make task, job, activity, and cost-state transitions a single database transaction. Add bounded retry/backoff (two Fly attempts recommended) before local/manual escalation.
7. Replace all-history telemetry scans with aggregated rolling queries and emit queue age, admission state, remote-state freshness, reserved/accrued cost, setup time, p50/p95 runtime, and failure reason.
8. Add load/chaos tests: 500 enqueues; 30-contender capacity race; create timeout after remote acceptance; 429; regional capacity exhaustion; callback replay/loss; worker crash; branch push denial; cost-cap kill; and orphan cleanup.

SQLite is sufficient for a single, durable Mission Control control-plane process at this level of callback traffic. Do not run multiple scheduler replicas against it. If high availability needs multiple scheduler instances, move the queue/reservation ledger to Postgres before scaling replicas.

## Automatic Claude and Ruflo integration

The global Claude policy at `~/.claude/CLAUDE.md` now makes placement classification automatic. It does not, by itself, move a direct Claude Code task to Fly; the current dispatcher only sees Mission Control database tasks.

The durable solution is a local `mc-submit-leaf` adapter exposed as a Claude/Ruflo tool:

1. The coordinator submits every candidate leaf to Mission Control with repository, current pushed SHA, runtime, setup profile, task dependency, and estimated resources.
2. Mission Control returns `local`, `queued`, `reserved`, or `rejected` with a reason. The coordinator does not start a duplicate local implementation after `reserved` or `queued`.
3. A Claude Code `TaskCreated` hook records the local task-to-Mission-Control mapping; a `TaskCompleted`/subagent-stop hook reads the remote result. Hooks are deterministic lifecycle controls, but they cannot themselves redirect a task, so the adapter is essential. [Claude Code hooks](https://code.claude.com/docs/en/hooks-guide) · [TaskCreated input](https://code.claude.com/docs/en/hooks#taskcreated)
4. Dirty/unpushed worktrees, Xcode/iOS/macOS tasks, and coordinator/review work always remain local. A Fly leaf starts only from a pinned pushed SHA and writes a unique review branch.

## Cost guardrails

Current `iad` cards: core 1 GB shared $0.0082/hr; core 2 GB shared $0.0154/hr; browser 2 CPU/4 GB $0.0894/hr; browser 4 CPU/8 GB $0.1788/hr. At 30 minutes, these are about $0.004, $0.008, $0.045, and $0.089 respectively, excluding provider/model usage.

Set two independent ledgers: Fly compute reservations and Claude API reservations. A compute `fly_budget_usd` is not a Claude API budget. Started Machines are billed per second; stopped/suspended Machines still accrue rootfs storage, so terminal workers must be destroyed. [Fly billing](https://fly.io/docs/about/billing/) · [cost management](https://fly.io/docs/about/cost-management/)

## Real launch preflight

Before a single real Stillpoint leaf can run, configure `MC_FLY_CONTROL_URL`, worker-only `ANTHROPIC_API_KEY`, scoped `MC_FLY_GIT_AUTH_TOKEN`, and a clean pushed base SHA. The worker app currently has no Machines, which is correct for an idle queue. Use the published r4 images and one canary repository task before changing capacity.
