# Apple/Google login verification and remaining owner work

This is an auth-only follow-up to draft PR #122. PR #124 and the undecided
mascot/letter design remain preserved for review. No merge, deployment, archive,
App Review, credential, provider, redirect, entitlement or security setting change.

## Configuration evidence

Live provider/configuration evidence belongs in the private owner handoff, not
this public source document. The repository cannot establish whether providers
are currently enabled or whether credentials are configured. Verify the existing
setup through an authorized dashboard read before any approved change. Empty
connector discovery lists alone do not prove that the project is inaccessible.
This environment's public settings/changelog HTTP reads were blocked by its
proxy; current primary Auth documentation was available through the browser.

## Code correction and executable proof

The new browser test reproduced an iOS return bug: a fragment-only
`location.replace` is same-document navigation. It left the bundled SDK running
without processing the returned credentials. The return now adds the active
request UUID as a temporary `breeze_auth_return` query, forcing a fresh document.
The same SDK and auth listener accept/persist the session, then remove the query.
There is no second client, manual session write or extra OAuth scope.

Web and a simulated iOS bridge now exercise the real bundled SDK for both
providers: generated authorize URL, bound callback, session storage, signed-in
Settings and reload. External consent and Auth server responses are fixtures.
This does **not** prove a real account, ASWebAuthenticationSession execution or
the custom-scheme WebView at runtime; unit tests separately cover the native app
URL and cancellation.

Additional tests cover stalled settings JSON, failed settings, preparation and
consent deadlines, cancellation before a late valid callback, and malformed URLs.
Four new rejection tests fail on 04056222 and pass after the guard correction.
The JS/native boundaries now reject credentials in URLs and duplicate ownership
query values; native also rejects explicit ports and off-project/path callbacks.

`node tests/verify-auth-native-policy.mjs` extracts the **production** Foundation
policy from SceneDelegate, verifies that the real bridge calls it, syntax-parses
the full production Swift file, compiles that exact policy and executes its Swift
test matrix. The existing macOS CI job runs this before the unsigned Simulator
build. It does not simulate OS consent. Linux here has no Swift/Xcode/Simulator;
do not label native checks as passed until that CI job completes.

## Exactly what needs owner action

1. Confirm the existing Apple Services ID and Google **Web** OAuth client to use.
   Enter/verify the credentials directly in their owner consoles and Supabase
   when approved; do not paste private keys or secrets into chat. Apple needs the
   web Services ID first in accepted client IDs, the associated domain
   `hrtfhojbhqvaoiulspto.supabase.co`, and a current OAuth secret. Google needs its
   web client and approved consent audience/test-account access.
2. Both providers' registered HTTPS return must be
   `https://hrtfhojbhqvaoiulspto.supabase.co/auth/v1/callback`. Google's authorized
   web origin is `https://breeze.io.kr`. Verify existing web allowlisting covers
   this app's `https://breeze.io.kr/` return; preserve Site URL and valid entries. Any missing setting/credential activation requires its own approval.
3. The current iOS draft requests
   `kr.io.breeze.app://auth/callback?request=<UUID>`. Verify whether an existing
   entry allows it. If missing, a narrowly scoped candidate is
   `kr.io.breeze.app://auth/callback\?request=*`; the `\?` is a literal query
   question mark, not Supabase's single-character wildcard. Verify matching in an
   approved test setup before adding it. Do not add a broad `**` app-scheme rule.
   The live ASWebAuthenticationSession owns interception, so this code does not
   add a generic custom-URL launch handler or accept a cold/expired callback.
4. After approved setup, use the account's existing method on web and a physical
   iPhone/iPad. Verify real consent, return, expected email and existing account
   ID, then close/reopen, cancel/retry and network failure. Apple relay and Google
   emails can identify different accounts; no automatic account linking is added.

Android has no auth callback bridge and remains unavailable for these buttons.
Email/password remains unchanged and available. Signing/provisioning and native
Sign in with Apple capability changes are outside this browser-OAuth draft.

## Official button assets/support paths

No approved Apple/Google button assets were found in the repository, attachments
or prior downloaded cache. The previously blocked Apple JS/design asset and
Google ZIP routes were not retried, rerouted or replaced with homemade marks.

Apple's installed AuthenticationServices SDK supplies
`ASAuthorizationAppleIDButton` for a native UI, and Apple's web SDK can render its
official button. The current Settings is a DOM surface; the native component
would need native view hosting and is not a drop-in DOM asset. Switching to the
native credential flow also changes capabilities/auth integration and is not
silently done here. Google officially supports GIS-rendered buttons, its HTML
configurator output and pre-approved PNG/SVG assets. GIS needs the real configured
Google client and a different credential callback integration; no client ID is
invented. Owner-supplied approved assets/configurator output can complete the
existing OAuth button appearance without creating new auth clients.

## Primary sources

- [Supabase Apple setup](https://supabase.com/docs/guides/auth/social-login/auth-apple)
- [Supabase Google setup](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase redirect matching](https://supabase.com/docs/guides/auth/redirect-urls)
- [Apple system button](https://developer.apple.com/documentation/authenticationservices/asauthorizationappleidbutton)
- [Google supported branding paths](https://developers.google.com/identity/branding-guidelines)
