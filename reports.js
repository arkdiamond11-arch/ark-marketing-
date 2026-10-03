/* ============================================================
   REPORTS (owner)
   Account books, khata style — opening balance, every entry with a
   running balance, closing balance — for: cash, bank, cash + bank,
   a party (or all parties), sales (all, gold, silver, diamonds — and
   any filter: party, purity, colour, diamond type, certificate …),
   expenses, a karigar, discounts and GST.
   Lists: sales by item, orders, payments received, party balances,
   diamonds & stones, expenses, month summary, stock (catalogue) and
   karigar balances — filter, group, Excel and PDF.
   Item values share the order total (GST and discount included) in
   proportion to each item's own value.
   ============================================================ */
'use strict';

const REP_TYPES = [
  ['ledger', 'Account book'], ['sales', 'Sales (items)'], ['orders', 'Orders'], ['payments', 'Payments received'],
  ['parties', 'Party balances'], ['diamonds', 'Diamonds & stones'], ['expenses', 'Expenses'], ['summary', 'Month summary'],
  ['stock', 'Stock (catalogue)'], ['karigars', 'Karigar balances'],
];
const LEDGER_ACCOUNTS = [
  ['cash', 'Cash book'], ['bank', 'Bank book'], ['money', 'Cash + bank'], ['party', 'Party account'],
  ['sales', 'Sales account'], ['sales_gold', 'Gold sales account'], ['sales_silver', 'Silver sales account'], ['sales_diamond', 'Diamond sales account'],
  ['expense', 'Expense account'], ['karigar', 'Karigar account'], ['discount', 'Discount account'], ['gst', 'GST account'],
];
const LIVE_STATUSES = ['new', 'in_production', 'ready', 'delivered'];
const REP_STATUS = [['booked', 'Booked (open + delivered)'], ['open', 'Open'], ['delivered', 'Delivered'], ['quote', 'Quotations'], ['cancelled', 'Cancelled'], ['all', 'All']];
const REP_STATUS_SET = { booked: LIVE_STATUSES, open: ['new', 'in_production', 'ready'], delivered: ['delivered'], quote: ['quote'], cancelled: ['cancelled'], all: null };
const REP_GROUPS = {
  sales: [['', 'No grouping'], ['party', 'Party'], ['metal', 'Metal'], ['purity', 'Purity'], ['color', 'Colour / finish'], ['dtype', 'Diamond type'], ['cat', 'Piece type'], ['otype', 'Order type'], ['exec', 'Executive'], ['city', 'City'], ['month', 'Month']],
  orders: [['', 'No grouping'], ['party', 'Party'], ['metal', 'Metal'], ['otype', 'Order type'], ['status', 'Status'], ['gst', 'GST'], ['exec', 'Executive'], ['city', 'City'], ['month', 'Month']],
  payments: [['', 'No grouping'], ['party', 'Party'], ['bucket', 'Cash / bank'], ['month', 'Month']],
  parties: [['', 'No grouping'], ['city', 'City']],
  diamonds: [['dtype', 'Diamond type'], ['', 'No grouping'], ['party', 'Party'], ['dcert', 'Certificate'], ['month', 'Month']],
  expenses: [['cat', 'Category'], ['', 'No grouping'], ['bucket', 'Cash / bank'], ['month', 'Month']],
  stock: [['cat', 'Piece type'], ['', 'No grouping'], ['metal', 'Metal'], ['dtype', 'Diamond type'], ['color', 'Colour / finish'], ['status', 'Status']],
  karigars: [['', 'No grouping']],
  ledger: [['', 'No grouping']],
  summary: [['', 'No grouping']],
};
/* reports that are "as on today" (no period) */
const REP_NO_PERIOD = { parties: 1, stock: 1, karigars: 1 };

function repState() {
  if (!S.rep) S.rep = { type: 'ledger', acct: 'cash', p: 'month', from: '', to: '', dateBy: 'order', f: {}, group: '', showFilters: false };
  if (!S.rep.acct) S.rep.acct = 'cash';
  return S.rep;
}
function repMonth(d) { return d ? String(d).slice(0, 7) : ''; }
function repMonthLabel(k) { return k ? monthLabel(k + '-01') : '—'; }
const repFetchAll = (makeQuery) => fetchPaged(makeQuery);
function bucketLabel(m) { return { cash: 'Cash', bank: 'Bank', gold: 'Old gold' }[modeBucket(m)] || (m === 'Discount' ? 'Discount' : 'Other'); }
function acctKind(a) { return String(a || '').indexOf('sales') === 0 ? 'sales' : (a === 'cash' || a === 'bank' || a === 'money') ? 'money' : a; }
function acctLabel(a) { return (LEDGER_ACCOUNTS.find((x) => x[0] === a) || ['', 'Account book'])[1]; }
/* the base filter each sales account starts from */
function acctPreset(a) { return a === 'sales_gold' ? { metal: 'Gold' } : a === 'sales_silver' ? { metal: 'Silver' } : a === 'sales_diamond' ? { dtype: 'any' } : {}; }

/* ---------------- data ---------------- */
/* what the screen is asking for right now */
function repKey() {
  const R = repState();
  const r = REP_NO_PERIOD[R.type] ? [null, null] : periodRange(R.p, R.from, R.to);
  const kind = R.type === 'ledger' ? acctKind(R.acct) : '';
  return { key: [R.type, kind, r[0], r[1], R.dateBy].join('|'), r, kind };
}
async function repLoad() {
  const R = repState();
  const K = repKey();
  const r = K.r, kind = K.kind, key = K.key;
  if (S.repData && S.repData.key === key) return S.repData;
  let data;
  const T = R.type;
  if (T === 'sales' || T === 'orders' || T === 'diamonds' || (T === 'ledger' && (kind === 'sales' || kind === 'gst'))) {
    const col = R.dateBy === 'delivered' && T !== 'ledger' ? 'delivered_on' : 'order_date';
    data = { orders: await repFetchAll(() => inRange(db.from('orders').select('*, clients(trade_name, city, state), order_items(*)'), col, r).order('order_date', { ascending: true }).order('id', { ascending: true })) };
  } else if (T === 'payments') {
    const [op, pt] = await Promise.all([
      repFetchAll(() => inRange(db.from('order_payments').select('*, orders(order_no, client_id, status, clients(trade_name, city))'), 'paid_on', r).order('paid_on', { ascending: true }).order('id', { ascending: true })),
      repFetchAll(() => inRange(db.from('party_txns').select('*, clients(trade_name, city)').eq('kind', 'payment'), 'txn_date', r).order('txn_date', { ascending: true }).order('id', { ascending: true })),
    ]);
    data = { op, pt };
  } else if (T === 'parties') {
    data = { by: await partyBalances() };
  } else if (T === 'expenses') {
    data = { ex: await repFetchAll(() => inRange(db.from('expenses').select('*'), 'exp_date', r).order('exp_date', { ascending: true }).order('id', { ascending: true })) };
  } else if (T === 'summary') {
    data = await monthSummaryData(r);
  } else if (T === 'stock') {
    data = { items: await repFetchAll(() => db.from('catalogue_items').select('*').order('created_at', { ascending: true }).order('id', { ascending: true })) };
  } else if (T === 'karigars') {
    const [ks, ts] = await Promise.all([
      repFetchAll(() => db.from('karigars').select('*').order('name', { ascending: true }).order('id', { ascending: true })),
      repFetchAll(() => db.from('karigar_txns').select('*').order('txn_date', { ascending: true }).order('id', { ascending: true })),
    ]);
    data = { ks, ts };
  } else {
    data = await ledgerData(kind, r);
  }
  data.key = key;
  data.range = r;
  if (repKey().key === key) S.repData = data;   // the person may have picked another report meanwhile
  return data;
}

/* ---------------- account books ---------------- */
/* entries up to the end of the period, so the opening balance can be worked out */
async function ledgerData(kind, r) {
  const upTo = (q, col) => (r[1] ? q.lte(col, r[1]) : q);
  const asc = (q, col) => q.order(col, { ascending: true }).order('id', { ascending: true });
  const E = [];
  if (kind === 'money') {
    const [op, pt, kt, ex] = await Promise.all([
      repFetchAll(() => asc(upTo(db.from('order_payments').select('id, amount, mode, paid_on, note, created_at, orders(order_no, client_id, clients(trade_name, city))'), 'paid_on'), 'paid_on')),
      repFetchAll(() => asc(upTo(db.from('party_txns').select('id, kind, amount, mode, txn_date, note, created_at, client_id, clients(trade_name, city)').in('kind', ['payment', 'refund']), 'txn_date'), 'txn_date')),
      repFetchAll(() => asc(upTo(db.from('karigar_txns').select('id, karigar_id, amount, mode, txn_date, note, created_at, karigars(name)').eq('kind', 'payment'), 'txn_date'), 'txn_date')),
      repFetchAll(() => asc(upTo(db.from('expenses').select('*'), 'exp_date'), 'exp_date')),
    ]);
    op.filter((p) => p.mode !== 'Discount').forEach((p) => {
      const o = p.orders || {}, c = o.clients || {};
      E.push({ date: p.paid_on, at: p.created_at, dr: num(p.amount), cr: 0, mode: p.mode || '', src: 'order', pid: o.client_id, party: c.trade_name || '', city: c.city || '',
        text: 'Received' + (o.order_no ? ' · ' + ordNo(o.order_no) : ''), note: p.note || '' });
    });
    pt.forEach((t) => {
      const c = t.clients || {};
      E.push({ date: t.txn_date, at: t.created_at, dr: t.kind === 'payment' ? num(t.amount) : 0, cr: t.kind === 'refund' ? num(t.amount) : 0, mode: t.mode || '',
        src: t.kind === 'payment' ? 'account' : 'refund', pid: t.client_id, party: c.trade_name || '', city: c.city || '',
        text: t.kind === 'payment' ? 'Received on account' : 'Refund paid', note: t.note || '' });
    });
    kt.forEach((t) => E.push({ date: t.txn_date, at: t.created_at, dr: 0, cr: num(t.amount), mode: t.mode || '', src: 'karigar', kid: t.karigar_id,
      party: (t.karigars && t.karigars.name) || 'Karigar', text: 'Paid to karigar', note: t.note || '' }));
    ex.forEach((x) => E.push({ date: x.exp_date, at: x.created_at, dr: 0, cr: num(x.amount), mode: x.mode || '', src: 'expense', ecat: x.category, by: x.created_by,
      party: x.category, text: 'Expense', note: x.note || '' }));
  } else if (kind === 'party') {
    const [or, op, pt] = await Promise.all([
      repFetchAll(() => asc(upTo(db.from('orders').select('id, order_no, order_type, status, order_date, total_amount, client_id, created_at, clients(trade_name, city)').in('status', LIVE_STATUSES), 'order_date'), 'order_date')),
      repFetchAll(() => asc(upTo(db.from('order_payments').select('id, amount, mode, paid_on, note, created_at, orders!inner(order_no, client_id, status, clients(trade_name, city))').in('orders.status', LIVE_STATUSES), 'paid_on'), 'paid_on')),
      repFetchAll(() => asc(upTo(db.from('party_txns').select('*, clients(trade_name, city)'), 'txn_date'), 'txn_date')),
    ]);
    or.forEach((o) => {
      const c = o.clients || {};
      E.push({ date: o.order_date, at: o.created_at, rank: 1, dr: num(o.total_amount), cr: 0, pid: o.client_id, party: c.trade_name || '', city: c.city || '',
        text: ordNo(o.order_no) + ' · ' + (OTYPE_LABEL[o.order_type] || ''), orderId: o.id, noPrice: !num(o.total_amount) });
    });
    op.forEach((p) => {
      const o = p.orders || {}, c = o.clients || {}, disc = p.mode === 'Discount';
      E.push({ date: p.paid_on, at: p.created_at, rank: disc ? 5 : 4, dr: 0, cr: num(p.amount), mode: disc ? '' : p.mode || '', pid: o.client_id, party: c.trade_name || '', city: c.city || '',
        text: (disc ? 'Discount' : 'Received') + ' · ' + ordNo(o.order_no), note: p.note || '', disc });
    });
    const rank = { opening: 0, charge: 2, refund: 3, payment: 4, discount: 5 };
    pt.forEach((t) => {
      const c = t.clients || {}, plus = (PARTY_SIGN[t.kind] || 0) > 0;
      E.push({ date: t.txn_date, at: t.created_at, rank: rank[t.kind], dr: plus ? num(t.amount) : 0, cr: plus ? 0 : num(t.amount), mode: t.mode || '',
        pid: t.client_id, party: c.trade_name || '', city: c.city || '', text: PARTY_KIND_LABEL[t.kind] || t.kind, note: t.note || '', disc: t.kind === 'discount' });
    });
  } else if (kind === 'karigar') {
    const kt = await repFetchAll(() => asc(upTo(db.from('karigar_txns').select('id, karigar_id, kind, amount, mode, txn_date, note, created_at, karigars(name), orders(order_no)').in('kind', ['labour', 'payment']), 'txn_date'), 'txn_date'));
    kt.filter((t) => num(t.amount)).forEach((t) => E.push({ date: t.txn_date, at: t.created_at, dr: t.kind === 'payment' ? num(t.amount) : 0, cr: t.kind === 'labour' ? num(t.amount) : 0,
      mode: t.kind === 'payment' ? t.mode || '' : '', kid: t.karigar_id, party: (t.karigars && t.karigars.name) || 'Karigar',
      text: (t.kind === 'labour' ? 'Labour' : 'Paid') + (t.orders && t.orders.order_no ? ' · ' + ordNo(t.orders.order_no) : ''), note: t.note || '' }));
  } else if (kind === 'expense') {
    const ex = await repFetchAll(() => asc(inRange(db.from('expenses').select('*'), 'exp_date', r), 'exp_date'));
    ex.forEach((x) => E.push({ date: x.exp_date, at: x.created_at, dr: num(x.amount), cr: 0, mode: x.mode || '', ecat: x.category, by: x.created_by,
      party: x.category, text: x.category, note: [x.note, nameOf(x.created_by)].filter(Boolean).join(' · ') }));
  } else if (kind === 'discount') {
    const [op, pt] = await Promise.all([
      repFetchAll(() => asc(inRange(db.from('order_payments').select('id, amount, mode, paid_on, note, created_at, orders(order_no, client_id, clients(trade_name, city))').eq('mode', 'Discount'), 'paid_on', r), 'paid_on')),
      repFetchAll(() => asc(inRange(db.from('party_txns').select('*, clients(trade_name, city)').eq('kind', 'discount'), 'txn_date', r), 'txn_date')),
    ]);
    op.forEach((p) => {
      const o = p.orders || {}, c = o.clients || {};
      E.push({ date: p.paid_on, at: p.created_at, dr: num(p.amount), cr: 0, pid: o.client_id, party: c.trade_name || '', city: c.city || '', text: 'Discount · ' + ordNo(o.order_no), note: p.note || '' });
    });
    pt.forEach((t) => {
      const c = t.clients || {};
      E.push({ date: t.txn_date, at: t.created_at, dr: num(t.amount), cr: 0, pid: t.client_id, party: c.trade_name || '', city: c.city || '', text: 'Discount on account', note: t.note || '' });
    });
  }
  return { entries: E };
}

/* each account: which way the balance runs and what its columns are called */
function ledgerSpec(kind) {
  if (kind === 'money') return { balance: true, sign: 1, dr: 'In', cr: 'Out', bal: 'Balance', drTile: 'Money in', crTile: 'Money out', closeTile: 'Closing balance', fmt: (b) => (b < 0 ? '− ' : '') + inr(Math.abs(b)) };
  if (kind === 'party') return { balance: true, sign: 1, dr: 'Debit', cr: 'Credit', bal: 'Balance', drTile: 'Billed', crTile: 'Received', closeTile: 'Closing balance', fmt: (b) => (Math.abs(b) < 1 ? 'Clear' : inr(Math.abs(b)) + (b > 0 ? ' Dr' : ' Cr')) };
  if (kind === 'karigar') return { balance: true, sign: -1, dr: 'Paid', cr: 'Labour', bal: 'To pay', drTile: 'Paid', crTile: 'Labour', closeTile: 'To pay', fmt: (b) => (Math.abs(b) < 1 ? 'Clear' : b > 0 ? inr(b) : inr(-b) + ' advance') };
  if (kind === 'sales') return { balance: false, dr: '', cr: 'Sale', bal: 'Total', fmt: inr };
  if (kind === 'gst') return { balance: false, dr: '', cr: 'GST', bal: 'Total', fmt: inr };
  if (kind === 'expense') return { balance: false, dr: 'Expense', cr: '', bal: 'Total', fmt: inr };
  return { balance: false, dr: 'Discount', cr: '', bal: 'Total', fmt: inr };   // discount
}

/* the sales account: one line per order, only the items that pass the filters */
function salesLedgerEntries(D, f) {
  const out = [];
  const byOrder = new Map();
  repItems(D.orders.filter((o) => repOrderPass(o, f))).filter((x) => repItemPass(x, f)).forEach((x) => {
    if (!byOrder.has(x.o.id)) byOrder.set(x.o.id, []);
    byOrder.get(x.o.id).push(x);
  });
  byOrder.forEach((list) => {
    const o = list[0].o;
    const silver = list[0].metal === 'Silver';
    const net = list.reduce((a, x) => a + x.net, 0), fine = list.reduce((a, x) => a + x.fine, 0), ct = list.reduce((a, x) => a + num(x.it.diamond_ct), 0);
    out.push({ date: o.order_date, at: o.created_at, dr: 0, cr: list.reduce((a, x) => a + x.value, 0), pid: o.client_id, party: list[0].party, city: list[0].city,
      text: ordNo(o.order_no), orderId: o.id, metal: list[0].metal, netG: silver ? 0 : net, netS: silver ? net : 0, fineG: silver ? 0 : fine, ct,
      note: list.map((x) => [x.it.category, x.it.metal_color ? colorLabel(x.metal, x.it.metal_color) : '',
        x.it.diamond_type ? diamondLabel(x.it.diamond_type) + (num(x.it.diamond_ct) ? ' ' + fmtCt(x.it.diamond_ct) + ' ct' : '') : ''].filter(Boolean).join(' · ')).join('; ') +
        (net ? ' · ' + fmtG(net) + ' g' : '') });
  });
  return out;
}
function gstLedgerEntries(D, f) {
  return D.orders.filter((o) => repOrderPass(o, f) && num(o.gst_pct) > 0).map((o) => {
    const c = orderCalc(o, o.order_items || []);
    return { date: o.order_date, at: o.created_at, dr: 0, cr: c.gst, pid: o.client_id, party: (o.clients && o.clients.trade_name) || '', city: (o.clients && o.clients.city) || '',
      text: ordNo(o.order_no), orderId: o.id, taxable: c.taxable, note: 'GST ' + num(o.gst_pct) + '% on ' + inr(c.taxable) };
  }).filter((e) => e.cr > 0);
}

function ledgerBuild(D) {
  const R = repState();
  const kind = acctKind(R.acct);
  const f = Object.assign({}, acctPreset(R.acct), R.f);
  // a cash / bank book narrowed to some entries (only money out, only one party …) has no
  // true opening or closing balance — it shows money in, money out and the net instead
  const narrowed = kind === 'money' && !!(f.dir || f.src || f.ecat || f.party);
  const spec = narrowed ? Object.assign({}, ledgerSpec(kind), { balance: false, net: true, bal: 'Net' }) : ledgerSpec(kind);
  let E = kind === 'sales' ? salesLedgerEntries(D, f) : kind === 'gst' ? gstLedgerEntries(D, f) : D.entries.slice();
  // the account's own filters
  if (kind === 'money') {
    E = E.filter((e) => (R.acct === 'cash' ? modeBucket(e.mode) === 'cash' : R.acct === 'bank' ? modeBucket(e.mode) === 'bank' : modeBucket(e.mode) === 'cash' || modeBucket(e.mode) === 'bank'));
    if (f.dir === 'in') E = E.filter((e) => e.dr > 0); else if (f.dir === 'out') E = E.filter((e) => e.cr > 0);
    if (f.src) E = E.filter((e) => e.src === f.src);
    if (f.ecat) E = E.filter((e) => e.ecat === f.ecat);
  }
  if (f.party && kind !== 'karigar' && kind !== 'expense') E = E.filter((e) => e.pid === f.party);
  if (f.city && kind !== 'karigar' && kind !== 'expense' && kind !== 'sales' && kind !== 'gst') E = E.filter((e) => e.city === f.city);
  if (kind === 'karigar' && f.karigar) E = E.filter((e) => e.kid === f.karigar);
  if (kind === 'expense') {
    if (f.ecat) E = E.filter((e) => e.ecat === f.ecat);
    if (f.mode) E = E.filter((e) => modeBucket(e.mode) === f.mode);
    if (f.exec) E = E.filter((e) => e.by === f.exec);
  }
  E.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.rank || 0) !== (b.rank || 0) ? (a.rank || 0) - (b.rank || 0) : (a.at || '') < (b.at || '') ? -1 : (a.at || '') > (b.at || '') ? 1 : 0));
  const from = D.range[0];
  const step = (e) => (spec.sign || 1) * (e.dr - e.cr);
  let opening = 0;
  if (spec.balance && from) { E.filter((e) => e.date < from).forEach((e) => { opening += step(e); }); E = E.filter((e) => e.date >= from); }
  if (spec.net && from) E = E.filter((e) => e.date >= from);
  opening = round2(opening);
  let run = spec.balance ? opening : 0;
  E.forEach((e) => { run = round2(run + (spec.balance || spec.net ? step(e) : e.dr + e.cr)); e.bal = run; });
  const tDr = E.reduce((a, e) => a + e.dr, 0), tCr = E.reduce((a, e) => a + e.cr, 0);
  const tDisc = E.filter((e) => e.disc).reduce((a, e) => a + e.cr, 0);   // party: discounts are not money received
  const tiles = spec.balance
    ? [['Opening balance', spec.fmt(opening)], [spec.drTile, inr(tDr)], [spec.crTile, inr(tCr - tDisc)]].concat(tDisc ? [['Discount', inr(tDisc)]] : []).concat([[spec.closeTile, spec.fmt(run)]])
    : spec.net ? [[spec.drTile, inr(tDr)], [spec.crTile, inr(tCr)], ['Net', spec.fmt(run)]]
      : [['Entries', String(E.length)], ['Total', inr(tDr + tCr)]];
  if (kind === 'sales') {
    const g = E.reduce((a, e) => a + e.netG, 0), s = E.reduce((a, e) => a + e.netS, 0), ct = E.reduce((a, e) => a + e.ct, 0), fg = E.reduce((a, e) => a + e.fineG, 0);
    if (g) tiles.push(['Gold net (g)', fmtG(g)], ['Fine gold (g)', fmtG(fg)]);
    if (s) tiles.push(['Silver net (g)', fmtG(s)]);
    if (ct) tiles.push(['Diamond ct', fmtCt(ct)]);
  }
  if (kind === 'expense') {
    tiles.push(['Cash', inr(E.filter((e) => modeBucket(e.mode) === 'cash').reduce((a, e) => a + e.dr, 0))], ['Bank', inr(E.filter((e) => modeBucket(e.mode) === 'bank').reduce((a, e) => a + e.dr, 0))]);
  }
  if (kind === 'gst') tiles.push(['Taxable value', inr(E.reduce((a, e) => a + num(e.taxable), 0))]);
  return { isBook: true, kind, spec, narrowed, rows: E, opening, closing: run, tDr, tCr, tiles };
}

/* every item of every order, with its share of the order's value */
function repItems(orders) {
  const rows = [];
  orders.forEach((o) => {
    const items = (o.order_items || []).slice().sort((a, b) => a.sort - b.sort);
    const pre = items.map((it) => orderCalc(o, [it]).subtotal);
    const sumPre = pre.reduce((a, x) => a + x, 0);
    const total = num(o.total_amount);
    items.forEach((it, i) => {
      const net = num(it.net_wt);
      rows.push({
        o, it, value: sumPre > 0 ? total * pre[i] / sumPre : (items.length ? total / items.length : 0),
        net, fine: net * num(o.purity) / 100, metal: o.metal || 'Gold',
        party: (o.clients && o.clients.trade_name) || '', city: (o.clients && o.clients.city) || '',
      });
    });
  });
  return rows;
}

function repOrderPass(o, f) {
  const st = REP_STATUS_SET[f.status || 'booked'];
  if (st && st.indexOf(o.status) === -1) return false;
  if (f.party && o.client_id !== f.party) return false;
  if (f.metal && (o.metal || 'Gold') !== f.metal) return false;
  if (f.purity && purityKey(o.purity) !== f.purity) return false;
  if (f.otype && o.order_type !== f.otype) return false;
  if (f.exec && o.created_by !== f.exec) return false;
  if (f.city && ((o.clients && o.clients.city) || '') !== f.city) return false;
  if (f.gst === 'yes' && !(num(o.gst_pct) > 0)) return false;
  if (f.gst === 'no' && num(o.gst_pct) > 0) return false;
  return true;
}
function repItemPass(x, f) {
  const it = x.it;
  if (f.color && (it.metal_color || '') !== f.color) return false;
  if (f.cat && (it.category || '') !== f.cat) return false;
  return jewelPass(it, f);
}
/* diamond / certificate filters — shared by order items and catalogue pieces */
function jewelPass(it, f) {
  if (f.dtype === 'any' && !it.diamond_type) return false;
  if (f.dtype === 'none' && it.diamond_type) return false;
  if (f.dtype && f.dtype !== 'any' && f.dtype !== 'none' && it.diamond_type !== f.dtype) return false;
  if (f.dcert === 'yes' && !it.diamond_cert_lab) return false;
  if (f.dcert === 'no' && (!it.diamond_type || it.diamond_cert_lab)) return false;
  if (f.dcert && f.dcert !== 'yes' && f.dcert !== 'no' && it.diamond_cert_lab !== f.dcert) return false;
  if (f.jcert === 'yes' && !it.jewel_cert_type) return false;
  if (f.jcert === 'no' && it.jewel_cert_type) return false;
  if (f.jcert === 'huid' && (it.jewel_cert_type || '').indexOf('HUID') === -1) return false;
  return true;
}

/* ---------------- month summary ---------------- */
async function monthSummaryData(r) {
  const [orders, op, pt, kt, ex] = await Promise.all([
    repFetchAll(() => inRange(db.from('orders').select('id, order_no, status, order_date, metal, purity, total_amount, gst_pct, discount, order_type, rate_per_g, making_per_g, wastage_pct, order_items(net_wt, gross_wt, stone_amount, qty, diamond_ct, diamond_type)').in('status', LIVE_STATUSES), 'order_date', r).order('order_date', { ascending: true }).order('id', { ascending: true })),
    repFetchAll(() => inRange(db.from('order_payments').select('id, amount, mode, paid_on'), 'paid_on', r).order('paid_on', { ascending: true }).order('id', { ascending: true })),
    repFetchAll(() => inRange(db.from('party_txns').select('id, kind, amount, mode, txn_date').in('kind', ['payment', 'refund', 'discount']), 'txn_date', r).order('txn_date', { ascending: true }).order('id', { ascending: true })),
    repFetchAll(() => inRange(db.from('karigar_txns').select('id, amount, mode, txn_date').eq('kind', 'payment'), 'txn_date', r).order('txn_date', { ascending: true }).order('id', { ascending: true })),
    repFetchAll(() => inRange(db.from('expenses').select('id, amount, mode, exp_date'), 'exp_date', r).order('exp_date', { ascending: true }).order('id', { ascending: true })),
  ]);
  return { orders, op, pt, kt, ex };
}
function monthSummaryBuild(D) {
  const M = new Map();
  const m = (d) => {
    const k = repMonth(d);
    if (!M.has(k)) M.set(k, { k, orders: 0, sales: 0, gold: 0, silver: 0, ct: 0, gst: 0, cashIn: 0, bankIn: 0, disc: 0, exp: 0, kpaid: 0, refund: 0, cashOut: 0, bankOut: 0 });
    return M.get(k);
  };
  D.orders.forEach((o) => {
    const x = m(o.order_date), items = o.order_items || [];
    x.orders++; x.sales += num(o.total_amount);
    const net = items.reduce((a, it) => a + num(it.net_wt), 0);
    if ((o.metal || 'Gold') === 'Silver') x.silver += net; else x.gold += net;
    x.ct += items.reduce((a, it) => a + num(it.diamond_ct), 0);
    if (num(o.gst_pct) > 0) x.gst += orderCalc(o, items).gst;
  });
  const money = (x, mode, amt, dir) => {
    const b = modeBucket(mode);
    if (b === 'cash') x[dir === 'in' ? 'cashIn' : 'cashOut'] += amt; else if (b === 'bank') x[dir === 'in' ? 'bankIn' : 'bankOut'] += amt;
  };
  D.op.forEach((p) => { const x = m(p.paid_on); if (p.mode === 'Discount') x.disc += num(p.amount); else money(x, p.mode, num(p.amount), 'in'); });
  D.pt.forEach((t) => {
    const x = m(t.txn_date);
    if (t.kind === 'discount') x.disc += num(t.amount);
    else if (t.kind === 'payment') money(x, t.mode, num(t.amount), 'in');
    else { x.refund += num(t.amount); money(x, t.mode, num(t.amount), 'out'); }
  });
  D.kt.forEach((t) => { const x = m(t.txn_date); x.kpaid += num(t.amount); money(x, t.mode, num(t.amount), 'out'); });
  D.ex.forEach((e) => { const x = m(e.exp_date); x.exp += num(e.amount); money(x, e.mode, num(e.amount), 'out'); });
  const rows = Array.from(M.values()).sort((a, b) => (a.k < b.k ? -1 : 1));
  const sum = (k) => rows.reduce((a, x) => a + x[k], 0);
  const tot = {};
  ['orders', 'sales', 'gold', 'silver', 'ct', 'gst', 'cashIn', 'bankIn', 'disc', 'exp', 'kpaid', 'refund', 'cashOut', 'bankOut'].forEach((k) => { tot[k] = sum(k); });
  const tiles = [['Sales', inr(tot.sales)], ['Received', inr(tot.cashIn + tot.bankIn)], ['Expenses', inr(tot.exp)], ['Paid to karigars', inr(tot.kpaid)]];
  if (tot.gold) tiles.push(['Gold sold (g)', fmtG(tot.gold)]);
  if (tot.silver) tiles.push(['Silver sold (g)', fmtG(tot.silver)]);
  if (tot.ct) tiles.push(['Diamond ct', fmtCt(tot.ct)]);
  if (tot.gst) tiles.push(['GST', inr(tot.gst)]);
  if (tot.disc) tiles.push(['Discounts', inr(tot.disc)]);
  const net = (x) => x.cashIn + x.bankIn - x.cashOut - x.bankOut;
  const lines = (x) => [repMonthLabel(x.k), [x.orders + ' order' + (x.orders === 1 ? '' : 's'), 'sales ' + inr(x.sales), x.gold ? 'gold ' + fmtG(x.gold) + ' g' : '', x.silver ? 'silver ' + fmtG(x.silver) + ' g' : '',
    x.ct ? fmtCt(x.ct) + ' ct' : '', 'cash in ' + inr(x.cashIn), 'bank in ' + inr(x.bankIn), x.exp ? 'expenses ' + inr(x.exp) : '', x.kpaid ? 'karigars ' + inr(x.kpaid) : '',
    x.disc ? 'discount ' + inr(x.disc) : '', x.gst ? 'GST ' + inr(x.gst) : ''].filter(Boolean).join(' · ')];
  return {
    rows, tot, tiles, agg: () => ({}), groupKey: () => '', gcols: [],
    lines, amount: (x) => (net(x) < 0 ? '− ' : '') + inr(Math.abs(net(x))), open: () => null,
    csvHead: ['Month', 'Orders', 'Sales', 'Gold sold (g)', 'Silver sold (g)', 'Diamond ct', 'GST', 'Cash in', 'Bank in', 'Cash out', 'Bank out', 'Expenses', 'Paid to karigars', 'Refunds', 'Discounts', 'Net cash + bank'],
    csv: (x) => [repMonthLabel(x.k), x.orders, Math.round(x.sales), round3(x.gold), round3(x.silver), round3(x.ct), Math.round(x.gst), Math.round(x.cashIn), Math.round(x.bankIn),
      Math.round(x.cashOut), Math.round(x.bankOut), Math.round(x.exp), Math.round(x.kpaid), Math.round(x.refund), Math.round(x.disc), Math.round(net(x))],
    pdfCols: [['Month', 0], ['Sales', 24, 'right'], ['Gold (g)', 18, 'right'], ['Cash in', 22, 'right'], ['Bank in', 22, 'right'], ['Expenses', 22, 'right'], ['Karigars', 20, 'right'], ['Net', 22, 'right']],
    pdfRow: (x) => [repMonthLabel(x.k), pRs(x.sales), x.gold ? pG(x.gold) : '', pRs(x.cashIn), pRs(x.bankIn), pRs(x.exp), pRs(x.kpaid), (net(x) < 0 ? '- ' : '') + pRs(Math.abs(net(x)))],
  };
}

/* rows + columns + totals for the chosen list report */
function repBuild(D) {
  const R = repState();
  const f = R.f;
  const T = R.type;
  if (T === 'ledger') return ledgerBuild(D);
  if (T === 'summary') return monthSummaryBuild(D);
  if (T === 'sales' || T === 'diamonds') {
    let rows = repItems(D.orders.filter((o) => repOrderPass(o, f))).filter((x) => repItemPass(x, f));
    if (T === 'diamonds') rows = rows.filter((x) => x.it.diamond_type);
    const g = (x, k) => ({
      party: x.party || '—', metal: x.metal, purity: purityKey(x.o.purity) || (x.o.purity != null ? num(x.o.purity) + '%' : '—'),
      color: x.it.metal_color ? colorLabel(x.metal, x.it.metal_color) : '—', dtype: x.it.diamond_type ? diamondLabel(x.it.diamond_type) : 'No diamonds',
      cat: x.it.category || '—', otype: OTYPE_LABEL[x.o.order_type] || '—', exec: nameOf(x.o.created_by), city: x.city || '—',
      month: repMonth(x.o.order_date), dcert: x.it.diamond_cert_lab ? x.it.diamond_cert_lab + ' certified' : 'Not certified',
    }[k]);
    const agg = (list) => ({
      n: list.length, pcs: list.reduce((a, x) => a + Math.max(1, parseInt(x.it.qty, 10) || 1), 0),
      netG: list.filter((x) => x.metal !== 'Silver').reduce((a, x) => a + x.net, 0), netS: list.filter((x) => x.metal === 'Silver').reduce((a, x) => a + x.net, 0),
      fineG: list.filter((x) => x.metal !== 'Silver').reduce((a, x) => a + x.fine, 0), fineS: list.filter((x) => x.metal === 'Silver').reduce((a, x) => a + x.fine, 0),
      ct: list.reduce((a, x) => a + num(x.it.diamond_ct), 0), dpcs: list.reduce((a, x) => a + num(x.it.diamond_pcs), 0),
      value: list.reduce((a, x) => a + x.value, 0), stone: list.reduce((a, x) => a + num(x.it.stone_amount), 0),
    });
    const tot = agg(rows);
    const tiles = T === 'diamonds'
      ? [['Items', String(tot.n)], ['Carats', fmtCt(tot.ct)], ['Diamond pcs', String(Math.round(tot.dpcs))], ['Stone value', inr(tot.stone)], ['Sale value', inr(tot.value)]]
      : [['Items', String(tot.n)], ['Pieces', String(tot.pcs)], tot.netG ? ['Gold net (g)', fmtG(tot.netG)] : null, tot.fineG ? ['Fine gold (g)', fmtG(tot.fineG)] : null,
        tot.netS ? ['Silver net (g)', fmtG(tot.netS)] : null, tot.ct ? ['Diamond ct', fmtCt(tot.ct)] : null, ['Value', inr(tot.value)]].filter(Boolean);
    const gcols = T === 'diamonds' ? [['Items', (a) => String(a.n)], ['Carats', (a) => fmtCt(a.ct)], ['Pcs', (a) => String(Math.round(a.dpcs))], ['Value', (a) => inr(a.value)]]
      : [['Items', (a) => String(a.n)], ['Net (g)', (a) => fmtG(a.netG + a.netS)], ['Ct', (a) => (a.ct ? fmtCt(a.ct) : '')], ['Value', (a) => inr(a.value)]];
    return {
      rows, tot, tiles, agg, groupKey: g, gcols,
      lines: (x) => [fmtD(x.o.order_date) + ' · ' + ordNo(x.o.order_no) + ' · ' + x.party,
        [x.it.category, x.it.design_code, x.metal + (x.o.purity ? ' ' + (purityKey(x.o.purity) || '') : ''), x.it.metal_color ? colorLabel(x.metal, x.it.metal_color) : '',
          x.net ? fmtG(x.net) + ' g' : '', x.it.diamond_type ? diamondLabel(x.it.diamond_type) + (num(x.it.diamond_ct) ? ' ' + fmtCt(x.it.diamond_ct) + ' ct' : '') : '',
          x.it.diamond_cert_lab ? x.it.diamond_cert_lab : '', x.it.jewel_cert_type ? (x.it.jewel_cert_type.indexOf('HUID') > -1 ? 'HUID' : x.it.jewel_cert_type) : ''].filter(Boolean).join(' · ')],
      amount: (x) => inr(x.value), open: (x) => x.o.id,
      csvHead: ['Order date', 'Delivered on', 'Order no', 'Party', 'City', 'Order type', 'Status', 'Executive', 'Piece', 'Tag / design', 'Description', 'Qty', 'Metal', 'Purity',
        'Colour / finish', 'Gross wt (g)', 'Net wt (g)', 'Fine wt (g)', 'Diamonds / stones', 'Carats', 'Diamond pcs', 'Diamond quality', 'Rate per ct', 'Diamond certificate',
        'Diamond cert no', 'Jewellery certificate', 'Jewellery cert / HUID no', 'Stone value', 'GST %', 'Item value (incl. GST)'],
      csv: (x) => [x.o.order_date, x.o.delivered_on || '', ordNo(x.o.order_no), x.party, x.city, OTYPE_LABEL[x.o.order_type], OSTATUS_LABEL[x.o.status], nameOf(x.o.created_by),
        x.it.category, x.it.design_code, x.it.description, x.it.qty, x.metal, x.o.purity, x.it.metal_color, x.it.gross_wt, x.it.net_wt, round3(x.fine),
        diamondLabel(x.it.diamond_type), x.it.diamond_ct, x.it.diamond_pcs, x.it.diamond_quality, x.it.diamond_rate,
        x.it.diamond_type ? (x.it.diamond_cert_lab || 'Not certified') : '', x.it.diamond_cert_no, x.it.jewel_cert_type || '', x.it.jewel_cert_no, x.it.stone_amount,
        num(x.o.gst_pct) || 0, Math.round(x.value)],
      pdfCols: [['Date', 20], ['Order', 18], ['Party', 34], ['Item', 0], ['Net (g)', 17, 'right'], ['Value', 24, 'right']],
      pdfRow: (x) => [fmtD(x.o.order_date), ordNo(x.o.order_no), x.party, [x.it.category, x.it.design_code, x.it.metal_color ? colorLabel(x.metal, x.it.metal_color) : '',
        x.it.diamond_type ? diamondLabel(x.it.diamond_type) + (num(x.it.diamond_ct) ? ' ' + fmtCt(x.it.diamond_ct) + ' ct' : '') + (x.it.diamond_cert_lab ? ' ' + x.it.diamond_cert_lab : '') : '',
        x.it.jewel_cert_type ? (x.it.jewel_cert_type.indexOf('HUID') > -1 ? 'HUID ' + (x.it.jewel_cert_no || '') : x.it.jewel_cert_type) : ''].filter(Boolean).join(', '),
        x.net ? pG(x.net) : '', pRs(x.value)],
    };
  }
  if (T === 'orders') {
    const rows = D.orders.filter((o) => repOrderPass(o, f)).map((o) => {
      const items = o.order_items || [];
      const net = items.reduce((a, it) => a + num(it.net_wt), 0);
      const gst = num(o.gst_pct) > 0 ? orderCalc(o, items).gst : 0;
      return { o, net, gst, party: (o.clients && o.clients.trade_name) || '', city: (o.clients && o.clients.city) || '', total: num(o.total_amount), paid: num(o.paid_amount), due: isLive(o) ? balanceOf(o) : 0 };
    });
    const agg = (list) => ({ n: list.length, total: list.reduce((a, x) => a + x.total, 0), paid: list.reduce((a, x) => a + x.paid, 0), due: list.reduce((a, x) => a + x.due, 0), net: list.reduce((a, x) => a + x.net, 0), gst: list.reduce((a, x) => a + x.gst, 0) });
    const tot = agg(rows);
    return {
      rows, tot, agg, tiles: [['Orders', String(tot.n)], ['Value', inr(tot.total)], ['Received', inr(tot.paid)], ['Due', inr(tot.due)]].concat(tot.gst ? [['GST', inr(tot.gst)]] : []),
      groupKey: (x, k) => ({ party: x.party || '—', metal: x.o.metal || 'Gold', otype: OTYPE_LABEL[x.o.order_type] || '—', status: OSTATUS_LABEL[x.o.status] || x.o.status,
        gst: num(x.o.gst_pct) > 0 ? 'With GST' : 'Without GST', exec: nameOf(x.o.created_by), city: x.city || '—', month: repMonth(x.o.order_date) }[k]),
      gcols: [['Orders', (a) => String(a.n)], ['Value', (a) => inr(a.total)], ['Received', (a) => inr(a.paid)], ['Due', (a) => inr(a.due)]],
      lines: (x) => [ordNo(x.o.order_no) + ' · ' + x.party, [fmtD(x.o.order_date), OTYPE_LABEL[x.o.order_type], OSTATUS_LABEL[x.o.status], x.net ? fmtG(x.net) + ' g' : '',
        x.gst ? 'GST ' + inr(x.gst) : '', x.due >= 1 ? 'due ' + inr(x.due) : ''].filter(Boolean).join(' · ')],
      amount: (x) => inr(x.total), open: (x) => x.o.id,
      csvHead: ['Order no', 'Order date', 'Delivered on', 'Party', 'City', 'Type', 'Status', 'Metal', 'Purity', 'Net wt (g)', 'GST %', 'GST', 'Total', 'Received', 'Balance', 'Executive'],
      csv: (x) => [ordNo(x.o.order_no), x.o.order_date, x.o.delivered_on || '', x.party, x.city, OTYPE_LABEL[x.o.order_type], OSTATUS_LABEL[x.o.status], x.o.metal, x.o.purity,
        round3(x.net), num(x.o.gst_pct) || 0, Math.round(x.gst), x.total, x.paid, x.due, nameOf(x.o.created_by)],
      pdfCols: [['Date', 20], ['Order', 18], ['Party', 0], ['Status', 22], ['Total', 24, 'right'], ['Received', 24, 'right'], ['Due', 22, 'right']],
      pdfRow: (x) => [fmtD(x.o.order_date), ordNo(x.o.order_no), x.party, OSTATUS_LABEL[x.o.status] || '', pRs(x.total), pRs(x.paid), x.due ? pRs(x.due) : ''],
    };
  }
  if (T === 'payments') {
    let rows = D.op.map((p) => ({ date: p.paid_on, mode: p.mode || '', amount: num(p.amount), party: (p.orders && p.orders.clients && p.orders.clients.trade_name) || '',
      city: (p.orders && p.orders.clients && p.orders.clients.city) || '', client: p.orders && p.orders.client_id, what: p.orders ? ordNo(p.orders.order_no) : '', note: p.note || '', orderId: p.order_id }))
      .concat(D.pt.map((t) => ({ date: t.txn_date, mode: t.mode || '', amount: num(t.amount), party: (t.clients && t.clients.trade_name) || '', city: (t.clients && t.clients.city) || '',
        client: t.client_id, what: 'On account', note: t.note || '' })));
    rows = rows.filter((x) => (x.mode === 'Discount') === (f.mode === 'Discount'));
    if (f.party) rows = rows.filter((x) => x.client === f.party);
    if (f.mode === 'cash' || f.mode === 'bank') rows = rows.filter((x) => modeBucket(x.mode) === f.mode);
    if (f.city) rows = rows.filter((x) => x.city === f.city);
    rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const agg = (list) => ({ n: list.length, cash: list.filter((x) => modeBucket(x.mode) === 'cash').reduce((a, x) => a + x.amount, 0),
      bank: list.filter((x) => modeBucket(x.mode) === 'bank').reduce((a, x) => a + x.amount, 0), total: list.reduce((a, x) => a + x.amount, 0) });
    const tot = agg(rows);
    return {
      rows, tot, agg, tiles: f.mode === 'Discount' ? [['Discounts', String(tot.n)], ['Total', inr(tot.total)]] : [['Payments', String(tot.n)], ['Cash', inr(tot.cash)], ['Bank', inr(tot.bank)], ['Total', inr(tot.total)]],
      groupKey: (x, k) => ({ party: x.party || '—', bucket: bucketLabel(x.mode), month: repMonth(x.date) }[k]),
      gcols: [['Count', (a) => String(a.n)], ['Cash', (a) => inr(a.cash)], ['Bank', (a) => inr(a.bank)], ['Total', (a) => inr(a.total)]],
      lines: (x) => [x.party || '—', [fmtD(x.date), x.what, bucketLabel(x.mode), x.note].filter(Boolean).join(' · ')],
      amount: (x) => inr(x.amount), open: (x) => x.orderId || null,
      csvHead: ['Date', 'Party', 'City', 'Against', 'Cash / bank', 'Note', 'Amount'],
      csv: (x) => [x.date, x.party, x.city, x.what, bucketLabel(x.mode), x.note, x.amount],
      pdfCols: [['Date', 22], ['Party', 0], ['Against', 26], ['Mode', 22], ['Amount', 28, 'right']],
      pdfRow: (x) => [fmtD(x.date), x.party, x.what, bucketLabel(x.mode), pRs(x.amount)],
    };
  }
  if (T === 'parties') {
    let rows = Array.from((D.by || new Map()).values()).map((e) => ({ e, party: e.cl.trade_name || '—', city: e.cl.city || '', due: e.due, billed: e.billed, received: e.received, discount: e.discount || 0 }));
    if (f.party) rows = rows.filter((x) => x.e.id === f.party);
    if (f.city) rows = rows.filter((x) => x.city === f.city);
    if (f.bal === 'due') rows = rows.filter((x) => x.due >= 1);
    else if (f.bal === 'adv') rows = rows.filter((x) => x.due <= -1);
    else if (f.bal !== 'all') rows = rows.filter((x) => Math.abs(x.due) >= 1);
    rows.sort((a, b) => b.due - a.due);
    const agg = (list) => ({ n: list.length, due: list.filter((x) => x.due > 0).reduce((a, x) => a + x.due, 0), adv: list.filter((x) => x.due < 0).reduce((a, x) => a - x.due, 0),
      billed: list.reduce((a, x) => a + x.billed, 0), received: list.reduce((a, x) => a + x.received, 0) });
    const tot = agg(rows);
    return {
      rows, tot, agg, tiles: [['Parties', String(tot.n)], ['Total due', inr(tot.due)], ['Advance with us', inr(tot.adv)]],
      groupKey: (x, k) => ({ city: x.city || '—' }[k]),
      gcols: [['Parties', (a) => String(a.n)], ['Due', (a) => inr(a.due)], ['Advance', (a) => inr(a.adv)]],
      lines: (x) => [x.party, [x.city, 'billed ' + inr(x.billed), 'received ' + inr(x.received), x.discount >= 1 ? 'discount ' + inr(x.discount) : ''].filter(Boolean).join(' · ')],
      amount: (x) => balText(x.due), open: () => null, ledger: (x) => x.e.id,
      csvHead: ['Party', 'City', 'Billed (orders + opening + charges)', 'Received', 'Discount', 'Balance (minus = advance)'],
      csv: (x) => [x.party, x.city, Math.round(x.billed), Math.round(x.received), Math.round(x.discount), Math.round(x.due)],
      pdfCols: [['Party', 0], ['City', 30], ['Billed', 28, 'right'], ['Received', 28, 'right'], ['Balance', 30, 'right']],
      pdfRow: (x) => [x.party, x.city, pRs(x.billed), pRs(x.received), Math.abs(x.due) < 1 ? 'Clear' : pRs(Math.abs(x.due)) + (x.due > 0 ? ' Dr' : ' Cr')],
    };
  }
  if (T === 'stock') {
    const rows = D.items.filter((c) => {
      const st = f.cstatus || 'available';
      if (st !== 'all' && c.status !== st) return false;
      if (f.metal && (c.metal || 'Gold') !== f.metal) return false;
      if (f.purity && purityKey(c.purity) !== f.purity) return false;
      if (f.color && (c.metal_color || '') !== f.color) return false;
      if (f.cat && (c.category || '') !== f.cat) return false;
      return jewelPass(c, f);
    });
    const agg = (list) => ({ n: list.length, netG: list.filter((c) => (c.metal || 'Gold') !== 'Silver').reduce((a, c) => a + num(c.net_wt), 0),
      netS: list.filter((c) => c.metal === 'Silver').reduce((a, c) => a + num(c.net_wt), 0), ct: list.reduce((a, c) => a + num(c.diamond_ct), 0),
      stone: list.reduce((a, c) => a + num(c.stone_amount), 0) });
    const tot = agg(rows);
    return {
      rows, tot, agg,
      tiles: [['Pieces', String(tot.n)], tot.netG ? ['Gold net (g)', fmtG(tot.netG)] : null, tot.netS ? ['Silver net (g)', fmtG(tot.netS)] : null,
        tot.ct ? ['Diamond ct', fmtCt(tot.ct)] : null, tot.stone ? ['Stone value', inr(tot.stone)] : null].filter(Boolean),
      groupKey: (c, k) => ({ cat: c.category || '—', metal: c.metal || 'Gold', dtype: c.diamond_type ? diamondLabel(c.diamond_type) : 'No diamonds',
        color: c.metal_color ? colorLabel(c.metal, c.metal_color) : '—', status: CAT_STATUS_LABEL[c.status] || c.status }[k]),
      gcols: [['Pieces', (a) => String(a.n)], ['Gold (g)', (a) => (a.netG ? fmtG(a.netG) : '')], ['Silver (g)', (a) => (a.netS ? fmtG(a.netS) : '')], ['Ct', (a) => (a.ct ? fmtCt(a.ct) : '')]],
      lines: (c) => [(c.tag_no || '—') + (c.title ? ' · ' + c.title : ''), [c.category, (c.metal || 'Gold') + (c.purity ? ' ' + (purityKey(c.purity) || '') : ''),
        c.metal_color ? colorLabel(c.metal, c.metal_color) : '', c.diamond_type ? diamondLabel(c.diamond_type) + (num(c.diamond_ct) ? ' ' + fmtCt(c.diamond_ct) + ' ct' : '') : '',
        c.diamond_cert_lab || '', c.jewel_cert_type ? (c.jewel_cert_type.indexOf('HUID') > -1 ? 'HUID' : c.jewel_cert_type) : '', CAT_STATUS_LABEL[c.status] || ''].filter(Boolean).join(' · ')],
      amount: (c) => (num(c.net_wt) ? fmtG(c.net_wt) + ' g' : ''), open: () => null, cat: (c) => c.id,
      csvHead: ['Tag no', 'Design', 'Piece', 'Metal', 'Purity', 'Colour / finish', 'Gross wt (g)', 'Net wt (g)', 'Diamonds / stones', 'Carats', 'Diamond pcs', 'Diamond quality',
        'Diamond certificate', 'Diamond cert no', 'Jewellery certificate', 'Jewellery cert / HUID no', 'Other stones', 'Stone value', 'Making / g', 'Wastage %', 'Status'],
      csv: (c) => [c.tag_no, c.title, c.category, c.metal, c.purity, c.metal_color, c.gross_wt, c.net_wt, diamondLabel(c.diamond_type), c.diamond_ct, c.diamond_pcs, c.diamond_quality,
        c.diamond_type ? (c.diamond_cert_lab || 'Not certified') : '', c.diamond_cert_no, c.jewel_cert_type || '', c.jewel_cert_no, c.stone_details, c.stone_amount, c.making_per_g, c.wastage_pct, CAT_STATUS_LABEL[c.status] || c.status],
      pdfCols: [['Tag', 22], ['Piece', 0], ['Metal', 22], ['Net (g)', 18, 'right'], ['Diamonds', 40], ['Status', 20]],
      pdfRow: (c) => [c.tag_no || '', [c.category, c.title].filter(Boolean).join(' - '), (c.metal || 'Gold') + (c.purity ? ' ' + (purityKey(c.purity) || '') : ''),
        num(c.net_wt) ? pG(c.net_wt) : '', c.diamond_type ? diamondLabel(c.diamond_type) + (num(c.diamond_ct) ? ' ' + fmtCt(c.diamond_ct) + ' ct' : '') : '', CAT_STATUS_LABEL[c.status] || ''],
    };
  }
  if (T === 'karigars') {
    const by = new Map();
    D.ts.forEach((t) => { if (!by.has(t.karigar_id)) by.set(t.karigar_id, []); by.get(t.karigar_id).push(t); });
    let rows = D.ks.map((k) => ({ k, b: karigarBalances(by.get(k.id) || []) }));
    if (f.kshow === 'bal') rows = rows.filter((x) => Math.abs(x.b.gold) > 0.0005 || Math.abs(x.b.silver) > 0.0005 || Math.abs(x.b.payable) >= 1);
    else if (f.kshow !== 'all') rows = rows.filter((x) => x.k.active);
    const agg = (list) => ({ n: list.length, gold: list.reduce((a, x) => a + x.b.gold, 0), silver: list.reduce((a, x) => a + x.b.silver, 0),
      labour: list.reduce((a, x) => a + x.b.labour, 0), paid: list.reduce((a, x) => a + x.b.paid, 0), payable: list.reduce((a, x) => a + x.b.payable, 0) });
    const tot = agg(rows);
    return {
      rows, tot, agg,
      tiles: [['Karigars', String(tot.n)], ['Gold with karigars (g)', fmtG(tot.gold)], tot.silver ? ['Silver with karigars (g)', fmtG(tot.silver)] : null, ['Labour to pay', inr(tot.payable)]].filter(Boolean),
      groupKey: () => '', gcols: [],
      lines: (x) => [x.k.name + (x.k.active ? '' : ' (off)'), ['gold ' + fmtG(x.b.gold) + ' g fine', x.b.hasSilver ? 'silver ' + fmtG(x.b.silver) + ' g fine' : '', 'labour ' + inr(x.b.labour), 'paid ' + inr(x.b.paid)].filter(Boolean).join(' · ')],
      amount: (x) => (Math.abs(x.b.payable) < 1 ? 'Clear' : inr(x.b.payable)), open: () => null, karigar: (x) => x.k.id,
      csvHead: ['Karigar', 'Phone', 'City', 'Speciality', 'Fine gold issued (g)', 'Fine gold received (g)', 'Gold wastage (g)', 'Gold with karigar (g)', 'Silver with karigar (g)', 'Labour', 'Paid', 'Labour to pay'],
      csv: (x) => [x.k.name, x.k.phone, x.k.city, x.k.speciality, round3(x.b.issued), round3(x.b.received), round3(x.b.wastage), round3(x.b.gold), round3(x.b.silver), Math.round(x.b.labour), Math.round(x.b.paid), Math.round(x.b.payable)],
      pdfCols: [['Karigar', 0], ['Gold (g)', 24, 'right'], ['Silver (g)', 24, 'right'], ['Labour', 26, 'right'], ['Paid', 26, 'right'], ['To pay', 26, 'right']],
      pdfRow: (x) => [x.k.name, pG(x.b.gold), x.b.hasSilver ? pG(x.b.silver) : '', pRs(x.b.labour), pRs(x.b.paid), pRs(x.b.payable)],
    };
  }
  // expenses
  let rows = D.ex.slice();
  if (f.ecat) rows = rows.filter((x) => x.category === f.ecat);
  if (f.mode) rows = rows.filter((x) => modeBucket(x.mode) === f.mode);
  if (f.exec) rows = rows.filter((x) => x.created_by === f.exec);
  const agg = (list) => ({ n: list.length, cash: list.filter((x) => modeBucket(x.mode) === 'cash').reduce((a, x) => a + num(x.amount), 0),
    bank: list.filter((x) => modeBucket(x.mode) === 'bank').reduce((a, x) => a + num(x.amount), 0), total: list.reduce((a, x) => a + num(x.amount), 0) });
  const tot = agg(rows);
  return {
    rows, tot, agg, tiles: [['Expenses', String(tot.n)], ['Cash', inr(tot.cash)], ['Bank', inr(tot.bank)], ['Total', inr(tot.total)]],
    groupKey: (x, k) => ({ cat: x.category, bucket: bucketLabel(x.mode), month: repMonth(x.exp_date) }[k]),
    gcols: [['Count', (a) => String(a.n)], ['Cash', (a) => inr(a.cash)], ['Bank', (a) => inr(a.bank)], ['Total', (a) => inr(a.total)]],
    lines: (x) => [x.category, [fmtD(x.exp_date), bucketLabel(x.mode), x.note, nameOf(x.created_by)].filter(Boolean).join(' · ')],
    amount: (x) => inr(x.amount), open: () => null,
    csvHead: ['Date', 'Category', 'Cash / bank', 'Note', 'Added by', 'Amount'],
    csv: (x) => [x.exp_date, x.category, bucketLabel(x.mode), x.note, nameOf(x.created_by), x.amount],
    pdfCols: [['Date', 24], ['Category', 34], ['Note', 0], ['Mode', 22], ['Amount', 28, 'right']],
    pdfRow: (x) => [fmtD(x.exp_date), x.category, x.note || '', bucketLabel(x.mode), pRs(x.amount)],
  };
}
function fmtG(x) { return (Math.round(num(x) * 1000) / 1000).toLocaleString('en-IN', { maximumFractionDigits: 3 }); }
function fmtCt(x) { return (Math.round(num(x) * 100) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 }); }
function round3(x) { return Math.round(num(x) * 1000) / 1000; }

function repGroups(B) {
  const R = repState();
  if (!R.group || B.isBook) return null;
  const m = new Map();
  B.rows.forEach((x) => { const k = B.groupKey(x, R.group) || '—'; if (!m.has(k)) m.set(k, []); m.get(k).push(x); });
  const list = Array.from(m.entries()).map((e) => ({ k: e[0], a: B.agg(e[1]) }));
  if (R.group === 'month') {
    list.sort((a, b) => (a.k < b.k ? -1 : 1));
    list.forEach((g) => { g.k = repMonthLabel(g.k === '—' ? '' : g.k); });
  } else {
    const v = (a) => num(a.value != null ? a.value : a.total != null ? a.total : a.due != null ? a.due : a.n);
    list.sort((a, b) => v(b.a) - v(a.a));
  }
  return list;
}

/* ---------------- filters ---------------- */
function repFilterDefs() {
  const R = repState();
  const T = R.type;
  const kind = T === 'ledger' ? acctKind(R.acct) : '';
  const team = Array.from((S.team || new Map()).values()).map((p) => [p.id, p.full_name || p.email || '—']);
  const metals = [['Gold', 'Gold'], ['Silver', 'Silver']];
  const colors = GOLD_COLORS.concat(SILVER_FINISHES).map((c) => [c, c]);
  const purities = ALL_PURITY.map((p) => [p[0], p[0]]);
  const dtypes = [['any', 'Any diamonds / stones'], ['none', 'No diamonds']].concat(DIAMOND_TYPES.map((t) => [t, diamondLabel(t)]));
  const cats = ITEM_CATS.map((c) => [c, c]);
  const dc = [['yes', 'Certified (any lab)'], ['no', 'Not certified']].concat(DIAMOND_LABS.map((l) => [l, l + ' certified']));
  const jc = [['yes', 'Certified (any)'], ['huid', 'BIS Hallmark (HUID)'], ['no', 'Not certified']];
  const otypes = [['job_work', 'Job work'], ['ready_stock', 'Ready stock'], ['custom', 'Custom order']];
  const cashBank = [['cash', 'Cash'], ['bank', 'Bank']];
  const gst = [['yes', 'With GST'], ['no', 'Without GST']];
  const party = (S.repParties || []).map((c) => [c.id, c.trade_name]);
  const cities = (S.repCities || []).map((c) => [c, c]);
  const d = [];
  const itemFilters = () => d.push(['purity', 'Purity', purities], ['color', 'Colour / finish', colors], ['cat', 'Piece type', cats],
    ['dtype', 'Diamonds / stones', dtypes], ['dcert', 'Diamond certificate', dc], ['jcert', 'Jewellery certificate', jc]);
  if (T === 'ledger') {
    if (kind === 'money') d.push(['dir', 'Money in / out', [['in', 'Only money in'], ['out', 'Only money out']]],
      ['src', 'From / to', [['order', 'Payments on orders'], ['account', 'Payments on account'], ['refund', 'Refunds'], ['karigar', 'Karigar payments'], ['expense', 'Expenses']]],
      ['party', 'Party', party], ['ecat', 'Expense category', EXP_CATS.map((c) => [c, c])]);
    if (kind === 'party') d.push(['city', 'City', cities]);
    if (kind === 'sales') {
      d.push(['party', 'Party', party], ['city', 'City', cities]);
      if (R.acct !== 'sales_gold' && R.acct !== 'sales_silver') d.push(['metal', 'Metal', metals]);
      d.push(['status', 'Status', REP_STATUS, true], ['otype', 'Order type', otypes], ['gst', 'GST', gst], ['exec', 'Executive (booked by)', team]);
      itemFilters();
    }
    if (kind === 'gst') d.push(['party', 'Party', party], ['city', 'City', cities], ['otype', 'Order type', otypes]);
    if (kind === 'expense') d.push(['ecat', 'Category', EXP_CATS.map((c) => [c, c])], ['mode', 'Cash / bank', cashBank], ['exec', 'Added by', team]);
    if (kind === 'discount') d.push(['party', 'Party', party], ['city', 'City', cities]);
    return d;
  }
  if (T === 'summary') return d;
  if (T === 'karigars') { d.push(['kshow', 'Show', [['active', 'Working karigars'], ['bal', 'Only with a balance'], ['all', 'Everyone']], true]); return d; }
  if (T === 'stock') {
    d.push(['cstatus', 'Status', [['available', 'In stock'], ['reserved', 'Reserved'], ['sold', 'Sold'], ['all', 'All']], true], ['metal', 'Metal', metals]);
    itemFilters();
    return d;
  }
  if (T !== 'expenses') d.push(['party', 'Party', party], ['city', 'City', cities]);
  if (T === 'sales' || T === 'orders' || T === 'diamonds') d.push(['status', 'Status', REP_STATUS, true], ['metal', 'Metal', metals], ['otype', 'Order type', otypes], ['gst', 'GST', gst], ['exec', 'Executive (booked by)', team]);
  if (T === 'sales' || T === 'diamonds') itemFilters();
  if (T === 'payments') d.push(['mode', 'Cash / bank', cashBank.concat([['Discount', 'Discounts (not money)']])]);
  if (T === 'expenses') d.push(['mode', 'Cash / bank', cashBank], ['ecat', 'Category', EXP_CATS.map((c) => [c, c])], ['exec', 'Added by', team]);
  if (T === 'parties') d.push(['bal', 'Show', [['dueadv', 'Due or advance'], ['due', 'Only dues'], ['adv', 'Only advance'], ['all', 'Everyone']], true]);
  return d;
}
/* each report and each account starts without filters, so nothing is hidden */
function repPruneFilters() { repState().f = {}; }
/* a filter is "on" when it is set to something other than its first (default) choice */
function repActiveDefs() {
  const R = repState();
  return repFilterDefs().filter((d) => R.f[d[0]] && !(d[3] && String(R.f[d[0]]) === String(d[2][0][0])));
}

/* ---------------- screen ---------------- */
async function renderReports() {
  const R = repState();
  if (!S.repParties) {
    const { data } = await db.from('clients').select('id, trade_name, city').order('trade_name', { ascending: true }).limit(5000);
    S.repParties = data || [];
    S.repCities = Array.from(new Set(S.repParties.map((c) => (c.city || '').trim()).filter(Boolean))).sort();
  }
  if (!S.karigars && typeof loadKarigars === 'function') await loadKarigars();
  const groups = REP_GROUPS[R.type] || [['', 'No grouping']];
  if (!groups.some((g) => g[0] === R.group)) R.group = groups[0][0];
  const defs = repFilterDefs();
  const active = repActiveDefs().length;
  const kind = R.type === 'ledger' ? acctKind(R.acct) : '';
  const opt = (list, cur) => list.map((x) => '<option value="' + esc(x[0]) + '"' + (String(x[0]) === String(cur) ? ' selected' : '') + '>' + esc(x[1]) + '</option>').join('');
  const c = $('#content');
  c.innerHTML =
    '<div class="card rep-card"><div class="o-2col">' +
    '<div class="field" style="margin:0"><label>Report</label><select id="rep-type">' + opt(REP_TYPES, R.type) + '</select></div>' +
    (R.type === 'ledger' ? '<div class="field" style="margin:0"><label>Account</label><select id="rep-acct">' + opt(LEDGER_ACCOUNTS, R.acct) + '</select></div>' : '<div></div>') +
    '</div>' +
    (kind === 'party' ? '<div class="field" style="margin:10px 0 0"><label>Party</label><select data-rf="party"><option value="">All parties</option>' + opt((S.repParties || []).map((p) => [p.id, p.trade_name]), R.f.party || '') + '</select></div>' : '') +
    (kind === 'karigar' ? '<div class="field" style="margin:10px 0 0"><label>Karigar</label><select data-rf="karigar"><option value="">All karigars</option>' + opt((S.karigars || []).map((k) => [k.id, k.name]), R.f.karigar || '') + '</select></div>' : '') +
    '</div>' +
    (!REP_NO_PERIOD[R.type] ? '<div class="filter-chips">' + ACC_PERIODS.map((x) => '<button class="' + (R.p === x[0] ? 'on' : '') + '" data-action="rep-p" data-p="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>' : '') +
    (R.p === 'custom' && !REP_NO_PERIOD[R.type] ? '<div class="card" style="padding:10px 14px"><div class="o-2col"><div class="field" style="margin:0"><label>From</label><input type="date" id="rep-from" value="' + esc(R.from) + '"></div>' +
      '<div class="field" style="margin:0"><label>To</label><input type="date" id="rep-to" value="' + esc(R.to) + '"></div></div></div>' : '') +
    (defs.length || groups.length > 1 ?
      '<div class="card rep-card">' +
      '<div class="rep-bar">' + (defs.length ? '<button class="btn btn-small btn-secondary" data-action="rep-filters">' + (R.showFilters ? 'Hide filters' : 'Filters') + (active ? ' (' + active + ')' : '') + '</button>' : '') +
      (active ? '<button class="btn btn-small btn-ghost" data-action="rep-clear">Clear filters</button>' : '') +
      (groups.length > 1 ? '<select id="rep-group" aria-label="Group by">' + groups.map((g) => '<option value="' + g[0] + '"' + (g[0] === R.group ? ' selected' : '') + '>' + (g[0] ? 'Group: ' : '') + g[1] + '</option>').join('') + '</select>' : '') + '</div>' +
      (R.showFilters && defs.length ? '<div class="o-2col rep-filters">' +
        (R.type === 'sales' || R.type === 'orders' || R.type === 'diamonds' ? '<div class="field"><label>Dates are</label><select id="rep-dateby"><option value="order"' + (R.dateBy !== 'delivered' ? ' selected' : '') + '>Order date</option><option value="delivered"' + (R.dateBy === 'delivered' ? ' selected' : '') + '>Delivery date</option></select></div>' : '') +
        defs.map((d) => '<div class="field"><label>' + esc(d[1]) + '</label><select data-rf="' + d[0] + '">' +
          (d[3] ? '' : '<option value="">All</option>') +
          d[2].map((o) => '<option value="' + esc(o[0]) + '"' + (String(R.f[d[0]] || (d[3] ? d[2][0][0] : '')) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select></div>').join('') +
        '</div>' : '') +
      '</div>' : '') +
    '<div id="rep-body">' + loadingHTML() + '</div>';
  ['#rep-from', '#rep-to'].forEach((sel) => { const el = $(sel); if (el) el.addEventListener('change', () => { R.from = $('#rep-from').value; R.to = $('#rep-to').value; renderReports(); }); });
  const ts = $('#rep-type');
  if (ts) ts.addEventListener('change', () => { R.type = ts.value; R.group = ''; S.repData = null; repPruneFilters(); renderReports(); });
  const as = $('#rep-acct');
  if (as) as.addEventListener('change', () => { R.acct = as.value; S.repData = null; repPruneFilters(); renderReports(); });
  const gsel = $('#rep-group'); if (gsel) gsel.addEventListener('change', () => { R.group = gsel.value; drawReport(); });
  const db2 = $('#rep-dateby'); if (db2) db2.addEventListener('change', () => { R.dateBy = db2.value; renderReports(); });
  c.querySelectorAll('select[data-rf]').forEach((s) => s.addEventListener('change', () => { R.f[s.dataset.rf] = s.value; renderReports(); }));
  try { await repLoad(); } catch (e) { const b = $('#rep-body'); if (b) b.innerHTML = '<div class="empty">Could not load the report — try again.</div>'; return; }
  drawReport();
}

function repPeriodText() {
  const R = repState();
  return REP_NO_PERIOD[R.type] ? 'As on ' + fmtDLong(todayStr()) : rangeLabel(S.repData.range);
}

function drawReport() {
  const box = $('#rep-body');
  if (!box || !S.repData || S.repData.key !== repKey().key) return;   // still loading the one now chosen
  const B = repBuild(S.repData);
  S.repBuilt = B;
  const R = repState();
  const tilesHTML = '<div class="rep-tiles">' + B.tiles.map((t) => '<div class="stat"><div class="st-num o-num-sm">' + esc(t[1]) + '</div><div class="st-label">' + esc(t[0]) + '</div></div>').join('') + '</div>';
  const actions = '<div class="action-row" style="margin-top:10px"><button class="btn btn-secondary" data-action="rep-csv">⬇ Excel</button><button class="btn btn-secondary" data-action="rep-pdf">PDF</button></div>';
  if (B.isBook) { box.innerHTML = '<div class="hint" style="margin:2px 2px 8px">' + esc(repPeriodText()) + '</div>' + tilesHTML + actions + ledgerHTML(B); return; }
  const G = repGroups(B);
  const groupLabel = ((REP_GROUPS[R.type] || []).find((g) => g[0] === R.group) || ['', ''])[1];
  box.innerHTML =
    '<div class="hint" style="margin:2px 2px 8px">' + esc(repPeriodText()) + '</div>' + tilesHTML + actions +
    (G ? '<div class="section-label">By ' + esc(groupLabel) + '</div><div class="card rep-gtable"><div class="rep-grow rep-ghead"><span>' + esc(groupLabel) + '</span>' +
      B.gcols.map((gc) => '<span>' + esc(gc[0]) + '</span>').join('') + '</div>' +
      G.map((g) => '<div class="rep-grow"><span>' + esc(g.k) + '</span>' + B.gcols.map((gc) => '<span>' + esc(gc[1](g.a)) + '</span>').join('') + '</div>').join('') + '</div>' : '') +
    '<div class="section-label">' + (B.rows.length ? 'Details (' + B.rows.length + ')' : 'Details') + '</div>' +
    (B.rows.length ? '<div class="card" style="padding:4px 14px">' + B.rows.slice(0, 300).map((x) => {
      const l = B.lines(x), oid = B.open(x), lid = B.ledger ? B.ledger(x) : null, cid = B.cat ? B.cat(x) : null, kid = B.karigar ? B.karigar(x) : null;
      const act = oid ? ' data-action="o-open" data-id="' + oid + '"' : lid ? ' data-action="lg-open" data-id="' + lid + '"' : cid ? ' data-action="cat-open" data-id="' + cid + '"' : kid ? ' data-action="k-open" data-id="' + kid + '"' : '';
      return '<div class="acc-row' + (act ? ' tap' : '') + '"' + act + '><div class="acc-main"><b>' + esc(l[0]) + '</b><div class="o-item-meta">' + esc(l[1]) + '</div></div>' +
        '<div class="acc-amt">' + esc(B.amount(x)) + '</div></div>';
    }).join('') + '</div>' + (B.rows.length > 300 ? '<div class="hint" style="text-align:center">Showing the first 300 — Excel and PDF have all of them.</div>' : '')
      : '<div class="empty" style="padding:14px">Nothing matches these filters.</div>');
}

/* the account book on screen: opening, every entry with its running balance, closing */
function ledgerHTML(B) {
  const sp = B.spec;
  const R = repState();
  const showParty = !R.f.party || B.kind === 'money' || B.kind === 'expense' || B.kind === 'karigar';
  const amt = (e) => {
    if (B.kind === 'money') return e.dr ? '<span class="lg-in">+ ' + inr(e.dr) + '</span>' : '<span class="lg-out">− ' + inr(e.cr) + '</span>';
    if (B.kind === 'party') return e.noPrice ? '<span class="lg-np">No price yet</span>' : e.dr ? inr(e.dr) : '<span class="lg-in">− ' + inr(e.cr) + '</span>';
    if (B.kind === 'karigar') return e.cr ? inr(e.cr) : '<span class="lg-in">− ' + inr(e.dr) + '</span>';
    return inr(e.dr + e.cr);
  };
  const shown = B.rows.length > 300 ? B.rows.slice(B.rows.length - 300) : B.rows;
  const row = (date, main, sub, a, bal, act, cls) => '<div class="lg-st-row' + (act ? ' tap' : '') + (cls ? ' ' + cls : '') + '"' + (act || '') + '>' +
    '<div class="lg-st-main">' + (date ? '<span class="lg-st-date">' + esc(date) + '</span> ' : '') + main + (sub ? '<div class="o-item-meta">' + esc(sub) + '</div>' : '') + '</div>' +
    '<div class="lg-st-amt">' + a + '</div><div class="lg-st-bal">' + esc(bal) + '</div></div>';
  return '<div class="section-label">' + esc(acctLabel(R.acct)) + (B.rows.length ? ' (' + B.rows.length + ')' : '') + '</div>' +
    (B.narrowed ? '<div class="hint" style="margin:-2px 2px 8px">Filtered: only some entries are shown, so there is no opening or closing balance. Clear the filters to see the full book.</div>' : '') +
    '<div class="card lg-stmt">' +
    '<div class="lg-st-head"><span>Date · details</span><span>Amount</span><span>' + esc(sp.bal) + '</span></div>' +
    (sp.balance ? row('', '<b>Opening balance</b>', '', '', sp.fmt(B.opening), '', 'lg-st-open') : '') +
    (B.rows.length > 300 ? '<div class="hint" style="text-align:center;padding:6px 0">' + (B.rows.length - 300) + ' earlier entries are in Excel and PDF</div>' : '') +
    shown.map((e) => {
      const act = e.orderId ? ' data-action="o-open" data-id="' + e.orderId + '"' : '';
      const main = esc((showParty && e.party ? e.party + ' · ' : '') + e.text) + (e.mode ? ' <span class="lg-mode">' + esc(bucketLabel(e.mode)) + '</span>' : '');
      return row(fmtD(e.date), main, e.note, amt(e), sp.fmt(e.bal), act);
    }).join('') +
    (!B.rows.length ? '<div class="empty" style="padding:12px">No entries in this period.</div>' : '') +
    row('', '<b>' + (sp.balance ? 'Closing balance' : sp.net ? 'Net' : 'Total') + '</b>', '', '', sp.fmt(B.closing), '', 'lg-st-open') +
    '</div>';
}

function repTitle() {
  const R = repState();
  return R.type === 'ledger' ? acctLabel(R.acct) : (REP_TYPES.find((t) => t[0] === R.type) || ['', 'Report'])[1];
}
function repFilterText() {
  const R = repState();
  const parts = repActiveDefs().map((d) => {
    const o = d[2].find((x) => String(x[0]) === String(R.f[d[0]]));
    return d[1] + ': ' + (o ? o[1] : R.f[d[0]]);
  });
  const kind = R.type === 'ledger' ? acctKind(R.acct) : '';
  if (kind === 'party' && R.f.party) { const p = (S.repParties || []).find((x) => x.id === R.f.party); if (p) parts.unshift('Party: ' + p.trade_name); }
  if (kind === 'karigar' && R.f.karigar) { const k = (S.karigars || []).find((x) => x.id === R.f.karigar); if (k) parts.unshift('Karigar: ' + k.name); }
  return parts.join(', ');
}
function repFileName(ext) {
  const R = repState();
  const r = S.repData.range;
  return safeFileName(repTitle() + ' ' + (REP_NO_PERIOD[R.type] ? todayStr() : (r[0] || 'all') + (r[1] ? ' to ' + r[1] : ''))) + ext;
}

function repCsv() {
  const B = S.repBuilt;
  if (!B) return;
  if (B.isBook) {
    const sp = B.spec, sales = B.kind === 'sales';
    const r2 = (v) => Math.round(num(v) * 100) / 100;
    const head = ['Date', 'Party / name', 'Particulars', 'Note', 'Cash / bank'].concat(sp.dr ? [sp.dr] : []).concat(sp.cr ? [sp.cr] : []).concat([sp.bal])
      .concat(sales ? ['Gold net (g)', 'Fine gold (g)', 'Silver net (g)', 'Diamond ct'] : []);
    const pad = (sp.dr ? [''] : []).concat(sp.cr ? [''] : []);
    const rows = [];
    if (sp.balance) rows.push([S.repData.range[0] || '', '', 'Opening balance', '', ''].concat(pad).concat([r2(B.opening)]));
    B.rows.forEach((e) => rows.push([e.date, e.party, e.text, e.note, e.mode ? bucketLabel(e.mode) : ''].concat(sp.dr ? [e.dr ? r2(e.dr) : ''] : []).concat(sp.cr ? [e.cr ? r2(e.cr) : ''] : [])
      .concat([r2(e.bal)]).concat(sales ? [round3(e.netG), round3(e.fineG), round3(e.netS), round3(e.ct)] : [])));
    rows.push([S.repData.range[1] || todayStr(), '', sp.balance ? 'Closing balance' : sp.net ? 'Net' : 'Total', '', ''].concat(sp.dr ? [r2(B.tDr)] : []).concat(sp.cr ? [r2(B.tCr)] : []).concat([r2(B.closing)]));
    downloadFile(repFileName('.csv'), buildCsv(head, rows));
    return;
  }
  downloadFile(repFileName('.csv'), buildCsv(B.csvHead, B.rows.map(B.csv)));
}

async function buildReportPdf() {
  const B = S.repBuilt, R = repState();
  const pdfTxt = (s) => String(s).replace(/₹/g, 'Rs. ').replace(/−/g, '-');
  const meta = [['Period', REP_NO_PERIOD[R.type] ? 'As on ' + fmtD(todayStr()) : rangeLabel(S.repData.range)], [B.isBook ? 'Entries' : 'Rows', String(B.rows.length)]];
  const d = await pdfStart(repTitle().toUpperCase(), meta);
  const ft = repFilterText();
  if (ft) pNote(d, 'FILTERS', ft);
  pTotals(d, B.tiles.map((t) => [t[0], pdfTxt(t[1])]));
  if (B.isBook) {
    const sp = B.spec;
    const money = (v) => (v ? pRs(v) : '');
    const balP = (v) => pdfTxt(sp.fmt(v));
    pHeading(d, acctLabel(R.acct));
    const cols = [{ h: 'Date', w: 22 }, { h: 'Particulars', w: 0 }].concat(sp.dr ? [{ h: sp.dr, w: 26, a: 'right' }] : []).concat(sp.cr ? [{ h: sp.cr, w: 26, a: 'right' }] : []).concat([{ h: sp.bal, w: 32, a: 'right' }]);
    cols[1].w = PG_W - PM * 2 - cols.reduce((a, x) => a + x.w, 0);
    const blank = (sp.dr ? [''] : []).concat(sp.cr ? [''] : []);
    const rows = [];
    if (sp.balance) { const r0 = [S.repData.range[0] ? pDate(S.repData.range[0]) : '', 'Opening balance'].concat(blank).concat([balP(B.opening)]); r0.bold = true; rows.push(r0); }
    B.rows.forEach((e) => rows.push([pDate(e.date), [e.party, e.text, e.mode ? bucketLabel(e.mode) : '', e.note].filter(Boolean).join(' - ')]
      .concat(sp.dr ? [money(e.dr)] : []).concat(sp.cr ? [money(e.cr)] : []).concat([balP(e.bal)])));
    const rl = ['', sp.balance ? 'Closing balance' : sp.net ? 'Net' : 'Total'].concat(sp.dr ? [pRs(B.tDr)] : []).concat(sp.cr ? [pRs(B.tCr)] : []).concat([balP(B.closing)]);
    rl.bold = true;
    rows.push(rl);
    d.table(cols, rows, { zebra: true, size: 8 });
  } else {
    const G = repGroups(B);
    if (G) {
      const gl = ((REP_GROUPS[R.type] || []).find((g) => g[0] === R.group) || ['', ''])[1];
      pHeading(d, 'By ' + gl);
      const cols = [{ h: gl, w: 0 }].concat(B.gcols.map((gc) => ({ h: gc[0], w: 26, a: 'right' })));
      cols[0].w = PG_W - PM * 2 - cols.reduce((a, x) => a + x.w, 0);
      d.table(cols, G.map((g) => [g.k].concat(B.gcols.map((gc) => pdfTxt(gc[1](g.a))))), { zebra: true });
    }
    if (B.rows.length) {
      pHeading(d, 'Details');
      const cols = B.pdfCols.map((c) => ({ h: c[0], w: c[1], a: c[2] }));
      const free = cols.find((c) => !c.w);
      if (free) free.w = PG_W - PM * 2 - cols.reduce((a, x) => a + (x.w || 0), 0);
      d.table(cols, B.rows.slice(0, 3000).map(B.pdfRow), { zebra: true, size: 8 });
    }
  }
  return { pdf: d, name: repFileName('.pdf'), text: repTitle() + ' — ' + bizName() };
}

onAct('rep-open', () => showSub('Reports', renderReports));
onAct('rep-go', (el) => { const R = repState(); R.type = 'ledger'; R.acct = el.dataset.acct; R.group = ''; S.repData = null; repPruneFilters(); showSub('Reports', renderReports); });
onAct('rep-p', (el) => { const R = repState(); R.p = el.dataset.p; if (R.p === 'custom' && !R.from) { R.from = monthStart(); R.to = todayStr(); } renderReports(); });
onAct('rep-filters', () => { const R = repState(); R.showFilters = !R.showFilters; renderReports(); });
onAct('rep-clear', () => { const R = repState(); R.f = {}; renderReports(); });
onAct('rep-csv', () => repCsv());
onAct('rep-pdf', () => makeAndOfferPdf(buildReportPdf));
