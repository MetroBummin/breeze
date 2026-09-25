# Integrity / robustness / design hardening — 2026-09-25

## Scope

Proposed integration, not a main merge/deployment. The release candidate preserves
Home #20 (`950c5129`), Preview #21 (`911a0aa`) and recommendations #23 (`3aa2c41`).
Annotation #22 is a separate 1.4 change. Audited main: `0b1b6bb`.

## Findings addressed

- Authoritative IndexedDB reads reject instead of impersonating an empty library.
  Writes settle at commit and reject abort/error. Failed imports retain user input.
- Book/original/unshared-image deletion and a recovery journal commit atomically;
  UI success follows commit. Shared assets remain and local cleanup is replayable.
- One navigation intent owns asynchronous Reader/Preview transitions; a slow A
  cannot replace a later B or Home selection.
- New article/paste IDs hash the entire ordered paragraph array. Exact legacy
  matches are reused without renaming existing saved IDs.
- Word meaning/status/visibility have independent edit clocks. Ambiguous legacy
  meaning conflicts survive as normal deletable senses; tombstones/CAS remain.
- Quota errors/null/malformed approval fail closed before paid generation; reading
  and saved meanings remain available.
- Article transport checks each redirect and every DNS answer, connects to the
  checked IP with original Host/TLS identity, and caps wire/decompressed bytes,
  concurrency, redirects and time. No fail-open fallback.
- Both PDF.js loaders disable eval without changing renderer/worker versions or
  the glyph adapter.
- Web updates install a complete hashed generation before activation. Failure
  preserves the previous generation; no live-client takeover or foreign-cache deletion.
- Smart Crop no longer clamps edge subjects to 18–82%. Impossible face-union crops
  use contain. Missing images receive distinct text covers.
- Empty library has an explanation/action; unavailable storage has a separate retry
  state. Cards support keyboard activation and explicit named edit controls.
- Preview opens a source shell before import completes, with bounded retry,
  skeleton/error states, deferred optional images and cancellable stale navigation.
- Current local-book/synced-word and Preview AI processing are documented. Added
  read-only PR checks cover contracts, browser integration and Deno transport.

## Annotation, separate 1.4 follow-up

Read mode is the default: stored ink remains visible while web editing and native
Pencil gate are disarmed. Explicit editing preserves Pencil/finger separation;
folding tools does not disable editing. Native page scope is cached and invalidated
on relevant layout changes rather than every stroke/DOM mutation. Coordinates,
original document IDs and ink storage schema remain unchanged.

## Evidence and boundaries

The first full candidate run passed npm test, PDF geometry/pinch, Home
accessibility/carousels, Preview resilience/server and local Deno transport. It
also found old integration assertions expecting direct RSS Reader entry and a
removed section selector, a mid-animation centering check, Deno option inference,
and an IndexedDB abort probe. These were investigated rather than called passing.
The PR links final exact CI results; previous runs are not substituted for them.

Still required before release:

- Real Supabase transport compatibility and Preview Auth/quota/cache/RLS/migration
  smoke tests. Local Deno/Node execution is not production Supabase validation.
- Apple-device update preserving existing data, kill/relaunch/offline restoration,
  long document and physical Pencil/palm/momentum/read-lock stress, VoiceOver.
- Repository administration to make the added PR checks mandatory; settings were
  not silently changed.
- Human assessment of AI wording and recommendation satisfaction. No additional
  paid AI evaluations were performed by this audit repair.

No user Mac/Colima/Docker files, production API keys, Supabase deployment, main
merge, Archive or TestFlight upload were involved.
