# Breeze selected icon and reusable wordmarks

Selected 2026-10-07 14:03: optically corrected lowercase b, subdued teal glass.
The existing dark neutral background remains the default. Canonical source is
assets/brand/app-icon.svg; the original corrected b outline and original br
monogram remain preserved. Dark/light b/br neutral/flow variants have named
SVG + 1024 PNG files under assets/brand/icons. Source PNG review boards remain
under docs/brand/drafts as historical selection evidence.

The original z is explicitly retained (14:05). assets/brand/wordmarks contains
four independent SVG + transparent 1682×516 PNGs: breeze-flow-light,
breeze-flow-dark, breeze-neutral-light, breeze-neutral-dark. Each path is exactly
the original wordmark-mask.svg contour, preserving cursive r and e connections.
Highlights use the identical filled contour, without stroke, blur or shadow;
they cannot enlarge or rewrite the letters. These reusable colored assets do
not change Home's neutral policy or the pending first-entry color reference.

Run BREEZE_CHROMIUM=/usr/bin/chromium node tools/render-app-icons.mjs to regenerate
platform icon PNGs from canonical source; render-brand-assets.mjs delegates icon
work to that owner, so it cannot accidentally restore the historical br default.
Run npm run test:brand-icons to verify encodings, opacity, dimensions, source
paths, resource references and browser icon cache addresses.

- iOS: the existing universal AppIcon catalog uses one 1024×1024 RGB PNG with
  opaque square corners. No baked outer mask, native icon layers or signing change.
- Android: legacy 512 PNG fallback plus API26 adaptive background/foreground and
  API33 monochrome layer. Density PNGs are 108/162/216/324/432 with transparent
  padding and unchanged selected b/material. Foreground height is padded to 57dp
  within 108dp so all nontransparent pixels fit the 66dp safe circle. The system
  chooses its launcher mask. See [Android adaptive icons](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive).
- Web: 64 favicon, 180 touch, 192/512 general icons; separate 192/512 maskable
  exports pad the selected artwork. Existing root, landing and support links
  are content-versioned. No PWA manifest currently exists, so maskable files are
  reusable exports, not a newly introduced installation flow. See the
  [W3C maskable safe zone](https://www.w3.org/TR/appmanifest/#icon-masks-and-safe-zone).

The gloss is static SVG shading, distinct from Apple's automatic Liquid Glass
icon processing. Local PNG/contour/resource checks pass; physical launcher/iOS
installation and native compiled asset-catalog preview are still unverified.
No merge, deployment, release archive or store submission.
