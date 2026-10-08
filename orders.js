/* ============================================================
   ORDERS add-on — job work, ready stock and custom orders.
   Every order starts as a quotation: Approved → it becomes an order
   and moves through its stages (CAD done, Wax, In production,
   Diamond setting, Finished, Delivered); Not approved → declined.
   Vendor who makes it, diamonds to give the vendor (vendors.js),
   client gold and karigar sections. No prices or payments here —
   a party's payment status (due / done) is on the party's page.
   Loaded before app.js. Uses app.js helpers ($, db, S, esc,
   toast, showSub, openModal …) only at call time.
   ============================================================ */
'use strict';

const OTYPE_LABEL = { job_work: 'Job work', ready_stock: 'Ready stock', custom: 'Custom order' };
const OTYPE_KEY = { 'Job work': 'job_work', 'Ready stock': 'ready_stock', 'Custom order': 'custom' };
const OSTATUS_LABEL = { quote: 'Quotation', declined: 'Not approved', new: 'Approved', cad: 'CAD done', wax: 'Wax', in_production: 'In production',
  setting: 'Diamond setting', finished: 'Finished', ready: 'Ready', delivered: 'Delivered', cancelled: 'Cancelled' };
/* the stages an approved order moves through (tap any one on the order page) */
const ORDER_STAGES = ['cad', 'wax', 'in_production', 'setting', 'finished', 'delivered'];
const OPEN_STATUSES = ['new', 'cad', 'wax', 'in_production', 'setting', 'finished', 'ready'];   // approved, not delivered yet
const CLOSED_STATUSES = ['declined', 'cancelled'];
const PURITY = [['24K', 99.5], ['22K', 91.6], ['18K', 75], ['14K', 58.5], ['9K', 37.5]];
const SILVER_PURITY = [['999', 99.9], ['925', 92.5]];
const ALL_PURITY = PURITY.concat(SILVER_PURITY);
const ITEM_CATS = ['Necklace', 'Choker', 'Long haar', 'Earrings', 'Jhumka', 'Bangles', 'Kada', 'Ring', 'Pendant set',
  'Maang tikka', 'Bracelet', 'Nath', 'Other'];
const ORD_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3.5h8.5L18.5 7.5v13H6z" stroke-linejoin="round"/><path d="M14 3.5v4.5h4.5" stroke-linejoin="round"/><path d="M9 12h6.5M9 15.5h6.5M9 19h3.5" stroke-linecap="round"/></svg>';

/* ---------------- helpers ---------------- */
function ordNo(n) { return 'ORD-' + String(n || 0).padStart(4, '0'); }
function num(v) {
  const x = parseFloat(String(v == null ? '' : v).replace(/,/g, '').trim());
  return isFinite(x) ? x : 0;
}
function numOrNull(v) {
  const s = String(v == null ? '' : v).replace(/,/g, '').trim();
  if (!s) return null;
  const x = parseFloat(s);
  return isFinite(x) ? x : null;
}
function round2(x) { return Math.round(x * 100) / 100; }
function grams(n) { return (Math.round(num(n) * 1000) / 1000).toLocaleString('en-IN', { maximumFractionDigits: 3 }) + ' g'; }
function carats(n) { return (Math.round(num(n) * 100) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 }) + ' ct'; }
function purityKey(p) {
  if (p == null || p === '') return null;
  const f = ALL_PURITY.find((x) => Math.abs(x[1] - num(p)) < 0.01);
  return f ? f[0] : null;
}
function purityVal(key) {
  const f = ALL_PURITY.find((x) => x[0] === key);
  return f ? f[1] : null;
}
function purityLabel(p) {
  if (p == null) return '';
  const k = purityKey(p);
  return k ? k + ' (' + num(p) + ')' : num(p) + '%';
}
function purityOptions(metal) { return (metal === 'Silver' ? SILVER_PURITY : PURITY).map((p) => p[0]); }
function defaultPurity(metal) { return metal === 'Silver' ? '925' : '22K'; }
function chipStatus(s) {
  return '<span class="chip chip-st-' + esc(s) + '">' + esc(OSTATUS_LABEL[s] || s) + '</span>';
}
function chipOType(t) {
  return '<span class="chip chip-otype">' + esc(OTYPE_LABEL[t] || t) + '</span>';
}
function isOpenStatus(s) { return OPEN_STATUSES.indexOf(s) !== -1; }
function isLive(o) { return o.status !== 'quote' && CLOSED_STATUSES.indexOf(o.status) === -1; }
function dueHTML(o) {
  if (!o.due_date || !isOpenStatus(o.status)) return o.due_date ? 'Due ' + esc(fmtD(o.due_date)) : '';
  const late = o.due_date < todayStr();
  return '<span class="' + (late ? 'o-late' : '') + '">' + (late ? '' : 'Due ') + esc(dueLabel(o.due_date)) + '</span>';
}

/* ---------------- weights ---------------- */
function orderCalc(o, items) {
  let net = 0, gross = 0, pcs = 0, ct = 0;
  (items || []).forEach((it) => {
    net += num(it.net_wt); gross += num(it.gross_wt); ct += it.diamond_type ? num(it.diamond_ct) : 0;
    pcs += Math.max(0, parseInt(it.qty, 10) || 0);
  });
  return { net, gross, pcs, ct };
}

/* Job work: client's fine gold in vs fine gold used (incl. wastage). */
function jwLedger(o, net) {
  if (o.order_type !== 'job_work' || numOrNull(o.client_metal_g) == null) return null;
  const inFine = num(o.client_metal_g) * num(o.client_metal_purity) / 100;
  const usedFine = net * num(o.purity) / 100 * (1 + num(o.wastage_pct) / 100);
  return { inFine, usedFine, bal: inFine - usedFine };
}
function jwLedgerHTML(led) {
  if (!led) return '';
  const b = led.bal;
  const msg = Math.abs(b) < 0.0005 ? 'Settled — no gold due either way.'
    : b > 0 ? 'Client\'s gold left with us: <b>' + grams(b) + ' fine</b> (return or adjust).'
      : 'Client owes us: <b>' + grams(-b) + ' fine gold</b>.';
  return '<div class="o-ledger">' +
    '<div class="o-lrow"><span>Fine gold received</span><b>' + grams(led.inFine) + '</b></div>' +
    '<div class="o-lrow"><span>Fine gold used (incl. wastage)</span><b>' + grams(led.usedFine) + '</b></div>' +
    '<div class="o-lnote ' + (b < -0.0005 ? 'neg' : '') + '">' + msg + '</div></div>';
}
function karigarHTML(o) {
  if (!o.karigar_name && numOrNull(o.karigar_issued_g) == null) return '';
  const issued = num(o.karigar_issued_g), recd = num(o.karigar_received_g);
  const pending = numOrNull(o.karigar_received_g) == null;
  return '<div class="o-ledger">' +
    (o.karigar_name ? '<div class="o-lrow"><span>Karigar</span><b>' + (o.karigar_id ? '<a href="#" data-action="k-open" data-id="' + o.karigar_id + '">' + esc(o.karigar_name) + ' ›</a>' : esc(o.karigar_name)) + '</b></div>' : '') +
    '<div class="o-lrow"><span>' + (o.metal === 'Silver' ? 'Silver issued' : 'Gold issued') + (o.karigar_issued_on ? ' · ' + esc(fmtD(o.karigar_issued_on)) : '') + '</span><b>' + grams(issued) + '</b></div>' +
    (pending ? '<div class="o-lnote">Still with the karigar — nothing received yet.</div>' :
      '<div class="o-lrow"><span>Received back' + (o.karigar_received_on ? ' · ' + esc(fmtD(o.karigar_received_on)) : '') + '</span><b>' + grams(recd) + '</b></div>' +
      '<div class="o-lnote ' + (issued - recd > 0.0005 ? 'neg' : '') + '">Difference (loss / wastage): <b>' + grams(issued - recd) + '</b></div>') +
    '</div>';
}

/* ---------------- catalogue status follows the order ---------------- */
function catStatusFor(orderStatus) {
  return orderStatus === 'quote' ? null : CLOSED_STATUSES.indexOf(orderStatus) > -1 ? 'available' : orderStatus === 'delivered' ? 'sold' : 'reserved';
}
const HOLDING_STATUSES = OPEN_STATUSES.concat(['delivered']);   // orders that hold their catalogue pieces

/* make pieces available again — unless another open or delivered order still has them */
async function releaseCatalogue(ids, orderId) {
  if (!ids || !ids.length) return;
  const { data } = await db.from('order_items').select('catalogue_id, orders!inner(id, status)')
    .in('catalogue_id', ids).in('orders.status', HOLDING_STATUSES);
  const held = new Set((data || []).filter((r) => r.orders && r.orders.id !== orderId).map((r) => r.catalogue_id));
  const free = ids.filter((x) => !held.has(x));
  if (free.length) await db.from('catalogue_items').update({ status: 'available' }).in('id', free);
}
async function syncCatalogueStatus(orderStatus, ids, removedIds, orderId) {
  if (HOLDING_STATUSES.indexOf(orderStatus) > -1 && removedIds && removedIds.length) await releaseCatalogue(removedIds, orderId);
  const st = catStatusFor(orderStatus);
  if (!st || !ids || !ids.length) return;
  if (st === 'available') await releaseCatalogue(ids, orderId);
  else await db.from('catalogue_items').update({ status: st }).in('id', ids);
}
async function syncCatalogueForOrder(orderId, orderStatus) {
  const { data } = await db.from('order_items').select('catalogue_id').eq('order_id', orderId);
  const ids = (data || []).map((x) => x.catalogue_id).filter(Boolean);
  if (ids.length) await syncCatalogueStatus(orderStatus, ids, [], orderId);
}

/* ---------------- karigar account entries that come from an order ----------------
   metal issued and received back (an older labour entry is left as it is) */
async function syncOrderKarigarTxns(orderId, o, label) {
  const { data: old } = await db.from('karigar_txns').select('id, kind').eq('order_id', orderId).eq('auto', true).in('kind', ['issue', 'receive']);
  const have = {};
  const extra = [];
  (old || []).forEach((t) => { if (!have[t.kind]) have[t.kind] = t.id; else extra.push(t.id); });
  if (extra.length) await db.from('karigar_txns').delete().in('id', extra);
  const pur = o.purity != null ? o.purity : 100;
  const metal = o.metal === 'Silver' ? 'Silver' : 'Gold';
  const want = {};
  if (o.karigar_id && o.karigar_issued_g != null) want.issue = { txn_date: o.karigar_issued_on || o.order_date, weight_g: o.karigar_issued_g, purity: pur, amount: null, metal };
  if (o.karigar_id && o.karigar_received_g != null) want.receive = { txn_date: o.karigar_received_on || o.order_date, weight_g: o.karigar_received_g, purity: pur, amount: null, metal };
  for (const kind of ['issue', 'receive']) {
    const row = want[kind] ? Object.assign({ karigar_id: o.karigar_id, note: label }, want[kind]) : null;
    if (have[kind] && row) await db.from('karigar_txns').update(row).eq('id', have[kind]);
    else if (have[kind] && !row) await db.from('karigar_txns').delete().eq('id', have[kind]);
    else if (!have[kind] && row) {
      await db.from('karigar_txns').insert(Object.assign({ kind, order_id: orderId, auto: true, created_by: S.me.id }, row));
    }
  }
}

/* ============================================================
   ORDERS TAB — list
   ============================================================ */
async function renderOrders() {
  setHeader('Orders', false);
  S.olist = S.olist || { status: 'open', type: 'all', q: '' };
  const L = S.olist;
  const chip = (grp, v, label) => '<button class="' + (L[grp] === v ? 'on' : '') + '" data-action="o-filter" data-g="' + grp + '" data-v="' + v + '">' + label + '</button>';
  $('#content').innerHTML =
    '<div class="action-row o-top-row" style="margin-bottom:12px">' +
    '<button class="btn btn-primary" data-action="o-tab-new">＋ New order</button>' +
    (typeof renderVendors === 'function' ? '<button class="btn btn-secondary" data-action="v-list">Vendors</button>' : '') +
    '<button class="btn btn-secondary" data-action="dues-open">Payment dues</button>' +
    '</div>' +
    '<div class="search-box"><input type="text" id="o-search" placeholder="Search client or order no…" autocomplete="off" value="' + esc(L.q) + '"></div>' +
    '<div class="filter-chips">' + chip('status', 'open', 'Open') + chip('status', 'quote', 'Quotations') + chip('status', 'finished', 'Finished') +
    chip('status', 'delivered', 'Delivered') + chip('status', 'closed', 'Not approved') + chip('status', 'all', 'All') + '</div>' +
    '<div class="filter-chips">' + chip('type', 'all', 'All types') + chip('type', 'job_work', 'Job work') + chip('type', 'ready_stock', 'Ready stock') +
    chip('type', 'custom', 'Custom') + '</div>' +
    '<div id="o-list"><div class="empty">Loading…</div></div>';
  const inp = $('#o-search');
  inp.addEventListener('input', () => {
    clearTimeout(S.searchTimer);
    S.searchTimer = setTimeout(() => { L.q = inp.value; loadOrderList(); }, 300);
  });
  loadOrderList();
}

async function loadOrderList() {
  const box = $('#o-list');
  if (!box) return;
  const L = S.olist;
  let q = db.from('orders').select('id, order_no, order_type, status, order_date, due_date' + (S.dbv6 ? ', vendor_id' : '') + ', clients!inner(trade_name, city)');
  if (L.status === 'open') q = q.in('status', OPEN_STATUSES);
  else if (L.status === 'finished') q = q.in('status', ['finished', 'ready']);
  else if (L.status === 'closed') q = q.in('status', CLOSED_STATUSES);
  else if (L.status !== 'all') q = q.eq('status', L.status);
  if (L.type !== 'all') q = q.eq('order_type', L.type);
  const s = String(L.q || '').trim();
  const m = s.match(/^(ord-?)?0*(\d+)$/i);
  if (m) q = q.eq('order_no', parseInt(m[2], 10));
  else if (s) q = q.ilike('clients.trade_name', '%' + s.replace(/[%,()]/g, ' ') + '%');
  if (L.status === 'open') q = q.order('due_date', { ascending: true, nullsFirst: false }).order('order_no', { ascending: true });
  else q = q.order('order_date', { ascending: false }).order('order_no', { ascending: false });
  const { data, error } = await q.limit(300);
  if (!$('#o-list')) return;
  if (error) { box.innerHTML = '<div class="empty">Could not load orders.<br>If you just installed an add-on, check its database step was run.</div>'; return; }
  const rows = data || [];
  if (!rows.length) {
    box.innerHTML = '<div class="empty"><div class="big">📦</div>' + (s ? 'No order matches "' + esc(s) + '".' : 'No orders here yet.<br>Tap “New order”, or open a client and add one there.') + '</div>';
    return;
  }
  const quotesOnly = L.status === 'quote';
  const t = todayStr();
  const late = rows.filter((o) => isOpenStatus(o.status) && o.due_date && o.due_date < t).length;
  const finished = rows.filter((o) => o.status === 'finished' || o.status === 'ready').length;
  box.innerHTML =
    '<div class="stat-row">' +
    '<div class="stat"><div class="st-num">' + rows.length + (rows.length >= 300 ? '+' : '') + '</div><div class="st-label">' + (quotesOnly ? 'Quotations' : 'Orders') + '</div></div>' +
    (quotesOnly ? '' : '<div class="stat"><div class="st-num' + (late ? ' o-red' : '') + '">' + late + '</div><div class="st-label">Delivery late</div></div>' +
      '<div class="stat"><div class="st-num">' + finished + '</div><div class="st-label">Finished</div></div>') +
    '</div><div style="height:8px"></div>' +
    rows.map((o) => orderListItemHTML(o, true)).join('');
}

function orderListItemHTML(o, showClient) {
  const cl = o.clients || {};
  return '<div class="list-item" data-action="o-open" data-id="' + o.id + '">' +
    '<div class="li-main">' +
    '<div class="li-title">' + ordNo(o.order_no) + (showClient ? ' · ' + esc(cl.trade_name || '') : '') + '</div>' +
    '<div class="li-sub">' + esc(OTYPE_LABEL[o.order_type] || '') + ' · ' + esc(fmtD(o.order_date)) +
    (o.due_date ? ' · ' + dueHTML(o) : '') + '</div>' +
    '<div class="li-chips">' + chipStatus(o.status) +
    (o.vendor_id && typeof vendorName === 'function' && vendorName(o.vendor_id) ? '<span class="chip chip-vendor">' + esc(vendorName(o.vendor_id)) + '</span>' : '') +
    '</div></div><div style="color:var(--muted)">›</div></div>';
}

/* pick a client for a new order */
function renderPickClient() {
  $('#content').innerHTML =
    '<div class="search-box"><input type="text" id="op-search" placeholder="Search client name, mobile, city…" autocomplete="off"></div>' +
    '<div id="op-results"><div class="empty">Loading…</div></div>' +
    '<div class="notice">Client not in the list? Add them first from the <b>Clients</b> tab, then create the order from their page.</div>';
  const inp = $('#op-search');
  inp.addEventListener('input', () => {
    clearTimeout(S.searchTimer);
    S.searchTimer = setTimeout(() => loadPickClient(inp.value), 280);
  });
  loadPickClient('');
  setTimeout(() => { try { inp.focus(); } catch (_) {} }, 50);
}
async function loadPickClient(qRaw) {
  const box = $('#op-results');
  if (!box) return;
  const q = String(qRaw || '').trim().replace(/[,%()]/g, ' ').trim();
  let query = db.from('clients').select('id, trade_name, contact_person, city');
  if (q) {
    const pat = '%' + q + '%';
    query = query.or('trade_name.ilike.' + pat + ',contact_person.ilike.' + pat + ',mobile.ilike.' + pat + ',city.ilike.' + pat).limit(40);
  } else query = query.order('created_at', { ascending: false }).limit(20);
  const { data, error } = await query;
  if (!$('#op-results')) return;
  if (error) { box.innerHTML = '<div class="empty">Search failed — try again.</div>'; return; }
  box.innerHTML = (data || []).length ? data.map((cl) =>
    '<div class="list-item" data-action="o-pick-client" data-id="' + cl.id + '">' +
    '<div class="li-main"><div class="li-title">' + esc(cl.trade_name) + '</div>' +
    '<div class="li-sub">' + esc([cl.contact_person, cl.city].filter(Boolean).join(' · ')) + '</div></div>' +
    '<div style="color:var(--muted)">›</div></div>').join('')
    : '<div class="empty">No client matches.</div>';
}

/* ============================================================
   ORDER FORM (new + edit)
   ============================================================ */
function blankItem(prev) {
  const it = { category: '', description: '', design_code: '', qty: '1', gross_wt: '', net_wt: '', stone_details: '', stone_amount: '', size: '',
    photo_path: null, _photo: null, catalogue_id: null, cat_photo: null };
  Object.assign(it, JEWEL_BLANK);
  if (prev && prev.metal_color) it.metal_color = prev.metal_color;   // a new line keeps the colour of the one before
  return it;
}

function startNewOrder(client, typeKey, replace) {
  const pending = S.pendingCatItems || null;
  S.pendingCatItems = null;
  if (pending && pending.length && !typeKey) typeKey = 'ready_stock';
  S.ord = {
    id: null, orderNo: null, status: null, oldItemIds: [], oldCatIds: [],
    client: { id: client.id, trade_name: client.trade_name, city: client.city },
    items: [blankItem()],
    o: { order_date: todayStr(), due_date: '', karigar_id: '', vendor_id: '' },
  };
  S.formState = { o_type: typeKey ? OTYPE_LABEL[typeKey] : null, o_metal: 'Gold', o_purity: '22K', o_jw_purity: '22K' };
  if (pending && pending.length && typeof addCatItemsToOrder === 'function') addCatItemsToOrder(pending);
  S.formState.o_color = commonColor(S.ord.items) || null;
  showSub('New Order', renderOrderForm, replace);
}

async function startEditOrder(id) {
  const [or, ir] = await Promise.all([
    db.from('orders').select('*, clients(id, trade_name, city)').eq('id', id).maybeSingle(),
    db.from('order_items').select('*').eq('order_id', id).order('sort', { ascending: true }),
  ]);
  if (or.error || !or.data) { toast('Could not open the order.', 'err'); return; }
  const o = or.data;
  const s = (v) => (v == null ? '' : String(v));
  const items = ir.data || [];
  const catIds = items.map((it) => it.catalogue_id).filter(Boolean);
  const catPhoto = new Map();
  if (catIds.length) {
    const { data } = await db.from('catalogue_items').select('id, photo_paths').in('id', catIds);
    (data || []).forEach((c) => catPhoto.set(c.id, (c.photo_paths || [])[0] || null));
  }
  S.ord = {
    id: o.id, orderNo: o.order_no, status: o.status, oldItemIds: items.map((x) => x.id), oldCatIds: catIds,
    client: o.clients || { id: o.client_id, trade_name: 'Client' },
    items: items.map((it) => Object.assign({
      category: s(it.category), description: s(it.description), design_code: s(it.design_code), qty: s(it.qty || 1),
      gross_wt: s(it.gross_wt), net_wt: s(it.net_wt), stone_details: s(it.stone_details),
      stone_amount: num(it.stone_amount) ? s(it.stone_amount) : '',   // not shown — an older value is kept when saved again
      size: s(it.size), photo_path: it.photo_path, _photo: null,
      catalogue_id: it.catalogue_id || null, cat_photo: it.catalogue_id ? catPhoto.get(it.catalogue_id) || null : null,
    }, jewelForm(it))),
    o: {
      order_date: s(o.order_date), due_date: s(o.due_date), wastage_pct: s(o.wastage_pct),
      client_metal_g: s(o.client_metal_g), client_metal_on: s(o.client_metal_on), karigar_id: s(o.karigar_id), vendor_id: s(o.vendor_id),
      karigar_issued_g: s(o.karigar_issued_g), karigar_issued_on: s(o.karigar_issued_on),
      karigar_received_g: s(o.karigar_received_g), karigar_received_on: s(o.karigar_received_on),
      notes: s(o.notes), legacy_karigar: o.karigar_id ? '' : s(o.karigar_name),
    },
  };
  if (!S.ord.items.length) S.ord.items.push(blankItem());
  S.formState = {
    o_type: OTYPE_LABEL[o.order_type], o_metal: o.metal || 'Gold', o_purity: purityKey(o.purity),
    o_jw_purity: purityKey(o.client_metal_purity) || '22K',
  };
  S.formState.o_color = commonColor(S.ord.items) || null;
  showSub('Edit · ' + ordNo(o.order_no), renderOrderForm);
}

function curOType() { return OTYPE_KEY[S.formState.o_type] || null; }

/* gold colour / silver finish for the whole order — kept in step with the items */
function orderColorSegHTML() { return segHTML('o_color', colorOptions(S.formState.o_metal || 'Gold'), S.formState.o_color || null); }
function syncOrderColor() {
  if (!S.ord) return;
  S.formState.o_color = commonColor(S.ord.items) || null;
  const w = $('#o-color-wrap');
  if (w) w.innerHTML = orderColorSegHTML();
  const l = $('#o-color-label');
  if (l) l.textContent = colorFieldLabel(S.formState.o_metal || 'Gold');
}

/* The order-level values from the form. */
function formOrderObj() {
  const o = Object.assign({}, S.ord.o);
  o.order_type = curOType();
  o.metal = S.formState.o_metal || 'Gold';
  // a purity left over from the other metal is never saved
  o.purity = purityOptions(o.metal).indexOf(S.formState.o_purity) > -1 ? purityVal(S.formState.o_purity) : null;
  o.client_metal_purity = purityVal(S.formState.o_jw_purity);
  return o;
}

function karigarOptionsHTML(sel) {
  const list = (S.karigars || []).filter((k) => k.active || k.id === sel);
  return '<option value="">— None —</option>' +
    list.map((k) => '<option value="' + esc(k.id) + '"' + (k.id === sel ? ' selected' : '') + '>' + esc(k.name) + '</option>').join('') +
    '<option value="__new">＋ Add new karigar…</option>';
}

function renderOrderForm() {
  const o = S.ord.o, isNew = !S.ord.id, isQuote = S.ord.status === 'quote';
  const fv = (k) => esc(o[k] == null ? '' : o[k]);
  const numIn = (k, ph, id) => '<input type="text" inputmode="decimal" autocomplete="off" data-of="' + k + '"' + (id ? ' id="' + id + '"' : '') + ' value="' + fv(k) + '" placeholder="' + (ph || '') + '">';
  const dateIn = (k) => '<input type="date" data-of="' + k + '" value="' + fv(k) + '">';
  $('#content').innerHTML =
    '<div id="order-form">' +
    '<div class="card" style="padding:13px 15px"><b>' + esc(S.ord.client.trade_name) + '</b>' +
    (S.ord.client.city ? ' <span style="color:var(--muted);font-size:13px">· ' + esc(S.ord.client.city) + '</span>' : '') +
    (S.ord.orderNo ? ' <span style="color:var(--muted);font-size:13px">· ' + ordNo(S.ord.orderNo) + (isQuote ? ' · Quotation' : '') + '</span>' : '') + '</div>' +

    '<div class="section-label">Order type <span class="req-dot">*</span></div>' +
    '<div class="card"><div class="field" style="margin-bottom:2px">' + segHTML('o_type', ['Job work', 'Ready stock', 'Custom order'], S.formState.o_type) +
    '<div class="hint" id="o-type-hint"></div></div></div>' +

    '<div class="section-label">Dates</div>' +
    '<div class="card"><div class="o-2col">' +
    '<div class="field"><label>Order date</label>' + dateIn('order_date') + '</div>' +
    '<div class="field"><label>Delivery by</label>' + dateIn('due_date') + '</div>' +
    '</div></div>' +

    (S.dbv6 && typeof vendorOptionsHTML === 'function' ?
      '<div class="section-label">Vendor</div>' +
      '<div class="card"><div class="field" style="margin-bottom:2px"><label>Who makes this order</label><select id="o-vendor" data-of="vendor_id">' + vendorOptionsHTML(o.vendor_id) + '</select>' +
      '<div class="hint">Add the diamonds to give the vendor on the order page, after saving.</div></div></div>' : '') +

    '<div class="section-label">Items</div>' +
    '<div id="o-items"></div>' +
    '<div class="action-row" style="margin-bottom:4px">' +
    '<button class="btn btn-secondary" data-action="o-item-add">＋ Add item</button>' +
    '<button class="btn btn-secondary" data-action="o-cat-pick">Pick from catalogue</button>' +
    '</div>' +

    '<div class="section-label">Metal</div>' +
    '<div class="card">' +
    '<div class="field"><label>Metal</label>' + segHTML('o_metal', ['Gold', 'Silver'], S.formState.o_metal) + '</div>' +
    '<div class="field"><label>Purity</label><div id="o-purity-wrap">' + segHTML('o_purity', purityOptions(S.formState.o_metal), S.formState.o_purity) + '</div></div>' +
    '<div class="field" style="margin-bottom:2px"><label id="o-color-label">' + colorFieldLabel(S.formState.o_metal) + '</label><div id="o-color-wrap">' + orderColorSegHTML() + '</div>' +
    '<div class="hint">Sets every item. If one item is different, change it in that item\'s box.</div></div>' +
    '</div>' +

    '<div id="o-sec-jw">' +
    '<div class="section-label">Client\'s gold received</div>' +
    '<div class="card">' +
    '<div class="o-2col">' +
    '<div class="field"><label>Weight (g)</label>' + numIn('client_metal_g', 'e.g. 150.500') + '</div>' +
    '<div class="field"><label>Received on</label>' + dateIn('client_metal_on') + '</div>' +
    '</div>' +
    '<div class="field"><label>Purity of their gold</label>' + segHTML('o_jw_purity', PURITY.map((p) => p[0]), S.formState.o_jw_purity) + '</div>' +
    '<div class="field" style="margin-bottom:2px"><label>Wastage %</label>' + numIn('wastage_pct', 'e.g. 4') + '<div class="hint">Gold used up in making — deducted from the client\'s gold.</div></div>' +
    '<div id="o-jw-ledger"></div>' +
    '</div></div>' +

    '<div id="o-sec-karigar">' +
    '<div class="section-label">Karigar (optional)</div>' +
    '<div class="card">' +
    '<div class="field"><label>Karigar</label><select id="o-karigar" data-of="karigar_id">' + karigarOptionsHTML(o.karigar_id) + '</select>' +
    (o.legacy_karigar ? '<div class="hint">Typed earlier: ' + esc(o.legacy_karigar) + '</div>' : '') +
    '<div class="hint">What you issue and receive here is also written in the karigar\'s account.</div></div>' +
    '<div class="o-2col">' +
    '<div class="field"><label>Issued (g)</label>' + numIn('karigar_issued_g') + '</div>' +
    '<div class="field"><label>Issued on</label>' + dateIn('karigar_issued_on') + '</div>' +
    '<div class="field"><label>Received back (g)</label>' + numIn('karigar_received_g') + '</div>' +
    '<div class="field"><label>Received on</label>' + dateIn('karigar_received_on') + '</div>' +
    '</div>' +
    '<div id="o-kg-ledger"></div>' +
    '</div></div>' +

    '<div class="card o-totals" id="o-totals"></div>' +

    '<div class="section-label">Notes</div>' +
    '<div class="card"><div class="field" style="margin-bottom:0"><textarea data-of="notes" style="min-height:80px" placeholder="Design details, finish, colour of stones, packing, special instructions…">' + fv('notes') + '</textarea></div></div>' +

    (isNew
      ? '<button class="btn btn-primary" data-action="o-save" data-quote="1" id="o-quote-btn">Save quotation</button>' +
        '<div class="hint" style="text-align:center;margin:6px 0 10px">Approve it — or mark it not approved — on the next screen.</div>' +
        '<button class="btn btn-secondary" data-action="o-save" id="o-save-btn">Already approved — save as order</button>'
      : '<button class="btn btn-primary" data-action="o-save" id="o-save-btn">' + (isQuote ? 'Save quotation' : 'Save changes') + '</button>') +
    '<div style="height:10px"></div>' +
    '</div>';
  redrawOrderItems();
  applyOTypeVisibility();
  orderRecalcView();
}

function redrawOrderItems() {
  const box = $('#o-items');
  if (!box) return;
  const many = S.ord.items.length > 1;
  box.innerHTML = S.ord.items.map((it, i) => {
    const f = (k, label, ph, dec, full) => '<div class="' + (full ? 'full' : '') + '"><div class="oi-l">' + label + '</div>' +
      '<input type="text"' + (dec ? ' inputmode="decimal"' : '') + ' autocomplete="off" data-oi="' + k + '" data-idx="' + i + '" value="' + esc(it[k]) + '" placeholder="' + (ph || '') + '"></div>';
    const cats = ITEM_CATS.slice();
    if (it.category && cats.indexOf(it.category) === -1) cats.unshift(it.category);
    let photo;
    if (it._photo) {
      photo = '<img class="oi-thumb" src="' + URL.createObjectURL(it._photo.blob) + '" alt="Design photo">' +
        '<div class="photo-row"><button type="button" class="btn btn-small btn-secondary" data-action="o-item-photo" data-idx="' + i + '">Retake</button>' +
        '<button type="button" class="btn btn-small btn-ghost" data-action="o-item-photo-del" data-idx="' + i + '">Remove</button></div>';
    } else if (it.photo_path) {
      photo = '<div class="photo-row" style="align-items:center"><span class="ps-saved" style="font-size:13px;font-weight:650">Photo saved ✓</span>' +
        '<button type="button" class="btn btn-small btn-secondary" data-action="o-item-photo" data-idx="' + i + '">Replace</button>' +
        '<button type="button" class="btn btn-small btn-ghost" data-action="o-item-photo-del" data-idx="' + i + '">Remove</button></div>';
    } else if (it.cat_photo) {
      photo = '<img class="oi-thumb" data-catphoto="' + esc(it.cat_photo) + '" alt="Catalogue photo">' +
        '<div class="photo-row"><button type="button" class="btn btn-small btn-secondary" data-action="o-item-photo" data-idx="' + i + '">Use another photo</button></div>';
    } else {
      photo = '<button type="button" class="btn btn-small btn-secondary" data-action="o-item-photo" data-idx="' + i + '">📷 Add design photo</button>';
    }
    return '<div class="fu-row oi-row">' +
      '<div class="fu-top"><span class="chip chip-type">Item ' + (i + 1) + '</span>' +
      (it.catalogue_id ? '<span class="chip chip-cat" style="margin-right:auto;margin-left:6px">From catalogue</span>' : '') +
      (many ? '<button type="button" class="fu-x" data-action="o-item-del" data-idx="' + i + '">✕</button>' : '') + '</div>' +
      '<div class="oi-grid">' +
      '<div><div class="oi-l">Type of piece</div><select data-oi="category" data-idx="' + i + '"><option value="">Choose…</option>' +
      cats.map((c) => '<option value="' + esc(c) + '"' + (c === it.category ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select></div>' +
      f('design_code', 'Tag / design no.', 'e.g. PK-1042') +
      f('description', 'Description', 'e.g. Polki choker with emerald drops', false, true) +
      f('qty', 'Qty (pcs)', '1', true) +
      f('size', 'Size', 'e.g. 2.6 / 16 in') +
      f('gross_wt', 'Gross wt (g)', '0.000', true) +
      f('net_wt', 'Net metal wt (g)', '0.000', true) +
      jewelItemFieldsHTML(it, i, S.formState.o_metal || 'Gold') +
      f('stone_details', 'Other stones', 'e.g. kundan, emerald drops', false, true) +
      '</div>' +
      '<div class="oi-photo">' + photo + '</div>' +
      '</div>';
  }).join('');
  // catalogue photos load after the boxes are drawn
  const imgs = box.querySelectorAll('img[data-catphoto]');
  if (imgs.length && typeof signedUrls === 'function') {
    signedUrls('catalogue', Array.from(imgs).map((im) => im.dataset.catphoto)).then((m) => {
      imgs.forEach((im) => { const u = m.get(im.dataset.catphoto); if (u) im.src = u; });
    });
  }
}

function applyOTypeVisibility() {
  const t = curOType();
  const show = (sel, on) => { const e = $(sel); if (e) e.style.display = on ? '' : 'none'; };
  show('#o-sec-jw', t === 'job_work');
  show('#o-sec-karigar', t === 'job_work' || t === 'custom');
  const hint = $('#o-type-hint');
  if (hint) hint.textContent =
    t === 'job_work' ? 'The client gives the gold. Record their gold below so the balance is tracked.'
      : t === 'ready_stock' ? 'Pieces from your ready stock. Note the tag number and weight of each piece the client picked.'
        : t === 'custom' ? 'Made to the client\'s design. Add a reference photo for each item.'
          : 'Choose one to continue.';
}

function orderRecalcView() {
  const box = $('#o-totals');
  if (!box || !S.ord) return;
  const o = formOrderObj();
  const c = orderCalc(o, S.ord.items);
  const row = (k, v, cls) => '<div class="o-lrow' + (cls ? ' ' + cls : '') + '"><span>' + k + '</span><b>' + v + '</b></div>';
  box.innerHTML =
    (c.gross ? row('Gross weight', grams(c.gross)) : '') +
    (c.ct ? row('Diamonds / stones', carats(c.ct)) : '') +
    row('Net metal weight', grams(c.net) + (c.pcs ? ' · ' + c.pcs + ' pc' + (c.pcs === 1 ? '' : 's') : ''), 'o-total');
  const jl = $('#o-jw-ledger');
  if (jl) jl.innerHTML = jwLedgerHTML(jwLedger(o, c.net));
  const kl = $('#o-kg-ledger');
  if (kl) kl.innerHTML = numOrNull(o.karigar_issued_g) != null ? karigarHTML(Object.assign({}, o, { karigar_name: '', karigar_id: null, metal: S.formState.o_metal })) : '';
}

function onOrderInput(e) {
  const t = e.target;
  if (!S.ord || !$('#order-form')) return;
  if (t.dataset.oi != null) {
    const idx = +t.dataset.idx, key = t.dataset.oi;
    const it = S.ord.items[idx];
    if (it) it[key] = t.value;
    if (key === 'metal_color') syncOrderColor();
    if (it && JEWEL_TOGGLE_KEYS.indexOf(key) > -1) {
      if (key === 'diamond_type' && !t.value) { it.diamond_ct = ''; it.diamond_pcs = ''; it.diamond_quality = ''; it.diamond_rate = ''; it.diamond_cert_lab = ''; it.diamond_cert_no = ''; }
      redrawOrderItems();
    }
    orderRecalcView();
  } else if (t.dataset.of) {
    if (t.id === 'o-vendor' && t.value === '__new') {
      t.value = S.ord.o.vendor_id || '';
      if (typeof openVendorModal === 'function') {
        openVendorModal(null, (v) => {
          S.ord.o.vendor_id = v.id;
          const sel = $('#o-vendor');
          if (sel) sel.innerHTML = vendorOptionsHTML(v.id);
        });
      }
      return;
    }
    if (t.id === 'o-karigar' && t.value === '__new') {
      t.value = S.ord.o.karigar_id || '';
      if (typeof openKarigarModal === 'function') {
        openKarigarModal(null, (k) => {
          S.ord.o.karigar_id = k.id;
          const sel = $('#o-karigar');
          if (sel) sel.innerHTML = karigarOptionsHTML(k.id);
        });
      }
      return;
    }
    S.ord.o[t.dataset.of] = t.value;
    orderRecalcView();
  }
}

function onSegChange(group) {
  if (!S.ord || !$('#order-form')) return;
  if (group === 'o_type') applyOTypeVisibility();
  if (group === 'o_metal') {
    const metal = S.formState.o_metal || 'Gold';
    if (!S.formState.o_metal) S.formState.o_metal = 'Gold';
    if (purityOptions(metal).indexOf(S.formState.o_purity) === -1) S.formState.o_purity = defaultPurity(metal);
    const w = $('#o-purity-wrap');
    if (w) w.innerHTML = segHTML('o_purity', purityOptions(metal), S.formState.o_purity);
    // a gold colour does not fit silver (and the other way round)
    S.ord.items.forEach((it) => { if (it.metal_color && colorOptions(metal).indexOf(it.metal_color) === -1) it.metal_color = ''; });
    redrawOrderItems();
    syncOrderColor();
  }
  if (group === 'o_color') {
    const c = S.formState.o_color || '';
    S.ord.items.forEach((it) => { it.metal_color = c; });
    redrawOrderItems();
  }
  orderRecalcView();
}
window.INPUT_HOOKS.push(onOrderInput);
window.SEG_HOOKS.push(onSegChange);

function orderItemPhoto(idx) {
  const ov = openModal(
    '<h3>Design photo — item ' + (idx + 1) + '</h3>' +
    '<p>Photo of the piece, a sketch, or the client\'s reference design.</p>' +
    '<div style="display:flex;flex-direction:column;gap:10px">' +
    '<button class="btn btn-primary" data-m="cam">📷 Take photo</button>' +
    '<button class="btn btn-secondary" data-m="gal">🖼️ Choose from gallery</button>' +
    '</div>');
  const go = (fromGallery) => {
    closeModal();
    pickImage(async (file) => {
      try {
        const it = S.ord && S.ord.items[idx];
        if (!it) return;
        it._photo = await downscale(file, 1600);
      } catch (e) { toast(imageErrMsg(e), 'err'); return; }
      redrawOrderItems();
    }, fromGallery);
  };
  ov.querySelector('[data-m=cam]').onclick = () => go(false);
  ov.querySelector('[data-m=gal]').onclick = () => go(true);
}

function itemHasContent(it) {
  return !!(String(it.category || '').trim() || String(it.description || '').trim() || String(it.design_code || '').trim() ||
    num(it.net_wt) || num(it.gross_wt) || it._photo || it.photo_path || it.catalogue_id || it.diamond_type);
}

async function saveOrder(asQuote) {
  const t = curOType();
  if (!t) { toast('Choose the order type first.', 'err'); try { $('#order-form').scrollIntoView({ behavior: 'smooth' }); } catch (_) {} return; }
  const items = S.ord.items.filter(itemHasContent);
  if (!items.length) { toast('Add at least one item.', 'err'); return; }
  const o = formOrderObj();
  const isNew = !S.ord.id;
  const kg = t !== 'ready_stock';
  const kid = kg ? (o.karigar_id || null) : null;
  const kRow = kid ? (S.karigars || []).find((k) => k.id === kid) : null;
  const row = {
    client_id: S.ord.client.id,
    order_type: t,
    order_date: o.order_date || todayStr(),
    due_date: o.due_date || null,
    metal: o.metal,
    purity: o.purity,
    wastage_pct: numOrNull(o.wastage_pct),
    client_metal_g: t === 'job_work' ? numOrNull(o.client_metal_g) : null,
    client_metal_purity: t === 'job_work' && numOrNull(o.client_metal_g) != null ? o.client_metal_purity : null,
    client_metal_on: t === 'job_work' ? (o.client_metal_on || null) : null,
    karigar_id: kid,
    karigar_name: kRow ? kRow.name : (kg ? (o.legacy_karigar || null) : null),
    karigar_issued_g: kg ? numOrNull(o.karigar_issued_g) : null,
    karigar_issued_on: kg ? (o.karigar_issued_on || null) : null,
    karigar_received_g: kg ? numOrNull(o.karigar_received_g) : null,
    karigar_received_on: kg ? (o.karigar_received_on || null) : null,
    notes: String(o.notes || '').trim() || null,
  };
  if (S.dbv6) row.vendor_id = o.vendor_id || null;

  const btns = [$('#o-save-btn'), $('#o-quote-btn')].filter(Boolean);
  const labels = btns.map((b) => b.textContent);
  btns.forEach((b) => { b.disabled = true; });
  const mainBtn = asQuote ? $('#o-quote-btn') : $('#o-save-btn');
  if (mainBtn) mainBtn.textContent = 'Saving…';
  const fail = (msg) => { btns.forEach((b, i) => { b.disabled = false; b.textContent = labels[i]; }); toast(msg, 'err'); };

  let id = S.ord.id;
  let orderNo = S.ord.orderNo;
  let status = S.ord.status || 'new';
  if (isNew) {
    status = asQuote ? 'quote' : 'new';
    row.created_by = S.me.id;
    row.status = status;
    const { data, error } = await db.from('orders').insert(row).select('id, order_no').single();
    if (error) { fail('Could not save the order — please try again.'); return; }
    id = data.id;
    orderNo = data.order_no;
  } else {
    const { error } = await db.from('orders').update(row).eq('id', id);
    if (error) { fail('Could not save — please try again.'); return; }
  }

  // design photos
  let photoFail = false;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it._photo) continue;
    const path = id + '/item-' + Date.now() + '-' + i + '.jpg';
    const { error: upErr } = await db.storage.from('orders').upload(path, it._photo.blob, { contentType: 'image/jpeg' });
    if (upErr) photoFail = true; else { it.photo_path = path; it._photo = null; }
  }

  // items: add the new set first, then remove the old one (so nothing is lost if a step fails)
  const itemRows = items.map((it, i) => Object.assign({
    order_id: id, sort: i,
    category: String(it.category || '').trim() || null,
    description: String(it.description || '').trim() || null,
    design_code: String(it.design_code || '').trim() || null,
    qty: Math.max(1, parseInt(it.qty, 10) || 1),
    gross_wt: numOrNull(it.gross_wt), net_wt: numOrNull(it.net_wt),
    stone_details: String(it.stone_details || '').trim() || null,
    stone_amount: round2(num(it.stone_amount)),   // not shown any more — keeps an older value
    size: String(it.size || '').trim() || null,
    photo_path: it.photo_path || null,
    catalogue_id: it.catalogue_id || null,
  }, jewelRow(it)));
  const { error: itErr } = await db.from('order_items').insert(itemRows);
  if (itErr) toast('Order saved, but the items could not be saved — open the order and tap Edit to add them again.', 'err');
  else if (S.ord.oldItemIds.length) await db.from('order_items').delete().in('id', S.ord.oldItemIds);

  // catalogue pieces: reserved while the order is open, sold when delivered
  const newCat = itemRows.map((r) => r.catalogue_id).filter(Boolean);
  const removedCat = (S.ord.oldCatIds || []).filter((x) => newCat.indexOf(x) === -1);
  if (newCat.length || removedCat.length) await syncCatalogueStatus(status, itErr ? [] : newCat, itErr ? [] : removedCat, id);

  // karigar account entries
  if (row.karigar_id || !isNew) await syncOrderKarigarTxns(id, row, ordNo(orderNo) + ' · ' + (S.ord.client.trade_name || ''));

  await db.from('order_updates').insert({
    order_id: id, status: isNew ? status : null,
    note: isNew ? (asQuote ? 'Quotation created' : 'Order created') : 'Details edited', created_by: S.me.id,
  });

  if (!itErr) {
    toast(photoFail ? 'Saved — but a design photo could not be uploaded.' : (isNew ? (asQuote ? 'Quotation saved ✓' : 'Order saved ✓') : 'Saved ✓'), photoFail ? 'err' : 'ok');
  }
  S.ord = null;
  // editing: drop the Edit screen so Back doesn't lead to a stale copy of the order
  if (!isNew && S.sub.length > 1) { S.suppressPop = true; try { history.back(); } catch (_) {} S.sub.pop(); }
  openOrder(id, true);
}

/* ============================================================
   ORDER PAGE
   ============================================================ */
async function fetchOrder(id) {
  const { data, error } = await db.from('orders').select('*, clients(id, trade_name, city, mobile)').eq('id', id).maybeSingle();
  if (error || !data) { toast('Could not open the order.', 'err'); return null; }
  return data;
}

async function openOrder(id, replace) {
  const o = await fetchOrder(id);
  if (!o) return;
  const title = ordNo(o.order_no);
  let first = o;
  showSub(title, () => {
    const use = (x) => {
      const top = S.sub[S.sub.length - 1];
      if (!x || !top || top.title !== title) return;   // user already moved on
      renderOrderPage(x); loadOrderDetails(x);
      if (typeof loadOrderVendorBox === 'function') loadOrderVendorBox(x);
    };
    if (first) { const x = first; first = null; use(x); }
    else { $('#content').innerHTML = '<div class="empty">Loading…</div>'; fetchOrder(id).then(use); }   // fresh data after Back
  }, replace);
}

function renderOrderPage(o) {
  const cl = o.clients || {};
  const quote = o.status === 'quote';
  const approved = isLive(o);
  const docBtn = (kind, label) => '<button class="btn btn-small btn-secondary" data-action="d-order" data-id="' + o.id + '" data-kind="' + kind + '">' + label + '</button>';

  $('#content').innerHTML =
    '<div class="client-head">' +
    '<h2>' + ordNo(o.order_no) + '</h2>' +
    '<div class="co"><span class="o-headlink" data-action="open-client" data-id="' + o.client_id + '">' + esc(cl.trade_name || 'Client') + ' ›</span>' +
    (cl.city ? ' · ' + esc(cl.city) : '') + '</div>' +
    '<div class="chips">' + chipOType(o.order_type) + chipStatus(o.status) +
    '<span class="chip">' + esc(fmtD(o.order_date)) + '</span>' +
    (o.due_date ? '<span class="chip">' + (isOpenStatus(o.status) && o.due_date < todayStr() ? '⚠ ' : '') + 'Due ' + esc(fmtD(o.due_date)) + '</span>' : '') +
    '</div></div>' +

    (quote ? '<div class="card o-approve"><div class="o-approve-q">Did the client approve this quotation?</div>' +
      '<div class="action-row" style="margin:0">' +
      '<button class="btn btn-primary" data-action="o-convert" data-id="' + o.id + '">✓ Approved</button>' +
      '<button class="btn btn-secondary" data-action="o-status" data-id="' + o.id + '" data-s="declined">✗ Not approved</button>' +
      '</div></div>' : '') +
    (o.status === 'declined' ? '<div class="notice">The client did not approve this quotation.</div>' +
      '<button class="btn btn-secondary" data-action="o-status" data-id="' + o.id + '" data-s="quote" style="margin-bottom:10px">Reopen quotation</button>' : '') +
    (o.status === 'cancelled' ? '<button class="btn btn-primary" data-action="o-status" data-id="' + o.id + '" data-s="new" style="margin-bottom:10px">Reopen order</button>' : '') +

    (approved ? '<div class="section-label">Order status</div><div class="card os-card" id="o-stage-view"><div class="empty" style="padding:6px">Loading…</div></div>' : '') +

    '<div class="action-row">' +
    '<button class="btn btn-secondary" data-action="o-edit" data-id="' + o.id + '">Edit</button>' +
    '<button class="btn btn-secondary" data-action="o-note" data-id="' + o.id + '">＋ Note</button>' +
    '<button class="btn btn-secondary" data-action="o-share" data-id="' + o.id + '">WhatsApp</button>' +
    '</div>' +

    '<div id="o-vendor-view"></div>' +

    '<div class="section-label">Documents (PDF)</div>' +
    '<div class="doc-row">' +
    (quote || o.status === 'declined' ? docBtn('quote', 'Quotation') : docBtn('slip', 'Order slip')) +
    (approved ? docBtn('challan', o.order_type === 'job_work' ? 'Job-work challan' : 'Delivery challan') : '') +
    (o.order_type === 'job_work' && numOrNull(o.client_metal_g) != null ? docBtn('receipt', 'Gold receipt') : '') +
    (o.karigar_id && numOrNull(o.karigar_issued_g) != null ? '<button class="btn btn-small btn-secondary" data-action="o-kchallan" data-id="' + o.id + '">Karigar challan</button>' : '') +
    '</div>' +

    '<div class="section-label">Weight</div>' +
    '<div class="card" id="o-sum"><div class="empty" style="padding:6px">Loading…</div></div>' +
    '<div id="o-items-view"></div>' +
    '<div id="o-ledgers"></div>' +
    (o.notes ? '<div class="section-label">Notes</div><div class="card" style="white-space:pre-wrap;font-size:14.5px">' + esc(o.notes) + '</div>' : '') +
    '<div id="o-timeline"></div>' +

    '<div style="display:flex;gap:10px;justify-content:center;margin:18px 0 6px">' +
    (isOpenStatus(o.status) ? '<button class="btn btn-small btn-ghost" data-action="o-status" data-id="' + o.id + '" data-s="cancelled">Cancel order</button>' : '') +
    '<button class="btn btn-small btn-danger-ghost" data-action="o-delete" data-id="' + o.id + '">Delete</button>' +
    '</div>';
}

/* the stages of an approved order: tap one to set it; each shows the day it was reached */
function stageCardHTML(o, ups) {
  const when = {};
  (ups || []).slice().reverse().forEach((u) => { if (u.status) when[u.status] = u.created_at; });   // newest wins
  const cur = o.status === 'ready' ? ORDER_STAGES.indexOf('finished') : ORDER_STAGES.indexOf(o.status);
  const row = (key, label, state, ts, tap) => '<div class="os-row ' + state + (tap ? ' tap' : '') + '"' + (tap ? ' data-action="o-status" data-id="' + o.id + '" data-s="' + key + '"' : '') + '>' +
    '<span class="os-dot">' + (state === 'pending' ? '' : '✓') + '</span>' +
    '<span class="os-name">' + esc(label) + '</span>' +
    '<span class="os-date">' + (ts ? esc(fmtD(ts)) : state === 'pending' && tap ? 'Tap to set' : '') + '</span></div>';
  if (!S.dbv6) {
    return '<div class="notice" style="margin:0 0 8px">CAD, wax, diamond setting and the other stages need the database update (ark-update-payments-vendors.sql) — ask the owner to run it.</div>' +
      row('new', 'Approved', 'done', when.new || o.order_date, false) +
      row('delivered', 'Delivered', o.status === 'delivered' ? 'cur' : 'pending', o.status === 'delivered' ? (o.delivered_on || when.delivered) : null, o.status !== 'delivered');
  }
  return row('new', 'Approved', 'done', when.new || o.order_date, false) +
    ORDER_STAGES.map((k, i) => row(k, OSTATUS_LABEL[k], i < cur ? 'done' : i === cur ? 'cur' : 'pending',
      i <= cur ? (k === 'delivered' && o.delivered_on ? o.delivered_on : when[k]) : null, i !== cur)).join('');
}

async function loadOrderDetails(o) {
  const [ir, ur] = await Promise.all([
    db.from('order_items').select('*').eq('order_id', o.id).order('sort', { ascending: true }),
    db.from('order_updates').select('*').eq('order_id', o.id).order('created_at', { ascending: false }).limit(100),
  ]);
  if (!$('#o-sum')) return;
  const items = ir.data || [], ups = ur.data || [];
  const c = orderCalc(o, items);
  const row = (k, v, cls) => '<div class="o-lrow' + (cls ? ' ' + cls : '') + '"><span>' + k + '</span><b>' + v + '</b></div>';
  const silver = o.metal === 'Silver';

  // stages
  const sv = $('#o-stage-view');
  if (sv) sv.innerHTML = stageCardHTML(o, ups);

  // weights
  $('#o-sum').innerHTML =
    '<div class="o-ledger" style="margin:0;border:0;padding:0;background:none">' +
    row('Net metal weight', grams(c.net) + (o.purity ? ' · ' + esc(purityLabel(o.purity)) : ''), 'o-total') +
    (o.purity && c.net ? row(silver ? 'Fine silver' : 'Fine gold', grams(c.net * num(o.purity) / 100)) : '') +
    (c.gross ? row('Gross weight', grams(c.gross)) : '') +
    (c.pcs ? row('Pieces', String(c.pcs)) : '') +
    (c.ct ? row('Diamonds / stones', carats(c.ct)) : '') +
    '</div>';

  // items
  const urls = await orderItemPhotoUrls(items);
  const iv = $('#o-items-view');
  if (!iv) return;
  iv.innerHTML = '<div class="section-label">Items (' + items.length + ')</div>' +
    (items.length ? items.map((it, i) => {
      const u = urls[i];
      const bits = [];
      if (num(it.qty) > 1) bits.push(it.qty + ' pcs');
      if (it.gross_wt != null) bits.push('Gross ' + grams(it.gross_wt));
      if (it.net_wt != null) bits.push('Net ' + grams(it.net_wt));
      if (it.size) bits.push('Size ' + esc(it.size));
      return '<div class="card o-item">' +
        (u ? '<a href="' + u + '" target="_blank" rel="noopener"><img class="o-item-img" src="' + u + '" alt="Design ' + (i + 1) + '"></a>' : '') +
        '<div class="o-item-body">' +
        '<div class="o-item-title">' + (i + 1) + '. ' + esc(it.category || 'Item') + (it.design_code ? ' <span class="o-tag">' + esc(it.design_code) + '</span>' : '') + '</div>' +
        (it.description ? '<div class="o-item-desc">' + esc(it.description) + '</div>' : '') +
        (bits.length ? '<div class="o-item-meta">' + bits.join(' · ') + '</div>' : '') +
        jewelMetaHTML(it, o.metal) +
        (it.stone_details ? '<div class="o-item-meta">' + (it.diamond_type ? 'Other stones: ' : 'Stones: ') + esc(it.stone_details) + '</div>' : '') +
        (it.catalogue_id ? '<div class="o-item-meta"><a href="#" data-action="cat-open" data-id="' + it.catalogue_id + '">Catalogue piece ›</a></div>' : '') +
        '</div></div>';
    }).join('') : '<div class="empty" style="padding:10px">No items — tap Edit to add them.</div>');

  // gold ledgers
  const led = jwLedger(o, c.net);
  const kgH = karigarHTML(o);
  const lg = $('#o-ledgers');
  if (lg) lg.innerHTML =
    (o.order_type === 'job_work' ? '<div class="section-label">Client\'s gold</div><div class="card">' +
      (led ? '<div class="o-lrow"><span>Received' + (o.client_metal_on ? ' · ' + esc(fmtD(o.client_metal_on)) : '') + '</span><b>' + grams(o.client_metal_g) + ' · ' + esc(purityLabel(o.client_metal_purity)) + '</b></div>' + jwLedgerHTML(led)
        : '<div class="empty" style="padding:6px">Client\'s gold not recorded yet — tap Edit.</div>') + '</div>' : '') +
    (kgH ? '<div class="section-label">Karigar</div><div class="card">' + kgH + '</div>' : '');

  // timeline
  const tv = $('#o-timeline');
  if (tv) tv.innerHTML = ups.length ? '<div class="section-label">History</div>' + ups.map((u) =>
    '<div class="timeline-item"><div class="t-meta"><span>' + esc(nameOf(u.created_by)) + '</span><span>' + fmtDT(u.created_at) + '</span></div>' +
    (u.status ? '<div style="margin:2px 0 4px">' + chipStatus(u.status) + '</div>' : '') +
    (u.note ? '<div class="t-notes">' + esc(u.note) + '</div>' : '') + '</div>').join('') : '';
}

/* ---------------- order actions ---------------- */
function stageIndex(st) { return st === 'ready' ? ORDER_STAGES.indexOf('finished') : ORDER_STAGES.indexOf(st); }

async function setOrderStatus(id, s) {
  const o = await fetchOrder(id);
  if (!o) return;
  if (s === 'declined' && !S.dbv6) s = 'cancelled';   // before the database update "not approved" is kept as cancelled
  const go = async () => {
    const patch = { status: s, delivered_on: s === 'delivered' ? todayStr() : null };
    const { error } = await db.from('orders').update(patch).eq('id', id);
    if (error) {
      toast(String(error.code) === '23514' ? 'This needs the database update (ark-update-payments-vendors.sql).' : 'Could not update — try again.', 'err');
      return;
    }
    await db.from('order_updates').insert({ order_id: id, status: s, note: null, created_by: S.me.id });
    // a quotation never held its pieces; a cancelled order already let them go
    if (CLOSED_STATUSES.indexOf(s) === -1 || HOLDING_STATUSES.indexOf(o.status) > -1) await syncCatalogueForOrder(id, s);
    toast(s === 'quote' ? 'Quotation reopened ✓' : 'Marked ' + OSTATUS_LABEL[s] + ' ✓', 'ok');
    openOrder(id, true);
  };
  if (o.status === 'cancelled' && s === 'new') {
    const taken = await piecesTaken(id);
    if (taken.length) { warnPiecesTaken(taken, 'Reopen anyway', go); return; }
  }
  if (s === 'declined' || (s === 'cancelled' && o.status === 'quote')) {
    confirmModal('Not approved?', 'The quotation will be marked Not approved. You can reopen it later.', 'Not approved', go, true);
  } else if (s === 'cancelled') {
    confirmModal('Cancel this order?', 'It stays on record as Cancelled. You can reopen it later.', 'Cancel order', go, true);
  } else if (ORDER_STAGES.indexOf(s) > -1 && stageIndex(o.status) > ORDER_STAGES.indexOf(s)) {
    confirmModal('Move back to ' + OSTATUS_LABEL[s] + '?', 'The order is at ' + OSTATUS_LABEL[o.status] + ' now.', 'Move back', go);
  } else go();
}

/* a catalogue piece can only be in one order — pieces of this order that were taken meanwhile */
async function piecesTaken(orderId) {
  const { data: its } = await db.from('order_items').select('catalogue_id').eq('order_id', orderId);
  const cids = (its || []).map((x) => x.catalogue_id).filter(Boolean);
  if (!cids.length) return [];
  const { data } = await db.from('catalogue_items').select('tag_no, title, status').in('id', cids).neq('status', 'available');
  return data || [];
}
function warnPiecesTaken(taken, yesLabel, onYes) {
  confirmModal('Piece not available', taken.map((c) => (c.tag_no || c.title || 'A piece') + ' (' + String(CAT_STATUS_LABEL[c.status] || c.status).toLowerCase() + ')').join(', ') +
    ' — already in another order or sold. Continue anyway?', yesLabel, onYes);
}
async function convertQuote(id) {
  const taken = await piecesTaken(id);
  if (taken.length) { warnPiecesTaken(taken, 'Approve anyway', () => doConvertQuote(id)); return; }
  doConvertQuote(id);
}
/* the client approved the quotation → it becomes an order (dated today) */
async function doConvertQuote(id) {
  const { error } = await db.from('orders').update({ status: 'new', order_date: todayStr() }).eq('id', id);
  if (error) { toast('Could not update — try again.', 'err'); return; }
  await db.from('order_updates').insert({ order_id: id, status: 'new', note: 'Quotation approved', created_by: S.me.id });
  await syncCatalogueForOrder(id, 'new');
  toast('Quotation approved ✓', 'ok');
  openOrder(id, true);
}

function openNoteModal(orderId) {
  const ov = openModal(
    '<h3>Add a note</h3><p>Progress update, client request, karigar message — it goes on the order\'s history.</p>' +
    '<div class="field"><textarea id="on-text" style="min-height:90px" placeholder="e.g. Polki setting done, polishing pending"></textarea></div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Save note</button></div>');
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    const t = $('#on-text').value.trim();
    if (!t) { toast('Write the note first.', 'err'); return; }
    e.target.disabled = true;
    const { error } = await db.from('order_updates').insert({ order_id: orderId, note: t, created_by: S.me.id });
    if (error) { e.target.disabled = false; toast('Could not save — try again.', 'err'); return; }
    closeModal(); toast('Note added ✓', 'ok');
    openOrder(orderId, true);
  };
}

async function shareOrderWhatsApp(id) {
  const o = await fetchOrder(id);
  if (!o) return;
  const { data: items } = await db.from('order_items').select('*').eq('order_id', id).order('sort', { ascending: true });
  const cl = o.clients || {};
  const quote = o.status === 'quote';
  const lines = [];
  lines.push('*' + (typeof bizName === 'function' ? bizName() : BRAND) + ' — ' + (quote ? 'Quotation ' : 'Order ') + ordNo(o.order_no) + '*');
  lines.push(OTYPE_LABEL[o.order_type] + (quote ? '' : ' · ' + OSTATUS_LABEL[o.status]));
  lines.push('Client: ' + (cl.trade_name || ''));
  lines.push((quote ? 'Date: ' + fmtD(todayStr()) : 'Order date: ' + fmtD(o.order_date)) + (o.due_date ? ' · Delivery by: ' + fmtD(o.due_date) : ''));
  lines.push('');
  lines.push('*Items*');
  (items || []).forEach((it, i) => {
    const w = [];
    if (num(it.qty) > 1) w.push(it.qty + ' pcs');
    if (it.net_wt != null) w.push('net ' + grams(it.net_wt));
    lines.push((i + 1) + '. ' + [it.category, it.design_code, it.description].filter(Boolean).join(' — ') + (w.length ? ' (' + w.join(', ') + ')' : ''));
    const jb = jewelPdfBits(it, o.metal);
    if (jb.length) lines.push('   ' + jb.join(' · '));
  });
  if (o.order_type === 'job_work' && o.client_metal_g != null) {
    lines.push('');
    lines.push('Your gold received: ' + grams(o.client_metal_g) + (o.client_metal_purity ? ' (' + purityLabel(o.client_metal_purity) + ')' : ''));
  }
  const c = orderCalc(o, items || []);
  if (c.net) lines.push('Total net weight: ' + grams(c.net) + (o.purity ? ' (' + purityLabel(o.purity) + ')' : ''));
  lines.push('');
  lines.push('Thank you!');
  window.open(waUrl(cl.mobile, lines.join('\n')), '_blank');
}

async function deleteOrder(id) {
  const o = await fetchOrder(id);
  if (!o) return;
  const isQuote = o.status === 'quote' || o.status === 'declined';
  const keep = o.status === 'quote' ? ' To keep a record, use “Not approved” instead.' : isOpenStatus(o.status) ? ' To keep a record, use “Cancel order” instead.' : '';
  confirmModal(isQuote ? 'Delete this quotation?' : 'Delete this order?',
    'It will be removed permanently with its items and history.' + keep, 'Delete', async () => {
    if (HOLDING_STATUSES.indexOf(o.status) > -1) await syncCatalogueForOrder(id, 'cancelled');
    await db.from('karigar_txns').delete().eq('order_id', id).eq('auto', true);
    const { error } = await db.from('orders').delete().eq('id', id);
    if (error) { toast('Could not delete — try again.', 'err'); return; }
    toast('Order deleted', 'ok');
    if (S.sub.length) { S.suppressPop = true; try { history.back(); } catch (_) {} goBack(); }
  }, true);
}

async function orderKarigarChallan(orderId) {
  const { data } = await db.from('karigar_txns').select('id').eq('order_id', orderId).eq('kind', 'issue').limit(1);
  if (!data || !data.length) { toast('Choose the karigar and gold issued on the order first (Edit).', 'err'); return; }
  makeAndOfferPdf(() => buildKarigarChallanPdf(data[0].id));
}

/* ============================================================
   HOOKS used by app.js
   ============================================================ */

/* delegated clicks with data-action starting "o-" */
async function onOrderAction(a, el) {
  if (a === 'o-tab-new') { S.pendingCatItems = null; showSub('Choose client', renderPickClient); }
  else if (a === 'o-pick-client') { const c = await fetchClient(el.dataset.id); if (c) startNewOrder(c, null, true); }
  else if (a === 'o-new') { S.pendingCatItems = null; const c = await fetchClient(el.dataset.id); if (c) startNewOrder(c, el.dataset.type || null); }
  else if (a === 'o-open') openOrder(el.dataset.id);
  else if (a === 'o-filter') { S.olist[el.dataset.g] = el.dataset.v; renderOrders(); }
  else if (a === 'o-item-add') {
    const ni = blankItem(S.ord.items[S.ord.items.length - 1]);
    if (S.formState.o_color) ni.metal_color = S.formState.o_color;
    S.ord.items.push(ni); redrawOrderItems(); orderRecalcView();
  }
  else if (a === 'o-item-del') { S.ord.items.splice(+el.dataset.idx, 1); if (!S.ord.items.length) S.ord.items.push(blankItem()); redrawOrderItems(); syncOrderColor(); orderRecalcView(); }
  else if (a === 'o-item-photo') orderItemPhoto(+el.dataset.idx);
  else if (a === 'o-item-photo-del') { const it = S.ord.items[+el.dataset.idx]; if (it) { it._photo = null; it.photo_path = null; } redrawOrderItems(); }
  else if (a === 'o-save') saveOrder(el.dataset.quote === '1');
  else if (a === 'o-status') setOrderStatus(el.dataset.id, el.dataset.s);
  else if (a === 'o-convert') convertQuote(el.dataset.id);
  else if (a === 'o-edit') startEditOrder(el.dataset.id);
  else if (a === 'o-note') openNoteModal(el.dataset.id);
  else if (a === 'o-share') shareOrderWhatsApp(el.dataset.id);
  else if (a === 'o-delete') deleteOrder(el.dataset.id);
  else if (a === 'o-kchallan') orderKarigarChallan(el.dataset.id);
  else if (a === 'o-cat-pick') { if (typeof openCatPicker === 'function') openCatPicker(); }
  else if (a === 'o-report-type') { S.olist = { status: 'all', type: el.dataset.v, q: '' }; switchTab('orders'); }
  else if (a === 'o-goto') { S.olist = { status: el.dataset.s || 'open', type: 'all', q: '' }; switchTab('orders'); }
}

/* the client page's Orders section */
async function loadClientOrders(cl) {
  const el = $('#client-orders');
  if (!el) return;
  const { data, error } = await db.from('orders').select('id, order_no, order_type, status, order_date, due_date')
    .eq('client_id', cl.id).order('order_date', { ascending: false }).limit(100);
  if (!$('#client-orders')) return;
  if (error) { el.innerHTML = ''; return; }
  const rows = data || [];
  if (!rows.length) { el.innerHTML = ''; return; }
  const open = rows.filter((o) => isOpenStatus(o.status)).length;
  el.innerHTML = '<div class="section-label">Orders (' + rows.length + ')' + (open ? ' · ' + open + ' open' : '') + '</div>' +
    rows.map((o) => orderListItemHTML(o, false)).join('');
}

/* the Today screen's "orders due soon" block */
async function loadTodayOrders() {
  const el = $('#today-orders');
  if (!el) return;
  const { data, error } = await db.from('orders').select('id, order_no, order_type, status, order_date, due_date, clients(trade_name)')
    .in('status', OPEN_STATUSES).not('due_date', 'is', null).lte('due_date', todayStr(3))
    .order('due_date', { ascending: true }).limit(30);
  if (!$('#today-orders') || error || !data || !data.length) return;
  el.innerHTML = '<div class="due-group-label overdue">Orders due in the next 3 days (' + data.length + ')</div>' +
    data.map((o) => orderListItemHTML(o, true)).join('');
}

/* the owner Report's Orders block */
function periodStartDate(p) {
  return p === 'all' ? null : p === 'today' ? todayStr() : p === '7d' ? todayStr(-7) : todayStr(-30);
}
async function loadReportOrders(period) {
  const el = $('#report-orders');
  if (!el) return;
  const start = periodStartDate(period);
  let q = db.from('orders').select('order_type, status, created_by').limit(5000);
  if (start) q = q.gte('order_date', start);
  const [r, payRows] = await Promise.all([
    q,
    typeof payAllEntries === 'function' ? payAllEntries().catch(() => []) : Promise.resolve([]),
  ]);
  if (!$('#report-orders')) return;
  if (r.error) { el.innerHTML = ''; return; }
  const all = r.data || [];
  const rows = all.filter(isLive);
  const cancelled = all.filter((o) => CLOSED_STATUSES.indexOf(o.status) > -1).length;
  const quotes = all.filter((o) => o.status === 'quote');
  const PG = typeof payDueGroups === 'function' ? payDueGroups(payIndex(payRows)) : { all: [], late: [] };
  const byType = { job_work: 0, ready_stock: 0, custom: 0 };
  const byStatus = {};
  ['new'].concat(ORDER_STAGES).forEach((k) => { byStatus[k] = 0; });
  const byExec = new Map();
  rows.forEach((o) => {
    byType[o.order_type] = (byType[o.order_type] || 0) + 1;
    const st = o.status === 'ready' ? 'finished' : o.status;
    byStatus[st] = (byStatus[st] || 0) + 1;
    if (o.created_by) byExec.set(o.created_by, (byExec.get(o.created_by) || 0) + 1);
  });
  const tchip = (k) => '<button class="brk-chip"' + (byType[k] ? ' data-action="o-report-type" data-v="' + k + '"' : ' style="opacity:.45"') + '>' + OTYPE_LABEL[k] + ' <b>' + byType[k] + '</b></button>';
  el.innerHTML =
    '<div class="section-label">Orders ' + esc(periodLabel(period)) + '</div>' +
    '<div class="stat-row">' +
    '<div class="stat"><div class="st-num">' + rows.length + '</div><div class="st-label">Orders</div></div>' +
    '<div class="stat"><div class="st-num">' + rows.filter((o) => isOpenStatus(o.status)).length + '</div><div class="st-label">Open</div></div>' +
    '<div class="stat"><div class="st-num">' + byStatus.delivered + '</div><div class="st-label">Delivered</div></div>' +
    '</div>' +
    '<div class="brk-row">' + tchip('job_work') + tchip('ready_stock') + tchip('custom') + '</div>' +
    '<div class="brk-row">' + ['new'].concat(ORDER_STAGES).map((s) =>
      '<span class="brk-chip" style="cursor:default' + (byStatus[s] ? '' : ';opacity:.45') + '">' + OSTATUS_LABEL[s] + ' <b>' + byStatus[s] + '</b></span>').join('') +
    (cancelled ? '<span class="brk-chip" style="cursor:default;opacity:.6">Not approved / cancelled <b>' + cancelled + '</b></span>' : '') +
    (quotes.length ? '<button class="brk-chip" data-action="o-goto" data-s="quote">Quotations <b>' + quotes.length + '</b></button>' : '') + '</div>' +
    (byExec.size ? '<div class="brk-row">' + Array.from(byExec.entries()).sort((a, b) => b[1] - a[1]).map((e) =>
      '<span class="brk-chip" style="cursor:default">' + esc(nameOf(e[0])) + ' <b>' + e[1] + '</b></span>').join('') + '</div>' : '') +
    (PG.all.length ? '<div class="notice" style="margin-top:8px">Payments due: <b>' + PG.all.length + '</b>' +
      (PG.late.length ? ' · <span class="o-red">' + PG.late.length + ' overdue</span>' : '') + ' · <a href="#" data-action="dues-open">See who ›</a></div>' : '');
}

/* extra CSV files for Export */
async function exportOrdersData(pName, cName, today) {
  const results = await Promise.all([
    fetchAll('orders', 'created_at'),
    fetchAll('order_items', 'created_at'),
  ]);
  const orders = results[0], items = results[1];
  const oNo = new Map(orders.map((o) => [o.id, ordNo(o.order_no)]));
  const oClient = new Map(orders.map((o) => [o.id, cName.get(o.client_id) || '']));
  await new Promise((r) => setTimeout(r, 450));
  downloadFile('bj-orders-' + today + '.csv', buildCsv(
    ['Order no', 'Client', 'Type', 'Status', 'Order date', 'Delivery by', 'Delivered on', 'Vendor', 'Metal', 'Purity', 'Wastage %',
      'Client gold (g)', 'Client gold purity', 'Client gold on',
      'Karigar', 'Issued to karigar (g)', 'Issued on', 'Received from karigar (g)', 'Received on', 'Notes', 'Created by', 'Created on'],
    orders.map((o) => [ordNo(o.order_no), cName.get(o.client_id) || '', OTYPE_LABEL[o.order_type], OSTATUS_LABEL[o.status], o.order_date, o.due_date || '',
      o.delivered_on || '', o.vendor_id && typeof vendorName === 'function' ? vendorName(o.vendor_id) : '', o.metal, o.purity, o.wastage_pct,
      o.client_metal_g, o.client_metal_purity, o.client_metal_on || '', o.karigar_name, o.karigar_issued_g, o.karigar_issued_on || '',
      o.karigar_received_g, o.karigar_received_on || '', o.notes, pName.get(o.created_by) || '', fmtExp(o.created_at)])));
  await new Promise((r) => setTimeout(r, 450));
  downloadFile('bj-order-items-' + today + '.csv', buildCsv(
    ['Order no', 'Client', '#', 'Piece', 'Tag / design no', 'Description', 'Qty', 'Gross wt (g)', 'Net wt (g)', 'Colour / finish',
      'Diamonds / stones', 'Carats', 'Diamond pcs', 'Diamond quality', 'Diamond certificate', 'Diamond cert no',
      'Jewellery certificate', 'Jewellery cert / HUID no', 'Other stones', 'Size'],
    items.map((it) => [oNo.get(it.order_id) || '', oClient.get(it.order_id) || '', it.sort + 1, it.category, it.design_code, it.description, it.qty,
      it.gross_wt, it.net_wt, it.metal_color, diamondLabel(it.diamond_type), it.diamond_ct, it.diamond_pcs, it.diamond_quality,
      it.diamond_type ? (it.diamond_cert_lab || 'Not certified') : '', it.diamond_cert_no, it.jewel_cert_type || '', it.jewel_cert_no,
      it.stone_details, it.size])));
}
