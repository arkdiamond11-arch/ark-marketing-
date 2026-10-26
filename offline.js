/* ============================================================
   WORKS WITHOUT INTERNET
   · Every list and page the app reads is kept on this phone (the
     newest copy). Without internet, what was opened before shows again.
   · Meetings, follow-ups, reminders done / moved to tomorrow, notes and
     the shop's location are kept on this phone when there is no
     internet, and sent by themselves when it comes back. Until then
     they already show in the lists, as if sent.
   · Everything else (new orders, photos, PDFs…) needs the internet, as
     before.
   app.js hands offlineFetch to the database client. Loaded before
   app.js; uses its helpers only at call time.
   ============================================================ */
'use strict';

const OFF_CACHE = 'ark-data-v1';          // the pages kept on the phone
const OFF_IDX = 'ark-data-idx';           // localStorage: page → last used (the oldest go first)
const OFF_OUT = 'ark-outbox';             // localStorage: entries waiting to be sent
const OFF_MAX = 400;
/* what can be saved without internet: table → methods */
const OFF_QUEUE = { interactions: ['POST'], followups: ['POST', 'PATCH'], client_notes: ['POST'], clients: ['PATCH'] };
const OFF_CLIENT_COLS = ['interest', 'lat', 'lng', 'loc_accuracy', 'loc_set_at'];   // a client change that can wait
const OFF = { online: navigator.onLine !== false, cachedAt: 0, queuedAt: 0, flushing: false };

function offRest() { return String((window.APP_CONFIG || {}).SUPABASE_URL || '').replace(/\/$/, '') + '/rest/v1/'; }
function offHdr(init, name) {
  const h = init && init.headers;
  if (!h) return null;
  if (typeof h.get === 'function') return h.get(name);
  const k = Object.keys(h).find((x) => x.toLowerCase() === name.toLowerCase());
  return k ? h[k] : null;
}
/* the signed-in person (from the request's token); 'anon' = not signed in → nothing kept */
function offUid(init) {
  const p = String(offHdr(init, 'Authorization') || '').replace(/^Bearer\s+/i, '').split('.')[1];
  if (!p) return 'anon';
  try {
    const b = p.replace(/-/g, '+').replace(/_/g, '/');
    const j = JSON.parse(decodeURIComponent(escape(atob(b + '==='.slice((b.length + 3) % 4)))));
    return j && j.sub && j.role !== 'anon' ? j.sub : 'anon';
  } catch (e) { return 'anon'; }
}
function offTable(url) { return url.slice(offRest().length).split('?')[0]; }
function offNewId() {
  if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
}

/* ---------------- the fetch the database client uses ---------------- */
async function offlineFetch(input, init) {
  const url = typeof input === 'string' ? input : (input && input.url) || String(input);
  const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
  if (url.indexOf(offRest()) !== 0) return fetch(input, init);   // sign-in, photos, edge functions: as before
  if (method === 'GET' || method === 'HEAD') return offRead(input, init, url, method);   // HEAD: counts only
  return offWrite(input, init, url, method);
}

/* ---------------- reading: keep a copy, show it without internet ---------------- */
function offKey(url, init, uid, method) {
  const one = /vnd\.pgrst\.object/.test(String(offHdr(init, 'Accept') || ''));   // one row or a list
  return url + (url.indexOf('?') > -1 ? '&' : '?') + '_u=' + encodeURIComponent(uid) + (one ? '&_one=1' : '') + (method === 'HEAD' ? '&_head=1' : '');
}
async function offRead(input, init, url, method) {
  const uid = offUid(init);
  try {
    const res = await fetch(input, init);
    offNet(true);
    if (res.ok && uid !== 'anon') offPut(offKey(url, init, uid, method), res.clone());
    return res;
  } catch (e) {
    offNet(false);
    const hit = uid !== 'anon' ? await offGet(offKey(url, init, uid, method), url, uid) : null;
    if (hit) return hit;
    throw e;
  }
}
async function offPut(key, res) {
  if (!('caches' in window)) return;
  try {
    const body = await res.text();
    const headers = { 'content-type': res.headers.get('content-type') || 'application/json', 'x-saved-at': String(Date.now()) };
    const cr = res.headers.get('content-range');
    if (cr) headers['content-range'] = cr;
    const c = await caches.open(OFF_CACHE);
    await c.put(new Request(key), new Response(body, { status: res.status, headers }));
    offTouch(key);
  } catch (e) { /* phone storage full or blocked: this page just won't show without internet */ }
}
async function offGet(key, url, uid) {
  if (!('caches' in window)) return null;
  try {
    const c = await caches.open(OFF_CACHE);
    const m = await c.match(new Request(key));
    if (!m) return null;
    const body = offOverlay(url, uid, await m.text());
    OFF.cachedAt = +m.headers.get('x-saved-at') || Date.now();
    offTouch(key);
    const headers = { 'content-type': m.headers.get('content-type') || 'application/json' };
    if (m.headers.get('content-range')) headers['content-range'] = m.headers.get('content-range');
    return new Response(body, { status: 200, headers });
  } catch (e) { return null; }
}
/* remember when each page was used (kept in memory, written every few seconds); past OFF_MAX the oldest go */
let OFF_IDXM = null, OFF_IDXT = 0;
function offIdx() {
  if (!OFF_IDXM) { try { OFF_IDXM = JSON.parse(localStorage.getItem(OFF_IDX) || '{}') || {}; } catch (e) { OFF_IDXM = {}; } }
  return OFF_IDXM;
}
function offTouch(key) {
  const idx = offIdx();
  idx[key] = Date.now();
  const keys = Object.keys(idx);
  if (keys.length > OFF_MAX) {
    const old = keys.sort((a, b) => idx[a] - idx[b]).slice(0, keys.length - OFF_MAX + 40);
    old.forEach((k) => { delete idx[k]; });
    caches.open(OFF_CACHE).then((c) => Promise.all(old.map((k) => c.delete(new Request(k))))).catch(() => {});
  }
  if (!OFF_IDXT) OFF_IDXT = setTimeout(() => { OFF_IDXT = 0; try { localStorage.setItem(OFF_IDX, JSON.stringify(offIdx())); } catch (e) { /* full */ } }, 3000);
}

/* entries waiting to be sent show in the kept lists too (new rows on top, changes applied) */
function offOverlay(url, uid, text) {
  const table = offTable(url);
  const mine = offList().filter((x) => x.uid === uid && x.table === table);
  if (!mine.length) return text;
  let data;
  try { data = JSON.parse(text); } catch (e) { return text; }
  const one = data && !Array.isArray(data) && typeof data === 'object';
  let rows = one ? [data] : Array.isArray(data) ? data : null;
  if (!rows) return text;
  // the simple filters of this page (col=eq.x, col=is.null): a new row shows only where it belongs
  const eqs = [];
  new URLSearchParams(url.split('?')[1] || '').forEach((v, k) => {
    if (k.indexOf('.') < 0 && ['select', 'order', 'limit', 'offset', 'or', 'and', 'columns'].indexOf(k) < 0 && /^(eq|is|in)\./.test(v)) eqs.push([k, v]);
  });
  const fits = (r) => eqs.every(([k, v]) => {
    if (v.indexOf('eq.') === 0) return String(r[k]) === decodeURIComponent(v.slice(3));
    if (v === 'is.null') return r[k] == null;
    if (v === 'not.is.null') return r[k] != null;
    if (v.indexOf('in.(') === 0) return v.slice(4, -1).split(',').map((x) => x.replace(/^"|"$/g, '')).indexOf(String(r[k])) > -1;
    return true;
  });
  mine.forEach((it) => {
    let body;
    try { body = JSON.parse(it.body); } catch (e) { return; }
    if (it.method === 'POST' && !one) {
      (Array.isArray(body) ? body : [body]).forEach((r, i) => {
        const row = Object.assign({ id: it.id + '-' + i, created_at: it.at, happened_at: it.at, status: table === 'followups' ? 'pending' : undefined }, r);
        if (fits(row) && !rows.some((d) => d && d.id === row.id)) rows.unshift(row);
      });
    } else if (it.method === 'PATCH') {
      const m = /[?&]id=eq\.([^&]+)/.exec(it.url);
      if (!m) return;
      const id = decodeURIComponent(m[1]);
      rows = rows.map((d) => (d && d.id === id ? Object.assign({}, d, body) : d)).filter((d) => !d || d.id !== id || fits(d));
    }
  });
  return JSON.stringify(one ? rows[0] || null : rows);
}

/* ---------------- saving: keep it on the phone when there is no internet ---------------- */
function offQueueable(table, method, body, init) {
  const allowed = OFF_QUEUE[table];
  if (!allowed || allowed.indexOf(method) < 0 || typeof body !== 'string') return false;
  let rows;
  try { rows = JSON.parse(body); } catch (e) { return false; }
  if (!rows || typeof rows !== 'object') return false;
  const list = Array.isArray(rows) ? rows : [rows];
  const wantsRows = /return=representation/.test(String(offHdr(init, 'Prefer') || ''));
  if (method === 'POST' && wantsRows && list.some((r) => !r.id)) return false;   // the app needs the new row's id: only when it chose it
  if (table === 'clients' && list.some((r) => Object.keys(r).some((k) => OFF_CLIENT_COLS.indexOf(k) < 0))) return false;
  return true;
}
async function offWrite(input, init, url, method) {
  try {
    const res = await fetch(input, init);
    offNet(true);
    return res;
  } catch (e) {
    offNet(false);
    const table = offTable(url), uid = offUid(init), body = init && init.body;
    if (uid === 'anon' || !offQueueable(table, method, body, init)) throw e;
    offAdd({ id: offNewId(), uid, url, method, table, body, at: new Date().toISOString() });
    OFF.queuedAt = Date.now();
    return offEcho(method, init, body);
  }
}
/* the answer the app expects, as if the database had saved it */
function offEcho(method, init, body) {
  if (!/return=representation/.test(String(offHdr(init, 'Prefer') || ''))) return new Response(null, { status: method === 'POST' ? 201 : 204 });
  const rows = JSON.parse(body);
  const one = /vnd\.pgrst\.object/.test(String(offHdr(init, 'Accept') || ''));
  const out = one ? (Array.isArray(rows) ? rows[0] : rows) : (Array.isArray(rows) ? rows : [rows]);
  return new Response(JSON.stringify(out), { status: method === 'POST' ? 201 : 200, headers: { 'content-type': 'application/json' } });
}
/* was something kept on the phone (instead of sent) since time t? */
function offQueuedSince(t) { return OFF.queuedAt >= t; }

function offList() { try { return JSON.parse(localStorage.getItem(OFF_OUT) || '[]') || []; } catch (e) { return []; } }
function offSave(list) { try { localStorage.setItem(OFF_OUT, JSON.stringify(list)); } catch (e) { /* full */ } offBar(); }
function offAdd(it) { const l = offList(); l.push(it); offSave(l); }
function offDrop(id) { offSave(offList().filter((x) => x.id !== id)); }
function offMine() { const me = typeof S !== 'undefined' && S.me ? S.me.id : null; return offList().filter((x) => !me || x.uid === me); }

/* ---------------- sending what waited, when the internet is back ---------------- */
async function offFlush() {
  if (OFF.flushing || !offList().length || typeof db === 'undefined') return;
  OFF.flushing = true;
  let sent = 0;
  const refused = [];
  try {
    const { data } = await db.auth.getSession();
    const s = data && data.session;
    if (!s) return;
    const key = (window.APP_CONFIG || {}).SUPABASE_KEY;
    for (const it of offList()) {
      if (it.uid !== s.user.id) continue;
      let res;
      try {
        res = await fetch(it.url, { method: it.method, body: it.body,
          headers: { apikey: key, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json', Prefer: 'return=minimal' } });
      } catch (e) { offNet(false); break; }   // still no internet
      offNet(true);
      if (res.ok || res.status === 409) { offDrop(it.id); sent++; continue; }   // 409: it had already arrived
      if (res.status === 401) { try { await db.auth.refreshSession(); } catch (e) { /* next time */ } break; }
      offDrop(it.id);
      refused.push(it);
    }
  } catch (e) { /* next time */ } finally { OFF.flushing = false; }
  if (sent && typeof toast === 'function') toast(sent === 1 ? 'Sent what was saved without internet ✓' : 'Sent ' + sent + ' entries saved without internet ✓', 'ok');
  if (refused.length && typeof toast === 'function') toast(refused.length === 1 ? 'A saved entry could not be sent — enter it again' : refused.length + ' saved entries could not be sent — enter them again', 'err');
  if (sent && typeof S !== 'undefined') { S.lastMet = null; S.leadCache = null; }
  offBar();
}

/* ---------------- the bar at the top ---------------- */
function offNet(on) {
  if (OFF.online === on) return;
  OFF.online = on;
  offBar();
  if (on) setTimeout(offFlush, 300);
}
function offBar() {
  const n = offMine().length;
  const show = !OFF.online || n > 0;
  let el = document.getElementById('off-bar');
  if (!show || !document.getElementById('appbar')) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'off-bar';
    el.className = 'off-bar';
    el.setAttribute('role', 'status');
  }
  const bar = document.getElementById('appbar');
  if (el.previousElementSibling !== bar) bar.insertAdjacentElement('afterend', el);
  el.classList.toggle('offline', !OFF.online);
  const txt = (!OFF.online ? '📴 No internet — showing what was loaded before' : '⏳ Sending what was saved without internet') + (n ? ' · ' + n + ' waiting to be sent' : '');
  if (el.textContent !== txt) el.textContent = txt;
}
/* sign-out: nothing of this person stays on the phone */
async function offClear() {
  OFF_IDXM = {};
  if (OFF_IDXT) { clearTimeout(OFF_IDXT); OFF_IDXT = 0; }
  try { localStorage.removeItem(OFF_IDX); } catch (e) { /* ignore */ }
  try { if ('caches' in window) await caches.delete(OFF_CACHE); } catch (e) { /* ignore */ }
}

window.addEventListener('online', () => { OFF.online = true; offBar(); offFlush(); });
window.addEventListener('offline', () => { OFF.online = false; offBar(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') offFlush(); });
setInterval(() => { if (offList().length) offFlush(); }, 30000);
window.LOGIN_HOOKS.push(() => { setTimeout(() => { offBar(); offFlush(); }, 1500); });
