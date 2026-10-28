# Wave280 independent canonical-root reaper review

Conclusion: no new correctness or ownership defect found in the reviewed five-line canonical-root change. The physical-root alias adds equivalent spellings of the same owned project; it does not replace cwd admission with candidate discovery or admit a different project's rollback root. Source-only approval for this bounded repair; activation/reload and broader process-lifecycle guarantees remain separate.

## Exact binding and diff

Live scripts/start-standalone.sh and private reaper-candidate copy both SHA25682710c6e9f21812db24e6cb631b5fb44680a3a08b145713e88a82df0e14454fb. I reconstructed the before bytes solely by removing the new local variable, its pwd-P assignment and the four physical-root clauses; reconstructed SHA25671bbd42c09615ccd94f647eba6294453d2eb795c87f25927c508aff21e6279e1 matches the author's retained before hash. This confirms no hidden edit to discovery, signalling, waits or launcher execution. Candidate has196 split lines, below200.

The only behavior addition computes project_root_real by entering project_root and using pwd-P, retaining project_root as fallback if inaccessible. Existing logical active/want/want_real comparisons stay. Existing two rollback shapes (.next-rollback-*/standalone and .data/releases/.next-rollback-*/standalone) are additionally compared beneath the physical project root, against both observed cwd and canonical cwd. Prefix expansion remains quoted and rooted in this launcher project; glob suffixes are identical to the preexisting allowed rollback shapes. No unrooted wildcard, substring/ancestor admission or new process-name-only acceptance is added.

## Ownership/security reasoning

Candidates from process names, executable discovery, held database or port are still merely candidates. Every candidate still passes the same self/ancestor exclusion and cwd/want/owned-rollback gate before TERM. Empty/unresolvable cwd is skipped; deleted-path normalization remains unchanged. The new physical root solves logical /var versus physical /private/var and equivalent symlink-root spellings without changing the directory family considered owned. A foreign process with cwd outside the actual project/allowed release shapes does not newly match these clauses merely because it shares a name, port or database.

The repair does not claim absolute process-identity safety. Existing PID-reuse/check-to-signal races and preexisting rollback glob semantics were not redesigned; these are not introduced by the alias addition. A same-directory non-controller admitted through another existing discovery source is likewise a preexisting discovery/ownership question, not fixed or widened here. Do not turn this review into a claim that every possible foreign process is excluded under arbitrary hostile filesystem/process mutation.

No changes to environment/Doppler handling, secret-safe argv0, data location, controller activation, provider/budgets or active ownership. TERM20×1s, KILL and50×0.1s teardown observation remain byte-identical. No wait/assertion softened, no broad ignore introduced.

## Original fixture and actual result

scripts/reap-controller.test.sh SHA256fae086dcf253e2ac3c5e40ef04714713335c9c2c1a865aab376b74a553badb52 independently matches original_test_sha256 in reaper-repaired-result.json. Test source unchanged. It extracts the actual production function; asserts detached owned stale process removal even with no port/database handle; same-directory sleep bystander survives; reaper/self/ancestors survive; moved rollback stale process is not discoverable by the new active directory inode yet must be removed; abort markers and final kill-0 outcomes remain.

Retained coordinator result reports actual default Mac fixture exit0 in77.031s, source82710c6..., source_not_activated=true. Log contains the final success text, not the lsof-unavailable skip text. This is evidence of that local run and original assertions; I did not rerun it or inspect/signal any process. It is not live-controller activation, production scheduling safety or full Mission Control QA acceptance.

## Review restrictions

Read-only file inspection/hash comparison only, with this report as the sole write. No process queries/calls, checks/tests, Git, source/config changes, providers or reload. A fresh graph subprocess was not launched because this review explicitly prohibited process calls; the exact named source/test/receipts supplied the bounded evidence.

Frozen review completed; lease released.
