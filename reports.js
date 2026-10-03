/* ============================================================
   REPORTS (owner) — sales by item, orders, payments received,
   party balances, diamonds & stones, expenses — for any period;
   filter by party, metal, colour, purity, diamond type, diamond /
   jewellery certificate, order type, status, executive, city,
   piece type, payment mode; group any way; Excel or PDF.
   Item values share the order total (GST and discount included)
   in proportion to each item's own value.
   ============================================================ */
'use strict';

const REP_TYPES = [['sales', 'Sales (items)'], ['orders', 'Orders'], ['payments', 'Payments received'], ['parties', 'Party balances'], ['diamonds', 'Diamonds & stones'], ['expenses', 'Expenses']];
const REP_STATUS = [['booked', 'Booked (open + delivered)'], ['open', 'Open'], ['delivered', 'Delivered'], ['quote', 'Quotations'], ['cancelled', 'Cancelled'], ['all', 'All']];
const REP_STATUS_SET = { booked: ['new', 'in_production', 'ready', 'delivered'], open: ['new', 'in_production', 'ready'], delivered: ['delivered'], quote: ['quote'], cancelled: ['cancelled'], all: null };
const REP_GROUPS = {
  sales: [['', 'No grouping'], ['party', 'Party'], ['metal', 'Metal'], ['purity', 'Purity'], ['color', 'Colour / finish'], ['dtype', 'Diamond type'], ['cat', 'Piece type'], ['otype', 'Order type'], ['exec', 'Executive'], ['city', 'City'], ['month', 'Month']],
  orders: [['', 'No grouping'], ['party', 'Party'], ['metal', 'Metal'], ['otype', 'Order type'], ['status', 'Status'], ['exec', 'Executive'], ['city', 'City'], ['month', 'Month']],
  payments: [['', 'No grouping'], ['party', 'Party'], ['mode', 'Mode'], ['bucket', 'Cash / bank'], ['month', 'Month']],
  parties: [['', 'No grouping'], ['city', 'City']],
  diamonds: [['dtype', 'Diamond type'], ['', 'No grouping'], ['party', 'Party'], ['dcert', 'Certificate'], ['month', 'Month']],
  expenses: [['cat', 'Category'], ['', 'No grouping'], ['mode', 'Mode'], ['month', 'Month']],
};

function repState() {
  if (!S.rep) S.rep = { type: 'sales', p: 'month', from: '', to: '', dateBy: 'order', f: {}, group: '', showFilters: false };
  return S.rep;
}
function repMonth(d) { return d ? d.slice(0, 7) : ''; }
function repMonthLabel(k) { return k ? monthLabel(k + '-01') : '—'; }

/* ---------------- data ---------------- */
const repFetchAll = (makeQuery) => fetchPaged(makeQuery);

async function repLoad() {
  const R = repState();
  const r = periodRange(R.p, R.from, R.to);
  const key = [R.type, r[0], r[1], R.dateBy].join('|');
  if (S.repData && S.repData.key === key) return S.repData;
  let data;
  if (R.type === 'sales' || R.type === 'orders' || R.type === 'diamonds') {
    const col = R.dateBy === 'delivered' ? 'delivered_on' : 'order_date';
    const orders = await repFetchAll(() => inRange(db.from('orders').select('*, clients(trade_name, city, state), order_items(*)'), col, r).order('order_date', { ascending: true }).order('id', { ascending: true }));
    data = { orders };
  } else if (R.type === 'payments') {
    const [op, pt] = await Promise.all([
      repFetchAll(() => inRange(db.from('order_payments').select('*, orders(order_no, client_id, status, clients(trade_name, city))'), 'paid_on', r).order('paid_on', { ascending: true }).order('id', { ascending: true })),
      repFetchAll(() => inRange(db.from('party_txns').select('*, clients(trade_name, city)').eq('kind', 'payment'), 'txn_date', r).order('txn_date', { ascending: true }).order('id', { ascending: true })),
    ]);
    data = { op, pt };
  } else if (R.type === 'parties') {
    data = { by: await partyBalances() };
  } else {
    data = { ex: await repFetchAll(() => inRange(db.from('expenses').select('*'), 'exp_date', r).order('exp_date', { ascending: true }).order('id', { ascending: true })) };
  }
  data.key = key;
  data.range = r;
  S.repData = data;
  return data;
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
  return true;
}
function repItemPass(x, f) {
  const it = x.it;
  if (f.color && (it.metal_color || '') !== f.color) return false;
  if (f.cat && (it.category || '') !== f.cat) return false;
  if (f.dtype === 'any' && !it.diamond_type) return false;
  if (f.dtype === 'none' && it.diamond_type) return false;
  if (f.dtype && f.dtype !== 'any' && f.dtype !== 'none' && it.diamond_type !== f.dtype) return false;
  if (f.dcert === 'yes' && !it.diamond_cert_lab) return false;
  if (f.dcert === 'no' && (!it.diamond_type || it.diamond_cert_lab)) return false;
  if (f.jcert === 'yes' && !it.jewel_cert_type) return false;
  if (f.jcert === 'no' && it.jewel_cert_type) return false;
  if (f.jcert === 'huid' && (it.jewel_cert_type || '').indexOf('HUID') === -1) return false;
  return true;
}

/* rows + columns + totals for the chosen report */
function repBuild(D) {
  const R = repState();
  const f = R.f;
  const T = R.type;
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
        'Diamond cert no', 'Jewellery certificate', 'Jewellery cert / HUID no', 'Stone value', 'Item value (incl. GST)'],
      csv: (x) => [x.o.order_date, x.o.delivered_on || '', ordNo(x.o.order_no), x.party, x.city, OTYPE_LABEL[x.o.order_type], OSTATUS_LABEL[x.o.status], nameOf(x.o.created_by),
        x.it.category, x.it.design_code, x.it.description, x.it.qty, x.metal, x.o.purity, x.it.metal_color, x.it.gross_wt, x.it.net_wt, round3(x.fine),
        diamondLabel(x.it.diamond_type), x.it.diamond_ct, x.it.diamond_pcs, x.it.diamond_quality, x.it.diamond_rate,
        x.it.diamond_type ? (x.it.diamond_cert_lab || 'Not certified') : '', x.it.diamond_cert_no, x.it.jewel_cert_type || '', x.it.jewel_cert_no, x.it.stone_amount, Math.round(x.value)],
      pdfCols: [['Date', 20], ['Order', 18], ['Party', 34], ['Item', 0], ['Net (g)', 17, 'right'], ['Value', 24, 'right']],
      pdfRow: (x) => [fmtD(x.o.order_date), ordNo(x.o.order_no), x.party, [x.it.category, x.it.design_code, x.it.metal_color ? colorLabel(x.metal, x.it.metal_color) : '',
        x.it.diamond_type ? diamondLabel(x.it.diamond_type) + (num(x.it.diamond_ct) ? ' ' + fmtCt(x.it.diamond_ct) + ' ct' : '') + (x.it.diamond_cert_lab ? ' ' + x.it.diamond_cert_lab : '') : '',
        x.it.jewel_cert_type ? (x.it.jewel_cert_type.indexOf('HUID') > -1 ? 'HUID ' + (x.it.jewel_cert_no || '') : x.it.jewel_cert_type) : ''].filter(Boolean).join(', '),
        x.net ? pG(x.net) : '', pRs(x.value)],
    };
  }
  if (T === 'orders') {
    const rows = D.orders.filter((o) => repOrderPass(o, f)).map((o) => {
      const net = (o.order_items || []).reduce((a, it) => a + num(it.net_wt), 0);
      return { o, net, party: (o.clients && o.clients.trade_name) || '', city: (o.clients && o.clients.city) || '', total: num(o.total_amount), paid: num(o.paid_amount), due: isLive(o) ? balanceOf(o) : 0 };
    });
    const agg = (list) => ({ n: list.length, total: list.reduce((a, x) => a + x.total, 0), paid: list.reduce((a, x) => a + x.paid, 0), due: list.reduce((a, x) => a + x.due, 0), net: list.reduce((a, x) => a + x.net, 0) });
    const tot = agg(rows);
    return {
      rows, tot, agg, tiles: [['Orders', String(tot.n)], ['Value', inr(tot.total)], ['Received', inr(tot.paid)], ['Due', inr(tot.due)]],
      groupKey: (x, k) => ({ party: x.party || '—', metal: x.o.metal || 'Gold', otype: OTYPE_LABEL[x.o.order_type] || '—', status: OSTATUS_LABEL[x.o.status] || x.o.status,
        exec: nameOf(x.o.created_by), city: x.city || '—', month: repMonth(x.o.order_date) }[k]),
      gcols: [['Orders', (a) => String(a.n)], ['Value', (a) => inr(a.total)], ['Received', (a) => inr(a.paid)], ['Due', (a) => inr(a.due)]],
      lines: (x) => [ordNo(x.o.order_no) + ' · ' + x.party, [fmtD(x.o.order_date), OTYPE_LABEL[x.o.order_type], OSTATUS_LABEL[x.o.status], x.net ? fmtG(x.net) + ' g' : '',
        x.due >= 1 ? 'due ' + inr(x.due) : ''].filter(Boolean).join(' · ')],
      amount: (x) => inr(x.total), open: (x) => x.o.id,
      csvHead: ['Order no', 'Order date', 'Delivered on', 'Party', 'City', 'Type', 'Status', 'Metal', 'Purity', 'Net wt (g)', 'Total', 'Received', 'Balance', 'Executive'],
      csv: (x) => [ordNo(x.o.order_no), x.o.order_date, x.o.delivered_on || '', x.party, x.city, OTYPE_LABEL[x.o.order_type], OSTATUS_LABEL[x.o.status], x.o.metal, x.o.purity,
        round3(x.net), x.total, x.paid, x.due, nameOf(x.o.created_by)],
      pdfCols: [['Date', 20], ['Order', 18], ['Party', 0], ['Status', 22], ['Total', 24, 'right'], ['Received', 24, 'right'], ['Due', 22, 'right']],
      pdfRow: (x) => [fmtD(x.o.order_date), ordNo(x.o.order_no), x.party, OSTATUS_LABEL[x.o.status] || '', pRs(x.total), pRs(x.paid), x.due ? pRs(x.due) : ''],
    };
  }
  if (T === 'payments') {
    let rows = D.op.map((p) => ({ date: p.paid_on, mode: p.mode || '', amount: num(p.amount), party: (p.orders && p.orders.clients && p.orders.clients.trade_name) || '',
      city: (p.orders && p.orders.clients && p.orders.clients.city) || '', client: p.orders && p.orders.client_id, what: p.orders ? ordNo(p.orders.order_no) : '', note: p.note || '', orderId: p.order_id }))
      .concat(D.pt.map((t) => ({ date: t.txn_date, mode: t.mode || '', amount: num(t.amount), party: (t.clients && t.clients.trade_name) || '', city: (t.clients && t.clients.city) || '',
        client: t.client_id, what: 'On account', note: t.note || '' })));
    rows = rows.filter((x) => x.mode !== 'Discount' || f.mode === 'Discount');
    if (f.party) rows = rows.filter((x) => x.client === f.party);
    if (f.mode) rows = rows.filter((x) => x.mode === f.mode);
    if (f.city) rows = rows.filter((x) => x.city === f.city);
    rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const agg = (list) => ({ n: list.length, cash: list.filter((x) => modeBucket(x.mode) === 'cash').reduce((a, x) => a + x.amount, 0),
      bank: list.filter((x) => modeBucket(x.mode) === 'bank').reduce((a, x) => a + x.amount, 0), total: list.reduce((a, x) => a + x.amount, 0) });
    const tot = agg(rows);
    return {
      rows, tot, agg, tiles: [['Payments', String(tot.n)], ['Cash', inr(tot.cash)], ['Bank / UPI / cheque', inr(tot.bank)], ['Total', inr(tot.total)]],
      groupKey: (x, k) => ({ party: x.party || '—', mode: x.mode || '—', bucket: { cash: 'Cash', bank: 'Bank / UPI / cheque', gold: 'Old gold' }[modeBucket(x.mode)] || 'Other', month: repMonth(x.date) }[k]),
      gcols: [['Count', (a) => String(a.n)], ['Cash', (a) => inr(a.cash)], ['Bank', (a) => inr(a.bank)], ['Total', (a) => inr(a.total)]],
      lines: (x) => [x.party || '—', [fmtD(x.date), x.what, x.mode, x.note].filter(Boolean).join(' · ')],
      amount: (x) => inr(x.amount), open: (x) => x.orderId || null,
      csvHead: ['Date', 'Party', 'City', 'Against', 'Mode', 'Note', 'Amount'],
      csv: (x) => [x.date, x.party, x.city, x.what, x.mode, x.note, x.amount],
      pdfCols: [['Date', 22], ['Party', 0], ['Against', 26], ['Mode', 22], ['Amount', 28, 'right']],
      pdfRow: (x) => [fmtD(x.date), x.party, x.what, x.mode, pRs(x.amount)],
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
  // expenses
  let rows = D.ex.slice();
  if (f.ecat) rows = rows.filter((x) => x.category === f.ecat);
  if (f.mode) rows = rows.filter((x) => x.mode === f.mode);
  if (f.exec) rows = rows.filter((x) => x.created_by === f.exec);
  const agg = (list) => ({ n: list.length, cash: list.filter((x) => modeBucket(x.mode) === 'cash').reduce((a, x) => a + num(x.amount), 0),
    bank: list.filter((x) => modeBucket(x.mode) === 'bank').reduce((a, x) => a + num(x.amount), 0), total: list.reduce((a, x) => a + num(x.amount), 0) });
  const tot = agg(rows);
  return {
    rows, tot, agg, tiles: [['Expenses', String(tot.n)], ['Cash', inr(tot.cash)], ['Bank', inr(tot.bank)], ['Total', inr(tot.total)]],
    groupKey: (x, k) => ({ cat: x.category, mode: x.mode, month: repMonth(x.exp_date) }[k]),
    gcols: [['Count', (a) => String(a.n)], ['Cash', (a) => inr(a.cash)], ['Bank', (a) => inr(a.bank)], ['Total', (a) => inr(a.total)]],
    lines: (x) => [x.category, [fmtD(x.exp_date), x.mode, x.note, nameOf(x.created_by)].filter(Boolean).join(' · ')],
    amount: (x) => inr(x.amount), open: () => null,
    csvHead: ['Date', 'Category', 'Mode', 'Note', 'Added by', 'Amount'],
    csv: (x) => [x.exp_date, x.category, x.mode, x.note, nameOf(x.created_by), x.amount],
    pdfCols: [['Date', 24], ['Category', 34], ['Note', 0], ['Mode', 22], ['Amount', 28, 'right']],
    pdfRow: (x) => [fmtD(x.exp_date), x.category, x.note || '', x.mode, pRs(x.amount)],
  };
}
function fmtG(x) { return (Math.round(num(x) * 1000) / 1000).toLocaleString('en-IN', { maximumFractionDigits: 3 }); }
function fmtCt(x) { return (Math.round(num(x) * 100) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 }); }
function round3(x) { return Math.round(num(x) * 1000) / 1000; }

function repGroups(B) {
  const R = repState();
  if (!R.group) return null;
  const m = new Map();
  B.rows.forEach((x) => { const k = B.groupKey(x, R.group) || '—'; if (!m.has(k)) m.set(k, []); m.get(k).push(x); });
  const list = Array.from(m.entries()).map((e) => ({ k: e[0], a: B.agg(e[1]) }));
  if (R.group === 'month') {
    list.sort((a, b) => (a.k < b.k ? -1 : 1));
    list.forEach((g) => { g.k = repMonthLabel(g.k === '—' ? '' : g.k); });
  } else list.sort((a, b) => (num(b.a.value != null ? b.a.value : b.a.total != null ? b.a.total : b.a.due) - num(a.a.value != null ? a.a.value : a.a.total != null ? a.a.total : a.a.due)));
  return list;
}

/* ---------------- screen ---------------- */
function repFilterDefs() {
  const R = repState();
  const T = R.type;
  const team = Array.from((S.team || new Map()).values()).map((p) => [p.id, p.full_name || p.email || '—']);
  const metals = [['Gold', 'Gold'], ['Silver', 'Silver']];
  const colors = GOLD_COLORS.concat(SILVER_FINISHES).map((c) => [c, c]);
  const purities = ALL_PURITY.map((p) => [p[0], p[0]]);
  const dtypes = [['any', 'Any diamonds / stones'], ['none', 'No diamonds']].concat(DIAMOND_TYPES.map((t) => [t, diamondLabel(t)]));
  const cats = ITEM_CATS.map((c) => [c, c]);
  const yn = [['yes', 'Certified'], ['no', 'Not certified']];
  const jc = [['yes', 'Certified (any)'], ['huid', 'BIS Hallmark (HUID)'], ['no', 'Not certified']];
  const otypes = [['job_work', 'Job work'], ['ready_stock', 'Ready stock'], ['custom', 'Custom order']];
  const modes = MONEY_MODES.concat(['Discount']).map((m) => [m, m]);
  const party = (S.repParties || []).map((c) => [c.id, c.trade_name]);
  const cities = (S.repCities || []).map((c) => [c, c]);
  const d = [];
  if (T !== 'expenses') d.push(['party', 'Party', party], ['city', 'City', cities]);
  if (T === 'sales' || T === 'orders' || T === 'diamonds') d.push(['status', 'Status', REP_STATUS, true], ['metal', 'Metal', metals], ['otype', 'Order type', otypes], ['exec', 'Executive (booked by)', team]);
  if (T === 'sales' || T === 'diamonds') d.push(['purity', 'Purity', purities], ['color', 'Colour / finish', colors], ['cat', 'Piece type', cats], ['jcert', 'Jewellery certificate', jc]);
  if (T === 'sales') d.push(['dtype', 'Diamonds / stones', dtypes]);
  if (T === 'diamonds') d.push(['dtype', 'Diamond type', DIAMOND_TYPES.map((t) => [t, diamondLabel(t)])]);
  if (T === 'sales' || T === 'diamonds') d.push(['dcert', 'Diamond certificate', yn]);
  if (T === 'payments' || T === 'expenses') d.push(['mode', 'Mode', T === 'expenses' ? EXP_MODES.map((m) => [m, m]) : modes]);
  if (T === 'expenses') d.push(['ecat', 'Category', EXP_CATS.map((c) => [c, c])], ['exec', 'Added by', team]);
  if (T === 'parties') d.push(['bal', 'Show', [['dueadv', 'Due or advance'], ['due', 'Only dues'], ['adv', 'Only advance'], ['all', 'Everyone']], true]);
  return d;
}

async function renderReports() {
  const R = repState();
  if (!S.repParties) {
    const { data } = await db.from('clients').select('id, trade_name, city').order('trade_name', { ascending: true }).limit(5000);
    S.repParties = data || [];
    S.repCities = Array.from(new Set(S.repParties.map((c) => (c.city || '').trim()).filter(Boolean))).sort();
  }
  const groups = REP_GROUPS[R.type];
  if (!groups.some((g) => g[0] === R.group)) R.group = groups[0][0];
  const defs = repFilterDefs();
  const active = defs.filter((d) => R.f[d[0]] && !(d[3] && (R.f[d[0]] === 'booked' || R.f[d[0]] === 'dueadv'))).length;
  const c = $('#content');
  c.innerHTML =
    '<div class="filter-chips rep-types">' + REP_TYPES.map((t) => '<button class="' + (R.type === t[0] ? 'on' : '') + '" data-action="rep-type" data-v="' + t[0] + '">' + t[1] + '</button>').join('') + '</div>' +
    (R.type !== 'parties' ? '<div class="filter-chips">' + ACC_PERIODS.map((x) => '<button class="' + (R.p === x[0] ? 'on' : '') + '" data-action="rep-p" data-p="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>' : '') +
    (R.p === 'custom' && R.type !== 'parties' ? '<div class="card" style="padding:10px 14px"><div class="o-2col"><div class="field" style="margin:0"><label>From</label><input type="date" id="rep-from" value="' + esc(R.from) + '"></div>' +
      '<div class="field" style="margin:0"><label>To</label><input type="date" id="rep-to" value="' + esc(R.to) + '"></div></div></div>' : '') +
    '<div class="card rep-card">' +
    '<div class="rep-bar"><button class="btn btn-small btn-secondary" data-action="rep-filters">' + (R.showFilters ? 'Hide filters' : 'Filters') + (active ? ' (' + active + ')' : '') + '</button>' +
    (active ? '<button class="btn btn-small btn-ghost" data-action="rep-clear">Clear filters</button>' : '') +
    '<select id="rep-group" aria-label="Group by">' + groups.map((g) => '<option value="' + g[0] + '"' + (g[0] === R.group ? ' selected' : '') + '>' + (g[0] ? 'Group: ' : '') + g[1] + '</option>').join('') + '</select></div>' +
    (R.showFilters ? '<div class="o-2col rep-filters">' +
      (R.type === 'sales' || R.type === 'orders' || R.type === 'diamonds' ? '<div class="field"><label>Dates are</label><select id="rep-dateby"><option value="order"' + (R.dateBy !== 'delivered' ? ' selected' : '') + '>Order date</option><option value="delivered"' + (R.dateBy === 'delivered' ? ' selected' : '') + '>Delivery date</option></select></div>' : '') +
      defs.map((d) => '<div class="field"><label>' + esc(d[1]) + '</label><select data-rf="' + d[0] + '">' +
        (d[3] ? '' : '<option value="">All</option>') +
        d[2].map((o) => '<option value="' + esc(o[0]) + '"' + (String(R.f[d[0]] || (d[3] ? d[2][0][0] : '')) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select></div>').join('') +
      '</div>' : '') +
    '</div>' +
    '<div id="rep-body">' + loadingHTML() + '</div>';
  ['#rep-from', '#rep-to'].forEach((sel) => { const el = $(sel); if (el) el.addEventListener('change', () => { R.from = $('#rep-from').value; R.to = $('#rep-to').value; renderReports(); }); });
  const gsel = $('#rep-group'); if (gsel) gsel.addEventListener('change', () => { R.group = gsel.value; drawReport(); });
  const db2 = $('#rep-dateby'); if (db2) db2.addEventListener('change', () => { R.dateBy = db2.value; renderReports(); });
  c.querySelectorAll('select[data-rf]').forEach((s) => s.addEventListener('change', () => { R.f[s.dataset.rf] = s.value; renderReports(); }));
  try { await repLoad(); } catch (e) { const b = $('#rep-body'); if (b) b.innerHTML = '<div class="empty">Could not load the report — try again.</div>'; return; }
  drawReport();
}

function drawReport() {
  const box = $('#rep-body');
  if (!box || !S.repData) return;
  const B = repBuild(S.repData);
  S.repBuilt = B;
  const G = repGroups(B);
  const R = repState();
  const groupLabel = (REP_GROUPS[R.type].find((g) => g[0] === R.group) || ['', ''])[1];
  box.innerHTML =
    '<div class="hint" style="margin:2px 2px 8px">' + esc(R.type === 'parties' ? 'As on ' + fmtDLong(todayStr()) : rangeLabel(S.repData.range)) + '</div>' +
    '<div class="rep-tiles">' + B.tiles.map((t) => '<div class="stat"><div class="st-num o-num-sm">' + esc(t[1]) + '</div><div class="st-label">' + esc(t[0]) + '</div></div>').join('') + '</div>' +
    '<div class="action-row" style="margin-top:10px"><button class="btn btn-secondary" data-action="rep-csv">⬇ Excel</button><button class="btn btn-secondary" data-action="rep-pdf">PDF</button></div>' +
    (G ? '<div class="section-label">By ' + esc(groupLabel) + '</div><div class="card rep-gtable"><div class="rep-grow rep-ghead"><span>' + esc(groupLabel) + '</span>' +
      B.gcols.map((gc) => '<span>' + esc(gc[0]) + '</span>').join('') + '</div>' +
      G.map((g) => '<div class="rep-grow"><span>' + esc(g.k) + '</span>' + B.gcols.map((gc) => '<span>' + esc(gc[1](g.a)) + '</span>').join('') + '</div>').join('') + '</div>' : '') +
    '<div class="section-label">' + (B.rows.length ? 'Details (' + B.rows.length + ')' : 'Details') + '</div>' +
    (B.rows.length ? '<div class="card" style="padding:4px 14px">' + B.rows.slice(0, 300).map((x) => {
      const l = B.lines(x), oid = B.open(x), lid = B.ledger ? B.ledger(x) : null;
      const act = oid ? ' data-action="o-open" data-id="' + oid + '"' : lid ? ' data-action="lg-open" data-id="' + lid + '"' : '';
      return '<div class="acc-row' + (act ? ' tap' : '') + '"' + act + '><div class="acc-main"><b>' + esc(l[0]) + '</b><div class="o-item-meta">' + esc(l[1]) + '</div></div>' +
        '<div class="acc-amt">' + esc(B.amount(x)) + '</div></div>';
    }).join('') + '</div>' + (B.rows.length > 300 ? '<div class="hint" style="text-align:center">Showing the first 300 — Excel and PDF have all of them.</div>' : '')
      : '<div class="empty" style="padding:14px">Nothing matches these filters.</div>');
}

function repTitle() { const R = repState(); return (REP_TYPES.find((t) => t[0] === R.type) || ['', 'Report'])[1]; }
function repFilterText() {
  const R = repState();
  return repFilterDefs().filter((d) => R.f[d[0]] && !(d[3] && (R.f[d[0]] === 'booked' || R.f[d[0]] === 'dueadv'))).map((d) => {
    const o = d[2].find((x) => String(x[0]) === String(R.f[d[0]]));
    return d[1] + ': ' + (o ? o[1] : R.f[d[0]]);
  }).join(', ');
}

function repCsv() {
  const B = S.repBuilt;
  if (!B) return;
  const r = S.repData.range;
  downloadFile(safeFileName(repTitle() + ' ' + (r[0] || '') + (r[1] ? ' to ' + r[1] : '')) + '.csv', buildCsv(B.csvHead, B.rows.map(B.csv)));
}

async function buildReportPdf() {
  const B = S.repBuilt, R = repState();
  const r = S.repData.range;
  const meta = [['Period', R.type === 'parties' ? 'As on ' + fmtD(todayStr()) : rangeLabel(r)], ['Rows', String(B.rows.length)]];
  const d = await pdfStart(repTitle().toUpperCase(), meta);
  const ft = repFilterText();
  if (ft) pNote(d, 'FILTERS', ft);
  pTotals(d, B.tiles.map((t) => [t[0], String(t[1]).replace(/₹/g, 'Rs. ')]));
  const G = repGroups(B);
  if (G) {
    const gl = (REP_GROUPS[R.type].find((g) => g[0] === R.group) || ['', ''])[1];
    pHeading(d, 'By ' + gl);
    const cols = [{ h: gl, w: 0 }].concat(B.gcols.map((gc) => ({ h: gc[0], w: 26, a: 'right' })));
    cols[0].w = PG_W - PM * 2 - cols.reduce((a, x) => a + x.w, 0);
    d.table(cols, G.map((g) => [g.k].concat(B.gcols.map((gc) => String(gc[1](g.a)).replace(/₹/g, 'Rs. ')))), { zebra: true });
  }
  if (B.rows.length) {
    pHeading(d, 'Details');
    const cols = B.pdfCols.map((c) => ({ h: c[0], w: c[1], a: c[2] }));
    const free = cols.find((c) => !c.w);
    if (free) free.w = PG_W - PM * 2 - cols.reduce((a, x) => a + (x.w || 0), 0);
    d.table(cols, B.rows.slice(0, 3000).map(B.pdfRow), { zebra: true, size: 8 });
  }
  return { pdf: d, name: safeFileName(repTitle() + ' ' + (R.type === 'parties' ? todayStr() : (r[0] || '') + (r[1] ? ' to ' + r[1] : ''))) + '.pdf', text: repTitle() + ' — ' + bizName() };
}

onAct('rep-open', () => showSub('Reports', renderReports));
onAct('rep-type', (el) => { const R = repState(); R.type = el.dataset.v; R.group = ''; S.repData = null; renderReports(); });
onAct('rep-p', (el) => { const R = repState(); R.p = el.dataset.p; if (R.p === 'custom' && !R.from) { R.from = monthStart(); R.to = todayStr(); } renderReports(); });
onAct('rep-filters', () => { const R = repState(); R.showFilters = !R.showFilters; renderReports(); });
onAct('rep-clear', () => { const R = repState(); R.f = {}; renderReports(); });
onAct('rep-csv', () => repCsv());
onAct('rep-pdf', () => makeAndOfferPdf(buildReportPdf));
