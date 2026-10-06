/* Shared lexical primitives for Breeze and READY.
 *
 * This is deliberately a classic script as well as a Deno-importable module:
 * Breeze's reader remains a non-module application, while READY imports this
 * exact file through server/ready/lexical-core.mjs. Do not fork these rules. */
(() => {
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
  // Lookup validation owns a wider morphology vocabulary than storage identity.
  // Do not feed these additions into lemma()/lemmaCands(): even appended values
  // can redirect keyOf() to an existing card and change saved-word highlights.
  const EXTRA_LEMMAS = {
    arose:'arise',arisen:'arise',awoke:'awake',awoken:'awake',bent:'bend',bit:'bite',bitten:'bite',bled:'bleed',blew:'blow',blown:'blow',
    bore:'bear',born:'bear',borne:'bear',bound:'bind',bred:'breed',burnt:'burn',clung:'cling',crept:'creep',dealt:'deal',dug:'dig',
    drank:'drink',drunk:'drink',dreamt:'dream',fed:'feed',flung:'fling',forbade:'forbid',forbidden:'forbid',forgot:'forget',forgotten:'forget',
    froze:'freeze',frozen:'freeze',hung:'hang',knelt:'kneel',leant:'lean',leapt:'leap',lent:'lend',lit:'light',rode:'ride',ridden:'ride',
    rang:'ring',rung:'ring',shook:'shake',shaken:'shake',shone:'shine',shot:'shoot',shrank:'shrink',shrunk:'shrink',sang:'sing',sung:'sing',
    sank:'sink',sunk:'sink',slept:'sleep',slid:'slide',smelt:'smell',sped:'speed',spelt:'spell',spilt:'spill',spun:'spin',spat:'spit',
    sprang:'spring',sprung:'spring',stole:'steal',stolen:'steal',stuck:'stick',stung:'sting',stank:'stink',stunk:'stink',struck:'strike',
    striven:'strive',strove:'strive',swore:'swear',sworn:'swear',swam:'swim',swum:'swim',swung:'swing',tore:'tear',torn:'tear',
    wept:'weep',won:'win',wound:'wind',died:'die',lied:'lie',tied:'tie',vied:'vie'
  };
  const DULL_TAIL=/(?:er|en|el|on|or)$/;
  const vowelRuns=s=>(s.match(/[aeiouy]+/g)||[]).length;
  const needsSilentE=b=>/[^aeiou][aeiou][^aeiouwxy]$/.test(b)&&!(DULL_TAIL.test(b)&&vowelRuns(b)>1);

  function lemma(raw){
    const w=String(raw||'').toLowerCase().replace(/’/g,"'").replace(/^[^a-z]+|[^a-z']+$/g,'');
    if(Object.prototype.hasOwnProperty.call(IRREG,w))return IRREG[w]; if(w.length<4||NO_LEMMA.has(w))return w;
    const hasVowel=s=>/[aeiouy]/.test(s);
    if(/ies$/.test(w)&&w.length>4)return w.slice(0,-3)+'y';
    if(/(sses|shes|ches|xes|zes)$/.test(w))return w.slice(0,-2);
    if(/oes$/.test(w)&&w.length>4)return w.slice(0,-2);
    if(/s$/.test(w)&&!/(ss|us|is)$/.test(w))return w.slice(0,-1);
    if(/ing$/.test(w)&&w.length>5){let b=w.slice(0,-3);if(!hasVowel(b))return w;if(b.length>2&&b.at(-1)===b.at(-2)&&!/(ll|ss|zz)$/.test(b))return b.slice(0,-1);return needsSilentE(b)?b+'e':b;}
    if(/ed$/.test(w)&&w.length>4&&!/eed$/.test(w)){let b=w.slice(0,-2);if(!hasVowel(b))return w;if(b.length>2&&b.at(-1)===b.at(-2)&&!/(ll|ss|zz)$/.test(b))return b.slice(0,-1);if(/(?:[cgsv]|bl|gl|iz)$/.test(b)||needsSilentE(b))return b+'e';return b;}
    return w;
  }
  const isAcro = w => /^[A-Z]{2,6}s?$/.test(w);
  function lemmaCands(raw){
    const w0=String(raw||'').toLowerCase().replace(/’/g,"'");
    if(isAcro(String(raw||'')))return [w0.replace(/s$/,'')];
    const set=new Set([lemma(w0)]),addWithE=b=>{set.add(b);set.add(b+'e');if(b.length>2&&b.at(-1)===b.at(-2))set.add(b.slice(0,-1));};
    if(/ing$/.test(w0)&&w0.length>5&&/[aeiouy]/.test(w0.slice(0,-3)))addWithE(w0.slice(0,-3));
    if(/ed$/.test(w0)&&w0.length>4&&/[aeiouy]/.test(w0.slice(0,-2)))addWithE(w0.slice(0,-2));
    set.add(w0);[...set].forEach(candidate=>{if(candidate!==w0&&candidate.endsWith('e'))set.add(candidate.slice(0,-1));});
    return [...set];
  }
  function lookupLemmaCands(raw){
    const surface=String(raw||'').replace(/’/g,"'"),word=surface.toLowerCase();
    // Preserve case-sensitive acronym plurals (IDs -> ID) while also allowing
    // ordinary all-caps inflections (SLEPT -> sleep).
    const set=new Set([...lemmaCands(surface),...lemmaCands(word)]);
    if(Object.prototype.hasOwnProperty.call(EXTRA_LEMMAS,word))set.add(EXTRA_LEMMAS[word]);
    if(/ied$/.test(word)&&word.length>4)set.add(word.slice(0,-3)+'y');
    if(/'s$/.test(word))lookupLemmaCands(word.slice(0,-2)).forEach(candidate=>set.add(candidate));
    return [...set];
  }
  globalThis.BreezeLexical=Object.freeze({lemma,lemmaCands,lookupLemmaCands,isAcro});
})();
