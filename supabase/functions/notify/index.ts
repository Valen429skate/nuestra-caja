// Nuestra Caja — función «notify»: envía los avisos al móvil de tu pareja (Web Push).
// Comprueba quién llama con su sesión, y solo avisa a la otra persona de SU caja.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try { const k = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"); return k.default || (Object.values(k)[0] as string) || ""; } catch { return ""; }
}
const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey(), { auth: { persistSession: false, autoRefreshToken: false } });
const TYPES = new Set(["txns", "shop", "social", "goals"]);
const clip = (s: unknown, n: number) => String(s ?? "").slice(0, n);

// Claves VAPID: se generan la primera vez y se guardan en una tabla que solo ve el servidor.
async function vapidKeys() {
  let { data } = await admin.from("push_keys").select("public_key, private_key").eq("id", 1).maybeSingle();
  if (!data) {
    const k = webpush.generateVAPIDKeys();
    await admin.from("push_keys").upsert({ id: 1, public_key: k.publicKey, private_key: k.privateKey }, { onConflict: "id", ignoreDuplicates: true });
    ({ data } = await admin.from("push_keys").select("public_key, private_key").eq("id", 1).single());
  }
  return data!;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "auth" }, 401);
    const { data: u, error: ue } = await admin.auth.getUser(token);
    if (ue || !u?.user) return json({ error: "auth" }, 401);
    const uid = u.user.id;
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* sin cuerpo */ }

    const keys = await vapidKeys();
    if (body.action === "key") return json({ publicKey: keys.public_key });

    const { data: member } = await admin.from("household_members").select("household_id").eq("user_id", uid).maybeSingle();
    if (!member) return json({ error: "no-household" }, 403);

    const test = body.action === "test";
    if (!test && body.action !== "send") return json({ error: "action" }, 400);
    const type = String(body.type || "");
    if (!test && !TYPES.has(type)) return json({ error: "type" }, 400);

    let q = admin.from("push_subs").select("endpoint, sub, prefs, user_id").eq("household_id", member.household_id);
    q = test ? q.eq("user_id", uid) : q.neq("user_id", uid);
    const { data: subs, error: se } = await q;
    if (se) throw se;

    webpush.setVapidDetails("https://valen429skate.github.io/nuestra-caja/", keys.public_key, keys.private_key);
    const payload = JSON.stringify(test
      ? { title: "🔔 Notificaciones activadas", body: "Así te llegarán los avisos de Nuestra Caja.", tag: "test" }
      : { title: clip(body.title, 90), body: clip(body.body, 180), tag: clip(body.tag, 64) || undefined });

    let sent = 0, removed = 0, failed = 0;
    const targets = (subs || []).filter((s) => test || (s.prefs || {})[type] !== false);
    await Promise.all(targets.map(async (s) => {
      try { await webpush.sendNotification(s.sub, payload, { TTL: 86400, urgency: "high" }); sent++; }
      catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) { await admin.from("push_subs").delete().eq("endpoint", s.endpoint); removed++; }
        else { failed++; console.error("push", code, (e as { body?: string }).body); }
      }
    }));
    return json({ sent, removed, failed, total: targets.length });
  } catch (e) {
    console.error(e);
    return json({ error: "server" }, 500);
  }
});
