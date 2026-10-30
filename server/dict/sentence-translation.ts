// Sentence translation ("explain") always targets Korean. The app language
// setting changes headings only (scripts/ui/i18n.js); dictionary content stays
// Korean. The model is a multilingual provider that can drift into Chinese on
// long passages full of invented proper nouns, so the output language is
// checked here instead of trusted.
export const SENTENCE_TARGET="ko";
export const EXPLAIN_SYSTEM="You translate English passages into natural Korean (ko-KR, Hangul) for Korean readers. The ko field is always Korean written in Hangul. Never answer in Chinese, Japanese or English. Reply with ONLY minified JSON. No markdown, no code fence, no commentary.";
export const EXPLAIN_CORRECTION="\nCorrection: the previous response was not Korean. Write ko in Korean Hangul only (한국어). Do not use Chinese characters or Japanese. Return {\"ko\":\"...\"} only.";
export function explainPrompt(sentence:string){return `문장: ${sentence}\n\n영어를 읽는 한국인에게 이 문장을 자연스러운 한국어로 번역하세요.\n\n- 출력 언어: 한국어(한글). 중국어·일본어·영어로 답하지 마세요.\n- ko: 문장 전체의 자연스러운 한국어 해석.\n- 영어 어순과 표현을 그대로 옮기지 말고, 원문의 의미를 보존하면서 한국어 화자가 실제로 말하거나 글로 쓸 법한 자연스러운 문장으로 작성하세요.\n- 고유명사는 한글로 음역하거나 원문 로마자를 그대로 쓰세요. 한자로 옮기지 마세요.\n- 해석에서 원문의 의미를 임의로 추가하거나 빼지 마세요.\n\n{"ko":""}`}

const HANGUL=/[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7A3]/gu;
const HAN=/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/gu;
const KANA=/[\u3040-\u30FF\u31F0-\u31FF]/gu;
const count=(text:string,re:RegExp)=>(text.match(re)||[]).length;
// Korean prose is Hangul. An occasional Hanja gloss is tolerated; kana, no
// Hangul, or Han characters beyond a tenth of the Hangul is another language.
export function isKoreanText(text:string){
  const hangul=count(text,HANGUL);
  if(!hangul||count(text,KANA))return false;
  return count(text,HAN)*10<=hangul;
}
// Throws invalid_language so ask() retries the provider and then falls back.
export function koreanTranslation(raw:unknown){
  const ko=String(raw??"").trim().slice(0,500);
  if(!ko)throw new Error("sentence_empty_answer");
  if(!isKoreanText(ko))throw new Error("invalid_language");
  return ko;
}
