/* ============================================================
   DESIGN CATALOGUE — ready-stock pieces and designs with photos,
   tag numbers and weights. Show them to clients in a meeting,
   share on WhatsApp, and add them to an order with one tap.
   A piece in an open order shows as Reserved; when the order is
   delivered it becomes Sold.
   ============================================================ */
'use strict';

const CAT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/></svg>';
const CAT_STATUS_LABEL = { available: 'Available', reserved: 'Reserved', sold: 'Sold' };
const CAT_MAX_PHOTOS = 6;

/* approximate selling price at today's rate (null if no rate) */
function catPrice(it) {
  if (typeof rateFor !== 'function') return null;
  const rate = rateFor(it.metal || 'Gold', it.purity);
  if (!rate || !num(it.net_wt)) return null;
  const c = orderCalc({ order_type: 'ready_stock', rate_per_g: rate, making_per_g: it.making_per_g, wastage_pct: it.wastage_pct, discount: 0, gst_pct: 3 },
    [{ net_wt: it.net_wt, stone_amount: it.stone_amount, qty: 1 }]);
  return { rate, c };
}

/* ---------------- tab: grid ---------------- */
async function renderCatalogue() {
  setHeader('Catalogue', false);
  S.cat = S.cat || { q: '', status: 'available', cat: 'all' };
  const C = S.cat;
  const chip = (g, v, label) => '<button class="' + (C[g] === v ? 'on' : '') + '" data-action="cat-filter" data-g="' + g + '" data-v="' + esc(v) + '">' + esc(label) + '</button>';
  $('#content').innerHTML =
    '<button class="btn btn-primary" data-action="cat-new" style="margin-bottom:12px">＋ Add design</button>' +
    '<div class="search-box"><input type="text" id="cat-search" placeholder="Search tag no., design, stones…" autocomplete="off" value="' + esc(C.q) + '"></div>' +
    '<div class="filter-chips">' + chip('status', 'available', 'Available') + chip('status', 'reserved', 'Reserved') + chip('status', 'sold', 'Sold') + chip('status', 'all', 'All') + '</div>' +
    '<div class="filter-chips" id="cat-cats"></div>' +
    '<div id="cat-grid">' + loadingHTML() + '</div>';
  const inp = $('#cat-search');
  inp.addEventListener('input', () => {
    clearTimeout(S.searchTimer);
    S.searchTimer = setTimeout(() => { C.q = inp.value; loadCatGrid('#cat-grid', false); }, 300);
  });
  loadCatCategories();
  loadCatGrid('#cat-grid', false);
}

async function loadCatCategories() {
  const { data } = await db.from('catalogue_items').select('category').limit(3000);
  const box = $('#cat-cats');
  if (!box) return;
  const seen = new Map();
  (data || []).forEach((r) => { if (r.category) seen.set(r.category, (seen.get(r.category) || 0) + 1); });
  if (!seen.size) { box.innerHTML = ''; return; }
  const C = S.cat;
  box.innerHTML = '<button class="' + (C.cat === 'all' ? 'on' : '') + '" data-action="cat-filter" data-g="cat" data-v="all">All pieces</button>' +
    Array.from(seen.keys()).sort().map((k) => '<button class="' + (C.cat === k ? 'on' : '') + '" data-action="cat-filter" data-g="cat" data-v="' + esc(k) + '">' + esc(k) + '</button>').join('');
}

function catQuery(C, picking) {
  let q = db.from('catalogue_items').select('*');
  const st = picking ? 'available' : C.status;
  if (st && st !== 'all') q = q.eq('status', st);
  if (!picking && C.cat && C.cat !== 'all') q = q.eq('category', C.cat);
  const s = String(C.q || '').trim().replace(/[,%()]/g, ' ').trim();
  if (s) {
    const pat = '%' + s + '%';
    q = q.or('tag_no.ilike.' + pat + ',title.ilike.' + pat + ',description.ilike.' + pat + ',category.ilike.' + pat + ',stone_details.ilike.' + pat +
      ',diamond_type.ilike.' + pat + ',metal_color.ilike.' + pat);
  }
  return q.order('created_at', { ascending: false }).limit(400);
}

async function loadCatGrid(sel, picking) {
  const box = $(sel);
  if (!box) return;
  const C = picking ? S.catPick : S.cat;
  const { data, error } = await catQuery(C, picking);
  if (!$(sel)) return;
  if (error) { box.innerHTML = '<div class="empty">Could not load the catalogue.<br>If you just installed the add-on, check its database step was run.</div>'; return; }
  const rows = data || [];
  if (picking) S.catPick.items = rows;
  if (!rows.length) {
    box.innerHTML = '<div class="empty"><div class="big">💍</div>' + (String(C.q || '').trim() ? 'No design matches "' + esc(C.q) + '".' :
      picking ? 'No available pieces in the catalogue yet.' : 'No designs here yet.<br>Tap “Add design” to photograph your first piece.') + '</div>';
    return;
  }
  box.innerHTML = '<div class="cat-grid">' + rows.map((it) => {
    const p = catPrice(it);
    const on = picking && S.catPick.sel.has(it.id);
    return '<div class="cat-card' + (on ? ' picked' : '') + '" data-action="' + (picking ? 'cat-pick-toggle' : 'cat-open') + '" data-id="' + it.id + '">' +
      '<div class="cat-img">' + ((it.photo_paths || [])[0] ? '<img data-catimg="' + esc(it.photo_paths[0]) + '" alt="">' : '<span class="cat-noimg">💍</span>') +
      (it.status !== 'available' ? '<span class="cat-badge st-' + esc(it.status) + '">' + esc(CAT_STATUS_LABEL[it.status] || it.status) + '</span>' : '') +
      (picking ? '<span class="cat-check">' + (on ? '✓' : '') + '</span>' : '') + '</div>' +
      '<div class="cat-body"><div class="cat-tag">' + esc(it.tag_no || it.title || 'Design') + '</div>' +
      '<div class="cat-sub">' + esc([it.category, num(it.net_wt) ? grams(it.net_wt) : '', it.metal_color || '',
        it.diamond_type ? it.diamond_type + (num(it.diamond_ct) ? ' ' + num(it.diamond_ct) + ' ct' : '') : ''].filter(Boolean).join(' · ')) + '</div>' +
      (p ? '<div class="cat-price">≈ ' + shortInr(p.c.total) + '</div>' : '') +
      '</div></div>';
  }).join('') + '</div>' + (rows.length >= 400 ? '<div class="notice">Showing the newest 400 — search to find older pieces.</div>' : '');
  fillCatImages(box);
}

async function fillCatImages(root) {
  const imgs = root.querySelectorAll('img[data-catimg]');
  if (!imgs.length) return;
  const m = await signedUrls('catalogue', Array.from(imgs).map((i) => i.dataset.catimg));
  imgs.forEach((im) => { const u = m.get(im.dataset.catimg); if (u) im.src = u; });
}

/* ---------------- one piece ---------------- */
async function fetchCatItem(id) {
  const { data, error } = await db.from('catalogue_items').select('*').eq('id', id).maybeSingle();
  if (error || !data) { toast('Could not open the design.', 'err'); return null; }
  return data;
}
async function openCatItem(id, replace) {
  const it = await fetchCatItem(id);
  if (!it) return;
  const title = it.tag_no || 'Design';
  let first = it;
  showSub(title, () => {
    if (first) { const x = first; first = null; renderCatItem(x); return; }
    $('#content').innerHTML = loadingHTML();
    fetchCatItem(id).then((x) => { const top = S.sub[S.sub.length - 1]; if (x && top && top.title === title) renderCatItem(x); });
  }, replace);
}

function renderCatItem(it) {
  S.catItem = it;
  const rows = [];
  const add = (k, v) => { if (v) rows.push('<div class="detail-row"><div class="dk">' + k + '</div><div class="dv">' + v + '</div></div>'); };
  add('Tag / design no.', esc(it.tag_no));
  add('Piece', esc(it.category));
  add('Metal', esc((it.metal || 'Gold') + (it.purity ? ' ' + purityLabel(it.purity) : '')));
  add(it.metal === 'Silver' ? 'Silver finish' : 'Gold colour', esc(it.metal_color || ''));
  add('Gross weight', it.gross_wt != null ? grams(it.gross_wt) : '');
  add('Net metal weight', it.net_wt != null ? grams(it.net_wt) : '');
  add('Diamonds / stones', esc(diamondLine(it)));
  add('Jewellery certificate', esc(jewelCertLine(it)));
  if (it.diamond_type) {
    add('Other stones', esc(it.stone_details || ''));
    add('Stones + diamonds', num(it.stone_amount) ? inr(it.stone_amount) : '');
  } else add('Stones', esc(it.stone_details || '') + (num(it.stone_amount) ? (it.stone_details ? ' — ' : '') + inr(it.stone_amount) : ''));
  add('Making', num(it.making_per_g) ? inr(it.making_per_g) + ' / g' : '');
  add('Wastage', num(it.wastage_pct) ? num(it.wastage_pct) + '%' : '');
  add('Added by', esc(nameOf(it.created_by)) + ' · ' + fmtD(it.created_at));
  const p = catPrice(it);
  const photos = it.photo_paths || [];
  $('#content').innerHTML =
    (photos.length ? '<div class="cat-photos" id="cat-photos">' + photos.map((ph) => '<img data-catimg="' + esc(ph) + '" alt="">').join('') + '</div>' : '') +
    '<div class="card" style="padding:14px 16px">' +
    '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><div><div style="font-size:18px;font-weight:750">' + esc(it.title || it.category || 'Design') + '</div>' +
    (it.description ? '<div style="color:var(--muted);font-size:14px;margin-top:3px">' + esc(it.description) + '</div>' : '') + '</div>' +
    '<span class="chip cat-st-' + esc(it.status) + '">' + esc(CAT_STATUS_LABEL[it.status] || it.status) + '</span></div></div>' +

    (it.status === 'available' ? '<button class="btn btn-primary" data-action="cat-add-order" data-id="' + it.id + '" style="margin-bottom:10px">＋ Add to an order</button>' : '<div id="cat-inorder"></div>') +
    '<div class="action-row">' +
    '<button class="btn btn-secondary" data-action="cat-share" data-id="' + it.id + '">Share</button>' +
    '<button class="btn btn-secondary" data-action="cat-edit" data-id="' + it.id + '">Edit</button>' +
    '</div>' +

    (p ? '<div class="section-label">Price at ' + esc(rateDateLabel() === 'today' ? 'today\'s' : 'the last') + ((it.metal || 'Gold') === 'Silver' ? ' silver rate' : ' gold rate') + '</div><div class="card o-totals">' +
      '<div class="o-lrow"><span>Metal @ ' + inr(p.rate) + '/g</span><b>' + inr(p.c.metalValue) + '</b></div>' +
      (p.c.wastageValue ? '<div class="o-lrow"><span>Wastage ' + num(it.wastage_pct) + '%</span><b>' + inr(p.c.wastageValue) + '</b></div>' : '') +
      (p.c.making ? '<div class="o-lrow"><span>Making</span><b>' + inr(p.c.making) + '</b></div>' : '') +
      (p.c.stones ? '<div class="o-lrow"><span>Stones</span><b>' + inr(p.c.stones) + '</b></div>' : '') +
      '<div class="o-lrow"><span>GST 3%</span><b>' + inr(p.c.gst) + '</b></div>' +
      '<div class="o-lrow o-total"><span>Approx. price</span><b>' + inr(p.c.total) + '</b></div></div>' :
      (num(it.net_wt) ? '<div class="notice">' + (S.rate && (it.metal || 'Gold') !== 'Silver' && !purityKey(it.purity)
        ? 'Add the purity (Edit) to see the price of this piece.' : 'Set today\'s gold rate to see the price of this piece.') + '</div>' : '')) +

    '<div class="card">' + rows.join('') + '</div>' +
    (it.notes ? '<div class="section-label">Notes</div><div class="card" style="white-space:pre-wrap;font-size:14.5px">' + esc(it.notes) + '</div>' : '') +

    '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin:16px 0 6px">' +
    (it.status === 'available' ? '<button class="btn btn-small btn-ghost" data-action="cat-status" data-id="' + it.id + '" data-s="sold">Mark sold</button>'
      : '<button class="btn btn-small btn-ghost" data-action="cat-status" data-id="' + it.id + '" data-s="available">Mark available</button>') +
    (isOwner() ? '<button class="btn btn-small btn-danger-ghost" data-action="cat-delete" data-id="' + it.id + '">Delete design</button>' : '') +
    '</div>';
  const ph = $('#cat-photos');
  if (ph) fillCatImages(ph);
  if (it.status !== 'available') loadCatOrderLink(it.id);
}

/* "Reserved in ORD-0004 ›" on a piece that is in an order */
async function loadCatOrderLink(catId) {
  const { data } = await db.from('order_items').select('order_id, orders!inner(order_no, status)').eq('catalogue_id', catId)
    .in('orders.status', HOLDING_STATUSES).limit(5);
  const box = $('#cat-inorder');
  if (!box || !data || !data.length) return;
  box.innerHTML = '<div class="notice">' + data.map((r) => (r.orders.status === 'delivered' ? 'Sold in ' : 'Reserved in ') +
    '<a href="#" data-action="o-open" data-id="' + r.order_id + '">' + ordNo(r.orders.order_no) + ' ›</a>').join(' · ') + '</div>';
}

/* ---------------- add / edit ---------------- */
function renderCatForm(existing) {
  const e = existing || {};
  const v = (k) => esc(e[k] == null ? '' : e[k]);
  if (!S.catForm || S.catForm.id !== (e.id || null)) {
    S.catForm = { id: e.id || null, photos: (e.photo_paths || []).map((p) => ({ path: p })), removed: [], j: jewelForm(e) };
    S.formState = { cf_metal: e.metal || 'Gold', cf_purity: purityKey(e.purity) || (e.id ? null : '22K') };
  }
  const cats = ITEM_CATS.slice();
  if (e.category && cats.indexOf(e.category) === -1) cats.unshift(e.category);
  $('#content').innerHTML =
    '<div id="cat-form">' +
    '<div class="section-label">Photos (up to ' + CAT_MAX_PHOTOS + ')</div>' +
    '<div class="card"><div class="cf-photos" id="cf-photos"></div></div>' +
    '<div class="section-label">Details</div>' +
    '<div class="card">' +
    '<div class="o-2col">' +
    '<div class="field"><label>Tag / design no.</label><input type="text" id="cf-tag" value="' + v('tag_no') + '" placeholder="e.g. PK-1042" autocapitalize="characters"></div>' +
    '<div class="field"><label>Type of piece</label><select id="cf-cat"><option value="">Choose…</option>' +
    cats.map((c) => '<option value="' + esc(c) + '"' + (c === e.category ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select></div>' +
    '</div>' +
    '<div class="field"><label>Design name</label><input type="text" id="cf-title" value="' + v('title') + '" placeholder="e.g. Polki choker with emerald drops"></div>' +
    '<div class="field"><label>Description</label><textarea id="cf-desc" style="min-height:64px" placeholder="Finish, colours, size…">' + v('description') + '</textarea></div>' +
    '<div class="field"><label>Metal</label>' + segHTML('cf_metal', ['Gold', 'Silver'], S.formState.cf_metal) + '</div>' +
    '<div class="field"><label>Purity</label><div id="cf-purity-wrap">' + segHTML('cf_purity', purityOptions(S.formState.cf_metal), S.formState.cf_purity) + '</div></div>' +
    '<div class="o-2col">' +
    '<div class="field"><label>Gross wt (g)</label><input type="text" inputmode="decimal" id="cf-gross" value="' + v('gross_wt') + '" placeholder="0.000"></div>' +
    '<div class="field"><label>Net metal wt (g)</label><input type="text" inputmode="decimal" id="cf-net" value="' + v('net_wt') + '" placeholder="0.000"></div>' +
    '<div class="field"><label>Other stones</label><input type="text" id="cf-stones" value="' + v('stone_details') + '" placeholder="e.g. kundan, emerald drops"></div>' +
    '<div class="field"><label>Stones + diamonds ₹</label><input type="text" inputmode="decimal" id="cf-stoneamt" value="' + (num(e.stone_amount) ? v('stone_amount') : '') + '" placeholder="0"></div>' +
    '<div class="field"><label>Making ₹ / g</label><input type="text" inputmode="decimal" id="cf-making" value="' + v('making_per_g') + '" placeholder="e.g. 450"></div>' +
    '<div class="field"><label>Wastage %</label><input type="text" inputmode="decimal" id="cf-wastage" value="' + v('wastage_pct') + '" placeholder="e.g. 4"></div>' +
    '</div>' +
    '</div>' +
    '<div class="section-label">Colour, diamonds &amp; certificate</div>' +
    '<div class="card"><div class="oi-grid" id="cf-jewel"></div>' +
    '<div class="field" style="margin:12px 0 2px"><label>Notes (team only)</label><textarea id="cf-notes" style="min-height:60px" placeholder="Where it is kept, supplier, cost…">' + v('notes') + '</textarea></div>' +
    '</div>' +
    '<button class="btn btn-primary" data-action="cat-save" id="cf-save">' + (e.id ? 'Save changes' : 'Save design') + '</button>' +
    '<div style="height:10px"></div></div>';
  drawCatFormPhotos();
  drawCatJewel();
  $('#cf-jewel').addEventListener('input', onCatJewelInput);
}

/* colour / diamonds / certificate boxes (same as on an order item) */
function drawCatJewel() {
  const box = $('#cf-jewel');
  if (!box || !S.catForm) return;
  box.innerHTML = jewelItemFieldsHTML(S.catForm.j, 0, S.formState.cf_metal || 'Gold').replace(/data-oi=/g, 'data-cj=');
}
function onCatJewelInput(e) {
  const k = e.target.dataset.cj;
  if (!k || !S.catForm) return;
  const j = S.catForm.j;
  j[k] = e.target.value;
  if (JEWEL_TOGGLE_KEYS.indexOf(k) > -1) {
    if (k === 'diamond_type' && !e.target.value) Object.assign(j, { diamond_ct: '', diamond_pcs: '', diamond_quality: '', diamond_rate: '', diamond_cert_lab: '', diamond_cert_no: '' });
    drawCatJewel();
  } else if (k === 'diamond_ct' || k === 'diamond_rate') {
    const v = jewelAutoStoneValue(j);
    if (v != null && $('#cf-stoneamt')) $('#cf-stoneamt').value = v;
  }
}

function drawCatFormPhotos() {
  const box = $('#cf-photos');
  if (!box) return;
  const P = S.catForm.photos;
  box.innerHTML = P.map((p, i) =>
    '<div class="cf-ph"><img ' + (p.blob ? 'src="' + URL.createObjectURL(p.blob) + '"' : 'data-catimg="' + esc(p.path) + '"') + ' alt="">' +
    '<button type="button" class="cf-x" data-action="cat-photo-del" data-idx="' + i + '" aria-label="Remove photo">✕</button>' +
    (i === 0 ? '<span class="cf-main">Cover</span>' : '') + '</div>').join('') +
    (P.length < CAT_MAX_PHOTOS ? '<button type="button" class="cf-add" data-action="cat-photo-add">＋<span>Photo</span></button>' : '');
  fillCatImages(box);
}

function catPhotoAdd() {
  const ov = openModal('<h3>Add a photo</h3><p>Use good light and a plain background — the first photo is the cover.</p>' +
    '<div style="display:flex;flex-direction:column;gap:10px">' +
    '<button class="btn btn-primary" data-m="cam">📷 Take photo</button>' +
    '<button class="btn btn-secondary" data-m="gal">🖼️ Choose from gallery</button></div>');
  const go = (fromGallery) => {
    closeModal();
    pickImage(async (file) => {
      try { const p = await downscale(file, 1600); S.catForm.photos.push({ blob: p.blob }); }
      catch (e) { toast('Could not read that image — try again.', 'err'); return; }
      drawCatFormPhotos();
    }, fromGallery);
  };
  ov.querySelector('[data-m=cam]').onclick = () => go(false);
  ov.querySelector('[data-m=gal]').onclick = () => go(true);
}

async function saveCatItem() {
  const F = S.catForm;
  const tag = $('#cf-tag').value.trim();
  const title = $('#cf-title').value.trim();
  const category = $('#cf-cat').value;
  if (!tag && !title && !category) { toast('Give it a tag no., a design name or a type.', 'err'); return; }
  if (!F.photos.length) { toast('Add at least one photo.', 'err'); return; }
  const row = {
    tag_no: tag || null, category: category || null, title: title || null,
    description: $('#cf-desc').value.trim() || null,
    metal: S.formState.cf_metal || 'Gold', purity: purityVal(S.formState.cf_purity),
    gross_wt: numOrNull($('#cf-gross').value), net_wt: numOrNull($('#cf-net').value),
    stone_details: $('#cf-stones').value.trim() || null, stone_amount: round2(num($('#cf-stoneamt').value)),
    making_per_g: numOrNull($('#cf-making').value), wastage_pct: numOrNull($('#cf-wastage').value),
    notes: $('#cf-notes').value.trim() || null,
  };
  Object.assign(row, jewelRow(F.j || {}));
  const btn = $('#cf-save'); const label = btn.textContent;
  btn.disabled = true; btn.textContent = 'Saving…';
  const fail = (m) => { btn.disabled = false; btn.textContent = label; toast(m, 'err'); };
  let id = F.id;
  if (!id) {
    row.created_by = S.me.id;
    const { data, error } = await db.from('catalogue_items').insert(row).select('id').single();
    if (error) { fail(String(error.code) === '23505' || /duplicate/i.test(error.message || '') ? 'That tag no. is already used by another design.' : 'Could not save — try again.'); return; }
    id = data.id;
  } else {
    const { error } = await db.from('catalogue_items').update(row).eq('id', id);
    if (error) { fail(String(error.code) === '23505' || /duplicate/i.test(error.message || '') ? 'That tag no. is already used by another design.' : 'Could not save — try again.'); return; }
  }
  const paths = [];
  let upFail = false;
  for (let i = 0; i < F.photos.length; i++) {
    const p = F.photos[i];
    if (p.path) { paths.push(p.path); continue; }
    const path = id + '/' + Date.now() + '-' + i + '.jpg';
    const { error } = await db.storage.from('catalogue').upload(path, p.blob, { contentType: 'image/jpeg' });
    if (error) upFail = true; else paths.push(path);
  }
  await db.from('catalogue_items').update({ photo_paths: paths }).eq('id', id);
  if (F.removed.length) db.storage.from('catalogue').remove(F.removed);
  toast(upFail ? 'Saved — but a photo could not be uploaded.' : (F.id ? 'Design updated ✓' : 'Design added ✓'), upFail ? 'err' : 'ok');
  S.catForm = null;
  if (F.id && S.sub.length > 1) { S.suppressPop = true; try { history.back(); } catch (_) {} S.sub.pop(); }
  openCatItem(id, true);
}

/* ---------------- share ---------------- */
function catCaption(it, withPrice) {
  const lines = ['*' + bizName() + ' — ' + (it.tag_no ? 'Design ' + it.tag_no : (it.title || 'Design')) + '*'];
  const t = [it.category, it.tag_no ? it.title : ''].filter(Boolean).join(' · ');
  if (t) lines.push(t);
  if (it.description) lines.push(it.description);
  lines.push([(it.metal || 'Gold') + (it.purity ? ' ' + (purityKey(it.purity) || num(it.purity) + '%') : ''),
    num(it.net_wt) ? 'Net ' + grams(it.net_wt) : '', num(it.gross_wt) ? 'Gross ' + grams(it.gross_wt) : ''].filter(Boolean).join(' · '));
  if (it.metal_color) lines.push(colorLabel(it.metal, it.metal_color));
  if (it.diamond_type) lines.push(diamondLine(it));
  if (it.jewel_cert_type) lines.push(jewelCertLine(it));
  if (it.stone_details) lines.push('Stones: ' + it.stone_details);
  if (withPrice) {
    const p = catPrice(it);
    if (p) lines.push('Approx. price: ' + inr(p.c.total) + ' (gold rate of ' + rateDateLabel() + ', incl. 3% GST)');
  }
  return lines.join('\n');
}

async function shareCatItem(id) {
  const it = S.catItem && S.catItem.id === id ? S.catItem : await fetchCatItem(id);
  if (!it) return;
  const ov = document.createElement('div');
  ov.className = 'scan-overlay';
  ov.innerHTML = '<div class="spinner"></div><div>Getting photos…</div>';
  document.body.appendChild(ov);
  const files = [];
  try {
    const paths = (it.photo_paths || []).slice(0, 4);
    const urls = await signedUrls('catalogue', paths);
    for (const p of paths) {
      const u = urls.get(p);
      if (!u) continue;
      const r = await fetch(u);
      if (!r.ok) continue;
      const b = await r.blob();
      files.push(new File([b], safeFileName((it.tag_no || 'design') + '-' + (files.length + 1)) + '.jpg', { type: b.type || 'image/jpeg' }));
    }
  } catch (e) { /* share text only */ }
  ov.remove();
  const can = files.length && navigator.canShare && navigator.canShare({ files });
  const m = openModal('<h3>Share this design</h3><p>' + (can ? files.length + ' photo' + (files.length === 1 ? '' : 's') + ' with the details below.' : 'Send the details on WhatsApp' + (files.length ? ' — the photos will be downloaded to attach.' : '.')) + '</p>' +
    '<label class="cf-check"><input type="checkbox" id="cs-price"> Include approx. price' + (catPrice(it) ? '' : ' (set today\'s gold rate first)') + '</label>' +
    '<div style="display:flex;flex-direction:column;gap:10px;margin-top:12px">' +
    (can ? '<button class="btn btn-primary" data-m="share">Share photos + details</button>' : '') +
    '<button class="btn ' + (can ? 'btn-secondary' : 'btn-primary') + '" data-m="wa">WhatsApp (text' + (can ? ' only' : '') + ')</button>' +
    '<button class="btn btn-ghost" data-m="no">Close</button></div>');
  const cap = () => catCaption(it, $('#cs-price') && $('#cs-price').checked);
  if (can) m.querySelector('[data-m=share]').onclick = async () => {
    try { await navigator.share({ files, text: cap() }); closeModal(); } catch (e) { /* cancelled */ }
  };
  m.querySelector('[data-m=wa]').onclick = () => {
    if (!can) files.forEach((f) => downloadBlob(f, f.name));
    window.open(waUrl('', cap()), '_blank');
    closeModal();
  };
  m.querySelector('[data-m=no]').onclick = closeModal;
}

async function setCatStatus(id, s) {
  const { error } = await db.from('catalogue_items').update({ status: s }).eq('id', id);
  if (error) { toast('Could not update — try again.', 'err'); return; }
  toast('Marked ' + CAT_STATUS_LABEL[s] + ' ✓', 'ok');
  openCatItem(id, true);
}

function deleteCatItem(id) {
  confirmModal('Delete this design?', 'It will be removed from the catalogue with its photos. Orders that used it keep their details.', 'Delete', async () => {
    const it = await fetchCatItem(id);
    const { error } = await db.from('catalogue_items').delete().eq('id', id);
    if (error) { toast('Could not delete — only the owner can delete designs.', 'err'); return; }
    if (it && it.photo_paths && it.photo_paths.length) db.storage.from('catalogue').remove(it.photo_paths);
    toast('Design deleted', 'ok');
    backOne();
  }, true);
}

/* ---------------- pick pieces for an order ---------------- */
function openCatPicker() {
  S.catPick = { q: '', sel: new Set(), items: [] };
  showSub('Pick from catalogue', renderCatPicker);
}
function renderCatPicker() {
  $('#content').innerHTML =
    '<div class="search-box"><input type="text" id="cp-search" placeholder="Search tag no., design…" autocomplete="off" value="' + esc(S.catPick.q) + '"></div>' +
    '<div id="cp-grid">' + loadingHTML() + '</div>' +
    '<div class="cat-pick-bar"><button class="btn btn-primary" data-action="cat-pick-done" id="cp-done">Add selected pieces</button></div>';
  const inp = $('#cp-search');
  inp.addEventListener('input', () => {
    clearTimeout(S.searchTimer);
    S.searchTimer = setTimeout(() => { S.catPick.q = inp.value; loadCatGrid('#cp-grid', true); }, 300);
  });
  loadCatGrid('#cp-grid', true);
  updatePickBar();
}
function updatePickBar() {
  const b = $('#cp-done');
  if (b) b.textContent = S.catPick.sel.size ? 'Add ' + S.catPick.sel.size + ' piece' + (S.catPick.sel.size === 1 ? '' : 's') + ' to the order' : 'Tap pieces to select them';
}
function catToItem(c) {
  return Object.assign(blankItem(), jewelForm(c), {
    category: c.category || '', description: [c.title, c.description].filter(Boolean).join(' — '), design_code: c.tag_no || '', qty: '1',
    gross_wt: c.gross_wt != null ? String(c.gross_wt) : '', net_wt: c.net_wt != null ? String(c.net_wt) : '',
    stone_details: c.stone_details || '', stone_amount: num(c.stone_amount) ? String(c.stone_amount) : '',
    catalogue_id: c.id, cat_photo: (c.photo_paths || [])[0] || null,
  });
}
/* also used by startNewOrder when an order is started from a catalogue piece */
function addCatItemsToOrder(list) {
  if (!S.ord || !list || !list.length) return;
  const have = new Set(S.ord.items.map((x) => x.catalogue_id).filter(Boolean));
  const fresh = list.filter((c) => !have.has(c.id));
  if (S.ord.items.length === 1 && !itemHasContent(S.ord.items[0])) S.ord.items = [];
  fresh.forEach((c) => S.ord.items.push(catToItem(c)));
  if (!S.ord.items.length) S.ord.items.push(blankItem());
  const f = fresh[0];
  if (f) {
    if (!num(S.ord.o.making_per_g) && num(f.making_per_g)) S.ord.o.making_per_g = String(num(f.making_per_g));
    if (!num(S.ord.o.wastage_pct) && num(f.wastage_pct)) S.ord.o.wastage_pct = String(num(f.wastage_pct));
    if (f.metal) S.formState.o_metal = f.metal;
    if (f.purity && purityKey(f.purity)) S.formState.o_purity = purityKey(f.purity);
    if (purityOptions(S.formState.o_metal || 'Gold').indexOf(S.formState.o_purity) === -1) S.formState.o_purity = defaultPurity(S.formState.o_metal || 'Gold');
    applyAutoRate();
  }
}
function catPickDone() {
  if (!S.catPick.sel.size) { toast('Tap the pieces you want first.', 'err'); return; }
  const chosen = S.catPick.items.filter((i) => S.catPick.sel.has(i.id));
  addCatItemsToOrder(chosen);
  backOne();
  toast(chosen.length + ' piece' + (chosen.length === 1 ? '' : 's') + ' added ✓', 'ok');
}

/* ---------------- choice-button hook (metal → purity options) ---------------- */
window.SEG_HOOKS.push((group) => {
  if (group !== 'cf_metal' || !$('#cat-form')) return;
  const metal = S.formState.cf_metal || 'Gold';
  if (!S.formState.cf_metal) S.formState.cf_metal = 'Gold';
  if (purityOptions(metal).indexOf(S.formState.cf_purity) === -1) S.formState.cf_purity = defaultPurity(metal);
  const w = $('#cf-purity-wrap');
  if (w) w.innerHTML = segHTML('cf_purity', purityOptions(metal), S.formState.cf_purity);
  const j = S.catForm && S.catForm.j;
  if (j && j.metal_color && colorOptions(metal).indexOf(j.metal_color) === -1) j.metal_color = '';
  drawCatJewel();
});

/* ---------------- export ---------------- */
async function exportCatalogueData(pName, today) {
  const rows = await fetchAll('catalogue_items', 'created_at');
  await new Promise((r) => setTimeout(r, 450));
  downloadFile('bj-catalogue-' + today + '.csv', buildCsv(
    ['Tag no', 'Piece', 'Design name', 'Description', 'Metal', 'Purity', 'Colour / finish', 'Gross wt (g)', 'Net wt (g)', 'Diamonds / stones', 'Carats', 'Diamond pcs',
      'Diamond quality', 'Rate per ct', 'Diamond certificate', 'Diamond cert no', 'Jewellery certificate', 'Jewellery cert / HUID no',
      'Other stones', 'Stone value', 'Making / g', 'Wastage %', 'Status', 'Photos', 'Notes', 'Added by', 'Added on'],
    rows.map((c) => [c.tag_no, c.category, c.title, c.description, c.metal, c.purity, c.metal_color, c.gross_wt, c.net_wt, diamondLabel(c.diamond_type), c.diamond_ct, c.diamond_pcs,
      c.diamond_quality, c.diamond_rate, c.diamond_type ? (c.diamond_cert_lab || 'Not certified') : '', c.diamond_cert_no, c.jewel_cert_type || '', c.jewel_cert_no,
      c.stone_details, c.stone_amount, c.making_per_g, c.wastage_pct,
      CAT_STATUS_LABEL[c.status] || c.status, (c.photo_paths || []).length, c.notes, pName.get(c.created_by) || '', fmtExp(c.created_at)])));
}

onAct('cat-filter', (el) => { S.cat[el.dataset.g] = el.dataset.v; renderCatalogue(); });
onAct('cat-new', () => { S.catForm = null; showSub('Add design', () => renderCatForm(null)); });
onAct('cat-open', (el) => openCatItem(el.dataset.id));
onAct('cat-edit', async (el) => { const it = await fetchCatItem(el.dataset.id); if (it) { S.catForm = null; showSub('Edit design', () => renderCatForm(it)); } });
onAct('cat-save', () => saveCatItem());
onAct('cat-photo-add', () => catPhotoAdd());
onAct('cat-photo-del', (el) => { const p = S.catForm.photos.splice(+el.dataset.idx, 1)[0]; if (p && p.path) S.catForm.removed.push(p.path); drawCatFormPhotos(); });
onAct('cat-share', (el) => shareCatItem(el.dataset.id));
onAct('cat-status', (el) => setCatStatus(el.dataset.id, el.dataset.s));
onAct('cat-delete', (el) => deleteCatItem(el.dataset.id));
onAct('cat-add-order', async (el) => {
  const it = S.catItem && S.catItem.id === el.dataset.id ? S.catItem : await fetchCatItem(el.dataset.id);
  if (!it) return;
  S.pendingCatItems = [it];
  showSub('Choose client', renderPickClient);
});
onAct('cat-pick-toggle', (el) => {
  const id = el.dataset.id;
  if (S.catPick.sel.has(id)) S.catPick.sel.delete(id); else S.catPick.sel.add(id);
  el.classList.toggle('picked', S.catPick.sel.has(id));
  const ck = el.querySelector('.cat-check'); if (ck) ck.textContent = S.catPick.sel.has(id) ? '✓' : '';
  updatePickBar();
});
onAct('cat-pick-done', () => catPickDone());
