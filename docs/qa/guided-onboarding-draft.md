# Guided onboarding draft review

Base: main `3e299d96` (#121). Separate branch `codex/guided-onboarding-draft`.
No #120 integration, sentence extraction/truncation, release version,
auth request methods or security/provider configuration changes.

The welcome uses the existing mascot and one bottom action. A minimal lesson
hides Reader chrome while sharing its actual word mini pill, expansion, sentence
translation and easy explanation. The reveal reduces the large word into its
source sentence. One instruction per step and only font size initially keep
choices limited. The final screen offers book import or Later; login lives in
normal Settings. Local answers avoid paid calls and durable demo records.

## Rendered captures

These are actual system Chromium renders with external requests blocked,
including a real long press in the video. They are not image mockups or native
iOS recordings. Screenshots and video are also saved in ChatGPT Library.

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
| Actual interaction recording | [video](guided-onboarding/walkthrough.webm) |
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
a direct public download attempt. The disabled Settings button is a **provisional
text-only appearance**, not a completed official Apple component. Its approved
logo/asset still needs access. Repository inspection found no Apple auth flow
or entitlement on any supported platform; the UI explicitly says unsupported.

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

- Full `npm test`, typecheck (34 existing baseline diagnostics, no increase),
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
- Production word, sentence, sentence-help and shared Home/Reader controls
  browser regressions.

Playwright Chromium/WebKit downloads returned 403 “Domain forbidden”; installed
system Chromium was used. WebKit and physical iPhone/iPad safe-area, keyboard,
gesture and WebView verification remain unperformed. Live email/password login
was not exercised. Apple artwork and Pinterest access remain blocked as above.
The local build's existing “빠짐: public” note remains. This is a draft only:
no merge, deployment, native archive, App Review submission or active release change.
