/* ============================================================
   RE-ORDER REMINDERS — a shop that has ordered at least 3 times
   usually orders again after about the same number of days (the
   middle value of the gaps between its orders). When that many days
   have gone by since its last order, it shows on Today ("Time to
   re-order"), on the shop's page and in the trip planner, with a
   one-tap WhatsApp message. A shop late by more than one round is
   left to "Sleeping clients".
   The owner sees every shop; a team member sees the shops whose
   last order they booked. No database update needed.
   ============================================================ */
'use strict';

const REORDER_MIN = 3;   // orders (on different days) before a pattern is trusted
function reorderOn() { return appOn('reorder'); }
const REORDER_LIVE = OPEN_STATUSES.concat(['delivered']);   // approved orders: in work, finished or delivered

/* the order dates of one shop → when it should order again (null: not enough orders) */
function reorderInfo(dates) {
  const ds = Array.from(new Set((dates || []).filter(Boolean).map((d) => String(d).slice(0, 10)))).sort();
  if (ds.length < REORDER_MIN) return null;
  const gaps = [];
  for (let i = 1; i < ds.length; i++) gaps.push(daysBetween(ds[i - 1], ds[i]));
  gaps.sort((a, b) => a - b);
  const mid = gaps.length % 2 ? gaps[(gaps.length - 1) / 2] : Math.round((gaps[gaps.length / 2 - 1] + gaps[gaps.length / 2]) / 2);
  const every = Math.max(7, mid);
  const last = ds[ds.length - 1];
  const d = new Date(last + 'T00:00:00');
  d.setDate(d.getDate() + every);
  const dueOn = ymd(d), t = todayStr();
  const late = dueOn < t ? daysBetween(dueOn, t) : 0;
  return { every, last, dueOn, n: ds.length, due: dueOn <= t, late, inDays: dueOn > t ? daysBetween(t, dueOn) : 0,
    show: dueOn <= t && late <= Math.max(every, 30) };   // late by more than a round: "sleeping", not a re-order
}
/* orders (client_id, status, order_date[, created_by]) → client id → info (+ who booked the last order) */
function reorderMap(orders) {
  const by = new Map();
  (orders || []).forEach((o) => {
    if (!o.client_id || REORDER_LIVE.indexOf(o.status) === -1) return;
    if (!by.has(o.client_id)) by.set(o.client_id, []);
    by.get(o.client_id).push(o);
  });
  const out = new Map();
  by.forEach((list, cid) => {
    const r = reorderInfo(list.map((o) => o.order_date));
    if (!r) return;
    const lastO = list.filter((o) => String(o.order_date).slice(0, 10) === r.last).pop();
    r.by = lastO ? lastO.created_by || null : null;
    out.set(cid, r);
  });
  return out;
}
function reorderText(r) {
  if (!r) return '';
  if (r.late) return r.late === 1 ? 'Re-order late by 1 day' : 'Re-order late by ' + r.late + ' days';
  if (r.due) return 'Re-order due today';
  return r.inDays === 1 ? 'Next order expected tomorrow' : 'Next order expected in ' + r.inDays + ' days';
}
function reorderChipHTML(r, always) {
  if (!r || (!r.show && !always)) return '';
  return '<span class="chip ' + (r.show ? 'ro-due' : 'ro-ok') + '">' + esc('🔁 ' + reorderText(r)) + '</span>';
}

/* every shop's pattern (kept for 2 minutes) */
async function reorderData() {
  if (S.roData && Date.now() - S.roData.at < 120000) return S.roData;
  const orders = await fetchPaged(() => db.from('orders').select('client_id, status, order_date, created_by').in('status', REORDER_LIVE).order('id', { ascending: true }));
  S.roData = { at: Date.now(), info: reorderMap(orders) };
  return S.roData;
}

function reorderRowHTML(c, r) {
  return '<div class="list-item ro-item" data-action="open-client" data-id="' + c.id + '"><div class="li-main">' +
    '<div class="li-title">' + esc(c.trade_name) + '</div>' +
    '<div class="li-sub">' + esc([c.contact_person, c.city].filter(Boolean).join(' · ')) + '</div>' +
    '<div class="li-chips">' + reorderChipHTML(r) + '</div>' +
    '<div class="li-when">' + esc('Orders about every ' + r.every + ' days · last order ' + fmtD(r.last)) + '</div></div>' +
    (isIndianMobile(normMobile(c.mobile)) ? '<button type="button" class="camp-send ro-wa" data-action="ro-wa" data-id="' + c.id + '" aria-label="WhatsApp">' + WA_SVG + '</button>' : '<div class="li-go">›</div>') + '</div>';
}

/* ---------------- Today: shops that usually order again by now ---------------- */
async function loadTodayReorder() {
  const el = $('#today-reorder');
  if (!el) return;
  if (!reorderOn()) { el.innerHTML = ''; return; }
  let D;
  try { D = await reorderData(); } catch (e) { return; }
  const mine = isOwner() ? null : S.me.id;
  const due = [];
  D.info.forEach((r, cid) => { if (r.show && (!mine || r.by === mine)) due.push({ cid, r }); });
  if (!due.length) { el.innerHTML = ''; return; }
  due.sort((a, b) => (b.r.late - a.r.late) || (a.r.last < b.r.last ? -1 : 1));
  const ids = due.slice(0, 60).map((x) => x.cid);
  const { data } = await db.from('clients').select('id, trade_name, contact_person, city, mobile').in('id', ids);
  if (!$('#today-reorder')) return;
  const cm = new Map((data || []).map((c) => [c.id, c]));
  const rows = due.filter((x) => cm.has(x.cid));
  if (!rows.length) { el.innerHTML = ''; return; }
  S.roShops = cm;
  el.innerHTML = '<div class="due-group-label ro-label">' + esc('Time to re-order (' + rows.length + ')') + '</div>' +
    rows.slice(0, 5).map((x) => reorderRowHTML(cm.get(x.cid), x.r)).join('') +
    (rows.length > 5 ? '<details class="ro-more"><summary>' + esc('+ ' + (rows.length - 5) + ' more') + '</summary>' +
      rows.slice(5).map((x) => reorderRowHTML(cm.get(x.cid), x.r)).join('') + '</details>' : '');
}

/* ---------------- the shop's page ---------------- */
async function loadClientReorder(cl) {
  const el = $('#cl-reorder');
  if (!el || !reorderOn()) return;
  const { data } = await db.from('orders').select('client_id, status, order_date').eq('client_id', cl.id).in('status', REORDER_LIVE).limit(500);
  if (!$('#cl-reorder') || S.currentClientId !== cl.id) return;
  const r = reorderMap(data || []).get(cl.id);
  el.innerHTML = r ? reorderChipHTML(r, true) : '';
}

/* a short WhatsApp to the shop */
async function reorderWa(clientId) {
  let c = S.roShops && S.roShops.get(clientId);
  if (!c) c = await fetchClient(clientId);
  if (!c) return;
  const r = S.roData && S.roData.info.get(clientId);
  const text = 'Namaste 🙏\nHope all is well' + (c.contact_person ? ', ' + String(c.contact_person).split(' ')[0] : '') + '. ' +
    (r ? 'Your last order with us was on ' + fmtD(r.last) + '. ' : '') +
    'Do you need anything new? We have fresh designs — tell us and we will send photos.\n— ' + bizName();
  openWa(c.mobile, text);
}

onAct('ro-wa', (el) => reorderWa(el.dataset.id));
