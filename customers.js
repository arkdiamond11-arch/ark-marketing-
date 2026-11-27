/* ============================================================
   FOR THE SHOPS AND THEIR OWN CUSTOMERS (v35, database update 23)
   · A showroom link for each shop's customers: the shop's name on
     top, your pieces in stock inside (photos, no rates). What a
     customer likes comes here (never her phone number) and goes to
     the shop on WhatsApp.
   · A passport for each piece: the QR on its tag opens a page with
     what it is, its purity and weights, its HUID, who sold it.
   · An order link for the shop's own customer: the shop's name, how
     far the piece has come — no prices, no maker.
   · Before a visit: one page on a shop — what to talk about, dues,
     orders, approval, what it buys and what it liked.
   ============================================================ */
'use strict';

function x23() { return !!S.dbv23; }
function showroomsOn() { return x23() && appOn('showrooms'); }
function showroomUrl(token) { return new URL('showroom.html#' + token, location.href).href; }
function passportUrl(code) { return new URL('piece.html#' + code, location.href).href; }
function trackUrl(token) { return new URL('track.html#' + token, location.href).href; }
async function copyLink(url) {
  try { await navigator.clipboard.writeText(url); toast('Link copied ✓', 'ok'); } catch (e) { toast('Could not copy — press and hold the link to copy it.', 'err'); }
}
function newToken() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => { const r = (Math.random() * 16) | 0; return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16); });
}
function kt(p) { const n = num(p); const m = { 99.9: '24K', 91.6: '22K', 91.7: '22K', 75: '18K', 58.5: '14K', 58.3: '14K', 92.5: '925' }; return n ? m[n] || n + '%' : ''; }
function pieceShort(c) {
  return [c.tag_no || c.design_no || '', c.category || '', [c.metal && c.metal !== 'Gold' ? c.metal : '', kt(c.purity)].filter(Boolean).join(' '),
    num(c.net_wt) ? grams(c.net_wt) : num(c.gross_wt) ? grams(c.gross_wt) : ''].filter(Boolean).join(' · ');
}

/* ---------------- the showroom link of a shop ---------------- */
async function stockCategories() {
  const { data } = await db.from('catalogue_items').select('category').eq('status', 'available').limit(5000);
  const m = new Map();
  (data || []).forEach((r) => { if (r.category) m.set(r.category, (m.get(r.category) || 0) + 1); });
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]);
}
function showroomText(s) {
  return 'Namaste 🙏\nYour own showroom link — share it with your customers. They see our latest designs under your shop\'s name (no rates); ' +
    'when they like a piece, they tap ❤ and the list comes to you on WhatsApp.\n' + showroomUrl(s.token) + '\n— ' + bizName();
}
async function showroomOpen(clientId) {
  if (!x23()) return;
  const [cl, r, cats, seen, lists] = await Promise.all([fetchClient(clientId), db.from('showrooms').select('*').eq('client_id', clientId).maybeSingle(), stockCategories(),
    db.from('link_views').select('viewed_at').eq('kind', 'showroom').eq('ref_id', clientId).order('viewed_at', { ascending: false }).limit(1000),
    db.from('showroom_enquiries').select('id').eq('client_id', clientId).limit(1000)]);
  if (!cl) return;
  const s = r.data || null;
  const sel = new Set((s && s.cats) || []);
  const views = (seen.data || []).length, nLists = (lists.data || []).length;
  const chip = (k, label) => '<button type="button" class="chip-btn' + ((k ? sel.has(k) : !sel.size) ? ' on' : '') + '" data-k="' + esc(k) + '">' + (k ? '<span class="noi18n">' + esc(label) + '</span>' : esc(label)) + '</button>';
  const ov = openModal('<h3>🛍 Showroom for its customers</h3><p class="noi18n"><b>' + esc(cl.trade_name) + '</b>' + (cl.city ? ' · ' + esc(cl.city) : '') + '</p>' +
    (s ? '<div class="sr-link' + (s.active ? '' : ' off') + '"><span class="noi18n">' + esc(showroomUrl(s.token)) + '</span></div>' +
      '<p class="hint">' + esc([s.active ? 'Link on' : 'Link stopped', 'opened ' + views + (views === 1 ? ' time' : ' times'), nLists + (nLists === 1 ? ' list from customers' : ' lists from customers')].join(' · ')) + '</p>' +
      '<div class="sr-acts"><button class="btn btn-small btn-primary" data-m="wa">💬 Send to the shop</button><button class="btn btn-small btn-secondary" data-m="copy">Copy</button>' +
      '<button class="btn btn-small btn-secondary" data-m="open">See the page</button>' + (isOwner() ? '<button class="btn btn-small btn-ghost" data-m="new">New link</button>' : '') + '</div>'
      : '<p class="hint">A link the shop gives its own customers: the shop\'s name on top, your pieces in stock inside — photos, no rates. What a customer likes comes to you, and to the shop on WhatsApp.</p>') +
    '<div class="field"><label>Title on top</label><input type="text" id="sr-title" maxlength="80" autocomplete="off" value="' + esc((s && s.title) || '') + '" placeholder="e.g. Our new collection"></div>' +
    '<div class="field"><label>Which pieces</label><div class="bf-days sr-cats">' + chip('', 'All in stock') + cats.map((k) => chip(k, k)).join('') + '</div></div>' +
    '<label class="sw-row"><span class="sw-t"><b>Show the weights</b><span>Gross and net weight under each piece</span></span><input type="checkbox" class="sw" id="sr-wt"' + (!s || s.show_wt ? ' checked' : '') + '></label>' +
    '<div class="modal-actions">' + (s ? '<button class="btn btn-secondary" data-m="onoff">' + (s.active ? 'Stop the link' : 'Turn it on again') + '</button>' : '<button class="btn btn-secondary" data-m="no">Cancel</button>') +
    '<button class="btn btn-primary" data-m="yes">' + (s ? 'Save' : 'Make the link') + '</button></div>');
  ov.querySelectorAll('.sr-cats .chip-btn').forEach((b) => {
    b.onclick = () => {
      const k = b.dataset.k;
      if (!k) sel.clear(); else if (sel.has(k)) sel.delete(k); else sel.add(k);
      ov.querySelectorAll('.sr-cats .chip-btn').forEach((x) => x.classList.toggle('on', x.dataset.k ? sel.has(x.dataset.k) : !sel.size));
    };
  });
  const q = (m) => ov.querySelector('[data-m=' + m + ']');
  if (q('no')) q('no').onclick = closeModal;
  if (s) {
    q('wa').onclick = () => openWa(cl.mobile, showroomText(s));
    q('copy').onclick = () => copyLink(showroomUrl(s.token));
    q('open').onclick = () => window.open(showroomUrl(s.token), '_blank');
    if (q('new')) q('new').onclick = () => confirmModal('Make a new link?', 'The old link stops working. Send the new one to the shop.', 'New link', async () => {
      const { error } = await db.from('showrooms').update({ token: newToken(), active: true }).eq('client_id', cl.id);
      if (error) { toast('Could not change — try again.', 'err'); return; }
      toast('New link ✓', 'ok');
      showroomOpen(cl.id);
    });
    q('onoff').onclick = async () => {
      const { error } = await db.from('showrooms').update({ active: !s.active }).eq('client_id', cl.id);
      if (error) { toast('Could not change — try again.', 'err'); return; }
      closeModal();
      toast(s.active ? 'Stopped — the link does not open any more.' : 'On again ✓', 'ok');
    };
  }
  q('yes').onclick = async (e) => {
    e.target.disabled = true;
    const row = { title: $('#sr-title').value.trim() || null, cats: [...sel].slice(0, 40), show_wt: $('#sr-wt').checked };
    const res = s ? await db.from('showrooms').update(row).eq('client_id', cl.id).select('*').maybeSingle()
      : await db.from('showrooms').insert(Object.assign({ client_id: cl.id, created_by: S.me.id }, row)).select('*').maybeSingle();
    if (res.error || !res.data) { e.target.disabled = false; toast('Could not save — try again.', 'err'); return; }
    closeModal();
    if (!s) {
      toast('Showroom link ready ✓', 'ok');
      confirmModal('Send it to the shop?', 'On WhatsApp, with a few words on how its customers use it.', 'Send', () => openWa(cl.mobile, showroomText(res.data)));
    } else toast('Saved ✓', 'ok');
    if ($('#content') && $('#content').querySelector('[data-action="sr-new"]')) renderShowrooms();
  };
}

/* every shop's showroom link (Marketing) */
async function renderShowrooms() {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const [{ data, error }, seen, lists] = await Promise.all([db.from('showrooms').select('*, clients(id, trade_name, city)').order('created_at', { ascending: false }).limit(1000),
    db.from('link_views').select('ref_id').eq('kind', 'showroom').limit(10000), db.from('showroom_enquiries').select('client_id').limit(10000)]);
  if (!$('#content')) return;
  if (error) { c.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  const v = new Map(), l = new Map();
  (seen.data || []).forEach((x) => v.set(x.ref_id, (v.get(x.ref_id) || 0) + 1));
  (lists.data || []).forEach((x) => l.set(x.client_id, (l.get(x.client_id) || 0) + 1));
  const list = data || [];
  c.innerHTML = '<button class="btn btn-primary" data-action="sr-new" style="margin-bottom:12px">＋ Showroom link for a shop</button>' +
    '<p class="hint">Each shop shares its own link with its customers — its name on top, your pieces in stock inside. What they like comes to you (Sales → From the showrooms).</p>' +
    (list.length ? list.map((s) => '<div class="card rc-item tap" data-action="sr-open" data-id="' + s.client_id + '"><div><b class="noi18n">' + esc((s.clients || {}).trade_name || '—') + '</b>' +
      '<div class="rc-sub">' + esc([s.active ? 'Link on' : 'Link stopped', 'opened ' + (v.get(s.client_id) || 0) + ' times', (l.get(s.client_id) || 0) + ' lists'].join(' · ')) + '</div></div><span class="mr-go">›</span></div>').join('')
      : '<div class="empty">No showroom links yet.</div>');
}

/* ---------------- what the shops' customers liked ---------------- */
function enquiryText(e, pieces) {
  return 'Namaste 🙏\nYour customer' + (e.name ? ' ' + e.name : '') + ' liked ' + (pieces.length === 1 ? 'this piece' : 'these ' + pieces.length + ' pieces') + ' on your showroom link:\n' +
    pieces.map((p, i) => (i + 1) + '. ' + pieceShort(p)).join('\n') + (e.note ? '\n“' + e.note + '”' : '') +
    '\nShall we keep them for you, or send them on approval?\n— ' + bizName();
}
async function renderEnquiries() {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const { data, error } = await db.from('showroom_enquiries').select('*, clients(id, trade_name, city, mobile)').order('created_at', { ascending: false }).limit(200);
  if (!$('#content')) return;
  if (error) { c.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  const list = data || [];
  const ids = [...new Set(list.flatMap((e) => e.items || []))];
  const pcs = new Map();
  for (let i = 0; i < ids.length; i += 150) {
    const { data: p } = await db.from('catalogue_items').select('id, tag_no, design_no, category, metal, purity, gross_wt, net_wt, status, photo_paths, hold_client, hold_till').in('id', ids.slice(i, i + 150));
    (p || []).forEach((x) => pcs.set(x.id, x));
  }
  if (!$('#content')) return;
  S.enq = new Map(list.map((e) => [e.id, Object.assign(e, { pieces: (e.items || []).map((id) => pcs.get(id)).filter(Boolean) })]));
  const fresh = list.filter((e) => e.status === 'new'), done = list.filter((e) => e.status !== 'new');
  const card = (e) => '<div class="card se-card' + (e.status === 'new' ? ' se-new' : '') + '" id="se-' + e.id + '">' +
    '<div class="se-top"><div>' + (e.name ? '<b class="noi18n">' + esc(e.name) + '</b>' : '<b>' + esc('A customer') + '</b>') + ' · ' +
    '<a href="#" class="noi18n" data-action="open-client" data-id="' + e.client_id + '">' + esc((e.clients || {}).trade_name || '—') + '</a>' +
    '<div class="rc-sub">' + esc(fmtDT(e.created_at) + ' · ' + e.pieces.length + (e.pieces.length === 1 ? ' piece' : ' pieces')) + '</div></div>' +
    (e.status === 'new' ? '<span class="chip se-chip">New</span>' : '<span class="chip">Done</span>') + '</div>' +
    '<div class="se-pcs">' + e.pieces.map((p) => '<button type="button" class="se-pc' + (p.status !== 'available' ? ' off' : '') + '" data-action="open-cat" data-id="' + p.id + '">' +
      ((p.photo_paths || [])[0] ? '<img data-catimg="' + esc(p.photo_paths[0]) + '" alt="">' : '<span class="cat-noimg">💍</span>') +
      '<span class="noi18n">' + esc(p.tag_no || p.design_no || p.category || '') + '</span></button>').join('') + '</div>' +
    (e.note ? '<div class="se-note noi18n">“' + esc(e.note) + '”</div>' : '') +
    '<div class="se-acts"><button class="btn btn-small btn-primary" data-action="se-wa" data-id="' + e.id + '">💬 Tell the shop</button>' +
    (e.pieces.some((p) => p.status === 'available') ? '<button class="btn btn-small btn-secondary" data-action="se-keep" data-id="' + e.id + '">🔒 Keep for the shop</button>' : '') +
    '<button class="btn btn-small btn-ghost" data-action="se-done" data-id="' + e.id + '">' + (e.status === 'new' ? '✓ Done' : 'Open again') + '</button></div></div>';
  c.innerHTML = '<p class="hint">What shops\' customers liked on their showroom links. Their phone numbers are not kept — the shop has them.</p>' +
    (fresh.length ? fresh.map(card).join('') : '<div class="empty">Nothing new.</div>') +
    (done.length ? '<div class="section-label">Done</div>' + done.slice(0, 50).map(card).join('') : '');
  if (typeof fillCatImages === 'function') fillCatImages(c);
  if (S.enqFocus) { const el = $('#se-' + S.enqFocus); S.enqFocus = null; if (el) el.scrollIntoView({ block: 'center' }); }
}
async function enquiryDone(id) {
  const e = S.enq && S.enq.get(id);
  if (!e) return;
  const now = e.status === 'new';
  const { error } = await db.from('showroom_enquiries').update(now ? { status: 'done', done_by: S.me.id, done_at: new Date().toISOString() } : { status: 'new', done_by: null, done_at: null }).eq('id', id);
  if (error) { toast('Could not change — try again.', 'err'); return; }
  renderEnquiries();
}
function enquiryKeep(id) {
  const e = S.enq && S.enq.get(id);
  if (!e) return;
  const ps = e.pieces.filter((p) => p.status === 'available');
  let days = 2;
  const ov = openModal('<h3>Keep for ' + esc((e.clients || {}).trade_name || '') + '</h3><p>' + esc(ps.length + (ps.length === 1 ? ' piece' : ' pieces') + ' — nobody else can bill them or give them on approval till then.') + '</p>' +
    '<div class="bf-days">' + [1, 2, 3, 7].map((n) => '<button type="button" class="chip-btn' + (n === 2 ? ' on' : '') + '" data-n="' + n + '">' + n + (n === 1 ? ' day' : ' days') + '</button>').join('') + '</div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Keep them</button></div>');
  ov.querySelectorAll('.chip-btn').forEach((b) => { b.onclick = () => { days = +b.dataset.n; ov.querySelectorAll('.chip-btn').forEach((x) => x.classList.toggle('on', x === b)); }; });
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = async (ev) => {
    ev.target.disabled = true;
    let bad = 0;
    for (const p of ps) { const { error } = await db.rpc('stock_hold', { p_id: p.id, p_client: e.client_id, p_days: days }); if (error) bad++; }
    closeModal();
    toast(bad ? (ps.length - bad) + ' kept · ' + bad + ' could not be kept' : 'Kept ✓', bad ? 'err' : 'ok');
    renderEnquiries();
  };
}

/* ---------------- the passport of a piece ---------------- */
async function loadCatPassport(it) {
  const el = $('#cat-pass');
  if (!el || !x23() || !it.passport) return;
  el.innerHTML = '<button class="btn btn-secondary" data-action="pp-open" data-id="' + it.id + '" style="margin:0 8px 10px 0">🛡 Passport</button>';
}
async function passportOpen(id) {
  const [{ data: it }, seen] = await Promise.all([db.from('catalogue_items').select('id, tag_no, design_no, category, passport').eq('id', id).maybeSingle(),
    db.from('link_views').select('viewed_at').eq('kind', 'piece').eq('ref_id', id).order('viewed_at', { ascending: false }).limit(500)]);
  if (!it || !it.passport) return;
  const url = passportUrl(it.passport), n = (seen.data || []).length;
  const ov = openModal('<h3>🛡 Passport of this piece</h3><p class="noi18n">' + esc([it.tag_no || it.design_no, it.category].filter(Boolean).join(' · ')) + '</p>' +
    '<div class="pp-qr">' + QR.svg(url, 190) + '</div>' +
    '<p class="hint">The QR on its tag opens it. Anyone who has the piece sees what it is — purity, weights, diamonds, HUID, who sold it. Never a rate.</p>' +
    (n ? '<p class="hint">' + esc('Opened ' + n + (n === 1 ? ' time' : ' times') + ' · last ' + fmtDT(seen.data[0].viewed_at)) + '</p>' : '') +
    '<div class="sr-acts"><button class="btn btn-small btn-primary" data-m="wa">💬 Share</button><button class="btn btn-small btn-secondary" data-m="copy">Copy</button>' +
    '<button class="btn btn-small btn-secondary" data-m="open">See the page</button></div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Close</button></div>');
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=wa]').onclick = () => openWa('', 'The passport of your piece — what it is, its purity, weights and hallmark:\n' + url);
  ov.querySelector('[data-m=copy]').onclick = () => copyLink(url);
  ov.querySelector('[data-m=open]').onclick = () => window.open(url, '_blank');
}
/* a scanned passport QR (piece.html#…) → the piece */
function passportCode(s) { const m = /piece\.html#([0-9a-f-]{36})/i.exec(String(s || '')); return m ? m[1].toLowerCase() : null; }
async function openPassportPiece(code) {
  const { data } = await db.from('catalogue_items').select('id').eq('passport', code).maybeSingle();
  if (data && typeof openCatItem === 'function') openCatItem(data.id);
  else toast('This piece is not in your stock.', 'err');
}

/* ---------------- an order link for the shop's customer ---------------- */
function trackText(o, url) {
  return 'Namaste 🙏\nA link for your customer' + (o.track_name ? ' ' + o.track_name : '') + ' to see how the order is coming along — it shows your shop\'s name, no prices:\n' + url + '\n— ' + bizName();
}
async function trackOpen(orderId) {
  if (!x23()) return;
  const { data: o } = await db.from('orders').select('id, order_no, client_id, status, track_token, track_name, clients(trade_name, mobile)').eq('id', orderId).maybeSingle();
  if (!o) return;
  const cl = o.clients || {};
  const url = o.track_token ? trackUrl(o.track_token) : '';
  let n = 0;
  if (o.track_token) { const { data: v } = await db.from('link_views').select('id').eq('kind', 'track').eq('ref_id', o.id).limit(500); n = (v || []).length; }
  const ov = openModal('<h3>🔗 Link for the shop\'s customer</h3><p class="noi18n">' + esc(cl.trade_name || '') + ' · ' + esc(orderNo(o)) + '</p>' +
    '<p class="hint">The shop sends it to its own customer: the shop\'s name on top, how far the piece has come, the photos — no prices, no maker.</p>' +
    (url ? '<div class="sr-link"><span class="noi18n">' + esc(url) + '</span></div>' + (n ? '<p class="hint">' + esc('Opened ' + n + (n === 1 ? ' time' : ' times')) + '</p>' : '') : '') +
    '<div class="field"><label>Customer\'s name (optional)</label><input type="text" id="tr-name" maxlength="80" autocomplete="off" value="' + esc(o.track_name || '') + '" placeholder="e.g. Mrs. Mehta"></div>' +
    (url ? '<div class="sr-acts"><button class="btn btn-small btn-primary" data-m="wa">💬 Send to the shop</button><button class="btn btn-small btn-secondary" data-m="copy">Copy</button>' +
      '<button class="btn btn-small btn-secondary" data-m="open">See the page</button></div>' : '') +
    '<div class="modal-actions">' + (url ? '<button class="btn btn-secondary" data-m="stop">Stop the link</button>' : '<button class="btn btn-secondary" data-m="no">Cancel</button>') +
    '<button class="btn btn-primary" data-m="yes">' + (url ? 'Save the name' : 'Make the link') + '</button></div>');
  const q = (m) => ov.querySelector('[data-m=' + m + ']');
  if (q('no')) q('no').onclick = closeModal;
  if (url) {
    q('wa').onclick = () => openWa(cl.mobile, trackText(Object.assign({}, o, { track_name: $('#tr-name').value.trim() || o.track_name }), url));
    q('copy').onclick = () => copyLink(url);
    q('open').onclick = () => window.open(url, '_blank');
    q('stop').onclick = () => confirmModal('Stop this link?', 'It stops opening for the customer.', 'Stop', async () => {
      const { error } = await db.rpc('order_track_link', { p_order: o.id, p_on: false });
      if (error) { toast(rpcMsg(error), 'err'); return; }
      toast('Stopped', 'ok');
    });
  }
  q('yes').onclick = async (e) => {
    e.target.disabled = true;
    const name = $('#tr-name').value.trim();
    const { data: tok, error } = await db.rpc('order_track_link', { p_order: o.id, p_on: true, p_name: name });
    if (error || !tok) { e.target.disabled = false; toast(error ? rpcMsg(error) : 'Could not save — try again.', 'err'); return; }
    closeModal();
    if (!url) {
      toast('Link ready ✓', 'ok');
      confirmModal('Send it to the shop?', 'On WhatsApp — the shop forwards it to its customer.', 'Send', () => openWa(cl.mobile, trackText(Object.assign({}, o, { track_name: name }), trackUrl(tok))));
    } else toast('Saved ✓', 'ok');
  };
}
function orderNo(o) { return typeof ordNo === 'function' ? ordNo(o.order_no) : 'ORD-' + String(o.order_no || 0).padStart(4, '0'); }

/* ---------------- before a visit: one page on a shop ---------------- */
async function safeQ(p) { try { const r = await p; return r && !r.error ? r.data : null; } catch (e) { return null; } }
async function briefData(clientId) {
  const t = todayStr(), since = addDaysStr(t, -365), recent = addDaysStr(t, -60);
  const [cl, meets, dues, orders, memos, bills, picks, enq, cases, bookings, offers, credit, opening] = await Promise.all([
    fetchClient(clientId),
    safeQ(db.from('interactions').select('id, exec_id, outcome, notes, happened_at').eq('client_id', clientId).order('happened_at', { ascending: false }).limit(3)),
    S.dbv18 ? safeQ(db.rpc('party_dues')) : null,
    safeQ(db.from('orders').select('id, order_no, status, due_date, cad_state').eq('client_id', clientId).not('status', 'in', '(delivered,declined,cancelled,quote)').limit(200)),
    S.dbv8 ? safeQ(db.from('approvals').select('id, memo_no, given_on, return_by, approval_items(status)').eq('client_id', clientId).limit(200)) : null,
    S.dbv18 ? safeQ(db.from('bills').select('id, bill_date, total_amt').eq('client_id', clientId).eq('kind', 'sale').neq('status', 'cancelled').gte('bill_date', since).order('bill_date', { ascending: false }).limit(500)) : null,
    S.dbv16 ? safeQ(db.from('stock_picks').select('items, updated_at').eq('client_id', clientId).gte('updated_at', recent).limit(50)) : null,
    x23() ? safeQ(db.from('showroom_enquiries').select('items, created_at').eq('client_id', clientId).gte('created_at', recent).limit(200)) : null,
    S.dbv21 ? safeQ(db.from('care_cases').select('id, status').eq('client_id', clientId).eq('status', 'open').limit(50)) : null,
    S.dbv22 ? safeQ(db.from('rate_bookings').select('id, fine_g, rate, valid_till').eq('client_id', clientId).eq('status', 'open').limit(20)) : null,
    S.dbv22 ? safeQ(db.from('making_offers').select('title, pct, from_day, to_day').eq('active', true).lte('from_day', t).gte('to_day', t).limit(5)) : null,
    typeof creditOn === 'function' && creditOn() && typeof creditProblems === 'function' ? creditProblems(clientId).catch(() => []) : [],
    typeof loadOpening === 'function' ? loadOpening(clientId).catch(() => null) : null,
  ]);
  let lines = [];
  if (bills && bills.length) {
    const ids = bills.map((b) => b.id);
    for (let i = 0; i < ids.length; i += 150) lines = lines.concat((await safeQ(db.from('bill_lines').select('category, fine_g, qty').in('bill_id', ids.slice(i, i + 150)))) || []);
  }
  const cats = new Map();
  lines.forEach((l) => { const k = l.category || 'Other'; const x = cats.get(k) || { n: 0, g: 0 }; x.n += l.qty || 1; x.g += num(l.fine_g); cats.set(k, x); });
  const top = [...cats.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 4);
  let inStock = new Map();
  if (top.length && typeof stockOn === 'function') {
    const { data } = await db.from('catalogue_items').select('category').eq('status', 'available').in('category', top.map((x) => x[0])).limit(5000);
    (data || []).forEach((r) => inStock.set(r.category, (inStock.get(r.category) || 0) + 1));
  }
  return { cl, meets: meets || [], due: (dues || []).find((d) => d.client_id === clientId) || null, orders: orders || [], memos: memos || [], bills: bills || [], top, inStock,
    liked: (picks || []).reduce((s, p) => s + (p.items || []).length, 0) + (enq || []).reduce((s, e) => s + (e.items || []).length, 0), enqN: (enq || []).length,
    cases: cases || [], bookings: bookings || [], offers: offers || [], credit: credit || [], opening };
}
function briefPoints(B) {
  const t = todayStr(), out = [];
  const pt = (icon, text, html) => out.push({ icon, text, html });
  if (B.due && (num(B.due.money_due) > 0 || num(B.due.gold_due) > 0)) {
    const days = B.due.oldest ? Math.round((new Date(t) - new Date(B.due.oldest)) / 864e5) : 0;
    pt('💰', 'Collect ' + [num(B.due.money_due) > 0 ? inrNum(B.due.money_due) : '', num(B.due.gold_due) > 0 ? grams(B.due.gold_due) + ' gold' : ''].filter(Boolean).join(' · ') +
      (days > 0 ? ' — oldest bill ' + days + (days === 1 ? ' day' : ' days') : ''));
  }
  B.credit.forEach((p) => pt('⛔', p.text));
  const late = B.orders.filter((o) => o.due_date && o.due_date < t);
  if (late.length) pt('⏰', (late.length === 1 ? '1 order late' : late.length + ' orders late') + ' — give a new date');
  const cad = B.orders.filter((o) => o.cad_state === 'sent');
  if (cad.length) pt('✏️', (cad.length === 1 ? '1 CAD design' : cad.length + ' CAD designs') + ' waiting for their OK');
  const out2 = B.memos.map((m) => ({ m, n: (m.approval_items || []).filter((i) => i.status === 'out').length })).filter((x) => x.n);
  if (out2.length) {
    const n = out2.reduce((s, x) => s + x.n, 0), by = out2.map((x) => x.m.return_by).filter(Boolean).sort()[0];
    pt('💎', (n === 1 ? '1 piece' : n + ' pieces') + ' with them on approval' + (by ? (by < t ? ' — return date passed' : ' — back by ' + fmtD(by)) : ''));
  }
  B.bookings.forEach((k) => pt('🔒', 'Rate booked: ' + grams(k.fine_g) + ' at ' + rsWhole(k.rate) + (k.valid_till ? ' till ' + fmtD(k.valid_till) : '')));
  B.offers.forEach((o) => pt('🎉', 'Offer on making: ' + o.title + ' — ' + num(o.pct) + '% off till ' + fmtD(o.to_day),
    esc('Offer on making') + ': <span class="noi18n">' + esc(o.title) + '</span> — ' + esc(num(o.pct) + '% off till ' + fmtD(o.to_day))));
  const refill = B.top.filter((x) => B.inStock.get(x[0])).map((x) => x[0] + ' ' + B.inStock.get(x[0]));
  if (refill.length) pt('🆕', 'In stock now, of what they buy: ' + refill.join(', '), esc('In stock now, of what they buy') + ': <span class="noi18n">' + esc(refill.join(', ')) + '</span>');
  if (B.liked) pt('❤️', 'They liked ' + B.liked + (B.liked === 1 ? ' piece' : ' pieces') + ' lately — ask about them');
  if (B.cases.length) pt('🙋', (B.cases.length === 1 ? '1 complaint' : B.cases.length + ' complaints') + ' open — tell them where it stands');
  const lastMeet = B.meets[0];
  if (lastMeet) {
    const d = Math.round((new Date(t) - new Date(String(lastMeet.happened_at).slice(0, 10))) / 864e5);
    if (d > 0) pt('📅', 'Last meeting ' + d + (d === 1 ? ' day ago' : ' days ago'));
  } else pt('📅', 'No meeting written yet');
  return out;
}
function briefText(B, pts) {
  const cl = B.cl;
  return '📋 ' + cl.trade_name + (cl.city ? ', ' + cl.city : '') + '\n' + pts.map((p) => p.icon + ' ' + p.text).join('\n') +
    (B.top.length ? '\n🛒 Buys: ' + B.top.map((x) => x[0] + ' ' + x[1].n).join(', ') : '') +
    (B.meets[0] ? '\n📝 Last time: ' + String(B.meets[0].notes || '').slice(0, 200) : '');
}
async function renderBrief(clientId) {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const B = await briefData(clientId);
  if (!$('#content') || !B.cl) return;
  const cl = B.cl, pts = briefPoints(B);
  S.brief = { B, pts };
  const y = B.bills.reduce((s, b) => s + num(b.total_amt), 0);
  const sec = (title, body) => body ? '<div class="section-label">' + esc(title) + '</div><div class="card">' + body + '</div>' : '';
  c.innerHTML = '<div class="vb-head card"><div><b class="noi18n">' + esc(cl.trade_name) + '</b><div class="rc-sub">' + esc([cl.city, cl.category ? 'Grade ' + cl.category : ''].filter(Boolean).join(' · ')) + '</div></div>' +
    (cl.mobile ? '<a class="btn btn-small btn-secondary" href="' + esc(telHref(cl.mobile)) + '">📞</a>' : '') + '</div>' +
    '<div class="section-label">What to talk about</div><div class="card vb-pts">' + (pts.length ? pts.map((p) => '<div class="vb-pt"><span>' + p.icon + '</span><span>' + (p.html || esc(p.text)) + '</span></div>').join('') : '<div class="empty" style="padding:8px">Nothing pending — a good day to show new designs.</div>') + '</div>' +
    sec('What they buy', B.top.length ? '<div class="vb-cats">' + B.top.map((x) => '<div><b class="noi18n">' + esc(x[0]) + '</b><span>' + esc(x[1].n + (x[1].n === 1 ? ' piece' : ' pieces') + (x[1].g ? ' · ' + grams(Math.round(x[1].g * 1000) / 1000) + ' fine' : '')) + '</span></div>').join('') + '</div>' +
      '<p class="hint" style="margin:8px 0 0">' + esc('In the last 12 months: ' + B.bills.length + (B.bills.length === 1 ? ' bill' : ' bills') + ' · ' + inrNum(y)) + '</p>' : '') +
    sec('Last meetings', B.meets.length ? B.meets.map((m) => '<div class="vb-meet"><div class="rc-sub">' + esc(fmtD(m.happened_at) + (m.exec_id ? ' · ' + nameOf(m.exec_id) : '') + (m.outcome ? ' · ' + m.outcome : '')) + '</div><div class="noi18n">' + esc(m.notes || '') + '</div></div>').join('') : '') +
    '<div class="vb-acts"><button class="btn btn-primary" data-action="vb-wa">💬 Send to my WhatsApp</button><button class="btn btn-secondary" data-action="vb-copy">Copy</button>' +
    '<button class="btn btn-secondary" data-action="new-interaction" data-id="' + cl.id + '">＋ Meeting</button></div>';
}

/* ---------------- actions ---------------- */
onAct('sr-open', (el) => showroomOpen(el.dataset.id));
onAct('sr-for', (el) => showroomOpen(el.dataset.id));
onAct('sr-list', () => showSub('Showroom links', renderShowrooms));
onAct('sr-new', () => pickClientThen('Showroom link for which shop?', (cl) => { if (typeof pickedBack === 'function') pickedBack(); showroomOpen(cl.id); }));
onAct('se-list', () => showSub('From the showrooms', renderEnquiries));
onAct('se-wa', (el) => { const e = S.enq && S.enq.get(el.dataset.id); if (e) openWa((e.clients || {}).mobile, enquiryText(e, e.pieces)); });
onAct('se-keep', (el) => enquiryKeep(el.dataset.id));
onAct('se-done', (el) => enquiryDone(el.dataset.id));
onAct('open-cat', (el) => { if (typeof openCatItem === 'function') openCatItem(el.dataset.id); });
onAct('pp-open', (el) => passportOpen(el.dataset.id));
onAct('tr-open', (el) => trackOpen(el.dataset.id));
onAct('vb-for', (el) => showSub('Before the visit', () => renderBrief(el.dataset.id)));
onAct('vb-pick', () => pickClientThen('Before a visit to which shop?', (cl) => showSub('Before the visit', () => renderBrief(cl.id), true)));
onAct('vb-wa', () => { if (S.brief) openWa('', briefText(S.brief.B, S.brief.pts)); });
onAct('vb-copy', async () => {
  if (!S.brief) return;
  try { await navigator.clipboard.writeText(briefText(S.brief.B, S.brief.pts)); toast('Copied ✓', 'ok'); } catch (e) { toast('Could not copy — try again.', 'err'); }
});
