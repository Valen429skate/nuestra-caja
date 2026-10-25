/* Nuestra Caja — conector de datos para la app propia.
   Ofrece la misma interfaz que usa la app (collection/doc, set, delete, onSnapshot) sobre la tabla `docs` de Supabase,
   con caché local, escritura optimista y tiempo real (Supabase Realtime) con reconexión. */
(function (root) {
  "use strict";

  function randomId() {
    const a = new Uint8Array(12);
    (root.crypto || globalThis.crypto).getRandomValues(a);
    return Array.from(a, (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
  }
  const err = (code, message) => Object.assign(new Error(message || code), { code });
  function mapError(e) {
    if (!e) return err("unavailable");
    const m = String(e.message || ""), c = String(e.code || "");
    if (c === "42501" || /row-level security|permission denied/i.test(m)) return err("invalid_argument", "Sin permiso");
    if (c === "23514" || c === "22P02") return err("invalid_argument", "Datos no válidos");
    if (/JWT|expired/i.test(m)) return err("revoked", "Sesión caducada");
    return err("unavailable", "Sin conexión");
  }
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function createSupabaseDb(sb, householdId, opts) {
    const o = opts || {};
    const cache = new Map(); // col -> Map(id -> data)
    const colListeners = new Map(); // col -> Set(fn)
    const docListeners = new Map(); // "col/id" -> Set(fn)
    let loaded = false, loading = null, channel = null, status = "connecting";
    const onStatus = o.onStatus || function () {};
    const setStatus = (s) => { if (s !== status) { status = s; onStatus(s); } };

    const colMap = (col) => { if (!cache.has(col)) cache.set(col, new Map()); return cache.get(col); };
    const docSnap = (col, id) => { const d = colMap(col).get(id); return { id, exists: d !== undefined, data: () => (d === undefined ? undefined : clone(d)), metadata: { fromCache: false, hasPendingWrites: false } }; };
    const colSnap = (col) => { const docs = Array.from(colMap(col).keys()).sort().map((id) => docSnap(col, id)); return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: !loaded, hasPendingWrites: false } }; };
    function emit(col, id) {
      (colListeners.get(col) || new Set()).forEach((fn) => { try { fn(colSnap(col)); } catch (e) { console.error(e); } });
      const fire = (key, i) => (docListeners.get(key) || new Set()).forEach((fn) => { try { fn(docSnap(col, i)); } catch (e) { console.error(e); } });
      if (id !== undefined) fire(col + "/" + id, id);
      else docListeners.forEach((_, key) => { if (key.startsWith(col + "/")) fire(key, key.slice(col.length + 1)); });
    }
    const emitAll = () => { const cols = new Set([...cache.keys(), ...colListeners.keys(), ...Array.from(docListeners.keys(), (k) => k.split("/")[0])]); cols.forEach((c) => emit(c)); };

    async function loadAll() {
      if (loading) return loading;
      loading = (async () => {
        const fresh = new Map();
        for (let from = 0; ; from += 1000) {
          const { data, error } = await sb.from("docs").select("col,id,data").eq("household_id", householdId).range(from, from + 999);
          if (error) throw mapError(error);
          (data || []).forEach((r) => { if (!fresh.has(r.col)) fresh.set(r.col, new Map()); fresh.get(r.col).set(r.id, r.data); });
          if (!data || data.length < 1000) break;
        }
        cache.clear(); fresh.forEach((m, c) => cache.set(c, m));
        loaded = true; emitAll();
      })().finally(() => { loading = null; });
      return loading;
    }
    function applyRow(event, row, old) {
      if (event === "DELETE") {
        const r = old || {};
        if (r.col && r.id !== undefined) { if (r.household_id && r.household_id !== householdId) return; colMap(r.col).delete(r.id); emit(r.col, r.id); }
        else loadAll().catch(() => {});
        return;
      }
      if (!row || row.household_id !== householdId) return;
      colMap(row.col).set(row.id, row.data); emit(row.col, row.id);
    }
    function connect() {
      if (channel) { try { sb.removeChannel(channel); } catch (e) { /* ya cerrado */ } }
      channel = sb.channel("caja:" + householdId)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "docs", filter: "household_id=eq." + householdId }, (p) => applyRow("INSERT", p.new))
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "docs", filter: "household_id=eq." + householdId }, (p) => applyRow("UPDATE", p.new))
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "docs" }, (p) => applyRow("DELETE", null, p.old))
        .subscribe((st) => {
          if (st === "SUBSCRIBED") { setStatus("live"); loadAll().catch(() => setStatus("reconnecting")); }
          else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT" || st === "CLOSED") setStatus(root.navigator && root.navigator.onLine === false ? "offline" : "reconnecting");
        });
    }
    connect();
    loadAll().catch(() => setStatus("reconnecting"));
    // Red de seguridad: si se pierde algún evento, se recarga al volver a la app, al recuperar la red y cada 60 s.
    if (root.addEventListener) {
      root.addEventListener("online", () => { setStatus("connecting"); connect(); });
      root.addEventListener("offline", () => setStatus("offline"));
      if (root.document) root.document.addEventListener("visibilitychange", () => { if (root.document.visibilityState === "visible") loadAll().catch(() => {}); });
    }
    const poll = setInterval(() => loadAll().catch(() => {}), 60000);

    async function write(col, id, data) {
      if (!/^[a-z]{1,20}$/.test(col) || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw err("invalid_argument", "Ruta no válida");
      if (!data || typeof data !== "object" || Array.isArray(data)) throw err("invalid_argument", "Documento no válido");
      const prev = colMap(col).get(id);
      colMap(col).set(id, clone(data)); emit(col, id); // optimista
      const { error } = await sb.from("docs").upsert({ household_id: householdId, col, id, data }, { onConflict: "household_id,col,id" });
      if (error) { if (prev === undefined) colMap(col).delete(id); else colMap(col).set(id, prev); emit(col, id); throw mapError(error); }
    }
    async function remove(col, id) {
      const prev = colMap(col).get(id);
      colMap(col).delete(id); emit(col, id);
      const { error } = await sb.from("docs").delete().eq("household_id", householdId).eq("col", col).eq("id", id);
      if (error) { if (prev !== undefined) { colMap(col).set(id, prev); emit(col, id); } throw mapError(error); }
    }
    function docRef(col, id) {
      return {
        id, path: col + "/" + id,
        get: async () => { if (!loaded) await loadAll(); return docSnap(col, id); },
        set: (data) => write(col, id, data),
        update: async (data) => { const cur = colMap(col).get(id); if (cur === undefined) throw err("invalid_argument", "No existe"); return write(col, id, Object.assign({}, cur, data)); },
        delete: () => remove(col, id),
        onSnapshot: (next) => { const key = col + "/" + id; if (!docListeners.has(key)) docListeners.set(key, new Set()); docListeners.get(key).add(next); if (loaded) setTimeout(() => next(docSnap(col, id)), 0); return () => docListeners.get(key).delete(next); },
      };
    }
    function collRef(col) {
      if (!/^[a-z]{1,20}$/.test(col)) throw new TypeError("Colección no válida: " + col);
      return {
        path: col,
        doc: (id) => docRef(col, id || randomId()),
        add: async (data) => { const r = docRef(col, randomId()); await r.set(data); return r; },
        get: async () => { if (!loaded) await loadAll(); return colSnap(col); },
        onSnapshot: (next) => { if (!colListeners.has(col)) colListeners.set(col, new Set()); colListeners.get(col).add(next); if (loaded) setTimeout(() => next(colSnap(col)), 0); return () => colListeners.get(col).delete(next); },
      };
    }
    return {
      collection: collRef,
      doc: (path) => { const p = String(path).split("/"); if (p.length !== 2) throw new TypeError("Ruta de documento no válida: " + path); return docRef(p[0], p[1]); },
      reload: () => loadAll(),
      close: () => { clearInterval(poll); if (channel) sb.removeChannel(channel); },
    };
  }

  root.createSupabaseDb = createSupabaseDb;
  if (typeof module !== "undefined" && module.exports) module.exports = { createSupabaseDb };
})(typeof window !== "undefined" ? window : globalThis);
