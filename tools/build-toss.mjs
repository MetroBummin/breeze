/* Apps in Toss web bundle.
 *
 *     npm run toss
 *
 * Copies the same static app the native shell uses, then marks it as the toss
 * target and drops login, import, and outbound links from the page. Web, iOS
 * and Android keep building from the untouched index.html.
 */
import { readdirSync, statSync, mkdirSync, copyFileSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'toss/dist');

const FILES = ['index.html', 'config.js'];
const DIRS  = ['scripts', 'styles', 'assets', 'modules', 'public'];
const SKIP = /(^|\/)\.DS_Store$|^scripts\/library\/samples\.js$|^assets\/samples\/|^assets\/brand\/icons\/|^assets\/brand\/wordmarks\/.*\.png$|^assets\/brand\/(?:app-icon\.svg|README\.md|breeze-day(?:-wide)?\.(?:jpg|avif))$|^assets\/fonts\/gowun-batang-ui\.txt$/;
const PARKED = /^(?:assets\/brand\/review\/|assets\/brand\/thunderhead-round\.png$|modules\/(?:exam-shorts|dict-seed)\/|scripts\/vendor\/ts-fsrs-5\.4\.2\.js$|scripts\/core\/vocabulary-review\.js$|scripts\/sync\/dormant\/)/;
/* PDF.js calls eval. JSZip builds functions. Neither is on the toss path. */
const TOSS_OMIT = /^(?:assets\/lib\/pdf-|assets\/lib\/jszip-|assets\/lib\/qrcode-|assets\/lib\/readability-)/;

export function transformTossHtml(html){
  let outHtml=String(html);
  if(!outHtml.includes("window.BREEZE_TARGET='toss'")){
    outHtml=outHtml.replace('<head>','<head>\n  <script>window.BREEZE_TARGET=\'toss\';</script>');
  }
  outHtml=outHtml.replace('<html lang="ko">','<html lang="ko" data-breeze-target="toss">');
  outHtml=outHtml.replace(/<meta name="theme-color" content="#171816"[^>]*>\s*/,'');
  outHtml=removeOuterTag(outHtml,'span','login-nudge');
  outHtml=removeOuterTag(outHtml,'button','home-add');
  outHtml=removeOuterTag(outHtml,'input','fileinput');
  outHtml=removeOuterTag(outHtml,'input','onboard-fileinput');
  outHtml=removeOuterTag(outHtml,'input','original-fileinput');
  outHtml=removeFromOpenToClose(outHtml,'<dialog id="add-modal"','</dialog>');
  outHtml=outHtml.replace(/<button type="button" data-kind="articles"[^>]*>기사<\/button>\s*/,'');
  outHtml=outHtml.replace(/<img\b[^>]*\bsrc="assets\/samples\/[^"]*"[^>]*>/g,'');
  if(!outHtml.includes('styles/toss.css')){
    outHtml=outHtml.replace('</head>','  <link rel="stylesheet" href="styles/toss.css">\n</head>');
  }
  if(!outHtml.includes('scripts/platform/toss-boot.js')){
    outHtml=outHtml.replace(
      /(<script defer src="scripts\/main\.js[^"]*"><\/script>)/,
      '$1\n  <script defer src="scripts/platform/toss-boot.js"></script>');
  }
  return outHtml;
}

function removeOuterTag(html,tag,id){
  const paired=new RegExp('<'+tag+'\\b[^>]*\\bid="'+id+'"[\\s\\S]*?</'+tag+'>\\s*','i');
  if(paired.test(html)) return html.replace(paired,'');
  const single=new RegExp('<'+tag+'\\b[^>]*\\bid="'+id+'"[^>]*>\\s*','i');
  return html.replace(single,'');
}

function removeFromOpenToClose(html,open,close){
  const start=html.indexOf(open);
  if(start<0) return html;
  const end=html.indexOf(close,start);
  if(end<0) return html;
  return html.slice(0,start)+html.slice(end+close.length);
}

export function transformTossConfig(source){
  return String(source)
    .replace(/RSS_CATALOG:\s*true/,'RSS_CATALOG: false')
    .replace(/BOOK_CLOUD:\s*true/,'BOOK_CLOUD: false')
    .replace(/INK_SYNC:\s*true/,'INK_SYNC: false');
}

function copyInto(sourcePath){
  const stat=statSync(sourcePath);
  if(stat.isDirectory()){
    for(const name of readdirSync(sourcePath)) copyInto(join(sourcePath,name));
    return;
  }
  const rel=relative(root,sourcePath);
  if(SKIP.test(rel)||PARKED.test(rel)||TOSS_OMIT.test(rel)) return;
  const target=resolve(out,rel);
  mkdirSync(dirname(target),{recursive:true});
  copyFileSync(sourcePath,target);
}

export async function buildToss(){
  if(!/const ADVANCED_VOCABULARY_REVIEW_ENABLED=false;/.test(readFileSync(resolve(root,'scripts/ui/vocabulary-review.js'),'utf8'))){
    throw new Error('Advanced review requires restoring its entry scripts and native assets before packaging.');
  }
  if(existsSync(out)) rmSync(out,{recursive:true,force:true});
  mkdirSync(out,{recursive:true});
  for(const name of [...FILES,...DIRS]){
    const path=resolve(root,name);
    if(!existsSync(path)) continue;
    copyInto(path);
  }
  const indexPath=resolve(out,'index.html');
  writeFileSync(indexPath,transformTossHtml(readFileSync(indexPath,'utf8')));
  const configPath=resolve(out,'config.js');
  writeFileSync(configPath,transformTossConfig(readFileSync(configPath,'utf8')));
  await esbuild.build({
    entryPoints:[resolve(root,'scripts/platform/toss-entry.mjs')],
    bundle:true,
    format:'iife',
    platform:'browser',
    target:'es2020',
    legalComments:'none',
    outfile:resolve(out,'scripts/platform/toss-boot.js'),
  });
  return out;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const built=await buildToss();
  console.log('toss bundle ready: '+relative(root,built));
}
