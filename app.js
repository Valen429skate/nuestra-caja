/* Nuestra Caja — app de gastos en pareja. Datos compartidos en `db` (tiempo real); "última visita" en el subárbol privado de cada persona. */
(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const today = () => C.ymd(new Date());
  /* Entorno: "claude" (artefacto) o "standalone" (app propia con Supabase). La app propia define window.CAJA_HOST antes de cargar. */
  const HOST = window.CAJA_HOST || { name: "claude" };
  const buzz = (ms) => { try { if (navigator.vibrate) navigator.vibrate(ms || 12); } catch (e) { /* sin vibración */ } };
  const nowIso = () => new Date().toISOString();

  const S = {
    mode: "loading", db: null, user: null, uid: null, me: null, canWrite: true, isOwner: false,
    members: [], txns: [], cats: [], fixed: [], goals: [], contribs: [], shop: [], notes: [], shopFreq: {}, settings: {}, loaded: {}, names: {}, pending: new Set(),
    view: "home", month: today().slice(0, 7), q: "", filter: "all", who: "", prevSeen: null, known: null,
  };
  const DEFAULT_CATS = [["🛒", "Supermercado"], ["🏠", "Casa y alquiler"], ["💡", "Facturas"], ["🍽️", "Comer fuera"], ["🚗", "Transporte"], ["🎉", "Ocio"], ["🛍️", "Compras"], ["✈️", "Viajes"], ["💊", "Salud"], ["📱", "Suscripciones"], ["🐾", "Mascotas"], ["🎁", "Regalos"], ["📦", "Otros"]];
  const SPLITS = { half: ["A medias", "50 % cada uno"], mine: ["Solo de quien paga", "No se reparte"], theirs: ["Todo para el otro", "Lo paga uno por el otro"], custom: ["Otro reparto", "Porcentaje propio"] };

  const IC = {
    home: '<path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1z"/>', list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    cart: '<path d="M3 4h2l2.4 11.2a2 2 0 002 1.6h7.7a2 2 0 002-1.5L21 8H6.2"/><circle cx="10" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/>', trophy: '<path d="M8 4h8v5a4 4 0 01-8 0z"/><path d="M8 6H5a3 3 0 003 4M16 6h3a3 3 0 01-3 4M10 14.5V17h4v-2.5M8 21h8M9.5 17h5v4h-5z"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>', send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/>', out: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>', copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
    jar: '<path d="M7 3h10M8 3v3l-2 3v10a2 2 0 002 2h8a2 2 0 002-2V9l-2-3V3"/><path d="M9 13h6"/>', more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', left: '<path d="M15 6l-6 6 6 6"/>', right: '<path d="M9 6l6 6-6 6"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/>', cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>', target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>', share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
    down: '<path d="M12 4v12M6 11l6 6 6-6M4 20h16"/>', trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 013-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 01-3 3H3"/>',
    bell: '<path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 004 0"/>',
    swap: '<path d="M7 7h13l-4-4M17 17H4l4 4"/>', check: '<path d="M5 12l5 5 9-10"/>', chev: '<path d="M9 6l6 6-6 6"/>', coin: '<circle cx="12" cy="12" r="9"/><path d="M14.5 9a2.5 2 0 00-2.5-1.5c-1.4 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2a2.5 2 0 01-2.5-1.5M12 6v1.5M12 16.5V18"/>',
  };
  const icon = (n) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[n] || "") + "</svg>";

  /* ---------- Personas ---------- */
  const cur = () => (S.settings.currency || "EUR");
  const money = (c, o) => C.money(c, cur(), o);
  /* Una sola cuenta de Claude para los dos: las personas se definen en settings.people y cada móvil recuerda quién es. */
  const people = () => (Array.isArray(S.settings.people) ? S.settings.people : []);
  const members = () => people().map((p) => p.id);
  const partner = () => members().find((m) => m !== S.uid) || null;
  const pcls = (id) => (members().indexOf(id) === 1 ? "p2" : "p1");
  function nameOf(id, opts) {
    if (!id) return "—";
    if (opts && opts.self && id === S.uid) return "Tú";
    const p = people().find((x) => x.id === id);
    return p && p.name ? p.name : id === "p1" ? "Persona 1" : "Persona 2";
  }
  const initial = (id) => (nameOf(id).trim()[0] || "?").toUpperCase();
  const avatar = () => "";
  const store = { get(k) { try { return localStorage.getItem("caja." + k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem("caja." + k, v); } catch (e) { /* sin almacenamiento local */ } } };
  const catOf = (id) => S.cats.find((c) => c.id === id);

  /* ---------- Avisos ---------- */
  /* Avisos en cola: cada aviso se ve al menos 1,2 s y no se pisan (los de «Deshacer» van primero). */
  let toastTimer = 0, toastAt = 0;
  const toastQ = [];
  /* prio: avisos de lo que hace tu pareja en vivo; se cuelan delante de los demás. */
  function toast(msg, undo, prio) {
    if (undo) { toastQ.length = 0; return showToast(msg, undo); }
    if (!toastTimer) return showToast(msg);
    const item = { msg, at: Date.now() };
    if (S.undo) { if (toastQ.length < 4 && !toastQ.some((q) => q.msg === msg)) toastQ.push(item); return; }
    if (!toastQ.some((q) => q.msg === msg)) { if (prio) toastQ.unshift(item); else toastQ.push(item); }
    if (toastQ.length > 3) { if (prio) toastQ.pop(); else toastQ.shift(); }
    clearTimeout(toastTimer);
    toastTimer = setTimeout(nextToast, Math.max(0, toastAt + 1200 - Date.now()));
  }
  // Los avisos que llevan más de 5 s esperando ya no son útiles: se descartan en vez de salir tarde.
  function nextToast() { $("#toastRoot").innerHTML = ""; S.undo = null; toastTimer = 0; while (toastQ.length && Date.now() - toastQ[0].at > 5000) toastQ.shift(); if (toastQ.length) showToast(toastQ.shift().msg); }
  function showToast(msg, undo) {
    clearTimeout(toastTimer);
    toastAt = Date.now();
    $("#toastRoot").innerHTML = '<div class="toast"><span>' + esc(msg) + "</span>" + (undo ? '<button data-act="undo">Deshacer</button>' : "") + "</div>";
    S.undo = undo || null;
    toastTimer = setTimeout(nextToast, undo ? 6000 : toastQ.length ? 2200 : 3200);
  }
  function dbErr(e) {
    const c = e && e.code;
    if (c === "invalid_argument") return "No se pudo guardar: tu acceso a la app es solo de lectura.";
    if (c === "quota_exceeded") return "Se llenó el espacio de la app. Borra movimientos antiguos.";
    if (c === "resource_exhausted") return "Vas demasiado rápido. Espera unos segundos.";
    return "No se pudo guardar. Revisa tu conexión y vuelve a intentarlo.";
  }
  async function save(fn, ok) {
    if (S.mode !== "live") { toast(HOST.name === "claude" ? "Abre la app desde Claude con tu sesión iniciada para guardar." : "Sin conexión con el servidor. Inténtalo de nuevo."); return false; }
    try { await fn(); if (ok) { toast(ok); buzz(); } return true; }
    catch (e) {
      if (e && e.code === "unavailable") { try { await new Promise((r) => setTimeout(r, 700)); await fn(); if (ok) toast(ok); return true; } catch (e2) { toast(dbErr(e2)); return false; } }
      toast(dbErr(e)); return false;
    }
  }
  const col = (p) => S.db.collection(p);
  const clean = (o) => { const r = {}; for (const k in o) if (o[k] !== undefined && k !== "id") r[k] = o[k]; return r; };

  /* ---------- Arranque ---------- */
  async function boot() {
    renderTop(); renderTabs();
    if (!(window.claude && window.claude.use)) { S.mode = "offline"; render(); return; }
    let db = null, user = null;
    try { db = await window.claude.use("db"); } catch (e) { db = null; }
    if (!db) { S.mode = "offline"; render(); return; }
    S.db = db; S.user = user;
    S.mode = "live";
    S.uid = store.get("me");
    S.prevSeen = store.get("lastSeen");
    setTimeout(() => store.set("lastSeen", nowIso()), 4000);
    if (HOST.person) { S.uid = HOST.person; store.set("me", S.uid); }
    sub("txns", "txns", liveToasts); sub("cats", "cats"); sub("fixed", "fixed"); sub("goals", "goals"); sub("contribs", "contribs");
    sub("shop", "shop", shopToasts); sub("notes", "notes", noteToasts);
    S.db.doc("settings/shop").onSnapshot((d) => { S.shopFreq = d.exists ? (d.data().freq || {}) : {}; schedule(); }, () => {});
    S.db.doc("settings/main").onSnapshot((d) => { S.settings = d.exists ? d.data() : {}; S.loaded.settings = true; if (S.uid && !members().includes(S.uid) && !HOST.lockPerson && members().length) S.uid = null; schedule(); }, () => { S.loaded.settings = true; schedule(); });
    render();
  }
  function sub(path, key, after) {
    col(path).onSnapshot((snap) => { S[key] = snap.docs.map((d) => Object.assign({ id: d.id }, d.data())); S.loaded[key] = true; if (after) after(); schedule(); },
      () => { S.loaded[key] = "error"; schedule(); });
  }
  function liveToasts() {
    const ids = new Set(S.txns.map((t) => t.id)), reacts = {};
    S.txns.forEach((t) => (reacts[t.id] = t.reactions || {}));
    if (S.known) {
      const fresh = S.txns.filter((t) => !S.known.has(t.id) && t.by && t.by !== S.uid);
      if (fresh.length === 1) toast(nameOf(fresh[0].by) + " añadió «" + fresh[0].desc + "» · " + money(fresh[0].amount), null, true);
      else if (fresh.length > 1) toast(nameOf(fresh[0].by) + " añadió " + fresh.length + " movimientos", null, true);
      else {
        const p = partner();
        const r = p && S.txns.find((t) => S.knownReacts[t.id] && (t.reactions || {})[p] && (t.reactions || {})[p] !== S.knownReacts[t.id][p]);
        if (r) toast(nameOf(p) + " reaccionó " + r.reactions[p] + " a «" + r.desc + "»", null, true);
      }
    }
    S.known = ids; S.knownReacts = reacts;
  }
  function shopToasts() {
    const ids = new Set(S.shop.map((i) => i.id));
    if (S.knownShop) { const fresh = S.shop.filter((i) => !S.knownShop.has(i.id) && i.by && i.by !== S.uid); if (fresh.length) toast(nameOf(fresh[0].by) + " añadió " + (fresh.length === 1 ? "«" + fresh[0].text + "»" : fresh.length + " cosas") + " a la lista", null, true); }
    S.knownShop = ids;
  }
  function noteToasts() {
    const ids = new Set(S.notes.map((n) => n.id));
    if (S.knownNotes) { const n = S.notes.find((x) => !S.knownNotes.has(x.id) && x.by !== S.uid); if (n) { const t = S.txns.find((x) => x.id === n.txnId); toast(nameOf(n.by) + " comentó" + (t ? " en «" + t.desc + "»" : "") + ": " + n.text.slice(0, 60), null, true); } }
    S.knownNotes = ids;
  }

  /* ---------- Render ---------- */
  let raf = 0;
  function schedule() { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; render(); }); }
  function renderTop() {
    const mm = C.parseYmd(S.month + "-01").toLocaleDateString("es-ES", { month: "long", year: "numeric" });
    const showMonth = (S.view === "home" || S.view === "list") && S.uid && members().length === 2;
    $("#top").innerHTML = '<div class="brand">' + esc(S.settings.title || "Nuestra Caja") + "<small>" + (S.mode === "live" ? '<span class="pulse" aria-hidden="true"></span> ' + (members().length === 2 ? esc(nameOf(members()[0])) + " y " + esc(nameOf(members()[1])) + " · en vivo" : "En vivo") : S.mode === "offline" ? "Sin conexión al almacén" : "Conectando…") + '</small></div><div class="sp"></div>' +
      (showMonth ? '<div class="month"><button class="icon-btn" data-act="month" data-d="-1" aria-label="Mes anterior">' + icon("left") + "</button><b>" + esc(mm) + '</b><button class="icon-btn" data-act="month" data-d="1" aria-label="Mes siguiente">' + icon("right") + "</button></div>" : "") +
      (S.uid ? '<button class="me ' + pcls(S.uid) + '" data-act="names" aria-label="Estás usando la app como ' + esc(nameOf(S.uid)) + '">' + esc(initial(S.uid)) + "</button>" : "");
  }
  function renderTabs() {
    const t = (v, label, ic) => '<button class="tab' + (S.view === v ? " on" : "") + '" data-act="view" data-v="' + v + '" aria-current="' + (S.view === v ? "page" : "false") + '">' + icon(ic) + label + "</button>";
    $("#tabs").innerHTML = '<div class="in">' + t("home", "Inicio", "home") + t("list", "Movimientos", "list") + '<button class="fab" data-act="add" aria-label="Añadir gasto">' + icon("plus") + "</button>" + t("shop", "Compra", "cart") + t("more", "Más", "more") + "</div>";
  }
  function render() {
    renderTop(); renderTabs();
    const m = $("#main");
    if (S.mode === "offline") { m.innerHTML = '<div class="card"><div class="empty"><div class="e">🔒</div><b>' + (HOST.name === "claude" ? "Abre esta app desde Claude" : "Sin conexión") + "</b><p>" + (HOST.name === "claude" ? "Aquí no hay acceso al almacén compartido. Ábrela con tu sesión iniciada en la app o la web de Claude para ver y guardar vuestros gastos." : "No se pudo conectar con vuestro servidor. Revisa la conexión y recarga.") + "</p></div></div>"; return; }
    if (S.mode === "loading" || !S.loaded.txns || !S.loaded.settings || !S.loaded.cats) return;
    if (members().length < 2) { $("#tabs").innerHTML = ""; m.innerHTML = viewSetup(); return; }
    if (!S.uid) { $("#tabs").innerHTML = ""; m.innerHTML = viewWho(); return; }
    let h = "";
    if (!S.canWrite) h += '<div class="note warn">' + icon("info") + "<div>Puedes ver, pero no guardar. Pide que te compartan la app con permiso de <b>Editor</b>.</div></div>";
    h += ({ home: viewHome, list: viewList, savings: viewSavings, more: viewMore, shop: viewShop }[S.view] || viewHome)();
    // Conservar lo que se está escribiendo si llega un cambio en vivo del otro móvil
    const ae = document.activeElement, keep = ae && ae.id && m.contains(ae) && ae.tagName === "INPUT" ? { id: ae.id, v: ae.value, s: ae.selectionStart } : null;
    m.innerHTML = h;
    if (keep) { const el = document.getElementById(keep.id); if (el) { el.value = keep.v; el.focus(); try { el.setSelectionRange(keep.s, keep.s); } catch (e) { /* tipo sin selección */ } } }
    if (S.drawSocial) S.drawSocial();
    checkAchievements();
  }

  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
  const monthLabel = (mk, short) => C.parseYmd(mk + "-01").toLocaleDateString("es-ES", short ? { month: "long" } : { month: "long", year: "numeric" });
  const achData = () => ({ people: people(), txns: S.txns, notes: S.notes, contribs: S.contribs, goals: S.goals, fixed: S.fixed, cats: S.cats, settings: S.settings });
  const achList = () => C.achievements(achData(), today());

  /* ---------- Primera vez ---------- */
  function viewSetup() {
    return '<section class="card hero"><div class="empty" style="padding:8px 0 0"><div class="e">👋</div><b>Vamos a preparar vuestra caja</b><p>' + (HOST.lockPerson ? "Escribe vuestros nombres. Solo hace falta hacerlo una vez, en uno de los dos móviles." : "Escribe vuestros nombres. Luego cada uno, en su móvil, elegirá quién es.") + '</p></div>' +
      '<div style="display:grid;gap:12px;margin-top:14px"><label class="field"><span>Tu nombre</span><input class="inp" id="n1" maxlength="20" placeholder="Ej.: Tripp" autocomplete="off"></label>' +
      '<label class="field"><span>Nombre de tu pareja</span><input class="inp" id="n2" maxlength="20" placeholder="Ej.: Ana" autocomplete="off"></label><div class="err" id="serr"></div>' +
      '<button class="btn primary block" data-act="setup" style="height:50px">Empezar</button></div></section>';
  }
  function viewWho() {
    return '<section class="card hero"><div class="empty" style="padding:8px 0 4px"><div class="e">📱</div><b>¿Quién eres en este móvil?</b><p>Solo se pregunta una vez en cada teléfono. Así cada gasto queda a nombre de quien lo apunta.</p></div>' +
      '<div class="whobtns" style="margin-top:12px">' + members().map((m) => '<button class="whobtn ' + pcls(m) + ' on" data-act="iam" data-v="' + esc(m) + '" style="height:64px;font-size:17px"><i class="dot ' + pcls(m) + '"></i>' + esc(nameOf(m)) + "</button>").join("") + "</div></section>";
  }

  /* ---------- Inicio ---------- */
  function txRow(t) {
    const c = catOf(t.cat);
    let em = c ? c.emoji : "📦", title = t.desc, sub = "", amtCls = "";
    if (t.kind === "income") { em = "💶"; amtCls = "pos"; sub = '<span class="tag ' + pcls(t.paidBy) + '">' + esc(nameOf(t.paidBy)) + "</span> Ingreso"; }
    else if (t.kind === "settle") { em = "🤝"; sub = esc(nameOf(t.paidBy)) + " → " + esc(nameOf(t.to)); }
    else { sub = '<span class="tag ' + pcls(t.paidBy) + '">' + esc(nameOf(t.paidBy)) + "</span>" + esc(t.split === "custom" ? Math.round(t.pct) + " / " + (100 - Math.round(t.pct)) : SPLITS[t.split] ? SPLITS[t.split][0] : "") + (t.note ? " · " + esc(t.note) : ""); }
    const rx = Object.values(t.reactions || {}), nc = S.notes.filter((n) => n.txnId === t.id).length;
    const social = rx.length || nc ? '<span class="social">' + esc(Array.from(new Set(rx)).join("")) + (nc ? '<span class="nc">💬 ' + nc + "</span>" : "") + "</span>" : "";
    return '<button class="item" data-act="edit" data-id="' + esc(t.id) + '"><div class="emoji">' + esc(em) + '</div><div class="grow"><div class="t1">' + esc(title) + social + '</div><div class="t2">' + sub + '</div></div><div class="amt ' + amtCls + '">' + (t.kind === "income" ? "+" : "") + esc(money(t.amount)) + "</div></button>";
  }
  function viewHome() {
    const ms = members(), p = partner(), mk = S.month, t0 = today();
    const sum = C.summary(S.txns, mk, ms);
    const budget = S.settings.budget || null;
    const proj = C.projection(sum.total, mk, t0);
    let h = "";
    if (!S.txns.length && !S.cats.length) return seedView();
    // Novedades desde tu última visita
    if (S.prevSeen && p) {
      const news = S.txns.filter((t) => t.by === p && (t.createdAt > S.prevSeen || (t.updatedAt && t.updatedAt > S.prevSeen)));
      if (news.length) h += '<div class="note accent">' + icon("info") + "<div><b>" + esc(nameOf(p)) + "</b> registró o cambió " + news.length + (news.length === 1 ? " movimiento" : " movimientos") + " desde tu última visita.</div></div>";
    }
    // Historia del mes (el mes elegido o, a principios de mes, el anterior)
    const storyMk = sum.count >= 3 ? mk : C.monthTxns(S.txns, C.addMonths(mk, -1)).filter((t) => t.kind === "expense").length >= 3 ? C.addMonths(mk, -1) : null;
    if (storyMk) h += '<button class="story-cta" data-act="story" data-v="' + storyMk + '"><span class="ring-g"><span>✨</span></span><span class="grow"><b>' + esc(cap(monthLabel(storyMk, true))) + ' en historia</b><small>Vuestro mes en cifras, en tarjetas</small></span>' + icon("chev") + "</button>";
    const pctB = budget ? (sum.total / budget) * 100 : null;
    h += '<section class="card hero"><h2>Gastado en ' + esc(C.parseYmd(mk + "-01").toLocaleDateString("es-ES", { month: "long" })) + '</h2><div class="big">' + esc(money(sum.total)) + "</div>" +
      (budget ? '<div class="row between" style="font-size:13px;margin-bottom:6px"><span class="muted">Presupuesto ' + esc(money(budget)) + '</span><span class="' + (pctB >= 100 ? "neg" : pctB >= 85 ? "" : "muted") + '">' + (sum.total <= budget ? "Quedan " + esc(money(budget - sum.total)) : "Pasados " + esc(money(sum.total - budget))) + '</span></div><div class="bar ' + (pctB >= 100 ? "neg" : pctB >= 85 ? "warn" : "") + '" role="progressbar" aria-valuenow="' + Math.round(pctB) + '"><i style="width:' + Math.min(100, pctB) + '%"></i></div>' : '<button class="btn sm" data-act="budget" style="margin-top:2px">Poner presupuesto mensual</button>') +
      '<div class="kpis"><div class="kpi"><span>' + (mk === t0.slice(0, 7) ? "Al ritmo actual, a fin de mes" : "Movimientos") + "</span><b>" + (mk === t0.slice(0, 7) ? esc(money(proj)) : sum.count) + '</b></div><div class="kpi"><span>Ingresos registrados</span><b class="pos">' + esc(money(sum.totalIncome)) + "</b></div></div></section>";
    // Saldo entre los dos
    if (p) {
      const bal = C.balance(S.txns, S.uid, p);
      const txt = bal > 0 ? esc(nameOf(p)) + " te debe " + esc(money(bal)) : bal < 0 ? "Le debes " + esc(money(-bal)) + " a " + esc(nameOf(p)) : "Estáis en paz";
      h += '<section class="card"><h2>Cuentas entre vosotros<span class="sp"></span><span class="dim" style="font-weight:500">todo el historial</span></h2><div class="balance"><div class="emoji" style="width:46px;height:46px;font-size:22px">' + (bal === 0 ? "🤝" : "⚖️") + '</div><div class="who" style="flex:1;min-width:0">' + txt + "<small>" + (bal === 0 ? "Nadie le debe nada a nadie." : "Según los gastos compartidos registrados.") + "</small></div>" + (bal !== 0 ? '<button class="btn sm primary" data-act="settle">Saldar</button>' : "") + "</div></section>";
      h += '<section class="card"><h2>Este mes, por persona</h2><div class="duo">' + ms.slice(0, 2).map((m) => '<div class="person ' + pcls(m) + '"><div class="n"><i class="dot ' + pcls(m) + '"></i>' + esc(nameOf(m, { self: true })) + "</div><dl><dt>Ha pagado</dt><dd>" + esc(money(sum.paid[m] || 0)) + "</dd><dt>Le corresponde</dt><dd>" + esc(money(sum.consumed[m] || 0)) + "</dd>" + (sum.income[m] ? "<dt>Ingresos</dt><dd>" + esc(money(sum.income[m])) + "</dd>" : "") + "</dl></div>").join("") + "</div></section>";
    }
    // Gastos fijos
    const fx = C.fixedStatus(S.fixed, S.txns, mk);
    if (fx.length) {
      const pend = fx.filter((f) => !f.done);
      h += '<section class="card"><h2>Gastos fijos de este mes<span class="sp"></span><span class="tag ' + (pend.length ? "warn" : "accent") + '">' + (pend.length ? pend.length + " por registrar" : "Todo registrado") + '</span></h2><div class="list">' +
        fx.map((f) => '<div class="item"><div class="emoji">' + esc((catOf(f.fixed.cat) || {}).emoji || "🔁") + '</div><div class="grow"><div class="t1">' + esc(f.fixed.desc) + '</div><div class="t2">' + (f.done ? "Registrado" : "Vence el " + esc(C.parseYmd(f.due).toLocaleDateString("es-ES", { day: "numeric", month: "short" }))) + " · paga " + esc(nameOf(f.fixed.paidBy)) + '</div></div><span class="amt">' + esc(money(f.fixed.amount)) + "</span>" + (f.done ? '<span class="tag accent">' + icon("check").replace("<svg", '<svg width="13" height="13"') + "</span>" : '<button class="btn sm" data-act="fixed-log" data-id="' + esc(f.fixed.id) + '">Registrar</button>') + "</div>").join("") + "</div></section>";
    }
    // Categorías
    const cats = Object.entries(sum.byCat).sort((a, b) => b[1] - a[1]);
    const cb = S.settings.catBudgets || {};
    h += '<section class="card"><h2>En qué se va</h2>' + (cats.length ? '<div class="cats">' + cats.map(([k, v]) => { const c = catOf(k); const lim = cb[k]; const pc = lim ? (v / lim) * 100 : (v / sum.total) * 100; return '<div class="catrow"><span style="font-size:20px">' + esc(c ? c.emoji : "📦") + '</span><div style="min-width:0"><div class="meta"><b>' + esc(c ? c.name : "Sin categoría") + '</b><span class="num muted">' + esc(money(v)) + (lim ? " / " + esc(money(lim)) : "") + '</span></div><div class="bar ' + (lim && pc >= 100 ? "neg" : lim && pc >= 85 ? "warn" : "") + '"><i style="width:' + Math.min(100, pc) + '%"></i></div></div><span class="num dim" style="font-size:12px;width:38px;text-align:right">' + Math.round((v / sum.total) * 100) + " %</span></div>"; }).join("") + "</div>" : '<div class="empty"><div class="e">🧾</div><b>Sin gastos este mes</b><p>Pulsa el botón + para registrar el primero.</p></div>') + "</section>";
    // Evolución
    const hist = C.history(S.txns, mk, 6), max = Math.max(1, ...hist.map((x) => x.total));
    h += '<section class="card"><h2>Últimos 6 meses</h2><div class="chart">' + hist.map((x) => '<div class="col' + (x.month === mk ? " on" : "") + '" title="' + esc(money(x.total)) + '"><span class="num" style="font-size:10.5px;color:var(--ink-2)">' + (x.total ? esc(money(x.total, { maximumFractionDigits: 0 })) : "") + '</span><i style="height:' + Math.max(3, (x.total / max) * 70) + 'px"></i><span>' + esc(C.parseYmd(x.month + "-01").toLocaleDateString("es-ES", { month: "short" })) + "</span></div>").join("") + "</div></section>";
    // Huchas
    if (S.goals.length) {
      h += '<section class="card"><h2>Huchas<span class="sp"></span><button class="btn sm ghost" data-act="view" data-v="savings">Ver</button></h2><div class="list">' + S.goals.slice(0, 3).map((g) => { const st = C.goal(g, S.contribs, t0); return '<button class="item" data-act="view" data-v="savings"><div class="emoji">' + esc(g.emoji || "🫙") + '</div><div class="grow"><div class="t1">' + esc(g.name) + '</div><div class="bar" style="margin-top:6px"><i style="width:' + st.pct + '%"></i></div></div><span class="amt num" style="font-size:13px">' + Math.round(st.pct) + " %</span></button>"; }).join("") + "</div></section>";
    }
    // Logros
    const ach = achList(), got = ach.filter((a) => a.unlocked);
    const next = ach.filter((a) => !a.unlocked).sort((a, b) => b.progress - a.progress).slice(0, 2);
    h += '<section class="card"><h2>Logros<span class="sp"></span><span class="tag accent">' + got.length + " / " + ach.length + '</span><button class="btn sm ghost" data-act="achievements">Ver todos</button></h2>' +
      '<div class="badges">' + (got.length ? got.slice(-6).map((a) => '<span class="badge" title="' + esc(a.title) + '">' + esc(a.emoji) + "</span>").join("") : '<span class="dim" style="font-size:13px">Aún ninguno. ¡A por el primero!</span>') + "</div>" +
      next.map((a) => '<div class="nextach"><span>' + esc(a.emoji) + '</span><div style="flex:1;min-width:0"><div class="meta"><b>' + esc(a.title) + '</b><span class="dim">' + Math.round(a.progress * 100) + ' %</span></div><div class="bar"><i style="width:' + a.progress * 100 + '%"></i></div><small class="dim">' + esc(a.desc) + "</small></div></div>").join("") + "</section>";
    // Últimos
    const last = C.monthTxns(S.txns, mk).sort((a, b) => ((b.date + (b.createdAt || "")) > (a.date + (a.createdAt || "")) ? 1 : -1)).slice(0, 5);
    if (last.length) h += '<section class="card"><h2>Últimos movimientos<span class="sp"></span><button class="btn sm ghost" data-act="view" data-v="list">Ver todos</button></h2><div class="list">' + last.map(txRow).join("") + "</div></section>";
    return h;
  }
  function seedView() {
    return '<section class="card"><div class="empty"><div class="e">🏷️</div><b>Crea las categorías</b><p>Supermercado, casa, facturas, ocio… Luego podréis cambiarlas.</p><button class="btn primary" data-act="seed">Crear categorías y empezar</button></div></section>';
  }

  /* ---------- Movimientos ---------- */
  function viewList() {
    const mk = S.month, q = S.q.trim().toLowerCase();
    let list = C.monthTxns(S.txns, mk);
    if (S.filter === "expense") list = list.filter((t) => t.kind === "expense" && t.split !== "mine");
    if (S.filter === "mine") list = list.filter((t) => t.kind === "expense" && t.split === "mine");
    if (S.filter === "income") list = list.filter((t) => t.kind === "income");
    if (S.filter === "settle") list = list.filter((t) => t.kind === "settle");
    if (S.who) list = list.filter((t) => t.paidBy === S.who);
    if (q) list = list.filter((t) => ((t.desc || "") + " " + (t.note || "") + " " + ((catOf(t.cat) || {}).name || "")).toLowerCase().includes(q));
    list.sort((a, b) => ((b.date + (b.createdAt || "")) > (a.date + (a.createdAt || "")) ? 1 : -1));
    const chip = (v, l) => '<button class="chip' + (S.filter === v ? " on" : "") + '" data-act="filter" data-v="' + v + '">' + l + "</button>";
    let h = '<input class="search" id="q" type="search" placeholder="Buscar gasto, nota o categoría" value="' + esc(S.q) + '" aria-label="Buscar">' +
      '<div class="chips">' + chip("all", "Todo") + chip("expense", "Compartidos") + chip("mine", "Solo de uno") + chip("income", "Ingresos") + chip("settle", "Pagos entre vosotros") +
      members().map((m) => '<button class="chip' + (S.who === m ? " on" : "") + '" data-act="who" data-v="' + esc(m) + '"><i class="dot ' + pcls(m) + '"></i>Pagó ' + esc(nameOf(m)) + "</button>").join("") + "</div>";
    if (!list.length) return h + '<section class="card"><div class="empty"><div class="e">🔍</div><b>' + (C.monthTxns(S.txns, mk).length ? "Nada coincide" : "Sin movimientos este mes") + "</b><p>" + (C.monthTxns(S.txns, mk).length ? "Prueba con otra búsqueda o filtro." : "Pulsa + para añadir un gasto.") + "</p></div></section>";
    const groups = {};
    list.forEach((t) => (groups[t.date] = groups[t.date] || []).push(t));
    const total = C.sum(list.filter((t) => t.kind === "expense"), (t) => t.amount);
    h += '<section class="card" style="padding-top:4px">' + Object.keys(groups).map((d) => { const g = groups[d]; const dt = C.sum(g.filter((t) => t.kind === "expense"), (t) => t.amount); return '<div class="day"><span>' + esc(d === today() ? "Hoy" : d === C.addDays(today(), -1) ? "Ayer" : C.parseYmd(d).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short" })) + '</span><span class="num">' + (dt ? esc(money(dt)) : "") + '</span></div><div class="list">' + g.map(txRow).join("") + "</div>"; }).join("") +
      '<div class="day" style="border-top:1px solid var(--line);margin-top:6px"><span>' + list.length + " movimientos</span><span class=\"num\">Gastos: " + esc(money(total)) + "</span></div></section>";
    return h;
  }

  /* ---------- Ahorro ---------- */
  function ring(pct, cls) {
    const r = 24, c = 2 * Math.PI * r;
    return '<svg class="ring" viewBox="0 0 58 58" aria-hidden="true"><circle cx="29" cy="29" r="' + r + '" fill="none" stroke="var(--surface-2)" stroke-width="7"/><circle cx="29" cy="29" r="' + r + '" fill="none" stroke="' + (cls || "var(--accent)") + '" stroke-width="7" stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + (c * (1 - pct / 100)).toFixed(1) + '" transform="rotate(-90 29 29)"/><text x="29" y="33" text-anchor="middle" font-size="12" font-weight="700" fill="var(--ink)" font-family="Figtree,system-ui">' + Math.round(pct) + "%</text></svg>";
  }
  function viewSavings() {
    let h = '<div class="note">' + icon("jar") + "<div>Las huchas son para ahorrar juntos (viaje, emergencia, mudanza…). Lo que apartáis aquí no cuenta como gasto del mes.</div></div>";
    if (!S.goals.length) return h + '<section class="card"><div class="empty"><div class="e">🫙</div><b>Aún no tenéis huchas</b><p>Crea una para un objetivo común y apuntad cada aportación.</p><button class="btn primary" data-act="goal">Crear hucha</button></div></section>';
    S.goals.slice().sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)).forEach((g) => {
      const st = C.goal(g, S.contribs, today());
      const recent = S.contribs.filter((c) => c.goalId === g.id).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 3);
      h += '<section class="card"><div class="goal">' + ring(st.pct, st.reached ? "var(--pos)" : undefined) + '<div style="flex:1;min-width:0"><div class="row between" style="flex-wrap:nowrap"><b style="font:700 17px var(--f-display);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc((g.emoji || "🫙") + " " + g.name) + '</b><button class="btn sm ghost" data-act="goal" data-id="' + esc(g.id) + '">Editar</button></div><div class="num"><b>' + esc(money(st.saved)) + '</b> <span class="muted">de ' + esc(money(g.target)) + "</span></div><div class=\"dim\" style=\"font-size:12.5px\">" + (st.reached ? "¡Objetivo conseguido! 🎉" : "Faltan " + esc(money(st.remaining)) + (st.perMonth ? " · " + esc(money(st.perMonth)) + "/mes para llegar el " + esc(C.parseYmd(g.date).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })) : "")) + "</div></div></div>" +
        (Object.keys(st.by).length ? '<div class="duo" style="margin-top:12px">' + members().slice(0, 2).map((m) => '<div class="person ' + pcls(m) + '"><div class="n"><i class="dot ' + pcls(m) + '"></i>' + esc(nameOf(m, { self: true })) + '</div><div class="num" style="font-weight:700;margin-top:4px">' + esc(money(st.by[m] || 0)) + "</div></div>").join("") + "</div>" : "") +
        (recent.length ? '<div class="list" style="margin-top:6px">' + recent.map((c) => '<button class="item" data-act="contrib-edit" data-id="' + esc(c.id) + '"><div class="emoji" style="width:32px;height:32px;font-size:15px">➕</div><div class="grow"><div class="t1" style="font-weight:500">' + esc(c.note || "Aportación") + '</div><div class="t2"><span class="tag ' + pcls(c.by) + '">' + esc(nameOf(c.by)) + "</span>" + esc(C.parseYmd(c.date).toLocaleDateString("es-ES", { day: "numeric", month: "short" })) + '</div></div><span class="amt' + (c.amount < 0 ? " neg" : "") + '">' + esc(money(c.amount)) + "</span></button>").join("") + "</div>" : "") +
        '<button class="btn block" style="margin-top:12px" data-act="contrib" data-id="' + esc(g.id) + '">' + icon("plus") + "Aportar</button></section>";
    });
    return h + '<button class="btn block" data-act="goal">' + icon("plus") + "Nueva hucha</button>";
  }

  /* ---------- Más ---------- */
  function viewMore() {
    const item = (act, ic, label, sub) => '<button data-act="' + act + '">' + icon(ic) + '<span class="grow">' + label + (sub ? '<br><span class="dim" style="font-size:12.5px">' + sub + "</span>" : "") + "</span>" + icon("chev") + "</button>";
    const acct = HOST.name === "standalone" ? '<section class="card"><h2>Cuenta</h2><div class="menu">' + item("invite-code", "share", "Código para tu pareja", esc(HOST.inviteCode || "—")) + item("logout", "out", "Cerrar sesión", esc(HOST.email || "")) + "</div></section>" : "";
    return '<section class="card"><h2>Juntos</h2><div class="menu">' + item("view-savings", "jar", "Huchas de ahorro", S.goals.length + (S.goals.length === 1 ? " hucha" : " huchas")) + item("achievements", "trophy", "Logros", achList().filter((a) => a.unlocked).length + " de 12 desbloqueados") + item("story", "spark", "Historia del mes", cap(monthLabel(S.month))) + "</div></section>" +
      '<section class="card"><h2>Organización</h2><div class="menu">' + item("fixed", "repeat", "Gastos fijos", S.fixed.length + " configurados · alquiler, luz, internet…") + item("budget", "target", "Presupuesto mensual", S.settings.budget ? money(S.settings.budget) + " al mes" : "Sin definir") + item("cats", "tag", "Categorías", S.cats.length + " categorías") + "</div></section>" +
      '<section class="card"><h2>Vosotros</h2><div class="menu">' + item("names", "user", HOST.lockPerson ? "Nombres" : "Nombres y quién soy en este móvil", "Estás como " + esc(nameOf(S.uid))) + item("invite", "down", "Instalarla en los dos móviles", "Como una app en la pantalla de inicio") + (HOST.push ? item("push", "bell", "Notificaciones", "Avisos al móvil de lo que hace tu pareja") : "") + item("settings", "coin", "Nombre de la caja y moneda", esc(S.settings.title || "Nuestra Caja") + " · " + esc(cur())) + "</div></section>" +
      '<section class="card"><h2>Datos</h2><div class="menu">' + item("export", "down", "Exportar a Excel (CSV)", "Todos los movimientos") + item("wipe", "trash", "Borrar todos los movimientos", "Pide confirmación") + "</div></section>" +
      acct + '<p class="dim" style="font-size:12px;text-align:center;margin:4px 0">' + (HOST.name === "claude" ? "Los datos se guardan en vuestra app compartida de Claude. Solo los ve quien tenga acceso." : "Los datos se guardan en vuestro servidor privado. Solo los veis vosotros dos.") + "</p>";
  }

  /* ---------- Hojas ---------- */
  function openSheet(html, onMount) {
    $("#sheetRoot").innerHTML = '<div class="scrim" data-act="close-bg"><div class="sheet" role="dialog" aria-modal="true">' + '<div class="grab"></div>' + html + "</div></div>";
    document.body.style.overflow = "hidden";
    S.sheetSave = null; S.sheetDel = null; S.drawSocial = null;
    if (onMount) onMount($("#sheetRoot .sheet"));
  }
  function closeSheet() { $("#sheetRoot").innerHTML = ""; document.body.style.overflow = ""; }
  const head = (title, extra) => '<h3>' + esc(title) + '<span class="sp"></span>' + (extra || "") + '<button class="icon-btn" data-act="close" aria-label="Cerrar">' + icon("x") + "</button></h3>";
  const whoBtns = (name, val) => '<div class="whobtns">' + (members().length ? members() : [S.uid]).slice(0, 2).map((m) => '<button type="button" class="whobtn ' + pcls(m) + (val === m ? " on" : "") + '" data-pick="' + name + '" data-v="' + esc(m) + '">' + ('<i class="dot ' + pcls(m) + '"></i>') + esc(nameOf(m, { self: true })) + "</button>").join("") + "</div>";

  /* Formulario de movimiento */
  function txnSheet(t, preset) {
    const p = Object.assign({ kind: "expense", date: today(), paidBy: S.uid, split: "half", pct: 50 }, preset || {}, t || {});
    const F = { kind: p.kind, cat: p.cat || (S.cats[0] && S.cats[0].id) || null, paidBy: p.paidBy, split: p.split || "half", pct: p.pct === undefined ? 50 : p.pct, date: p.date };
    const draw = (root) => {
      const isExp = F.kind === "expense";
      root.querySelector("#kindSeg").innerHTML = '<button type="button" data-k="expense" class="' + (isExp ? "on" : "") + '">Gasto</button><button type="button" data-k="income" class="' + (!isExp ? "on" : "") + '">Ingreso</button>';
      root.querySelector("#catBox").hidden = !isExp; root.querySelector("#splitBox").hidden = !isExp || members().length < 2;
      root.querySelector("#whoLbl").textContent = isExp ? "¿Quién pagó?" : "¿De quién es el ingreso?";
      root.querySelector("#whoBox").innerHTML = whoBtns("paidBy", F.paidBy);
      root.querySelector("#catGrid").innerHTML = S.cats.slice().sort((a, b) => (a.order || 0) - (b.order || 0)).map((c) => '<button type="button" class="catbtn' + (F.cat === c.id ? " on" : "") + '" data-cat="' + esc(c.id) + '"><span class="e">' + esc(c.emoji) + "</span><span>" + esc(c.name) + "</span></button>").join("");
      root.querySelector("#splitGrid").innerHTML = Object.entries(SPLITS).map(([k, [l, s]]) => '<button type="button" class="splitbtn' + (F.split === k ? " on" : "") + '" data-split="' + k + '"><b>' + l + "</b><small>" + (k === "theirs" ? esc(nameOf(F.paidBy, { self: true })) + " paga por " + esc(nameOf(members().find((m) => m !== F.paidBy), { self: true })) : s) + "</small></button>").join("");
      const pc = root.querySelector("#pctBox"); pc.hidden = F.split !== "custom" || !isExp;
      root.querySelector("#pctLbl").textContent = nameOf(F.paidBy, { self: true }) + " " + Math.round(F.pct) + " % · " + nameOf(members().find((m) => m !== F.paidBy), { self: true }) + " " + (100 - Math.round(F.pct)) + " %";
      root.querySelectorAll("[data-d]").forEach((b) => b.classList.toggle("on", root.querySelector("#date").value === b.dataset.d));
    };
    const amount = p.amount ? C.toInput(p.amount) : "";
    openSheet(head(t ? "Editar movimiento" : "Nuevo movimiento") +
      (t ? '<div class="reacts" id="reacts" role="group" aria-label="Reaccionar"></div>' : "") +
      '<div class="seg" id="kindSeg"></div>' +
      '<label class="amount-in"><input id="amt" inputmode="decimal" placeholder="0,00" value="' + esc(amount) + '" aria-label="Importe" autocomplete="off"><span>' + esc(cur() === "EUR" ? "€" : cur()) + "</span></label>" +
      '<label class="field"><span>Concepto</span><input class="inp" id="desc" maxlength="80" placeholder="Ej.: compra de la semana" value="' + esc(p.desc || "") + '" autocomplete="off"></label>' +
      '<div class="field" id="catBox"><span>Categoría</span><div class="catgrid" id="catGrid"></div></div>' +
      '<div class="field"><span id="whoLbl"></span><div id="whoBox"></div></div>' +
      '<div class="field" id="splitBox"><span>¿Cómo se reparte?</span><div class="splits" id="splitGrid"></div><div id="pctBox" hidden><input type="range" id="pct" min="0" max="100" step="5" value="' + esc(F.pct) + '" style="width:100%;accent-color:var(--accent)" aria-label="Porcentaje de quien paga"><div class="dim" id="pctLbl" style="font-size:13px;text-align:center"></div></div></div>' +
      '<div class="field"><span>Fecha</span><div class="row" style="flex-wrap:nowrap"><div class="chips"><button type="button" class="chip" data-d="' + today() + '">Hoy</button><button type="button" class="chip" data-d="' + C.addDays(today(), -1) + '">Ayer</button></div><input class="inp" type="date" id="date" value="' + esc(F.date) + '" style="flex:1"></div></div>' +
      '<label class="field"><span>Nota (opcional)</span><input class="inp" id="note" maxlength="140" value="' + esc(p.note || "") + '"></label>' +
      '<div class="err" id="err" role="alert"></div>' +
      '<button class="btn primary block" data-act="txn-save" style="height:50px;font-size:15px">' + (t ? "Guardar cambios" : "Guardar") + "</button>" +
      (t ? '<div class="field"><span>Comentarios</span><div id="notes"></div><div class="row" style="flex-wrap:nowrap"><input class="inp" id="noteIn" maxlength="200" placeholder="Escribe algo a ' + esc(nameOf(partner())) + '…" autocomplete="off"><button class="btn" data-act="note-send" aria-label="Enviar">' + icon("send") + "</button></div></div>" : "") +
      (t ? '<div class="row between"><span class="dim" style="font-size:12px">Lo añadió ' + esc(nameOf(t.by)) + (t.createdAt ? " el " + esc(new Date(t.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "short" })) : "") + (t.updatedBy ? " · editado por " + esc(nameOf(t.updatedBy)) : "") + '</span><button class="btn sm danger" data-act="txn-del">' + icon("trash") + "Eliminar</button></div>" : ""),
      (root) => {
        draw(root);
        S.sheetTxn = t ? t.id : null;
        if (t) { S.drawSocial = () => drawSocial(root, t.id); S.drawSocial(); }
        root.addEventListener("click", (e) => {
          const b = e.target.closest("button"); if (!b) return;
          if (b.dataset.k) { F.kind = b.dataset.k; draw(root); }
          else if (b.dataset.cat) { F.cat = b.dataset.cat; draw(root); }
          else if (b.dataset.pick === "paidBy") { F.paidBy = b.dataset.v; draw(root); }
          else if (b.dataset.split) { F.split = b.dataset.split; draw(root); }
          else if (b.dataset.d) { root.querySelector("#date").value = b.dataset.d; draw(root); }
        });
        root.querySelector("#pct").addEventListener("input", (e) => { F.pct = Number(e.target.value); draw(root); });
        root.querySelector("#date").addEventListener("change", () => draw(root));
        if (!t) setTimeout(() => root.querySelector("#amt").focus(), 60);
        S.sheetSave = async () => {
          const amt = C.parseMoney(root.querySelector("#amt").value), desc = root.querySelector("#desc").value.trim(), date = root.querySelector("#date").value;
          const errs = [];
          if (amt === null || amt <= 0) errs.push("Pon un importe válido (por ejemplo 12,50).");
          if (!desc) errs.push("Añade un concepto.");
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errs.push("Elige una fecha.");
          if (errs.length) { root.querySelector("#err").textContent = errs.join(" "); return; }
          const isExp = F.kind === "expense";
          const data = Object.assign({}, t || {}, { kind: F.kind, amount: amt, desc, date, note: root.querySelector("#note").value.trim() || null, paidBy: F.paidBy || S.uid, cat: isExp ? F.cat : null, split: isExp ? F.split : null, pct: isExp && F.split === "custom" ? F.pct : null, fixedId: (t && t.fixedId) || (preset && preset.fixedId) || null });
          if (preset && preset.fromShop) data.fromShop = true;
          if (t) { data.updatedAt = nowIso(); data.updatedBy = S.uid; } else { data.by = S.uid; data.createdAt = nowIso(); }
          const ref = t ? col("txns").doc(t.id) : col("txns").doc();
          if (await save(() => ref.set(clean(data)), t ? "Cambios guardados" : (isExp ? "Gasto guardado" : "Ingreso guardado"))) {
            closeSheet();
            if (preset && preset.fromShop) {
              const done = S.shop.filter((i) => i.done);
              await save(async () => { await S.db.doc("settings/shop").set({ freq: C.bumpFreq(S.shopFreq, done.map((i) => i.text)) }); for (const i of done) await col("shop").doc(i.id).delete(); });
              confetti(); toast("🛒 Compra terminada y apuntada"); S.view = "home"; render();
            }
          }
        };
        S.sheetDel = t ? async () => {
          const copy = clean(t);
          if (await save(() => col("txns").doc(t.id).delete())) { closeSheet(); toast("Eliminado «" + t.desc + "»", async () => { await save(() => col("txns").doc(t.id).set(copy), "Recuperado"); }); }
        } : null;
      });
  }

  const REACTS = ["❤️", "😂", "😮", "😬", "👏", "🙄"];
  function drawSocial(root, id) {
    const t = S.txns.find((x) => x.id === id); if (!t || !root.isConnected) return;
    const mine = (t.reactions || {})[S.uid], all = t.reactions || {};
    const rb = root.querySelector("#reacts");
    if (rb) rb.innerHTML = REACTS.map((r) => { const who = Object.keys(all).filter((k) => all[k] === r); return '<button type="button" class="react' + (mine === r ? " on" : "") + '" data-act="react" data-id="' + esc(id) + '" data-v="' + r + '" aria-pressed="' + (mine === r) + '">' + r + (who.length ? '<span class="who">' + who.map((w) => '<i class="dot ' + pcls(w) + '"></i>').join("") + "</span>" : "") + "</button>"; }).join("");
    const nb = root.querySelector("#notes"); if (!nb) return;
    const list = S.notes.filter((n) => n.txnId === id).sort((a, b) => (a.at < b.at ? -1 : 1));
    nb.innerHTML = list.length ? '<div class="thread">' + list.map((n) => '<div class="bubble ' + (n.by === S.uid ? "me " : "") + pcls(n.by) + '"><div>' + esc(n.text) + '</div><small>' + esc(nameOf(n.by)) + " · " + esc(new Date(n.at).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })) + (n.by === S.uid ? ' · <button type="button" class="linkbtn" data-act="note-del" data-id="' + esc(n.id) + '">borrar</button>' : "") + "</small></div>").join("") + "</div>" : '<div class="dim" style="font-size:13px">Sin comentarios todavía.</div>';
  }

  function settleSheet() {
    const p = partner(); if (!p) return;
    const bal = C.balance(S.txns, S.uid, p);
    const from = bal > 0 ? p : S.uid, to = bal > 0 ? S.uid : p;
    openSheet(head("Saldar cuentas") + '<div class="note">' + icon("swap") + "<div><b>" + esc(nameOf(from, { self: true })) + "</b> le paga a <b>" + esc(nameOf(to, { self: true })) + "</b>. Esto solo lo apunta: el dinero lo movéis vosotros (Bizum, transferencia…).</div></div>" +
      '<label class="amount-in"><input id="samt" inputmode="decimal" value="' + esc(C.toInput(Math.abs(bal))) + '" aria-label="Importe"><span>€</span></label><div class="err" id="serr"></div><button class="btn primary block" data-act="settle-save" style="height:50px">Apuntar pago</button>',
      (root) => {
        S.sheetSave = async () => {
          const a = C.parseMoney(root.querySelector("#samt").value);
          if (!a || a <= 0) { root.querySelector("#serr").textContent = "Pon un importe válido."; return; }
          if (await save(() => col("txns").doc().set({ kind: "settle", amount: a, desc: "Pago entre vosotros", date: today(), paidBy: from, to, by: S.uid, createdAt: nowIso() }), "Pago apuntado")) { closeSheet(); if (a === Math.abs(bal)) confetti(); }
        };
      });
  }

  function goalSheet(g) {
    openSheet(head(g ? "Editar hucha" : "Nueva hucha") +
      '<div class="row" style="flex-wrap:nowrap"><input class="inp" id="gem" maxlength="4" value="' + esc((g && g.emoji) || "✈️") + '" style="width:64px;text-align:center;font-size:20px" aria-label="Emoji"><input class="inp" id="gname" maxlength="40" placeholder="Viaje, emergencia, sofá…" value="' + esc((g && g.name) || "") + '" aria-label="Nombre"></div>' +
      '<label class="field"><span>Objetivo</span><input class="inp" id="gtarget" inputmode="decimal" placeholder="0,00" value="' + esc(g ? C.toInput(g.target) : "") + '"></label>' +
      '<label class="field"><span>Para cuándo (opcional)</span><input class="inp" type="date" id="gdate" value="' + esc((g && g.date) || "") + '"></label><div class="err" id="gerr"></div>' +
      '<button class="btn primary block" data-act="goal-save" style="height:50px">Guardar</button>' + (g ? '<button class="btn danger block" data-act="goal-del">Eliminar hucha</button>' : ""),
      (root) => {
        S.sheetSave = async () => {
          const name = root.querySelector("#gname").value.trim(), target = C.parseMoney(root.querySelector("#gtarget").value);
          if (!name || !target || target <= 0) { root.querySelector("#gerr").textContent = "Pon un nombre y un objetivo válido."; return; }
          const data = Object.assign({}, g || {}, { name, emoji: root.querySelector("#gem").value.trim() || "🫙", target, date: root.querySelector("#gdate").value || null });
          if (!g) { data.createdAt = nowIso(); data.createdBy = S.uid; }
          if (await save(() => (g ? col("goals").doc(g.id) : col("goals").doc()).set(clean(data)), "Hucha guardada")) closeSheet();
        };
        S.sheetDel = g ? async () => {
          if (!S.confirmGoal) { S.confirmGoal = true; toast("Pulsa otra vez «Eliminar hucha» para confirmar"); setTimeout(() => (S.confirmGoal = false), 4000); return; }
          S.confirmGoal = false;
          if (await save(async () => { for (const c of S.contribs.filter((x) => x.goalId === g.id)) await col("contribs").doc(c.id).delete(); await col("goals").doc(g.id).delete(); }, "Hucha eliminada")) closeSheet();
        } : null;
      });
  }
  function contribSheet(goalId, c) {
    const F = { by: (c && c.by) || S.uid };
    openSheet(head(c ? "Editar aportación" : "Aportar a «" + ((S.goals.find((g) => g.id === goalId) || {}).name || "") + "»") +
      '<label class="amount-in"><input id="camt" inputmode="decimal" placeholder="0,00" value="' + esc(c ? C.toInput(c.amount) : "") + '" aria-label="Importe"><span>€</span></label><div class="dim" style="font-size:12.5px;margin-top:-6px">Usa un número negativo si sacáis dinero de la hucha.</div>' +
      '<div class="field"><span>¿Quién aporta?</span><div id="cwho"></div></div><label class="field"><span>Nota (opcional)</span><input class="inp" id="cnote" maxlength="80" value="' + esc((c && c.note) || "") + '"></label><div class="err" id="cerr"></div>' +
      '<button class="btn primary block" data-act="contrib-save" style="height:50px">Guardar</button>' + (c ? '<button class="btn danger block" data-act="contrib-del">Eliminar aportación</button>' : ""),
      (root) => {
        const draw = () => (root.querySelector("#cwho").innerHTML = whoBtns("by", F.by));
        draw(); root.addEventListener("click", (e) => { const b = e.target.closest("[data-pick]"); if (b) { F.by = b.dataset.v; draw(); } });
        setTimeout(() => root.querySelector("#camt").focus(), 60);
        S.sheetSave = async () => {
          const a = C.parseMoney(root.querySelector("#camt").value);
          if (!a) { root.querySelector("#cerr").textContent = "Pon un importe válido."; return; }
          const data = Object.assign({}, c || {}, { goalId: (c && c.goalId) || goalId, amount: a, by: F.by, note: root.querySelector("#cnote").value.trim() || null, date: (c && c.date) || today() });
          const g = S.goals.find((x) => x.id === data.goalId), before = g ? C.goal(g, S.contribs, today()).reached : true;
          if (await save(() => (c ? col("contribs").doc(c.id) : col("contribs").doc()).set(clean(data)), "Aportación guardada")) {
            closeSheet();
            const after = g && C.goal(g, S.contribs.filter((x) => x.id !== (c && c.id)).concat([data]), today()).reached;
            if (!before && after) { confetti(); toast("🎉 ¡Hucha «" + g.name + "» completada!"); }
          }
        };
        S.sheetDel = c ? async () => { if (await save(() => col("contribs").doc(c.id).delete(), "Aportación eliminada")) closeSheet(); } : null;
      });
  }

  function fixedSheet() {
    openSheet(head("Gastos fijos") + '<div class="note">' + icon("repeat") + "<div>Gastos que se repiten cada mes. En Inicio veréis cuáles faltan por registrar y los apuntáis con un toque.</div></div>" +
      '<div class="list">' + (S.fixed.length ? S.fixed.map((f) => '<button class="item" data-act="fixed-edit" data-id="' + esc(f.id) + '"><div class="emoji">' + esc((catOf(f.cat) || {}).emoji || "🔁") + '</div><div class="grow"><div class="t1">' + esc(f.desc) + '</div><div class="t2">Día ' + esc(f.day) + " · paga " + esc(nameOf(f.paidBy)) + " · " + esc((SPLITS[f.split] || ["A medias"])[0]) + '</div></div><span class="amt">' + esc(money(f.amount)) + "</span></button>").join("") : '<div class="dim" style="padding:8px 2px">Todavía no hay gastos fijos.</div>') + "</div>" +
      '<button class="btn primary block" data-act="fixed-new">' + icon("plus") + "Añadir gasto fijo</button>");
  }
  function fixedForm(f) {
    const F = { cat: (f && f.cat) || (S.cats[0] && S.cats[0].id), paidBy: (f && f.paidBy) || S.uid, split: (f && f.split) || "half" };
    openSheet(head(f ? "Editar gasto fijo" : "Nuevo gasto fijo") +
      '<label class="field"><span>Concepto</span><input class="inp" id="fdesc" maxlength="60" placeholder="Alquiler, luz, internet…" value="' + esc((f && f.desc) || "") + '"></label>' +
      '<div class="row" style="flex-wrap:nowrap"><label class="field" style="flex:1"><span>Importe aproximado</span><input class="inp" id="famt" inputmode="decimal" value="' + esc(f ? C.toInput(f.amount) : "") + '"></label><label class="field" style="width:110px"><span>Día del mes</span><input class="inp" id="fday" type="number" min="1" max="31" value="' + esc((f && f.day) || 1) + '"></label></div>' +
      '<div class="field"><span>Categoría</span><div class="catgrid" id="fcats"></div></div><div class="field"><span>¿Quién lo paga normalmente?</span><div id="fwho"></div></div>' +
      '<div class="field"><span>Reparto</span><div class="splits" id="fsplit"></div></div><div class="err" id="ferr"></div>' +
      '<button class="btn primary block" data-act="fixed-save" style="height:50px">Guardar</button>' + (f ? '<button class="btn danger block" data-act="fixed-del">Eliminar gasto fijo</button>' : ""),
      (root) => {
        const draw = () => {
          root.querySelector("#fcats").innerHTML = S.cats.map((c) => '<button type="button" class="catbtn' + (F.cat === c.id ? " on" : "") + '" data-cat="' + esc(c.id) + '"><span class="e">' + esc(c.emoji) + "</span><span>" + esc(c.name) + "</span></button>").join("");
          root.querySelector("#fwho").innerHTML = whoBtns("paidBy", F.paidBy);
          root.querySelector("#fsplit").innerHTML = ["half", "mine", "theirs"].map((k) => '<button type="button" class="splitbtn' + (F.split === k ? " on" : "") + '" data-split="' + k + '"><b>' + SPLITS[k][0] + "</b></button>").join("");
        };
        draw();
        root.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; if (b.dataset.cat) F.cat = b.dataset.cat; else if (b.dataset.pick) F.paidBy = b.dataset.v; else if (b.dataset.split) F.split = b.dataset.split; else return; draw(); });
        S.sheetSave = async () => {
          const desc = root.querySelector("#fdesc").value.trim(), amount = C.parseMoney(root.querySelector("#famt").value), day = parseInt(root.querySelector("#fday").value, 10);
          if (!desc || !amount || amount <= 0 || !(day >= 1 && day <= 31)) { root.querySelector("#ferr").textContent = "Revisa concepto, importe y día (1 a 31)."; return; }
          const data = Object.assign({}, f || {}, { desc, amount, day, cat: F.cat, paidBy: F.paidBy, split: F.split, active: true });
          if (await save(() => (f ? col("fixed").doc(f.id) : col("fixed").doc()).set(clean(data)), "Gasto fijo guardado")) fixedSheet();
        };
        S.sheetDel = f ? async () => { if (await save(() => col("fixed").doc(f.id).delete(), "Gasto fijo eliminado")) fixedSheet(); } : null;
      });
  }

  function budgetSheet() {
    const cb = S.settings.catBudgets || {};
    openSheet(head("Presupuesto mensual") + '<label class="field"><span>Total para gastos del mes</span><input class="inp" id="btotal" inputmode="decimal" placeholder="Sin límite" value="' + esc(S.settings.budget ? C.toInput(S.settings.budget) : "") + '"></label>' +
      '<div class="field"><span>Límite por categoría (opcional)</span><div class="list">' + S.cats.map((c) => '<div class="item" style="padding:6px 2px"><div class="emoji" style="width:32px;height:32px;font-size:16px">' + esc(c.emoji) + '</div><div class="grow t1" style="font-weight:500">' + esc(c.name) + '</div><input class="inp" data-cb="' + esc(c.id) + '" inputmode="decimal" placeholder="—" value="' + esc(cb[c.id] ? C.toInput(cb[c.id]) : "") + '" style="width:110px;height:38px;text-align:right"></div>').join("") + '</div></div><div class="err" id="berr"></div><button class="btn primary block" data-act="budget-save" style="height:50px">Guardar</button>',
      (root) => {
        S.sheetSave = async () => {
          const tRaw = root.querySelector("#btotal").value.trim(), total = tRaw ? C.parseMoney(tRaw) : null;
          if (tRaw && !(total > 0)) { root.querySelector("#berr").textContent = "El total no es válido."; return; }
          const cats = {}; let bad = false;
          root.querySelectorAll("[data-cb]").forEach((i) => { if (!i.value.trim()) return; const v = C.parseMoney(i.value); if (!(v > 0)) bad = true; else cats[i.dataset.cb] = v; });
          if (bad) { root.querySelector("#berr").textContent = "Revisa los límites por categoría."; return; }
          if (await save(() => S.db.doc("settings/main").set(clean(Object.assign({}, S.settings, { budget: total, catBudgets: cats }))), "Presupuesto guardado")) closeSheet();
        };
      });
  }
  function catsSheet() {
    openSheet(head("Categorías") + '<div class="list">' + S.cats.slice().sort((a, b) => (a.order || 0) - (b.order || 0)).map((c) => { const used = S.txns.some((t) => t.cat === c.id); return '<div class="item" style="padding:6px 2px"><input class="inp" data-cem="' + esc(c.id) + '" value="' + esc(c.emoji) + '" maxlength="4" style="width:52px;text-align:center;font-size:18px;height:40px" aria-label="Emoji"><input class="inp" data-cname="' + esc(c.id) + '" value="' + esc(c.name) + '" maxlength="24" style="height:40px" aria-label="Nombre">' + (used ? '<span class="dim" style="font-size:11px;width:44px;text-align:center">en uso</span>' : '<button class="icon-btn" data-act="cat-del" data-id="' + esc(c.id) + '" aria-label="Eliminar">' + icon("trash") + "</button>") + "</div>"; }).join("") +
      '</div><div class="row" style="flex-wrap:nowrap"><input class="inp" id="nem" placeholder="🙂" maxlength="4" style="width:52px;text-align:center;font-size:18px"><input class="inp" id="nname" placeholder="Nueva categoría" maxlength="24"><button class="btn" data-act="cat-add">Añadir</button></div><button class="btn primary block" data-act="cats-save">Guardar cambios</button>');
  }
  function namesSheet() {
    openSheet(head("Nombres") + members().map((m, i) => '<label class="field"><span><i class="dot ' + pcls(m) + '"></i> Persona ' + (i + 1) + (m === S.uid ? " (tú, en este móvil)" : "") + '</span><input class="inp" data-name="' + esc(m) + '" maxlength="20" value="' + esc(nameOf(m)) + '"></label>').join("") +
      '<button class="btn primary block" data-act="names-save" style="height:50px">Guardar nombres</button>' +
      (HOST.lockPerson ? "" : '<div class="field"><span>¿Quién eres en este móvil?</span><div class="whobtns">' + members().map((m) => '<button class="whobtn ' + pcls(m) + (m === S.uid ? " on" : "") + '" data-act="iam" data-v="' + esc(m) + '"><i class="dot ' + pcls(m) + '"></i>' + esc(nameOf(m)) + "</button>").join("") + '</div><small class="dim" style="font-size:12px">Esto solo cambia en este teléfono.</small></div>'));
  }
  function settingsSheet() {
    openSheet(head("Nombre y moneda") + '<label class="field"><span>Nombre de la caja</span><input class="inp" id="stitle" maxlength="30" value="' + esc(S.settings.title || "") + '" placeholder="Nuestra Caja"></label><label class="field"><span>Moneda</span><select class="inp" id="scur">' + [["EUR", "Euro (€)"], ["USD", "Dólar ($)"], ["ARS", "Peso argentino ($)"], ["GBP", "Libra (£)"]].map(([k, l]) => '<option value="' + k + '"' + (cur() === k ? " selected" : "") + ">" + l + "</option>").join("") + '</select></label><div class="dim" style="font-size:12.5px">Cambiar la moneda solo cambia cómo se muestran los importes; no los convierte.</div><button class="btn primary block" data-act="settings-save" style="height:50px">Guardar</button>');
  }
  /* ---------- Notificaciones (app propia) ---------- */
  async function pushSheet(msg) {
    const P = HOST.push; if (!P) return;
    openSheet(head("Notificaciones") + '<div class="dim" style="text-align:center;padding:18px 0">Comprobando…</div>');
    let st = "off"; try { st = await P.status(); } catch (e) { st = "error"; }
    const partnerName = nameOf(partner());
    const intro = '<div class="note accent">' + icon("bell") + "<div>Te llega un aviso al móvil cuando " + esc(partnerName) + " apunta algo, aunque tengas la app cerrada. Cada uno lo activa en su propio móvil.</div></div>";
    let body = "";
    if (st === "ios-install") body = '<div class="note warn">' + icon("info") + '<div><b>En iPhone primero hay que instalarla.</b> En Safari pulsa Compartir → <b>Añadir a pantalla de inicio</b>, abre la app desde ese icono y vuelve aquí. (Necesita iOS 16.4 o posterior.)</div></div>';
    else if (st === "unsupported") body = '<div class="note warn">' + icon("info") + "<div>Este navegador no permite notificaciones. En Android usa <b>Chrome</b>; en iPhone, la app instalada desde <b>Safari</b>.</div></div>";
    else if (st === "denied") body = '<div class="note warn">' + icon("info") + "<div>Las notificaciones están <b>bloqueadas</b> para esta app. Actívalas en los ajustes del móvil (Ajustes → Notificaciones → Nuestra Caja, o en Chrome → Configuración del sitio → Notificaciones) y vuelve a abrir esta pantalla.</div></div>";
    else if (st === "error") body = '<div class="note warn">' + icon("info") + "<div>No se pudo comprobar. Revisa tu conexión.</div></div>";
    else if (st === "off") body = '<button class="btn primary block" data-act="push-on" style="height:50px">' + icon("bell") + "Activar notificaciones</button>";
    else {
      const prefs = await P.prefs().catch(() => ({}));
      body = '<div class="list">' + P.types.map((t) => { const on = prefs[t.id] !== false; return '<button class="item" data-act="push-pref" data-v="' + t.id + '" aria-pressed="' + on + '"><div class="grow" style="white-space:normal"><div class="t1">' + esc(t.label) + '</div><div class="t2">' + esc(t.hint) + '</div></div><span class="tag ' + (on ? "p1" : "") + '">' + (on ? "Sí" : "No") + "</span></button>"; }).join("") + "</div>" +
        '<button class="btn block" data-act="push-test">' + icon("send") + "Enviarme un aviso de prueba</button>" +
        '<button class="btn ghost block" data-act="push-off">Desactivar en este móvil</button>';
    }
    if (!$("#sheetRoot .sheet")) return; // la cerraron mientras comprobábamos
    openSheet(head("Notificaciones") + intro + (msg ? '<div class="note">' + icon("check") + "<div>" + esc(msg) + "</div></div>" : "") + body);
  }
  async function pushAct(kind, v) {
    const P = HOST.push; if (!P) return;
    try {
      if (kind === "on") { toast("Activando…"); await P.enable(); buzz(); return pushSheet("¡Listo! Las notificaciones están activadas en este móvil."); }
      if (kind === "off") { await P.disable(); return pushSheet("Desactivadas en este móvil."); }
      if (kind === "pref") { const prefs = await P.prefs(); await P.setPref(v, prefs[v] === false); return pushSheet(); }
      if (kind === "test") { const r = await P.test(); toast(r && r.sent ? "Aviso de prueba enviado: debería llegarte en unos segundos" : "No se pudo enviar el aviso. Desactiva y vuelve a activar."); }
    } catch (e) {
      const c = e && e.code;
      toast(c === "denied" ? "No diste permiso para notificaciones." : c === "ios-install" ? "Primero instálala en la pantalla de inicio." : "No se pudo completar. Revisa tu conexión e inténtalo otra vez.");
      if (c === "denied" || c === "ios-install") pushSheet();
    }
  }
  function inviteSheet() {
    if (HOST.name === "standalone") return openSheet(head("Instalarla en los dos móviles") +
      '<div class="list"><div class="item"><div class="emoji">1</div><div class="grow" style="white-space:normal">Mándale a tu pareja este enlace (ya lleva vuestro código):<br><b class="mono" style="word-break:break-all">' + esc(HOST.inviteLink || "") + '</b></div></div>' +
      '<div class="item"><div class="emoji">2</div><div class="grow" style="white-space:normal">Lo abre, crea su cuenta con su correo y entra directamente a vuestra caja.</div></div>' +
      '<div class="item"><div class="emoji">3</div><div class="grow" style="white-space:normal"><b>Android (Chrome):</b> aparecerá «Instalar app» (o menú ⋮ → <b>Instalar aplicación</b>).<br><b>iPhone (Safari):</b> Compartir → <b>Añadir a pantalla de inicio</b>.</div></div></div>' +
      '<button class="btn primary block" data-act="copy-invite">' + icon("copy") + "Copiar enlace</button>" + (HOST.canInstall && HOST.canInstall() ? '<button class="btn block" data-act="install">' + icon("down") + "Instalar en este móvil</button>" : ""));
    openSheet(head("Instalarla en los dos móviles") +
      '<div class="list"><div class="item"><div class="emoji">1</div><div class="grow" style="white-space:normal">En cada móvil, inicia sesión en Claude con <b>la misma cuenta</b> y abre esta app (el enlace de la conversación o tu galería de artefactos).</div></div>' +
      '<div class="item"><div class="emoji">2</div><div class="grow" style="white-space:normal"><b>iPhone (Safari):</b> botón Compartir → <b>Añadir a pantalla de inicio</b>.<br><b>Android (Chrome):</b> menú ⋮ → <b>Añadir a pantalla de inicio</b>.</div></div>' +
      '<div class="item"><div class="emoji">3</div><div class="grow" style="white-space:normal">La primera vez, cada uno elige <b>quién es</b> en su teléfono.</div></div>' +
      '<div class="item"><div class="emoji">4</div><div class="grow" style="white-space:normal">Listo: lo que apunte uno aparece al instante en el móvil del otro.</div></div></div>');
  }

  async function exportCsv() {
    const rows = [["fecha", "tipo", "concepto", "importe", "categoria", "pagó", "reparto", "nota"]].concat(S.txns.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).map((t) => [t.date, { expense: "Gasto", income: "Ingreso", settle: "Pago entre vosotros" }[t.kind], t.desc, C.toInput(t.amount), (catOf(t.cat) || {}).name || "", nameOf(t.paidBy), t.kind === "expense" ? (t.split === "custom" ? t.pct + "/" + (100 - t.pct) : (SPLITS[t.split] || [""])[0]) : t.kind === "settle" ? "a " + nameOf(t.to) : "", t.note || ""]));
    const text = C.toCsv(rows);
    let dl = null; try { dl = await window.claude.use("downloads"); } catch (e) { dl = null; }
    if (dl) { try { await dl.save({ filename: "nuestra-caja.csv", data: "﻿" + text }); return; } catch (e) { return; } }
    openSheet(head("Exportar") + '<div class="dim">La descarga no está disponible aquí. Copia el contenido y pégalo en un archivo .csv:</div><textarea class="inp" style="min-height:220px;font-size:12px" readonly>' + esc(text) + "</textarea>");
  }

  /* ---------- Lista de la compra ---------- */
  function viewShop() {
    const open = S.shop.filter((i) => !i.done).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    const done = S.shop.filter((i) => i.done).sort((a, b) => ((a.doneAt || "") < (b.doneAt || "") ? -1 : 1));
    const sugg = C.shopSuggestions(S.shop, S.shopFreq, 10);
    const row = (i) => '<div class="shopitem' + (i.done ? " done" : "") + '"><button class="check ' + (i.done ? pcls(i.doneBy) : "") + '" data-act="shop-toggle" data-id="' + esc(i.id) + '" aria-label="' + (i.done ? "Desmarcar " : "Marcar ") + esc(i.text) + '" aria-pressed="' + !!i.done + '">' + (i.done ? icon("check") : "") + '</button><div class="grow"><div class="t1">' + esc(i.text) + '</div><div class="t2"><i class="dot ' + pcls(i.by) + '"></i>' + esc(nameOf(i.by, { self: true })) + (i.done && i.doneBy ? " · lo cogió " + esc(nameOf(i.doneBy, { self: true })) : "") + '</div></div><button class="icon-btn" data-act="shop-del" data-id="' + esc(i.id) + '" aria-label="Quitar ' + esc(i.text) + '">' + icon("x") + "</button></div>";
    let h = '<section class="card"><h2>Lista de la compra<span class="sp"></span><span class="dim" style="font-weight:500">compartida en vivo</span></h2>' +
      '<div class="row" style="flex-wrap:nowrap"><input class="inp" id="shopIn" maxlength="60" placeholder="Leche, pan, detergente…" autocomplete="off" enterkeyhint="done" aria-label="Añadir a la lista"><button class="btn primary" data-act="shop-add" aria-label="Añadir">' + icon("plus") + "</button></div>" +
      (sugg.length ? '<div class="chips" style="margin-top:10px">' + sugg.map((x) => '<button class="chip" data-act="shop-sugg" data-v="' + esc(x) + '">+ ' + esc(x) + "</button>").join("") + "</div>" : "") + "</section>";
    if (!open.length && !done.length) return h + '<section class="card"><div class="empty"><div class="e">🛒</div><b>La lista está vacía</b><p>Apuntad lo que falta en casa. Cuando uno vaya al súper, el otro verá en directo lo que va cogiendo.</p></div></section>';
    h += '<section class="card"><h2>Por comprar<span class="sp"></span><span class="tag">' + open.length + "</span></h2>" + (open.length ? '<div class="list">' + open.map(row).join("") + "</div>" : '<div class="dim" style="font-size:13.5px">¡Todo en el carrito! 🎉</div>') + "</section>";
    if (done.length) h += '<section class="card"><h2>En el carrito<span class="sp"></span><span class="tag accent">' + done.length + '</span></h2><div class="list">' + done.map(row).join("") + '</div><div class="row" style="margin-top:12px;flex-wrap:nowrap"><button class="btn primary" style="flex:1" data-act="shop-finish">' + icon("check") + 'Terminar compra</button><button class="btn" data-act="shop-clear">Quitar tachados</button></div></section>';
    return h;
  }
  async function shopAdd(text) {
    const v = String(text || "").trim().slice(0, 60);
    if (!v) return;
    if (S.shop.some((i) => !i.done && i.text.trim().toLowerCase() === v.toLowerCase())) { toast("«" + v + "» ya está en la lista"); return; }
    await save(() => col("shop").doc().set({ text: v, by: S.uid, done: false, createdAt: nowIso() }));
  }
  function shopFinishSheet() {
    const done = S.shop.filter((i) => i.done);
    const sup = S.cats.find((c) => /super/i.test(c.name)) || S.cats[0];
    txnSheet(null, { desc: "Compra del súper", cat: sup && sup.id, paidBy: S.uid, split: "half", note: done.map((i) => i.text).join(", ").slice(0, 140), fromShop: true });
  }

  /* ---------- Logros ---------- */
  function checkAchievements() {
    if (!S.uid || members().length < 2 || !S.loaded.txns || !S.loaded.notes || !S.loaded.contribs || !S.loaded.goals) return;
    const unlocked = achList().filter((a) => a.unlocked);
    let seen = null; try { seen = JSON.parse(store.get("ach") || "null"); } catch (e) { seen = null; }
    if (!Array.isArray(seen)) { store.set("ach", JSON.stringify(unlocked.map((a) => a.id))); return; } // primera vez en este móvil: sin fuegos artificiales
    const fresh = unlocked.filter((a) => !seen.includes(a.id));
    if (!fresh.length) return;
    store.set("ach", JSON.stringify(seen.concat(fresh.map((a) => a.id))));
    setTimeout(() => { confetti(); toast("🏆 Logro desbloqueado: " + fresh.map((a) => a.emoji + " " + a.title).join(" · ")); }, 300);
  }
  function achievementsSheet() {
    const list = achList();
    openSheet(head("Logros · " + list.filter((a) => a.unlocked).length + " de " + list.length) + '<div class="achgrid">' + list.map((a) => '<div class="ach' + (a.unlocked ? " on" : "") + '"><span class="e">' + esc(a.emoji) + "</span><b>" + esc(a.title) + "</b><small>" + esc(a.desc) + '</small><div class="bar"><i style="width:' + a.progress * 100 + '%"></i></div></div>').join("") + "</div>");
  }

  /* ---------- Confeti ---------- */
  function confetti() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const c = document.createElement("canvas"); c.className = "confetti"; document.body.appendChild(c);
    const ctx = c.getContext && c.getContext("2d"); if (!ctx) { c.remove(); return; }
    const W = (c.width = innerWidth), H = (c.height = innerHeight);
    const cs = getComputedStyle(document.documentElement), cols = ["--accent", "--p1", "--p2", "--warn"].map((v) => cs.getPropertyValue(v).trim() || "#0d7a64");
    const P = Array.from({ length: 110 }, () => ({ x: W / 2 + (Math.random() - 0.5) * 80, y: H * 0.35, vx: (Math.random() - 0.5) * 11, vy: -Math.random() * 11 - 4, r: Math.random() * 6 + 3, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.3, col: cols[Math.floor(Math.random() * cols.length)] }));
    let f = 0;
    (function tick() {
      ctx.clearRect(0, 0, W, H);
      P.forEach((p) => { p.vy += 0.32; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.col; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore(); });
      if (++f < 150) requestAnimationFrame(tick); else c.remove();
    })();
  }

  /* ---------- Historia del mes ---------- */
  function openStory(mk) {
    const st = C.story({ people: people(), txns: S.txns, notes: S.notes, contribs: S.contribs }, mk);
    const [a, b] = members(), M = (x) => esc(money(x)), mn = monthLabel(mk, true);
    const count = (cents) => '<span class="count" data-to="' + cents + '">' + M(cents) + "</span>";
    const slides = [];
    slides.push({ bg: "s1", html: '<small class="kicker">Vuestro resumen</small><h1>' + esc(cap(monthLabel(mk))) + '</h1><p class="lead">' + esc(nameOf(a)) + " & " + esc(nameOf(b)) + "</p><p>" + st.count + (st.count === 1 ? " gasto apuntado" : " gastos apuntados") + " en " + st.days + (st.days === 1 ? " día" : " días") + ".</p>" });
    slides.push({ bg: "s2", html: '<small class="kicker">En ' + esc(mn) + ' gastasteis</small><div class="mega">' + count(st.total) + "</div>" + (st.delta === null ? "<p>Es vuestro primer mes con datos. ¡Buen comienzo!</p>" : '<p class="lead">' + (st.delta <= 0 ? "Un " + Math.abs(Math.round(st.delta)) + " % menos que el mes anterior 🎉" : "Un " + Math.round(st.delta) + " % más que el mes anterior") + "</p><p>El mes pasado: " + M(st.prevTotal) + "</p>") });
    if (st.topCat) { const c = catOf(st.topCat.cat); slides.push({ bg: "s3", html: '<small class="kicker">Vuestra categoría estrella</small><div class="giant">' + esc(c ? c.emoji : "📦") + "</div><h1>" + esc(c ? c.name : "Sin categoría") + '</h1><p class="lead">' + M(st.topCat.amount) + " · " + Math.round(st.topCat.pct) + " % del total</p>" }); }
    if (a && b) { const pa = st.paid[a] || 0, pb = st.paid[b] || 0, mx = Math.max(1, pa, pb), bal = C.balance(S.txns, a, b);
      slides.push({ bg: "s4", html: '<small class="kicker">¿Quién pagó más?</small>' + [[a, pa], [b, pb]].map(([id, v]) => '<div class="vs"><div class="vs-n"><b>' + esc(nameOf(id)) + "</b><span>" + M(v) + '</span></div><div class="vs-bar"><i class="' + pcls(id) + '" style="width:' + (v / mx) * 100 + '%"></i></div></div>').join("") + '<p class="lead" style="margin-top:22px">' + (bal === 0 ? "Y ahora mismo estáis en paz 🤝" : esc(nameOf(bal > 0 ? b : a)) + " le debe " + M(Math.abs(bal)) + " a " + esc(nameOf(bal > 0 ? a : b))) + "</p>" }); }
    if (st.biggest) slides.push({ bg: "s5", html: '<small class="kicker">El gasto más grande</small><h1>' + esc(st.biggest.desc) + '</h1><div class="mega">' + count(st.biggest.amount) + "</div>" + (st.topDay ? "<p>Y el día más intenso fue el " + esc(C.parseYmd(st.topDay.date).toLocaleDateString("es-ES", { weekday: "long", day: "numeric" })) + ", con " + M(st.topDay.amount) + ".</p>" : "") });
    if (st.love) { const rx = Object.values(st.love.reactions || {}), nc = S.notes.filter((n) => n.txnId === st.love.id).length; slides.push({ bg: "s6", html: '<small class="kicker">El gasto que más dio que hablar</small><h1>' + esc(st.love.desc) + '</h1><div class="giant" style="font-size:54px">' + esc(rx.join(" ") || "💬") + "</div><p>" + (nc ? nc + (nc === 1 ? " comentario" : " comentarios") : "") + (nc && rx.length ? " y " : "") + (rx.length ? rx.length + (rx.length === 1 ? " reacción" : " reacciones") : "") + "</p>" }); }
    const ach = achList().filter((x) => x.unlocked);
    if (st.saved > 0 || ach.length) slides.push({ bg: "s7", html: '<small class="kicker">Juntos</small>' + (st.saved > 0 ? "<h1>Apartasteis " + M(st.saved) + "</h1><p>en vuestras huchas este mes.</p>" : "<h1>Vuestros logros</h1>") + (ach.length ? '<div class="giant" style="font-size:40px;letter-spacing:6px">' + esc(ach.map((x) => x.emoji).join("")) + "</div><p>" + ach.length + " de 12 logros desbloqueados.</p>" : "") });
    slides.push({ bg: "s8", html: '<small class="kicker">Fin</small><h1>Gracias por apuntar juntos</h1><p class="lead">Las cuentas claras y el cariño, a medias. 💛</p><div class="story-actions"><button class="btn" data-act="story-close">Cerrar</button><button class="btn primary" data-act="story-list">Ver movimientos</button></div>' });

    const root = document.createElement("div");
    root.className = "story"; root.setAttribute("role", "dialog"); root.setAttribute("aria-label", "Historia de " + monthLabel(mk));
    root.innerHTML = '<div class="bars">' + slides.map(() => "<span><i></i></span>").join("") + '</div><button class="story-x" data-act="story-close" aria-label="Cerrar">' + icon("x") + '</button><div class="slides">' + slides.map((sl, i) => '<section class="slide ' + sl.bg + '" data-i="' + i + '"><div class="slide-in">' + sl.html + "</div></section>").join("") + '</div><button class="tapzone left" aria-label="Anterior" data-act="story-prev"></button><button class="tapzone right" aria-label="Siguiente" data-act="story-next"></button>';
    document.body.appendChild(root); document.body.style.overflow = "hidden";
    const DUR = 5500, reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let i = 0, t0 = performance.now(), paused = false, pauseAt = 0, raf = 0;
    const show = (k) => {
      i = Math.max(0, Math.min(slides.length - 1, k)); t0 = performance.now();
      root.querySelectorAll(".slide").forEach((el, j) => el.classList.toggle("on", j === i));
      root.classList.toggle("last", i === slides.length - 1);
      root.querySelectorAll(".bars i").forEach((el, j) => (el.style.width = j < i ? "100%" : "0%"));
      root.querySelectorAll(".slide.on .count").forEach((el) => { const to = Number(el.dataset.to); if (reduce) return; const st0 = performance.now(); (function up(now) { const p = Math.min(1, (now - st0) / 900), e = 1 - Math.pow(1 - p, 3); el.textContent = money(Math.round(to * e)); if (p < 1 && root.isConnected) requestAnimationFrame(up); })(st0); });
    };
    const loop = (now) => {
      if (!root.isConnected) return;
      if (!paused) { const p = (now - t0) / DUR; const bar = root.querySelectorAll(".bars i")[i]; if (bar) bar.style.width = Math.min(100, p * 100) + "%"; if (p >= 1) { if (i < slides.length - 1) show(i + 1); else paused = true; } }
      raf = requestAnimationFrame(loop);
    };
    S.story = { next: () => (i < slides.length - 1 ? show(i + 1) : closeStory()), prev: () => show(i - 1), close: closeStory };
    function closeStory() { cancelAnimationFrame(raf); root.remove(); document.body.style.overflow = ""; S.story = null; }
    root.addEventListener("pointerdown", (e) => { if (e.target.closest("button:not(.tapzone)")) return; paused = true; pauseAt = performance.now(); });
    root.addEventListener("pointerup", () => { if (paused && i < slides.length - 1) { t0 += performance.now() - pauseAt; paused = false; } });
    show(0); raf = requestAnimationFrame(loop);
  }

  /* ---------- Eventos ---------- */
  document.addEventListener("click", async (ev) => {
    const el = ev.target.closest("[data-act]"); if (!el) return;
    const act = el.dataset.act, id = el.dataset.id;
    if (act === "close-bg" && ev.target !== el) return;
    switch (act) {
      case "view": S.view = el.dataset.v; closeSheet(); render(); window.scrollTo(0, 0); break;
      case "view-savings": S.view = "savings"; render(); window.scrollTo(0, 0); break;
      case "achievements": achievementsSheet(); break;
      case "story": openStory(el.dataset.v || S.month); break;
      case "story-next": if (S.story) S.story.next(); break;
      case "story-prev": if (S.story) S.story.prev(); break;
      case "story-close": if (S.story) S.story.close(); break;
      case "story-list": if (S.story) S.story.close(); S.view = "list"; render(); break;
      case "react": { const t = S.txns.find((x) => x.id === id); if (!t) break; const r = Object.assign({}, t.reactions || {}); if (r[S.uid] === el.dataset.v) delete r[S.uid]; else r[S.uid] = el.dataset.v; t.reactions = r; if (S.drawSocial) S.drawSocial(); buzz(8); await save(() => col("txns").doc(t.id).set(clean(Object.assign({}, t, { reactions: r })))); break; }
      case "note-send": { const inp = $("#noteIn"); const text = inp && inp.value.trim(); const tid = S.sheetTxn; if (!text || !tid) break; inp.value = ""; await save(() => col("notes").doc().set({ txnId: tid, by: S.uid, text: text.slice(0, 200), at: nowIso() })); break; }
      case "note-del": await save(() => col("notes").doc(id).delete()); break;
      case "shop-add": { const inp = $("#shopIn"); const v = inp.value; inp.value = ""; await shopAdd(v); const again = $("#shopIn"); if (again) again.focus(); break; }
      case "shop-sugg": await shopAdd(el.dataset.v); break;
      case "shop-toggle": { const it = S.shop.find((x) => x.id === id); if (!it) break; buzz(8); await save(() => col("shop").doc(id).set(clean(Object.assign({}, it, it.done ? { done: false, doneBy: null, doneAt: null } : { done: true, doneBy: S.uid, doneAt: nowIso() })))); break; }
      case "shop-del": await save(() => col("shop").doc(id).delete()); break;
      case "shop-clear": { const done = S.shop.filter((i) => i.done); if (await save(async () => { await S.db.doc("settings/shop").set({ freq: C.bumpFreq(S.shopFreq, done.map((i) => i.text)) }); for (const i of done) await col("shop").doc(i.id).delete(); }, "Lista limpia")) render(); break; }
      case "shop-finish": shopFinishSheet(); break;
      case "invite-code": case "copy-invite": { const link = HOST.inviteLink || ""; try { await navigator.clipboard.writeText(link); toast("Enlace copiado. Mándaselo por WhatsApp."); } catch (e) { toast("Código: " + (HOST.inviteCode || "")); } break; }
      case "install": if (HOST.install) await HOST.install(); break;
      case "logout": if (HOST.logout) await HOST.logout(); break;

      case "month": S.month = C.addMonths(S.month, Number(el.dataset.d)); render(); break;
      case "close": case "close-bg": closeSheet(); break;
      case "add": if (!S.cats.length) { toast("Primero crea las categorías desde Inicio."); S.view = "home"; render(); break; } txnSheet(null); break;
      case "edit": { const t = S.txns.find((x) => x.id === id); if (!t) break; if (t.kind === "settle") { openSheet(head("Pago entre vosotros") + '<div class="note">' + icon("swap") + "<div>" + esc(nameOf(t.paidBy, { self: true })) + " pagó " + esc(money(t.amount)) + " a " + esc(nameOf(t.to, { self: true })) + " el " + esc(C.parseYmd(t.date).toLocaleDateString("es-ES", { day: "numeric", month: "long" })) + '.</div></div><button class="btn danger block" data-act="txn-del">Eliminar este pago</button>', () => { S.sheetDel = async () => { const copy = clean(t); if (await save(() => col("txns").doc(t.id).delete())) { closeSheet(); toast("Pago eliminado", async () => save(() => col("txns").doc(t.id).set(copy), "Recuperado")); } }; }); break; } txnSheet(t); break; }
      case "txn-save": case "settle-save": case "goal-save": case "contrib-save": case "fixed-save": case "budget-save": if (S.sheetSave) { el.disabled = true; await S.sheetSave(); el.disabled = false; } break;
      case "txn-del": case "goal-del": case "contrib-del": case "fixed-del": if (S.sheetDel) await S.sheetDel(); break;
      case "undo": if (S.undo) { const u = S.undo; S.undo = null; clearTimeout(toastTimer); toastTimer = 0; toastQ.length = 0; $("#toastRoot").innerHTML = ""; await u(); } break;
      case "settle": settleSheet(); break;
      case "filter": S.filter = el.dataset.v; render(); break;
      case "who": S.who = S.who === el.dataset.v ? "" : el.dataset.v; render(); break;
      case "goal": goalSheet(S.goals.find((g) => g.id === id)); break;
      case "contrib": contribSheet(id); break;
      case "contrib-edit": { const c = S.contribs.find((x) => x.id === id); if (c) contribSheet(c.goalId, c); break; }
      case "fixed": fixedSheet(); break;
      case "fixed-new": fixedForm(null); break;
      case "fixed-edit": fixedForm(S.fixed.find((f) => f.id === id)); break;
      case "fixed-log": { const f = S.fixed.find((x) => x.id === id); if (!f) break; const st = C.fixedStatus([f], S.txns, S.month)[0]; txnSheet(null, { desc: f.desc, amount: f.amount, cat: f.cat, paidBy: f.paidBy, split: f.split, date: st.due > today() && S.month === today().slice(0, 7) ? today() : st.due, fixedId: f.id }); break; }
      case "budget": budgetSheet(); break;
      case "cats": catsSheet(); break;
      case "cat-add": { const r = $("#sheetRoot"); const name = $("#nname", r).value.trim(); if (!name) break; if (S.cats.some((c) => c.name.toLowerCase() === name.toLowerCase())) { toast("Ya existe esa categoría"); break; } if (await save(() => col("cats").doc().set({ name, emoji: $("#nem", r).value.trim() || "📦", order: S.cats.length + 1 }), "Categoría añadida")) setTimeout(catsSheet, 250); break; }
      case "cat-del": if (await save(() => col("cats").doc(id).delete(), "Categoría eliminada")) setTimeout(catsSheet, 250); break;
      case "cats-save": { const r = $("#sheetRoot"); const ok = await save(async () => { for (const c of S.cats) { const name = ($('[data-cname="' + c.id + '"]', r) || {}).value, emoji = ($('[data-cem="' + c.id + '"]', r) || {}).value; if (name === undefined) continue; if ((name.trim() && name.trim() !== c.name) || (emoji.trim() && emoji.trim() !== c.emoji)) await col("cats").doc(c.id).set(clean(Object.assign({}, c, { name: name.trim() || c.name, emoji: emoji.trim() || c.emoji }))); } }, "Categorías guardadas"); if (ok) closeSheet(); break; }
      case "names": namesSheet(); break;
      case "names-save": { const list = people().map((p) => { const el = $('[data-name="' + p.id + '"]'); return { id: p.id, name: ((el && el.value) || "").trim() || p.name }; }); if (await save(() => S.db.doc("settings/main").set(clean(Object.assign({}, S.settings, { people: list }))), "Nombres guardados")) closeSheet(); break; }
      case "iam": S.uid = el.dataset.v; store.set("me", S.uid); closeSheet(); toast("Hola, " + nameOf(S.uid) + ". Este móvil queda a tu nombre."); render(); break;
      case "setup": { const n1 = $("#n1").value.trim(), n2 = $("#n2").value.trim(); if (!n1 || !n2) { $("#serr").textContent = "Escribid los dos nombres."; break; }
        const me = HOST.person || "p1";
        const ok = await save(async () => { await S.db.doc("settings/main").set(clean(Object.assign({}, S.settings, { people: me === "p1" ? [{ id: "p1", name: n1 }, { id: "p2", name: n2 }] : [{ id: "p1", name: n2 }, { id: "p2", name: n1 }] }))); if (!S.cats.length) for (let i = 0; i < DEFAULT_CATS.length; i++) await col("cats").doc().set({ emoji: DEFAULT_CATS[i][0], name: DEFAULT_CATS[i][1], order: i + 1 }); });
        if (ok) { S.uid = me; store.set("me", me); toast(HOST.lockPerson ? "¡Listo, " + n1 + "! Ya podéis apuntar gastos los dos." : "¡Listo, " + n1 + "! En el móvil de " + n2 + " elegirá su nombre al abrirla."); render(); } break; }
      case "settings": settingsSheet(); break;
      case "settings-save": if (await save(() => S.db.doc("settings/main").set(clean(Object.assign({}, S.settings, { title: $("#stitle").value.trim() || null, currency: $("#scur").value }))), "Guardado")) closeSheet(); break;
      case "invite": inviteSheet(); break;
      case "push": pushSheet(); break;
      case "push-on": pushAct("on"); break;
      case "push-off": pushAct("off"); break;
      case "push-pref": pushAct("pref", el.dataset.v); break;
      case "push-test": pushAct("test"); break;
      case "export": await exportCsv(); break;
      case "wipe": openSheet(head("Borrar todos los movimientos") + '<div class="note warn">' + icon("info") + '<div>Se borrarán los ' + S.txns.length + ' movimientos de los dos. Las huchas, categorías y gastos fijos se conservan. No se puede deshacer.</div></div><label class="field"><span>Escribe BORRAR para confirmar</span><input class="inp" id="wipeok" autocomplete="off"></label><button class="btn danger block" data-act="wipe-ok">Borrar definitivamente</button>'); break;
      case "wipe-ok": if ($("#wipeok").value !== "BORRAR") { toast("Escribe BORRAR para confirmar"); break; } if (await save(async () => { for (const t of S.txns.slice()) await col("txns").doc(t.id).delete(); }, "Movimientos borrados")) closeSheet(); break;
      case "seed": if (await save(async () => { for (let i = 0; i < DEFAULT_CATS.length; i++) await col("cats").doc().set({ emoji: DEFAULT_CATS[i][0], name: DEFAULT_CATS[i][1], order: i + 1 }); }, "¡Listo! Ya podéis añadir gastos")) render(); break;
    }
  });
  let qTimer = 0;
  document.addEventListener("input", (e) => {
    if (e.target.id === "q") { clearTimeout(qTimer); qTimer = setTimeout(() => { S.q = e.target.value; render(); const q = $("#q"); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 220); }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && S.story) { S.story.close(); return; }
    if (e.key === "ArrowRight" && S.story) { S.story.next(); return; }
    if (e.key === "ArrowLeft" && S.story) { S.story.prev(); return; }
    if (e.key === "Enter" && e.target.id === "shopIn") { e.preventDefault(); $('[data-act="shop-add"]').click(); return; }
    if (e.key === "Enter" && e.target.id === "noteIn") { e.preventDefault(); $('[data-act="note-send"]').click(); return; }
    if (e.key === "Escape" && $("#sheetRoot").innerHTML) closeSheet();
    if (e.key === "Enter" && e.target.closest && e.target.closest(".sheet") && e.target.tagName === "INPUT" && S.sheetSave && $("#sheetRoot .btn.primary")) { e.preventDefault(); $("#sheetRoot .btn.primary").click(); }
  });
  // Al cerrar una hoja, olvidar sus acciones
  new MutationObserver(() => { if (!$("#sheetRoot").innerHTML) { S.sheetSave = null; S.sheetDel = null; } }).observe($("#sheetRoot"), { childList: true });
  boot();
})();
