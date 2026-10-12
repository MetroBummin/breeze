# Approved new-set back circle

The create dialog's back now reuses the approved set-detail back material rule,
including paired-theme gradient/rim/shadow/ink and reduced-transparency fallback.
Its44×44 target and32px/2.3 rounded SVG remain; no navigation or close handler
changes. Before source is1d0ac80. After source is the commit containing this file.

Ten paired phone/iPad portrait/iPad landscape/desktop/short light/dark cases
assert unchanged back rectangle/SVG, exact material equality with detail back,
and actual Back returns to the directory in the same continuously open dialog.
Word-add X, cancel/save and their materials/rectangles are unchanged in this
follow-up. These synthetic-source Chromium151/DPR2 screenshots are browser QA,
not native iOS proof. No merge/build/upload/deployment.

[Phone create before](before/phone-light-study-create.png) /
[after](after/phone-light-study-create.png),
[back crop](after/phone-light-create-back-crop.png),
[word-add X](after/phone-light-word-add.png).
[iPad dark create](after/ipad-portrait-dark-study-create.png) /
[word-add X](after/ipad-portrait-dark-word-add.png).
