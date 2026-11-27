/* Departments (v31): every part of the business as one square, with its own icon and colour:
   Sales, Accounts, Marketing, Production, Stock, Team, Reports, Settings.
   Tap one and you see only that department: a few of its numbers, then its screens.
   These are the app's own screens (the same buttons as in More and in the tabs). A department shows only
   what this person may use, and a department with nothing in it is not shown. */
'use strict';

const DP_SVG = (p) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
/* the tab: a building of departments */
const DEPT_ICON = DP_SVG('<path d="M3 21h18"/><path d="M5 21V8l7-4.5L19 8v13"/><path d="M9.5 21v-4.5h5V21"/>' +
  '<path d="M9 10.5h.01M12 10.5h.01M15 10.5h.01M9 13.5h.01M12 13.5h.01M15 13.5h.01"/>');
const DEPTS = [
  { k: 'sales', t: 'Sales', s: 'Selling to shops', c: '#7b1e3c', bg: '#f8e9ee',
    ic: DP_SVG('<path d="M5.5 8h13l-1.2 12.5H6.7L5.5 8z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>') },
  { k: 'accounts', t: 'Accounts', s: 'Money and gold: due and received', c: '#1f7a4d', bg: '#e5f4ec',
    ic: DP_SVG('<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8.5 7h7"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5h.01M8.5 18h.01M12 18h3.5"/>') },
  { k: 'marketing', t: 'Marketing', s: 'Finding shops and keeping in touch', c: '#1d5fa8', bg: '#e6eff9',
    ic: DP_SVG('<path d="M4 10.5v3a1 1 0 0 0 1 1h2.5l5.5 4.5V5L7.5 9.5H5a1 1 0 0 0-1 1z"/><path d="M16 9a4 4 0 0 1 0 6"/><path d="M18.5 6.5a7.5 7.5 0 0 1 0 11"/>') },
  { k: 'production', t: 'Production', s: 'Making the orders, step by step', c: '#a4540b', bg: '#fbeedf',
    ic: DP_SVG('<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>') },
  { k: 'stock', t: 'Stock', s: 'Your pieces and designs', c: '#6a3d9e', bg: '#f0e8f8',
    ic: DP_SVG('<path d="M6.5 4h11L21 9l-9 11L3 9l3.5-5z"/><path d="M3 9h18"/><path d="M12 20L8.5 9l3.5-5 3.5 5L12 20"/>') },
  { k: 'team', t: 'Team', s: 'Your people and their work', c: '#0f766e', bg: '#e1f3f1',
    ic: DP_SVG('<path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20"/><circle cx="10" cy="8" r="3.5"/><path d="M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35"/><path d="M15.5 4.65a3.5 3.5 0 0 1 0 6.7"/>') },
  { k: 'reports', t: 'Reports', s: 'How the business is doing', c: '#3b49b0', bg: '#e9ebf9',
    ic: DP_SVG('<path d="M4 20h16"/><path d="M7 16.5V11"/><path d="M12 16.5V6"/><path d="M17 16.5v-4"/>') },
  { k: 'settings', t: 'Settings', s: 'The app, the way you want it', c: '#55555f', bg: '#eeeef1',
    ic: DP_SVG('<path d="M5 21v-6M5 11V3M12 21v-9M12 8V3M19 21v-4M19 13V3"/><path d="M2.5 15h5M9.5 8h5M16.5 17h5"/>') },
];

/* the screens of a department that this person may use */
function dpTools(k) {
  const own = isOwner();
  const fn = (f) => typeof window[f] === 'function';
  const on = (f) => fn(f) && !!window[f]();
  const bills = on('billsOn'), gold = on('goldOn'), st19 = on('stock19On'), tags = on('tagsOn');
  const cat = fn('renderCatalogue') && appOn('catalogue');
  const pay = fn('renderPayDues') && appOn('payments');
  const targets = own && fn('renderTargetsSection') && appOn('targets');
  const out = [];
  const T = (cond, a, i, t, s, tab) => { if (cond) out.push({ a, i, t, s, tab }); };
  const toCollect = () => T(bills, 'dues-bills', '🪙', 'To collect', 'Money and raw gold each shop still owes for its bills');
  const billList = () => T(bills, 'bl-list', '🧾', 'Ready-stock bills', 'Sale bills and quotations for pieces from your stock');
  const closing = () => T(gold && own, 'cl-open', '🌙', 'Today\'s closing', 'Sales, money and gold received, pieces given and back — any day');
  const rate = () => T(gold && own, 'gr-set', '🏷️', 'Today\'s gold rate', 'The rate new bills start from');
  const cash = () => T(gold, 'cash-open', '💵', own ? 'Cash handover' : 'Cash with me', own ? 'Cash the team collected, and what each person handed over' : 'Cash you collected and handed over');
  const expenses = () => T(on('expOn'), 'ex-open', '💸', own ? 'Expense claims' : 'My expenses', own ? 'Approve what the team spent · mark paid' : 'What you spent, with the bill — the owner approves');
  const profit = () => T(gold && own, 'pf-open', '📈', 'Profit', 'The margin on each bill — by month and by shop');
  const gst = () => T(gold && own, 'ax-open', '📑', 'GST and Tally', 'GST sales register for GSTR-1, and Tally files for the accountant');
  const value = () => T(gold && own, 'sv-open', '💰', 'Stock value', 'The stock at today\'s gold rate, diamonds at cost — PDF');
  const dues = () => T(pay, 'dues-open', '⏰', 'Payment dues', 'Which party has to pay and by when · reminders');
  const appr = () => T(on('approvalsOn'), 'ap-list', '💎', 'Pieces on approval', 'Given to shops to show their customers · sold or returned');
  const links = () => T(on('stockOn'), 'sl-list', '📦', 'Ready-stock links', 'Pieces chosen for one shop — it taps what it wants');
  const oldStock = () => T(st19, 'old-stock', '⏳', 'Old stock', 'Pieces lying 3 and 6 months and more; what sells fast');
  const week = () => T(own && fn('renderWeek'), 'wk-open', '📅', 'The week', 'Meetings, new clients, orders — this week and the weeks before');
  const workload = () => T(fn('renderWorkload'), 'wl-open', '⚖️', 'Workload', 'Who has how many orders');
  const bag = () => T(on('bagOn'), 'bag-open', '👜', 'Sample bag', 'Catalogue pieces you carry to shops');
  const lock = () => T(fn('renderLock'), 'lk-open', '🔒', 'App lock', S.dbv17 ? 'A PIN or fingerprint on this phone · sign out a lost phone' : 'A PIN or fingerprint on this phone');
  const backup = () => T(own, 'export-data', '⬇️', 'Export all data', 'Excel-ready files of everything');
  const tgt = () => T(targets, 'dp-targets', '🎯', 'Targets', 'Meetings, new clients, orders and sales for each person, each month');

  if (k === 'sales') {
    T(bills, 'bl-new', '➕', 'Bill from stock', 'A sale bill or a quotation for a shop');
    billList(); toCollect(); appr(); links(); rate(); closing(); tgt();
  } else if (k === 'accounts') {
    toCollect(); billList(); cash(); closing(); rate();
    T(gold && own, 'ge-open', '⚖️', 'Gold register', 'Where all the fine gold is — raw, with karigars, in stock, with shops');
    profit(); gst(); value(); dues(); expenses(); backup();
  } else if (k === 'marketing') {
    T(true, 'tab', '👥', 'Clients', 'Every shop — its meetings, orders and dues', 'find');
    T(true, 'scan-start', '📷', 'Scan a visiting card', 'A new shop from its card');
    T(true, 'manual-start', '✍️', 'Add a client', 'Type in the details');
    T(on('campaignsOn'), 'camp-open-list', '📣', 'Messages to shops', 'New designs or an offer to many shops on WhatsApp');
    T(on('designOn'), 'dr-open', '📥', 'Designs from shops', 'Photos of designs shops want made · the link for any shop');
    T(on('festOn'), 'fest-open-list', '🪔', 'Festival calendar', 'Selling days and days to send wishes');
    T(on('eventsOn'), 'ev-list', '🎪', 'Exhibitions', 'Visitors and meetings at a trade show, kept together');
    bag(); links(); week();
  } else if (k === 'production') {
    T(fn('renderOrders'), 'tab', '📋', 'Orders', 'Every order and the step it is at', 'orders');
    T(fn('renderOrders'), 'o-tab-new', '➕', 'New order', 'For a shop — its pieces, photos and due date');
    if (fn('renderBoard')) {
      if (boardIsTab()) T(true, 'tab', '🗂️', 'Production board', 'Every open order under its step · one tap to move it on', 'board');
      else T(true, 'bd-open', '🗂️', 'Production board', 'Every open order under its step · one tap to move it on');
    }
    T(fn('renderKarigars') && appOn('karigars'), 'k-list', '🔨', 'Karigars', 'Metal given and received back');
    T(fn('renderVendors') && appOn('vendors'), 'v-list', '🏭', 'Vendors', 'Who makes your orders · diamonds to give them');
    workload();
    T(on('repairsOn'), 'rp-list', '🔧', 'Repairs', 'Pieces shops send back — resize, polish, repair');
    dues();
    T(on('qrScanOn'), 'qr-scan', '📷', 'Scan QR', 'A job card or a tag');
  } else if (k === 'stock') {
    T(cat, 'tab', '💎', 'Stock', 'Every piece, its tag and photo', 'catalogue');
    T(cat && tags, 'st-new', '➕', 'Add stock', 'A new piece from its tag');
    T(cat && tags, 'st-find', '🔎', 'Find a piece', 'By its tag or design number');
    T(cat, 'cat-new', '🎨', 'Add a design', 'A design for the catalogue');
    T(st19, 'sc-list', '🔍', 'Stock check', 'Scan every tag in the safe — see what is missing');
    oldStock();
    T(cat && fn('catStickers'), 'dp-stickers', '🏷️', 'QR stickers', 'Print QR stickers for the pieces in stock');
    appr(); links(); value(); bag();
  } else if (k === 'team') {   // the owner's: the people
    T(own, 'dp-team', '👥', 'Team members', 'Add a person, reset a password, switch off');
    T(own && on('dayOn'), 'td-open', '🗺️', 'Team today', 'Who started, where they met shops, the route on the map');
    if (own) { expenses(); cash(); }
    tgt(); week();
  } else if (k === 'reports') {
    T(own && fn('renderReport'), 'tab', '📊', 'Report', 'This month at a glance', 'report');
    T(own && fn('renderReports'), 'rep-open', '🗃️', 'Reports', 'Orders, items, diamonds, delivery — filter and download');
    week(); profit(); closing(); oldStock(); gst(); workload();
  } else if (k === 'settings') {
    T(own && fn('renderBizForm'), 'biz-open', '🏢', 'Business details', 'Address, GSTIN — printed on PDFs');
    T(own && fn('renderAppSettings'), 'opt-open', '⚙️', 'App settings', 'Order steps in use · show or hide sections');
    T(fn('renderLangPicker'), 'lang-open', '🌐', 'Language / भाषा / ભાષા', 'English, हिन्दी, ગુજરાતી');
    T(fn('renderAlerts') && !!S.dbv9, 'al-open', '📳', 'Phone alerts', 'When your orders move · your day every morning');
    lock(); backup();
    T(on('binOn'), 'bin-open', '🗑️', 'Deleted clients', 'Bring back a client deleted in the last 30 days');
    T(true, 'tab', '⋯', 'More', own ? 'Card scanning, backup, signing out' : 'Signing out', 'more');
  }
  return out;
}

/* the departments: one square each, over the whole screen */
function renderDepts() {
  setHeader('Departments', false);
  const list = DEPTS.filter((d) => dpTools(d.k).length);
  $('#content').innerHTML = '<div class="dp-grid">' + list.map((d) =>
    '<button class="dp-card" data-action="dp-open" data-k="' + d.k + '" style="--dc:' + d.c + ';--dt:' + d.bg + '">' +
    '<span class="dp-ic">' + d.ic + '</span><b>' + esc(d.t) + '</b><span class="dp-s">' + esc(d.s) + '</span></button>').join('') + '</div>';
}

/* one department: its numbers, then its screens */
function renderDept(k) {
  const d = DEPTS.find((x) => x.k === k);
  if (!d) { renderDepts(); return; }
  const tools = dpTools(k);
  $('#content').innerHTML = '<div class="dp-page" data-k="' + k + '" style="--dc:' + d.c + ';--dt:' + d.bg + '">' +
    '<div class="dp-hero"><span class="dp-ic">' + d.ic + '</span><div><h2>' + esc(d.t) + '</h2><p>' + esc(d.s) + '</p></div></div>' +
    '<div id="dp-nums"></div>' +
    '<div class="dp-tools">' + tools.map((x) => '<button class="dp-tool" data-action="' + x.a + '"' + (x.tab ? ' data-tab="' + x.tab + '"' : '') + '>' +
      '<span class="dp-ti">' + x.i + '</span><b>' + esc(x.t) + '</b><span class="dp-ts">' + esc(x.s) + '</span></button>').join('') + '</div>' +
    (tools.length ? '' : '<div class="empty">Nothing here yet.</div>') + '</div>';
  const tok = (S.dpTok = (S.dpTok || 0) + 1);
  dpNumbers(k).then((nums) => {
    const el = $('#dp-nums');
    if (!el || S.dpTok !== tok || !nums.length) return;
    el.innerHTML = '<div class="dp-nums">' + nums.map((n) => '<div' + (n[2] ? ' class="dp-warn"' : '') + '><b>' + esc(n[0]) + '</b><span>' + esc(n[1]) + '</span></div>').join('') + '</div>';
  }).catch(() => {});
}

/* a few numbers for a department: only what the database has (an older database gives fewer numbers) */
async function dpNumbers(k) {
  const own = isOwner(), today = todayStr();
  const on = (f) => typeof window[f] === 'function' && !!window[f]();
  const count = async (q) => { try { const r = await q; return r.error ? null : (r.count == null ? null : r.count); } catch (e) { return null; } };
  const rows = async (q) => { try { const r = await q; return r.error ? null : r.data || []; } catch (e) { return null; } };
  const rs = (p) => '₹ ' + Math.round(p / 100).toLocaleString('en-IN');
  const P = (x) => Math.round(num(x) * 100);
  const out = [];
  const put = (v, label, warn) => { if (v !== null && v !== undefined) out.push([String(v), label, !!(warn && v)]); };
  const none = Promise.resolve(null);
  if (k === 'sales' && on('billsOn')) {
    const [month, quotes] = await Promise.all([
      rows(db.from('bills').select('bill_date, total_amt').eq('kind', 'sale').eq('status', 'open').gte('bill_date', monthStart()).limit(20000)),
      count(db.from('bills').select('id', { count: 'exact', head: true }).eq('kind', 'quote').eq('status', 'open')),
    ]);
    if (month) {
      put(rs(month.filter((b) => b.bill_date === today).reduce((s, b) => s + P(b.total_amt), 0)), 'Sold today');
      put(rs(month.reduce((s, b) => s + P(b.total_amt), 0)), 'Sold this month');
    }
    put(quotes, 'Quotations open');
  } else if (k === 'sales' && on('approvalsOn')) {   // an older database: no bills yet
    put(await count(db.from('approval_items').select('id', { count: 'exact', head: true }).eq('status', 'out')), 'On approval');
  } else if (k === 'accounts' && on('billsOn')) {
    const [dues, got] = await Promise.all([
      rows(db.rpc('party_dues')),
      rows(db.from('receipts').select('amount').eq('kind', 'money').eq('received_on', today).limit(5000)),
    ]);
    if (dues) {
      put(rs(dues.reduce((s, x) => s + Math.max(0, P(x.money_due)), 0)), 'To collect');
      const mg = dues.reduce((s, x) => s + Math.max(0, Math.round(num(x.gold_due) * 1000)), 0);
      if (mg) put(grams(mg / 1000), 'Gold to collect');
    }
    if (got) put(rs(got.reduce((s, r) => s + P(r.amount), 0)), 'Received today');
  } else if (k === 'marketing') {
    const [met, clients, designs] = await Promise.all([
      count(db.from('interactions').select('id', { count: 'exact', head: true }).gte('happened_at', dayStartISO(today))),
      count(db.from('clients').select('id', { count: 'exact', head: true })),
      on('designOn') ? count(db.from('design_requests').select('id', { count: 'exact', head: true }).eq('status', 'new')) : none,
    ]);
    put(met, 'Meetings today');
    put(clients, 'Clients');
    put(designs, 'New designs');
  } else if (k === 'production' && typeof OPEN_STATUSES !== 'undefined') {
    const [open, late, ready] = await Promise.all([
      count(db.from('orders').select('id', { count: 'exact', head: true }).in('status', OPEN_STATUSES)),
      count(db.from('orders').select('id', { count: 'exact', head: true }).in('status', OPEN_STATUSES).lt('due_date', today)),
      on('repairsOn') ? count(db.from('repairs').select('id', { count: 'exact', head: true }).eq('status', 'ready')) : none,
    ]);
    put(open, 'Open orders');
    put(late, 'Late', true);
    put(ready, 'Repairs ready');
  } else if (k === 'stock' && on('tagsOn')) {
    const st = (s) => count(db.from('catalogue_items').select('id', { count: 'exact', head: true }).eq('status', s));
    const [inStock, appr, res] = await Promise.all([st('available'), st('approval'), st('reserved')]);
    put(inStock, 'In stock');
    put(appr, 'On approval');
    put(res, 'Reserved');
  } else if (k === 'team' && own) {
    const [team, started, waiting] = await Promise.all([
      count(db.from('profiles').select('id', { count: 'exact', head: true }).eq('active', true)),
      on('dayOn') ? count(db.from('work_days').select('id', { count: 'exact', head: true }).eq('day', today)) : none,
      on('expOn') ? count(db.from('expenses').select('id', { count: 'exact', head: true }).eq('status', 'claimed')) : none,
    ]);
    put(team, 'In the team');
    put(started, 'Started today');
    put(waiting, 'Expenses waiting');
  } else if (k === 'reports' && own) {
    const ms = monthStart(), from = dayStartISO(ms);
    const [met, added, ords] = await Promise.all([
      count(db.from('interactions').select('id', { count: 'exact', head: true }).gte('happened_at', from)),
      count(db.from('clients').select('id', { count: 'exact', head: true }).gte('created_at', from)),
      rows(db.from('orders').select('status').gte('order_date', ms).limit(20000)),
    ]);
    put(met, 'Meetings this month');
    put(added, 'New clients this month');
    if (ords) put(ords.filter((o) => o.status !== 'quote' && CLOSED_STATUSES.indexOf(o.status) < 0).length, 'Orders this month');
  }
  return out;
}

onAct('dp-open', (el) => {
  const d = DEPTS.find((x) => x.k === el.dataset.k);
  if (d) showSub(d.t, () => renderDept(d.k));
});
/* QR stickers for every piece in stock (on the Stock tab: for the pieces shown there) */
onAct('dp-stickers', () => catStickers(null, true));
/* the owner's team, as a screen of its own (the same list as in More) */
onAct('dp-team', () => showSub('Team members', () => {
  $('#content').innerHTML = '<div class="card" id="team-card"><div class="empty" style="padding:8px">Loading…</div></div>' +
    '<button class="btn btn-secondary" data-action="team-add">＋ Add team member</button>';
  renderTeamList();
}));
/* everyone's targets, as a screen of its own (the same as in Report) */
onAct('dp-targets', () => showSub('Targets', () => {
  $('#content').innerHTML = '<div id="report-targets"></div>';
  renderTargetsSection($('#report-targets'));
}));
