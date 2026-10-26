/* ============================================================
   PIECES ON APPROVAL  (database update 08)
   Pieces given to a shop to show its customers: a memo (APP-0001)
   with the pieces and the date they come back. Each piece is then
   marked sold or returned. Overdue memos show on Today. The memo
   can be printed (PDF) for the shop to sign.
   Loaded before app.js; uses its helpers only at call time.
   ============================================================ */
'use strict';

const APPR_LABEL = { out: 'With the shop', sold: 'Sold', returned: 'Returned' };
function approvalsOn() { return !!S.dbv8 && appOn('approvals'); }
function appNo(n) { return 'APP-' + String(n || 0).padStart(4, '0'); }
function memoOut(m) { return (m.approval_items || []).filter((i) => i.status === 'out'); }
function memoLate(m) { return memoOut(m).length > 0 && !!m.return_by && m.return_by < todayStr(); }
function chipAppr(s) { return '<span class="chip chip-ap-' + esc(s) + '">' + esc(APPR_LABEL[s] || s) + '</span>'; }

/* ---------------- the list ---------------- */
function renderApprovals() {
  const c = $('#content');
  if (!S.dbv8) { c.innerHTML = '<div class="notice">Pieces on approval need the database update (ark-update-08.sql).</div>'; return; }
  S.apl = S.apl || { show: 'out' };
  const chip = (v, label) => '<button class="' + (S.apl.show === v ? 'on' : '') + '" data-action="ap-show" data-v="' + v + '">' + label + '</button>';
  c.innerHTML = '<button class="btn btn-primary" data-action="ap-new" style="margin-bottom:12px">＋ Give pieces on approval</button>' +
    '<div class="filter-chips">' + chip('out', 'With shops') + chip('late', 'Overdue') + chip('closed', 'Closed') + chip('all', 'All') + '</div>' +
    '<div id="ap-list">' + loadingHTML() + '</div>';
  loadApprovalList();
}
async function loadApprovalList() {
  const box = $('#ap-list');
  if (!box) return;
  const { data, error } = await db.from('approvals').select('*, clients(trade_name, city, mobile), approval_items(id, status)')
    .order('return_by', { ascending: true, nullsFirst: false }).order('memo_no', { ascending: false }).limit(300);
  if (!$('#ap-list')) return;
  if (error) { box.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  const show = S.apl.show;
  const rows = (data || []).filter((m) => show === 'all' ? true : show === 'closed' ? !memoOut(m).length : show === 'late' ? memoLate(m) : memoOut(m).length > 0);
  if (show === 'closed' || show === 'all') rows.sort((x, y) => y.memo_no - x.memo_no);   // newest first; open ones: the soonest back-by date first
  box.innerHTML = rows.length ? rows.map((m) => memoItemHTML(m, true)).join('') : '<div class="empty"><div class="big">💎</div>' +
    (show === 'out' ? 'No pieces with any shop right now.' : 'Nothing here.') + '</div>';
}
function memoItemHTML(m, showClient) {
  const cl = m.clients || {};
  const all = (m.approval_items || []).length, out = memoOut(m).length, late = memoLate(m);
  return '<div class="list-item" data-action="ap-open" data-id="' + m.id + '"><div class="li-main">' +
    '<div class="li-title">' + appNo(m.memo_no) + (showClient ? ' · ' + esc(cl.trade_name || '') : '') + '</div>' +
    '<div class="li-sub">' + esc('Given ' + fmtD(m.given_on) + (m.return_by ? ' · back by ' + fmtD(m.return_by) : '')) + '</div>' +
    '<div class="li-chips">' + (out ? '<span class="chip chip-ap-out">' + esc(out + ' of ' + all + ' with the shop') + '</span>' : '<span class="chip chip-ap-returned">Closed</span>') +
    (late ? '<span class="chip chip-late">' + esc(dueLabel(m.return_by)) + '</span>' : '') + '</div>' +
    '</div><div class="li-go">›</div></div>';
}

/* ---------------- new memo ---------------- */
function newApprovalForm(client) { return { client, return_by: todayStr(7), notes: '', items: [newApprovalPiece()] }; }
function newApprovalPiece() { return { description: '', design_code: '', qty: '1', net_wt: '', photo: null }; }
function startApproval(client) {
  S.apForm = newApprovalForm(client);
  showSub('Pieces on approval', renderApprovalForm, true);
}
function renderApprovalForm() {
  const F = S.apForm;
  if (!F) return;
  $('#content').innerHTML =
    '<div class="card" style="padding:13px 15px"><b>' + esc(F.client.trade_name || '') + '</b>' + (F.client.city ? ' <span style="color:var(--muted);font-size:13px">· ' + esc(F.client.city) + '</span>' : '') + '</div>' +
    '<div class="section-label">Pieces</div>' +
    F.items.map((it, i) => '<div class="fu-row ap-row"><div class="fu-top"><span class="chip chip-type">Piece ' + (i + 1) + '</span>' +
      (F.items.length > 1 ? '<button type="button" class="fu-x" data-action="af-del" data-i="' + i + '">✕</button>' : '') + '</div>' +
      '<div class="oi-grid">' +
      '<div class="full"><div class="oi-l">What it is</div><input type="text" data-af="description" data-i="' + i + '" list="af-cats" autocomplete="off" placeholder="e.g. Polki choker" value="' + esc(it.description) + '"></div>' +
      '<div><div class="oi-l">Tag / design no.</div><input type="text" data-af="design_code" data-i="' + i + '" autocomplete="off" value="' + esc(it.design_code) + '"></div>' +
      '<div><div class="oi-l">Qty (pcs)</div><input type="text" inputmode="numeric" data-af="qty" data-i="' + i + '" value="' + esc(it.qty) + '"></div>' +
      '<div><div class="oi-l">Net wt (g)</div><input type="text" inputmode="decimal" data-af="net_wt" data-i="' + i + '" value="' + esc(it.net_wt) + '"></div>' +
      '<div class="ap-ph">' + (it.photo ? '<img class="oi-thumb" src="' + URL.createObjectURL(it.photo.blob) + '" alt="">' : '') +
      '<button type="button" class="btn btn-small btn-secondary" data-action="af-photo" data-i="' + i + '">' + (it.photo ? 'Retake' : '📷 Photo') + '</button></div>' +
      '</div></div>').join('') +
    '<datalist id="af-cats">' + ITEM_CATS.map((x) => '<option value="' + esc(x) + '">').join('') + '</datalist>' +
    '<button type="button" class="btn btn-secondary" data-action="af-add" style="margin-bottom:12px">＋ Add a piece</button>' +
    '<div class="card"><div class="field"><label>Back by</label><input type="date" id="af-back" value="' + esc(F.return_by) + '"></div>' +
    '<div class="field" style="margin-bottom:2px"><label>Note (optional)</label><input type="text" id="af-notes" autocomplete="off" value="' + esc(F.notes) + '"></div></div>' +
    '<button class="btn btn-primary" data-action="af-save" id="af-save">Save the memo</button><div style="height:10px"></div>';
}
function keepApprovalForm() {
  const F = S.apForm;
  if (!F) return;
  document.querySelectorAll('[data-af]').forEach((el) => { const it = F.items[+el.dataset.i]; if (it) it[el.dataset.af] = el.value; });
  if ($('#af-back')) F.return_by = $('#af-back').value;
  if ($('#af-notes')) F.notes = $('#af-notes').value;
}
async function saveApproval() {
  keepApprovalForm();
  const F = S.apForm;
  const items = F.items.filter((it) => String(it.description).trim());
  if (!items.length) { toast('Write what the piece is.', 'err'); return; }
  const btn = $('#af-save');
  if (btn) btn.disabled = true;
  const { data: m, error } = await db.from('approvals').insert({ client_id: F.client.id, return_by: F.return_by || null, notes: F.notes.trim() || null, created_by: S.me.id }).select('id, memo_no').single();
  if (error || !m) { if (btn) btn.disabled = false; toast('Could not save — try again.', 'err'); return; }
  let fails = 0;
  const rows = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    let photo = null;
    if (it.photo) {
      const path = 'appr-' + m.id + '/' + (i + 1) + '-' + Date.now() + '.jpg';
      const up = await db.storage.from('orders').upload(path, it.photo.blob, { contentType: 'image/jpeg' });
      if (up.error) fails++; else photo = path;
    }
    rows.push({ approval_id: m.id, sort: i, description: String(it.description).trim(), design_code: String(it.design_code || '').trim() || null,
      qty: Math.max(1, parseInt(it.qty, 10) || 1), net_wt: numOrNull(it.net_wt), photo_path: photo });
  }
  const { error: e2 } = await db.from('approval_items').insert(rows);
  if (e2) { toast('The memo was saved, but its pieces could not be — open it and try again.', 'err'); }
  else toast(fails ? 'Saved — but ' + fails + ' photo(s) could not be uploaded.' : appNo(m.memo_no) + ' saved ✓', fails ? 'err' : 'ok');
  S.apForm = null;
  openApproval(m.id, true);
}
function approvalPhoto(i) {
  keepApprovalForm();
  const ov = openModal('<h3>Photo of the piece</h3><div style="display:flex;flex-direction:column;gap:10px"><button class="btn btn-primary" data-m="cam">📷 Take photo</button>' +
    '<button class="btn btn-secondary" data-m="gal">🖼️ Choose from gallery</button></div>');
  const go = (gal) => {
    closeModal();
    pickImage(async (file) => {
      const p = await photoFromFile(file, 'Piece on approval');
      if (!p || !S.apForm || !S.apForm.items[i]) return;
      S.apForm.items[i].photo = p;
      renderApprovalForm();
    }, gal);
  };
  ov.querySelector('[data-m=cam]').onclick = () => go(false);
  ov.querySelector('[data-m=gal]').onclick = () => go(true);
}

/* ---------------- one memo ---------------- */
async function fetchApproval(id) {
  const { data, error } = await db.from('approvals').select('*, clients(id, trade_name, city, mobile, contact_person, address, gstin, state, area, company_name, designation), approval_items(*)').eq('id', id).maybeSingle();
  if (error || !data) { toast('Could not open — try again.', 'err'); return null; }
  (data.approval_items || []).sort((a, b) => a.sort - b.sort);
  return data;
}
async function openApproval(id, replace) {
  const m = await fetchApproval(id);
  if (!m) return;
  let first = m;
  showSub(appNo(m.memo_no), () => {
    if (first) { const x = first; first = null; renderApprovalPage(x); }
    else fetchApproval(id).then((x) => { if (x) renderApprovalPage(x); });
  }, replace);
}
function renderApprovalPage(m) {
  S.apPage = m;
  const cl = m.clients || {};
  const items = m.approval_items || [];
  const out = memoOut(m).length, late = memoLate(m);
  $('#content').innerHTML =
    '<div class="client-head"><h2>' + appNo(m.memo_no) + '</h2>' +
    '<div class="co"><span class="o-headlink" data-action="open-client" data-id="' + m.client_id + '">' + esc(cl.trade_name || 'Client') + ' ›</span>' + (cl.city ? ' · ' + esc(cl.city) : '') + '</div>' +
    '<div class="chips"><span class="chip">' + esc('Given ' + fmtD(m.given_on)) + '</span>' +
    (m.return_by ? '<span class="chip' + (late ? ' chip-late' : '') + '">' + esc((late ? '⚠ ' : '') + 'Back by ' + fmtD(m.return_by)) + '</span>' : '') +
    (out ? '' : '<span class="chip chip-ap-returned">Closed</span>') + '</div></div>' +
    '<div class="action-row">' +
    (out ? '<button class="btn btn-secondary" data-action="ap-remind" data-id="' + m.id + '">WhatsApp reminder</button>' : '') +
    '<button class="btn btn-secondary" data-action="ap-pdf" data-id="' + m.id + '">Memo (PDF)</button>' +
    '</div>' +
    (out > 1 ? '<button class="btn btn-small btn-secondary" data-action="ap-all" data-id="' + m.id + '" data-s="returned" style="margin:0 0 10px">↩ All came back</button>' : '') +
    '<div class="section-label">Pieces (' + items.length + ')</div>' +
    items.map((it) => '<div class="card ap-item' + (it.status !== 'out' ? ' closed' : '') + '">' +
      (it.photo_path ? '<img class="ap-img" data-app="' + esc(it.photo_path) + '" alt="">' : '') +
      '<div class="ap-body"><div class="o-item-title">' + esc(it.description) + (it.design_code ? ' <span class="o-tag">' + esc(it.design_code) + '</span>' : '') + '</div>' +
      '<div class="o-item-meta">' + esc([it.qty > 1 ? it.qty + ' pcs' : '', it.net_wt != null ? 'Net ' + grams(it.net_wt) : ''].filter(Boolean).join(' · ')) + '</div>' +
      '<div class="ap-st">' + chipAppr(it.status) + (it.closed_on && it.status !== 'out' ? '<span class="hint">' + esc(fmtD(it.closed_on)) + '</span>' : '') + '</div>' +
      '<div class="photo-row">' + (it.status === 'out'
        ? '<button class="btn btn-small btn-primary" data-action="ap-item" data-id="' + it.id + '" data-s="sold">Sold</button>' +
          '<button class="btn btn-small btn-secondary" data-action="ap-item" data-id="' + it.id + '" data-s="returned">Returned</button>'
        : '<button class="btn btn-small btn-ghost" data-action="ap-item" data-id="' + it.id + '" data-s="out">Undo</button>') + '</div>' +
      '</div></div>').join('') +
    (m.notes ? '<div class="section-label">Note</div><div class="card" style="white-space:pre-wrap;font-size:14.5px">' + esc(m.notes) + '</div>' : '') +
    '<div style="display:flex;gap:10px;justify-content:center;margin:18px 0 6px"><button class="btn btn-small btn-danger-ghost" data-action="ap-del" data-id="' + m.id + '">Delete memo</button></div>';
  const ps = items.map((it) => it.photo_path).filter(Boolean);
  if (ps.length) signedUrls('orders', ps).then((mm) => { document.querySelectorAll('img[data-app]').forEach((im) => { const u = mm.get(im.dataset.app); if (u) im.src = u; }); });
}

async function setPieceStatus(itemId, s) {
  const m = S.apPage;
  const it = m && (m.approval_items || []).find((x) => x.id === itemId);
  if (!it) return;
  const patch = s === 'out' ? { status: 'out', closed_on: null, closed_by: null } : { status: s, closed_on: todayStr(), closed_by: S.me.id };
  const { data, error } = await db.from('approval_items').update(patch).eq('id', itemId).eq('status', it.status).select('id');
  if (error || !data || !data.length) { toast('Could not update — open the memo again.', 'err'); openApproval(m.id, true); return; }
  toast(s === 'out' ? 'Back with the shop' : (s === 'sold' ? 'Marked sold ✓' : 'Marked returned ✓'), 'ok');
  openApproval(m.id, true);
}
async function setAllPieces(memoId, s) {
  const m = S.apPage;
  if (!m) return;
  confirmModal('All pieces came back?', 'Every piece still with the shop will be marked returned today.', 'All returned', async () => {
    const { error } = await db.from('approval_items').update({ status: s, closed_on: todayStr(), closed_by: S.me.id }).eq('approval_id', memoId).eq('status', 'out');
    if (error) { toast('Could not update — try again.', 'err'); return; }
    toast('All marked returned ✓', 'ok');
    openApproval(memoId, true);
  });
}
function approvalRemind(id) {
  const m = S.apPage;
  if (!m) return;
  const cl = m.clients || {};
  const who = String(cl.contact_person || '').trim().split(/\s+/)[0];
  const out = memoOut(m);
  const text = 'Namaste' + (who ? ' ' + who + ' ji' : '') + ' 🙏\n' +
    'The pieces given to you on approval (' + appNo(m.memo_no) + (m.given_on ? ', ' + fmtD(m.given_on) : '') + ') ' +
    (m.return_by ? (m.return_by < todayStr() ? 'were due back on ' : 'are due back on ') + fmtD(m.return_by) : 'are still with you') + ':\n' +
    out.map((it, i) => (i + 1) + '. ' + it.description + (it.design_code ? ' (' + it.design_code + ')' : '')).join('\n') +
    '\nPlease let us know which ones you are keeping.\n— ' + bizName();
  window.open(waUrl(cl.mobile, text), '_blank');
}
function deleteApproval(id) {
  confirmModal('Delete this memo?', 'The memo and its pieces will be removed. This cannot be undone.', 'Delete', async () => {
    const m = S.apPage;
    const { error } = await db.from('approvals').delete().eq('id', id);
    if (error) { toast('Could not delete — try again.', 'err'); return; }
    const ps = m ? (m.approval_items || []).map((it) => it.photo_path).filter(Boolean) : [];
    if (ps.length) db.storage.from('orders').remove(ps).then(() => {}, () => {});
    toast('Deleted', 'ok');
    backOne();
  }, true);
}

/* the memo for the shop to sign */
async function buildApprovalPdf(id) {
  const m = await fetchApproval(id);
  if (!m) throw new Error('memo');
  const cl = m.clients || {}, items = m.approval_items || [];
  const meta = [['Memo no.', appNo(m.memo_no)], ['Given on', pDate(m.given_on)]];
  if (m.return_by) meta.push(['Back by', pDate(m.return_by)]);
  const d = await pdfStart('APPROVAL MEMO', meta, 'Goods sent on approval - not a sale');
  d.y = pParty(d, PM, d.y, PG_W - PM * 2, 'GIVEN TO', clientLines(cl)) + 3;
  const cols = [{ h: '#', w: 7 }, { h: 'Piece', w: 0 }, { h: 'Tag / design', w: 28 }, { h: 'Qty', w: 12, a: 'right' }, { h: 'Net wt (g)', w: 22, a: 'right' }, { h: 'Status', w: 26 }];
  cols[1].w = PG_W - PM * 2 - cols.reduce((a, x) => a + x.w, 0);
  let q = 0, n = 0;
  const rows = items.map((it, i) => { q += it.qty || 1; n += num(it.net_wt); return [String(i + 1), it.description, it.design_code || '', String(it.qty || 1), it.net_wt != null ? pG(it.net_wt) : '', APPR_LABEL[it.status] + (it.closed_on && it.status !== 'out' ? ' ' + pDate(it.closed_on) : '')]; });
  const tot = ['', 'Total', '', String(q), n ? pG(n) : '', ''];
  tot.bold = true;
  rows.push(tot);
  d.table(cols, rows);
  pNote(d, '', 'The above goods are given on approval and remain our property until they are paid for. Please return the pieces not kept' + (m.return_by ? ' by ' + pDate(m.return_by) : '') + '.');
  pNote(d, 'NOTE', m.notes);
  const urls = await signedUrls('orders', items.map((it) => it.photo_path).filter(Boolean));
  await pPhotos(d, items.map((it) => ({ category: it.description, design_code: it.design_code })), items.map((it) => (it.photo_path ? urls.get(it.photo_path) || null : null)));
  pSignatures(d, 'Received the above goods on approval - signature, name and date');
  return { pdf: d, name: safeFileName(appNo(m.memo_no) + ' ' + (cl.trade_name || '') + ' - Approval memo') + '.pdf', text: 'Approval memo ' + appNo(m.memo_no) + ' from ' + bizName() };
}

/* ---------------- Today and the client page ---------------- */
async function loadTodayApprovals() {
  const el = $('#today-approvals');
  if (!el || !approvalsOn()) return;
  const { data, error } = await db.from('approvals').select('*, clients(trade_name, city), approval_items(id, status)').lte('return_by', todayStr(1))
    .order('return_by', { ascending: true }).limit(100);
  if (!$('#today-approvals') || error) return;
  const rows = (data || []).filter((m) => memoOut(m).length);
  el.innerHTML = rows.length ? '<div class="due-group-label ap-label sl-row"><span>💎 Pieces to collect (' + rows.length + ')</span><a href="#" data-action="ap-list">All ›</a></div>' +
    rows.map((m) => memoItemHTML(m, true)).join('') : '';
}
async function loadClientApprovals(cl) {
  const el = $('#client-approvals');
  if (!el || !approvalsOn()) return;
  const { data, error } = await db.from('approvals').select('*, approval_items(id, status)').eq('client_id', cl.id).order('given_on', { ascending: false }).limit(50);
  if (!$('#client-approvals') || error) return;
  const rows = data || [];
  const open = rows.filter((m) => memoOut(m).length);
  el.innerHTML = rows.length ? '<div class="section-label">On approval' + (open.length ? ' · ' + open.length + ' open' : '') + '</div>' + rows.map((m) => memoItemHTML(m, false)).join('') : '';
}

onAct('ap-list', () => showSub('Pieces on approval', renderApprovals));
onAct('ap-new', () => pickClientThen('On approval — choose the shop', (c) => startApproval(c)));
onAct('ap-new-for', async (el) => { const c = await fetchClient(el.dataset.id); if (c) { S.apForm = newApprovalForm(c); showSub('Pieces on approval', renderApprovalForm); } });
onAct('ap-show', (el) => { S.apl.show = el.dataset.v; document.querySelectorAll('[data-action="ap-show"]').forEach((b) => b.classList.toggle('on', b === el)); loadApprovalList(); });
onAct('ap-open', (el) => openApproval(el.dataset.id));
onAct('ap-item', (el) => setPieceStatus(el.dataset.id, el.dataset.s));
onAct('ap-all', (el) => setAllPieces(el.dataset.id, el.dataset.s));
onAct('ap-remind', (el) => approvalRemind(el.dataset.id));
onAct('ap-pdf', (el) => makeAndOfferPdf(() => buildApprovalPdf(el.dataset.id)));
onAct('ap-del', (el) => deleteApproval(el.dataset.id));
onAct('af-add', () => { keepApprovalForm(); S.apForm.items.push(newApprovalPiece()); renderApprovalForm(); });
onAct('af-del', (el) => { keepApprovalForm(); S.apForm.items.splice(+el.dataset.i, 1); renderApprovalForm(); });
onAct('af-photo', (el) => approvalPhoto(+el.dataset.i));
onAct('af-save', () => saveApproval());
