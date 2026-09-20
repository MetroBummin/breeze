/* Saved meanings are cards. Dictionary candidates and an AI suggestion are not
   saved meanings; only a non-blank card.ko makes a vocabulary entry. */
function validWordMeaning(item){ return !!(item && typeof item.ko === 'string' && item.ko.trim()); }
/* Storage truth and presentation truth are deliberately different. The Words UI
   may hide legacy phrase children or dedupe equal labels, but either record is
   still a saved meaning and must prevent a one-card delete from becoming a
   whole-word delete. */
function savedMeaningRecords(root, items){
  const source=items || (typeof words!=='undefined' ? words : {});
  return Object.entries(source).filter(([key,item])=>item&&(key===root||item.root===root)
    && validWordMeaning(item));
}
/* Promote a meaning into the stable Reader/root address. Meaning-specific fields
   come from the survivor; word identity and learning state stay with the root.
   In particular, stray legacy phrase metadata on a child must not change which
   Reader spans this root highlights. */
function promotedRootMeaning(base, survivor, now){
  const promoted={...survivor,word:base.word||survivor.word,
    clicked:base.clicked||survivor.clicked,forms:base.forms||survivor.forms,
    status:base.status==null?survivor.status:base.status,
    mark:base.mark==null?survivor.mark:base.mark,
    addedAt:base.addedAt||survivor.addedAt,up:now};
  delete promoted.root; delete promoted.sense;
  ['phrase','phraseParts','phraseGaps'].forEach(key=>{
    if(Object.prototype.hasOwnProperty.call(base,key)) promoted[key]=base[key];
    else delete promoted[key];
  });
  return promoted;
}
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
    const valid=savedMeaningRecords(root,items);
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
      items[root]=promotedRootMeaning(base,item,Math.max(Date.now(),base.up||0,item.up||0)+1);
      bury(key,item);
    }
    empty.forEach(([key,item])=>{ if(items[key] && !validWordMeaning(items[key])) bury(key,item); });
  });
  return changed;
}
