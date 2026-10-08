/* Usage: node tests/measure-runtime-footprint.mjs /path/to/www > result.json
   gzip/Brotli totals compress each file separately; they are not network or IPA sizes. */
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {gzipSync,brotliCompressSync,constants} from 'node:zlib';
const root=resolve(process.argv[2]||'www');
function walk(dir=''){return readdirSync(join(root,dir),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);}
const sizes=new Map();
function bytes(path){if(!sizes.has(path)){const data=readFileSync(join(root,path));sizes.set(path,{raw:data.length,gzip9:gzipSync(data,{level:9}).length,brotli11:brotliCompressSync(data,{params:{[constants.BROTLI_PARAM_QUALITY]:11}}).length});}return sizes.get(path);}
function measure(files){return {files:files.length,...Object.fromEntries(['raw','gzip9','brotli11'].map(key=>[key,files.reduce((n,p)=>n+bytes(p)[key],0)]))};}
const html=readFileSync(join(root,'index.html'),'utf8');
const entry=[...html.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)="(?!https?:|\/\/|data:|#)([^"]+)"/g)].map(m=>m[1].split('?')[0]);
const js=entry.filter(p=>p.endsWith('.js')),css=entry.filter(p=>p.endsWith('.css'));
const fonts=[...readFileSync(join(root,'styles/fonts.css'),'utf8').matchAll(/url\(\.\.\/([^)"']+)\)/g)].map(m=>m[1].split('?')[0]);
console.log(JSON.stringify({method:'Per-file raw/gzip-9/Brotli-11; unpacked www and shell, not IPA/APK/network transfer or speed.',native:measure(walk()),startupJS:measure(js),startupCSS:measure(css),shell:measure([...new Set(['index.html',...js,...css,...fonts])])},null,2));
