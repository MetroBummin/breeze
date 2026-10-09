# Breeze 1.9 preparation

The user requested 1.9 instead of 1.8.1, with review submission only on a later
explicit instruction. Integrate approved PR126–131 scopes in an isolated branch.
No main update, deployment, TestFlight upload or App Review action is authorized.

Original auth-only and onboarding-only hash guards remain unchanged as historical
scope receipts. The combined branch runs verify-integration-boundary.mjs instead:
single-owner files equal exact owner source bytes, shared files have explicit
reviewed combined hashes, all changed paths belong to approved scopes, and launch,
public configuration, gesture ownership and durable book text remain baseline.
The receipt records exact source SHAs. It permits stamped resource hashes only;
this does not permit arbitrary DOM changes. Auth live providers remain disabled,
client IDs blank and external setup unfinished, as confirmed by the owners.

Keep PR130's deferred startup, Homeward open preparation and keepRuntimeAsset
carry-over alongside PR129's passive-overlay guard and PR131's display splits.
PDF capability belongs to PR128: asynchronous availability, sync false pending,
native iPad/Android tablet only and breeze-ink-platform resolution. Preserve six
round presets, selected icon color only (no underline) and tablet 400×44 read/write.

Local candidate metadata is 1.9 (246), greater than the observed build-245 QA
record and local archive maximum 202. This is a local candidate, not a guessed
Cloud counter or a reservation of an App Store Connect number. Mac UI was locked
when inspecting Apple metadata; server-side uniqueness remains unverified.
Before upload is later authorized, inspect current ASC builds and assign a fresh
number if required. All App/Share Extension Debug/Release settings and release
verifiers use this explicit candidate consistently.

Final source freeze waits for PR129's replacement of the PDF-only onboarding
clip/poster with an actual reusable PDF and the final PR128 toolbar. Other scenes
remain unchanged. Record exact source, test results and archive signing state.

## Mac WebKit keyboard regression found during integration

Touch navigation left document.activeElement on body. Escape never reached the
root-only keyboard listener, leaving the replay overlay visible at page 4.
The active guide now owns document capture keyboard input with its existing
AbortSignal; closing aborts this owner. Existing navigation, focus loop and
Escape assertions are unchanged. This is an integration-only correction, with
no changes to an owner branch, scene order, UI copy, assets or completion keys.
