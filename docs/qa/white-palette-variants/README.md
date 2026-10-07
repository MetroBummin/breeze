# WHITE palette comparison — selection pending

08:15 user decision confirms the original cursive r; all three variants have
the exact same source contour. Dark onboarding/splash ink is unchanged.
Home now uses neutral text-token monochrome and is outside this color choice.

| Variant | Gradient stops | Endpoint contrast on #FBFCFC |
|---|---|---|
| Current baseline | 0% #acece1, 100% #a9d4ee | 1.29 / 1.53 |
| A | 0% #75b9bd, 80% / 100% #79aac8 | 2.17 / 2.43 |
| B | 0% #63acb5, 80% / 100% #699bbc | 2.52 / 2.91 |

A lowers brightness moderately; B is a little stronger and bluer. Both preserve
the sea-glass family. These are decorative brand marks, not instruction text.
The Korean copy and controls keep their existing readable neutral ink.

`white-onboarding-comparison.png` places three independently captured production
onboarding pages at their original 390×844 dimensions, with labels outside the
screens. The UI is real; only the vector gradient asset is substituted for preview.
No font, nonuniform scaling or letterform change is used. The iframe experiment
had a storage initialization error and was excluded; Library board version 1 is
the corrected independent-capture board, replacing version 0.

The individual colored Home candidate files are historical palette comparisons
from before the monochrome Home direction, not the current Home. Latest actual
monochrome screenshots and native IDs are in `../breeze-wordmark/`.

Preview vectors live under `docs/brand/white-palette-variants/`, outside the app
bundle. No A/B palette is applied to production onboarding or native artwork
until selection. Native Library references are in `library-images.json`.
