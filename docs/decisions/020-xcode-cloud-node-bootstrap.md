# Xcode Cloud Node 22 bootstrap

The user authorized one minimal follow-up merge to repair the dependency bootstrap
after automatic build 254 and the same-source rebuild 255 failed before compiling.
Both used main `0df44b4f4cf6cea7cd18a33fc338481c3c7b2f94`. The owner supplied the
255 post-clone log: `A brew install node@22 process has already locked
/opt/homebrew/Cellar/openssl@3`. Homebrew auto-update had selected node@22
22.23.3_1 and an openssl@3 3.6.5 upgrade. Which external installer held that
lock is unverified; the failure alone does not establish a duplicate repository
script, Swift compile error or signing error.

The hook previously equated a missing PATH runtime with a missing installation.
Homebrew's node@22 is keg-only. Prefer a working Node 22/npm already on PATH,
then validate the `brew --prefix node@22` executables before installing anything.
Keep Node 22, the original Homebrew formula provenance and all npm/release/sync
checks. Do not download a separate Node binary or bypass bottle/checksum checks.

If installation is necessary, scope `HOMEBREW_NO_AUTO_UPDATE`,
`HOMEBREW_NO_INSTALL_UPGRADE` and `HOMEBREW_NO_INSTALL_CLEANUP` to that one
`brew install node@22` command. This prevents metadata migrations, upgrades of
already installed formulas and unrelated cleanup on the prepared CI image. It
does not disable download, bottle or checksum validation. Retry only Homebrew's
explicit `has already locked` diagnostic: at most 12 attempts with 5-second waits
between them (at most 55 seconds of deliberate waiting). Recheck the installed
runtime before each attempt so another installer's completed work can be reused.
Other errors and an unusable installed runtime fail before project mutation.
Never remove or bypass Homebrew's lock files. Remove only this hook's own log.

The production-hook regression executes the complete shell script with isolated
external-tool fixtures on Linux and macOS. It covers keg-only reuse, wrong PATH
versions, missing runtime, peer completion, transient/persistent contention,
checksum/download errors, invalid npm and release-preflight failure. macOS CI also
runs the entire real post-clone chain with a synthetic counter 900 in its disposable
checkout; it creates no archive, upload or actual Xcode Cloud counter reservation.
The checked-in 1.9.1 (253) baseline and Apple's ownership of CI_BUILD_NUMBER remain.

The same explicit follow-up corrects one landing sentence to say Google/Apple login
is available on the web. Android remains publicly in preparation; this copy makes
no claim that native 1.9.1 has shipped or passed review. Browser checks exercise
both Korean/English hero states and light/dark phone, tablet, desktop, narrow and
short viewports. Approved artwork, layout and native authentication stay pinned.

One main merge triggers the existing automatic Xcode Cloud build. Do not manually
start another run. The owner continues TestFlight/App Review work after verifying
the actual archive; this patch does not perform those account operations.

Sources: [Homebrew node@22 formula](https://formulae.brew.sh/formula/node@22),
[Homebrew install/environment semantics](https://docs.brew.sh/Manpage).

Local verification before publication: the keg-only regression fails with the
previous hook and reproduces the owner's exact openssl@3 lock diagnostic; all 14
cases pass with this hook. Full npm test, shell/JS syntax, integration boundary,
iOS sync/native package/native service-worker checks and git diff checks pass.
Typecheck retains the existing 32 diagnostics. Chromium passes all 60 landing
scenes and 10 support views, including both hero languages. macOS/Node 22, WebKit,
unsigned Swift compilation and the actual automatic Cloud archive require their
respective CI results; Linux verification is not evidence of signed native upload.
