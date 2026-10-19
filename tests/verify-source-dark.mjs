import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const geometry=read('scripts/reader/pdf-word-geometry.js');
const pdf=read('scripts/reader/pdf-original.js');
const epub=read('scripts/reader/epub-original.js');
const readerCss=read('styles/reader.css');
const inkCss=read('styles/pdf-ink.css');
const tokens=read('styles/tokens.css');
const design=read('DESIGN.md');

const ops={
  save:10,restore:11,transform:12,
  paintFormXObjectBegin:74,paintFormXObjectEnd:75,
  beginGroup:76,endGroup:77,
  paintImageMaskXObject:83,paintImageMaskXObjectGroup:84,
  paintImageXObject:85,paintInlineImageXObject:86,paintInlineImageXObjectGroup:87,
  paintImageXObjectRepeat:88,paintImageMaskXObjectRepeat:89,paintSolidColorImageMask:90,
};

function loadPdf(){
  const requests=[];
  const context={
    console,Map,Set,WeakMap,Math,Number,Uint8ClampedArray,performance:{now:()=>0},
    setTimeout,clearTimeout,
    document:{body:{classList:{contains:()=>false}},addEventListener(){},getElementById:()=>null},
    window:{addEventListener(){}},
    registerReaderSurface(){},
    originalSession:null,originalLoadToken:1,curBook:{id:'book',original:{hash:'h'}},
  };
  vm.createContext(context);
  vm.runInContext(geometry+'\n'+pdf,context,{filename:'pdf-original.js'});
  context.renderOriginalPdfPage=(session,pageNumber,options)=>{
    requests.push({pageNumber,options});
    return Promise.resolve();
  };
  return {context,requests};
}

test('inset photos are restored and tiny masks are not',()=>{
  const {context}=loadPdf();
  const images=[
    {mask:false,width:120,height:80},
    {mask:false,width:12,height:12},
    {mask:false,width:400,height:8},
    {mask:true,width:200,height:200},
  ];
  const plan=context.pdfPhotoPlan(images,600,800);
  assert.equal(plan.scan,false);
  assert.deepEqual(plan.photos.map(img=>img.width),[120]);
});

test('one full-page image is a dimmed scan, not a restored photo',()=>{
  const {context}=loadPdf();
  const scan=context.pdfPhotoPlan([{mask:false,width:580,height:760}],600,800);
  assert.equal(scan.scan,true);
  assert.equal(scan.photos.length,0);
  const mixed=context.pdfPhotoPlan([
    {mask:false,width:580,height:760},
    {mask:false,width:80,height:80},
  ],600,800);
  assert.equal(mixed.scan,false);
  assert.deepEqual(mixed.photos.map(img=>img.width),[80]);
});

test('image rects follow the viewport transform and save/restore',()=>{
  const {context}=loadPdf();
  const viewport={transform:[1,0,0,-1,0,792]};
  const list={
    fnArray:[ops.save,ops.transform,ops.paintImageXObject,ops.restore,ops.paintImageMaskXObject],
    argsArray:[[],[100,0,0,80,72,400],['Im1'],[],['Mask']],
  };
  const rects=context.pdfPhotoRects(list,viewport,2,ops);
  assert.equal(rects.length,2);
  const photo=rects[0];
  assert.equal(photo.mask,false);
  assert.ok(Math.abs(photo.left-144)<0.01,photo.left);
  assert.ok(Math.abs(photo.top-624)<0.01,photo.top);
  assert.ok(Math.abs(photo.width-200)<0.01,photo.width);
  assert.ok(Math.abs(photo.height-160)<0.01,photo.height);
  assert.equal(rects[1].mask,true);
  assert.ok(Math.abs(rects[1].left)<0.01,'a restored transform leaked into the next image');
});

test('form and repeated images use the current transform',()=>{
  const {context}=loadPdf();
  const viewport={transform:[1,0,0,-1,0,100]};
  const list={
    fnArray:[ops.paintFormXObjectBegin,ops.paintImageXObject,ops.paintFormXObjectEnd,ops.paintImageXObjectRepeat],
    argsArray:[[[50,0,0,40,10,20]],['Im'],[],['Im',10,10,[0,0,20,0]]],
  };
  const rects=context.pdfPhotoRects(list,viewport,1,ops).filter(img=>!img.mask);
  assert.equal(rects.length,3);
  assert.ok(Math.abs(rects[0].width-50)<0.01);
  assert.ok(Math.abs(rects[0].height-40)<0.01);
  assert.ok(Math.abs(rects[1].width-10)<0.01&&Math.abs(rects[2].left-rects[1].left-20)<0.01);
});

test('a theme change repaints settled PDF pages',()=>{
  const {context,requests}=loadPdf();
  const session={kind:'pdf',loadToken:1,bookId:'book',hash:'h',pages:[{},{}],
    settled:new Set([1,2]),drawnAt:new Map([[1,2],[2,1]]),paintedDark:new Map([[1,false]])};
  context.originalSession=session;
  context.curBook={id:'book',original:{hash:'h'}};
  context.document.body.classList.contains=name=>name==='dark';
  context.repaintOriginalPdfForTheme();
  assert.equal(session.drawnAt.get(1),0);
  assert.deepEqual(requests.map(item=>item.pageNumber),[1,2]);
  assert.ok(requests.every(item=>item.options.theme&&item.options.resharpen));
});

function loadEpub(){
  const context={console,Map,Set,WeakMap,Math,Number,document:{getElementById:()=>null},window:{},registerReaderSurface(){}};
  vm.createContext(context);
  vm.runInContext(epub,context,{filename:'epub-original.js'});
  return context;
}
function cssColorRules(css){
  const rules=[];
  for(const block of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
    const color=block[2].match(/(?:^|;)color:([^;]+)/);
    if(!color) continue;
    const declared=color[1].trim();
    const important=declared.endsWith('!important');
    const paint=important?declared.slice(0,-'!important'.length).trim():declared;
    for(const selector of block[1].split(',')){
      rules.push({selector:selector.trim(),paint,important,index:rules.length});
    }
  }
  return rules;
}
function colorSpecificity(selector){
  const classes=(selector.match(/\.[A-Za-z0-9_-]+/g)||[]).length;
  const pseudos=(selector.match(/:[A-Za-z-]+/g)||[]).length;
  const elements=(selector.replace(/\.[A-Za-z0-9_-]+/g,'').replace(/:[A-Za-z-]+/g,'').match(/[A-Za-z]+/g)||[]).length;
  return classes*1000+pseudos*1000+elements;
}
function colorRuleMatches(selector,el){
  if(selector.startsWith('.')) return el.classes.includes(selector.slice(1));
  const [name,pseudo]=selector.split(':');
  return name===el.tag && (!pseudo || el.pseudo===pseudo);
}
function authorColor(rules,el){
  const hits=rules.filter(rule=>colorRuleMatches(rule.selector,el));
  const important=hits.some(rule=>rule.important);
  const pool=(important?hits.filter(rule=>rule.important):hits)
    .sort((a,b)=>colorSpecificity(a.selector)-colorSpecificity(b.selector)||a.index-b.index);
  return pool.at(-1)?.paint||null;
}
function paintedColor(rules,el){
  const authorImportant=rules.some(rule=>rule.important&&colorRuleMatches(rule.selector,el));
  if(el.inline && (el.inlineImportant || !authorImportant)) return el.inline;
  return authorColor(rules,el);
}

test('EPUB dark stylesheet recolors text and leaves pictures alone',()=>{
  const css=loadEpub().epubDarkStyleText({paper:'#2c2a26',ink:'#E7E1D4',link:'#78C9EA'});
  assert.match(css,/html,body\{background:#2c2a26!important;color:#E7E1D4!important\}/);
  assert.match(css,/p,li,blockquote[\s\S]*\{color:#E7E1D4!important\}/);
  assert.match(css,/a,a:visited\{color:#78C9EA!important\}/);
  assert.doesNotMatch(css,/img|svg|video|filter/);
});

test('EPUB dark text color leaves the lookup copy transparent',()=>{
  const css=loadEpub().epubDarkStyleText({paper:'#2c2a26',ink:'#E7E1D4',link:'#78C9EA'});
  const rules=cssColorRules(css);
  const marker={tag:'span',classes:['breeze-original-word','original-selection-marker','s1'],inline:'transparent'};
  assert.equal(paintedColor(rules,marker),'transparent');
  assert.equal(paintedColor(rules.filter(rule=>rule.selector!=='.original-selection-marker'),marker),'#E7E1D4');
  assert.equal(paintedColor(rules,{tag:'span',classes:['breeze-original-word','s1']}),'#E7E1D4');
  assert.equal(paintedColor(rules,{tag:'p',classes:[]}),'#E7E1D4');
  assert.equal(paintedColor(rules,{tag:'a',classes:[],pseudo:'visited'}),'#78C9EA');
  assert.doesNotMatch(css,/::highlight|breeze-saved|original-saved-marker/);
  assert.match(epub,/marker\.style\.cssText=`[^`]*color:transparent/);
});

test('a canvas that ignores ctx.filter tints paper to the EPUB sheet and dims a scan',()=>{
  const {context}=loadPdf();
  const data=new Uint8ClampedArray([255,255,255,255, 0,0,0,255, 100,100,100,255]);
  context.pdfBakeFilterPixels(data,'invert(1) hue-rotate(180deg)');
  assert.deepEqual([...data.slice(0,8)],[0x2c,0x2a,0x26,255, 0xe7,0xe1,0xd4,255]);
  const mid=data.slice(8,11);
  assert.ok(mid[0]>0x2c&&mid[0]<0xe7&&mid[1]>0x2a&&mid[1]<0xe1&&mid[2]>0x26&&mid[2]<0xd4);
  const dim=new Uint8ClampedArray([255,255,255,255, 0,10,20,255]);
  context.pdfBakeFilterPixels(dim,'brightness(0.82)');
  assert.deepEqual([...dim],[209,209,209,255, 0,8,16,255]);
});

test('dark source pages are baked, not filtered at pinch time',()=>{
  assert.match(pdf,/pageColors:colors/);
  assert.match(pdf,/invert\(1\) hue-rotate\(180deg\)/);
  assert.match(pdf,/brightness\(\$\{PDF_SCAN_BRIGHTNESS\}\)/);
  assert.match(pdf,/releasePdfPhotoScratch/);
  assert.doesNotMatch(readerCss,/#original-zoom\{[^}]*filter/);
  assert.doesNotMatch(readerCss,/\.epub-chapter-frame\{[^}]*filter/);
  assert.match(readerCss,/body\.dark \.pdf-source-page>\.breeze-original-word\{mix-blend-mode:screen;\}/);
  assert.match(inkCss,/body\.dark \.pdf-source-page > \.pdf-ink-layer\{mix-blend-mode:normal;\}/);
  assert.match(tokens,/body\.dark\{[\s\S]*--source-page:#2c2a26;/);
  assert.match(design,/PDF·EPUB 쪽 바탕은 어두운 화면에서 어두운 종이/);
  assert.doesNotMatch(epub,/epub-chapter-frame[^;\n]*filter|iframe[^;\n]*filter/);
});
