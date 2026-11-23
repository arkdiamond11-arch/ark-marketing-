/* ============================================================
   DESIGN PICKS (database update 12) — on the "New designs" page
   (show.html) a shop taps the designs it likes and how many, and
   sends its choice. Each shop's link carries its own number, so the
   choice comes with the shop's name; a forwarded link asks for the
   shop's name and mobile.
   Here: the choices on the message, on the shop's page, on Today and
   in More → Messages to shops → Design picks; one tap makes the order
   (the photos and counts come along). The phones of the person who
   sent the message and the owner ring (send-alerts, kind "pick").
   Loaded after campaigns.js, before app.js.
   ============================================================ */
'use strict';

function picksOn() { return !!S.dbv12 && typeof campaignsOn === 'function' && campaignsOn(); }
const PICK_COLS = 'id, campaign_id, send_id, client_id, shop_name, phone, phone_key, items, note, status, order_id, created_at, updated_at, ' +
  'campaigns(title, photo_paths), clients(trade_name, city, mobile)';
const PICK_STATUS_LABEL = { new: 'New', seen: 'Seen', ordered: 'Order made', closed: 'Done' };

function pickShop(p) { return (p.clients && p.clients.trade_name) || p.shop_name || 'A shop'; }
function pickPhone(p) { return (p.clients && p.clients.mobile) || p.phone || ''; }
function pickCount(p) {
  const it = p.items || [];
  const pcs = it.reduce((n, x) => n + (+x.qty || 1), 0);
  return (it.length === 1 ? '1 design' : it.length + ' designs') + (pcs !== it.length ? ', ' + pcs + ' pieces' : '');
}
/* which photo of the message it is: 1, 2, 3 … */
function pickPhotoNo(p, path) { const ps = (p.campaigns && p.campaigns.photo_paths) || []; const i = ps.indexOf(path); return i > -1 ? i + 1 : null; }

function pickCardHTML(p, opt) {
  opt = opt || {};
  const k = p.campaigns || {};
  const at = p.updated_at || p.created_at;
  const phone = pickPhone(p);
  const thumbs = (p.items || []).map((x) => '<button type="button" class="pk-th" data-action="pk-zoom" data-src="' + esc(promoUrl(x.photo)) + '">' +
    '<img src="' + esc(promoUrl(x.photo)) + '" alt="" loading="lazy">' + (+x.qty > 1 ? '<b>×' + (+x.qty) + '</b>' : '') + '</button>').join('');
  return '<div class="card pk-card st-' + esc(p.status) + '">' +
    '<div class="pk-head"><div class="pk-shop">' +
    (p.client_id && !opt.onClient ? '<a href="#" data-action="open-client" data-id="' + p.client_id + '">' + esc(pickShop(p)) + '</a>' : '<b>' + esc(pickShop(p)) + '</b>') +
    (p.status !== 'seen' ? ' <span class="chip pk-st-' + esc(p.status) + '">' + esc(PICK_STATUS_LABEL[p.status] || p.status) + '</span>' : '') + '</div>' +
    '<div class="pk-when">' + esc(fmtD(at) + ', ' + fmtTime(at)) + '</div></div>' +
    '<div class="pk-sub">' + esc([opt.onCampaign ? '' : (k.title ? '“' + k.title + '”' : ''), pickCount(p), !p.client_id && p.phone ? p.phone : ''].filter(Boolean).join(' · ')) + '</div>' +
    '<div class="pk-items">' + thumbs + '</div>' +
    (p.note ? '<div class="pk-note noi18n">' + esc(p.note) + '</div>' : '') +
    (!p.client_id ? '<div class="hint pk-newshop">Not in your clients yet</div>' : '') +
    '<div class="pk-acts">' +
    (p.order_id ? '<button class="btn btn-small btn-secondary" data-action="o-open" data-id="' + p.order_id + '">Open the order</button>'
      : p.status !== 'closed' ? '<button class="btn btn-small btn-primary" data-action="pk-order" data-id="' + p.id + '">Make order</button>' : '') +
    (phone ? '<button class="btn btn-small btn-secondary" data-action="pk-wa" data-id="' + p.id + '">' + WA_SVG + '<span>WhatsApp</span></button>' +
      '<a class="btn btn-small btn-ghost" href="' + esc(telHref(phone)) + '">Call</a>' : '') +
    (p.status !== 'closed' && p.status !== 'ordered' ? '<button class="btn btn-small btn-ghost" data-action="pk-done" data-id="' + p.id + '">Done</button>' : '') +
    '</div></div>';
}

/* the picks shown on this screen, kept so the buttons find them */
function pickKeep(rows) { S.pickRows = new Map((rows || []).map((p) => [p.id, p])); }
function pickFind(id) { return S.pickRows && S.pickRows.get(id); }
/* new choices are "seen" once someone has had them on the screen */
function pickSeen(rows) {
  const ids = (rows || []).filter((p) => p.status === 'new').map((p) => p.id);
  if (ids.length) db.from('campaign_picks').update({ status: 'seen' }).in('id', ids).eq('status', 'new').then(() => {}, () => {});
}
const PICK_ORDER = { new: 0, seen: 1, ordered: 2, closed: 3 };
function pickSort(rows) {
  return rows.slice().sort((a, b) => (PICK_ORDER[a.status] - PICK_ORDER[b.status]) ||
    ((a.updated_at || a.created_at) < (b.updated_at || b.created_at) ? 1 : -1));
}

/* ---------------- More → Messages to shops → Design picks (and Today) ---------------- */
async function renderPicks() {
  const c = $('#content');
  if (!picksOn()) { c.innerHTML = '<div class="notice">Design picks need the database update (ark-update-12.sql).</div>'; return; }
  c.innerHTML = loadingHTML();
  const since = new Date(Date.now() - 60 * 86400000).toISOString();
  const { data, error } = await db.from('campaign_picks').select(PICK_COLS).gte('updated_at', since).order('updated_at', { ascending: false }).limit(300);
  if (!$('#content')) return;
  if (error) { c.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  const rows = pickSort(data || []);
  pickKeep(rows);
  const group = (label, list) => (list.length ? '<div class="section-label">' + label + ' (' + list.length + ')</div>' + list.map((p) => pickCardHTML(p)).join('') : '');
  c.innerHTML = '<div class="notice">When a shop taps the designs it likes on your message, its choice shows here. One tap makes the order.</div>' +
    (rows.length ? group('New', rows.filter((p) => p.status === 'new')) + group('To do', rows.filter((p) => p.status === 'seen')) +
      group('Order made', rows.filter((p) => p.status === 'ordered')) + group('Done', rows.filter((p) => p.status === 'closed'))
      : '<div class="empty"><div class="big">🛍️</div>No shop has picked designs yet.<br>Send a message with photos from Messages to shops.</div>');
  pickSeen(rows);
}

/* ---------------- on a message (campaigns.js draws it) ---------------- */
async function campaignPicks(campaignId) {
  if (!picksOn()) return [];
  const { data } = await db.from('campaign_picks').select(PICK_COLS).eq('campaign_id', campaignId).order('updated_at', { ascending: false }).limit(500);
  return pickSort(data || []);
}
function campaignPicksHTML(rows) {
  if (!rows || !rows.length) return '';
  pickKeep(rows);
  const open = rows.filter((p) => p.status !== 'closed');
  return '<div class="section-label">Design picks (' + rows.length + ')</div>' +
    (open.length ? open : rows).map((p) => pickCardHTML(p, { onCampaign: true })).join('') +
    (open.length && open.length < rows.length ? '<div class="hint" style="margin:-2px 2px 12px">+ ' + (rows.length - open.length) + ' done — in Design picks</div>' : '');
}

/* ---------------- on the shop's page (its own picks, or picks sent from its mobile) ---------------- */
async function loadClientPicks(cl) {
  const el = $('#client-picks');
  if (!el || !picksOn()) return;
  const m10 = String(normMobile(cl.mobile) || '').replace(/\D/g, '').slice(-10);
  let q = db.from('campaign_picks').select(PICK_COLS);
  q = m10.length === 10 ? q.or('client_id.eq.' + cl.id + ',phone_key.eq.' + m10) : q.eq('client_id', cl.id);
  const { data } = await q.order('updated_at', { ascending: false }).limit(50);
  if (!$('#client-picks') || S.currentClientId !== cl.id) return;
  const rows = pickSort((data || []).filter((p) => p.status !== 'closed'));
  if (!rows.length) { el.innerHTML = ''; return; }
  pickKeep(rows);
  el.innerHTML = '<div class="section-label">Designs this shop picked</div>' + rows.map((p) => pickCardHTML(p, { onClient: true })).join('');
  pickSeen(rows);
}

/* ---------------- one tap: the order ---------------- */
function pickItems(p) {
  const title = (p.campaigns && p.campaigns.title) || '';
  return (p.items || []).map((x) => {
    const it = blankItem();
    const n = pickPhotoNo(p, x.photo);
    it.description = (title ? title + ' — ' : '') + 'design ' + (n || '');
    it.qty = String(+x.qty || 1);
    it._copy = ['promo', x.photo];   // the photo is copied into the order when it is saved
    return it;
  });
}
async function pickMakeOrder(id) {
  const p = pickFind(id);
  if (!p) return;
  if (p.client_id) {
    const cl = await fetchClient(p.client_id);
    if (!cl) return;
    S.pendingCatItems = null;
    S.pendingPick = { id: p.id, items: pickItems(p), note: p.note || '' };
    startNewOrder(cl, null);
    return;
  }
  S.pickFor = p;
  showSub('Which client?', renderPickChooser);
}
/* a choice from a forwarded link: find the shop, or add it first */
function renderPickChooser() {
  const p = S.pickFor;
  if (!p) return;
  $('#content').innerHTML =
    '<div class="notice"><b>' + esc(pickShop(p)) + '</b>' + (p.phone ? ' · ' + esc(p.phone) : '') + ' — choose the client for the order.</div>' +
    '<div class="search-box"><input type="text" id="pk-search" placeholder="Search client name, mobile, city…" autocomplete="off" value="' + esc(p.shop_name || '') + '"></div>' +
    '<div id="pk-results">' + loadingHTML() + '</div>' +
    '<button class="btn btn-secondary" data-action="pk-addclient" style="margin-top:6px">＋ Add it as a new client</button>';
  const inp = $('#pk-search');
  inp.addEventListener('input', () => { clearTimeout(S.searchTimer); S.searchTimer = setTimeout(() => pickChooserSearch(inp.value), 280); });
  pickChooserSearch(inp.value);
}
async function pickChooserSearch(qRaw) {
  const box = $('#pk-results');
  if (!box) return;
  const q = String(qRaw || '').trim().replace(/[,%()]/g, ' ').trim();
  let query = db.from('clients').select('id, trade_name, contact_person, city, mobile');
  if (q) { const pat = '%' + q + '%'; query = query.or('trade_name.ilike.' + pat + ',contact_person.ilike.' + pat + ',mobile.ilike.' + pat + ',city.ilike.' + pat).limit(40); }
  else query = query.order('created_at', { ascending: false }).limit(20);
  const { data, error } = await query;
  if (!$('#pk-results')) return;
  if (error) { box.innerHTML = '<div class="empty">Search failed — try again.</div>'; return; }
  box.innerHTML = (data || []).length ? data.map((cl) => '<div class="list-item" data-action="pk-client" data-id="' + cl.id + '"><div class="li-main">' +
    '<div class="li-title">' + esc(cl.trade_name) + '</div><div class="li-sub">' + esc([cl.contact_person, cl.city, cl.mobile].filter(Boolean).join(' · ')) + '</div></div>' +
    '<div class="li-go">›</div></div>').join('') : '<div class="empty">No client matches.</div>';
}
async function pickForClient(clientId) {
  const p = S.pickFor;
  const cl = await fetchClient(clientId);
  if (!p || !cl) return;
  S.pendingCatItems = null;
  S.pendingPick = { id: p.id, items: pickItems(p), note: p.note || '' };
  startNewOrder(cl, null, true);
}
/* the order was saved (orders.js): the choice is done, and belongs to that client */
async function pickOrdered(pickId, orderId, clientId) {
  await db.from('campaign_picks').update({ status: 'ordered', order_id: orderId, client_id: clientId, handled_by: S.me.id }).eq('id', pickId).then(() => {}, () => {});
}

function pickWaText(p) {
  const k = p.campaigns || {};
  return 'Namaste 🙏\nThank you — we got your choice of ' + pickCount(p) + (k.title ? ' from "' + k.title + '"' : '') + '. We will send you the details soon.\n— ' + bizName();
}

onAct('pk-open', () => showSub('Design picks', renderPicks));
onAct('pk-order', (el) => pickMakeOrder(el.dataset.id));
onAct('pk-client', (el) => pickForClient(el.dataset.id));
onAct('pk-addclient', () => {
  const p = S.pickFor;
  if (!p) return;
  S.photos = { front: null, back: null };
  showSub('New Client', () => renderClientForm(null, { trade_name: p.shop_name || '', mobile: normMobile(p.phone || '') }, 'manual'));
});
onAct('pk-wa', (el) => { const p = pickFind(el.dataset.id); if (p) openWa(pickPhone(p), pickWaText(p)); });
onAct('pk-done', async (el) => {
  const p = pickFind(el.dataset.id);
  if (!p) return;
  const { error } = await db.from('campaign_picks').update({ status: 'closed', handled_by: S.me.id }).eq('id', p.id);
  if (error) { toast('Could not save — try again.', 'err'); return; }
  p.status = 'closed';
  toast('Marked done ✓', 'ok');
  const card = el.closest('.pk-card');
  if (card) card.outerHTML = pickCardHTML(p, { onClient: !!$('#client-picks') && !!card.closest('#client-picks'), onCampaign: !!card.closest('#camp-picks') });
});
onAct('pk-zoom', (el) => {
  const ov = openModal('<img class="pk-zoom" src="' + esc(el.dataset.src) + '" alt=""><div class="modal-actions"><button class="btn btn-secondary" data-m="ok">Close</button></div>');
  ov.querySelector('[data-m=ok]').onclick = closeModal;
});
