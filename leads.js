/* ============================================================
   LEADS — following up the clients who have not ordered yet
   · After a new client is saved: one tap for a follow-up
     reminder, and — when you are at their shop — the first visit
     is recorded and the shop's location saved.
   · One-tap reminders on the client page (3 / 7 / 15 days).
   · Clients → "No order yet": every client without an order,
     Hot first, then Warm and Cold, the longest waiting on top,
     with WhatsApp and call buttons.
   · Clients → "Near me": clients whose shop location is saved,
     nearest first, with call, WhatsApp and directions.
   Loaded after util.js, before app.js.
   ============================================================ */
'use strict';

const LEAD_COLS = 'id, trade_name, company_name, contact_person, city, area, category, interest, mobile, created_at, created_by';
const WA_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2.2A9.7 9.7 0 0 0 3.7 16.9L2.4 21.6l4.8-1.3A9.7 9.7 0 1 0 12 2.2zm0 17.7c-1.5 0-3-.4-4.2-1.2l-.3-.2-2.9.8.8-2.8-.2-.3A7.9 7.9 0 1 1 12 19.9zm4.4-5.9c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1l-.8.9c-.1.2-.3.2-.5.1a6.5 6.5 0 0 1-3.2-2.8c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.5-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 1.9s.8 2.2.9 2.4c.1.2 1.6 2.5 3.9 3.5 1.5.6 2 .7 2.8.6.4-.1 1.4-.6 1.6-1.1.2-.5.2-1 .1-1.1l-.6-.2z"/></svg>';
const CALL_SVG = '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 4h3.5l1.6 4.2-2.2 1.4a11 11 0 0 0 6.5 6.5l1.4-2.2L20 15.5V19a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4z" stroke-linejoin="round"/></svg>';
const MAP_SVG = '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" stroke-linejoin="round"/><circle cx="12" cy="10" r="2.3"/></svg>';

/* ---------------- a reminder in one tap ---------------- */
async function addReminder(clientId, days, quiet) {
  const due = todayStr(days);
  const { error } = await db.from('followups').insert({
    client_id: clientId, type: 'reminder', content: 'Follow up', due_date: due, assigned_to: S.me.id, created_by: S.me.id,
  });
  if (error) { toast('Could not set the reminder — try again.', 'err'); return false; }
  if (!quiet) toast('Reminder set for ' + fmtD(due) + ' ✓', 'ok');
  return true;
}
function quickRemindHTML(clientId) {
  return '<div class="fu-quick"><span class="fq-l">⏰ Remind me in</span>' +
    [3, 7, 15].map((d) => '<button type="button" data-action="fu-quick" data-id="' + clientId + '" data-d="' + d + '">' + d + ' days</button>').join('') + '</div>';
}
onAct('fu-quick', async (el) => {
  el.disabled = true;
  if (await addReminder(el.dataset.id, +el.dataset.d)) openClient(el.dataset.id, true);
  else el.disabled = false;
});

/* ---------------- a new client was just saved ---------------- */
/* "at their shop" is never ticked for you: cards are often scanned later, at the office or a fair —
   a visit would be counted and the wrong place saved as the shop */
function afterNewClient(cl) {
  const loc = appOn('location') && typeof getPosition === 'function';
  let days = null, posP = null;
  const want = () => { if (!posP && loc) posP = getPosition(9000); };   // start finding the place as soon as it is ticked
  const ov = openModal(
    '<h3>Client saved 🎉</h3>' +
    '<div class="nc-label">Remind me to follow up</div>' +
    '<div class="seg nc-days">' + [3, 7, 15].map((d) => '<button type="button" data-d="' + d + '">In ' + d + ' days</button>').join('') + '</div>' +
    (loc ? '<label class="nc-here"><input type="checkbox" id="nc-here">' +
      '<span>I am at their shop now — record this visit and save the shop\'s location</span></label>' : '') +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="done">Done</button><button class="btn btn-primary" data-m="meet">Record meeting</button></div>');
  ov.querySelectorAll('.nc-days button').forEach((b) => {
    b.onclick = () => {
      days = days === +b.dataset.d ? null : +b.dataset.d;
      ov.querySelectorAll('.nc-days button').forEach((x) => x.classList.toggle('on', +x.dataset.d === days));
    };
  });
  const here = ov.querySelector('#nc-here');
  if (here) here.onchange = () => { if (here.checked) want(); };
  ov.querySelector('[data-m=meet]').onclick = async (e) => {
    e.target.disabled = true;
    closeModal();
    if (days) await addReminder(cl.id, days, false);
    openInteractionForm(cl, true);   // the meeting saves the location itself
  };
  ov.querySelector('[data-m=done]').onclick = async (e) => {
    e.target.disabled = true;
    const atShop = !!(here && here.checked);
    closeModal();
    if (days) await addReminder(cl.id, days, atShop);
    if (atShop) await recordFirstVisit(cl, posP || getPosition(9000));
    openClient(cl.id, true);
  };
}

/* the first visit, with where it happened (the shop's location is saved when the reading is good) */
async function recordFirstVisit(cl, posP) {
  const ov = typeof busyOverlay === 'function' ? busyOverlay('Recording the visit…') : null;
  let pos = null;
  try { pos = await posP; } catch (e) { pos = null; }
  const { error } = await db.from('interactions').insert(Object.assign({
    client_id: cl.id, exec_id: S.me.id, outcome: 'Meeting', notes: 'First visit — client added',
  }, visitFields(pos)));
  if (!error) await maybeSaveShopLocation(cl, pos);
  if (ov) ov.remove();
  S.lastMet = null; S.leadCache = null;
  if (error) { toast('Could not record the visit — tap ＋ Meeting on the client page.', 'err'); return; }
  toast(pos && pos.status === 'ok' && pos.acc <= 250 ? 'Visit recorded · shop location saved ✓' : 'Visit recorded ✓', 'ok');
}

/* the clients / orders behind "No order yet" and "Near me", kept for a minute while you type */
function leadCache(kind) {
  const C = S.leadCache;
  return C && C.kind === kind && Date.now() - C.at < 60000 ? C : null;
}

/* ---------------- Clients → No order yet ---------------- */
function leadWaText(c) {
  const who = String(c.contact_person || '').trim().split(/\s+/)[0];
  const me = String((S.me && S.me.full_name) || '').trim().split(/\s+/)[0];
  return 'Namaste' + (who ? ' ' + who + ' ji' : '') + ' 🙏\n' +
    (me ? me + ' from ' : '') + bizName() + ' here. Thank you for your time when we met.\n' +
    'Shall I send you our latest designs, or a quotation for your next order?';
}

/* x: { km, dir } near me · { quoted } no order yet · { sleep: { n, last } } sleeping */
function leadRowHTML(c, met, x) {
  const m = met && met.get(c.id);
  const sl = x && x.sleep;
  const when = sl ? 'Last order ' + fmtD(sl.last) + ' · ' + daysBetween(sl.last, todayStr()) + ' days ago' + (m ? ' · last meeting ' + fmtD(m) : '')
    : m ? 'Last meeting ' + fmtD(m) : (c.created_at ? 'Added ' + fmtD(c.created_at) + ' · no meeting yet' : 'No meeting yet');
  const ext = '" target="_blank" rel="noopener" data-action="call">';   // data-action="call": the link opens, not the client
  const acts = (c.mobile ? '<a class="la la-wa" href="' + esc(waUrl(c.mobile, sl ? sleepWaText(c) : leadWaText(c))) + ext + WA_SVG + '<span>WhatsApp</span></a>' +
      '<a class="la la-call" href="' + esc(telHref(c.mobile)) + '" data-action="call">' + CALL_SVG + '<span>Call</span></a>' : '') +
    (x && x.dir && c.lat != null ? '<a class="la la-map" href="' + esc(mapsDirUrl(c.lat, c.lng)) + ext + MAP_SVG + '<span>Directions</span></a>' : '');
  return '<div class="list-item lead-item" data-action="open-client" data-id="' + c.id + '">' +
    '<div class="li-main">' +
    '<div class="li-title">' + esc(c.trade_name) + '</div>' +
    '<div class="li-sub">' + esc([c.contact_person, c.area, c.city].filter(Boolean).join(' · ') || c.company_name || '') + '</div>' +
    '<div class="li-chips">' + (x && x.km != null ? '<span class="chip chip-dist">' + esc(fmtDist(x.km)) + '</span>' : '') +
    (sl ? '<span class="chip chip-orders">' + esc(sl.n === 1 ? '1 order before' : sl.n + ' orders before') + '</span>' : '') +
    chipCat(c.category) + chipInterest(c.interest) + (x && x.quoted ? '<span class="chip chip-st-quote">Quotation sent</span>' : '') + '</div>' +
    '<div class="li-when">' + esc(when) + '</div>' +
    (acts ? '<div class="lead-acts">' + acts + '</div>' : '') +
    '</div><div class="li-go">›</div></div>';
}

function textMatch(c, q) {
  if (!q) return true;
  const s = q.toLowerCase();
  return [c.trade_name, c.company_name, c.contact_person, c.mobile, c.city, c.area].some((v) => String(v || '').toLowerCase().indexOf(s) > -1);
}

async function runLeadList(qRaw) {
  const box = $('#search-results');
  if (!box) return;
  const q = String(qRaw || '').trim();
  const seq = S.searchSeq = (S.searchSeq || 0) + 1;
  let clients, orders, met;
  const C = leadCache('lead');
  if (C) ({ clients, orders, met } = C);
  else {
    try {
      [clients, orders, met] = await Promise.all([
        fetchPaged(() => db.from('clients').select(LEAD_COLS).order('created_at', { ascending: false }).order('id', { ascending: true })),
        fetchPaged(() => db.from('orders').select('client_id, status').order('id', { ascending: true })),
        lastMeetingMap(),
      ]);
    } catch (e) {
      if (seq === S.searchSeq) box.innerHTML = '<div class="empty">Could not load clients — try again.</div>';
      return;
    }
    S.leadCache = { kind: 'lead', at: Date.now(), clients, orders, met };
  }
  if (seq !== S.searchSeq || !$('#search-results')) return;
  const live = new Set(), quoted = new Set();
  orders.forEach((o) => { if (isLive(o)) live.add(o.client_id); else if (o.status === 'quote') quoted.add(o.client_id); });
  const list = clients.filter((c) => !live.has(c.id) && textMatch(c, q));
  if (!list.length) {
    box.innerHTML = '<div class="empty"><div class="big">🎯</div>' + (q ? 'No client without an order matches <b class="noi18n">"' + esc(q) + '"</b>' : 'Every client has an order — well done!') + '</div>';
    return;
  }
  const last = (c) => { const m = met.get(c.id) || ''; const a = c.created_at || ''; return m > a ? m : a; };
  const groups = [['Hot', 'Hot'], ['Warm', 'Warm'], ['Cold', 'Cold'], ['', 'Interest not set']];
  let html = '<div class="cl-count">No order yet (' + list.length + ')</div>' +
    '<div class="hint" style="margin:-4px 2px 8px">Hot first. In each group, the ones waiting longest are on top.</div>';
  groups.forEach((g) => {
    const part = list.filter((c) => (g[0] ? c.interest === g[0] : ['Hot', 'Warm', 'Cold'].indexOf(c.interest) === -1))
      .sort((a, b) => (last(a) < last(b) ? -1 : last(a) > last(b) ? 1 : 0));
    if (!part.length) return;
    html += '<div class="section-label cl-group lead-' + (g[0] || 'none').toLowerCase() + '">' + esc(g[1]) + ' · ' + part.length + '</div>' +
      part.map((c) => leadRowHTML(c, met, { quoted: quoted.has(c.id) })).join('');
  });
  box.innerHTML = html;
}

/* ---------------- Clients → Sleeping ----------------
   Clients who ordered before, have no order in work now and no new order
   for 2 (or 3, 6) months — so repeat business is not lost. */
const SLEEP_CHOICES = [[2, '2 months'], [3, '3 months'], [6, '6 months']];
function sleepMonths() { const m = +S.sleepM; return SLEEP_CHOICES.some((x) => x[0] === m) ? m : 2; }
function sleepWaText(c) {
  const who = String(c.contact_person || '').trim().split(/\s+/)[0];
  const me = String((S.me && S.me.full_name) || '').trim().split(/\s+/)[0];
  return 'Namaste' + (who ? ' ' + who + ' ji' : '') + ' 🙏\n' +
    (me ? me + ' from ' : '') + bizName() + ' here. It has been a while!\n' +
    'We have new designs ready — shall I send you photos?';
}
/* → [{ c, x: { n, last } }], the longest asleep first */
function sleepingClients(clients, orders, months) {
  const d = new Date(); d.setMonth(d.getMonth() - months);
  const cut = ymd(d);
  const info = new Map();
  orders.forEach((o) => {
    if (!isLive(o)) return;
    const x = info.get(o.client_id) || { n: 0, last: '', open: false };
    x.n++;
    if (o.order_date && o.order_date > x.last) x.last = o.order_date;
    if (isOpenStatus(o.status)) x.open = true;
    info.set(o.client_id, x);
  });
  return clients.map((c) => ({ c, x: info.get(c.id) }))
    .filter((r) => r.x && !r.x.open && r.x.last && r.x.last < cut)
    .sort((a, b) => (a.x.last < b.x.last ? -1 : a.x.last > b.x.last ? 1 : b.x.n - a.x.n));
}
async function sleepData() {
  const C = leadCache('sleep');
  if (C) return C;
  const [clients, orders, met] = await Promise.all([
    fetchPaged(() => db.from('clients').select(LEAD_COLS).order('created_at', { ascending: false }).order('id', { ascending: true })),
    fetchPaged(() => db.from('orders').select('client_id, status, order_date').order('id', { ascending: true })),
    lastMeetingMap(),
  ]);
  S.leadCache = { kind: 'sleep', at: Date.now(), clients, orders, met };
  return S.leadCache;
}

async function runSleepList(qRaw) {
  const box = $('#search-results');
  if (!box) return;
  const q = String(qRaw || '').trim();
  const seq = S.searchSeq = (S.searchSeq || 0) + 1;
  let D;
  try { D = await sleepData(); } catch (e) {
    if (seq === S.searchSeq) box.innerHTML = '<div class="empty">Could not load clients — try again.</div>';
    return;
  }
  if (seq !== S.searchSeq || !$('#search-results')) return;
  const months = sleepMonths();
  const all = sleepingClients(D.clients, D.orders, months);
  const list = all.filter((r) => textMatch(r.c, q));
  const pick = '<div class="filter-chips sl-pick"><span class="cl-sort-lbl">No order for</span>' +
    SLEEP_CHOICES.map((x) => '<button class="' + (x[0] === months ? 'on' : '') + '" data-action="sleep-m" data-m="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>';
  if (!list.length) {
    box.innerHTML = pick + '<div class="empty"><div class="big">😊</div>' + (q && all.length ? 'No sleeping client matches <b class="noi18n">"' + esc(q) + '"</b>'
      : 'No sleeping clients right now.') + '</div>';
    return;
  }
  box.innerHTML = pick + '<div class="cl-count">Sleeping (' + list.length + ')</div>' +
    '<div class="hint" style="margin:-4px 2px 8px">Ordered before, nothing in work now. The longest without an order are on top.</div>' +
    list.slice(0, 200).map((r) => leadRowHTML(r.c, D.met, { sleep: r.x })).join('') +
    (list.length > 200 ? '<div class="hint" style="text-align:center;margin:0 0 12px">' + esc('+ ' + (list.length - 200) + ' more — search by name or city') + '</div>' : '');
}
onAct('sleep-m', (el) => { S.sleepM = +el.dataset.m; const inp = $('#search-input'); runSearch(inp ? inp.value : ''); });

/* Today: one line about the sleeping clients (worked out at most every 10 minutes) */
async function loadTodaySleep() {
  const el = $('#today-sleep');
  if (!el) return;
  let n = S.sleepToday && Date.now() - S.sleepToday.at < 600000 ? S.sleepToday.n : null;
  if (n == null) {
    try {
      const [clients, orders] = await Promise.all([
        fetchPaged(() => db.from('clients').select('id').order('id', { ascending: true })),
        fetchPaged(() => db.from('orders').select('client_id, status, order_date').order('id', { ascending: true })),
      ]);
      n = sleepingClients(clients, orders, 2).length;
      S.sleepToday = { at: Date.now(), n };
    } catch (e) { return; }
  }
  if (!$('#today-sleep')) return;
  el.innerHTML = n ? '<button class="sleep-line" data-action="sleep-open"><span class="sl-ic">😴</span><span class="sl-t"><b>' + esc(n === 1 ? '1 sleeping client' : n + ' sleeping clients') + '</b>' +
    '<span>Ordered before, no order for 2 months — say hello</span></span><span class="mr-go">›</span></button>' : '';
}
onAct('sleep-open', () => { S.clientShow = 'sleep'; S.sleepM = 2; S.leadCache = null; switchTab('find'); });

/* ---------------- Clients → Near me ---------------- */
async function runNearList(qRaw) {
  const box = $('#search-results');
  if (!box) return;
  const q = String(qRaw || '').trim();
  const seq = S.searchSeq = (S.searchSeq || 0) + 1;
  let pos = S.nearPos && Date.now() - S.nearPos.at < 120000 ? S.nearPos.pos : null;   // typing doesn't ask again
  if (!pos) {
    box.innerHTML = '<div class="empty"><div class="big">📍</div>Finding where you are…</div>';
    pos = await getPosition(12000);
    if (pos.status === 'ok') S.nearPos = { at: Date.now(), pos };
  }
  if (seq !== S.searchSeq || !$('#search-results')) return;
  if (pos.status !== 'ok') {
    box.innerHTML = '<div class="empty"><div class="big">📍</div>' +
      (pos.status === 'denied' ? 'Location permission is off — allow it for this app in your phone settings, then try again.' : 'Could not get your location — try again outside or near a window.') +
      '<br><button class="btn btn-small btn-secondary" data-action="near-retry" style="margin-top:12px">Try again</button></div>';
    return;
  }
  let rows, met, nNo;
  const C = leadCache('near');
  if (C) ({ rows, met, nNo } = C);
  else {
    let noLoc;
    try {
      [rows, met, noLoc] = await Promise.all([
        fetchPaged(() => db.from('clients').select(LEAD_COLS + ', lat, lng').not('lat', 'is', null).order('id', { ascending: true })),
        lastMeetingMap(),
        db.from('clients').select('id', { count: 'exact', head: true }).is('lat', null),
      ]);
    } catch (e) {
      if (seq === S.searchSeq) box.innerHTML = '<div class="empty">Could not load clients — try again.</div>';
      return;
    }
    nNo = (noLoc && noLoc.count) || 0;
    S.leadCache = { kind: 'near', at: Date.now(), rows, met, nNo };
  }
  if (seq !== S.searchSeq || !$('#search-results')) return;
  const list = rows.filter((c) => textMatch(c, q))
    .map((c) => ({ c, km: distKm(pos.lat, pos.lng, c.lat, c.lng) }))
    .sort((a, b) => a.km - b.km);
  const tip = '<div class="notice">' + (nNo ? '<b>' + nNo + '</b> ' + (nNo === 1 ? 'client has no shop location yet.' : 'clients have no shop location yet.') + ' ' : '') +
    'A shop\'s location is saved when you record a visit there, or add a new client while you are at the shop.</div>';
  if (!list.length) {
    box.innerHTML = (q && rows.length ? '<div class="empty">No client near you matches <b class="noi18n">"' + esc(q) + '"</b></div>' : '<div class="empty"><div class="big">🗺️</div>No client has a saved shop location yet.</div>') + tip;
    return;
  }
  const shown = list.slice(0, 100);
  box.innerHTML = '<div class="cl-count">Nearest first (' + list.length + ')</div>' +
    (pos.acc > 150 ? '<div class="hint" style="margin:-4px 2px 8px">' + esc('Your location is accurate to about ' + Math.round(pos.acc) + ' m.') + '</div>' : '') +
    shown.map((x) => leadRowHTML(x.c, met, { km: x.km, dir: true })).join('') +
    (list.length > shown.length ? '<div class="hint" style="text-align:center;margin:0 0 12px">' + esc('+ ' + (list.length - shown.length) + ' further away') + '</div>' : '') + tip;
}

onAct('near-retry', () => { S.nearPos = null; const inp = $('#search-input'); runSearch(inp ? inp.value : ''); });
