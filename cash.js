/* ============================================================
   CASH AND THE DAY'S CLOSING (database update 19)
   · Cash handover: the cash a team member collected on bills, minus what
     he handed to the office. He hands it over in the app; the owner marks
     it received (or not received). The Today screen shows "Cash with you".
   · Today's closing (owner): the day's sales, money and gold received,
     returns, pieces given on approval and back, new orders, stock added —
     any day, shared on WhatsApp. The same arrives as a phone alert at 7:45 pm.
   ============================================================ */
'use strict';

function cashOn() { return !!S.dbv19 && typeof billsOn === 'function' && billsOn(); }

/* cash collected by each person (money received in cash), handed over, waiting */
async function cashState(userId) {
  let rq = db.from('receipts').select('created_by, amount').eq('kind', 'money').eq('mode', 'cash').limit(20000);
  let hq = db.from('cash_handovers').select('*').order('given_on', { ascending: false }).order('created_at', { ascending: false }).limit(5000);
  if (userId) { rq = rq.eq('created_by', userId); hq = hq.eq('from_user', userId); }
  const [rs, hs] = await Promise.all([rq, hq]);
  const per = new Map();
  const get = (id) => { if (!per.has(id)) per.set(id, { got: 0, given: 0, waiting: 0 }); return per.get(id); };
  (rs.data || []).forEach((r) => { if (r.created_by) get(r.created_by).got += Math.round(num(r.amount) * 100); });
  (hs.data || []).forEach((h) => {
    const x = get(h.from_user), a = Math.round(num(h.amount) * 100);
    if (h.status === 'received') x.given += a; else if (h.status === 'given') x.waiting += a;
  });
  return { per, list: hs.data || [] };
}
async function renderTodayCash(el) {
  if (!el) return;
  if (!cashOn() || isOwner()) { el.innerHTML = ''; return; }
  const C = await cashState(S.me.id);
  const x = C.per.get(S.me.id) || { got: 0, given: 0, waiting: 0 };
  const left = x.got - x.given - x.waiting;
  if (!$('#today-cash')) return;
  if (!x.got && !x.waiting) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="card gr-card"><div class="gr-h"><span>💵 Cash with you</span><b>' + esc(inr(Math.max(0, left))) + '</b></div>' +
    (x.waiting ? '<div class="gr-v muted">' + esc('Waiting for the owner to confirm: ' + inr(x.waiting)) + '</div>' : '') +
    (left > 0 ? '<button class="btn btn-small btn-primary" data-action="cash-give" data-max="' + left + '" style="margin-top:8px">Hand over cash</button>' : '') + '</div>';
}
function cashGiveModal(maxP) {
  const ov = openModal('<h3>Hand over cash</h3><p>' + esc('With you now: ' + inr(maxP)) + '</p>' +
    '<div class="field"><label>Amount (₹)</label><input type="text" inputmode="decimal" id="cg-amt" value="' + esc(String(maxP / 100)) + '"></div>' +
    '<div class="field"><label>Note (optional)</label><input type="text" id="cg-note" autocomplete="off" placeholder="e.g. Given to Bhavesh at the office"></div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Hand over</button></div>');
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    const a = numOrNull($('#cg-amt').value);
    if (a == null || a <= 0) { toast('Write the amount.', 'err'); return; }
    e.target.disabled = true;
    const { error } = await db.from('cash_handovers').insert({ from_user: S.me.id, amount: Math.round(a * 100) / 100, note: $('#cg-note').value.trim() || null });
    if (error) { e.target.disabled = false; toast('Could not save — try again.', 'err'); return; }
    closeModal();
    toast('Handed over ✓ — the owner will confirm it', 'ok');
    if ($('#today-cash')) renderTodayCash($('#today-cash')); else if (!isOwner()) renderMyCash();
  };
}
async function renderCashScreen() {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  if (!isOwner()) { renderMyCash(); return; }
  const C = await cashState(null);
  const people = Array.from(S.team.values()).filter((p) => C.per.has(p.id));
  const waiting = C.list.filter((h) => h.status === 'given');
  c.innerHTML = '<div class="notice">Cash the team collected on bills, and what each person handed over.</div>' +
    (waiting.length ? '<div class="section-label">To confirm (' + waiting.length + ')</div>' + waiting.map((h) =>
      '<div class="card rc-item"><div><b>' + esc(inrNum(h.amount)) + '</b> · ' + esc(nameOf(h.from_user)) + '<div class="rc-sub">' + esc([fmtD(h.given_on), h.note || ''].filter(Boolean).join(' · ')) + '</div></div>' +
      '<span class="rt-acts"><button class="btn btn-small btn-primary" data-action="cash-ok" data-id="' + h.id + '" data-s="received">Received</button>' +
      '<button class="btn btn-small btn-ghost" data-action="cash-ok" data-id="' + h.id + '" data-s="disputed">Not received</button></span></div>').join('') : '') +
    '<div class="section-label">Each person</div>' +
    (people.length ? '<div class="card bf-total">' + people.map((p) => {
      const x = C.per.get(p.id), left = x.got - x.given - x.waiting;
      return '<div class="bf-row sub"><span><b>' + esc(p.full_name || p.email || '—') + '</b></span><b class="' + (left > 0 ? 'o-red' : '') + '">' + esc(inr(Math.max(0, left)) + ' with him') + '</b></div>' +
        '<div class="bf-row"><span>Collected in cash</span><b>' + esc(inr(x.got)) + '</b></div><div class="bf-row"><span>Handed over</span><b>' + esc(inr(x.given)) + '</b></div>' +
        (x.waiting ? '<div class="bf-row"><span>Waiting to confirm</span><b>' + esc(inr(x.waiting)) + '</b></div>' : '');
    }).join('') + '</div>' : '<div class="empty">No cash collected on bills yet.</div>') +
    (C.list.length ? '<div class="section-label">Handed over</div>' + C.list.filter((h) => h.status !== 'given').slice(0, 60).map((h) =>
      '<div class="card rc-item' + (h.status === 'disputed' ? ' closed' : '') + '"><div><b>' + esc(inrNum(h.amount)) + '</b> · ' + esc(nameOf(h.from_user)) +
      '<div class="rc-sub">' + esc([fmtD(h.given_on), h.status === 'received' ? 'Received' : 'Not received', h.note || ''].filter(Boolean).join(' · ')) + '</div></div></div>').join('') : '');
}
/* a team member: his own cash */
async function renderMyCash() {
  const C = await cashState(S.me.id);
  const x = C.per.get(S.me.id) || { got: 0, given: 0, waiting: 0 };
  const left = x.got - x.given - x.waiting;
  const ST = { given: 'Waiting for the owner', received: 'Received', disputed: 'Not received — talk to the owner' };
  $('#content').innerHTML = '<div class="st-tot"><div><b>' + esc(inr(Math.max(0, left))) + '</b><span>With you</span></div><div><b>' + esc(inr(x.got)) + '</b><span>Collected in cash</span></div>' +
    '<div><b>' + esc(inr(x.given)) + '</b><span>Handed over</span></div></div>' +
    (left > 0 ? '<div class="action-row"><button class="btn btn-primary" data-action="cash-give" data-max="' + left + '">Hand over cash</button></div>' : '') +
    (C.list.length ? '<div class="section-label">Handed over</div>' + C.list.slice(0, 60).map((h) => '<div class="card rc-item' + (h.status === 'disputed' ? ' closed' : '') + '"><div><b>' + esc(inrNum(h.amount)) + '</b>' +
      '<div class="rc-sub">' + esc([fmtD(h.given_on), ST[h.status] || h.status, h.note || ''].filter(Boolean).join(' · ')) + '</div></div>' +
      (h.status === 'given' ? '<button class="btn btn-small btn-ghost" data-action="cash-del" data-id="' + h.id + '" aria-label="Remove">✕</button>' : '') + '</div>').join('') : '');
}
async function cashMark(id, status) {
  const { data, error } = await db.from('cash_handovers').update({ status, checked_by: S.me.id, checked_at: new Date().toISOString() }).eq('id', id).select('id');
  if (error || !data || !data.length) { toast('Could not save — only the owner confirms cash.', 'err'); return; }
  toast(status === 'received' ? 'Marked received ✓' : 'Marked not received', 'ok');
  renderCashScreen();
}

/* ---------------- the day's closing (owner) ---------------- */
async function closingData(day) {
  const from = dayStartISO(day), to = dayStartISO(addDaysStr(day, 1));
  const [bs, rc, rt, ap, ai, od, st] = await Promise.all([
    db.from('bills').select('kind, status, total_amt, gold_amt, dia_amt, cs_amt, labour_amt, extra_amt, discount_amt, gold_mode, fine_due_g, created_by').eq('bill_date', day).limit(5000),
    db.from('receipts').select('kind, mode, amount, fine_g').eq('received_on', day).limit(5000),
    returnsOn() ? db.from('bill_returns').select('money_amt, fine_g, pieces, status').eq('return_date', day).eq('status', 'open').limit(2000) : Promise.resolve({ data: [] }),
    db.from('approvals').select('id, approval_items(id)').eq('given_on', day).limit(2000),
    db.from('approval_items').select('status').eq('closed_on', day).limit(5000),
    db.from('orders').select('status').eq('order_date', day).limit(2000),
    db.from('catalogue_items').select('id', { count: 'exact', head: true }).gte('created_at', from).lt('created_at', to),
  ]);
  const sales = (bs.data || []).filter((b) => b.kind === 'sale' && b.status === 'open');
  const P = (x) => Math.round(num(x) * 100), M = (x) => Math.round(num(x) * 1000);
  const money = (rc.data || []).filter((r) => r.kind === 'money');
  const modes = new Map();
  money.forEach((r) => modes.set(r.mode, (modes.get(r.mode) || 0) + P(r.amount)));
  return {
    day, bills: sales.length, salesP: sales.reduce((s, b) => s + P(b.total_amt), 0), goldDueM: sales.filter((b) => b.gold_mode === 'metal').reduce((s, b) => s + M(b.fine_due_g), 0),
    quotes: (bs.data || []).filter((b) => b.kind === 'quote').length,
    moneyP: money.reduce((s, r) => s + P(r.amount), 0), modes,
    goldM: (rc.data || []).filter((r) => r.kind !== 'money').reduce((s, r) => s + M(r.fine_g), 0),
    returns: (rt.data || []).length, returnP: (rt.data || []).reduce((s, r) => s + P(r.money_amt), 0),
    apOut: (ap.data || []).reduce((s, m) => s + (m.approval_items || []).length, 0),
    apBack: (ai.data || []).filter((x) => x.status === 'returned').length, apSold: (ai.data || []).filter((x) => x.status === 'sold').length,
    orders: (od.data || []).filter((o) => o.status !== 'quote').length, stock: st.count || 0,
  };
}
function closingLines(X) {
  const L = [];
  L.push(['Sale bills', X.bills ? X.bills + ' · ' + inr(X.salesP) + (X.goldDueM ? ' + ' + gM(X.goldDueM) + ' gold' : '') : '0']);
  if (X.quotes) L.push(['Quotations', String(X.quotes)]);
  L.push(['Money received', inr(X.moneyP) + (X.modes.size > 1 ? ' (' + Array.from(X.modes.entries()).map((e) => payModeLabel(e[0]) + ' ' + inr(e[1])).join(', ') + ')' : X.modes.size ? ' (' + payModeLabel(Array.from(X.modes.keys())[0]) + ')' : '')]);
  if (X.goldM) L.push(['Gold received', gM(X.goldM) + ' fine']);
  if (X.returns) L.push(['Returns', X.returns + ' · ' + inr(X.returnP)]);
  if (X.apOut || X.apBack || X.apSold) L.push(['On approval', X.apOut + ' given · ' + X.apBack + ' back · ' + X.apSold + ' kept']);
  if (X.orders) L.push(['New orders', String(X.orders)]);
  if (X.stock) L.push(['Stock added', String(X.stock)]);
  return L;
}
async function renderClosing() {
  S.clDay = S.clDay || todayStr();
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const X = await closingData(S.clDay);
  if (!$('#content')) return;
  S.clData = X;
  c.innerHTML = '<div class="section-label sl-row"><span class="tg-month"><button data-action="cl-day" data-d="-1" aria-label="Day before">‹</button><b>' + esc(fmtD(S.clDay)) + '</b>' +
    '<button data-action="cl-day" data-d="1" aria-label="Next day"' + (S.clDay >= todayStr() ? ' disabled' : '') + '>›</button></span></div>' +
    '<div class="card bf-total">' + closingLines(X).map((l) => '<div class="bf-row"><span>' + esc(l[0]) + '</span><b>' + esc(l[1]) + '</b></div>').join('') + '</div>' +
    '<div class="action-row"><button class="btn btn-primary" data-action="cl-wa">WhatsApp</button></div>';
}
function closingText(X) {
  return 'Closing — ' + fmtD(X.day) + ' · ' + bizName() + '\n' + closingLines(X).map((l) => l[0] + ': ' + l[1]).join('\n');
}

onAct('cash-give', (el) => cashGiveModal(+el.dataset.max || 0));
onAct('cash-open', () => showSub('Cash handover', renderCashScreen));
onAct('cash-ok', (el) => cashMark(el.dataset.id, el.dataset.s));
onAct('cash-del', (el) => confirmModal('Remove this entry?', 'Only while the owner has not confirmed it.', 'Remove', async () => {
  const { data, error } = await db.from('cash_handovers').delete().eq('id', el.dataset.id).select('id');
  if (error || !data || !data.length) { toast('Could not remove — the owner may have confirmed it.', 'err'); return; }
  toast('Removed', 'ok');
  renderMyCash();
}, true));
onAct('cl-open', () => { S.clDay = todayStr(); showSub('Today\'s closing', renderClosing); });
onAct('cl-day', (el) => { S.clDay = addDaysStr(S.clDay || todayStr(), +el.dataset.d); if (S.clDay > todayStr()) S.clDay = todayStr(); renderClosing(); });
onAct('cl-wa', () => { if (S.clData) openWa('', closingText(S.clData)); });
