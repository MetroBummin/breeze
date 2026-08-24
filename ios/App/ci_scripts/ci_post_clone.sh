#!/bin/sh
# Xcode Cloud 는 fresh checkout 에서 시작합니다. Capacitor 의 public/ 과
# native config.xml/capacitor.config.json 은 Git 생성물이므로, Archive 전에 이곳에서 만듭니다.
set -eu

script_dir="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
repo_root="$(CDPATH= cd -- "$script_dir/../../.." && pwd)"

cd "$repo_root"
npm ci
npm run ios:sync
