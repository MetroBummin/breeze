/* 붙임글자(ligature) 되살리기 — 화면에 뜨는 네모(□)를 없앱니다.

   EPUB·HTML은 유니코드가 정해 둔 자리(ﬁ ﬂ ﬀ …)를 쓰므로 표 하나면 끝납니다.

   PDF는 다릅니다. Type 3 글꼴로 조판한 책은 "Th", "ft" 같은 붙임글자를 글꼴
   안의 사용자 지정 자리(U+E000–U+F8FF)에 넣어 두고, **그 자리가 무슨 글자인지
   어디에도 적어 두지 않습니다.** 글꼴 파일에 이름표조차 없어서(Type 3 는 글자마다
   그림 명령일 뿐입니다) 뒤져 볼 곳이 없습니다. 그래서 "The scythe"가 "□e scythe"로
   보입니다.

   답은 책 안에 있습니다. 같은 책에서 멀쩡히 읽힌 낱말들과 맞춰 보면 됩니다:

     a□ernoon · so□ · o□en · A□er · le□
       ft →  afternoon · soft · often · after · left   ← 이 책에 다 있는 낱말
       fi →  afiernoon · sofi · ofien · Afier · lefi   ← 하나도 없음

   후보 중 이 책의 낱말집을 만들어 내는 것은 언제나 하나뿐이었습니다. 사전도,
   AI도, 인터넷도 필요 없습니다 — 책이 스스로 답을 갖고 있습니다. */

/* 유니코드가 이미 자리를 정해 둔 것들 — 짐작할 것이 없습니다. */
const UNICODE_LIGATURES = {
  'ﬀ':'ff', 'ﬁ':'fi', 'ﬂ':'fl', 'ﬃ':'ffi',
  'ﬄ':'ffl', 'ﬅ':'st', 'ﬆ':'st',
};
const UNICODE_LIGATURE_RE = /[\uFB00-\uFB06]/g;

/* 라틴 활자가 실제로 붙여 쓰는 짝. 이 밖의 것을 넣어 봐야 낱말이 되지 않습니다. */
const LIGATURE_GUESSES = ['th','ft','fi','fl','ff','ffi','ffl','st','ct','tt','sp','fj','tz'];

const PUA_RE = /[\uE000-\uF8FF]/;
const PUA_ALL_RE = /[\uE000-\uF8FF]/g;
const LIGATURE_WORD = "[A-Za-z'’]";

function normalizeLigatures(value){
  return String(value||'').replace(UNICODE_LIGATURE_RE, ch => UNICODE_LIGATURES[ch] || ch);
}

function hasUnknownGlyphs(value){ return PUA_RE.test(String(value||'')); }

/* 책 전체를 한 번에 보고, 모르는 글자마다 무엇이었는지 정합니다. */
function learnLigatures(text){
  const source = String(text||'');
  const glyphs = [...new Set(source.match(PUA_ALL_RE) || [])];
  if(!glyphs.length) return null;

  /* 멀쩡한 낱말집. 대소문자는 섞어 봅니다 — 붙임글자는 대문자 쪽에만 있는
     경우가 많아서("The"만 붙이고 "the"는 그냥 두는 식), 대소문자를 따지면
     정답이 낱말집에 없는 것처럼 보입니다. */
  const clean = new Set();
  for(const word of source.match(/[A-Za-z][A-Za-z'’]*/g) || [])
    clean.add(word.toLowerCase().replace(/’/g,"'"));

  const map = {};
  for(const glyph of glyphs){
    const pieces = [...new Set(source.match(new RegExp(LIGATURE_WORD+'*'+glyph+LIGATURE_WORD+'*','g')) || [])];
    let best = null;
    for(const guess of LIGATURE_GUESSES){
      let hits = 0;
      for(const piece of pieces){
        const word = piece.split(glyph).join(guess).toLowerCase().replace(/’/g,"'");
        if(clean.has(word)) hits++;
      }
      if(!best || hits > best.hits) best = {guess, hits, rivals:1};
      else if(hits === best.hits) best.rivals++;
    }
    /* 1등이 2등과 비기면 근거가 없는 것입니다. 잘못 고쳐 놓느니 네모로 둡니다. */
    if(best && best.hits > 0 && best.rivals === 1) map[glyph] = best.guess;
  }
  return Object.keys(map).length ? map : null;
}

/* 붙임글자에는 대소문자가 없습니다. "Th" 글자 하나가 문장 첫머리에서는 "The",
   제목 안에서는 "THE"가 되어야 합니다. 그건 짐작이 아니라 조판 규칙입니다. */
function ligatureOpensSentence(before){
  const tail = before.slice(-8).replace(/[\s"'“”‘’(\[]+$/,'');
  return !tail || /[.!?…:;\n]$/.test(tail);
}

function applyLigatures(text, map){
  const source = normalizeLigatures(text);
  if(!map || !PUA_RE.test(source)) return source;
  let out = '';
  for(let index = 0; index < source.length; index++){
    const ch = source[index];
    const guess = map[ch];
    if(!guess){ out += ch; continue; }
    const next = source[index+1] || '';
    const opensWord = !/[A-Za-z'’]/.test(out.slice(-1));
    if(/[A-Z]/.test(next)) out += guess.toUpperCase();
    else if(opensWord && ligatureOpensSentence(out)) out += guess.charAt(0).toUpperCase() + guess.slice(1);
    else out += guess;
  }
  return out;
}

/* 예전에 넣어 둔 책도 열 때 한 번 고칩니다. 반입 코드를 고쳐도 이미 기기에
   들어 있는 책은 그대로이기 때문입니다. 고친 뒤에는 표를 책에 적어 두므로
   (book.glyphs) 다음부터는 이 일을 다시 하지 않고, 원본 화면도 같은 표를 씁니다. */
async function repairBookLigatures(book){
  if(!book || !Array.isArray(book.paras) || book.glyphs) return false;
  if(!book.paras.some(hasUnknownGlyphs)) return false;
  const map = learnLigatures(book.paras.join('\n'));
  if(!map) return false;
  book.paras = book.paras.map(para => applyLigatures(para, map));
  const blocks = book.formatting && book.formatting.blocks;
  if(Array.isArray(blocks)) blocks.forEach(block => {
    if(block.t) block.t = applyLigatures(block.t, map);
    if(block.v) block.v = applyLigatures(block.v, map);
  });
  book.glyphs = map;
  try{ await bookPut(book); }catch(error){}
  return true;
}
