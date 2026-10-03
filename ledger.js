/* ============================================================
   PARTY ACCOUNTS — each client's khata: orders, payments (cash /
   bank / UPI / cheque / old gold), opening balance, discounts,
   other charges and refunds, with a running balance; settle-up
   ("account clear"); the DUES list with WhatsApp reminders.
   Quotations and cancelled orders are left out of all totals.

   Balance = orders + opening + charges + refunds
             − payments − discounts          (minus = advance with us)
   ============================================================ */
'use strict';

const PARTY_KIND_LABEL = { opening: 'Opening balance', payment: 'Payment received', discount: 'Discount / settlement', charge: 'Other charge', refund: 'Refund paid' };
const PARTY_SIGN = { opening: 1, charge: 1, refund: 1, payment: -1, discount: -1 };   // effect on what the client owes
const MONEY_MODES = ['Cash', 'Bank'];   // UPI, cheque and transfers are all "Bank"

function isLiveOrder(o) { return o.status !== 'cancelled' && o.status !== 'quote'; }
function isDiscountPay(p) { return p.mode === 'Discount'; }

async function clientLedgerData(clientId) {
  const { data: orders } = await db.from('orders')
    .select('id, order_no, order_type, status, order_date, due_date, delivered_on, total_amount, paid_amount, purity, wastage_pct, client_metal_g, client_metal_purity')
    .eq('client_id', clientId).order('order_date', { ascending: true }).order('order_no', { ascending: true });
  const all = orders || [];
  const live = all.filter(isLiveOrder);
  const ids = live.map((o) => o.id);
  const [pr, ir, tr] = await Promise.all([
    ids.length ? db.from('order_payments').select('*').in('order_id', ids).order('paid_on', { ascending: true }).order('created_at', { ascending: true }) : Promise.resolve({ data: [] }),
    ids.length ? db.from('order_items').select('order_id, net_wt').in('order_id', ids) : Promise.resolve({ data: [] }),
    db.from('party_txns').select('*').eq('client_id', clientId).order('txn_date', { ascending: true }).order('created_at', { ascending: true }),
  ]);
  const pays = pr.data || [];
  const ptx = tr.error ? [] : (tr.data || []);
  const net = new Map();
  (ir.data || []).forEach((it) => net.set(it.order_id, (net.get(it.order_id) || 0) + num(it.net_wt)));
  const gold = [];
  live.forEach((o) => {
    const led = jwLedger(o, net.get(o.id) || 0);
    if (led) gold.push({ o, led });
  });
  const sumP = (k) => ptx.filter((t) => t.kind === k).reduce((a, t) => a + num(t.amount), 0);
  const totals = {
    business: live.reduce((a, o) => a + num(o.total_amount), 0),
    received: pays.filter((p) => !isDiscountPay(p)).reduce((a, p) => a + num(p.amount), 0) + sumP('payment'),
    discount: pays.filter(isDiscountPay).reduce((a, p) => a + num(p.amount), 0) + sumP('discount'),
    opening: sumP('opening'), charges: sumP('charge'), refunds: sumP('refund'),
    goldIn: gold.reduce((a, g) => a + g.led.inFine, 0),
    goldUsed: gold.reduce((a, g) => a + g.led.usedFine, 0),
  };
  totals.due = round2(totals.business + totals.opening + totals.charges + totals.refunds - totals.received - totals.discount);
  // the part of the balance that is not on any order (opening balance, charges, refunds) and is still unpaid —
  // it is the oldest, so money received clears it first
  totals.extraDue = Math.max(0, round2(totals.opening + totals.charges + totals.refunds - sumP('payment') - sumP('discount')));
  totals.goldBal = totals.goldIn - totals.goldUsed;

  // running statement, oldest first
  const on = new Map(live.map((o) => [o.id, o]));
  const rank = { opening: 0, order: 1, charge: 2, refund: 3, payment: 4, discount: 5 };
  const entries = [];
  ptx.filter((t) => t.kind === 'opening').forEach((t) => entries.push({ date: t.txn_date, kind: 'opening', text: 'Opening balance' + (t.note ? ' — ' + t.note : ''), debit: num(t.amount), credit: 0, ptx: t }));
  live.forEach((o) => entries.push({ date: o.order_date, kind: 'order', text: ordNo(o.order_no) + ' · ' + (OTYPE_LABEL[o.order_type] || ''), debit: num(o.total_amount), credit: 0, order: o }));
  pays.forEach((p) => {
    const o = on.get(p.order_id);
    entries.push({ date: p.paid_on, kind: isDiscountPay(p) ? 'discount' : 'payment',
      text: (isDiscountPay(p) ? 'Discount' : 'Received' + (p.mode ? ' · ' + p.mode : '')) + (o ? ' · ' + ordNo(o.order_no) : '') + (p.note ? ' — ' + p.note : ''),
      debit: 0, credit: num(p.amount), pay: p });
  });
  ptx.filter((t) => t.kind !== 'opening').forEach((t) => entries.push({ date: t.txn_date, kind: t.kind,
    text: PARTY_KIND_LABEL[t.kind] + (t.mode ? ' · ' + t.mode : '') + (t.note ? ' — ' + t.note : ''),
    debit: PARTY_SIGN[t.kind] > 0 ? num(t.amount) : 0, credit: PARTY_SIGN[t.kind] < 0 ? num(t.amount) : 0, ptx: t }));
  const made = (e) => (e.pay || e.ptx || {}).created_at || '';
  entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : rank[a.kind] !== rank[b.kind] ? rank[a.kind] - rank[b.kind] : made(a) < made(b) ? -1 : made(a) > made(b) ? 1 : 0));
  let run = 0;
  entries.forEach((e) => { run = round2(run + e.debit - e.credit); e.bal = run; });

  return { all, live, quotes: all.filter((o) => o.status === 'quote'), pays, ptx, gold, totals, entries };
}

function balText(b) { return b >= 1 ? inr(b) + ' due' : b <= -1 ? inr(-b) + ' advance' : 'Clear'; }

function ledgerReminderText(cl, L) {
  const T = L.totals;
  const name = cl.contact_person || cl.trade_name || '';
  const lines = ['Namaste ' + name + ',', '', 'Account summary from ' + bizName() + ' as on ' + fmtDLong(todayStr()) + ':'];
  if (T.opening) lines.push('Opening balance: ' + inr(T.opening));
  lines.push('Total of orders: ' + inr(T.business));
  if (T.charges) lines.push('Other charges: ' + inr(T.charges));
  lines.push('Received: ' + inr(T.received));
  if (T.discount) lines.push('Discount: ' + inr(T.discount));
  lines.push(T.due >= 1 ? '*Balance due: ' + inr(T.due) + '*' : T.due <= -1 ? '*Advance with us: ' + inr(-T.due) + '*' : '*Account clear*');
  const pending = L.live.filter((o) => balanceOf(o) >= 1);
  if (pending.length && T.due >= 1) {
    lines.push('');
    pending.slice(0, 8).forEach((o) => lines.push(ordNo(o.order_no) + ' (' + fmtD(o.order_date) + '): ' + inr(balanceOf(o))));
  }
  if (Math.abs(T.goldBal) > 0.0005) {
    lines.push('');
    lines.push(T.goldBal > 0 ? 'Your gold with us: ' + grams(T.goldBal) + ' fine' : 'Gold due from you: ' + grams(-T.goldBal) + ' fine');
  }
  lines.push('');
  lines.push(T.due >= 1 ? 'Kindly arrange the balance payment at your convenience. Thank you!' : 'Thank you for your business!');
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
  const extra = [T.opening ? 'Opening ' + inr(T.opening) : '', T.charges ? 'Charges ' + inr(T.charges) : '', T.refunds ? 'Refunds ' + inr(T.refunds) : '',
    T.discount ? 'Discount ' + inr(T.discount) : ''].filter(Boolean).join(' · ');
  const owner = isOwner();
  c.innerHTML =
    '<div class="client-head"><h2>' + esc(cl.trade_name) + '</h2>' +
    '<div class="co">' + esc([cl.contact_person, cl.city].filter(Boolean).join(' · ')) + '</div>' +
    '<div class="lg-nums">' +
    '<div><span>Orders total</span><b>' + inr(T.business) + '</b></div>' +
    '<div><span>Received</span><b>' + inr(T.received) + '</b></div>' +
    '<div class="' + (T.due >= 1 ? 'due' : 'clear') + '"><span>' + (T.due <= -1 ? 'Advance' : 'Balance due') + '</span><b>' + inr(Math.abs(T.due)) + '</b></div>' +
    '</div>' + (extra ? '<div class="lg-extra">' + esc(extra) + '</div>' : '') + '</div>' +

    '<div class="action-row">' +
    '<button class="btn btn-primary" data-action="pt-receive">＋ Receive payment</button>' +
    (owner ? '<button class="btn btn-secondary" data-action="pt-settle"' + (T.due >= 1 ? '' : ' disabled') + '>Settle up</button>' : '') +
    '</div>' +
    '<div class="action-row">' +
    '<button class="btn btn-secondary" data-action="d-client" data-id="' + cl.id + '">Statement PDF</button>' +
    '<button class="btn btn-secondary" data-action="lg-wa">WhatsApp</button>' +
    (cl.mobile ? '<a class="btn btn-secondary" href="' + esc(telHref(cl.mobile)) + '">Call</a>' : '') +
    '</div>' +
    (owner ? '<div style="text-align:center;margin:-2px 0 6px"><a href="#" class="lg-link" data-action="pt-other">＋ Opening balance, charge or refund</a></div>' : '') +

    (L.gold.length ? '<div class="section-label">Gold account (job work)</div><div class="card">' +
      '<div class="o-lrow"><span>Fine gold received</span><b>' + grams(T.goldIn) + '</b></div>' +
      '<div class="o-lrow"><span>Fine gold used (incl. wastage)</span><b>' + grams(T.goldUsed) + '</b></div>' +
      '<div class="o-lnote ' + (T.goldBal < -0.0005 ? 'neg' : '') + '">' + goldMsg + '</div></div>' : '') +

    '<div class="section-label">Account statement</div>' +
    (L.entries.length ? '<div class="card lg-stmt">' +
      '<div class="lg-st-head"><span>Date · details</span><span>Amount</span><span>Balance</span></div>' +
      L.entries.slice().reverse().map((e) => {
        const tap = e.order ? ' data-action="o-open" data-id="' + e.order.id + '"' : '';
        const del = e.ptx && owner ? '<button class="fu-x" data-action="pt-del" data-id="' + e.ptx.id + '" aria-label="Remove entry">✕</button>' : '';
        return '<div class="lg-st-row' + (e.order ? ' tap' : '') + '"' + tap + '>' +
          '<div class="lg-st-main"><span class="lg-st-date">' + esc(fmtD(e.date)) + '</span> ' + esc(e.text) +
          (e.order ? ' <span style="display:inline-block">' + chipStatus(e.order.status) + '</span>' : '') + '</div>' +
          '<div class="lg-st-amt ' + (e.debit ? 'dr' : 'cr') + '">' + (e.kind === 'order' && !e.debit ? '<span class="lg-np">No price yet</span>' : e.debit ? inr(e.debit) : '− ' + inr(e.credit)) + '</div>' +
          '<div class="lg-st-bal">' + esc(balText(e.bal)) + del + '</div></div>';
      }).join('') + '</div>' : '<div class="empty" style="padding:12px">No orders or payments yet.</div>') +

    (L.quotes.length ? '<div class="notice">' + L.quotes.length + ' quotation' + (L.quotes.length === 1 ? '' : 's') + ' not yet confirmed — not counted above.</div>' : '');
}

/* ---------------- money in: the opening balance first, then the oldest unpaid orders ---------------- */
async function allocateToOrders(L, amount, mode, date, note) {
  const keep = Math.min(round2(amount), L.totals.extraDue || 0);   // stays "on account" against the opening balance / charges
  let left = round2(amount - keep);
  let used = 0;
  const open = L.live.filter((o) => balanceOf(o) >= 0.01).sort((a, b) => (a.order_date < b.order_date ? -1 : a.order_date > b.order_date ? 1 : a.order_no - b.order_no));
  for (const o of open) {
    if (left < 0.01) break;
    const take = round2(Math.min(left, balanceOf(o)));
    const { error } = await db.from('order_payments').insert({ order_id: o.id, amount: take, mode, paid_on: date, note: note || null, created_by: S.me.id });
    if (error) break;
    left = round2(left - take);
    used++;
  }
  return { left: round2(left + keep), used };
}

function openReceiveModal(settle) {
  const s = S.ledger;
  if (!s) return;
  const T = s.L.totals;
  const due = Math.max(0, T.due);
  const modeOpts = MONEY_MODES.map((m) => '<option value="' + m + '">' + m + '</option>').join('');
  const ov = openModal('<h3>' + (settle ? 'Settle up — ' : 'Receive payment — ') + esc(s.cl.trade_name) + '</h3>' +
    '<p>' + (due >= 1 ? 'Balance due: <b>' + inr(due) + '</b>' : T.due <= -1 ? 'Advance with us: <b>' + inr(-T.due) + '</b>' : 'Account is clear.') + '</p>' +
    '<div class="o-2col">' +
    '<div class="field"><label>' + (settle ? 'Received now ₹' : 'Amount ₹') + '</label><input type="text" inputmode="decimal" id="pr-amt" value="' + (due >= 1 && !settle ? Math.round(due) : '') + '"></div>' +
    '<div class="field"><label>Mode</label><select id="pr-mode">' + modeOpts + '</select></div>' +
    '</div>' +
    (settle ? '<div class="field"><label>Discount to clear the rest ₹</label><input type="text" inputmode="decimal" id="pr-disc" value="' + Math.round(due) + '">' +
      '<div class="hint">Kasar / round-off — it closes the balance without counting as money received.</div></div>' : '') +
    '<div class="o-2col">' +
    '<div class="field"><label>Date</label><input type="date" id="pr-date" value="' + todayStr() + '"></div>' +
    '<div class="field"><label>Note</label><input type="text" id="pr-note" placeholder="optional"></div>' +
    '</div>' +
    '<label class="pr-check"><input type="checkbox" id="pr-alloc" checked> Adjust against orders, oldest first</label>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">' + (settle ? 'Settle account' : 'Save payment') + '</button></div>');
  if (settle) {
    const amt = $('#pr-amt'), disc = $('#pr-disc');
    amt.addEventListener('input', () => { disc.value = String(Math.max(0, Math.round(due - num(amt.value)))); });
  }
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    const amt = num($('#pr-amt').value);
    const disc = settle ? num($('#pr-disc').value) : 0;
    if (!(amt > 0) && !(disc > 0)) { toast('Enter the amount received.', 'err'); return; }
    const mode = $('#pr-mode').value, date = $('#pr-date').value || todayStr(), note = $('#pr-note').value.trim();
    const alloc = $('#pr-alloc').checked;
    e.target.disabled = true;
    let used = 0;
    // money first, then the discount (both go to the oldest orders first)
    if (amt > 0) {
      let left = amt;
      if (alloc) { const r = await allocateToOrders(s.L, amt, mode, date, note); left = r.left; used += r.used; }
      if (left >= 0.01) {
        const { error } = await db.from('party_txns').insert({ client_id: s.cl.id, kind: 'payment', amount: round2(left), mode, txn_date: date, note: note || null, created_by: S.me.id });
        if (error) { e.target.disabled = false; toast('Could not save — try again.', 'err'); return; }
      }
    }
    if (disc > 0) {
      const L2 = await clientLedgerData(s.cl.id);
      let left = disc;
      if (alloc) { const r = await allocateToOrders(L2, disc, 'Discount', date, note); left = r.left; used += r.used; }
      if (left >= 0.01) await db.from('party_txns').insert({ client_id: s.cl.id, kind: 'discount', amount: round2(left), txn_date: date, note: note || null, created_by: S.me.id });
    }
    closeModal();
    toast(settle ? 'Account settled ✓' : 'Payment of ' + inr(amt) + ' recorded ✓', 'ok');
    renderLedger(s.cl);
  };
}

function openOtherEntryModal() {
  const s = S.ledger;
  if (!s) return;
  const kinds = ['opening', 'charge', 'refund', 'discount', 'payment'];
  const ov = openModal('<h3>Add to ' + esc(s.cl.trade_name) + '\'s account</h3>' +
    '<div class="field"><label>Entry</label><select id="po-kind">' + kinds.map((k) => '<option value="' + k + '">' + PARTY_KIND_LABEL[k] + '</option>').join('') + '</select>' +
    '<div class="hint" id="po-hint"></div></div>' +
    '<div class="o-2col">' +
    '<div class="field"><label>Amount ₹</label><input type="text" inputmode="decimal" id="po-amt"></div>' +
    '<div class="field" id="po-mode-wrap" style="display:none"><label>Mode</label><select id="po-mode">' + MONEY_MODES.map((m) => '<option value="' + m + '">' + m + '</option>').join('') + '</select></div>' +
    '</div>' +
    '<div class="o-2col">' +
    '<div class="field"><label>Date</label><input type="date" id="po-date" value="' + todayStr() + '"></div>' +
    '<div class="field"><label>Note</label><input type="text" id="po-note" placeholder="optional"></div>' +
    '</div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Save</button></div>');
  const hints = {
    opening: 'What the client already owed you before you started using the app.',
    charge: 'Anything billed outside an order — hallmarking, certificate, courier …',
    refund: 'Money you paid back to the client.',
    discount: 'A discount that reduces what the client owes.',
    payment: 'Money received that is not for a particular order (kept as advance).',
  };
  const kindSel = $('#po-kind');
  const sync = () => { $('#po-hint').textContent = hints[kindSel.value] || ''; $('#po-mode-wrap').style.display = kindSel.value === 'payment' || kindSel.value === 'refund' ? '' : 'none'; };
  kindSel.onchange = sync; sync();
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    const amt = num($('#po-amt').value);
    if (!(amt > 0)) { toast('Type the amount.', 'err'); return; }
    const kind = kindSel.value;
    e.target.disabled = true;
    const { error } = await db.from('party_txns').insert({
      client_id: s.cl.id, kind, amount: round2(amt), mode: kind === 'payment' || kind === 'refund' ? $('#po-mode').value : null,
      txn_date: $('#po-date').value || todayStr(), note: $('#po-note').value.trim() || null, created_by: S.me.id,
    });
    if (error) { e.target.disabled = false; toast('Could not save — try again.', 'err'); return; }
    closeModal();
    toast(PARTY_KIND_LABEL[kind] + ' saved ✓', 'ok');
    renderLedger(s.cl);
  };
}

/* ---------------- everyone's balance (dues list, summary, reports) ---------------- */
async function partyBalances() {
  let or, tr, dr;
  try {
    [or, tr, dr] = await Promise.all([
      fetchPaged(() => db.from('orders').select('id, order_no, client_id, status, order_date, delivered_on, total_amount, paid_amount, clients(trade_name, city, mobile, contact_person)')
        .in('status', ['new', 'in_production', 'ready', 'delivered']).order('id', { ascending: true })),
      fetchPaged(() => db.from('party_txns').select('id, client_id, kind, amount, txn_date, clients(trade_name, city, mobile, contact_person)').order('id', { ascending: true })),
      fetchPaged(() => db.from('order_payments').select('id, order_id, amount').eq('mode', 'Discount').order('id', { ascending: true })),
    ]);
  } catch (e) { return null; }
  const discOn = new Map();
  dr.forEach((p) => discOn.set(p.order_id, (discOn.get(p.order_id) || 0) + num(p.amount)));
  const by = new Map();
  const get = (id, cl) => {
    if (!by.has(id)) by.set(id, { id, cl: cl || {}, due: 0, billed: 0, received: 0, discount: 0, orders: [], oldest: null });
    const e = by.get(id);
    if (cl && !e.cl.trade_name) e.cl = cl;
    return e;
  };
  or.forEach((o) => {
    const e = get(o.client_id, o.clients);
    const disc = discOn.get(o.id) || 0;
    e.billed += num(o.total_amount);
    e.received += num(o.paid_amount) - disc;
    e.discount += disc;
    e.due += num(o.total_amount) - num(o.paid_amount);
    if (balanceOf(o) >= 1) {
      e.orders.push(o);
      const since = o.delivered_on || o.order_date;
      if (!e.oldest || since < e.oldest) e.oldest = since;
    }
  });
  tr.forEach((t) => {
    const e = get(t.client_id, t.clients);
    const v = (PARTY_SIGN[t.kind] || 0) * num(t.amount);
    e.due += v;
    if (v > 0) e.billed += v; else if (t.kind === 'payment') e.received -= v; else e.discount -= v;
    if (t.kind === 'opening' && (!e.oldest || t.txn_date < e.oldest)) e.oldest = t.txn_date;
  });
  by.forEach((e) => { e.due = round2(e.due); });
  return by;
}

/* ---------------- dues: who owes how much ---------------- */
async function renderDues() {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const by = await partyBalances();
  if (!$('#content')) return;
  if (!by) { c.innerHTML = '<div class="empty">Could not load dues.</div>'; return; }
  const rows = Array.from(by.values()).filter((r) => r.due >= 1).sort((a, b) => b.due - a.due);
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
    }).join('') : '<div class="empty"><div class="big">🎉</div>No dues — every account is clear.</div>');
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
onAct('pt-receive', () => openReceiveModal(false));
onAct('pt-settle', () => openReceiveModal(true));
onAct('pt-other', () => openOtherEntryModal());
onAct('pt-del', (el) => confirmModal('Remove this entry?', 'The client\'s balance will change.', 'Remove', async () => {
  const { error } = await db.from('party_txns').delete().eq('id', el.dataset.id);
  if (error) { toast('Could not remove — only the owner can remove entries.', 'err'); return; }
  toast('Entry removed', 'ok');
  if (S.ledger) renderLedger(S.ledger.cl);
}, true));
