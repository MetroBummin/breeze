// Render the approved traced vector for native asset catalogs. No app build.
import {chromium} from 'playwright';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
const browser=await chromium.launch({executablePath:process.env.BREEZE_CHROMIUM||undefined});
try{
 mkdirSync('docs/qa/breeze-wordmark',{recursive:true});
 for(const theme of ['light','dark']){
  const page=await browser.newPage({viewport:{width:1024,height:400}});
  await page.setContent(`<style>html,body{margin:0;height:100%;display:grid;place-items:center;background:${theme==='dark'?'#20211e':'#fbfcfc'};}svg{width:842px;height:auto;}</style>${readFileSync(`assets/brand/wordmarks/breeze-flow-${theme}.svg`,'utf8')}`);
  await page.screenshot({path:`docs/qa/breeze-wordmark/wordmark-${theme}.png`});await page.close();
 }
 for(const theme of ['light','dark']){
  const dir=`ios/App/App/Assets.xcassets/BreezeWordmark.imageset`;mkdirSync(dir,{recursive:true});
  for(const scale of [1,2,3]){
   const page=await browser.newPage({viewport:{width:220*scale,height:68*scale}});
   await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;display:grid;place-items:center;}svg{width:100%;height:auto;}</style>${readFileSync(`assets/brand/wordmarks/breeze-flow-${theme}.svg`,'utf8')}`);
   await page.screenshot({path:`${dir}/wordmark-${theme}-${scale}x.png`,omitBackground:true});await page.close();
  }
 }
 const images=['light','dark'].flatMap(theme=>[1,2,3].map(scale=>({idiom:'universal',filename:`wordmark-${theme}-${scale}x.png`,scale:`${scale}x`,...(theme==='dark'?{appearances:[{appearance:'luminosity',value:'dark'}]}:{})})));
 writeFileSync('ios/App/App/Assets.xcassets/BreezeWordmark.imageset/Contents.json',JSON.stringify({images,info:{version:1,author:'xcode'}},null,2)+'\n');
 // Icon generation has one owner; never restore the historical br default.
 await import('./render-app-icons.mjs');
}finally{await browser.close();}
