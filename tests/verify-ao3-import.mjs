import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {File} from 'node:buffer';
import {DOMParser} from 'linkedom';
import ts from 'typescript';
import {fetchPublic} from '../server/article/public-fetch.mjs';
import {AO3_USER_AGENT, ao3PublicUrl, fetchAo3} from '../server/article/ao3-fetch.mjs';
import {fetchXEmbed} from '../server/article/social-embed.mjs';
import {publicUrl} from '../server/article/public-fetch.mjs';

const require = createRequire(import.meta.url);
const JSZip = require('../assets/lib/jszip-3.10.1.min.js');
const encoder = new TextEncoder();
const chapter = `<html><body>
  <div id="preface"><p>Notes</p><blockquote><p>Author said hi</p></blockquote></div>
  <div class="meta group"><p>Chapter Notes</p><blockquote><p>Before the chapter</p></blockquote></div>
  <div class="userstuff"><p>The story begins.</p><blockquote><p>She said Notes and kept talking.</p></blockquote></div>
  <div id="endnotes"><p>End Notes</p><blockquote><p>After</p></blockquote></div>
</body></html>`;

function page(html, url){
  return {status:200, url, contentType:'text/html', bytes:encoder.encode(html)};
}
async function sampleEpub(){
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file('META-INF/container.xml', '<?xml version="1.0"?><container><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>');
  zip.file('book.opf', '<?xml version="1.0"?><package><metadata><title>The Quiet Work</title><creator>Ada Writer</creator></metadata><manifest><item id="c" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c"/></spine></package>');
  zip.file('chapter.xhtml', chapter);
  return new Uint8Array(await zip.generateAsync({type:'uint8array'}));
}
function loadClient(){
  const events = new Map(), docEvents = new Map(), imports = [], opened = [];
  const context = {
    URL, Uint8Array, TextEncoder, TextDecoder, DOMParser, JSZip, File, Promise, Map, Set, AbortSignal, console,
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    ensureZipLib: async () => {},
    addEventListener: (name, fn) => events.set(name, fn),
    importFile: async (file, extra, options) => {
      imports.push({name:file.name, type:file.type, extra, options, bytes:file.breezeBytes});
      return {bookId:'book-1'};
    },
    openBook: async book => opened.push(book),
    books: [{id:'book-1', title:'The Quiet Work'}],
    localStorage: {getItem(){ return null; }, setItem(){}},
    document: {
      visibilityState:'visible',
      getElementById(id){
        if(id === 'am-url') return {value:'', addEventListener(){}};
        if(id === 'am-ao3-notes') return {hidden:true};
        if(id === 'am-ao3-notes-input') return {checked:true, addEventListener(){}};
        return null;
      },
      addEventListener(name, fn){ docEvents.set(name, fn); },
    },
  };
  context.window = context;
  vm.runInContext(readFileSync(new URL('../scripts/importers/ao3.js', import.meta.url), 'utf8'), vm.createContext(context));
  return {context, imports, opened, docEvents};
}

test('a work, a chapter, and the official download are one work', () => {
  const {context} = loadClient();
  assert.deepEqual(JSON.parse(JSON.stringify(context.parseAo3WorkUrl('https://www.archiveofourown.org/works/123?view_adult=true#chapter-1'))),
    {workId:'123', chapterId:'', canonicalUrl:'https://archiveofourown.org/works/123'});
  assert.deepEqual(JSON.parse(JSON.stringify(context.parseAo3WorkUrl('http://archiveofourown.org/works/12/chapters/34'))),
    {workId:'12', chapterId:'34', canonicalUrl:'https://archiveofourown.org/works/12/chapters/34'});
  assert.equal(context.parseAo3WorkUrl('https://archiveofourown.org/chapters/99').workId, '');
  assert.equal(context.parseAo3WorkUrl('https://archiveofourown.org/downloads/8/custom.epub').workId, '8');
  for(const raw of ['https://archiveofourown.org/series/9', 'https://archiveofourown.org/tags/foo',
    'https://archiveofourown.org/users/ada', 'https://user:pass@archiveofourown.org/works/1',
    'https://example.com/works/1', 'https://archiveofourown.org/works/0', 'https://archiveofourown.org/works/1/navigate']){
    assert.equal(context.parseAo3WorkUrl(raw), null, raw);
  }
});

test('restricted, adult, and missing pages are named, and a quoted notice stays public', () => {
  const {context} = loadClient();
  const restricted = 'This work is only available to registered users of the Archive.';
  assert.equal(context.classifyAo3Page(restricted, 'https://archiveofourown.org/works/1'), 'ao3_restricted');
  assert.equal(context.classifyAo3Page('<div id="workskin"></div>' + restricted, 'https://archiveofourown.org/works/1'), '');
  assert.equal(context.classifyAo3Page('<h2>Adult Content Warning</h2><p>willing to see such content</p>', 'https://archiveofourown.org/works/1'), 'ao3_adult');
  assert.equal(context.classifyAo3Page('<div id="chapters"></div>', 'https://archiveofourown.org/users/login'), '');
  assert.equal(context.classifyAo3Page('Error 404', 'https://archiveofourown.org/works/1'), 'ao3_missing');
  assert.equal(context.classifyAo3Page('<p>hidden by an admin</p>', 'https://archiveofourown.org/works/1'), 'ao3_unavailable');
  assert.equal(context.ao3StatusCode(301), 'ao3_unavailable');
  assert.equal(context.ao3StatusCode(302), 'ao3_unavailable');
  assert.equal(context.ao3StatusCode(403), 'ao3_unavailable');
});

test('author notes drop and a story quotation that says Notes stays', () => {
  const {context} = loadClient();
  const doc = new DOMParser().parseFromString(chapter, 'text/html');
  assert.equal(context.stripAo3AuthorNotes(doc), true);
  const text = doc.toString();
  assert.match(text, /The story begins/);
  assert.match(text, /She said Notes and kept talking/);
  assert.doesNotMatch(text, /Author said hi/);
  assert.doesNotMatch(text, /Before the chapter/);
  assert.doesNotMatch(text, /After/);
  const story = new DOMParser().parseFromString('<div class="userstuff"><p>Notes</p><blockquote><p>A line of the story.</p></blockquote></div>', 'text/html');
  assert.equal(context.stripAo3AuthorNotes(story), false);
  assert.match(story.toString(), /A line of the story/);
});

test('one public page then one EPUB, with title, author, and the reader', async () => {
  const epub = await sampleEpub();
  const {context, imports, opened} = loadClient();
  const urls = [];
  const transport = async url => {
    urls.push(url);
    if(url.includes('/downloads/')) return {status:200, url, contentType:'application/epub+zip', bytes:epub};
    return page('<div id="workskin"></div>', url);
  };
  await context.importAo3Work('https://archiveofourown.org/works/10', {transport});
  assert.deepEqual(urls, [
    'https://archiveofourown.org/works/10?view_adult=true',
    'https://archiveofourown.org/downloads/10/work.epub',
  ]);
  assert.equal(imports[0].extra.title, 'The Quiet Work');
  assert.equal(imports[0].extra.author, 'Ada Writer');
  assert.equal(imports[0].extra.site, 'AO3');
  assert.equal(imports[0].extra.sourceUrl, 'https://archiveofourown.org/works/10');
  assert.deepEqual(JSON.parse(JSON.stringify(imports[0].extra.ao3)), {workId:'10', includeNotes:true});
  assert.equal(imports[0].name, 'The Quiet Work.epub');
  assert.deepEqual(Buffer.from(imports[0].bytes), Buffer.from(epub));
  assert.equal(opened.length, 1);
});

test('a chapter link resolves the work, and notes can be left out without the story quote', async () => {
  const epub = await sampleEpub();
  const {context, imports, opened} = loadClient();
  const urls = [];
  const transport = async url => {
    urls.push(url);
    if(url.includes('/downloads/')) return {status:200, url, contentType:'application/epub+zip', bytes:epub};
    const html = '<html><head><link rel="canonical" href="https://archiveofourown.org/works/42/chapters/99"></head><body><div id="workskin"></div></body></html>';
    return page(html, url);
  };
  await context.importAo3Work('https://archiveofourown.org/chapters/99', {transport, includeNotes:false, present:false});
  assert.deepEqual(urls, [
    'https://archiveofourown.org/chapters/99?view_adult=true',
    'https://archiveofourown.org/downloads/42/work.epub',
  ]);
  assert.equal(imports[0].extra.sourceUrl, 'https://archiveofourown.org/works/42');
  assert.equal(imports[0].extra.ao3.includeNotes, false);
  const text = await JSZip.loadAsync(imports[0].bytes).then(zip => zip.file('chapter.xhtml').async('string'));
  assert.match(text, /The story begins/);
  assert.match(text, /She said Notes and kept talking/);
  assert.doesNotMatch(text, /Author said hi/);
  assert.equal(opened.length, 0);
});

test('restricted and adult pages stop before the download, and 429 is not retried', async () => {
  const {context} = loadClient();
  const cases = [
    ['This work is only available to registered users of the Archive.', 'ao3_restricted'],
    ['<h2>Adult Content Warning</h2> willing to see such content', 'ao3_adult'],
  ];
  for(const [html, code] of cases){
    const urls = [];
    await assert.rejects(context.importAo3Work('https://archiveofourown.org/works/4', {
      transport: async url => { urls.push(url); return page(html, url); },
    }), error => error.code === code);
    assert.equal(urls.length, 1);
    assert.equal(urls[0].includes('/downloads/'), false);
  }
  let calls = 0;
  await assert.rejects(context.importAo3Work('https://archiveofourown.org/works/4', {
    transport: async url => { calls++; return {status:429, url, contentType:'text/html', bytes:new Uint8Array()}; },
  }), error => error.code === 'ao3_rate_limited');
  assert.equal(calls, 1);
});

test('two imports stay in line, and a direct 429 does not fall through to the relay', async () => {
  const epub = await sampleEpub();
  const {context} = loadClient();
  let inflight = 0, max = 0;
  const transport = async url => {
    inflight++; max = Math.max(max, inflight);
    await new Promise(resolve => setTimeout(resolve, 15));
    inflight--;
    if(url.includes('/downloads/')) return {status:200, url, contentType:'application/epub+zip', bytes:epub};
    return page('<div id="workskin"></div>', url);
  };
  await Promise.all([
    context.importAo3Work('https://archiveofourown.org/works/10', {transport, present:false}),
    context.importAo3Work('https://archiveofourown.org/works/11', {transport, present:false}),
  ]);
  assert.equal(max, 1);
  let relay = 0;
  context.fetch = async () => ({status:429, url:'https://archiveofourown.org/works/4?view_adult=true', headers:{get:()=>'text/html'}, arrayBuffer:async()=>new ArrayBuffer(0)});
  context.articleProxyUrl = () => { relay++; return 'https://relay.example/ao3'; };
  context.SB_KEY = 'public';
  await assert.rejects(context.importAo3Work('https://archiveofourown.org/works/4'), error => error.code === 'ao3_rate_limited');
  assert.equal(relay, 0);
});

test('a terminal share is dropped and a rate limit waits until the app is forward again', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const item = [{id, url:'https://archiveofourown.org/works/7'}];
  const terminal = loadClient();
  const acks = [];
  terminal.context.importAo3Work = async () => { throw terminal.context.ao3Error('ao3_restricted'); };
  terminal.context.breezeAo3 = {ack: async key => acks.push(key), list(){}};
  terminal.context.receiveAo3Inbox(item);
  await terminal.context.startAo3Inbox();
  assert.deepEqual(acks, [id]);

  const limited = loadClient();
  const kept = [];
  let calls = 0, job = null;
  const run = limited.context.importPendingAo3.bind(limited.context);
  limited.context.importAo3Work = async () => { calls++; throw limited.context.ao3Error('ao3_rate_limited'); };
  limited.context.importPendingAo3 = () => (job = run());
  limited.context.breezeAo3 = {
    ack: async key => kept.push(key),
    list(){ limited.context.receiveAo3Inbox(item); },
  };
  limited.context.receiveAo3Inbox(item);
  await limited.context.startAo3Inbox();
  assert.equal(calls, 1);
  assert.deepEqual(kept, []);
  await limited.context.importPendingAo3();
  assert.equal(calls, 1);
  limited.context.document.visibilityState = 'visible';
  limited.docEvents.get('visibilitychange')();
  await job;
  assert.equal(calls, 2);
  assert.deepEqual(kept, []);
});

const resolve = async () => [{address:'1.1.1.1', family:4}];
test('a public chaptered work redirects to its download host and is not login-only', async () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/ao3-4701869-redirect.json', import.meta.url), 'utf8'));
  const {context} = loadClient();
  const epub = await sampleEpub();
  const urls = [];
  await context.importAo3Work(fixture.work, {
    present: false,
    transport: async url => {
      urls.push(url);
      if(url === fixture.epub.url) return {status:200, url:fixture.epub.location, contentType:fixture.epub.finalContentType, bytes:epub};
      return page('<div id="workskin"></div><p>Chapters: 50/50</p>', 'https://archiveofourown.org' + fixture.page.location);
    },
  });
  assert.deepEqual(urls, [
    'https://archiveofourown.org/works/4701869?view_adult=true',
    fixture.epub.url,
  ]);
  for(const status of [fixture.page.status, fixture.epub.status, 403]){
    const seen = [];
    await assert.rejects(context.importAo3Work(fixture.work, {
      transport: async url => { seen.push(url); return {status, url, contentType:'text/html', bytes:new Uint8Array()}; },
    }), error => error.code === 'ao3_unavailable');
    assert.equal(seen.length, 1);
    assert.equal(seen[0].includes('/downloads/'), false);
  }
  const calls = [];
  const transport = async url => {
    calls.push(url.href);
    if(url.href === fixture.epub.url) return {status:fixture.epub.status, location:fixture.epub.location, headers:{}};
    if(url.href === fixture.epub.location) return {status:200, headers:{'content-type':fixture.epub.finalContentType}, bytes:new Uint8Array([0x50, 0x4b, 3, 4, 1])};
    throw new Error('unexpected ' + url.href);
  };
  const result = await fetchPublic(fixture.epub.url, {admit:ao3PublicUrl, transport, resolve});
  assert.equal(result.status, 200);
  assert.equal(result.bytes[0], 0x50);
  assert.deepEqual(calls, [fixture.epub.url, fixture.epub.location]);
  await assert.rejects(fetchPublic(fixture.epub.url, {
    admit:ao3PublicUrl,
    resolve,
    transport: async url => ({status:301, location:'https://download.archiveofourown.org/works/4701869', headers:{}}),
  }), error => error.message === 'bad_url');
});

test('a redirect off AO3 or onto a login path is not requested', async () => {
  for(const location of ['https://evil.example/steal', 'https://archiveofourown.org/users/login?return_to=%2Fworks%2F1']){
    const calls = [];
    const transport = async url => {
      calls.push(url.href);
      return {status:302, location, headers:{}};
    };
    await assert.rejects(fetchPublic('https://archiveofourown.org/works/1?view_adult=true', {admit:ao3PublicUrl, transport, resolve}),
      error => error.message === 'bad_url' || error.message === 'ao3_restricted');
    assert.deepEqual(calls, ['https://archiveofourown.org/works/1?view_adult=true']);
  }
});

test('the AO3 fetch names itself, refuses a series, and does not treat an HTML download as an EPUB', async () => {
  let seen;
  const signal = new AbortController().signal;
  const pageResult = await fetchAo3('https://www.archiveofourown.org/works/5?view_adult=true', signal, async (target, options) => {
    seen = {target, options};
    return {status:200, headers:{'content-type':'text/html; charset=utf-8'}, bytes:encoder.encode('<div id="workskin"></div>'), url:target};
  });
  assert.equal(pageResult.status, 200);
  assert.equal(pageResult.body.html.includes('workskin'), true);
  assert.equal(seen.options.headers['User-Agent'], AO3_USER_AGENT);
  assert.equal(seen.options.headers.Authorization, undefined);
  assert.equal(seen.options.headers.Cookie, undefined);
  assert.equal(new URL(seen.target).hostname, 'archiveofourown.org');
  assert.equal(seen.options.limit, 2_000_000);
  let calls = 0;
  await assert.rejects(() => fetchAo3('https://archiveofourown.org/series/1', signal, async () => { calls++; return {status:200}; }), /bad_url/);
  assert.equal(calls, 0);
  const htmlBook = await fetchAo3('https://archiveofourown.org/downloads/5/work.epub', signal, async () => ({
    status:200, headers:{'content-type':'text/html'}, bytes:encoder.encode('<html>NOT-A-BOOK</html>'),
  }));
  assert.equal(htmlBook.bytes, undefined);
  assert.equal(JSON.stringify(htmlBook.body).includes('NOT-A-BOOK'), false);
  const zip = await fetchAo3('https://archiveofourown.org/downloads/5/work.epub', signal, async () => ({
    status:200, headers:{'content-type':'application/epub+zip'}, bytes:new Uint8Array([0x50, 0x4b, 3, 4, 1]), url:'https://archiveofourown.org/downloads/5/work.epub',
  }));
  assert.equal(zip.bytes[0], 0x50);
  assert.equal(zip.bytes[1], 0x4b);
});

const handlerSource = ts.transpileModule(readFileSync(new URL('../server/article/index.ts', import.meta.url), 'utf8').replace(/^import .*;\n/gm, ''), {
  compilerOptions:{target:ts.ScriptTarget.ES2022, module:ts.ModuleKind.None},
}).outputText;
function setupRelay(upstream){
  let handler;
  const calls = [];
  const context = vm.createContext({
    Deno:{serve:fn => { handler = fn; }}, publicUrl, fetchXEmbed, fetchAo3,
    fetchPublic: async (target, options) => {
      calls.push({target, options});
      return typeof upstream === 'function' ? upstream(target, options) : upstream;
    },
    Request, Response, TextEncoder, TextDecoder, URL, Uint8Array, AbortController, setTimeout, clearTimeout,
    console:{error(){}},
  });
  vm.runInContext(handlerSource, context);
  const send = (source, mode='ao3') => handler(new Request('https://relay.example/article?url=' + encodeURIComponent(source) + (mode ? '&as=' + mode : '')));
  return {calls, send};
}

test('the article function serves one AO3 EPUB and keeps an HTML download as an error', async () => {
  const htmlRelay = setupRelay(() => ({status:200, headers:{'content-type':'text/html'}, bytes:encoder.encode('<html>NOT-A-BOOK</html>')}));
  const bad = await htmlRelay.send('https://archiveofourown.org/downloads/5/work.epub');
  const failure = await bad.json();
  assert.equal(bad.headers.get('content-type').includes('json'), true);
  assert.equal(typeof failure.error, 'string');
  assert.equal(JSON.stringify(failure).includes('NOT-A-BOOK'), false);
  const epub = new Uint8Array([0x50, 0x4b, 3, 4, 9]);
  const ok = await setupRelay(() => ({
    status:200, headers:{'content-type':'application/epub+zip'}, bytes:epub, url:'https://archiveofourown.org/downloads/5/work.epub',
  })).send('https://archiveofourown.org/downloads/5/work.epub');
  assert.equal(ok.headers.get('content-type'), 'application/epub+zip');
  assert.equal(Buffer.from(await ok.arrayBuffer())[0], 0x50);
});

test('a second AO3 request waits its turn at the function', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const {send, calls} = setupRelay(async () => {
    await gate;
    return {status:200, headers:{'content-type':'text/html'}, bytes:encoder.encode('<div id="workskin"></div>'), url:'https://archiveofourown.org/works/5?view_adult=true'};
  });
  const first = send('https://archiveofourown.org/works/5?view_adult=true');
  const second = await send('https://archiveofourown.org/works/6?view_adult=true');
  assert.equal(second.status, 503);
  assert.equal(calls.length, 1);
  release();
  assert.equal((await first).status, 200);
  const third = await send('https://archiveofourown.org/works/6?view_adult=true');
  assert.equal(third.status, 200);
});
