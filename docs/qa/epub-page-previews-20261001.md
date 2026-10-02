# EPUB visual page navigation — build 209

The user corrected build 208's interpretation: EPUB navigation must show numbered visual page previews like PDF, rather than chapter titles. Build 209 replaces the chapter list with slices of the existing source layout at the stable Reader viewport height. EPUB pagination changes with the reading viewport; publisher-fixed page numbers are not invented.

Previews preserve sanitized source typography, images and current stylesheet rules. Only visible pages plus neighboring slices create sandboxed, noninteractive preview frames. Source markup is serialized once per visible chapter per layout; no Blob reread or re-extraction occurs. Reopening at the same geometry reuses loaded frames. Source geometry changes coalesce a refresh into one animation frame. Current-page lookup uses a cached chapter start index. Clicking a numbered preview scrolls to its exact source position.

Chromium and WebKit reader-work checks passed for multiple pages within a chapter, loaded preview content, exact source-slice navigation, navigation across chapters, loaded-frame reuse, bounded preview frame count, release when leaving EPUB, and sidebar bounds at 320/390/820/1440/short-landscape 844 widths in light/dark themes. Existing PDF thumbnail reuse/release and 40 sentence-waiting combinations per engine remain covered. Screenshots visually confirm page thumbnails and numbers. Unit, type and structure checks and native synchronization pass; the existing type diagnostic count remains 34.

Build 208 already verified the sentence-waiting fix and Home motion. Build 209 retains those changes. Physical-device frame pacing and TestFlight tester-group assignment are not verified by browser tests or Xcode Cloud archive status.
