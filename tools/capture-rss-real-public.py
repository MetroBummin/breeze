"""Fixed-fixture public HTML capture through the workspace's managed HTTPS egress.

No keys, model transport, bypasses, cookies, headers or HTML printed. This offline
capture transport differs from production's pinned-DNS transport. Redirects must
stay on the seed's exact hostname (with optional www); all inputs are HTTPS.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
SEEDS = ROOT / 'tests/fixtures/rss-quality/real-source-seeds.json'
LIMIT = 3_000_000


class FixedRedirect(urllib.request.HTTPRedirectHandler):
    def __init__(self, hostname):
        self.allowed = {hostname, hostname.removeprefix('www.'), 'www.' + hostname.removeprefix('www.')}

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        url = urllib.parse.urlsplit(newurl)
        if url.scheme != 'https' or url.hostname not in self.allowed or url.username or url.password or url.port not in (None, 443):
            raise ValueError('capture_redirect_disallowed')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def main():
    out = Path(sys.argv[1]).resolve()
    if out.is_relative_to(ROOT):
        raise ValueError('private_capture_must_be_outside_checkout')
    seeds = json.loads(SEEDS.read_text())
    rows = []
    for seed in seeds:
        url = urllib.parse.urlsplit(seed['url'])
        if url.scheme != 'https' or url.username or url.password:
            raise ValueError('bad_seed')
        row = {'id': seed['id'], 'requestedUrl': seed['url'], 'fetchedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
        try:
            opener = urllib.request.build_opener(FixedRedirect(url.hostname))
            request = urllib.request.Request(seed['url'], headers={'User-Agent': 'Mozilla/5.0 (compatible; Breeze public article reader)', 'Accept': 'text/html,application/xhtml+xml', 'Accept-Encoding': 'identity'})
            with opener.open(request, timeout=20) as response:
                content_type = response.headers.get('Content-Type', '')
                if not ('html' in content_type or 'xml' in content_type):
                    raise ValueError('source_content_type')
                raw = response.read(LIMIT + 1)
                if len(raw) > LIMIT:
                    raise ValueError('body_limit')
                charset = response.headers.get_content_charset() or 'utf-8'
                try:
                    html = raw.decode(charset, errors='replace')
                except LookupError:
                    html = raw.decode('utf-8', errors='replace')
                row.update({'stage': 'fetched', 'url': response.url, 'html': html, 'sourceBytesSha': hashlib.sha256(raw).hexdigest(), 'httpStatus': response.status})
        except urllib.error.HTTPError as error:
            row.update({'stage': 'source', 'code': 'http_' + str(error.code)})
        except ValueError as error:
            row.update({'stage': 'source', 'code': str(error) if str(error) in {'body_limit', 'capture_redirect_disallowed', 'source_content_type'} else 'capture_unavailable'})
        except (urllib.error.URLError, TimeoutError, OSError):
            row.update({'stage': 'infrastructure', 'code': 'capture_network_unavailable'})
        rows.append(row)
    out.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd = os.open(out, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump({'schema': 'rss-public-capture-v1', 'transport': 'managed HTTPS proxy, fixed seed origins', 'sources': rows}, stream)
    print(json.dumps({'sources': len(rows), 'fetched': sum(x['stage'] == 'fetched' for x in rows), 'infrastructureFailures': sum(x['stage'] == 'infrastructure' for x in rows), 'providerCalls': 0, 'statuses': [{'id': x['id'], 'stage': x['stage'], 'code': x.get('code')} for x in rows]}))


if __name__ == '__main__':
    main()
