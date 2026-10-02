# Breeze 1.7: protect the saved position during original reopening

Reproduced on the previous main: while a completed PDF awaited anchor restoration,
early input replaced progress 1 / page 6 / timestamp 12345 with progress 0.01019 /
page 1 / a new timestamp. The same regression passes after the fix.

Treat opening as an owned restoration phase rather than a timed pause. All position
writers preserve the saved record until landing. PDF now shares the existing EPUB
loading surface. Body input and viewport restoration cannot cancel the initial
anchor restore. Successful landing admits normal reading; failed landing and leaving
keep the old record. A late opening cannot release a newer opening's protection.

Chromium/WebKit regression uses real PDF/EPUB content and delayed restores, checks
100% and partial progress, early touch/wheel/scroll, storage, viewport changes,
backward reading after landing, navigation away, and failed restoration. Existing
Home resume and Reader work/round-trip tests cover compatibility.

The user authorized PR, merge and a follow-up Xcode Cloud/TestFlight build. Marketing
version stays 1.7; source build advances to 217 after the successful 216 archive.
Cloud assigns its own counter; actual TestFlight processing requires Apple-side
confirmation. No App Store review submission is requested.
