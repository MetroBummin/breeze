# Social login without onboarding changes

## Decision

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

Provider button artwork remains provisional in this draft. Official Apple/Google
brand compliance and physical keyboard/safe-area behavior remain release review
items; browser geometry does not establish those outcomes.
