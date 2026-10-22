/* Design-only. Records the row-merge mock over a real book page. App code is not modified. */
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {extname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import playwright from '/tmp/ink-playwright/node_modules/playwright/index.js';
const {chromium} = playwright;

const root = fileURLToPath(new URL('../', import.meta.url));
const platePath = '/tmp/handwriting-plate.png';
const videoDir = '/tmp/handwriting-video';
const outPath = '/opt/cursor/artifacts/handwriting-move.mp4';
const mime = {'.js':'text/javascript', '.css':'text/css', '.html':'text/html', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.woff2':'font/woff2', '.json':'application/json'};

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

function serve(handler){
  const server = createServer(handler);
  return new Promise(resolveListen => server.listen(0, '127.0.0.1', () => resolveListen(server)));
}

const app = await serve((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if(!file.startsWith(root)){res.writeHead(403).end(); return;}
  try{
    res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
    res.end(readFileSync(file));
  }catch{res.writeHead(404).end();}
});
const appOrigin = `http://127.0.0.1:${app.address().port}`;

const browser = await chromium.launch({
  executablePath: '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--force-color-profile=srgb', '--disable-dev-shm-usage'],
});
const platePage = await browser.newPage({
  viewport: {width: 1180, height: 820},
  deviceScaleFactor: 2,
  hasTouch: true,
  colorScheme: 'light',
  serviceWorkers: 'block',
});
await platePage.route('**/*', route => {
  const url = route.request().url();
  if(url.startsWith(appOrigin) || url.startsWith('blob:') || url.startsWith('data:')) return route.continue();
  return route.abort();
});
await platePage.addInitScript(() => {
  window.breezeInkIPad = true;
  localStorage.setItem('breeze.onboarding.v1', JSON.stringify('done'));
  localStorage.setItem('breeze.dark', JSON.stringify(false));
});
await platePage.goto(appOrigin);
await platePage.locator('#fileinput').setInputFiles({
  name: 'scandal-in-bohemia.pdf',
  mimeType: 'application/pdf',
  buffer: bookPagePdf(),
});
await platePage.waitForFunction(() => books.some(book => book.kind === 'pdf'));
await platePage.evaluate(async () => {
  await openBook(books.find(book => book.kind === 'pdf'));
  await switchReaderMode('original');
});
await platePage.waitForFunction(() => {
  const canvas = document.querySelector('.pdf-source-page canvas');
  return canvas && canvas.width > 0;
});
await platePage.waitForTimeout(400);
await platePage.evaluate(() => {
  document.getElementById('readchrome').style.visibility = 'hidden';
});
await platePage.screenshot({path: platePath});
await platePage.close();
app.close();

const motion = await serve((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  try{
    if(pathname === '/plate.png'){
      res.setHeader('Content-Type', 'image/png');
      res.end(readFileSync(platePath));
      return;
    }
    res.setHeader('Content-Type', 'text/html');
    res.end(readFileSync(new URL('./handwriting-toolbar-motion.html', import.meta.url)));
  }catch{res.writeHead(404).end();}
});
const motionOrigin = `http://127.0.0.1:${motion.address().port}/`;
const context = await browser.newContext({
  viewport: {width: 1180, height: 820},
  deviceScaleFactor: 1,
  colorScheme: 'light',
  recordVideo: {dir: videoDir, size: {width: 1180, height: 820}},
});
const page = await context.newPage();
await page.goto(motionOrigin);
await page.waitForFunction(() => window.__ready === true);
await page.evaluate(() => window.go());
await page.waitForFunction(() => window.__done === true, {timeout: 15000});
await page.waitForTimeout(120);
const webm = await page.video().path();
await context.close();
await browser.close();
motion.close();

const encoded = spawnSync('ffmpeg', [
  '-y', '-i', webm,
  '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-movflags', '+faststart',
  outPath,
], {stdio: 'inherit'});
if(encoded.status !== 0) process.exit(encoded.status || 1);
const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', outPath], {encoding: 'utf8'});
console.log('VIDEO', outPath, 'duration', probe.stdout.trim());
