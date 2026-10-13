# Signature mint remembered feedback

Before:378fba3. After:84b56356e26fefd5752ad955d00fb3c6eeac94e1.
`--brand-signature` reuses the first mint endpoint of the approved flow logos:
light#AAC4C4, dark#D7ECE8. It is separate from the existing sky-brand/selection
tokens. Only right/remembered feedback in set and all-word study uses it; the
theme wash is35%/20%. Left feedback, progress, controls, geometry and logo files
are unchanged. No visible Undo. Native/Cloud deployment is separate.

Actual Chromium151 high-resolution touch captures: phone440×956/DPR3 and
iPad1032×1376/DPR2, both themes. Direction-text contrast measured5.52:1 light,
5.16:1 dark at full drag; opaque card retained. Assertions compare the token to
the actual SVG endpoint, require contrast≥4.5:1, and prove canceled drag earns
zero progress. Both study domains passed. No native iOS equivalence is claimed.

[Phone before](before/iphone-69-light-drag-remember.png) /
[after](after/iphone-69-light-drag-remember.png),
[dark before](before/iphone-69-dark-drag-remember.png) /
[after](after/iphone-69-dark-drag-remember.png).
[iPad after](after/ipad-13-light-drag-remember.png) /
[dark after](after/ipad-13-dark-drag-remember.png).
The `all-` images cover all-word study. Manifests retain source, dimensions and
PNG hashes. Exact new-head CI remains required;378fba3 results are historical.
