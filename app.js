/* ============================================================
   Marketing Lead Capture — mobile web app
   vanilla JS + Supabase · no build step, no server to run
   Business name / initials come from config.js — nothing is
   hard-coded here.
   ============================================================ */
'use strict';

const CFG = window.APP_CONFIG || {};
const BRAND = CFG.BUSINESS_NAME || 'Marketing';
const BRAND_SHORT = CFG.BUSINESS_SHORT || 'ME';
const db = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY);

/* ---------------- state ---------------- */
const S = {
  session: null,
  me: null,               // my profile row
  team: new Map(),        // id -> profile
  tab: 'today',
  todayScope: 'mine',     // 'mine' | 'all' (owner)
  report: { period: '7d' },
  sub: [],                // subview stack: {title, render}
  formState: {},          // segmented control values for open form
  fu: [],                 // follow-up builder rows
  photos: { front: null, back: null },   // pending card photos {blob, base64, mime}
  editingClient: null,    // client row when editing
  interactionClient: null,
  currentClientId: null,
  searchTimer: null,
  geminiConfigured: false,
  suppressPop: false,
};

/* ---------------- tiny utils ---------------- */
const $ = (sel) => document.querySelector(sel);
const esc = (s) => (s == null ? '' : String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;'));

let toastTimer = null;
function toast(msg, kind) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'show' + (kind ? ' ' + kind : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = ''; }, 3400);
}

function fmtDT(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ', ' + d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}
function fmtD(iso) {
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
function todayStr(offsetDays) {
  const d = new Date();
  if (offsetDays) d.setDate(d.getDate() + offsetDays);
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function dueLabel(due) {
  const t = todayStr();
  if (due < t) {
    const days = Math.round((new Date(t) - new Date(due)) / 86400000);
    return 'Overdue ' + days + (days === 1 ? ' day' : ' days');
  }
  if (due === t) return 'Today';
  if (due === todayStr(1)) return 'Tomorrow';
  return fmtD(due);
}

function normMobile(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length > 10 && d.startsWith('91')) d = d.slice(-10);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
}
const isIndianMobile = (m) => /^[6-9]\d{9}$/.test(m);

function nameOf(id) {
  const p = S.team.get(id);
  return p ? (p.full_name || 'Team member') : '—';
}

function chipCat(c) {
  if (!c) c = 'Undefined';
  const label = c === 'Undefined' ? 'Cat: —' : 'Cat ' + c;
  return '<span class="chip chip-cat ' + esc(c) + '">' + esc(label) + '</span>';
}
function chipInterest(i) {
  if (!i) return '';
  const cls = i === 'Hot' ? 'chip-hot' : i === 'Warm' ? 'chip-warm' : 'chip-cold';
  return '<span class="chip ' + cls + '">' + esc(i) + '</span>';
}
function chipType(t) {
  return '<span class="chip chip-type">' + esc(t) + '</span>';
}

/* ---------------- icons (inline svg) ---------------- */
const IC = {
  today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="M8.5 15.5l2.5 2.5 4.5-4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9.2"/><path d="M12 8v8M8 12h8" stroke-linecap="round"/></svg>',
  find: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2" stroke-linecap="round"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="6" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="18" r="1.6" fill="currentColor" stroke="none"/><rect x="3.2" y="3.2" width="17.6" height="17.6" rx="4"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 8.5A2.5 2.5 0 016.5 6h1.2l1.1-1.7c.3-.5.8-.8 1.4-.8h3.6c.6 0 1.1.3 1.4.8L16.3 6h1.2A2.5 2.5 0 0120 8.5v8A2.5 2.5 0 0117.5 19h-11A2.5 2.5 0 014 16.5v-8z"/><circle cx="12" cy="12.5" r="3.4"/></svg>',
  pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20h16"/><path d="M6 16.5L15.5 7a2.1 2.1 0 013 3L9 19.5 5 20l1-3.5z" stroke-linejoin="round"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.1"><path d="M15 5l-7 7 7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  mic: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9.2" y="3" width="5.6" height="11" rx="2.8"/><path d="M5.5 11.5a6.5 6.5 0 0013 0M12 18v3" stroke-linecap="round"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 20v-7M12 20V5M19 20v-11" stroke-linecap="round"/><path d="M3 20.5h18" stroke-linecap="round"/></svg>',
};

/* ---------------- edge functions ---------------- */
async function callAdmin(action, body) {
  try {
    const { data, error } = await db.functions.invoke('admin-users', { body: Object.assign({ action }, body || {}) });
    if (error) return { error: 'Network problem — please try again.' };
    return data || { error: 'Empty response' };
  } catch (e) {
    return { error: 'Network problem — please try again.' };
  }
}
async function callScan(front, back) {
  try {
    const body = { image_base64: front.base64, mime_type: front.mime };
    if (back) { body.image_back_base64 = back.base64; body.back_mime_type = back.mime; }
    const { data, error } = await db.functions.invoke('scan-card', { body });
    if (error) return { error: 'network' };
    return data || { error: 'empty' };
  } catch (e) {
    return { error: 'network' };
  }
}

/* ---------------- modal ---------------- */
function openModal(html) {
  closeModal();
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.id = 'modal-ov';
  ov.innerHTML = '<div class="modal">' + html + '</div>';
  ov.addEventListener('click', (e) => { if (e.target === ov) closeModal(); });
  document.body.appendChild(ov);
  return ov;
}
function closeModal() {
  const ov = $('#modal-ov');
  if (ov) ov.remove();
}
function confirmModal(title, text, yesLabel, onYes, danger) {
  const ov = openModal(
    '<h3>' + esc(title) + '</h3><p>' + esc(text) + '</p>' +
    '<div class="modal-actions">' +
    '<button class="btn btn-secondary" data-m="no">Cancel</button>' +
    '<button class="btn btn-primary" data-m="yes"' + (danger ? ' style="background:#b3372f"' : '') + '>' + esc(yesLabel) + '</button>' +
    '</div>');
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = () => { closeModal(); onYes(); };
}

/* ============================================================
   AUTH
   ============================================================ */
async function showAuth() {
  const app = $('#app');
  app.innerHTML =
    '<div class="auth-wrap"><div class="auth-head">' +
    '<div class="logo-badge" style="margin:0 auto">' + esc(BRAND_SHORT) + '</div>' +
    '<h1>' + esc(BRAND) + '</h1><p>Marketing &amp; Lead Capture</p></div>' +
    '<div class="auth-card" id="auth-card"><p class="sub">Checking…</p></div></div>';

  const st = await callAdmin('status');
  S.geminiConfigured = !!st.gemini_configured;
  if (st.error) {
    $('#auth-card').innerHTML = '<h2>Cannot reach the server</h2><p class="sub">' + esc(st.error) + '</p>' +
      '<button class="btn btn-primary" onclick="location.reload()">Retry</button>';
    return;
  }
  if (!st.initialized) renderOwnerSetup();
  else renderLogin();
}

function renderLogin() {
  $('#auth-card').innerHTML =
    '<h2>Sign in</h2><p class="sub">Use the login given to you by the owner.</p>' +
    '<form id="login-form">' +
    '<div class="field"><label>Email</label><input type="email" id="li-email" autocomplete="username" required></div>' +
    '<div class="field"><label>Password</label><input type="password" id="li-pass" autocomplete="current-password" required></div>' +
    '<button class="btn btn-primary" type="submit" id="li-btn">Sign in</button>' +
    '</form>';
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#li-btn'); btn.disabled = true; btn.textContent = 'Signing in…';
    const { error } = await db.auth.signInWithPassword({ email: $('#li-email').value.trim(), password: $('#li-pass').value });
    if (error) {
      btn.disabled = false; btn.textContent = 'Sign in';
      toast(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message, 'err');
    }
    // success → onAuthStateChange takes over
  });
}

function renderOwnerSetup() {
  $('#auth-card').innerHTML =
    '<h2>First-time setup</h2><p class="sub">Create the <b>owner</b> account. This screen appears only once — after this, only the owner can add team logins.</p>' +
    '<form id="setup-form">' +
    '<div class="field"><label>Your name</label><input type="text" id="su-name" required placeholder="e.g. Ravi"></div>' +
    '<div class="field"><label>Email</label><input type="email" id="su-email" required></div>' +
    '<div class="field"><label>Password <span class="req">(min 8 characters)</span></label><input type="password" id="su-pass" minlength="8" required autocomplete="new-password"></div>' +
    '<button class="btn btn-primary" type="submit" id="su-btn">Create owner account</button>' +
    '</form>';
  $('#setup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#su-btn'); btn.disabled = true; btn.textContent = 'Creating…';
    const email = $('#su-email').value.trim(), pass = $('#su-pass').value, name = $('#su-name').value.trim();
    const r = await callAdmin('bootstrap', { email, password: pass, full_name: name });
    if (r.error) { btn.disabled = false; btn.textContent = 'Create owner account'; toast(r.error, 'err'); return; }
    const { error } = await db.auth.signInWithPassword({ email, password: pass });
    if (error) { toast('Account created — please sign in.', 'ok'); renderLogin(); }
  });
}

/* ============================================================
   SHELL
   ============================================================ */
function renderShell() {
  $('#app').innerHTML =
    '<header id="appbar">' +
    '<button class="back-btn" data-action="back">' + IC.back + '</button>' +
    '<div class="mini-badge">' + esc(BRAND_SHORT) + '</div>' +
    '<div class="titles"><div class="app-name">' + esc(BRAND) + '</div><div class="screen-name" id="screen-name">Today</div></div>' +
    '</header>' +
    '<main id="content"></main>' +
    '<nav id="tabbar">' +
    '<button data-action="tab" data-tab="today">' + IC.today + '<span>Today</span></button>' +
    '<button data-action="tab" data-tab="find">' + IC.find + '<span>Clients</span></button>' +
    (typeof renderOrders === 'function' ? '<button data-action="tab" data-tab="orders">' + ORD_ICON + '<span>Orders</span></button>' : '') +
    (typeof renderCatalogue === 'function' ? '<button data-action="tab" data-tab="catalogue">' + CAT_ICON + '<span>Catalogue</span></button>' : '') +
    (S.me && S.me.role === 'owner' ? '<button data-action="tab" data-tab="report">' + IC.chart + '<span>Report</span></button>' : '') +
    '<button data-action="tab" data-tab="more">' + IC.more + '<span>More</span></button>' +
    '</nav>';
  bindDelegates();
}

function setHeader(title, hasBack) {
  $('#screen-name').textContent = title;
  $('#appbar').classList.toggle('has-back', !!hasBack);
}

function switchTab(tab) {
  S.tab = tab;
  S.sub = [];
  document.querySelectorAll('#tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  if (tab === 'today') renderToday();
  else if (tab === 'new') renderNewChoice();
  else if (tab === 'find') renderFind();
  else if (tab === 'orders') renderOrders();
  else if (tab === 'catalogue') renderCatalogue();
  else if (tab === 'report') renderReport();
  else renderMore();
  window.scrollTo(0, 0);
}

/* subview navigation (client page, forms) */
function showSub(title, renderFn, replace) {
  if (replace && S.sub.length) S.sub[S.sub.length - 1] = { title, renderFn };
  else {
    S.sub.push({ title, renderFn });
    try { history.pushState({ sub: S.sub.length }, ''); } catch (e) {}
  }
  setHeader(title, true);
  renderFn();
  window.scrollTo(0, 0);
}
function goBack() {
  if (!S.sub.length) return;
  S.sub.pop();
  if (S.sub.length) {
    const top = S.sub[S.sub.length - 1];
    setHeader(top.title, true);
    top.renderFn();
  } else {
    switchTab(S.tab);
  }
  window.scrollTo(0, 0);
}
window.addEventListener('popstate', () => {
  if (S.suppressPop) { S.suppressPop = false; return; }
  if ($('#modal-ov')) { closeModal(); return; }
  if (S.sub.length) goBack();
});

function bindDelegates() {
  $('#content').addEventListener('click', onDelegatedClick);
  $('#tabbar').addEventListener('click', onDelegatedClick);
  $('#appbar').addEventListener('click', onDelegatedClick);
  $('#content').addEventListener('input', (e) => {
    const fu = e.target.closest('[data-fuf]');
    if (fu) {
      const idx = +fu.dataset.idx;
      if (S.fu[idx]) S.fu[idx][fu.dataset.fuf] = fu.value;
    }
    (window.INPUT_HOOKS || []).forEach((h) => { try { h(e); } catch (err) { console.error(err); } });
  });
}

async function onDelegatedClick(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  if (el.tagName === 'A' && el.getAttribute('href') === '#') e.preventDefault();
  if (window.ACTIONS && window.ACTIONS[a]) { window.ACTIONS[a](el, e); return; }
  if (a.indexOf('o-') === 0 && typeof onOrderAction === 'function') { onOrderAction(a, el); return; }

  if (a === 'tab') switchTab(el.dataset.tab);
  else if (a === 'back') { if (S.sub.length) { S.suppressPop = true; try { history.back(); } catch (_) {} goBack(); } }
  else if (a === 'seg') {
    const group = el.dataset.group;
    const same = S.formState[group] === el.dataset.val;
    S.formState[group] = same ? null : el.dataset.val;   // tap again to clear
    el.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', !same && b === el));
    if (group === 'desig') { const w = $('#desig-other-wrap'); if (w) w.style.display = S.formState.desig === 'Other' ? 'block' : 'none'; }
    if (group === 'int_outcome') { const w = $('#outcome-other-wrap'); if (w) w.style.display = S.formState.int_outcome === 'Other' ? 'block' : 'none'; }
    (window.SEG_HOOKS || []).forEach((h) => { try { h(group); } catch (err) { console.error(err); } });
  }
  else if (a === 'open-client') openClient(el.dataset.id);
  else if (a === 'scan-start') { S.photos = { front: null, back: null }; S.editingClient = null; showSub('Scan Card', renderScanCapture); }
  else if (a === 'scan-run') runScan();
  else if (a === 'scan-type-instead') showSub('New Client', () => renderClientForm(null, {}, 'manual'), true);
  else if (a === 'manual-start') { S.photos = { front: null, back: null }; showSub('New Client', () => renderClientForm(null, {}, 'manual')); }
  else if (a === 'attach-photo') attachPhoto(el.dataset.side || 'front');
  else if (a === 'remove-photo') { S.photos[el.dataset.side || 'front'] = null; redrawPhotos(); }
  else if (a === 'save-client') saveClient(el.dataset.editId || null);
  else if (a === 'fu-add') { S.fu.push({ type: el.dataset.type, content: '', due_date: el.dataset.type === 'reminder' ? todayStr(1) : '' }); redrawFuRows(); }
  else if (a === 'fu-del') { S.fu.splice(+el.dataset.idx, 1); redrawFuRows(); }
  else if (a === 'save-interaction') saveInteraction();
  else if (a === 'new-interaction') { const c = await fetchClient(el.dataset.id); if (c) openInteractionForm(c); }
  else if (a === 'edit-client') { const c = await fetchClient(el.dataset.id); if (c) { S.photos = { front: null, back: null }; showSub('Edit Client', () => renderClientForm(c, c, c.entry_source)); } }
  else if (a === 'fu-done') {
    const { error } = await db.from('followups').update({ status: 'done', done_at: new Date().toISOString() }).eq('id', el.dataset.id);
    if (error) toast('Could not update — try again.', 'err');
    else { toast('Marked done ✓', 'ok'); if (S.sub.length && S.currentClientId) openClient(S.currentClientId, true); else renderToday(); }
  }
  else if (a === 'fu-tomorrow') {
    const { error } = await db.from('followups').update({ due_date: todayStr(1) }).eq('id', el.dataset.id);
    if (error) toast('Could not update — try again.', 'err');
    else { toast('Moved to tomorrow', 'ok'); renderToday(); }
  }
  else if (a === 'today-scope') { S.todayScope = el.dataset.scope; renderToday(); }
  else if (a === 'logout') confirmModal('Sign out?', 'You will need your email and password to sign in again.', 'Sign out', async () => { await db.auth.signOut(); location.reload(); });
  else if (a === 'team-add') renderTeamAddModal();
  else if (a === 'member-toggle') toggleMember(el.dataset.id, el.dataset.active === 'true');
  else if (a === 'member-resetpw') renderResetPwModal(el.dataset.id);
  else if (a === 'save-gemini') saveGeminiKey();
  else if (a === 'export-data') exportAllData();
  else if (a === 'report-period') { S.report.period = el.dataset.p; renderReport(); }
  else if (a === 'report-exec') {
    const xid = el.dataset.id, xnm = el.dataset.name;
    showSub(xnm, function () { $('#content').innerHTML = '<div class="empty">Loading…</div>'; reportExecView(xid, xnm); });
  }
  else if (a === 'report-clients') {
    const rk = el.dataset.k, rv = el.dataset.v;
    showSub('Clients — ' + rv, function () { $('#content').innerHTML = '<div class="empty">Loading…</div>'; reportClientsView(rk, rv); });
  }
  else if (a === 'report-outcome') {
    const ov = el.dataset.v;
    showSub(ov, function () { $('#content').innerHTML = '<div class="empty">Loading…</div>'; reportMeetsView(ov); });
  }
  else if (a === 'call') { /* href handles it */ }
}

/* ============================================================
   TODAY
   ============================================================ */
async function renderToday() {
  setHeader('Today', false);
  const c = $('#content');
  c.innerHTML = '<div class="empty">Loading…</div>';

  let q = db.from('followups')
    .select('id, content, due_date, client_id, assigned_to, clients(trade_name, city)')
    .eq('type', 'reminder').eq('status', 'pending')
    .order('due_date', { ascending: true })
    .limit(200);
  if (!(S.me.role === 'owner' && S.todayScope === 'all')) q = q.eq('assigned_to', S.me.id);

  const { data, error } = await q;
  if (error) { c.innerHTML = '<div class="empty">Could not load reminders.<br>Pull down to retry.</div>'; return; }

  const t = todayStr(), soon = todayStr(7);
  const overdue = [], today = [], upcoming = [], later = [];
  (data || []).forEach((r) => {
    if (!r.due_date || r.due_date < t) overdue.push(r);
    else if (r.due_date === t) today.push(r);
    else if (r.due_date <= soon) upcoming.push(r);
    else later.push(r);
  });

  let html = '';
  if (S.me.role === 'owner') {
    html += '<div class="filter-chips">' +
      '<button class="' + (S.todayScope === 'mine' ? 'on' : '') + '" data-action="today-scope" data-scope="mine">My reminders</button>' +
      '<button class="' + (S.todayScope === 'all' ? 'on' : '') + '" data-action="today-scope" data-scope="all">Whole team</button></div>';
  }

  const item = (r) => {
    const who = (S.me.role === 'owner' && S.todayScope === 'all' && r.assigned_to !== S.me.id)
      ? ' · ' + esc(nameOf(r.assigned_to)) : '';
    return '<div class="rem-item">' +
      '<div class="rem-content">' + esc(r.content) + '</div>' +
      '<div class="rem-client" data-action="open-client" data-id="' + r.client_id + '">' + esc(r.clients ? r.clients.trade_name : 'Client') + ' ›</div>' +
      '<div class="rem-meta">' + esc(dueLabel(r.due_date || t)) + who + '</div>' +
      '<div class="rem-actions">' +
      '<button class="btn btn-small btn-secondary" data-action="fu-tomorrow" data-id="' + r.id + '">→ Tomorrow</button>' +
      '<button class="btn btn-small btn-primary" data-action="fu-done" data-id="' + r.id + '">✓ Done</button>' +
      '</div></div>';
  };
  const group = (label, cls, arr) => arr.length
    ? '<div class="due-group-label ' + cls + '">' + label + ' (' + arr.length + ')</div>' + arr.map(item).join('') : '';

  html += group('Overdue', 'overdue', overdue);
  html += group('Today', 'today', today);
  html += group('Next 7 days', 'soon', upcoming);
  if (later.length) html += '<div class="due-group-label soon">Later</div><div class="empty" style="padding:10px">+ ' + later.length + ' more further out</div>';

  if (!overdue.length && !today.length && !upcoming.length && !later.length) {
    html += '<div class="empty"><div class="big">🌤️</div>No pending reminders.<br>Log an interaction and add follow-ups — they will appear here.</div>';
  }
  c.innerHTML = '<div id="today-summary"></div><div id="today-targets"></div><div id="today-pay"></div><div id="today-orders"></div>' + html;
  if (typeof renderTodaySummary === 'function') renderTodaySummary($('#today-summary'));
  if (typeof renderMyTargets === 'function') renderMyTargets($('#today-targets'));
  if (typeof loadTodayPay === 'function') loadTodayPay();
  if (typeof loadTodayOrders === 'function') loadTodayOrders();
}

/* ============================================================
   NEW CLIENT
   ============================================================ */
function renderNewChoice() {
  setHeader('New Client', false);
  $('#content').innerHTML =
    '<div class="section-label">How do you want to add them?</div>' +
    '<button class="choice-btn" data-action="scan-start">' +
    '<span class="ico">' + IC.camera + '</span>' +
    '<span><span class="ch-title">Scan visiting card</span><br><span class="ch-sub">Front &amp; back photos → details filled in for you' + (S.geminiConfigured ? '' : ' (setup pending — photos still saved)') + '</span></span></button>' +
    '<button class="choice-btn" data-action="manual-start">' +
    '<span class="ico">' + IC.pen + '</span>' +
    '<span><span class="ch-title">Enter manually</span><br><span class="ch-sub">No card? Type the details in a minute</span></span></button>' +
    '<div class="notice">Tip: after saving the client, you will be asked to record the meeting — reminders you add will show on the Today screen.</div>';
}

/* Camera or gallery. The picker element stays in the page until a photo comes back —
   some phones never hand over the photo (gallery especially) if it is not in the page. */
function pickImage(cb, fromGallery) {
  const old = document.getElementById('img-pick');
  if (old) old.remove();
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.id = 'img-pick';
  inp.accept = 'image/*';
  if (!fromGallery) inp.setAttribute('capture', 'environment');
  inp.tabIndex = -1;
  inp.setAttribute('aria-hidden', 'true');
  inp.style.cssText = 'position:fixed;left:-200px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
  let done = false;
  const take = () => {
    const f = inp.files && inp.files[0];
    if (done || !f) return;
    done = true;
    setTimeout(() => inp.remove(), 0);
    cb(f);
  };
  inp.addEventListener('change', take);
  inp.addEventListener('input', take);
  document.body.appendChild(inp);
  inp.click();
}

/* a photo file → canvas (at most maxSide px on the longest side). Tries three ways, because
   phones differ: blob link (keeps the photo upright), createImageBitmap, then a data link. */
async function decodeImage(file, maxSide) {
  const fail = (code) => { const e = new Error('image'); e.code = code; return e; };
  if (!file || !file.size) throw fail('empty');
  const draw = (src, w, h) => {
    if (!w || !h) throw fail('decode');
    const sc = Math.min(1, maxSide / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * sc)), ch = Math.max(1, Math.round(h * sc));
    const cv = document.createElement('canvas');
    cv.width = cw; cv.height = ch;
    const g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, cw, ch);   // see-through PNGs → white, not black
    g.imageSmoothingQuality = 'high';
    g.drawImage(src, 0, 0, cw, ch);
    return cv;
  };
  const viaImg = (src) => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => { try { res(draw(img, img.naturalWidth, img.naturalHeight)); } catch (e) { rej(e); } };
    img.onerror = () => rej(fail('decode'));
    img.src = src;
  });
  const url = URL.createObjectURL(file);
  try { return await viaImg(url); } catch (_) { /* try the next way */ } finally { URL.revokeObjectURL(url); }
  if (window.createImageBitmap) {
    try {
      const bm = await createImageBitmap(file);
      const cv = draw(bm, bm.width, bm.height);
      if (bm.close) bm.close();
      return cv;
    } catch (_) { /* next */ }
  }
  try {
    const dataUrl = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.onerror = () => rej(fail('read'));
      fr.readAsDataURL(file);
    });
    return await viaImg(dataUrl);
  } catch (_) { /* give up */ }
  throw fail(/hei[cf]/i.test((file.type || '') + ' ' + (file.name || '')) ? 'heic' : 'decode');
}

/* canvas → the photo object used everywhere: { blob, base64, mime } (JPEG) */
function canvasToPhoto(cv, quality) {
  return new Promise((resolve, reject) => {
    const fromDataUrl = () => {
      try {
        const d = cv.toDataURL('image/jpeg', quality || 0.85);
        const b64 = d.split(',')[1] || '';
        const bin = atob(b64), arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        resolve({ blob: new Blob([arr], { type: 'image/jpeg' }), base64: b64, mime: 'image/jpeg' });
      } catch (e) { reject(e); }
    };
    if (!cv.toBlob) { fromDataUrl(); return; }
    cv.toBlob((blob) => {
      if (!blob) { fromDataUrl(); return; }
      const fr = new FileReader();
      fr.onload = () => resolve({ blob, base64: String(fr.result).split(',')[1], mime: 'image/jpeg' });
      fr.onerror = () => fromDataUrl();
      fr.readAsDataURL(blob);
    }, 'image/jpeg', quality || 0.85);
  });
}

async function downscale(file, maxSide) {
  return canvasToPhoto(await decodeImage(file, maxSide), 0.82);
}

/* what to tell the person when a photo cannot be opened */
function imageErrMsg(e) {
  const c = e && e.code;
  if (c === 'heic') return 'This photo is in HEIC format, which this phone cannot open here. Take a new photo with the camera, or choose a JPG.';
  if (c === 'empty' || c === 'read') return 'Could not open that photo. If it is in the cloud (Google Photos), download it to the phone first.';
  return 'Could not read that image — try another photo.';
}

function renderScanCapture() {
  $('#content').innerHTML =
    '<div class="section-label">Card photos</div>' +
    '<div class="card" id="photo-wrap">' + photosSectionHTML(null) + '</div>' +
    '<div class="notice">Add the front photo, and the back too if the card has details there — the scanner reads both sides together.</div>' +
    '<button class="btn btn-primary" data-action="scan-run" id="scan-run-btn">Scan & fill details</button>' +
    '<div style="height:8px"></div>' +
    '<button class="btn btn-secondary" data-action="scan-type-instead">Type the details instead</button>' +
    '<div style="height:10px"></div>';
}

async function runScan() {
  if (!S.photos.front) { toast('Add the front photo first.', 'err'); return; }
  const ov = document.createElement('div');
  ov.className = 'scan-overlay';
  ov.innerHTML = '<div class="spinner"></div><div>Reading the card…</div>';
  document.body.appendChild(ov);

  const r = await callScan(S.photos.front, S.photos.back);
  ov.remove();

  if (r.ok && r.fields) {
    const f = r.fields;
    const extraMobiles = String(f.phone_other || '').split(',')
      .map(function (x) { return normMobile(x); })
      .filter(function (x) { return isIndianMobile(x); })
      .join(', ');
    const pre = {
      trade_name: f.trade_name || '', company_name: f.company_name || f.trade_name || '',
      contact_person: f.contact_person || '', designation: f.designation || '',
      mobile: normMobile(f.mobile || ''), phone_other: extraMobiles, email: f.email || '',
      city: f.city || '', area: f.area || '',
      address: f.address || '', state: f.state || '',
    };
    toast('Card read ✓ — please check the details', 'ok');
    showSub('New Client', () => renderClientForm(null, pre, 'scan'), true);
  } else {
    if (r.error === 'not_configured') toast('Card scanning is not set up yet — the photos will still be saved with the client.');
    else if (r.error === 'quota') toast('Daily scan limit reached — please type the details; the photos will still be saved.');
    else toast('Could not read the card — please type the details; the photos will still be saved.');
    showSub('New Client', () => renderClientForm(null, {}, 'manual'), true);
  }
}

function attachPhoto(side) {
  const ov = openModal(
    '<h3>' + (side === 'back' ? 'Back side' : 'Front side') + ' photo</h3>' +
    '<p>Take a fresh photo, or pick one already saved on this phone.</p>' +
    '<div style="display:flex;flex-direction:column;gap:10px">' +
    '<button class="btn btn-primary" data-m="cam">📷 Take photo</button>' +
    '<button class="btn btn-secondary" data-m="gal">🖼️ Choose from gallery</button>' +
    '</div>');
  const go = function (fromGallery) {
    closeModal();
    pickImage(async (file) => {
      let p;
      if (typeof cropPhotoFile === 'function') {
        p = await cropPhotoFile(file, side === 'back' ? 'Back side' : 'Front side');   // crop screen; null = cancelled
        if (!p) return;
      } else {
        try { p = await downscale(file, 1600); }
        catch (e) { toast(imageErrMsg(e), 'err'); return; }
      }
      S.photos[side] = p;
      redrawPhotos();
    }, fromGallery);
  };
  ov.querySelector('[data-m=cam]').onclick = function () { go(false); };
  ov.querySelector('[data-m=gal]').onclick = function () { go(true); };
}

function photoSlotHTML(side, savedPath) {
  const p = S.photos[side];
  const label = side === 'front' ? 'Front side' : 'Back side';
  if (p) {
    const url = URL.createObjectURL(p.blob);
    return '<div class="photo-slot"><div class="ps-label">' + label + '</div>' +
      '<div class="ps-img"><img class="cardphoto" src="' + url + '" alt="' + label + '">' +
      '<button type="button" class="ps-x" data-action="remove-photo" data-side="' + side + '" aria-label="Remove photo">✕</button></div>' +
      '<div class="photo-row">' +
      (p.src && typeof recropPhoto === 'function' ? '<button type="button" class="btn btn-small btn-secondary" data-action="crop-photo" data-side="' + side + '">Crop</button>' : '') +
      '<button type="button" class="btn btn-small btn-secondary" data-action="attach-photo" data-side="' + side + '">Retake</button>' +
      '</div></div>';
  }
  return '<div class="photo-slot"><div class="ps-label">' + label + (savedPath ? ' <span class="ps-saved">saved ✓</span>' : '') + '</div>' +
    '<button type="button" class="btn btn-secondary" data-action="attach-photo" data-side="' + side + '">＋ ' + (savedPath ? 'Replace' : 'Add photo') + '</button></div>';
}
function photosSectionHTML(existing) {
  return '<div class="photo-grid">' +
    photoSlotHTML('front', existing && existing.card_image_path) +
    photoSlotHTML('back', existing && existing.card_image_back_path) +
    '</div>';
}
function redrawPhotos() {
  const w = $('#photo-wrap');
  if (w) w.innerHTML = photosSectionHTML(S.editingClient);
}

function segHTML(group, options, selected, extraCls) {
  return '<div class="seg">' + options.map((o) => {
    const cls = (extraCls && extraCls[o] ? extraCls[o] : '') + (selected === o ? ' on' : '');
    return '<button type="button" class="' + cls.trim() + '" data-action="seg" data-group="' + group + '" data-val="' + esc(o) + '">' + esc(o) + '</button>';
  }).join('') + '</div>';
}

const OUTCOMES = ['Meeting', 'Job work order', 'Outright order', 'Person not available', 'Other'];
function outcomeChip(v) {
  return v ? '<span class="chip" style="background:#f3ead9;color:#7a5a15">' + esc(v) + '</span>' : '';
}

/* ---------------- Indian regions (suggestions — free typing always allowed) ---------------- */
const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi',
  'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];
const INDIAN_CITIES = [
  'Agartala', 'Agra', 'Ahmedabad', 'Aizawl', 'Ajmer', 'Akola', 'Aligarh', 'Alwar', 'Ambala', 'Amravati',
  'Amritsar', 'Anand', 'Anantapur', 'Asansol', 'Aurangabad', 'Ballari', 'Bareilly', 'Bathinda', 'Belagavi',
  'Bengaluru', 'Bhagalpur', 'Bharuch', 'Bhavnagar', 'Bhilai', 'Bhilwara', 'Bhopal', 'Bhubaneswar', 'Bikaner',
  'Bilaspur', 'Bokaro', 'Chandigarh', 'Chennai', 'Coimbatore', 'Cuttack', 'Davangere', 'Dehradun', 'Delhi',
  'Dewas', 'Dhanbad', 'Dhule', 'Dimapur', 'Durg', 'Durgapur', 'Erode', 'Faridabad', 'Gandhinagar', 'Gangtok',
  'Gaya', 'Ghaziabad', 'Gorakhpur', 'Guntur', 'Gurugram', 'Guwahati', 'Gwalior', 'Haldwani', 'Haridwar',
  'Himmatnagar', 'Hisar', 'Hosur', 'Howrah', 'Hubballi', 'Hyderabad', 'Ichalkaranji', 'Imphal', 'Indore',
  'Itanagar', 'Jabalpur', 'Jaipur', 'Jalandhar', 'Jalgaon', 'Jammu', 'Jamnagar', 'Jamshedpur', 'Jhansi',
  'Jodhpur', 'Junagadh', 'Kakinada', 'Kalaburagi', 'Kanpur', 'Karimnagar', 'Karnal', 'Kharagpur', 'Khammam',
  'Kochi', 'Kolhapur', 'Kolkata', 'Kota', 'Kozhikode', 'Kurnool', 'Latur', 'Lucknow', 'Ludhiana', 'Madurai',
  'Mangaluru', 'Margao', 'Meerut', 'Mehsana', 'Moradabad', 'Mumbai', 'Muzaffarpur', 'Mysuru', 'Nagpur',
  'Nanded', 'Nashik', 'Navsari', 'Nellore', 'Nizamabad', 'Noida', 'Palanpur', 'Pali', 'Panaji', 'Panipat',
  'Patan', 'Patiala', 'Patna', 'Prayagraj', 'Puducherry', 'Pune', 'Raipur', 'Rajahmundry', 'Rajkot', 'Ranchi',
  'Ratlam', 'Rohtak', 'Sagar', 'Saharanpur', 'Salem', 'Sangli', 'Satara', 'Secunderabad', 'Shillong', 'Shimla',
  'Sikar', 'Siliguri', 'Solapur', 'Srinagar', 'Surat', 'Thane', 'Thiruvananthapuram', 'Thrissur',
  'Tiruchirappalli', 'Tirunelveli', 'Tirupati', 'Tumakuru', 'Udaipur', 'Ujjain', 'Vadodara', 'Valsad', 'Vapi',
  'Varanasi', 'Vellore', 'Vijayawada', 'Visakhapatnam', 'Warangal',
];

function comboFilter(arr, q) {
  q = String(q || '').trim().toLowerCase();
  if (!q) return arr;
  const starts = arr.filter(function (x) { return x.toLowerCase().indexOf(q) === 0; });
  const contains = arr.filter(function (x) { return x.toLowerCase().indexOf(q) > 0; });
  return starts.concat(contains);
}

/* Visible dropdown + free typing for a text input (native datalist is hidden by Chrome's address autofill). */
function attachCombo(inputSel, listSel, arr) {
  const inp = $(inputSel), list = $(listSel);
  if (!inp || !list) return;
  const arrBtn = inp.parentElement.querySelector('.combo-arr');
  let showAll = false;
  const close = function () { list.classList.remove('open'); };
  const render = function () {
    const items = comboFilter(arr, inp.value).slice(0, showAll ? 400 : 8);
    list.innerHTML = items.length
      ? items.map(function (x) { return '<button type="button" data-v="' + esc(x) + '">' + esc(x) + '</button>'; }).join('')
      : '<div class="combo-none">Not in the list — what you typed will be saved as is.</div>';
    list.classList.add('open');
  };
  inp.addEventListener('input', function () { showAll = false; render(); });
  inp.addEventListener('focus', function () { showAll = false; render(); });
  inp.addEventListener('blur', function () { setTimeout(close, 200); });
  if (arrBtn) {
    arrBtn.addEventListener('mousedown', function (ev) { ev.preventDefault(); });
    arrBtn.addEventListener('click', function () {
      if (list.classList.contains('open') && showAll) { close(); return; }
      showAll = true; render();
    });
  }
  list.addEventListener('mousedown', function (ev) { ev.preventDefault(); });
  list.addEventListener('click', function (ev) {
    const b = ev.target.closest('button[data-v]');
    if (!b) return;
    inp.value = b.dataset.v;
    close();
  });
}

/* Which compulsory fields are still empty? Returns [label, selector|null] pairs. */
function missingFields(v, fs) {
  const m = [];
  if (!v.company) m.push(['Company name', '#f-company']);
  if (!v.person) m.push(['Contact person', '#f-person']);
  if (!v.mobile) m.push(['Mobile number', '#f-mobile']);
  if (!fs.polki) m.push(['Buys Polki?', null]);
  if (!fs.order_type) m.push(['Order type', null]);
  if (!fs.interest) m.push(['Client interest', null]);
  if (!v.city) m.push(['City', '#f-city']);
  if (!v.address) m.push(['Full address', '#f-address']);
  return m;
}

function renderClientForm(existing, pre, source) {
  const c = $('#content');
  const e = existing || {};
  const v = (k) => esc(pre[k] != null ? pre[k] : (e[k] != null ? e[k] : ''));
  const compVal = esc(String(pre.company_name || pre.trade_name || e.company_name || e.trade_name || '').trim());
  const desigRaw = String((pre.designation != null ? pre.designation : e.designation) || '').trim();
  const DESIG_KNOWN = ['Partner', 'Owner', 'Founder', 'Staff'];
  const desigMatch = DESIG_KNOWN.find((k) => k.toLowerCase() === desigRaw.toLowerCase());
  S.formState = {
    polki: e.is_polki_buyer === true ? 'Yes' : e.is_polki_buyer === false ? 'No' : (existing ? 'Undefined' : null),
    category: e.category || 'Undefined',
    order_type: e.order_type || null,
    interest: e.interest || null,
    entry_source: source || e.entry_source || 'manual',
    desig: desigRaw ? (desigMatch || 'Other') : null,
    desig_other: desigRaw && !desigMatch ? desigRaw : '',
  };
  S.editingClient = existing || null;

  c.innerHTML =
    '<div class="section-label">Visiting card</div>' +
    '<div class="card" id="photo-wrap">' + photosSectionHTML(existing) + '</div>' +

    '<div class="section-label">Basic details</div>' +
    '<div class="card">' +
    '<div class="field"><label>Company / firm name <span class="req">*</span></label><input type="text" id="f-company" value="' + compVal + '" placeholder="Shop / company name"></div>' +
    '<div class="field"><label>Contact person <span class="req">*</span></label><input type="text" id="f-person" value="' + v('contact_person') + '"></div>' +
    '<div class="field"><label>Designation</label>' + segHTML('desig', ['Partner', 'Owner', 'Founder', 'Staff', 'Other'], S.formState.desig) +
    '<div id="desig-other-wrap" style="display:' + (S.formState.desig === 'Other' ? 'block' : 'none') + ';margin-top:8px"><input type="text" id="f-desig-other" value="' + esc(S.formState.desig_other) + '" placeholder="Type the designation"></div></div>' +
    '<div class="field"><label>Mobile number <span class="req">*</span></label><input type="tel" id="f-mobile" inputmode="numeric" value="' + v('mobile') + '" placeholder="10-digit mobile">' +
    '<div id="mobile-note"></div></div>' +
    '<div class="field"><label>Other mobile numbers</label><input type="text" id="f-phone2" autocomplete="off" inputmode="tel" value="' + v('phone_other') + '" placeholder="Extra mobile numbers, if any"></div>' +
    '<div class="field"><label>Email</label><input type="email" id="f-email" autocomplete="off" inputmode="email" value="' + v('email') + '" placeholder="name@gmail.com"></div>' +
    '<div class="field"><label>Owner\'s name</label><input type="text" id="f-owner" value="' + v('owner_name') + '"></div>' +
    '<div class="field"><label>GSTIN</label><input type="text" id="f-gstin" autocapitalize="characters" autocomplete="off" value="' + v('gstin') + '" placeholder="15-character GST number (optional)"></div>' +
    '</div>' +

    '<div class="section-label">Business profile</div>' +
    '<div class="card">' +
    '<div class="field"><label>Buys Polki jewellery? <span class="req">*</span></label>' + segHTML('polki', ['Yes', 'No', 'Undefined'], S.formState.polki) + '</div>' +
    '<div class="field"><label>Customer category (volume of work)</label>' + segHTML('category', ['A', 'B', 'C', 'Undefined'], S.formState.category) +
    '<div class="hint">A = highest volume · C = lowest</div></div>' +
    '<div class="field"><label>Order type <span class="req">*</span></label>' + segHTML('order_type', ['Job work', 'Outright', 'Both'], S.formState.order_type) + '</div>' +
    '<div class="field"><label>Client interest (lead quality) <span class="req">*</span></label>' + segHTML('interest', ['Hot', 'Warm', 'Cold'], S.formState.interest, { Hot: 'hot', Warm: 'warm', Cold: 'cold' }) +
    '<div class="hint">Hot = high interest · Warm = medium · Cold = low</div></div>' +
    '</div>' +

    '<div class="section-label">Location</div>' +
    '<div class="card">' +
    '<div class="field"><label>City <span class="req">*</span></label><div class="combo"><input type="text" id="f-city" autocomplete="off" value="' + v('city') + '" placeholder="Type or pick a city"><button type="button" class="combo-arr" tabindex="-1" aria-label="Show cities">▾</button><div class="combo-list" id="cl-city"></div></div></div>' +
    '<div class="field"><label>State</label><div class="combo"><input type="text" id="f-state" autocomplete="off" value="' + v('state') + '" placeholder="Type or pick a state"><button type="button" class="combo-arr" tabindex="-1" aria-label="Show states">▾</button><div class="combo-list" id="cl-state"></div></div></div>' +
    '<div class="field"><label>Area / locality</label><input type="text" id="f-area" value="' + v('area') + '" placeholder="Market / locality"></div>' +
    '<div class="field"><label>Full address <span class="req">*</span></label><textarea id="f-address" style="min-height:70px" placeholder="Shop no., street, market, city, PIN">' + v('address') + '</textarea></div>' +
    '</div>' +

    (!existing && S.dbv6 ? '<div class="section-label">Note</div>' +
      '<div class="card"><div class="field" style="margin-bottom:2px">' +
      '<textarea id="f-note" style="min-height:70px" placeholder="Anything to remember about this client — type it, or tap Speak"></textarea>' +
      (typeof dictRowHTML === 'function' ? dictRowHTML('f-note') : '') + '</div></div>' : '') +

    '<button class="btn btn-primary" data-action="save-client"' + (existing ? ' data-edit-id="' + existing.id + '"' : '') + ' id="save-client-btn">' +
    (existing ? 'Save changes' : 'Save client') + '</button>' +
    '<div style="height:10px"></div>';

  const mobileInput = $('#f-mobile');
  mobileInput.addEventListener('blur', async () => {
    const note = $('#mobile-note');
    note.innerHTML = '';
    const m = normMobile(mobileInput.value);
    if (!m) return;
    mobileInput.value = m;
    if (!isIndianMobile(m)) {
      note.innerHTML = '<div class="warn">This does not look like a 10-digit mobile number (landline?). You can still save it.</div>';
    }
    if (m.length === 10) {
      const { data } = await db.from('clients').select('id, trade_name, contact_person').eq('mobile', m).neq('id', e.id || '00000000-0000-0000-0000-000000000000').limit(1);
      if (data && data.length) {
        note.innerHTML += '<div class="dup">⚠ This number is already saved for <b>' + esc(data[0].trade_name) + '</b>. ' +
          '<a href="#" data-action="open-client" data-id="' + data[0].id + '">Open that client</a> instead of creating a duplicate.</div>';
      }
    }
  });

  attachCombo('#f-city', '#cl-city', INDIAN_CITIES);
  attachCombo('#f-state', '#cl-state', INDIAN_STATES);
}

async function saveClient(editId) {
  const btn = $('#save-client-btn');
  const mobile = normMobile($('#f-mobile').value);
  const vals = {
    company: $('#f-company').value.trim(),
    person: $('#f-person').value.trim(),
    mobile: mobile,
    city: $('#f-city').value.trim(),
    address: $('#f-address').value.trim(),
  };
  const miss = missingFields(vals, S.formState);
  if (miss.length) {
    toast('Please fill: ' + miss.map((m) => m[0]).join(', '), 'err');
    const first = miss.find((m) => m[1]);
    if (first) {
      const fe = $(first[1]);
      if (fe) { fe.focus(); try { fe.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) {} }
    }
    return;
  }

  const desigVal = S.formState.desig === 'Other'
    ? ($('#f-desig-other') ? $('#f-desig-other').value.trim() : '')
    : (S.formState.desig || '');
  const row = {
    trade_name: vals.company,
    company_name: vals.company,
    contact_person: vals.person,
    designation: desigVal || null,
    mobile: mobile,
    phone_other: $('#f-phone2').value.trim() || null,
    email: $('#f-email').value.trim() || null,
    owner_name: $('#f-owner').value.trim() || null,
    gstin: $('#f-gstin') ? ($('#f-gstin').value.trim().toUpperCase() || null) : (S.editingClient ? S.editingClient.gstin || null : null),
    address: vals.address,
    is_polki_buyer: S.formState.polki === 'Yes' ? true : S.formState.polki === 'No' ? false : null,
    category: S.formState.category || 'Undefined',
    order_type: S.formState.order_type,
    interest: S.formState.interest,
    city: vals.city,
    state: $('#f-state').value.trim() || null,
    area: $('#f-area').value.trim() || null,
    entry_source: S.formState.entry_source,
  };

  const doSave = async () => {
    if (typeof stopDict === 'function') await stopDict();   // still listening? keep the last words
    const noteEl = $('#f-note');
    const noteText = noteEl ? noteEl.value.trim() : '';
    let noteFailed = false;
    btn.disabled = true; btn.textContent = 'Saving…';
    let clientId = editId;
    if (editId) {
      const { error } = await db.from('clients').update(row).eq('id', editId);
      if (error) { btn.disabled = false; btn.textContent = 'Save changes'; toast('Could not save — please try again.', 'err'); return; }
    } else {
      row.created_by = S.me.id;
      const { data, error } = await db.from('clients').insert(row).select('id').single();
      if (error) { btn.disabled = false; btn.textContent = 'Save client'; toast('Could not save — please try again.', 'err'); return; }
      clientId = data.id;
      if (noteText) {
        const { error: nErr } = await db.from('client_notes').insert({ client_id: clientId, body: noteText, created_by: S.me.id });
        noteFailed = !!nErr;
      }
    }

    for (const pair of [['front', 'card_image_path'], ['back', 'card_image_back_path']]) {
      const side = pair[0], col = pair[1];
      const p = S.photos[side];
      if (!p) continue;
      const path = clientId + '/' + side + '-' + Date.now() + '.jpg';
      const { error: upErr } = await db.storage.from('cards').upload(path, p.blob, { contentType: 'image/jpeg' });
      if (!upErr) {
        const patch = {};
        patch[col] = path;
        await db.from('clients').update(patch).eq('id', clientId);
      } else {
        toast('Client saved, but the ' + side + ' card photo could not be uploaded.', 'err');
      }
      S.photos[side] = null;
    }

    if (noteFailed) toast('Client saved — but the note could not be saved. Add it again on the client page.', 'err');
    else toast(editId ? 'Client updated ✓' : 'Client saved ✓', 'ok');
    if (editId) { openClient(editId, true); return; }

    const client = await fetchClient(clientId);
    const ov = openModal(
      '<h3>Client saved 🎉</h3><p>Record the meeting now? Reminders and instructions you add will appear on the Today screen.</p>' +
      '<div class="modal-actions">' +
      '<button class="btn btn-secondary" data-m="later">Later</button>' +
      '<button class="btn btn-primary" data-m="now">Record meeting</button></div>');
    ov.querySelector('[data-m=later]').onclick = () => { closeModal(); openClient(clientId, true); };
    ov.querySelector('[data-m=now]').onclick = () => { closeModal(); if (client) openInteractionForm(client, true); };
  };

  if (mobile && !isIndianMobile(mobile)) {
    confirmModal('Not a mobile number?', 'The number "' + mobile + '" does not look like a 10-digit Indian mobile. Save anyway?', 'Save anyway', doSave);
  } else {
    doSave();
  }
}

/* ============================================================
   FIND / SEARCH
   ============================================================ */
function renderFind() {
  setHeader('Clients', false);
  $('#content').innerHTML =
    '<div class="action-row" style="margin-bottom:10px">' +
    '<button class="btn btn-primary" data-action="scan-start">' + IC.camera + ' Scan card</button>' +
    '<button class="btn btn-secondary" data-action="manual-start">' + IC.pen + ' Type details</button>' +
    '</div>' +
    '<div class="search-box"><input type="text" id="search-input" placeholder="Search name, shop, mobile, city…" autocomplete="off"></div>' +
    '<div id="search-results"><div class="empty">Loading recent clients…</div></div>';
  const inp = $('#search-input');
  inp.addEventListener('input', () => {
    clearTimeout(S.searchTimer);
    S.searchTimer = setTimeout(() => runSearch(inp.value), 280);
  });
  runSearch('');
}

async function runSearch(qRaw) {
  const box = $('#search-results');
  if (!box) return;
  const q = String(qRaw || '').trim().replace(/[,%()]/g, ' ').trim();
  let query = db.from('clients').select('id, trade_name, company_name, contact_person, city, area, category, interest, mobile');
  if (q) {
    const pat = '%' + q + '%';
    query = query.or('trade_name.ilike.' + pat + ',company_name.ilike.' + pat + ',contact_person.ilike.' + pat + ',mobile.ilike.' + pat + ',phone_other.ilike.' + pat + ',city.ilike.' + pat + ',owner_name.ilike.' + pat + ',email.ilike.' + pat).limit(50);
  } else {
    query = query.order('created_at', { ascending: false }).limit(25);
  }
  const seq = S.searchSeq = (S.searchSeq || 0) + 1;   // typing fast: only the newest search may draw
  const { data: found, error } = await query;
  if (seq !== S.searchSeq) return;
  if (error) { box.innerHTML = '<div class="empty">Search failed — try again.</div>'; return; }
  let data = found || [];
  if (q && typeof clientsFromNotes === 'function') {
    data = data.concat(await clientsFromNotes(q, data.map((c) => c.id)));   // also look inside client notes
    if (seq !== S.searchSeq) return;
  }
  if (!data.length) {
    box.innerHTML = '<div class="empty"><div class="big">🔎</div>' + (q ? 'No client matches "' + esc(q) + '".<br>Check the spelling, or add them as a new client.' : 'No clients yet — tap “Scan card” or “Type details” above to add your first.') + '</div>';
    return;
  }
  box.innerHTML = (q ? '' : '<div class="section-label">Recently added</div>') + data.map((cl) =>
    '<div class="list-item" data-action="open-client" data-id="' + cl.id + '">' +
    '<div class="li-main">' +
    '<div class="li-title">' + esc(cl.trade_name) + '</div>' +
    '<div class="li-sub">' + esc([cl.contact_person, cl.city].filter(Boolean).join(' · ') || cl.company_name || '') + '</div>' +
    '<div class="li-chips">' + chipCat(cl.category) + chipInterest(cl.interest) + '</div>' +
    '</div><div style="color:var(--muted)">›</div></div>').join('');
  // the newest note under each client (or the one that matched the search)
  if (typeof fillClientNoteSnippets === 'function') fillClientNoteSnippets(box, data.map((c) => c.id), q, () => seq === S.searchSeq);
}

/* ============================================================
   CLIENT PAGE
   ============================================================ */
async function fetchClient(id) {
  const { data, error } = await db.from('clients').select('*').eq('id', id).maybeSingle();
  if (error || !data) { toast('Could not open client.', 'err'); return null; }
  return data;
}

async function openClient(id, replace) {
  S.currentClientId = id;
  const cl = await fetchClient(id);
  if (!cl) return;
  // history + orders reload every time the page is shown (also after pressing Back)
  showSub(cl.trade_name, () => {
    renderClientPage(cl);
    loadClientHistory(cl);
    if (typeof loadClientNotes === 'function') loadClientNotes(cl);
    if (typeof loadClientPay === 'function') loadClientPay(cl);
    if (typeof loadClientOrders === 'function') loadClientOrders(cl);
  }, replace);
}

function renderClientPage(cl) {
  const rows = [];
  const add = (k, vHtml) => { if (vHtml) rows.push('<div class="detail-row"><div class="dk">' + k + '</div><div class="dv">' + vHtml + '</div></div>'); };
  if (cl.company_name && cl.company_name !== cl.trade_name) add('Company', esc(cl.company_name));
  add('Contact person', esc([cl.contact_person, cl.designation].filter(Boolean).join(' — ')));
  if (cl.mobile) add('Mobile', '<a href="tel:' + esc(cl.mobile) + '" data-action="call">' + esc(cl.mobile) + '</a>');
  if (cl.phone_other) add('Other mobiles', esc(cl.phone_other));
  if (cl.email) add('Email', '<a href="mailto:' + esc(cl.email) + '">' + esc(cl.email) + '</a>');
  add('Owner', esc(cl.owner_name));
  add('Location', esc([cl.area, cl.city, cl.state].filter(Boolean).join(', ')));
  add('GSTIN', esc(cl.gstin));
  add('Address', esc(cl.address));
  add('Polki jewellery', cl.is_polki_buyer === true ? 'Yes' : cl.is_polki_buyer === false ? 'No' : '');
  add('Order type', esc(cl.order_type));
  add('Added by', esc(nameOf(cl.created_by)) + ' · ' + fmtD(cl.created_at));

  $('#content').innerHTML =
    '<div class="client-head"><h2>' + esc(cl.trade_name) + '</h2>' +
    (cl.company_name && cl.company_name !== cl.trade_name ? '<div class="co">' + esc(cl.company_name) + '</div>' : '') +
    '<div class="chips">' + chipCat(cl.category) + chipInterest(cl.interest) +
    (cl.order_type ? '<span class="chip">' + esc(cl.order_type) + '</span>' : '') + '</div></div>' +

    '<div class="action-row">' +
    '<button class="btn btn-primary" data-action="new-interaction" data-id="' + cl.id + '">＋ Meeting</button>' +
    (typeof renderOrders === 'function' ? '<button class="btn btn-primary" data-action="o-new" data-id="' + cl.id + '">＋ Order</button>' : '') +
    '<button class="btn btn-secondary" data-action="edit-client" data-id="' + cl.id + '">Edit</button>' +
    '</div>' +
    '<div id="client-pay"></div>' +

    '<div class="card">' + (rows.join('') || '<div class="empty" style="padding:6px">No details yet</div>') +
    (typeof clientLocRowHTML === 'function' ? clientLocRowHTML(cl) : '') + '</div>' +
    '<div id="client-notes"></div>' +
    '<div id="client-card-photo"></div>' +
    '<div id="client-followups"></div>' +
    '<div id="client-orders"></div>' +
    '<div id="client-history"><div class="empty">Loading history…</div></div>';

  const sides = [['Front', cl.card_image_path], ['Back', cl.card_image_back_path]].filter((s) => s[1]);
  if (sides.length) {
    Promise.all(sides.map((s) =>
      db.storage.from('cards').createSignedUrl(s[1], 3600).then(({ data }) => [s[0], data && data.signedUrl])
    )).then((list) => {
      const el = $('#client-card-photo');
      if (!el) return;
      const imgs = list.filter((x) => x[1]).map((x) =>
        '<div class="photo-slot"><div class="ps-label">' + x[0] + '</div><img class="cardphoto" src="' + x[1] + '" alt="Visiting card ' + x[0] + '"></div>').join('');
      if (imgs) el.innerHTML = '<div class="section-label">Visiting card</div><div class="card"><div class="photo-grid">' + imgs + '</div></div>';
    });
  }
}

async function loadClientHistory(cl) {
  const [ints, fus] = await Promise.all([
    db.from('interactions').select('*').eq('client_id', cl.id).order('happened_at', { ascending: false }).limit(100),
    db.from('followups').select('*').eq('client_id', cl.id).order('created_at', { ascending: true }).limit(300),
  ]);
  const fuEl = $('#client-followups'), hiEl = $('#client-history');
  if (!fuEl || !hiEl) return;

  const followups = fus.data || [];
  const pending = followups.filter((f) => f.status === 'pending');
  if (pending.length) {
    fuEl.innerHTML = '<div class="section-label">Pending follow-ups</div><div class="card">' +
      pending.map((f) =>
        '<div class="fu-line">' + chipType(f.type) + '<span style="flex:1">' + esc(f.content) + '</span>' +
        (f.due_date ? '<span class="fu-due">' + esc(dueLabel(f.due_date)) + '</span>' : '') +
        '<button class="btn btn-small btn-ghost" data-action="fu-done" data-id="' + f.id + '">✓</button></div>').join('') +
      '</div>';
  } else fuEl.innerHTML = '';

  const byInt = {};
  followups.forEach((f) => { if (f.interaction_id) (byInt[f.interaction_id] = byInt[f.interaction_id] || []).push(f); });

  const items = (ints.data || []).map((it) => {
    const fuHtml = (byInt[it.id] || []).map((f) =>
      '<div class="fu-line' + (f.status === 'done' ? ' done' : '') + '">' + chipType(f.type) +
      '<span style="flex:1">' + esc(f.content) + '</span>' +
      (f.due_date && f.status === 'pending' ? '<span class="fu-due">' + esc(dueLabel(f.due_date)) + '</span>' : '') + '</div>').join('');
    return '<div class="timeline-item">' +
      '<div class="t-meta"><span>' + esc(nameOf(it.exec_id)) + '</span><span>' + fmtDT(it.happened_at) + '</span></div>' +
      (it.outcome ? '<div style="margin:2px 0 5px">' + outcomeChip(it.outcome) + '</div>' : '') +
      '<div class="t-notes">' + esc(it.notes) + '</div>' +
      (typeof visitLocHTML === 'function' ? visitLocHTML(it, cl) : '') +
      (it.interest_after ? '<div style="margin-top:7px">' + chipInterest(it.interest_after) + ' <span style="font-size:12px;color:var(--muted)">after this meeting</span></div>' : '') +
      (fuHtml ? '<div class="t-fus">' + fuHtml + '</div>' : '') +
      '</div>';
  });

  hiEl.innerHTML = '<div class="section-label">Meeting history</div>' +
    (items.length ? items.join('') : '<div class="empty">No meetings recorded yet.<br>Tap “Record meeting” after you speak with them.</div>');
}

/* ============================================================
   INTERACTION FORM
   ============================================================ */
function openInteractionForm(client, replace) {
  S.interactionClient = client;
  S.fu = [];
  S.formState.int_interest = client.interest || null;
  S.formState.int_outcome = null;
  showSub('Record Meeting', renderInteractionForm, replace);
}

function renderInteractionForm() {
  const cl = S.interactionClient;
  $('#content').innerHTML =
    '<div class="card" style="padding:13px 15px"><b>' + esc(cl.trade_name) + '</b>' +
    (cl.city ? ' <span style="color:var(--muted);font-size:13px">· ' + esc(cl.city) + '</span>' : '') + '</div>' +

    '<div class="section-label">Meeting outcome</div>' +
    '<div class="card"><div class="field" style="margin-bottom:2px">' +
    segHTML('int_outcome', OUTCOMES, S.formState.int_outcome) +
    '<div id="outcome-other-wrap" style="display:' + (S.formState.int_outcome === 'Other' ? 'block' : 'none') + ';margin-top:8px"><input type="text" id="f-outcome-other" placeholder="What was the outcome?"></div>' +
    '</div></div>' +

    '<div class="section-label">What happened in the meeting?</div>' +
    '<div class="card">' +
    '<div class="field"><textarea id="int-notes" placeholder="e.g. Showed the new antique collection. Wants a quotation for 200 gm job work…"></textarea>' +
    (typeof dictRowHTML === 'function' ? dictRowHTML('int-notes') : '<div class="mic-hint">' + IC.mic + ' Tip: tap the mic on your keyboard and just speak.</div>') + '</div>' +
    '</div>' +

    '<div class="section-label">Follow-ups (optional)</div>' +
    '<div class="fu-add-row">' +
    '<button class="btn btn-small btn-secondary" data-action="fu-add" data-type="reminder">＋ Reminder</button>' +
    '<button class="btn btn-small btn-secondary" data-action="fu-add" data-type="note">＋ Note</button>' +
    '<button class="btn btn-small btn-secondary" data-action="fu-add" data-type="instruction">＋ Instruction</button>' +
    '</div><div id="fu-rows"></div>' +

    '<div class="section-label">Client interest after this meeting</div>' +
    '<div class="card"><div class="field" style="margin-bottom:2px">' +
    segHTML('int_interest', ['Hot', 'Warm', 'Cold'], S.formState.int_interest, { Hot: 'hot', Warm: 'warm', Cold: 'cold' }) +
    '</div></div>' +

    '<button class="btn btn-primary" data-action="save-interaction" id="save-int-btn">Save meeting</button>' +
    '<div style="height:10px"></div>';
  redrawFuRows();
}

function redrawFuRows() {
  const box = $('#fu-rows');
  if (!box) return;
  box.innerHTML = S.fu.map((f, i) =>
    '<div class="fu-row">' +
    '<div class="fu-top">' + chipType(f.type) + '<button type="button" class="fu-x" data-action="fu-del" data-idx="' + i + '">✕</button></div>' +
    '<input type="text" data-fuf="content" data-idx="' + i + '" value="' + esc(f.content) + '" placeholder="' +
    (f.type === 'reminder' ? 'e.g. Call about the quotation' : f.type === 'note' ? 'e.g. Prefers antique finish' : 'e.g. Send catalogue by courier') + '">' +
    (f.type === 'reminder' ? '<input type="date" data-fuf="due_date" data-idx="' + i + '" value="' + esc(f.due_date || todayStr(1)) + '" min="' + todayStr() + '">' : '') +
    '</div>').join('');
}

async function saveInteraction() {
  const cl = S.interactionClient;
  const notes = $('#int-notes').value.trim();
  const fus = S.fu.filter((f) => f.content && f.content.trim());
  const outcomeVal = S.formState.int_outcome === 'Other'
    ? ($('#f-outcome-other') ? $('#f-outcome-other').value.trim() : '')
    : (S.formState.int_outcome || '');
  if (!notes && !fus.length && !outcomeVal) { toast('Choose an outcome, write what happened, or add a follow-up.', 'err'); return; }

  const btn = $('#save-int-btn'); btn.disabled = true; btn.textContent = 'Saving…';
  const interestAfter = S.formState.int_interest || null;

  // visit check-in: where this meeting was recorded (skipped quietly if not allowed)
  let pos = null;
  if (typeof getPosition === 'function') { btn.textContent = 'Getting location…'; pos = await getPosition(9000); btn.textContent = 'Saving…'; }

  const { data: intRow, error } = await db.from('interactions').insert(Object.assign({
    client_id: cl.id, exec_id: S.me.id,
    notes: notes || (outcomeVal ? '(' + outcomeVal + ')' : '(follow-ups only)'),
    outcome: outcomeVal || null,
    interest_after: interestAfter !== cl.interest ? interestAfter : null,
  }, typeof visitFields === 'function' ? visitFields(pos) : {})).select('id').single();
  if (!error && typeof maybeSaveShopLocation === 'function') await maybeSaveShopLocation(cl, pos);
  if (error) { btn.disabled = false; btn.textContent = 'Save meeting'; toast('Could not save — please try again.', 'err'); return; }

  if (fus.length) {
    const rows = fus.map((f) => ({
      client_id: cl.id, interaction_id: intRow.id, type: f.type, content: f.content.trim(),
      due_date: f.type === 'reminder' ? (f.due_date || todayStr(1)) : null,
      assigned_to: S.me.id, created_by: S.me.id,
    }));
    const { error: fuErr } = await db.from('followups').insert(rows);
    if (fuErr) toast('Meeting saved, but follow-ups failed — add them again from the client page.', 'err');
  }

  if (interestAfter && interestAfter !== cl.interest) {
    await db.from('clients').update({ interest: interestAfter }).eq('id', cl.id);
  }

  toast('Meeting recorded ✓', 'ok');
  await openClient(cl.id, true);

  // An order was taken in this meeting → offer to record it straight away.
  const orderType = outcomeVal === 'Job work order' ? 'job_work' : outcomeVal === 'Outright order' ? 'ready_stock' : null;
  if (orderType && typeof startNewOrder === 'function') {
    const ov = openModal(
      '<h3>Record the order now?</h3><p>You marked this meeting as “' + esc(outcomeVal) + '”. Add the items and weights so the order is tracked.</p>' +
      '<div class="modal-actions">' +
      '<button class="btn btn-secondary" data-m="later">Later</button>' +
      '<button class="btn btn-primary" data-m="now">Create order</button></div>');
    ov.querySelector('[data-m=later]').onclick = closeModal;
    ov.querySelector('[data-m=now]').onclick = () => { closeModal(); startNewOrder(cl, orderType); };
  }
}

/* ============================================================
   REPORT (owner dashboard)
   ============================================================ */
function periodStartISO(p) {
  if (p === 'all') return null;
  const d = new Date();
  if (p === 'today') { d.setHours(0, 0, 0, 0); return d.toISOString(); }
  const days = p === '7d' ? 7 : 30;
  d.setDate(d.getDate() - days);
  return d.toISOString();
}
function periodLabel(p) {
  return p === 'today' ? 'today' : p === '7d' ? 'in the last 7 days' : p === '30d' ? 'in the last 30 days' : 'overall';
}
function aggReport(clients, meets, team) {
  const perExec = new Map();
  team.forEach(function (p) { if (p.active) perExec.set(p.id, { name: p.full_name || p.email || '—', meetings: 0, clients: 0 }); });
  const bump = function (id, k) {
    if (!id) return;
    if (!perExec.has(id)) perExec.set(id, { name: '—', meetings: 0, clients: 0 });
    perExec.get(id)[k] += 1;
  };
  meets.forEach(function (m) { bump(m.exec_id, 'meetings'); });
  clients.forEach(function (c) { bump(c.created_by, 'clients'); });
  const cat = { A: 0, B: 0, C: 0, 'Undefined': 0 };
  const intr = { Hot: 0, Warm: 0, Cold: 0 };
  const city = new Map();
  clients.forEach(function (c) {
    const ck = c.category || 'Undefined';
    cat[ck] = (cat[ck] || 0) + 1;
    if (c.interest) intr[c.interest] = (intr[c.interest] || 0) + 1;
    if (c.city && c.city.trim()) { const k = c.city.trim(); city.set(k, (city.get(k) || 0) + 1); }
  });
  const execRows = Array.from(perExec.entries())
    .map(function (e) { return { id: e[0], name: e[1].name, meetings: e[1].meetings, clients: e[1].clients }; })
    .sort(function (a, b) { return b.meetings - a.meetings || b.clients - a.clients || (a.name < b.name ? -1 : 1); });
  const topCities = Array.from(city.entries()).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 5);
  const outMap = new Map();
  meets.forEach(function (m) { const o = String(m.outcome || '').trim(); if (o) outMap.set(o, (outMap.get(o) || 0) + 1); });
  const known = OUTCOMES.slice(0, OUTCOMES.length - 1);
  const out = known.map(function (k) { return [k, outMap.get(k) || 0]; })
    .concat(Array.from(outMap.entries())
      .filter(function (e) { return known.indexOf(e[0]) === -1; })
      .sort(function (a, b) { return b[1] - a[1]; })
      .slice(0, 6));
  return { execRows: execRows, cat: cat, intr: intr, topCities: topCities, out: out };
}

async function renderReport() {
  if (!S.me || S.me.role !== 'owner') { switchTab('today'); return; }
  setHeader('Report', false);
  const c = $('#content');
  c.innerHTML = '<div class="empty">Loading…</div>';

  const startISO = periodStartISO(S.report.period);
  let cq = db.from('clients').select('id, trade_name, city, category, interest, created_by, created_at').order('created_at', { ascending: false }).limit(1000);
  let iq = db.from('interactions').select('id, exec_id, client_id, happened_at, outcome').order('happened_at', { ascending: false }).limit(1000);
  if (startISO) { cq = cq.gte('created_at', startISO); iq = iq.gte('happened_at', startISO); }
  const results = await Promise.all([
    cq, iq,
    db.from('followups').select('id', { count: 'exact', head: true }).eq('type', 'reminder').eq('status', 'pending'),
  ]);
  if (results[0].error || results[1].error) { c.innerHTML = '<div class="empty">Could not load the report — try again.</div>'; return; }
  const clients = results[0].data || [], meets = results[1].data || [];
  const remCount = results[2].count || 0;
  const agg = aggReport(clients, meets, Array.from(S.team.values()));

  const chip = function (p, label) {
    return '<button class="' + (S.report.period === p ? 'on' : '') + '" data-action="report-period" data-p="' + p + '">' + label + '</button>';
  };
  const brk = function (kind, key, label, n) {
    return '<button class="brk-chip"' + (n ? ' data-action="report-clients" data-k="' + kind + '" data-v="' + esc(key) + '"' : ' style="opacity:.45"') + '>' + esc(label) + ' <b>' + n + '</b></button>';
  };

  c.innerHTML =
    (typeof renderReports === 'function' ? '<div class="action-row rep-shortcuts"><button class="btn btn-primary" data-action="rep-open">📊 Full reports</button>' +
      (typeof renderPayDues === 'function' ? '<button class="btn btn-secondary" data-action="dues-open">💰 Payment dues</button>' : '') + '</div>' +
      '<div class="section-label">Reports</div><div class="brk-row rep-books">' +
      [['pay', 'Payment status'], ['payhist', 'Payment dates'], ['items', 'Order items'], ['orders', 'Orders'], ['diamonds', 'Diamonds & stones'],
        ['stock', 'Stock (catalogue)'], ['karigars', 'Karigar metal'], ['summary', 'Month summary']].map((x) => '<button class="brk-chip" data-action="rep-go" data-type="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>' : '') +
    '<div id="report-targets"></div>' +
    '<div class="filter-chips" style="margin-top:14px">' + chip('today', 'Today') + chip('7d', '7 days') + chip('30d', '30 days') + chip('all', 'All') + '</div>' +

    '<div class="stat-row">' +
    '<div class="stat"><div class="st-num">' + clients.length + '</div><div class="st-label">New clients</div></div>' +
    '<div class="stat"><div class="st-num">' + meets.length + '</div><div class="st-label">Meetings</div></div>' +
    '<div class="stat"><div class="st-num">' + remCount + '</div><div class="st-label">Reminders open</div></div>' +
    '</div>' +

    '<div class="section-label">Team activity ' + esc(periodLabel(S.report.period)) + '</div>' +
    '<div class="card">' +
    (agg.execRows.length ? agg.execRows.map(function (r) {
      return '<div class="exec-row" data-action="report-exec" data-id="' + r.id + '" data-name="' + esc(r.name) + '">' +
        '<div class="ex-name">' + esc(r.name) + '</div>' +
        '<div class="ex-nums">' + r.meetings + ' meeting' + (r.meetings === 1 ? '' : 's') + ' · ' + r.clients + ' new</div>' +
        '<div style="color:var(--muted)">›</div></div>';
    }).join('') : '<div class="empty" style="padding:8px">No team members yet.</div>') +
    '</div>' +

    '<div class="section-label">Meetings — by outcome</div>' +
    '<div class="brk-row">' + agg.out.map(function (x) {
      return '<button class="brk-chip"' + (x[1] ? ' data-action="report-outcome" data-v="' + esc(x[0]) + '"' : ' style="opacity:.45"') + '>' + esc(x[0]) + ' <b>' + x[1] + '</b></button>';
    }).join('') + '</div>' +

    '<div class="section-label">New clients — by category</div>' +
    '<div class="brk-row">' + brk('category', 'A', 'Cat A', agg.cat.A) + brk('category', 'B', 'Cat B', agg.cat.B) + brk('category', 'C', 'Cat C', agg.cat.C) + brk('category', 'Undefined', 'Undecided', agg.cat['Undefined']) + '</div>' +

    '<div class="section-label">New clients — by interest</div>' +
    '<div class="brk-row">' + brk('interest', 'Hot', 'Hot', agg.intr.Hot) + brk('interest', 'Warm', 'Warm', agg.intr.Warm) + brk('interest', 'Cold', 'Cold', agg.intr.Cold) + '</div>' +

    (agg.topCities.length ?
      '<div class="section-label">Top cities</div><div class="card">' +
      agg.topCities.map(function (x) {
        return '<div class="exec-row" data-action="report-clients" data-k="city" data-v="' + esc(x[0]) + '">' +
          '<div class="ex-name">' + esc(x[0]) + '</div><div class="ex-nums">' + x[1] + ' client' + (x[1] === 1 ? '' : 's') + '</div><div style="color:var(--muted)">›</div></div>';
      }).join('') + '</div>' : '') +

    '<div id="report-orders"></div>' +
    ((clients.length >= 1000 || meets.length >= 1000) ? '<div class="notice">Showing the most recent 1000 records of this period.</div>' : '') +
    '<div style="height:6px"></div>';
  if (typeof loadReportOrders === 'function') loadReportOrders(S.report.period);
  if (typeof renderTargetsSection === 'function') renderTargetsSection($('#report-targets'));
}

async function reportExecView(execId, execName) {
  const startISO = periodStartISO(S.report.period);
  let q = db.from('interactions').select('id, client_id, happened_at, notes, outcome, clients(trade_name, city)').eq('exec_id', execId).order('happened_at', { ascending: false }).limit(200);
  if (startISO) q = q.gte('happened_at', startISO);
  const { data, error } = await q;
  const c = $('#content');
  if (!c) return;
  if (error) { c.innerHTML = '<div class="empty">Could not load.</div>'; return; }
  const rows = data || [];
  c.innerHTML =
    '<div class="card" style="padding:13px 15px"><b>' + esc(execName) + '</b> <span style="color:var(--muted);font-size:13px">· ' + rows.length + ' meeting' + (rows.length === 1 ? '' : 's') + ' ' + esc(periodLabel(S.report.period)) + '</span></div>' +
    (typeof renderDayRoute === 'function' ? '<button class="btn btn-secondary" data-action="v-route" data-id="' + execId + '" data-name="' + esc(execName) + '" style="margin-bottom:12px">🗺️ Route for a day</button>' : '') +
    (rows.length ? rows.map(function (it) {
      const cl = it.clients || {};
      const note = String(it.notes || '');
      return '<div class="timeline-item">' +
        '<div class="t-meta"><span class="rem-client" data-action="open-client" data-id="' + it.client_id + '">' + esc(cl.trade_name || 'Client') + ' ›</span><span>' + fmtDT(it.happened_at) + '</span></div>' +
        (it.outcome ? '<div style="margin:2px 0 5px">' + outcomeChip(it.outcome) + '</div>' : '') +
        '<div class="t-notes">' + esc(note.slice(0, 160)) + (note.length > 160 ? '…' : '') + '</div>' +
        '</div>';
    }).join('') : '<div class="empty">No meetings recorded ' + esc(periodLabel(S.report.period)) + '.</div>');
}

async function reportMeetsView(v) {
  const startISO = periodStartISO(S.report.period);
  let q = db.from('interactions').select('id, client_id, exec_id, happened_at, notes, clients(trade_name, city)').eq('outcome', v).order('happened_at', { ascending: false }).limit(200);
  if (startISO) q = q.gte('happened_at', startISO);
  const { data, error } = await q;
  const c = $('#content');
  if (!c) return;
  if (error) { c.innerHTML = '<div class="empty">Could not load.</div>'; return; }
  const rows = data || [];
  c.innerHTML =
    '<div class="card" style="padding:13px 15px">' + outcomeChip(v) + ' <span style="color:var(--muted);font-size:13px">' + rows.length + ' meeting' + (rows.length === 1 ? '' : 's') + ' ' + esc(periodLabel(S.report.period)) + '</span></div>' +
    (rows.length ? rows.map(function (it) {
      const cl = it.clients || {};
      const note = String(it.notes || '');
      return '<div class="timeline-item">' +
        '<div class="t-meta"><span class="rem-client" data-action="open-client" data-id="' + it.client_id + '">' + esc(cl.trade_name || 'Client') + ' ›</span><span>' + fmtDT(it.happened_at) + '</span></div>' +
        '<div class="t-notes">' + esc(nameOf(it.exec_id)) + (note ? ' — ' + esc(note.slice(0, 140)) + (note.length > 140 ? '…' : '') : '') + '</div>' +
        '</div>';
    }).join('') : '<div class="empty">No meetings with this outcome ' + esc(periodLabel(S.report.period)) + '.</div>');
}

async function reportClientsView(k, v) {
  const startISO = periodStartISO(S.report.period);
  let q = db.from('clients').select('id, trade_name, company_name, contact_person, city, category, interest').eq(k, v).order('created_at', { ascending: false }).limit(300);
  if (startISO) q = q.gte('created_at', startISO);
  const { data, error } = await q;
  const c = $('#content');
  if (!c) return;
  if (error) { c.innerHTML = '<div class="empty">Could not load.</div>'; return; }
  const rows = data || [];
  c.innerHTML = rows.length ? rows.map(function (cl) {
    return '<div class="list-item" data-action="open-client" data-id="' + cl.id + '">' +
      '<div class="li-main">' +
      '<div class="li-title">' + esc(cl.trade_name) + '</div>' +
      '<div class="li-sub">' + esc([cl.contact_person, cl.city].filter(Boolean).join(' · ') || cl.company_name || '') + '</div>' +
      '<div class="li-chips">' + chipCat(cl.category) + chipInterest(cl.interest) + '</div>' +
      '</div><div style="color:var(--muted)">›</div></div>';
  }).join('') : '<div class="empty">No matching clients ' + esc(periodLabel(S.report.period)) + '.</div>';
}

/* ============================================================
   EXPORT (owner backup — 3 Excel-ready CSV files)
   ============================================================ */
async function fetchAll(table, orderCol) {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select('*').order(orderCol, { ascending: true }).range(from, from + 999);
    if (error) throw new Error(table + ': ' + error.message);
    for (const row of data || []) all.push(row);
    if (!data || data.length < 1000) break;
  }
  return all;
}

function csvVal(v) {
  if (v === null || v === undefined) return '';
  const s = String(v).replace(/"/g, '""');
  return /[",\n\r]/.test(s) ? '"' + s + '"' : s;
}
function buildCsv(headers, rows) {
  return '﻿' + headers.map(csvVal).join(',') + '\r\n' +
    rows.map((r) => r.map(csvVal).join(',')).join('\r\n');
}
function downloadFile(name, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
function fmtExp(iso) { return iso ? fmtDT(iso) : ''; }
function ynExp(b) { return b === true ? 'Yes' : b === false ? 'No' : ''; }

async function exportAllData() {
  const btn = $('#export-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Preparing…'; }
  try {
    const results = await Promise.all([
      fetchAll('clients', 'created_at'),
      fetchAll('interactions', 'happened_at'),
      fetchAll('followups', 'created_at'),
      fetchAll('profiles', 'created_at'),
    ]);
    const clients = results[0], interactions = results[1], followups = results[2], profiles = results[3];
    const pName = new Map(profiles.map((p) => [p.id, p.full_name || p.email || '']));
    const cName = new Map(clients.map((c) => [c.id, c.trade_name]));

    // 7-day photo links
    const paths = [];
    clients.forEach((c) => {
      if (c.card_image_path) paths.push(c.card_image_path);
      if (c.card_image_back_path) paths.push(c.card_image_back_path);
    });
    const urlMap = new Map();
    for (let i = 0; i < paths.length; i += 100) {
      const { data } = await db.storage.from('cards').createSignedUrls(paths.slice(i, i + 100), 604800);
      (data || []).forEach((d) => { if (d.signedUrl) urlMap.set(d.path, d.signedUrl); });
    }

    const today = todayStr();
    downloadFile('bj-clients-' + today + '.csv', buildCsv(
      ['Trade name', 'Company', 'Contact person', 'Designation', 'Mobile', 'Other mobiles', 'Email', "Owner's name", 'Address', 'Area', 'City', 'State', 'Polki jewellery', 'Category', 'Order type', 'Interest', 'Entry', 'Added by', 'Added on', 'Card front (7-day link)', 'Card back (7-day link)', 'GSTIN', 'Shop location'],
      clients.map((c) => [c.trade_name, c.company_name, c.contact_person, c.designation, c.mobile, c.phone_other, c.email, c.owner_name, c.address, c.area, c.city, c.state, ynExp(c.is_polki_buyer), c.category, c.order_type, c.interest, c.entry_source, pName.get(c.created_by) || '', fmtExp(c.created_at), urlMap.get(c.card_image_path) || '', urlMap.get(c.card_image_back_path) || '', c.gstin || '', c.lat != null ? c.lat + ',' + c.lng : ''])));

    await new Promise((r) => setTimeout(r, 450));
    downloadFile('bj-meetings-' + today + '.csv', buildCsv(
      ['Date', 'Client', 'Executive', 'Outcome', 'What happened', 'Interest after'],
      interactions.map((it) => [fmtExp(it.happened_at), cName.get(it.client_id) || '', pName.get(it.exec_id) || '', it.outcome, it.notes, it.interest_after])));

    await new Promise((r) => setTimeout(r, 450));
    downloadFile('bj-followups-' + today + '.csv', buildCsv(
      ['Client', 'Type', 'Details', 'Due date', 'Status', 'Assigned to', 'Created by', 'Created on', 'Done on'],
      followups.map((f) => [cName.get(f.client_id) || '', f.type, f.content, f.due_date || '', f.status, pName.get(f.assigned_to) || '', pName.get(f.created_by) || '', fmtExp(f.created_at), fmtExp(f.done_at)])));

    let nFiles = 3;
    const failed = [];
    const extra = [
      ['orders', 2, typeof exportOrdersData === 'function' ? () => exportOrdersData(pName, cName, today) : null],
      ['catalogue', 1, typeof exportCatalogueData === 'function' ? () => exportCatalogueData(pName, today) : null],
      ['karigars', 1, typeof exportKarigarData === 'function' ? () => exportKarigarData(pName, today) : null],
      ['vendors', 2, typeof exportVendorData === 'function' && S.dbv6 ? () => exportVendorData(pName, today) : null],
      ['client notes', 1, typeof exportNotesData === 'function' && S.dbv6 ? () => exportNotesData(pName, cName, today) : null],
      ['payment dates', 1, typeof exportPayData === 'function' ? () => exportPayData(pName, cName, today) : null],
    ];
    for (const x of extra) {
      if (!x[2]) continue;
      try { await x[2](); nFiles += x[1]; } catch (e) { failed.push(x[0]); }
    }
    toast(nFiles + ' files downloaded ✓' + (failed.length ? ' — could not export: ' + failed.join(', ') : ''), failed.length ? 'err' : 'ok');
  } catch (e) {
    toast('Export failed — please try again.', 'err');
  }
  if (btn) { btn.disabled = false; btn.textContent = '⬇ Export all data'; }
}

/* ============================================================
   MORE (profile / team / settings)
   ============================================================ */
async function renderMore() {
  setHeader('More', false);
  const isOwner = S.me.role === 'owner';
  let html =
    '<div class="card"><h3>' + esc(S.me.full_name || 'Me') + '</h3>' +
    '<span class="chip chip-role">' + (isOwner ? 'Owner' : 'Marketing Executive') + '</span>' +
    '<div style="margin-top:12px"><button class="btn btn-small btn-danger-ghost" data-action="logout">Sign out</button></div></div>';

  if (isOwner) {
    html += '<div class="section-label">Team</div><div class="card" id="team-card"><div class="empty" style="padding:8px">Loading…</div></div>' +
      '<button class="btn btn-secondary" data-action="team-add" style="margin-bottom:14px">＋ Add team member</button>' +

      '<div class="section-label">Card scanning</div>' +
      '<div class="card" id="gemini-card">' +
      '<p style="margin:0 0 10px;font-size:14px;color:' + (S.geminiConfigured ? 'var(--green)' : 'var(--muted)') + '">' +
      (S.geminiConfigured ? '✓ Card scanning is ON.' : 'Not set up yet — executives can still type details and attach card photos.') + '</p>' +
      '<div class="field"><label>Google AI Studio key ' + (S.geminiConfigured ? '(paste to replace)' : '') + '</label>' +
      '<input type="password" id="gemini-key" placeholder="AIza…">' +
      '<div class="hint">Free key from <b>aistudio.google.com/apikey</b> — sign in with Google → Create API key → paste here. Takes 2 minutes, no card required.</div></div>' +
      '<button class="btn btn-primary" data-action="save-gemini" id="gemini-btn">Save key</button>' +
      '</div>' +

      '<div class="section-label">Data backup</div>' +
      '<div class="card">' +
      '<p style="margin:0 0 10px;font-size:14px;color:var(--muted)">Every entry is saved instantly to the secure database, and an automatic snapshot of everything is kept daily for 30 days. Download your complete data (Excel-ready files) any time:</p>' +
      '<button class="btn btn-primary" data-action="export-data" id="export-btn">⬇ Export all data</button>' +
      '</div>';
  }
  const mrow = (action, icon, title, sub) => '<button class="more-row" data-action="' + action + '"><span class="mr-ic">' + icon + '</span><span class="mr-t"><b>' + title + '</b><span>' + sub + '</span></span><span class="mr-go">›</span></button>';
  html += '<div class="section-label">Business tools</div><div class="card more-list">' +
    (isOwner && typeof renderReports === 'function' ? mrow('rep-open', '📊', 'Reports', 'Payment status, orders, items, diamonds, stock — filter and download') : '') +
    (typeof renderPayDues === 'function' ? mrow('dues-open', '💰', 'Payment dues', 'Which party has to pay and by when · reminders') : '') +
    (typeof renderVendors === 'function' ? mrow('v-list', '🏭', 'Vendors', 'Who makes your orders · diamonds to give them') : '') +
    (typeof renderKarigars === 'function' ? mrow('k-list', '🔨', 'Karigars', 'Metal given and received back') : '') +
    (isOwner && typeof renderBizForm === 'function' ? mrow('biz-open', '🏷️', 'Business details', 'Address, GSTIN — printed on PDFs') : '') +
    (typeof renderLangPicker === 'function' ? mrow('lang-open', '🌐', 'Language / भाषा / ભાષા', 'English, हिन्दी, ગુજરાતી') : '') +
    '</div>';
  html += '<div class="empty" style="padding-top:6px;font-size:12.5px">' + esc(BRAND) + ' · Marketing app</div>';
  $('#content').innerHTML = html;

  if (isOwner) renderTeamList();
}

async function renderTeamList() {
  const el = $('#team-card');
  if (!el) return;
  const { data, error } = await db.from('profiles').select('*').order('created_at', { ascending: true });
  if (error) { el.innerHTML = '<div class="empty" style="padding:8px">Could not load team.</div>'; return; }
  S.team = new Map((data || []).map((p) => [p.id, p]));
  el.innerHTML = (data || []).map((p) => {
    const me = p.id === S.me.id;
    return '<div class="member-row">' +
      '<div class="m-main"><div class="m-name">' + esc(p.full_name || '(no name)') + (me ? ' (you)' : '') + '</div>' +
      '<div class="m-sub">' + esc(p.email || '') + '</div></div>' +
      '<span class="chip ' + (p.active ? 'chip-role' : 'chip-off') + '">' + (p.role === 'owner' ? 'Owner' : (p.active ? 'Active' : 'Off')) + '</span>' +
      (me ? '' :
        '<div class="m-actions">' +
        '<button class="btn btn-small btn-ghost" data-action="member-resetpw" data-id="' + p.id + '">Reset PW</button>' +
        '<button class="btn btn-small ' + (p.active ? 'btn-danger-ghost' : 'btn-ghost') + '" data-action="member-toggle" data-id="' + p.id + '" data-active="' + p.active + '">' + (p.active ? 'Deactivate' : 'Activate') + '</button>' +
        '</div>') +
      '</div>';
  }).join('') || '<div class="empty" style="padding:8px">Only you so far — add your executives.</div>';
}

function renderTeamAddModal() {
  const ov = openModal(
    '<h3>Add team member</h3><p>They sign in with this email &amp; password — share it with them on WhatsApp or in person.</p>' +
    '<div class="field"><label>Full name</label><input type="text" id="tm-name"></div>' +
    '<div class="field"><label>Email</label><input type="email" id="tm-email" placeholder="name@gmail.com"></div>' +
    '<div class="field"><label>Password (min 8 characters)</label><input type="text" id="tm-pass" autocomplete="off"></div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button>' +
    '<button class="btn btn-primary" data-m="yes">Create login</button></div>');
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    const name = $('#tm-name').value.trim(), email = $('#tm-email').value.trim(), pass = $('#tm-pass').value;
    if (!name || !email || pass.length < 8) { toast('Fill name, email, and a password of 8+ characters.', 'err'); return; }
    e.target.disabled = true; e.target.textContent = 'Creating…';
    const r = await callAdmin('create_user', { email, password: pass, full_name: name });
    if (r.error) { e.target.disabled = false; e.target.textContent = 'Create login'; toast(r.error, 'err'); return; }
    closeModal();
    toast(name + ' added ✓ — share their email & password with them.', 'ok');
    renderTeamList();
  };
}

function renderResetPwModal(userId) {
  const ov = openModal(
    '<h3>Reset password</h3><p>Set a new password for ' + esc(nameOf(userId)) + ' and share it with them.</p>' +
    '<div class="field"><label>New password (min 8 characters)</label><input type="text" id="rp-pass" autocomplete="off"></div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button>' +
    '<button class="btn btn-primary" data-m="yes">Set password</button></div>');
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    const pass = $('#rp-pass').value;
    if (pass.length < 8) { toast('Password must be at least 8 characters.', 'err'); return; }
    e.target.disabled = true;
    const r = await callAdmin('reset_password', { user_id: userId, password: pass });
    if (r.error) { e.target.disabled = false; toast(r.error, 'err'); return; }
    closeModal(); toast('Password updated ✓', 'ok');
  };
}

function toggleMember(userId, currentlyActive) {
  confirmModal(
    currentlyActive ? 'Deactivate this member?' : 'Reactivate this member?',
    currentlyActive ? 'They will not be able to sign in until you reactivate them. Their records stay safe.' : 'They will be able to sign in again.',
    currentlyActive ? 'Deactivate' : 'Activate',
    async () => {
      const r = await callAdmin('set_active', { user_id: userId, active: !currentlyActive });
      if (r.error) { toast(r.error, 'err'); return; }
      toast('Done ✓', 'ok');
      renderTeamList();
    }, currentlyActive);
}

async function saveGeminiKey() {
  const key = $('#gemini-key').value.trim();
  if (!key) { toast('Paste the key first.', 'err'); return; }
  const btn = $('#gemini-btn'); btn.disabled = true; btn.textContent = 'Saving…';
  const r = await callAdmin('set_secret', { key: 'gemini_key', value: key });
  btn.disabled = false; btn.textContent = 'Save key';
  if (r.error) { toast(r.error, 'err'); return; }
  S.geminiConfigured = true;
  toast('Card scanning is now ON ✓', 'ok');
  renderMore();
}

/* ============================================================
   BOOT
   ============================================================ */
async function enterApp() {
  // profile may take a moment to exist right after account creation
  let profile = null;
  for (let i = 0; i < 3 && !profile; i++) {
    const { data } = await db.from('profiles').select('*').eq('id', S.session.user.id).maybeSingle();
    profile = data;
    if (!profile) await new Promise((r) => setTimeout(r, 700));
  }
  if (!profile) { toast('Could not load your profile — please try again.', 'err'); await db.auth.signOut(); showAuth(); return; }
  if (!profile.active) { toast('Your account is deactivated. Please contact the owner.', 'err'); await db.auth.signOut(); showAuth(); return; }
  S.me = profile;

  const [teamRes, statusRes] = await Promise.all([
    db.from('profiles').select('*'),
    callAdmin('status'),
  ]);
  S.team = new Map((teamRes.data || []).map((p) => [p.id, p]));
  S.geminiConfigured = !!statusRes.gemini_configured;
  await Promise.all((window.LOGIN_HOOKS || []).map((h) => Promise.resolve().then(h).catch(() => null)));

  renderShell();
  switchTab('today');
}

/* A new version of the app was published while this screen was open → offer a one-tap update.
   index.html carries the version number (var v = '…'). */
function watchForUpdates() {
  const mine = String(window.APP_V || '');
  if (!mine) return;
  let shown = false, last = 0;
  const check = async () => {
    if (shown || Date.now() - last < 5 * 60000) return;
    last = Date.now();
    try {
      const r = await fetch('index.html', { cache: 'no-store' });
      if (!r.ok) return;
      const m = /var v = '([^']+)'/.exec(await r.text());
      if (m && m[1] !== mine) { shown = true; showUpdateBar(); }
    } catch (e) { /* offline — try again later */ }
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  setInterval(check, 30 * 60000);
  setTimeout(check, 15000);
}
function showUpdateBar() {
  if (document.querySelector('.update-bar')) return;
  const b = document.createElement('div');
  b.className = 'update-bar';
  b.innerHTML = '<span>A new version of the app is ready.</span><button type="button" class="ub-go">Update</button>' +
    '<button type="button" class="ub-x" aria-label="Later">✕</button>';
  b.querySelector('.ub-go').onclick = () => location.reload();
  b.querySelector('.ub-x').onclick = () => b.remove();
  document.body.appendChild(b);
}

async function boot() {
  if ('serviceWorker' in navigator) {
    try { navigator.serviceWorker.register('sw.js'); } catch (e) {}
  }
  watchForUpdates();
  const { data: { session } } = await db.auth.getSession();
  S.session = session;

  db.auth.onAuthStateChange((event, sess) => {
    const had = !!S.session;
    S.session = sess;
    if (event === 'SIGNED_IN' && !had) enterApp();
    if (event === 'SIGNED_OUT') { S.me = null; showAuth(); }
  });

  if (session) enterApp();
  else showAuth();
}

boot();