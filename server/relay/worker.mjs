import { DEFAULTS, RelayError, fail, uuidOK, validate, transition, view, finish, maintain, copy, cleanupKeys, cleaned } from './core.mjs';
import { smallText, publicKey, keyHash, verifyProof } from './security.mjs';
import { SupabaseStore, R2Objects, authenticate } from './adapters.mjs';

const response = (body, status = 200, origin = null) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff',
    ...(status === 429 ? { 'retry-after': '60' } : {}),
    ...(origin ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {}) },
});
function commitError(r) {
  if (r.error === 'REPLAY') fail('PROOF_REPLAY', 409);
  if (r.error === 'RATE_LIMIT') fail('RATE_LIMIT', 429);
  if (r.error === 'CAPACITY') fail('ACCOUNT_CAPACITY', 429);
  if (r.error) fail('STATE_BACKEND_UNAVAILABLE', 503);
}
export function createRelay({ store, objects, auth, allowedUsers, origins = new Set(), rateLimiter, limits = DEFAULTS }) {
  async function internal(user, fileId, reducer) {
    for (let i = 0; i < 5; i++) {
      const before = await store.context(user, fileId), after = reducer(before);
      const result = await store.commit(user, before, after);
      if (result.error === 'CONFLICT') continue;
      commitError(result); return after;
    }
    fail('STATE_BUSY', 503);
  }
  async function cleanup(user, fileId) {
    const state = await internal(user, fileId, c => {
      const s = copy(c); maintain(s.account, s.file, s.now, limits);
      return { ...s, notify: JSON.stringify(s.file) !== JSON.stringify(c.file) };
    });
    const keys = cleanupKeys(state, limits);
    // An empty closing transfer still needs its terminal state recorded.
    if (!keys.length && !(state.file?.state === 'closing' && state.file.attempts.every(u => u.settled))) return;
    let succeeded = true;
    try { await objects.delete(keys); } catch { succeeded = false; }
    await internal(user, fileId, c => {
      if (c.file?.transferId !== state.file?.transferId) return { ...c, notify: false };
      return cleaned(c, keys, succeeded, limits);
    });
  }
  async function fetchHandler(request) {
    const origin = request.headers.get('origin');
    const corsOrigin = origin && origins.has(origin) ? origin : null;
    try {
      if (origin && !corsOrigin) fail('ORIGIN_DENIED', 403);
      const u = new URL(request.url), match = /^\/v1\/([a-z-]+)$/.exec(u.pathname);
      if (!match || u.search) fail('NOT_FOUND', 404);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
        ...(corsOrigin ? { 'access-control-allow-origin': corsOrigin, vary: 'Origin' } : {}),
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'authorization, content-type, x-relay-device, x-relay-time, x-relay-nonce, x-relay-signature',
        'access-control-max-age': '600' } });
      if (request.method !== 'POST') fail('METHOD_NOT_ALLOWED', 405);
      if (!request.headers.get('content-type')?.startsWith('application/json')) fail('JSON_REQUIRED', 415);
      // Cloudflare binding is best-effort per-location pre-auth protection, not the durable account quota.
      if (!rateLimiter || !(await rateLimiter.limit({ key: request.headers.get('cf-connecting-ip') || 'unknown' })).success) fail('EDGE_RATE_LIMIT', 429);
      const token = /^Bearer ([A-Za-z0-9_.-]+)$/.exec(request.headers.get('authorization') || '')?.[1];
      if (!token || token.length > 8192) fail('UNAUTHENTICATED', 401);
      const text = await smallText(request); let body;
      try { body = JSON.parse(text); } catch { fail('BAD_JSON', 400); }
      const op = match[1]; validate(op, body);
      const user = await auth(token);
      if (!allowedUsers?.has(user)) fail('DEV_ACCOUNT_NOT_ALLOWED', 403);
      const actor = request.headers.get('x-relay-device'); if (!uuidOK(actor)) fail('BAD_DEVICE_ID', 401);
      let saved, gate;
      for (let i = 0; i < 5; i++) {
        const before = await store.context(user, body.file_id);
        const jwk = op === 'register' ? body.public_key : before.account.devices[actor]?.publicKey;
        if (!jwk) fail('DEVICE_NOT_APPROVED', 403);
        if (op === 'register') await publicKey(jwk);
        const proof = await verifyProof(request, text, token, jwk, before.now);
        const after = transition(before, op, body, actor, op === 'register' ? await keyHash(jwk) : null, limits);
        // Idempotent offers/requests/ACKs must not create an event feedback loop.
        after.notify &&= JSON.stringify(after.account) !== JSON.stringify(before.account) || JSON.stringify(after.file) !== JSON.stringify(before.file);
        const r = await store.commit(user, before, after, proof);
        if (r.error === 'CONFLICT') continue;
        commitError(r); saved = after; gate = r; break;
      }
      if (!saved) fail('STATE_BUSY', 503);
      // Persist expiration/waivers even when the requested operation is rejected.
      if (saved.status >= 400) {
        if (saved.file?.state === 'closing') await cleanup(user, body.file_id).catch(() => {});
        return response(saved.result, saved.status, corsOrigin);
      }
      if (op === 'events') {
        const data = await store.events(user, actor, body.cursor, gate.revision);
        if (data.error === 'CURSOR_EXPIRED') return response({ error: 'CURSOR_EXPIRED', recovery: 'snapshot_then_events' }, 409, corsOrigin);
        return response(data, 200, corsOrigin);
      }
      if (op === 'snapshot') {
        const page = await store.snapshot(user, actor, body.after);
        return response({ items: page.items.map(f => view(f, actor, saved.account)), after: page.after,
          has_more: page.has_more, resume_cursor: String(gate.revision) }, 200, corsOrigin);
      }
      const e = saved.effect;
      if (e?.type === 'upload') return response({ ...saved.result, attempt_id: e.attempt.id,
        upload: await objects.upload(e.attempt) }, 200, corsOrigin);
      if (e?.type === 'download') return response({ ...saved.result, download: await objects.download(e) }, 200, corsOrigin);
      if (e?.type === 'complete') {
        let verified;
        try { verified = await objects.confirm(e.attempt); }
        catch (error) {
          await internal(user, body.file_id, c => finish(c, e.transferId, e.attempt.id, false, null, limits));
          throw error instanceof RelayError ? error : new RelayError('OBJECT_BACKEND_UNAVAILABLE', 503);
        }
        const final = await internal(user, body.file_id, c => finish(c, e.transferId, e.attempt.id, true, verified.etag, limits));
        if (final.file?.state !== 'ready' || final.file.winner !== e.attempt.id) {
          await cleanup(user, body.file_id).catch(() => {}); fail('STALE_UPLOAD');
        }
        return response(view(final.file, actor, final.account), 200, corsOrigin);
      }
      if (saved.file?.state === 'closing') await cleanup(user, body.file_id).catch(() => {});
      return response(saved.result, saved.status, corsOrigin);
    } catch (error) {
      // No request bodies, tokens, URLs, object keys, or upstream errors in logs.
      return response({ error: error instanceof RelayError ? error.code : 'RELAY_UNAVAILABLE' },
        error instanceof RelayError ? error.status : 503, corsOrigin);
    }
  }
  async function scheduled() {
    const jobs = await store.due(); let failed = 0;
    for (const job of jobs) {
      try { await cleanup(job.user_id, job.file_id); } catch { failed++; }
    }
    // Dedicated relay/ prefix only. Catches DB/account deletion, lost state, and late PUT/Copy completion.
    // TTL is capped at 24h by config; this backstop is not an exact retention guarantee.
    try {
      const cursor = await store.sweepCursor();
      const next = await objects.sweep(cursor.cursor || '', Date.now() - limits.ttlMs - 3600_000);
      await store.sweepCursor(next);
    } catch { failed++; }
    await store.prune();
    if (failed) console.warn(JSON.stringify({ event: 'relay_cleanup_retry_needed', count: failed }));
  }
  return { fetch: fetchHandler, scheduled, cleanup };
}
function configured(env) {
  if (env.INFRA_VERIFIED !== 'true') fail('INFRA_NOT_VERIFIED', 503);
  if (env.SUPABASE_URL !== 'https://hrtfhojbhqvaoiulspto.supabase.co') fail('PROJECT_MISMATCH', 503);
  for (const k of ['SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'R2_ACCOUNT_ID', 'R2_BUCKET_NAME', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'ALLOWED_USER_IDS']) {
    if (!env[k] || /REPLACE|UNVERIFIED/.test(env[k])) fail('CONFIGURATION_REQUIRED', 503);
  }
  if (!/^[0-9a-f]{32}$/.test(env.R2_ACCOUNT_ID) || !env.R2_BUCKET_NAME.endsWith('-dev') || !env.BOOK_RELAY || !env.RATE_LIMITER) fail('CONFIGURATION_REQUIRED', 503);
  const ttl = Number(env.TEMP_TTL_SECONDS || 86400) * 1000;
  if (!Number.isInteger(ttl) || ttl < 60_000 || ttl > DEFAULTS.ttlMs) fail('BAD_TTL', 503);
  const users = new Set(env.ALLOWED_USER_IDS.split(',').map(s => s.trim()));
  if (!users.size || users.size > 5 || [...users].some(id => !uuidOK(id))) fail('DEV_ALLOWLIST_REQUIRED', 503);
  return createRelay({ store: new SupabaseStore(env), objects: new R2Objects(env), auth: token => authenticate(env, token),
    allowedUsers: users, origins: new Set((env.ALLOWED_ORIGINS || '').split(',').filter(Boolean)),
    rateLimiter: env.RATE_LIMITER, limits: { ...DEFAULTS, ttlMs: ttl } });
}
export default {
  async fetch(request, env) {
    if (env.RELAY_ENABLED !== 'true') return response({ error: 'RELAY_DISABLED' }, 503);
    try { return await configured(env).fetch(request); }
    catch (error) { return response({ error: error instanceof RelayError ? error.code : 'RELAY_UNAVAILABLE' }, 503); }
  },
  async scheduled(_event, env, ctx) {
    // Disable API grants without disabling cleanup. Do not remove this cron while objects remain.
    if (env.CLEANUP_ENABLED === 'false') return;
    ctx.waitUntil(configured(env).scheduled());
  },
};
