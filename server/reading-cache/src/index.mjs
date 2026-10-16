/* Public reading cache. Cron fills the thirteen built-in feeds. Article and
   image reads fill one object on a miss. Preview writes require the operator
   token. Clients never receive that token. */
import { BUILTIN_FEEDS } from "./feeds.mjs";
import { canonicalUrl, sha256Hex } from "./keys.mjs";

const MAX_DOCUMENT = 3_000_000;
const MAX_IMAGE = 2_000_000;
const MAX_PREVIEW = 4096;
const CACHE_FEED = "public, max-age=600";
const CACHE_OBJECT = "public, max-age=86400";
const CACHE_PREVIEW = "public, max-age=2592000";
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

function cors(headers = {}) {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, PUT, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-expose-headers": "x-reading-url",
    ...headers,
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: cors({ "content-type": "application/json", "cache-control": "no-store" }),
  });
}

async function readLimited(response, limit) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) throw new Error("too_big");
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new Error("too_big");
      }
      chunks.push(value);
    }
  } finally {
    try { reader.releaseLock(); } catch { /* already released */ }
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function tokenMatches(secret, authorization) {
  const given = String(authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!secret || !given || secret.length > 256 || given.length > 256) return false;
  const digest = (value) => crypto.subtle.digest("SHA-256", new TextEncoder().encode("reading-cache\n" + value));
  const [leftBytes, rightBytes] = await Promise.all([digest(secret), digest(given)]);
  const left = new Uint8Array(leftBytes);
  const right = new Uint8Array(rightBytes);
  let mismatch = 0;
  for (let index = 0; index < left.length; index++) mismatch |= left[index] ^ right[index];
  return mismatch === 0;
}

export async function fetchPublic(raw, { kind, fetchImpl = fetch }) {
  let current = canonicalUrl(raw);
  for (let hop = 0; hop < 4; hop++) {
    const response = await fetchImpl(current, {
      redirect: "manual",
      credentials: "omit",
      signal: AbortSignal.timeout(12_000),
      headers: {
        "user-agent": USER_AGENT,
        accept: kind === "image"
          ? "image/*"
          : "text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,application/xml",
        "accept-language": "en-US,en;q=0.9",
        ...(kind === "image" ? { referer: new URL(current).origin + "/" } : {}),
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw new Error("bad_url");
      current = canonicalUrl(new URL(location, current).href);
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      await response.body?.cancel();
      throw new Error("upstream");
    }
    const type = (response.headers.get("content-type") || "").toLowerCase();
    if (kind === "image") {
      if (!type.startsWith("image/") || type.includes("svg")) {
        await response.body?.cancel();
        throw new Error("not_image");
      }
    } else if (!/html|xml/.test(type)) {
      await response.body?.cancel();
      throw new Error("not_html");
    }
    const bytes = await readLimited(response, kind === "image" ? MAX_IMAGE : MAX_DOCUMENT);
    return { bytes, contentType: (type.split(";")[0] || "application/octet-stream").trim(), url: current };
  }
  throw new Error("bad_url");
}

function objectResponse(object, cacheControl, fallbackType) {
  const headers = cors({
    "content-type": object.httpMetadata?.contentType || fallbackType,
    "cache-control": cacheControl,
  });
  const finalUrl = object.customMetadata?.url;
  if (finalUrl && !/[\r\n]/.test(finalUrl)) headers["x-reading-url"] = finalUrl;
  return new Response(object.body, { headers });
}

async function stored(bucket, key) {
  if (!bucket) return null;
  return bucket.get(key);
}

export async function refreshFeeds(env, fetchImpl = fetch) {
  const bucket = env.READING;
  const results = [];
  for (const [id, feedUrl] of BUILTIN_FEEDS.entries()) {
    try {
      const fetched = await fetchPublic(feedUrl, { kind: "document", fetchImpl });
      const fetchedAt = new Date().toISOString();
      await bucket.put(`feeds/v1/${id}.xml`, fetched.bytes, {
        httpMetadata: { contentType: fetched.contentType || "application/xml", cacheControl: CACHE_FEED },
        customMetadata: { url: fetched.url.slice(0, 1024) },
      });
      await bucket.put(`feeds/v1/${id}.json`, JSON.stringify({ fetchedAt, url: fetched.url }), {
        httpMetadata: { contentType: "application/json", cacheControl: CACHE_FEED },
      });
      results.push({ id, ok: true });
    } catch (error) {
      console.error("reading_cache_feed", id, error instanceof Error ? error.name : "error");
      results.push({ id, ok: false });
    }
  }
  return results;
}

function validPreview(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const keys = Object.keys(value).filter((key) => key !== "promptVersion");
  if (keys.length !== 1 || keys[0] !== "summaryKo") return null;
  if (value.promptVersion !== undefined && value.promptVersion !== 5) return null;
  const summaryKo = typeof value.summaryKo === "string" ? value.summaryKo.trim() : "";
  if (summaryKo.length < 40 || summaryKo.length > 600 || !/[가-힣]/.test(summaryKo)) return null;
  return { summaryKo, promptVersion: 5 };
}

async function fillMiss(bucket, key, stampKey, url, kind, fetchImpl) {
  const canonical = canonicalUrl(url);
  const fetched = await fetchPublic(canonical, { kind, fetchImpl });
  const fetchedAt = new Date().toISOString();
  await bucket.put(key, fetched.bytes, {
    httpMetadata: { contentType: fetched.contentType, cacheControl: CACHE_OBJECT },
    customMetadata: { url: fetched.url.slice(0, 1024) },
  });
  if (stampKey) {
    await bucket.put(stampKey, JSON.stringify({ fetchedAt, url: fetched.url, status: 200 }), {
      httpMetadata: { contentType: "application/json", cacheControl: CACHE_OBJECT },
    });
  }
  return bucket.get(key);
}

export async function handle(request, env, fetchImpl = fetch) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  const bucket = env?.READING;
  if (!bucket) return json({ error: "unconfigured" }, 503);
  const url = new URL(request.url);
  const feed = url.pathname.match(/^\/feeds\/v1\/(\d+)\.(xml|json)$/);
  if (feed && request.method === "GET") {
    const id = Number(feed[1]);
    if (!BUILTIN_FEEDS[id]) return json({ error: "missing" }, 404);
    const object = await stored(bucket, `feeds/v1/${id}.${feed[2]}`);
    if (!object) return json({ error: "missing" }, 404);
    return objectResponse(object, CACHE_FEED, feed[2] === "json" ? "application/json" : "application/xml");
  }
  if (url.pathname === "/feeds/refresh" && request.method === "POST") {
    if (!env.PREVIEW_WRITE_TOKEN) return json({ error: "unconfigured" }, 503);
    if (!await tokenMatches(env.PREVIEW_WRITE_TOKEN, request.headers.get("authorization"))) return json({ error: "unauthorized" }, 401);
    return json({ ok: true, feeds: await refreshFeeds(env, fetchImpl) });
  }
  const article = url.pathname.match(/^\/articles\/v1\/([0-9a-f]{64})\.html$/);
  const image = url.pathname.match(/^\/images\/v1\/([0-9a-f]{64})$/);
  if ((article || image) && request.method === "GET") {
    const hash = (article || image)[1];
    const key = article ? `articles/v1/${hash}.html` : `images/v1/${hash}`;
    const source = url.searchParams.get("url");
    if (source) {
      try {
        if (await sha256Hex(canonicalUrl(source)) !== hash) return json({ error: "bad_url" }, 400);
      } catch {
        return json({ error: "bad_url" }, 400);
      }
    }
    let object = await stored(bucket, key);
    if (!object) {
      if (!source) return json({ error: "missing" }, 404);
      try {
        object = await fillMiss(bucket, key, article ? `articles/v1/${hash}.json` : "", source, article ? "document" : "image", fetchImpl);
      } catch (error) {
        const name = error instanceof Error ? error.message : "upstream";
        const status = name === "bad_url" ? 400 : name === "too_big" ? 413 : name === "not_image" || name === "not_html" ? 415 : 502;
        return json({ error: name }, status);
      }
    }
    return objectResponse(object, CACHE_OBJECT, article ? "text/html; charset=utf-8" : "application/octet-stream");
  }
  const preview = url.pathname.match(/^\/previews\/v5\/([0-9a-f]{64})\.json$/);
  if (preview && request.method === "GET") {
    const object = await stored(bucket, `previews/v5/${preview[1]}.json`);
    if (!object) return json({ error: "missing" }, 404);
    return objectResponse(object, CACHE_PREVIEW, "application/json");
  }
  if (preview && request.method === "PUT") {
    if (!env.PREVIEW_WRITE_TOKEN) return json({ error: "unconfigured" }, 503);
    if (!await tokenMatches(env.PREVIEW_WRITE_TOKEN, request.headers.get("authorization"))) return json({ error: "unauthorized" }, 401);
    let parsed;
    try {
      parsed = validPreview(JSON.parse(new TextDecoder().decode(await readLimited(request, MAX_PREVIEW))));
    } catch {
      return json({ error: "invalid" }, 400);
    }
    if (!parsed) return json({ error: "invalid" }, 400);
    await bucket.put(`previews/v5/${preview[1]}.json`, JSON.stringify(parsed), {
      httpMetadata: { contentType: "application/json", cacheControl: CACHE_PREVIEW },
    });
    return json({ ok: true });
  }
  if (!["GET", "PUT", "POST"].includes(request.method)) return json({ error: "method" }, 405);
  return json({ error: "missing" }, 404);
}

export default {
  async fetch(request, env) {
    return handle(request, env);
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(refreshFeeds(env));
  },
};
