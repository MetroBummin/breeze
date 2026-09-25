"""Reconstruct exact audit candidates; never update refs or deploy services."""
import hashlib, json, lzma, os, pathlib, subprocess, sys, time

ROOT = pathlib.Path(os.environ['GITHUB_WORKSPACE'])
PAYLOAD = ROOT / 'payload'
REPO = ROOT / 'candidate'
TARGET = os.environ['AUDIT_TARGET']
OUT = pathlib.Path(os.environ['RUNNER_TEMP']) / ('audit-' + TARGET)
OUT.mkdir(parents=True, exist_ok=True)
EXPECTED = 'f1c63bbc5efaa2f4b44133552dcbf0aa9430d9d432d887b916c330f05db6a0a9'

def git(*args):
    return subprocess.check_output(['git', '-C', str(REPO), *args])

def manifest():
    raw = b''.join((PAYLOAD / '.audit' / ('part' + str(i))).read_bytes() for i in range(3))
    assert hashlib.sha256(raw).hexdigest() == EXPECTED, 'transfer checksum'
    return json.loads(lzma.decompress(raw))

def valid_path(name):
    p = pathlib.PurePosixPath(name)
    assert not p.is_absolute() and '..' not in p.parts and '.git' not in p.parts
    return REPO / p

def prepare():
    doc = manifest()
    memo = {}
    def blob(sha):
        if sha in memo:
            return memo[sha]
        obj = doc['objects'].get(sha)
        if obj is None:
            result = git('cat-file', 'blob', sha)
        elif 'text' in obj:
            result = obj['text'].encode('utf-8')
        else:
            lines = blob(obj['base']).decode('utf-8').splitlines(keepends=True)
            for start, end, replacement in reversed(obj['edits']):
                lines[start:end] = replacement
            result = ''.join(lines).encode('utf-8')
        assert hashlib.sha1(b'blob ' + str(len(result)).encode() + b'\0' + result).hexdigest() == sha, sha
        memo[sha] = result
        return result
    for name, entry in doc['targets'][TARGET]['changes'].items():
        path = valid_path(name)
        if entry is None:
            path.unlink(missing_ok=True)
        else:
            assert entry['type'] == 'blob' and entry['mode'] in ('100644', '100755')
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(blob(entry['sha']))
            path.chmod(0o755 if entry['mode'] == '100755' else 0o644)
    git('diff', '--check')
    print('Prepared', TARGET, len(doc['targets'][TARGET]['changes']), 'files with verified blob hashes')

def verify():
    commands = [
        'npm test',
        'node --test tests/verify-home-audit.mjs',
        'node --test tests/verify-article-preview-server.mjs',
        'node tests/verify-audit-browser.mjs',
        'npm run test:ingestion',
        'npm run test:home-ui',
        'npm run test:pdf-geometry',
        'npm run test:pdf-pinch',
        'node tests/verify-home-accessibility-browser.mjs',
        'node tests/verify-casual-rails-browser.mjs',
        'node tests/verify-article-preview-browser.mjs',
        'node tests/verify-article-preview-resilience.mjs',
        'deno check --no-config server/article/index.ts',
        'deno run --no-config --allow-net tests/verify-article-transport-deno.mjs',
    ]
    if TARGET == 'annotation':
        commands.append('node tests/verify-pdf-ink-browser.mjs')
    results = []
    for index, command in enumerate(commands):
        name = f'{index:02d}.log'
        started = time.monotonic()
        with (OUT / name).open('w') as stream:
            try:
                run = subprocess.run(['bash', '-o', 'pipefail', '-c', command], cwd=REPO,
                                     stdout=stream, stderr=subprocess.STDOUT, timeout=240)
                code = run.returncode
            except subprocess.TimeoutExpired:
                code = 124
                stream.write('\nAUDIT COMMAND TIMEOUT\n')
        results.append({'command': command, 'exitCode': code, 'seconds': round(time.monotonic()-started, 2), 'log': name})
        (OUT / 'tests.json').write_text(json.dumps(results, indent=2))
        print(command, 'PASS' if code == 0 else f'FAIL {code}', flush=True)
        if code:
            print((OUT / name).read_text(errors='replace')[-5000:], flush=True)
    subprocess.run(['npm', 'run', 'stamp'], cwd=REPO, check=True)
    git('diff', '--check')

def publish_tree():
    doc = manifest()
    target = doc['targets'][TARGET]
    actual = git('ls-remote', 'origin', 'refs/heads/' + target['branch']).decode().split()[0]
    assert actual == target['expected'], 'Target changed; do not publish over concurrent work'
    git('add', '-A')
    names = git('diff', '--cached', '--name-only', '-z', doc['source']).decode().split('\0')
    entries = []
    for name in filter(None, names):
        path = valid_path(name)
        if not path.exists():
            entries.append({'path': name, 'mode': '100644', 'type': 'blob', 'sha': None})
            continue
        assert path.suffix not in ('.woff', '.woff2', '.ttf', '.otf'), 'Do not transfer font files'
        data = path.read_bytes()
        assert len(data) < 2000000
        entries.append({'path': name, 'mode': '100755' if os.access(path, os.X_OK) else '100644',
                        'type': 'blob', 'content': data.decode('utf-8')})
    body = {'base_tree': git('rev-parse', doc['source'] + '^{tree}').decode().strip(), 'tree': entries}
    # Creates only immutable Git objects. Branch updates stay in the explicit connector action.
    process = subprocess.run(['gh', 'api', '--method', 'POST', 'repos/MetroBummin/breeze/git/trees', '--input', '-'],
                             input=json.dumps(body), text=True, capture_output=True, check=True)
    tree = json.loads(process.stdout)['sha']
    tests = json.loads((OUT / 'tests.json').read_text()) if (OUT / 'tests.json').exists() else []
    result = {'target': TARGET, 'source': doc['source'], 'expectedHead': target['expected'],
              'branch': target['branch'], 'tree': tree, 'changedFiles': len(entries), 'tests': tests,
              'allPassed': bool(tests) and all(item['exitCode'] == 0 for item in tests)}
    (OUT / 'result.json').write_text(json.dumps(result, indent=2))
    print(json.dumps({key: value for key, value in result.items() if key != 'tests'}))
    if not result['allPassed']:
        raise SystemExit(1)

{'prepare': prepare, 'verify': verify, 'publish': publish_tree}[sys.argv[1]]()
