# Social login without onboarding changes

## Decision

### Android PKCE browser sign-in (2026-10-23)

Android Apple and Google sign-in use the same bundled Supabase client and the
same request owner as iOS browser consent. There is no second auth client, no
native Google SDK, and no Android Apple identity-token exchange. iOS Apple
stays on `ASAuthorization`. iOS Google and web Apple/Google stay as they were.

The client asks `signInWithOAuth` with PKCE only for that Android call, then
restores the previous flow so email OTP is unchanged. `skipBrowserRedirect`
stays set. `@capacitor/browser` opens the authorize URL in a Chrome Custom Tab.
Neither plugin was already installed; App is required for `appUrlOpen` and
Browser is required for the Custom Tab and the close event. The system browser
returns through an intent-filter on `kr.io.breeze.app` host `auth` path
`/callback`. The activity is already `singleTask`.

The redirect is the existing iOS value,
`kr.io.breeze.app://auth/callback?request=<UUID>`. The bridge ignores any
callback whose single `request` value is not the open attempt, including a
reply that arrives after cancel, timeout, or a newer request. A matching but
malformed callback, including one that carries `access_token` or
`refresh_token`, does not navigate. A valid callback carries one PKCE `code`
only. A fresh app document lets the same client exchange that code with the
verifier already in its own storage. The code is not a session token and is not
logged. Closing the Custom Tab, or cancelling, rejects that request and
returns the button to its normal enabled state. Cold start with no open
request does not accept a callback. Official button artwork and layout are
unchanged. The buttons stay disabled when the App or Browser plugin is missing.

No Supabase, Apple, or Google provider setting is changed by this work. The
owner still has to allow the redirect and confirm the provider return URLs:

- Supabase Auth redirect allow list: add
  `kr.io.breeze.app://auth/callback\?request=*` if that iOS entry is not
  already present. `?` is a single-character wildcard unless escaped. Do not
  add a bare `kr.io.breeze.app://**` entry. The server appends `&code=` after
  the allow-list check, so the entry is the `redirectTo` value, not the final
  URL. Site URL stays unchanged. PKCE is selected by this client's
  `code_challenge`; there is no separate project toggle to enable.
- Apple Services ID Website URLs: no change. The return URL remains
  `https://<project-ref>.supabase.co/auth/v1/callback`. The app scheme is not
  an Apple return URL. Android does not add a native Sign in with Apple
  capability or a new Services ID.
- Google Cloud OAuth client: no change. The authorized redirect URI remains
  the same Supabase `/auth/v1/callback` on the existing Web client. Do not
  create an Android OAuth client and do not register the custom scheme or a
  SHA-1 fingerprint for this flow.

### Approved 1.9.1 native Apple follow-up (2026-10-09)

iPhone/iPad Apple sign-in now uses AuthenticationServices
`ASAuthorizationAppleIDProvider`. The trusted main-frame bridge carries a fresh
256-bit random raw nonce and UUID state. The OS request uses its SHA-256 digest;
native replies must match the controller, state, audience, issuer, subject,
expiry and nonce digest. The same bundled Supabase client's `signInWithIdToken`
receives the identity token and raw nonce, and verifies the signature server-side.
Tokens stay in memory until the SDK persists its normal session. They are never
put in navigation URLs, diagnostic output or a separate credential store.

The native token exchange binds network completion, JSON parsing and the final
existing session-storage write to its current operation. Closing Settings,
timeouts, session changes and cancellation prevent late session writes. Only a
committed session starts the existing account-owned wordbook sync. Google on
iOS keeps ASWebAuthenticationSession; web Apple/Google keep OAuth. Android
had no new native auth bridge in this follow-up; the 2026-10-23 decision above
adds PKCE Custom Tab sign-in. Official button artwork, layout and guest access stay
unchanged. There is no client email-based identity linking or account migration.

App/Share marketing version is 1.9.1; the checked-in counter remains 253 until
Apple Cloud supplies the actual archive number. Only App gets the Sign in with
Apple entitlement/capability. Provider setup, credentials, Developer-account
settings and App Store review actions remain owned externally. See the precise
device/signing/identity checks in [native QA](../qa/native-apple-191-20261009.md).

### Settings sign-in appearance (2026-10-15)

The signed-out settings sheet uses outlined pills. Google and Apple come first
as full-width 58px buttons with a 1px outline and no fill. The logo sits to the
left of a 17px medium label, and the pair is centered. The Apple control is an
inline logo plus “Apple로 로그인”. The logo keeps the 17:20 artwork proportion
at 16×19px. The packaged official Apple images stay in `assets/auth` as the
provenance record and are not the settings control.

Email sign-in is open on the sheet. There is no collapsible header. The address
field uses a floating label, and the primary button says “인증 코드 받기”.
That button is solid white with black text in dark mode and solid black with
white text in light mode. The message is a six-digit code. After it is sent,
the same sheet shows “코드를 보냈어요”, six outlined code boxes
(`inputmode=numeric`, `autocomplete=one-time-code`), “다시 보내기” with the
existing cooldown, and “이메일 변경”. Six digits submit through the existing
`sbVerifyCode`. `sbSendLink` still calls `signInWithOtp`. The sheet does not
tell the reader to open a mail link. “비밀번호 로그인” stays a muted link.
이용약관 and 개인정보 처리방침 open `https://breeze.io.kr/docs/terms.html` and
`https://breeze.io.kr/docs/privacy.html`.

The original extraction record below describes the submitted 1.9 baseline.

Settings adds Apple and Google alongside the existing email link/code and password
flows. This extracts authentication from draft #122 onto the released main UI;
the existing tutorial, completion marker, guest access, Reader, Memory, brand and
native release configuration remain unchanged. Email form state survives closing
and reopening Settings. Unsupported native shells keep social buttons disabled.

Both providers use the existing bundled Supabase client's `signInWithOAuth`.
Before consent, the public provider settings must explicitly enable the selected
provider. Fetch, JSON parsing and SDK preparation share a five-second deadline.
Session changes, dismissal and cancellation invalidate the current owner; late
replies cannot navigate, release a newer request or write a session.

Web returns to the current origin and pathname. iOS uses the system
ASWebAuthenticationSession from the trusted main `breeze://localhost` frame. The
native policy accepts only the configured Supabase HTTPS authorize endpoint,
Apple/Google, and one exact UUID-bound `kr.io.breeze.app://auth/callback?request=`
redirect. Callbacks must match that request, scheme, host and path. Interactive
consent is bounded to two minutes. A fresh app document lets the same bundled SDK
accept the callback and persist its session; no second auth client or custom
credential persistence is introduced. Generic/cold-launch auth callbacks are not
accepted. Android had no authentication bridge in this extraction and stayed on
email; the 2026-10-23 decision above is the Android bridge.

No provider configuration, key, entitlement, signing, automatic account linking,
quota, vault ownership or security settings are changed. Enabling providers and
adding redirect entries are separate owner-reviewed operations. This is browser
OAuth on iOS, not native ASAuthorizationAppleID or a Google native SDK integration.
Apple OAuth requires an appropriate web Services ID and maintained client secret.

## Validation boundary

The historical design-only release test pins auth to the pre-auth main. For this
explicit extraction, the design workflow uses the auth-only boundary test, which
retains exact existing tutorial/Reader/release hashes, unmodified index DOM, and
the existing Home/Memory CSS prefix. The historical receipt is retained unchanged.

Deterministic auth tests cover deadline, cancellation, stale ownership,
malformed/off-project authorize URLs, native callback binding, the Android PKCE
callback, Custom Tab cancel, stale and malformed Android replies, unsupported
native shells and retry. Browser tests use the actual bundled SDK and app with substituted
provider responses and an emulated OS bridge, verifying persistence and reload.
Foundation policy tests execute production Swift URL validation; the unsigned
Simulator build checks compilation only. Live consent, physical devices and actual
provider configuration require the checklist in [QA](../qa/social-auth-only.md).

Provider choices package the official gradient Google G and the previously
generated Korean Apple buttons locally. The settings control itself now follows
the outlined-pill appearance above; the Apple images remain the provenance
record. Asset provenance and the scoped font license are in [assets](../../assets/auth/README.md).
Browser checks cover theme, dimensions, focus and zero external asset requests.
Physical keyboard/safe-area behavior and provider approval remain release review
items; browser geometry does not establish those outcomes.
