/* Device-local study snapshots. A single atomic value keeps membership, exclusions
   and round progress together. Vocabulary items and cloud sync are untouched. */
const STUDY_SETS_STORAGE='breeze.study-sets.v1';
let studySetsReadValue;
function readStudySets(){
  const raw=localStorage.getItem(STUDY_SETS_STORAGE);
  const state=BreezeStudySets.decode(raw);
  studySetsReadValue=raw;
  return state;
}
function commitStudySets(next){
  // Never replace unread, damaged, future-version or concurrently changed data.
  const current=localStorage.getItem(STUDY_SETS_STORAGE);
  BreezeStudySets.decode(current);
  if(studySetsReadValue===undefined||current!==studySetsReadValue)
    throw new Error('Study sets changed. Reopen and retry.');
  const serialized=JSON.stringify(BreezeStudySets.normalize(next));
  if(current!==null&&JSON.parse(current).version===1){
    const key=STUDY_SETS_STORAGE+'.backup-v1';
    if(localStorage.getItem(key)===null)localStorage.setItem(key,current);
  }
  localStorage.setItem(STUDY_SETS_STORAGE,serialized);
  studySetsReadValue=serialized;
  if(typeof requestDurableLocalStorage==='function')void requestDurableLocalStorage();
}
