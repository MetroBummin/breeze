import { BOOK_CLOUD_URL_TTL, bookObjectKey, presignBookUrl, r2Config, r2Fetch, removeAccountBookObjects, type R2Config } from "./r2.ts";

export const BOOK_CLOUD_BOOK_CAP = 40;
export const BOOK_CLOUD_BYTE_CAP = 2147483648;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
export const bookCloudJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

type Admin = {
  auth: { getUser(token: string): Promise<{ data?: { user?: { id?: string } | null }; error?: { message?: string } | null }> };
  from(table: string): any;
};
type EnvLike = { get(name: string): string | undefined };

function missingTable(error: { code?: string; message?: string } | null) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return code === "42P01" || code === "PGRST205" || (/book_cloud/i.test(message) && /does not exist|schema cache|could not find/i.test(message));
}

async function ownedRow(admin: Admin, userId: string, bookId: string) {
  const result = await admin.from("book_cloud").select("user_id,book_id,byte_size,object_key,status,tombstone,kind,title,author").eq("user_id", userId).eq("book_id", bookId).maybeSingle();
  if (result.error) {
    if (missingTable(result.error)) return { error: "not_ready" as const };
    return { error: "read_failed" as const };
  }
  return { row: result.data || null };
}

export async function handleBookCloud(req: Request, env: EnvLike, admin: Admin, fetchImpl: typeof fetch = fetch) {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") return bookCloudJson({ ok: false, error: "method" }, 405);
    const config = r2Config(env);
    if (!config) return bookCloudJson({ ok: false, error: "r2_not_configured", message: "R2 설정이 없습니다." }, 503);
    let body: any;
    try { body = await req.json(); } catch { return bookCloudJson({ ok: false, error: "bad_request" }, 400); }
    const token = String(req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return bookCloudJson({ ok: false, error: "login_required" }, 401);
    let userId = "";
    try {
      const checked = await admin.auth.getUser(token);
      userId = checked.data?.user?.id || "";
      if (checked.error || !userId) return bookCloudJson({ ok: false, error: "login_required" }, 401);
    } catch {
      return bookCloudJson({ ok: false, error: "login_required" }, 401);
    }
    const op = String(body?.op || "");
    if (op === "reserve") return reserve(config, admin, userId, body);
    if (op === "complete") return complete(config, admin, userId, body, fetchImpl);
    if (op === "download") return download(config, admin, userId, body);
    if (op === "remove") return remove(config, admin, userId, body, fetchImpl);
    return bookCloudJson({ ok: false, error: "bad_op" }, 400);
  } catch (error) {
    console.error("book_cloud_failed", error instanceof Error ? error.name : "Error");
    return bookCloudJson({ ok: false, error: "internal" }, 500);
  }
}

async function reserve(config: R2Config, admin: Admin, userId: string, body: any) {
  const bookId = String(body.bookId || "");
  const size = Number(body.size);
  const kind = String(body.kind || "");
  const title = String(body.title || "").slice(0, 300);
  const author = String(body.author || "").slice(0, 300);
  const acknowledged = String(body.acknowledgedTombstone || "");
  const objectKey = bookObjectKey(userId, bookId);
  if (!objectKey || !Number.isSafeInteger(size) || size < 1 || size > BOOK_CLOUD_BYTE_CAP || !["pdf", "epub", "txt"].includes(kind))
    return bookCloudJson({ ok: false, error: "bad_book" }, 400);
  const found = await ownedRow(admin, userId, bookId);
  if (found.error) return bookCloudJson({ ok: false, error: found.error }, found.error === "not_ready" ? 503 : 500);
  const row = found.row;
  if (row && row.object_key !== objectKey) return bookCloudJson({ ok: false, error: "forbidden" }, 403);
  if (row?.status === "deleted" && row.tombstone !== acknowledged)
    return bookCloudJson({ ok: false, error: "tombstone" }, 409);
  if (row?.status === "ready" && Number(row.byte_size) === size)
    return bookCloudJson({ ok: true, ready: true });
  if (!row || row.status === "deleted") {
    const usage = await admin.from("book_cloud").select("book_id,byte_size,status").eq("user_id", userId);
    if (usage.error) return bookCloudJson({ ok: false, error: missingTable(usage.error) ? "not_ready" : "read_failed" }, usage.error && missingTable(usage.error) ? 503 : 500);
    const others = (usage.data || []).filter((item: { book_id?: string; status?: string }) => item.book_id !== bookId && item.status !== "deleted");
    const bytes = others.reduce((sum: number, item: { byte_size?: number }) => sum + (Number(item.byte_size) || 0), 0);
    if (others.length >= BOOK_CLOUD_BOOK_CAP) return bookCloudJson({ ok: false, error: "book_cap" }, 403);
    if (bytes + size > BOOK_CLOUD_BYTE_CAP) return bookCloudJson({ ok: false, error: "byte_cap" }, 403);
  }
  const record = {
    user_id: userId, book_id: bookId, title, author, kind, byte_size: size,
    object_key: objectKey, status: "pending", tombstone: row?.tombstone || "", updated_at: new Date().toISOString(),
  };
  const write = row
    ? await admin.from("book_cloud").update(record).eq("user_id", userId).eq("book_id", bookId)
    : await admin.from("book_cloud").insert(record);
  if (write.error) {
    const message = String(write.error.message || "");
    if (/book_cap/.test(message)) return bookCloudJson({ ok: false, error: "book_cap" }, 403);
    if (/byte_cap/.test(message)) return bookCloudJson({ ok: false, error: "byte_cap" }, 403);
    return bookCloudJson({ ok: false, error: "reserve_failed" }, 500);
  }
  const url = await presignBookUrl(config, "PUT", objectKey, BOOK_CLOUD_URL_TTL);
  return bookCloudJson({ ok: true, url, method: "PUT", expiresIn: BOOK_CLOUD_URL_TTL });
}

async function complete(config: R2Config, admin: Admin, userId: string, body: any, fetchImpl: typeof fetch) {
  const bookId = String(body.bookId || "");
  const objectKey = bookObjectKey(userId, bookId);
  if (!objectKey) return bookCloudJson({ ok: false, error: "bad_book" }, 400);
  const found = await ownedRow(admin, userId, bookId);
  if (found.error) return bookCloudJson({ ok: false, error: found.error }, 503);
  const row = found.row;
  if (!row || row.object_key !== objectKey) return bookCloudJson({ ok: false, error: "not_found" }, 404);
  if (row.status === "ready") return bookCloudJson({ ok: true, ready: true });
  if (row.status !== "pending") return bookCloudJson({ ok: false, error: "not_found" }, 404);
  let head: Response;
  try { head = await r2Fetch(config, "HEAD", objectKey, fetchImpl); }
  catch { return bookCloudJson({ ok: false, error: "head_failed" }, 502); }
  if (head.status === 404) return bookCloudJson({ ok: false, error: "missing_object" }, 409);
  if (!head.ok) return bookCloudJson({ ok: false, error: "head_failed" }, 502);
  if (Number(head.headers.get("content-length")) !== Number(row.byte_size))
    return bookCloudJson({ ok: false, error: "size_mismatch" }, 409);
  const write = await admin.from("book_cloud").update({ status: "ready", updated_at: new Date().toISOString() }).eq("user_id", userId).eq("book_id", bookId).eq("status", "pending");
  if (write.error) return bookCloudJson({ ok: false, error: "complete_failed" }, 500);
  return bookCloudJson({ ok: true, ready: true });
}

async function download(config: R2Config, admin: Admin, userId: string, body: any) {
  const bookId = String(body.bookId || "");
  const objectKey = bookObjectKey(userId, bookId);
  if (!objectKey) return bookCloudJson({ ok: false, error: "bad_book" }, 400);
  const found = await ownedRow(admin, userId, bookId);
  if (found.error) return bookCloudJson({ ok: false, error: found.error }, 503);
  const row = found.row;
  if (!row || row.status !== "ready" || row.object_key !== objectKey) return bookCloudJson({ ok: false, error: "not_found" }, 404);
  const url = await presignBookUrl(config, "GET", objectKey, BOOK_CLOUD_URL_TTL);
  return bookCloudJson({ ok: true, url, method: "GET", expiresIn: BOOK_CLOUD_URL_TTL });
}

async function remove(config: R2Config, admin: Admin, userId: string, body: any, fetchImpl: typeof fetch) {
  const bookId = String(body.bookId || "");
  const objectKey = bookObjectKey(userId, bookId);
  if (!objectKey) return bookCloudJson({ ok: false, error: "bad_book" }, 400);
  const found = await ownedRow(admin, userId, bookId);
  if (found.error) return bookCloudJson({ ok: false, error: found.error }, 503);
  const row = found.row;
  if (!row) return bookCloudJson({ ok: true, removed: true });
  if (row.object_key !== objectKey) return bookCloudJson({ ok: false, error: "forbidden" }, 403);
  try {
    const deleted = await r2Fetch(config, "DELETE", objectKey, fetchImpl);
    if (!(deleted.ok || deleted.status === 404)) return bookCloudJson({ ok: false, error: "delete_failed" }, 502);
  } catch {
    return bookCloudJson({ ok: false, error: "delete_failed" }, 502);
  }
  const tombstone = crypto.randomUUID();
  const write = await admin.from("book_cloud").update({
    status: "deleted", tombstone, byte_size: 0, updated_at: new Date().toISOString(),
  }).eq("user_id", userId).eq("book_id", bookId);
  if (write.error) return bookCloudJson({ ok: false, error: "delete_failed" }, 500);
  try { await admin.from("positions").delete().eq("user_id", userId).eq("book_id", bookId); } catch { /* The original is already gone. */ }
  return bookCloudJson({ ok: true, removed: true, tombstone });
}

export async function deleteAccountBookCloud(admin: Admin, env: EnvLike, userId: string, fetchImpl: typeof fetch = fetch) {
  const listed = await admin.from("book_cloud").select("object_key").eq("user_id", userId);
  if (listed.error) {
    if (missingTable(listed.error)) return { ok: true as const };
    return { ok: false as const, message: String(listed.error.message || "delete_failed") };
  }
  const keys = (listed.data || []).map((row: { object_key?: string }) => String(row.object_key || "")).filter(Boolean);
  const removed = await removeAccountBookObjects(keys, env, fetchImpl);
  if (!removed.ok) return { ok: false as const, message: removed.message || "R2 설정이 없습니다." };
  if (keys.length) {
    const wiped = await admin.from("book_cloud").delete().eq("user_id", userId);
    if (wiped.error && !missingTable(wiped.error)) return { ok: false as const, message: String(wiped.error.message || "delete_failed") };
  }
  return { ok: true as const };
}
