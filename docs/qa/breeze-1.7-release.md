# Breeze 1.7 release

Includes PR #68 file-only PDF/EPUB sharing, PR #69 contextual easy explanations
and lookup cleanup, and PR #60 sentence flashcards with three-grade spaced review.
The release integration preserves the commit ancestry of all three PRs.

Resolved shared script registration, test commands, generated documentation and
asset hashes. Optional animation API access is guarded for fallback environments.
App and Share Extension marketing versions are 1.7 with source build 216.
Xcode Cloud assigns its own build counter; its actual number is verified separately.

Validation: full npm test; Chromium and WebKit explanation, shared-file import
and flashcard flows; npm run ios:sync; git diff --check. Tests cover durable
PDF/EPUB import, sentence-specific transient explanations and three-grade schedules.
Browser tests do not establish physical-device behavior. Native archive and
App Store Connect processing are tracked after main publication.

The dict Edge Function needs the included easy_explanation operation before the
client is distributed. It uses existing quota RPCs; no database migration is needed.

## Archive request — 2026-10-02

The user reauthorized Archive and App Store Connect delivery after the merge-only
pause. This commit intentionally omits the CI skip marker and triggers the existing
Xcode Cloud main-branch workflow. Requested release: 1.7 (216). Source versions for
App and Share Extension are both 1.7 / 216; Cloud numbering remains independently
assigned. No App Store review submission is requested.

The dict Edge Function was deployed as version 54. Live warm and invalid-input
checks passed, and a real contextual easy-explanation request returned HTTP 200
with Cache-Control: no-store. App Store Connect processing is not yet verified.
