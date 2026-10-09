#!/usr/bin/env bash
set -euo pipefail
ocr_proof_dir="${RUNNER_TEMP:-/tmp}/breeze-ocr-android"
mkdir -p "$ocr_proof_dir"
# avdmanager and emulator can resolve different defaults on hosted runners.
# Give both the same private index/data location, outside uploaded evidence.
export ANDROID_AVD_HOME="${RUNNER_TEMP:-/tmp}/breeze-ocr-avd"
mkdir -p "$ANDROID_AVD_HOME"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
# Existing runner licenses only. No yes-to-licenses, sudo, chmod or device ACL edits.
sdkmanager 'system-images;android-35;google_apis;x86_64' </dev/null
printf 'no\n' | avdmanager create avd --force --name breeze_ocr_stress --path "$ANDROID_AVD_HOME/breeze_ocr_stress.avd" --package 'system-images;android-35;google_apis;x86_64'
test -f "$ANDROID_AVD_HOME/breeze_ocr_stress.ini"
emulator -list-avds | tee "$ocr_proof_dir/avds.txt"
grep -qx breeze_ocr_stress "$ocr_proof_dir/avds.txt"
ocr_accel=off
emulator -accel-check >"$ocr_proof_dir/acceleration.txt" 2>&1 || true
cat "$ocr_proof_dir/acceleration.txt"
if [ -r /dev/kvm ] && [ -w /dev/kvm ] && grep -q 'installed and usable' "$ocr_proof_dir/acceleration.txt"; then ocr_accel=on; fi
emulator -avd breeze_ocr_stress -no-window -no-audio -no-boot-anim -no-snapshot \
  -gpu swiftshader -accel "$ocr_accel" -memory 2048 -cores 2 \
  -camera-back none -camera-front none >"$ocr_proof_dir/emulator.log" 2>&1 &
ocr_emulator_pid=$!
trap 'adb emu kill >/dev/null 2>&1 || true; kill "$ocr_emulator_pid" >/dev/null 2>&1 || true' EXIT
ocr_ready=0
for attempt in $(seq 1 160); do
  if [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; then ocr_ready=1; break; fi
  kill -0 "$ocr_emulator_pid" || break
  sleep 3
done
if [ "$ocr_ready" != 1 ]; then
  cat "$ocr_proof_dir/emulator.log"
  echo 'Android emulator exited or exceeded the 480-second boot deadline; native execution is unverified.' >&2
  exit 1
fi
adb shell cmd connectivity airplane-mode enable
adb shell svc wifi disable
adb shell svc data disable
adb shell settings get global airplane_mode_on >"$ocr_proof_dir/airplane-mode.txt"
test "$(tr -d '\r' <"$ocr_proof_dir/airplane-mode.txt")" = 1
adb shell dumpsys connectivity >"$ocr_proof_dir/connectivity.txt"
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb install -r android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
set +e
timeout --kill-after=10s 720s adb shell am instrument -w -r \
  -e class kr.io.breeze.app.PdfOcrStressTest \
  kr.io.breeze.app.debug.test/androidx.test.runner.AndroidJUnitRunner \
  >"$ocr_proof_dir/instrumentation.txt" 2>&1
ocr_test_exit=$?
set -e
adb exec-out run-as kr.io.breeze.app.debug cat files/ocr-stress.json >"$ocr_proof_dir/android.json"
cat "$ocr_proof_dir/instrumentation.txt"
test "$ocr_test_exit" = 0
grep -q 'OK (1 test)' "$ocr_proof_dir/instrumentation.txt"
node tests/score-pdf-ocr-stress.mjs "$ocr_proof_dir/android.json" "$ocr_proof_dir/score.json"
