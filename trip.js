/* ============================================================
   TRIP PLANNER — Clients → 🧳 Trip
   Pick a city: every shop there, with its last meeting, orders in
   work, a payment due and "sleeping" (ordered before, nothing in work,
   no order for 2 months). Tick the shops to visit — the plan stays on
   this phone, goes to WhatsApp in one tap and opens as a route in
   Google Maps. A shop met today (by anyone) shows "Met today".
   Loaded after leads.js (lead rows, caches), before app.js.
   ============================================================ */
'use strict';

const TRIP_SORTS = [['old', 'Not met longest'], ['hot', 'Hot first'], ['area', 'By area']];
/* "Visit due first" when the visit plan is on (plan.js) */
function tripSorts() { return typeof visitPlanOn === 'function' && visitPlanOn() ? TRIP_SORTS.concat([['due', 'Visit due first']]) : TRIP_SORTS; }
function tripCityKey(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
function tripStoreKey() { return 'trip:' + ((S.me && S.me.id) || ''); }
function tripLoad() { try { return JSON.parse(localStorage.getItem(tripStoreKey()) || 'null') || {}; } catch (e) { return {}; } }
function tripSave(t) { try { localStorage.setItem(tripStoreKey(), JSON.stringify(t)); } catch (e) { /* private mode */ } }
function tripSortKey() { return tripSorts().some((x) => x[0] === S.tripSort) ? S.tripSort : 'old'; }

/* the cities with their shops, the most shops first (each city once, however it was typed) */
function tripCities(clients) {
  const m = new Map();
  clients.forEach((c) => {
    const k = tripCityKey(c.city);
    if (!k) return;
    const x = m.get(k) || { key: k, n: 0, names: new Map() };
    x.n++;
    const nm = String(c.city).trim();
    x.names.set(nm, (x.names.get(nm) || 0) + 1);
    m.set(k, x);
  });
  return Array.from(m.values()).map((x) => ({ key: x.key, n: x.n, name: Array.from(x.names.entries()).sort((a, b) => b[1] - a[1])[0][0] }))
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
}

async function tripData() {
  const C = leadCache('trip');
  if (C) return C;
  const [clients, orders, met, pay, today] = await Promise.all([
    fetchPaged(() => db.from('clients').select(LEAD_COLS + ', address, lat, lng' + (S.dbv12 ? ', credit_hold' : '')).order('id', { ascending: true })),
    fetchPaged(() => db.from('orders').select('client_id, status, order_date').order('id', { ascending: true })),
    lastMeetingMap(),
    typeof payAllEntries === 'function' ? payAllEntries().catch(() => []) : Promise.resolve([]),
    db.from('interactions').select('client_id').gte('happened_at', dayStartISO(todayStr())).limit(2000),
  ]);
  const openN = new Map();
  orders.forEach((o) => { if (isOpenStatus(o.status)) openN.set(o.client_id, (openN.get(o.client_id) || 0) + 1); });
  S.leadCache = {
    kind: 'trip', at: Date.now(), clients, met, openN,
    sleeping: new Set(sleepingClients(clients, orders, 2).map((r) => r.c.id)),
    pay: typeof payIndex === 'function' ? payIndex(pay) : new Map(),
    metToday: new Set(((today && today.data) || []).map((r) => r.client_id)),
  };
  return S.leadCache;
}

function tripInfo(D, c) {
  const p = D.pay.get(c.id);
  return {
    met: D.met.get(c.id) || '',
    open: D.openN.get(c.id) || 0,
    due: p && p.cur && p.cur.status === 'due' ? p.cur.on_date : '',
    sleeping: D.sleeping.has(c.id),
    today: D.metToday.has(c.id),
    vp: typeof visitInfo === 'function' && visitPlanOn() ? visitInfo(c, D.met.get(c.id)) : null,
    hold: !!c.credit_hold && typeof creditOn === 'function' && creditOn(),
  };
}
function tripSorted(list, D, how) {
  const rank = { Hot: 0, Warm: 1, Cold: 2 };
  const notMet = (a, b) => {   // never met first (the oldest added on top), then the longest since the last meeting
    const ma = D.met.get(a.id) || '', mb = D.met.get(b.id) || '';
    if (!ma !== !mb) return ma ? 1 : -1;
    const x = ma || a.created_at || '', y = mb || b.created_at || '';
    return x < y ? -1 : x > y ? 1 : 0;
  };
  const by = {
    old: notMet,
    hot: (a, b) => ((a.interest in rank ? rank[a.interest] : 3) - (b.interest in rank ? rank[b.interest] : 3)) || notMet(a, b),
    area: (a, b) => { const x = String(a.area || '').toLowerCase(), y = String(b.area || '').toLowerCase();
      return (!x !== !y ? (x ? -1 : 1) : x.localeCompare(y)) || String(a.trade_name || '').localeCompare(String(b.trade_name || '')); },
    due: (a, b) => {   // the most late for a visit first, then the next due; shops without a plan last
      const va = typeof visitInfo === 'function' ? visitInfo(a, D.met.get(a.id)) : null, vb = typeof visitInfo === 'function' ? visitInfo(b, D.met.get(b.id)) : null;
      if (!va !== !vb) return va ? -1 : 1;
      if (!va) return notMet(a, b);
      return (vb.late - va.late) || (va.dueOn < vb.dueOn ? -1 : va.dueOn > vb.dueOn ? 1 : 0) || notMet(a, b);
    },
  }[how] || notMet;
  return list.slice().sort(by);
}

function tripRowHTML(c, i, picked) {
  const chips = (i.today ? '<span class="chip chip-trip-met">✓ Met today</span>' : '') +
    (i.hold ? '<span class="chip cr-hold">⛔ On hold</span>' : '') +
    (i.vp && !i.today ? visitChipHTML(i.vp) : '') +
    chipInterest(c.interest) +
    (i.open ? '<span class="chip chip-orders">' + esc(i.open === 1 ? '1 order in work' : i.open + ' orders in work') + '</span>' : '') +
    (i.due ? '<span class="chip pay-chip-' + (i.due < todayStr() ? 'late' : 'due') + '">' + esc('Payment due ' + fmtD(i.due)) + '</span>' : '') +
    (i.sleeping ? '<span class="chip chip-trip-sleep">😴 Sleeping</span>' : '');
  return '<div class="list-item trip-item' + (picked ? ' picked' : '') + (i.today ? ' met' : '') + '" data-action="open-client" data-id="' + c.id + '">' +
    '<button class="trip-tick' + (picked ? ' on' : '') + '" data-action="trip-tick" data-id="' + c.id + '" aria-label="Add to the trip">' + (picked ? '✓' : '') + '</button>' +
    '<div class="li-main"><div class="li-title">' + esc(c.trade_name) + '</div>' +
    '<div class="li-sub">' + esc([c.contact_person, c.area].filter(Boolean).join(' · ') || c.company_name || '') + '</div>' +
    (chips ? '<div class="li-chips">' + chips + '</div>' : '') +
    '<div class="li-when">' + esc(i.met ? 'Last meeting ' + fmtD(i.met) : 'No meeting yet') + '</div></div>' +
    '<div class="li-go">›</div></div>';
}

async function runTripList(qRaw) {
  const box = $('#search-results');
  if (!box) return;
  const q = String(qRaw || '').trim();
  const seq = S.searchSeq = (S.searchSeq || 0) + 1;
  let D;
  try { D = await tripData(); } catch (e) {
    if (seq === S.searchSeq) box.innerHTML = '<div class="empty">Could not load clients — try again.</div>';
    return;
  }
  if (seq !== S.searchSeq || !$('#search-results')) return;
  const cities = tripCities(D.clients);
  const T = tripLoad();
  let city = S.tripCity != null ? S.tripCity : (T.city || '');
  if (city && !cities.some((x) => x.key === city)) city = '';
  S.tripCity = city;
  const picker = '<div class="card trip-pick"><div class="field" style="margin:0"><label>City for the trip</label>' +
    '<select id="trip-city"><option value="">Choose a city…</option>' +
    cities.map((x) => '<option class="noi18n" value="' + esc(x.key) + '"' + (x.key === city ? ' selected' : '') + '>' + esc(x.name + ' (' + x.n + ')') + '</option>').join('') +
    '</select></div></div>';
  if (!city) {
    box.innerHTML = picker + '<div class="empty"><div class="big">🧳</div>Going out of town? Choose the city —<br>every shop there, with what is pending, and a plan you can share.</div>';
    tripBindCity();
    return;
  }
  const picks = new Set(T.city === city ? T.ids || [] : []);
  const inCity = D.clients.filter((c) => tripCityKey(c.city) === city);
  const list = tripSorted(inCity.filter((c) => textMatch(c, q)), D, tripSortKey());
  const metToday = inCity.filter((c) => D.metToday.has(c.id)).length;
  const pickedList = tripSorted(inCity.filter((c) => picks.has(c.id)), D, tripSortKey());
  S.tripPicked = pickedList;
  const sorts = '<div class="filter-chips trip-sorts"><span class="cl-sort-lbl">Sort</span>' +
    tripSorts().map((x) => '<button class="' + (x[0] === tripSortKey() ? 'on' : '') + '" data-action="trip-sort" data-v="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>';
  const stats = '<div class="trip-stats"><span>' + esc(inCity.length === 1 ? '1 shop' : inCity.length + ' shops') + '</span>' +
    '<span>' + esc(picks.size + ' in the plan') + '</span>' + (metToday ? '<span class="ok">' + esc(metToday + ' met today') + '</span>' : '') + '</div>';
  const acts = pickedList.length ? '<div class="trip-acts">' +
    '<button class="btn btn-small btn-primary" data-action="trip-share">Share the plan on WhatsApp</button>' +
    '<button class="btn btn-small btn-secondary" data-action="trip-route">Route in Google Maps</button>' +
    '<button class="btn btn-small btn-ghost" data-action="trip-clear">Clear the plan</button></div>'
    : '<div class="hint" style="margin:0 2px 10px">Tap ☐ next to a shop to add it to the plan.</div>';
  box.innerHTML = picker + stats + acts + sorts +
    (list.length ? list.slice(0, 300).map((c) => tripRowHTML(c, tripInfo(D, c), picks.has(c.id))).join('')
      : '<div class="empty">No shop here matches <b class="noi18n">"' + esc(q) + '"</b></div>');
  tripBindCity();
}
function tripBindCity() {
  const sel = $('#trip-city');
  if (!sel) return;
  sel.addEventListener('change', () => {
    S.tripCity = sel.value;
    const T = tripLoad();
    if (T.city !== sel.value) tripSave({ city: sel.value, ids: [], at: todayStr() });
    const inp = $('#search-input');
    if (inp) inp.value = '';
    runTripList('');
  });
}
function tripRefresh() { const inp = $('#search-input'); runTripList(inp ? inp.value : ''); }

/* the plan as a WhatsApp message */
function tripPlanText() {
  const D = S.leadCache && S.leadCache.kind === 'trip' ? S.leadCache : null;
  const list = S.tripPicked || [];
  if (!D || !list.length) return '';
  const tr = (s) => (typeof trText === 'function' ? trText(s) : s);
  const cityName = String((list[0] && list[0].city) || '').trim();
  const lines = ['🧳 ' + tr('Trip plan') + ' — ' + cityName + ' · ' + fmtD(todayStr()), ''];
  list.forEach((c, n) => {
    const i = tripInfo(D, c);
    lines.push((n + 1) + '. ' + c.trade_name + (c.area ? ' — ' + c.area : ''));
    const who = [c.contact_person, c.mobile].filter(Boolean).join(' · ');
    if (who) lines.push('   ' + who);
    if (c.address) lines.push('   ' + String(c.address).replace(/\s+/g, ' ').trim());
    const more = [i.met ? tr('Last meeting ' + fmtD(i.met)) : tr('No meeting yet'),
      i.open ? tr(i.open === 1 ? '1 order in work' : i.open + ' orders in work') : '',
      i.due ? tr('Payment due ' + fmtD(i.due)) : ''].filter(Boolean);
    lines.push('   ' + more.join(' · '));
  });
  return lines.join('\n');
}
/* Google Maps: the shops in the plan, in order (the saved shop location, else the address) */
function tripRouteUrl() {
  const pts = (S.tripPicked || []).slice(0, 10).map((c) => (c.lat != null && c.lng != null
    ? (+c.lat).toFixed(6) + ',' + (+c.lng).toFixed(6)
    : encodeURIComponent([c.trade_name, c.address || c.area, c.city].filter(Boolean).join(', '))));
  return pts.length ? 'https://www.google.com/maps/dir/' + pts.join('/') : '';
}

onAct('trip-tick', (el) => {
  const T = tripLoad();
  const city = S.tripCity || '';
  const ids = new Set(T.city === city ? T.ids || [] : []);
  if (ids.has(el.dataset.id)) ids.delete(el.dataset.id); else ids.add(el.dataset.id);
  tripSave({ city, ids: Array.from(ids), at: todayStr() });
  tripRefresh();
});
onAct('trip-sort', (el) => { S.tripSort = el.dataset.v; tripRefresh(); });
onAct('trip-clear', () => confirmModal('Clear the plan?', 'The shops stay — only the ticks go.', 'Clear', () => {
  tripSave({ city: S.tripCity || '', ids: [], at: todayStr() });
  tripRefresh();
}));
onAct('trip-share', () => {
  const t = tripPlanText();
  if (t) window.open('https://wa.me/?text=' + encodeURIComponent(t), '_blank');
});
onAct('trip-route', () => {
  const u = tripRouteUrl();
  if (!u) return;
  window.open(u, '_blank');
  if ((S.tripPicked || []).length > 10) toast('Google Maps shows the first 10 stops.', 'ok');
});
