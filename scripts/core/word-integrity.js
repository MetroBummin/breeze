/* Saved meanings are cards. Dictionary candidates and an AI suggestion are not
   saved meanings; only a non-blank card.ko makes a vocabulary entry. */
function validWordMeaning(item){ return !!(item && typeof item.ko === 'string' && item.ko.trim()); }
function cleanOrphanWords(items, tombstones, protectedKey){
  let changed=false;
  const groups=new Map();
  Object.entries(items).forEach(([key,item])=>{
    if(!item) return;
    /* An older confirmed answer sometimes kept its meaning only under ai.ko.
       Do not turn a user's explicitly emptied card or a mere suggestion into one. */
    if(!validWordMeaning(item) && !item.koEdited && item.ai && item.ai.done &&
        typeof item.ai.ko==='string' && item.ai.ko.trim()){
      item.ko=item.ai.ko.trim(); changed=true;
    }
    const root=item.root||key;
    if(!groups.has(root)) groups.set(root,[]);
    groups.get(root).push([key,item]);
  });
  groups.forEach((cards,root)=>{
    if(root===protectedKey) return; // a live lookup is still waiting for its answer
    const valid=cards.filter(([,item])=>validWordMeaning(item));
    const empty=cards.filter(([,item])=>!validWordMeaning(item));
    if(!empty.length) return;
    const bury=(key,item)=>{
      delete items[key];
      tombstones[key]=Math.max(Date.now(),(item.up||item.addedAt||0)+1,tombstones[key]||0);
      changed=true;
    };
    if(valid.length && items[root] && !validWordMeaning(items[root])){
      /* Keep the root identity used by Reader highlighting, not an empty root
         plus a floating sense. Preserve its status and original metadata. */
      const [key,item]=valid[0],base=items[root];
      items[root]={...item,root:undefined,sense:undefined,word:base.word||item.word,
        clicked:base.clicked||item.clicked,forms:base.forms||item.forms,
        status:base.status||item.status,mark:base.mark,
        addedAt:base.addedAt||item.addedAt,up:Math.max(Date.now(),base.up||0,item.up||0)+1};
      bury(key,item);
    }
    empty.forEach(([key,item])=>{ if(items[key] && !validWordMeaning(items[key])) bury(key,item); });
  });
  return changed;
}
