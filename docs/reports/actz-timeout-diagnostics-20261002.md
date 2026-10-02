# ACTZ command timeout diagnostics

The original command deadline still fails the job. A bounded, allowlisted diagnostic projection now survives that failure into the durable result and scoped status response. Native-close classification preserves early-stop behavior and existing cleanup, retries and capacity. Unknown lines, URLs and credentials are omitted; no arbitrary log tail is published. Compiler witnesses use a strict bounded schema and do not infer OOM.

Validation on the isolated branch from `fc22765bd421eb0fac87dc19c19723b54b441d86`:

- Native process, workflow and timeout regression suites: 28 tests across 6 suites passed.
- Controller parsing, admission, recovery and in-memory SQLite regressions: 32 tests across 4 suites passed.
- All nine implementation/test paths: ESLint zero errors and warnings.
- Original ACTZ `a87519eb` timeout and compiler failures remain unchanged.

This is a source checkpoint for external review. It does not confirm deployment of the controller or either immutable worker image. Live timeout readback must use the matched deployed versions after the approved rollout; no deadline, memory, capacity or authority increase is included.
