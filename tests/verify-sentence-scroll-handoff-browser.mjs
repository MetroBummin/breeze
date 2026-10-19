import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';

/* Synthetic touch pointers. Desktop WebKit does not emulate an iPadOS pan
   recognizer, pointer:fine, or a backdrop-filter layer being cancelled. */
const root=fileURLToPath(new URL('../',import.meta.url));
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png',
  '.woff2':'font/woff2','.svg':'image/svg+xml'};
const server=createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const path=resolve(root,'.'+(pathname==='/'?'/index.html':decodeURIComponent(pathname)));
  if(!path.startsWith(root)){ res.writeHead(403).end(); return; }
  try{ res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream'); res.end(readFileSync(path)); }
  catch{ res.writeHead(404).end(); }
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`;
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
const browser=await engine.launch({executablePath:engine===chromium?process.env.BREEZE_BROWSER_EXECUTABLE:undefined});

try{
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true,
    serviceWorkers:'block'});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
  await page.route('**/*',route=>{
    const href=route.request().url();
    return href.startsWith(url)||href.startsWith('blob:') ? route.continue() : route.abort();
  });
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.locator('#fileinput').setInputFiles({name:'sentence-scroll.txt',mimeType:'text/plain',
    buffer:Buffer.from(('A patient reader keeps the sentence and its meaning together. '+
      'Another sentence keeps the page long enough to scroll.\n\n').repeat(80))});
  await page.waitForFunction(()=>books.some(book=>book.kind==='txt'));
  await page.evaluate(()=>openBook(books.find(book=>book.kind==='txt')));
  await page.waitForFunction(()=>document.querySelectorAll('#rtext .w').length>20);
  await page.evaluate(()=>{
    window.qaOutsidePoint=()=>{
      const card=document.getElementById('p-sentence').getBoundingClientRect();
      const root=document.getElementById('readmain').getBoundingClientRect();
      const spots=[[root.left+12,root.bottom-16],[root.right-12,root.bottom-16],
        [root.left+12,root.top+24],[root.right-12,root.top+24],[root.left+12,root.top+root.height/2]];
      for(const [x,y] of spots){
        const outside=x<card.left-1||x>card.right+1||y<card.top-1||y>card.bottom+1;
        const node=document.elementFromPoint(x,y);
        if(outside&&node&&!node.closest('#p-sentence,#readchrome,button,a')
          &&node.closest('#rtext,#readmain,#reader-scroll')) return {x,y,node};
      }
      return null;
    };
    window.qaPointer=(node,type,x,y)=>node.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,
      pointerId:41,pointerType:'touch',isPrimary:true,button:0,clientX:x,clientY:y}));
    window.qaParked=()=>{
      const panel=document.getElementById('p-sentence');
      const style=getComputedStyle(panel);
      return {open:sentenceLookupOpen(),hidden:document.getElementById('sentence-modal').hidden,
        opacity:panel.style.opacity,pointerEvents:panel.style.pointerEvents,
        anchored:document.body.classList.contains('sentence-result-anchored'),
        blur:style.backdropFilter||style.webkitBackdropFilter||''};
    };
  });

  const show=async ko=>{
    await page.evaluate(async ko=>{
      closeSentence();
      dictGet=async()=>({ko});
      dictPut=async()=>{};
      const word=[...document.querySelectorAll('#rtext .w')].find(node=>{
        const rect=node.getBoundingClientRect();
        return rect.width>2 && rect.top>40 && rect.bottom<innerHeight-20;
      });
      if(!word) throw new Error('no visible word');
      await openSentence('A patient reader keeps the sentence and its meaning together.',{peekTarget:word});
    },ko);
    await page.waitForFunction(()=>document.body.classList.contains('sentence-result-anchored')
      && document.getElementById('p-sentence').style.overflowY);
  };

  for(const [width,height] of [[390,844],[820,1180]]){
    await page.setViewportSize({width,height});
    await page.waitForFunction(({width,height})=>{
      const view=sentenceViewport();
      return Math.abs(view.width-width)<1 && Math.abs(view.height-height)<1;
    },{width,height});
    await show('짧은 뜻');
    assert.equal(await page.evaluate(()=>document.getElementById('p-sentence').style.overflowY),'hidden',
      `${width} short card kept a nested scroller`);

    const dragged=await page.evaluate(()=>{
      const spot=qaOutsidePoint();
      if(!spot) throw new Error('no point outside the sentence card');
      qaPointer(spot.node,'pointerdown',spot.x,spot.y);
      qaPointer(spot.node,'pointermove',spot.x+18,spot.y+18);
      const scroller=readerScroller();
      const before=scroller.scrollTop;
      scroller.scrollTop=before+80;
      if(scroller.scrollTop===before) throw new Error('reader did not scroll');
      const parked=qaParked();
      qaPointer(spot.node,'pointerup',spot.x+18,spot.y+18);
      const click=new MouseEvent('click',{bubbles:true,cancelable:true,clientX:spot.x+18,clientY:spot.y+18});
      spot.node.dispatchEvent(click);
      return {parked,defaultPrevented:click.defaultPrevented,
        word:document.getElementById('panel').classList.contains('on')};
    });
    assert.equal(dragged.parked.open,false,`${width} drag left the lookup open`);
    assert.equal(dragged.parked.hidden,false,`${width} drag set modal.hidden during the pan`);
    assert.equal(dragged.parked.opacity,'0',`${width} drag did not hide the card`);
    assert.equal(dragged.parked.pointerEvents,'none',`${width} drag left the card hittable`);
    assert.equal(dragged.parked.anchored,true,`${width} drag removed the glass layer during the pan`);
    assert.match(dragged.parked.blur,/blur\(/,`${width} drag dropped backdrop-filter during the pan`);
    assert.equal(dragged.defaultPrevented,false,`${width} trailing click cancelled the scroll`);
    assert.equal(dragged.word,false,`${width} trailing click opened a word`);

    const torn=await page.evaluate(()=>{
      readerScroller().dispatchEvent(new Event('scrollend'));
      const panel=document.getElementById('p-sentence');
      return {hidden:document.getElementById('sentence-modal').hidden,
        anchored:document.body.classList.contains('sentence-result-anchored'),
        opacity:panel.style.opacity,pointerEvents:panel.style.pointerEvents};
    });
    assert.equal(torn.hidden,true,`${width} scrollend left the modal up`);
    assert.equal(torn.anchored,false,`${width} scrollend left the backdrop class`);
    assert.equal(torn.opacity,'',`${width} scrollend left the card transparent`);
    assert.equal(torn.pointerEvents,'',`${width} scrollend left pointer-events none`);

    await show('짧은 뜻');
    const early=await page.evaluate(()=>{
      const spot=qaOutsidePoint();
      if(!spot) throw new Error('no point outside the sentence card');
      qaPointer(spot.node,'pointerdown',spot.x,spot.y);
      const scroller=readerScroller();
      const before=scroller.scrollTop;
      scroller.scrollTop=before+60;
      if(scroller.scrollTop===before) throw new Error('reader did not scroll');
      const parked=qaParked();
      qaPointer(spot.node,'pointerup',spot.x,spot.y+4);
      const click=new MouseEvent('click',{bubbles:true,cancelable:true,clientX:spot.x,clientY:spot.y+4});
      spot.node.dispatchEvent(click);
      readerScroller().removeEventListener('scrollend', finishSentenceScrollTeardown);
      return {parked,defaultPrevented:click.defaultPrevented};
    });
    assert.equal(early.parked.hidden,false,`${width} scroll-before-move hid the modal immediately`);
    assert.equal(early.parked.opacity,'0',`${width} scroll-before-move left the card visible`);
    assert.equal(early.parked.anchored,true,`${width} scroll-before-move tore down the glass`);
    assert.equal(early.defaultPrevented,false,`${width} pointerup without pointermove cancelled the click`);
    await page.waitForFunction(()=>document.getElementById('sentence-modal').hidden
      && !document.body.classList.contains('sentence-result-anchored'),null,{timeout:2000});

    await show('짧은 뜻');
    const tap=await page.evaluate(()=>{
      const spot=qaOutsidePoint();
      if(!spot) throw new Error('no point outside the sentence card');
      qaPointer(spot.node,'pointerdown',spot.x,spot.y);
      qaPointer(spot.node,'pointerup',spot.x,spot.y);
      const click=new MouseEvent('click',{bubbles:true,cancelable:true,clientX:spot.x,clientY:spot.y});
      spot.node.dispatchEvent(click);
      return {open:sentenceLookupOpen(),hidden:document.getElementById('sentence-modal').hidden,
        anchored:document.body.classList.contains('sentence-result-anchored'),
        defaultPrevented:click.defaultPrevented};
    });
    assert.equal(tap.open,false,`${width} outside tap left the lookup open`);
    assert.equal(tap.hidden,true,`${width} outside tap deferred modal.hidden`);
    assert.equal(tap.anchored,false,`${width} outside tap left the glass class`);
    assert.equal(tap.defaultPrevented,true,`${width} outside tap click reached the reader`);

    await show('짧은 뜻');
    const plain=await page.evaluate(()=>{
      readerScroller().scrollTop+=40;
      const panel=document.getElementById('p-sentence');
      return {open:sentenceLookupOpen(),hidden:document.getElementById('sentence-modal').hidden,
        anchored:document.body.classList.contains('sentence-result-anchored'),opacity:panel.style.opacity};
    });
    assert.equal(plain.open,false,`${width} gesture-free scroll left the lookup open`);
    assert.equal(plain.hidden,true,`${width} gesture-free scroll deferred modal.hidden`);
    assert.equal(plain.anchored,false,`${width} gesture-free scroll left the glass class`);
    assert.equal(plain.opacity,'',`${width} gesture-free scroll parked the card`);

    await show(`${'긴 번역이 카드 안을 넘깁니다. '.repeat(80)}`);
    assert.equal(await page.evaluate(()=>document.getElementById('p-sentence').style.overflowY),'auto',
      `${width} long card could not scroll`);
    assert.equal(await page.evaluate(()=>{
      const panel=document.getElementById('p-sentence');
      panel.scrollTop=40;
      panel.dispatchEvent(new Event('scroll',{bubbles:true}));
      return sentenceLookupOpen() && !document.getElementById('sentence-modal').hidden && panel.scrollTop>0;
    }),true,`${width} scrolling inside the card dismissed it`);
    await page.evaluate(()=>closeSentence());
  }

  assert.deepEqual(errors,[]);
  console.log(`${engine.name()}: sentence scroll handoff at 390×844 and 820×1180`);
  await page.close();
}finally{
  await browser.close();
  await new Promise(done=>server.close(done));
}
