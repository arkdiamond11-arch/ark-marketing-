/* ============================================================
   FROM THE SHOPS (database update 16)
   · Designs from shops: photos of a design a shop wants made —
     sent from its own page, or from the link for any shop
     (the owner turns that link on and off)
   · Ready-stock links: catalogue pieces chosen for one shop, on a
     page with photos and weights (never rates); the shop taps the
     pieces it wants and the choice comes back here
   ============================================================ */
'use strict';

function designOn() { return !!S.dbv16 && appOn('designs'); }
function stockOn() { return !!S.dbv16 && appOn('stock') && appOn('catalogue'); }
function designUrl(token) { return new URL('design.html#' + token, location.href).href; }
function stockUrl(token) { return new URL('stock.html#' + token, location.href).href; }
const DR_ST = { new: 'New', seen: 'Seen', done: 'Done', declined: 'Not doing' };

/* a list of clients to choose from (a request from the link for any shop has no client yet) */
function renderClientChooser(C) {
  $('#content').innerHTML =
    '<div class="notice">' + C.head + '</div>' +
    '<div class="search-box"><input type="text" id="cc-search" placeholder="Search client name, mobile, city…" autocomplete="off" value="' + esc(C.q || '') + '"></div>' +
    '<div id="cc-results">' + loadingHTML() + '</div>' +
    (C.onAdd ? '<button class="btn btn-secondary" data-action="cc-add" style="margin-top:6px">＋ Add it as a new client</button>' : '');
  S.chooser = C;
  const inp = $('#cc-search');
  inp.addEventListener('input', () => { clearTimeout(S.searchTimer); S.searchTimer = setTimeout(() => chooserSearch(inp.value), 280); });
  chooserSearch(inp.value);
}
async function chooserSearch(qRaw) {
  const box = $('#cc-results');
  if (!box) return;
  const q = String(qRaw || '').trim().replace(/[,%()]/g, ' ').trim();
  let query = db.from('clients').select('id, trade_name, contact_person, city, mobile');
  if (q) { const pat = '%' + q + '%'; query = query.or('trade_name.ilike.' + pat + ',contact_person.ilike.' + pat + ',mobile.ilike.' + pat + ',city.ilike.' + pat).limit(40); }
  else query = query.order('created_at', { ascending: false }).limit(20);
  const { data, error } = await query;
  if (!$('#cc-results')) return;
  if (error) { box.innerHTML = '<div class="empty">Search failed — try again.</div>'; return; }
  box.innerHTML = (data || []).length ? data.map((cl) => '<div class="list-item" data-action="cc-pick" data-id="' + cl.id + '"><div class="li-main">' +
    '<div class="li-title noi18n">' + esc(cl.trade_name) + '</div><div class="li-sub noi18n">' + esc([cl.contact_person, cl.city, cl.mobile].filter(Boolean).join(' · ')) + '</div></div>' +
    '<div class="li-go">›</div></div>').join('') : '<div class="empty">No client matches.</div>';
}
onAct('cc-pick', async (el) => { const C = S.chooser; if (!C) return; const cl = await fetchClient(el.dataset.id); if (cl) C.onPick(cl); });
onAct('cc-add', () => { const C = S.chooser; if (C && C.onAdd) C.onAdd(); });

/* ================= DESIGNS FROM SHOPS ================= */
function designLinkCardHTML() {
  const tok = S.biz && S.biz.design_token;
  if (tok) {
    return '<div class="card dl-card on"><div class="dl-row"><div><b>🔗 Link for any shop: on</b><div class="hint">Put it on your WhatsApp status, Instagram or send it to a new shop — they send photos of a design they want made.</div></div></div>' +
      '<div class="dl-url noi18n">' + esc(designUrl(tok)) + '</div>' +
      '<div class="photo-row"><button class="btn btn-small btn-primary" data-action="dl-share">' + WA_SVG + ' Share</button><button class="btn btn-small btn-secondary" data-action="dl-copy">Copy</button>' +
      (isOwner() ? '<button class="btn btn-small btn-ghost" data-action="dl-off">Turn off</button>' : '') + '</div></div>';
  }
  return '<div class="card dl-card"><div class="dl-row"><div><b>🔗 Link for any shop: off</b><div class="hint">' +
    (isOwner() ? 'Turn it on to get a link any shop can use to send you photos of a design. Shops with their own page can always send designs from it.'
      : 'The owner can turn on a link any shop can use. Shops with their own page can always send designs from it.') + '</div></div>' +
    (isOwner() ? '<button class="btn btn-small btn-primary" data-action="dl-on">Turn on</button>' : '') + '</div></div>';
}
function designLinkText(tok) {
  return 'Namaste 🙏\nWant a design made? Send us photos of it here — from a catalogue, Instagram or your own drawing — and we will call you back with the details:\n' + designUrl(tok) + '\n— ' + bizName();
}
async function designLinkSet(on) {
  const { data, error } = await db.rpc('design_link', { p_on: on });
  if (error) { toast(/owner/i.test(error.message || '') ? 'Only the owner can change this link.' : 'Could not change the link — try again.', 'err'); return; }
  if (S.biz) S.biz.design_token = data || null;
  toast(on ? 'The link for any shop is on ✓' : 'The link for any shop is off', 'ok');
  renderDesigns();
}
async function renderDesigns() {
  const c = $('#content');
  S.dr = S.dr || { show: 'open' };
  c.innerHTML = loadingHTML();
  let q = db.from('design_requests').select('*, clients(id, trade_name, city, mobile)').order('created_at', { ascending: false }).limit(300);
  if (S.dr.show === 'open') q = q.in('status', ['new', 'seen']);
  else if (S.dr.show !== 'all') q = q.eq('status', S.dr.show);
  const [r] = await Promise.all([q, typeof loadBiz === 'function' && Date.now() - (S.bizAt || 0) > 60000 ? loadBiz().catch(() => null) : null]);
  if (!$('#content')) return;
  if (r.error) { c.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  const rows = r.data || [];
  S.dr.rows = rows;
  const chip = (v, label) => '<button class="' + (S.dr.show === v ? 'on' : '') + '" data-action="dr-show" data-v="' + v + '">' + label + '</button>';
  c.innerHTML = designLinkCardHTML() +
    '<div class="filter-chips">' + chip('open', 'Open') + chip('done', 'Done') + chip('declined', 'Not doing') + chip('all', 'All') + '</div>' +
    (rows.length ? rows.map(designCardHTML).join('') : '<div class="empty"><div class="big">📥</div>No designs here.<br>Shops send them from their own page, or from the link for any shop.</div>');
  fillDesignPhotos(c);
  const fresh = rows.filter((x) => x.status === 'new').map((x) => x.id);
  if (fresh.length) db.from('design_requests').update({ status: 'seen' }).in('id', fresh).eq('status', 'new').then(() => {}, () => {});
}
function designShop(r) { return (r.clients && r.clients.trade_name) || r.shop_name || 'A shop'; }
function designPhone(r) { return (r.clients && r.clients.mobile) || r.phone || ''; }
function designCardHTML(r, opt) {
  const o = opt || {};
  const closed = r.status === 'done' || r.status === 'declined';
  const ph = designPhone(r);
  return '<div class="card dr-card' + (closed ? ' closed' : '') + '" id="dr-' + r.id + '">' +
    '<div class="dr-top">' + (o.onClient ? '<b>' + esc('Design sent ' + fmtD(r.created_at)) + '</b>'
      : (r.client_id ? '<a href="#" class="noi18n" data-action="open-client" data-id="' + r.client_id + '">' + esc(designShop(r)) + '</a>' : '<b class="noi18n">' + esc(designShop(r)) + '</b>')) +
    '<span class="chip dr-st-' + esc(r.status) + '">' + esc(DR_ST[r.status] || r.status) + '</span></div>' +
    (o.onClient ? '' : '<div class="dr-sub">' + esc([r.city || (r.clients && r.clients.city) || '', fmtD(r.created_at) + ', ' + fmtTime(r.created_at),
      r.via === 'shop' ? 'from their page' : 'from the link'].filter(Boolean).join(' · ')) + (ph ? ' · <span class="noi18n">' + esc(ph) + '</span>' : '') + '</div>') +
    '<div class="dr-photos">' + (r.photo_paths || []).map((p, i) => '<button type="button" class="dr-ph" data-action="dr-zoom" data-id="' + r.id + '" data-i="' + i + '"><img data-inbox="' + esc(p) + '" alt=""></button>').join('') + '</div>' +
    (r.note ? '<div class="dr-note noi18n">' + esc(r.note) + '</div>' : '') +
    (r.order_id ? '<div class="dr-ord"><a href="#" data-action="open-order" data-id="' + r.order_id + '">' + esc('Order made ›') + '</a></div>' : '') +
    '<div class="photo-row">' +
    (!closed ? '<button class="btn btn-small btn-primary" data-action="dr-order" data-id="' + r.id + '">＋ Order / quotation</button>' : '') +
    (ph ? '<button class="btn btn-small btn-secondary" data-action="dr-wa" data-id="' + r.id + '">' + WA_SVG + ' WhatsApp</button>' : '') +
    (!r.client_id && !o.onClient ? '<button class="btn btn-small btn-secondary" data-action="dr-addclient" data-id="' + r.id + '">＋ Client</button>' : '') +
    (!closed ? '<button class="btn btn-small btn-ghost" data-action="dr-set" data-id="' + r.id + '" data-s="done">✓ Done</button>' +
      '<button class="btn btn-small btn-ghost" data-action="dr-set" data-id="' + r.id + '" data-s="declined">Not doing</button>'
      : '<button class="btn btn-small btn-ghost" data-action="dr-set" data-id="' + r.id + '" data-s="seen">Open again</button>') +
    '</div></div>';
}
async function fillDesignPhotos(root) {
  const imgs = Array.from(root.querySelectorAll('img[data-inbox]'));
  if (!imgs.length) return;
  const m = await signedUrls('inbox', imgs.map((i) => i.dataset.inbox));
  imgs.forEach((im) => { const u = m.get(im.dataset.inbox); if (u) im.src = u; });
}
function designFind(id) { return (S.dr && (S.dr.rows || []).find((x) => x.id === id)) || (S.drClient || []).find((x) => x.id === id); }
async function designSet(id, st) {
  const patch = { status: st, handled_by: S.me.id, handled_at: new Date().toISOString() };
  if (st === 'seen') { patch.handled_by = null; patch.handled_at = null; }
  const { data, error } = await db.from('design_requests').update(patch).eq('id', id).select('id');
  if (error || !data || !data.length) { toast('Could not update — try again.', 'err'); return; }
  toast(st === 'done' ? 'Marked done ✓' : st === 'declined' ? 'Marked “not doing”' : 'Open again', 'ok');
  if ($('#client-inbox') && S.drClientFor) loadClientInbox(S.drClientFor); else renderDesigns();
}
function designItems(r) {
  return (r.photo_paths || []).map((p, i) => {
    const it = blankItem();
    it.description = 'Design from the shop' + ((r.photo_paths || []).length > 1 ? ' — photo ' + (i + 1) : '');
    it.qty = '1';
    it._copy = ['inbox', p];   // the photo is copied into the order when it is saved
    return it;
  });
}
async function designOrder(id) {
  const r = designFind(id);
  if (!r) return;
  const go = (cl) => {
    S.pendingCatItems = null;
    S.pendingPick = { id: r.id, kind: 'design', items: designItems(r), note: r.note || '' };
    startNewOrder(cl, null, !r.client_id);
  };
  if (r.client_id) { const cl = await fetchClient(r.client_id); if (cl) go(cl); return; }
  showSub('Which client?', () => renderClientChooser({
    head: '<b class="noi18n">' + esc(designShop(r)) + '</b>' + (r.phone ? ' · <span class="noi18n">' + esc(r.phone) + '</span>' : '') + ' — choose the client for the order.',
    q: r.shop_name || '', onPick: go, onAdd: () => designAddClient(r),
  }));
}
function designAddClient(r) {
  S.photos = { front: null, back: null };
  S.onClientAdded = (cid) => db.from('design_requests').update({ client_id: cid }).eq('id', r.id).then(() => {}, () => {});
  showSub('New Client', () => renderClientForm(null, { trade_name: r.shop_name || '', mobile: normMobile(r.phone || ''), city: r.city || '' }, 'manual'));
}
/* the order was saved (orders.js): the design is done, and belongs to that client */
async function designOrdered(reqId, orderId, clientId) {
  await db.from('design_requests').update({ status: 'done', order_id: orderId, client_id: clientId, handled_by: S.me.id, handled_at: new Date().toISOString() })
    .eq('id', reqId).then(() => {}, () => {});
}
function designWaText(r) {
  return 'Namaste 🙏\nThank you — we got the design you sent. We will send you the details soon.\n— ' + bizName();
}
onAct('dr-open', () => { S.dr = null; showSub('Designs from shops', renderDesigns); });
onAct('open-order', (el) => { if (el.dataset.id) openOrder(el.dataset.id); });   // "Order made ›" on a design or a ready-stock choice
onAct('dr-show', (el) => { S.dr.show = el.dataset.v; renderDesigns(); });
onAct('dr-set', (el) => designSet(el.dataset.id, el.dataset.s));
onAct('dr-order', (el) => designOrder(el.dataset.id));
onAct('dr-addclient', (el) => { const r = designFind(el.dataset.id); if (r) designAddClient(r); });
onAct('dr-wa', (el) => { const r = designFind(el.dataset.id); if (r) openWa(designPhone(r), designWaText(r)); });
onAct('dr-zoom', async (el) => {
  const r = designFind(el.dataset.id);
  if (!r) return;
  const m = await signedUrls('inbox', r.photo_paths || []);
  const slides = (r.photo_paths || []).map((p) => ({ u: m.get(p), cap: designShop(r) })).filter((x) => x.u);
  if (slides.length) photoViewer(designShop(r), slides, null, null, Math.min(+el.dataset.i || 0, slides.length - 1));
});
onAct('dl-on', () => designLinkSet(true));
onAct('dl-off', () => confirmModal('Turn the link off?', 'Shops with the link will not be able to send designs from it. Turning it on again makes a new link.', 'Turn off', () => designLinkSet(false)));
onAct('dl-share', () => { const t = S.biz && S.biz.design_token; if (t) openWa('', designLinkText(t)); });
onAct('dl-copy', async () => {
  const t = S.biz && S.biz.design_token;
  if (!t) return;
  try { await navigator.clipboard.writeText(designUrl(t)); toast('Link copied ✓', 'ok'); } catch (e) { toast('Could not copy — press and hold the link to copy it.', 'err'); }
});

/* ================= READY-STOCK LINKS ================= */
/* choose pieces in the catalogue picker (catalogue.js), then the shop */
function slCount(l) { return l.live ? 'Live — all pieces in stock' : (l.items || []).length === 1 ? '1 piece' : (l.items || []).length + ' pieces'; }
/* a live link: every piece in stock now (update 19) */
function stockLiveStart() {
  showSub('Which shop?', () => renderClientChooser({ head: 'Which shop is this link for?', onPick: (cl) => stockForm(cl, [], false, true) }));   // the link's page takes the chooser's place
}
function stockStart(cl) {
  S.catPick = { q: '', sel: new Set(), items: [], mode: 'stock', client: cl || null };
  showSub('Choose pieces', renderCatPicker);
}
function stockPicked() {
  const P = S.catPick;
  if (!P || !P.sel.size) { toast('Tap the pieces you want first.', 'err'); return; }
  const ids = P.items.filter((i) => P.sel.has(i.id)).map((i) => i.id);
  if (P.client) { stockForm(P.client, ids); return; }
  showSub('Which shop?', () => renderClientChooser({ head: 'Which shop is this list for?', onPick: (cl) => stockForm(cl, ids, true) }));
}
function stockForm(cl, ids, fromChooser, live) {
  const ov = openModal('<h3>Ready-stock link</h3><p class="noi18n" style="margin-top:-4px"><b>' + esc(cl.trade_name) + '</b></p>' +
    '<p>' + esc(live ? 'All pieces in stock — sold pieces drop off by themselves' : ids.length === 1 ? '1 piece' : ids.length + ' pieces') + '</p>' +
    '<div class="field"><label>Title (the shop sees it)</label><input type="text" id="sf-title" value="' + esc('Ready stock — ' + fmtD(todayStr())) + '"></div>' +
    '<div class="field"><label>Note for the shop (optional)</label><input type="text" id="sf-note" placeholder="e.g. Can be sent this week"></div>' +
    '<div class="field"><label>Open for</label><div class="seg" id="sf-days">' + [['7', '7 days'], ['15', '15 days'], ['30', '30 days'], ['0', 'No end']].map((x, i) =>
      '<button type="button" data-v="' + x[0] + '" class="' + (i === 1 ? 'on' : '') + '">' + x[1] + '</button>').join('') + '</div></div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Make link and send</button></div>');
  let days = 15;
  ov.querySelectorAll('#sf-days button').forEach((b) => { b.onclick = () => { days = +b.dataset.v; ov.querySelectorAll('#sf-days button').forEach((x) => x.classList.toggle('on', x === b)); }; });
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    e.target.disabled = true;
    const row = { client_id: cl.id, title: $('#sf-title').value.trim() || null, note: $('#sf-note').value.trim() || null, items: ids,
      expires_on: days ? todayStr(days) : null, created_by: S.me.id };
    if (live) row.live = true;
    const { data, error } = await db.from('stock_links').insert(row).select('*').single();
    closeModal();
    if (error || !data) { toast('Could not make the link — try again.', 'err'); return; }
    openWa(cl.mobile, stockText(data));
    toast('Link made ✓ — send it on WhatsApp', 'ok');
    // the new list takes the place of the piece picker (and of the shop chooser)
    if (fromChooser && S.sub.length >= 2) S.sub.splice(S.sub.length - 2, 1);
    showSub(cl.trade_name, () => renderStockLink(data.id), true);
  };
}
function stockText(l) {
  return 'Namaste 🙏\nWe have kept some ready pieces for you — see the photos and weights, and tap the ones you want:\n' + stockUrl(l.token) + '\n— ' + bizName();
}
async function stockSeen(ids) {
  const out = new Map();
  if (!ids.length) return out;
  const { data } = await db.from('link_views').select('ref_id, viewed_at').eq('kind', 'stock').in('ref_id', ids).order('viewed_at', { ascending: false }).limit(5000);
  (data || []).forEach((v) => { const x = out.get(v.ref_id); if (x) x.n++; else out.set(v.ref_id, { n: 1, last: v.viewed_at }); });
  return out;
}
function stockOpen(l) { return !l.closed && (!l.expires_on || l.expires_on >= todayStr()); }
async function renderStockLinks() {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const { data, error } = await db.from('stock_links').select('*, clients(trade_name, city), stock_picks(id, items, status, updated_at)').order('created_at', { ascending: false }).limit(200);
  if (!$('#content')) return;
  if (error) { c.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  const rows = data || [];
  const seen = await stockSeen(rows.map((l) => l.id)).catch(() => new Map());
  if (!$('#content')) return;
  c.innerHTML = '<div class="action-row"><button class="btn btn-primary" data-action="sl-new">＋ New ready-stock link</button>' +
    (S.dbv19 ? '<button class="btn btn-secondary" data-action="sl-live">＋ Live link — all stock</button>' : '') + '</div>' +
    '<div class="notice">Choose catalogue pieces for one shop — it sees the photos and weights (never rates) and taps the pieces it wants.</div>' +
    (rows.length ? rows.map((l) => {
      const p = (l.stock_picks || [])[0];
      const v = seen.get(l.id);
      return '<div class="list-item" data-action="sl-open" data-id="' + l.id + '"><div class="li-main">' +
        '<div class="li-title noi18n">' + esc((l.clients && l.clients.trade_name) || '') + '</div>' +
        '<div class="li-sub">' + esc([l.title || '', slCount(l), fmtD(l.created_at)].filter(Boolean).join(' · ')) +
        ' · <span class="noi18n">' + esc(nameOf(l.created_by)) + '</span></div>' +
        '<div class="li-chips">' + (p ? '<span class="chip ' + (p.status === 'new' ? 'pk-st-new' : 'chip-st-delivered') + '">' + esc('🛍️ ' + ((p.items || []).length === 1 ? '1 chosen' : (p.items || []).length + ' chosen') + (p.status === 'new' ? ' · new' : '')) + '</span>' : '') +
        '<span class="chip">' + esc(v ? '👁 Seen' : 'Not seen yet') + '</span>' +
        (!stockOpen(l) ? '<span class="chip">' + esc('Closed') + '</span>' : '') + '</div></div><div class="li-go">›</div></div>';
    }).join('') : '<div class="empty"><div class="big">📦</div>No ready-stock links yet.</div>');
}
async function renderStockLink(id) {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const { data: l, error } = await db.from('stock_links').select('*, clients(id, trade_name, city, mobile), stock_picks(*)').eq('id', id).maybeSingle();
  if (!$('#content')) return;
  if (error || !l) { c.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  const [kr, seen] = await Promise.all([
    l.live ? db.from('catalogue_items').select('*').eq('status', 'available').order('created_at', { ascending: false }).limit(300)
      : db.from('catalogue_items').select('*').in('id', l.items || []),
    stockSeen([l.id]).catch(() => new Map()),
  ]);
  if (!$('#content')) return;
  const byId = new Map((kr.data || []).map((k) => [k.id, k]));
  const items = l.live ? Array.from(byId.values()).filter((k) => !k.hold_client || k.hold_till < todayStr() || k.hold_client === l.client_id)
    : (l.items || []).map((x) => byId.get(x)).filter(Boolean);
  const p = (l.stock_picks || [])[0] || null;
  const chosen = new Set(p ? p.items || [] : []);
  S.sl = { l, items, p };
  const v = seen.get(l.id);
  const open = stockOpen(l);
  const card = (k) => '<div class="cat-card' + (chosen.has(k.id) ? ' picked' : '') + '" data-action="cat-open" data-id="' + k.id + '">' +
    '<div class="cat-img">' + ((k.photo_paths || [])[0] ? '<img data-catimg="' + esc(k.photo_paths[0]) + '" alt="">' : '<span class="cat-noimg">💍</span>') +
    (k.status !== 'available' ? '<span class="cat-badge st-' + esc(k.status) + '">' + esc(CAT_STATUS_LABEL[k.status] || k.status) + '</span>' : '') +
    (chosen.has(k.id) ? '<span class="cat-check">✓</span>' : '') + '</div>' +
    '<div class="cat-body"><div class="cat-tag">' + esc(k.tag_no || k.title || 'Design') + '</div>' +
    '<div class="cat-sub">' + esc([k.category, num(k.gross_wt) ? grams(k.gross_wt) : ''].filter(Boolean).join(' · ')) + '</div></div></div>';
  c.innerHTML = '<div class="client-head"><h2 class="noi18n">' + esc((l.clients && l.clients.trade_name) || '') + '</h2><div class="co">' +
    esc([l.title || '', slCount(l), fmtD(l.created_at)].filter(Boolean).join(' · ')) + '</div>' +
    '<div class="chips"><span class="chip">' + esc(v ? seenText(v) : 'Not seen yet') + '</span>' +
    '<span class="chip">' + esc(!open ? 'Closed' : l.expires_on ? 'Open till ' + fmtD(l.expires_on) : 'Open') + '</span></div></div>' +
    (l.note ? '<div class="card noi18n">' + esc(l.note) + '</div>' : '') +
    (p ? '<div class="section-label">The shop\'s choice</div><div class="card sl-pick">' +
      '<div class="dr-top"><b>' + esc(((p.items || []).length === 1 ? '1 piece chosen' : (p.items || []).length + ' pieces chosen') + ' · ' + fmtD(p.updated_at)) + '</b>' +
      '<span class="chip ' + (p.status === 'new' ? 'pk-st-new' : 'chip-st-delivered') + '">' + esc(p.status === 'new' ? 'New' : p.status === 'done' ? 'Done' : 'Seen') + '</span></div>' +
      (p.note ? '<div class="dr-note noi18n">' + esc(p.note) + '</div>' : '') +
      '<div class="sl-tags noi18n">' + esc(items.filter((k) => chosen.has(k.id)).map((k) => k.tag_no || k.title || '').join(', ')) + '</div>' +
      '<div class="photo-row">' + (p.status !== 'done' ? '<button class="btn btn-small btn-primary" data-action="sl-order">＋ Order with these</button>' +
        '<button class="btn btn-small btn-ghost" data-action="sl-done">✓ Done</button>' : '') +
      (p.order_id ? '<a href="#" class="btn btn-small btn-ghost" data-action="open-order" data-id="' + p.order_id + '">Order ›</a>' : '') + '</div></div>'
      : '<div class="notice">' + esc(v ? 'The shop has seen the list — no choice yet.' : 'The shop has not opened the list yet.') + '</div>') +
    '<div class="action-row">' + (l.clients && l.clients.mobile ? '<button class="btn btn-secondary" data-action="sl-send">' + WA_SVG + ' Send again</button>' : '') +
    '<button class="btn btn-secondary" data-action="sl-copy">Copy link</button></div>' +
    '<div class="section-label">' + esc((l.live ? 'Pieces in stock now (' : 'Pieces on the list (') + items.length + ')') + '</div>' +
    '<div class="cat-grid">' + items.map(card).join('') + '</div>' +
    '<div class="cl-del-row"><button class="btn btn-small btn-ghost" data-action="sl-close">' + (l.closed ? 'Open the list again' : 'Close the list') + '</button>' +
    '<button class="btn btn-small btn-danger-ghost" data-action="sl-del">Delete</button></div>';
  if (typeof fillCatImages === 'function') fillCatImages(c);
  if (p && p.status === 'new') db.from('stock_picks').update({ status: 'seen' }).eq('id', p.id).eq('status', 'new').then(() => {}, () => {});
}
/* the order was saved (orders.js): the shop's choice is done */
async function stockOrdered(pickId, orderId) {
  await db.from('stock_picks').update({ status: 'done', order_id: orderId }).eq('id', pickId).then(() => {}, () => {});
}
onAct('sl-list', () => showSub('Ready-stock links', renderStockLinks));
onAct('sl-new', () => stockStart(null));
onAct('sl-live', () => stockLiveStart());
onAct('sl-new-for', async (el) => { const cl = await fetchClient(el.dataset.id); if (cl) stockStart(cl); });
onAct('sl-open', (el) => { const t = el.querySelector('.li-title'); showSub(t ? t.textContent : 'Ready stock', () => renderStockLink(el.dataset.id)); });
onAct('sl-send', () => { const L = S.sl; if (L && L.l.clients) openWa(L.l.clients.mobile, stockText(L.l)); });
onAct('sl-copy', async () => {
  const L = S.sl;
  if (!L) return;
  try { await navigator.clipboard.writeText(stockUrl(L.l.token)); toast('Link copied ✓', 'ok'); } catch (e) { toast('Could not copy — try again.', 'err'); }
});
onAct('sl-close', async () => {
  const L = S.sl;
  if (!L) return;
  const { data, error } = await db.from('stock_links').update({ closed: !L.l.closed }).eq('id', L.l.id).select('id');
  if (error || !data || !data.length) { toast('Only who made the list, or the owner, can change it.', 'err'); return; }
  toast(L.l.closed ? 'The list is open again ✓' : 'The list is closed', 'ok');
  renderStockLink(L.l.id);
});
onAct('sl-del', () => {
  const L = S.sl;
  if (!L) return;
  confirmModal('Delete this list?', 'The shop\'s link stops working.', 'Delete', async () => {
    const { data, error } = await db.from('stock_links').delete().eq('id', L.l.id).select('id');
    if (error || !data || !data.length) { toast('Only who made the list, or the owner, can delete it.', 'err'); return; }
    toast('Deleted', 'ok');
    goBack();
  }, true);
});
onAct('sl-done', async () => {
  const L = S.sl;
  if (!L || !L.p) return;
  await db.from('stock_picks').update({ status: 'done' }).eq('id', L.p.id);
  renderStockLink(L.l.id);
});
onAct('sl-order', async () => {
  const L = S.sl;
  if (!L || !L.p || !L.l.clients) return;
  const chosen = new Set(L.p.items || []);
  const pieces = L.items.filter((k) => chosen.has(k.id) && k.status === 'available');
  if (!pieces.length) { toast('The chosen pieces are not available any more.', 'err'); return; }
  const cl = await fetchClient(L.l.clients.id);
  if (!cl) return;
  S.pendingPick = { id: L.p.id, kind: 'stock', items: [], note: L.p.note || '' };
  S.pendingCatItems = pieces;
  startNewOrder(cl, 'ready_stock');
});

/* ================= TODAY, THE CLIENT PAGE ================= */
async function inboxNew() {
  const [d, s] = await Promise.all([
    designOn() ? db.from('design_requests').select('id', { count: 'exact', head: true }).eq('status', 'new') : null,
    stockOn() ? db.from('stock_picks').select('id', { count: 'exact', head: true }).eq('status', 'new') : null,
  ]);
  return { designs: (d && d.count) || 0, stock: (s && s.count) || 0 };
}
async function loadClientInbox(cl) {
  const el = $('#client-inbox');
  if (!el || (!designOn() && !stockOn())) return;
  S.drClientFor = cl;
  const [dr, sl] = await Promise.all([
    designOn() ? db.from('design_requests').select('*').eq('client_id', cl.id).in('status', ['new', 'seen']).order('created_at', { ascending: false }).limit(20) : { data: [] },
    stockOn() ? db.from('stock_links').select('id, title, items, created_at, closed, expires_on, stock_picks(items, status)').eq('client_id', cl.id).order('created_at', { ascending: false }).limit(10) : { data: [] },
  ]);
  if (!$('#client-inbox')) return;
  const ds = dr.data || [];
  S.drClient = ds;
  const ls = (sl.data || []).filter((l) => stockOpen(l) || ((l.stock_picks || [])[0] && l.stock_picks[0].status === 'new'));
  el.innerHTML = (ds.length ? '<div class="section-label">Designs sent by this shop</div>' + ds.map((r) => designCardHTML(r, { onClient: true })).join('') : '') +
    (ls.length ? '<div class="section-label">Ready-stock links</div>' + ls.map((l) => {
      const p = (l.stock_picks || [])[0];
      return '<div class="list-item" data-action="sl-open" data-id="' + l.id + '"><div class="li-main"><div class="li-title">' + esc(l.title || 'Ready stock') + '</div>' +
        '<div class="li-sub">' + esc([slCount(l), fmtD(l.created_at)].join(' · ')) + '</div>' +
        (p ? '<div class="li-chips"><span class="chip ' + (p.status === 'new' ? 'pk-st-new' : 'chip-st-delivered') + '">' + esc('🛍️ ' + ((p.items || []).length === 1 ? '1 chosen' : (p.items || []).length + ' chosen')) + '</span></div>' : '') +
        '</div><div class="li-go">›</div></div>';
    }).join('') : '');
  fillDesignPhotos(el);
}
