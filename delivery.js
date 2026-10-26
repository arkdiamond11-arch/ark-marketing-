/* ============================================================
   CERTIFICATES, HAND-OVER, STATUS LINK  (database update 08)
   · IGI certificate — the IGI report number of each item, photos /
     PDFs of the certificates kept with the order, sent to the client.
   · Hand-over — when an order is marked Delivered: the IGI numbers if
     they are still missing, who received it, their signature on the
     phone and a photo of the parcel. Printed on the delivery challan.
   · Order status link — a link the shop opens (no login) to see its
     order's step, photos and delivery date. It can be switched off.
   Loaded after flow.js, before app.js. Uses the app's helpers only at
   call time.
   ============================================================ */
'use strict';

/* the item's IGI report number (older orders kept it as the jewellery certificate) */
function igiNo(it) {
  if (!it) return '';
  if (it.igi_no) return String(it.igi_no);
  return it.jewel_cert_type === 'IGI' && it.jewel_cert_no ? String(it.jewel_cert_no) : '';
}
function igiInUse() { return !!S.dbv7 && stepsOn().indexOf('igi') > -1; }
function isPdfPath(p) { return /\.pdf$/i.test(String(p || '')); }

/* a file from the phone (any type the accept list allows) */
function pickFile(accept, cb) {
  const old = document.getElementById('file-pick');
  if (old) old.remove();
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.id = 'file-pick';
  inp.accept = accept;
  inp.tabIndex = -1;
  inp.setAttribute('aria-hidden', 'true');
  inp.style.cssText = 'position:fixed;left:-200px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
  let done = false;
  const take = () => {
    const f = inp.files && inp.files[0];
    if (done || !f) return;
    done = true;
    setTimeout(() => inp.remove(), 0);
    cb(f);
  };
  inp.addEventListener('change', take);
  inp.addEventListener('input', take);
  document.body.appendChild(inp);
  inp.click();
}

/* ---------------- the IGI certificate box on the order page ---------------- */
function drawIgiBox(o, items, ups) {
  const box = $('#o-igi-view');
  if (!box) return;
  const files = (o.cert_paths || []).filter(Boolean);
  const nums = (items || []).map(igiNo);
  // at IGI now, or delivered after going through IGI — or something already saved
  const wentIgi = o.status === 'igi' || (o.status === 'delivered' && (ups || []).some((u) => u.status === 'igi'));
  const show = S.dbv8 && (files.length || nums.some(Boolean) || (igiInUse() && wentIgi));
  if (!show) { box.innerHTML = ''; return; }
  S.igiView = { o, items: items || [] };
  const row = (it, i) => '<div class="igi-row"><span class="igi-it">' + esc((i + 1) + '. ' + [it.category || 'Item', it.design_code].filter(Boolean).join(' · ')) + '</span>' +
    '<input type="text" class="igi-no" data-i="' + i + '" autocomplete="off" autocapitalize="characters" placeholder="IGI report no." value="' + esc(nums[i]) + '"></div>';
  box.innerHTML =
    '<div class="section-label">IGI certificate</div>' +
    '<div class="card igi-card">' +
    (items.length ? items.map(row).join('') +
      '<button class="btn btn-small btn-secondary igi-save" data-action="igi-save" data-id="' + o.id + '">Save numbers</button>' : '') +
    '<div class="igi-files">' + files.map((p, i) => '<div class="igi-file' + (isPdfPath(p) ? ' pdf' : '') + '">' +
      (isPdfPath(p) ? '<span class="igi-pdf" data-action="igi-view" data-i="' + i + '">PDF</span>'
        : '<img data-cert="' + esc(p) + '" data-action="igi-view" data-i="' + i + '" alt="">') +
      '<button type="button" class="fin-x" data-action="igi-del" data-id="' + o.id + '" data-p="' + esc(p) + '" aria-label="Remove">✕</button></div>').join('') + '</div>' +
    '<div class="photo-row">' +
    '<button class="btn btn-small btn-secondary" data-action="igi-add" data-id="' + o.id + '" data-k="photo">📷 Certificate photo</button>' +
    '<button class="btn btn-small btn-secondary" data-action="igi-add" data-id="' + o.id + '" data-k="pdf">📄 PDF</button>' +
    (files.length || nums.some(Boolean) ? '<button class="btn btn-small btn-primary" data-action="igi-share" data-id="' + o.id + '">Send to client</button>' : '') +
    '</div></div>';
  const imgs = files.filter((p) => !isPdfPath(p));
  if (imgs.length) signedUrls('orders', imgs).then((m) => {
    box.querySelectorAll('img[data-cert]').forEach((im) => { const u = m.get(im.dataset.cert); if (u) im.src = u; });
  });
}

/* the numbers typed in a box → saved on the items (only the ones that changed) */
async function saveIgiNumbers(items, values) {
  const jobs = [];
  items.forEach((it, i) => {
    const v = String(values[i] || '').trim().toUpperCase();
    if (v === igiNo(it).toUpperCase() || (!v && !it.igi_no)) return;
    jobs.push(db.from('order_items').update({ igi_no: v || null }).eq('id', it.id));
  });
  if (!jobs.length) return true;
  const res = await Promise.all(jobs);
  return !res.some((r) => r.error);
}

async function igiSave(orderId, btn) {
  const V = S.igiView;
  if (!V || V.o.id !== orderId) return;
  const vals = Array.from(document.querySelectorAll('#o-igi-view .igi-no')).map((el) => el.value);
  if (btn) btn.disabled = true;
  const ok = await saveIgiNumbers(V.items, vals);
  if (btn) btn.disabled = false;
  if (!ok) { toast('Could not save — try again.', 'err'); return; }
  toast('IGI numbers saved ✓', 'ok');
  openOrder(orderId, true);
}

/* add a certificate photo (camera / gallery, with the crop screen) or a PDF */
function igiAddFile(orderId, kind) {
  if (!S.dbv8) return;
  const upload = async (blob, ext, type) => {
    const ov = busyOverlay('Saving the certificate…');
    const path = orderId + '/cert-' + Date.now() + '.' + ext;
    const { error: upErr } = await db.storage.from('orders').upload(path, blob, { contentType: type });
    if (upErr) { ov.remove(); toast('Could not save the file — try again.', 'err'); return; }
    let list = null;
    try {
      const { data, error } = await db.rpc('order_cert_file', { p_order: orderId, p_add: path, p_remove: null });
      list = !error && Array.isArray(data) ? data : null;
    } catch (e) { list = null; }
    ov.remove();
    if (!list) { db.storage.from('orders').remove([path]).then(() => {}, () => {}); toast('Could not save the file — try again.', 'err'); return; }
    toast('Certificate saved ✓', 'ok');
    openOrder(orderId, true);
  };
  if (kind === 'pdf') {
    pickFile('application/pdf', (f) => {
      if (!/pdf/i.test(f.type || '') && !/\.pdf$/i.test(f.name || '')) { toast('Choose a PDF file.', 'err'); return; }
      if (f.size > 15 * 1024 * 1024) { toast('That PDF is too big (more than 15 MB).', 'err'); return; }
      upload(f, 'pdf', 'application/pdf');
    });
    return;
  }
  const ov = openModal('<h3>Certificate photo</h3><p>Take a photo of the IGI certificate, or pick one from the gallery.</p>' +
    '<div style="display:flex;flex-direction:column;gap:10px"><button class="btn btn-primary" data-m="cam">📷 Take photo</button>' +
    '<button class="btn btn-secondary" data-m="gal">🖼️ Choose from gallery</button></div>');
  const go = (gal) => {
    closeModal();
    pickImage(async (file) => {
      const p = await photoFromFile(file, 'IGI certificate', { card: true });   // a certificate is a card-like sheet: the crop box finds it
      if (p) upload(p.blob, 'jpg', 'image/jpeg');
    }, gal);
  };
  ov.querySelector('[data-m=cam]').onclick = () => go(false);
  ov.querySelector('[data-m=gal]').onclick = () => go(true);
}

function igiRemoveFile(orderId, path) {
  confirmModal('Remove this certificate?', 'The file will be removed from the order.', 'Remove', async () => {
    let ok = false;
    try { const { error } = await db.rpc('order_cert_file', { p_order: orderId, p_add: null, p_remove: path }); ok = !error; } catch (e) { ok = false; }
    if (!ok) { toast('Could not remove — try again.', 'err'); return; }
    db.storage.from('orders').remove([path]).then(() => {}, () => {});
    toast('Removed', 'ok');
    openOrder(orderId, true);
  }, true);
}

async function igiView(i) {
  const V = S.igiView;
  if (!V) return;
  const files = (V.o.cert_paths || []).filter(Boolean);
  const p = files[+i];
  if (!p) return;
  const m = await signedUrls('orders', [p]);
  const u = m.get(p);
  if (!u) { toast('Could not open the file — try again.', 'err'); return; }
  if (isPdfPath(p)) { window.open(u, '_blank'); return; }
  const imgs = files.filter((x) => !isPdfPath(x));
  const mm = await signedUrls('orders', imgs);
  photoViewer(ordNo(V.o.order_no) + ' · IGI certificate', imgs.map((x, k) => ({ u: mm.get(x), cap: imgs.length > 1 ? 'Certificate ' + (k + 1) : 'Certificate' })).filter((s) => s.u),
    null, null, Math.max(0, imgs.indexOf(p)));
}

/* send the numbers and the certificate files to the client */
async function igiShare(orderId) {
  const o = await fetchOrder(orderId);
  if (!o) return;
  const { data: items } = await db.from('order_items').select('*').eq('order_id', orderId).order('sort', { ascending: true });
  const lines = (items || []).map((it, i) => igiNo(it) ? (i + 1) + '. ' + [it.category || 'Item', it.design_code].filter(Boolean).join(' ') + ' — IGI ' + igiNo(it) : '').filter(Boolean);
  const files = (o.cert_paths || []).filter(Boolean);
  const text = 'Namaste 🙏\nIGI certificate for your order ' + ordNo(o.order_no) + (lines.length ? ':\n' + lines.join('\n') : '.') + '\n— ' + bizName();
  const cl = o.clients || {};
  const out = [];
  if (files.length) {
    const ov = busyOverlay('Getting the certificates ready…');
    try {
      const m = await signedUrls('orders', files);
      for (let i = 0; i < files.length; i++) {
        const u = m.get(files[i]);
        if (!u) continue;
        const r = await fetch(u);
        if (!r.ok) continue;
        const b = await r.blob();
        const pdf = isPdfPath(files[i]);
        out.push(new File([b], safeFileName(ordNo(o.order_no) + ' IGI ' + (i + 1)) + (pdf ? '.pdf' : '.jpg'), { type: pdf ? 'application/pdf' : (b.type || 'image/jpeg') }));
      }
    } catch (e) { /* below */ }
    ov.remove();
  }
  const can = !!(out.length && navigator.canShare && navigator.canShare({ files: out }));
  const m = openModal('<h3>Send to ' + esc(cl.trade_name || 'the client') + '</h3>' +
    '<p>' + esc(can ? 'The certificate files with the IGI numbers. Choose WhatsApp and the client.'
      : out.length ? 'Save the files on this phone, then attach them in the client\'s WhatsApp chat.' : 'The IGI numbers, on WhatsApp.') + '</p>' +
    '<div class="fin-ask">' +
    (can ? '<button class="btn btn-primary" data-m="share">Share the certificates</button>' : out.length ? '<button class="btn btn-primary" data-m="dl">Save the files</button>' : '') +
    '<button class="btn btn-secondary" data-m="wa">Open the client\'s WhatsApp</button>' +
    '<button class="btn btn-ghost" data-m="no">Close</button></div>');
  if (can) m.querySelector('[data-m=share]').onclick = async () => {
    try { await navigator.share({ files: out, text }); closeModal(); }
    catch (e) { if (!(e && e.name === 'AbortError')) toast('Could not open sharing — save the files instead.', 'err'); }
  };
  const dl = m.querySelector('[data-m=dl]');
  if (dl) dl.onclick = () => { out.forEach((f) => downloadBlob(f, f.name)); toast('Saved on this phone — attach them in WhatsApp.', 'ok'); };
  m.querySelector('[data-m=wa]').onclick = () => { window.open(waUrl(cl.mobile, text), '_blank'); closeModal(); };
  m.querySelector('[data-m=no]').onclick = closeModal;
}

onAct('igi-save', (el) => igiSave(el.dataset.id, el));
onAct('igi-add', (el) => igiAddFile(el.dataset.id, el.dataset.k));
onAct('igi-del', (el) => igiRemoveFile(el.dataset.id, el.dataset.p));
onAct('igi-view', (el) => igiView(el.dataset.i));
onAct('igi-share', (el) => igiShare(el.dataset.id));

/* ---------------- signature pad ---------------- */
function signPad(wrap) {
  const cv = document.createElement('canvas');
  cv.className = 'sign-cv';
  wrap.insertBefore(cv, wrap.firstChild);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  let g = null, drawn = false, last = null;
  const size = () => {
    const w = Math.max(200, wrap.clientWidth), h = 150;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.lineWidth = 2.4; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#1d1a22';
    drawn = false;
  };
  size();
  const at = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  cv.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch (_) { /* older phones */ }
    last = at(e);
    g.beginPath(); g.arc(last.x, last.y, 1.1, 0, Math.PI * 2); g.fillStyle = '#1d1a22'; g.fill();
    drawn = true;
  });
  cv.addEventListener('pointermove', (e) => {
    if (!last) return;
    e.preventDefault();
    const p = at(e);
    g.beginPath(); g.moveTo(last.x, last.y); g.lineTo(p.x, p.y); g.stroke();
    last = p;
  });
  const up = () => { last = null; };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  return {
    clear: () => { g.clearRect(0, 0, cv.width, cv.height); drawn = false; },
    empty: () => !drawn,
    /* the signature as a white-backed PNG */
    blob: () => new Promise((res) => {
      const out = document.createElement('canvas');
      out.width = cv.width; out.height = cv.height;
      const og = out.getContext('2d');
      og.fillStyle = '#fff'; og.fillRect(0, 0, out.width, out.height);
      og.drawImage(cv, 0, 0);
      if (out.toBlob) out.toBlob((b) => res(b), 'image/png'); else res(null);
    }),
  };
}

/* ---------------- hand-over: when an order is marked Delivered ---------------- */
async function offerHandover(o, undo) {
  if (!S.dbv8) { if (undo) showUndo(ordNo(o.order_no) + ' → ' + OSTATUS_LABEL.delivered, undo); return; }
  let items = [];
  if (igiInUse()) {
    const { data } = await db.from('order_items').select('*').eq('order_id', o.id).order('sort', { ascending: true });
    items = data || [];
  }
  const passedIgi = items.length && (o.status === 'igi' || (o.prev_status === 'igi'));
  const need = passedIgi ? items.filter((it) => !igiNo(it)) : [];
  let parcel = null;
  const ov = openModal(
    '<h3>' + esc(ordNo(o.order_no)) + ' — Delivered ✓</h3>' +
    '<p>Record the hand-over — it is printed on the delivery challan.</p>' +
    (need.length ? '<div class="field"><label>IGI report numbers</label>' + items.map((it, i) => igiNo(it) ? '' :
      '<div class="igi-row"><span class="igi-it">' + esc((i + 1) + '. ' + [it.category || 'Item', it.design_code].filter(Boolean).join(' · ')) + '</span>' +
      '<input type="text" class="ho-igi" data-i="' + i + '" autocomplete="off" autocapitalize="characters" placeholder="IGI report no."></div>').join('') + '</div>' : '') +
    '<div class="field"><label>Received by</label><input type="text" id="ho-name" autocomplete="off" placeholder="Name of the person who took it" value="' + esc(o.delivered_to || '') + '"></div>' +
    '<div class="field"><label>Their signature</label><div class="sign-wrap" id="ho-sign"><button type="button" class="sign-clear" id="ho-clear">Clear</button></div></div>' +
    '<div class="field"><label>Photo of the parcel</label><div class="ho-photo"><div class="ho-thumb" id="ho-thumb"></div>' +
    '<button type="button" class="btn btn-small btn-secondary" id="ho-cam">📷 Take photo</button></div></div>' +
    '<div class="modal-actions">' + (undo ? '<button class="btn btn-ghost" data-m="undo">Undo</button>' : '') +
    '<button class="btn btn-secondary" data-m="later">Skip</button><button class="btn btn-primary" data-m="yes">Save</button></div>');
  ov.classList.add('ho-modal');
  const pad = signPad(ov.querySelector('#ho-sign'));
  ov.querySelector('#ho-clear').onclick = () => pad.clear();
  ov.querySelector('#ho-cam').onclick = () => {
    pickImage(async (file) => {
      const p = await photoFromFile(file, 'Parcel photo');
      if (!p) return;
      parcel = p;
      const t = $('#ho-thumb');
      if (t) t.innerHTML = '<img src="' + URL.createObjectURL(p.blob) + '" alt="">';
    }, false);
  };
  ov.querySelector('[data-m=later]').onclick = closeModal;
  const u = ov.querySelector('[data-m=undo]');
  if (u) u.onclick = () => { closeModal(); undo(); };
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    const name = $('#ho-name').value.trim();
    const igiVals = {};
    ov.querySelectorAll('.ho-igi').forEach((el) => { igiVals[+el.dataset.i] = el.value; });
    if (!name && pad.empty() && !parcel && !Object.keys(igiVals).some((k) => String(igiVals[k]).trim())) { closeModal(); return; }
    e.target.disabled = true;
    const busy = busyOverlay('Saving the hand-over…');
    let ok = true;
    const patch = { delivered_to: name || null, delivered_at: o.delivered_at || new Date().toISOString() };
    try {
      if (!pad.empty()) {
        const b = await pad.blob();
        const path = o.id + '/sign-' + Date.now() + '.png';
        const r = b ? await db.storage.from('orders').upload(path, b, { contentType: 'image/png' }) : { error: true };
        if (r.error) ok = false; else patch.delivery_sign_path = path;
      }
      if (parcel) {
        const path = o.id + '/parcel-' + Date.now() + '.jpg';
        const r = await db.storage.from('orders').upload(path, parcel.blob, { contentType: 'image/jpeg' });
        if (r.error) ok = false; else patch.delivery_photo_paths = (o.delivery_photo_paths || []).concat([path]);
      }
      const { error } = await db.from('orders').update(patch).eq('id', o.id);
      if (error) ok = false;
      if (Object.keys(igiVals).length) ok = (await saveIgiNumbers(items, items.map((it, i) => (i in igiVals ? igiVals[i] : igiNo(it))))) && ok;
    } catch (err) { ok = false; }
    busy.remove();
    closeModal();
    toast(ok ? 'Hand-over saved ✓' : 'Some of it could not be saved — add it on the order page.', ok ? 'ok' : 'err');
    const top = S.sub[S.sub.length - 1];
    if (top && top.title === ordNo(o.order_no)) openOrder(o.id, true);
  };
}

/* the order page: who received it, signature, parcel photo */
function drawDeliveryBox(o) {
  const box = $('#o-delivery-view');
  if (!box) return;
  if (!S.dbv8 || o.status !== 'delivered') { box.innerHTML = ''; return; }
  const photos = (o.delivery_photo_paths || []).filter(Boolean);
  const has = o.delivered_to || o.delivery_sign_path || photos.length;
  if (!has) {
    if (o.delivered_on && o.delivered_on < todayStr(-30)) { box.innerHTML = ''; return; }   // delivered long ago: nothing to ask
    box.innerHTML = '<div class="section-label">Hand-over</div><div class="card"><p class="hint" style="margin:0 0 10px">Who received it, their signature and a photo of the parcel — printed on the delivery challan.</p>' +
      '<button class="btn btn-small btn-secondary" data-action="ho-add" data-id="' + o.id + '">＋ Record the hand-over</button></div>';
    return;
  }
  const when = o.delivered_at ? fmtD(o.delivered_at) + ', ' + fmtTime(o.delivered_at) : (o.delivered_on ? fmtD(o.delivered_on) : '');
  box.innerHTML = '<div class="section-label">Hand-over</div><div class="card ho-card">' +
    '<div class="ho-line"><b>' + esc(o.delivered_to ? 'Received by ' + o.delivered_to : 'Received') + '</b>' + (when ? '<span>' + esc(when) + '</span>' : '') + '</div>' +
    '<div class="ho-pics">' + (o.delivery_sign_path ? '<div class="ho-sig"><img data-hop="' + esc(o.delivery_sign_path) + '" alt="Signature"><span>Signature</span></div>' : '') +
    photos.map((p) => '<div class="ho-par"><img data-hop="' + esc(p) + '" alt="Parcel" data-action="ho-view" data-p="' + esc(p) + '"></div>').join('') + '</div>' +
    '<button class="btn btn-small btn-secondary" data-action="ho-add" data-id="' + o.id + '">Change</button></div>';
  const ps = [o.delivery_sign_path].concat(photos).filter(Boolean);
  signedUrls('orders', ps).then((m) => { box.querySelectorAll('img[data-hop]').forEach((im) => { const u = m.get(im.dataset.hop); if (u) im.src = u; }); });
}

onAct('ho-add', async (el) => { const o = await fetchOrder(el.dataset.id); if (o) offerHandover(o, null); });
onAct('ho-view', async (el) => {
  const m = await signedUrls('orders', [el.dataset.p]);
  const u = m.get(el.dataset.p);
  if (u) photoViewer('Parcel photo', [{ u, cap: 'Parcel' }], null, null, 0);
});

/* ---------------- order status link for the shop ---------------- */
function statusLinkUrl(token) { return new URL('status.html#' + token, location.href).href; }

async function openStatusLink(orderId) {
  if (!S.dbv8) return;
  const o = await fetchOrder(orderId);
  if (!o) return;
  let token = null;
  try {
    const { data, error } = await db.rpc('order_share_link', { p_order: orderId, p_on: true });
    token = !error && data ? data : null;
  } catch (e) { token = null; }
  if (!token) { toast('Could not make the link — try again.', 'err'); return; }
  const url = statusLinkUrl(token);
  const cl = o.clients || {};
  const text = 'Namaste 🙏\nYou can see how your order ' + ordNo(o.order_no) + ' is coming along here:\n' + url + '\n— ' + bizName();
  const m = openModal('<h3>Order status link</h3>' +
    '<p>' + esc(cl.trade_name || 'The shop') + ' can open this link to see ' + esc(ordNo(o.order_no)) + '\'s step, photos and delivery date — no login needed. Turn it off any time.</p>' +
    '<div class="sl-url noi18n">' + esc(url) + '</div>' +
    '<div class="fin-ask"><button class="btn btn-primary" data-m="wa">Send on WhatsApp</button>' +
    '<button class="btn btn-secondary" data-m="copy">Copy the link</button>' +
    '<button class="btn btn-ghost" data-m="off">Turn the link off</button>' +
    '<button class="btn btn-ghost" data-m="no">Close</button></div>');
  m.querySelector('[data-m=wa]').onclick = () => { window.open(waUrl(cl.mobile, text), '_blank'); closeModal(); };
  m.querySelector('[data-m=copy]').onclick = async () => {
    try { await navigator.clipboard.writeText(url); toast('Link copied ✓', 'ok'); }
    catch (e) { toast('Could not copy — press and hold the link to copy it.', 'err'); }
  };
  m.querySelector('[data-m=off]').onclick = () => {
    closeModal();
    confirmModal('Turn the link off?', 'Anyone who has the link will not be able to see the order any more. You can make a new link later.', 'Turn off', async () => {
      let ok = false;
      try { const { error } = await db.rpc('order_share_link', { p_order: orderId, p_on: false }); ok = !error; } catch (e) { ok = false; }
      toast(ok ? 'Link turned off ✓' : 'Could not turn it off — try again.', ok ? 'ok' : 'err');
    }, true);
  };
  m.querySelector('[data-m=no]').onclick = closeModal;
}
onAct('o-link', (el) => openStatusLink(el.dataset.id));
