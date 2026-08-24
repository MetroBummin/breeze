#!/bin/sh
# Xcode Cloud 는 fresh checkout 에서 시작합니다. Capacitor 의 public/ 과
# native config.xml/capacitor.config.json 은 Git 생성물이므로, Archive 전에 이곳에서 만듭니다.
set -eu

script_dir="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
repo_root="$(CDPATH= cd -- "$script_dir/../../.." && pwd)"

cd "$repo_root"

# Xcode Cloud post-clone image does not guarantee Node/npm on PATH. Capacitor 8
# requires Node 22+, so use the Homebrew formula Apple provides in CI only.
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1 \
  || ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'
then
  brew install node@22
  PATH="$(brew --prefix node@22)/bin:$PATH"
  export PATH
fi

npm ci
npm run ios:sync
