# Provider sign-in artwork

Retrieved 2026-10-08. These public official images are packaged unchanged; no
runtime requests to Google, Apple or a font CDN are needed to render choices.

- [Google branding](https://developers.google.com/identity/branding-guidelines):
  official gradient G, preserved aspect ratio; localized text; Google Sans Medium
  14px/20px, light/dark colors and 1px stroke. Web padding 12px/gap 10px;
  native padding 16px/gap 12px. Buttons share width and 48px touch height.
- [Apple guidance](https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple):
  official generated full Korean buttons, black on light and white on dark.
  Full image remains uncropped at its original 250:48 aspect ratio. The accessible
  button name is explicit; decorative images are hidden from assistive technology.
- Google Sans comes from `google/fonts` commit
  `5e8a3ba899557829a76cfdac30fa512bda91d7ca`,
  `ofl/googlesans/GoogleSans[GRAD,opsz,wght].ttf`. FontTools instantiated
  wght=500, opsz=14, GRAD=0 and subset `Google ` without changing glyph outlines.
  Korean uses the existing UI fallback because the upstream font lacks Hangul.
  SIL OFL is retained at `../fonts/OFL-GoogleSans.txt`. This font is scoped to
  provider sign-in; app typography is unchanged.

The manifest records exact downloaded byte hashes, not an assertion of provider
approval. Real provider consent/configuration and physical-device testing remain
separate release requirements.
