/* Nuestra Caja — notificaciones al móvil de tu pareja.
   1) pushMessage(): decide qué aviso genera cada cambio que haces (lógica pura, sin red).
   2) createPush(): activa los avisos en este móvil (Web Push) y los envía a través de la función «notify» de Supabase. */
(function (root) {
  "use strict";

  const TYPES = [
    { id: "txns", label: "Gastos e ingresos", hint: "Cuando tu pareja apunta, edita o borra un movimiento" },
    { id: "shop", label: "Lista de la compra", hint: "Cuando añade cosas o termina la compra" },
    { id: "social", label: "Reacciones y comentarios", hint: "Cuando reacciona o comenta tus gastos" },
    { id: "goals", label: "Huchas de ahorro", hint: "Cuando crea una hucha o aporta dinero" },
  ];
  const cut = (s, n) => { s = String(s || "").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

  /* ev = { op: "set" | "delete", col, id, prev, next }
     ctx = { me, nameOf(id), money(cents), txn(id), goal(id) }
     Devuelve { type, title, body, tag } · { agg, item } (se agrupan unos segundos) · o null. */
  function pushMessage(ev, ctx) {
    const who = ctx.nameOf(ctx.me), prev = ev.prev, next = ev.next;
    if (ev.col === "txns") {
      if (ev.op === "delete") {
        if (!prev) return null;
        return { type: "txns", tag: "txn-" + ev.id, title: "🗑️ " + who + " eliminó un movimiento", body: cut(prev.desc, 60) + " · " + ctx.money(prev.amount) };
      }
      if (!next) return null;
      if (!prev) {
        if (next.kind === "settle") return { type: "txns", tag: "txn-" + ev.id, title: "🤝 " + who + " apuntó un pago entre vosotros", body: ctx.nameOf(next.paidBy) + " pagó " + ctx.money(next.amount) + " a " + ctx.nameOf(next.to) };
        const inc = next.kind === "income";
        return { type: "txns", tag: "txn-" + ev.id, title: (inc ? "💰 " : "💸 ") + who + (inc ? " apuntó un ingreso" : " apuntó un gasto"), body: cut(next.desc, 60) + " · " + ctx.money(next.amount) };
      }
      const r0 = (prev.reactions || {})[ctx.me], r1 = (next.reactions || {})[ctx.me];
      if (r1 && r1 !== r0) return { type: "social", tag: "react-" + ev.id, title: r1 + " " + who + " reaccionó a un movimiento", body: "«" + cut(next.desc, 60) + "»" };
      if (r1 !== r0) return null; // quitó su reacción: sin aviso
      if (prev.amount !== next.amount || prev.desc !== next.desc || prev.kind !== next.kind) return { type: "txns", tag: "txn-" + ev.id, title: "✏️ " + who + " editó un movimiento", body: cut(next.desc, 60) + " · " + ctx.money(next.amount) };
      return null;
    }
    if (ev.col === "notes" && ev.op === "set" && !prev && next) {
      const t = ctx.txn(next.txnId);
      return { type: "social", tag: "note-" + (next.txnId || ev.id), title: "💬 " + who + " comentó" + (t ? " «" + cut(t.desc, 40) + "»" : ""), body: cut(next.text, 120) };
    }
    if (ev.col === "shop") {
      if (ev.op === "set" && !prev && next) return { agg: "shop-add", item: cut(next.text, 40) };
      if (ev.op === "delete" && prev && prev.done) return { agg: "shop-done", item: cut(prev.text, 40) };
      return null;
    }
    if (ev.col === "goals" && ev.op === "set" && !prev && next) return { type: "goals", tag: "goal-" + ev.id, title: "🎯 " + who + " creó una hucha", body: (next.emoji ? next.emoji + " " : "") + cut(next.name, 60) };
    if (ev.col === "contribs" && ev.op === "set" && !prev && next) {
      const g = ctx.goal(next.goalId), neg = next.amount < 0;
      return { type: "goals", tag: "contrib-" + ev.id, title: "🐷 " + who + (neg ? " sacó dinero de una hucha" : " aportó a una hucha"), body: ctx.money(Math.abs(next.amount)) + (g ? (neg ? " de «" : " a «") + cut(g.name, 50) + "»" : "") };
    }
    return null;
  }

  function listText(items) {
    const u = Array.from(new Set(items));
    if (u.length <= 3) return u.length === 1 ? u[0] : u.slice(0, -1).join(", ") + " y " + u[u.length - 1];
    return u.slice(0, 2).join(", ") + " y " + (u.length - 2) + " más";
  }
  function aggMessage(kind, who, items) {
    if (kind === "shop-add") return { type: "shop", tag: "shop-add", title: "🛒 " + who + " añadió a la lista", body: listText(items) };
    return { type: "shop", tag: "shop-done", title: "✅ " + who + " hizo la compra", body: listText(items) };
  }

  function b64ToBytes(s) {
    const pad = "=".repeat((4 - (s.length % 4)) % 4), b = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(b, (c) => c.charCodeAt(0));
  }

  /* opts = { householdId, userId, ctx: () => ctx, wait (ms de agrupación) } */
  function createPush(sb, opts) {
    const o = opts || {}, nav = root.navigator || {};
    const isIOS = /iphone|ipad|ipod/i.test(nav.userAgent || "");
    const standalone = () => (root.matchMedia && root.matchMedia("(display-mode: standalone)").matches) || nav.standalone === true;
    const supported = () => !!(root.Notification && nav.serviceWorker && root.PushManager);
    const buffers = {};
    let vapid = null, prefsCache = null;

    async function call(body) {
      const { data, error } = await sb.functions.invoke("notify", { body });
      if (error) throw error;
      return data || {};
    }
    async function reg() { const r = await nav.serviceWorker.ready; return r; }
    async function currentSub() { if (!supported()) return null; try { return await (await reg()).pushManager.getSubscription(); } catch (e) { return null; } }

    async function status() {
      if (!supported()) return isIOS && !standalone() ? "ios-install" : "unsupported";
      if (Notification.permission === "denied") return "denied";
      const s = await currentSub();
      if (!s) return "off";
      const { data } = await sb.from("push_subs").select("prefs").eq("endpoint", s.endpoint).maybeSingle();
      if (!data) return "off";
      prefsCache = data.prefs || {};
      return "on";
    }
    async function prefs() { if (prefsCache) return prefsCache; await status(); return prefsCache || {}; }

    async function enable() {
      if (!supported()) throw Object.assign(new Error("unsupported"), { code: isIOS && !standalone() ? "ios-install" : "unsupported" });
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw Object.assign(new Error("denied"), { code: "denied" });
      if (!vapid) vapid = (await call({ action: "key" })).publicKey;
      if (!vapid) throw Object.assign(new Error("no-key"), { code: "server" });
      const r = await reg();
      let s = await r.pushManager.getSubscription();
      if (s && s.options && s.options.applicationServerKey) {
        const cur = new Uint8Array(s.options.applicationServerKey), want = b64ToBytes(vapid);
        if (cur.length !== want.length || cur.some((v, i) => v !== want[i])) { await s.unsubscribe(); s = null; }
      }
      if (!s) s = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(vapid) });
      const p = prefsCache || {};
      const { error } = await sb.from("push_subs").upsert({ endpoint: s.endpoint, household_id: o.householdId, user_id: o.userId, sub: s.toJSON(), prefs: p, ua: cut(nav.userAgent, 200) }, { onConflict: "endpoint" });
      if (error) throw Object.assign(new Error(error.message), { code: "server" });
      prefsCache = p; mark(true);
      return "on";
    }
    const mark = (v) => { try { if (v) root.localStorage.setItem("caja.pushOn", "1"); else root.localStorage.removeItem("caja.pushOn"); } catch (e) { /* sin almacenamiento */ } };
    const marked = () => { try { return root.localStorage.getItem("caja.pushOn") === "1"; } catch (e) { return false; } };
    // Al abrir la app: si este móvil tenía los avisos activados, se asegura de que sigan registrados (el móvil a veces renueva la suscripción).
    async function sync() {
      if (!supported() || !marked() || Notification.permission !== "granted") return;
      try {
        const s = await currentSub();
        if (!s) return void (await enable());
        const { data } = await sb.from("push_subs").select("prefs").eq("endpoint", s.endpoint).maybeSingle();
        if (!data) await enable();
      } catch (e) { /* se reintenta la próxima vez */ }
    }
    async function disable() {
      const s = await currentSub();
      if (s) { await sb.from("push_subs").delete().eq("endpoint", s.endpoint); await s.unsubscribe().catch(() => {}); }
      prefsCache = null; mark(false);
      return "off";
    }
    async function setPref(type, on) {
      const s = await currentSub(); if (!s) return;
      const p = Object.assign({}, await prefs()); p[type] = !!on;
      const { error } = await sb.from("push_subs").update({ prefs: p }).eq("endpoint", s.endpoint);
      if (error) throw error;
      prefsCache = p;
    }
    async function test() { return call({ action: "test" }); }

    function send(msg) { return call(Object.assign({ action: "send" }, msg)).catch(() => null); }
    function onChange(ev) {
      let m = null;
      try { m = pushMessage(ev, o.ctx()); } catch (e) { return; }
      if (!m) return;
      if (!m.agg) return send(m);
      const b = buffers[m.agg] || (buffers[m.agg] = { items: [], timer: 0 });
      b.items.push(m.item);
      clearTimeout(b.timer);
      b.timer = setTimeout(() => { const items = b.items.splice(0); if (items.length) send(aggMessage(m.agg, o.ctx().nameOf(o.ctx().me), items)); }, o.wait === undefined ? 6000 : o.wait);
    }
    return { types: TYPES, sync, supported, isIOS, standalone, status, prefs, enable, disable, setPref, test, onChange, send };
  }

  const api = { pushMessage, aggMessage, listText, createPush, TYPES };
  root.CajaPush = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
