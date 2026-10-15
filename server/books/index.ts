// Review-only edge function. Do not deploy as part of this change.
// Secrets: R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { bookCloudJson, handleBookCloud } from "./handler.ts";
import { r2Config } from "./r2.ts";

Deno.serve(async (req) => {
  try {
    if (!r2Config(Deno.env)) return bookCloudJson({ ok: false, error: "r2_not_configured", message: "R2 설정이 없습니다." }, 503);
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return bookCloudJson({ ok: false, error: "server_not_configured", message: "서버 설정이 없습니다." }, 503);
    const admin = createClient(url, key, { auth: { persistSession: false } });
    return await handleBookCloud(req, Deno.env, admin);
  } catch (error) {
    console.error("book_cloud_failed", error instanceof Error ? error.name : "Error");
    return bookCloudJson({ ok: false, error: "internal" }, 500);
  }
});
