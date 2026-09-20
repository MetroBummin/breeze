import { fail, uuidOK } from './core.mjs';
const utf8 = value => new TextEncoder().encode(value);
export const hex = bytes => [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, '0')).join('');
export const sha256 = async value => hex(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? utf8(value) : value));
export const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function unb64(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) fail('BAD_PROOF', 401);
  try { return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)), c => c.charCodeAt(0)); }
  catch { fail('BAD_PROOF', 401); }
}
export async function publicKey(jwk) {
  if (!jwk || Object.keys(jwk).sort().join(',') !== 'crv,kty,x,y' || jwk.kty !== 'EC' || jwk.crv !== 'P-256' ||
      !/^[A-Za-z0-9_-]{43}$/.test(jwk.x) || !/^[A-Za-z0-9_-]{43}$/.test(jwk.y)) fail('BAD_PUBLIC_KEY', 400);
  try { return await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']); }
  catch { fail('BAD_PUBLIC_KEY', 400); }
}
export const keyHash = jwk => sha256(JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }));
export async function proofMessage(request, text, token) {
  const u = new URL(request.url);
  return ['breeze-relay-v1', request.method, u.origin, u.pathname + u.search,
    await sha256(text), request.headers.get('x-relay-device'), request.headers.get('x-relay-time'),
    request.headers.get('x-relay-nonce'), await sha256(token)].join('\n');
}
export async function verifyProof(request, text, token, jwk, now) {
  const id = request.headers.get('x-relay-device'), nonce = request.headers.get('x-relay-nonce');
  const timestamp = request.headers.get('x-relay-time');
  if (!uuidOK(id) || !uuidOK(nonce) || !/^[0-9]{13}$/.test(timestamp || '') || Math.abs(now - Number(timestamp)) > 60_000) fail('STALE_OR_INVALID_PROOF', 401);
  const signature = unb64(request.headers.get('x-relay-signature'));
  if (signature.length !== 64) fail('BAD_PROOF', 401); // WebCrypto IEEE-P1363 r||s, not ASN.1 DER.
  const key = await publicKey(jwk);
  if (!await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature,
    utf8(await proofMessage(request, text, token)))) fail('BAD_PROOF', 401);
  return { device: id, nonce };
}
export async function smallText(request, limit = 8192) {
  if (Number(request.headers.get('content-length') || 0) > limit) fail('REQUEST_TOO_LARGE', 413);
  const reader = request.body?.getReader(); if (!reader) return '';
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > limit) { await reader.cancel(); fail('REQUEST_TOO_LARGE', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const out = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder('utf-8', { fatal: true }).decode(out);
}
