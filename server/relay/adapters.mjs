import { RelayError, fail, uuidOK } from './core.mjs';
import { sha256, hex, smallText } from './security.mjs';
const enc = s => new TextEncoder().encode(s);
const escape = s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
async function timedFetch(fetcher, input, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetcher(input, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}
async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', typeof key === 'string' ? enc(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc(data)));
}
// AWS Signature V4 query authentication; no proprietary cryptography.
// Host/path/header scope is fixed by the caller. Cross-check test uses botocore.
export async function presign({ endpoint, bucket, key, method, headers = {}, accessKey, secretKey, at, seconds }) {
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 60) fail('INVALID_GRANT_WINDOW', 410);
  const url = new URL(endpoint); url.pathname = '/' + [bucket, ...key.split('/')].map(escape).join('/');
  const date = new Date(at).toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = date.slice(0, 8), scope = `${day}/auto/s3/aws4_request`;
  const hs = { host: url.host, ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim().replace(/\s+/g, ' ')])) };
  const names = Object.keys(hs).sort();
  const params = { 'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': `${accessKey}/${scope}`,
    'X-Amz-Date': date, 'X-Amz-Expires': String(seconds), 'X-Amz-SignedHeaders': names.join(';') };
  const query = Object.entries(params).sort(([a], [b]) => a < b ? -1 : 1).map(([k, v]) => escape(k) + '=' + escape(v)).join('&');
  const canonical = [method, url.pathname, query, names.map(k => `${k}:${hs[k]}\n`).join(''), names.join(';'), 'UNSIGNED-PAYLOAD'].join('\n');
  const message = ['AWS4-HMAC-SHA256', date, scope, await sha256(canonical)].join('\n');
  let signing = await hmac('AWS4' + secretKey, day);
  for (const part of ['auto', 's3', 'aws4_request']) signing = await hmac(signing, part);
  url.search = query + '&X-Amz-Signature=' + hex(await hmac(signing, message));
  return url.toString();
}
export class SupabaseStore {
  constructor(env, fetcher = fetch) { this.env = env; this.fetch = fetcher; }
  async rpc(name, body) {
    const e = this.env;
    const r = await timedFetch(this.fetch, `${e.SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', redirect: 'manual',
      headers: { apikey: e.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${e.SUPABASE_SERVICE_ROLE_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify(body) }, 10_000);
    if (!r.ok) fail('STATE_BACKEND_UNAVAILABLE', 503); // Never expose/log upstream body or secrets.
    return r.json();
  }
  context(user, file) { return this.rpc('relay_context', { p_user: user, p_file: file || null }); }
  commit(user, before, after, proof = null) {
    return this.rpc('relay_commit', { p_user: user, p_expected: String(before.revision), p_account: after.account,
      p_file_id: after.file?.fileId || null, p_file: after.file || null, p_notify: !!after.notify,
      p_device: proof?.device || null, p_nonce: proof?.nonce || null });
  }
  events(user, device, cursor, upto) { return this.rpc('relay_events_page', { p_user: user, p_device: device, p_after: cursor || '0', p_upto: String(upto) }); }
  snapshot(user, device, after) { return this.rpc('relay_snapshot_page', { p_user: user, p_device: device, p_after: after || '' }); }
  due() { return this.rpc('relay_due', {}); }
  sweepCursor(value) { return this.rpc('relay_sweep_cursor', { p_cursor: value ?? null }); }
  prune() { return this.rpc('relay_prune', {}); }
}
export async function authenticate(env, token, fetcher = fetch) {
  const response = await timedFetch(fetcher, `${env.SUPABASE_URL}/auth/v1/user`, { redirect: 'manual',
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${token}` } }, 8000);
  if ([401, 403].includes(response.status)) fail('UNAUTHENTICATED', 401);
  if (!response.ok) fail('AUTH_UNAVAILABLE', 503);
  const user = await response.json();
  if (!uuidOK(user.id) || user.is_anonymous === true) fail('UNAUTHENTICATED', 401);
  return user.id;
}
export class R2Objects {
  constructor(env, fetcher = fetch) { this.env = env; this.fetch = fetcher; }
  async url(key, method, headers, at, until) {
    return presign({ endpoint: `https://${this.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, bucket: this.env.R2_BUCKET_NAME,
      key, method, headers, at, seconds: Math.floor((until - at) / 1000),
      accessKey: this.env.R2_ACCESS_KEY_ID, secretKey: this.env.R2_SECRET_ACCESS_KEY });
  }
  async upload(u) {
    const headers = { 'content-type': 'application/octet-stream', 'content-length': String(u.size), 'if-none-match': '*' };
    return { url: await this.url(u.stage, 'PUT', headers, u.grantAt, u.grantUntil), method: 'PUT',
      headers: { 'Content-Type': headers['content-type'], 'If-None-Match': '*' },
      content_length: u.size, expires_at: u.grantUntil };
  }
  async download(e) {
    const headers = { 'if-match': e.attempt.etag };
    return { url: await this.url(e.attempt.ready, 'GET', headers, e.grantAt, e.grantUntil), method: 'GET',
      headers: { 'If-Match': e.attempt.etag }, expires_at: e.grantUntil };
  }
  async confirm(u) {
    const object = await this.env.BOOK_RELAY.head(u.stage);
    if (!object) fail('UPLOAD_NOT_FOUND', 409);
    if (object.size !== u.size) fail('CIPHERTEXT_SIZE_MISMATCH', 422);
    const headers = { 'x-amz-copy-source': '/' + [this.env.R2_BUCKET_NAME, ...u.stage.split('/')].map(escape).join('/'),
      'x-amz-copy-source-if-match': object.httpEtag, 'x-amz-metadata-directive': 'REPLACE',
      'content-type': 'application/octet-stream', 'cache-control': 'private, no-store' };
    const now = Date.now();
    const r = await timedFetch(this.fetch, await this.url(u.ready, 'PUT', headers, now, now + 60_000), {
      method: 'PUT', headers, redirect: 'manual' }, 20_000);
    // CopyObject can return HTTP 200 containing an XML Error. Read only small control XML.
    if (!r.ok) fail('OBJECT_COPY_FAILED', 502);
    const xml = await smallText(r, 8192);
    if (xml.length > 8192 || /<Error(?:\s|>)/.test(xml) || !/<CopyObjectResult(?:\s|>)/.test(xml)) fail('OBJECT_COPY_FAILED', 502);
    const ready = await this.env.BOOK_RELAY.head(u.ready);
    if (!ready || ready.size !== u.size) fail('COPY_VERIFICATION_FAILED', 502);
    return { etag: ready.httpEtag };
  }
  async delete(keys) {
    if (!keys.length) return;
    await this.env.BOOK_RELAY.delete(keys);
    for (const key of keys) if (await this.env.BOOK_RELAY.head(key)) fail('OBJECT_DELETE_PENDING', 503);
  }
  async sweep(cursor, before) {
    const page = await this.env.BOOK_RELAY.list({ prefix: 'relay/', limit: 100, ...(cursor ? { cursor } : {}) });
    const old = page.objects.filter(o => o.uploaded.getTime() < before).map(o => o.key);
    if (old.length) await this.delete(old);
    return page.truncated ? page.cursor : '';
  }
}
