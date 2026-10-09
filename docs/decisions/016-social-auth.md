# Social login without onboarding changes

## Decision

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
iOS keeps ASWebAuthenticationSession; web Apple/Google keep OAuth. Android has
no new native auth bridge. Official button artwork, layout and guest access stay
unchanged. There is no client email-based identity linking or account migration.

App/Share marketing version is 1.9.1; the checked-in counter remains 253 until
Apple Cloud supplies the actual archive number. Only App gets the Sign in with
Apple entitlement/capability. Provider setup, credentials, Developer-account
settings and App Store review actions remain owned externally. See the precise
device/signing/identity checks in [native QA](../qa/native-apple-191-20261009.md).

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
accepted. Android has no authentication bridge and remains on existing email.

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

27 deterministic auth tests cover deadline, cancellation, stale ownership,
malformed/off-project authorize URLs, native callback binding, unsupported native
shells and retry. Browser tests use the actual bundled SDK and app with substituted
provider responses and an emulated OS bridge, verifying persistence and reload.
Foundation policy tests execute production Swift URL validation; the unsigned
Simulator build checks compilation only. Live consent, physical devices and actual
provider configuration require the checklist in [QA](../qa/social-auth-only.md).

Provider choices package the official gradient Google G and official generated
Korean Apple buttons locally. Google uses its prescribed Medium 14/20 type,
light/dark colors, border and platform padding; Apple uses uncropped black/white
artwork. Both have equal width and 48px targets with accessible names. Asset
provenance and the scoped font license are in [assets](../../assets/auth/README.md).
Browser checks cover theme, dimensions, focus and zero external asset requests.
Physical keyboard/safe-area behavior and provider approval remain release review
items; browser geometry does not establish those outcomes.
