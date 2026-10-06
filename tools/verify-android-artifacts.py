"""Check packaged runtime bytes without signing, uploading, or accessing secrets."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parent.parent
OUTPUTS = ROOT / "android/app/build/outputs"
ASSETS = ROOT / "www"


def verify():
    assert (ASSETS / "scripts/reader/pdf-ink.js").is_file(), "Run android:sync first"
    files = sorted(path for path in ASSETS.rglob("*") if path.is_file())
    assert len(files) > 50, "Refusing a scaffold-only web bundle"
    report = {
        "commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
        "releaseApplicationId": "kr.io.breeze.app",
        "debugApplicationId": "kr.io.breeze.app.debug",
        "targetSdk": 36,
        "bundledWebFiles": len(files),
        "deviceTestsRun": False,
        "playUploadReady": False,
        "remainingGates": ["Owner-controlled release upload signing", "Play Console setup and acceptance", "Android device QA"],
        "artifacts": [],
    }
    for relative, prefix, signing in [
        ("apk/debug/app-debug.apk", "assets/public/", "SDK development debug key; not a Play upload"),
        ("bundle/release/app-release.aab", "base/assets/public/", "unsigned; not a Play upload"),
    ]:
        artifact = OUTPUTS / relative
        with zipfile.ZipFile(artifact) as archive:
            names = archive.namelist()
            for source in files:
                name = prefix + source.relative_to(ASSETS).as_posix()
                assert archive.read(name) == source.read_bytes(), f"Bundled bytes differ: {relative}: {name}"
            if relative.endswith(".aab"):
                assert not any(re.match(r"META-INF/[^/]+\.(SF|RSA|DSA|EC)$", name, re.I) for name in names), "Expected unsigned release bundle"
        report["artifacts"].append({
            "file": relative,
            "bytes": artifact.stat().st_size,
            "sha256": hashlib.sha256(artifact.read_bytes()).hexdigest(),
            "signing": signing,
        })
    (OUTPUTS / "android-provenance.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    verify()
