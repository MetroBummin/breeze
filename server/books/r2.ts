/** R2 S3 signing. Secrets stay on the server. Presigned URLs are bearer tokens. */
export const BOOK_CLOUD_URL_TTL = 600;
const EMPTY_PAYLOAD = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

export type R2Config = {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: "auto";
};
type EnvLike = { get(name: string): string | undefined };

export function r2Config(env: EnvLike | undefined): R2Config | null {
  const read = (name: string) => {
    try { return String(env?.get(name) ?? "").trim(); }
    catch { return ""; }
  };
  const accountId = read("R2_ACCOUNT_ID");
  const bucket = read("R2_BUCKET");
  const accessKeyId = read("R2_ACCESS_KEY_ID");
  const secretAccessKey = read("R2_SECRET_ACCESS_KEY");
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) return null;
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(bucket)) return null;
  return { accountId, bucket, accessKeyId, secretAccessKey, region: "auto" };
}

export function bookObjectKey(userId: string, bookId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(userId)) return "";
  if (!/^[0-9a-f]{64}$/.test(bookId)) return "";
  return `${userId}/${bookId}`;
}

export function amzStamp(date = new Date()) {
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, char =>
  `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

async function hmac(key: BufferSource, data: string) {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data)));
}
async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
function hex(bytes: Uint8Array) {
  return [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
async function signingKey(secret: string, dateStamp: string, region: string) {
  const date = await hmac(new TextEncoder().encode(`AWS4${secret}`), dateStamp);
  const regionKey = await hmac(date, region);
  const service = await hmac(regionKey, "s3");
  return hmac(service, "aws4_request");
}

function canonicalUri(bucket: string, key: string) {
  return `/${bucket}/${key.split("/").map(encode).join("/")}`;
}

export async function presignBookUrl(config: R2Config, method: "GET" | "PUT" | "HEAD" | "DELETE", key: string, expires = BOOK_CLOUD_URL_TTL, now = new Date()) {
  if (!bookObjectKey(key.split("/")[0], key.split("/")[1])) throw new Error("bad_object_key");
  const { amzDate, dateStamp } = amzStamp(now);
  const scope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const params: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Content-Sha256": "UNSIGNED-PAYLOAD",
    "X-Amz-Credential": `${config.accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expires),
    "X-Amz-SignedHeaders": "host",
  };
  const query = Object.keys(params).sort().map(name => `${encode(name)}=${encode(params[name])}`).join("&");
  const uri = canonicalUri(config.bucket, key);
  const request = [method, uri, query, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(request)].join("\n");
  const signature = hex(await hmac(await signingKey(config.secretAccessKey, dateStamp, config.region), toSign));
  return `https://${host}${uri}?${query}&X-Amz-Signature=${signature}`;
}

export async function r2Fetch(config: R2Config, method: "HEAD" | "DELETE", key: string, fetchImpl: typeof fetch = fetch) {
  if (!bookObjectKey(key.split("/")[0], key.split("/")[1])) throw new Error("bad_object_key");
  const { amzDate, dateStamp } = amzStamp();
  const scope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const uri = canonicalUri(config.bucket, key);
  const signed = "host;x-amz-content-sha256;x-amz-date";
  const canonical = [
    method, uri, "",
    `host:${host}\nx-amz-content-sha256:${EMPTY_PAYLOAD}\nx-amz-date:${amzDate}\n`,
    signed, EMPTY_PAYLOAD,
  ].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonical)].join("\n");
  const signature = hex(await hmac(await signingKey(config.secretAccessKey, dateStamp, config.region), toSign));
  return fetchImpl(`https://${host}${uri}`, {
    method,
    headers: {
      authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signed}, Signature=${signature}`,
      "x-amz-content-sha256": EMPTY_PAYLOAD,
      "x-amz-date": amzDate,
    },
  });
}

export async function removeAccountBookObjects(keys: string[], env: EnvLike, fetchImpl: typeof fetch = fetch) {
  const safe = keys.filter(key => bookObjectKey(key.split("/")[0], key.split("/")[1]) === key);
  if (!safe.length) return { ok: true as const };
  const config = r2Config(env);
  if (!config) return { ok: false as const, message: "R2 설정이 없습니다." };
  for (const key of safe) {
    try {
      const response = await r2Fetch(config, "DELETE", key, fetchImpl);
      if (!(response.ok || response.status === 404)) return { ok: false as const, message: "R2 원본을 지우지 못했습니다." };
    } catch {
      return { ok: false as const, message: "R2 원본을 지우지 못했습니다." };
    }
  }
  return { ok: true as const };
}
