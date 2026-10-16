/* Worker behavior with an in-memory bucket. No Cloudflare account or network. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, Script } from "node:vm";
import { BUILTIN_FEEDS } from "../server/reading-cache/src/feeds.mjs";
import { canonicalUrl, sha256Hex } from "../server/reading-cache/src/keys.mjs";
import { handle, refreshFeeds } from "../server/reading-cache/src/index.mjs";

function bucket() {
  const objects = new Map();
  return {
    objects,
    async get(key) {
      const hit = objects.get(key);
      return hit ? { body: hit.body, httpMetadata: hit.httpMetadata, customMetadata: hit.customMetadata } : null;
    },
    async put(key, value, options = {}) {
      const body = value instanceof Uint8Array ? value : new TextEncoder().encode(String(value));
      objects.set(key, { body, httpMetadata: options.httpMetadata || {}, customMetadata: options.customMetadata || {} });
    },
  };
}

function env(extra = {}) {
  return { READING: bucket(), PREVIEW_WRITE_TOKEN: "writer-token", ...extra };
}

test("built-in feed ids match the client list", () => {
  const article = readFileSync(new URL("../scripts/importers/article.js", import.meta.url), "utf8");
  const rss = readFileSync(new URL("../scripts/importers/rss.js", import.meta.url), "utf8");
  const context = createContext({ URL, window: { BREEZE_CONFIG: {} } });
  new Script(article + "\n" + rss).runInContext(context);
  assert.equal(JSON.stringify(BUILTIN_FEEDS), JSON.stringify(new Script("RSS_FEEDS.map(feed => feed.url)").runInContext(context)));
});

test("cron writes feed bytes and a failed feed keeps the previous object", async () => {
  const store = env();
  let calls = 0;
  const fetchImpl = async (url) => {
    calls++;
    if (String(url).includes("nasa.gov")) return new Response("no", { status: 503 });
    return new Response("<rss>one</rss>", { status: 200, headers: { "content-type": "application/rss+xml" } });
  };
  const first = await refreshFeeds(store, fetchImpl);
  assert.equal(first.filter((row) => row.ok).length, 12);
  assert.equal(store.READING.objects.has("feeds/v1/5.xml"), false);
  assert.equal(new TextDecoder().decode(store.READING.objects.get("feeds/v1/0.xml").body), "<rss>one</rss>");
  const again = await refreshFeeds(store, async () => new Response("no", { status: 503 }));
  assert.equal(again.every((row) => !row.ok), true);
  assert.equal(new TextDecoder().decode(store.READING.objects.get("feeds/v1/0.xml").body), "<rss>one</rss>");
  assert.equal(calls, 13);
});

test("article and image misses store one object and do not refetch", async () => {
  const store = env();
  const page = "https://stories.example/one?utm_source=home#part";
  const canonical = canonicalUrl(page);
  const hash = await sha256Hex(canonical);
  let fetches = 0;
  const fetchImpl = async (url, options) => {
    fetches++;
    assert.equal(options.credentials, "omit");
    assert.equal(String(url), canonical);
    return new Response("<article>body</article>", { status: 200, headers: { "content-type": "text/html" } });
  };
  const first = await handle(new Request(`https://cache.test/articles/v1/${hash}.html?url=${encodeURIComponent(page)}`), store, fetchImpl);
  assert.equal(first.status, 200);
  assert.equal(await first.text(), "<article>body</article>");
  assert.equal(first.headers.get("cache-control"), "public, max-age=86400");
  assert.equal(first.headers.get("access-control-allow-origin"), "*");
  const second = await handle(new Request(`https://cache.test/articles/v1/${hash}.html`), store, fetchImpl);
  assert.equal(second.status, 200);
  assert.equal(fetches, 1);
  assert.equal(store.READING.objects.has(`articles/v1/${hash}.json`), true);

  const image = "https://images.example/cover.png";
  const imageHash = await sha256Hex(canonicalUrl(image));
  const imageFetch = async () => new Response(Uint8Array.from([1, 2, 3]), { status: 200, headers: { "content-type": "image/png" } });
  const picture = await handle(new Request(`https://cache.test/images/v1/${imageHash}?url=${encodeURIComponent(image)}`), store, imageFetch);
  assert.equal(picture.headers.get("content-type"), "image/png");
  const svgUrl = "https://images.example/other.svg";
  const svgHash = await sha256Hex(canonicalUrl(svgUrl));
  const svg = await handle(new Request(`https://cache.test/images/v1/${svgHash}?url=${encodeURIComponent(svgUrl)}`), env(), async () => new Response("<svg></svg>", { status: 200, headers: { "content-type": "image/svg+xml" } }));
  assert.equal(svg.status, 415);
});

test("private redirects and hash mismatches are not stored", async () => {
  const store = env();
  const target = "https://stories.example/secret";
  const hash = await sha256Hex(canonicalUrl(target));
  const redirected = await handle(new Request(`https://cache.test/articles/v1/${hash}.html?url=${encodeURIComponent(target)}`), store, async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } }));
  assert.equal(redirected.status, 400);
  assert.equal(store.READING.objects.size, 0);
  const mismatch = await handle(new Request(`https://cache.test/articles/v1/${"0".repeat(64)}.html?url=${encodeURIComponent(target)}`), store, async () => {
    throw new Error("should not fetch");
  });
  assert.equal(mismatch.status, 400);
});

test("preview writes require the operator token", async () => {
  const store = env();
  const key = "ab".repeat(32);
  const body = JSON.stringify({ summaryKo: "피드 요약만으로도 이 글의 긴장과 배경을 먼저 보여 줍니다. 본문이 늦어도 읽을 이유는 남습니다.", promptVersion: 5 });
  const put = (token, reading = store) => handle(new Request(`https://cache.test/previews/v5/${key}.json`, {
    method: "PUT",
    headers: token ? { authorization: "Bearer " + token, "content-type": "application/json" } : { "content-type": "application/json" },
    body,
  }), reading);
  assert.equal((await put("", env({ PREVIEW_WRITE_TOKEN: "" }))).status, 503);
  assert.equal((await put("nope")).status, 401);
  assert.equal((await put("writer-token")).status, 200);
  const read = await handle(new Request(`https://cache.test/previews/v5/${key}.json`), store);
  assert.equal(read.headers.get("cache-control"), "public, max-age=2592000");
  assert.equal(JSON.parse(await read.text()).summaryKo.includes("긴장"), true);
  const extra = await put("writer-token");
  assert.equal(extra.status, 200);
});

test("wrangler config names the account, public bucket, and ten minute cron", () => {
  const text = readFileSync(new URL("../server/reading-cache/wrangler.toml", import.meta.url), "utf8");
  assert.match(text, /^name = "breeze-reading-cache"$/m);
  assert.match(text, /^main = "src\/index\.mjs"$/m);
  assert.match(text, /^account_id = "dc26cb1d2297ca2206a0434ff88e24b4"$/m);
  assert.match(text, /^binding = "READING"$/m);
  assert.match(text, /^bucket_name = "breeze-public-reading"$/m);
  assert.match(text, /^crons = \["\*\/10 \* \* \* \*"\]$/m);
  assert.match(text, /^enabled = true$/m);
});
