/* ============================================================
   ORDER FLOW
   · Production board — every open order as a photo card under
     its stage; one tap moves it to the next stage (with Undo).
   · The same one-tap "next stage" button on order cards in the
     lists (Orders, Today, client page, vendor page).
   · Changing a delivery date asks why; the change is kept in the
     order's history, the first promised date is never lost.
   · Photos of the finished piece: asked for when an order is
     marked Finished, shown next to the design, sent to the client.
   · App settings (owner): which order steps are used and which
     sections of the app are shown.
   Loaded after util.js, before app.js. Uses the app's helpers
   only at call time.
   ============================================================ */
'use strict';

const BOARD_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="9.5" y="4" width="5" height="11" rx="1.5"/><rect x="16" y="4" width="5" height="7" rx="1.5"/></svg>';

/* the board has its own tab when the catalogue is switched off (it takes the catalogue's place) */
function boardIsTab() { return !(typeof renderCatalogue === 'function' && appOn('catalogue')); }

/* ---------------- stuck: too long in one step ----------------
   How many days an order may stay in each step before it counts as stuck
   (owner: More → App settings; 0 = never). The step started with its
   newest tick in the order's history. */
const STUCK_DEFAULT = { new: 2, cad: 3, wax: 3, in_production: 7, setting: 4, finished: 3, igi: 7 };
const STEP_TICK_COLS = 'order_updates(status, created_at)';
/* add to an orders query that selects STEP_TICK_COLS: only each order's newest step tick comes with it */
function withStepTick(q) {
  return q.not('order_updates.status', 'is', null)
    .order('created_at', { referencedTable: 'order_updates', ascending: false })
    .limit(1, { referencedTable: 'order_updates' });
}
function stepKey(s) { return s === 'ready' ? 'finished' : s; }
function stuckLimit(s) {
  const k = stepKey(s), o = appOpts().stuck;
  const v = o && typeof o === 'object' && o[k] != null && o[k] !== '' ? Number(o[k]) : STUCK_DEFAULT[k];
  return isFinite(v) && v > 0 ? Math.round(v) : 0;
}
/* when the order came to the step it is at now (null when not known) */
function stepSince(o) {
  const u = Array.isArray(o.order_updates) ? o.order_updates[0] : null;
  if (u && u.status && stepKey(u.status) === stepKey(o.status)) return u.created_at;
  return o.status === 'new' && o.order_date ? o.order_date + 'T00:00:00' : null;
}
/* → { days, label } when the order has been in its step for too long, else null.
   Only for orders loaded with their step tick (STEP_TICK_COLS). */
function stuckInfo(o) {
  if (!o || !Array.isArray(o.order_updates) || !isOpenStatus(o.status)) return null;
  const lim = stuckLimit(o.status);
  const t = lim ? stepSince(o) : null;
  if (!t) return null;
  const days = Math.floor((Date.now() - new Date(t).getTime()) / 86400000);
  return days >= lim ? { days, key: stepKey(o.status), label: OSTATUS_LABEL[stepKey(o.status)] } : null;
}
function stuckText(x) {
  const d = x.days + (x.days === 1 ? ' day' : ' days');
  return x.key === 'new' ? 'Not started for ' + d : d + ' at ' + x.label;
}

/* ---------------- production board ---------------- */
function renderBoard() {
  if (!S.sub.length) setHeader('Board', false);
  S.board = S.board || { show: 'all' };
  $('#content').innerHTML = '<div id="board">' + loadingHTML() + '</div>';
  loadBoard();
}

/* cached = draw again from the orders already loaded (right after a one-tap move: no wait, no second request) */
async function loadBoard(cached) {
  const box = $('#board');
  if (!box) return;
  let all;
  if (cached && S.boardRows) all = S.boardRows;
  else {
    const seq = S.boardSeq = (S.boardSeq || 0) + 1;   // only the newest request may draw
    const { data, error } = await withStepTick(db.from('orders')
      .select('id, order_no, order_type, status, order_date, due_date' + (S.dbv6 ? ', vendor_id' : '') + finCol() + ', clients(trade_name, city), ' + ORDER_PHOTO_COLS + ', ' + STEP_TICK_COLS)
      .in('status', OPEN_STATUSES).order('due_date', { ascending: true, nullsFirst: false }).order('order_no', { ascending: true }).limit(500));
    if (seq !== S.boardSeq || !$('#board')) return;
    if (error) { box.innerHTML = '<div class="empty">Could not load orders — try again.</div>'; return; }
    all = S.boardRows = data || [];
  }
  const B = S.board || (S.board = { show: 'all' });
  const lateN = all.filter(isLate).length, stuckN = all.filter(stuckInfo).length;
  if ((B.show === 'late' && !lateN) || (B.show === 'stuck' && !stuckN)) B.show = 'all';
  const only = B.show === 'late' ? isLate : B.show === 'stuck' ? stuckInfo : null;
  const rows = only ? all.filter(only) : all;
  const stOf = (o) => (o.status === 'ready' ? 'finished' : o.status);
  const used = activeStages();
  const cols = ['new'].concat(ORDER_STAGES.filter((k) => k !== 'delivered' && (used.indexOf(k) > -1 || all.some((o) => stOf(o) === k))));
  const col = (k) => {
    const list = rows.filter((o) => stOf(o) === k);
    if (!list.length && only) return '';
    const late = list.filter(isLate).length, stuck = list.filter(stuckInfo).length;
    const head = '<div class="bd-head"><span class="chip chip-st-' + k + '">' + esc(OSTATUS_LABEL[k]) + '</span><b class="bd-n">' + list.length + '</b>' +
      '<span class="bd-flags">' + (late && B.show !== 'late' ? '<span class="bd-late">' + late + ' late</span>' : '') +
      (stuck && B.show !== 'stuck' ? '<span class="bd-stuck-n">' + stuck + ' stuck</span>' : '') + '</span></div>';
    if (!list.length) return '<div class="bd-col bd-empty">' + head + '</div>';
    return '<div class="bd-col">' + head + '<div class="bd-grid">' + list.map(boardCardHTML).join('') + '</div></div>';
  };
  const chip = (v, label, cls) => '<button class="' + (cls || '') + (B.show === v ? ' on' : '') + '" data-action="bd-filter" data-v="' + v + '">' + label + '</button>';
  box.innerHTML =
    '<div class="filter-chips bd-chips">' + chip('all', 'All open (' + all.length + ')') +
    (lateN ? chip('late', 'Late (' + lateN + ')', 'bd-late-chip') : '') +
    (stuckN ? chip('stuck', '⏳ Stuck (' + stuckN + ')', 'bd-stuck-chip') : '') +
    '</div>' +
    (B.show === 'stuck' ? '<div class="hint" style="margin:0 2px 4px">' + esc('Longer in their step than the days set in App settings.') + '</div>' : '') +
    (all.length ? cols.map(col).join('') : '<div class="empty"><div class="big">🎉</div>No open orders right now.</div>') +
    (all.length ? '<div class="hint" style="text-align:center;margin:4px 0 12px">Tap the button on a card to move it to the next step · tap the card to open the order.</div>' : '');
  fillOrderThumbs(box);
}

function boardCardHTML(o) {
  S.oRows = S.oRows || new Map();
  S.oRows.set(o.id, o);
  const cl = o.clients || {};
  const e = orderPhotoEntry(o);
  const first = (o.order_items || []).slice().sort((a, b) => num(a.sort) - num(b.sort))[0];
  const late = isLate(o), st = stuckInfo(o);
  return '<div class="bd-card' + (late ? ' late' : '') + '" data-action="o-open" data-id="' + o.id + '">' +
    '<div class="bd-img' + (e ? '' : ' bd-noimg') + '">' +
    (e ? '<img alt="" loading="lazy" decoding="async" data-oph="' + esc(o.id) + '"><span class="o-thumb-n"></span>' : '') +
    '<span class="bd-piece">' + esc((first && first.category) || OTYPE_LABEL[o.order_type] || 'Order') + '</span>' +
    (o.due_date ? '<span class="bd-due' + (late ? ' late' : '') + '">' + esc(late ? dueLabel(o.due_date) : 'Due ' + dueLabel(o.due_date)) + '</span>' : '') +
    (st ? '<span class="bd-stuck">' + esc('⏳ ' + st.days + (st.days === 1 ? ' day' : ' days')) + '</span>' : '') +
    '</div>' +
    '<div class="bd-body"><b>' + ordNo(o.order_no) + '</b><span>' + esc(cl.trade_name || '') + '</span></div>' +
    nextBtnHTML(o, 'bd-next') + '</div>';
}

onAct('bd-open', () => showSub('Board', renderBoard));
onAct('bd-filter', (el) => { S.board = S.board || {}; S.board.show = el.dataset.v || 'all'; loadBoard(); });
/* open the board showing only the late (or stuck) orders */
function openBoardShowing(show) {
  S.board = { show };
  if (boardIsTab()) switchTab('board'); else showSub('Board', renderBoard);
}
onAct('bd-late', () => openBoardShowing('late'));
onAct('bd-stuck', () => openBoardShowing('stuck'));

/* ---------------- one tap: move an order to its next stage ---------------- */
async function quickMove(id, s, btn) {
  if (S.moving) return;   // one at a time — the cards move when the board is drawn again
  S.moving = true;
  if (btn) btn.disabled = true;
  try {
    const o = await fetchOrder(id);
    if (!o) { if (btn) btn.disabled = false; return; }
    const shown = S.oRows && S.oRows.get(id);
    if (!isOpenStatus(o.status) || (shown && shown.status !== o.status && nextStage(o) !== s)) {
      // someone else moved it meanwhile — show it as it is now
      toast(ordNo(o.order_no) + ' is at ' + OSTATUS_LABEL[o.status] + ' now.', 'err');
      refreshOrderViews(o, { reload: true });
      return;
    }
    const prev = { status: o.status, delivered_on: o.delivered_on || null };
    const upId = await applyStatus(o, s);
    if (upId === false) { if (btn) btn.disabled = false; return; }
    const moved = Object.assign({}, o, { status: s, delivered_on: s === 'delivered' ? todayStr() : null });
    refreshOrderViews(moved);
    const undo = () => undoMove(moved, prev, upId);
    if (s === 'finished' && S.dbv7) offerFinalPhoto(moved, undo);
    else showUndo(ordNo(o.order_no) + ' → ' + OSTATUS_LABEL[s], undo);
  } finally {
    S.moving = false;
  }
}

async function undoMove(o, prev, upId) {
  hideUndo();
  // only if it is still where the tap put it
  const { data, error } = await db.from('orders').update({ status: prev.status, delivered_on: prev.delivered_on })
    .eq('id', o.id).eq('status', o.status).select('id');
  if (error) { toast('Could not undo — change it on the order page.', 'err'); return; }
  if (!data || !data.length) {
    toast('Could not undo — ' + ordNo(o.order_no) + ' was changed meanwhile.', 'err');
    refreshOrderViews(o, { reload: true });
    return;
  }
  if (upId) await db.from('order_updates').delete().eq('id', upId);
  await syncCatalogueForOrder(o.id, prev.status);
  toast('Undone — ' + ordNo(o.order_no) + ' is back at ' + OSTATUS_LABEL[prev.status], 'ok');
  refreshOrderViews(Object.assign({}, o, prev), { reload: true });
}

/* redraw an order wherever it shows on the screen now.
   opt.reload: fetch fresh data (the order may have changed somewhere else) */
function refreshOrderViews(o, opt) {
  const reload = !!(opt && opt.reload);
  const r = S.oRows && S.oRows.get(o.id);
  if (r && !reload) {
    if (r.status !== o.status && Array.isArray(r.order_updates)) r.order_updates = [{ status: o.status, created_at: new Date().toISOString() }];   // just moved: not stuck
    Object.assign(r, { status: o.status, delivered_on: o.delivered_on, due_date: o.due_date },
      o.final_photo_paths ? { final_photo_paths: o.final_photo_paths } : {});
  }
  if ($('#board')) {
    if (reload || !S.boardRows) { loadBoard(); return; }
    S.boardRows = S.boardRows.filter((x) => isOpenStatus(x.status));   // delivered: off the board
    loadBoard(true);
    return;
  }
  const top = S.sub[S.sub.length - 1];
  if (top && top.title === ordNo(o.order_no)) { openOrder(o.id, true); return; }
  if (reload) {   // draw the screen again with fresh data, keeping the place on the page
    const y = window.scrollY;
    if (top) top.renderFn(); else switchTab(S.tab);
    setTimeout(() => window.scrollTo(0, y), 700);
    return;
  }
  document.querySelectorAll('#content .o-li[data-id="' + o.id + '"]').forEach((el) => {
    const row = r || o;
    const tmp = document.createElement('div');
    tmp.innerHTML = orderListItemHTML(row, el.dataset.sc === '1', { late: el.dataset.late === '1' && isLate(row) });
    const nu = tmp.firstChild;
    const parent = el.parentElement;
    el.replaceWith(nu);
    if (parent) fillOrderThumbs(parent);
  });
}

/* a bar at the bottom with Undo, for a few seconds */
let UNDO = null;
function showUndo(msg, onUndo) {
  hideUndo();
  const b = document.createElement('div');
  b.className = 'undo-bar';
  b.innerHTML = '<span class="ub-msg"></span><button type="button" class="ub-undo">Undo</button>';
  b.querySelector('.ub-msg').textContent = msg + ' ✓';
  b.querySelector('.ub-undo').onclick = () => { hideUndo(); onUndo(); };
  document.body.appendChild(b);
  UNDO = { el: b, t: setTimeout(hideUndo, 8000) };
}
function hideUndo() {
  if (!UNDO) return;
  clearTimeout(UNDO.t);
  UNDO.el.remove();
  UNDO = null;
}

/* ---------------- delivery date: change it, with the reason ---------------- */
const DUE_REASONS = ['Vendor delay', 'Karigar delay', 'Client asked', 'Design change', 'Other'];
function dueChangeText(from, to) {
  return 'Delivery date ' + (from ? fmtD(from) : '—') + ' → ' + (to ? fmtD(to) : '—');
}

/* after(d): called instead of redrawing (the Edit form keeps the new date) */
async function openDueModal(id, after) {
  const o = await fetchOrder(id);
  if (!o) return;
  let reason = null;
  const had = !!o.due_date;   // the first date set needs no reason
  const first = o.first_due_date && o.first_due_date !== o.due_date ? o.first_due_date : null;
  const def = o.due_date && o.due_date >= todayStr() ? o.due_date : todayStr(7);
  const ov = openModal(
    '<h3>' + (had ? 'Change delivery date' : 'Set the delivery date') + '</h3>' +
    '<p>' + esc(ordNo(o.order_no) + ((o.clients && o.clients.trade_name) ? ' · ' + o.clients.trade_name : '')) + '<br>' +
    (had ? esc('Now: ' + fmtD(o.due_date) + (first ? ' · first promised ' + fmtD(first) : '')) : 'No delivery date yet.') + '</p>' +
    '<div class="field"><label>New delivery date</label><input type="date" id="dd-date" value="' + def + '" min="' + todayStr() + '"></div>' +
    (had ? '<div class="field"><label>Why is it changing?</label><div class="seg" id="dd-why">' +
      DUE_REASONS.map((r) => '<button type="button" data-r="' + esc(r) + '">' + esc(r) + '</button>').join('') + '</div></div>' : '') +
    '<div class="field"><input type="text" id="dd-note" autocomplete="off" placeholder="Note for the history (optional)"></div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Save date</button></div>');
  ov.classList.add('dd-modal');
  ov.querySelectorAll('#dd-why button').forEach((b) => {
    b.onclick = () => {
      reason = reason === b.dataset.r ? null : b.dataset.r;
      ov.querySelectorAll('#dd-why button').forEach((x) => x.classList.toggle('on', x.dataset.r === reason));
    };
  });
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    const d = $('#dd-date').value;
    if (!d) { toast('Choose the new date.', 'err'); return; }
    if (d === o.due_date) { closeModal(); return; }
    if (had && !reason) { toast('Choose why the date is changing.', 'err'); return; }
    const note = $('#dd-note').value.trim();
    e.target.disabled = true;
    const { error } = await db.from('orders').update({ due_date: d }).eq('id', o.id);
    if (error) { e.target.disabled = false; toast('Could not save — try again.', 'err'); return; }
    await db.from('order_updates').insert({
      order_id: o.id, created_by: S.me.id,
      note: (had ? dueChangeText(o.due_date, d) + ' · ' + reason : 'Delivery date set to ' + fmtD(d)) + (note ? ' — ' + note : ''),
    });
    closeModal();
    toast((had ? 'Delivery date changed to ' : 'Delivery date set to ') + fmtD(d) + ' ✓', 'ok');
    if (after) { after(d); return; }
    const moved = Object.assign({}, o, { due_date: d });
    if (S.tab === 'today' && !S.sub.length) { renderToday(); return; }   // it leaves the late list
    refreshOrderViews(moved);
  };
}

/* ---------------- photos of the finished piece ---------------- */
function offerFinalPhoto(o, undo) {
  const ov = openModal(
    '<h3>' + esc(ordNo(o.order_no)) + ' — Finished ✓</h3>' +
    '<p>Take a photo of the finished piece. It is kept with the order, next to the design, and you can send it to the client.</p>' +
    '<div class="fin-ask">' +
    '<button class="btn btn-primary" data-m="cam">📷 Take photo</button>' +
    '<button class="btn btn-secondary" data-m="gal">🖼️ Choose from gallery</button>' +
    '<div class="modal-actions">' + (undo ? '<button class="btn btn-ghost" data-m="undo">Undo</button>' : '') +
    '<button class="btn btn-ghost" data-m="later">Later</button></div></div>');
  ov.querySelector('[data-m=cam]').onclick = () => { closeModal(); addFinalPhoto(o.id, false); };
  ov.querySelector('[data-m=gal]').onclick = () => { closeModal(); addFinalPhoto(o.id, true); };
  ov.querySelector('[data-m=later]').onclick = closeModal;
  const u = ov.querySelector('[data-m=undo]');
  if (u) u.onclick = () => { closeModal(); undo(); };
}

function busyOverlay(text) {
  const ov = document.createElement('div');
  ov.className = 'scan-overlay';
  ov.innerHTML = '<div class="spinner"></div><div></div>';
  ov.lastChild.textContent = text;
  document.body.appendChild(ov);
  return ov;
}

function addFinalPhoto(orderId, fromGallery) {
  if (!S.dbv7) { toast('Finished-piece photos need the database update (ark-update-07.sql).', 'err'); return; }
  pickImage(async (file) => {
    const p = await photoFromFile(file, 'Finished piece');   // the crop screen; null = cancelled
    if (!p) return;
    const ov = busyOverlay('Saving the photo…');
    const path = orderId + '/final-' + Date.now() + '.jpg';
    const { error: upErr } = await db.storage.from('orders').upload(path, p.blob, { contentType: 'image/jpeg' });
    if (upErr) { ov.remove(); toast('Could not save the photo — try again.', 'err'); return; }
    const list = await finalPhotoChange(orderId, path, null);
    ov.remove();
    if (!list) { db.storage.from('orders').remove([path]).then(() => {}, () => {}); toast('Could not save the photo — try again.', 'err'); return; }
    toast('Photo of the finished piece saved ✓', 'ok');
    afterFinalChange(orderId, list);
  }, fromGallery);
}

/* add or remove one photo in a single database step (two phones at once never lose a photo);
   returns the order's new list, or null if it could not be changed */
async function finalPhotoChange(orderId, add, remove) {
  try {
    const { data, error } = await db.rpc('order_final_photo', { p_order: orderId, p_add: add || null, p_remove: remove || null });
    return !error && Array.isArray(data) ? data : null;
  } catch (e) { return null; }
}

function afterFinalChange(orderId, list) {
  const r = S.oRows && S.oRows.get(orderId);
  if (r) r.final_photo_paths = list;
  if (S.oPhotos) S.oPhotos.delete(orderId);
  const top = S.sub[S.sub.length - 1];
  if (top && /^ORD-\d+$/.test(top.title)) { openOrder(orderId, true); return; }
  if (r) refreshOrderViews(Object.assign({}, r));
  else if ($('#board')) loadBoard();
}

/* the order page: the finished piece next to the design */
function drawFinalBox(o, items, urls) {
  const box = $('#o-final-view');
  if (!box || !S.dbv7) return;
  const fin = (o.final_photo_paths || []).filter(Boolean);
  const done = ['finished', 'igi', 'ready', 'delivered'].indexOf(o.status) > -1;
  S.finView = { o, fin, items: items || [], urls: urls || [] };
  if (!fin.length && !done) { box.innerHTML = ''; return; }
  if (!fin.length) {
    box.innerHTML = '<div class="section-label">Finished piece</div><div class="card fin-card">' +
      '<p class="hint" style="margin:0 0 10px">No photo of the finished piece yet. Add one — then you can send it to the client.</p>' +
      '<div class="photo-row" style="margin:0"><button class="btn btn-small btn-primary" data-action="fin-add" data-id="' + o.id + '">📷 Take photo</button>' +
      '<button class="btn btn-small btn-secondary" data-action="fin-add" data-id="' + o.id + '" data-gal="1">🖼️ Gallery</button></div></div>';
    return;
  }
  const design = (urls || []).find(Boolean) || null;   // the first design photo
  const finImg = (p, i, cls) => '<div class="fin-ph' + (cls ? ' ' + cls : '') + '"><img data-fin="' + esc(p) + '" data-action="fin-view" data-i="' + i + '" alt="">' +
    '<button type="button" class="fin-x" data-action="fin-del" data-id="' + o.id + '" data-p="' + esc(p) + '" aria-label="Remove photo">✕</button></div>';
  box.innerHTML =
    '<div class="section-label">Finished piece</div>' +
    '<div class="card fin-card">' +
    '<div class="fin-pair' + (design ? '' : ' one') + '">' +
    (design ? '<figure><div class="fin-ph"><img src="' + esc(design) + '" data-action="fin-view" data-i="d" alt=""></div><figcaption>Design</figcaption></figure>' : '') +
    '<figure>' + finImg(fin[0], 0) + '<figcaption>Finished</figcaption></figure>' +
    '</div>' +
    (fin.length > 1 ? '<div class="fin-more">' + fin.slice(1).map((p, i) => finImg(p, i + 1, 'sm')).join('') + '</div>' : '') +
    '<div class="photo-row">' +
    '<button class="btn btn-small btn-secondary" data-action="fin-add" data-id="' + o.id + '">📷 Add photo</button>' +
    '<button class="btn btn-small btn-primary" data-action="fin-share" data-id="' + o.id + '">Send to client</button></div>' +
    '</div>';
  signedUrls('orders', fin).then((m) => {
    box.querySelectorAll('img[data-fin]').forEach((im) => { const u = m.get(im.dataset.fin); if (u) im.src = u; });
  });
}

/* full screen: finished photos first, then the designs */
async function viewFinalPhotos(at) {
  const F = S.finView;
  if (!F) return;
  const m = await signedUrls('orders', F.fin);
  const slides = F.fin.map((p, i) => ({ u: m.get(p), cap: F.fin.length > 1 ? 'Finished piece ' + (i + 1) : 'Finished piece' }));
  F.items.forEach((it, i) => { if (F.urls[i]) slides.push({ u: F.urls[i], cap: (i + 1) + '. ' + [it.category || 'Item', it.design_code].filter(Boolean).join(' · ') }); });
  const ok = slides.filter((x) => x.u);
  if (!ok.length) return;
  const start = at === 'd' ? F.fin.length : +at || 0;
  photoViewer(ordNo(F.o.order_no) + (F.o.clients && F.o.clients.trade_name ? ' · ' + F.o.clients.trade_name : ''), ok, null, null, Math.min(start, ok.length - 1));
}

function removeFinalPhoto(orderId, path) {
  confirmModal('Remove this photo?', 'The photo of the finished piece will be removed from the order.', 'Remove', async () => {
    const list = await finalPhotoChange(orderId, null, path);
    if (!list) { toast('Could not remove — try again.', 'err'); return; }
    db.storage.from('orders').remove([path]).then(() => {}, () => {});
    toast('Photo removed', 'ok');
    afterFinalChange(orderId, list);
  }, true);
}

/* send the finished-piece photos to the client: the photos are made ready first,
   then one tap opens the phone's share sheet (it only opens straight from a tap) */
async function shareFinalPhotos(orderId) {
  const o = await fetchOrder(orderId);
  if (!o) return;
  const fin = (o.final_photo_paths || []).filter(Boolean);
  if (!fin.length) { toast('Add a photo of the finished piece first.', 'err'); return; }
  const cl = o.clients || {};
  const ov = busyOverlay('Getting the photos ready…');
  const files = [];
  try {
    const m = await signedUrls('orders', fin);
    for (let i = 0; i < fin.length; i++) {
      const u = m.get(fin[i]);
      if (!u) continue;
      const r = await fetch(u);
      if (!r.ok) continue;
      const b = await r.blob();
      files.push(new File([b], safeFileName(ordNo(o.order_no) + ' ' + (i + 1)) + '.jpg', { type: b.type || 'image/jpeg' }));
    }
  } catch (e) { /* below */ }
  ov.remove();
  if (!files.length) { toast('Could not get the photos — try again.', 'err'); return; }
  const text = 'Namaste 🙏\n' + (o.status === 'delivered' ? 'Photos of your order ' + ordNo(o.order_no) + '.' : 'Your order ' + ordNo(o.order_no) + ' is ready ✨ Here are the photos of the finished piece.') +
    '\n— ' + bizName();
  const can = !!(navigator.canShare && navigator.canShare({ files }));
  const n = files.length === 1 ? '1 photo' : files.length + ' photos';
  const m = openModal('<h3>Send to ' + esc(cl.trade_name || 'the client') + '</h3>' +
    '<p>' + (can ? esc(n + ' of the finished piece, with a short message. Choose WhatsApp and the client.')
      : esc('Save the ' + n + ' on this phone, then open the client\'s WhatsApp chat and attach them.')) + '</p>' +
    '<div class="fin-ask">' +
    (can ? '<button class="btn btn-primary" data-m="share">Share the photos</button>'
      : '<button class="btn btn-primary" data-m="dl">Save the photos</button>') +
    '<button class="btn btn-secondary" data-m="wa">Open the client\'s WhatsApp</button>' +
    '<button class="btn btn-ghost" data-m="no">Close</button></div>');
  if (can) m.querySelector('[data-m=share]').onclick = async () => {
    try { await navigator.share({ files, text }); closeModal(); }
    catch (e) { if (!(e && e.name === 'AbortError')) toast('Could not open sharing — save the photos instead.', 'err'); }
  };
  const dl = m.querySelector('[data-m=dl]');
  if (dl) dl.onclick = () => { files.forEach((f) => downloadBlob(f, f.name)); toast('Photos saved on this phone — attach them in WhatsApp.', 'ok'); };
  m.querySelector('[data-m=wa]').onclick = () => { window.open(waUrl(cl.mobile, text), '_blank'); closeModal(); };
  m.querySelector('[data-m=no]').onclick = closeModal;
}

onAct('fin-add', (el) => addFinalPhoto(el.dataset.id, el.dataset.gal === '1'));
onAct('fin-del', (el) => removeFinalPhoto(el.dataset.id, el.dataset.p));
onAct('fin-share', (el) => shareFinalPhotos(el.dataset.id));
onAct('fin-view', (el) => viewFinalPhotos(el.dataset.i));

/* ---------------- app settings (owner) ---------------- */
const STEP_HINTS = { cad: 'Design drawn on the computer', wax: 'Wax model and casting', in_production: 'Being made', setting: 'Diamonds being set', finished: 'The piece is made', igi: 'At IGI for the certificate' };

function renderAppSettings() {
  const c = $('#content');
  if (!S.dbv7) {
    c.innerHTML = '<div class="notice">App settings need the database update (ark-update-07.sql). Run it once in Supabase → SQL Editor, then open the app again.</div>';
    return;
  }
  const off = new Set(appOpts().off || []);
  const steps = new Set(stepsOn());
  const sw = (id, on, title, sub, fixed) => '<label class="sw-row' + (fixed ? ' fixed' : '') + '"><span class="sw-t"><b>' + esc(title) + '</b>' +
    (sub ? '<span>' + esc(sub) + '</span>' : '') + '</span>' +
    '<input type="checkbox" class="sw"' + (id ? ' id="' + id + '"' : '') + (on ? ' checked' : '') + (fixed ? ' disabled' : '') + '></label>';
  const sd = (k) => '<label class="sd-row" id="sdr-' + k + '"' + (k !== 'new' && !steps.has(k) ? ' style="display:none"' : '') + '><span>' + esc(k === 'new' ? 'Approved, not started' : OSTATUS_LABEL[k]) + '</span>' +
    '<input type="number" inputmode="numeric" min="0" max="365" id="sd-' + k + '" value="' + stuckLimit(k) + '"><span class="sd-unit">days</span></label>';
  c.innerHTML =
    '<div class="notice">Switch off what your team does not use — the screens get simpler for everyone. Nothing is deleted: switch it on again any time.</div>' +
    '<div class="section-label">Order steps</div>' +
    '<div class="card sw-card">' +
    sw(null, true, OSTATUS_LABEL.new, 'Always on — the client confirmed the order', true) +
    STEP_CHOICES.map((k) => sw('sw-st-' + k, steps.has(k), OSTATUS_LABEL[k], STEP_HINTS[k])).join('') +
    sw(null, true, OSTATUS_LABEL.delivered, 'Always on', true) +
    '</div>' +
    '<div class="section-label">When is an order stuck?</div>' +
    '<div class="card sd-card"><p class="hint" style="margin:0 0 8px">Days an order can stay in one step before it shows as stuck on Today and on the Board. 0 = never.</p>' +
    ['new'].concat(STEP_CHOICES).map(sd).join('') + '</div>' +
    '<div class="section-label">Sections of the app</div>' +
    '<div class="card sw-card">' + APP_SECTIONS.map((s) => sw('sw-' + s[0], !off.has(s[0]), s[1], s[2])).join('') + '</div>' +
    '<button class="btn btn-primary" data-action="opt-save" id="opt-save">Save settings</button><div style="height:10px"></div>';
  STEP_CHOICES.forEach((k) => {   // a step switched on or off: its "stuck" days show or hide with it
    const t = $('#sw-st-' + k), r = $('#sdr-' + k);
    if (t && r) t.addEventListener('change', () => { r.style.display = t.checked ? '' : 'none'; });
  });
}

async function saveAppSettings() {
  const off = APP_SECTIONS.map((s) => s[0]).filter((k) => { const el = $('#sw-' + k); return el && !el.checked; });
  const steps = STEP_CHOICES.filter((k) => { const el = $('#sw-st-' + k); return el && el.checked; });
  const stuck = {};
  ['new'].concat(STEP_CHOICES).forEach((k) => {
    const el = $('#sd-' + k), v = el ? parseInt(el.value, 10) : NaN;
    stuck[k] = isFinite(v) && v >= 0 ? Math.min(v, 365) : stuckLimit(k);
  });
  const opts = Object.assign({}, appOpts(), { off, steps, stuck });
  const btn = $('#opt-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  const { data, error } = await db.from('business_settings').update({ app_options: opts, updated_by: S.me.id }).eq('id', 1).select('*');
  if (error || !data || !data.length) {
    if (btn) { btn.disabled = false; btn.textContent = 'Save settings'; }
    toast('Could not save — only the owner can change these.', 'err');
    return;
  }
  S.biz = data[0];
  S.bizAt = Date.now();
  toast('Settings saved ✓', 'ok');
  if (S.sub.length) { S.suppressPop = true; try { history.back(); } catch (e) { /* ignore */ } }
  S.sub = [];
  renderShell();
  switchTab('more');
}

onAct('opt-open', () => showSub('App settings', renderAppSettings));
onAct('opt-save', () => saveAppSettings());

/* settings changed on the owner's phone → the others pick them up when they come back to the app */
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !S.me || !S.bizAt || Date.now() - S.bizAt < 10 * 60000) return;
  const before = JSON.stringify(appOpts());
  let ok = null;
  try { ok = await loadBiz(); } catch (e) { ok = null; }
  if (!ok || JSON.stringify(appOpts()) === before) return;   // not reached, or nothing changed: everything stays as it is
  if (S.tab === 'catalogue' && !appOn('catalogue')) S.tab = 'board';
  if (S.tab === 'board' && !boardIsTab()) S.tab = 'orders';
  if (S.sub.length || $('#modal-ov')) { refreshTabbar(); return; }   // the open screen stays; Back leads to a tab that exists
  renderShell();
  switchTab(S.tab);
});
