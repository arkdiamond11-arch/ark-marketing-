/* ============================================================
   ACCOUNTS — money in and out, by cash and bank, for any period:
   payments from clients (on orders and on account), payments to
   karigars, refunds and expenses. Expenses are added here.
   Bank includes UPI and cheques. Old gold and discounts are shown
   separately — they are not cash or bank money.
   ============================================================ */
'use strict';

const EXP_CATS = ['Rent', 'Salary', 'Travel', 'Hallmarking', 'Certification', 'Courier', 'Packing', 'Polish / labour', 'Electricity', 'Office', 'Other'];
const EXP_MODES = ['Cash', 'Bank', 'UPI', 'Cheque'];
const ACC_PERIODS = [['today', 'Today'], ['7d', '7 days'], ['month', 'This month'], ['lastmonth', 'Last month'], ['fy', 'This year'], ['all', 'All'], ['custom', 'Dates']];

function modeBucket(m) {
  if (m === 'Cash') return 'cash';
  if (m === 'Bank' || m === 'UPI' || m === 'Cheque') return 'bank';
  if (m === 'Old gold') return 'gold';
  return 'other';
}
/* financial year: 1 April – 31 March */
function fyStart() {
  const d = new Date();
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return y + '-04-01';
}
function periodRange(p, from, to) {
  const t = todayStr();
  if (p === 'today') return [t, t];
  if (p === '7d') return [todayStr(-6), t];
  if (p === 'month') return [monthStart(), t];
  if (p === 'lastmonth') { const s = addMonths(monthStart(), -1); return [s, todayStr(-new Date().getDate())]; }
  if (p === 'fy') return [fyStart(), t];
  if (p === 'custom') return [from || null, to || null];
  return [null, null];
}
function rangeLabel(r) {
  if (!r[0] && !r[1]) return 'All dates';
  if (r[0] === r[1]) return fmtDLong(r[0]);
  return (r[0] ? fmtD(r[0]) : '…') + ' – ' + (r[1] ? fmtD(r[1]) : '…');
}
function inRange(q, col, r) {
  if (r[0]) q = q.gte(col, r[0]);
  if (r[1]) q = q.lte(col, r[1]);
  return q;
}

async function accountsData(r) {
  const page = (table, sel, col, more) => fetchPaged(() => more(inRange(db.from(table).select(sel), col, r)).order(col, { ascending: true }).order('id', { ascending: true }));
  const [op, pt, kt, ex] = await Promise.all([
    page('order_payments', 'id, amount, mode, paid_on, note, created_at, orders(order_no, clients(trade_name))', 'paid_on', (q) => q),
    page('party_txns', 'id, kind, amount, mode, txn_date, note, created_at, clients(trade_name)', 'txn_date', (q) => q.in('kind', ['payment', 'refund'])),
    page('karigar_txns', 'id, amount, mode, txn_date, note, created_at, karigars(name)', 'txn_date', (q) => q.eq('kind', 'payment')),
    page('expenses', '*', 'exp_date', (q) => q),
  ]);
  const rows = [];
  op.forEach((p) => {
    const o = p.orders || {};
    rows.push({ date: p.paid_on, at: p.created_at, dir: p.mode === 'Discount' ? 'disc' : 'in', mode: p.mode || '', amount: num(p.amount),
      who: (o.clients && o.clients.trade_name) || '', what: (o.order_no ? ordNo(o.order_no) : 'Order') + (p.note ? ' · ' + p.note : '') });
  });
  pt.forEach((t) => rows.push({ date: t.txn_date, at: t.created_at, dir: t.kind === 'payment' ? 'in' : 'out', mode: t.mode || '', amount: num(t.amount),
    who: (t.clients && t.clients.trade_name) || '', what: (t.kind === 'payment' ? 'On account' : 'Refund') + (t.note ? ' · ' + t.note : '') }));
  kt.forEach((t) => rows.push({ date: t.txn_date, at: t.created_at, dir: 'out', mode: t.mode || '', amount: num(t.amount),
    who: (t.karigars && t.karigars.name) || 'Karigar', what: 'Karigar payment' + (t.note ? ' · ' + t.note : '') }));
  ex.forEach((x) => rows.push({ date: x.exp_date, at: x.created_at, dir: 'out', mode: x.mode || '', amount: num(x.amount),
    who: x.category, what: (x.note || 'Expense') + ' · ' + nameOf(x.created_by), expense: x }));
  rows.forEach((x) => { x.bucket = modeBucket(x.mode); });
  rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.at || '') < (b.at || '') ? 1 : (a.at || '') > (b.at || '') ? -1 : 0));
  const sum = (f) => rows.filter(f).reduce((a, x) => a + x.amount, 0);
  const T = {
    cashIn: sum((x) => x.dir === 'in' && x.bucket === 'cash'), cashOut: sum((x) => x.dir === 'out' && x.bucket === 'cash'),
    bankIn: sum((x) => x.dir === 'in' && x.bucket === 'bank'), bankOut: sum((x) => x.dir === 'out' && x.bucket === 'bank'),
    gold: sum((x) => x.dir === 'in' && x.bucket === 'gold'), disc: sum((x) => x.dir === 'disc'),
    expenses: sum((x) => !!x.expense),
  };
  return { rows, T };
}

async function renderAccounts() {
  S.acc = S.acc || { p: 'month', from: '', to: '', show: 'all' };
  const A = S.acc;
  const c = $('#content');
  const r = periodRange(A.p, A.from, A.to);
  c.innerHTML =
    '<div class="filter-chips">' + ACC_PERIODS.map((x) => '<button class="' + (A.p === x[0] ? 'on' : '') + '" data-action="acc-p" data-p="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>' +
    (A.p === 'custom' ? '<div class="card" style="padding:10px 14px"><div class="o-2col"><div class="field" style="margin:0"><label>From</label><input type="date" id="acc-from" value="' + esc(A.from) + '"></div>' +
      '<div class="field" style="margin:0"><label>To</label><input type="date" id="acc-to" value="' + esc(A.to) + '"></div></div></div>' : '') +
    '<div id="acc-body">' + loadingHTML() + '</div>';
  ['#acc-from', '#acc-to'].forEach((sel) => {
    const el = $(sel);
    if (el) el.addEventListener('change', () => { A.from = $('#acc-from').value; A.to = $('#acc-to').value; renderAccounts(); });
  });
  let D;
  try { D = await accountsData(r); } catch (e) { const b = $('#acc-body'); if (b) b.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  const box = $('#acc-body');
  if (!box) return;
  S.accData = D;
  const T = D.T;
  const tile = (label, v, cls) => '<div class="stat"><div class="st-num o-num-sm' + (cls ? ' ' + cls : '') + '">' + inr(v) + '</div><div class="st-label">' + label + '</div></div>';
  const list = D.rows.filter((x) => A.show === 'all' || x.bucket === A.show || (A.show === 'other' && (x.bucket === 'gold' || x.dir === 'disc')));
  box.innerHTML =
    '<div class="hint" style="margin:0 2px 8px">' + esc(rangeLabel(r)) + '</div>' +
    '<div class="section-label">Cash</div><div class="stat-row">' + tile('In', T.cashIn) + tile('Out', T.cashOut) + tile('Net', T.cashIn - T.cashOut, T.cashIn - T.cashOut < 0 ? 'o-red' : '') + '</div>' +
    '<div class="section-label">Bank, UPI &amp; cheque</div><div class="stat-row">' + tile('In', T.bankIn) + tile('Out', T.bankOut) + tile('Net', T.bankIn - T.bankOut, T.bankIn - T.bankOut < 0 ? 'o-red' : '') + '</div>' +
    ((T.gold || T.disc || T.expenses) ? '<div class="hint" style="margin:6px 2px 0">' + [T.expenses ? 'Expenses ' + inr(T.expenses) : '', T.gold ? 'Old gold taken ' + inr(T.gold) : '',
      T.disc ? 'Discounts given ' + inr(T.disc) : ''].filter(Boolean).join(' · ') + '</div>' : '') +
    '<div class="action-row" style="margin-top:12px">' +
    '<button class="btn btn-primary" data-action="exp-add">＋ Add expense</button>' +
    '<button class="btn btn-secondary" data-action="acc-csv">⬇ Excel</button></div>' +
    '<div class="filter-chips">' + [['all', 'All'], ['cash', 'Cash'], ['bank', 'Bank'], ['other', 'Old gold & discounts']].map((x) =>
      '<button class="' + (A.show === x[0] ? 'on' : '') + '" data-action="acc-show" data-v="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>' +
    (list.length ? '<div class="card" style="padding:4px 14px">' + list.slice(0, 400).map((x) =>
      '<div class="acc-row"><div class="acc-main"><b>' + esc(x.who || '—') + '</b><div class="o-item-meta">' + esc(fmtD(x.date)) + ' · ' + esc(x.what) + (x.mode ? ' · ' + esc(x.mode) : '') + '</div></div>' +
      '<div class="acc-amt ' + (x.dir === 'in' ? 'in' : x.dir === 'out' ? 'out' : 'disc') + '">' + (x.dir === 'in' ? '+ ' : x.dir === 'out' ? '− ' : '') + inr(x.amount) + '</div>' +
      (x.expense && isOwner() ? '<button class="fu-x" data-action="exp-del" data-id="' + x.expense.id + '" aria-label="Remove expense">✕</button>' : '') + '</div>').join('') + '</div>' +
      (list.length > 400 ? '<div class="hint" style="text-align:center">Showing the newest 400 — download for all.</div>' : '')
      : '<div class="empty" style="padding:14px">No money in or out in this period.</div>');
}

/* team members: their own expenses */
async function renderMyExpenses() {
  const c = $('#content');
  c.innerHTML = '<button class="btn btn-primary" data-action="exp-add" style="margin-bottom:12px">＋ Add expense</button><div id="exp-list">' + loadingHTML() + '</div>';
  const { data, error } = await db.from('expenses').select('*').order('exp_date', { ascending: false }).limit(300);
  const box = $('#exp-list');
  if (!box) return;
  if (error) { box.innerHTML = '<div class="empty">Could not load.</div>'; return; }
  const rows = data || [];
  box.innerHTML = rows.length ? '<div class="card" style="padding:4px 14px">' + rows.map((x) =>
    '<div class="acc-row"><div class="acc-main"><b>' + esc(x.category) + '</b><div class="o-item-meta">' + esc(fmtD(x.exp_date)) + (x.note ? ' · ' + esc(x.note) : '') + ' · ' + esc(x.mode) + '</div></div>' +
    '<div class="acc-amt out">' + inr(x.amount) + '</div></div>').join('') + '</div>'
    : '<div class="empty"><div class="big">🧾</div>No expenses yet.</div>';
}

function openExpenseModal() {
  const ov = openModal('<h3>Add expense</h3>' +
    '<div class="o-2col">' +
    '<div class="field"><label>Category</label><select id="ex-cat">' + EXP_CATS.map((x) => '<option value="' + esc(x) + '">' + esc(x) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>Amount ₹</label><input type="text" inputmode="decimal" id="ex-amt"></div>' +
    '<div class="field"><label>Paid by</label><select id="ex-mode">' + EXP_MODES.map((x) => '<option value="' + x + '">' + x + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>Date</label><input type="date" id="ex-date" value="' + todayStr() + '"></div>' +
    '</div>' +
    '<div class="field"><label>Note</label><input type="text" id="ex-note" placeholder="optional"></div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Save expense</button></div>');
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    const amt = num($('#ex-amt').value);
    if (!(amt > 0)) { toast('Type the amount.', 'err'); return; }
    e.target.disabled = true;
    const { error } = await db.from('expenses').insert({ category: $('#ex-cat').value, amount: round2(amt), mode: $('#ex-mode').value,
      exp_date: $('#ex-date').value || todayStr(), note: $('#ex-note').value.trim() || null, created_by: S.me.id });
    if (error) { e.target.disabled = false; toast('Could not save — try again.', 'err'); return; }
    closeModal();
    toast('Expense saved ✓', 'ok');
    if ($('#acc-body')) renderAccounts(); else if ($('#exp-list')) renderMyExpenses();
  };
}

function accountsCsv() {
  const D = S.accData;
  if (!D) return;
  const r = periodRange(S.acc.p, S.acc.from, S.acc.to);
  downloadFile('day-book-' + (r[0] || 'start') + '-to-' + (r[1] || todayStr()) + '.csv', buildCsv(
    ['Date', 'In / out', 'Party / category', 'Details', 'Mode', 'Cash or bank', 'Amount'],
    D.rows.map((x) => [x.date, x.dir === 'in' ? 'In' : x.dir === 'out' ? 'Out' : 'Discount', x.who, x.what, x.mode,
      x.bucket === 'cash' ? 'Cash' : x.bucket === 'bank' ? 'Bank' : x.bucket === 'gold' ? 'Old gold' : '', x.amount])));
}

/* owner backup (More → Export all data): party entries and expenses */
async function exportAccountsData(pName, cName, today) {
  const [pt, ex] = await Promise.all([fetchAll('party_txns', 'created_at'), fetchAll('expenses', 'created_at')]);
  await new Promise((r) => setTimeout(r, 450));
  downloadFile('bj-party-entries-' + today + '.csv', buildCsv(
    ['Client', 'Date', 'Entry', 'Amount', 'Mode', 'Note', 'Recorded by', 'Recorded on'],
    pt.map((t) => [cName.get(t.client_id) || '', t.txn_date, PARTY_KIND_LABEL[t.kind] || t.kind, t.amount, t.mode, t.note, pName.get(t.created_by) || '', fmtExp(t.created_at)])));
  await new Promise((r) => setTimeout(r, 450));
  downloadFile('bj-expenses-' + today + '.csv', buildCsv(
    ['Date', 'Category', 'Amount', 'Mode', 'Note', 'Added by', 'Added on'],
    ex.map((x) => [x.exp_date, x.category, x.amount, x.mode, x.note, pName.get(x.created_by) || '', fmtExp(x.created_at)])));
}

onAct('acc-open', () => showSub('Accounts', renderAccounts));
onAct('exp-mine', () => showSub('My expenses', renderMyExpenses));
onAct('acc-p', (el) => { S.acc.p = el.dataset.p; if (S.acc.p === 'custom' && !S.acc.from) { S.acc.from = monthStart(); S.acc.to = todayStr(); } renderAccounts(); });
onAct('acc-show', (el) => { S.acc.show = el.dataset.v; renderAccounts(); });
onAct('acc-csv', () => accountsCsv());
onAct('exp-add', () => openExpenseModal());
onAct('exp-del', (el) => confirmModal('Remove this expense?', 'It will be taken out of the accounts.', 'Remove', async () => {
  const { error } = await db.from('expenses').delete().eq('id', el.dataset.id);
  if (error) { toast('Could not remove — try again.', 'err'); return; }
  toast('Expense removed', 'ok');
  renderAccounts();
}, true));
