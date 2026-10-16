/* Client flag. Cache reads omit credentials and do not fall back to the relay. */
import test from "node:test";
import assert from "node:assert/strict";
import { rssDevice, cacheKey } from "./egress-rss-transport.mjs";

test("an unset reading cache still uses the relay and strips discovery bodies", async () => {
  const harness = rssDevice({ candidates: 1 });
  await harness.load(false);
  assert.equal(harness.calls.some((call) => String(call.target).includes("cache.test")), false);
  assert.equal(harness.calls.some((call) => String(call.target).includes("relay.example") || call.target?.includes("https://")), true);
  const stored = harness.storage.get(cacheKey);
  assert.equal(stored.includes("synthetic full public feed body"), false);
});

test("the reading cache is read with credentials omitted and keeps a fitting body", async () => {
  const harness = rssDevice({ candidates: 1, readingCache: true });
  await harness.load(false);
  const feeds = harness.calls.filter((call) => call.target.startsWith("/feeds/v1/"));
  assert.equal(feeds.length, 13);
  assert.equal(harness.calls.every((call) => call.credentials === "omit" && !call.authorization && (call.target.startsWith("/feeds/v1/") || call.target.startsWith("/articles/v1/"))), true);
  assert.equal(harness.calls.some((call) => String(call.target).includes("functions/v1/article")), false);
  const stored = harness.storage.get(cacheKey);
  assert.equal(stored.includes("synthetic full public feed body"), true);
});

test("a cache miss uses the on-device feed and does not call the relay", async () => {
  const harness = rssDevice({ candidates: 1, readingCache: true });
  await harness.load(false);
  const before = harness.calls.length;
  harness.state.cacheStatus = 404;
  harness.advance(11 * 60 * 1000);
  await harness.load(false);
  assert.equal(harness.calls.length > before, true);
  assert.equal(harness.calls.every((call) => call.target.startsWith("/feeds/") || call.target.startsWith("/articles/") || call.target.startsWith("/images/") || call.target.startsWith("/previews/")), true);
  assert.equal(harness.entries().some((group) => group.length), true);
});

test("Medium owner bodies are resolved before cards only while the cache is on", async () => {
  const off = rssDevice({ mediumResolve: true, candidates: 1 });
  await off.load(false);
  assert.equal(off.entries()[12][0].contentHtml, "");
  const on = rssDevice({ mediumResolve: true, candidates: 1, readingCache: true });
  await on.load(false);
  assert.equal(on.entries()[12][0].contentHtml.includes("synthetic full public feed body"), true);
  assert.equal(on.calls.some((call) => call.target.startsWith("/articles/v1/")), true);
  assert.equal(on.calls.some((call) => call.target.includes("functions/v1")), false);
});

test("clearing READING_CACHE_URL returns the next load to the relay", async () => {
  const harness = rssDevice({ candidates: 1, readingCache: true });
  await harness.load(false);
  delete harness.context.window.BREEZE_CONFIG.READING_CACHE_URL;
  harness.advance(11 * 60 * 1000);
  harness.calls.length = 0;
  await harness.load(true);
  assert.equal(harness.calls.some((call) => String(call.target).includes("https://")), true);
  assert.equal(harness.calls.some((call) => String(call.target).startsWith("/feeds/")), false);
});

test("storage denial still serves the cache response", async () => {
  const harness = rssDevice({ candidates: 1, readingCache: true, denyStorage: true });
  const groups = await harness.load(false);
  assert.equal(groups.some((group) => group.length), true);
  assert.equal(harness.calls.every((call) => call.credentials === "omit"), true);
});

test("image misses use the cache and omit credentials", async () => {
  const harness = rssDevice({ readingCache: true });
  const blob = await harness.context.fetchArticleImage("https://images.example/cover.png");
  assert.equal(blob.type, "image/png");
  assert.equal(harness.calls.at(-1).target.startsWith("/images/v1/"), true);
  assert.equal(harness.calls.at(-1).credentials, "omit");
  harness.context.window.BREEZE_CONFIG.READING_CACHE_URL = "";
  harness.calls.length = 0;
  await harness.context.fetchArticleImage("https://images.example/other.png");
  assert.equal(String(harness.calls.at(-1).request).includes("as=image"), true);
});
