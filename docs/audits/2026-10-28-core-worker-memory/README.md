# Core command-worker memory approval and verification

The prior largest class cannot accommodate the retained ACTZ build history:10,985.734375MiB ×1.25 =13,732.16796875MiB. Preserve that history,25% headroom, four performance CPUs and all command/verification deadlines. The human authorized this existing PR20 takeover and an explicit core-only16GiB option on2026-10-28. No source promotion, protected merge or production release is implied.

## Configuration

`MC_FLY_CORE_XLARGE_MEMORY_MB=16384` enables16,384MiB for core-xlarge only. Other values retain legacy core selection. Legacy `MC_FLY_LARGE_MEMORY_MB=12288` continues to select12GiB for core; browser retains the canonical9,216-or8,192MiB behavior. This intentionally narrows the earlier unactivated PR20 shared12GiB option to prevent an accidental browser allocation increase. No caller resource override or worker class was added.

The16GiB shape exclusively requires `MC_FLY_CORE_XLARGE_16384_HOURLY_USD`; an older generic core-xlarge price or8GiB fallback cannot price it. Current official Ashburn(iad) coefficients give$0.2500416/hour;1,800+300seconds reserves$0.1458576. See the captured[official pricing research](official-pricing.md). This estimates compute only; it is not an invoice or a runtime commission. Verify current regional pricing before use.

## Verification and delivery

Two new focused test modules cover exact opt-in/invalid fallback, unchanged browser/defaults, the real history peak and headroom boundary, missing dedicated price, real SQLite admission/reservation including the Machine guest request, cumulative per-job spending, daily/monthly limits and missing-price revalidation. Existing tests and all admission/reservation/budget/worker/schema logic remain unchanged. Independent review found no blocking source bug. The source graph update passed; canonical checks remain pending at this checkpoint.

The unchanged authorized limits are monthly$65.50, daily$3, saved per-job$0.25 and global25workers. ACTZ compiler heap remains6,144MiB. Larger guest memory does not establish a compiler pass. ACTZ Apple acceptance remains8/116 and requires its original tests, native, signed, hosted, provider, legal and cohort evidence.

## Activation gates

Publish and verify this same PR branch. Normal source promotion/release gates still apply; do not self-merge or overwrite protected main. The current service starts the canonical standalone artifact and has no supported PR-worktree selector. Do not use deploy:standalone to kill listeners or launch a second backend.

Before any authorized same-service reload, use supported launch pausing where required and reconcile the complete controller pool: no creating/running/cleaning or uncertain launches, terminal cleanup confirmed, no scheduler/admission race. Preserve queued rows, reservations, identities and other owners. Verify effective settings after Doppler loading and confirm spending/worker caps, core-only selection and actual guest memory through controller-owned evidence. Do not claim16GiB was activated or observed from source/tests/metadata alone.
