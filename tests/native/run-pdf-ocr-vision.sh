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
# A process-local network denial; no host/repository permission is changed.
/usr/bin/sandbox-exec -p '(version 1)(allow default)(deny network*)' \
  "$ocr_build_dir/vision-stress" tests/fixtures/pdf-ocr-stress "$ocr_build_dir/vision.json"
node tests/score-pdf-ocr-stress.mjs "$ocr_build_dir/vision.json" "$ocr_build_dir/score.json"
