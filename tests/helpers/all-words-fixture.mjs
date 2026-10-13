export function allWordsFixture(count=2399){
 const groups=count===2399?2294:Math.floor(count*.9);
 return Object.fromEntries(Array.from({length:count},(_,i)=>['w'+i,{
  word:'word '+(i%groups),root:'w'+(i%groups),ko:'저장된 뜻 '+i,
  example:('This is the unchanged saved example for word '+(i%groups)+'. ').repeat(12),
  book:'Saved '+(i%40),status:i%3+1,addedAt:i+1
 }]));
}
