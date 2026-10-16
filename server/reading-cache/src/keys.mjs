/* Public URL shape shared by the Worker and the client hash. DNS pinning stays
   in the Supabase relay; this Worker rejects non-public URL shapes and every
   redirect hop before it fetches. */
export function ipFamily(host) {
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    const parts = host.split(".").map(Number);
    return parts.every((part) => part <= 255) ? 4 : 0;
  }
  if (host.includes(":") && /^[0-9a-f:]+$/i.test(host)) return 6;
  return 0;
}

export function publicAddress(address) {
  if (ipFamily(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113));
  }
  if (ipFamily(address) === 6) {
    const first = parseInt(address.split(":")[0], 16);
    if (!(first >= 0x2000 && first <= 0x3fff)) return false;
    const lower = address.toLowerCase();
    if (/^2001:(?:0*:|0*db8:|0*2:|0*1[0-9a-f]:|0*2[0-9a-f]:)/.test(lower) || /^2002:|^3fff:/.test(lower)) return false;
    return true;
  }
  return false;
}

export function canonicalUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("bad_url");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.href.length > 4096 ||
    (url.port && url.port !== (url.protocol === "https:" ? "443" : "80")) || !host ||
    host === "localhost" || /\.(?:local|internal|localhost|test|invalid)$/.test(host) ||
    (!ipFamily(host) && !host.includes(".")) || (ipFamily(host) && !publicAddress(host))) {
    throw new Error("bad_url");
  }
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^utm_|^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
  }
  return url.href;
}

export async function sha256Hex(text) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const PREVIEW_MATERIAL_PREFIX = "article-preview-v5\n";

export function previewMaterial(url, title, excerpt) {
  return PREVIEW_MATERIAL_PREFIX + url + "\n" + title + "\n" + excerpt;
}
