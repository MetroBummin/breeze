#!/usr/bin/env bash
set -euo pipefail
ocr_build_dir="${RUNNER_TEMP:-/tmp}/breeze-ocr-vision"
mkdir -p "$ocr_build_dir"
xcrun swiftc -emit-library -emit-module -module-name Capacitor \
  tests/native/CapacitorOcrTestBridge.swift \
  -emit-module-path "$ocr_build_dir/Capacitor.swiftmodule" -o "$ocr_build_dir/libCapacitor.dylib"
xcrun swiftc -I "$ocr_build_dir" -L "$ocr_build_dir" -lCapacitor \
  -Xlinker -rpath -Xlinker "$ocr_build_dir" \
  ios/App/App/BreezePdfOcrPlugin.swift tests/native/pdf-ocr-vision-main.swift \
  -o "$ocr_build_dir/vision-stress"
# A matched input/serialization control separates harness retention from OCR.
BREEZE_OCR_MEMORY_CONTROL=1 /usr/bin/sandbox-exec -p '(version 1)(allow default)(deny network*)' \
  "$ocr_build_dir/vision-stress" tests/fixtures/pdf-ocr-stress "$ocr_build_dir/control.json"
# A process-local network denial; no host/repository permission is changed.
/usr/bin/sandbox-exec -p '(version 1)(allow default)(deny network*)' \
  "$ocr_build_dir/vision-stress" tests/fixtures/pdf-ocr-stress "$ocr_build_dir/vision.json"
node tests/score-pdf-ocr-stress.mjs "$ocr_build_dir/vision.json" "$ocr_build_dir/score.json"
# A separate short, instrumented run records leaks' own verdict and allocation
# traces. Instrumentation changes memory use; never substitute it for the RSS run.
set +e
MallocStackLogging=1 BREEZE_OCR_REPEAT_COUNT=24 /usr/bin/sandbox-exec -p '(version 1)(allow default)(deny network*)' \
  /usr/bin/leaks --atExit -- "$ocr_build_dir/vision-stress" tests/fixtures/pdf-ocr-stress "$ocr_build_dir/vision-instrumented.json" \
  > "$ocr_build_dir/vision-leaks.txt" 2>&1
ocr_leaks_exit=$?
set -e
node -e 'const fs=require("node:fs");fs.writeFileSync(process.argv[1],JSON.stringify({exitCode:Number(process.argv[2]),kind:"leaks --atExit, separate MallocStackLogging run",interpretation:"Preserve tool errors and positive findings; RSS alone does not identify a leak."},null,2)+"\n")' \
  "$ocr_build_dir/leaks-status.json" "$ocr_leaks_exit"
cat "$ocr_build_dir/leaks-status.json"
node tests/score-pdf-ocr-stress.mjs "$ocr_build_dir/vision-instrumented.json" "$ocr_build_dir/score-instrumented.json"
# A positive leak report or tool failure remains a failing diagnostic gate.
exit "$ocr_leaks_exit"
