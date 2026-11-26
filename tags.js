/* ============================================================
   STOCK BY TAG  (database update 18)
   · Add stock fast: a photo of the tag (the AI reads the tag no.,
     design no., gross / net weight, diamonds and colour stones), one
     photo of the piece, check the numbers, save — and the next tag.
   · Find a piece: scan the QR on its tag (on phones whose browser can
     read codes) or take a photo of the printed side of the tag.
   Tag photos are read by the scan-tag server function with the same AI
   key as visiting cards. Loaded after catalogue.js, before app.js.
   ============================================================ */
'use strict';

function tagsOn() { return !!S.dbv18; }

/* the type of piece from the letters in the code: 25ER00344 / ER00055 → Earrings */
const TAG_PREFIX = [['ER', 'Earrings'], ['EAR', 'Earrings'], ['ET', 'Earrings'], ['JH', 'Jhumka'], ['RG', 'Ring'], ['LR', 'Ring'], ['GR', 'Ring'],
  ['RN', 'Ring'], ['PD', 'Pendant'], ['PN', 'Pendant'], ['PS', 'Pendant set'], ['NK', 'Necklace'], ['NL', 'Necklace'], ['NC', 'Necklace'],
  ['CK', 'Choker'], ['BR', 'Bracelet'], ['BL', 'Bracelet'], ['BN', 'Bangles'], ['BG', 'Bangles'], ['KD', 'Kada'], ['CH', 'Chain'],
  ['MS', 'Mangalsutra'], ['MT', 'Maang tikka'], ['NP', 'Nose pin'], ['NT', 'Nath']];
function tagCategory(code) {
  const m = /^(?:\d{2})?([A-Z]{2,4})\d/.exec(String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''));
  if (!m) return '';
  const p = m[1];
  const hit = TAG_PREFIX.find((x) => x[0] === p) || TAG_PREFIX.find((x) => p.indexOf(x[0]) === 0);
  return hit ? hit[1] : '';
}
function tagCode(s) { return String(s == null ? '' : s).toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9\-/.]/g, '').slice(0, 40); }
const STOCK_CATS = ['Earrings', 'Ring', 'Pendant', 'Pendant set', 'Necklace', 'Choker', 'Long haar', 'Bracelet', 'Bangles', 'Kada', 'Chain',
  'Mangalsutra', 'Jhumka', 'Maang tikka', 'Nath', 'Nose pin', 'Other'];

/* what a code or the text in a tag's QR says: weights when they are there, else just the code */
function parseTagText(raw) {
  const t = String(raw || '').toUpperCase();
  const out = {};
  const n = (re) => { const m = re.exec(t); return m ? parseFloat(m[1]) : null; };
  const pair = (re) => { const m = re.exec(t); return m ? [parseFloat(m[1]), m[2] != null ? parseInt(m[2], 10) : null] : null; };
  out.gross_wt = n(/\bG\.?\s*W(?:EIGH)?T\.?\s*[:=-]?\s*(\d+(?:\.\d+)?)/);
  out.net_wt = n(/\bN\.?\s*W(?:EIGH)?T\.?\s*[:=-]?\s*(\d+(?:\.\d+)?)/);
  const d = pair(/\bD(?:IA)?\.?\s*W?T?\.?\s*[:=-]\s*(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+))?/) || pair(/\bDWT\.?\s*[:=-]?\s*(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+))?/);
  if (d) { out.dia_ct = d[0]; out.dia_pcs = d[1]; }
  const c = pair(/\bC\.?S\.?\s*W?T?\.?\s*[:=-]?\s*(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+))?/);
  if (c) { out.cs_ct = c[0]; out.cs_pcs = c[1]; }
  const codes = t.replace(/\b[A-Z]*WT\b|\bCSWT\b/g, ' ').match(/\b[A-Z0-9][A-Z0-9\-/]{3,}\b/g) || [];
  const real = codes.filter((x) => /[A-Z]/.test(x) && /\d/.test(x) && !/^(GWT|NWT|DWT|CSWT)$/.test(x));
  const longC = real.find((x) => /^\d{2}[A-Z]{2,4}\d{3,}$/.test(x));
  const shortC = real.find((x) => /^[A-Z]{2,4}\d{3,}$/.test(x));
  if (longC) out.tag_no = longC;
  if (shortC) out.design_no = shortC;
  if (!longC && !shortC && real.length) out.code = real[0];
  if (!real.length && /^[A-Z0-9\-/.]{3,40}$/.test(t.trim())) out.code = t.trim();
  out.code = out.code || out.tag_no || out.design_no || null;
  Object.keys(out).forEach((k) => { if (out[k] == null || (typeof out[k] === 'number' && !isFinite(out[k]))) delete out[k]; });
  return out;
}

/* ---------------- reading ---------------- */
/* the QR in a photo (phones whose browser can read codes) — the text or null */
async function qrFromImage(src) {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const det = new window.BarcodeDetector({ formats: ['qr_code'] });
    const found = await det.detect(src);
    return found && found[0] ? String(found[0].rawValue || '') : null;
  } catch (e) { return null; }
}
/* the printed side of a tag → { ok, tag: { tag_no, design_no, gross_wt … warnings } } or { error } */
async function readTagAI(photo) {
  try {
    const { data, error } = await db.functions.invoke('scan-tag', { body: { image_base64: photo.base64, mime_type: photo.mime || 'image/jpeg' } });
    if (error) return { error: 'network' };
    return data || { error: 'empty' };
  } catch (e) { return { error: 'network' }; }
}
function tagReadError(res) {
  const e = res && res.error;
  if (e === 'not_configured') return 'Reading tags needs the AI key (More → Settings) — type the numbers for now.';
  if (e === 'quota') return 'The AI is busy (daily limit) — type the numbers for now.';
  if (e === 'network') return 'No connection — type the numbers, or try again.';
  return 'Could not read the tag — type the numbers, or take a clearer photo.';
}
/* the weights should add up: gross ≈ net + stones (1 carat = 0.2 g) */
function stockWeightWarn(f) {
  const g = numOrNull(f.gross_wt), nt = numOrNull(f.net_wt);
  if (g == null || nt == null) return '';
  if (nt > g + 0.0005) return 'The net weight is more than the gross weight — check both.';
  const st = (num(f.dia_ct) + num(f.cs_ct)) * 0.2;
  if (st > 0 && Math.abs(g - nt - st) > Math.max(0.05, g * 0.02)) return 'Gross, net and stone weights do not add up — check the numbers.';
  return '';
}

/* ---------------- add stock ---------------- */
function stockDefaults() {
  try { return Object.assign({ metal: 'Gold', purity: '18K', color: '', dia: 'Natural' }, JSON.parse(localStorage.getItem('stockDefaults') || '{}')); }
  catch (e) { return { metal: 'Gold', purity: '18K', color: '', dia: 'Natural' }; }
}
function blankStock() {
  const d = stockDefaults();
  return { tag_no: '', design_no: '', category: '', gross_wt: '', net_wt: '', dia_ct: '', dia_pcs: '', cs_ct: '', cs_pcs: '', notes: '', dia_type: d.dia, warn: '',
    dia_cost: '', making_cost: '' };
}
function startAddStock(prefill, from) {
  const d = stockDefaults();
  S.st = { tagPhoto: null, piece: (from && from.piece) || null, f: Object.assign(blankStock(), prefill || {}), msg: '', msgKind: '', reading: false, added: (S.st && S.st.added) || 0,
    fromOrder: (from && from.order) || null, fromItem: (from && from.item) || null };
  S.formState = Object.assign(S.formState || {}, { st_metal: d.metal, st_purity: d.purity, st_color: d.color || null });
  if (purityOptions(d.metal).indexOf(S.formState.st_purity) === -1) S.formState.st_purity = defaultPurity(d.metal);
  showSub('Add stock', renderAddStock);
}
function renderAddStock() {
  const T = S.st;
  if (!T) return;
  const f = T.f;
  const v = (k) => esc(f[k] == null ? '' : f[k]);
  const metal = S.formState.st_metal || 'Gold';
  const cats = STOCK_CATS.slice();
  if (f.category && cats.indexOf(f.category) === -1) cats.unshift(f.category);
  $('#content').innerHTML =
    '<div class="card st-step"><div class="st-h"><span class="st-n">1</span><span><b>Photo of the tag</b><span>The side with the weights — fill the frame with it</span></span></div>' +
    (T.tagPhoto ? '<img class="st-thumb st-tagimg" src="' + URL.createObjectURL(T.tagPhoto.blob) + '" alt="">' : '') +
    '<div class="photo-row"><button type="button" class="btn ' + (T.tagPhoto ? 'btn-secondary' : 'btn-primary') + '" data-action="st-tag">📷 ' + (T.tagPhoto ? 'Take again' : 'Photo of the tag') + '</button>' +
    '<button type="button" class="btn btn-small btn-ghost" data-action="st-tag" data-gal="1">From gallery</button></div>' +
    '<div class="st-read' + (T.msgKind ? ' ' + T.msgKind : '') + '" id="st-read">' + (T.reading ? '<span class="spinner sm"></span> ' : '') + esc(T.msg || '') + '</div></div>' +

    '<div class="card st-step"><div class="st-h"><span class="st-n">2</span><span><b>Photo of the piece</b><span>Plain background, good light</span></span></div>' +
    (T.piece ? '<img class="st-thumb" src="' + URL.createObjectURL(T.piece.blob) + '" alt="">' : '') +
    '<div class="photo-row"><button type="button" class="btn ' + (T.piece ? 'btn-secondary' : 'btn-primary') + '" data-action="st-piece">📷 ' + (T.piece ? 'Take again' : 'Photo of the piece') + '</button>' +
    '<button type="button" class="btn btn-small btn-ghost" data-action="st-piece" data-gal="1">From gallery</button></div></div>' +

    '<div class="section-label">Check the details</div>' +
    '<div class="card" id="st-form">' +
    '<div class="o-2col">' +
    '<div class="field"><label>Tag no.</label><input type="text" data-st="tag_no" value="' + v('tag_no') + '" placeholder="e.g. 25ER00344" autocapitalize="characters" autocomplete="off"></div>' +
    '<div class="field"><label>Design no.</label><input type="text" data-st="design_no" value="' + v('design_no') + '" placeholder="e.g. ER00055" autocapitalize="characters" autocomplete="off"></div>' +
    '</div>' +
    '<div class="field"><label>Type of piece</label><select data-st="category"><option value="">Choose…</option>' +
    cats.map((c) => '<option value="' + esc(c) + '"' + (c === f.category ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>Metal</label>' + segHTML('st_metal', ['Gold', 'Silver'], metal) + '</div>' +
    '<div class="field"><label>Purity</label><div id="st-purity-wrap">' + segHTML('st_purity', purityOptions(metal), S.formState.st_purity) + '</div></div>' +
    '<div class="field"><label id="st-color-label">' + colorFieldLabel(metal) + '</label><div id="st-color-wrap">' + segHTML('st_color', colorOptions(metal), S.formState.st_color || null) + '</div></div>' +
    '<div class="o-2col">' +
    '<div class="field"><label>Gross wt (g)</label><input type="text" inputmode="decimal" data-st="gross_wt" value="' + v('gross_wt') + '" placeholder="0.000"></div>' +
    '<div class="field"><label>Net wt (g)</label><input type="text" inputmode="decimal" data-st="net_wt" value="' + v('net_wt') + '" placeholder="0.000"></div>' +
    '</div>' +
    '<div class="o-3col">' +
    '<div class="field"><label>Diamonds (ct)</label><input type="text" inputmode="decimal" data-st="dia_ct" value="' + v('dia_ct') + '" placeholder="0.000"></div>' +
    '<div class="field"><label>Pcs</label><input type="text" inputmode="numeric" data-st="dia_pcs" value="' + v('dia_pcs') + '" placeholder="0"></div>' +
    '<div class="field"><label>Kind</label><select data-st="dia_type">' + DIAMOND_TYPES.filter((t) => t !== 'Colour stones')
      .map((t) => '<option value="' + esc(t) + '"' + (t === f.dia_type ? ' selected' : '') + '>' + esc(diamondLabel(t)) + '</option>').join('') + '</select></div>' +
    '</div>' +
    '<div class="o-2col">' +
    '<div class="field"><label>Colour stones (ct)</label><input type="text" inputmode="decimal" data-st="cs_ct" value="' + v('cs_ct') + '" placeholder="0.000"></div>' +
    '<div class="field"><label>Pcs</label><input type="text" inputmode="numeric" data-st="cs_pcs" value="' + v('cs_pcs') + '" placeholder="0"></div>' +
    '</div>' +
    '<div class="st-warn" id="st-warn">' + esc(f.warn || stockWeightWarn(f)) + '</div>' +
    (S.dbv19 && isOwner() ? '<div class="o-2col st-cost"><div class="field"><label>Diamond cost (₹ per ct)</label><input type="text" inputmode="decimal" data-st="dia_cost" value="' + v('dia_cost') + '" placeholder="Only you see this"></div>' +
      '<div class="field"><label>Making cost (₹)</label><input type="text" inputmode="decimal" data-st="making_cost" value="' + v('making_cost') + '" placeholder="Only you see this"></div></div>' : '') +
    '<div class="field" style="margin-bottom:2px"><label>Notes (team only)</label><input type="text" data-st="notes" value="' + v('notes') + '" placeholder="Where it is kept, supplier…" autocomplete="off"></div>' +
    '</div>' +
    '<div class="st-acts"><button class="btn btn-primary" data-action="st-save" data-next="1" id="st-save-next">Save · next tag</button>' +
    '<button class="btn btn-secondary" data-action="st-save" id="st-save-done">Save · done</button></div>' +
    (T.added ? '<div class="notice st-count">' + esc(T.added === 1 ? '1 piece added' : T.added + ' pieces added') + '</div>' : '') +
    '<div style="height:10px"></div>';
  const form = $('#st-form');
  form.addEventListener('input', (e) => {
    const k = e.target.dataset.st;
    if (!k || !S.st) return;
    S.st.f[k] = e.target.value;
    if (k === 'tag_no' || k === 'design_no') {
      // the type of piece follows the code until it is chosen by hand
      const cat = tagCategory(S.st.f.tag_no) || tagCategory(S.st.f.design_no);
      const sel = form.querySelector('[data-st=category]');
      if (cat && sel && (!S.st.f.category || S.st.f.catAuto) && Array.from(sel.options).some((o) => o.value === cat)) { S.st.f.category = cat; S.st.f.catAuto = true; sel.value = cat; }
    }
    if (['gross_wt', 'net_wt', 'dia_ct', 'cs_ct'].indexOf(k) > -1) { S.st.f.warn = ''; const w = $('#st-warn'); if (w) w.textContent = stockWeightWarn(S.st.f); }
  });
  form.addEventListener('change', (e) => {
    const k = e.target.dataset.st;
    if (!k || !S.st) return;
    S.st.f[k] = e.target.value;
    if (k === 'category') S.st.f.catAuto = false;
  });
}
function keepStockForm() {
  if (!S.st) return;
  document.querySelectorAll('#st-form [data-st]').forEach((el) => { S.st.f[el.dataset.st] = el.value; });
}

/* the tag's photo: its QR (when the phone can read it) and the AI read of the printed side */
function stockTagPhoto(gal) {
  keepStockForm();
  pickImage(async (file) => {
    const T = S.st;
    if (!T) return;
    let photo;
    try { photo = await downscale(file, 1600); } catch (e) { toast(imageErrMsg(e), 'err'); return; }
    T.tagPhoto = photo;
    T.reading = true; T.msg = 'Reading the tag…'; T.msgKind = '';
    renderAddStock();
    let qr = null;
    try { qr = await qrFromImage(await decodeImage(photo.blob, 1600)); } catch (e) { /* no code */ }
    const res = S.geminiConfigured ? await readTagAI(photo) : { error: 'not_configured' };
    if (S.st !== T) return;
    T.reading = false;
    const f = T.f;
    if (res && res.ok && res.tag) {
      const t = res.tag;
      const set = (k, val) => { if (val != null && val !== '') f[k] = String(val); };
      set('tag_no', t.tag_no); set('design_no', t.design_no);
      set('gross_wt', t.gross_wt); set('net_wt', t.net_wt); set('dia_ct', t.dia_ct); set('dia_pcs', t.dia_pcs); set('cs_ct', t.cs_ct); set('cs_pcs', t.cs_pcs);
      if (t.metal === 'Silver' || t.metal === 'Gold') S.formState.st_metal = t.metal;
      const pk = t.purity_pct != null ? purityKey(t.purity_pct) : null;
      if (pk && purityOptions(S.formState.st_metal || 'Gold').indexOf(pk) > -1) S.formState.st_purity = pk;
      if (!f.notes && t.other) f.notes = t.other;
      f.warn = (t.warnings || [])[0] || '';
      T.msg = 'Read ✓ — check the numbers against the tag'; T.msgKind = 'ok';
    } else {
      T.msg = tagReadError(res); T.msgKind = 'err';
    }
    if (qr) {
      const q = parseTagText(qr);
      ['gross_wt', 'net_wt', 'dia_ct', 'dia_pcs', 'cs_ct', 'cs_pcs'].forEach((k) => { if (q[k] != null && !f[k]) f[k] = String(q[k]); });
      if (q.tag_no && !f.tag_no) f.tag_no = q.tag_no;
      if (q.design_no && !f.design_no) f.design_no = q.design_no;
      if (!q.tag_no && !q.design_no && q.code && !f.design_no && q.code !== f.tag_no) f.design_no = q.code;
    }
    if (f.tag_no && f.design_no && tagCode(f.tag_no) === tagCode(f.design_no)) f.design_no = '';
    if (!f.category || f.catAuto) { const c = tagCategory(f.tag_no) || tagCategory(f.design_no); if (c) { f.category = c; f.catAuto = true; } }
    if (num(f.dia_ct) > 0 && !f.dia_type) f.dia_type = stockDefaults().dia;
    renderAddStock();
  }, gal);
}
function stockPiecePhoto(gal) {
  keepStockForm();
  pickImage(async (file) => {
    const p = await photoFromFile(file, 'Photo of the piece');
    if (!p || !S.st) return;
    S.st.piece = p;
    renderAddStock();
  }, gal);
}

function likeExact(s) { return String(s).replace(/[\\%_]/g, '\\$&'); }
async function saveStock(next) {
  keepStockForm();
  const T = S.st;
  if (!T) return;
  const f = T.f;
  const tag = tagCode(f.tag_no);
  if (!tag) { toast('Write the tag no. (or take a photo of the tag).', 'err'); return; }
  const go = async () => {
    const btns = [$('#st-save-next'), $('#st-save-done')].filter(Boolean);
    btns.forEach((b) => { b.disabled = true; });
    const fail = (m) => { btns.forEach((b) => { b.disabled = false; }); toast(m, 'err'); };
    const { data: dup } = await db.from('catalogue_items').select('id, tag_no, status').ilike('tag_no', likeExact(tag)).limit(1);
    if (dup && dup.length) {
      btns.forEach((b) => { b.disabled = false; });
      const ov = openModal('<h3>' + esc(tag) + ' is already in the stock</h3><p>A tag no. can be used for one piece only.</p>' +
        '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Close</button><button class="btn btn-primary" data-m="open">Open it</button></div>');
      ov.querySelector('[data-m=no]').onclick = closeModal;
      ov.querySelector('[data-m=open]').onclick = () => { closeModal(); openCatItem(dup[0].id); };
      return;
    }
    const metal = S.formState.st_metal || 'Gold';
    const dct = numOrNull(f.dia_ct), cct = numOrNull(f.cs_ct);
    const row = {
      tag_no: tag, design_no: tagCode(f.design_no) || null, category: f.category || tagCategory(tag) || null,
      metal, purity: purityVal(S.formState.st_purity), metal_color: S.formState.st_color || null,
      gross_wt: numOrNull(f.gross_wt), net_wt: numOrNull(f.net_wt),
      diamond_type: dct ? (f.dia_type || 'Natural') : null, diamond_ct: dct || null,
      diamond_pcs: dct && numOrNull(f.dia_pcs) != null ? Math.round(num(f.dia_pcs)) : null,
      cs_ct: cct || null, cs_pcs: cct && numOrNull(f.cs_pcs) != null ? Math.round(num(f.cs_pcs)) : null,
      notes: String(f.notes || '').trim() || null, status: 'available', created_by: S.me.id,
    };
    if (S.dbv19 && T.fromItem) { row.from_order = T.fromOrder; row.from_item = T.fromItem; }
    const { data, error } = await db.from('catalogue_items').insert(row).select('id').single();
    if (error || !data) { fail(String((error && error.code) || '') === '23505' ? 'That tag no. is already in the stock.' : 'Could not save — try again.'); return; }
    const id = data.id;
    let upFail = false;
    const patch = {};
    if (T.piece) {
      const path = id + '/' + Date.now() + '-0.jpg';
      const up = await db.storage.from('catalogue').upload(path, T.piece.blob, { contentType: 'image/jpeg' });
      if (up.error) upFail = true; else patch.photo_paths = [path];
    }
    if (T.tagPhoto) {
      const path = id + '/tag-' + Date.now() + '.jpg';
      const up = await db.storage.from('catalogue').upload(path, T.tagPhoto.blob, { contentType: 'image/jpeg' });
      if (up.error) upFail = true; else patch.tag_photo_path = path;
    }
    if (Object.keys(patch).length) await db.from('catalogue_items').update(patch).eq('id', id);
    // the cost — only the owner sees it (update 19)
    if (S.dbv19 && isOwner() && (numOrNull(f.dia_cost) != null || numOrNull(f.making_cost) != null)) {
      await db.from('catalogue_costs').upsert({ catalogue_id: id, dia_cost_rate: numOrNull(f.dia_cost), making_cost: numOrNull(f.making_cost), updated_by: S.me.id }, { onConflict: 'catalogue_id' });
    }
    try {
      localStorage.setItem('stockDefaults', JSON.stringify({ metal, purity: S.formState.st_purity, color: S.formState.st_color || '', dia: f.dia_type || 'Natural' }));
    } catch (e) { /* ignore */ }
    T.added = (T.added || 0) + 1;
    toast(upFail ? tag + ' saved — but a photo could not be uploaded.' : tag + ' added ✓', upFail ? 'err' : 'ok');
    if (next) {
      const added = T.added;
      S.st = null;
      startAddStockSame(added);
    } else {
      S.st = null;
      backOne();
    }
  };
  if (!T.piece) {
    confirmModal('No photo of the piece', 'Save it without a photo? You can add one later from the piece\'s page.', 'Save without photo', go);
    return;
  }
  go();
}
/* the next tag on the same screen (the choices stay) */
function startAddStockSame(added) {
  const d = stockDefaults();
  S.st = { tagPhoto: null, piece: null, f: blankStock(), msg: '', msgKind: '', reading: false, added };
  S.formState.st_metal = d.metal; S.formState.st_purity = d.purity; S.formState.st_color = d.color || null;
  renderAddStock();
  try { window.scrollTo(0, 0); } catch (e) { /* ignore */ }
}

/* the choice buttons: metal → purity / colour */
window.SEG_HOOKS.push((group) => {
  if (group !== 'st_metal' || !$('#st-form')) return;
  const metal = S.formState.st_metal || 'Gold';
  if (!S.formState.st_metal) S.formState.st_metal = 'Gold';
  if (purityOptions(metal).indexOf(S.formState.st_purity) === -1) S.formState.st_purity = defaultPurity(metal);
  const w = $('#st-purity-wrap');
  if (w) w.innerHTML = segHTML('st_purity', purityOptions(metal), S.formState.st_purity);
  if (S.formState.st_color && colorOptions(metal).indexOf(S.formState.st_color) === -1) S.formState.st_color = null;
  const cw = $('#st-color-wrap');
  if (cw) cw.innerHTML = segHTML('st_color', colorOptions(metal), S.formState.st_color);
  const cl = $('#st-color-label');
  if (cl) cl.textContent = colorFieldLabel(metal);
});

/* ---------------- find pieces by a code ---------------- */
/* a scanned code → the pieces it is: the app's own sticker, a tag no., or a design no. (pieces of one design) */
async function findStockByCode(raw) {
  const s = String(raw || '').trim();
  const app = /#c=([0-9a-f-]{36})/i.exec(s);
  if (app) {
    const { data } = await db.from('catalogue_items').select('*').eq('id', app[1]).limit(1);
    return data || [];
  }
  const p = parseTagText(s);
  const codes = [p.tag_no, p.design_no, p.code, tagCode(s)].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i);
  for (const c of codes) {
    const { data } = await db.from('catalogue_items').select('*').ilike('tag_no', likeExact(c)).limit(5);
    if (data && data.length) return data;
  }
  for (const c of codes) {
    const { data } = await db.from('catalogue_items').select('*').ilike('design_no', likeExact(c)).order('created_at', { ascending: false }).limit(60);
    if (data && data.length) return data;
  }
  return [];
}
function stockLine(c) {
  return [c.category, num(c.net_wt) ? 'Net ' + grams(c.net_wt) : '', num(c.diamond_ct) ? carats(c.diamond_ct) + (c.diamond_pcs ? '/' + c.diamond_pcs : '') : '',
    num(c.cs_ct) ? 'CS ' + carats(c.cs_ct) : ''].filter(Boolean).join(' · ');
}
/* pick one (or more) of several pieces → cb(list) */
function choosePieces(title, list, multi, cb) {
  const sel = new Set();
  const ov = openModal('<h3>' + esc(title) + '</h3><p>' + esc(multi ? 'Tap the pieces, then Add.' : 'Tap the piece.') + '</p>' +
    '<div class="st-choose">' + list.map((c) =>
      '<button type="button" class="st-ch' + (c.status !== 'available' ? ' off' : '') + '" data-id="' + c.id + '">' +
      ((c.photo_paths || [])[0] ? '<img data-catimg="' + esc(c.photo_paths[0]) + '" alt="">' : '<span class="cat-noimg">💍</span>') +
      '<span><b>' + esc(c.tag_no || c.design_no || 'Piece') + '</b><span>' + esc(stockLine(c)) + '</span>' +
      (c.status !== 'available' ? '<span class="st-ch-st">' + esc(CAT_STATUS_LABEL[c.status] || c.status) + '</span>' : '') + '</span>' +
      (multi ? '<span class="st-ck"></span>' : '') + '</button>').join('') + '</div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Close</button>' + (multi ? '<button class="btn btn-primary" data-m="ok">Add</button>' : '') + '</div>');
  fillCatImages(ov);
  ov.querySelectorAll('.st-ch').forEach((b) => {
    b.onclick = () => {
      const c = list.find((x) => x.id === b.dataset.id);
      if (!multi) { closeModal(); cb([c]); return; }
      if (sel.has(c.id)) sel.delete(c.id); else sel.add(c.id);
      b.classList.toggle('on', sel.has(c.id));
      b.querySelector('.st-ck').textContent = sel.has(c.id) ? '✓' : '';
    };
  });
  ov.querySelector('[data-m=no]').onclick = closeModal;
  if (multi) ov.querySelector('[data-m=ok]').onclick = () => { closeModal(); cb(list.filter((c) => sel.has(c.id))); };
}

/* ---------------- the camera: scan codes one after another ----------------
   opt: { title, sub, onCode(text) → Promise<string> (a line to show), photoBtn: label, onPhoto() } */
function codeScanOn() { return typeof qrScanOn === 'function' && qrScanOn(); }
async function openCodeScanner(opt) {
  if (!codeScanOn()) { if (opt.onPhoto) opt.onPhoto(); return; }
  let det;
  try { det = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { if (opt.onPhoto) opt.onPhoto(); return; }
  const ov = openModal('<h3>' + esc(opt.title || 'Scan the tag') + '</h3><p>' + esc(opt.sub || 'Point the camera at the QR code on the tag.') + '</p>' +
    '<div class="qr-cam"><video id="sc-video" playsinline muted></video></div>' +
    '<div class="sc-log" id="sc-log"></div>' +
    '<div class="modal-actions">' + (opt.onPhoto ? '<button class="btn btn-secondary" data-m="photo">📷 ' + esc(opt.photoBtn || 'Read the printed side') + '</button>' : '') +
    '<button class="btn btn-primary" data-m="no">Done</button></div>');
  let stream = null, done = false, timer = null, busy = false;
  const seen = new Map();
  const stop = () => {
    done = true;
    if (timer) clearTimeout(timer);
    if (stream) stream.getTracks().forEach((t) => { try { t.stop(); } catch (e) { /* ignore */ } });
  };
  ov._cleanup = stop;
  ov.querySelector('[data-m=no]').onclick = () => { stop(); closeModal(); if (opt.onDone) opt.onDone(); };
  const pb = ov.querySelector('[data-m=photo]');
  if (pb) pb.onclick = () => { stop(); closeModal(); opt.onPhoto(); };
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  } catch (e) {
    stop(); closeModal();
    toast('The camera could not be opened — allow the camera for this app.', 'err');
    if (opt.onPhoto) opt.onPhoto();
    return;
  }
  const v = $('#sc-video');
  if (!v || done) { stop(); return; }
  v.srcObject = stream;
  try { await v.play(); } catch (e) { /* some phones start on their own */ }
  const log = (line, kind) => {
    const el = $('#sc-log');
    if (!el) return;
    const d = document.createElement('div');
    d.className = 'sc-line ' + (kind || '');
    d.textContent = line;
    el.prepend(d);
  };
  const look = async () => {
    if (done) return;
    if (!busy) {
      try {
        const found = await det.detect(v);
        const text = (found || []).map((f) => String(f.rawValue || '')).find(Boolean);
        const now = Date.now();
        if (text && (!seen.has(text) || now - seen.get(text) > 4000)) {
          seen.set(text, now);
          busy = true;
          try {
            const r = await opt.onCode(text, { stop: () => { stop(); closeModal(); } });
            if (r) log(r.text || r, r.kind);
            if (r && r.close) { stop(); closeModal(); }
            else if (navigator.vibrate) navigator.vibrate(60);
          } finally { busy = false; }
        }
      } catch (e) { /* the next frame */ }
    }
    if (!done) timer = setTimeout(look, 300);
  };
  look();
}

/* a photo of the printed side → the code on it (tag no., else design no.) — or null */
function readCodeFromPhoto(cb) {
  pickImage(async (file) => {
    let photo;
    try { photo = await downscale(file, 1600); } catch (e) { toast(imageErrMsg(e), 'err'); return; }
    const ov = document.createElement('div');
    ov.className = 'scan-overlay';
    ov.innerHTML = '<div class="spinner"></div><div>Reading the tag…</div>';
    document.body.appendChild(ov);
    let qr = null;
    try { qr = await qrFromImage(await decodeImage(photo.blob, 1600)); } catch (e) { /* none */ }
    const res = S.geminiConfigured ? await readTagAI(photo) : { error: 'not_configured' };
    ov.remove();
    const t = res && res.ok ? res.tag : null;
    const code = (t && (t.tag_no || t.design_no)) || (qr ? (parseTagText(qr).code || qr) : null);
    if (!code) { toast(tagReadError(res), 'err'); return; }
    cb(code, t);
  }, false);
}

/* ---------------- the Stock tab: find a piece ---------------- */
async function stockFind() {
  const show = async (code) => {
    const list = await findStockByCode(code);
    if (!list.length) {
      const c = tagCode(parseTagText(code).code || code);
      confirmModal(c + ' is not in the stock', 'Add it now?', 'Add stock', () => startAddStock(/^\d{2}[A-Z]/.test(c) ? { tag_no: c, category: tagCategory(c) } : { design_no: c, category: tagCategory(c) }));
      return;
    }
    if (list.length === 1) { openCatItem(list[0].id); return; }
    choosePieces(list.length + ' pieces of ' + (list[0].design_no || 'this design'), list, false, (l) => { if (l[0]) openCatItem(l[0].id); });
  };
  if (codeScanOn()) {
    openCodeScanner({
      title: 'Find a piece', sub: 'Point the camera at the QR code on the tag.',
      onCode: async (text, ctl) => { ctl.stop(); await show(text); return null; },
      onPhoto: () => readCodeFromPhoto((code) => show(code)),
    });
  } else readCodeFromPhoto((code) => show(code));
}

/* ---------------- stock totals (Stock tab) ---------------- */
async function loadStockTotals() {
  const box = $('#st-totals');
  if (!box || !tagsOn()) return;
  const { data, error } = await db.from('catalogue_items').select('status, gross_wt, net_wt, diamond_ct, cs_ct').in('status', ['available', 'approval']).limit(5000);
  if (!$('#st-totals') || error) return;
  const a = (data || []).filter((x) => x.status === 'available'), ap = (data || []).filter((x) => x.status === 'approval');
  const sum = (l, k) => l.reduce((s, x) => s + num(x[k]), 0);
  box.innerHTML = a.length || ap.length ? '<div class="st-tot"><div><b>' + a.length + '</b><span>In stock</span></div>' +
    '<div><b>' + grams(sum(a, 'net_wt')) + '</b><span>Net gold</span></div>' +
    '<div><b>' + carats(sum(a, 'diamond_ct')) + '</b><span>Diamonds</span></div>' +
    (ap.length ? '<div><b>' + ap.length + '</b><span>On approval</span></div>' : '') + '</div>' : '';
}

onAct('st-new', () => startAddStock());
onAct('st-tag', (el) => stockTagPhoto(el.dataset.gal === '1'));
onAct('st-piece', (el) => stockPiecePhoto(el.dataset.gal === '1'));
onAct('st-save', (el) => saveStock(el.dataset.next === '1'));
onAct('st-find', () => stockFind());
