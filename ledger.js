/* ============================================================
   CLIENT LEDGER (money + gold per client) and the DUES list
   (who owes how much — with WhatsApp reminders).
   Quotations and cancelled orders are left out of all totals.
   ============================================================ */
'use strict';

function isLiveOrder(o) { return o.status !== 'cancelled' && o.status !== 'quote'; }

async function clientLedgerData(clientId) {
  const { data: orders } = await db.from('orders')
    .select('id, order_no, order_type, status, order_date, due_date, delivered_on, total_amount, paid_amount, purity, wastage_pct, client_metal_g, client_metal_purity')
    .eq('client_id', clientId).order('order_date', { ascending: true }).order('order_no', { ascending: true });
  const all = orders || [];
  const live = all.filter(isLiveOrder);
  const ids = live.map((o) => o.id);
  const [pr, ir] = await Promise.all([
    ids.length ? db.from('order_payments').select('*').in('order_id', ids).order('paid_on', { ascending: true }) : Promise.resolve({ data: [] }),
    ids.length ? db.from('order_items').select('order_id, net_wt').in('order_id', ids) : Promise.resolve({ data: [] }),
  ]);
  const net = new Map();
  (ir.data || []).forEach((it) => net.set(it.order_id, (net.get(it.order_id) || 0) + num(it.net_wt)));
  const gold = [];
  live.forEach((o) => {
    const led = jwLedger(o, net.get(o.id) || 0);
    if (led) gold.push({ o, led });
  });
  const totals = {
    business: live.reduce((a, o) => a + num(o.total_amount), 0),
    received: live.reduce((a, o) => a + num(o.paid_amount), 0),
    due: live.reduce((a, o) => a + balanceOf(o), 0),
    goldIn: gold.reduce((a, g) => a + g.led.inFine, 0),
    goldUsed: gold.reduce((a, g) => a + g.led.usedFine, 0),
  };
  totals.goldBal = totals.goldIn - totals.goldUsed;
  return { all, live, quotes: all.filter((o) => o.status === 'quote'), pays: pr.data || [], gold, totals };
}

function ledgerReminderText(cl, L) {
  const name = cl.contact_person || cl.trade_name || '';
  const lines = ['Namaste ' + name + ',', '', 'Account summary from ' + bizName() + ' as on ' + fmtDLong(todayStr()) + ':',
    'Total of orders: ' + inr(L.totals.business), 'Received: ' + inr(L.totals.received), '*Balance due: ' + inr(L.totals.due) + '*'];
  const pending = L.live.filter((o) => balanceOf(o) >= 1);
  if (pending.length) {
    lines.push('');
    pending.slice(0, 8).forEach((o) => lines.push(ordNo(o.order_no) + ' (' + fmtD(o.order_date) + '): ' + inr(balanceOf(o))));
  }
  if (Math.abs(L.totals.goldBal) > 0.0005) {
    lines.push('');
    lines.push(L.totals.goldBal > 0 ? 'Your gold with us: ' + grams(L.totals.goldBal) + ' fine' : 'Gold due from you: ' + grams(-L.totals.goldBal) + ' fine');
  }
  lines.push('');
  lines.push(L.totals.due >= 1 ? 'Kindly arrange the balance payment at your convenience. Thank you!' : 'All payments received — thank you for your business!');
  return lines.join('\n');
}

async function openClientLedger(clientId) {
  const cl = await fetchClient(clientId);
  if (!cl) return;
  showSub('Ledger', () => renderLedger(cl));
}

async function renderLedger(cl) {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const L = await clientLedgerData(cl.id);
  S.ledger = { cl, L };
  if (!$('#content') || !S.sub.length || S.sub[S.sub.length - 1].title !== 'Ledger') return;
  const T = L.totals;
  const goldMsg = Math.abs(T.goldBal) < 0.0005 ? 'Gold account settled.'
    : T.goldBal > 0 ? 'Client\'s gold still with us: <b>' + grams(T.goldBal) + ' fine</b>'
      : 'Client owes us: <b>' + grams(-T.goldBal) + ' fine gold</b>';
  const on = new Map(L.live.map((o) => [o.id, o]));
  c.innerHTML =
    '<div class="client-head"><h2>' + esc(cl.trade_name) + '</h2>' +
    '<div class="co">' + esc([cl.contact_person, cl.city].filter(Boolean).join(' · ')) + '</div>' +
    '<div class="lg-nums">' +
    '<div><span>Orders total</span><b>' + inr(T.business) + '</b></div>' +
    '<div><span>Received</span><b>' + inr(T.received) + '</b></div>' +
    '<div class="' + (T.due >= 1 ? 'due' : 'clear') + '"><span>Balance due</span><b>' + inr(T.due) + '</b></div>' +
    '</div></div>' +

    '<div class="action-row">' +
    '<button class="btn btn-secondary" data-action="d-client" data-id="' + cl.id + '">Statement PDF</button>' +
    '<button class="btn btn-secondary" data-action="lg-wa">WhatsApp</button>' +
    (cl.mobile ? '<a class="btn btn-secondary" href="' + esc(telHref(cl.mobile)) + '">Call</a>' : '') +
    '</div>' +

    (L.gold.length ? '<div class="section-label">Gold account (job work)</div><div class="card">' +
      '<div class="o-lrow"><span>Fine gold received</span><b>' + grams(T.goldIn) + '</b></div>' +
      '<div class="o-lrow"><span>Fine gold used (incl. wastage)</span><b>' + grams(T.goldUsed) + '</b></div>' +
      '<div class="o-lnote ' + (T.goldBal < -0.0005 ? 'neg' : '') + '">' + goldMsg + '</div></div>' : '') +

    '<div class="section-label">Orders (' + L.live.length + ')</div>' +
    (L.live.length ? '<div class="card" style="padding:4px 14px">' + L.live.slice().reverse().map((o) => {
      const bal = balanceOf(o);
      return '<div class="lg-row" data-action="o-open" data-id="' + o.id + '">' +
        '<div class="lg-main"><b>' + ordNo(o.order_no) + '</b> <span class="lg-sub">' + esc(fmtD(o.order_date)) + ' · ' + esc(OTYPE_LABEL[o.order_type] || '') + '</span>' +
        '<div style="margin-top:3px">' + chipStatus(o.status) + '</div></div>' +
        '<div class="lg-amt"><div>' + inr(o.total_amount) + '</div>' + (bal >= 1 ? '<div class="o-red">Due ' + inr(bal) + '</div>' : num(o.total_amount) <= 0 && num(o.paid_amount) <= 0 ? '<div class="lg-np">No price yet</div>' : '<div class="lg-paid">Paid</div>') + '</div></div>';
    }).join('') + '</div>' : '<div class="empty" style="padding:12px">No orders yet.</div>') +

    (L.quotes.length ? '<div class="notice">' + L.quotes.length + ' quotation' + (L.quotes.length === 1 ? '' : 's') + ' not yet confirmed — not counted above.</div>' : '') +

    '<div class="section-label">Payments (' + L.pays.length + ')</div>' +
    (L.pays.length ? '<div class="card" style="padding:4px 14px">' + L.pays.slice().reverse().map((p) => {
      const o = on.get(p.order_id);
      return '<div class="o-pay-row"><div style="flex:1;min-width:0"><b>' + inr(p.amount) + '</b>' + (p.mode ? ' <span class="chip chip-cat">' + esc(p.mode) + '</span>' : '') +
        '<div class="o-item-meta">' + esc(fmtD(p.paid_on)) + (o ? ' · ' + ordNo(o.order_no) : '') + (p.note ? ' · ' + esc(p.note) : '') + '</div></div></div>';
    }).join('') + '</div>' : '<div class="empty" style="padding:12px">No payments recorded yet.</div>');
}

/* ---------------- dues: who owes how much ---------------- */
async function renderDues() {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const { data, error } = await db.from('orders')
    .select('id, order_no, client_id, status, order_date, delivered_on, total_amount, paid_amount, clients(trade_name, city, mobile, contact_person)')
    .in('status', ['new', 'in_production', 'ready', 'delivered']).limit(5000);
  if (!$('#content')) return;
  if (error) { c.innerHTML = '<div class="empty">Could not load dues.</div>'; return; }
  const by = new Map();
  (data || []).forEach((o) => {
    const bal = balanceOf(o);
    if (bal < 1) return;
    const k = o.client_id;
    if (!by.has(k)) by.set(k, { id: k, cl: o.clients || {}, due: 0, orders: [], oldest: null });
    const e = by.get(k);
    e.due += bal;
    e.orders.push(o);
    const since = o.delivered_on || o.order_date;
    if (!e.oldest || since < e.oldest) e.oldest = since;
  });
  const rows = Array.from(by.values()).sort((a, b) => b.due - a.due);
  S.dues = rows;
  const total = rows.reduce((a, r) => a + r.due, 0);
  c.innerHTML =
    '<div class="stat-row">' +
    '<div class="stat"><div class="st-num o-num-sm' + (total >= 1 ? ' o-red' : '') + '">' + inr(total) + '</div><div class="st-label">Total due</div></div>' +
    '<div class="stat"><div class="st-num">' + rows.length + '</div><div class="st-label">Clients</div></div>' +
    '</div><div style="height:8px"></div>' +
    (rows.length ? rows.map((r, i) => {
      const age = r.oldest ? daysBetween(r.oldest, todayStr()) : 0;
      return '<div class="list-item" style="cursor:default">' +
        '<div class="li-main" data-action="lg-open" data-id="' + r.id + '" style="cursor:pointer">' +
        '<div class="li-title">' + esc(r.cl.trade_name || 'Client') + '</div>' +
        '<div class="li-sub">' + esc(r.cl.city || '') + (r.cl.city ? ' · ' : '') + r.orders.length + ' order' + (r.orders.length === 1 ? '' : 's') +
        (age > 0 ? ' · oldest ' + age + ' day' + (age === 1 ? '' : 's') : '') + '</div>' +
        '<div class="li-chips"><span class="chip chip-hot">Due ' + inr(r.due) + '</span></div></div>' +
        '<div class="dues-btns"><button class="btn btn-small btn-secondary" data-action="dues-wa" data-idx="' + i + '">Remind</button>' +
        (r.cl.mobile ? '<a class="btn btn-small btn-ghost" href="' + esc(telHref(r.cl.mobile)) + '">Call</a>' : '') + '</div></div>';
    }).join('') : '<div class="empty"><div class="big">🎉</div>No dues — every order is fully paid.</div>');
}

async function duesReminder(idx) {
  const r = S.dues && S.dues[idx];
  if (!r) return;
  const L = await clientLedgerData(r.id);
  openWa(r.cl.mobile, ledgerReminderText({ trade_name: r.cl.trade_name, contact_person: r.cl.contact_person }, L));
}

onAct('lg-open', (el) => openClientLedger(el.dataset.id));
onAct('lg-wa', () => { const s = S.ledger; if (s) openWa(s.cl.mobile, ledgerReminderText(s.cl, s.L)); });
onAct('dues-open', () => showSub('Client dues', renderDues));
onAct('dues-wa', (el) => duesReminder(+el.dataset.idx));
