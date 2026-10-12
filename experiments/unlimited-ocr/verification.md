# Verification receipt — 2026-10-12

Environment: Linux x86_64, Node v24.19.0. Repository base and remote `main`
verified as `8512e8fd25e51d6aa06cf926bad165d5c3994865`.

Passed:

```sh
node --test experiments/unlimited-ocr/contract.test.mjs tests/verify-pdf-ocr.mjs tests/verify-pdf-ocr-library.mjs
# 54 tests: 12 experimental contract tests + 42 existing OCR tests; all passed
node tests/verify-pdf-glyph-geometry.mjs
# Spacing, fonts, punctuation, ligatures, multiline, transforms, rotation, scale,
# cropped Form text, hidden sources, nesting and partial bounds passed
git diff --check
```

The contract tests use authored outputs and a mock loopback HTTP server. Their
runtime is test execution time, not OCR inference latency. No inference output
or comparison report was generated. Native Vision/ML Kit and Unlimited-OCR
benchmarks are **not run**. Server peak VRAM, real latency, accuracy and actual
cost remain unmeasured. No full product/browser suite or physical device run is
claimed; production files are unchanged.

An initial OCR test invocation passed 41/42 existing checks; the final native
bridge contract needed absent `@capacitor/ios` assets. The first `npm ci` could
not create `/home/agent/.npm/_cacache`. Installing the unchanged lockfile with
`npm ci --ignore-scripts --no-audit --no-fund --cache /tmp/breeze-unlimited-npm-cache`
succeeded, then all tests above passed. Lifecycle scripts were disabled; no
package/lockfile changes were made.

Read-only shell transport restrictions: `gh pr view 156 --repo
MetroBummin/breeze` returned GraphQL HTTP 403; the existing authorized GitHub
connector subsequently verified the PR's protected head/base. A direct Python
HTTP GET of `https://huggingface.co/api/models/baidu/Unlimited-OCR` returned proxy
HTTP 403 before any revision metadata was obtained (the subsequent GitHub
metadata GET in that script never ran). No proxy restriction was changed.
The browser tool successfully read the four official sources linked in README;
an immutable model revision remains unverified. The harness requires operators
to record the actual model/runtime used for a future run.

Branch isolation: a separate worktree `/workspace/breeze-unlimited-ocr` was
created on `experiment/unlimited-ocr-comparison` from `origin/main`. At the
initial published head all changes were new files under this experiment. The
CI follow-up below adds only the exact branch-specific Integrity gate. No release assets,
production OCR, existing corpus, PR156 branch or 1.9.3 integration branch changed.
No merge, deploy, native archive, paid server provisioning, credentials, private
document uploads, model downloads or upstream custom-code execution occurred.

## Fresh CI follow-up

The original published SHA `a4a1946b0fbd0221a828aa4dbb62f46bdb31591c` ran
[Integrity 38235156586](https://github.com/MetroBummin/breeze/actions/runs/38235156586).
Its contracts job failed at the frozen 1.9.2 boundary with `Unapproved 1.9.2
path: experiments/unlimited-ocr/.gitignore`; the full npm test step was skipped.
This was a scope mismatch: a non-release experiment is outside the historical
release receipt. No historical receipt or verifier was modified to allow it.

The follow-up changes only that workflow gate on this exact experimental branch.
`verify-boundary.mjs` verifies every pinned `main` production/config/release byte
and file mode, accepts only regular additions under the experiment directory and
the exact gate text, then runs the original 1.9.2 and nested 1.9.1 verifier on
the pinned base in a temporary worktree. Other branches retain the original
gate. The full npm test and all browser checks remain enabled for this branch.

Local follow-up validation passed:

```sh
node experiments/unlimited-ocr/verify-boundary.mjs
# unchanged historical 1.9.2 + nested 1.9.1 checks passed
node --test experiments/unlimited-ocr/contract.test.mjs experiments/unlimited-ocr/boundary.test.mjs
# 15 tests passed, including negative production/receipt/deletion/mode/symlink/workflow checks
npm test
# full repository test command passed, exit 0
git diff --check
```

See [prerequisites.md](prerequisites.md) for the official no-cost Space research.
It does not change the benchmark status: all real inference measurements remain
not run. Final remote CI results are recorded in the draft PR description after
the follow-up head's checks become terminal.
