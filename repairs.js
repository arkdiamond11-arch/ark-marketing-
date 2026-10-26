/* ============================================================
   REPAIR JOBS  (database update 08)
   A shop sends a piece back for resizing, polishing or repair:
   Received → At work → Ready → Returned, each step with its date
   and time, before / after photos, the vendor or karigar doing it,
   Ready and late ones show on Today.
   Also the client picker shared with "Pieces on approval".
   Loaded before app.js; uses its helpers only at call time.
   ============================================================ */
'use strict';

const REPAIR_STEPS = ['received', 'at_work', 'ready', 'returned'];
const REPAIR_LABEL = { received: 'Received', at_work: 'At work', ready: 'Ready', returned: 'Returned', cancelled: 'Cancelled' };
const REPAIR_WORK = ['Resize', 'Polish', 'Repair', 'Stone setting', 'Rhodium', 'Cleaning', 'Other'];
function repairsOn() { return !!S.dbv8 && appOn('repairs'); }
function repNo(n) { return 'REP-' + String(n || 0).padStart(4, '0'); }
function repairOpen(r) { return ['received', 'at_work', 'ready'].indexOf(r.status) > -1; }
function repairLate(r) { return repairOpen(r) && r.status !== 'ready' && !!r.due_date && r.due_date < todayStr(); }
function repairNext(r) { const i = REPAIR_STEPS.indexOf(r.status); return i > -1 && i < REPAIR_STEPS.length - 1 ? REPAIR_STEPS[i + 1] : null; }
function chipRepair(s) { return '<span class="chip chip-rp-' + esc(s) + '">' + esc(REPAIR_LABEL[s] || s) + '</span>'; }

/* ---------------- choose a client (repairs, pieces on approval) ---------------- */
function pickClientThen(title, onPick) {
  S.clientPick = onPick;
  showSub(title, () => {
    $('#content').innerHTML = '<div class="search-box"><input type="text" id="cp-q" placeholder="Search the shop, person or city…" autocomplete="off"></div><div id="cp-list">' + loadingHTML() + '</div>';
    const inp = $('#cp-q');
    inp.addEventListener('input', () => { clearTimeout(S.cpTimer); S.cpTimer = setTimeout(() => drawClientPick(inp.value), 250); });
    drawClientPick('');
    setTimeout(() => { try { inp.focus(); } catch (e) { /* ignore */ } }, 200);
  });
}
async function drawClientPick(qRaw) {
  const q = String(qRaw || '').trim().replace(/[,%()]/g, ' ').trim();
  const seq = S.cpSeq = (S.cpSeq || 0) + 1;
  let qq = db.from('clients').select('id, trade_name, contact_person, city, mobile');
  if (q) { const p = '%' + q + '%'; qq = qq.or('trade_name.ilike.' + p + ',contact_person.ilike.' + p + ',city.ilike.' + p + ',mobile.ilike.' + p); }
  const { data, error } = await qq.order('trade_name', { ascending: true }).limit(60);
  const box = $('#cp-list');
  if (!box || seq !== S.cpSeq) return;
  if (error) { box.innerHTML = '<div class="empty">Could not load clients — try again.</div>'; return; }
  S.cpRows = data || [];
  box.innerHTML = S.cpRows.length ? S.cpRows.map((c, i) => '<div class="list-item" data-action="cp-pick" data-i="' + i + '"><div class="li-main"><div class="li-title">' + esc(c.trade_name) + '</div>' +
    '<div class="li-sub">' + esc([c.contact_person, c.city].filter(Boolean).join(' · ')) + '</div></div><div class="li-go">›</div></div>').join('')
    : '<div class="empty">No client matches — add them first in Clients.</div>';
}
onAct('cp-pick', (el) => { const c = (S.cpRows || [])[+el.dataset.i]; if (c && S.clientPick) S.clientPick(c); });

/* ---------------- the list ---------------- */
function renderRepairs() {
  const c = $('#content');
  if (!S.dbv8) { c.innerHTML = '<div class="notice">Repair jobs need the database update (ark-update-08.sql).</div>'; return; }
  S.rpl = S.rpl || { show: 'open', q: '' };
  const L = S.rpl;
  const chip = (v, label) => '<button class="' + (L.show === v ? 'on' : '') + '" data-action="rp-show" data-v="' + v + '">' + label + '</button>';
  c.innerHTML = '<button class="btn btn-primary" data-action="rp-new" style="margin-bottom:12px">＋ New repair</button>' +
    '<div class="search-box"><input type="text" id="rp-q" placeholder="Search the shop or REP no.…" autocomplete="off" value="' + esc(L.q) + '"></div>' +
    '<div class="filter-chips">' + chip('open', 'In work') + chip('ready', 'Ready') + chip('returned', 'Returned') + chip('all', 'All') + '</div>' +
    '<div id="rp-list">' + loadingHTML() + '</div>';
  const inp = $('#rp-q');
  inp.addEventListener('input', () => { clearTimeout(S.rpTimer); S.rpTimer = setTimeout(() => { L.q = inp.value; loadRepairList(); }, 280); });
  loadRepairList();
}
async function loadRepairList() {
  const box = $('#rp-list');
  if (!box) return;
  const L = S.rpl;
  let q = db.from('repairs').select('*, clients!inner(trade_name, city, mobile)');
  if (L.show === 'open') q = q.in('status', ['received', 'at_work']);
  else if (L.show !== 'all') q = q.eq('status', L.show);
  const s = String(L.q || '').trim(), m = s.match(/^(rep-?)?0*(\d+)$/i);
  if (m) q = q.eq('repair_no', parseInt(m[2], 10));
  else if (s) q = q.ilike('clients.trade_name', '%' + s.replace(/[%,()]/g, ' ') + '%');
  const { data, error } = await q.order(L.show === 'returned' || L.show === 'all' ? 'received_on' : 'due_date', { ascending: !(L.show === 'returned' || L.show === 'all'), nullsFirst: false })
    .order('repair_no', { ascending: false }).limit(300);
  if (!$('#rp-list')) return;
  if (error) { box.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  const rows = data || [];
  box.innerHTML = rows.length ? rows.map((r) => repairItemHTML(r, true)).join('') : '<div class="empty"><div class="big">🔧</div>' + (s ? 'Nothing matches "' + esc(s) + '".' : 'No repair jobs here.') + '</div>';
}

function repairItemHTML(r, showClient) {
  S.rpRows = S.rpRows || new Map();
  S.rpRows.set(r.id, r);
  const cl = r.clients || {};
  const n = repairNext(r), late = repairLate(r);
  return '<div class="list-item rp-li" data-action="rp-open" data-id="' + r.id + '"><div class="li-main">' +
    '<div class="li-title">' + repNo(r.repair_no) + (showClient ? ' · ' + esc(cl.trade_name || '') : '') + '</div>' +
    '<div class="li-sub">' + esc([r.piece, (r.work || []).join(', ')].filter(Boolean).join(' · ')) + '</div>' +
    '<div class="li-chips">' + chipRepair(r.status) +
    (r.due_date && repairOpen(r) && r.status !== 'ready' ? '<span class="chip' + (late ? ' chip-late' : '') + '">' + esc(late ? dueLabel(r.due_date) : 'Ready by ' + dueLabel(r.due_date)) + '</span>' : '') + '</div>' +
    (n ? '<div class="o-acts"><button type="button" class="o-next' + (n === 'returned' ? ' o-next-done' : '') + '" data-action="rp-next" data-id="' + r.id + '" data-s="' + n + '">' +
      (n === 'returned' ? '✓ ' : '→ ') + esc(REPAIR_LABEL[n]) + '</button></div>' : '') +
    '</div><div class="li-go">›</div></div>';
}

/* ---------------- new / edit ---------------- */
function newRepairForm(client) { return { id: null, client, piece: '', work: [], details: '', weight: '', due: todayStr(7), vendor_id: '', photos: [] }; }
function startRepair(client) {
  S.repForm = newRepairForm(client);
  showSub('New repair', renderRepairForm, true);
}
async function editRepair(id) {
  const { data: r } = await db.from('repairs').select('*, clients(id, trade_name, city, mobile)').eq('id', id).maybeSingle();
  if (!r) { toast('Could not open — try again.', 'err'); return; }
  S.repForm = { id: r.id, client: r.clients || { id: r.client_id }, piece: r.piece || '', work: (r.work || []).slice(), details: r.details || '',
    weight: r.weight_g != null ? String(r.weight_g) : '', due: r.due_date || '', vendor_id: r.vendor_id || '', photos: [] };
  showSub(repNo(r.repair_no) + ' · Edit', renderRepairForm);
}
function renderRepairForm() {
  const F = S.repForm;
  if (!F) return;
  const vend = typeof renderVendors === 'function' && appOn('vendors') && Array.isArray(S.vendors);
  $('#content').innerHTML =
    '<div class="card" style="padding:13px 15px"><b>' + esc(F.client.trade_name || '') + '</b>' + (F.client.city ? ' <span style="color:var(--muted);font-size:13px">· ' + esc(F.client.city) + '</span>' : '') + '</div>' +
    '<div class="card">' +
    '<div class="field"><label>The piece</label><input type="text" id="rf-piece" autocomplete="off" list="rf-cats" placeholder="e.g. Ring, 22K" value="' + esc(F.piece) + '">' +
    '<datalist id="rf-cats">' + ITEM_CATS.map((x) => '<option value="' + esc(x) + '">').join('') + '</datalist></div>' +
    '<div class="field"><label>Work to do</label><div class="filter-chips rf-work">' + REPAIR_WORK.map((w) => '<button type="button" class="' + (F.work.indexOf(w) > -1 ? 'on' : '') + '" data-action="rf-work" data-v="' + esc(w) + '">' + esc(w) + '</button>').join('') + '</div></div>' +
    '<div class="field"><label>Details</label><textarea id="rf-details" style="min-height:70px" placeholder="e.g. Size 14 to 16, one stone loose">' + esc(F.details) + '</textarea></div>' +
    '<div class="o-2col"><div class="field"><label>Weight in (g)</label><input type="text" inputmode="decimal" id="rf-wt" value="' + esc(F.weight) + '"></div>' +
    '<div class="field"><label>Ready by</label><input type="date" id="rf-due" value="' + esc(F.due) + '"></div></div>' +
    (vend ? '<div class="field"><label>Who does the work</label><select id="rf-vendor"><option value="">— Not decided —</option>' +
      S.vendors.filter((v) => v.active !== false || v.id === F.vendor_id).map((v) => '<option value="' + v.id + '"' + (v.id === F.vendor_id ? ' selected' : '') + '>' + esc(v.name) + '</option>').join('') + '</select></div>' : '') +
    '</div>' +
    (!F.id ? '<div class="section-label">Photos before the work</div><div class="card"><div class="cf-photos">' +
      F.photos.map((p, i) => '<div class="cf-ph"><img src="' + URL.createObjectURL(p.blob) + '" alt=""><button type="button" class="cf-x" data-action="rf-ph-del" data-i="' + i + '" aria-label="Remove photo">✕</button></div>').join('') +
      (F.photos.length < 6 ? '<button type="button" class="cf-add" data-action="rf-ph-add">＋<span>Photo</span></button>' : '') + '</div></div>' : '') +
    '<button class="btn btn-primary" data-action="rf-save" id="rf-save">' + (F.id ? 'Save' : 'Save repair job') + '</button><div style="height:10px"></div>';
}
function keepRepairForm() {
  const F = S.repForm;
  if (!F || !$('#rf-piece')) return;
  F.piece = $('#rf-piece').value; F.details = $('#rf-details').value; F.weight = $('#rf-wt').value; F.due = $('#rf-due').value;
  if ($('#rf-vendor')) F.vendor_id = $('#rf-vendor').value;
}
async function saveRepair() {
  keepRepairForm();
  const F = S.repForm;
  if (!F.piece.trim()) { toast('Write what the piece is.', 'err'); return; }
  if (!F.work.length) { toast('Choose the work to do.', 'err'); return; }
  const row = { client_id: F.client.id, piece: F.piece.trim(), work: F.work, details: F.details.trim() || null, weight_g: numOrNull(F.weight),
    due_date: F.due || null, vendor_id: F.vendor_id || null };
  const btn = $('#rf-save');
  if (btn) btn.disabled = true;
  if (F.id) {
    const { error } = await db.from('repairs').update(row).eq('id', F.id);
    if (error) { if (btn) btn.disabled = false; toast('Could not save — try again.', 'err'); return; }
    await db.from('repair_updates').insert({ repair_id: F.id, note: 'Details edited', created_by: S.me.id });
    toast('Saved ✓', 'ok');
    const id = F.id;
    S.repForm = null;
    S.suppressPop = true; try { history.back(); } catch (_) { /* ignore */ }
    S.sub.pop();
    openRepair(id, true);
    return;
  }
  const { data: r, error } = await db.from('repairs').insert(Object.assign(row, { created_by: S.me.id })).select('id, repair_no').single();
  if (error || !r) { if (btn) btn.disabled = false; toast('Could not save — try again.', 'err'); return; }
  await db.from('repair_updates').insert({ repair_id: r.id, status: 'received', note: 'Received from the shop', created_by: S.me.id });
  let fails = 0;
  for (let i = 0; i < F.photos.length; i++) {
    const path = 'repair-' + r.id + '/before-' + Date.now() + '-' + i + '.jpg';
    const up = await db.storage.from('orders').upload(path, F.photos[i].blob, { contentType: 'image/jpeg' });
    if (up.error) { fails++; continue; }
    const { error: e2 } = await db.rpc('repair_photo', { p_repair: r.id, p_after: false, p_add: path, p_remove: null });
    if (e2) fails++;
  }
  toast(fails ? 'Saved — but ' + fails + ' photo(s) could not be uploaded.' : 'Repair ' + repNo(r.repair_no) + ' saved ✓', fails ? 'err' : 'ok');
  S.repForm = null;
  openRepair(r.id, true);
}
function repairAddPhoto(after, repairId) {
  const ov = openModal('<h3>' + (after ? 'Photo after the work' : 'Photo before the work') + '</h3>' +
    '<div style="display:flex;flex-direction:column;gap:10px"><button class="btn btn-primary" data-m="cam">📷 Take photo</button>' +
    '<button class="btn btn-secondary" data-m="gal">🖼️ Choose from gallery</button></div>');
  const go = (gal) => {
    closeModal();
    pickImage(async (file) => {
      const p = await photoFromFile(file, after ? 'After the work' : 'Before the work');
      if (!p) return;
      if (!repairId) { keepRepairForm(); S.repForm.photos.push(p); renderRepairForm(); return; }
      const busy = busyOverlay('Saving the photo…');
      const path = 'repair-' + repairId + '/' + (after ? 'after' : 'before') + '-' + Date.now() + '.jpg';
      const up = await db.storage.from('orders').upload(path, p.blob, { contentType: 'image/jpeg' });
      let ok = !up.error;
      if (ok) { const { error } = await db.rpc('repair_photo', { p_repair: repairId, p_after: !!after, p_add: path, p_remove: null }); ok = !error; }
      busy.remove();
      if (!ok) { toast('Could not save the photo — try again.', 'err'); return; }
      toast('Photo saved ✓', 'ok');
      openRepair(repairId, true);
    }, gal);
  };
  ov.querySelector('[data-m=cam]').onclick = () => go(false);
  ov.querySelector('[data-m=gal]').onclick = () => go(true);
}

/* ---------------- one repair ---------------- */
async function openRepair(id, replace) {
  const { data: r, error } = await db.from('repairs').select('*, clients(id, trade_name, city, mobile, contact_person)').eq('id', id).maybeSingle();
  if (error || !r) { toast('Could not open — try again.', 'err'); return; }
  let first = r;
  showSub(repNo(r.repair_no), () => {
    const use = (x) => { if (x) { renderRepairPage(x); loadRepairDetails(x); } };
    if (first) { const x = first; first = null; use(x); }
    else db.from('repairs').select('*, clients(id, trade_name, city, mobile, contact_person)').eq('id', id).maybeSingle().then((res) => use(res.data));
  }, replace);
}
function renderRepairPage(r) {
  const cl = r.clients || {};
  S.rpPage = r;
  const done = r.status === 'returned' || r.status === 'cancelled';
  $('#content').innerHTML =
    '<div class="client-head"><h2>' + repNo(r.repair_no) + '</h2>' +
    '<div class="co"><span class="o-headlink" data-action="open-client" data-id="' + r.client_id + '">' + esc(cl.trade_name || 'Client') + ' ›</span>' + (cl.city ? ' · ' + esc(cl.city) : '') + '</div>' +
    '<div class="chips">' + chipRepair(r.status) + (r.due_date && repairOpen(r) && r.status !== 'ready' ? '<span class="chip' + (repairLate(r) ? ' chip-late' : '') + '">' + esc((repairLate(r) ? '⚠ ' : '') + 'Ready by ' + fmtD(r.due_date)) + '</span>' : '') + '</div></div>' +
    (r.status !== 'cancelled' ? '<div class="section-label">Status</div><div class="card os-card" id="rp-steps">' + loadingHTML() + '</div>' : '<div class="notice">This repair job was cancelled.</div>') +
    '<div class="action-row">' +
    '<button class="btn btn-secondary" data-action="rp-edit" data-id="' + r.id + '">Edit</button>' +
    '<button class="btn btn-secondary" data-action="rp-wa" data-id="' + r.id + '">WhatsApp</button>' +
    '</div>' +
    '<div class="card">' +
    '<div class="detail-row"><div class="dk">Piece</div><div class="dv">' + esc(r.piece) + '</div></div>' +
    '<div class="detail-row"><div class="dk">Work</div><div class="dv">' + esc((r.work || []).join(', ')) + '</div></div>' +
    (r.details ? '<div class="detail-row"><div class="dk">Details</div><div class="dv" style="white-space:pre-wrap">' + esc(r.details) + '</div></div>' : '') +
    (r.weight_g != null ? '<div class="detail-row"><div class="dk">Weight in</div><div class="dv">' + esc(grams(r.weight_g)) + '</div></div>' : '') +
    '<div class="detail-row"><div class="dk">Received</div><div class="dv">' + esc(fmtDLong(r.received_on)) + '</div></div>' +
    (r.returned_on ? '<div class="detail-row"><div class="dk">Returned</div><div class="dv">' + esc(fmtDLong(r.returned_on)) + '</div></div>' : '') +
    (r.vendor_id && typeof vendorName === 'function' && vendorName(r.vendor_id) ? '<div class="detail-row"><div class="dk">Work by</div><div class="dv">' + esc(vendorName(r.vendor_id)) + '</div></div>' : '') +
    '</div>' +
    '<div class="section-label">Photos</div><div class="card rp-photos">' +
    '<div class="rp-ph-l">Before</div><div class="fin-more" id="rp-before"></div>' +
    '<button class="btn btn-small btn-secondary" data-action="rp-ph" data-id="' + r.id + '" data-after="0">📷 Before</button>' +
    '<div class="rp-ph-l">After</div><div class="fin-more" id="rp-after"></div>' +
    '<button class="btn btn-small btn-secondary" data-action="rp-ph" data-id="' + r.id + '" data-after="1">📷 After</button></div>' +
    '<div id="rp-history"></div>' +
    '<div style="display:flex;gap:10px;justify-content:center;margin:18px 0 6px">' +
    (!done ? '<button class="btn btn-small btn-ghost" data-action="rp-status" data-id="' + r.id + '" data-s="cancelled">Cancel job</button>' : '') +
    (r.status === 'cancelled' ? '<button class="btn btn-small btn-secondary" data-action="rp-status" data-id="' + r.id + '" data-s="received">Reopen</button>' : '') +
    '<button class="btn btn-small btn-danger-ghost" data-action="rp-del" data-id="' + r.id + '">Delete</button></div>';
  const pics = (list, after) => list.map((p, i) => '<div class="fin-ph sm"><img data-rph="' + esc(p) + '" data-action="rp-view" data-after="' + (after ? 1 : 0) + '" data-i="' + i + '" alt="">' +
    '<button type="button" class="fin-x" data-action="rp-ph-del" data-id="' + r.id + '" data-after="' + (after ? 1 : 0) + '" data-p="' + esc(p) + '" aria-label="Remove photo">✕</button></div>').join('');
  $('#rp-before').innerHTML = pics(r.before_paths || [], false) || '<span class="hint">No photo yet</span>';
  $('#rp-after').innerHTML = pics(r.after_paths || [], true) || '<span class="hint">No photo yet</span>';
  signedUrls('orders', (r.before_paths || []).concat(r.after_paths || [])).then((m) => {
    document.querySelectorAll('img[data-rph]').forEach((im) => { const u = m.get(im.dataset.rph); if (u) im.src = u; });
  });
}
async function loadRepairDetails(r) {
  const { data } = await db.from('repair_updates').select('*').eq('repair_id', r.id).order('created_at', { ascending: false }).limit(100);
  const ups = data || [];
  const sv = $('#rp-steps');
  if (sv) {
    const tick = {};
    ups.slice().reverse().forEach((u) => { if (u.status) tick[u.status] = u; });
    const cur = REPAIR_STEPS.indexOf(r.status);
    sv.innerHTML = REPAIR_STEPS.map((k, i) => {
      const state = i < cur ? (tick[k] ? 'done' : 'skip') : i === cur ? 'cur' : 'pending';
      const sub = state === 'pending' ? '' : tick[k] ? tickStamp(tick[k]) : (k === 'received' ? fmtD(r.received_on) : 'Not ticked');
      const tap = i !== cur && i > 0;
      return '<div class="os-row ' + state + (tap ? ' tap' : '') + '"' + (tap ? ' data-action="rp-status" data-id="' + r.id + '" data-s="' + k + '"' : '') + '>' +
        '<span class="os-dot">' + (state === 'pending' ? '' : state === 'skip' ? '–' : '✓') + '</span>' +
        '<span class="os-name">' + esc(REPAIR_LABEL[k]) + (sub ? '<span class="os-when">' + esc(sub) + '</span>' : '') + '</span>' +
        '<span class="os-date">' + (state === 'pending' && tap ? 'Tap to set' : '') + '</span></div>';
    }).join('');
  }
  const hv = $('#rp-history');
  if (hv) hv.innerHTML = ups.length ? '<div class="section-label">History</div>' + ups.map((u) =>
    '<div class="timeline-item"><div class="t-meta"><span>' + esc(nameOf(u.created_by)) + '</span><span>' + fmtDT(u.created_at) + '</span></div>' +
    (u.status ? '<div style="margin:2px 0 4px">' + chipRepair(u.status) + '</div>' : '') + (u.note ? '<div class="t-notes">' + esc(u.note) + '</div>' : '') + '</div>').join('') : '';
}

/* move a repair to a step (only if nobody changed it meanwhile) → the history row id, or false */
async function repairApply(r, s) {
  const patch = { status: s, returned_on: s === 'returned' ? todayStr() : null };
  const { data, error } = await db.from('repairs').update(patch).eq('id', r.id).eq('status', r.status).select('id');
  if (error) { toast('Could not update — try again.', 'err'); return false; }
  if (!data || !data.length) { toast(repNo(r.repair_no) + ' was just changed on another phone — check it again.', 'err'); return false; }
  const { data: up } = await db.from('repair_updates').insert({ repair_id: r.id, status: s, created_by: S.me.id }).select('id').single();
  return (up && up.id) || null;
}
async function repairSetStatus(id, s, btn) {
  if (S.rpMoving) return;
  S.rpMoving = true;
  if (btn) btn.disabled = true;
  try {
    const { data: r } = await db.from('repairs').select('*, clients(trade_name)').eq('id', id).maybeSingle();
    if (!r) return;
    const go = async () => {
      const prev = { status: r.status, returned_on: r.returned_on || null };
      const upId = await repairApply(r, s);
      if (upId === false) { if (btn) btn.disabled = false; return; }
      const undo = async () => {
        hideUndo();
        const { data: d2 } = await db.from('repairs').update(prev).eq('id', r.id).eq('status', s).select('id');
        if (!d2 || !d2.length) { toast('Could not undo — it was changed meanwhile.', 'err'); return; }
        if (upId) await db.from('repair_updates').delete().eq('id', upId);
        toast('Undone', 'ok');
        repairRedraw(r.id);
      };
      showUndo(repNo(r.repair_no) + ' → ' + REPAIR_LABEL[s], undo);
      repairRedraw(r.id);
      if (s === 'ready' && !(r.after_paths || []).length) setTimeout(() => offerAfterPhoto(r), 300);
    };
    if (s === 'cancelled') confirmModal('Cancel this repair job?', 'It stays on record as Cancelled. You can reopen it later.', 'Cancel job', go, true);
    else if (REPAIR_STEPS.indexOf(s) > -1 && REPAIR_STEPS.indexOf(s) < REPAIR_STEPS.indexOf(r.status)) confirmModal('Move back to ' + REPAIR_LABEL[s] + '?', 'It is at ' + REPAIR_LABEL[r.status] + ' now.', 'Move back', go);
    else await go();
  } finally { S.rpMoving = false; }
}
function offerAfterPhoto(r) {
  const ov = openModal('<h3>' + esc(repNo(r.repair_no)) + ' — Ready ✓</h3><p>Take a photo after the work — then you can send it to the shop.</p>' +
    '<div class="fin-ask"><button class="btn btn-primary" data-m="cam">📷 Take photo</button><button class="btn btn-ghost" data-m="later">Later</button></div>');
  ov.querySelector('[data-m=cam]').onclick = () => {
    closeModal();
    pickImage(async (file) => {
      const p = await photoFromFile(file, 'After the work');
      if (!p) return;
      const path = 'repair-' + r.id + '/after-' + Date.now() + '.jpg';
      const up = await db.storage.from('orders').upload(path, p.blob, { contentType: 'image/jpeg' });
      let ok = !up.error;
      if (ok) { const { error } = await db.rpc('repair_photo', { p_repair: r.id, p_after: true, p_add: path, p_remove: null }); ok = !error; }
      toast(ok ? 'Photo saved ✓' : 'Could not save the photo — try again.', ok ? 'ok' : 'err');
      repairRedraw(r.id);
    }, false);
  };
  ov.querySelector('[data-m=later]').onclick = closeModal;
}
/* draw the repair again wherever it shows */
function repairRedraw(id) {
  const top = S.sub[S.sub.length - 1];
  if (top && /^REP-\d+$/.test(top.title)) { openRepair(id, true); return; }
  if ($('#rp-list')) { loadRepairList(); return; }
  if ($('#today-repairs')) { loadTodayRepairs(); return; }
  if ($('#client-repairs') && S.currentClientId) loadClientRepairs({ id: S.currentClientId });
}

async function repairRemovePhoto(id, after, path) {
  confirmModal('Remove this photo?', '', 'Remove', async () => {
    const { error } = await db.rpc('repair_photo', { p_repair: id, p_after: after, p_add: null, p_remove: path });
    if (error) { toast('Could not remove — try again.', 'err'); return; }
    db.storage.from('orders').remove([path]).then(() => {}, () => {});
    openRepair(id, true);
  }, true);
}
async function repairView(after, i) {
  const r = S.rpPage;
  if (!r) return;
  const list = (after ? r.after_paths : r.before_paths) || [];
  const m = await signedUrls('orders', list);
  photoViewer(repNo(r.repair_no) + ' · ' + (after ? 'After' : 'Before'), list.map((p, k) => ({ u: m.get(p), cap: (after ? 'After ' : 'Before ') + (k + 1) })).filter((x) => x.u), null, null, +i || 0);
}
async function repairWhatsApp(id) {
  const { data: r } = await db.from('repairs').select('*, clients(trade_name, mobile, contact_person)').eq('id', id).maybeSingle();
  if (!r) return;
  const cl = r.clients || {};
  const who = String(cl.contact_person || '').trim().split(/\s+/)[0];
  const head = 'Namaste' + (who ? ' ' + who + ' ji' : '') + ' 🙏\n';
  const what = repNo(r.repair_no) + ' (' + r.piece + ')';
  const text = head + (r.status === 'ready' ? 'Your piece ' + what + ' is ready ✨ You can collect it any time.'
    : r.status === 'returned' ? 'Your piece ' + what + ' was returned on ' + fmtD(r.returned_on || todayStr()) + '. Thank you!'
      : 'We have received your piece ' + what + ' for ' + (r.work || []).join(', ').toLowerCase() + '.' + (r.due_date ? ' It will be ready by ' + fmtD(r.due_date) + '.' : '')) +
    '\n— ' + bizName();
  const after = r.after_paths || [];
  if (after.length && navigator.canShare) {
    const busy = busyOverlay('Getting the photos ready…');
    const files = [];
    try {
      const m = await signedUrls('orders', after);
      for (let i = 0; i < after.length; i++) {
        const u = m.get(after[i]);
        if (!u) continue;
        const b = await (await fetch(u)).blob();
        files.push(new File([b], safeFileName(repNo(r.repair_no) + ' ' + (i + 1)) + '.jpg', { type: b.type || 'image/jpeg' }));
      }
    } catch (e) { /* only the text */ }
    busy.remove();
    if (files.length && navigator.canShare({ files })) {
      const m = openModal('<h3>Send to ' + esc(cl.trade_name || 'the shop') + '</h3><p>The photos after the work, with a short message.</p>' +
        '<div class="fin-ask"><button class="btn btn-primary" data-m="share">Share the photos</button><button class="btn btn-secondary" data-m="wa">Only the message</button>' +
        '<button class="btn btn-ghost" data-m="no">Close</button></div>');
      m.querySelector('[data-m=share]').onclick = async () => { try { await navigator.share({ files, text }); closeModal(); } catch (e) { /* cancelled */ } };
      m.querySelector('[data-m=wa]').onclick = () => { window.open(waUrl(cl.mobile, text), '_blank'); closeModal(); };
      m.querySelector('[data-m=no]').onclick = closeModal;
      return;
    }
  }
  window.open(waUrl(cl.mobile, text), '_blank');
}
function deleteRepair(id) {
  confirmModal('Delete this repair job?', 'It will be removed with its photos and history. This cannot be undone.', 'Delete', async () => {
    const r = S.rpPage;
    const { error } = await db.from('repairs').delete().eq('id', id);
    if (error) { toast('Could not delete — try again.', 'err'); return; }
    const files = r ? (r.before_paths || []).concat(r.after_paths || []) : [];
    if (files.length) db.storage.from('orders').remove(files).then(() => {}, () => {});
    toast('Deleted', 'ok');
    backOne();
  }, true);
}

/* ---------------- Today and the client page ---------------- */
async function loadTodayRepairs() {
  const el = $('#today-repairs');
  if (!el || !repairsOn()) return;
  const { data, error } = await db.from('repairs').select('*, clients(trade_name, city, mobile)').in('status', ['received', 'at_work', 'ready'])
    .order('due_date', { ascending: true, nullsFirst: false }).limit(200);
  if (!$('#today-repairs') || error) return;
  const t = todayStr();
  const ready = (data || []).filter((r) => r.status === 'ready');
  const due = (data || []).filter((r) => r.status !== 'ready' && r.due_date && r.due_date <= todayStr(1));
  el.innerHTML = (ready.length || due.length) ? '<div class="due-group-label rp-label sl-row"><span>🔧 Repairs' + (ready.length ? ' · ' + ready.length + ' ready' : '') +
    (due.length ? ' · ' + due.length + ' due' : '') + '</span><a href="#" data-action="rp-list">All repairs ›</a></div>' +
    due.concat(ready).map((r) => repairItemHTML(r, true)).join('') : '';
}
async function loadClientRepairs(cl) {
  const el = $('#client-repairs');
  if (!el || !repairsOn()) return;
  const { data, error } = await db.from('repairs').select('*').eq('client_id', cl.id).order('received_on', { ascending: false }).limit(50);
  if (!$('#client-repairs') || error) return;
  const rows = data || [];
  el.innerHTML = rows.length ? '<div class="section-label">Repairs (' + rows.length + ')</div>' + rows.map((r) => repairItemHTML(r, false)).join('') : '';
}

onAct('rp-list', () => showSub('Repairs', renderRepairs));
onAct('rp-new', () => pickClientThen('New repair — choose the shop', (c) => startRepair(c)));
onAct('rp-new-for', async (el) => { const c = await fetchClient(el.dataset.id); if (c) { S.repForm = newRepairForm(c); showSub('New repair', renderRepairForm); } });
onAct('rp-show', (el) => { S.rpl.show = el.dataset.v; document.querySelectorAll('[data-action="rp-show"]').forEach((b) => b.classList.toggle('on', b === el)); loadRepairList(); });
onAct('rp-open', (el) => openRepair(el.dataset.id));
onAct('rp-next', (el) => repairSetStatus(el.dataset.id, el.dataset.s, el));
onAct('rp-status', (el) => repairSetStatus(el.dataset.id, el.dataset.s));
onAct('rp-edit', (el) => editRepair(el.dataset.id));
onAct('rp-wa', (el) => repairWhatsApp(el.dataset.id));
onAct('rp-del', (el) => deleteRepair(el.dataset.id));
onAct('rp-ph', (el) => repairAddPhoto(el.dataset.after === '1', el.dataset.id));
onAct('rp-ph-del', (el) => repairRemovePhoto(el.dataset.id, el.dataset.after === '1', el.dataset.p));
onAct('rp-view', (el) => repairView(el.dataset.after === '1', el.dataset.i));
onAct('rf-work', (el) => {
  keepRepairForm();
  const F = S.repForm, w = el.dataset.v, i = F.work.indexOf(w);
  if (i > -1) F.work.splice(i, 1); else F.work.push(w);
  el.classList.toggle('on', i === -1);
});
onAct('rf-ph-add', () => repairAddPhoto(false, null));
onAct('rf-ph-del', (el) => { keepRepairForm(); S.repForm.photos.splice(+el.dataset.i, 1); renderRepairForm(); });
onAct('rf-save', () => saveRepair());
