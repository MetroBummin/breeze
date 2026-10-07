# Breeze wordmark draft

The user selected Dark01 and authorized a white-mode version, onboarding,
splash and restrained Home branding, with screenshots before approval. This
draft is stacked on PR #122 and changes no auth, Reader lookup or release policy.
The user confirmed the original cursive `r` at 08:15. Its contour is retained;
the plain-r alternative is not implemented. The user selected WHITE palette B
at 08:48: #63acb5 at 0%, #699bbc at 80% and 100%. Dark01 ink is unchanged.

The approved Library board is `libfile_709561bacc108191b6ec01dddc4318f9`
(version 0, backing `file_000000006c9881f9bf2b7604c4c0cb57`). Actual pixels
were materialized and inspected. `docs/brand/approved-dark01.png` preserves the
source and is excluded from the shipped application bundle.
`tools/trace-breeze-brand.py` extracts its connected
wordmark and `br` contours with midpoint quadratic smoothing (maximum polygon
simplification tolerance 1.15 source pixels), removing raster texture. Both
themes share exactly the same outline and aspect ratio. Dark01 keeps
#acece1 → #a9d4ee; WHITE uses selected B. These are decorative
brand ink, not general control/selection tokens.

The full wordmark replaces the mascot on welcome and completion. Following
08:08 user feedback, the Home header uses the identical contour as a mask filled
with the existing neutral `--settings-ink` token (#1C1C1E / #F2F2F7), with no
colored gradient. Colored artwork remains on onboarding and splash. The palette
comparison is historical review evidence; B is now selected and shipped.

The subsequent Liquid Glass direction adds a thin directional reflection and
1px shallow depth only on the original letter contours. It reuses shared
`--control-light-reflection`, `--sentence-glass-line` and scrim tokens; no new
plate, backdrop blur, shimmer or interaction is added to the wordmark. Home
stays neutral monochrome; onboarding keeps its colored outline with the same
restrained letter treatment. Start/Next uses the real `.control-glass` material,
whose owner remains `reader.css`, at the existing tutorial button geometry.
Reduced transparency/motion or increased contrast removes letter reflections
and depth. Reduced transparency/increased contrast makes the CTA opaque with
no backdrop blur. Static native/web splash artwork keeps its simple flat mark.
The ordinary content word `Breeze` stays selectable Reader text. Its
lesson, actual mini pill, expansion, translation and explanation remain shared.
Home content and navigation, including the existing Memory illustration, remain
intact. The `br` mark replaces web/PWA/iOS app icon assets.

Web startup shows a static centered mark only during existing `boot-pending`;
normal readiness and the existing fail-open deadline remove it without an extra
delay. Its appearance follows the existing saved `breeze.dark` preference.
The iOS LaunchScreen uses a centered 220×68 aspect-fit image with light/dark
asset-catalog appearances and a matching named background. There is no animation
or native launch delay. System native appearance and saved web appearance may
differ; the app's existing appearance preference remains authoritative afterward.

Browser splash captures deliberately hold script delivery and are labeled
**splash preview**. They do not demonstrate native launch, Simulator execution,
physical device behavior or native icon installation. No distribution/native
build or App Review submission is requested by this draft.

Validation: onboarding interruption, reopening, Back, Skip and success keep
the existing automated suite. Brand checks additionally verify cold startup
clears the splash, no aspect distortion/overflow, and reduced-motion layouts at
phone, iPad, desktop, narrow and short sizes in both themes. All brand marks have
an accessible Breeze name; decorative boot imagery is hidden from accessibility.
See the current QA record for exact head, checks and limitations.

## Home neutral gray and icon comparison draft (2026-10-07)

The next review compares Home against 37c4b992. Light Home uses
--brand-home-ink (neutral gray at .92 alpha) in the original letter mask,
retaining shared thin reflection and directional rim. Its drop shadow is removed.
Dark Home keeps the existing ink/material. Reduced transparency, motion and
increased contrast restore opaque --settings-ink with no letter effect.
The connected wordmark and original cursive r are unchanged. Welcome colors
await the user's reference; onboarding, splash and shipped icons are untouched.

The files under docs/brand/drafts are review assets only. Both icon directions
use the same lowercase b extracted from the original wordmark, closing only
the outgoing connection, with identical size and lighting: neutral glass and
subtle teal-to-blue glass. These are static SVG highlight mockups, not evidence
of Apple's automatic iOS Liquid Glass icon rendering. The existing br icon
remains installed. No new direction is selected.

The follow-up icon review adds the original lowercase br contour in both colors.
The b-only draft moves 14px left in the 512px tile for optical balance, without
changing its path/scale/light. Four-way light/dark samples and 60/40/29/20px sizes
remain review-only; Home and installed icon assets are preserved.
