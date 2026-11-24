/* ============================================================
   THE WEEK (the owner) — meetings, new clients, orders, quotations,
   deliveries and designs from shops for one week (Monday to
   Sunday), each person's meetings, and a summary for WhatsApp.
   Every Monday the same numbers come as a phone alert (database
   update 17); the alert opens this screen.
   ============================================================ */
'use strict';

function weekRange(back) {   // the week `back` weeks ago (0 = this week so far)
  const d = new Date(); d.setHours(0, 0, 0, 0);
  const mon = new Date(d); mon.setDate(d.getDate() - (d.getDay() + 6) % 7 - 7 * back);
  const next = new Date(mon); next.setDate(mon.getDate() + 7);
  const last = new Date(next); last.setDate(next.getDate() - 1);
  return { from: ymd(mon), to: ymd(next), last: ymd(last) };
}
function weekLabelApp(R) {
  const a = new Date(R.from + 'T00:00:00'), b = new Date(R.last + 'T00:00:00');
  const m = (x) => x.toLocaleDateString('en-IN', { month: 'short' });
  return a.getMonth() === b.getMonth() ? a.getDate() + ' – ' + b.getDate() + ' ' + m(b) : a.getDate() + ' ' + m(a) + ' – ' + b.getDate() + ' ' + m(b);
}
async function weekData(R) {
  const f = dayStartISO(R.from), t = dayStartISO(R.to);
  const [met, cl, ord, del, late, des] = await Promise.all([
    fetchPaged(() => db.from('interactions').select('exec_id').gte('happened_at', f).lt('happened_at', t).order('id', { ascending: true })),
    fetchPaged(() => db.from('clients').select('created_by').gte('created_at', f).lt('created_at', t).order('id', { ascending: true })),
    db.from('orders').select('status, created_by').gte('created_at', f).lt('created_at', t).limit(5000),
    db.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'delivered').gte('delivered_on', R.from).lt('delivered_on', R.to),
    db.from('orders').select('id', { count: 'exact', head: true }).in('status', OPEN_STATUSES).lt('due_date', todayStr()),
    S.dbv16 ? db.from('design_requests').select('id', { count: 'exact', head: true }).gte('created_at', f).lt('created_at', t) : null,
  ]);
  const per = new Map();
  const bump = (id, k) => { if (!id) return; const x = per.get(id) || { meet: 0, clients: 0, orders: 0 }; x[k]++; per.set(id, x); };
  (met || []).forEach((r) => bump(r.exec_id, 'meet'));
  (cl || []).forEach((r) => bump(r.created_by, 'clients'));
  const os = (ord.data || []).filter((o) => o.status !== 'declined' && o.status !== 'cancelled');
  os.filter((o) => o.status !== 'quote').forEach((o) => bump(o.created_by, 'orders'));
  return {
    meet: (met || []).length, clients: (cl || []).length, orders: os.filter((o) => o.status !== 'quote').length, quotes: os.filter((o) => o.status === 'quote').length,
    del: del.count || 0, late: late.count || 0, designs: des && !des.error ? des.count || 0 : null, per,
  };
}
async function renderWeek() {
  const c = $('#content');
  S.wk = S.wk || { back: 1 };
  const R = weekRange(S.wk.back);
  c.innerHTML = loadingHTML();
  let D;
  try { D = await weekData(R); } catch (e) { c.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  if (!$('#content')) return;
  S.wk.D = D; S.wk.R = R;
  const tile = (n, label, cls) => '<div class="stat"><div class="st-num' + (cls ? ' ' + cls : '') + '">' + n + '</div><div class="st-label">' + esc(label) + '</div></div>';
  const people = Array.from(D.per.entries()).sort((a, b) => b[1].meet - a[1].meet || b[1].clients - a[1].clients);
  c.innerHTML = '<div class="wk-nav"><button type="button" class="btn btn-small btn-ghost" data-action="wk-move" data-d="1" aria-label="Week before">‹</button>' +
    '<div class="wk-t"><b>' + esc(weekLabelApp(R)) + '</b><span>' + esc(S.wk.back === 0 ? 'This week so far' : S.wk.back === 1 ? 'Last week' : 'Monday to Sunday') + '</span></div>' +
    '<button type="button" class="btn btn-small btn-ghost" data-action="wk-move" data-d="-1" aria-label="Week after"' + (S.wk.back === 0 ? ' disabled' : '') + '>›</button></div>' +
    '<div class="stat-row wk-tiles">' + tile(D.meet, 'Meetings') + tile(D.clients, 'New clients') + tile(D.orders, 'Orders') + '</div>' +
    '<div class="stat-row wk-tiles">' + tile(D.quotes, 'Quotations') + tile(D.del, 'Delivered') + tile(D.late, 'Late now', D.late ? 'o-red' : '') + '</div>' +
    (D.designs != null ? '<div class="stat-row wk-tiles">' + tile(D.designs, 'Designs from shops') + '</div>' : '') +
    '<div class="section-label">Who did what</div>' +
    (people.length ? '<div class="card">' + people.map(([id, x]) => '<div class="exec-row"><span class="ex-name noi18n">' + esc(nameOf(id)) + '</span>' +
      '<span class="ex-nums">' + esc([x.meet === 1 ? '1 meeting' : x.meet + ' meetings', x.clients ? (x.clients === 1 ? '1 new client' : x.clients + ' new clients') : '',
        x.orders ? (x.orders === 1 ? '1 order' : x.orders + ' orders') : ''].filter(Boolean).join(' · ')) + '</span></div>').join('') + '</div>'
      : '<div class="empty">No meetings or new clients this week.</div>') +
    '<button class="btn btn-secondary" data-action="wk-share" style="margin-top:12px">Share on WhatsApp</button>' +
    (S.dbv17 ? '<div class="hint" style="margin:12px 4px">Every Monday at 9 am these numbers come to your phone (Phone alerts → Monday summary).</div>' : '');
}
function weekText() {
  const W = S.wk, D = W && W.D;
  if (!D) return '';
  const n = (k, one, many) => k + ' ' + (k === 1 ? one : many);
  const L = ['*' + bizName() + ' — ' + weekLabelApp(W.R) + '*', '',
    [n(D.meet, 'meeting', 'meetings'), n(D.clients, 'new client', 'new clients'), n(D.orders, 'order', 'orders')]
      .concat(D.quotes ? [n(D.quotes, 'quotation', 'quotations')] : [], [D.del + ' delivered'], D.late ? [D.late + ' late now'] : [],
        D.designs ? [n(D.designs, 'design from shops', 'designs from shops')] : []).join(' · ')];
  const people = Array.from(D.per.entries()).sort((a, b) => b[1].meet - a[1].meet);
  if (people.length) {
    L.push('');
    people.forEach(([id, x]) => L.push(String(nameOf(id)).split(' ')[0] + ': ' + [n(x.meet, 'meeting', 'meetings')]
      .concat(x.clients ? [n(x.clients, 'new client', 'new clients')] : [], x.orders ? [n(x.orders, 'order', 'orders')] : []).join(', ')));
  }
  return L.join('\n');
}
onAct('wk-open', () => { S.wk = { back: 1 }; showSub('The week', renderWeek); });
onAct('wk-move', (el) => { if (!S.wk) return; S.wk.back = Math.max(0, S.wk.back + (+el.dataset.d)); renderWeek(); });
onAct('wk-share', () => { const t = weekText(); if (t) window.open(waUrl('', t), '_blank'); });
