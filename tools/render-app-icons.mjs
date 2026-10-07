// Canonical selected b icon; static SVG gloss, not native Liquid Glass layers.
import {chromium} from 'playwright';
import {readFileSync,mkdirSync,writeFileSync,copyFileSync} from 'node:fs';
import {dirname} from 'node:path';
const browser=await chromium.launch({executablePath:process.env.BREEZE_CHROMIUM||undefined});
async function render(source,size,target,transparent=false){
 mkdirSync(dirname(target),{recursive:true});const page=await browser.newPage({viewport:{width:size,height:size}});
 await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;background:${transparent?'transparent':'#2c2c2e'};}svg{display:block;width:100%;height:100%;}</style>${readFileSync(source,'utf8')}`);
 await page.screenshot({path:target,omitBackground:transparent});await page.close();
}
try{
 for(const [size,path] of [[1024,'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'],[512,'assets/favicon/icon-512.png'],[192,'assets/favicon/icon-192.png'],[180,'assets/favicon/apple-touch-icon.png'],[64,'assets/favicon/favicon.png']])await render('assets/brand/app-icon.svg',size,path);
 copyFileSync('assets/favicon/icon-512.png','android/app/src/main/res/mipmap-nodpi/ic_launcher.png');
 for(const [density,size] of [['mdpi',108],['hdpi',162],['xhdpi',216],['xxhdpi',324],['xxxhdpi',432]]){
  await render('assets/brand/icons/android-b-foreground.svg',size,`android/app/src/main/res/drawable-${density}/breeze_icon_foreground.png`,true);
  await render('assets/brand/icons/android-b-monochrome.svg',size,`android/app/src/main/res/drawable-${density}/breeze_icon_monochrome.png`,true);
 }
 for(const api of [26,33]){
  const dir=`android/app/src/main/res/mipmap-anydpi-v${api}`;mkdirSync(dir,{recursive:true});
  writeFileSync(`${dir}/ic_launcher.xml`,`<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@color/breeze_icon_background" />\n    <foreground android:drawable="@drawable/breeze_icon_foreground" />\n${api===33?'    <monochrome android:drawable="@drawable/breeze_icon_monochrome" />\n':''}</adaptive-icon>\n`);
 }
 for(const size of [192,512])await render('assets/brand/icons/web-b-maskable.svg',size,`assets/favicon/icon-maskable-${size}.png`);
 await render('assets/brand/icons/web-b-maskable-foreground.svg',512,'assets/brand/icons/web-b-maskable-foreground.png',true);
 for(const mark of ['b','br'])for(const color of ['neutral','flow'])for(const theme of ['light','dark'])await render(`assets/brand/icons/icon-${mark}-${color}-${theme}.svg`,1024,`assets/brand/icons/icon-${mark}-${color}-${theme}-1024.png`);
}finally{await browser.close();}
console.log('Selected b: iOS1024; Web512/192/180/64 + maskable; Android legacy + density-specific adaptive/themed layers rendered.');
