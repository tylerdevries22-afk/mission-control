# October 2026 dependency audit

The OSV artifact for PR #17 reported 33 existing advisories across 15 package
versions. Compatible dependency floors replace affected releases, including
Next.js 16.3.6, Vitest 4.1.11, PostCSS 8.5.23 and Undici 7.29.1. The seven-day
release-age policy remains enabled. Scanner failures remain visible.

## Braces mitigation awaiting an upstream release

[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
affects braces through 3.0.3 and lists no patched version as of October 2, 2026.
In this lockfile, its consumer chain is ESLint's Next plugin → fast-glob →
micromatch → braces. Application source has no direct braces/micromatch import.
This identifies a build-tool path; it does not prove every execution is safe.

`patches/braces@3.0.3.patch` rejects excessive parsed nesting before recursive
walkers and checks caller-supplied ASTs before compile, expand and stringify.
Traversal is bounded to depth 128 and 65,536 nodes, including cyclic ASTs.
The standard unit gate checks normal patterns and hostile inputs against the
installed patched dependency. The package version remains 3.0.3, so OSV can
continue reporting the advisory. No ignore or scanner exemption is applied.
Remove the patch only after a compatible upstream fix passes these regressions.

## API token digest review

CodeQL's `js/insufficient-password-hash` alert points to the SHA-256 API-token
lookup digest in `auth-keys.ts`. Newly issued global and agent keys contain
24 cryptographically random bytes; session tokens contain 32. Human passwords
use salted scrypt with N=65,536, with progressive upgrades of legacy hashes.
The token digest must retain compatibility with persisted agent keys and the
global-key migration. The scanner alert is retained for review; no query or
security check is suppressed. Legacy operator-selected keys cannot be assumed
to have the same entropy as generated tokens. Rotate weak legacy keys through
the existing authenticated key-rotation flow after updating their clients.
