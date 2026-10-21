/* Presentation filters do not mutate saved Meaning records or their grouping. */
const wordbookStars=new Set();
const wordbookBooks=new Set();
let wordbookRenderedBookNames=null;
let wordbookFilteredCache=null;
function wordbookFilteredRecord(root,entries,settings,source){
  const head=words[root]||entries[0][1];
  if(settings.stars.size&&!settings.stars.has(Number(head.status)))return null;
  const matching=entries.filter(([,w])=>(!settings.books.size||settings.books.has(w.book||''))&&
    (!settings.q||w.word.toLowerCase().includes(settings.q)||(w.ko||'').toLowerCase().includes(settings.q)||(w.book||'').toLowerCase().includes(settings.q)));
  if(!matching.length)return null;
  return {group:[root,matching],label:matching[0][1].word,addedAt:Math.max(...matching.map(([,w])=>Number(w.addedAt)||0)),
    sourceAddedAt:source.addedAt,sourceOrder:source.order};
}
function wordbookFilteredOrder(left,right,sort){
  const difference=sort==='alpha'?left.label.localeCompare(right.label):(sort==='oldest'?1:-1)*(left.addedAt-right.addedAt);
  return difference||right.sourceAddedAt-left.sourceAddedAt||left.sourceOrder-right.sourceOrder;
}
function wordbookFilteredPosition(cache,record){
  let lo=0,hi=cache.groups.length;
  while(lo<hi){const mid=(lo+hi)>>1;
    if(wordbookFilteredOrder(cache.records.get(cache.groups[mid][0]),record,cache.settings.sort)<0)lo=mid+1;else hi=mid;
  }
  return lo;
}
function updateWordbookFilteredCatalog(catalog,roots){
  const cache=wordbookFilteredCache;
  if(!cache||cache.source!==catalog.groups||cache.words!==words)return;
  for(const root of roots){
    const previous=cache.records.get(root);
    if(previous){cache.groups.splice(wordbookFilteredPosition(cache,previous),1);cache.records.delete(root);}
    const source=catalog.groupRecords.get(root);if(!source)continue;
    const record=wordbookFilteredRecord(root,source.entries,cache.settings,source);if(!record)continue;
    const at=wordbookFilteredPosition(cache,record);cache.records.set(root,record);cache.groups.splice(at,0,record.group);
  }
}
function filterWordbookGroups(groups,q){
  const sortEl=document.getElementById('vsort');
  const sort=/** @type {HTMLInputElement|null} */(sortEl)?.value||'recent';
  if(!q&&!wordbookStars.size&&!wordbookBooks.size&&sort==='recent'){wordbookFilteredCache=null;return groups;}
  // A changed filter intentionally scans once. Subsequent saves update only
  // their affected groups through updateWordbookFilteredCatalog().
  const signature=JSON.stringify([q,sort,[...wordbookStars],[...wordbookBooks]]);
  if(wordbookFilteredCache?.source===groups&&wordbookFilteredCache.words===words&&wordbookFilteredCache.signature===signature)return wordbookFilteredCache.groups;
  const settings={q,sort,stars:new Set(wordbookStars),books:new Set(wordbookBooks)},records=new Map();
  const catalog=typeof vocabCatalog==='function'?vocabCatalog():null;
  groups.forEach(([root,entries],index)=>{
    const source=catalog?.groups===groups?catalog.groupRecords.get(root):{addedAt:Math.max(...entries.map(([,w])=>Number(w.addedAt)||0)),order:index};
    const record=wordbookFilteredRecord(root,entries,settings,source);if(record)records.set(root,record);
  });
  const ordered=[...records.values()].sort((a,b)=>wordbookFilteredOrder(a,b,sort));
  wordbookFilteredCache={source:groups,words,signature,settings,records,groups:ordered.map(record=>record.group)};
  return wordbookFilteredCache.groups;
}
function renderWordbookBookOptions(list,cachedNames=null){
  const options=document.getElementById('vbook-options');
  if(!options)return;
  const names=cachedNames||[...new Set(list.map(([,w])=>w.book||''))].sort();
  if(cachedNames&&cachedNames===wordbookRenderedBookNames&&options.dataset.names!==undefined)return;
  wordbookRenderedBookNames=cachedNames;
  const signature=JSON.stringify(names);
  if(options.dataset.names===signature) return;
  options.dataset.names=signature;
  options.replaceChildren();
  for(const name of names){
    const label=document.createElement('label'),input=document.createElement('input');
    input.type='checkbox';input.checked=wordbookBooks.has(name);
    input.addEventListener('change',()=>{if(input.checked) wordbookBooks.add(name);else wordbookBooks.delete(name);renderVocab()});
    label.append(input,document.createTextNode(name||'직접 추가'));options.append(label);
  }
  if(!names.length) options.textContent='저장된 책이 없어요.';
}
document.querySelectorAll('#vsort-options input').forEach(node=>node.addEventListener('change',()=>{
  const input=/** @type {HTMLInputElement} */(node);
  /** @type {HTMLInputElement} */(document.getElementById('vsort')).value=input.value;
  document.getElementById('vsort-label').textContent=input.nextElementSibling.textContent;
  document.getElementById('vsort-menu').removeAttribute('open');
  /** @type {HTMLElement} */(document.querySelector('#vsort-menu summary')).focus();
  renderVocab();
}));
function closeWordbookMenus(){
  document.querySelectorAll('#vsort-menu[open],#vbooks[open]').forEach(menu=>menu.removeAttribute('open'));
}
document.querySelectorAll('#vsort-menu,#vbooks').forEach(menu=>{
  document.addEventListener('click',event=>{
    if(event.target instanceof Node&&!menu.contains(event.target)) menu.removeAttribute('open');
  });
  menu.addEventListener('keydown',event=>{
    if(/** @type {KeyboardEvent} */(event).key==='Escape'){
      event.preventDefault();event.stopPropagation();
      menu.removeAttribute('open');
      /** @type {HTMLElement} */(menu.querySelector('summary')).focus({preventScroll:true});
    }
  });
});
document.querySelectorAll('#vstars button').forEach(button=>button.addEventListener('click',()=>{
  const status=Number(/** @type {HTMLElement} */(button).dataset.status);
  if(wordbookStars.has(status)) wordbookStars.delete(status);else wordbookStars.add(status);
  button.setAttribute('aria-pressed',String(wordbookStars.has(status)));button.classList.toggle('on',wordbookStars.has(status));renderVocab();
  if(typeof studySetsRefreshStarFilter==='function')studySetsRefreshStarFilter();
}));
function openWordbookAdd(){
  /** @type {HTMLFormElement} */(document.getElementById('wordbook-add-form')).reset();
  /** @type {HTMLDialogElement} */(document.getElementById('wordbook-add-dialog')).showModal();
  document.getElementById('wordbook-new-word').focus();
}
document.getElementById('wordbook-add-form').addEventListener('submit',event=>{
  event.preventDefault();
  const input=/** @type {HTMLInputElement} */(document.getElementById('wordbook-new-word'));
  const meaningInput=/** @type {HTMLInputElement} */(document.getElementById('wordbook-new-meaning'));
  const word=input.value.trim(),meaning=meaningInput.value.trim(),root=keyOf(word);
  if(!root||!meaning) return;
  // This is an explicit user addition. Reuse createMeaning and the existing tombstone contract.
  if(!words[root]){
    const now=Date.now(),buried=dead[root]||0;
    words[root]={word,clicked:word,forms:[word],ko:'',phon:'',defs:[],example:'',book:'',status:1,mark:true,addedAt:now,up:Math.max(now,buried+1)};
    delete dead[root];saveDead(root);
  }
  createMeaning(root,meaning,{});
  /** @type {HTMLDialogElement} */(document.getElementById('wordbook-add-dialog')).close();
  const search=document.getElementById('vsearch');if(search instanceof HTMLInputElement)search.value='';
  wordbookStars.clear();wordbookBooks.clear();
  document.querySelectorAll('#vstars button').forEach(b=>{b.setAttribute('aria-pressed','false');b.classList.remove('on');});
  document.getElementById('vbook-options')?.removeAttribute('data-names');
  renderVocab();if(typeof studySetsRefreshStarFilter==='function')studySetsRefreshStarFilter();toast('단어를 저장했어요');
});

function syncWordbookFilterLabels(){
  const label=document.getElementById('vbook-label'),books=document.getElementById('vbooks'),clear=document.getElementById('vfilter-clear'),search=document.getElementById('vsearch');
  if(label)label.textContent=wordbookBooks.size ? `책 ${wordbookBooks.size}권` : '모든 책';
  if(books)books.classList.toggle('filtered',wordbookBooks.size>0);
  if(clear)clear.hidden=!(wordbookStars.size||wordbookBooks.size||(search instanceof HTMLInputElement&&search.value.trim()));
}
function clearWordbookFilters(){
  wordbookStars.clear();wordbookBooks.clear();
  const search=document.getElementById('vsearch');if(search instanceof HTMLInputElement)search.value='';
  document.querySelectorAll('#vstars button').forEach(b=>{b.setAttribute('aria-pressed','false');b.classList.remove('on');});
  document.getElementById('vbook-options')?.removeAttribute('data-names');
  renderVocab();if(typeof studySetsRefreshStarFilter==='function')studySetsRefreshStarFilter();
}
