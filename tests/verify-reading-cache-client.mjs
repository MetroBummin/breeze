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

test("full contentHtml stays in the public cache only while the reading cache is on", () => {
  const storage = new Map();
  const on = rssDevice({ candidates: 1, readingCache: true, storage, now: 1000000 });
  const feed = { name: "Dexerto · Entertainment", url: "https://www.dexerto.com/feed/category/entertainment/", category: "entertainment" };
  const html = "<p>" + "x".repeat(70000) + "</p>";
  on.context.rssStorePublicFeed(feed, [{
    title: "A long public story", url: "https://stories.example/long-body", source: feed.name,
    category: feed.category, feedUrl: feed.url, feedSourceUrl: feed.url,
    contentHtml: html, bodyProvided: true, summary: "Public summary", author: "Synthetic author",
    publishedAt: "", date: "", kind: "", readUrl: "", photo: "",
  }], on.state.now);
  const stored = JSON.parse(storage.get(cacheKey));
  assert.equal(stored[feed.url].entries[0].contentHtml.length > 64000, true);
  const off = rssDevice({ candidates: 1, storage, now: on.state.now });
  const entries = off.context.rssPublicCacheEntries();
  assert.equal(entries[feed.url].entries[0].contentHtml, "");
  assert.equal(entries[feed.url].entries[0].title, "A long public story");
});

test("cover lookups use the full cache document and the two-request budget returns with the flag", async () => {
  const harness = rssDevice({ readingCache: true });
  assert.equal(harness.context.rssCoverBudgetOpen({ remaining: 0, cancelled: false }), true);
  const photo = await harness.context.rssCoverFetch("https://stories.example/cover-article");
  assert.equal(photo, null);
  const call = harness.calls.at(-1);
  assert.equal(call.target.startsWith("/articles/v1/"), true);
  assert.equal(call.credentials, "omit");
  assert.equal(call.authorization, "");
  assert.equal(harness.calls.some((item) => String(item.target).includes("relay.example") || String(item.request).includes("functions/v1")), false);
  delete harness.context.window.BREEZE_CONFIG.READING_CACHE_URL;
  assert.equal(harness.context.rssCoverBudgetOpen({ remaining: 0, cancelled: false }), false);
  assert.equal(harness.context.rssCoverBudgetOpen({ remaining: 2, cancelled: false }), true);
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
