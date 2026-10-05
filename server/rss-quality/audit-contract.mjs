// Pure contract shared by the private audit runner and offline reports.
// This module is not imported by production RSS serving code.
export const PRICE=Object.freeze({model:'jev-1.13.0',asOf:'2026-10-05',source:'https://docs.typesafe.ai/models',inputUsdPerMillion:0.042,outputUsdPerMillion:0,cachedDiscount:'not documented; no discount assumed'});
export const LIMITS=Object.freeze({articles:12,attempts:24,usd:0.10,concurrency:1,retries:0,reservedInputTokens:65536});
export const RESERVATION_NANO_USD=65536*42;
export const RESERVATION_USD=RESERVATION_NANO_USD/1e9;
export const LEDGER_ID='RSS-000';
export function requestFor(article,implementation){
  return {model:implementation.MODEL,state:{untrusted_article:{title:article.title,paragraphs:article.paragraphs.map((text,i)=>({id:`p${i+1}`,text})),links:article.links,extraction:article.checks}},questions:implementation.questions(article)};
}
const tokens=n=>Number.isSafeInteger(n)&&n>=0?n:null;
export function usageRecord(raw){
  const inputTokens=tokens(raw?.input_tokens),outputTokens=tokens(raw?.output_tokens);
  const cachedTokens=tokens(raw?.cached_input_tokens ?? raw?.cached_tokens ?? raw?.input_tokens_details?.cached_tokens);
  return {inputTokens,outputTokens,cachedTokens:inputTokens!==null&&cachedTokens!==null&&cachedTokens<=inputTokens?cachedTokens:null};
}
export function costRecord(usage,{responseModel=null,attempted=true,reserved=attempted}={}){
  const known=usage.inputTokens!==null && usage.outputTokens!==null && responseModel===PRICE.model;
  return {pricing:PRICE,tokenEstimateUsd:attempted&&known?usage.inputTokens*42/1e9:null,
    estimateBasis:attempted&&known?'provider-reported tokens at documented price':'unknown',invoiceChargeUsd:null,billableStatus:attempted?'not invoice-verified':'no attempt',
    reservationUsd:reserved?RESERVATION_USD:0,cachedDiscountApplied:false};
}
export async function digest(value){
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));
  return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
