/* One explicit AO3 read. The client asks for one allowlisted URL; this does not
   discover works, follow other sites, or attach cookies. Login-only paths stop
   before a second request. */
import {publicUrl} from "./public-fetch.mjs";

export const AO3_USER_AGENT = "Breeze (https://breeze.io.kr; personal reading; one work per explicit request)";
const WORK_ID = /^[1-9]\d{0,11}$/;
const EPUB_LIMIT = 40_000_000;
const PAGE_LIMIT = 2_000_000;

const MESSAGES = {
  ao3_missing: "그 주소에서 작품을 찾지 못했어요.",
  ao3_rate_limited: "AO3가 잠시 요청을 멈춰 달라고 했어요. 조금 뒤에 이 작품만 다시 시도해 주세요.",
  ao3_unavailable: "AO3에서 이 작품을 받을 수 없어요.",
  ao3_too_big: "이 작품이 너무 커요. AO3에서 EPUB을 받아 파일로 넣어 주세요.",
};

export function ao3PublicUrl(raw){
  const url = publicUrl(typeof raw === "string" ? raw : String(raw?.href || raw));
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const download = host === "download.archiveofourown.org";
  if (host !== "archiveofourown.org" && host !== "www.archiveofourown.org" && !download) throw new Error("bad_url");
  url.protocol = "https:";
  url.hostname = download ? "download.archiveofourown.org" : "archiveofourown.org";
  url.port = "";
  if (/\/users\/(?:login|auth)\b/i.test(url.pathname)) throw new Error("bad_url");
  if (!ao3PathOk(url)) throw new Error("bad_url");
  if (download) {
    url.search = "";
    if (!url.pathname.endsWith("/work.epub")) throw new Error("bad_url");
    return url;
  }
  for (const [key, value] of url.searchParams) {
    if ((key === "view_adult" || key === "view_full_work") && (value === "true" || value === "false")) continue;
    throw new Error("bad_url");
  }
  return url;
}

function ao3PathOk(url){
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length === 2 && parts[0] === "works" && WORK_ID.test(parts[1])) return true;
  if (parts.length === 4 && parts[0] === "works" && WORK_ID.test(parts[1]) && parts[2] === "chapters" && WORK_ID.test(parts[3])) return true;
  if (parts.length === 2 && parts[0] === "chapters" && WORK_ID.test(parts[1])) return true;
  if (parts.length === 3 && parts[0] === "downloads" && WORK_ID.test(parts[1]) && parts[2] === "work.epub") return true;
  return false;
}

function failure(status){
  const code = status === 429 ? "ao3_rate_limited"
    : status === 404 ? "ao3_missing"
    : "ao3_unavailable";
  const http = code === "ao3_rate_limited" ? 429 : code === "ao3_missing" ? 404 : 502;
  return {body: {error: code, message: MESSAGES[code]}, status: http};
}

export async function fetchAo3(raw, signal, fetchPublic){
  const url = ao3PublicUrl(raw);
  const epub = url.pathname.endsWith("/work.epub");
  let result;
  try {
    result = await fetchPublic(url.href, {
      signal,
      limit: epub ? EPUB_LIMIT : PAGE_LIMIT,
      admit: ao3PublicUrl,
      headers: {
        "User-Agent": AO3_USER_AGENT,
        "Accept": epub ? "application/epub+zip,application/octet-stream;q=0.8" : "text/html,application/xhtml+xml",
        "Accept-Language": "en",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "too_big") return {body: {error: "ao3_too_big", message: MESSAGES.ao3_too_big}, status: 413};
    throw error;
  }
  const type = String(result.headers?.["content-type"] || "");
  const bytes = result.bytes || new Uint8Array();
  if (epub) {
    if (result.status === 200 && bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && !/html/i.test(type)) {
      return {bytes, url: result.url || url.href};
    }
    return failure(result.status === 200 ? 502 : result.status);
  }
  if (result.status !== 200 || !bytes.byteLength) return failure(result.status || 502);
  return {body: {url: result.url || url.href, html: new TextDecoder("utf-8").decode(bytes)}, status: 200};
}
