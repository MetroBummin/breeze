// Local HTTP + deterministic transactional double. NOT real Supabase/R2.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { emptyAccount, copy, RelayError } from '../core.mjs';
import { b64url, keyHash, proofMessage, sha256 } from '../security.mjs';
import { createRelay } from '../worker.mjs';
export const U1 = '11111111-1111-4111-8111-111111111111';
export const U2 = '22222222-2222-4222-8222-222222222222';
export const FILE = 'A'.repeat(32);
export class MemoryStore {
  constructor(clock) { this.clock = clock; this.accounts = new Map(); this.forcedDue = new Set(); }
  get(user) {
    if (!this.accounts.has(user)) this.accounts.set(user, { account: emptyAccount(), revision: 0,
      reserved_bytes: 0, active_count: 0, file_count: 0, files: new Map(), nonces: new Set(), events: [], floor: 0, minute: 0, used: 0 });
    return this.accounts.get(user);
  }
  async context(user, file) {
    const a = this.get(user); return copy({ account: a.account, revision: String(a.revision),
      reserved_bytes: a.reserved_bytes, active_count: a.active_count, file_count: a.file_count,
      file: a.files.get(file) || null, now: this.clock.now });
  }
  async commit(user, before, after, proof = null) {
    const a = this.get(user);
    if (String(a.revision) !== String(before.revision)) return { error: 'CONFLICT' };
    const nonce = proof && proof.device + ':' + proof.nonce;
    if (nonce && a.nonces.has(nonce)) return { error: 'REPLAY' };
    const minute = Math.floor(this.clock.now / 60000);
    const used = a.minute === minute ? a.used : 0;
    if (proof && used >= 60) return { error: 'RATE_LIMIT' };
    const old = after.file && a.files.get(after.file.fileId);
    const bytes = a.reserved_bytes - (old?.reservedBytes || 0) + (after.file?.reservedBytes || 0);
    const count = a.active_count - Number(!!old?.active) + Number(!!after.file?.active);
    if (bytes > 268435456 || count > 8 || (!old && after.file && a.file_count >= 512)) return { error: 'CAPACITY' };
    if (nonce) { a.nonces.add(nonce); a.minute = minute; a.used = used + 1; }
    if (JSON.stringify(a.account) !== JSON.stringify(after.account)) {
      for (const id of a.files.keys()) this.forcedDue.add(user + '/' + id);
    }
    a.account = copy(after.account); a.revision++;
    if (after.file) {
      if (!old) a.file_count++;
      a.files.set(after.file.fileId, copy(after.file)); this.forcedDue.delete(user + '/' + after.file.fileId);
      a.reserved_bytes = bytes; a.active_count = count;
    }
    if (after.notify) a.events.push({ cursor: String(a.revision), file_id: after.file?.fileId || null,
      kind: after.file ? 'file_changed' : 'devices_changed', audience: Object.entries(a.account.devices)
        .filter(([, d]) => d.status === 'approved' && (d.consent.send || d.consent.receive)).map(([id]) => id) });
    return { revision: String(a.revision) };
  }
  bootstrap(user, actor) {
    const a = this.get(user), d = a.account.devices[actor];
    if (a.account.everApproved || d?.status !== 'pending' || d.expiresAt <= this.clock.now) throw new Error('bad bootstrap');
    d.status = 'approved'; d.approvedAt = this.clock.now; a.account.everApproved = true; a.revision++;
  }
  async events(user, actor, cursor = '0', upto) {
    const a = this.get(user); if (Number(cursor) < a.floor) return { error: 'CURSOR_EXPIRED' };
    const all = a.events.filter(e => Number(e.cursor) > Number(cursor) && Number(e.cursor) <= Number(upto) && e.audience.includes(actor));
    const events = all.slice(0, 64).map(({ audience, ...e }) => e);
    return { events, cursor: all.length > 64 ? events.at(-1).cursor : String(upto), has_more: all.length > 64 };
  }
  async snapshot(user, _actor, after = '') {
    const all = [...this.get(user).files.values()].filter(f => f.fileId > after).sort((a, b) => a.fileId.localeCompare(b.fileId));
    return { items: copy(all.slice(0, 32)), after: all.slice(0, 32).at(-1)?.fileId || null, has_more: all.length > 32 };
  }
  async due() {
    const out = [];
    for (const [user, a] of this.accounts) for (const f of a.files.values()) {
      if ((f.nextDue !== null && f.nextDue <= this.clock.now) || this.forcedDue.has(user + '/' + f.fileId)) out.push({ user_id: user, file_id: f.fileId });
    }
    return out.slice(0, 16);
  }
  async sweepCursor(value) { if (value !== undefined) this.cursor = value; return { cursor: this.cursor || '' }; }
  async prune() { return { ok: true }; }
}
export class FakeR2 {
  constructor(clock) { this.clock = clock; this.objects = new Map(); this.grants = new Map(); this.deleteFailures = 0; this.copyCount = 0; this.deleteCount = 0; }
  grant(key, method, until, size, etag) {
    const token = randomUUID(); this.grants.set(token, { key, method, until, size, etag });
    return this.origin + '/r2/' + token;
  }
  async upload(u) { return { url: this.grant(u.stage, 'PUT', u.grantUntil, u.size), method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream', 'If-None-Match': '*' }, content_length: u.size, expires_at: u.grantUntil }; }
  async download(e) { return { url: this.grant(e.attempt.ready, 'GET', e.grantUntil, null, e.attempt.etag), method: 'GET',
    headers: { 'If-Match': e.attempt.etag }, expires_at: e.grantUntil }; }
  async http(request, response, data) {
    const g = this.grants.get(request.url.slice('/r2/'.length));
    if (!g || request.method !== g.method || this.clock.now >= g.until) { response.writeHead(403).end(); return; }
    if (g.method === 'PUT') {
      if (request.headers['if-none-match'] !== '*' || request.headers['content-type'] !== 'application/octet-stream' || data.length !== g.size || Number(request.headers['content-length']) !== g.size) { response.writeHead(400).end(); return; }
      if (this.objects.has(g.key)) { response.writeHead(412).end(); return; }
      this.objects.set(g.key, { bytes: data, etag: '"' + await sha256(data) + '"', uploaded: this.clock.now });
      response.writeHead(200).end();
    } else {
      const o = this.objects.get(g.key);
      if (!o) { response.writeHead(404).end(); return; }
      if (request.headers['if-match'] !== o.etag || g.etag !== o.etag) { response.writeHead(412).end(); return; }
      response.writeHead(200, { 'content-type': 'application/octet-stream' }).end(o.bytes);
    }
  }
  async confirm(u) {
    const o = this.objects.get(u.stage);
    if (!o) throw new RelayError('UPLOAD_NOT_FOUND');
    if (o.bytes.length !== u.size) throw new RelayError('CIPHERTEXT_SIZE_MISMATCH', 422);
    this.copyCount++; this.objects.set(u.ready, { ...o, bytes: Buffer.from(o.bytes) });
    if (this.confirmHook) await this.confirmHook(u);
    return { etag: o.etag };
  }
  async delete(keys) {
    if (!keys.length) return;
    this.deleteCount++;
    if (this.deleteFailures > 0) { this.deleteFailures--; throw new Error('simulated R2 outage'); }
    for (const key of keys) this.objects.delete(key);
  }
  async sweep(_cursor, before) { for (const [k, v] of this.objects) if (v.uploaded < before) this.objects.delete(k); return ''; }
}
export async function fixture(t, options = {}) {
  const clock = { now: Date.now() }, store = new MemoryStore(clock), objects = new FakeR2(clock);
  const relay = createRelay({ store, objects, auth: async token => {
    if (token === 'token-a') return U1; if (token === 'token-b') return U2; throw new RelayError('UNAUTHENTICATED', 401);
  }, allowedUsers: new Set([U1, U2]), rateLimiter: { limit: async () => ({ success: true }) }, ...options });
  const server = createServer(async (req, res) => {
    try {
      const chunks = []; for await (const chunk of req) chunks.push(chunk); const data = Buffer.concat(chunks);
      if (req.url.startsWith('/r2/')) { await objects.http(req, res, data); return; }
      const r = new Request(origin + req.url, { method: req.method, headers: req.headers, ...(req.method === 'POST' ? { body: data } : {}) });
      const response = await relay.fetch(r); res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
    } catch (e) { res.writeHead(500).end(String(e)); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`; objects.origin = origin;
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  async function client(user = U1, token = 'token-a') {
    const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const raw = await crypto.subtle.exportKey('jwk', keys.publicKey);
    const pub = { kty: raw.kty, crv: raw.crv, x: raw.x, y: raw.y };
    const c = { user, token, id: randomUUID(), keys, pub };
    c.signed = async (op, body, extra = {}) => {
      const text = JSON.stringify(body);
      const r = new Request(`${origin}/v1/${op}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${c.token}`,
        'x-relay-device': c.id, 'x-relay-time': String(clock.now), 'x-relay-nonce': randomUUID(), ...extra }, body: text });
      r.headers.set('x-relay-signature', b64url(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, c.keys.privateKey,
        new TextEncoder().encode(await proofMessage(r, text, c.token)))));
      return r;
    };
    c.call = async (op, body, extra) => { const r = await fetch(await c.signed(op, body, extra)); return { status: r.status, body: await r.json() }; };
    const r = await c.call('register', { public_key: pub, consent: { policy: 1, send: true, receive: true } });
    if (r.status !== 200) throw new Error(JSON.stringify(r));
    return c;
  }
  const a = await client(); store.bootstrap(U1, a.id);
  const b = await client(), c = await client();
  for (const child of [b, c]) {
    const r = await a.call('approve', { device_id: child.id, public_key_hash: await keyHash(child.pub) });
    if (r.status !== 200) throw new Error(JSON.stringify(r));
  }
  async function start(receivers = [b], file = FILE, source = a, size = 64) {
    await source.call('offer', { file_id: file }); let r;
    for (const target of receivers) r = await target.call('request', { file_id: file, request_id: randomUUID() });
    if (r.status !== 200) throw new Error(JSON.stringify(r));
    const transfer = r.body.transfer_id;
    const upload = await source.call('upload', { file_id: file, transfer_id: transfer, cipher_size: size });
    if (upload.status !== 200) throw new Error(JSON.stringify(upload));
    const bytes = crypto.getRandomValues(new Uint8Array(size));
    const put = await fetch(upload.body.upload.url, { method: 'PUT', headers: upload.body.upload.headers, body: bytes });
    if (put.status !== 200) throw new Error('PUT failed ' + put.status);
    return { file_id: file, transfer_id: transfer, attempt_id: upload.body.attempt_id, upload: upload.body.upload, bytes };
  }
  const complete = (x, source = a) => source.call('complete', { file_id: x.file_id, transfer_id: x.transfer_id, attempt_id: x.attempt_id });
  const ack = (x, target = b) => target.call('ack', { file_id: x.file_id, transfer_id: x.transfer_id, attempt_id: x.attempt_id, verified: true, stored: true });
  return { clock, store, objects, relay, origin, a, b, c, client, start, complete, ack };
}
