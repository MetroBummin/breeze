# Breeze 1.6 (214)

Changes: compact real-word tutorial guidance, optional completion, English tutorial
title and corrected sentence guidance; one Reader control interactivity policy;
independent Casuals/Long-form categories; unclipped PDF direction selection fill.
Typography and 44px direction-button hit areas are unchanged.

Root cause: selectWord calls closeSentence; while chrome is collapsed this marked
reader-navigation inert. setReaderChrome restored only child controls. The new
EPUB input regression fails against e2a5527 at “Expanded navigation retains an
inert parent” and passes with the shared control policy. Sidebar entry also ends
the prior word lookup lifetime before exposing page controls.

Validation completed locally:
- npm test (including legacy category migration, failed writes and scope isolation).
- Chromium and WebKit: onboarding; category import/reload/edit; EPUB navigation;
  Reader work and pending sentence controls; sentence presentation; design-tone;
  Home UI (resume, controls, refresh, progress, Memory, lookup work).
- Chromium: direction selection in both themes at 320, 390, 820, 1440 and short
  844x390 viewports. Retina screenshots verify unchanged 500 12px/12px typography.
- npm run ios:sync and git diff --check.

Browser/native-shell emulation is not physical iOS evidence. Xcode Cloud archive
and App Store Connect delivery are verified separately after the authorized merge.
The user reviewed screenshots and approved release provided typography remained
unchanged; the condition is satisfied.


## Xcode Cloud build number correction

The project CURRENT_PROJECT_VERSION was set to 214, but Xcode Cloud assigns its
own monotonically increasing archive number. The user confirmed that the first
archive from 69a990b appeared in TestFlight as 1.6 (213). Project configuration
and a successful archive check did not verify the distributed build number.

This documentation-only commit triggers the next main-branch archive, expected
to receive Cloud build number 214. The application source remains identical to
69a990b. Archive status is observable through GitHub; the actual TestFlight build
number and processing state require App Store Connect evidence.
