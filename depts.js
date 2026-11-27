/* Departments (v31, v33): every part of the business as one square, with its own icon and colour, and one
   number on it (v33, one call: dept_numbers): Work, Sales, Accounts, Cash & Bank, Purchase, Marketing,
   Customer care, Design (CAD), Production, Karigar workshop, Quality & Hallmark, Dispatch, Stock, Team,
   HR / Staff, Reports, Settings.
   Tap one and you see only that department: a few of its numbers, then its screens.
   These are the app's own screens (the same buttons as in More and in the tabs). A department shows only
   what this person may use, and a department with nothing in it is not shown. The owner chooses which
   departments each person sees (Team members → Departments; database update 21). */
'use strict';

const DP_SVG = (p) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
/* the tab: a building of departments */
const DEPT_ICON = DP_SVG('<path d="M3 21h18"/><path d="M5 21V8l7-4.5L19 8v13"/><path d="M9.5 21v-4.5h5V21"/>' +
  '<path d="M9 10.5h.01M12 10.5h.01M15 10.5h.01M9 13.5h.01M12 13.5h.01M15 13.5h.01"/>');
const DEPTS = [
  { k: 'work', t: 'Work', s: 'Your to-do, and work you gave', c: '#be185d', bg: '#fce7f1',
    ic: DP_SVG('<rect x="4" y="3.5" width="16" height="17" rx="2.5"/><path d="M8 8.5l1.5 1.5L12.5 7"/><path d="M14.5 8.5H17"/><path d="M8 14l1.5 1.5 3-3"/><path d="M14.5 14H17"/>') },
  { k: 'sales', t: 'Sales', s: 'Selling to shops', c: '#7b1e3c', bg: '#f8e9ee',
    ic: DP_SVG('<path d="M5.5 8h13l-1.2 12.5H6.7L5.5 8z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>') },
  { k: 'accounts', t: 'Accounts', s: 'Money and gold: due and received', c: '#1f7a4d', bg: '#e5f4ec',
    ic: DP_SVG('<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8.5 7h7"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5h.01M8.5 18h.01M12 18h3.5"/>') },
  { k: 'cash', t: 'Cash & Bank', s: 'Cash book and bank accounts', c: '#4d7c0f', bg: '#eef5e2',
    ic: DP_SVG('<rect x="3" y="6.5" width="18" height="12.5" rx="2.5"/><path d="M3 10.5h18"/><path d="M15.5 14.8h2.5"/><path d="M6 6.5l9-3.3 1.6 3.3"/>') },
  { k: 'purchase', t: 'Purchase', s: 'Buying from suppliers, and paying them', c: '#7c4a1e', bg: '#f5ece3',
    ic: DP_SVG('<circle cx="9.5" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/><path d="M3 4h2.3l2.4 11.2h10.6l2.2-8.2H6.4"/>') },
  { k: 'marketing', t: 'Marketing', s: 'Finding shops and keeping in touch', c: '#1d5fa8', bg: '#e6eff9',
    ic: DP_SVG('<path d="M4 10.5v3a1 1 0 0 0 1 1h2.5l5.5 4.5V5L7.5 9.5H5a1 1 0 0 0-1 1z"/><path d="M16 9a4 4 0 0 1 0 6"/><path d="M18.5 6.5a7.5 7.5 0 0 1 0 11"/>') },
  { k: 'care', t: 'Customer care', s: 'Complaints, feedback, repairs', c: '#c026d3', bg: '#f9e7fb',
    ic: DP_SVG('<path d="M4 14v-1.5a8 8 0 0 1 16 0V14"/><rect x="3" y="13.5" width="4" height="6" rx="1.5"/><rect x="17" y="13.5" width="4" height="6" rx="1.5"/><path d="M19 19.5c0 1.2-2 2-4.5 2H13"/>') },
  { k: 'design', t: 'Design (CAD)', s: 'CAD for orders, and new designs', c: '#0891b2', bg: '#e0f3f8',
    ic: DP_SVG('<circle cx="12" cy="4.8" r="1.9"/><path d="M11 6.6L5.5 20"/><path d="M13 6.6L18.5 20"/><path d="M7.6 15h8.8"/>') },
  { k: 'production', t: 'Production', s: 'Making the orders, step by step', c: '#a4540b', bg: '#fbeedf',
    ic: DP_SVG('<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>') },
  { k: 'karigar', t: 'Karigar workshop', s: 'Metal with karigars, who makes what', c: '#ca8a04', bg: '#fcf4d9',
    ic: DP_SVG('<path d="M13.5 5.5l5 5"/><path d="M4.5 19.5l8.2-8.2"/><path d="M12 4l3.5-1.6 6 6L19.9 12z"/><path d="M3 21h7"/>') },
  { k: 'quality', t: 'Quality & Hallmark', s: 'Checks before a piece goes out, HUID', c: '#e11d48', bg: '#fde8ed',
    ic: DP_SVG('<path d="M12 3l7 3v5.2c0 4.4-3 8.3-7 9.8-4-1.5-7-5.4-7-9.8V6l7-3z"/><path d="M8.8 12.1l2.2 2.2 4.3-4.5"/>') },
  { k: 'dispatch', t: 'Dispatch', s: 'Ready to send, and sent', c: '#ea580c', bg: '#fdede3',
    ic: DP_SVG('<path d="M2.5 6.5h11.5v10H2.5z"/><path d="M14 10h4l3.5 3.8v2.7H14"/><circle cx="6.5" cy="18" r="1.8"/><circle cx="17.5" cy="18" r="1.8"/>') },
  { k: 'stock', t: 'Stock', s: 'Your pieces and designs', c: '#6a3d9e', bg: '#f0e8f8',
    ic: DP_SVG('<path d="M6.5 4h11L21 9l-9 11L3 9l3.5-5z"/><path d="M3 9h18"/><path d="M12 20L8.5 9l3.5-5 3.5 5L12 20"/>') },
  { k: 'team', t: 'Team', s: 'Your people and their work', c: '#0f766e', bg: '#e1f3f1',
    ic: DP_SVG('<path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20"/><circle cx="10" cy="8" r="3.5"/><path d="M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35"/><path d="M15.5 4.65a3.5 3.5 0 0 1 0 6.7"/>') },
  { k: 'hr', t: 'HR / Staff', s: 'Attendance, leave, salary', c: '#9333ea', bg: '#f3e8fd',
    ic: DP_SVG('<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="11" r="2.2"/><path d="M5.6 16.6a3.6 3.6 0 0 1 6.8 0"/><path d="M14.5 10h4M14.5 13.5h4"/>') },
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
  const T = (cond, a, i, t, s, tab, d) => { if (cond) out.push({ a, i, t, s, tab, d }); };
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
  const register = () => T(gold && own, 'ge-open', '⚖️', 'Gold register', 'Where all the fine gold is — raw, with karigars, in stock, with shops');
  const board = () => {
    if (!fn('renderBoard')) return;
    if (boardIsTab()) T(true, 'tab', '🗂️', 'Production board', 'Every open order under its step · one tap to move it on', 'board');
    else T(true, 'bd-open', '🗂️', 'Production board', 'Every open order under its step · one tap to move it on');
  };
  const repairs = () => T(on('repairsOn'), 'rp-list', '🔧', 'Repairs', 'Pieces shops send back — resize, polish, repair');
  const scan = () => T(on('qrScanOn'), 'qr-scan', '📷', 'Scan QR', 'A job card or a tag');
  const activity = () => T(own && !!S.dbv21 && fn('renderActivity'), 'ac-open', '🕘', 'Activity', 'Who did what, and when');

  if (k === 'work') {   // update 20
    const w = on('workOn');
    T(w, 'wo-give', '➕', 'Give work', 'To one person, a few, or everyone — with files and a voice note');
    T(w, 'wo-list', '📝', 'My work', 'Work given to me — start it, finish it', null, { who: 'me' });
    T(w, 'wo-list', '📤', 'Work I gave', 'Who started, who finished — accept or send back', null, { who: 'by' });
    T(w && own, 'wo-list', '👥', 'Everyone\'s work', 'All the work in the team', null, { who: 'all' });
    T(w && own, 'wo-report', '📊', 'Work report', 'For each person: done, on time, late, time taken');
  } else if (k === 'sales') {
    T(bills, 'bl-new', '➕', 'Bill from stock', 'A sale bill or a quotation for a shop');
    billList(); toCollect(); appr(); links(); rate();
    T(on('x22'), 'bk-list', '🔒', 'Gold rate bookings', 'A shop books today\'s rate for gold it buys later');
    T(on('x22'), 'mo-list', '🎉', 'Offers on making', 'Festival offers — % off making, on the bill in one tap');
    closing(); tgt();
  } else if (k === 'accounts') {
    toCollect(); billList(); cash(); closing(); rate();
    register();
    T(on('x22'), 'og-new', '🪙', 'Old gold from a shop', 'Tested purity and melting loss — on the shop\'s account');
    T(on('x22'), 'op-list', '📒', 'Old dues of shops', 'What each shop owed before the app');
    profit(); T(own && on('x22'), 'pnl-open', '📊', 'Profit & loss', 'Each month: the margin on the bills less what was spent');
    gst(); value(); dues(); expenses(); backup();
  } else if (k === 'cash') {   // update 21
    const m = on('moneyOn');
    T(m, 'cb-open', '💵', 'Cash & Bank', 'Each account\'s balance · today\'s money in and out');
    T(m, 'cb-in', '➕', 'Money in', 'Cash or bank — not a shop\'s payment on a bill');
    T(m, 'cb-out', '➖', 'Money out', 'Rent, salary, suppliers, petrol, tea…');
    T(m, 'cb-move', '⇄', 'Move money', 'Cash into the bank, or out of it');
    T(m, 'cb-day', '📒', 'Day book', 'Every rupee in and out, day by day');
    T(m, 'cb-accs', '🏦', 'Accounts', 'Your bank accounts and their opening balance');
    if (m) { cash(); expenses(); }
  } else if (k === 'purchase') {   // update 21
    const p = on('purchaseOn');
    T(p, 'pu-new', '➕', 'New purchase', 'Gold, diamonds, stones, findings — with the bill photo');
    T(p, 'pu-list', '🛒', 'Purchases', 'What you bought, month by month');
    T(p, 'pu-dues', '💳', 'What you owe', 'Each supplier: bought, paid, to pay');
    if (p) { T(fn('renderVendors') && appOn('vendors'), 'v-list', '🏭', 'Suppliers', 'Their details'); register(); }
  } else if (k === 'marketing') {
    T(true, 'tab', '👥', 'Clients', 'Every shop — its meetings, orders and dues', 'find');
    T(true, 'scan-start', '📷', 'Scan a visiting card', 'A new shop from its card');
    T(true, 'manual-start', '✍️', 'Add a client', 'Type in the details');
    T(on('campaignsOn'), 'camp-open-list', '📣', 'Messages to shops', 'New designs or an offer to many shops on WhatsApp');
    T(on('designOn'), 'dr-open', '📥', 'Designs from shops', 'Photos of designs shops want made · the link for any shop');
    T(on('festOn'), 'fest-open-list', '🪔', 'Festival calendar', 'Selling days and days to send wishes');
    T(on('eventsOn'), 'ev-list', '🎪', 'Exhibitions', 'Visitors and meetings at a trade show, kept together');
    bag(); links(); week();
  } else if (k === 'care') {   // update 21 (repairs: before it too)
    const c = on('careOn');
    T(c, 'cs-list', '🙋', 'Complaints', 'A shop\'s complaint, followed till it is solved');
    T(c, 'cs-new', '➕', 'New complaint', 'With photos — give it as work in one tap');
    T(c && fn('renderOrders'), 'cs-fb', '⭐', 'Feedback', 'Stars from shops · ask for stars');
    repairs();
  } else if (k === 'design') {
    T(fn('renderCadDesk') && fn('renderOrders'), 'cad-desk', '📐', 'CAD desk', 'CAD to make, waiting for the shop, changes asked');
    T(on('designOn'), 'dr-open', '📥', 'Designs from shops', 'Photos of designs shops want made · the link for any shop');
    T(cat, 'cat-new', '🎨', 'Add a design', 'A design for the catalogue');
    T(cat, 'tab', '💎', 'Catalogue', 'Every design and piece', 'catalogue');
    board();
  } else if (k === 'production') {
    T(fn('renderOrders'), 'tab', '📋', 'Orders', 'Every order and the step it is at', 'orders');
    T(fn('renderOrders'), 'o-tab-new', '➕', 'New order', 'For a shop — its pieces, photos and due date');
    board();
    T(fn('renderKarigars') && appOn('karigars'), 'k-list', '🔨', 'Karigars', 'Metal given and received back');
    T(fn('renderVendors') && appOn('vendors'), 'v-list', '🏭', 'Vendors', 'Who makes your orders · diamonds to give them');
    workload();
    repairs();
    dues();
    scan();
  } else if (k === 'karigar') {
    T(fn('renderKarigars') && appOn('karigars'), 'k-list', '🔨', 'Karigars', 'Metal given and received back · labour');
    workload();
    board();
    scan();
    repairs();
  } else if (k === 'quality') {   // update 21
    T(on('qualityOn'), 'qc-open', '✅', 'Quality check', 'Before a piece goes out — passed, or back for rework');
    T(!!S.dbv21 && fn('renderHallmark'), 'hm-open', '🔖', 'Hallmarking', 'Pieces at the centre · the HUID of each');
    T(on('qualityOn'), 'hm-new', '➕', 'Send for hallmarking', 'Choose the pieces you send');
  } else if (k === 'dispatch') {
    T(fn('renderDispatchDesk') && fn('renderOrders'), 'ds-desk', '🚚', 'Ready to send', 'Orders ready, and what went this week');
    appr(); repairs(); scan();
  } else if (k === 'stock') {
    T(cat, 'tab', '💎', 'Stock', 'Every piece, its tag and photo', 'catalogue');
    T(cat && tags, 'st-new', '➕', 'Add stock', 'A new piece from its tag');
    T(cat && tags, 'st-find', '🔎', 'Find a piece', 'By its tag or design number');
    T(cat, 'cat-new', '🎨', 'Add a design', 'A design for the catalogue');
    T(st19, 'sc-list', '🔍', 'Stock check', 'Scan every tag in the safe — see what is missing');
    T(on('x22'), 'pl-open', '📍', 'Places', 'Safe, showroom, with a salesman — what is where');
    T(on('x22'), 'pl-move', '📦', 'Move pieces', 'Scan the tags — they go to another place');
    oldStock();
    T(cat && fn('catStickers'), 'dp-stickers', '🏷️', 'QR stickers', 'Print QR stickers for the pieces in stock');
    appr(); links(); value(); bag();
  } else if (k === 'team') {   // the owner's: the people
    T(own, 'dp-team', '👥', 'Team members', 'Add a person, reset a password, switch off');
    T(own && on('dayOn'), 'td-open', '🗺️', 'Team today', 'Who started, where they met shops, the route on the map');
    if (own) { expenses(); cash(); }
    tgt(); week(); activity();
  } else if (k === 'hr') {   // update 21: everyone asks for leave; HR does the rest
    const h = on('hrOn');
    T(h, 'hr-staff', '👥', 'Staff', 'Everyone who works for you — salary, papers');
    T(h, 'hr-att', '🗓️', 'Attendance', 'One tap a person a day');
    T(!!S.dbv21 && fn('renderLeaves'), 'hr-leave', '🌴', h ? 'Leave' : 'My leave', h ? 'Asked and coming up — approve or not' : 'Ask for leave, see the answer');
    T(h, 'hr-salary', '💰', 'Salary', 'Each month: cut for absent days, advances, pay');
    T(!!S.dbv21 && fn('renderMyAttendance'), 'hr-me', '📅', 'My attendance', 'Your days, month by month');
  } else if (k === 'reports') {
    T(own && fn('renderReport'), 'tab', '📊', 'Report', 'This month at a glance', 'report');
    T(own && fn('renderReports'), 'rep-open', '🗃️', 'Reports', 'Orders, items, diamonds, delivery — filter and download');
    T(own && on('x22') && fn('renderYY'), 'yy-open', '📈', 'This year and last year', 'Sales, orders, meetings, new clients — month by month, charts');
    week(); profit(); T(own && on('x22'), 'pnl-open', '📊', 'Profit & loss', 'Each month: the margin on the bills less what was spent');
    closing(); oldStock(); gst(); workload(); activity();
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
function deptShown(k) { return k === 'hr' || typeof hasDept !== 'function' || hasDept(k); }
function renderDepts() {
  setHeader('Departments', false);
  const list = DEPTS.filter((d) => deptShown(d.k) && dpTools(d.k).length);
  $('#content').innerHTML = '<div class="dp-grid">' + list.map((d) =>
    '<button class="dp-card" data-action="dp-open" data-k="' + d.k + '" style="--dc:' + d.c + ';--dt:' + d.bg + '">' +
    '<span class="dp-ic">' + d.ic + '</span><b>' + esc(d.t) + '</b><span class="dp-s">' + esc(d.s) + '</span><span class="dp-key" data-k="' + d.k + '" hidden></span></button>').join('') + '</div>';
  dpFit();
  dpKeys();
}
/* ₹ in short: ₹ 950 · ₹ 45.6 K · ₹ 12.4 L · ₹ 1.2 Cr */
function rsShort(r) {
  const a = Math.abs(r), neg = r < 0 ? '− ' : '';
  const f = (x, u) => (Math.round(x * 10) / 10).toLocaleString('en-IN') + ' ' + u;
  return neg + '₹ ' + (a >= 1e7 ? f(a / 1e7, 'Cr') : a >= 1e5 ? f(a / 1e5, 'L') : a >= 1e3 ? f(a / 1e3, 'K') : Math.round(a).toLocaleString('en-IN'));
}
/* the one number on each square: [number, words, red] (update 21: dept_numbers) */
function dpKey(k, n) {
  const v = (x) => (x == null ? null : x);
  switch (k) {
    case 'work': return n.work_late ? [n.work_late, 'late', 1] : [n.work, 'to do'];
    case 'sales': return [rsShort(+n.sales || 0), 'sold today'];
    case 'accounts': return v(n.accounts) == null ? null : [rsShort(+n.accounts), 'to collect'];
    case 'cash': return v(n.cash) == null ? null : [rsShort(+n.cash), 'cash', +n.cash < 0];
    case 'purchase': return v(n.purchase) == null ? null : [rsShort(+n.purchase), 'to pay'];
    case 'marketing': return [n.marketing, 'meetings today'];
    case 'care': return [n.care, 'open', n.care > 0];
    case 'design': return n.design_change ? [n.design_change, n.design_change === 1 ? 'change asked' : 'changes asked', 1] : [n.design, 'to make'];
    case 'production': return n.production_late ? [n.production_late, 'late', 1] : [n.production, 'open'];
    case 'karigar': { const g = +n.karigar || 0; return [Math.abs(g) >= 1000 ? (Math.round(g / 10) / 100).toLocaleString('en-IN') + ' kg' : (Math.round(g * 10) / 10).toLocaleString('en-IN') + ' g', 'with karigars']; }
    case 'quality': return n.quality || !n.hallmark ? [n.quality, 'to check'] : [n.hallmark, 'at hallmarking'];
    case 'dispatch': return [n.dispatch, 'ready'];
    case 'stock': return [n.stock, 'in stock'];
    case 'team': return v(n.team) == null ? null : [n.team, 'started today'];
    case 'hr': return typeof hasDept === 'function' && hasDept('hr') ? (n.hr_asked ? [n.hr_asked, 'leave asked', 1] : [n.hr_leave, 'on leave today']) : n.hr_asked ? [n.hr_asked, 'waiting for HR'] : null;
    case 'reports': return [n.reports, 'orders this month'];
    default: return null;
  }
}
async function dpKeys() {
  if (!S.dbv21) return;
  let r;
  try { r = await db.rpc('dept_numbers'); } catch (e) { return; }
  if (!r || r.error || !r.data) return;
  document.querySelectorAll('.dp-key[data-k]').forEach((el) => {
    const x = dpKey(el.dataset.k, r.data);
    if (!x || x[0] == null) return;
    el.innerHTML = '<span class="noi18n">' + esc(String(x[0])) + '</span> ' + esc(x[1]);
    el.classList.toggle('warn', !!x[2]);
    el.hidden = false;
  });
}
/* on a computer every square fits on the screen: the number across and the size that makes the squares biggest
   (as wide as the page when there are few; a phone: two across, and the page scrolls) */
function dpFit() {
  const g = $('.dp-grid');
  if (!g) return;
  if (!window.matchMedia || !window.matchMedia('(min-width: 1024px)').matches) { g.style.gridTemplateColumns = ''; g.style.justifyContent = ''; g.style.removeProperty('--dp-size'); g.classList.remove('dp-roomy'); return; }
  const n = g.children.length, gap = 20;
  const W = g.clientWidth, Hh = window.innerHeight - (g.getBoundingClientRect().top + window.scrollY) - 28;
  if (!n || W <= 0) return;
  const opts = [];
  for (let cols = Math.min(3, n); cols <= Math.max(3, n); cols++) {
    const rows = Math.ceil(n / cols), sw = (W - gap * (cols - 1)) / cols, sh = (Hh - gap * (rows - 1)) / rows;
    const size = Math.min(sw, sh);
    opts.push({ cols, size, wide: sw <= sh, fill: Math.min(1, (cols * size + gap * (cols - 1)) / W) });
  }
  const top = Math.max.apply(null, opts.map((o) => o.size));
  // nearly as big (within 8 %) but filling the width better: that one looks tidier
  const best = opts.filter((o) => o.size >= top * 0.92).sort((a, b2) => b2.fill - a.fill || b2.size - a.size)[0];
  const size = Math.max(140, Math.floor(best.size));
  g.style.gridTemplateColumns = best.wide ? 'repeat(' + best.cols + ', minmax(0, 1fr))' : 'repeat(' + best.cols + ', ' + size + 'px)';
  g.style.justifyContent = best.wide ? '' : 'center';   // the screen not filled side to side (many squares): in the middle
  g.style.setProperty('--dp-size', size + 'px');
  g.classList.toggle('dp-roomy', size >= 250);   // big squares: the number and the few words both fit
}
window.addEventListener('resize', () => { clearTimeout(S.dpFitT); S.dpFitT = setTimeout(dpFit, 120); });

/* one department: its numbers, then its screens */
function renderDept(k) {
  const d = DEPTS.find((x) => x.k === k);
  if (!d || !deptShown(k)) { renderDepts(); return; }
  const tools = dpTools(k);
  $('#content').innerHTML = '<div class="dp-page" data-k="' + k + '" style="--dc:' + d.c + ';--dt:' + d.bg + '">' +
    '<div class="dp-hero"><span class="dp-ic">' + d.ic + '</span><div><h2>' + esc(d.t) + '</h2><p>' + esc(d.s) + '</p></div></div>' +
    '<div id="dp-nums"></div>' +
    '<div class="dp-tools">' + tools.map((x) => '<button class="dp-tool" data-action="' + x.a + '"' + (x.tab ? ' data-tab="' + x.tab + '"' : '') +
      Object.keys(x.d || {}).map((n) => ' data-' + n + '="' + esc(x.d[n]) + '"').join('') + '>' +
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
  if (k === 'work' && on('workOn')) {
    const [mine, check] = await Promise.all([
      rows(db.from('tasks').select('status, due_at').eq('given_to', S.me.id).in('status', ['todo', 'started']).limit(2000)),
      count(db.from('tasks').select('id', { count: 'exact', head: true }).eq('given_by', S.me.id).eq('status', 'done')),
    ]);
    if (mine) {
      put(mine.filter((t) => t.status === 'todo').length, 'To do');
      put(mine.filter((t) => t.status === 'started').length, 'Started');
      put(mine.filter((t) => t.due_at && new Date(t.due_at).getTime() < Date.now()).length, 'Late', true);
    }
    put(check, 'To check');
  } else if (k === 'sales' && on('billsOn')) {
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
  } else if (k === 'cash' && on('moneyOn')) {   // update 21
    const bal = await rows(db.rpc('money_balances', { p_on: today }));
    if (bal) {
      const cash = bal.filter((a) => a.kind === 'cash').reduce((s, a) => s + P(a.balance), 0), bank = bal.filter((a) => a.kind === 'bank');
      put(rs(cash), 'Cash', cash < 0);
      if (bank.length) put(rs(bank.reduce((s, a) => s + P(a.balance), 0)), 'In the bank');
    }
  } else if (k === 'purchase' && on('purchaseOn')) {
    const [dues, month] = await Promise.all([rows(db.rpc('supplier_dues')), rows(db.from('purchases').select('amount, gst_amt, kind').gte('bill_date', monthStart()).limit(5000))]);
    if (dues) put(rs(dues.reduce((s, x) => s + Math.max(0, P(x.due)), 0)), 'You owe suppliers');
    if (month) put(rs(month.filter((x) => x.kind !== 'opening').reduce((s, x) => s + P(x.amount) + P(x.gst_amt), 0)), 'Bought this month');
  } else if (k === 'care' && on('careOn')) {
    const [open, fb, rep] = await Promise.all([
      count(db.from('care_cases').select('id', { count: 'exact', head: true }).eq('status', 'open')),
      rows(db.from('orders').select('feedback_stars').not('feedback_stars', 'is', null).gte('feedback_at', new Date(Date.now() - 90 * 86400000).toISOString()).limit(2000)),
      on('repairsOn') ? count(db.from('repairs').select('id', { count: 'exact', head: true }).eq('status', 'ready')) : none,
    ]);
    put(open, 'Open complaints', true);
    if (fb && fb.length) put((Math.round(fb.reduce((s, o) => s + o.feedback_stars, 0) / fb.length * 10) / 10) + ' ★', 'Average stars');
    put(rep, 'Repairs ready');
  } else if (k === 'design' && typeof OPEN_STATUSES !== 'undefined') {
    const st = (q) => q.in('status', ['new', 'cad']);
    const [make, wait, change] = await Promise.all([
      count(db.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'new').is('cad_state', null)),
      count(st(db.from('orders').select('id', { count: 'exact', head: true })).eq('cad_state', 'sent')),
      count(st(db.from('orders').select('id', { count: 'exact', head: true })).eq('cad_state', 'change')),
    ]);
    put(make, 'CAD to make');
    put(wait, 'Waiting for the shop');
    put(change, 'Changes asked', true);
  } else if (k === 'karigar' && typeof OPEN_STATUSES !== 'undefined') {
    const [tx, making, late] = await Promise.all([
      rows(db.from('karigar_txns').select('kind, metal, fine_g').in('kind', ['issue', 'receive', 'wastage']).limit(20000)),
      count(db.from('orders').select('id', { count: 'exact', head: true }).in('status', ['wax', 'in_production', 'setting'])),
      count(db.from('orders').select('id', { count: 'exact', head: true }).in('status', ['new', 'cad', 'wax', 'in_production', 'setting']).lt('karigar_due', today).is('karigar_ready_at', null)),
    ]);
    if (tx) put(grams(tx.filter((t) => (t.metal || 'Gold') === 'Gold').reduce((s, t) => s + (t.kind === 'issue' ? num(t.fine_g) : -num(t.fine_g)), 0)), 'Gold with karigars');
    put(making, 'Being made');
    put(late, 'Late with karigars', true);
  } else if (k === 'quality' && S.dbv21) {
    const [fin, checks, jobs] = await Promise.all([
      rows(db.from('orders').select('id').eq('status', 'finished').limit(2000)),
      rows(db.from('qc_checks').select('order_id, result, checked_at').not('order_id', 'is', null).order('checked_at', { ascending: false }).limit(5000)),
      rows(db.from('hallmark_jobs').select('items').is('back_on', null).limit(500)),
    ]);
    if (fin && checks) {
      const last = new Map();
      checks.forEach((q) => { if (!last.has(q.order_id)) last.set(q.order_id, q.result); });
      put(fin.filter((o) => last.get(o.id) !== 'pass').length, 'To check');
      put(fin.filter((o) => last.get(o.id) === 'rework').length, 'Back for rework', true);
    }
    if (jobs) put(jobs.reduce((s, j) => s + (j.items || []).length, 0), 'At hallmarking');
  } else if (k === 'dispatch' && typeof OPEN_STATUSES !== 'undefined') {
    const wk = new Date(Date.now() - 7 * 86400000);
    const [ready, sent] = await Promise.all([
      count(db.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'ready')),
      count(db.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'delivered').gte('delivered_on', ymd(wk))),
    ]);
    put(ready, 'Ready to send');
    put(sent, 'Sent this week');
  } else if (k === 'hr' && S.dbv21) {
    if (on('hrOn')) {
      const [att, lv, asked] = await Promise.all([
        rows(db.from('attendance').select('status').eq('day', today).limit(2000)),
        count(db.from('leaves').select('id', { count: 'exact', head: true }).eq('status', 'approved').lte('from_day', today).gte('to_day', today)),
        count(db.from('leaves').select('id', { count: 'exact', head: true }).eq('status', 'asked')),
      ]);
      if (att) put(att.filter((a) => a.status === 'present' || a.status === 'half').length, 'Present today');
      put(lv, 'On leave today');
      put(asked, 'Leave asked', true);
    } else {
      const mine = await rows(db.from('attendance').select('status').gte('day', monthStart()).limit(40));
      if (mine) { put(mine.filter((a) => a.status === 'present').length, 'Present this month'); put(mine.filter((a) => a.status === 'absent').length, 'Absent this month'); }
    }
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
