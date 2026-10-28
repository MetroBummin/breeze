/* Convert the four onboarding card clips to infinite-loop 60fps animated WebP.

   Why: on iPhone/TestFlight the <video> cards sometimes show the Safari play
   button and do not always start from frame 0. An animated WebP in an <img>
   needs no autoplay, no NotAllowedError handling, no poster, and loops from
   frame 0 forever, so the whole video/autoplay machinery is deleted (FEAT-001)
   and the cards become images produced by this script.

   Sources (assets/onboarding-carousel/, dimensions preserved, not rescaled):
     card1.mp4       phone  (9:16)  -> card1.webp
     card1-wide.mp4  wide   (4:3)   -> card1-wide.webp
     card2.mp4       phone  (9:16)  -> card2.webp
     card2-wide.mp4  wide   (4:3)   -> card2-wide.webp
   The onboarding surface is forced light in both themes, so these clips have
   NO dark variants: do NOT generate card*-dark.webp.

   Encoders, in order of preference (detected up front):
     1. ffmpeg built with the libwebp_anim encoder (single pass).
     2. img2webp (libwebp) fed per-frame PNGs that ffmpeg extracts; needs both
        ffmpeg (frame extraction) and img2webp.
   If no WebP-capable encoder is available this script prints what to install
   and exits NON-ZERO WITHOUT writing any output - it never emits empty or
   placeholder .webp files.

   Run (in an environment with ffmpeg+libwebp):  npm run onboarding:webp

   Mirrors the ffmpeg-spawn convention in tools/capture-study-onboarding.mjs
   (spawnSync('ffmpeg',['-y','-loglevel','error','-framerate','60', ...]) with
   status checking). No new dependencies. */
import {existsSync,mkdirSync,rmSync,readdirSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

const DIR=resolve('assets/onboarding-carousel');
const FPS=60;            // 60fps per the task
const QUALITY=88;        // high quality, sharp on Retina phones (0-100)
const FRAME_MS=16;       // ~1000/60 per-frame delay for the img2webp fallback
const CARDS=[
 {src:'card1.mp4',out:'card1.webp',framing:'phone 9:16'},
 {src:'card1-wide.mp4',out:'card1-wide.webp',framing:'wide 4:3'},
 {src:'card2.mp4',out:'card2.webp',framing:'phone 9:16'},
 {src:'card2-wide.mp4',out:'card2-wide.webp',framing:'wide 4:3'},
];

const commas=n=>n.toLocaleString('en-US');
const size=p=>statSync(p).size;

// Does `bin` exist and run? (spawnSync error means the binary is absent.)
function hasBinary(bin,args){
 const r=spawnSync(bin,args,{encoding:'utf8'});
 return !r.error;
}

// ffmpeg counts as WebP-capable only when it lists the libwebp_anim encoder.
function ffmpegHasWebpAnim(){
 if(!hasBinary('ffmpeg',['-version']))return false;
 const r=spawnSync('ffmpeg',['-hide_banner','-encoders'],{encoding:'utf8'});
 if(r.error||r.status!==0)return false;
 return /\blibwebp_anim\b/.test(r.stdout||'');
}

const ffmpegAvailable=hasBinary('ffmpeg',['-version']);
const ffmpegWebp=ffmpegHasWebpAnim();
const img2webpAvailable=hasBinary('img2webp',['-version']);
// img2webp still needs ffmpeg to extract the PNG frames it stitches together.
const fallbackAvailable=img2webpAvailable&&ffmpegAvailable;

if(!ffmpegWebp&&!fallbackAvailable){
 console.error('No WebP-capable encoder found. Install ONE of:');
 console.error('  * ffmpeg built with libwebp (provides the libwebp_anim encoder), e.g. `brew install ffmpeg` or a build whose `ffmpeg -encoders` lists libwebp_anim, or');
 console.error('  * the libwebp tools (img2webp, which also needs ffmpeg to extract frames), e.g. `brew install webp ffmpeg` or `apt-get install webp ffmpeg`.');
 if(ffmpegAvailable&&!ffmpegWebp)console.error('Note: ffmpeg was found but its build lacks the libwebp_anim encoder; install a libwebp-enabled ffmpeg or add img2webp.');
 console.error('No output written.');
 process.exit(1);
}

const engine=ffmpegWebp?'ffmpeg libwebp_anim':'img2webp (ffmpeg frame extraction)';
console.log(`Encoding onboarding cards -> animated WebP (${FPS}fps, loop forever, q=${QUALITY}) via ${engine}.`);

// Single-pass ffmpeg libwebp_anim encode. Keeps source dimensions (fps filter
// only), loop 0 = infinite, -an drops audio.
function encodeWithFfmpeg(src,out){
 const r=spawnSync('ffmpeg',['-y','-loglevel','error','-i',src,
  '-vf',`fps=${FPS}`,
  '-c:v','libwebp_anim','-lossless','0','-q:v',String(QUALITY),
  '-loop','0','-preset','picture','-an',out],{encoding:'utf8'});
 if(r.status!==0)throw new Error(`ffmpeg failed for ${src}: ${r.stderr||r.error}`);
}

// Fallback: ffmpeg extracts 60fps PNG frames at native size, img2webp stitches
// them into an infinite-loop animated WebP with ~16ms per frame (~60fps).
function encodeWithImg2webp(src,out){
 const frames=resolve('/tmp/breeze-onboarding-webp-frames',out.replace(/\W+/g,'_'));
 rmSync(frames,{recursive:true,force:true});
 mkdirSync(frames,{recursive:true});
 try{
  const extract=spawnSync('ffmpeg',['-y','-loglevel','error','-i',src,
   '-vf',`fps=${FPS}`,resolve(frames,'%05d.png')],{encoding:'utf8'});
  if(extract.status!==0)throw new Error(`ffmpeg frame extraction failed for ${src}: ${extract.stderr||extract.error}`);
  const pngs=readdirSync(frames).filter(f=>f.endsWith('.png')).sort()
   .map(f=>resolve(frames,f));
  if(!pngs.length)throw new Error(`no frames extracted from ${src}`);
  const r=spawnSync('img2webp',['-loop','0','-d',String(FRAME_MS),
   '-q',String(QUALITY),...pngs,'-o',out],{encoding:'utf8'});
  if(r.status!==0)throw new Error(`img2webp failed for ${src}: ${r.stderr||r.error}`);
 }finally{
  rmSync(frames,{recursive:true,force:true});
 }
}

const missing=CARDS.filter(c=>!existsSync(resolve(DIR,c.src)));
if(missing.length){
 console.error(`Missing source clips: ${missing.map(c=>c.src).join(', ')} under ${DIR}`);
 console.error('No output written.');
 process.exit(1);
}

for(const card of CARDS){
 const src=resolve(DIR,card.src),out=resolve(DIR,card.out);
 if(ffmpegWebp)encodeWithFfmpeg(src,out);
 else encodeWithImg2webp(src,out);
 // Before vs after byte-size report, per the task requirement.
 console.log(`${card.src} ${commas(size(src))} B -> ${card.out} ${commas(size(out))} B (${card.framing})`);
}

console.log(`Done. Wrote ${CARDS.length} animated WebP cards to ${DIR}.`);
