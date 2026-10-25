/* Nuestra Caja — lógica pura. Dinero SIEMPRE en céntimos enteros. */
(function (root) {
  "use strict";
  const C = {};
  const pad = (n) => String(n).padStart(2, "0");

  /* ---------- Dinero ---------- */
  C.parseMoney = function (input) {
    if (input === null || input === undefined) return null;
    let s = String(input).trim().replace(/\s|€|\$/g, "");
    if (!s) return null;
    let neg = false;
    if (s[0] === "-") { neg = true; s = s.slice(1); }
    const dec = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
    let ip = s, fp = "";
    if (dec >= 0) {
      const after = s.slice(dec + 1), seps = (s.match(/[.,]/g) || []).length;
      if (seps === 1 && after.length === 3 && s[dec] === ".") ip = s.replace(".", "");
      else { ip = s.slice(0, dec).replace(/[.,]/g, ""); fp = after; }
    }
    if (!/^\d+$/.test(ip || "0") || !/^\d{0,2}$/.test(fp)) return null;
    const c = parseInt(ip || "0", 10) * 100 + parseInt((fp + "00").slice(0, 2), 10);
    if (!Number.isSafeInteger(c)) return null;
    return neg ? -c : c;
  };
  C.toInput = (c) => (c === null || c === undefined ? "" : (c < 0 ? "-" : "") + Math.floor(Math.abs(c) / 100) + "," + pad(Math.abs(c) % 100));
  C.money = (c, cur, opts) => (c === null || c === undefined || isNaN(c) ? "—" : new Intl.NumberFormat("es-ES", Object.assign({ style: "currency", currency: cur || "EUR" }, opts || {})).format(c / 100));
  C.sum = (a, f) => a.reduce((s, x) => s + (f ? f(x) : x), 0);

  /* ---------- Fechas ---------- */
  C.ymd = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  C.parseYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  C.addMonths = (mk, n) => { let [y, m] = mk.split("-").map(Number); m += n; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return y + "-" + pad(m); };
  C.addDays = (s, n) => { const d = C.parseYmd(s); d.setDate(d.getDate() + n); return C.ymd(d); };
  C.daysInMonth = (mk) => { const [y, m] = mk.split("-").map(Number); return new Date(y, m, 0).getDate(); };

  /* ---------- Reparto ----------
     Gasto pagado por P: split "half" (a medias), "mine" (solo de quien paga), "theirs" (todo para el otro),
     "custom" (pct = % que corresponde a quien paga). Devuelve cuánto le corresponde a quien paga y al otro. */
  C.shares = function (t) {
    const a = t.amount;
    if (t.kind !== "expense") return { payer: 0, other: 0 };
    if (t.split === "mine") return { payer: a, other: 0 };
    if (t.split === "theirs") return { payer: 0, other: a };
    if (t.split === "custom") {
      const p = Math.min(100, Math.max(0, Number(t.pct)));
      if (!isFinite(p)) return { payer: Math.floor(a / 2), other: a - Math.floor(a / 2) };
      const payer = Math.round((a * p) / 100);
      return { payer, other: a - payer };
    }
    const payer = Math.floor(a / 2);
    return { payer, other: a - payer };
  };

  /* Saldo entre dos personas: devuelve cuánto le debe B a A (negativo: A le debe a B). */
  C.balance = function (txns, a, b) {
    let owedToA = 0;
    for (const t of txns) {
      if (t.deleted) continue;
      if (t.kind === "expense") {
        const s = C.shares(t);
        if (t.paidBy === a) owedToA += s.other;
        else if (t.paidBy === b) owedToA -= s.other;
      } else if (t.kind === "settle") {
        // B le paga a A -> la deuda de B baja
        if (t.paidBy === b && t.to === a) owedToA -= t.amount;
        else if (t.paidBy === a && t.to === b) owedToA += t.amount;
      }
    }
    return owedToA;
  };

  /* ---------- Resumen de un mes ---------- */
  C.monthTxns = (txns, mk) => txns.filter((t) => !t.deleted && t.date && t.date.slice(0, 7) === mk);
  C.summary = function (txns, mk, members) {
    const list = C.monthTxns(txns, mk);
    const exp = list.filter((t) => t.kind === "expense");
    const byCat = {}, paid = {}, consumed = {}, income = {};
    members.forEach((m) => { paid[m] = 0; consumed[m] = 0; income[m] = 0; });
    let shared = 0, personal = 0;
    for (const t of exp) {
      byCat[t.cat || "_"] = (byCat[t.cat || "_"] || 0) + t.amount;
      paid[t.paidBy] = (paid[t.paidBy] || 0) + t.amount;
      const s = C.shares(t), other = members.find((m) => m !== t.paidBy);
      consumed[t.paidBy] = (consumed[t.paidBy] || 0) + s.payer;
      if (other) consumed[other] = (consumed[other] || 0) + s.other;
      if (t.split === "mine") personal += t.amount; else shared += t.amount;
    }
    list.filter((t) => t.kind === "income").forEach((t) => { income[t.paidBy] = (income[t.paidBy] || 0) + t.amount; });
    const total = C.sum(exp, (t) => t.amount), totalIncome = C.sum(Object.values(income));
    return { total, shared, personal, byCat, paid, consumed, income, totalIncome, count: exp.length };
  };
  C.history = (txns, mk, n) => Array.from({ length: n }, (_, i) => { const m = C.addMonths(mk, i - n + 1); return { month: m, total: C.sum(C.monthTxns(txns, m).filter((t) => t.kind === "expense"), (t) => t.amount) }; });

  /* Proyección lineal a fin de mes (solo mes en curso) */
  C.projection = function (spent, mk, today) {
    if (today.slice(0, 7) !== mk) return spent;
    const day = Number(today.slice(8, 10));
    return Math.round((spent / day) * C.daysInMonth(mk));
  };

  /* ---------- Gastos fijos ---------- */
  C.fixedStatus = function (fixed, txns, mk) {
    return fixed.filter((f) => f.active !== false).map((f) => {
      const done = txns.find((t) => !t.deleted && t.fixedId === f.id && t.date && t.date.slice(0, 7) === mk);
      const day = Math.min(Number(f.day) || 1, C.daysInMonth(mk));
      return { fixed: f, done: !!done, txn: done || null, due: mk + "-" + pad(day) };
    }).sort((x, y) => (x.done === y.done ? (x.due < y.due ? -1 : 1) : x.done ? 1 : -1));
  };

  /* ---------- Huchas ---------- */
  C.goal = function (g, contribs, today) {
    const saved = C.sum(contribs.filter((c) => c.goalId === g.id), (c) => c.amount);
    const remaining = Math.max(0, g.target - saved);
    const pct = g.target > 0 ? Math.min(100, Math.max(0, (saved / g.target) * 100)) : 0;
    let perMonth = null;
    if (g.date && remaining > 0) { const days = (C.parseYmd(g.date) - C.parseYmd(today)) / 86400000; perMonth = days > 0 ? Math.ceil(remaining / Math.max(days / 30.4375, 1 / 30.4375)) : null; }
    const by = {}; contribs.filter((c) => c.goalId === g.id).forEach((c) => (by[c.by] = (by[c.by] || 0) + c.amount));
    return { saved, remaining, pct, perMonth, by, reached: g.target > 0 && saved >= g.target };
  };

  /* ---------- Historia del mes ---------- */
  C.story = function (d, mk) {
    const ms = d.people.map((p) => p.id);
    const list = C.monthTxns(d.txns, mk), exp = list.filter((t) => t.kind === "expense");
    const sum = C.summary(d.txns, mk, ms), prev = C.summary(d.txns, C.addMonths(mk, -1), ms);
    const top = Object.entries(sum.byCat).sort((a, b) => b[1] - a[1])[0] || null;
    const byDay = {}; exp.forEach((t) => (byDay[t.date] = (byDay[t.date] || 0) + t.amount));
    const topDay = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0] || null;
    const biggest = exp.slice().sort((a, b) => b.amount - a.amount)[0] || null;
    const notes = d.notes || [];
    const love = list.map((t) => ({ t, score: Object.keys(t.reactions || {}).length + notes.filter((n) => n.txnId === t.id).length })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score)[0] || null;
    const saved = C.sum((d.contribs || []).filter((c) => c.date && c.date.slice(0, 7) === mk), (c) => c.amount);
    const byPerson = {}; exp.forEach((t) => (byPerson[t.by] = (byPerson[t.by] || 0) + 1));
    return {
      mk, total: sum.total, count: exp.length, days: Object.keys(byDay).length, paid: sum.paid, consumed: sum.consumed, income: sum.totalIncome,
      prevTotal: prev.total, delta: prev.total ? ((sum.total - prev.total) / prev.total) * 100 : null,
      topCat: top ? { cat: top[0], amount: top[1], pct: (top[1] / sum.total) * 100 } : null,
      topDay: topDay ? { date: topDay[0], amount: topDay[1] } : null, biggest, love: love ? love.t : null, loveScore: love ? love.score : 0, saved, recordedBy: byPerson,
    };
  };

  /* ---------- Logros ---------- */
  C.achievements = function (d, today) {
    const ms = d.people.map((p) => p.id), txns = d.txns.filter((t) => !t.deleted), mk = today.slice(0, 7), prevMk = C.addMonths(mk, -1);
    const exp = txns.filter((t) => t.kind === "expense");
    const notes = d.notes || [], contribs = d.contribs || [];
    const days = new Set(txns.map((t) => t.date));
    let streak = 0; for (let i = 0; i < 60; i++) { if (days.has(C.addDays(today, -i))) streak++; else if (i > 0) break; }
    const reactions = C.sum(txns, (t) => Object.keys(t.reactions || {}).length);
    const prev = C.summary(txns, prevMk, ms), cur = C.summary(txns, mk, ms);
    const eatCat = (d.cats || []).find((c) => /comer|restaur/i.test(c.name));
    const eatPrev = eatCat ? prev.byCat[eatCat.id] || 0 : 0, eatCur = eatCat ? cur.byCat[eatCat.id] || 0 : 0;
    const fixedSt = C.fixedStatus(d.fixed || [], txns, mk);
    const goalsDone = (d.goals || []).filter((g) => C.goal(g, contribs, today).reached).length;
    const savedTotal = C.sum(contribs, (c) => c.amount);
    const budget = d.settings && d.settings.budget;
    const A = [
      ["first", "🌱", "Primer paso", "Apuntad vuestro primer gasto", Math.min(1, exp.length)],
      ["team", "🤝", "Equipo", "Los dos habéis apuntado al menos un gasto", ms.filter((m) => txns.some((t) => t.by === m)).length / Math.max(1, ms.length)],
      ["streak", "🔥", "Constancia", "7 días seguidos apuntando algo", Math.min(1, streak / 7)],
      ["peace", "🕊️", "Cuentas claras", "Saldad cuentas por primera vez", Math.min(1, txns.filter((t) => t.kind === "settle").length)],
      ["budget", "🎯", "Dentro del presupuesto", "Cerrad un mes sin pasaros del presupuesto", budget && prev.total > 0 ? (prev.total <= budget ? 1 : Math.min(0.99, budget / prev.total)) : 0],
      ["fixed", "📋", "Mes ordenado", "Registrad todos los gastos fijos del mes", fixedSt.length ? fixedSt.filter((f) => f.done).length / fixedSt.length : 0],
      ["chef", "👩‍🍳", "Cocinillas", "Gastad un 20 % menos en comer fuera que el mes anterior", eatPrev > 0 ? (eatCur <= eatPrev * 0.8 ? (mk === today.slice(0, 7) && Number(today.slice(8, 10)) < 20 ? 0.8 : 1) : Math.max(0, Math.min(0.9, (eatPrev - eatCur) / (eatPrev * 0.2)))) : 0],
      ["jar", "🫙", "Hucha llena", "Completad una hucha", Math.min(1, goalsDone)],
      ["saver", "💎", "Ahorradores", "Apartad 1.000 € entre los dos en las huchas", Math.max(0, Math.min(1, savedTotal / 100000))],
      ["shop", "🛒", "Súper en equipo", "Terminad una lista de la compra", Math.min(1, txns.filter((t) => t.fromShop).length)],
      ["talk", "💬", "Charlatanes", "Dejad 10 comentarios en gastos", Math.min(1, notes.length / 10)],
      ["love", "❤️", "Con cariño", "Reaccionad a 20 gastos", Math.min(1, reactions / 20)],
    ];
    return A.map(([id, emoji, title, desc, p]) => ({ id, emoji, title, desc, progress: Math.max(0, Math.min(1, p || 0)), unlocked: (p || 0) >= 1 }));
  };

  /* ---------- Lista de la compra ---------- */
  /* freq: {texto: veces comprado}. Sugiere lo más comprado que no esté ya en la lista. */
  C.shopSuggestions = function (items, freq, n) {
    const open = new Set(items.filter((i) => !i.done).map((i) => (i.text || "").trim().toLowerCase()));
    return Object.entries(freq || {}).filter(([k]) => k && !open.has(k)).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, n || 8).map(([k]) => k.charAt(0).toUpperCase() + k.slice(1));
  };
  C.bumpFreq = function (freq, texts) {
    const out = Object.assign({}, freq || {});
    texts.forEach((t) => { const k = String(t || "").trim().toLowerCase().slice(0, 40); if (k) out[k] = (out[k] || 0) + 1; });
    const keys = Object.keys(out).sort((a, b) => out[b] - out[a]);
    if (keys.length > 120) keys.slice(120).forEach((k) => delete out[k]);
    return out;
  };

  /* ---------- CSV ---------- */
  C.csvCell = (v) => { const s = v === null || v === undefined ? "" : String(v); return /[";\n\r]/.test(s) || /^[=+\-@]/.test(s) ? '"' + s.replace(/"/g, '""').replace(/^([=+\-@])/, "'$1") + '"' : s; };
  C.toCsv = (rows) => rows.map((r) => r.map(C.csvCell).join(";")).join("\r\n");

  if (typeof module !== "undefined" && module.exports) module.exports = C; else root.C = C;
})(typeof globalThis !== "undefined" ? globalThis : this);
