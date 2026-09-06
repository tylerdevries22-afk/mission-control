# Fly Worker Readiness Audit

Audit date: 2026-09-05. The worker scheduler is enabled with a one-worker canary cap. A disposable AMD64 browser Machine was launched in `iad`, validated the non-root Codex/Claude runtime and entrypoint syntax, exited with status 0, and auto-removed; no worker Machine remains.

## Completed hardening

- A dedicated Fly app, `mission-control-workers-tyler`, is isolated from existing apps and has no services, volumes, IPs, or Machines.
- Doppler project `mission-control` config `prd` owns the restricted Fly app token, region, image names, price cards, repository allowlist, and conservative $3/day, $40/month, one-worker canary limits.
- `MC_FLY_ENABLED=true` enables routing only after all per-job guards pass. Missing callback configuration, repository approval, pinned revision, image price, or runtime/setup profile fails closed before Machine creation.
- AMD64 `r3` core and browser images are published, remotely verified, and have immutable release digests. The Dockerfiles pin their Node and Playwright base-image digests; Fly launches now require full `registry.fly.io/<app>@sha256:<digest>` references, which the Machines API supports.
- Dispatch defaults to local unless a task is explicitly Fly-targeted or classified browser/test/build/container heavy. macOS/Xcode/iOS jobs remain local.
- Actual price is used before reserving the job budget; it is no longer checked against a zero-priced static worker spec.
- Retry rows no longer have a permanent one-job-per-task schema constraint. Callback updates are active-state-only and task updates require `in_progress`.
- Worker heartbeats report aggregate container CPU/RAM/swap. The control plane derives observed compute cost from elapsed time and the configured hourly price; it does not trust worker cost claims.
- Worker output is not written to task resolution. Git and control-plane requests have noninteractive/total-time limits. Claude and Codex are selected only from a trusted server-side runtime allowlist.

## Enablement gates

1. Set `MC_FLY_CONTROL_URL` to the deployed Mission Control HTTPS URL. It cannot be localhost. This is currently absent from Doppler, so no real leaf can start yet.
2. Set `ANTHROPIC_API_KEY` to a dedicated worker key and `MC_FLY_GIT_AUTH_TOKEN` to a short-lived, fine-grained GitHub credential. Both names are configured, but the credential values are intentionally absent. Never use a desktop Claude OAuth session or personal token.
3. Push a clean Stillpoint base commit and place its full SHA in `fly_base_sha`. The current remote `main` SHA was verified as `d1842d036cdcd8555a25fed99dcaca9e909f5fa3`; do not use it if the intended task needs the unpushed local `ui-edit` worktree.
4. Run one explicit low-risk Fly task at the current `MC_FLY_MAX_WORKERS=1`, inspect branch, runtime, telemetry, and cost, then increase to two workers.

## Remaining risks to resolve before broad rollout

- An ambiguous `POST /machines` response can leave a remote Machine alive while local fallback starts. Keep fallback disabled for ambiguous creates; reconcile by deterministic Machine/job name first.
- Capacity and budget reservation are not yet one cross-process SQLite transaction. A multi-scheduler deployment needs an atomic reservation row/transaction.
- Reconciliation should not requeue a task until Machine destruction or absence is confirmed. Missing Fly credentials must leave it `cleanup_pending` and alert.
- Enforce a trusted running-cost ceiling on every reconciliation cycle for daily/monthly and explicit per-task caps, then destroy the job before the next billing increment.
- Poll Fly Machine state or use an event feed; current fleet figures are application heartbeat state, not authoritative remote state. Separate recent failures from historical totals.
- Scan changed files for credentials before committing/pushing a worker branch.
- Add a per-job callback rate limit and a controlled audit log for redacted worker diagnostics.

## Cost optimization decisions

- Keep network/LLM coding on shared `core-small` or `core-standard`; promote only measured CPU/RAM-heavy work to performance classes.
- Start with one concurrent worker, a 30-minute task budget, and $3/$40 daily/monthly ceilings. Browser workers are on-demand only.
- Do not allocate volumes, public services, or static egress IPs. `auto_destroy` avoids stopped-rootfs storage after each worker.
- Refresh the `iad` hourly price cards before enabling or whenever Fly changes pricing. The configured card is $0.0082/hr for 1GB shared, $0.0154/hr for 2GB shared, $0.0894/hr for 2×4GB performance, and $0.1788/hr for 4×8GB performance.
