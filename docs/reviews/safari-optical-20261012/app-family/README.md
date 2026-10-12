# App icon family review

PR155 follow-up extends the user's reviewed outline weight to Home settings/add,
Wordbook export, folder actions, study sheets and common close buttons. General
icons use20px/2-unit rounded strokes; icon-only backs32px/2.3; filled more dots
20px/1.6-unit radius. PDF sidebar keeps its previously matched24px/stroke scale.
Article preview replaces its text X with the shared SVG. Lookup/star/disclosure
and writing roles retain their function-specific optics. No handler/data changes.

`before/` is exact source fa53366180d8d0fd753e78a567b691a453727d6a.
`after/` uses the product source committed alongside this document. All500 PNGs
are actual Chromium151 renders or direct screenshot clips, DPR2, with the same
synthetic public fixtures, themes and viewport per pair. Phone390×844, iPad
portrait820×1180, landscape1180×820, desktop1440×1000 and short844×390 cover110
paired scenes.140 visible controls retain identical rectangles, materials and
accessible labels; manifest records pairs and PNG SHA256. A hidden back is
absent on directory but present on creation; no artificial DOM visibility.

Representative after screens: [Home](after/phone-light-home.png),
[settings](after/phone-light-settings.png), [word add](after/phone-light-word-add.png),
[Wordbook](after/ipad-portrait-dark-wordbook.png),
[study creation](after/ipad-portrait-dark-study-create.png),
[book info](after/ipad-landscape-dark-book-info.png),
[article preview](after/phone-dark-article-preview.png),
[folders](after/ipad-landscape-dark-folders.png). Matching filenames are in before.

Local checks passed with exit0: npm/type/structural contracts, existing five-view
shared dock geometry, Home controls, study trusted-touch/persistence, full PDF
morph/rotation/navigation/bookmarks/deletion/writing and article preview's four
sizes/cache/fallback/Reader. New capture validates actual modal opening/closing,
SVG size/stroke/round joins and optical centering. No assertion or release gate
was weakened. Exact-head GitHub CI is recorded in PR155 separately.

This is browser evidence, not physical iOS, Safari or native Liquid Glass proof.
Private reference pixels were not accessible here; parent owns original-image
comparison. Actual airplane mode, native56-page restart and physical retry taps
remain unverified. Historical268/267/266 release receipts/checkers are untouched;
the frozen268 checker deliberately rejects changed draft UI. This branch is
pending final visual sign-off and is not an approved release candidate. No
version bump, merge, archive, Cloud start, upload or deployment was performed.
