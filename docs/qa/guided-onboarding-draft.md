# Guided onboarding draft review

Base: current main `c649047d` (#120), including responsive sentence pill #121.
Separate branch `codex/guided-onboarding-draft`; main was merged into this draft
for combined verification. Both #120 auth deadlines and #121 presentation are
preserved. No sentence extraction/truncation, release version,
existing email/password request or security/provider configuration changes.

The welcome uses the existing green-leaf app-icon mascot and one bottom action.
Neutral white/gray space, left-aligned typography and a dark CTA follow the five
references supplied in the conversation. Their artwork was not copied.
Standalone leaf images were found in Library metadata, but pixel reads and
authorized downloads failed; the repository icon is reused unchanged. A minimal lesson
hides Reader chrome while sharing its actual word mini pill, expansion, sentence
translation and easy explanation. The word means “산들바람”; a gentle fade/scale handoff reveals the separate
sentence “Let your reading flow.” without implying Breeze belongs to it. One gently breathing actionable target and only font size initially keep
choices limited. The final screen offers book import or Later; login lives in
normal Settings. Local answers avoid paid calls and durable demo records.

## Rendered captures

These are actual system Chromium renders with external requests blocked,
including a real long press in the continuous 30-second video. No cuts conceal
transitions. The recording ends at book import / Later; it contains no auth simulation.
Verified native Library video: `libfile_4c2ea8fa6fc481919b48ba2e749ae0a5`, version 5,
`walkthrough.mp4` (H.264 Main, yuv420p, fast-start). These are system-browser recordings, not image mockups or
native iOS recordings. Screenshots and video are also saved in ChatGPT Library.

| Surface | Capture |
| --- | --- |
| Mascot welcome | [welcome](guided-onboarding/welcome.png) |
| Large word | [word](guided-onboarding/word.png) |
| Production mini pill | [mini pill](guided-onboarding/word-mini.png) |
| Chevron expansion | [expanded word](guided-onboarding/word-expanded.png) |
| Revealed sentence | [sentence](guided-onboarding/sentence.png) |
| Sentence translation | [translation](guided-onboarding/translation.png) |
| Easy explanation | [easy explanation](guided-onboarding/easy.png) |
| Font-size preview | [reader settings](guided-onboarding/reader-settings.png) |
| Book import / Later | [finish](guided-onboarding/finish.png) |
| Normal Settings login choices | [Settings](guided-onboarding/settings-login.png) |
| Existing email form | [email](guided-onboarding/settings-email.png) |
| Actual interaction recording | [video](guided-onboarding/walkthrough.mp4) |
| Tablet dark finish | [820px dark](guided-onboarding/tablet-dark-finish.png) |
| Desktop sentence | [1440px light](guided-onboarding/desktop-light-sentence.png) |
| Short finish | [844×390](guided-onboarding/short-finish.png) |

## Sources and access limits

[Apple's Sign in with Apple guidance](https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple)
was checked: monochrome light/dark variants, approved localized title, minimum
size and accessible spacing. [Apple Design Resources](https://developer.apple.com/design/resources/)
links its approved logo. The official
[logo download](https://devimages-cdn.apple.com/design/resources/download/Logo-Sign-in-with-Apple.dmg)
and hosted button-image endpoint returned HTTP 403 in this environment, including
a direct public download attempt. The Settings button is a **provisional text-only appearance**, not a completed
official Apple component. Its approved logo/asset still needs access. Web login
is wired to the existing Supabase OAuth client with a read-only provider check.
Google follows Apple, with a subdued email/password secondary route. Native shells
without the callback bridge remain unavailable, including Android. The iOS draft
adds a main-frame-only `ASWebAuthenticationSession` bridge and UUID-bound callback
validation. This uses web OAuth consent in the system browser; it does not add
ASAuthorizationAppleID/native credential grants, entitlements or provisioning.

[Supabase Apple documentation](https://supabase.com/docs/guides/auth/social-login/auth-apple)
and [Apple web setup](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/)
were inspected. Production provider state is **unverified**, not known disabled:
the read-only public settings request failed in this environment and no auth
configuration read tool is exposed. The smallest web setup gap is owner verification
that the existing Apple provider is enabled with the correct Services ID and current
secret, and that the existing web return URL is allowed. The registered Apple web
callback must be `https://hrtfhojbhqvaoiulspto.supabase.co/auth/v1/callback`. No key
was fetched, created or changed. The same client code now covers Google. Its owner setup requires an existing
Google web OAuth client, approved app origins and the same Supabase callback,
then provider configuration. No Google scopes beyond existing basic sign-in are
requested. See [Supabase Google setup](https://supabase.com/docs/guides/auth/social-login/auth-google).

For iOS consent return, the draft requests
`kr.io.breeze.app://auth/callback?request=<UUID>`. Provider return first goes to the
Supabase HTTPS callback above. Owner approval is needed for the additional native
redirect allowlist entry. A narrowly scoped candidate pattern is
`kr.io.breeze.app://auth/callback\?request=*` (literal question mark, UUID suffix);
verify it against [Supabase redirect matching](https://supabase.com/docs/guides/auth/redirect-urls)
and actual device consent before enabling rollout. The native bridge independently
requires the exact callback host/path and current UUID. No allowlist or Site URL
was changed. No Info.plist URL scheme, entitlement or provisioning change is used
by this system consent-session draft.

No Xcode, Simulator or Swift compiler is present here. The Swift bridge compiled successfully in the unsigned Simulator CI job at
`4900a20`; local compilation and native execution remain unavailable. The draft
workflow checks this again on each relevant PR change. A device/simulator
consent handoff is still required.
Live Apple/Google consent, callback and persistence require the owner to sign in
on approved accounts after setup verification; credentials must stay with the
provider. Browser tests substitute provider responses and do not prove live login.
Existing account IDs/data are not migrated or merged; no identity-linking settings
change. Apple private-relay and Google emails may identify separate accounts.
Returning users should use their existing sign-in method; reconciling different
identities requires an explicit account-linking decision, never a silent merge.

Requested Pinterest research could not be completed. Public search pages and
exact-domain searches were attempted for
[minimal onboarding](https://www.pinterest.com/search/pins/?q=minimal%20app%20onboarding),
[reading apps](https://www.pinterest.com/search/pins/?q=reading%20app%20onboarding),
and [language learning](https://www.pinterest.com/search/pins/?q=language%20learning%20app%20onboarding).
Pinterest access returned HTTP 403; image search returned no usable pins and web
search yielded unrelated results. No Pinterest pin is claimed as reviewed or
used. The repository design system and primary
[Figma UI hierarchy reference](https://www.figma.com/resource-library/what-is-ui-design/)
informed spacing and focus. No third-party artwork was copied.

## Validation

Passed on 2026-10-07:

- Full combined `npm test` (including #120 auth deadline tests), typecheck (34 existing baseline diagnostics, no increase),
  `npm run www`, and whitespace checks.
- Chromium onboarding: real word/chevron, long-press release gate, local help,
  live font preview, interrupted/reopened, Back, Skip, Later, import success,
  replay restoration, stale-result cancellation, keyboard word/chevron and
  long-press alternative, reduced motion, returning vocabulary, durable data
  and appearance isolation, zero dictionary calls, web/native-shell emulation.
  Browser offline mode covers word, sentence and easy-help interactions.
- All five stages checked for overflow in both themes at five viewports.
- Existing email request, duplicate-send gate, reopening and password return
  with mocked auth, keyboard email disclosure and 44px password target in
  light/dark at narrow, phone, tablet, desktop and short sizes.
- Apple/Google operation tests: configured/unconfigured providers; native bridge
  absence; a stalled SDK settles at the whole-operation deadline; timeout/retry,
  cancellation, new ownership and late replies cannot navigate or unlock new work.
  Native callback UUID binding and custom-scheme return are emulated, not native execution.
- Real bundled Supabase SDK in Chromium, with substituted provider server: actual
  authorize URL, callback acceptance into app, persistent session and signed-in
  Settings after reload for both Apple and Google. No live provider login claimed.
- Production word, sentence, sentence-help and shared Home/Reader controls
  browser regressions.

Local Playwright Chromium/WebKit downloads returned 403 “Domain forbidden”; installed
system Chromium was used. The draft CI workflow runs the onboarding and SDK callback
tests in Chromium/WebKit and performs an unsigned iOS Simulator compile. Physical
iPhone/iPad safe-area, keyboard,
gesture and WebView verification remain unperformed. Live email/password or Apple/Google login
was not exercised. Native consent execution is unverified. Apple artwork,
standalone leaf artwork and Pinterest access remain blocked as above.
The local build's existing “빠짐: public” note remains. This is a draft only:
no merge, deployment, native archive, App Review submission or active release change.

Terminal `gh pr checks` and check-runs reads return “Forbidden”. Connected GitHub
workflow reads remain usable. Exact final-head CI status is recorded in the draft
PR; no older-head run is counted as validation for this version.

The cue revision removes persistent visible tap instructions. A single halo follows
the current word, chevron, help or font control and stops on activation. After
3.5 seconds of inactivity a short local hint appears; the sentence also has a
contact ring. Screen-reader instructions and keyboard/tap alternatives remain.
Reduced motion uses a static outline. Browser assertions cover cue ownership,
immediate stopping and delayed long-press guidance. The continuous MP4 preserves
all 749 source-frame timestamps; full decoding passes. iPhone Photos import is
still unverified. The older WebM is retained as historical evidence.

At head `1492719`, guided Chromium/WebKit, unsigned iOS compilation, responsive
sentence #121 and all other workflows passed. Integrity reached its configured
30-minute job limit during final WebKit reopening, after Chromium reopening passed.
The serial suite keeps every case and receives a 35-minute job budget; exact
revision-head CI must finish before claiming complete verification.
