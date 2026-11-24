/* ============================================================
   CAD APPROVAL (database update 13) — before production the CAD
   design goes to the shop for its OK. Add the CAD images (or a PDF)
   on the order and tap "Send to the shop": the shop opens the link
   (cad.html, no login) and taps Approve, or asks for a change and
   says what. The answer shows here and in the order's history, and
   rings the phones of whoever took the order and the owner.
   ============================================================ */
'use strict';

function cadOn() { return !!S.dbv13; }
const CAD_STAGES = ['quote', 'new', 'cad'];   // the box shows at these steps even before a file is added
function cadLinkUrl(token) { return new URL('cad.html#' + token, location.href).href; }

async function drawCadBox(o) {
  const box = $('#o-cad-view');
  if (!box || !cadOn()) return;
  const files = (o.cad_paths || []).filter(Boolean);
  if (!files.length && CAD_STAGES.indexOf(o.status) === -1) { box.innerHTML = ''; return; }
  S.cadView = { o, files };
  const at = (ts) => fmtD(ts) + ', ' + fmtTime(ts);
  let state = '';
  if (o.cad_state === 'sent' && o.cad_token) state = '<div class="cad-state wait">⏳ ' + esc('Sent ' + at(o.cad_sent_at) + ' — waiting for the shop') + '</div><div class="hint cad-seen" id="cad-seen"></div>';
  else if (o.cad_state === 'approved') state = '<div class="cad-state ok">✓ ' + esc('The shop approved it — ' + at(o.cad_answered_at)) + '</div>' + (o.cad_note ? '<div class="cad-note noi18n">' + esc(o.cad_note) + '</div>' : '');
  else if (o.cad_state === 'change') state = '<div class="cad-state change">✎ ' + esc('The shop asked for a change — ' + at(o.cad_answered_at)) + '</div>' +
    '<div class="cad-note noi18n">' + esc(o.cad_note || '') + '</div><div class="hint">Add the new CAD and send it again.</div>';
  else if (o.cad_state === 'sent') state = '<div class="hint">The link is off.</div>';
  const tiles = files.map((p, i) => '<div class="cad-tile' + (isPdfPath(p) ? ' pdf' : '') + '">' +
    (isPdfPath(p) ? '<button type="button" class="cad-pdf" data-action="cad-view" data-i="' + i + '">PDF ' + (i + 1) + '</button>'
      : '<img data-cad="' + esc(p) + '" data-action="cad-view" data-i="' + i + '" alt="">') +
    '<button type="button" class="fin-x" data-action="cad-del" data-id="' + o.id + '" data-p="' + esc(p) + '" aria-label="Remove">✕</button></div>').join('');
  box.innerHTML = '<div class="section-label">CAD for the shop\'s OK</div><div class="card cad-card">' +
    (files.length ? '<div class="cad-tiles">' + tiles + '</div>' : '<p class="hint" style="margin:0 0 10px">Add the CAD design — a photo, a screenshot or a PDF — and send it to the shop. It approves with one tap.</p>') +
    state +
    '<div class="photo-row">' +
    '<button class="btn btn-small btn-secondary" data-action="cad-add" data-id="' + o.id + '">＋ Add CAD</button>' +
    (files.length ? '<button class="btn btn-small btn-primary" data-action="cad-send" data-id="' + o.id + '">' + (o.cad_state ? 'Send again' : 'Send to the shop') + '</button>' : '') +
    (o.cad_state === 'approved' && o.status === 'new' ? '<button class="btn btn-small btn-secondary" data-action="o-status" data-id="' + o.id + '" data-s="cad">Mark CAD done</button>' : '') +
    (o.cad_token ? '<button class="btn btn-small btn-ghost" data-action="cad-off" data-id="' + o.id + '">Turn the link off</button>' : '') +
    '</div></div>';
  const imgs = files.filter((p) => !isPdfPath(p));
  if (imgs.length) signedUrls('orders', imgs).then((m) => { box.querySelectorAll('img[data-cad]').forEach((im) => { const u = m.get(im.dataset.cad); if (u) im.src = u; }); });
  if (o.cad_state === 'sent' && o.cad_token && typeof seenOf === 'function') {
    const v = await seenOf('cad', o.id);
    const el = $('#cad-seen');
    if (el && v) el.textContent = seenText(v);
  }
}

/* a CAD file: photo, gallery or PDF */
function cadAdd(orderId) {
  const upload = async (blob, ext, type) => {
    const ov = busyOverlay('Saving the CAD…');
    const path = orderId + '/cad-' + Date.now() + '.' + ext;
    const { error: upErr } = await db.storage.from('orders').upload(path, blob, { contentType: type });
    if (upErr) { ov.remove(); toast('Could not save the file — try again.', 'err'); return; }
    let list = null;
    try {
      const { data, error } = await db.rpc('order_cad_file', { p_order: orderId, p_add: path, p_remove: null });
      list = !error && Array.isArray(data) ? data : null;
    } catch (e) { list = null; }
    ov.remove();
    if (!list) { db.storage.from('orders').remove([path]).then(() => {}, () => {}); toast('Could not save the file — try again.', 'err'); return; }
    toast('CAD saved ✓', 'ok');
    openOrder(orderId, true);
  };
  const ov = openModal('<h3>Add the CAD</h3><p>A photo or screenshot of the CAD design, or the PDF from the designer.</p>' +
    '<div style="display:flex;flex-direction:column;gap:10px"><button class="btn btn-primary" data-m="gal">🖼️ Choose from gallery</button>' +
    '<button class="btn btn-secondary" data-m="cam">📷 Take photo</button><button class="btn btn-secondary" data-m="pdf">📄 PDF file</button>' +
    '<button class="btn btn-ghost" data-m="no">Cancel</button></div>');
  const img = (gal) => {
    closeModal();
    pickImage(async (file) => {
      const p = await photoFromFile(file, 'CAD design');
      if (p) upload(p.blob, 'jpg', 'image/jpeg');
    }, gal);
  };
  ov.querySelector('[data-m=gal]').onclick = () => img(true);
  ov.querySelector('[data-m=cam]').onclick = () => img(false);
  ov.querySelector('[data-m=pdf]').onclick = () => {
    closeModal();
    pickFile('application/pdf', (f) => {
      if (!/pdf/i.test(f.type || '') && !/\.pdf$/i.test(f.name || '')) { toast('Choose a PDF file.', 'err'); return; }
      if (f.size > 15 * 1024 * 1024) { toast('That PDF is too big (more than 15 MB).', 'err'); return; }
      upload(f, 'pdf', 'application/pdf');
    });
  };
  ov.querySelector('[data-m=no]').onclick = closeModal;
}

function cadRemove(orderId, path) {
  confirmModal('Remove this CAD file?', 'It will be taken off the order (and off the shop\'s link).', 'Remove', async () => {
    let list = null;
    try {
      const { data, error } = await db.rpc('order_cad_file', { p_order: orderId, p_add: null, p_remove: path });
      list = !error && Array.isArray(data) ? data : null;
    } catch (e) { list = null; }
    if (!list) { toast('Could not remove — try again.', 'err'); return; }
    db.storage.from('orders').remove([path]).then(() => {}, () => {});
    toast('Removed', 'ok');
    openOrder(orderId, true);
  }, true);
}

async function cadView(i) {
  const V = S.cadView;
  if (!V) return;
  const p = V.files[+i];
  if (!p) return;
  const m = await signedUrls('orders', [p]);
  const u = m.get(p);
  if (!u) { toast('Could not open it — try again.', 'err'); return; }
  if (isPdfPath(p)) { window.open(u, '_blank'); return; }
  const imgs = V.files.filter((x) => !isPdfPath(x));
  const all = await signedUrls('orders', imgs);
  photoViewer('CAD — ' + ordNo(V.o.order_no), imgs.map((x, k) => ({ u: all.get(x), cap: 'CAD ' + (k + 1) })).filter((x) => x.u), null, null, Math.max(0, imgs.indexOf(p)));
}

async function cadSend(orderId) {
  const o = await fetchOrder(orderId);
  if (!o) return;
  let token = null;
  try {
    const { data, error } = await db.rpc('order_cad_send', { p_order: orderId, p_on: true });
    token = !error && data ? data : null;
  } catch (e) { token = null; }
  if (!token) { toast('Could not make the link — add the CAD first, then try again.', 'err'); return; }
  const cl = o.clients || {};
  const text = 'Namaste 🙏\nPlease see the CAD design for ' + ordNo(o.order_no) + ' and approve it here (or tell us what to change):\n' + cadLinkUrl(token) + '\n— ' + bizName();
  openWa(cl.mobile, text);
  toast('Sent for approval ✓', 'ok');
  openOrder(orderId, true);
}

function cadOff(orderId) {
  confirmModal('Turn the CAD link off?', 'The shop will not be able to open it any more. Sending again makes it work again.', 'Turn off', async () => {
    let ok = false;
    try { const { error } = await db.rpc('order_cad_send', { p_order: orderId, p_on: false }); ok = !error; } catch (e) { ok = false; }
    toast(ok ? 'Link turned off ✓' : 'Could not turn it off — try again.', ok ? 'ok' : 'err');
    if (ok) openOrder(orderId, true);
  }, true);
}

onAct('cad-add', (el) => cadAdd(el.dataset.id));
onAct('cad-del', (el) => cadRemove(el.dataset.id, el.dataset.p));
onAct('cad-view', (el) => cadView(el.dataset.i));
onAct('cad-send', (el) => cadSend(el.dataset.id));
onAct('cad-off', (el) => cadOff(el.dataset.id));
