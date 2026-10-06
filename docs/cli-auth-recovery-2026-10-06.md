# Mission Control CLI authentication recovery — October 6, 2026

## Verified live outcome

- Existing native desktop approval restored ordinary CLI session authentication.
- Verified `/api/auth/me` username: `admin`; desktop display name: `tylerdevries`.
- Existing backend: `http://127.0.0.1:4000`; no second backend started.
- Private default profile: mode 600, directories mode 700. No password reset,
  global API key, credential extraction, desktop restart or security override.
- Canonical Fly bridge authenticated using that profile. Configuration reports
  ready, no issues, shared cap 25, one active reservation, 24 available slots.
- The actual canary was accepted, but remains queued; provider execution and
  cleanup are not accepted. Scheduler reports `Fly unavailable; queued work and
  reservations retained`; its log only identifies `FlyMachinesError`.

## Scoped findings and repairs

| Finding | Repair | Verification |
|---|---|---|
| Password-only CLI recovery despite unlocked app | Reuse existing desktop one-time approval; verify actual account before saving | Live sign-in and identity succeeded |
| CLI JSON can reveal Set-Cookie | Strip response cookie from printable JSON | Regression test added; live identity output contains no cookie |
| Weak profile persistence and silent corrupt fallback | Private modes, owner/type checks, no symlinks, bounded reads, atomic replacement, private optional backup | Live modes verified; regression tests added |
| HTTP timer ends before body finishes | Keep timeout through body read; bounded timeout input | Syntax verified; stalled-body tests added |
| Read failures have no retry; mutation retry is ambiguous | Retry GET network failure once, never consuming login/mutations or auth denial | Regression tests added |
| Password supplied in process argv | Add stdin input and warning for legacy password flag; prefer desktop approval | Syntax verified; no password used in recovery |
| User helper still asks for forgotten password | Replace helper with profile reuse / desktop approval | Updated helper executed successfully |
| Configuration-ready status mistaken for worker success | Separate login, configuration, execution and cleanup receipts | Queued canary and provider failure disclosed |

New security modules are under 200 lines. Existing large CLI/MCP files were not
broadly rewritten. This is a scoped authentication/control-plane audit, not a
whole-repository security certification.

## Worker verification and remaining steps

Owned canary IDs:

- Submission: `f0d7e9b353144a0ea226a116784c4875`
- Task: `1325`
- Session: `stillpoint-mc-auth-recovery-20261006`
- Request: `stillpoint-mc-auth-recovery-canary-20261006-v1`
- Pinned Stillpoint source: `ef1ae7507a7b51990ce490cf5fd068104fa32195`

Do not duplicate accepted work locally. Do not cancel another session's reservation.
Only queued, unlaunched owned work may be cancelled through the supported bridge.

Doppler's current `Mac-Studio` identity can list Mission Control secret names,
but `doppler run --project mission-control --config prd --no-fallback` fails on
restricted-secret access. The earlier documented controller service-token path
is absent. No alternate credential store, cached secret or permission bypass was
used. A properly authorized service-token flow is required to diagnose the
actual Fly HTTP response. Token expiration is not yet proven.

Automated unit/lint/type checks must run on a clean pushed revision through
Mission Control once provider access is restored; this host has only 13 GiB free.
Syntax, whitespace and live authentication proof do not replace those checks.
Protected integration and deployment remain separate from a pushed repair candidate.

AST-only Graphify update completed; final counts are in the private graph report.
Generated graph snapshots were preserved privately at
`/private/tmp/mission-control-auth-recovery-20261006/graphify-out`; their broad
regeneration is excluded from the scoped source patch. Existing parser warnings
in five unrelated files are not interpreted as TypeScript compilation failures.

## Reuse

The local helper now reuses the session and does not launch workers:

```sh
python3 /private/tmp/stillpoint-fly-connect-20261006.py
```

If a fresh login is needed, the repair candidate supports:

```sh
node /Users/tylerdevries/Dev/mission-control/.claude/worktrees/cli-desktop-recovery-20261006/scripts/mc-cli.cjs auth desktop-login --url http://127.0.0.1:4000 --expected-user admin
```

Approve its displayed short code in the unlocked desktop app's Settings > Browser
access. The command rechecks identity before saving. Session expiry or revocation
requires sign-in again; native app passkey unlock alone does not sign in the CLI.
