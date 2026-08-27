// READY lexical primitives. The inflection rules are deliberately kept in sync
// with Breeze's proven small lemmatizer, without importing its reader/storage runtime.
const IRREG = {
  was:'be',were:'be',is:'be',are:'be',am:'be',been:'be',being:'be',has:'have',had:'have',having:'have',does:'do',did:'do',done:'do',doing:'do',
  went:'go',gone:'go',goes:'go',going:'go',said:'say',made:'make',took:'take',taken:'take',came:'come',got:'get',gotten:'get',gave:'give',given:'give',
  found:'find',thought:'think',told:'tell',became:'become',left:'leave',felt:'feel',brought:'bring',began:'begin',begun:'begin',kept:'keep',held:'hold',
  wrote:'write',written:'write',stood:'stand',heard:'hear',meant:'mean',met:'meet',ran:'run',paid:'pay',sat:'sit',spoke:'speak',spoken:'speak',led:'lead',
  grew:'grow',grown:'grow',lost:'lose',fell:'fall',fallen:'fall',sent:'send',built:'build',understood:'understand',drew:'draw',drawn:'draw',broke:'break',
  broken:'break',spent:'spend',rose:'rise',risen:'rise',drove:'drive',driven:'drive',bought:'buy',wore:'wear',worn:'wear',chose:'choose',chosen:'choose',
  ate:'eat',eaten:'eat',knew:'know',known:'know',saw:'see',seen:'see',sold:'sell',taught:'teach',caught:'catch',fought:'fight',sought:'seek',swept:'sweep',
  flew:'fly',flown:'fly',threw:'throw',thrown:'throw',lain:'lie',lay:'lie',woke:'wake',woken:'wake',hidden:'hide',hid:'hide',men:'man',women:'woman',
  children:'child',feet:'foot',teeth:'tooth',mice:'mouse',leaves:'leaf',lives:'life',wives:'wife',knives:'knife',selves:'self',shelves:'shelf',
  movies:'movie',cookies:'cookie',calories:'calorie',better:'good',best:'good',worse:'bad',worst:'bad'
};
const NO_LEMMA = new Set(['news','always','perhaps','these','those','series','species','during','evening','morning','nothing','something','anything','everything','indeed','hundred','sacred','hatred','united','ing','analysis','basis','crisis','thesis','themselves','ourselves','yourselves','myself','yourself','himself','herself','itself','oneself']);
const DULL_TAIL=/(?:er|en|el|on|or)$/;
const vowelRuns=s=>(s.match(/[aeiouy]+/g)||[]).length;
const needsSilentE=b=>/[^aeiou][aeiou][^aeiouwxy]$/.test(b)&&!(DULL_TAIL.test(b)&&vowelRuns(b)>1);

export function lemma(raw){
  const w=String(raw||'').toLowerCase().replace(/’/g,"'").replace(/^[^a-z]+|[^a-z']+$/g,'');
  if(IRREG[w])return IRREG[w]; if(w.length<4||NO_LEMMA.has(w))return w;
  const hasVowel=s=>/[aeiouy]/.test(s);
  if(/ies$/.test(w)&&w.length>4)return w.slice(0,-3)+'y';
  if(/(sses|shes|ches|xes|zes)$/.test(w))return w.slice(0,-2);
  if(/oes$/.test(w)&&w.length>4)return w.slice(0,-2);
  if(/s$/.test(w)&&!/(ss|us|is)$/.test(w))return w.slice(0,-1);
  if(/ing$/.test(w)&&w.length>5){let b=w.slice(0,-3);if(!hasVowel(b))return w;if(b.length>2&&b.at(-1)===b.at(-2)&&!/(ll|ss|zz)$/.test(b))return b.slice(0,-1);return needsSilentE(b)?b+'e':b;}
  if(/ed$/.test(w)&&w.length>4&&!/eed$/.test(w)){let b=w.slice(0,-2);if(!hasVowel(b))return w;if(b.length>2&&b.at(-1)===b.at(-2)&&!/(ll|ss|zz)$/.test(b))return b.slice(0,-1);if(/(?:[cgsv]|bl|gl|iz)$/.test(b)||needsSilentE(b))return b+'e';return b;}
  return w;
}

export function tokenizeSentence(text){
  const out=[]; const pattern=/[A-Za-z]+(?:[’'][A-Za-z]+)*/g; let match;
  while((match=pattern.exec(String(text||''))))out.push({tokenIndex:out.length,surface:match[0],normalized:match[0].toLowerCase().replace(/’/g,"'"),lemma:lemma(match[0]),startOffset:match.index,endOffset:match.index+match[0].length});
  return out;
}
