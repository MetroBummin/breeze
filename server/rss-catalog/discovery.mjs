// Match the existing local feed-only junk gate; no article fetch or Jev call.
export function obviousPromo(entry){
  const title=String(entry?.title || '');
  const promotional=/\b(?:coupon|promo|discount|voucher)\s+codes?\b/i.test(title) ||
    /\b\d{1,2}%\s+off\b/i.test(title) && /\b(?:deal|today|limited.time)\b/i.test(title);
  if(!promotional)return false;
  const body=String(entry.contentHtml || entry.summary || '').slice(0,200000)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
  // A short feed excerpt cannot establish that a longer article is promo-only.
  // Strong editorial signals or a developed body make this uncertain, so retain it.
  if(body.length>1200 || /\b(?:review|buying guide|report(?:ing)?|analysis|research|study|investigat\w*|discuss\w*|explain\w*|compare\w*|tested|strategy|announc\w*|how|why)\b/i.test(title+' '+body))return false;
  const redeem=/\b(?:use|enter|apply)\s+(?:the\s+)?(?:coupon\s+|promo\s+)?code\b|\bat checkout\b/i.test(body);
  const saving=/\b\d{1,2}%\s+off\b|\bsave\s+(?:up to\s+)?(?:\d{1,2}%|[$£€]\d+)|\bfree (?:shipping|delivery)\b/i.test(body);
  const boilerplate=/\b(?:verified|working)\s+(?:coupon\s+|promo\s+)?codes?\b|\b(?:limited.time|expires? (?:today|soon)|valid until|shop now|claim (?:this|your|the) deal)\b/i.test(body);
  return redeem && saving && boilerplate;
}
