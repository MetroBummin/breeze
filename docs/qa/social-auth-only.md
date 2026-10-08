# Social auth extraction review

Base: released main `e7b61d5304d20d639d45fc8dd23116db5d6446e5`.
Source: authentication portions of draft #122. No guided onboarding is included.

Local `npm test`, the 27 auth unit checks, typecheck (34 pre-existing diagnostics;
no increase), auth boundary and `git diff --check` passed on 2026-10-08.
Browser and Swift results are verified separately on the PR commit in CI.

## Automated proof

- `npm test`: full existing Node/integrity suite plus 27 social auth unit checks.
- `node tests/verify-social-auth-boundary.mjs`: existing tutorial, Reader,
  Home/Memory/brand CSS and native release configuration remain intact.
- `BROWSER=chromium/webkit node tests/verify-email-login-browser.mjs`: narrow phone,
  phone, tablet, desktop and short viewport, light/dark, keyboard activation,
  44px targets, pending email, close/reopen and password return. Reduced motion.
- `BROWSER=chromium/webkit node tests/verify-social-login-browser.mjs`: both
  providers on web and simulated iOS. Actual app, bundled Supabase SDK, callback
  acceptance, persistent store, auth listener and reload; provider and OS consent
  responses are local substitutes. No paid lookup or live provider request.
- `node tests/verify-auth-native-policy.mjs`: 36 Foundation checks using extracted
  production URL validation plus Swift syntax parse.
- Social auth CI compiles the unsigned iOS Simulator app. Existing Integrity,
  sentence, word, design/brand and Android PR checks remain enabled.

Browser screenshots are uploaded as `social-auth-chromium` and
`social-auth-webkit`; these show Settings sign-in choices and email state across
all viewport/theme combinations. They do not show genuine provider consent.

Local worker has no installed Swift compiler or Playwright browsers; browser
installation is blocked by the environment's HTTP proxy. Native/build/browser
results must be taken from the exact-head GitHub checks, not claimed locally.

## Redirect and native evidence

- Provider callback: configured Supabase project origin plus `/auth/v1/callback`.
  This is the Google authorized redirect URI and Apple Services ID Return URL.
  It differs from the final application redirect.
- Web final redirect: `location.origin + location.pathname`, as with existing
  email links. Production origin is `https://breeze.io.kr`. Preserve valid existing
  Site URL and entries; approve any changes separately.
- iOS final redirect: `kr.io.breeze.app://auth/callback?request=<UUID>`.
  Supabase allowlist candidate: `kr.io.breeze.app://auth/callback\?request=*`.
  `?` must be escaped as a literal in Supabase glob syntax. Verify actual matching
  before the owner approves adding it; do not add an unrestricted scheme glob.
- Existing bundle ID is `kr.io.breeze.app`. The system consent session owns the
  callback scheme; no new entitlement, URL type, OAuth SDK, signing or provisioning
  configuration is introduced. Native policy tests reject wrong/duplicate request,
  wrong host/path/scheme, userinfo/ports and off-project authorize URLs.
- Browser-based Google uses a Web OAuth client. Apple uses a web Services ID
  associated with the correct primary App ID. Native token login is not added.

## Owner-approved post-deployment checklist

1. Read provider configuration and redirect allowlist in the authorized console.
   Confirm existing Google Web client, appropriate Apple Services ID, accepted
   Client IDs, valid secrets and Apple's secret expiry. Enter credentials directly
   in the owner console; never commit or record them in screenshots/logs/chat.
   Approve any key generation/provider enablement/redirect changes at action time.
2. On `https://breeze.io.kr`, test Apple and Google consent success, denial, back,
   retry and reload with an owner-approved test account. Confirm real account ID,
   SDK persistent session, provider identity and correct final app URL. Confirm
   Testing-mode Google test-user access where applicable. No token in screenshots.
3. On physical iPhone and iPad, test the system consent sheet, callback to the
   same app, dismissal, two-minute timeout, late callback, foreground/background,
   interruption and app reopen. Confirm the exact UUID return is accepted. A
   killed app must not accept an orphan callback or erase existing local data.
4. Compare account IDs and retained library/vocabulary/reading history with the
   expected existing account. Same email alone is not evidence of identity/linking.
   Confirm vault unlock/recovery and no cross-account data exposure. Do not merge
   identities automatically or weaken auth/quota/security settings to pass tests.
5. Confirm email link/code and password fallback, unsupported Android behavior,
   logout/relogin and guest access. The existing tutorial and its returning-user
   completion marker must behave exactly as before.
6. Review official provider button branding, real-device accessibility, keyboard,
   contrast and safe areas before a separately approved production release.

Official references: [Google](https://supabase.com/docs/guides/auth/social-login/auth-google),
[Apple](https://supabase.com/docs/guides/auth/social-login/auth-apple),
[redirect patterns](https://supabase.com/docs/guides/auth/redirect-urls).
No live provider configuration or real consent outcome is established by this PR.
