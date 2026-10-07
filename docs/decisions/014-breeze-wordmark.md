# Breeze wordmark draft

The user selected Dark01 and authorized a white-mode version, onboarding,
splash and restrained Home branding, with screenshots before approval. This
draft is stacked on PR #122 and changes no auth, Reader lookup or release policy.
The 07:56 feedback requests identical Dark01 ink on WHITE and a more readable,
less hooked `r`. The current contour is explicitly **provisional** pending the
design worker's comparison and user review; this draft does not finalize it.

The approved Library board is `libfile_709561bacc108191b6ec01dddc4318f9`
(version 0, backing `file_000000006c9881f9bf2b7604c4c0cb57`). Actual pixels
were materialized and inspected. `docs/brand/approved-dark01.png` preserves the
source and is excluded from the shipped application bundle.
`tools/trace-breeze-brand.py` extracts its connected
wordmark and `br` contours with midpoint quadratic smoothing (maximum polygon
simplification tolerance 1.15 source pixels), removing raster texture. Both
themes share exactly the same outline and aspect ratio. Both use the exact
Dark01 gradient #acece1 → #a9d4ee; WHITE is not darkened. These are decorative
brand ink, not general control/selection tokens.

The full wordmark replaces the mascot on welcome and completion, and the Home
header. The ordinary content word `Breeze` stays selectable Reader text. Its
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
