# Guided onboarding draft review

Base: main `3e299d96` (#121). This draft does not include #120 or sentence
extraction/truncation changes. No release version or auth/security configuration
is changed.

The welcome has the existing standalone mascot and one bottom Start action.
One word grows into its original source sentence; each step waits for the real
Reader interaction. Local answers avoid quota/network dependencies and durable
demo records. Tutorial Back and an isolated progress marker support reopening.
The existing completion marker, returning-reader bypass, replay, guest/skip and
previous Reader restoration remain in place.

The final chooser reuses email and password forms. Apple is visibly disabled:
main contains no Apple client flow or Apple sign-in entitlement on web, iOS or
Android. Enabling it is separate work; no credentials/settings were invented.
The small password link retains a 44px tap target for reviewer/existing accounts.

## Rendered captures

All captures below are real system Chromium renders at 390×844, with external
requests blocked. The walkthrough uses a real long press and the production word,
sentence and Aa surfaces. It is not an image mockup or physical iOS recording.

| Surface | Capture |
| --- | --- |
| Mascot welcome | [welcome](guided-onboarding/welcome.png) |
| One large word | [word](guided-onboarding/word.png) |
| Actual word mini pill | [mini pill](guided-onboarding/word-mini.png) |
| Actual chevron expansion | [expanded word](guided-onboarding/word-expanded.png) |
| Revealed sentence | [sentence](guided-onboarding/sentence.png) |
| Actual sentence translation | [translation](guided-onboarding/translation.png) |
| Actual sentence easy explanation | [easy explanation](guided-onboarding/easy.png) |
| Reader Aa | [reader settings](guided-onboarding/reader-settings.png) |
| Email / unsupported Apple / secondary password / guest | [account choices](guided-onboarding/account.png) |
| Actual interaction recording | [walkthrough video](guided-onboarding/walkthrough.webm) |
| Tablet dark account | [820px dark](guided-onboarding/tablet-dark-account.png) |
| Desktop light sentence | [1440px light](guided-onboarding/desktop-light-sentence.png) |
| Short viewport account | [844×390](guided-onboarding/short-account.png) |

## Validation

Passed on 2026-10-07:

- `npm test` (full repository suite), `npm run typecheck`, `npm run www`,
  `git diff --check`.
- `PLAYWRIGHT_BROWSERS_PATH=/tmp/breeze-browsers BREEZE_CHROMIUM=/usr/bin/chromium npm run test:onboarding`:
  actual word tap/chevron, actual long-press release gate, local sentence help,
  Aa, interrupted/reopened, Back, Skip, guest success, replay restoration,
  stale-result cancellation, Enter/Space word lookup and chevron, keyboard long-press alternative, zero dictionary
  calls, durable data/appearance isolation, preserved local vocabulary,
  email/password handoff, reduced motion. Browser offline mode covers word and
  sentence/easy-help interactions. Web and native-shell emulation pass.
- Chromium production word presentation, sentence presentation, sentence help,
  and shared Home/Reader controls regressions.
- All five stages captured and checked for viewport overflow in light/dark at
  390×844, 820×1180, 1440×900, 320×568 and 844×390.

Limitations: Playwright browser downloads returned 403 “Domain forbidden”. Tests
use installed system Chromium; WebKit could not be run. Native-shell emulation
is not physical iPhone/iPad safe-area, keyboard, gesture or WebView verification.
Live email/password authentication was not exercised and Apple is unsupported.
No server deployment, native archive, App Review submission or release change
was made. The local build's pre-existing “빠짐: public” note is unchanged.
