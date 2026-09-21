/* Presentation filters do not mutate saved Meaning records or their grouping. */
const wordbookStars=new Set();
const wordbookBooks=new Set();
function filterWordbookGroups(groups,q){
  const filtered=groups.filter(([root,entries])=>{
    const head=words[root]||entries[0][1];
    return (!wordbookStars.size||wordbookStars.has(Number(head.status))) && entries.some(([,w])=>
      (!wordbookBooks.size||wordbookBooks.has(w.book||'')) &&
      (!q||w.word.toLowerCase().includes(q)||(w.ko||'').toLowerCase().includes(q)||(w.book||'').toLowerCase().includes(q)));
  });
  const sort=/** @type {HTMLInputElement} */(document.getElementById('vsort')).value;
  const added=entries=>Math.max(...entries.map(([,w])=>Number(w.addedAt)||0));
  return filtered.sort((a,b)=>sort==='alpha' ? a[1][0][1].word.localeCompare(b[1][0][1].word) :
    (sort==='oldest'?1:-1)*(added(a[1])-added(b[1])));
}
function renderWordbookBookOptions(list){
  const names=[...new Set(list.map(([,w])=>w.book||''))].sort();
  const options=document.getElementById('vbook-options');
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
document.addEventListener('click',event=>{
  const menu=document.getElementById('vsort-menu');
  if(!menu.contains(/** @type {Node} */(event.target))) menu.removeAttribute('open');
});
document.getElementById('vsort-menu').addEventListener('keydown',event=>{
  if(/** @type {KeyboardEvent} */(event).key==='Escape'){
    event.preventDefault();event.stopPropagation();
    document.getElementById('vsort-menu').removeAttribute('open');
    /** @type {HTMLElement} */(document.querySelector('#vsort-menu summary')).focus();
  }
});
document.querySelectorAll('#vstars button').forEach(button=>button.addEventListener('click',()=>{
  const status=Number(/** @type {HTMLElement} */(button).dataset.status);
  if(wordbookStars.has(status)) wordbookStars.delete(status);else wordbookStars.add(status);
  button.setAttribute('aria-pressed',String(wordbookStars.has(status)));renderVocab();
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
    delete dead[root];save(LS_DEAD,dead);
  }
  createMeaning(root,meaning,{});
  /** @type {HTMLDialogElement} */(document.getElementById('wordbook-add-dialog')).close();
  /** @type {HTMLInputElement} */(document.getElementById('vsearch')).value='';
  wordbookStars.clear();wordbookBooks.clear();
  document.querySelectorAll('#vstars button').forEach(b=>b.setAttribute('aria-pressed','false'));
  document.getElementById('vbook-options').removeAttribute('data-names');
  renderVocab();toast('단어를 저장했어요');
});

function syncWordbookFilterLabels(){
  document.getElementById('vbook-label').textContent=wordbookBooks.size ? `책 ${wordbookBooks.size}권` : '모든 책';
  document.getElementById('vbooks').classList.toggle('filtered',wordbookBooks.size>0);
  document.getElementById('vfilter-clear').hidden=!(wordbookStars.size||wordbookBooks.size||/** @type {HTMLInputElement} */(document.getElementById('vsearch')).value.trim());
}
function clearWordbookFilters(){
  wordbookStars.clear();wordbookBooks.clear();
  /** @type {HTMLInputElement} */(document.getElementById('vsearch')).value='';
  document.querySelectorAll('#vstars button').forEach(b=>b.setAttribute('aria-pressed','false'));
  document.getElementById('vbook-options').removeAttribute('data-names');
  renderVocab();
}
