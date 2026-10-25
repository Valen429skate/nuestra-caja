/* Nuestra Caja — arranque de la app propia: configuración, cuenta, caja de pareja e instalación (PWA). */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ls = { get(k) { try { return localStorage.getItem("caja." + k); } catch (e) { return null; } }, set(k, v) { try { if (v === null) localStorage.removeItem("caja." + k); else localStorage.setItem("caja." + k, v); } catch (e) { /* sin almacenamiento */ } } };
  const main = () => $("#main");
  const SITE = location.origin + location.pathname.replace(/index\.html$/, "");

  const isRecovery = /type=recovery/.test(location.hash);

  /* ---------- Parámetros del enlace de invitación (#join=CODIGO&u=URL&k=CLAVE) ---------- */
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  if (hash.get("join")) ls.set("pendingJoin", hash.get("join").toUpperCase());
  if (hash.get("u") && hash.get("k")) { ls.set("url", hash.get("u")); ls.set("key", hash.get("k")); }
  if (hash.get("join") || hash.get("u")) history.replaceState(null, "", location.pathname + location.search);

  function config() {
    const c = window.CAJA_CONFIG || {};
    return { url: c.supabaseUrl || ls.get("url"), key: c.supabaseAnonKey || ls.get("key") };
  }

  /* ---------- Instalación (PWA) ---------- */
  let installEvt = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; });
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standaloneMode = () => (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;

  /* ---------- Pantallas ---------- */
  function screen(html) { $("#tabs").innerHTML = ""; $("#top").innerHTML = '<div class="brand">Nuestra Caja<small>Vuestras cuentas, en vivo</small></div>'; main().innerHTML = html; }
  const card = (inner) => '<section class="card hero" style="display:grid;gap:14px">' + inner + "</section>";
  const errBox = '<div class="err" id="err" role="alert"></div>';
  const showErr = (m) => { const e = $("#err"); if (e) e.textContent = m; };
  const busy = (btn, on) => { if (!btn) return; btn.disabled = on; if (on) { btn.dataset.t = btn.textContent; btn.textContent = "Un momento…"; } else if (btn.dataset.t) btn.textContent = btn.dataset.t; };

  function configScreen() {
    const step = (n, title, body) => '<div class="item" style="align-items:flex-start;border-bottom:1px solid var(--line)"><div class="emoji" style="font-weight:700">' + n + '</div><div class="grow" style="white-space:normal;display:grid;gap:8px"><b>' + title + "</b>" + body + "</div></div>";
    screen('<section class="card hero" style="display:grid;gap:6px"><div class="empty" style="padding:6px 0 4px"><div class="e">🛠️</div><b>Preparar vuestra caja (solo la primera vez)</b><p>Lo hace una sola persona, unos 5–10 minutos. Laura no tendrá que hacer nada de esto.</p></div><div class="list">' +
      step(1, "Crea tu base de datos gratis", '<span class="dim" style="font-size:13px">Regístrate en Supabase y pulsa <b>New project</b>. Nombre: <i>nuestra-caja</i>. Región: <i>Europe (Ireland o Frankfurt)</i>. Contraseña: pulsa <i>Generate</i>. Espera 1–2 min a que termine.</span><a class="btn sm" href="https://supabase.com/dashboard/new" target="_blank" rel="noopener">Abrir Supabase ↗</a>') +
      step(2, "Prepara la base de datos", '<span class="dim" style="font-size:13px">En Supabase abre <b>SQL Editor</b> (menú ☰) → <b>New query</b>, pega lo que copias aquí y pulsa <b>Run</b>. Debe decir <i>Success</i>.</span><button class="btn sm primary" id="copySql">Copiar código de la base de datos</button>') +
      step(3, "Di a Supabase cuál es vuestra app", '<span class="dim" style="font-size:13px">En Supabase: <b>Authentication → URL Configuration</b>. Pega esto en <b>Site URL</b> y pulsa <b>Save</b>.</span><button class="btn sm" id="copySite">Copiar enlace de la app</button><span class="dim" style="font-size:12px">Opcional para ir más rápido: <b>Authentication → Sign In / Providers → Email</b> → desactiva <i>Confirm email</i>. Así no hace falta confirmar el correo.</span>') +
      step(4, "Conecta la app", '<span class="dim" style="font-size:13px">En Supabase: <b>Project Settings → API Keys</b> (o <i>Data API</i>). Copia y pega aquí:</span>' +
        '<label class="field"><span>Project URL</span><input class="inp" id="cu" placeholder="https://xxxx.supabase.co" autocomplete="off" inputmode="url"></label>' +
        '<label class="field"><span>Clave pública (anon / publishable)</span><input class="inp" id="ck" placeholder="eyJ… o sb_publishable_…" autocomplete="off"></label>' +
        '<span class="dim" style="font-size:12px">Nunca la clave <i>service_role</i> ni <i>secret</i>.</span>' + errBox + '<button class="btn primary block" id="csave" style="height:50px">Conectar y empezar</button>') +
      "</div></section>");
    const copy = async (text, btn, label) => { try { await navigator.clipboard.writeText(text); btn.textContent = "✓ Copiado"; } catch (e) { const ta = document.createElement("textarea"); ta.value = text; ta.className = "inp"; ta.style.minHeight = "140px"; ta.readOnly = true; btn.replaceWith(ta); ta.focus(); ta.select(); return; } setTimeout(() => (btn.textContent = label), 2500); };
    $("#copySql").onclick = async (e) => { const b = e.currentTarget; b.textContent = "Cargando…"; try { const r = await fetch("supabase.sql", { cache: "no-store" }); if (!r.ok) throw new Error(); copy(await r.text(), b, "Copiar código de la base de datos"); } catch (_) { b.textContent = "No se pudo cargar: recarga la página"; } };
    $("#copySite").onclick = (e) => copy(SITE, e.currentTarget, "Copiar enlace de la app");
    $("#csave").onclick = async () => {
      const u = $("#cu").value.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, ""), k = $("#ck").value.trim();
      if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(u)) return showErr("La URL debe ser como https://xxxx.supabase.co");
      if (k.length < 20) return showErr("Pega la clave pública completa.");
      let secret = /service_role|sb_secret_/i.test(k);
      try { if (k.startsWith("eyJ")) secret = secret || /service_role/.test(atob(k.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); } catch (e) { /* formato nuevo */ }
      if (secret) return showErr("Esa es la clave secreta. Usa la pública (anon / publishable).");
      busy($("#csave"), true);
      try {
        const test = window.supabase.createClient(u, k, { auth: { persistSession: false } });
        const { error } = await test.from("docs").select("id").limit(1);
        if (error && /does not exist|schema cache|relation/i.test(error.message || "")) { busy($("#csave"), false); return showErr("Conectado, pero falta el paso 2: ejecuta el código de la base de datos en el SQL Editor."); }
        if (error && /Invalid API key|JWT|apikey/i.test(error.message || "")) { busy($("#csave"), false); return showErr("La clave no es válida para ese proyecto. Revisa que sea la pública de este proyecto."); }
      } catch (e) { busy($("#csave"), false); return showErr("No se pudo conectar con esa URL. Revisa que esté bien copiada."); }
      ls.set("url", u); ls.set("key", k); location.reload();
    };
  }

  function authScreen(sb, mode) {
    const signup = mode === "signup";
    const pending = ls.get("pendingJoin");
    screen(card('<div class="empty" style="padding:6px 0 0"><div class="e">' + (pending ? "💌" : "👋") + "</div><b>" + (pending ? "Tu pareja te ha invitado" : signup ? "Crea tu cuenta" : "Entra en vuestra caja") + "</b><p>" + (pending ? "Crea tu cuenta (o entra si ya tienes) y te unirás a vuestra caja compartida." : "Cada uno con su propio correo y contraseña.") + "</p></div>" +
      '<div class="seg"><button type="button" id="tIn" class="' + (signup ? "" : "on") + '">Entrar</button><button type="button" id="tUp" class="' + (signup ? "on" : "") + '">Crear cuenta</button></div>' +
      '<label class="field"><span>Correo</span><input class="inp" id="em" type="email" autocomplete="email" inputmode="email" value="' + esc(ls.get("lastEmail") || "") + '"></label>' +
      '<label class="field"><span>Contraseña</span><input class="inp" id="pw" type="password" autocomplete="' + (signup ? "new-password" : "current-password") + '"' + (signup ? ' placeholder="Mínimo 8 caracteres"' : "") + "></label>" + errBox +
      '<button class="btn primary block" id="go" style="height:50px">' + (signup ? "Crear cuenta" : "Entrar") + "</button>" +
      (signup ? "" : '<button class="btn ghost block" id="forgot">He olvidado mi contraseña</button>')));
    $("#tIn").onclick = () => authScreen(sb, "login");
    $("#tUp").onclick = () => authScreen(sb, "signup");
    const go = async () => {
      const email = $("#em").value.trim().toLowerCase(), pw = $("#pw").value;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return showErr("Escribe un correo válido.");
      if (signup && pw.length < 8) return showErr("La contraseña debe tener al menos 8 caracteres.");
      if (!pw) return showErr("Escribe tu contraseña.");
      ls.set("lastEmail", email);
      busy($("#go"), true);
      try {
        if (signup) {
          const { data, error } = await sb.auth.signUp({ email, password: pw, options: { emailRedirectTo: SITE } });
          if (error) throw error;
          if (!data.session) return screen(card('<div class="empty"><div class="e">📬</div><b>Revisa tu correo</b><p>Te hemos enviado un enlace a <b>' + esc(email) + "</b>. Ábrelo para confirmar la cuenta y vuelve aquí.</p></div>" + '<button class="btn block" id="back">Ya lo he confirmado, entrar</button>')), ($("#back").onclick = () => authScreen(sb, "login"));
        } else {
          const { error } = await sb.auth.signInWithPassword({ email, password: pw });
          if (error) throw error;
        }
        start(sb);
      } catch (e) {
        const m = String((e && e.message) || "");
        showErr(/invalid login/i.test(m) ? "Correo o contraseña incorrectos." : /already registered|already exists/i.test(m) ? "Ese correo ya tiene cuenta: pulsa «Entrar»." : /confirm/i.test(m) ? "Confirma tu correo con el enlace que te enviamos." : /rate|too many/i.test(m) ? "Demasiados intentos. Espera un poco." : /password/i.test(m) ? "La contraseña no es válida (prueba una más larga)." : "No se pudo conectar. Revisa tu conexión.");
      } finally { busy($("#go"), false); }
    };
    $("#go").onclick = go;
    $("#pw").onkeydown = (e) => { if (e.key === "Enter") go(); };
    const f = $("#forgot");
    if (f) f.onclick = async () => {
      const email = $("#em").value.trim();
      if (!email) return showErr("Escribe tu correo y vuelve a pulsar.");
      await sb.auth.resetPasswordForEmail(email, { redirectTo: SITE }).catch(() => {});
      showErr(""); main().querySelector(".card").insertAdjacentHTML("beforeend", '<div class="note accent">Si existe una cuenta con ese correo, te llegará un enlace para cambiar la contraseña.</div>');
    };
  }

  function recoveryScreen(sb) {
    screen(card('<div class="empty" style="padding:6px 0 0"><div class="e">🔑</div><b>Nueva contraseña</b></div><label class="field"><span>Contraseña nueva</span><input class="inp" id="np" type="password" autocomplete="new-password" placeholder="Mínimo 8 caracteres"></label>' + errBox + '<button class="btn primary block" id="ns" style="height:50px">Guardar</button>'));
    $("#ns").onclick = async () => {
      const pw = $("#np").value;
      if (pw.length < 8) return showErr("Mínimo 8 caracteres.");
      busy($("#ns"), true);
      const { error } = await sb.auth.updateUser({ password: pw });
      busy($("#ns"), false);
      if (error) return showErr("No se pudo cambiar. Pide otro enlace.");
      start(sb);
    };
  }

  function householdScreen(sb) {
    const pending = ls.get("pendingJoin");
    screen(card('<div class="empty" style="padding:6px 0 0"><div class="e">🏠</div><b>Vuestra caja</b><p>Uno de los dos la crea y le pasa el enlace al otro.</p></div>' +
      '<button class="btn primary block" id="create" style="height:50px">Crear nuestra caja</button>' +
      '<div class="dim" style="text-align:center;font-size:13px">o</div>' +
      '<label class="field"><span>Tengo el código de mi pareja</span><input class="inp" id="code" maxlength="8" autocomplete="off" autocapitalize="characters" placeholder="ABCD2345" value="' + esc(pending || "") + '" style="text-transform:uppercase;letter-spacing:.15em;font-weight:700"></label>' +
      '<button class="btn block" id="join">Unirme</button>' + errBox +
      '<button class="btn ghost block" id="out">Cerrar sesión</button>'));
    $("#create").onclick = async () => { busy($("#create"), true); const { error } = await sb.rpc("create_household"); busy($("#create"), false); if (error) return showErr("No se pudo crear. ¿Ejecutaste el archivo supabase.sql en tu proyecto?"); start(sb); };
    $("#join").onclick = () => joinWith(sb, $("#code").value);
    $("#out").onclick = async () => { await sb.auth.signOut(); location.reload(); };
  }
  async function joinWith(sb, raw) {
    const code = String(raw || "").trim().toUpperCase();
    if (!/^[A-Z2-9]{8}$/.test(code)) return showErr("El código tiene 8 letras y números.");
    busy($("#join"), true);
    const { error } = await sb.rpc("join_household", { p_code: code });
    busy($("#join"), false);
    if (error) { const m = String(error.message || ""); return showErr(/code_not_found/.test(m) ? "No existe ninguna caja con ese código." : /household_full/.test(m) ? "Esa caja ya tiene a dos personas." : /already_in_household/.test(m) ? "Ya perteneces a otra caja con esta cuenta." : "No se pudo unir. Revisa tu conexión."); }
    ls.set("pendingJoin", null);
    start(sb);
  }

  /* ---------- Arranque ---------- */
  let started = false;
  async function start(sb) {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return authScreen(sb, ls.get("pendingJoin") ? "signup" : "login");
    let hh = null;
    const r = await sb.rpc("my_household");
    if (r.error) { screen(card('<div class="empty"><div class="e">⚠️</div><b>No se pudo conectar con vuestra base de datos</b><p>Comprueba la conexión. Si es la primera vez, asegúrate de haber ejecutado <b>supabase.sql</b> en el SQL Editor de Supabase.</p></div><button class="btn block" onclick="location.reload()">Reintentar</button><button class="btn ghost block" id="reconf">Cambiar la conexión</button>')); $("#reconf").onclick = () => { ls.set("url", null); ls.set("key", null); location.reload(); }; return; }
    hh = r.data;
    if (!hh) { const pending = ls.get("pendingJoin"); if (pending) { householdScreen(sb); return joinWith(sb, pending); } return householdScreen(sb); }
    if (started) return;
    started = true;
    const cfg = config();
    const inviteLink = SITE + "#join=" + hh.code + "&u=" + encodeURIComponent(cfg.url) + "&k=" + encodeURIComponent(cfg.key);
    let pill = null, push = null;
    const db = window.createSupabaseDb(sb, hh.household_id, { onChange: (ev) => { if (push) push.onChange(ev); }, onStatus: (st) => {
      if (st === "live") { if (pill) { pill.remove(); pill = null; } return; }
      setTimeout(() => { if (st === "live") return; if (!pill) { pill = document.createElement("div"); pill.className = "netpill"; document.body.appendChild(pill); } pill.textContent = st === "offline" ? "Sin conexión · guardaremos al volver" : "Reconectando…"; }, 2500);
    } });
    if (window.CajaPush) {
      const settings = () => db.peek("settings", "main") || {};
      const nameOf = (id) => { const p = (Array.isArray(settings().people) ? settings().people : []).find((x) => x.id === id); return (p && p.name) || (id === "p1" ? "Persona 1" : id === "p2" ? "Persona 2" : "Tu pareja"); };
      const fmt = (c) => (window.C && window.C.money ? window.C.money(c, settings().currency || "EUR") : (c / 100).toFixed(2) + " " + (settings().currency || "EUR"));
      push = window.CajaPush.createPush(sb, { householdId: hh.household_id, userId: session.user.id,
        ctx: () => ({ me: hh.person, nameOf, money: fmt, txn: (id) => db.peek("txns", id), goal: (id) => db.peek("goals", id) }) });
      setTimeout(() => push.sync(), 3000);
    }
    window.CAJA_HOST = {
      name: "standalone", person: hh.person, lockPerson: true, inviteCode: hh.code, inviteLink, email: session.user.email, push,
      logout: async () => { await sb.auth.signOut(); location.reload(); },
      canInstall: () => !!installEvt || (isIOS && !standaloneMode()),
      install: async () => {
        if (installEvt) { installEvt.prompt(); await installEvt.userChoice.catch(() => null); installEvt = null; return; }
        if (isIOS) alertSheet("En iPhone: pulsa el botón Compartir de Safari (el cuadrado con la flecha) y elige «Añadir a pantalla de inicio».");
      },
    };
    const downloads = { save: async ({ filename, data }) => { const url = URL.createObjectURL(new Blob([data], { type: "text/csv;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); } };
    window.claude = { use: async (n) => (n === "db" ? db : n === "downloads" ? downloads : null) };
    const s = document.createElement("script"); s.src = "app.js"; document.body.appendChild(s);
  }
  function alertSheet(text) {
    const d = document.createElement("div");
    d.className = "scrim"; d.innerHTML = '<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div><h3>Instalar</h3><div class="note">' + esc(text) + '</div><button class="btn primary block">Entendido</button></div>';
    d.addEventListener("click", (e) => { if (e.target === d || e.target.tagName === "BUTTON") d.remove(); });
    document.body.appendChild(d);
  }

  function boot() {
    const cfg = config();
    if (!cfg.url || !cfg.key) return configScreen();
    if (!window.supabase || !window.supabase.createClient) { screen(card('<div class="empty"><div class="e">⚠️</div><b>No se pudo cargar la app</b><p>Revisa tu conexión y recarga.</p></div>')); return; }
    const sb = window.supabase.createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" } });
    if (isRecovery) return recoveryScreen(sb);
    start(sb).catch(() => screen(card('<div class="empty"><div class="e">📡</div><b>Sin conexión</b><p>No se pudo conectar. Revisa tu conexión y vuelve a intentarlo.</p></div><button class="btn block" onclick="location.reload()">Reintentar</button>')));
  }
  boot();
})();
