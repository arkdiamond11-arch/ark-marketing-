/* ============================================================
   VISIT PLAN — each shop is visited by its customer category:
   A every 15 days, B every 30, C every 60 (the owner changes the
   days in More → App settings; 0 = no plan for that category).
   A shop is due when its last meeting (anyone's) is that old; a
   shop never met counts from the day it was added.
   Shown on Today (the most late first), in Clients → 🗓️ Visits,
   on the shop's page and in the trip planner ("Visit due first").
   No database update needed: it uses the meetings and the category.
   Loaded after trip.js, before app.js.
   ============================================================ */
'use strict';

const VISIT_CATS = ['A', 'B', 'C'];
const VISIT_DEFAULT = { A: 15, B: 30, C: 60 };
function visitsOn() { return appOn('visits'); }
function visitDays(cat) {
  const v = appOpts().visit;
  const n = v && typeof v === 'object' && v[cat] != null && v[cat] !== '' ? parseInt(v[cat], 10) : NaN;
  return isFinite(n) && n >= 0 ? Math.min(n, 365) : (VISIT_DEFAULT[cat] || 0);
}
function visitPlanOn() { return visitsOn() && VISIT_CATS.some((k) => visitDays(k) > 0); }
function dateAdd(ds, n) { const d = new Date(ds + 'T00:00:00'); d.setDate(d.getDate() + n); return ymd(d); }

/* when the shop should be visited next — null when it has no plan (no category, or 0 days) */
function visitInfo(c, last) {
  const cat = String((c && c.category) || '').trim().toUpperCase();
  if (VISIT_CATS.indexOf(cat) < 0) return null;
  const days = visitDays(cat);
  if (!days) return null;
  const from = last || c.created_at || '';
  const dueOn = dateAdd(from ? ymd(new Date(from)) : todayStr(), days);
  const t = todayStr();
  return { cat, days, last: last || '', dueOn, due: dueOn <= t, late: dueOn < t ? daysBetween(dueOn, t) : 0, inDays: dueOn > t ? daysBetween(t, dueOn) : 0 };
}
function visitText(v) {
  if (!v) return '';
  if (v.late) return v.late === 1 ? 'Visit late by 1 day' : 'Visit late by ' + v.late + ' days';
  if (v.due) return 'Visit due today';
  return v.inDays === 1 ? 'Next visit tomorrow' : 'Next visit in ' + v.inDays + ' days';
}
/* the chip: only when due, unless asked for always (the shop's own page) */
function visitChipHTML(v, always) {
  if (!v || (!v.due && !always)) return '';
  return '<span class="chip ' + (v.late ? 'vp-late' : v.due ? 'vp-due' : 'vp-ok') + '">' + esc(visitText(v)) + '</span>';
}
/* the most late first, then the earliest due, A before B before C, then the name */
function visitCmp(a, b) {
  return (b.v.late - a.v.late) || (a.v.dueOn < b.v.dueOn ? -1 : a.v.dueOn > b.v.dueOn ? 1 : 0) ||
    a.v.cat.localeCompare(b.v.cat) || String(a.c.trade_name || '').localeCompare(String(b.c.trade_name || ''));
}

/* every shop with a plan, and when it is due (kept for 2 minutes) */
async function visitData() {
  if (S.vpData && Date.now() - S.vpData.at < 120000) return S.vpData;
  const [clients, met] = await Promise.all([
    fetchPaged(() => db.from('clients').select(LEAD_COLS).order('id', { ascending: true })),
    lastMeetingMap(),
  ]);
  const rows = clients.map((c) => ({ c, v: visitInfo(c, met.get(c.id)) })).filter((x) => x.v);
  S.vpData = { at: Date.now(), rows };
  return S.vpData;
}

function visitRowHTML(x) {
  const c = x.c, v = x.v;
  return '<div class="list-item vp-item" data-action="open-client" data-id="' + c.id + '"><div class="li-main">' +
    '<div class="li-title">' + esc(c.trade_name) + '</div>' +
    '<div class="li-sub">' + esc([c.contact_person, c.area, c.city].filter(Boolean).join(' · ')) + '</div>' +
    '<div class="li-chips">' + chipCat(c.category) + visitChipHTML(v, true) + '</div>' +
    '<div class="li-when">' + esc(v.last ? 'Last meeting ' + fmtD(v.last) : 'No meeting yet') + '</div></div>' +
    '<div class="li-go">›</div></div>';
}

/* ---------------- Today: the shops most late for a visit ---------------- */
async function loadTodayVisits() {
  const el = $('#today-visits');
  if (!el) return;
  if (!visitPlanOn()) { el.innerHTML = ''; return; }
  let D;
  try { D = await visitData(); } catch (e) { return; }
  if (!$('#today-visits')) return;
  const due = D.rows.filter((x) => x.v.due).sort(visitCmp);
  if (!due.length) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="due-group-label vp-label sl-row"><span>Shops due for a visit (' + due.length + ')</span>' +
    '<a href="#" data-action="vp-open">See all ›</a></div>' +
    due.slice(0, 5).map(visitRowHTML).join('') +
    (due.length > 5 ? '<div class="hint" style="text-align:center;margin:-4px 0 10px">+ ' + (due.length - 5) + ' more in Clients → Visits</div>' : '');
}

/* ---------------- Clients → 🗓️ Visits ---------------- */
async function runVisitList(qRaw) {
  const box = $('#search-results');
  if (!box) return;
  const q = String(qRaw || '').trim();
  const seq = S.searchSeq = (S.searchSeq || 0) + 1;
  let D;
  try { D = await visitData(); } catch (e) {
    if (seq === S.searchSeq) box.innerHTML = '<div class="empty">Could not load clients — try again.</div>';
    return;
  }
  if (seq !== S.searchSeq || !$('#search-results')) return;
  const t7 = todayStr(7);
  const soonRows = D.rows.filter((x) => x.v.dueOn <= t7);
  const cities = tripCities(soonRows.map((x) => x.c));
  let city = S.vpCity || '';
  if (city && !cities.some((x) => x.key === city)) city = '';
  S.vpCity = city;
  const inCity = soonRows.filter((x) => !city || tripCityKey(x.c.city) === city);
  const cat = VISIT_CATS.indexOf(S.vpCat) > -1 ? S.vpCat : 'all';
  const n = { all: inCity.length, A: 0, B: 0, C: 0 };
  inCity.forEach((x) => { n[x.v.cat]++; });
  const rows = inCity.filter((x) => (cat === 'all' || x.v.cat === cat) && textMatch(x.c, q)).sort(visitCmp);
  const late = rows.filter((x) => x.v.late), today = rows.filter((x) => x.v.due && !x.v.late), soon = rows.filter((x) => !x.v.due);
  const plan = '<div class="vp-plan">' + VISIT_CATS.map((k) => 'Cat ' + k + ': ' + (visitDays(k) ? 'every ' + visitDays(k) + ' days' : 'no plan')).join(' · ') + '</div>';
  const picker = '<div class="card vp-pick"><div class="field" style="margin:0"><label>City</label><select id="vp-city"><option value="">All cities</option>' +
    cities.map((x) => '<option class="noi18n" value="' + esc(x.key) + '"' + (x.key === city ? ' selected' : '') + '>' + esc(x.name + ' (' + x.n + ')') + '</option>').join('') +
    '</select></div>' + (city ? '<button class="btn btn-small btn-secondary vp-trip" data-action="vp-trip">🧳 Plan a trip to this city</button>' : '') + '</div>';
  const chips = '<div class="filter-chips vp-cats">' + [['all', 'All'], ['A', 'Cat A'], ['B', 'Cat B'], ['C', 'Cat C']].map((k) =>
    '<button class="' + (cat === k[0] ? 'on' : '') + '" data-action="vp-cat" data-v="' + k[0] + '">' + k[1] + ' (' + n[k[0]] + ')</button>').join('') + '</div>';
  const group = (label, cls, arr) => (arr.length ? '<div class="due-group-label ' + cls + '">' + label + ' (' + arr.length + ')</div>' + arr.slice(0, 300).map(visitRowHTML).join('') : '');
  box.innerHTML = plan + picker + chips + (rows.length
    ? group('Late', 'overdue', late) + group('Due today', 'today', today) + group('Next 7 days', 'soon', soon)
    : '<div class="empty"><div class="big">🎉</div>' + (q ? 'No shop here matches <b class="noi18n">"' + esc(q) + '"</b>' : 'No shop is due for a visit in the next 7 days.') + '</div>');
  const sel = $('#vp-city');
  if (sel) sel.addEventListener('change', () => { S.vpCity = sel.value; const inp = $('#search-input'); runVisitList(inp ? inp.value : ''); });
}

/* ---------------- the shop's page: when the next visit is due ---------------- */
async function loadClientVisit(cl) {
  const el = $('#cl-visit');
  if (!el || !visitPlanOn() || !visitInfo(cl, '')) return;
  const { data } = await db.from('interactions').select('happened_at').eq('client_id', cl.id).order('happened_at', { ascending: false }).limit(1);
  if (!$('#cl-visit') || S.currentClientId !== cl.id) return;
  el.innerHTML = visitChipHTML(visitInfo(cl, data && data[0] ? data[0].happened_at : ''), true);
}

onAct('vp-open', () => { S.clientShow = 'visit'; S.leadCache = null; switchTab('find'); });
onAct('vp-cat', (el) => { S.vpCat = el.dataset.v; const inp = $('#search-input'); runVisitList(inp ? inp.value : ''); });
onAct('vp-trip', () => {
  S.tripCity = S.vpCity || '';
  S.tripSort = 'due';
  S.clientShow = 'trip';
  S.leadCache = null;
  renderFind();
});
