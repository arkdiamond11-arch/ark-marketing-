/* ============================================================
   STOCK — more (database update 19)
   · Stock check: scan every tag in the safe; at the end the app lists
     what is missing, what should not be there and tags not in the app.
   · Old stock: pieces lying 3 / 6 months and more; which designs sell
     fast and which slow.
   · Keep a piece for a shop (1 – 30 days): nobody else can bill it.
   · A finished piece from an order goes into stock (its weights and photo).
   · Suggested for a shop: pieces in stock like the ones it bought.
   ============================================================ */
'use strict';

function stock19On() { return !!S.dbv19 && typeof tagsOn === 'function' && tagsOn(); }

/* ---------------- stock check ---------------- */
async function renderStockChecks() {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const { data, error } = await db.from('stock_checks').select('*').order('started_at', { ascending: false }).limit(50);
  if (error) { c.innerHTML = '<div class="empty">Could not load — check the internet.</div>'; return; }
  const open = (data || []).filter((k) => !k.closed_at);
  c.innerHTML = '<div class="notice">Scan every tag in the safe. At the end the app lists the pieces that are missing, pieces that should not be there, and tags that are not in the app.</div>' +
    (open.length ? '' : '<div class="action-row"><button class="btn btn-primary" data-action="sc-start">＋ Start a stock check</button></div>') +
    (data || []).map((k) => '<div class="card li-card" data-action="sc-open" data-id="' + k.id + '" role="button"><div class="li-title">' + esc(k.title || 'Stock check') + '</div>' +
      '<div class="li-sub">' + esc(fmtD(k.started_at) + ' · ' + nameOf(k.started_by) + (k.closed_at ? ' · found ' + k.found + ' / ' + k.expected + (k.missing ? ' · ' + k.missing + ' missing' : '') : ' · going on')) + '</div></div>').join('') ||
    '<div class="empty">No stock checks yet.</div>';
}
async function startStockCheck() {
  const { data, error } = await db.from('stock_checks').insert({ title: 'Stock check ' + fmtD(todayStr()), started_by: S.me.id }).select('*').single();
  if (error || !data) { toast('Could not start — try again.', 'err'); return; }
  openStockCheck(data.id, true);
}
async function openStockCheck(id, replace) {
  showSub('Stock check', () => renderStockCheck(id), replace);
}
async function checkData(id) {
  const [k, s] = await Promise.all([
    db.from('stock_checks').select('*').eq('id', id).maybeSingle(),
    db.from('stock_check_scans').select('*, catalogue_items(id, tag_no, design_no, category, net_wt, diamond_ct, diamond_pcs, cs_ct, status, photo_paths)').eq('check_id', id).order('scanned_at', { ascending: false }).limit(5000),
  ]);
  return { k: k.data, scans: s.data || [] };
}
async function renderStockCheck(id) {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const { k, scans } = await checkData(id);
  if (!k) { c.innerHTML = '<div class="empty">Not found.</div>'; return; }
  S.sc = { id, k, scans };
  if (k.closed_at) { renderCheckResult(); return; }
  const { count } = await db.from('catalogue_items').select('id', { count: 'exact', head: true }).in('status', ['available', 'reserved']);
  const found = scans.filter((x) => x.catalogue_id).length;
  const can = isOwner() || k.started_by === S.me.id;
  c.innerHTML = '<div class="st-tot"><div><b>' + found + '</b><span>Scanned</span></div><div><b>' + (count || 0) + '</b><span>In stock (app)</span></div>' +
    '<div><b>' + scans.filter((x) => !x.catalogue_id).length + '</b><span>Not in the app</span></div></div>' +
    '<div class="st-acts"><button class="btn btn-primary" data-action="sc-scan">📷 Scan tags</button>' +
    '<button class="btn btn-secondary" data-action="sc-type">Type a tag no.</button></div>' +
    '<div class="section-label">Scanned</div>' +
    (scans.length ? scans.slice(0, 300).map(scanLineHTML).join('') : '<div class="empty">Nothing scanned yet.</div>') +
    (can ? '<div class="bl-foot"><button class="btn btn-primary" data-action="sc-close">Close and see the result</button></div>' : '');
  fillCatImages(c);
}
function scanLineHTML(x) {
  const p = x.catalogue_items;
  return '<div class="card rc-item"><div>' + (p ? '<b>' + esc(p.tag_no || p.design_no || 'Piece') + '</b> · ' + esc(stockLine(p)) +
    (['available', 'reserved'].indexOf(p.status) < 0 ? '<div class="rc-sub st-ch-st">' + esc(CAT_STATUS_LABEL[p.status] || p.status) + ' — should not be in the safe</div>' : '')
    : '<b>' + esc(x.code) + '</b> · ' + esc('not in the app')) + '<div class="rc-sub">' + esc(nameOf(x.scanned_by) + ' · ' + fmtDT(x.scanned_at)) + '</div></div></div>';
}
async function scanCode(raw) {
  const C = S.sc;
  if (!C || C.k.closed_at) return { text: 'This stock check is closed', kind: 'err' };
  const list = await findStockByCode(raw);
  const code = tagCode(parseTagText(raw).code || raw) || String(raw).trim();
  let piece = list.length === 1 ? list[0] : list.find((p) => (p.tag_no || '').toUpperCase() === code.toUpperCase()) || null;
  if (!piece && list.length > 1) {
    // a QR with only the design no.: each scan counts the next piece of that design
    const left = list.slice().sort((a, b) => String(a.tag_no).localeCompare(String(b.tag_no))).filter((p) => !C.scans.some((x) => x.catalogue_id === p.id));
    if (!left.length) return { text: code + ' — all ' + list.length + ' pieces of this design are counted', kind: 'err' };
    piece = left[0];
  }
  return addScan(piece, code);
}
async function addScan(piece, code) {
  const C = S.sc;
  if (piece && C.scans.some((x) => x.catalogue_id === piece.id)) return { text: (piece.tag_no || code) + ' — already scanned', kind: 'err' };
  if (!piece && C.scans.some((x) => !x.catalogue_id && String(x.code).toUpperCase() === code.toUpperCase())) return { text: code + ' — already scanned', kind: 'err' };
  const row = piece ? { check_id: C.id, catalogue_id: piece.id, scanned_by: S.me.id } : { check_id: C.id, code, scanned_by: S.me.id };
  const { data, error } = await db.from('stock_check_scans').insert(row).select('*, catalogue_items(id, tag_no, design_no, category, net_wt, diamond_ct, diamond_pcs, cs_ct, status, photo_paths)').single();
  if (error || !data) return { text: String((error && error.code) || '') === '23505' ? code + ' — already scanned' : 'Could not save — try again', kind: 'err' };
  C.scans.unshift(data);
  if (!piece) return { text: code + ' — not in the app', kind: 'err' };
  return { text: (piece.tag_no || code) + ' ✓', kind: ['available', 'reserved'].indexOf(piece.status) < 0 ? 'err' : 'ok' };
}
function stockCheckScan() {
  const again = () => { if (S.sc && $('#content')) renderStockCheck(S.sc.id); };
  const byPhoto = () => readCodeFromPhoto(async (code) => { const r = await scanCode(code); toast(r.text, r.kind === 'ok' ? 'ok' : 'err'); again(); });
  openCodeScanner({ title: 'Scan the tags', sub: 'Point the camera at each tag\'s QR code — the pieces are counted one by one.',
    onCode: (text) => scanCode(text), onDone: again, onPhoto: byPhoto, photoBtn: 'Read the printed side' });
}
function stockCheckType() {
  const ov = openModal('<h3>Type a tag no.</h3><div class="field"><input type="text" id="sc-code" autocapitalize="characters" autocomplete="off"></div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Close</button><button class="btn btn-primary" data-m="yes">Add</button></div>');
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = async () => {
    const v = $('#sc-code').value.trim();
    if (!v) return;
    closeModal();
    const r = await scanCode(v);
    toast(r.text, r.kind === 'ok' ? 'ok' : 'err');
    if (S.sc) renderStockCheck(S.sc.id);
  };
}
async function closeStockCheck() {
  const C = S.sc;
  if (!C) return;
  confirmModal('Close the stock check?', 'Nothing more can be scanned into it. The app compares what was scanned with the stock.', 'Close', async () => {
    const { error } = await db.rpc('stock_check_close', { p_id: C.id });
    if (error) { toast(rpcMsg(error), 'err'); return; }
    renderStockCheck(C.id);
  });
}
async function renderCheckResult() {
  const C = S.sc, k = C.k;
  const miss = k.missing_ids || [];
  let missing = [];
  if (miss.length) {
    const { data } = await db.from('catalogue_items').select('id, tag_no, design_no, category, net_wt, diamond_ct, diamond_pcs, cs_ct, status, photo_paths').in('id', miss.slice(0, 1000));
    missing = data || [];
  }
  const extra = C.scans.filter((x) => x.catalogue_items && ['available', 'reserved'].indexOf(x.catalogue_items.status) < 0);
  const unknown = C.scans.filter((x) => !x.catalogue_id);
  const c = $('#content');
  c.innerHTML = '<div class="st-tot"><div><b>' + (k.found || 0) + ' / ' + (k.expected || 0) + '</b><span>Found</span></div><div><b>' + (k.missing || 0) + '</b><span>Missing</span></div>' +
    '<div><b>' + ((k.extra || 0) + (k.unknown || 0)) + '</b><span>Other tags</span></div></div>' +
    '<div class="bl-made">' + esc('Closed ' + fmtDT(k.closed_at) + ' · ' + nameOf(k.closed_by)) + '</div>' +
    '<div class="action-row"><button class="btn btn-secondary" data-action="sc-wa">WhatsApp</button></div>' +
    (missing.length ? '<div class="section-label">Missing (' + missing.length + ')</div>' + missing.map((p) =>
      '<div class="card rc-item" data-action="cat-open" data-id="' + p.id + '" role="button"><div><b>' + esc(p.tag_no || p.design_no || 'Piece') + '</b> · ' + esc(stockLine(p)) +
      '<div class="rc-sub">' + esc(CAT_STATUS_LABEL[p.status] || p.status) + '</div></div><span class="muted">›</span></div>').join('') : '<div class="notice">Nothing missing ✓</div>') +
    (extra.length ? '<div class="section-label">Should not be in the safe (' + extra.length + ')</div>' + extra.map(scanLineHTML).join('') : '') +
    (unknown.length ? '<div class="section-label">Not in the app (' + unknown.length + ')</div>' + unknown.map((x) =>
      '<div class="card rc-item"><div><b>' + esc(x.code) + '</b></div><button class="btn btn-small btn-secondary" data-action="sc-add" data-code="' + esc(x.code) + '">Add stock</button></div>').join('') : '');
  S.sc.missing = missing;
}
function checkText() {
  const C = S.sc, k = C.k;
  return [k.title || 'Stock check', 'Found ' + (k.found || 0) + ' of ' + (k.expected || 0) + ' · Missing ' + (k.missing || 0)]
    .concat((C.missing || []).slice(0, 60).map((p) => '❌ ' + (p.tag_no || p.design_no || 'Piece') + ' ' + (p.category || '')))
    .concat(C.scans.filter((x) => !x.catalogue_id).map((x) => '❓ ' + x.code + ' — not in the app')).join('\n');
}

/* ---------------- old stock: how long pieces lie, what sells ---------------- */
async function renderOldStock() {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const since = todayStr(-365);
  const [ps, ls] = await Promise.all([
    db.from('catalogue_items').select('id, tag_no, design_no, category, net_wt, diamond_ct, diamond_pcs, cs_ct, status, created_at, photo_paths').in('status', ['available', 'reserved', 'approval']).limit(5000),
    db.from('bill_lines').select('catalogue_id, design_no, category, return_id, bills!inner(bill_date, kind, status), catalogue_items(created_at)').eq('bills.kind', 'sale').eq('bills.status', 'open').gte('bills.bill_date', since).limit(10000),
  ]);
  const days = (iso) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86400000));
  const pcs = (ps.data || []).map((p) => Object.assign({ age: days(p.created_at) }, p)).sort((a, b) => b.age - a.age);
  const band = (lo, hi) => pcs.filter((p) => p.age >= lo && (hi == null || p.age < hi));
  const sold = (ls.data || []).filter((l) => !l.return_id);
  const key = (x) => x.design_no || x.category || 'Other';
  const D = new Map();
  const get = (k) => { if (!D.has(k)) D.set(k, { k, sold: 0, days: 0, n: 0, inStock: 0 }); return D.get(k); };
  sold.forEach((l) => {
    const d = get(key(l)); d.sold++;
    const made = l.catalogue_items && l.catalogue_items.created_at;
    if (made) { d.days += Math.max(0, Math.round((new Date(l.bills.bill_date + 'T12:00:00').getTime() - new Date(made).getTime()) / 86400000)); d.n++; }
  });
  pcs.forEach((p) => { get(key(p)).inStock++; });
  const all = Array.from(D.values());
  const fast = all.filter((d) => d.sold > 0).sort((a, b) => b.sold - a.sold || (a.n ? a.days / a.n : 999) - (b.n ? b.days / b.n : 999)).slice(0, 15);
  const slow = all.filter((d) => d.sold === 0 && d.inStock > 0).sort((a, b) => b.inStock - a.inStock).slice(0, 15);
  const pieceRow = (p) => '<div class="card rc-item" data-action="cat-open" data-id="' + p.id + '" role="button"><div><b>' + esc(p.tag_no || p.design_no || 'Piece') + '</b> · ' + esc(stockLine(p)) +
    '<div class="rc-sub">' + esc(p.age + ' days' + (p.status !== 'available' ? ' · ' + (CAT_STATUS_LABEL[p.status] || p.status) : '')) + '</div></div><span class="muted">›</span></div>';
  const b6 = band(180), b3 = band(90, 180);
  c.innerHTML = '<div class="st-tot"><div><b>' + band(0, 90).length + '</b><span>Under 3 months</span></div><div><b>' + b3.length + '</b><span>3 – 6 months</span></div>' +
    '<div><b>' + b6.length + '</b><span>Over 6 months</span></div></div>' +
    '<div class="section-label">Selling fast (last 12 months)</div>' +
    (fast.length ? '<div class="card bf-total">' + fast.map((d) => '<div class="bf-row"><span>' + esc(d.k) + '</span><b>' + esc(d.sold + ' sold' + (d.n ? ' · ' + Math.round(d.days / d.n) + ' days' : '') + ' · ' + d.inStock + ' in stock') + '</b></div>').join('') + '</div>'
      : '<div class="empty">No sales from the stock yet.</div>') +
    (slow.length ? '<div class="section-label">Not sold in 12 months</div><div class="card bf-total">' + slow.map((d) => '<div class="bf-row"><span>' + esc(d.k) + '</span><b>' + esc(d.inStock + ' in stock') + '</b></div>').join('') + '</div>' : '') +
    (b6.length ? '<div class="section-label">Over 6 months (' + b6.length + ')</div>' + b6.slice(0, 100).map(pieceRow).join('') : '') +
    (b3.length ? '<div class="section-label">3 – 6 months (' + b3.length + ')</div>' + b3.slice(0, 100).map(pieceRow).join('') : '');
}

/* ---------------- keep a piece for a shop ---------------- */
function holdText(it) {
  if (!it || !it.hold_client || !it.hold_till || it.hold_till < todayStr()) return '';
  return 'Kept for ' + (it._holdName || 'a shop') + ' till ' + fmtD(it.hold_till);
}
async function holdName(it) {
  if (!it.hold_client) return;
  const { data } = await db.from('clients').select('trade_name').eq('id', it.hold_client).maybeSingle();
  it._holdName = data && data.trade_name;
}
async function loadCatHold(it) {
  const el = $('#cat-hold');
  if (!el || !stock19On()) return;
  const live = it.hold_client && it.hold_till && it.hold_till >= todayStr();
  if (live) await holdName(it);
  if (!$('#cat-hold')) return;
  const mine = isOwner() || it.hold_by === S.me.id;
  if (live) {
    el.innerHTML = '<div class="notice">🔒 ' + esc(holdText(it)) + (it.hold_by ? esc(' · ' + nameOf(it.hold_by)) : '') +
      (mine ? ' — <a href="#" data-action="hold-free" data-id="' + it.id + '">free it</a>' : '') + '</div>';
  } else if (it.status === 'available') {
    el.innerHTML = '<button class="btn btn-secondary" data-action="hold-set" data-id="' + it.id + '" style="margin-bottom:10px">🔒 Keep for a shop</button>';
  } else el.innerHTML = '';
}
function holdSet(id) {
  pickClientThen('Keep for which shop?', async (cl) => {
    await openCatItem(id, true);   // the piece's page takes the place of the shop list
    let days = 2;
    const ov = openModal('<h3>Keep for ' + esc(cl.trade_name) + '</h3><p>Nobody else can bill it or give it on approval till then.</p>' +
      '<div class="bf-days">' + [1, 2, 3, 7].map((n) => '<button type="button" class="chip-btn' + (n === 2 ? ' on' : '') + '" data-n="' + n + '">' + n + (n === 1 ? ' day' : ' days') + '</button>').join('') + '</div>' +
      '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Keep it</button></div>');
    ov.querySelectorAll('.chip-btn').forEach((b) => { b.onclick = () => { days = +b.dataset.n; ov.querySelectorAll('.chip-btn').forEach((x) => x.classList.toggle('on', x === b)); }; });
    ov.querySelector('[data-m=no]').onclick = closeModal;
    ov.querySelector('[data-m=yes]').onclick = async (e) => {
      e.target.disabled = true;
      const { error } = await db.rpc('stock_hold', { p_id: id, p_client: cl.id, p_days: days });
      closeModal();
      if (error) { toast(rpcMsg(error), 'err'); return; }
      toast('Kept ✓', 'ok');
      openCatItem(id, true);
    };
  });
}
async function holdFree(id) {
  const { error } = await db.rpc('stock_hold', { p_id: id, p_client: null, p_days: null });
  if (error) { toast(rpcMsg(error), 'err'); return; }
  toast('Free again ✓', 'ok');
  openCatItem(id, true);
}

/* ---------------- a finished piece from an order → stock ---------------- */
const FIN_STATUSES = ['finished', 'igi', 'ready', 'cancelled'];
function canStockItem(o, it) { return stock19On() && o && it && it.id && FIN_STATUSES.indexOf(o.status) > -1 && !it.catalogue_id; }
async function itemToStock(orderId, itemId) {
  const { data: it } = await db.from('order_items').select('*').eq('id', itemId).maybeSingle();
  if (!it) { toast('Could not open the piece — try again.', 'err'); return; }
  const { data: had } = await db.from('catalogue_items').select('id').eq('from_item', itemId).limit(1);
  if (had && had.length) { toast('This piece is already in the stock.', 'ok'); openCatItem(had[0].id); return; }
  let piece = null;
  if (it.photo_path) {
    try {
      const u = (await signedUrls('orders', [it.photo_path])).get(it.photo_path);
      if (u) { const r = await fetch(u); if (r.ok) piece = { blob: await r.blob() }; }
    } catch (e) { /* the photo can be taken again */ }
  }
  const s = (v) => (v == null ? '' : String(v));
  startAddStock({ category: it.category || '', gross_wt: s(it.gross_wt), net_wt: s(it.net_wt), dia_ct: s(it.diamond_ct), dia_pcs: s(it.diamond_pcs),
    notes: [it.design_code ? 'Design ' + it.design_code : '', it.size ? 'Size ' + it.size : ''].filter(Boolean).join(' · '), dia_type: it.diamond_type || 'Natural' },
    { order: orderId, item: itemId, piece });
  if (it.metal) S.formState.st_metal = it.metal;
  if (it.purity != null && typeof purityKey === 'function') S.formState.st_purity = purityKey(it.purity, it.metal) || S.formState.st_purity;
  if (it.metal_color) S.formState.st_color = it.metal_color;
  renderAddStock();
}

/* on the order: "In stock — 25RG00101 ›" in place of the button once the piece is in the stock */
async function markStockedItems(orderId) {
  if (!stock19On() || !document.querySelector('[data-action="it-stock"][data-order="' + orderId + '"]')) return;
  const { data } = await db.from('catalogue_items').select('id, tag_no, from_item').eq('from_order', orderId).limit(200);
  (data || []).forEach((k) => {
    const b = document.querySelector('[data-action="it-stock"][data-order="' + orderId + '"][data-id="' + k.from_item + '"]');
    if (b) b.outerHTML = '<a href="#" data-action="cat-open" data-id="' + k.id + '">' + esc('In stock' + (k.tag_no ? ' — ' + k.tag_no : '')) + ' ›</a>';
  });
}

/* ---------------- suggested for a shop ---------------- */
async function loadClientSuggest(cl) {
  const el = $('#client-suggest');
  if (!el || !stock19On()) return;
  const [bl, oi] = await Promise.all([
    db.from('bill_lines').select('category, net_wt, return_id, bills!inner(client_id, kind)').eq('bills.client_id', cl.id).eq('bills.kind', 'sale').limit(500),
    db.from('order_items').select('category, net_wt, orders!inner(client_id)').eq('orders.client_id', cl.id).limit(500),
  ]);
  const bought = (bl.data || []).filter((l) => !l.return_id).concat(oi.data || []).filter((x) => x.category);
  if (!bought.length || S.currentClientId !== cl.id) { el.innerHTML = ''; return; }
  const cats = new Map();
  bought.forEach((x) => { const c = cats.get(x.category) || { n: 0, lo: Infinity, hi: 0 }; c.n++; if (num(x.net_wt) > 0) { c.lo = Math.min(c.lo, num(x.net_wt)); c.hi = Math.max(c.hi, num(x.net_wt)); } cats.set(x.category, c); });
  const { data: ps } = await db.from('catalogue_items').select('id, tag_no, design_no, category, net_wt, diamond_ct, diamond_pcs, cs_ct, status, photo_paths, hold_client, hold_till, created_at')
    .eq('status', 'available').in('category', Array.from(cats.keys())).order('created_at', { ascending: false }).limit(400);
  const fit = (ps || []).filter((p) => {
    if (p.hold_client && p.hold_till >= todayStr() && p.hold_client !== cl.id) return false;
    const c = cats.get(p.category);
    if (!c || !isFinite(c.lo) || !num(p.net_wt)) return true;
    return num(p.net_wt) >= c.lo * 0.7 && num(p.net_wt) <= c.hi * 1.3;
  }).sort((a, b) => (cats.get(b.category).n - cats.get(a.category).n)).slice(0, 12);
  if (!$('#client-suggest') || S.currentClientId !== cl.id) return;
  if (!fit.length) { el.innerHTML = ''; return; }
  S.sgList = fit; S.sgClient = cl; S.sgSel = new Set();
  el.innerHTML = '<div class="section-label sl-row"><span>Suggested from stock</span><span class="hint">' + esc('like what this shop bought') + '</span></div>' +
    '<div class="sg-row">' + fit.map((p) => '<button type="button" class="sg-pc" data-action="sg-tap" data-id="' + p.id + '">' +
      ((p.photo_paths || [])[0] ? '<img data-catimg="' + esc(p.photo_paths[0]) + '" alt="">' : '<span class="cat-noimg">💍</span>') +
      (p.tag_no || p.design_no ? '<b class="noi18n">' + esc(p.tag_no || p.design_no) : '<b>' + esc(p.category)) + '</b><span>' + esc([p.category, num(p.net_wt) ? grams(p.net_wt) : ''].filter(Boolean).join(' · ')) + '</span></button>').join('') + '</div>' +
    '<div class="action-row" id="sg-acts" style="display:none"><button class="btn btn-secondary" data-action="sg-go" data-k="approval">Give on approval</button>' +
    '<button class="btn btn-primary" data-action="sg-go" data-k="sale">Bill</button></div>';
  fillCatImages(el);
}
function sgTap(id) {
  if (!S.sgSel) return;
  if (S.sgSel.has(id)) S.sgSel.delete(id); else S.sgSel.add(id);
  document.querySelectorAll('.sg-pc').forEach((b) => b.classList.toggle('on', S.sgSel.has(b.dataset.id)));
  const a = $('#sg-acts');
  if (a) a.style.display = S.sgSel.size ? '' : 'none';
}
async function sgGo(kind) {
  const ids = Array.from(S.sgSel || []);
  if (!ids.length || !S.sgClient) return;
  const { data } = await db.from('catalogue_items').select('*').in('id', ids);
  startBill(S.sgClient, { kind, pieces: data || [] });
}

onAct('sc-list', () => showSub('Stock check', renderStockChecks));
onAct('sc-start', () => startStockCheck());
onAct('sc-open', (el) => openStockCheck(el.dataset.id));
onAct('sc-scan', () => stockCheckScan());
onAct('sc-type', () => stockCheckType());
onAct('sc-close', () => closeStockCheck());
onAct('sc-wa', () => openWa('', checkText()));
onAct('sc-add', (el) => { const c = el.dataset.code; startAddStock(/^\d{2}[A-Z]/.test(c) ? { tag_no: c, category: tagCategory(c) } : { tag_no: c }); });
onAct('old-stock', () => showSub('Old stock', renderOldStock));
onAct('hold-set', (el) => holdSet(el.dataset.id));
onAct('hold-free', (el) => holdFree(el.dataset.id));
onAct('it-stock', (el) => itemToStock(el.dataset.order, el.dataset.id));
onAct('sg-tap', (el) => sgTap(el.dataset.id));
onAct('sg-go', (el) => sgGo(el.dataset.k));
