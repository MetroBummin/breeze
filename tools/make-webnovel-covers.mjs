// Makes the typographic web-novel covers in assets/webnovels/covers/.
// Each cover is title + author on one colour per work, in the same
// 768 × 1152 WebP frame as the classic covers. Author names keep their exact
// case (the credit is exactly "R. K. Goff"). The authors' own cover art is
// never used. Run: node tools/make-webnovel-covers.mjs (needs Playwright Chromium).
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = resolve(root, 'assets/webnovels/covers');
const font = readFileSync(resolve(root, 'assets/fonts/fraunces-latin.woff2')).toString('base64');

// A cinnamon-roll swirl: an Archimedean spiral of three and a half turns.
function spiral(){
  const points = [];
  for(let step = 0; step <= 280; step++){
    const angle = step / 280 * Math.PI * 7, radius = 3 + angle * 2.2;
    points.push(`${(60 + radius * Math.cos(angle)).toFixed(1)} ${(60 + radius * Math.sin(angle)).toFixed(1)}`);
  }
  return 'M' + points.join(' L');
}

// The Home card crops a 2:3 picture to 3:4 from the centre (64px off the top
// and bottom), so everything sits inside the middle 1024px.
const COVERS = [
  {
    id: 'arkendrithyst', title: "Ar'Kendrithyst", author: 'R. K. Goff',
    bg: ['#1E2A47', '#121A2E'], ink: '#E9D3A1', soft: 'rgba(233,211,161,.42)',
    mark: `<circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" stroke-width="2"/>
      <circle cx="60" cy="60" r="38" fill="none" stroke="currentColor" stroke-width="1.2"/>
      <path d="M60 14 L74 60 L60 106 L46 60 Z" fill="none" stroke="currentColor" stroke-width="2"/>`,
  },
  {
    id: 'cinnamon-bun', title: 'Cinnamon Bun', author: 'RavensDagger',
    bg: ['#B8653F', '#9A4F30'], ink: '#FBEAD2', soft: 'rgba(251,234,210,.45)',
    mark: `<path d="${spiral()}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>`,
  },
  {
    id: 'chasing-sunlight', title: 'Chasing Sunlight', author: 'InadvisablyCompelled',
    bg: ['#2D3B57', '#C98A4B'], ink: '#FFF3DE', soft: 'rgba(255,243,222,.5)',
    mark: `<path d="M18 84 H102" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <path d="M32 84 a28 28 0 0 1 56 0" fill="none" stroke="currentColor" stroke-width="2"/>
      <g stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M60 30 V44"/><path d="M26 50 l9 9"/><path d="M94 50 l-9 9"/>
        <path d="M14 70 h12"/><path d="M94 70 h12"/></g>`,
  },
];

function page(cover){
  return `<!doctype html><meta charset="utf-8"><style>
  @font-face{font-family:F;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:500 600;}
  html,body{margin:0;width:768px;height:1152px;}
  body{background:linear-gradient(170deg,${cover.bg[0]} 0%,${cover.bg[1]} 100%);color:${cover.ink};
    font-family:F,Georgia,serif;display:flex;flex-direction:column;align-items:center;
    box-sizing:border-box;padding:150px 84px 160px;text-align:center;}
  .frame{position:absolute;inset:92px 46px;border:1.5px solid ${cover.soft};border-radius:6px;}
  .kicker{font-weight:500;font-size:22px;letter-spacing:.42em;text-transform:uppercase;color:${cover.soft};margin-top:40px;}
  .mark{width:150px;height:150px;margin-top:96px;color:${cover.ink};}
  h1{margin:64px 0 0;font-weight:600;font-size:${cover.title.length>14?92:104}px;line-height:1.02;letter-spacing:-.01em;}
  .rule{width:84px;height:2px;background:${cover.soft};margin:56px 0 0;}
  .author{margin-top:auto;font-weight:500;font-size:${cover.author.length>14?34:40}px;letter-spacing:.06em;}
  </style><div class="frame"></div><div class="kicker">A web serial</div>
  <svg class="mark" viewBox="0 0 120 120" aria-hidden="true">${cover.mark}</svg>
  <h1>${cover.title}</h1><div class="rule"></div><div class="author">${cover.author}</div>`;
}

mkdirSync(out, {recursive: true});
const browser = await chromium.launch();
try{
  const tab = await browser.newPage({viewport: {width: 768, height: 1152}, deviceScaleFactor: 1});
  for(const cover of COVERS){
    await tab.setContent(page(cover));
    await tab.evaluate(() => document.fonts.ready);
    const png = await tab.screenshot({type: 'png'});
    const webp = await tab.evaluate(async source => {
      const image = new Image();
      image.src = 'data:image/png;base64,' + source;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      canvas.getContext('2d').drawImage(image, 0, 0);
      return canvas.toDataURL('image/webp', .9).split(',')[1];
    }, png.toString('base64'));
    const bytes = Buffer.from(webp, 'base64');
    writeFileSync(resolve(out, cover.id + '.webp'), bytes);
    console.log(cover.id + '.webp', bytes.length, 'bytes');
  }
}finally{await browser.close();}
