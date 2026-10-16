/* Reading-cache flag in real browser engines, including a storage denial that
   matches private-mode quota failure. Publisher and relay hosts are stubbed. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit, devices } from "playwright";

const root = fileURLToPath(new URL("../", import.meta.url));
const server = createServer((request, response) => {
  const pathname = new URL(request.url, "http://127.0.0.1").pathname;
  if (pathname === "/fixture.html") {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end("<!doctype html><script src=\"/scripts/importers/article.js\"></script><script src=\"/scripts/importers/rss.js\"></script>");
    return;
  }
  try {
    const path = resolve(root, "." + pathname);
    if (!path.startsWith(root)) throw new Error("escape");
    response.setHeader("content-type", { ".js": "text/javascript", ".html": "text/html" }[extname(path)] || "application/octet-stream");
    response.end(readFileSync(path));
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const base = `http://127.0.0.1:${server.address().port}/fixture.html`;

async function run(engine, { mobile = false, denyStorage = false, privateBrowsing = false } = {}) {
  const launch = privateBrowsing && engine === firefox
    ? { firefoxUserPrefs: { "browser.privatebrowsing.autostart": true } }
    : {};
  const browser = await engine.launch(launch);
  try {
    const context = await browser.newContext(mobile ? devices["iPhone 13"] : { viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    if (denyStorage) {
      await page.addInitScript(() => {
        const deny = () => { throw new DOMException("QuotaExceededError"); };
        Storage.prototype.getItem = deny;
        Storage.prototype.setItem = deny;
      });
    }
    await page.addInitScript(() => {
      const original = window.fetch.bind(window);
      window.__readingCalls = [];
      window.fetch = (input, init = {}) => {
        window.__readingCalls.push({ url: String(input), credentials: init.credentials || "" });
        return original(input, init);
      };
    });
    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (url.startsWith(base.slice(0, base.lastIndexOf("/") + 1)) && !url.includes("cache.test") && !url.includes("relay.example")) return route.continue();
      if (url.startsWith("https://cache.test/feeds/")) {
        return route.fulfill({ status: 200, contentType: "application/rss+xml", body: "<rss version=\"2.0\"><channel><item><title>The public English story</title><link>https://stories.example/one</link><description>The public story describes a synthetic example with the and a and of and to and in.</description></item></channel></rss>", headers: { "x-reading-url": "https://publisher.example/feed" } });
      }
      if (url.includes("/functions/v1/article")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ url: "https://publisher.example/feed", html: "<rss>relay</rss>" }) });
      }
      return route.abort();
    });
    await page.goto(base, { waitUntil: "load", timeout: 60000 });
    await page.evaluate(() => {
      window.BREEZE_CONFIG = { READING_CACHE_URL: "https://cache.test", SB_URL: "https://relay.example", SB_KEY: "synthetic" };
    });
    const cached = await page.evaluate(async () => {
      window.SB_URL = "https://relay.example";
      window.SB_KEY = "synthetic";
      window.load = (key, fallback) => key === "breeze.feed-sources" || key === "breeze.feed-source-categories" ? (key.endsWith("categories") ? {} : []) : fallback;
      window.books = [];
      window.ensureReadabilityLib = async () => {};
      window.__readingCalls.length = 0;
      const location = {};
      const html = await fetchArticleHtml(RSS_FEEDS[0].url, location);
      const groups = await loadRss(true);
      return { html, location: location.url, calls: window.__readingCalls, cards: groups.filter((group) => group.length).length };
    });
    assert.equal(cached.html.includes("<rss"), true);
    const cacheCalls = cached.calls.filter((call) => call.url.startsWith("https://cache.test/"));
    assert.equal(cacheCalls.length >= 13, true);
    assert.equal(cacheCalls.every((call) => call.credentials === "omit"), true);
    assert.equal(cached.calls.some((call) => call.url.includes("/functions/v1/article")), false);
    assert.equal(cached.cards, 13, JSON.stringify(cached.calls.map((call) => call.url)));
    const killed = await page.evaluate(async () => {
      delete window.BREEZE_CONFIG.READING_CACHE_URL;
      window.__readingCalls.length = 0;
      const html = await fetchArticleHtml(RSS_FEEDS[0].url, {});
      return { html, calls: window.__readingCalls };
    });
    assert.equal(killed.html, "<rss>relay</rss>");
    assert.equal(killed.calls.some((call) => call.url.includes("/functions/v1/article")), true);
    await context.close();
  } finally {
    await browser.close();
  }
}

const engines = [
  ["chromium", chromium, {}],
  ["firefox", firefox, {}],
  ["webkit", webkit, {}],
  ["webkit-mobile", webkit, { mobile: true }],
];
try {
  for (const [name, engine, options] of engines) {
    await run(engine, options);
    await run(engine, { ...options, denyStorage: true });
    console.log(name, "ok");
  }
  await run(firefox, { privateBrowsing: true, denyStorage: true });
  console.log("firefox-private ok");
} finally {
  server.close();
}
