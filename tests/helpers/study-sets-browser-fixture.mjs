import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';

export function studySetFixture(size,cardsPerSet=100){
 const cards=Array.from({length:cardsPerSet},(_,i)=>({id:JSON.stringify(['word '+i,'뜻 '+i]),key:'word-'+i,word:'word '+i,ko:'뜻 '+i,example:'An example for word '+i+'.',book:'Fixture book',addedAt:i+1,status:1}));
 return {version:2,sequence:size*2,sets:Array.from({length:size},(_,i)=>({id:'set-'+(i+1),name:'Fixture '+(i+1),bookTitles:['Fixture book'],createdAt:100,updatedAt:100,cards,excludedIds:[],session:{id:'session-'+(i+1),startedAt:100,round:1,queue:cards,index:0,answers:[],revealed:false,format:2,serial:0}}))};
}

export async function serveStudyFixture({uiSource,instrument=false}={}){
 const root=fileURLToPath(new URL('../../',import.meta.url));
 const server=createServer((req,res)=>{
  try{
   const path=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));
   if(!path.startsWith(root))throw Error('outside fixture root');
   let body=readFileSync(path);
   if(path.endsWith('/scripts/ui/study-sets.js')&&uiSource)body=readFileSync(uiSource);
   if(instrument&&path.endsWith('/scripts/core/study-sets.js'))body=body.toString().replace('function normalize(raw){','function normalize(raw){ window.studyListMetrics.normalizes++;');
   res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'})[extname(path)]||'application/octet-stream');res.end(body);
  }catch{res.writeHead(404).end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 return {url:`http://127.0.0.1:${server.address().port}/`,close:()=>new Promise(r=>server.close(r))};
}

export async function prepareStudyPage(page,url){
 await page.addInitScript(()=>{localStorage.setItem('breeze.onboarding.v1','"done"');window.studyListMetrics={normalizes:0,dom:0,hiddenDom:0};});
 await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
 await page.goto(url);await page.evaluate(()=>homeReady);
}
