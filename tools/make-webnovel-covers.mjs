// Makes the typographic web-novel covers in assets/webnovels/covers/.
// Each cover carries only the title and the author, in the same 768 × 1152
// WebP frame as the classic covers, with a colour, a frame and one simple
// line ornament chosen from the story's own synopsis:
//   - Cinnamon Bun (RavensDagger): a wholesome, cosy fantasy adventure whose
//     heroine cleans, gardens and befriends her enemies. Warm cream and
//     cinnamon brown, a cinnamon-roll swirl, small cleaning sparkles, and a
//     soft rounded frame like a friendly game menu window.
//   - Chasing Sunlight (InadvisablyCompelled): an airship expedition through
//     a world without daylight, toward a sunlight nobody believes in. Near
//     black night, one low warm glow in the east, a line-drawn airship, and a
//     thin brass chart frame with compass ticks.
// Author names keep their exact case. The authors' own cover art is never
// used or imitated; every shape below is drawn here from plain SVG lines.
// Run: node tools/make-webnovel-covers.mjs (needs Playwright Chromium).
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = resolve(root, 'assets/webnovels/covers');
const font = readFileSync(resolve(root, 'assets/fonts/fraunces-latin.woff2')).toString('base64');

// A cinnamon-roll swirl: an Archimedean spiral of three and a half turns.
function spiral(cx, cy, turns, gap){
  const points = [];
  const steps = Math.round(turns * 80);
  for(let step = 0; step <= steps; step++){
    const angle = step / steps * Math.PI * 2 * turns, radius = 6 + angle * gap;
    points.push(`${(cx + radius * Math.cos(angle)).toFixed(1)} ${(cy + radius * Math.sin(angle)).toFixed(1)}`);
  }
  return 'M' + points.join(' L');
}
// A four-point sparkle centred on (x, y).
function sparkle(x, y, r){
  const k = r * .22;
  return `M${x} ${y - r} Q${x + k} ${y - k} ${x + r} ${y} Q${x + k} ${y + k} ${x} ${y + r} Q${x - k} ${y + k} ${x - r} ${y} Q${x - k} ${y - k} ${x} ${y - r} Z`;
}

const cinnamon = {
  ink: '#7A3B1C', soft: '#B9784C', paper: '#F8ECDB', paperDeep: '#F0D9BB',
};
const night = {
  ink: '#F1DEB4', brass: '#C7A266', dim: 'rgba(199,162,102,.38)', sky: '#0D111D', skyLow: '#1B2134', glow: '#E9A75A',
};

const COVERS = [
  {
    id: 'cinnamon-bun', title: 'Cinnamon Bun', author: 'RavensDagger',
    css: `
      body{background:linear-gradient(180deg,${cinnamon.paper} 0%,${cinnamon.paperDeep} 100%);color:${cinnamon.ink};}
      .window{position:absolute;left:58px;right:58px;top:70px;bottom:70px;border:3px solid ${cinnamon.soft};border-radius:44px;}
      .window::before{content:"";position:absolute;left:0;right:0;top:64px;border-top:2px solid ${cinnamon.soft};opacity:.7;}
      .dots{position:absolute;left:96px;top:96px;display:flex;gap:14px;}
      .dots i{width:14px;height:14px;border-radius:50%;background:${cinnamon.soft};opacity:.75;}
      svg{position:absolute;left:0;top:0;width:768px;height:1152px;}
      h1{position:absolute;left:0;right:0;top:640px;margin:0;text-align:center;font-weight:600;
        font-size:124px;line-height:.98;letter-spacing:-.015em;font-variation-settings:'opsz' 144;}
      .author{position:absolute;left:0;right:0;bottom:142px;text-align:center;font-weight:500;
        font-size:38px;letter-spacing:.05em;color:${cinnamon.soft};}`,
    body: `<div class="window"></div><div class="dots"><i></i><i></i><i></i></div>
      <svg viewBox="0 0 768 1152" aria-hidden="true">
        <circle cx="384" cy="420" r="176" fill="${cinnamon.paper}" stroke="${cinnamon.soft}" stroke-width="3"/>
        <path d="${spiral(384, 420, 3.5, 7)}" fill="none" stroke="${cinnamon.ink}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>
        <g fill="${cinnamon.soft}">
          <path d="${sparkle(604, 262, 30)}"/><path d="${sparkle(176, 560, 22)}"/>
          <path d="${sparkle(626, 548, 16)}"/><path d="${sparkle(150, 300, 14)}"/>
        </g>
      </svg>
      <h1>Cinnamon<br>Bun</h1><div class="author">RavensDagger</div>`,
  },
  {
    id: 'chasing-sunlight', title: 'Chasing Sunlight', author: 'InadvisablyCompelled',
    css: `
      body{background:
          radial-gradient(ellipse 72% 26% at 50% 70%,rgba(233,167,90,.55) 0%,rgba(233,167,90,.16) 45%,rgba(233,167,90,0) 75%),
          linear-gradient(180deg,${night.sky} 0%,${night.sky} 40%,${night.skyLow} 100%);color:${night.ink};}
      .frame{position:absolute;inset:52px;border:1.5px solid ${night.dim};}
      .frame::after{content:"";position:absolute;inset:12px;border:1px solid ${night.dim};}
      svg{position:absolute;left:0;top:0;width:768px;height:1152px;}
      h1{position:absolute;left:0;right:0;top:196px;margin:0;text-align:center;font-weight:500;
        font-size:112px;line-height:1.02;letter-spacing:.01em;font-variation-settings:'opsz' 144;}
      .rule{position:absolute;left:334px;width:100px;top:458px;border-top:1.5px solid ${night.brass};}
      .author{position:absolute;left:0;right:0;bottom:122px;text-align:center;font-weight:500;
        font-size:30px;letter-spacing:.12em;color:${night.brass};}`,
    body: `<div class="frame"></div>
      <svg viewBox="0 0 768 1152" aria-hidden="true">
        <g stroke="${night.brass}" stroke-width="2" stroke-linecap="round" opacity=".8">
          ${Array.from({length: 13}, (_, i) => {const x = 144 + i * 40, long = i % 3 === 0;
            return `<path d="M${x} 78 v${long ? 18 : 10}"/>`;}).join('')}
        </g>
        <path d="M66 806 H702" stroke="${night.brass}" stroke-width="1.5" opacity=".55"/>
        <g fill="none" stroke="${night.ink}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">
          <ellipse cx="384" cy="604" rx="168" ry="52"/>
          <path d="M232 584 C300 570 468 570 536 584" opacity=".55"/>
          <path d="M232 624 C300 638 468 638 536 624" opacity=".55"/>
          <path d="M222 604 L176 572 L182 604 L176 636 Z"/>
          <path d="M330 654 L346 684 H422 L438 654"/>
          <path d="M346 684 V698 H422 V684"/>
          <path d="M368 691 h6 M392 691 h6"/>
        </g>
        <g stroke="${night.glow}" stroke-width="2" stroke-linecap="round" opacity=".7">
          <path d="M384 790 V760"/><path d="M332 794 l-14 -22"/><path d="M436 794 l14 -22"/>
          <path d="M288 802 l-24 -12"/><path d="M480 802 l24 -12"/>
        </g>
      </svg>
      <h1>Chasing<br>Sunlight</h1><div class="rule"></div><div class="author">InadvisablyCompelled</div>`,
  },
];

function page(cover){
  return `<!doctype html><meta charset="utf-8"><style>
  @font-face{font-family:F;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:500 600;}
  html,body{margin:0;width:768px;height:1152px;overflow:hidden;}
  body{position:relative;font-family:F,Georgia,serif;}
  ${cover.css}
  </style>${cover.body}`;
}

mkdirSync(out, {recursive: true});
const browser = await chromium.launch();
try{
  const tab = await browser.newPage({viewport: {width: 768, height: 1152}, deviceScaleFactor: 1});
  for(const cover of COVERS){
    await tab.setContent(page(cover));
    await tab.evaluate(() => document.fonts.ready);
    const png = await tab.screenshot({type: 'png'});
    if(process.env.COVER_PNG) writeFileSync(resolve(process.env.COVER_PNG, cover.id + '.png'), png);
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
