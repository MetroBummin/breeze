// Preserve the existing discovery language heuristic, now applied to the body.
const RSS_ENGLISH_WORDS = new Set('the a an and or but if in on at to of for from with by as is are was were be been being it its this that these those they their them we our you your he she his her who which what when where how not no can could would should will have has had do does did more most some any all one about into over after before than there here also such through between while because only other'.split(' '));
const RSS_OTHER_WORDS = new Set('yang dan dengan untuk dari pada dalam tidak adalah sebagai juga mereka saya kamu kita ini itu tersebut oleh karena maka akan telah sudah dapat bisa namun tetapi seorang beberapa waktu lalu ketika sebuah serta tentang menurut menjadi orang sangat atau antara dari kepada la les des une un et dans pour avec sur aux est sont nous vous ils elle il ce cette ces pas qui que je de du en mais au se son ses plus una uno los las el ella del por con para como sobre sus este esta estos estas pero porque muy anche della delle sono che non per gli una uno einen eine und der die das nicht ist ich wir sie den dem auf mit ein zu im von es sich des et cette une les dans pour avec qui que pas aux du au est sont nous vous je'.split(' '));
export function looksEnglish(body){
  const sample=body.slice(0,6000).toLowerCase();
  const letters=sample.match(/\p{L}/gu)?.length || 0;
  if(letters>=20 && (sample.match(/[a-z]/g)?.length || 0)/letters<.65)return false;
  const words=sample.match(/[a-z]+(?:'[a-z]+)?/g)?.slice(0,450) || [];
  if(words.length<3)return false;
  const english=words.filter(word=>RSS_ENGLISH_WORDS.has(word)).length;
  const other=words.filter(word=>RSS_OTHER_WORDS.has(word) && !RSS_ENGLISH_WORDS.has(word)).length;
  return english>=Math.max(words.length<15?1:2,Math.ceil(words.length*.055)) && english>other;
}
