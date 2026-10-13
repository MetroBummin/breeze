# Theme-correct shared circle and matching Back

Chromium web previews, not native iOS screenshots. Light mode keeps the same
light translucent glass and dark readable ink throughout the circle-to-menu
morph. Dark mode retains charcoal glass and bright ink. Back is a matching 44px
circle with aligned size, rim and elevation. The same shell grows and shrinks;
there is no separate visible ellipsis over the open menu.

- [Phone light closed](web-preview-phone-edit-closed-light.png)
- [Phone light real mid-animation](web-preview-phone-edit-mid-light.png)
- [Phone light open](web-preview-phone-edit-open-light.png)
- [Phone dark closed](web-preview-phone-edit-closed-dark.png)
- [Phone dark real mid-animation](web-preview-phone-edit-mid-dark.png)
- [Phone dark open](web-preview-phone-edit-open-dark.png)

These six frames use the same fixture title. Both themes are also captured on
tablet. Touch verification samples computed material/ink immediately after
switching themes and across animation frames during expansion and collapse;
light never samples charcoal. Back and ellipsis match material, ink, border,
shadow, alignment and 44px geometry. Only geometry and content opacity animate.

The existing lifecycle, repeated/interrupted toggle, outside dismissal, Back,
focus, reduced-motion, swipe, Undo and persistence checks remain. The manifest
records captured source and image hashes; touch evidence records material
samples and trusted input. No private reference image is published.

No version change, merge, Cloud archive or TestFlight upload is performed by
this review checkpoint. The historical build-266 source boundary is unchanged.
Browser evidence does not replace native interaction validation.

Validation: 65 study model/storage/UI tests, complete `npm test` (including
type checks), Chromium lifecycle and trusted touchscreen checks pass.
