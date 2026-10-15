# Provider sign-in artwork

Retrieved 2026-10-08. These public official images are packaged unchanged; no
runtime requests to Google, Apple or a font CDN are needed to render choices.

- [Google branding](https://developers.google.com/identity/branding-guidelines):
  official gradient G, preserved aspect ratio. The settings pill uses this G
  at 18px beside “Google로 로그인”.
- [Apple guidance](https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple):
  official generated full Korean buttons, black on light and white on dark,
  from the [official image API](https://developer.apple.com/documentation/signinwithapplerestapi/get-a-sign-in-with-apple-button-that-is-center-aligned.)
  with `scale=3`: 750×144 source pixels. The settings sheet no longer paints
  these images. It draws an inline Apple logo, at the same 17:20 proportion,
  and “Apple로 로그인” inside the shared outlined pill. These files stay as
  the provenance record.
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
