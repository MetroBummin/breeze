/* 웹소설: Royal Road works whose authors allowed Breeze to show them.
   Every work is free forever. Breeze shows no ads and sells nothing around
   them. Chapter text is never scraped. A chapter becomes readable only when
   its text file ships in this repository.

   Data shape, ready for real content:
     work     {id, title, author, credit, site, intro, links[], chapterLimit?,
               plannedChapters?, cover?, chapters[]}
     chapter  {n, title?, file, sha256?}   file = same-origin .txt
   `chapters` stays empty until the text is added; the preview then lists
   `plannedChapters` rows as 곧 공개. `chapterLimit` caps what is shown even
   when more chapters are added (rkgoff permits the first 10 only).

   Reading progress is not a new store. An opened chapter is an ordinary
   library book tagged with webNovelId/webNovelChapter, and the card reads the
   most recently read one. Placeholder links are searches until the exact
   Royal Road and Kindle pages are confirmed. */
const WEB_NOVELS = [
  {
    id:'rkgoff', title:'', author:'R. K. Goff', credit:'R. K. Goff', site:'Royal Road',
    intro:'R. K. Goff가 Royal Road에 연재한 영어 웹소설입니다. 작가의 허락을 받아 처음 10화까지만 Breeze에서 무료로 읽을 수 있어요.',
    links:[{label:'Royal Road에서 보기',url:'https://www.royalroad.com/fictions/search?author=rkgoff'}],
    chapterLimit:10, plannedChapters:10, chapters:[],
  },
  {
    id:'cinnamon-bun', title:'Cinnamon Bun', author:'RavensDagger', credit:'RavensDagger', site:'Royal Road',
    intro:'RavensDagger가 Royal Road에 연재한 영어 웹소설입니다. 작가의 허락을 받아 광고 없이 무료로 소개해요.',
    links:[{label:'Royal Road에서 보기',url:'https://www.royalroad.com/fictions/search?title=Cinnamon%20Bun'}],
    plannedChapters:10, chapters:[],
  },
  {
    id:'chasing-sunlight', title:'Chasing Sunlight', author:'InadvisablyCompelled', credit:'InadvisablyCompelled', site:'Royal Road',
    intro:'InadvisablyCompelled가 Royal Road에 연재한 영어 웹소설입니다. 작가의 허락을 받아 무료로 소개해요. Kindle 판으로도 읽을 수 있어요.',
    links:[
      {label:'Royal Road에서 보기',url:'https://www.royalroad.com/fictions/search?title=Chasing%20Sunlight'},
      {label:'Kindle 판 보기',url:'https://www.amazon.com/s?k=Chasing+Sunlight+InadvisablyCompelled&i=digital-text'},
    ],
    plannedChapters:10, chapters:[],
  },
];

function webNovelTitle(work){
  return work.title||`${work.credit} 연재작`;
}
function webNovelChapters(work){
  const list=(Array.isArray(work.chapters)?work.chapters:[]).filter(chapter=>chapter&&chapter.n>0)
    .slice().sort((a,b)=>a.n-b.n);
  return work.chapterLimit?list.filter(chapter=>chapter.n<=work.chapterLimit):list;
}
/* Real chapters, or numbered 곧 공개 rows while the text is not in the repo. */
function webNovelChapterRows(work){
  const ready=webNovelChapters(work);
  if(ready.length)return ready.map(chapter=>({...chapter,ready:!!chapter.file}));
  const count=Math.min(work.chapterLimit||Infinity,work.plannedChapters||0);
  return Array.from({length:count},(_,index)=>({n:index+1,ready:false}));
}
function webNovelBooks(work){
  return typeof books==='undefined'?[]:books.filter(book=>book.webNovelId===work.id);
}
function webNovelCurrentChapter(work){
  const opened=webNovelBooks(work).filter(book=>localReadAt(book.id));
  if(!opened.length)return 0;
  return byRecentlyRead(opened)[0].webNovelChapter||0;
}
function webNovelLabel(work){
  const current=webNovelCurrentChapter(work);
  if(current)return `${current}화 읽는 중`;
  return webNovelChapters(work).some(chapter=>chapter.file)?'1화부터':'곧 공개';
}
function webNovelCard(work){
  const card=el('div','bookcard editorial-cover webnovel pal'+paletteOf({id:work.id},3));
  card.dataset.webnovelId=work.id;
  card.innerHTML=`${coverArtwork(work.id)}<img class="cover" alt="" hidden>
    <div class="author"></div><div class="bt"></div><div class="prog"></div>`;
  fillCard(card,{'.author':work.credit,'.bt':webNovelTitle(work),'.prog':webNovelLabel(work)});
  if(work.cover){
    const image=card.querySelector('.cover');
    image.onload=()=>{image.hidden=false;card.classList.add('has-cover');};
    image.src=work.cover;
  }
  card.onclick=()=>openWebNovelPreview(work);
  return card;
}
function renderHomeWebNovels(rail){
  reconcileHomeCards(rail,WEB_NOVELS.map(work=>{
    const label=webNovelLabel(work);
    return {key:'webnovel:'+work.id,stamp:JSON.stringify([webNovelTitle(work),label,work.cover||'']),
      create:()=>homeRegularTile(webNovelCard(work),webNovelTitle(work),work.credit)};
  }));
}

/* The chapter list lives inside the shared preview sheet. Other preview kinds
   hide it through CSS because closing resets data-kind to article. */
const webNovelChapterSection=document.createElement('section');
webNovelChapterSection.className='ap-chapters';
webNovelChapterSection.setAttribute('aria-label','회차');
const webNovelChapterHeading=document.createElement('h3');
webNovelChapterHeading.className='ap-chapters-heading';webNovelChapterHeading.textContent='회차';
const webNovelChapterList=document.createElement('ol');
webNovelChapterList.className='ap-chapter-list';
webNovelChapterSection.append(webNovelChapterHeading,webNovelChapterList);
articlePreviewDetails.after(webNovelChapterSection);

function webNovelNextChapter(work){
  const rows=webNovelChapterRows(work).filter(row=>row.ready);
  const current=webNovelCurrentChapter(work);
  return rows.find(row=>row.n===current)||rows[0]||null;
}
function openWebNovelPreview(work){
  cancelPendingBookOpen();articlePreviewClose();
  const dialog=articlePreviewDialog;
  dialog.dataset.kind='webnovel';
  articlePreviewBook={id:'webnovel:'+work.id,kind:'webnovel',webNovel:work};
  dialog.querySelector('.ap-art').innerHTML=coverArtwork(work.id);
  dialog.querySelector('.ap-source').textContent=`${work.site} · 웹소설`;
  dialog.querySelector('.ap-title').textContent=webNovelTitle(work);
  articlePreviewPaint({summaryKo:work.intro});articlePreviewMetadataState('ready');
  articlePreviewDetails.hidden=false;
  const limit=work.chapterLimit?` · 처음 ${work.chapterLimit}화까지`:'';
  articlePreviewDetails.textContent=`글: ${work.credit}\n작가 허락 · 무료 · 광고 없음${limit}`;
  for(const link of work.links||[]){
    const anchor=document.createElement('a');
    anchor.href=link.url;anchor.target='_blank';anchor.rel='noopener noreferrer';anchor.textContent=link.label;
    articlePreviewDetails.append(document.createElement('br'),anchor);
  }
  const current=webNovelCurrentChapter(work);
  webNovelChapterList.replaceChildren(...webNovelChapterRows(work).map(row=>{
    const item=document.createElement('li'),button=document.createElement('button');
    button.type='button';button.className='ap-chapter';button.dataset.chapter=String(row.n);
    if(!row.ready)button.setAttribute('aria-disabled','true');
    if(row.n===current)button.setAttribute('aria-current','true');
    const number=el('span','ap-chapter-n',`${row.n}화`);
    const title=el('span','ap-chapter-title',row.title||'');
    const state=el('span','ap-chapter-state',!row.ready?'곧 공개':row.n===current?'읽는 중':'');
    button.append(number,title,state);
    button.onclick=()=>{void openWebNovelChapter(work,row);};
    item.append(button);
    return item;
  }));
  webNovelChapterSection.hidden=!webNovelChapterList.childElementCount;
  const image=/** @type {HTMLImageElement} */(dialog.querySelector('.ap-hero img'));
  if(work.cover){image.src=work.cover;image.hidden=false;image.onerror=()=>{image.hidden=true;};}
  const start=/** @type {HTMLButtonElement} */(dialog.querySelector('.ap-start'));
  const next=webNovelNextChapter(work);
  start.removeAttribute('aria-busy');
  start.disabled=!next;
  start.textContent=next?(current&&next.n===current?`${next.n}화 이어 읽기`:`${next.n}화 읽기`):'곧 공개';
  start.onclick=next?()=>{void openWebNovelChapter(work,next);}:null;
  articlePreviewStatus('');dialog.querySelector('.ap-scroll').scrollTop=0;
  dialog.showModal();dialog.setAttribute('tabindex','-1');dialog.focus({preventScroll:true});
}
let webNovelOpening=false;
async function openWebNovelChapter(work,chapter){
  if(!chapter||!chapter.ready||!chapter.file){articlePreviewStatus(`${chapter?.n||''}화는 곧 공개돼요.`);return null;}
  if(webNovelOpening)return null;
  const owned=()=>webNovelBooks(work).find(book=>book.webNovelChapter===chapter.n);
  webNovelOpening=true;
  const generation=articlePreviewGeneration;
  try{
    if(!owned()){
      articlePreviewStatus(`${chapter.n}화를 준비하고 있어요…`);
      const fileUrl=chapter.sha256?`${chapter.file}?v=${chapter.sha256.slice(0,8)}`:chapter.file;
      const response=await fetch(fileUrl);
      if(!response.ok)throw new Error('HTTP '+response.status);
      const text=await response.text();
      if(chapter.sha256){
        const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
        const hash=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
        if(hash!==chapter.sha256)throw new Error('Chapter text is incomplete or has changed');
      }
      const title=`${webNovelTitle(work)} · ${chapter.n}화`;
      await importFile(new File([text],`${work.id}-${chapter.n}.txt`,{type:'text/plain'}),{
        title,author:work.credit,site:work.site,sourceUrl:(work.links&&work.links[0]&&work.links[0].url)||'',
        webNovelId:work.id,webNovelChapter:chapter.n,
      },{preserveParagraphs:true});
    }
    const book=owned();
    if(!book)throw new Error('Chapter was not saved');
    if(generation===articlePreviewGeneration)articlePreviewClose();
    return openBook(book);
  }catch(error){
    console.error(error);
    if(generation===articlePreviewGeneration&&articlePreviewDialog.open)articlePreviewStatus('회차를 열지 못했어요. 다시 눌러 주세요.');
    return null;
  }finally{webNovelOpening=false;}
}
