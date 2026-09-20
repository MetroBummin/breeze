// Relay v1: pure transitions. Only the Worker may submit these documents to SQL.
// Never place plaintext metadata, original hashes, book bytes, or vault keys here.
export const DEFAULTS = Object.freeze({
  ttlMs: 24 * 3600_000, maxFileBytes: 32 * 1024 * 1024,
  maxReservedBytes: 256 * 1024 * 1024, maxActive: 8, maxFiles: 512,
  maxDevices: 8, maxAttempts: 3, maxCyclesPerDay: 3, maxDownloadGrants: 12,
  grantMs: 60_000, leaseMs: 10 * 60_000, copyMs: 45_000,
  quietMs: 120_000, waitingMs: 7 * 86400_000, maxCleanupAttempts: 8,
});
export class RelayError extends Error {
  constructor(code, status = 409) { super(code); this.code = code; this.status = status; }
}
export const fail = (code, status) => { throw new RelayError(code, status); };
export const uuidOK = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export const fileOK = value => typeof value === 'string' && /^[A-Za-z0-9_-]{32}$/.test(value);
export const copy = value => structuredClone(value);
const active = f => ['waiting_source', 'unavailable_known_sources', 'uploading', 'ready', 'closing', 'cleanup_failed'].includes(f?.state);
const device = (a, id) => a.devices?.[id];
const approved = (a, id) => device(a, id)?.status === 'approved';
const receives = (a, id) => approved(a, id) && device(a, id).consent?.receive === true;
const sends = (a, id) => approved(a, id) && device(a, id).consent?.send === true;
const pending = f => Object.entries(f.targets || {}).filter(([, t]) => t.status === 'pending');
const winner = f => f.attempts.find(a => a.id === f.winner);
const current = f => f.attempts.find(a => a.id === f.current);
const quietAt = (a, l) => Math.max(a.grantUntil, a.copyUntil || 0, a.verified ? 0 : a.leaseUntil) + l.quietMs;
export function emptyAccount() { return { v: 1, devices: {}, everApproved: false }; }
function emptyFile(id, now) {
  return { v: 1, fileId: id, state: 'idle', holders: {}, targets: {}, requestIds: {},
    attempts: [], cycles: [], transferId: null, expiresAt: null, openedAt: now,
    current: null, winner: null, outcome: null, cleanupTries: 0, retryAt: null };
}
function consent(c) {
  if (!c || Object.keys(c).sort().join(',') !== 'policy,receive,send' || c.policy !== 1 ||
      typeof c.send !== 'boolean' || typeof c.receive !== 'boolean') fail('CONSENT_REQUIRED', 400);
  return copy(c);
}
function close(f, reason, now) {
  if (['closing', 'cleanup_failed', 'deleted'].includes(f.state)) return;
  f.state = 'closing'; f.outcome = reason; f.current = null;
  f.closedAt = now; f.retryAt = now; f.cleanupTries = 0;
}
function newCycle(f, now, random, l) {
  f.cycles = f.cycles.filter(n => n > now - 86400_000);
  if (f.cycles.length >= l.maxCyclesPerDay) fail('RETRY_BUDGET_EXHAUSTED', 429);
  if (f.attempts.some(a => !a.settled)) fail('CLEANUP_PENDING');
  f.cycles.push(now); f.transferId = random(); f.openedAt = now;
  f.expiresAt = null; f.attempts = []; f.targets = {}; f.current = null; f.winner = null;
  f.state = 'waiting_source'; f.outcome = null; f.cleanupTries = 0; f.retryAt = null;
}
function availability(a, f) {
  const known = Object.keys(f.holders);
  const candidates = known.filter(id => f.holders[id] === 'present' && sends(a, id));
  return candidates.length ? 'source_may_be_offline' : known.length ? 'no_known_source' : 'source_not_yet_reported';
}
export function view(f, actor, a) {
  if (!f) return null;
  const w = winner(f);
  return { file_id: f.fileId, transfer_id: f.transferId, state: f.state,
    outcome: f.outcome, expires_at: f.expiresAt, attempt_id: w?.id || null,
    cipher_size: w?.size || null, recipient_status: f.targets[actor]?.status || null,
    source_availability: availability(a, f), cleanup_pending: f.state === 'closing' || f.state === 'cleanup_failed' };
}
export function maintain(account, f, now, l = DEFAULTS) {
  if (!f) return;
  for (const [id, t] of Object.entries(f.targets)) {
    if (t.status === 'pending' && !receives(account, id)) t.status = 'waived';
  }
  if (['waiting_source', 'unavailable_known_sources', 'uploading', 'ready'].includes(f.state)) {
    if ((f.expiresAt && now >= f.expiresAt) || now >= f.openedAt + l.waitingMs) close(f, 'expired', now);
    else if (Object.keys(f.targets).length && !pending(f).length) {
      close(f, Object.values(f.targets).some(t => t.status === 'acked') ? 'complete' : 'cancelled', now);
    } else if (f.state === 'uploading' && (!current(f) || current(f).leaseUntil <= now || !sends(account, current(f).source) || f.holders[current(f).source] !== 'present')) {
      f.current = null; f.state = 'waiting_source';
    }
  }
  if (['waiting_source', 'unavailable_known_sources'].includes(f.state)) {
    f.state = availability(account, f) === 'no_known_source' ? 'unavailable_known_sources' : 'waiting_source';
  }
  calculate(f, now, l);
}
export function calculate(f, now, l = DEFAULTS) {
  f.reservedBytes = f.attempts.reduce((n, a) => n + (a.settled ? 0 : 2 * a.size), 0);
  f.active = active(f);
  const due = [];
  if (['waiting_source', 'unavailable_known_sources', 'uploading', 'ready'].includes(f.state)) {
    due.push(f.expiresAt || f.openedAt + l.waitingMs);
    const c = current(f); if (c) due.push(c.leaseUntil);
    for (const a of f.attempts) {
      if (a.id !== f.current && !a.settled && !(a.id === f.winner && a.stageClean) && f.cleanupTries < l.maxCleanupAttempts) due.push(Math.max(quietAt(a, l), f.retryAt || 0));
    }
  }
  if (f.state === 'closing') due.push(f.retryAt ?? now);
  f.nextDue = due.length ? Math.max(now, Math.min(...due)) : null;
}
const FIELDS = {
  register: ['public_key', 'consent'], approve: ['device_id', 'public_key_hash'], revoke: ['device_id'], consent: ['consent'],
  offer: ['file_id'], request: ['file_id', 'request_id'], retry: ['file_id', 'request_id', 'reason'],
  'source-missing': ['file_id'], upload: ['file_id', 'transfer_id', 'cipher_size'],
  complete: ['file_id', 'transfer_id', 'attempt_id'], download: ['file_id', 'transfer_id'],
  ack: ['file_id', 'transfer_id', 'attempt_id', 'verified', 'stored'], cancel: ['file_id', 'transfer_id'],
  status: ['file_id'], events: ['cursor'], snapshot: ['after'], 'cleanup-retry': ['file_id'],
};
export const PUBLIC_OPS = new Set(Object.keys(FIELDS));
export function validate(op, b) {
  if (!PUBLIC_OPS.has(op)) fail('NOT_FOUND', 404);
  if (!b || typeof b !== 'object' || Array.isArray(b)) fail('BAD_REQUEST', 400);
  if (Object.keys(b).some(k => !FIELDS[op].includes(k))) fail('UNEXPECTED_FIELD', 400);
  if (FIELDS[op].includes('file_id') && !fileOK(b.file_id)) fail('BAD_FILE_ID', 400);
  if (FIELDS[op].includes('transfer_id') && !uuidOK(b.transfer_id)) fail('BAD_TRANSFER_ID', 400);
  if (FIELDS[op].includes('request_id') && !uuidOK(b.request_id)) fail('BAD_REQUEST_ID', 400);
  if (FIELDS[op].includes('attempt_id') && !uuidOK(b.attempt_id)) fail('BAD_ATTEMPT_ID', 400);
  if (FIELDS[op].includes('device_id') && !uuidOK(b.device_id)) fail('BAD_DEVICE_ID', 400);
  if (op === 'events' && !/^(0|[1-9][0-9]{0,15})$/.test(b.cursor || '0')) fail('BAD_CURSOR', 400);
  if (op === 'snapshot' && b.after && !fileOK(b.after)) fail('BAD_CURSOR', 400);
}
// ctx: {account, file, reserved_bytes, active_count, file_count, now, revision}
// Verified actor/proof is supplied by worker.mjs, never from JSON user_id/device_id.
export function transition(ctx, op, b, actor, publicKeyHash, l = DEFAULTS, random = () => crypto.randomUUID()) {
  const base = copy(ctx); maintain(base.account, base.file, base.now, l);
  const s = copy(base); let effect = null, result = null, status = 200;
  try {
    const a = s.account, now = s.now;
    if (op === 'register') {
      const prior = device(a, actor);
      if (prior) {
        if (prior.publicKeyHash !== publicKeyHash || prior.status === 'revoked') fail('DEVICE_ID_CONFLICT');
        result = { device_id: actor, status: prior.status, public_key_hash: prior.publicKeyHash };
      } else {
        for (const [id, d] of Object.entries(a.devices)) {
          if (d.status === 'pending' && d.expiresAt <= now) delete a.devices[id];
        }
        if (Object.keys(a.devices).length >= l.maxDevices) fail('DEVICE_LIMIT', 429);
        if (Object.values(a.devices).some(d => d.publicKeyHash === publicKeyHash)) fail('KEY_ALREADY_REGISTERED');
        a.devices[actor] = { publicKey: b.public_key, publicKeyHash, status: 'pending', consent: consent(b.consent),
          registeredAt: now, expiresAt: now + 600_000 };
        result = { device_id: actor, status: 'pending', public_key_hash: publicKeyHash };
      }
    } else {
      if (!approved(a, actor)) fail('DEVICE_NOT_APPROVED', 403);
      if (op === 'approve') {
        const d = device(a, b.device_id);
        if (!d || d.publicKeyHash !== b.public_key_hash || d.status === 'revoked') fail('DEVICE_NOT_FOUND', 404);
        if (d.status === 'pending' && d.expiresAt <= now) fail('ENROLLMENT_EXPIRED', 410);
        d.status = 'approved'; d.approvedAt = now; a.everApproved = true;
        result = { device_id: b.device_id, status: 'approved' };
      } else if (op === 'revoke') {
        const d = device(a, b.device_id); if (!d) fail('DEVICE_NOT_FOUND', 404);
        d.status = 'revoked'; d.revokedAt = now;
        result = { device_id: b.device_id, status: 'revoked' };
      } else if (op === 'consent') {
        a.devices[actor].consent = consent(b.consent); a.devices[actor].consentAt = now;
        result = { consent: a.devices[actor].consent };
      } else if (op === 'events' || op === 'snapshot') {
        result = { query: op }; // SQL query happens after the nonce/rate/CAS gate.
      } else {
        if (!s.file && !['offer', 'request'].includes(op)) fail('NOT_FOUND', 404);
        if (!s.file) s.file = emptyFile(b.file_id, now);
        const f = s.file;
        if (['offer', 'source-missing', 'upload'].includes(op) && !sends(a, actor)) fail('SEND_CONSENT_REQUIRED', 403);
        if (['request', 'retry', 'download'].includes(op) && !receives(a, actor)) fail('RECEIVE_CONSENT_REQUIRED', 403);
        if (b.transfer_id && b.transfer_id !== f.transferId) fail('STALE_TRANSFER');
        if (op === 'offer') {
          f.holders[actor] = 'present';
        } else if (op === 'source-missing') {
          if (!(actor in f.holders)) fail('NOT_FOUND', 404);
          f.holders[actor] = 'missing';
        } else if (op === 'request' || op === 'retry') {
          if (f.requestIds[actor] === b.request_id) {
            result = view(f, actor, a);
          } else {
            if (op === 'retry' && !['missing', 'expired', 'user_retry'].includes(b.reason)) fail('RETRY_REASON_REQUIRED', 400);
            if (['closing', 'cleanup_failed'].includes(f.state)) fail('CLEANUP_PENDING');
            if (op === 'request' && f.requestIds[actor] && !['waiting_source', 'unavailable_known_sources', 'uploading', 'ready'].includes(f.state)) fail('RETRY_REQUIRED');
            if (!active(f)) newCycle(f, now, random, l);
            if (f.targets[actor]?.status === 'acked' && op !== 'retry') fail('RETRY_REQUIRED');
            f.requestIds[actor] = b.request_id;
            f.targets[actor] = { status: 'pending', grants: f.targets[actor]?.grants || 0 };
          }
        } else if (op === 'upload') {
          if (f.holders[actor] !== 'present') fail('SOURCE_NOT_REGISTERED', 403);
          if (!['waiting_source', 'uploading'].includes(f.state) || !pending(f).length) fail('NOT_UPLOADABLE');
          if (!Number.isSafeInteger(b.cipher_size) || b.cipher_size < 32 || b.cipher_size > l.maxFileBytes) fail('FILE_SIZE_LIMIT', 413);
          let u = current(f);
          if (u && u.leaseUntil > now) {
            if (u.source !== actor || now >= u.grantUntil || b.cipher_size !== u.size) fail('UPLOAD_LEASE_BUSY');
          } else {
            if (f.attempts.length >= l.maxAttempts) fail('UPLOAD_RETRY_LIMIT', 429);
            if (!f.expiresAt) f.expiresAt = now + l.ttlMs;
            const id = random();
            u = { id, source: actor, size: b.cipher_size, stage: `relay/${f.transferId}/${id}/stage`,
              ready: `relay/${f.transferId}/${id}/ready`, grantAt: now,
              grantUntil: Math.min(now + l.grantMs, f.expiresAt), leaseUntil: Math.min(now + l.leaseMs, f.expiresAt), copyUntil: 0 };
            f.attempts.push(u); f.current = id; f.state = 'uploading';
          }
          effect = { type: 'upload', attempt: copy(u), expiresAt: f.expiresAt };
        } else if (op === 'complete') {
          const w = winner(f);
          if (w?.id === b.attempt_id && f.state === 'ready') {
            if (w.source !== actor) fail('NOT_FOUND', 404);
          } else {
            const u = current(f);
            if (f.state !== 'uploading' || !u || u.id !== b.attempt_id || u.source !== actor || !sends(a, actor)) fail('STALE_UPLOAD');
            if (u.copyUntil > now) { result = { code: 'FINALIZING' }; status = 202; }
            else { u.copyUntil = now + l.copyMs; effect = { type: 'complete', attempt: copy(u), transferId: f.transferId }; }
          }
        } else if (op === 'download') {
          if (f.state !== 'ready') fail(f.outcome === 'expired' ? 'TRANSFER_EXPIRED' : 'NOT_READY', f.outcome === 'expired' ? 410 : 409);
          const t = f.targets[actor]; if (!t) fail('NOT_FOUND', 404);
          if (t.status !== 'pending') fail('ALREADY_STORED');
          if (t.grants >= l.maxDownloadGrants) fail('DOWNLOAD_GRANT_LIMIT', 429);
          t.grants++; const w = winner(f);
          effect = { type: 'download', attempt: copy(w), grantAt: now, grantUntil: Math.min(now + l.grantMs, f.expiresAt) };
        } else if (op === 'ack') {
          const t = f.targets[actor], w = winner(f);
          if (!t || !w || w.id !== b.attempt_id) fail('NOT_FOUND', 404);
          if (b.verified !== true || b.stored !== true) fail('DURABLE_ACK_REQUIRED', 400);
          if (t.status === 'waived') fail('RECIPIENT_REMOVED', 403);
          if (!receives(a, actor)) fail('RECEIVE_CONSENT_REQUIRED', 403);
          t.status = 'acked'; t.ackedAt ||= now; f.holders[actor] = 'present';
        } else if (op === 'cancel') {
          const t = f.targets[actor]; if (!t) fail('NOT_FOUND', 404);
          if (t.status !== 'acked') t.status = 'waived';
        } else if (op === 'cleanup-retry') {
          if (!(actor in f.holders) && !(actor in f.targets)) fail('NOT_FOUND', 404);
          if (f.state !== 'cleanup_failed') fail('NOT_CLEANUP_FAILED');
          f.state = 'closing'; f.cleanupTries = 0; f.retryAt = now;
        } else if (op === 'status') {
          if (!(actor in f.holders) && !(actor in f.targets)) fail('NOT_FOUND', 404);
        }
        maintain(a, f, now, l); calculate(f, now, l);
        const bytes = Number(ctx.reserved_bytes || 0) - Number(ctx.file?.reservedBytes || 0) + f.reservedBytes;
        const count = Number(ctx.active_count || 0) - Number(!!ctx.file?.active) + Number(f.active);
        if (bytes > l.maxReservedBytes || count > l.maxActive) fail('ACCOUNT_CAPACITY', 429);
        if (!ctx.file && Number(ctx.file_count || 0) >= l.maxFiles) fail('FILE_RECORD_LIMIT', 429);
        result ||= view(f, actor, a);
      }
    }
    const notify = !['events', 'snapshot', 'status', 'download', 'complete'].includes(op);
    return { ...s, result, status, effect, notify };
  } catch (error) {
    if (!(error instanceof RelayError)) throw error;
    return { ...base, result: { error: error.code }, status: error.status, effect: null,
      notify: JSON.stringify(base.file) !== JSON.stringify(ctx.file) };
  }
}
export function finish(ctx, transferId, attemptId, ok, etag, l = DEFAULTS) {
  const s = copy(ctx), f = s.file; maintain(s.account, f, s.now, l);
  if (!f || f.transferId !== transferId) return { ...s, notify: false };
  const u = current(f);
  if (f.state === 'uploading' && u?.id === attemptId && sends(s.account, u.source) && f.holders[u.source] === 'present') {
    if (ok) { u.verified = true; u.etag = etag; f.state = 'ready'; f.winner = u.id; f.current = null; }
    else { u.leaseUntil = s.now; f.current = null; f.state = 'waiting_source'; }
  }
  maintain(s.account, f, s.now, l); return { ...s, notify: true };
}
export function cleanupKeys(ctx, l = DEFAULTS) {
  const f = ctx.file; if (!f) return [];
  const closing = ['closing', 'cleanup_failed'].includes(f.state);
  if (f.state === 'cleanup_failed' || f.retryAt > ctx.now || (!closing && f.cleanupTries >= l.maxCleanupAttempts)) return [];
  const keys = [];
  for (const u of f.attempts) {
    if (u.settled || u.id === f.current) continue;
    if (closing || ctx.now >= quietAt(u, l)) {
      if (!u.stageClean || closing) keys.push(u.stage);
      if (closing || u.id !== f.winner) keys.push(u.ready);
    }
  }
  return [...new Set(keys)];
}
export function cleaned(ctx, keys, succeeded, l = DEFAULTS) {
  const s = copy(ctx), f = s.file; if (!f) return { ...s, notify: false };
  maintain(s.account, f, s.now, l);
  const closing = f.state === 'closing';
  if (!succeeded) {
    f.cleanupTries++;
    if (closing && f.cleanupTries >= l.maxCleanupAttempts) { f.state = 'cleanup_failed'; f.retryAt = null; }
    else f.retryAt = s.now + Math.min(3600_000, 30_000 * 2 ** Math.min(f.cleanupTries, 8));
  } else {
    f.cleanupTries = 0; f.retryAt = null;
    for (const u of f.attempts) {
      if (keys.includes(u.stage) && s.now >= quietAt(u, l)) u.stageClean = true;
      if (keys.includes(u.stage) && keys.includes(u.ready) && s.now >= quietAt(u, l)) u.settled = true;
    }
    if (closing) {
      if (f.attempts.every(u => u.settled)) { f.state = 'deleted'; f.retryAt = null; }
      else f.retryAt = Math.max(s.now + 1000, ...f.attempts.filter(u => !u.settled).map(u => quietAt(u, l)));
    }
  }
  calculate(f, s.now, l); return { ...s, notify: true };
}
