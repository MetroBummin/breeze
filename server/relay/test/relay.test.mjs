import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, open, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixture, FILE, U1, U2 } from './fixture.mjs';
import { DEFAULTS } from '../core.mjs';
import { keyHash } from '../security.mjs';
import worker from '../worker.mjs';
const ok = r => { assert.equal(r.status, 200, JSON.stringify(r)); return r.body; };
const file = f => f.store.get(U1).files.get(FILE);

test('local HTTP: encrypted dummy upload -> HEAD/copy -> decrypt/fsync -> ACK -> immediate delete -> settled', async t => {
  const f = await fixture(t);
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode('TEST ONLY: not a user book.');
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  await f.a.call('offer', { file_id: FILE });
  const q = ok(await f.b.call('request', { file_id: FILE, request_id: randomUUID() }));
  const u = ok(await f.a.call('upload', { file_id: FILE, transfer_id: q.transfer_id, cipher_size: cipher.length }));
  assert.equal((await fetch(u.upload.url, { method: 'PUT', headers: u.upload.headers, body: cipher })).status, 200);
  const x = { file_id: FILE, transfer_id: q.transfer_id, attempt_id: u.attempt_id };
  ok(await f.complete(x));
  const d = ok(await f.b.call('download', { file_id: FILE, transfer_id: x.transfer_id }));
  const bytes = await (await fetch(d.download.url, { headers: d.download.headers })).arrayBuffer();
  const decrypted = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, bytes));
  assert.deepEqual(decrypted, plain);
  const dir = await mkdtemp(join(tmpdir(), 'relay-dummy-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'dummy.bin'), fd = await open(path, 'wx'); await fd.writeFile(decrypted); await fd.sync(); await fd.close();
  assert.deepEqual(new Uint8Array(await readFile(path)), plain);
  ok(await f.ack(x)); assert.equal(f.objects.objects.size, 0); assert.equal(file(f).state, 'closing');
  assert.ok(f.store.get(U1).reserved_bytes > 0, 'retain reservation through URL/copy quiet window');
  f.clock.now += 181_000; await f.relay.cleanup(U1, FILE);
  assert.equal(file(f).state, 'deleted'); assert.equal(f.store.get(U1).reserved_bytes, 0);
});

test('cross-account, pending device, and forged device proof are denied', async t => {
  const f = await fixture(t), x = await f.start(); ok(await f.complete(x));
  const foreign = await f.client(U2, 'token-b'); f.store.bootstrap(U2, foreign.id);
  assert.equal((await foreign.call('download', { file_id: FILE, transfer_id: x.transfer_id })).status, 404);
  const pending = await f.client();
  assert.equal((await pending.call('events', {})).body.error, 'DEVICE_NOT_APPROVED');
  assert.equal((await f.c.call('download', { file_id: FILE, transfer_id: x.transfer_id })).status, 404);
  assert.equal((await f.b.call('status', { file_id: FILE }, { 'x-relay-device': f.a.id })).body.error, 'BAD_PROOF');
});

test('duplicate request/upload/complete/ACK is idempotent with fresh proofs', async t => {
  const f = await fixture(t); await f.a.call('offer', { file_id: FILE });
  const body = { file_id: FILE, request_id: randomUUID() };
  const [r1, r2] = await Promise.all([f.b.call('request', body), f.b.call('request', body)]);
  assert.equal(ok(r1).transfer_id, ok(r2).transfer_id);
  const uploadBody = { file_id: FILE, transfer_id: r1.body.transfer_id, cipher_size: 64 };
  const u1 = ok(await f.a.call('upload', uploadBody)); f.clock.now += 1000;
  const u2 = ok(await f.a.call('upload', uploadBody));
  assert.equal(u1.attempt_id, u2.attempt_id); assert.equal(u1.upload.expires_at, u2.upload.expires_at);
  assert.equal((await fetch(u1.upload.url, { method: 'PUT', headers: u1.upload.headers, body: new Uint8Array(64) })).status, 200);
  const x = { file_id: FILE, transfer_id: r1.body.transfer_id, attempt_id: u1.attempt_id };
  ok(await f.complete(x)); ok(await f.complete(x)); assert.equal(f.objects.copyCount, 1);
  ok(await f.ack(x)); ok(await f.ack(x)); assert.equal(file(f).targets[f.b.id].status, 'acked');
});

test('two recipients: first ACK keeps ready object; final ACK deletes', async t => {
  const f = await fixture(t), x = await f.start([f.b, f.c]); ok(await f.complete(x));
  ok(await f.ack(x, f.b)); assert.equal(file(f).state, 'ready'); assert.ok(f.objects.objects.has(file(f).attempts[0].ready));
  const d = ok(await f.c.call('download', { file_id: FILE, transfer_id: x.transfer_id }));
  assert.equal((await fetch(d.download.url, { headers: d.download.headers })).status, 200);
  ok(await f.ack(x, f.c)); assert.equal(f.objects.objects.size, 0);
});

test('expiry denies API and issued URL, never auto-renews; explicit retry waits for source', async t => {
  const f = await fixture(t), x = await f.start(); ok(await f.complete(x));
  const deadline = file(f).expiresAt; f.clock.now = deadline - 20_000;
  const d = ok(await f.b.call('download', { file_id: FILE, transfer_id: x.transfer_id }));
  assert.equal(d.download.expires_at, deadline); f.clock.now = deadline + 1;
  assert.equal((await fetch(d.download.url, { headers: d.download.headers })).status, 403);
  assert.equal((await f.b.call('download', { file_id: FILE, transfer_id: x.transfer_id })).body.error, 'TRANSFER_EXPIRED');
  const priorId = file(f).requestIds[f.b.id];
  const same = ok(await f.b.call('request', { file_id: FILE, request_id: priorId })); assert.equal(same.state, 'deleted');
  assert.equal((await f.b.call('request', { file_id: FILE, request_id: randomUUID() })).body.error, 'RETRY_REQUIRED');
  const next = ok(await f.b.call('retry', { file_id: FILE, request_id: randomUUID(), reason: 'expired' }));
  assert.equal(next.state, 'waiting_source'); assert.equal(next.expires_at, null); assert.notEqual(next.transfer_id, x.transfer_id);
  ok(await f.a.call('source-missing', { file_id: FILE })); assert.equal(file(f).state, 'unavailable_known_sources');
});

test('cipher size is bounded and completion verifies actual object size', async t => {
  const f = await fixture(t); await f.a.call('offer', { file_id: FILE });
  const q = ok(await f.b.call('request', { file_id: FILE, request_id: randomUUID() }));
  assert.equal((await f.a.call('upload', { file_id: FILE, transfer_id: q.transfer_id, cipher_size: DEFAULTS.maxFileBytes + 1 })).status, 413);
  const x = await f.start(); const stage = file(f).attempts[0].stage;
  f.objects.objects.get(stage).bytes = new Uint8Array(65);
  assert.equal((await f.complete(x)).body.error, 'CIPHERTEXT_SIZE_MISMATCH'); assert.notEqual(file(f).state, 'ready');
});

test('PUT replay cannot overwrite stage; old upload capability never writes ready key', async t => {
  const f = await fixture(t), x = await f.start(); ok(await f.complete(x));
  assert.equal((await fetch(x.upload.url, { method: 'PUT', headers: x.upload.headers, body: new Uint8Array(64) })).status, 412);
  const ready = file(f).attempts[0].ready; assert.deepEqual(f.objects.objects.get(ready).bytes, Buffer.from(x.bytes));
  f.clock.now = x.upload.expires_at + 1;
  assert.equal((await fetch(x.upload.url, { method: 'PUT', headers: x.upload.headers, body: x.bytes })).status, 403);
});

test('ACK cleanup failure is retried; completed transfer cannot grant downloads', async t => {
  const f = await fixture(t), x = await f.start(); ok(await f.complete(x)); f.objects.deleteFailures = 1;
  ok(await f.ack(x)); assert.equal(file(f).cleanupTries, 1); assert.ok(f.objects.objects.size);
  assert.equal((await f.b.call('download', { file_id: FILE, transfer_id: x.transfer_id })).body.error, 'NOT_READY');
  f.clock.now += 181_000; await f.relay.cleanup(U1, FILE);
  assert.equal(f.objects.objects.size, 0); assert.equal(file(f).state, 'deleted');
});

test('multiple senders are coordinated by one atomic lease', async t => {
  const f = await fixture(t); await f.a.call('offer', { file_id: FILE }); await f.c.call('offer', { file_id: FILE });
  const q = ok(await f.b.call('request', { file_id: FILE, request_id: randomUUID() }));
  const body = { file_id: FILE, transfer_id: q.transfer_id, cipher_size: 64 };
  const results = await Promise.all([f.a.call('upload', body), f.c.call('upload', body)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]); assert.equal(file(f).attempts.length, 1);
  assert.equal(results.find(r => r.status === 409).body.error, 'UPLOAD_LEASE_BUSY');
});

test('revocation waives remaining receiver, blocks access, and allows final cleanup', async t => {
  const f = await fixture(t), x = await f.start([f.b, f.c]); ok(await f.complete(x)); ok(await f.ack(x, f.b));
  ok(await f.a.call('revoke', { device_id: f.c.id }));
  assert.equal((await f.c.call('download', { file_id: FILE, transfer_id: x.transfer_id })).status, 403);
  await f.relay.cleanup(U1, FILE); assert.equal(file(f).targets[f.c.id].status, 'waived'); assert.equal(f.objects.objects.size, 0);
});

test('new-recipient join versus final ACK is serialized', async t => {
  const f = await fixture(t), x = await f.start(); ok(await f.complete(x));
  const [joined, acked] = await Promise.all([f.c.call('request', { file_id: FILE, request_id: randomUUID() }), f.ack(x)]);
  ok(acked);
  if (joined.status === 200) { assert.equal(file(f).state, 'ready'); assert.equal(file(f).targets[f.c.id].status, 'pending'); assert.ok(f.objects.objects.size); }
  else { assert.equal(joined.body.error, 'CLEANUP_PENDING'); assert.equal(file(f).state, 'closing'); }
});

test('proof replay, altered JSON, and stale timestamp are rejected', async t => {
  const f = await fixture(t), request = await f.b.signed('events', {});
  const r1 = await fetch(request.clone()); assert.equal(r1.status, 200);
  const r2 = await fetch(request.clone()); assert.equal((await r2.json()).error, 'PROOF_REPLAY');
  const tampered = new Request(request.url, { method: 'POST', headers: request.headers, body: '{"cursor":"1"}' });
  assert.equal((await (await fetch(tampered)).json()).error, 'BAD_PROOF');
  f.clock.now += 61_000; assert.equal((await (await fetch(request.clone())).json()).error, 'STALE_OR_INVALID_PROOF');
});

test('copy finishing after expiry never makes the transfer ready', async t => {
  const f = await fixture(t), x = await f.start(); f.objects.confirmHook = async () => { f.clock.now = file(f).expiresAt + 1; };
  assert.equal((await f.complete(x)).body.error, 'STALE_UPLOAD'); assert.notEqual(file(f).state, 'ready'); assert.equal(f.objects.objects.size, 0);
});

test('source revoked while CopyObject is in flight cannot publish ready', async t => {
  const f = await fixture(t), x = await f.start();
  f.objects.confirmHook = async () => { ok(await f.b.call('revoke', { device_id: f.a.id })); };
  assert.equal((await f.complete(x)).body.error, 'STALE_UPLOAD'); assert.notEqual(file(f).state, 'ready');
});

test('recipient ACK requires explicit verified + durably stored attestations', async t => {
  const f = await fixture(t), x = await f.start(); ok(await f.complete(x));
  assert.equal((await f.b.call('ack', { file_id: FILE, transfer_id: x.transfer_id, attempt_id: x.attempt_id, verified: true, stored: false })).body.error, 'DURABLE_ACK_REQUIRED');
  assert.equal(file(f).state, 'ready');
});

test('durable account rate limit applies to incremental events', async t => {
  const f = await fixture(t); f.clock.now += 61_000;
  for (let i = 0; i < 60; i++) ok(await f.b.call('events', {}));
  assert.equal((await f.b.call('events', {})).body.error, 'RATE_LIMIT');
});

test('cross-file byte budget includes stage and ready copies', async t => {
  const f = await fixture(t, { limits: { ...DEFAULTS, maxReservedBytes: 200 } });
  await f.start();
  const other = 'B'.repeat(32); await f.a.call('offer', { file_id: other });
  const q = ok(await f.b.call('request', { file_id: other, request_id: randomUUID() }));
  assert.equal((await f.a.call('upload', { file_id: other, transfer_id: q.transfer_id, cipher_size: 64 })).body.error, 'ACCOUNT_CAPACITY');
  assert.equal(f.store.get(U1).reserved_bytes, 128);
});

test('upload attempts are bounded and do not extend transfer expiry', async t => {
  const f = await fixture(t); await f.a.call('offer', { file_id: FILE });
  const q = ok(await f.b.call('request', { file_id: FILE, request_id: randomUUID() })); let expires;
  for (let i = 0; i < 3; i++) {
    const u = ok(await f.a.call('upload', { file_id: FILE, transfer_id: q.transfer_id, cipher_size: 64 }));
    expires ||= file(f).expiresAt; assert.equal(file(f).expiresAt, expires);
    assert.equal((await f.a.call('complete', { file_id: FILE, transfer_id: q.transfer_id, attempt_id: u.attempt_id })).body.error, 'UPLOAD_NOT_FOUND'); f.clock.now += 1000;
  }
  assert.equal((await f.a.call('upload', { file_id: FILE, transfer_id: q.transfer_id, cipher_size: 64 })).body.error, 'UPLOAD_RETRY_LIMIT');
});

test('re-request cycles are bounded; no scheduled auto-reupload', async t => {
  const f = await fixture(t); await f.a.call('offer', { file_id: FILE });
  let q = ok(await f.b.call('request', { file_id: FILE, request_id: randomUUID() }));
  for (let i = 0; i < 3; i++) {
    ok(await f.b.call('cancel', { file_id: FILE, transfer_id: q.transfer_id }));
    const next = await f.b.call('retry', { file_id: FILE, request_id: randomUUID(), reason: 'user_retry' });
    if (i < 2) q = ok(next); else assert.equal(next.body.error, 'RETRY_BUDGET_EXHAUSTED');
  }
  assert.equal(f.objects.copyCount, 0); assert.equal(file(f).state, 'deleted');
});

test('cursor polling is incremental; old cursor requires bounded snapshot recovery', async t => {
  const f = await fixture(t);
  const first = ok(await f.b.call('events', {}));
  assert.deepEqual(ok(await f.b.call('events', { cursor: first.cursor })).events, []);
  await f.a.call('offer', { file_id: FILE });
  const next = ok(await f.b.call('events', { cursor: first.cursor })); assert.equal(next.events.length, 1); assert.equal(next.events[0].file_id, FILE);
  f.store.get(U1).floor = Number(next.cursor);
  assert.equal((await f.b.call('events', { cursor: '0' })).body.error, 'CURSOR_EXPIRED');
  const snap = ok(await f.b.call('snapshot', {})); assert.equal(snap.items[0].file_id, FILE); assert.ok(snap.resume_cursor);
});

test('canceling one receiver does not cancel other receivers', async t => {
  const f = await fixture(t), x = await f.start([f.b, f.c]); ok(await f.complete(x));
  ok(await f.b.call('cancel', { file_id: FILE, transfer_id: x.transfer_id }));
  assert.equal(file(f).state, 'ready'); assert.ok(f.objects.objects.size);
});

test('plaintext fields, raw original hashes, and private JWK fields are rejected', async t => {
  const f = await fixture(t);
  assert.equal((await f.a.call('offer', { file_id: FILE, title: 'must not be accepted' })).body.error, 'UNEXPECTED_FIELD');
  assert.equal((await f.a.call('offer', { file_id: 'f'.repeat(64) })).body.error, 'BAD_FILE_ID');
  assert.equal((await f.a.call('register', { public_key: { ...f.a.pub, d: 'private' }, consent: { policy: 1, send: true, receive: true } })).body.error, 'BAD_PUBLIC_KEY');
});

test('consent withdrawal blocks grants without affecting vault/sync', async t => {
  const f = await fixture(t), x = await f.start(); ok(await f.complete(x));
  ok(await f.b.call('consent', { consent: { policy: 1, send: false, receive: false } }));
  assert.equal((await f.b.call('download', { file_id: FILE, transfer_id: x.transfer_id })).status, 403);
  await f.relay.cleanup(U1, FILE); assert.equal(f.objects.objects.size, 0);
});

test('production entry point is off and fails closed on unverified infrastructure', async () => {
  const req = new Request('https://relay.invalid/v1/events', { method: 'POST', body: '{}' });
  assert.equal((await (await worker.fetch(req, {})).json()).error, 'RELAY_DISABLED');
  assert.equal((await (await worker.fetch(req, { RELAY_ENABLED: 'true' })).json()).error, 'INFRA_NOT_VERIFIED');
});

test('cleanup failure backoff is respected and a dead letter needs explicit retry', async t => {
  const f = await fixture(t), x = await f.start(); ok(await f.complete(x));
  f.objects.deleteFailures = 100; ok(await f.ack(x));
  const calls = f.objects.deleteCount, retryAt = file(f).retryAt;
  await f.relay.cleanup(U1, FILE);
  assert.equal(f.objects.deleteCount, calls); assert.equal(file(f).retryAt, retryAt);
  for (let i = 1; i < DEFAULTS.maxCleanupAttempts; i++) { f.clock.now = file(f).retryAt; await f.relay.cleanup(U1, FILE); }
  assert.equal(file(f).state, 'cleanup_failed'); const blockedCalls = f.objects.deleteCount;
  f.clock.now += 3600_000; await f.relay.cleanup(U1, FILE); assert.equal(f.objects.deleteCount, blockedCalls);
  f.objects.deleteFailures = 0; ok(await f.b.call('cleanup-retry', { file_id: FILE }));
  assert.equal(file(f).state, 'deleted'); assert.equal(f.objects.objects.size, 0);
});

test('source reporting missing invalidates its in-flight completion lease', async t => {
  const f = await fixture(t), x = await f.start();
  f.objects.confirmHook = async () => { ok(await f.a.call('source-missing', { file_id: FILE })); };
  assert.equal((await f.complete(x)).body.error, 'STALE_UPLOAD'); assert.notEqual(file(f).state, 'ready');
});

test('download grant budget is enforced and GET grant is scoped to immutable ETag', async t => {
  const f = await fixture(t), x = await f.start(); ok(await f.complete(x));
  let last;
  for (let i = 0; i < DEFAULTS.maxDownloadGrants; i++) last = ok(await f.b.call('download', { file_id: FILE, transfer_id: x.transfer_id }));
  assert.equal((await f.b.call('download', { file_id: FILE, transfer_id: x.transfer_id })).body.error, 'DOWNLOAD_GRANT_LIMIT');
  assert.equal((await fetch(last.download.url)).status, 412);
});

test('CORS origin is allowlisted and control-plane requests have a hard byte limit', async t => {
  const f = await fixture(t);
  assert.equal((await f.b.call('events', {}, { origin: 'https://attacker.invalid' })).status, 403);
  const request = await f.b.signed('events', {});
  assert.equal((await fetch(new Request(request, { body: ' '.repeat(8193) }))).status, 413);
});

test('idempotent offers and requests do not emit an event feedback loop', async t => {
  const f = await fixture(t); ok(await f.a.call('offer', { file_id: FILE }));
  let n = f.store.get(U1).events.length;
  ok(await f.a.call('offer', { file_id: FILE })); assert.equal(f.store.get(U1).events.length, n);
  const q = { file_id: FILE, request_id: randomUUID() }; ok(await f.b.call('request', q));
  n = f.store.get(U1).events.length; ok(await f.b.call('request', q)); assert.equal(f.store.get(U1).events.length, n);
});
