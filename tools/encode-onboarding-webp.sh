#!/usr/bin/env bash
# Encodes the onboarding card clips as looping 60fps animated WebP
# (assets/onboarding-carousel/card{1,2}[-wide].webp). An <img> needs no
# autoplay, poster or play-button handling, and always loops from frame 0.
#
# Usage: tools/encode-onboarding-webp.sh <dir with card1.mp4 card1-wide.mp4 card2.mp4 card2-wide.mp4>
# The 60fps H264 masters were removed from the repo in favour of the WebP;
# recover them with, for example:
#   git show 5d128a46:assets/onboarding-carousel/card1.mp4 > /tmp/src/card1.mp4
# Needs ffmpeg (frame extraction) and img2webp (libwebp's `webp` tools).
#
# Why img2webp and a key frame every 3 frames: libwebp's lossy animation
# encoder treats a pixel that moved by less than a quality-derived threshold
# (about 5 levels at q75) as unchanged, and drops frames that are "similar"
# the same way. During the clips' slow cross-fades every step is under that
# threshold, so the previous screen stayed on as a ghost for seconds
# (ffmpeg's libwebp_anim cannot set key frames). -kmax 3 bounds any such
# residue to 50ms at about +15% size.
set -euo pipefail
src=${1:?usage: $0 <source-dir>}
out=$(cd "$(dirname "$0")/.." && pwd)/assets/onboarding-carousel
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
encode(){
  local name=$1 dir=$tmp/$1 n=0 f
  mkdir -p "$dir"
  # Same pixel size as the source (1080x1920 / 1440x1080), every frame.
  ffmpeg -v error -i "$src/$name.mp4" -an "$dir/%05d.png"
  {
    echo "-kmin 2 -kmax 3 -loop 0 -lossy -q 75 -m 4"
    # 60fps in whole milliseconds: 17, 17, 16 keeps every frame on the grid.
    for f in "$dir"/*.png; do echo "-d $(( n % 3 == 2 ? 16 : 17 )) $f"; n=$((n+1)); done
    echo "-o $out/$name.webp"
  } > "$dir/args"
  img2webp "$dir/args" > /dev/null
}
for name in card1 card1-wide card2 card2-wide; do encode "$name" & done
wait
ls -l "$out"/*.webp
