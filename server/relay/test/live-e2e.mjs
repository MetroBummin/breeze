// Operator-run development smoke test. It never reads or prints credentials.
// Usage: RELAY_E2E_JWT_FILE=/tmp/breeze-relay-e2e.jwt node test/live-e2e.mjs register
// The state file contains ephemeral P-256 private keys and must stay mode 0600.
import { readFile, writeFile, chmod } from 'node:fs/promises';
import { randomUUID, randomBytes } from 'node:crypto';
import { b64url, keyHash, proofMessage } from '../security.mjs';

const origin = 'https://breeze-book-relay-dev.iamthefreeman.workers.dev';
const jwtFile = process.env.RELAY_E2E_JWT_FILE || '/tmp/breeze-relay-e2e.jwt';
const stateFile = process.env.RELAY_E2E_STATE_FILE || '/tmp/breeze-relay-e2e-state.json';
const token = (await readFile(jwtFile, 'utf8')).trim();
if (!/^[A-Za-z0-9_.-]+$/.test(token)) throw new Error('RELAY_E2E_JWT_FILE is not a JWT');
const [_, claims] = token.split('.');
const userId = JSON.parse(Buffer.from(claims.replace(/-/g, '+').replace(/_/g, '/'), 'base64url').toString('utf8')).sub;
if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error('JWT has no UUID sub');
const load = async () => JSON.parse(await readFile(stateFile, 'utf8'));
async function save(value) { await writeFile(stateFile, JSON.stringify(value), { mode: 0o600 }); await chmod(stateFile, 0o600); }
async function device() {
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const raw = await crypto.subtle.exportKey('jwk', keys.publicKey);
  return { id: randomUUID(), publicKey: { kty: raw.kty, crv: raw.crv, x: raw.x, y: raw.y }, privateKey: await crypto.subtle.exportKey('jwk', keys.privateKey) };
}
async function signedCall(state, actor, op, body) {
  const text = JSON.stringify(body), key = await crypto.subtle.importKey('jwk', actor.privateKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const request = new Request(`${origin}/v1/${op}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`,
    'x-relay-device': actor.id, 'x-relay-time': String(Date.now()), 'x-relay-nonce': randomUUID() }, body: text });
  request.headers.set('x-relay-signature', b64url(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key,
    new TextEncoder().encode(await proofMessage(request, text, token)))));
  const response = await fetch(request), json = await response.json();
  return { status: response.status, json };
}
function required(result, label) { if (result.status !== 200) throw new Error(`${label}: HTTP ${result.status} ${result.json.error || ''}`); return result.json; }
const phase = process.argv[2] || 'register';
if (phase === 'register') {
  const source = await device(), result = await signedCall(null, source, 'register', { public_key: source.publicKey, consent: { policy: 1, send: true, receive: true } });
  const reply = required(result, 'register');
  const state = { userId, source, devices: [], fileId: b64url(randomBytes(24)), bytes: Buffer.from(randomBytes(96)).toString('base64') };
  await save(state);
  console.log(JSON.stringify({ user_id: userId, device_id: reply.device_id, public_key_hash: reply.public_key_hash, status: reply.status }));
  process.exit(0);
}
const state = await load();
if (state.userId !== userId) throw new Error('JWT user does not match existing E2E state');
if (phase === 'probe') {
  const result = await signedCall(state, state.source, 'status', { file_id: state.fileId });
  console.log(JSON.stringify({ source_approved: result.status !== 403, status: result.status, error: result.json.error || null }));
  process.exit(0);
}
if (phase === 'register-receivers') {
  for (let i = 0; i < 2; i++) {
    const next = await device(), reply = required(await signedCall(state, next, 'register', { public_key: next.publicKey, consent: { policy: 1, send: true, receive: true } }), 'register receiver');
    required(await signedCall(state, state.source, 'approve', { device_id: next.id, public_key_hash: await keyHash(next.publicKey) }), 'approve receiver');
    state.devices.push(next);
    console.log(JSON.stringify({ receiver: i + 1, device_id: reply.device_id, status: reply.status }));
  }
  await save(state); process.exit(0);
}
if (phase === 'pending-denied') {
  const pending = await device();
  const registered = required(await signedCall(state, pending, 'register', { public_key: pending.publicKey,
    consent: { policy: 1, send: true, receive: true } }), 'register pending guard');
  const denied = await signedCall(state, pending, 'status', { file_id: state.fileId });
  if (denied.status !== 403 || denied.json.error !== 'DEVICE_NOT_APPROVED') {
    throw new Error(`pending guard: expected DEVICE_NOT_APPROVED, got HTTP ${denied.status} ${denied.json.error || ''}`);
  }
  required(await signedCall(state, state.source, 'revoke', { device_id: pending.id }), 'revoke pending guard');
  console.log(JSON.stringify({ pending_device_denied: 'PASS', device_id: registered.device_id }));
  process.exit(0);
}
if (phase === 'expiry-issue') {
  if (!state.devices.length) throw new Error('run register-receivers first');
  const receiver = state.devices[0], fileId = b64url(randomBytes(24)), bytes = randomBytes(64);
  required(await signedCall(state, state.source, 'offer', { file_id: fileId }), 'expiry offer');
  const transfer = required(await signedCall(state, receiver, 'request', { file_id: fileId, request_id: randomUUID() }), 'expiry request');
  const upload = required(await signedCall(state, state.source, 'upload', { file_id: fileId,
    transfer_id: transfer.transfer_id, cipher_size: bytes.length }), 'expiry upload grant');
  const put = await fetch(upload.upload.url, { method: 'PUT', headers: upload.upload.headers, body: bytes });
  if (!put.ok) throw new Error(`expiry R2 PUT: HTTP ${put.status}`);
  required(await signedCall(state, state.source, 'complete', { file_id: fileId,
    transfer_id: transfer.transfer_id, attempt_id: upload.attempt_id }), 'expiry complete');
  const download = required(await signedCall(state, receiver, 'download', { file_id: fileId,
    transfer_id: transfer.transfer_id }), 'expiry download grant');
  state.expiry = { fileId, transferId: transfer.transfer_id, attemptId: upload.attempt_id,
    url: download.download.url, headers: download.download.headers, expiresAt: download.download.expires_at };
  await save(state);
  console.log(JSON.stringify({ expiry_grant_issued: true, expires_at: state.expiry.expiresAt }));
  process.exit(0);
}
if (phase === 'expiry-check') {
  if (!state.expiry) throw new Error('run expiry-issue first');
  if (Date.now() <= state.expiry.expiresAt + 1000) throw new Error('expiry grant has not expired yet');
  const expired = await fetch(state.expiry.url, { headers: state.expiry.headers });
  if (expired.ok) throw new Error(`expired R2 GET unexpectedly succeeded: HTTP ${expired.status}`);
  const receiver = state.devices[0];
  required(await signedCall(state, receiver, 'ack', { file_id: state.expiry.fileId,
    transfer_id: state.expiry.transferId, attempt_id: state.expiry.attemptId, verified: true, stored: true }), 'expiry cleanup ack');
  console.log(JSON.stringify({ expired_url_denied: 'PASS', status: expired.status }));
  delete state.expiry; await save(state);
  process.exit(0);
}
if (phase === 'smoke') {
  if (state.devices.length !== 2) throw new Error('run register-receivers first');
  const [one, two] = state.devices, bytes = Buffer.from(state.bytes, 'base64');
  required(await signedCall(state, state.source, 'offer', { file_id: state.fileId }), 'offer');
  const first = required(await signedCall(state, one, 'request', { file_id: state.fileId, request_id: randomUUID() }), 'request one');
  const second = required(await signedCall(state, two, 'request', { file_id: state.fileId, request_id: randomUUID() }), 'request two');
  if (first.transfer_id !== second.transfer_id) throw new Error('receivers did not join one transfer');
  const upload = required(await signedCall(state, state.source, 'upload', { file_id: state.fileId, transfer_id: first.transfer_id, cipher_size: bytes.length }), 'upload grant');
  const put = await fetch(upload.upload.url, { method: 'PUT', headers: upload.upload.headers, body: bytes });
  if (!put.ok) throw new Error(`R2 PUT: HTTP ${put.status}`);
  required(await signedCall(state, state.source, 'complete', { file_id: state.fileId, transfer_id: first.transfer_id, attempt_id: upload.attempt_id }), 'complete');
  const download = required(await signedCall(state, one, 'download', { file_id: state.fileId, transfer_id: first.transfer_id }), 'download grant');
  const get = await fetch(download.download.url, { headers: download.download.headers });
  if (!get.ok || !Buffer.from(await get.arrayBuffer()).equals(bytes)) throw new Error(`R2 GET/bytes: HTTP ${get.status}`);
  required(await signedCall(state, one, 'ack', { file_id: state.fileId, transfer_id: first.transfer_id, attempt_id: upload.attempt_id, verified: true, stored: true }), 'first ack');
  const retained = required(await signedCall(state, two, 'download', { file_id: state.fileId, transfer_id: first.transfer_id }), 'retained after first ack');
  if (!retained.download?.url) throw new Error('object was not retained after first ACK');
  required(await signedCall(state, two, 'ack', { file_id: state.fileId, transfer_id: first.transfer_id, attempt_id: upload.attempt_id, verified: true, stored: true }), 'second ack');
  const absent = await fetch(retained.download.url, { headers: retained.download.headers });
  if (absent.status !== 404) throw new Error(`object cleanup: expected 404, got ${absent.status}`);
  console.log(JSON.stringify({ smoke: 'PASS', file_id: state.fileId, transfer_id: first.transfer_id, byte_count: bytes.length }));
  process.exit(0);
}
throw new Error(`unknown phase: ${phase}`);
