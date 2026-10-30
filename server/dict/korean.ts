// Korean-output safety net for sentence translation.
//
// Issue #319: the sentence 'explain' op accepted any non-empty `ko` string, so a
// provider that answered in Simplified Chinese (e.g. DeepSeek, or the Gemini
// fallback) had its Chinese text returned and cached. This is a small, pure guard
// — not a language detector. It only rejects output that is predominantly CJK Han
// (Chinese) with effectively no Hangul, while still accepting normal Korean that
// may carry a few Hanja, Latin proper nouns, numbers and punctuation.
//
// Counted ranges:
//   Hangul : syllables U+AC00–U+D7A3, conjoining jamo U+1100–U+11FF, compatibility
//            jamo U+3130–U+318F.
//   Han    : CJK unified U+4E00–U+9FFF and extension A U+3400–U+4DBF.

export function countHangul(text:string):number{
  let n=0;
  for(const ch of text){
    const c=ch.codePointAt(0)!;
    if((c>=0xAC00&&c<=0xD7A3)||(c>=0x1100&&c<=0x11FF)||(c>=0x3130&&c<=0x318F))n++;
  }
  return n;
}
export function countHan(text:string):number{
  let n=0;
  for(const ch of text){
    const c=ch.codePointAt(0)!;
    if((c>=0x4E00&&c<=0x9FFF)||(c>=0x3400&&c<=0x4DBF))n++;
  }
  return n;
}

// Accept when the text carries real Korean. Reject Chinese output: Han present
// while Hangul is effectively absent, or Han overwhelmingly dominates Hangul.
// Incidental Hanja inside otherwise-Korean text (Hangul >= Han) is allowed.
export function isKoreanTranslation(text:unknown):boolean{
  const s=String(text??"").trim();
  if(!s)return false;
  const hangul=countHangul(s);
  const han=countHan(s);
  // No Han: a Latin/numeric/punctuation-only answer is not a Korean translation.
  if(han===0)return hangul>0;
  // Han present: require some Hangul and that Hangul is not dominated by Han.
  return hangul>0&&hangul>=han;
}

// The raw-text acceptance gate used by opExplain's ask() call. A provider's reply
// is the explain JSON ({"ko":"..."}); accept only when the parsed ko is Korean.
// Exported so the regression test checks the exact gate the server uses — if the
// Korean guard were dropped, this returns true for Chinese and the test fails.
export function explainAcceptsText(raw:string):boolean{
  let ko="";
  try{
    const parsed=JSON.parse(raw);
    if(parsed&&typeof parsed==="object"&&!Array.isArray(parsed))ko=String((parsed as Record<string,unknown>).ko??"");
  }catch{
    const m=raw.match(/\{[\s\S]*\}/);
    if(m){try{const parsed=JSON.parse(m[0]);if(parsed&&typeof parsed==="object")ko=String((parsed as Record<string,unknown>).ko??"");}catch{/* ignore */}}
  }
  return isKoreanTranslation(ko);
}
