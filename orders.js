/* ============================================================
   ORDERS add-on — job work, ready stock and custom orders,
   quotations, payments, client gold and karigar sections.
   Loaded before app.js. Uses app.js helpers ($, db, S, esc,
   toast, showSub, openModal …) only at call time.
   ============================================================ */
'use strict';

const OTYPE_LABEL = { job_work: 'Job work', ready_stock: 'Ready stock', custom: 'Custom order' };
const OTYPE_KEY = { 'Job work': 'job_work', 'Ready stock': 'ready_stock', 'Custom order': 'custom' };
const OSTATUS_LABEL = { quote: 'Quotation', new: 'New', in_production: 'In production', ready: 'Ready', delivered: 'Delivered', cancelled: 'Cancelled' };
const OPEN_STATUSES = ['new', 'in_production', 'ready'];
const PURITY = [['24K', 99.5], ['22K', 91.6], ['18K', 75], ['14K', 58.5]];
const SILVER_PURITY = [['999', 99.9], ['925', 92.5]];
const ALL_PURITY = PURITY.concat(SILVER_PURITY);
const ITEM_CATS = ['Necklace', 'Choker', 'Long haar', 'Earrings', 'Jhumka', 'Bangles', 'Kada', 'Ring', 'Pendant set',
  'Maang tikka', 'Bracelet', 'Nath', 'Other'];
const PAY_MODES = ['Cash', 'UPI', 'Bank', 'Cheque', 'Old gold'];
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
function inr(n) { return '₹' + Math.round(num(n)).toLocaleString('en-IN'); }
function grams(n) { return (Math.round(num(n) * 1000) / 1000).toLocaleString('en-IN', { maximumFractionDigits: 3 }) + ' g'; }
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
function statusFlow(type) {
  return type === 'ready_stock' ? ['new', 'ready', 'delivered'] : ['new', 'in_production', 'ready', 'delivered'];
}
function chipStatus(s) {
  return '<span class="chip chip-st-' + esc(s) + '">' + esc(OSTATUS_LABEL[s] || s) + '</span>';
}
function chipOType(t) {
  return '<span class="chip chip-otype">' + esc(OTYPE_LABEL[t] || t) + '</span>';
}
function isOpenStatus(s) { return OPEN_STATUSES.indexOf(s) !== -1; }
function isLive(o) { return o.status !== 'cancelled' && o.status !== 'quote'; }
function balanceOf(o) { return Math.max(0, round2(num(o.total_amount) - num(o.paid_amount))); }
function dueHTML(o) {
  if (!o.due_date || !isOpenStatus(o.status)) return o.due_date ? 'Due ' + esc(fmtD(o.due_date)) : '';
  const late = o.due_date < todayStr();
  return '<span class="' + (late ? 'o-late' : '') + '">' + (late ? '' : 'Due ') + esc(dueLabel(o.due_date)) + '</span>';
}

/* ---------------- calculations ---------------- */
function orderCalc(o, items) {
  const type = o.order_type;
  let net = 0, gross = 0, stones = 0, pcs = 0;
  (items || []).forEach((it) => {
    net += num(it.net_wt); gross += num(it.gross_wt); stones += num(it.stone_amount);
    pcs += Math.max(0, parseInt(it.qty, 10) || 0);
  });
  const rate = type === 'job_work' ? 0 : num(o.rate_per_g);
  const metalValue = net * rate;
  const wastageValue = type === 'job_work' ? 0 : net * num(o.wastage_pct) / 100 * rate;
  const making = net * num(o.making_per_g);
  const subtotal = metalValue + wastageValue + making + stones;
  const taxable = Math.max(0, subtotal - num(o.discount));
  const gst = taxable * num(o.gst_pct) / 100;
  return {
    net, gross, pcs, stones, metalValue, wastageValue, making,
    subtotal: round2(subtotal), taxable: round2(taxable), gst: round2(gst), total: Math.round(taxable + gst),
  };
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
    (numOrNull(o.karigar_labour) != null ? '<div class="o-lrow"><span>Karigar labour</span><b>' + inr(o.karigar_labour) + '</b></div>' : '') +
    '</div>';
}

/* ---------------- catalogue status follows the order ---------------- */
function catStatusFor(orderStatus) {
  return orderStatus === 'quote' ? null : orderStatus === 'cancelled' ? 'available' : orderStatus === 'delivered' ? 'sold' : 'reserved';
}
const HOLDING_STATUSES = ['new', 'in_production', 'ready', 'delivered'];   // orders that hold their catalogue pieces

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

/* ---------------- karigar account entries that come from an order ---------------- */
async function syncOrderKarigarTxns(orderId, o, label) {
  const { data: old } = await db.from('karigar_txns').select('id, kind').eq('order_id', orderId).eq('auto', true);
  const have = {};
  const extra = [];
  (old || []).forEach((t) => { if (!have[t.kind]) have[t.kind] = t.id; else extra.push(t.id); });
  if (extra.length) await db.from('karigar_txns').delete().in('id', extra);
  const pur = o.purity != null ? o.purity : 100;
  const metal = o.metal === 'Silver' ? 'Silver' : 'Gold';
  const want = {};
  if (o.karigar_id && o.karigar_issued_g != null) want.issue = { txn_date: o.karigar_issued_on || o.order_date, weight_g: o.karigar_issued_g, purity: pur, amount: null, metal };
  if (o.karigar_id && o.karigar_received_g != null) want.receive = { txn_date: o.karigar_received_on || o.order_date, weight_g: o.karigar_received_g, purity: pur, amount: null, metal };
  if (o.karigar_id && o.karigar_labour != null) want.labour = { txn_date: o.karigar_received_on || o.karigar_issued_on || o.order_date, weight_g: null, purity: null, amount: o.karigar_labour, metal };
  for (const kind of ['issue', 'receive', 'labour']) {
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
    '<div class="action-row" style="margin-bottom:12px">' +
    '<button class="btn btn-primary" data-action="o-tab-new">＋ New order</button>' +
    '<button class="btn btn-secondary" data-action="dues-open">Client dues</button>' +
    '</div>' +
    '<div class="search-box"><input type="text" id="o-search" placeholder="Search client or order no…" autocomplete="off" value="' + esc(L.q) + '"></div>' +
    '<div class="filter-chips">' + chip('status', 'open', 'Open') + chip('status', 'ready', 'Ready') + chip('status', 'quote', 'Quotations') +
    chip('status', 'delivered', 'Delivered') + chip('status', 'cancelled', 'Cancelled') + chip('status', 'all', 'All') + '</div>' +
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
  let q = db.from('orders').select('id, order_no, order_type, status, order_date, due_date, total_amount, paid_amount, clients!inner(trade_name, city)');
  if (L.status === 'open') q = q.in('status', OPEN_STATUSES);
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
  const live = rows.filter(isLive);
  const due = live.reduce((a, o) => a + balanceOf(o), 0);
  const quotesOnly = L.status === 'quote';
  S.stepInfo = typeof loadStepInfo === 'function' ? await loadStepInfo(rows.filter((o) => isOpenStatus(o.status)).map((o) => o.id)) : null;
  if (!$('#o-list')) return;
  box.innerHTML =
    '<div class="stat-row">' +
    '<div class="stat"><div class="st-num">' + rows.length + (rows.length >= 300 ? '+' : '') + '</div><div class="st-label">' + (quotesOnly ? 'Quotations' : 'Orders') + '</div></div>' +
    '<div class="stat"><div class="st-num o-num-sm">' + inr((quotesOnly ? rows : live).reduce((a, o) => a + num(o.total_amount), 0)) + '</div><div class="st-label">' + (quotesOnly ? 'Quoted value' : 'Order value') + '</div></div>' +
    (quotesOnly ? '' : '<div class="stat"><div class="st-num o-num-sm' + (due > 0 ? ' o-red' : '') + '">' + inr(due) + '</div><div class="st-label">Balance due</div></div>') +
    '</div><div style="height:8px"></div>' +
    rows.map((o) => orderListItemHTML(o, true)).join('');
}

function orderListItemHTML(o, showClient) {
  const bal = balanceOf(o);
  const cl = o.clients || {};
  return '<div class="list-item" data-action="o-open" data-id="' + o.id + '">' +
    '<div class="li-main">' +
    '<div class="li-title">' + ordNo(o.order_no) + (showClient ? ' · ' + esc(cl.trade_name || '') : '') + '</div>' +
    '<div class="li-sub">' + esc(OTYPE_LABEL[o.order_type] || '') + ' · ' + esc(fmtD(o.order_date)) +
    (o.due_date ? ' · ' + dueHTML(o) : '') + '</div>' +
    '<div class="li-chips">' + chipStatus(o.status) +
    (S.stepInfo && S.stepInfo.get(o.id) && S.stepInfo.get(o.id).total && isOpenStatus(o.status)
      ? '<span class="chip chip-step">⚙ ' + esc(S.stepInfo.get(o.id).cur || 'All steps done') + ' · ' + S.stepInfo.get(o.id).done + '/' + S.stepInfo.get(o.id).total + '</span>' : '') +
    (num(o.total_amount) ? '<span class="chip chip-cat">' + inr(o.total_amount) + '</span>' : '') +
    (bal > 0 && isLive(o) ? '<span class="chip chip-hot">Due ' + inr(bal) + '</span>' : '') +
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
    id: null, orderNo: null, status: null, oldItemIds: [], oldCatIds: [], gstTouched: false, rateAuto: true,
    client: { id: client.id, trade_name: client.trade_name, city: client.city },
    items: [blankItem()],
    o: { order_date: todayStr(), due_date: '', gst_pct: typeKey === 'job_work' ? '5' : typeKey ? '3' : '', discount: '', karigar_id: '' },
  };
  S.formState = {
    o_type: typeKey ? OTYPE_LABEL[typeKey] : null, o_metal: 'Gold', o_purity: '22K', o_jw_purity: '22K', o_pay_mode: 'Cash',
  };
  if (pending && pending.length && typeof addCatItemsToOrder === 'function') addCatItemsToOrder(pending);
  S.formState.o_color = commonColor(S.ord.items) || null;
  applyAutoRate();
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
    // keep a custom GST; a default one follows the type if the type is changed
    gstTouched: num(o.gst_pct) !== (o.order_type === 'job_work' ? 5 : 3),
    rateAuto: false,
    client: o.clients || { id: o.client_id, trade_name: 'Client' },
    items: items.map((it) => Object.assign({
      category: s(it.category), description: s(it.description), design_code: s(it.design_code), qty: s(it.qty || 1),
      gross_wt: s(it.gross_wt), net_wt: s(it.net_wt), stone_details: s(it.stone_details),
      stone_amount: num(it.stone_amount) ? s(it.stone_amount) : '', size: s(it.size), photo_path: it.photo_path, _photo: null,
      catalogue_id: it.catalogue_id || null, cat_photo: it.catalogue_id ? catPhoto.get(it.catalogue_id) || null : null,
    }, jewelForm(it))),
    o: {
      order_date: s(o.order_date), due_date: s(o.due_date), rate_per_g: s(o.rate_per_g), making_per_g: s(o.making_per_g),
      wastage_pct: s(o.wastage_pct), discount: num(o.discount) ? s(o.discount) : '', gst_pct: s(o.gst_pct),
      client_metal_g: s(o.client_metal_g), client_metal_on: s(o.client_metal_on), karigar_id: s(o.karigar_id),
      karigar_issued_g: s(o.karigar_issued_g), karigar_issued_on: s(o.karigar_issued_on),
      karigar_received_g: s(o.karigar_received_g), karigar_received_on: s(o.karigar_received_on), karigar_labour: s(o.karigar_labour),
      notes: s(o.notes), legacy_karigar: o.karigar_id ? '' : s(o.karigar_name),
    },
  };
  if (!S.ord.items.length) S.ord.items.push(blankItem());
  S.formState = {
    o_type: OTYPE_LABEL[o.order_type], o_metal: o.metal || 'Gold', o_purity: purityKey(o.purity),
    o_jw_purity: purityKey(o.client_metal_purity) || '22K', o_pay_mode: 'Cash',
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

/* The order-level values as the calculator expects them. */
function formOrderObj() {
  const o = Object.assign({}, S.ord.o);
  o.order_type = curOType();
  o.metal = S.formState.o_metal || 'Gold';
  // a purity left over from the other metal is never saved
  o.purity = purityOptions(o.metal).indexOf(S.formState.o_purity) > -1 ? purityVal(S.formState.o_purity) : null;
  o.client_metal_purity = purityVal(S.formState.o_jw_purity);
  return o;
}

/* fill the metal rate from today's gold rate until the user types their own */
function applyAutoRate() {
  if (!S.ord || !S.ord.rateAuto || typeof rateFor !== 'function') return;
  const r = rateFor(S.formState.o_metal || 'Gold', purityVal(S.formState.o_purity));
  S.ord.o.rate_per_g = r ? String(r) : (S.ord.o.rate_per_g || '');
  const el = $('#o-rate'); if (el) el.value = S.ord.o.rate_per_g || '';
  const h = $('#o-rate-hint');
  if (h) h.textContent = r ? (S.formState.o_metal === 'Silver' ? 'Silver rate of ' : 'Gold rate of ') + rateDateLabel() : '';
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

    '<div class="section-label">Items</div>' +
    '<div id="o-items"></div>' +
    '<div class="action-row" style="margin-bottom:4px">' +
    '<button class="btn btn-secondary" data-action="o-item-add">＋ Add item</button>' +
    '<button class="btn btn-secondary" data-action="o-cat-pick">Pick from catalogue</button>' +
    '</div>' +

    '<div class="section-label">Metal &amp; rate</div>' +
    '<div class="card">' +
    '<div class="field"><label>Metal</label>' + segHTML('o_metal', ['Gold', 'Silver'], S.formState.o_metal) + '</div>' +
    '<div class="field"><label>Purity</label><div id="o-purity-wrap">' + segHTML('o_purity', purityOptions(S.formState.o_metal), S.formState.o_purity) + '</div></div>' +
    '<div class="field"><label id="o-color-label">' + colorFieldLabel(S.formState.o_metal) + '</label><div id="o-color-wrap">' + orderColorSegHTML() + '</div>' +
    '<div class="hint">Sets every item. If one item is different, change it in that item\'s box.</div></div>' +
    '<div class="o-2col">' +
    '<div class="field" id="o-rate-wrap"><label>Metal rate ₹ / g</label>' + numIn('rate_per_g', 'e.g. 7200', 'o-rate') + '<div class="hint" id="o-rate-hint"></div></div>' +
    '<div class="field"><label id="o-making-label">Making ₹ / g</label>' + numIn('making_per_g', 'e.g. 450') + '</div>' +
    '</div>' +
    '<div class="field" style="margin-bottom:2px"><label>Wastage %</label>' + numIn('wastage_pct', 'e.g. 4') + '<div class="hint" id="o-wastage-hint"></div></div>' +
    '</div>' +

    '<div id="o-sec-jw">' +
    '<div class="section-label">Client\'s gold received</div>' +
    '<div class="card">' +
    '<div class="o-2col">' +
    '<div class="field"><label>Weight (g)</label>' + numIn('client_metal_g', 'e.g. 150.500') + '</div>' +
    '<div class="field"><label>Received on</label>' + dateIn('client_metal_on') + '</div>' +
    '</div>' +
    '<div class="field"><label>Purity of their gold</label>' + segHTML('o_jw_purity', PURITY.map((p) => p[0]), S.formState.o_jw_purity) + '</div>' +
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
    '<div class="field" style="margin-bottom:2px"><label>Karigar labour ₹</label>' + numIn('karigar_labour') + '</div>' +
    '<div id="o-kg-ledger"></div>' +
    '</div></div>' +

    '<div class="section-label">Charges</div>' +
    '<div class="card"><div class="o-2col">' +
    '<div class="field"><label>Discount ₹</label>' + numIn('discount', '0') + '</div>' +
    '<div class="field"><label>GST %</label>' + numIn('gst_pct', '3', 'o-gst') + '</div>' +
    '</div><div class="hint" style="margin-top:-6px">Usually 3% on a jewellery sale and 5% on job-work labour — confirm with your CA.</div></div>' +

    '<div class="card o-totals" id="o-totals"></div>' +

    (isNew ?
      '<div class="section-label">Advance received (optional)</div>' +
      '<div class="card"><div class="field"><label>Amount ₹</label>' + numIn('adv_amount', '0') + '</div>' +
      '<div class="field" style="margin-bottom:2px"><label>Mode</label>' + segHTML('o_pay_mode', PAY_MODES, S.formState.o_pay_mode) + '</div></div>' : '') +

    '<div class="section-label">Notes</div>' +
    '<div class="card"><div class="field" style="margin-bottom:0"><textarea data-of="notes" style="min-height:80px" placeholder="Design details, finish, colour of stones, packing, special instructions…">' + fv('notes') + '</textarea></div></div>' +

    (isNew
      ? '<div class="action-row"><button class="btn btn-secondary" data-action="o-save" data-quote="1" id="o-quote-btn">Save as quotation</button>' +
        '<button class="btn btn-primary" data-action="o-save" id="o-save-btn">Save order</button></div>'
      : '<button class="btn btn-primary" data-action="o-save" id="o-save-btn">' + (isQuote ? 'Save quotation' : 'Save changes') + '</button>') +
    '<div style="height:10px"></div>' +
    '</div>';
  redrawOrderItems();
  applyOTypeVisibility();
  if (S.ord.rateAuto) applyAutoRate();
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
      f('stone_details', 'Other stones', 'e.g. kundan, emerald drops', false) +
      f('stone_amount', it.diamond_type ? 'Stones + diamonds ₹' : 'Stone value ₹', '0', true) +
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
  show('#o-rate-wrap', t !== 'job_work');
  const ml = $('#o-making-label'); if (ml) ml.textContent = t === 'job_work' ? 'Labour ₹ / g' : 'Making ₹ / g';
  const hint = $('#o-type-hint');
  if (hint) hint.textContent =
    t === 'job_work' ? 'The client gives the gold — you charge only making / labour. Record their gold below so the balance is tracked.'
      : t === 'ready_stock' ? 'Pieces from your ready stock. Note the tag number and weight of each piece the client picked.'
        : t === 'custom' ? 'Made to the client\'s design at your gold rate. Add a reference photo for each item.'
          : 'Choose one to continue.';
  const wh = $('#o-wastage-hint');
  if (wh) wh.textContent = t === 'job_work' ? 'Gold used up in making — deducted from the client\'s gold.' : 'Charged at the metal rate on the net weight.';
}

function orderRecalcView() {
  const box = $('#o-totals');
  if (!box || !S.ord) return;
  const o = formOrderObj();
  const c = orderCalc(o, S.ord.items);
  const row = (k, v, cls) => '<div class="o-lrow' + (cls ? ' ' + cls : '') + '"><span>' + k + '</span><b>' + v + '</b></div>';
  box.innerHTML =
    row('Net metal weight', grams(c.net) + (c.pcs ? ' · ' + c.pcs + ' pc' + (c.pcs === 1 ? '' : 's') : '')) +
    (o.order_type !== 'job_work' ? row('Metal value', inr(c.metalValue)) : '') +
    (c.wastageValue ? row('Wastage', inr(c.wastageValue)) : '') +
    row(o.order_type === 'job_work' ? 'Labour' : 'Making', inr(c.making)) +
    (c.stones ? row('Stones', inr(c.stones)) : '') +
    (num(o.discount) ? row('Discount', '− ' + inr(o.discount)) : '') +
    row('GST ' + (num(o.gst_pct) || 0) + '%', inr(c.gst)) +
    row('Order total', inr(c.total), 'o-total');
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
    } else if (it && (key === 'diamond_ct' || key === 'diamond_rate')) {
      const v = jewelAutoStoneValue(it);
      if (v != null) {
        it.stone_amount = v;
        const el = document.querySelector('[data-oi="stone_amount"][data-idx="' + idx + '"]');
        if (el) el.value = v;
      }
    }
    orderRecalcView();
  } else if (t.dataset.of) {
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
    if (t.dataset.of === 'gst_pct') S.ord.gstTouched = true;
    if (t.dataset.of === 'rate_per_g') { S.ord.rateAuto = false; const h = $('#o-rate-hint'); if (h) h.textContent = ''; }
    orderRecalcView();
  }
}

function onSegChange(group) {
  if (!S.ord || !$('#order-form')) return;
  if (group === 'o_type') {
    applyOTypeVisibility();
    const t = curOType();
    if (!S.ord.gstTouched && t) {
      const g = t === 'job_work' ? '5' : '3';
      S.ord.o.gst_pct = g;
      const el = $('#o-gst'); if (el) el.value = g;
    }
  }
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
    applyAutoRate();
  }
  if (group === 'o_color') {
    const c = S.formState.o_color || '';
    S.ord.items.forEach((it) => { it.metal_color = c; });
    redrawOrderItems();
  }
  if (group === 'o_purity') applyAutoRate();
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
      } catch (e) { toast('Could not read that image — try again.', 'err'); return; }
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
  const c = orderCalc(o, items);
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
    rate_per_g: t === 'job_work' ? null : numOrNull(o.rate_per_g),
    making_per_g: numOrNull(o.making_per_g),
    wastage_pct: numOrNull(o.wastage_pct),
    discount: round2(num(o.discount)),
    gst_pct: numOrNull(o.gst_pct),
    subtotal: c.subtotal,
    total_amount: c.total,
    client_metal_g: t === 'job_work' ? numOrNull(o.client_metal_g) : null,
    client_metal_purity: t === 'job_work' && numOrNull(o.client_metal_g) != null ? o.client_metal_purity : null,
    client_metal_on: t === 'job_work' ? (o.client_metal_on || null) : null,
    karigar_id: kid,
    karigar_name: kRow ? kRow.name : (kg ? (o.legacy_karigar || null) : null),
    karigar_issued_g: kg ? numOrNull(o.karigar_issued_g) : null,
    karigar_issued_on: kg ? (o.karigar_issued_on || null) : null,
    karigar_received_g: kg ? numOrNull(o.karigar_received_g) : null,
    karigar_received_on: kg ? (o.karigar_received_on || null) : null,
    karigar_labour: kg ? numOrNull(o.karigar_labour) : null,
    notes: String(o.notes || '').trim() || null,
  };

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
    stone_amount: round2(num(it.stone_amount)),
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

  if (isNew && !asQuote && num(o.adv_amount) > 0) {
    const { error: pErr } = await db.from('order_payments').insert({
      order_id: id, amount: round2(num(o.adv_amount)), mode: S.formState.o_pay_mode || null,
      paid_on: row.order_date, note: 'Advance', created_by: S.me.id,
    });
    if (pErr) toast('Order saved, but the advance could not be recorded — add it from the order page.', 'err');
  }

  await db.from('order_updates').insert({
    order_id: id, status: isNew ? status : null,
    note: isNew ? (asQuote ? 'Quotation created' : 'Order created') : 'Details edited', created_by: S.me.id,
  });

  if (!itErr) {
    toast(photoFail ? 'Saved — but a design photo could not be uploaded.' : (isNew ? (asQuote ? 'Quotation saved ✓' : 'Order saved ✓') : 'Saved ✓'), photoFail ? 'err' : 'ok');
    if (isNew && asQuote && num(o.adv_amount) > 0) toast('Quotation saved — the advance was not recorded (record it after the client confirms).');
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
      if (typeof loadOrderSteps === 'function') loadOrderSteps(x);
    };
    if (first) { const x = first; first = null; use(x); }
    else { $('#content').innerHTML = '<div class="empty">Loading…</div>'; fetchOrder(id).then(use); }   // fresh data after Back
  }, replace);
}

function renderOrderPage(o) {
  const cl = o.clients || {};
  const quote = o.status === 'quote';
  const flow = statusFlow(o.order_type);
  const idx = flow.indexOf(o.status);
  const next = idx >= 0 && idx < flow.length - 1 ? flow[idx + 1] : null;
  const bal = balanceOf(o);
  const steps = (o.status === 'cancelled' || quote) ? '' :
    '<div class="o-steps">' + flow.map((s, i) => '<span class="' + (i <= idx ? 'done' : '') + (i === idx ? ' cur' : '') + '">' + esc(OSTATUS_LABEL[s]) + '</span>').join('<i>›</i>') + '</div>';
  const docBtn = (kind, label) => '<button class="btn btn-small btn-secondary" data-action="d-order" data-id="' + o.id + '" data-kind="' + kind + '">' + label + '</button>';

  $('#content').innerHTML =
    '<div class="client-head">' +
    '<h2>' + ordNo(o.order_no) + '</h2>' +
    '<div class="co"><span class="o-headlink" data-action="open-client" data-id="' + o.client_id + '">' + esc(cl.trade_name || 'Client') + ' ›</span>' +
    (cl.city ? ' · ' + esc(cl.city) : '') + '</div>' +
    '<div class="chips">' + chipOType(o.order_type) + chipStatus(o.status) +
    '<span class="chip">' + esc(fmtD(o.order_date)) + '</span>' +
    (o.due_date ? '<span class="chip">' + (isOpenStatus(o.status) && o.due_date < todayStr() ? '⚠ ' : '') + 'Due ' + esc(fmtD(o.due_date)) + '</span>' : '') +
    '</div>' + steps + '</div>' +

    (quote ? '<button class="btn btn-primary" data-action="o-convert" data-id="' + o.id + '" style="margin-bottom:10px">✓ Client agreed — convert to order</button>' : '') +
    (next ? '<button class="btn btn-primary" data-action="o-status" data-id="' + o.id + '" data-s="' + next + '" style="margin-bottom:10px">Mark as ' + esc(OSTATUS_LABEL[next]) + '</button>' : '') +
    (o.status === 'cancelled' ? '<button class="btn btn-primary" data-action="o-status" data-id="' + o.id + '" data-s="new" style="margin-bottom:10px">Reopen order</button>' : '') +

    '<div class="action-row">' +
    (quote ? '' : '<button class="btn btn-secondary" data-action="o-pay" data-id="' + o.id + '" data-bal="' + bal + '">＋ Payment</button>') +
    '<button class="btn btn-secondary" data-action="o-share" data-id="' + o.id + '">WhatsApp</button>' +
    '</div>' +
    '<div class="action-row">' +
    '<button class="btn btn-secondary" data-action="o-edit" data-id="' + o.id + '">Edit</button>' +
    '<button class="btn btn-secondary" data-action="o-note" data-id="' + o.id + '">＋ Note</button>' +
    '</div>' +

    '<div id="o-steps-view"></div>' +

    '<div class="section-label">Documents (PDF)</div>' +
    '<div class="doc-row">' +
    (quote ? docBtn('quote', 'Quotation') : docBtn('slip', 'Order slip')) +
    (!quote ? docBtn('challan', o.order_type === 'job_work' ? 'Job-work challan' : 'Delivery challan') : '') +
    (o.order_type === 'job_work' && numOrNull(o.client_metal_g) != null ? docBtn('receipt', 'Gold receipt') : '') +
    (o.karigar_id && numOrNull(o.karigar_issued_g) != null ? '<button class="btn btn-small btn-secondary" data-action="o-kchallan" data-id="' + o.id + '">Karigar challan</button>' : '') +
    '</div>' +

    '<div class="section-label">Money</div>' +
    '<div class="card" id="o-money"><div class="empty" style="padding:6px">Loading…</div></div>' +
    '<div id="o-items-view"></div>' +
    '<div id="o-ledgers"></div>' +
    (o.notes ? '<div class="section-label">Notes</div><div class="card" style="white-space:pre-wrap;font-size:14.5px">' + esc(o.notes) + '</div>' : '') +
    '<div id="o-payments"></div>' +
    '<div id="o-timeline"></div>' +

    '<div style="display:flex;gap:10px;justify-content:center;margin:18px 0 6px">' +
    (isOpenStatus(o.status) || quote ? '<button class="btn btn-small btn-ghost" data-action="o-status" data-id="' + o.id + '" data-s="cancelled">' + (quote ? 'Client declined' : 'Cancel order') + '</button>' : '') +
    '<button class="btn btn-small btn-danger-ghost" data-action="o-delete" data-id="' + o.id + '">Delete</button>' +
    '</div>';
}

async function loadOrderDetails(o) {
  const [ir, pr, ur] = await Promise.all([
    db.from('order_items').select('*').eq('order_id', o.id).order('sort', { ascending: true }),
    db.from('order_payments').select('*').eq('order_id', o.id).order('paid_on', { ascending: true }).order('created_at', { ascending: true }),
    db.from('order_updates').select('*').eq('order_id', o.id).order('created_at', { ascending: false }).limit(100),
  ]);
  if (!$('#o-money')) return;
  const items = ir.data || [], pays = pr.data || [], ups = ur.data || [];
  const c = orderCalc(o, items);
  const bal = balanceOf(o);
  const quote = o.status === 'quote';
  const disc = pays.filter((p) => p.mode === 'Discount').reduce((a, p) => a + num(p.amount), 0);
  const row = (k, v, cls) => '<div class="o-lrow' + (cls ? ' ' + cls : '') + '"><span>' + k + '</span><b>' + v + '</b></div>';

  // money
  $('#o-money').innerHTML =
    '<div class="o-ledger" style="margin:0;border:0;padding:0;background:none">' +
    row('Net metal weight', grams(c.net) + (o.purity ? ' · ' + esc(purityLabel(o.purity)) : '')) +
    (o.order_type !== 'job_work' && num(o.rate_per_g) ? row('Metal @ ' + inr(o.rate_per_g) + '/g', inr(c.metalValue)) : '') +
    (c.wastageValue ? row('Wastage ' + num(o.wastage_pct) + '%', inr(c.wastageValue)) : '') +
    (num(o.making_per_g) ? row((o.order_type === 'job_work' ? 'Labour' : 'Making') + ' @ ' + inr(o.making_per_g) + '/g', inr(c.making)) : '') +
    (c.stones ? row('Stones', inr(c.stones)) : '') +
    (num(o.discount) ? row('Discount', '− ' + inr(o.discount)) : '') +
    (num(o.gst_pct) ? row('GST ' + num(o.gst_pct) + '%', inr(c.gst)) : '') +
    row(quote ? 'Quoted total' : 'Order total', inr(o.total_amount), 'o-total') +
    (quote ? '' :
      row('Received', inr(num(o.paid_amount) - disc)) +
      (disc ? row('Settlement discount', '− ' + inr(disc)) : '') +
      row('Balance due', inr(bal), bal > 0 ? 'o-due' : 'o-paid') +
      (num(o.paid_amount) - num(o.total_amount) >= 1 ? row('Extra received (refund / adjust)', inr(num(o.paid_amount) - num(o.total_amount)), 'o-due') : '')) +
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
        (it.diamond_type
          ? (it.stone_details ? '<div class="o-item-meta">Other stones: ' + esc(it.stone_details) + '</div>' : '') +
            (num(it.stone_amount) ? '<div class="o-item-meta">Stones + diamonds: ' + inr(it.stone_amount) + '</div>' : '')
          : (it.stone_details || num(it.stone_amount) ? '<div class="o-item-meta">Stones: ' + esc(it.stone_details || '') + (num(it.stone_amount) ? (it.stone_details ? ' — ' : '') + inr(it.stone_amount) : '') + '</div>' : '')) +
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

  // payments
  const pv = $('#o-payments');
  if (pv) pv.innerHTML = quote ? '' : '<div class="section-label">Payments</div>' +
    (pays.length ? '<div class="card">' + pays.map((p) =>
      '<div class="o-pay-row"><div style="flex:1;min-width:0"><b>' + inr(p.amount) + '</b>' + (p.mode ? ' <span class="chip chip-cat">' + esc(p.mode) + '</span>' : '') +
      '<div class="o-item-meta">' + esc(fmtD(p.paid_on)) + (p.note ? ' · ' + esc(p.note) : '') + ' · ' + esc(nameOf(p.created_by)) + '</div></div>' +
      '<button class="fu-x" data-action="o-pay-del" data-id="' + p.id + '" data-order="' + o.id + '" aria-label="Remove payment">✕</button></div>').join('') + '</div>'
      : '<div class="empty" style="padding:10px">No payment recorded yet.</div>');

  // timeline
  const tv = $('#o-timeline');
  if (tv) tv.innerHTML = ups.length ? '<div class="section-label">History</div>' + ups.map((u) =>
    '<div class="timeline-item"><div class="t-meta"><span>' + esc(nameOf(u.created_by)) + '</span><span>' + fmtDT(u.created_at) + '</span></div>' +
    (u.status ? '<div style="margin:2px 0 4px">' + chipStatus(u.status) + '</div>' : '') +
    (u.note ? '<div class="t-notes">' + esc(u.note) + '</div>' : '') + '</div>').join('') : '';
}

/* ---------------- order actions ---------------- */
async function setOrderStatus(id, s) {
  const o = await fetchOrder(id);
  if (!o) return;
  const go = async () => {
    const patch = { status: s };
    if (s === 'delivered') patch.delivered_on = todayStr();
    else patch.delivered_on = null;
    const { error } = await db.from('orders').update(patch).eq('id', id);
    if (error) { toast('Could not update — try again.', 'err'); return; }
    await db.from('order_updates').insert({ order_id: id, status: s, note: null, created_by: S.me.id });
    // a quotation never held its pieces; a cancelled order already let them go
    if (s !== 'cancelled' || HOLDING_STATUSES.indexOf(o.status) > -1) await syncCatalogueForOrder(id, s);
    toast('Marked ' + OSTATUS_LABEL[s] + ' ✓', 'ok');
    openOrder(id, true);
  };
  if (o.status === 'cancelled' && s === 'new') {
    const taken = await piecesTaken(id);
    if (taken.length) { warnPiecesTaken(taken, 'Reopen anyway', go); return; }
  }
  const bal = balanceOf(o);
  if (s === 'cancelled') confirmModal(o.status === 'quote' ? 'Client declined?' : 'Cancel this order?',
    o.status === 'quote' ? 'The quotation will be marked Cancelled. You can reopen it later.' : 'It stays on record as Cancelled. You can reopen it later.',
    o.status === 'quote' ? 'Mark declined' : 'Cancel order', go, true);
  else if (s === 'delivered' && bal > 0) confirmModal('Balance still due', inr(bal) + ' is still unpaid on this order. Mark it delivered anyway?', 'Mark delivered', go);
  else go();
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
  if (taken.length) { warnPiecesTaken(taken, 'Convert anyway', () => doConvertQuote(id)); return; }
  doConvertQuote(id);
}
async function doConvertQuote(id) {
  const { error } = await db.from('orders').update({ status: 'new', order_date: todayStr() }).eq('id', id);
  if (error) { toast('Could not update — try again.', 'err'); return; }
  await db.from('order_updates').insert({ order_id: id, status: 'new', note: 'Converted from quotation', created_by: S.me.id });
  await syncCatalogueForOrder(id, 'new');
  toast('Quotation converted to an order ✓', 'ok');
  openOrder(id, true);
}

function openPayModal(orderId, bal) {
  const ov = openModal(
    '<h3>Add payment</h3><p>' + (bal > 0 ? 'Balance due: <b>' + inr(bal) + '</b>' : 'This order is fully paid.') + '</p>' +
    '<div class="field"><label>Amount ₹</label><input type="text" inputmode="decimal" id="op-amt" value="' + (bal > 0 ? Math.round(bal) : '') + '"></div>' +
    '<div class="o-2col">' +
    '<div class="field"><label>Mode</label><select id="op-mode">' + PAY_MODES.map((m) => '<option value="' + m + '">' + m + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>Date</label><input type="date" id="op-date" value="' + todayStr() + '"></div>' +
    '</div>' +
    '<div class="field"><label>Note (optional)</label><input type="text" id="op-note" placeholder="e.g. Cheque no. / old gold 10 g"></div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Save payment</button></div>');
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    const amt = num($('#op-amt').value);
    if (!(amt > 0)) { toast('Enter the amount received.', 'err'); return; }
    e.target.disabled = true;
    const { error } = await db.from('order_payments').insert({
      order_id: orderId, amount: round2(amt), mode: $('#op-mode').value, paid_on: $('#op-date').value || todayStr(),
      note: $('#op-note').value.trim() || null, created_by: S.me.id,
    });
    if (error) { e.target.disabled = false; toast('Could not save — try again.', 'err'); return; }
    closeModal();
    toast('Payment of ' + inr(amt) + ' recorded ✓', 'ok');
    openOrder(orderId, true);
  };
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
  lines.push('');
  if (num(o.total_amount)) lines.push((quote ? 'Estimated total: ' : 'Total: ') + inr(o.total_amount));
  if (!quote && num(o.paid_amount)) lines.push('Received: ' + inr(o.paid_amount));
  if (!quote && num(o.total_amount)) lines.push('*Balance: ' + inr(balanceOf(o)) + '*');
  if (quote) lines.push('Final price as per the ' + (o.metal === 'Silver' ? 'silver' : 'gold') + ' rate on the day of delivery.');
  lines.push('');
  lines.push('Thank you!');
  window.open(waUrl(cl.mobile, lines.join('\n')), '_blank');
}

async function deleteOrder(id) {
  const o = await fetchOrder(id);
  if (!o) return;
  confirmModal(o.status === 'quote' ? 'Delete this quotation?' : 'Delete this order?',
    'It will be removed permanently with its items, payments and history. To keep a record, use “' + (o.status === 'quote' ? 'Client declined' : 'Cancel order') + '” instead.', 'Delete', async () => {
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
  else if (a === 'o-pay') openPayModal(el.dataset.id, num(el.dataset.bal));
  else if (a === 'o-pay-del') {
    confirmModal('Remove this payment?', 'The balance on the order will go back up by this amount.', 'Remove', async () => {
      const { error } = await db.from('order_payments').delete().eq('id', el.dataset.id);
      if (error) { toast('Could not remove — try again.', 'err'); return; }
      toast('Payment removed', 'ok');
      openOrder(el.dataset.order, true);
    }, true);
  }
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
  const { data, error } = await db.from('orders').select('id, order_no, order_type, status, order_date, due_date, total_amount, paid_amount')
    .eq('client_id', cl.id).order('order_date', { ascending: false }).limit(100);
  if (!$('#client-orders')) return;
  if (error) { el.innerHTML = ''; return; }
  const rows = data || [];
  if (!rows.length) { el.innerHTML = ''; return; }
  const due = rows.filter(isLive).reduce((a, o) => a + balanceOf(o), 0);
  const open = rows.filter((o) => isOpenStatus(o.status)).length;
  el.innerHTML = '<div class="section-label sl-row"><span>Orders (' + rows.length + ')' +
    (open ? ' · ' + open + ' open' : '') + (due > 0 ? ' · <span class="o-red">' + inr(due) + ' due</span>' : '') + '</span>' +
    '<a href="#" data-action="lg-open" data-id="' + cl.id + '">Ledger ›</a></div>' +
    rows.map((o) => orderListItemHTML(o, false)).join('');
}

/* the Today screen's "orders due soon" block */
async function loadTodayOrders() {
  const el = $('#today-orders');
  if (!el) return;
  const { data, error } = await db.from('orders').select('id, order_no, order_type, status, order_date, due_date, total_amount, paid_amount, clients(trade_name)')
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
  let q = db.from('orders').select('order_type, status, total_amount, paid_amount, created_by').limit(5000);
  if (start) q = q.gte('order_date', start);
  const [r, dueR] = await Promise.all([
    q,
    db.from('orders').select('total_amount, paid_amount').in('status', ['new', 'in_production', 'ready', 'delivered']).limit(5000),
  ]);
  if (!$('#report-orders')) return;
  if (r.error) { el.innerHTML = ''; return; }
  const all = r.data || [];
  const rows = all.filter(isLive);
  const cancelled = all.filter((o) => o.status === 'cancelled').length;
  const quotes = all.filter((o) => o.status === 'quote');
  const value = rows.reduce((a, o) => a + num(o.total_amount), 0);
  const recd = rows.reduce((a, o) => a + num(o.paid_amount), 0);
  const allDue = (dueR.data || []).reduce((a, o) => a + balanceOf(o), 0);
  const byType = { job_work: 0, ready_stock: 0, custom: 0 };
  const byStatus = { new: 0, in_production: 0, ready: 0, delivered: 0 };
  const byExec = new Map();
  rows.forEach((o) => {
    byType[o.order_type] = (byType[o.order_type] || 0) + 1;
    byStatus[o.status] = (byStatus[o.status] || 0) + 1;
    if (o.created_by) byExec.set(o.created_by, (byExec.get(o.created_by) || 0) + 1);
  });
  const tchip = (k) => '<button class="brk-chip"' + (byType[k] ? ' data-action="o-report-type" data-v="' + k + '"' : ' style="opacity:.45"') + '>' + OTYPE_LABEL[k] + ' <b>' + byType[k] + '</b></button>';
  el.innerHTML =
    '<div class="section-label">Orders ' + esc(periodLabel(period)) + '</div>' +
    '<div class="stat-row">' +
    '<div class="stat"><div class="st-num">' + rows.length + '</div><div class="st-label">Orders</div></div>' +
    '<div class="stat"><div class="st-num o-num-sm">' + inr(value) + '</div><div class="st-label">Order value</div></div>' +
    '<div class="stat"><div class="st-num o-num-sm">' + inr(recd) + '</div><div class="st-label">Received</div></div>' +
    '</div>' +
    '<div class="brk-row">' + tchip('job_work') + tchip('ready_stock') + tchip('custom') + '</div>' +
    '<div class="brk-row">' + ['new', 'in_production', 'ready', 'delivered'].map((s) =>
      '<span class="brk-chip" style="cursor:default">' + OSTATUS_LABEL[s] + ' <b>' + byStatus[s] + '</b></span>').join('') +
    (cancelled ? '<span class="brk-chip" style="cursor:default;opacity:.6">Cancelled <b>' + cancelled + '</b></span>' : '') +
    (quotes.length ? '<button class="brk-chip" data-action="o-goto" data-s="quote">Quotations <b>' + quotes.length + '</b></button>' : '') + '</div>' +
    (byExec.size ? '<div class="brk-row">' + Array.from(byExec.entries()).sort((a, b) => b[1] - a[1]).map((e) =>
      '<span class="brk-chip" style="cursor:default">' + esc(nameOf(e[0])) + ' <b>' + e[1] + '</b></span>').join('') + '</div>' : '') +
    '<div class="notice" style="margin-top:8px">Balance due on all open and delivered orders: <b>' + inr(allDue) + '</b> · <a href="#" data-action="dues-open">See who owes ›</a></div>';
}

/* extra CSV files for Export */
async function exportOrdersData(pName, cName, today) {
  const results = await Promise.all([
    fetchAll('orders', 'created_at'),
    fetchAll('order_items', 'created_at'),
    fetchAll('order_payments', 'created_at'),
  ]);
  const orders = results[0], items = results[1], pays = results[2];
  const oNo = new Map(orders.map((o) => [o.id, ordNo(o.order_no)]));
  const oClient = new Map(orders.map((o) => [o.id, cName.get(o.client_id) || '']));
  await new Promise((r) => setTimeout(r, 450));
  downloadFile('bj-orders-' + today + '.csv', buildCsv(
    ['Order no', 'Client', 'Type', 'Status', 'Order date', 'Delivery by', 'Delivered on', 'Metal', 'Purity', 'Rate / g', 'Making / g', 'Wastage %',
      'Discount', 'GST %', 'Subtotal', 'Total', 'Received', 'Balance', 'Client gold (g)', 'Client gold purity', 'Client gold on',
      'Karigar', 'Issued to karigar (g)', 'Issued on', 'Received from karigar (g)', 'Received on', 'Karigar labour', 'Notes', 'Created by', 'Created on'],
    orders.map((o) => [ordNo(o.order_no), cName.get(o.client_id) || '', OTYPE_LABEL[o.order_type], OSTATUS_LABEL[o.status], o.order_date, o.due_date || '',
      o.delivered_on || '', o.metal, o.purity, o.rate_per_g, o.making_per_g, o.wastage_pct, o.discount, o.gst_pct, o.subtotal, o.total_amount, o.paid_amount,
      isLive(o) ? balanceOf(o) : '', o.client_metal_g, o.client_metal_purity, o.client_metal_on || '', o.karigar_name, o.karigar_issued_g, o.karigar_issued_on || '',
      o.karigar_received_g, o.karigar_received_on || '', o.karigar_labour, o.notes, pName.get(o.created_by) || '', fmtExp(o.created_at)])));
  await new Promise((r) => setTimeout(r, 450));
  downloadFile('bj-order-items-' + today + '.csv', buildCsv(
    ['Order no', 'Client', '#', 'Piece', 'Tag / design no', 'Description', 'Qty', 'Gross wt (g)', 'Net wt (g)', 'Colour / finish',
      'Diamonds / stones', 'Carats', 'Diamond pcs', 'Diamond quality', 'Rate per ct', 'Diamond certificate', 'Diamond cert no',
      'Jewellery certificate', 'Jewellery cert / HUID no', 'Other stones', 'Stone value', 'Size'],
    items.map((it) => [oNo.get(it.order_id) || '', oClient.get(it.order_id) || '', it.sort + 1, it.category, it.design_code, it.description, it.qty,
      it.gross_wt, it.net_wt, it.metal_color, diamondLabel(it.diamond_type), it.diamond_ct, it.diamond_pcs, it.diamond_quality, it.diamond_rate,
      it.diamond_type ? (it.diamond_cert_lab || 'Not certified') : '', it.diamond_cert_no, it.jewel_cert_type || '', it.jewel_cert_no,
      it.stone_details, it.stone_amount, it.size])));
  await new Promise((r) => setTimeout(r, 450));
  downloadFile('bj-order-payments-' + today + '.csv', buildCsv(
    ['Order no', 'Client', 'Date', 'Amount', 'Mode', 'Note', 'Recorded by'],
    pays.map((p) => [oNo.get(p.order_id) || '', oClient.get(p.order_id) || '', p.paid_on, p.amount, p.mode, p.note, pName.get(p.created_by) || ''])));
}
