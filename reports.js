/* ============================================================
   REPORTS (owner) — no amounts anywhere.
   Payment status (which party's payment is due / overdue / done,
   with the dates) · Payment dates (every due date and paid date in
   a period) · Order items (weights, purity, colour, diamonds,
   certificates) · Orders · Diamonds & stones · Month summary ·
   Stock (catalogue) · Karigar metal.
   Each one can be filtered, grouped and downloaded (Excel / PDF).
   ============================================================ */
'use strict';

const REP_TYPES = [
  ['pay', 'Payment status'], ['payhist', 'Payment dates'], ['items', 'Order items'], ['orders', 'Orders'],
  ['diamonds', 'Diamonds & stones'], ['summary', 'Month summary'], ['stock', 'Stock (catalogue)'], ['karigars', 'Karigar metal'],
];
const LIVE_STATUSES = ['new', 'in_production', 'ready', 'delivered'];
const REP_STATUS = [['booked', 'Booked (open + delivered)'], ['open', 'Open'], ['delivered', 'Delivered'], ['quote', 'Quotations'], ['cancelled', 'Cancelled'], ['all', 'All']];
const REP_STATUS_SET = { booked: LIVE_STATUSES, open: ['new', 'in_production', 'ready'], delivered: ['delivered'], quote: ['quote'], cancelled: ['cancelled'], all: null };
const REP_GROUPS = {
  pay: [['', 'No grouping'], ['status', 'Status'], ['city', 'City']],
  payhist: [['', 'No grouping'], ['party', 'Party'], ['kind', 'Entry'], ['month', 'Month'], ['exec', 'Added by']],
  items: [['', 'No grouping'], ['party', 'Party'], ['metal', 'Metal'], ['purity', 'Purity'], ['color', 'Colour / finish'], ['dtype', 'Diamond type'], ['cat', 'Piece type'], ['otype', 'Order type'], ['exec', 'Executive'], ['city', 'City'], ['month', 'Month']],
  orders: [['', 'No grouping'], ['party', 'Party'], ['metal', 'Metal'], ['otype', 'Order type'], ['status', 'Status'], ['exec', 'Executive'], ['city', 'City'], ['month', 'Month']],
  diamonds: [['dtype', 'Diamond type'], ['', 'No grouping'], ['party', 'Party'], ['dcert', 'Certificate'], ['month', 'Month']],
  stock: [['cat', 'Piece type'], ['', 'No grouping'], ['metal', 'Metal'], ['dtype', 'Diamond type'], ['color', 'Colour / finish'], ['status', 'Status']],
  karigars: [['', 'No grouping']],
  summary: [['', 'No grouping']],
};
/* reports that are "as on today" (no period) */
const REP_NO_PERIOD = { pay: 1, stock: 1, karigars: 1 };

function repState() {
  if (!S.rep) S.rep = { type: 'pay', p: 'month', from: '', to: '', dateBy: 'order', f: {}, group: '', showFilters: false };
  if (!REP_TYPES.some((t) => t[0] === S.rep.type)) S.rep.type = 'pay';
  return S.rep;
}
function repMonth(d) { return d ? String(d).slice(0, 7) : ''; }
function repMonthLabel(k) { return k ? monthLabel(k + '-01') : '—'; }
const repFetchAll = (makeQuery) => fetchPaged(makeQuery);
function fmtG(x) { return (Math.round(num(x) * 1000) / 1000).toLocaleString('en-IN', { maximumFractionDigits: 3 }); }
function fmtCt(x) { return (Math.round(num(x) * 100) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 }); }
function round3(x) { return Math.round(num(x) * 1000) / 1000; }
/* a period on a timestamp column: from the start of the first day to the end of the last */
function inRangeTs(q, col, r) {
  if (r[0]) q = q.gte(col, dayStartISO(r[0]));
  if (r[1]) { const d = new Date(r[1] + 'T00:00:00'); d.setDate(d.getDate() + 1); q = q.lt(col, d.toISOString()); }
  return q;
}

/* ---------------- data ---------------- */
/* what the screen is asking for right now */
function repKey() {
  const R = repState();
  const r = REP_NO_PERIOD[R.type] ? [null, null] : periodRange(R.p, R.from, R.to);
  return { key: [R.type, r[0], r[1], R.dateBy].join('|'), r };
}
async function repLoad() {
  const R = repState();
  const K = repKey();
  const r = K.r, key = K.key;
  if (S.repData && S.repData.key === key) return S.repData;
  let data;
  const T = R.type;
  if (T === 'items' || T === 'orders' || T === 'diamonds') {
    const col = R.dateBy === 'delivered' ? 'delivered_on' : 'order_date';
    data = { orders: await repFetchAll(() => inRange(db.from('orders').select('*, clients(trade_name, city, state), order_items(*)'), col, r).order('order_date', { ascending: true }).order('id', { ascending: true })) };
  } else if (T === 'pay') {
    data = { idx: payIndex(await payAllEntries()) };
  } else if (T === 'payhist') {
    data = { rows: await repFetchAll(() => inRange(db.from('party_pay_log').select('*, clients(trade_name, city)'), 'on_date', r).order('on_date', { ascending: true }).order('created_at', { ascending: true }).order('id', { ascending: true })) };
  } else if (T === 'summary') {
    data = await monthSummaryData(r);
  } else if (T === 'stock') {
    data = { items: await repFetchAll(() => db.from('catalogue_items').select('*').order('created_at', { ascending: true }).order('id', { ascending: true })) };
  } else {
    const [ks, ts] = await Promise.all([
      repFetchAll(() => db.from('karigars').select('*').order('name', { ascending: true }).order('id', { ascending: true })),
      repFetchAll(() => db.from('karigar_txns').select('id, karigar_id, kind, metal, fine_g').in('kind', ['issue', 'receive', 'wastage']).order('txn_date', { ascending: true }).order('id', { ascending: true })),
    ]);
    data = { ks, ts };
  }
  data.key = key;
  data.range = r;
  if (repKey().key === key) S.repData = data;   // the person may have picked another report meanwhile
  return data;
}

/* every item of every order */
function repItems(orders) {
  const rows = [];
  orders.forEach((o) => {
    (o.order_items || []).slice().sort((a, b) => a.sort - b.sort).forEach((it) => {
      const net = num(it.net_wt);
      rows.push({
        o, it, net, fine: net * num(o.purity) / 100, metal: o.metal || 'Gold',
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
  const [orders, clients, meets, paid] = await Promise.all([
    repFetchAll(() => inRange(db.from('orders').select('id, status, order_date, metal, order_items(net_wt, qty, diamond_ct, diamond_type)').in('status', LIVE_STATUSES), 'order_date', r).order('order_date', { ascending: true }).order('id', { ascending: true })),
    repFetchAll(() => inRangeTs(db.from('clients').select('id, created_at'), 'created_at', r).order('created_at', { ascending: true }).order('id', { ascending: true })),
    repFetchAll(() => inRangeTs(db.from('interactions').select('id, happened_at'), 'happened_at', r).order('happened_at', { ascending: true }).order('id', { ascending: true })),
    repFetchAll(() => inRange(db.from('party_pay_log').select('id, on_date').eq('status', 'done'), 'on_date', r).order('on_date', { ascending: true }).order('id', { ascending: true })),
  ]);
  return { orders, clients, meets, paid };
}
function monthSummaryBuild(D) {
  const M = new Map();
  const m = (d) => {
    const k = repMonth(d);
    if (!M.has(k)) M.set(k, { k, orders: 0, pcs: 0, gold: 0, silver: 0, ct: 0, clients: 0, meets: 0, paid: 0 });
    return M.get(k);
  };
  const localDay = (ts) => ymd(new Date(ts));
  D.orders.forEach((o) => {
    const x = m(o.order_date), items = o.order_items || [];
    x.orders++;
    const net = items.reduce((a, it) => a + num(it.net_wt), 0);
    if ((o.metal || 'Gold') === 'Silver') x.silver += net; else x.gold += net;
    x.ct += items.reduce((a, it) => a + (it.diamond_type ? num(it.diamond_ct) : 0), 0);
    x.pcs += items.reduce((a, it) => a + Math.max(1, parseInt(it.qty, 10) || 1), 0);
  });
  D.clients.forEach((c) => { m(localDay(c.created_at)).clients++; });
  D.meets.forEach((i) => { m(localDay(i.happened_at)).meets++; });
  D.paid.forEach((p) => { m(p.on_date).paid++; });
  const rows = Array.from(M.values()).sort((a, b) => (a.k < b.k ? -1 : 1));
  const sum = (k) => rows.reduce((a, x) => a + x[k], 0);
  const tot = {};
  ['orders', 'pcs', 'gold', 'silver', 'ct', 'clients', 'meets', 'paid'].forEach((k) => { tot[k] = sum(k); });
  const tiles = [['Orders', String(tot.orders)]];
  if (tot.gold) tiles.push(['Gold (g)', fmtG(tot.gold)]);
  if (tot.silver) tiles.push(['Silver (g)', fmtG(tot.silver)]);
  if (tot.ct) tiles.push(['Diamond ct', fmtCt(tot.ct)]);
  tiles.push(['New clients', String(tot.clients)], ['Meetings', String(tot.meets)], ['Payments done', String(tot.paid)]);
  const n = (v, one, many) => v + ' ' + (v === 1 ? one : many);
  const lines = (x) => [repMonthLabel(x.k), [n(x.orders, 'order', 'orders'), x.gold ? 'gold ' + fmtG(x.gold) + ' g' : '', x.silver ? 'silver ' + fmtG(x.silver) + ' g' : '',
    x.ct ? fmtCt(x.ct) + ' ct' : '', n(x.clients, 'new client', 'new clients'), n(x.meets, 'meeting', 'meetings'), n(x.paid, 'payment done', 'payments done')].filter(Boolean).join(' · ')];
  return {
    rows, tot, tiles, agg: () => ({}), groupKey: () => '', gcols: [],
    lines, amount: (x) => (x.gold ? fmtG(x.gold) + ' g' : x.silver ? fmtG(x.silver) + ' g' : ''), open: () => null,
    csvHead: ['Month', 'Orders', 'Pieces', 'Gold (g)', 'Silver (g)', 'Diamond ct', 'New clients', 'Meetings', 'Payments done'],
    csv: (x) => [repMonthLabel(x.k), x.orders, x.pcs, round3(x.gold), round3(x.silver), round3(x.ct), x.clients, x.meets, x.paid],
    pdfCols: [['Month', 0], ['Orders', 16, 'right'], ['Gold (g)', 22, 'right'], ['Silver (g)', 22, 'right'], ['Ct', 16, 'right'], ['Clients', 18, 'right'], ['Meetings', 20, 'right'], ['Paid', 16, 'right']],
    pdfRow: (x) => [repMonthLabel(x.k), String(x.orders), x.gold ? pG(x.gold) : '', x.silver ? pG(x.silver) : '', x.ct ? fmtCt(x.ct) : '', String(x.clients), String(x.meets), String(x.paid)],
  };
}

/* ---------------- payment status / payment dates ---------------- */
const PAY_SHOW = [['due', 'Payment due'], ['late', 'Overdue'], ['week', 'Due in the next 7 days'], ['done', 'Payment done'], ['none', 'No status yet'], ['all', 'Everyone']];
function payStatusBuild(D, f) {
  const t = todayStr(), wk = todayStr(7);
  let rows = (S.repParties || []).map((c) => {
    const e = D.idx.get(c.id) || null;
    const cur = e && e.cur;
    return {
      id: c.id, party: c.trade_name || '—', city: (c.city || '').trim(), mobile: (e && e.cl.mobile) || '',
      status: cur ? cur.status : '', dueOn: cur && cur.status === 'due' ? cur.on_date : '', paidOn: e && e.lastDone ? e.lastDone.on_date : '',
      late: cur && cur.status === 'due' && cur.on_date < t ? daysBetween(cur.on_date, t) : 0, note: (cur && cur.note) || '', cur,
    };
  });
  const show = f.pshow || 'due';
  rows = rows.filter((x) => (show === 'due' ? x.status === 'due' : show === 'late' ? x.status === 'due' && x.dueOn < t
    : show === 'week' ? x.status === 'due' && x.dueOn >= t && x.dueOn <= wk : show === 'done' ? x.status === 'done' : show === 'none' ? !x.status : true));
  if (f.city) rows = rows.filter((x) => x.city === f.city);
  if (f.party) rows = rows.filter((x) => x.id === f.party);
  rows.sort((a, b) => (a.status === 'due' && b.status === 'due' ? (a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : 0)
    : (a.status === 'due') !== (b.status === 'due') ? (a.status === 'due' ? -1 : 1) : a.party.localeCompare(b.party)));
  const statusText = (x) => (x.status === 'due' ? 'Payment due' : x.status === 'done' ? 'Payment done' : 'No status yet');
  const whenText = (x) => (x.status === 'due' ? payDueInfo(x.dueOn).text : x.status === 'done' ? 'Paid on ' + fmtD(x.cur.on_date) : '—');
  const agg = (list) => ({ n: list.length, due: list.filter((x) => x.status === 'due').length, late: list.filter((x) => x.late > 0).length, done: list.filter((x) => x.status === 'done').length });
  const tot = agg(rows);
  return {
    rows, tot, agg, tiles: [['Parties', String(tot.n)], ['Payment due', String(tot.due)], ['Overdue', String(tot.late)], ['Payment done', String(tot.done)]],
    groupKey: (x, k) => ({ status: x.status === 'due' ? (x.late ? 'Overdue' : 'Payment due') : statusText(x), city: x.city || '—' }[k]),
    gcols: [['Parties', (a) => String(a.n)], ['Due', (a) => String(a.due)], ['Overdue', (a) => String(a.late)], ['Done', (a) => String(a.done)]],
    lines: (x) => [x.party, [x.city, x.status === 'due' && payDueInfo(x.dueOn).cls !== 'soon' ? 'Due by ' + fmtD(x.dueOn) : '',
      x.status !== 'done' && x.paidOn ? 'last paid ' + fmtD(x.paidOn) : '', x.note].filter(Boolean).join(' · ')],
    amount: whenText, open: () => null, client: (x) => x.id,
    csvHead: ['Party', 'City', 'Status', 'Due by', 'Days overdue', 'Last paid on', 'Note', 'Updated by', 'Updated on'],
    csv: (x) => [x.party, x.city, statusText(x), x.dueOn, x.late || '', x.paidOn, x.note, x.cur ? nameOf(x.cur.created_by) : '', x.cur ? fmtExp(x.cur.created_at) : ''],
    pdfCols: [['Party', 0], ['City', 28], ['Status', 30], ['Due by / paid on', 32], ['Note', 40]],
    pdfRow: (x) => [x.party, x.city, x.status === 'due' && x.late ? 'Overdue ' + x.late + ' d' : statusText(x),
      x.status === 'due' ? pDate(x.dueOn) : x.status === 'done' ? pDate(x.cur.on_date) : '', x.note],
  };
}
function payHistBuild(D, f) {
  let rows = D.rows.map((r) => ({ r, party: (r.clients && r.clients.trade_name) || '—', city: (r.clients && r.clients.city) || '' }));
  if (f.kind) rows = rows.filter((x) => x.r.status === f.kind);
  if (f.party) rows = rows.filter((x) => x.r.client_id === f.party);
  if (f.city) rows = rows.filter((x) => x.city === f.city);
  if (f.exec) rows = rows.filter((x) => x.r.created_by === f.exec);
  const agg = (list) => ({ n: list.length, due: list.filter((x) => x.r.status === 'due').length, done: list.filter((x) => x.r.status === 'done').length });
  const tot = agg(rows);
  const kindText = (x) => (x.r.status === 'done' ? 'Payment done' : 'Payment due');
  return {
    rows, tot, agg, tiles: [['Entries', String(tot.n)], ['Due dates', String(tot.due)], ['Paid', String(tot.done)]],
    groupKey: (x, k) => ({ party: x.party, kind: kindText(x), month: repMonth(x.r.on_date), exec: nameOf(x.r.created_by) }[k]),
    gcols: [['Entries', (a) => String(a.n)], ['Due', (a) => String(a.due)], ['Paid', (a) => String(a.done)]],
    lines: (x) => [x.party, [x.city, x.r.note, nameOf(x.r.created_by)].filter(Boolean).join(' · ')],
    amount: (x) => payEntryText(x.r), open: () => null, client: (x) => x.r.client_id,
    csvHead: ['Date', 'Party', 'City', 'Entry', 'Note', 'Added by', 'Added on'],
    csv: (x) => [x.r.on_date, x.party, x.city, x.r.status === 'done' ? 'Paid on' : 'Due by', x.r.note, nameOf(x.r.created_by), fmtExp(x.r.created_at)],
    pdfCols: [['Date', 24], ['Party', 0], ['Entry', 26], ['Note', 46], ['Added by', 28]],
    pdfRow: (x) => [pDate(x.r.on_date), x.party, x.r.status === 'done' ? 'Paid on' : 'Due by', x.r.note || '', nameOf(x.r.created_by)],
  };
}

/* rows + columns + totals for the chosen report */
function repBuild(D) {
  const R = repState();
  const f = R.f;
  const T = R.type;
  if (T === 'summary') return monthSummaryBuild(D);
  if (T === 'pay') return payStatusBuild(D, f);
  if (T === 'payhist') return payHistBuild(D, f);
  if (T === 'items' || T === 'diamonds') {
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
    });
    const tot = agg(rows);
    const tiles = T === 'diamonds'
      ? [['Items', String(tot.n)], ['Carats', fmtCt(tot.ct)], ['Diamond pcs', String(Math.round(tot.dpcs))]]
      : [['Items', String(tot.n)], ['Pieces', String(tot.pcs)], tot.netG ? ['Gold net (g)', fmtG(tot.netG)] : null, tot.fineG ? ['Fine gold (g)', fmtG(tot.fineG)] : null,
        tot.netS ? ['Silver net (g)', fmtG(tot.netS)] : null, tot.ct ? ['Diamond ct', fmtCt(tot.ct)] : null].filter(Boolean);
    const gcols = T === 'diamonds' ? [['Items', (a) => String(a.n)], ['Carats', (a) => fmtCt(a.ct)], ['Pcs', (a) => String(Math.round(a.dpcs))]]
      : [['Items', (a) => String(a.n)], ['Pieces', (a) => String(a.pcs)], ['Net (g)', (a) => fmtG(a.netG + a.netS)], ['Ct', (a) => (a.ct ? fmtCt(a.ct) : '')]];
    return {
      rows, tot, tiles, agg, groupKey: g, gcols, sortBy: (a) => (T === 'diamonds' ? a.ct : a.netG + a.netS),
      lines: (x) => [fmtD(x.o.order_date) + ' · ' + ordNo(x.o.order_no) + ' · ' + x.party,
        [x.it.category, x.it.design_code, x.metal + (x.o.purity ? ' ' + (purityKey(x.o.purity) || '') : ''), x.it.metal_color ? colorLabel(x.metal, x.it.metal_color) : '',
          x.it.diamond_type ? diamondLabel(x.it.diamond_type) + (num(x.it.diamond_ct) ? ' ' + fmtCt(x.it.diamond_ct) + ' ct' : '') : '',
          x.it.diamond_cert_lab ? x.it.diamond_cert_lab : '', x.it.jewel_cert_type ? (x.it.jewel_cert_type.indexOf('HUID') > -1 ? 'HUID' : x.it.jewel_cert_type) : ''].filter(Boolean).join(' · ')],
      amount: (x) => (T === 'diamonds' ? fmtCt(x.it.diamond_ct) + ' ct' : x.net ? fmtG(x.net) + ' g' : ''), open: (x) => x.o.id,
      csvHead: ['Order date', 'Delivered on', 'Order no', 'Party', 'City', 'Order type', 'Status', 'Executive', 'Piece', 'Tag / design', 'Description', 'Qty', 'Metal', 'Purity',
        'Colour / finish', 'Gross wt (g)', 'Net wt (g)', 'Fine wt (g)', 'Diamonds / stones', 'Carats', 'Diamond pcs', 'Diamond quality', 'Diamond certificate',
        'Diamond cert no', 'Jewellery certificate', 'Jewellery cert / HUID no', 'Other stones'],
      csv: (x) => [x.o.order_date, x.o.delivered_on || '', ordNo(x.o.order_no), x.party, x.city, OTYPE_LABEL[x.o.order_type], OSTATUS_LABEL[x.o.status], nameOf(x.o.created_by),
        x.it.category, x.it.design_code, x.it.description, x.it.qty, x.metal, x.o.purity, x.it.metal_color, x.it.gross_wt, x.it.net_wt, round3(x.fine),
        diamondLabel(x.it.diamond_type), x.it.diamond_ct, x.it.diamond_pcs, x.it.diamond_quality,
        x.it.diamond_type ? (x.it.diamond_cert_lab || 'Not certified') : '', x.it.diamond_cert_no, x.it.jewel_cert_type || '', x.it.jewel_cert_no, x.it.stone_details],
      pdfCols: [['Date', 20], ['Order', 18], ['Party', 34], ['Item', 0], ['Net (g)', 18, 'right'], ['Ct', 14, 'right']],
      pdfRow: (x) => [fmtD(x.o.order_date), ordNo(x.o.order_no), x.party, [x.it.category, x.it.design_code, x.it.metal_color ? colorLabel(x.metal, x.it.metal_color) : '',
        x.it.diamond_type ? diamondLabel(x.it.diamond_type) + (x.it.diamond_cert_lab ? ' ' + x.it.diamond_cert_lab : '') : '',
        x.it.jewel_cert_type ? (x.it.jewel_cert_type.indexOf('HUID') > -1 ? 'HUID ' + (x.it.jewel_cert_no || '') : x.it.jewel_cert_type) : ''].filter(Boolean).join(', '),
        x.net ? pG(x.net) : '', num(x.it.diamond_ct) ? fmtCt(x.it.diamond_ct) : ''],
    };
  }
  if (T === 'orders') {
    const t = todayStr();
    const rows = D.orders.filter((o) => repOrderPass(o, f)).map((o) => {
      const c = orderCalc(o, o.order_items || []);
      return { o, net: c.net, pcs: c.pcs, ct: c.ct, fine: c.net * num(o.purity) / 100, party: (o.clients && o.clients.trade_name) || '', city: (o.clients && o.clients.city) || '',
        late: isOpenStatus(o.status) && o.due_date && o.due_date < t };
    });
    const agg = (list) => ({ n: list.length, netG: list.filter((x) => x.o.metal !== 'Silver').reduce((a, x) => a + x.net, 0), netS: list.filter((x) => x.o.metal === 'Silver').reduce((a, x) => a + x.net, 0),
      pcs: list.reduce((a, x) => a + x.pcs, 0), ct: list.reduce((a, x) => a + x.ct, 0), late: list.filter((x) => x.late).length, delivered: list.filter((x) => x.o.status === 'delivered').length });
    const tot = agg(rows);
    return {
      rows, tot, agg, sortBy: (a) => a.n,
      tiles: [['Orders', String(tot.n)], ['Delivered', String(tot.delivered)], ['Delivery late', String(tot.late)], tot.netG ? ['Gold net (g)', fmtG(tot.netG)] : null,
        tot.netS ? ['Silver net (g)', fmtG(tot.netS)] : null, tot.ct ? ['Diamond ct', fmtCt(tot.ct)] : null].filter(Boolean),
      groupKey: (x, k) => ({ party: x.party || '—', metal: x.o.metal || 'Gold', otype: OTYPE_LABEL[x.o.order_type] || '—', status: OSTATUS_LABEL[x.o.status] || x.o.status,
        exec: nameOf(x.o.created_by), city: x.city || '—', month: repMonth(x.o.order_date) }[k]),
      gcols: [['Orders', (a) => String(a.n)], ['Pieces', (a) => String(a.pcs)], ['Net (g)', (a) => fmtG(a.netG + a.netS)], ['Late', (a) => String(a.late)]],
      lines: (x) => [ordNo(x.o.order_no) + ' · ' + x.party, [fmtD(x.o.order_date), OTYPE_LABEL[x.o.order_type], OSTATUS_LABEL[x.o.status],
        x.o.status === 'delivered' && x.o.delivered_on ? 'Delivered ' + fmtD(x.o.delivered_on) : x.o.due_date ? 'Delivery by ' + fmtD(x.o.due_date) : '', x.late ? 'late' : ''].filter(Boolean).join(' · ')],
      amount: (x) => (x.net ? fmtG(x.net) + ' g' : ''), open: (x) => x.o.id,
      csvHead: ['Order no', 'Order date', 'Delivery by', 'Delivered on', 'Party', 'City', 'Type', 'Status', 'Metal', 'Purity', 'Pieces', 'Net wt (g)', 'Fine wt (g)', 'Diamond ct', 'Executive'],
      csv: (x) => [ordNo(x.o.order_no), x.o.order_date, x.o.due_date || '', x.o.delivered_on || '', x.party, x.city, OTYPE_LABEL[x.o.order_type], OSTATUS_LABEL[x.o.status], x.o.metal, x.o.purity,
        x.pcs, round3(x.net), round3(x.fine), round3(x.ct), nameOf(x.o.created_by)],
      pdfCols: [['Date', 20], ['Order', 18], ['Party', 0], ['Status', 24], ['Delivery by', 24], ['Net (g)', 20, 'right']],
      pdfRow: (x) => [fmtD(x.o.order_date), ordNo(x.o.order_no), x.party, OSTATUS_LABEL[x.o.status] || '', x.o.due_date ? fmtD(x.o.due_date) : '', x.net ? pG(x.net) : ''],
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
      netS: list.filter((c) => c.metal === 'Silver').reduce((a, c) => a + num(c.net_wt), 0), ct: list.reduce((a, c) => a + num(c.diamond_ct), 0) });
    const tot = agg(rows);
    return {
      rows, tot, agg, sortBy: (a) => a.n,
      tiles: [['Pieces', String(tot.n)], tot.netG ? ['Gold net (g)', fmtG(tot.netG)] : null, tot.netS ? ['Silver net (g)', fmtG(tot.netS)] : null,
        tot.ct ? ['Diamond ct', fmtCt(tot.ct)] : null].filter(Boolean),
      groupKey: (c, k) => ({ cat: c.category || '—', metal: c.metal || 'Gold', dtype: c.diamond_type ? diamondLabel(c.diamond_type) : 'No diamonds',
        color: c.metal_color ? colorLabel(c.metal, c.metal_color) : '—', status: CAT_STATUS_LABEL[c.status] || c.status }[k]),
      gcols: [['Pieces', (a) => String(a.n)], ['Gold (g)', (a) => (a.netG ? fmtG(a.netG) : '')], ['Silver (g)', (a) => (a.netS ? fmtG(a.netS) : '')], ['Ct', (a) => (a.ct ? fmtCt(a.ct) : '')]],
      lines: (c) => [(c.tag_no || '—') + (c.title ? ' · ' + c.title : ''), [c.category, (c.metal || 'Gold') + (c.purity ? ' ' + (purityKey(c.purity) || '') : ''),
        c.metal_color ? colorLabel(c.metal, c.metal_color) : '', c.diamond_type ? diamondLabel(c.diamond_type) + (num(c.diamond_ct) ? ' ' + fmtCt(c.diamond_ct) + ' ct' : '') : '',
        c.diamond_cert_lab || '', c.jewel_cert_type ? (c.jewel_cert_type.indexOf('HUID') > -1 ? 'HUID' : c.jewel_cert_type) : '', CAT_STATUS_LABEL[c.status] || ''].filter(Boolean).join(' · ')],
      amount: (c) => (num(c.net_wt) ? fmtG(c.net_wt) + ' g' : ''), open: () => null, cat: (c) => c.id,
      csvHead: ['Tag no', 'Design', 'Piece', 'Metal', 'Purity', 'Colour / finish', 'Gross wt (g)', 'Net wt (g)', 'Diamonds / stones', 'Carats', 'Diamond pcs', 'Diamond quality',
        'Diamond certificate', 'Diamond cert no', 'Jewellery certificate', 'Jewellery cert / HUID no', 'Other stones', 'Status'],
      csv: (c) => [c.tag_no, c.title, c.category, c.metal, c.purity, c.metal_color, c.gross_wt, c.net_wt, diamondLabel(c.diamond_type), c.diamond_ct, c.diamond_pcs, c.diamond_quality,
        c.diamond_type ? (c.diamond_cert_lab || 'Not certified') : '', c.diamond_cert_no, c.jewel_cert_type || '', c.jewel_cert_no, c.stone_details, CAT_STATUS_LABEL[c.status] || c.status],
      pdfCols: [['Tag', 22], ['Piece', 0], ['Metal', 22], ['Net (g)', 18, 'right'], ['Diamonds', 40], ['Status', 20]],
      pdfRow: (c) => [c.tag_no || '', [c.category, c.title].filter(Boolean).join(' - '), (c.metal || 'Gold') + (c.purity ? ' ' + (purityKey(c.purity) || '') : ''),
        num(c.net_wt) ? pG(c.net_wt) : '', c.diamond_type ? diamondLabel(c.diamond_type) + (num(c.diamond_ct) ? ' ' + fmtCt(c.diamond_ct) + ' ct' : '') : '', CAT_STATUS_LABEL[c.status] || ''],
    };
  }
  // karigars: metal with each karigar
  const by = new Map();
  D.ts.forEach((t) => { if (!by.has(t.karigar_id)) by.set(t.karigar_id, []); by.get(t.karigar_id).push(t); });
  let rows = D.ks.map((k) => ({ k, b: karigarBalances(by.get(k.id) || []) }));
  if (f.kshow === 'bal') rows = rows.filter((x) => Math.abs(x.b.gold) > 0.0005 || Math.abs(x.b.silver) > 0.0005);
  else if (f.kshow !== 'all') rows = rows.filter((x) => x.k.active);
  const agg = (list) => ({ n: list.length, gold: list.reduce((a, x) => a + x.b.gold, 0), silver: list.reduce((a, x) => a + x.b.silver, 0) });
  const tot = agg(rows);
  return {
    rows, tot, agg,
    tiles: [['Karigars', String(tot.n)], ['Gold with karigars (g)', fmtG(tot.gold)], tot.silver ? ['Silver with karigars (g)', fmtG(tot.silver)] : null].filter(Boolean),
    groupKey: () => '', gcols: [],
    lines: (x) => [x.k.name + (x.k.active ? '' : ' (off)'), ['issued ' + fmtG(x.b.issued) + ' g', 'received ' + fmtG(x.b.received) + ' g', x.b.wastage ? 'wastage ' + fmtG(x.b.wastage) + ' g' : '',
      x.b.hasSilver ? 'silver ' + fmtG(x.b.silver) + ' g fine' : ''].filter(Boolean).join(' · ')],
    amount: (x) => (Math.abs(x.b.gold) < 0.0005 ? 'Clear' : fmtG(x.b.gold) + ' g'), open: () => null, karigar: (x) => x.k.id,
    csvHead: ['Karigar', 'Phone', 'City', 'Speciality', 'Fine gold issued (g)', 'Fine gold received (g)', 'Gold wastage (g)', 'Gold with karigar (g)', 'Silver with karigar (g)'],
    csv: (x) => [x.k.name, x.k.phone, x.k.city, x.k.speciality, round3(x.b.issued), round3(x.b.received), round3(x.b.wastage), round3(x.b.gold), round3(x.b.silver)],
    pdfCols: [['Karigar', 0], ['Issued (g)', 26, 'right'], ['Received (g)', 26, 'right'], ['Wastage (g)', 26, 'right'], ['Gold with karigar (g)', 30, 'right'], ['Silver (g)', 24, 'right']],
    pdfRow: (x) => [x.k.name, pG(x.b.issued), pG(x.b.received), pG(x.b.wastage), pG(x.b.gold), x.b.hasSilver ? pG(x.b.silver) : ''],
  };
}

function repGroups(B) {
  const R = repState();
  if (!R.group) return null;
  const m = new Map();
  B.rows.forEach((x) => { const k = B.groupKey(x, R.group) || '—'; if (!m.has(k)) m.set(k, []); m.get(k).push(x); });
  const list = Array.from(m.entries()).map((e) => ({ k: e[0], a: B.agg(e[1]) }));
  if (R.group === 'month') {
    list.sort((a, b) => (a.k < b.k ? -1 : 1));
    list.forEach((g) => { g.k = repMonthLabel(g.k === '—' ? '' : g.k); });
  } else {
    const v = (a) => num(B.sortBy ? B.sortBy(a) : a.n);
    list.sort((a, b) => v(b.a) - v(a.a) || b.a.n - a.a.n);
  }
  return list;
}

/* ---------------- filters ---------------- */
function repFilterDefs() {
  const R = repState();
  const T = R.type;
  const team = Array.from((S.team || new Map()).values()).map((p) => [p.id, p.full_name || p.email || '—']);
  const metals = [['Gold', 'Gold'], ['Silver', 'Silver']];
  const colors = GOLD_COLORS.concat(SILVER_FINISHES).map((c) => [c, c]);
  const purities = ALL_PURITY.map((p) => [p[0], p[0]]);
  const dtypes = [['any', 'Any diamonds / stones'], ['none', 'No diamonds']].concat(DIAMOND_TYPES.map((t) => [t, diamondLabel(t)]));
  const cats = ITEM_CATS.map((c) => [c, c]);
  const dc = [['yes', 'Certified (any lab)'], ['no', 'Not certified']].concat(DIAMOND_LABS.map((l) => [l, l + ' certified']));
  const jc = [['yes', 'Certified (any)'], ['huid', 'BIS Hallmark (HUID)'], ['no', 'Not certified']];
  const otypes = [['job_work', 'Job work'], ['ready_stock', 'Ready stock'], ['custom', 'Custom order']];
  const party = (S.repParties || []).map((c) => [c.id, c.trade_name]);
  const cities = (S.repCities || []).map((c) => [c, c]);
  const d = [];
  const itemFilters = () => d.push(['purity', 'Purity', purities], ['color', 'Colour / finish', colors], ['cat', 'Piece type', cats],
    ['dtype', 'Diamonds / stones', dtypes], ['dcert', 'Diamond certificate', dc], ['jcert', 'Jewellery certificate', jc]);
  if (T === 'pay') { d.push(['pshow', 'Show', PAY_SHOW, true], ['city', 'City', cities], ['party', 'Party', party]); return d; }
  if (T === 'payhist') { d.push(['kind', 'Entry', [['due', 'Due dates'], ['done', 'Paid dates']]], ['party', 'Party', party], ['city', 'City', cities], ['exec', 'Added by', team]); return d; }
  if (T === 'summary') return d;
  if (T === 'karigars') { d.push(['kshow', 'Show', [['active', 'Working karigars'], ['bal', 'Only with metal'], ['all', 'Everyone']], true]); return d; }
  if (T === 'stock') {
    d.push(['cstatus', 'Status', [['available', 'In stock'], ['reserved', 'Reserved'], ['sold', 'Sold'], ['all', 'All']], true], ['metal', 'Metal', metals]);
    itemFilters();
    return d;
  }
  // items, orders, diamonds
  d.push(['party', 'Party', party], ['city', 'City', cities], ['status', 'Status', REP_STATUS, true], ['metal', 'Metal', metals],
    ['otype', 'Order type', otypes], ['exec', 'Executive (booked by)', team]);
  if (T === 'items' || T === 'diamonds') itemFilters();
  return d;
}
/* each report starts without filters, so nothing is hidden */
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
  const opt = (list, cur) => list.map((x) => '<option value="' + esc(x[0]) + '"' + (String(x[0]) === String(cur) ? ' selected' : '') + '>' + esc(x[1]) + '</option>').join('');
  const c = $('#content');
  c.innerHTML =
    '<div class="card rep-card"><div class="field" style="margin:0"><label>Report</label><select id="rep-type">' + opt(REP_TYPES, R.type) + '</select></div></div>' +
    (!REP_NO_PERIOD[R.type] ? '<div class="filter-chips">' + ACC_PERIODS.map((x) => '<button class="' + (R.p === x[0] ? 'on' : '') + '" data-action="rep-p" data-p="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>' : '') +
    (R.p === 'custom' && !REP_NO_PERIOD[R.type] ? '<div class="card" style="padding:10px 14px"><div class="o-2col"><div class="field" style="margin:0"><label>From</label><input type="date" id="rep-from" value="' + esc(R.from) + '"></div>' +
      '<div class="field" style="margin:0"><label>To</label><input type="date" id="rep-to" value="' + esc(R.to) + '"></div></div></div>' : '') +
    (defs.length || groups.length > 1 ?
      '<div class="card rep-card">' +
      '<div class="rep-bar">' + (defs.length ? '<button class="btn btn-small btn-secondary" data-action="rep-filters">' + (R.showFilters ? 'Hide filters' : 'Filters') + (active ? ' (' + active + ')' : '') + '</button>' : '') +
      (active ? '<button class="btn btn-small btn-ghost" data-action="rep-clear">Clear filters</button>' : '') +
      (groups.length > 1 ? '<select id="rep-group" aria-label="Group by">' + groups.map((g) => '<option value="' + g[0] + '"' + (g[0] === R.group ? ' selected' : '') + '>' + (g[0] ? 'Group: ' : '') + g[1] + '</option>').join('') + '</select>' : '') + '</div>' +
      (R.showFilters && defs.length ? '<div class="o-2col rep-filters">' +
        (R.type === 'items' || R.type === 'orders' || R.type === 'diamonds' ? '<div class="field"><label>Dates are</label><select id="rep-dateby"><option value="order"' + (R.dateBy !== 'delivered' ? ' selected' : '') + '>Order date</option><option value="delivered"' + (R.dateBy === 'delivered' ? ' selected' : '') + '>Delivery date</option></select></div>' : '') +
        defs.map((d) => '<div class="field"><label>' + esc(d[1]) + '</label><select data-rf="' + d[0] + '">' +
          (d[3] ? '' : '<option value="">All</option>') +
          d[2].map((o) => '<option value="' + esc(o[0]) + '"' + (String(R.f[d[0]] || (d[3] ? d[2][0][0] : '')) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select></div>').join('') +
        '</div>' : '') +
      '</div>' : '') +
    '<div id="rep-body">' + loadingHTML() + '</div>';
  ['#rep-from', '#rep-to'].forEach((sel) => { const el = $(sel); if (el) el.addEventListener('change', () => { R.from = $('#rep-from').value; R.to = $('#rep-to').value; renderReports(); }); });
  const ts = $('#rep-type');
  if (ts) ts.addEventListener('change', () => { R.type = ts.value; R.group = ''; S.repData = null; repPruneFilters(); renderReports(); });
  const gsel = $('#rep-group'); if (gsel) gsel.addEventListener('change', () => { R.group = gsel.value; drawReport(); });
  const db2 = $('#rep-dateby'); if (db2) db2.addEventListener('change', () => { R.dateBy = db2.value; renderReports(); });
  c.querySelectorAll('select[data-rf]').forEach((s) => s.addEventListener('change', () => { R.f[s.dataset.rf] = s.value; renderReports(); }));
  try { await repLoad(); } catch (e) {
    const b = $('#rep-body');
    if (b) b.innerHTML = '<div class="empty">' + esc(typeof payTableMissing === 'function' && payTableMissing(e) ? PAY_SETUP_NOTE : 'Could not load the report — try again.') + '</div>';
    return;
  }
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
  const G = repGroups(B);
  const groupLabel = ((REP_GROUPS[R.type] || []).find((g) => g[0] === R.group) || ['', ''])[1];
  box.innerHTML =
    '<div class="hint" style="margin:2px 2px 8px">' + esc(repPeriodText()) + '</div>' + tilesHTML + actions +
    (G ? '<div class="section-label">By ' + esc(groupLabel) + '</div><div class="card rep-gtable"><div class="rep-grow rep-ghead"><span>' + esc(groupLabel) + '</span>' +
      B.gcols.map((gc) => '<span>' + esc(gc[0]) + '</span>').join('') + '</div>' +
      G.map((g) => '<div class="rep-grow"><span>' + esc(g.k) + '</span>' + B.gcols.map((gc) => '<span>' + esc(gc[1](g.a)) + '</span>').join('') + '</div>').join('') + '</div>' : '') +
    '<div class="section-label">' + (B.rows.length ? 'Details (' + B.rows.length + ')' : 'Details') + '</div>' +
    (B.rows.length ? '<div class="card" style="padding:4px 14px">' + B.rows.slice(0, 300).map((x) => {
      const l = B.lines(x), oid = B.open(x), pid = B.client ? B.client(x) : null, cid = B.cat ? B.cat(x) : null, kid = B.karigar ? B.karigar(x) : null;
      const act = oid ? ' data-action="o-open" data-id="' + oid + '"' : pid ? ' data-action="open-client" data-id="' + pid + '"' : cid ? ' data-action="cat-open" data-id="' + cid + '"' : kid ? ' data-action="k-open" data-id="' + kid + '"' : '';
      return '<div class="acc-row' + (act ? ' tap' : '') + '"' + act + '><div class="acc-main"><b>' + esc(l[0]) + '</b><div class="o-item-meta">' + esc(l[1]) + '</div></div>' +
        '<div class="acc-amt">' + esc(B.amount(x)) + '</div></div>';
    }).join('') + '</div>' + (B.rows.length > 300 ? '<div class="hint" style="text-align:center">Showing the first 300 — Excel and PDF have all of them.</div>' : '')
      : '<div class="empty" style="padding:14px">Nothing matches these filters.</div>');
}

function repTitle() {
  const R = repState();
  return (REP_TYPES.find((t) => t[0] === R.type) || ['', 'Report'])[1];
}
function repFilterText() {
  const R = repState();
  return repActiveDefs().map((d) => {
    const o = d[2].find((x) => String(x[0]) === String(R.f[d[0]]));
    return d[1] + ': ' + (o ? o[1] : R.f[d[0]]);
  }).join(', ');
}
function repFileName(ext) {
  const R = repState();
  const r = S.repData.range;
  return safeFileName(repTitle() + ' ' + (REP_NO_PERIOD[R.type] ? todayStr() : (r[0] || 'all') + (r[1] ? ' to ' + r[1] : ''))) + ext;
}

function repCsv() {
  const B = S.repBuilt;
  if (!B) return;
  downloadFile(repFileName('.csv'), buildCsv(B.csvHead, B.rows.map(B.csv)));
}

async function buildReportPdf() {
  const B = S.repBuilt, R = repState();
  const meta = [['Period', REP_NO_PERIOD[R.type] ? 'As on ' + fmtD(todayStr()) : rangeLabel(S.repData.range)], ['Rows', String(B.rows.length)]];
  const d = await pdfStart(repTitle().toUpperCase(), meta);
  const ft = repFilterText();
  if (ft) pNote(d, 'FILTERS', ft);
  pTotals(d, B.tiles.map((t) => [t[0], t[1]]));
  const G = repGroups(B);
  if (G) {
    const gl = ((REP_GROUPS[R.type] || []).find((g) => g[0] === R.group) || ['', ''])[1];
    pHeading(d, 'By ' + gl);
    const cols = [{ h: gl, w: 0 }].concat(B.gcols.map((gc) => ({ h: gc[0], w: 26, a: 'right' })));
    cols[0].w = PG_W - PM * 2 - cols.reduce((a, x) => a + x.w, 0);
    d.table(cols, G.map((g) => [g.k].concat(B.gcols.map((gc) => gc[1](g.a)))), { zebra: true });
  }
  if (B.rows.length) {
    pHeading(d, 'Details');
    const cols = B.pdfCols.map((c) => ({ h: c[0], w: c[1], a: c[2] }));
    const free = cols.find((c) => !c.w);
    if (free) free.w = PG_W - PM * 2 - cols.reduce((a, x) => a + (x.w || 0), 0);
    d.table(cols, B.rows.slice(0, 3000).map(B.pdfRow), { zebra: true, size: 8 });
  }
  return { pdf: d, name: repFileName('.pdf'), text: repTitle() + ' — ' + bizName() };
}

onAct('rep-open', () => showSub('Reports', renderReports));
onAct('rep-go', (el) => { const R = repState(); R.type = el.dataset.type || 'pay'; R.group = ''; S.repData = null; repPruneFilters(); showSub('Reports', renderReports); });
onAct('rep-p', (el) => { const R = repState(); R.p = el.dataset.p; if (R.p === 'custom' && !R.from) { R.from = monthStart(); R.to = todayStr(); } renderReports(); });
onAct('rep-filters', () => { const R = repState(); R.showFilters = !R.showFilters; renderReports(); });
onAct('rep-clear', () => { const R = repState(); R.f = {}; renderReports(); });
onAct('rep-csv', () => repCsv());
onAct('rep-pdf', () => makeAndOfferPdf(buildReportPdf));
