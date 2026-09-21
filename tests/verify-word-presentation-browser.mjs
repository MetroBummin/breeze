import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';

const root=fileURLToPath(new URL('../',import.meta.url));
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.woff2':'font/woff2','.svg':'image/svg+xml'};
const server=createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const path=resolve(root,'.'+(pathname==='/'?'/index.html':decodeURIComponent(pathname)));
  if(!path.startsWith(root)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}
  catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`;
const browser=await (process.env.BROWSER==='webkit'?webkit:chromium).launch();

try{
  const page=await browser.newPage({viewport:{width:1100,height:800},serviceWorkers:'block'});
  await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
  await page.route('**/*',route=>{
    const href=route.request().url();
    return href.startsWith(url)||href.startsWith('blob:')?route.continue():route.abort();
  });
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.locator('#fileinput').setInputFiles({name:'word-overlay.txt',mimeType:'text/plain',
    buffer:Buffer.from(('A patient reader keeps resilient words close to their context. '+
      'Another patient reader checks every repeated word carefully. '+
      'The patient waited calmly for the doctor.\n\n').repeat(50))});
  await page.waitForFunction(()=>books.some(book=>book.kind==='txt'));
  await page.evaluate(()=>openBook(books.find(book=>book.kind==='txt')));
  await page.waitForFunction(()=>document.querySelectorAll('#rtext .w').length>20);

  const geometry=()=>page.evaluate(()=>{
    const rect=document.getElementById('readmain').getBoundingClientRect();
    return {x:rect.x,y:rect.y,width:rect.width,height:rect.height,scroll:readerScrollTop(),zoom:originalZoom()};
  });
  const before=await geometry();
  await page.evaluate(()=>{
    const span=[...document.querySelectorAll('#rtext .w')].find(node=>node.textContent.toLowerCase()==='patient');
    const key=keyOf('patient');
    words[key]={word:'patient',clicked:'patient',forms:[key],ko:'참을성 있는',phon:'',defs:[],kodict:[],
      example:'A patient reader keeps resilient words close to their context.',book:curBook.title,
      status:1,mark:true,addedAt:1,up:1,
      ai:{ko:'참을성 있는',note:'옛 설명',gloss:'옛 gloss',done:true}};
    openWord(key,span);
  });
  await page.waitForFunction(()=>wordPeekOpen());
  assert.equal(await page.locator('#word-peek-meaning').textContent(),'참을성 있는','cached meaning did not appear immediately');
  assert.equal(await page.locator('#word-peek').getAttribute('class')||'','',
    'cached meaning unnecessarily showed the loading spinner');
  assert.equal(await page.locator('#panel').isVisible(),false,'cached meaning opened details automatically');
  await page.locator('#word-peek').evaluate(node=>Promise.all(node.getAnimations().map(animation=>animation.finished)));
  const placement=await page.evaluate(()=>{
    const pill=document.getElementById('word-peek').getBoundingClientRect();
    const word=document.querySelector('#rtext .w.sel').getBoundingClientRect();
    return {pill:{left:pill.left,right:pill.right,top:pill.top,bottom:pill.bottom},
      word:{left:word.left,right:word.right,top:word.top,bottom:word.bottom},width:innerWidth};
  });
  assert.ok(placement.pill.left>=15&&placement.pill.right<=placement.width-15,'meaning pill escaped the viewport');
  assert.ok(placement.pill.bottom<=placement.word.top||placement.pill.top>=placement.word.bottom,
    'meaning pill covers the tapped word');
  assert.deepEqual(await geometry(),before,'near-word pill changed Reader geometry or scroll');

  const siblingActions=await page.locator('#word-peek').evaluate(node=>{
    const retry=node.querySelector('#word-peek-retry'),more=node.querySelector('#word-peek-more');
    const rr=retry.getBoundingClientRect(),mr=more.getBoundingClientRect();
    const rs=getComputedStyle(retry),ms=getComputedStyle(more);
    return {retry:{width:rr.width,height:rr.height,borderRadius:rs.borderRadius,background:rs.backgroundColor},
      more:{width:mr.width,height:mr.height,borderRadius:ms.borderRadius,background:ms.backgroundColor}};
  });
  assert.deepEqual(siblingActions.retry,siblingActions.more,
    'retry does not look like a sibling of the existing chevron action');
  const glassMaterial=()=>page.evaluate(()=>{
    const read=node=>{
      const css=getComputedStyle(node);
      return {background:css.backgroundColor,border:css.borderTopColor,shadow:css.boxShadow,
        blur:css.backdropFilter||css.webkitBackdropFilter};
    };
    return {word:read(document.getElementById('word-peek')),bottom:read(document.getElementById('readpill'))};
  });
  const lightGlass=await glassMaterial();
  // PR 11 gives shared bottom controls their own light reflection tokens.
  // Lookup keeps the existing sentence-glass material; dark material stays shared.
  assert.equal(lightGlass.bottom.blur,lightGlass.word.blur,'Lookup lost its shared glass blur');
  assert.notEqual(lightGlass.word.background,'rgba(0, 0, 0, 0)','Lookup lost its readable glass surface');
  await page.evaluate(()=>{document.documentElement.classList.add('dark');document.body.classList.add('dark');});
  await page.locator('#readpill').evaluate(node=>Promise.all(node.getAnimations().map(animation=>animation.finished)));
  const darkGlass=await glassMaterial();
  assert.deepEqual(darkGlass.bottom,darkGlass.word,'dark Reader controls and Lookup use different glass materials');
  assert.notDeepEqual(darkGlass.word,lightGlass.word,'light and dark glass materials did not adapt to theme');
  await page.evaluate(()=>{document.documentElement.classList.remove('dark');document.body.classList.remove('dark');});
  await page.evaluate(()=>{
    window.wordRetryQa={calls:0};
    window.wordRetryOriginalFetchLook=fetchLook;
    fetchLook=async(k,opt)=>{
      wordRetryQa={calls:wordRetryQa.calls+1,key:k,opt:{sentence:opt.sentence,retry:opt.retry,hold:opt.hold}};
      return {ko:'환자',pos:'noun',note:'문맥 재판정',alts:[],phrase:''};
    };
  });
  await page.locator('#word-peek-retry').click();
  await page.waitForFunction(()=>document.getElementById('word-peek-meaning').textContent==='환자');
  assert.deepEqual(await page.evaluate(()=>wordRetryQa),{calls:1,key:'patient',opt:{
    sentence:'A patient reader keeps resilient words close to their context.',retry:true,hold:true}},
  'retry did not re-query the current sentence through the lookup flow');
  assert.equal(await page.locator('#panel').isVisible(),false,'retry opened a separate detail UI');
  await page.evaluate(()=>{fetchLook=wordRetryOriginalFetchLook;});

  await page.locator('#word-peek-more').click();
  await page.waitForFunction(()=>wordPanelOpen());
  assert.equal(await page.locator('#word-peek').isVisible(),false,'pill remained visible behind details');
  assert.equal(await page.locator('#p-word').textContent(),'patient','existing detail content was not reused');
  assert.equal(await page.locator('#p-close').count(),0,'centered detail popup still exposes an X button');
  assert.equal(await page.locator('#p-ai-note').textContent(),'','legacy AI gloss is still displayed');
  assert.equal(await page.locator('#p-naver').count(),0,'Naver Dictionary link survived');
  assert.deepEqual(await page.evaluate(()=>({note:words.patient.ai.note,gloss:words.patient.ai.gloss})),
    {note:'옛 설명',gloss:'옛 gloss'},'opening details destructively migrated legacy AI gloss data');
  await page.locator('#panel').evaluate(node=>Promise.all(node.getAnimations().map(animation=>animation.finished)));
  const centered=await page.locator('#panel').boundingBox();
  assert.ok(centered&&Math.abs(centered.x+centered.width/2-550)<2&&Math.abs(centered.y+centered.height/2-400)<2,
    'wide word detail is not centered');
  assert.deepEqual(await geometry(),before,'opening centered details changed Reader geometry or scroll');
  await page.locator('#word-modal-scrim').click({position:{x:4,y:4}});
  await page.waitForFunction(()=>!wordLookupOpen());
  /* 위 Retry 검증이 만든 두 번째 Meaning은 아래의 "기존 Meaning 즉시 재사용"
     fixture와 별개입니다. 다음 계약이 원래 저장 뜻 하나만 가진 상태를 보도록 되돌립니다. */
  await page.evaluate(()=>{
    Object.keys(words).filter(id=>words[id]&&words[id].root==='patient'&&words[id].ko==='환자')
      .forEach(id=>delete words[id]);
    words.patient.pickedAt=Date.now();
  });

  /* A saved meaning is immediate in a new context without a request. */
  await page.evaluate(()=>{
    window.wordQa={calls:[],pending:[]};
    dictCall=payload=>{wordQa.calls.push(payload);return new Promise(resolve=>wordQa.pending.push(resolve));};
    const span=[...document.querySelectorAll('#rtext .w')].find(node=>node.textContent.toLowerCase()==='patient'&&sentenceOf(node).startsWith('Another patient'));
    openWord(keyOf('patient'),span);
  });
  assert.equal(await page.locator('#word-peek-meaning').textContent(),'참을성 있는');
  assert.equal(await page.evaluate(()=>wordQa.calls.length),0);
  await page.evaluate(()=>expandWordDetail());
  assert.equal(await page.locator('#p-airetry').count(),0);
  await page.evaluate(()=>closePanel());
  await page.evaluate(()=>{
    const span=[...document.querySelectorAll('#rtext .w')].find(node=>node.textContent.toLowerCase()==='another');
    const key=keyOf('another');
    words[key]={word:'another',clicked:'another',forms:[key],ko:'',phon:'',defs:[],kodict:[],
      example:'Another patient reader checks every repeated word carefully.',book:curBook.title,
      status:1,mark:true,addedAt:1,up:1,aiOff:'login'};
    selectWord(key,span,false);
  });
  await page.waitForFunction(()=>wordPanelOpen());
  assert.equal(await page.locator('#p-ai-note').textContent(),'','signed-out lookup repeats a sentence-specific login prompt');
  assert.equal(await page.locator('#p-aihint').isVisible(),false,'signed-out lookup repeats a login hint below the action');
  assert.equal(await page.locator('#p-aibtn-t').textContent(),'로그인하고 계속 쓰기','signed-out lookup lost its single login action');
  await page.evaluate(()=>closePanel());

  await page.evaluate(()=>readerScrollTo(1500));
  await page.waitForTimeout(200);
  const expressionScroll=await page.evaluate(()=>readerScrollTop());
  /* 처음 보는 lexical item을 DeepSeek가 expression으로 판정해도 같은 필이 lookup
     중부터 결과가 도착한 뒤까지 계속 화면을 소유해야 합니다. */
  await page.evaluate(()=>{
    window.wordQa={calls:[],pending:[]};
    const span=[...document.querySelectorAll('#rtext .w')].find(node=>node.textContent.toLowerCase()==='carefully' && node.getBoundingClientRect().top>80 && node.getBoundingClientRect().bottom<700);
    openWord(keyOf('carefully'),span);
  });
  await page.waitForFunction(()=>wordQa.calls[0]?.op==='look');
  assert.equal(await page.locator('#word-peek').isVisible(),true,'expression lookup 중 word pill이 사라졌습니다');
  assert.equal(await page.locator('#word-peek').evaluate(node=>node.classList.contains('loading')),true);
  await page.evaluate(()=>{
    const call=wordQa.calls[0];
    const checkIndex=call.tokens.findIndex(token=>String(token.text||token).toLowerCase()==='checks');
    wordQa.pending.shift()({kind:'expression',canonical:'check carefully',members:[checkIndex,call.clickedIndex],ko:'매우 조심스럽게'});
  });
  await page.waitForFunction(()=>document.getElementById('word-peek-meaning').textContent==='매우 조심스럽게');
  assert.equal(await page.locator('#word-peek').isVisible(),true,'expression 뜻 도착 뒤 word pill이 유지되지 않았습니다');
  await page.waitForTimeout(250);
  assert.equal(await page.locator('#word-peek').isVisible(),true,'expression repaint scroll dismissed the pill');
  assert.ok(Math.abs(await page.evaluate(()=>readerScrollTop())-expressionScroll)<2,'expression repaint moved the Reader');
  const phraseStatus=await page.evaluate(()=>words[selKey].status);
  await page.evaluate(()=>{
    const root=words[selKey].root||selKey;closePanel();
    const node=[...document.querySelectorAll('#rtext .phrase')].find(n=>n.dataset.w===root && n.getBoundingClientRect().top>80 && n.getBoundingClientRect().bottom<700);
    openWord(root,node);
  });
  await page.waitForTimeout(80);
  assert.equal(await page.evaluate(()=>words[selKey].status),phraseStatus,'expression identity lost the 30-second cooldown');
  assert.equal(await page.locator('#word-peek-meaning').textContent(),'매우 조심스럽게');
  // A second Meaning under the same root shares the cooldown; expiry still bumps.
  await page.evaluate(()=>{
    const root=words[selKey].root||selKey;window.cooldownRoot=root;
    const node=activeSelectedWordNode;closePanel();
    const id=createMeaning(root,'주의 깊게',{});words[id].status=1;words[id].pickedAt=Date.now()+100;
    const sentence=sentenceOf(node);rememberSenseContext(id,sentence,-1);
    openWord(root,node);
  });
  await page.waitForTimeout(80);
  assert.equal(await page.evaluate(()=>words[selKey].status),1,'Meaning switch bypassed cooldown');
  await page.evaluate(()=>{
    const node=activeSelectedWordNode;closePanel();recentWordOpens.set(window.cooldownRoot,Date.now()-31000);openWord(window.cooldownRoot,node);
  });
  await page.waitForTimeout(80);
  assert.equal(await page.evaluate(()=>words[selKey].status),2,'expired cooldown did not bump');
  await page.evaluate(()=>{closePanel();readerScrollTo(0);});
  await page.waitForTimeout(100);

  await page.evaluate(()=>closePanel());

  await page.evaluate(()=>{
    const span=[...document.querySelectorAll('#rtext .w')].find(node=>node.textContent.toLowerCase()==='resilient');
    const key=keyOf('resilient');
    window.wordQa={calls:0};
    fetchDict=()=>{wordQa.calls++;words[key].loading=true;renderWordLookup();return new Promise(()=>{});};
    openWord(key,span);
  });
  await page.waitForFunction(()=>wordPeekOpen()&&document.getElementById('word-peek').classList.contains('loading')
    &&window.wordQa.calls===1);
  assert.equal(await page.locator('#word-peek-meaning').textContent(),'뜻 찾는 중','pending copy changed');
  assert.equal(await page.evaluate(()=>wordQa.calls),1,'new word did not start exactly one lookup');
  await page.evaluate(()=>{
    const span=[...document.querySelectorAll('#rtext .w')].find(node=>node.textContent.toLowerCase()==='resilient');
    openWord(keyOf('resilient'),span);
  });
  assert.equal(await page.evaluate(()=>wordQa.calls),1,'repeated tap on the same word duplicated the lookup');
  await page.locator('#word-peek-more').click();
  await page.waitForFunction(()=>wordPanelOpen());
  assert.equal(await page.evaluate(()=>wordQa.calls),1,'chevron started a second lookup');
  assert.equal(await page.locator('#p-ai').evaluate(node=>node.classList.contains('wait')),true,
    'detail popup did not continue the same pending state');
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!wordLookupOpen());

  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{
    fetchDict=()=>Promise.resolve();
    const spans=[...document.querySelectorAll('#rtext .w')];
    const span=spans.find(node=>node.textContent.toLowerCase()==='patient');
    openWord(keyOf('patient'),span);
  });
  await page.waitForFunction(()=>wordPeekOpen());
  await page.locator('#word-peek').evaluate(node=>Promise.all(node.getAnimations().map(animation=>animation.finished)));
  const compactPill=await page.locator('#word-peek').boundingBox();
  assert.ok(compactPill&&compactPill.x>=15&&compactPill.x+compactPill.width<=375,
    'compact edge placement escaped viewport padding');
  await page.locator('#word-peek-more').click();
  await page.locator('#panel').evaluate(node=>Promise.all(node.getAnimations().map(animation=>animation.finished)));
  const compact=await page.locator('#panel').boundingBox();
  assert.ok(compact&&Math.abs(compact.x+compact.width/2-195)<2&&Math.abs(compact.y+compact.height/2-422)<2,
    'compact word detail is not centered');
  assert.ok(compact.x>=15&&compact.x+compact.width<=375,'compact detail escaped viewport padding');
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!wordLookupOpen());
  await page.setViewportSize({width:375,height:667});
  await page.evaluate(()=>{
    const span=[...document.querySelectorAll('#rtext .w')].find(node=>node.textContent.toLowerCase()==='patient');
    openWord(keyOf('patient'),span);
  });
  await page.waitForFunction(()=>wordPeekOpen());
  await page.locator('#word-peek').evaluate(node=>Promise.all(node.getAnimations().map(animation=>animation.finished)));
  const smallIphone=await page.locator('#word-peek').evaluate(node=>{
    const pill=node.getBoundingClientRect(),meaning=node.querySelector('#word-peek-meaning').getBoundingClientRect();
    const retry=node.querySelector('#word-peek-retry').getBoundingClientRect();
    const more=node.querySelector('#word-peek-more').getBoundingClientRect();
    return {left:pill.left,right:pill.right,meaningRight:meaning.right,retryLeft:retry.left,
      retryRight:retry.right,moreLeft:more.left};
  });
  assert.ok(smallIphone.left>=15&&smallIphone.right<=360,'small-iPhone pill escaped viewport padding');
  assert.ok(smallIphone.meaningRight<=smallIphone.retryLeft&&smallIphone.retryRight<=smallIphone.moreLeft,
    'small-iPhone meaning, retry, and chevron overlap');
  await page.evaluate(()=>closePanel());
  await page.evaluate(()=>{
    const span=[...document.querySelectorAll('#rtext .w')].find(node=>node.textContent.toLowerCase()==='another');
    const key=keyOf('another');
    words[key]={word:'another',clicked:'another',forms:[key],ko:'',phon:'',defs:[],kodict:[],
      example:'Another patient reader checks every repeated word carefully.',book:curBook.title,
      status:1,mark:true,addedAt:1,up:1,aiOff:'error'};
    selectWord(key,span,true);
  });
  await page.waitForFunction(()=>wordPeekOpen());
  assert.equal(await page.locator('#word-peek-meaning').textContent(),'뜻을 찾지 못했어요',
    'failed lookup has no stable pill state');
  await page.evaluate(()=>closePanel());
  assert.equal(await page.evaluate(()=>document.querySelectorAll('#sheetbg,#p-close,#p-handle').length),0,
    'removed sidebar or sheet DOM is still reachable');

  /* Real Words DOM: the legacy phrase child is visible in this screen even though
     popup presentation filters it. Removing the first row must therefore leave
     the group, promote the survivor, and keep folding behavior intact. */
  await page.evaluate(()=>{
    closePanel();
    const base=(ko,up,extra={})=>({word:'run',clicked:'ran',forms:['run','ran'],ko,
      example:'They run the company.',book:'QA',status:2,mark:false,addedAt:7,up,...extra});
    words={
      run:base('달리다',10),
      'run::legacy-phrase':base('운영하다',11,{root:'run',sense:true,
        phrase:'run a company',phraseParts:['run','company'],phraseGaps:[1]})
    };
    dead={}; vocabOpen.clear(); show('vocab'); renderVocab();
  });
  assert.equal(await page.locator('#vcnt').textContent(),'전체 1단어');
  await page.locator('.vgroup[data-g="run"] .vword').click();
  assert.equal(await page.locator('.vgroup[data-g="run"] .rowdel').count(),2,
    'expanded Words group did not expose both stored meanings');
  await page.locator('.vsense[data-k="run"] .rowdel').click();
  await page.waitForFunction(()=>document.querySelectorAll('.vgroup[data-g="run"] .vsense').length===1);
  assert.equal(await page.locator('#vcnt').textContent(),'전체 1단어');
  assert.equal(await page.locator('.vgroup[data-g="run"] .vko').textContent(),'운영하다');
  assert.equal(await page.locator('.vgroup[data-g="run"]').getAttribute('data-head'),'run');
  assert.equal(await page.locator('.vgroup[data-g="run"]').evaluate(node=>node.classList.contains('open')),true,
    'deleting a meaning unexpectedly collapsed the surviving group');
  const promoted=await page.evaluate(()=>({root:words.run,old:words['run::legacy-phrase'],dead:{...dead}}));
  assert.equal(promoted.old,undefined);
  assert.equal(promoted.root.ko,'운영하다');
  assert.deepEqual(promoted.root.forms,['run','ran']);
  assert.equal(promoted.root.status,2);
  assert.equal(promoted.root.mark,false);
  assert.equal(promoted.root.phraseParts,undefined);
  assert.equal(promoted.dead.run,undefined);
  assert.ok(promoted.dead['run::legacy-phrase']);
  await page.locator('.vgroup[data-g="run"] .vword').click();
  assert.equal(await page.locator('.vgroup[data-g="run"]').evaluate(node=>node.classList.contains('open')),false);
  await page.locator('.vgroup[data-g="run"] .vword').click();
  assert.equal(await page.locator('.vgroup[data-g="run"] .rowdel').count(),1);

  /* Middle and rapid consecutive deletes travel through the same live buttons,
     not a direct helper call. */
  await page.evaluate(()=>{
    const base=(ko,up,extra={})=>({word:'triad',clicked:'triad',forms:['triad'],ko,
      example:'A triad.',book:'QA',status:1,mark:true,addedAt:9,up,...extra});
    words={triad:base('A',10),'triad::B':base('B',11,{root:'triad',sense:true}),
      'triad::C':base('C',12,{root:'triad',sense:true}),'triad::D':base('D',13,{root:'triad',sense:true})};
    dead={}; vocabOpen.clear(); renderVocab();
  });
  await page.locator('.vgroup[data-g="triad"] .vword').click();
  await page.locator('.vsense[data-k="triad::B"] .rowdel').click();
  await page.locator('.vsense[data-k="triad::C"] .rowdel').click();
  assert.deepEqual((await page.locator('.vgroup[data-g="triad"] .vko').allTextContents()).sort(),['A','D']);
  assert.equal(await page.locator('#vcnt').textContent(),'전체 1단어');
  assert.equal(await page.locator('.vgroup[data-g="triad"]').count(),1);

  /* Active/non-active popup deletion plus delete -> add -> delete. */
  await page.evaluate(()=>{
    const base=(ko,up,extra={})=>({word:'poly',clicked:'poly',forms:['poly'],ko,
      example:'Poly has several meanings.',book:'QA',status:1,mark:true,addedAt:15,up,...extra});
    words={poly:base('A',10),'poly::B':base('B',11,{root:'poly',sense:true,pickedAt:20}),
      'poly::C':base('C',12,{root:'poly',sense:true,pickedAt:15})};
    dead={}; openBook(books.find(book=>book.kind==='txt')); selectWord('poly::B',null);
  });
  await page.waitForFunction(()=>wordPanelOpen()&&!document.getElementById('p-meaning-del').hidden);
  await page.locator('#p-meaning-del').click();
  assert.deepEqual((await page.evaluate(()=>Object.values(words).map(item=>item.ko).sort())),['A','C']);
  assert.equal(await page.evaluate(()=>!!words.poly),true);
  /* The current chip is C; remove the non-active A through its nested × target. */
  await page.locator('.saved-sense[data-k="poly"] .sense-remove').click();
  assert.deepEqual(await page.evaluate(()=>Object.values(words).map(item=>item.ko)),['C']);
  assert.equal(await page.evaluate(()=>dead.poly),undefined);
  await page.locator('#p-add-sense').click();
  await page.locator('#p-sense-input').fill('D');
  await page.locator('#p-sense-input').press('Enter');
  assert.deepEqual((await page.evaluate(()=>Object.values(words).map(item=>item.ko).sort())),['C','D']);
  await page.locator('#p-meaning-del').click();
  assert.deepEqual(await page.evaluate(()=>Object.values(words).map(item=>item.ko)),['C']);
  assert.equal(await page.evaluate(()=>!!words.poly),true,'delete-add-delete removed the whole word');

  /* Whole-group removal remains exclusive to the explicit #p-know control. */
  await page.evaluate(()=>{
    words['poly::E']={...words.poly,root:'poly',sense:true,ko:'E',up:Date.now()+1};
    selectWord('poly',null);
  });
  await page.locator('#p-know').click();
  assert.equal(await page.evaluate(()=>Object.keys(words).filter(key=>key==='poly'||words[key]?.root==='poly').length),0);
  assert.ok(await page.evaluate(()=>dead.poly&&dead['poly::E']));

  console.log('Word near-pill and multi-meaning Words deletion interactions verified');
  await page.close();
}finally{
  await browser.close();
  await new Promise(done=>server.close(done));
}
