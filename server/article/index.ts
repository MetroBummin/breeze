// Breeze — 기사 HTML 중계 Edge Function
// Supabase 대시보드 → Edge Functions → Deploy a new function → Via Editor
// 함수 이름: article   ← 반드시 이 이름
//
//   supabase functions deploy article
//
// Secret 이 필요 없습니다. 하는 일은 딱 하나 — 브라우저가 CORS 때문에 직접
// 읽지 못하는 것을 그대로 건네줍니다.
//
//   ?url=…              기사 HTML  -> { url, html }
//   ?url=…&as=image     기사 사진   -> 그림 바이트 그대로
//
// 본문 추출은 여기서 하지 않습니다. 브라우저에는 이미 진짜 HTML 파서가 있고,
// 규칙을 고칠 때마다 서버를 다시 배포하고 싶지 않기 때문입니다.
// 추출 규칙은 scripts/importers/article.js 에 있습니다.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control":"no-store" },
  });

const MAX_BYTES = 3_000_000;   // 기사 한 편치고 3MB 를 넘으면 기사가 아닙니다
const MAX_IMAGE_BYTES = 2_000_000;
const TIMEOUT_MS = 12_000;

// Node-compatible transport pins validated DNS addresses and bounds streaming bodies.
import {fetchPublic,publicUrl} from "./public-fetch.mjs";
import {fetchXEmbed} from "./social-embed.mjs";
let activeRequests=0;
function safeUrl(raw:string|null):URL|null{try{return raw?publicUrl(raw):null;}catch{return null;}}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET") return json({ error: "method", message: "GET 만 받습니다" }, 405);

  const params = new URL(req.url).searchParams;
  const url = safeUrl(params.get("url"));
  if (!url) return json({ error: "bad_url", message: "열 수 없는 주소예요" }, 400);
  const asImage = params.get("as") === "image";
  if(activeRequests>=8)return json({error:"busy",message:"잠시 후 다시 시도해 주세요"},503);
  activeRequests++;

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    if(params.get("as")==="x-oembed"){
      const result=await fetchXEmbed(url.href,abort.signal,fetchPublic);
      return json(result.body,result.status);
    }
    const upstream = await fetchPublic(url.href, {
      limit:asImage?MAX_IMAGE_BYTES:MAX_BYTES,
      signal: abort.signal,
      headers: {
        // 봇 차단에 바로 걸리지 않도록 평범한 브라우저처럼 요청합니다.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Accept": asImage ? "image/*" : "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        // 매체는 흔히 자기 페이지에서 온 요청만 사진을 내줍니다.
        ...(asImage ? { "Referer": url.origin + "/" } : {}),
      },
    });

    if (upstream.status<200 || upstream.status>=300) {
      return json({
        error: "upstream",
        message: upstream.status === 403 || upstream.status === 401
          ? "그 사이트가 접근을 막았어요. 본문을 복사해서 붙여넣어 주세요."
          : `기사를 열지 못했어요 (${upstream.status})`,
      }, 502);
    }

    const type = upstream.headers["content-type"] || "";

    if (asImage) {
      // SVG 는 그림이 아니라 스크립트를 품을 수 있는 문서라 받지 않습니다.
      if (!/^image\//i.test(type) || /svg/i.test(type)) {
        return json({ error: "not_image", message: "그림이 아니에요" }, 415);
      }
      const bytes = upstream.bytes;
      if (bytes.byteLength > MAX_IMAGE_BYTES) {
        return json({ error: "too_big", message: "그림이 너무 커요" }, 413);
      }
      return new Response(bytes, {
        headers: { ...CORS, "Content-Type": type, "Cache-Control": "no-store" },
      });
    }

    if (!/html|xml/i.test(type)) {
      return json({ error: "not_html", message: "웹페이지가 아니에요" }, 415);
    }

    const buffer = upstream.bytes;
    if (buffer.byteLength > MAX_BYTES) {
      return json({ error: "too_big", message: "페이지가 너무 커요" }, 413);
    }
    // 문서가 선언한 인코딩을 따릅니다(유럽 매체는 아직 latin-1 을 씁니다).
    const charset = (type.match(/charset=([\w-]+)/i) || [, "utf-8"])[1];
    let html: string;
    try {
      html = new TextDecoder(charset).decode(buffer);
    } catch {
      html = new TextDecoder("utf-8").decode(buffer);
    }

    return json({ url: upstream.url, html });
  } catch (e) {
    if(e instanceof Error&&e.message==="bad_url")return json({error:"bad_url",message:"열 수 없는 주소예요"},400);
    if(e instanceof Error&&e.message==="too_big")return json({error:"too_big",message:"자료가 너무 커요"},413);
    console.error("article_request_failed",e instanceof Error?e.message:"unknown");
    const timedOut = e instanceof Error && e.name === "AbortError";
    return json({
      error: timedOut ? "timeout" : "internal",
      message: timedOut ? "그 사이트가 너무 느려요" : "기사를 가져오지 못했어요",
    }, 504);
  } finally {
    clearTimeout(timer);
    activeRequests--;
  }
});
