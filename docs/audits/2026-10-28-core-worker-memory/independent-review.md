# Wave278 final independent source review

Verdict: no concrete blocking bug found in the five integrated files. Earlier browser-allocation and reused-price risks are corrected. This review does not execute tests or establish runtime activation, provider capacity/current pricing, workload success or Apple acceptance.

## Exact bindings

Bindings receipt SHA256: 48370c952bb50cc78bf0181d4d4e03e64404e0b6d18476abbd562be07f39f069. All five current file hashes independently match its after_sha256 values:

- src/lib/fly-workers.ts: f5f4eae802b44d45cea008cd75e1dd3df04a7dbdf370f40cfdb55b0a3bdd530f
- src/lib/fly-pricing.ts: 76b4082e1fdcea6bbba8d445d798824e69552c84b0074133e12c3ba49a0ac495
- src/lib/__tests__/fly-core-memory-override.test.ts: 81cea16406543bd7270a7bb0fb90ad119bd0aa583e55dc11fdc5a7a83a821a62
- src/lib/__tests__/fly-core-memory-reservation.test.ts: 28e4d58fffe61fa9d2af6953ccb5e41e77dbe62d2ec6d9643d55ab8971e43860
- .env.example: ffba28733f1dd94867273916d5c05a4ca64f2d00b58025288f78d9bd25026e46

## Production source

- fly-workers.ts:14-16 uses exact-string16384 core-only flag. Browser-large retains canonical legacy9216-or8192 resolver; legacy12288 or16384 does not enlarge browser. Core retains existing PR20 legacy12288 fallback; otherwise legacy9216/default8192 unchanged. Separate core flag overrides only core-xlarge. All classes retain prior CPU kind/count: core-xlarge remains four performance CPUs; other class allocations unchanged. Invalid/new formatted flag values cannot create arbitrary memory classes.
- fly-workers.ts:66-83 retains max historical memory selection and HEADROOM1.25; history filters, class thresholds, CPU p95 and public signatures unchanged. Failed/OOM jobs are still not newly added to successful historical selection. No history deletion/scope change.
- fly-pricing.ts:14-22 exclusively selects MC_FLY_CORE_XLARGE_16384_HOURLY_USD at core-xlarge16384. Empty/zero/negative/nonfinite/missing dedicated rate produces rate0 despite old0.22. Existing fallback condition is only core-xlarge8192; it cannot substitute for16GiB. Core12 retains old core hourly key; browser retains its existing key.
- fly-pricing.ts:23-30 retains immutable image requirement, worktimeout+300 lease cost, every historical sample×1.25 memory refusal and unchanged quarter-dollar per-job threshold.16GiB admits at most13107.2MiB measured peak with existing headroom.16384 does not imply a larger V8heap.
- .env.example:183-190 documents legacy browser/core distinctions, separate exact flag+size-bound price and current regional-price verification before activation. All lines are comments. No runtime config changed.

## Test review (source inspection only)

fly-core-memory-override.test.ts uses actual dynamic imported production sizing/pricing; vi.resetModules before import and vi.unstubAllEnvs/resetModules after each isolate import-time memory settings. Strict flag variants, all relevant browser settings, CPU/class identity, other allocation stability, explicit noflag defaults, actual copied historical-peak number, exact headroom boundary+one-byte rejection, absent/invalid dedicated prices despite old rate, perjob refusal, browser unchanged pricing/headroom and core12 old price have meaningful assertions. Line38 restores non-memory stubs intentionally in the default-size-only case; that case imports only fly-workers and explicitly unsets both memory flags. Existing legacy12 tests remain unchanged and valid when new opt-in is absent; like existing env-dependent tests, they should not inherit an activated controller's core16flag unintentionally.

fly-core-memory-reservation.test.ts has explicit node Vitest environment and actual better-sqlite3 in-memory database, runMigrations, submitFlyLeaf, priceFromFlyHistory via reservation and reserveFlyJob. Only eventBus is mocked. No Fly client or provider request is invoked by that path. Module reset precedes dynamic imports; environment/mocks/module state restored and DB closed after each. Frozen Date.now makes Oct28 UTC day/month boundary test deterministic; monthly prior spend is yesterday inside the same month.

Historical bytes are inserted into a succeeded job matching exact repository/setup/runtime/checks, then the next real reservation is inspected. It verifies guest performance4/16384, actual stored hourly rate/reserve and unchanged command payload/timeout; checks provider FLY_API_TOKEN is not passed into guest env. Missing16GiB price after admission is rejected at reservation with no extra job. Synthetic rate0.2500416 gives reserve0.1458576 at2100seconds; cumulative0.11+reserve>.25, daily2.90+reserve>3, monthly65.36+reserve>65.50 while prior-day spend avoids daily interference, so the three denials exercise distinct real enforcement paths. These are simulated fixtures using copied peak/pricing numbers, not fresh live-machine/provider/price evidence.

The new MAX_WORKERS25 assertion checks environment value, not boundary admission. Actual global cap behavior relies on unchanged existing fly-capacity/fly-admission tests and code; do not describe that single assertion as a25-concurrent-worker test. No failures have been removed or replaced. Existing old PR20 peak/core12 test hash is unchanged.

## Unchanged safeguards bound to previous review

The following all match the exact previous independent review hashes:

- src/lib/fly-admission.ts: e6d58e194bca91aa579cf4e65e54051d0b4b06351325712a60e062da79fd167b (unchanged)
- src/lib/fly-sizing-history.ts: 458ce46ae87a745a60adec7bc355b0883455fb9df391dd6edbc32a4fdb9b852e (unchanged)
- src/lib/fly-reservations.ts: 9c175a2b2579ac58d81c93c1223f810a6356768e064ffa52a79ce823dac69ff3 (unchanged)
- src/lib/fly-budget.ts: 036fd3960d394a87807c71591c50c9383be87cb02a90ce00816034785e45445f (unchanged)
- src/lib/fly-capacity.ts: 51cb27207f3644d6bb752844c7a53b6f0bacb40a8bc1b43e9e8ba5a460251a94 (unchanged)
- src/lib/fly-admission-schema.ts: 1dfca5be67d8cdb4c90e7f4f0ede233ef0ad3adbd03b0ac2bc57fff6f8af7d54 (unchanged)
- src/lib/__tests__/fly-memory-headroom.test.ts: 4adefa3db21f81ebb2fe719eaae293c73ac9fc27e934a34311d8e6ed57edb684 (unchanged)
- src/lib/__tests__/fly-large-memory.test.ts: 9f2b6b69a4ada551f9f672aef43ff3ee81d50e8b2c53baa03d0b81ec2aa333cd (unchanged)
- workers/process.mjs: 62ba83182a04c800692e75cdebf89cba5c5a285277c273050cbdd2bd25001bb9 (unchanged)
- workers/lifecycle.mjs: 5a05f549001898837c6d01af477d81b766378851b1c722e1b617254eb9b0cebd (unchanged)

Therefore global transaction count/reservation, cumulative spend/day/month accounting, admission/schema/repository/image checks, source-bound history selection and worker process deadlines/result retention were not relaxed. Saved limits remain requirements0.25perjob/3daily/65.50monthly/global25; source review cannot prove loaded runtime values. ACTZ heap6144 and source/assertion fences remain separate immutable acceptance constraints.

## Remaining exact gates

Coordinator must execute focused and required canonical verification on bound source through supported contract, check environment isolation, preserve existing PR20/review/merge ownership, and retain final check receipts. Confirm supported regional16GiB performance4 provider shape and current dedicated rate with primary evidence before setting live opt-in. Reconcile active/queued/uncertain cleanup ownership before a reload can automatically unblock other submissions. Read back effective core16384/browser8192(or existing explicit9216), rate and0.25/3/65.50/25 caps. Verify actual selected owned Machine config/telemetry and cleanup through a normal supported leaf, preserving heap6144, deadlines, manifests and assertions. No merge, reload, activation, jobs, tests, Git or configuration writes were performed by this reviewer. Only this private report was written.
