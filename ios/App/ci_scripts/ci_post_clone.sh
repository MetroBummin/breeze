#!/bin/sh
# Xcode Cloud 는 fresh checkout 에서 시작합니다. Capacitor 의 public/ 과
# native config.xml/capacitor.config.json 은 Git 생성물이므로, Archive 전에 이곳에서 만듭니다.
set -eu

script_dir="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
repo_root="$(CDPATH= cd -- "$script_dir/../../.." && pwd)"

cd "$repo_root"

# node@22 is keg-only: a missing PATH entry does not mean it needs installing.
# Reuse the image's Homebrew runtime before touching its shared dependencies.
breeze_node_ready() {
  command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 \
    && node -e 'process.exit(Number(process.versions.node.split(".")[0]) === 22 ? 0 : 1)' \
    && npm --version >/dev/null 2>&1
}
breeze_use_formula() {
  breeze_node_prefix="$(brew --prefix node@22 2>/dev/null)" || return 1
  [ -x "$breeze_node_prefix/bin/node" ] && [ -x "$breeze_node_prefix/bin/npm" ] || return 1
  PATH="$breeze_node_prefix/bin:$PATH"
  export PATH
  breeze_node_ready
}
if ! breeze_node_ready; then
  command -v brew >/dev/null 2>&1 || { echo 'Node 22/npm and Homebrew are unavailable.' >&2; exit 1; }
  if ! breeze_use_formula; then
    breeze_brew_log="$(mktemp "${TMPDIR:-/tmp}/breeze-node22.XXXXXX")"
    trap 'rm -f "$breeze_brew_log"' 0
    trap 'exit 1' 1 2 15
    for breeze_attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
      # A competing installer may have finished while we waited for its lock.
      if breeze_use_formula; then break; fi
      # Install only the required formula using the CI image's metadata. Avoid
      # auto-update migrations/upgrades and cleanup of unrelated dependencies;
      # Homebrew's download, bottle and checksum verification stay enabled.
      if HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_INSTALL_UPGRADE=1 HOMEBREW_NO_INSTALL_CLEANUP=1 \
        brew install node@22 >"$breeze_brew_log" 2>&1; then
        cat "$breeze_brew_log"
        breeze_use_formula || { echo 'Homebrew did not provide working Node 22/npm.' >&2; exit 1; }
        break
      fi
      cat "$breeze_brew_log" >&2
      # Only contention is retryable. Never delete or bypass Homebrew's locks.
      if ! grep -F 'has already locked' "$breeze_brew_log" >/dev/null \
        || [ "$breeze_attempt" = 12 ]; then exit 1; fi
      echo 'Homebrew is busy; waiting before checking Node 22 again.' >&2
      sleep 5
    done
    rm -f "$breeze_brew_log"
    trap - 0 1 2 15
  fi
fi
breeze_node_ready || { echo 'Working Node 22/npm are required.' >&2; exit 1; }
echo "Using $(command -v node): $(node --version), npm $(npm --version)"

# Apply Apple's counter to both targets before tests and Capacitor sync.
# Missing/invalid counters and checked-in release drift fail before npm install.
node tools/verify-ios-release.mjs --apply-cloud-build
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run ios:sync
