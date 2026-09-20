import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { authenticate, presign, R2Objects, SupabaseStore } from '../adapters.mjs';
import { smallText } from '../security.mjs';
const vectors = JSON.parse(await readFile(new URL('./sigv4-vectors.json', import.meta.url), 'utf8'));
const env = { SUPABASE_URL: 'https://test.invalid', SUPABASE_PUBLISHABLE_KEY: 'TEST_ONLY_PUBLIC', SUPABASE_SERVICE_ROLE_KEY: 'TEST_ONLY_SERVICE',
  R2_ACCOUNT_ID: '0'.repeat(32), R2_BUCKET_NAME: 'breeze-book-relay-dev', R2_ACCESS_KEY_ID: 'TEST_ONLY_ACCESS', R2_SECRET_ACCESS_KEY: 'TEST_ONLY_SECRET' };
for (const v of vectors) test(`AWS SigV4 agrees with independent botocore: ${v.input.method} ${v.input.key}`, async () => {
  const actual = new URL(await presign(v.input)), expected = new URL(v.url);
  assert.equal(actual.origin + actual.pathname, expected.origin + expected.pathname);
  assert.deepEqual(Object.fromEntries(actual.searchParams), Object.fromEntries(expected.searchParams));
});
test('presigner refuses nonpositive or longer than 60-second grants', async () => {
  for (const seconds of [0, 61, 1.5]) await assert.rejects(presign({ ...vectors[0].input, seconds }), { code: 'INVALID_GRANT_WINDOW' });
});
test('Auth uses actual project Auth server, never an unverified JWT claim', async () => {
  let calls = 0;
  const id = '11111111-1111-4111-8111-111111111111';
  const verified = await authenticate(env, 'arbitrary-token', async (url, init) => {
    calls++; assert.equal(url, 'https://test.invalid/auth/v1/user'); assert.equal(init.redirect, 'manual');
    assert.equal(init.headers.authorization, 'Bearer arbitrary-token'); return Response.json({ id });
  });
  assert.equal(verified, id); assert.equal(calls, 1);
  for (const status of [401, 403]) await assert.rejects(authenticate(env, 'x', async () => new Response('', { status })), { code: 'UNAUTHENTICATED' });
  await assert.rejects(authenticate(env, 'x', async () => new Response('', { status: 503 })), { code: 'AUTH_UNAVAILABLE' });
  await assert.rejects(authenticate(env, 'x', async () => Response.json({ id, is_anonymous: true })), { code: 'UNAUTHENTICATED' });
});
test('R2 completion checks size and sends conditional server-side CopyObject', async () => {
  const u = { stage: 'relay/t/a/stage', ready: 'relay/t/a/ready', size: 64 };
  let copied = 0;
  const obj = new R2Objects({ ...env, BOOK_RELAY: { head: async () => ({ size: 64, httpEtag: '"etag"' }) } }, async (url, init) => {
    copied++; assert.equal(init.headers['x-amz-copy-source-if-match'], '"etag"');
    assert.equal(init.headers['x-amz-copy-source'], '/breeze-book-relay-dev/relay/t/a/stage');
    assert.equal(init.body, undefined); assert.ok(new URL(url).pathname.endsWith('/ready'));
    return new Response('<CopyObjectResult><ETag>"etag"</ETag></CopyObjectResult>');
  });
  assert.equal((await obj.confirm(u)).etag, '"etag"'); assert.equal(copied, 1);
  obj.env.BOOK_RELAY.head = async () => ({ size: 65 });
  await assert.rejects(obj.confirm(u), { code: 'CIPHERTEXT_SIZE_MISMATCH' }); assert.equal(copied, 1);
});
test('CopyObject HTTP 200 XML error is not accepted; XML is bounded', async () => {
  const e = { ...env, BOOK_RELAY: { head: async () => ({ size: 64, httpEtag: '"etag"' }) } };
  const u = { stage: 'relay/stage', ready: 'relay/ready', size: 64 };
  await assert.rejects(new R2Objects(e, async () => new Response('<Error><Code>Failure</Code></Error>')).confirm(u), { code: 'OBJECT_COPY_FAILED' });
  await assert.rejects(new R2Objects(e, async () => new Response('x'.repeat(8193))).confirm(u), { code: 'REQUEST_TOO_LARGE' });
});
test('delete is verified and orphan sweep is bounded to dedicated prefix/age', async () => {
  let deleted;
  const e = { ...env, BOOK_RELAY: {
    delete: async keys => { deleted = keys; }, head: async () => null,
    list: async options => { assert.equal(options.prefix, 'relay/'); assert.equal(options.limit, 100);
      return { truncated: true, cursor: 'next', objects: [{ key: 'relay/old', uploaded: new Date(1000) }, { key: 'relay/recent', uploaded: new Date(3000) }] }; }
  } };
  const r2 = new R2Objects(e); assert.equal(await r2.sweep('', 2000), 'next'); assert.deepEqual(deleted, ['relay/old']);
  e.BOOK_RELAY.head = async () => ({}); await assert.rejects(r2.delete(['relay/old']), { code: 'OBJECT_DELETE_PENDING' });
});
test('Supabase adapter uses only small relay RPC records and hides upstream errors', async () => {
  const s = new SupabaseStore(env, async (url, init) => {
    assert.equal(url, 'https://test.invalid/rest/v1/rpc/relay_context');
    assert.deepEqual(JSON.parse(init.body), { p_user: 'test-user', p_file: null });
    return Response.json({ revision: '1' });
  });
  assert.deepEqual(await s.context('test-user'), { revision: '1' });
  s.fetch = async () => new Response('sensitive upstream detail', { status: 500 });
  await assert.rejects(s.context('test-user'), { code: 'STATE_BACKEND_UNAVAILABLE', message: 'STATE_BACKEND_UNAVAILABLE' });
});
test('bounded control reader cancels an oversized stream', async () => {
  let cancelled = false;
  const r = new Response(new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(9000)); }, cancel() { cancelled = true; } }));
  await assert.rejects(smallText(r), { code: 'REQUEST_TOO_LARGE' }); assert.equal(cancelled, true);
});
