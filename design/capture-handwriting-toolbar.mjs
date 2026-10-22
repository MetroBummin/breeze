/* Design-only capture. Serves the app, opens a real PDF page, turns handwriting
   mode on, and writes dock mockups. Does not change app behavior. */
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {extname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import playwright from '/tmp/ink-playwright/node_modules/playwright/index.js';
const {chromium} = playwright;

const root = fileURLToPath(new URL('../', import.meta.url));
const outDir = '/opt/cursor/artifacts';
const css = readFileSync(new URL('./handwriting-toolbar-mock.css', import.meta.url), 'utf8');
const mime = {'.js':'text/javascript', '.css':'text/css', '.html':'text/html', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.woff2':'font/woff2', '.json':'application/json', '.wasm':'application/wasm'};

function pdfEscape(text){
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}
function wrap(text, cols){
  const lines = [];
  let line = '';
  for(const word of text.split(/\s+/)){
    const next = line ? line + ' ' + word : word;
    if(next.length > cols && line){lines.push(line); line = word;}
    else line = next;
  }
  if(line) lines.push(line);
  return lines;
}
function bookPagePdf(){
  const paragraphs = [
    'To Sherlock Holmes she is always the woman. I have seldom heard him mention her under any other name. In his eyes she eclipses and predominates the whole of her sex. It was not that he felt any emotion akin to love for Irene Adler. All emotions, and that one particularly, were abhorrent to his cold, precise but admirably balanced mind.',
    'He was, I take it, the most perfect reasoning and observing machine that the world has seen, but as a lover he would have placed himself in a false position. He never spoke of the softer passions, save with a gibe and a sneer. They were admirable things for the observer - excellent for drawing the veil from men\'s motives and actions. But for the trained reasoner to admit such intrusions into his own delicate and finely adjusted temperament was to introduce a distracting factor which might throw a doubt upon all his mental results.',
    'Grit in a sensitive instrument, or a crack in one of his own high-power lenses, would not be more disturbing than a strong emotion in a nature such as his. And yet there was but one woman to him, and that woman was the late Irene Adler, of dubious and questionable memory.',
  ];
  const commands = [];
  const draw = (font, size, x, y, text) => {
    commands.push(`BT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${pdfEscape(text)}) Tj ET`);
  };
  draw('F2', 18, 64, 742, 'I. A Scandal in Bohemia');
  commands.push('0.75 0.72 0.66 RG 0.6 w 64 730 m 548 730 l S');
  let y = 704;
  for(const paragraph of paragraphs){
    const lines = wrap(paragraph, 78);
    lines.forEach((line, i) => {draw('F1', 12, i === 0 ? 80 : 64, y, line); y -= 18;});
    y -= 8;
  }
  draw('F3', 10, 470, 48, 'Arthur Conan Doyle');
  const content = commands.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >> >> /Contents 7 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Italic >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for(const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

const server = createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if(!file.startsWith(root)){res.writeHead(403).end(); return;}
  try{
    res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
    res.end(readFileSync(file));
  }catch{res.writeHead(404).end();}
});
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  executablePath: '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--force-color-profile=srgb', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({
  viewport: {width: 1180, height: 820},
  deviceScaleFactor: 2,
  hasTouch: true,
  colorScheme: 'light',
  serviceWorkers: 'block',
});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/*', route => {
  const url = route.request().url();
  if(url.startsWith(origin) || url.startsWith('blob:') || url.startsWith('data:')) return route.continue();
  return route.abort();
});
await page.addInitScript(() => {
  window.breezeInkIPad = true;
  localStorage.setItem('breeze.onboarding.v1', JSON.stringify('done'));
  localStorage.setItem('breeze.dark', JSON.stringify(false));
});
await page.goto(origin);
await page.locator('#fileinput').setInputFiles({
  name: 'scandal-in-bohemia.pdf',
  mimeType: 'application/pdf',
  buffer: bookPagePdf(),
});
await page.waitForFunction(() => books.some(book => book.kind === 'pdf'));
await page.evaluate(async () => {
  await openBook(books.find(book => book.kind === 'pdf'));
  await switchReaderMode('original');
});
await page.waitForSelector('.pdf-source-page canvas');
await page.waitForFunction(() => {
  const canvas = document.querySelector('.pdf-source-page canvas');
  return canvas && canvas.width > 0;
});
await page.waitForTimeout(500);
await page.evaluate(() => {darkMode = false; applyDark(); expandReaderChrome();});
const toggle = page.locator('[data-ink-toggle]');
await toggle.click();
await page.waitForFunction(() => document.getElementById('readpill')?.classList.contains('ink-pill-active'));
await page.waitForTimeout(400);
await page.addStyleTag({content: css});

const geometry = await page.evaluate(() => {
  const box = element => element ? element.getBoundingClientRect().toJSON() : null;
  const pill = document.getElementById('readpill');
  return {
    pill: box(pill),
    nav: box(document.getElementById('reader-navigation')),
    aa: box(document.getElementById('aafab')),
    entry: box(pill.querySelector('.ink-pill-entry')),
    chrome: box(document.getElementById('readchrome')),
    page: box(document.querySelector('.pdf-source-page')),
    dark: document.body.classList.contains('dark'),
    writing: pill.classList.contains('ink-pill-active'),
  };
});
console.log('CURRENT', JSON.stringify(geometry, null, 2));
console.log('ERRORS', errors);

async function layout(spec){
  const placed = await page.evaluate(spec => {
    const nav = document.getElementById('reader-navigation');
    const pill = document.getElementById('readpill');
    const aa = document.getElementById('aafab');
    const clearProps = ['position','left','top','right','bottom','width','height','margin','transform','z-index','max-width'];
    for(const el of [nav, pill, aa]) for(const prop of clearProps) el.style.removeProperty(prop);
    document.body.classList.toggle('ink-mock-vertical', !!spec.vertical);
    document.body.classList.toggle('ink-mock-lift', !!spec.lift);
    document.body.classList.toggle('ink-mock-merging', !!spec.merging);
    document.body.classList.toggle('ink-mock-hide-sides', !!spec.hideSides);
    pill.classList.toggle('ink-mock-dock', !!spec.puck);
    pill.classList.toggle('ink-mock-puck', !!spec.puck);
    document.querySelectorAll('.ink-mock-target').forEach(node => node.remove());
    document.getElementById('ink-mock-goo')?.remove();
    const pin = (el, box) => {
      if(!box) return;
      el.style.setProperty('transition', 'none', 'important');
      el.style.setProperty('position', 'fixed', 'important');
      el.style.setProperty('min-width', '0', 'important');
      el.style.setProperty('margin', '0', 'important');
      el.style.setProperty('left', box.x + 'px', 'important');
      el.style.setProperty('top', box.y + 'px', 'important');
      el.style.setProperty('right', 'auto', 'important');
      el.style.setProperty('bottom', 'auto', 'important');
      el.style.setProperty('width', box.width + 'px', 'important');
      el.style.setProperty('height', box.height == null ? 'auto' : box.height + 'px', 'important');
      el.style.setProperty('max-width', 'none', 'important');
      el.style.setProperty('transform', box.transform || 'none', 'important');
      el.style.setProperty('z-index', String(box.z || 80), 'important');
    };
    pin(nav, spec.nav);
    pin(pill, spec.pill);
    pin(aa, spec.aa);
    if(spec.puck){
      if(!pill.querySelector('.ink-mock-hint')){
        const hint = document.createElement('span');
        hint.className = 'ink-mock-hint';
        const pen = pill.querySelector('[data-ink-mode="pen"] svg');
        if(pen) hint.append(pen.cloneNode(true));
        pill.append(hint);
      }
      pill.style.setProperty('left', spec.puck.x + 'px', 'important');
      pill.style.setProperty('top', spec.puck.y + 'px', 'important');
      pill.style.setProperty('width', '44px', 'important');
      pill.style.setProperty('height', '44px', 'important');
      // Inline important beats the stylesheet stretch, so the spring lives here.
      pill.style.setProperty('transform', 'translate(-50%, -50%) rotate(var(--ink-mock-puck-angle, 0deg)) scale(var(--ink-mock-puck-sx, .84), var(--ink-mock-puck-sy, 1.32))', 'important');
    }else pill.querySelector('.ink-mock-hint')?.remove();
    if(spec.trail){
      const trail = document.createElement('div');
      trail.id = 'ink-mock-goo';
      document.body.append(trail);
      document.documentElement.style.setProperty('--ink-mock-trail-x', spec.trail.x + 'px');
      document.documentElement.style.setProperty('--ink-mock-trail-y', spec.trail.y + 'px');
    }
    for(const outline of spec.outlines || []){
      const node = document.createElement('div');
      node.className = 'ink-mock-target';
      node.style.left = outline.x + 'px';
      node.style.top = outline.y + 'px';
      node.style.width = outline.width + 'px';
      node.style.height = outline.height + 'px';
      node.style.borderRadius = (outline.radius || 26) + 'px';
      document.body.append(node);
    }
    const read = el => {
      const rect = el.getBoundingClientRect();
      return {x: rect.x, y: rect.y, width: rect.width, height: rect.height};
    };
    const shown = [];
    const controls = document.querySelectorAll('#reader-navigation, #readpill, #aafab, #pdf-page-control, #readback, #pdf-page-button, .ink-pill-entry, .ink-pill-control, .ink-pill-mini, #modefab');
    const painted = el => {
      for (let node = el; node && node !== document.documentElement; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      }
      return true;
    };
    for (const el of controls) {
      if (!painted(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) continue;
      const name = el.id || (el.classList.contains('ink-pill-entry') ? 'ink-pill-entry' : el.getAttribute('aria-label') || el.className?.toString?.().split(' ')[0] || el.tagName);
      shown.push({id: name, x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height)});
    }
    return {nav: read(nav), pill: read(pill), aa: read(aa), shown};
  }, spec);
  await page.waitForTimeout(40);
  return placed;
}
const union = boxes => {
  const x = Math.min(...boxes.map(box => box.x));
  const y = Math.min(...boxes.map(box => box.y));
  const right = Math.max(...boxes.map(box => box.x + box.width));
  const bottom = Math.max(...boxes.map(box => box.y + box.height));
  return {x, y, width: right - x, height: bottom - y};
};
const shift = (box, dx, dy) => ({x: box.x + dx, y: box.y + dy, width: box.width, height: box.height});
function assertClear(label, placed, dock) {
  const hits = (placed.shown || []).filter(box => {
    const right = box.x + box.w;
    const bottom = box.y + box.h;
    const overlaps = right > dock.x && box.x < dock.x + dock.width && bottom > dock.y && box.y < dock.y + dock.height;
    return overlaps;
  });
  if (hits.length) {
    console.error('LEFT BEHIND', label, JSON.stringify(hits));
    throw new Error(`${label} still has ${hits.length} controls in the bottom dock`);
  }
  const entry = (placed.shown || []).find(box => String(box.id).includes('ink-pill-entry'));
  console.log('CLEAR', label, 'visible', (placed.shown || []).map(box => box.id).join(','));
  if (label !== 'moving' && !entry) throw new Error(`${label} is missing the handwriting toggle`);
}

await page.screenshot({path: `${outDir}/handwriting-current.png`});

const natural = geometry;
const rowCenter = {x: natural.chrome.x + natural.chrome.width / 2, y: natural.chrome.y + natural.chrome.height / 2};

await layout({
  vertical: true,
  nav: {x: 1120, y: 0, width: 44, height: 88, z: 81},
  pill: {x: 1120, y: 120, width: 44, height: null},
  aa: {x: 1120, y: 520, width: 44, height: 44, z: 81},
});
const sideSizes = await page.evaluate(() => {
  const read = id => {
    const rect = document.getElementById(id).getBoundingClientRect();
    return {width: rect.width, height: rect.height};
  };
  return {nav: read('reader-navigation'), pill: read('readpill'), aa: read('aafab')};
});
const gap = 8;
const sideWidth = Math.max(sideSizes.nav.width, sideSizes.pill.width, sideSizes.aa.width);
const sideHeight = sideSizes.nav.height + gap + sideSizes.pill.height + gap + sideSizes.aa.height;
const sideTop = (820 - sideHeight) / 2;
const sideRight = 1180 - 16;
const sideX = width => sideRight - width;
const sideNav = {x: sideX(sideSizes.nav.width), y: sideTop, width: sideSizes.nav.width, height: sideSizes.nav.height, z: 81};
const sidePill = {x: sideX(sideSizes.pill.width), y: sideTop + sideSizes.nav.height + gap, width: sideSizes.pill.width, height: sideSizes.pill.height};
const sideAa = {x: sideX(sideSizes.aa.width), y: sidePill.y + sideSizes.pill.height + gap, width: sideSizes.aa.width, height: sideSizes.aa.height, z: 81};
const sidePlaced = await layout({vertical: true, nav: sideNav, pill: sidePill, aa: sideAa});
const sideUnion = union([sidePlaced.nav, sidePlaced.pill, sidePlaced.aa]);
console.log('SIDE SIZES', JSON.stringify(sideSizes));
console.log('SIDE', JSON.stringify(sidePlaced));
await page.screenshot({path: `${outDir}/handwriting-side.png`});
assertClear('side', sidePlaced, natural.chrome);

const dy = 12 - natural.chrome.y;
const topPlaced = await layout({
  nav: {...shift(natural.nav, 0, dy), z: 81},
  pill: shift(natural.pill, 0, dy),
  aa: {...shift(natural.aa, 0, dy), z: 81},
});
const topUnion = union([topPlaced.nav, topPlaced.pill, topPlaced.aa]);
console.log('TOP', JSON.stringify(topPlaced));
await page.screenshot({path: `${outDir}/handwriting-top.png`});
assertClear('top', topPlaced, natural.chrome);

const mergeT = 0.68;
const slide = (box, scaleX, scaleY) => {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  return {...box, z: 84, transform: `translate(${(rowCenter.x - cx) * mergeT}px, ${(rowCenter.y - cy) * mergeT}px) scale(${scaleX}, ${scaleY})`};
};
const merging = await layout({
  merging: true,
  lift: true,
  nav: slide(natural.nav, 0.72, 0.64),
  pill: {...natural.pill, transform: 'scale(0.42, 0.94)'},
  aa: slide(natural.aa, 0.72, 0.64),
});
const mergingEntry = (merging.shown || []).find(box => String(box.id).includes('ink-pill-entry'));
const naturalEntryCenter = natural.entry.x + natural.entry.width / 2;
if (!mergingEntry || Math.abs((mergingEntry.x + mergingEntry.w / 2) - naturalEntryCenter) < 24) {
  console.error('MERGE ENTRY', JSON.stringify(mergingEntry), 'natural', naturalEntryCenter);
  throw new Error('handwriting toggle did not slide inward while merging');
}
console.log('MERGE', JSON.stringify(merging.shown));
await page.screenshot({path: `${outDir}/handwriting-merging.png`});

const start = rowCenter;
const end = {x: topUnion.x + topUnion.width / 2, y: topUnion.y + topUnion.height / 2};
const travel = 0.58;
const puck = {x: start.x + (end.x - start.x) * travel, y: start.y + (end.y - start.y) * travel};
const vx = end.x - start.x;
const vy = end.y - start.y;
const length = Math.hypot(vx, vy) || 1;
const angle = Math.atan2(vy, vx) * 180 / Math.PI + 90;
await page.evaluate(value => {
  document.documentElement.style.setProperty('--ink-mock-puck-angle', value.angle.toFixed(2) + 'deg');
  document.documentElement.style.setProperty('--ink-mock-puck-sx', '0.84');
  document.documentElement.style.setProperty('--ink-mock-puck-sy', '1.32');
}, {angle});
const leftUnion = {x: 1180 - (sideUnion.x + sideUnion.width), y: sideUnion.y, width: sideUnion.width, height: sideUnion.height};
const moving = await layout({
  hideSides: true,
  puck,
  trail: {x: puck.x - vx / length * 36, y: puck.y - vy / length * 36},
  nav: sideNav,
  pill: {x: puck.x, y: puck.y, width: 44, height: 44},
  aa: sideAa,
  outlines: [topUnion, sideUnion, leftUnion],
});
await page.screenshot({path: `${outDir}/handwriting-moving.png`});
assertClear('moving', moving, natural.chrome);

const split = 0.7;
const emerge = box => {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const x = end.x + (cx - end.x) * split;
  const y = end.y + (cy - end.y) * split;
  return {x: x - box.width / 2, y: y - box.height / 2, width: box.width, height: box.height, z: 84, transform: 'scale(0.82, 0.9)'};
};
// Scale the whole pill, including the handwriting toggle. Shrinking its width
// clips that toggle out of the glass.
const pillScale = 44 / natural.pill.width + (1 - 44 / natural.pill.width) * split;
const landing = await layout({
  lift: true,
  nav: emerge(topPlaced.nav),
  pill: {...topPlaced.pill, transform: `scale(${pillScale.toFixed(3)}, 1.06)`},
  aa: emerge(topPlaced.aa),
});
await page.screenshot({path: `${outDir}/handwriting-landing.png`});
assertClear('landing', landing, natural.chrome);

await browser.close();
server.close();
console.log('wrote screenshots');
