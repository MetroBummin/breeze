# Meaning suggestion verification — 1.7 (217)

An easy explanation may propose a specific corrected meaning. Reading it never
changes vocabulary. One explicit button applies it without a second AI call.
Same-example correction keeps card identity, stars and example; a different
sentence saves a separate sense and preserves the original pair. The accepted
sense is selected when reopening that occurrence.

- Full `npm test`: passed; existing type baseline 34, no increase.
- Easy-explanation unit/server tests: 10 passed, including optional/malformed
  suggestions, no automatic persistence, idempotent acceptance, stale meaning,
  example, account, occurrence and deleted-item guards.
- Chromium and WebKit browser flow: passed A/B preservation, same-example edit,
  persisted meaning, transient explanation, no extra request and reopen selection.
- Light/dark screenshots checked at phone, tablet, desktop and short viewports.
- `npm run ios:sync`, structure and whitespace checks: passed.

Reader position restoration is the separately reviewed PR #70. Build 217 includes
both changes. Xcode Cloud and TestFlight status must be checked after main merge;
local browser tests do not claim native Archive or TestFlight distribution.
