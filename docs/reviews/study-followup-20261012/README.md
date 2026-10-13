# Study follow-up review

Source `ead088bedfa5c10e49450fc73108f4379ad4cc1a`. Actual browser captures
include only the existing carousel plus one isolated exercise and fixed creation
actions. No native Simulator or physical-device claim is made. Keyboard evidence
uses a reduced visible viewport; actual iOS keyboard remains native QA.

Local npm/type and71 study contracts passed. Creation covers45 books,10 layouts,
stable descending counts,0→1→0 selection, quota failure/retry and start. Exercise
covers10 light/dark layouts, wrong/short/cancelled gestures, Back, replay, Escape,
first-run resume/Skip, reduced motion and unchanged real word/set/study data.
Existing welcome41-sample strict pen/navigation/media suite passed. Native sync,
package and service-worker checks passed; signing/archive/upload are separate.

Fault injection against published268 `044f9ff` reproduced successful creation
followed by render exception: Retry changed the collection from1 to2 sets.
Injected start history failure also happened after a durable session write but
was labeled storage failure.269 source retains the original error in memory and
separates commit from navigation/display; these retries reread/render rather than
reapply. This establishes the error-classification/retry defect, not the actual
physical phone exception. Quota on v1 backup or migrated collection preserves the
original bytes; the mandatory backup needs extra origin storage space.

Final exact-head Chromium/WebKit CI is required. Settings capture now waits for
its actual hidden state after the360ms transition. Word-arrival assertions retain
the strict30-second gate and now record actual pending/presentation/scroll state;
its prior WebKit failure cause remains unproven. Baseline WebKit offline
Blob/FileReader gate is preserved. Physical airplane mode,56-page restart and
physical retry interaction remain unverified. Parent owns one Xcode Cloud manual
start and TestFlight availability verification; no main merge or RSS activation.


Candidate97f0cde passed word recovery in Chromium and WebKit. Its new creation
fixture exposed WebKit ignoring an instance assignment tolocalStorage.setItem;
fault injection now overridesStorage.prototype.setItem and asserts an actual
call plus the retainedQuotaExceededError. The exercise now waits for the real
post-tap step/meaning and applied reduced-motion media state before subsequent
input, retaining every expected value and the normal30-second failure timeout.
Pointer traces and a failure capture diagnose any remaining real interaction
failure. These changes affect QA only; UI captures above remain byte-equivalent.
App-family's WebKit capture was blocked by that creation fixture and therefore
was not validated on97f0cde; its final-head result is still required.
