/* ============================================================
   QUALITY & HALLMARK, THE CAD DESK, THE DISPATCH DESK (database update 21)
   · Quality check before a piece goes out (an order, or a piece of stock):
     weight, stones, polish, size, lock, stamp — passed, or back for rework
     (and the rework given as work to someone, in one tap).
   · Hallmarking: pieces sent to the hallmarking centre; when they come back,
     the HUID of each (saved on the stock piece) and the charges.
   · CAD desk: orders whose CAD is to be made, waiting for the shop, or the
     shop asked for a change. Dispatch desk: orders ready to send, and sent.
   ============================================================ */
'use strict';

function qualityOn() { return !!S.dbv21 && hasDept('quality'); }
const QC_CHECKS = [['weight', 'Weight is right'], ['stones', 'Stones all there and tight'], ['polish', 'Polish and finish'], ['size', 'Size is right'],
  ['lock', 'Lock / screw works'], ['stamp', 'Purity stamp']];

/* ---------------- quality check ---------------- */
async function renderQC() {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [os, qs] = await Promise.all([
    db.from('orders').select('*, clients(trade_name), ' + ORDER_PHOTO_COLS).eq('status', 'finished').order('due_date', { ascending: true }).limit(300),
    db.from('qc_checks').select('*').gte('checked_at', since).order('checked_at', { ascending: false }).limit(500),
  ]);
  if (!$('#content')) return;
  if (os.error || qs.error) { c.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  const checks = qs.data || [];
  const ordIds = (os.data || []).map((o) => o.id);
  const { data: older } = ordIds.length ? await db.from('qc_checks').select('order_id, result, checked_at').in('order_id', ordIds).order('checked_at', { ascending: false }).limit(2000) : { data: [] };
  const last = new Map();
  (older || []).forEach((q) => { if (!last.has(q.order_id)) last.set(q.order_id, q); });
  const wait = (os.data || []).filter((o) => !last.has(o.id) || last.get(o.id).result !== 'pass');
  const rework = wait.filter((o) => last.has(o.id));
  S.qcOrders = new Map((os.data || []).map((o) => [o.id, o]));
  const itemIds = Array.from(new Set(checks.map((q) => q.item_id).filter(Boolean)));
  const doneOrd = Array.from(new Set(checks.map((q) => q.order_id).filter(Boolean)));
  const [items, ords] = await Promise.all([
    itemIds.length ? db.from('catalogue_items').select('id, tag_no, design_no, title').in('id', itemIds) : Promise.resolve({ data: [] }),
    doneOrd.length ? db.from('orders').select('id, order_no, clients(trade_name)').in('id', doneOrd) : Promise.resolve({ data: [] }),
  ]);
  const iName = new Map((items.data || []).map((i) => [i.id, i.tag_no || i.design_no || i.title || '']));
  const oName = new Map((ords.data || []).map((o) => [o.id, ordNo(o.order_no) + (o.clients ? ' · ' + o.clients.trade_name : '')]));
  c.innerHTML = '<div class="action-row"><button class="btn btn-secondary" data-action="qc-piece">🔎 Check a stock piece</button></div>' +
    '<div class="section-label">' + esc('Finished — to check (' + wait.length + ')') + '</div>' +
    (wait.length ? wait.map((o) => '<div class="qc-o">' + orderListItemHTML(o, true) + '<div class="qc-bar">' +
      (rework.indexOf(o) > -1 ? '<span class="chip chip-off">Back for rework</span>' : '') +
      '<button class="btn btn-small btn-primary" data-action="qc-order" data-id="' + o.id + '">✓ Check it</button></div></div>').join('')
      : '<div class="empty">Nothing waiting — every finished order is checked.</div>') +
    (checks.length ? '<div class="section-label">Checked in the last 30 days</div>' + checks.map((q) => {
      const bad = QC_CHECKS.filter((k) => q.checks && q.checks[k[0]] === false).map((k) => k[1]);
      return '<div class="card rc-item"><div><b class="' + (q.result === 'pass' ? 'o-green' : 'o-red') + '">' + esc(q.result === 'pass' ? '✓ Passed' : '↩ Back for rework') + '</b> · <span class="noi18n">' +
        esc(q.order_id ? oName.get(q.order_id) || 'Order' : iName.get(q.item_id) || 'Piece') + '</span>' +
        '<div class="rc-sub">' + esc([fmtDT(q.checked_at), nameOf(q.checked_by), q.gross_g != null ? grams(q.gross_g) : ''].filter(Boolean).join(' · ')) +
        (bad.length ? ' · ' + bad.map((b) => esc('✗ ' + b)).join(', ') : '') + (q.note ? ' · <span class="noi18n">' + esc(q.note) + '</span>' : '') + '</div>' +
        ((q.files || []).length ? woFilesHTML(q.files, 'Check') : '') + '</div></div>';
    }).join('') : '');
  fillOrderThumbs(c);
  woLoadPics(c);
}
function qcModal(t) {   // t = { order_id | item_id, label, expect, client, orderNo }
  const st = {};
  QC_CHECKS.forEach((k) => { st[k[0]] = true; });
  WO_ATT.qc = { list: [], draw: () => { const el = $('#qc-atts'); if (el) el.innerHTML = woAttHTML(WO_ATT.qc.list, 'qc'); } };
  const ov = openModal('<h3>Quality check</h3><p class="noi18n">' + esc(t.label) + '</p>' +
    '<div class="qc-list">' + QC_CHECKS.map((k) => '<button type="button" class="qc-k ok" data-k="' + k[0] + '"><span class="qc-mark">✓</span>' + esc(k[1]) + '</button>').join('') + '</div>' +
    '<p class="hint">Tap a line that is not right (✗).</p>' +
    '<div class="field"><label>Weight now (g)' + (t.expect ? ' — ' + esc('should be ' + grams(t.expect)) : '') + '</label><input type="text" inputmode="decimal" id="qc-w" placeholder="0.000"></div>' +
    '<div class="field"><label>Note</label><input type="text" id="qc-note" maxlength="1000" autocomplete="off" placeholder="What is to be done again"></div>' +
    '<div class="wo-atts" id="qc-atts"></div>' + woPickHTML('qc') +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="back">↩ Back for rework</button><button class="btn btn-primary" data-m="pass">✓ Passed</button></div>');
  woModalActs(ov);
  ov.querySelector('.qc-list').addEventListener('click', (e) => {
    const b = e.target.closest('.qc-k'); if (!b) return;
    st[b.dataset.k] = !st[b.dataset.k];
    b.classList.toggle('ok', st[b.dataset.k]); b.classList.toggle('bad', !st[b.dataset.k]);
    b.querySelector('.qc-mark').textContent = st[b.dataset.k] ? '✓' : '✗';
  });
  const save = async (result, btn) => {
    if (result === 'pass' && Object.keys(st).some((k) => !st[k])) { toast('A line is marked ✗ — send it back for rework, or tap the line again.', 'err'); return; }
    const w = numOrNull($('#qc-w').value);
    if (w != null && w <= 0) { toast('Check the weight.', 'err'); return; }
    btn.disabled = true;
    const id = crypto.randomUUID();
    let files = [], fails = 0;
    if (WO_ATT.qc.list.length) { const up = await woUpload('quality/' + id + '/', WO_ATT.qc.list); files = up.files; fails = up.fails; }
    const note = $('#qc-note').value.trim();
    const { error } = await db.from('qc_checks').insert({ id, order_id: t.order_id || null, item_id: t.item_id || null, checks: st, result, gross_g: w, note: note || null, files, checked_by: S.me.id });
    if (error) { btn.disabled = false; toast('Could not save — try again.', 'err'); return; }
    closeModal();
    toast((result === 'pass' ? 'Passed ✓' : 'Sent back for rework') + (fails ? ' — ' + fails + ' file(s) did not upload' : ''), fails ? 'err' : 'ok');
    if ($('#content') && $('#content').querySelector('[data-action="qc-piece"]')) renderQC();
    if (result === 'rework' && typeof giveWork === 'function' && typeof workOn === 'function' && workOn()) {
      const bad = QC_CHECKS.filter((k) => !st[k[0]]).map((k) => k[1]);
      confirmModal('Give the rework to someone?', 'As work, with this order and what is to be done.', 'Give work', () => {
        giveWork({ title: 'Rework: ' + t.label + (bad.length ? ' — ' + bad.join(', ') : ''), details: note, client: t.client || null, orderNo: t.orderNo || '' });
      });
    }
  };
  ov.querySelector('[data-m=pass]').onclick = (e) => save('pass', e.target);
  ov.querySelector('[data-m=back]').onclick = (e) => save('rework', e.target);
}
async function qcPiece() {
  const ov = openModal('<h3>Check a stock piece</h3><div class="field"><label>Tag no. or design no.</label><input type="text" id="qp-tag" autocomplete="off" autocapitalize="characters"></div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Find</button></div>');
  ov.querySelector('[data-m=no]').onclick = closeModal;
  const go = async () => {
    const q = $('#qp-tag').value.trim();
    if (!q) return;
    const { data } = await db.from('catalogue_items').select('id, tag_no, design_no, title, gross_wt, status').or('tag_no.ilike.' + q + ',design_no.ilike.' + q).limit(5);
    const it = (data || [])[0];
    if (!it) { toast('No piece with "' + q + '".', 'err'); return; }
    qcModal({ item_id: it.id, label: [it.tag_no, it.design_no, it.title].filter(Boolean).join(' · '), expect: it.gross_wt });
  };
  ov.querySelector('[data-m=yes]').onclick = go;
  $('#qp-tag').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  setTimeout(() => { const i = $('#qp-tag'); if (i) i.focus(); }, 50);
}

/* ---------------- hallmarking ---------------- */
async function renderHallmark() {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const since = addDaysStr(todayStr(), -120);
  const { data, error } = await db.from('hallmark_jobs').select('*').or('back_on.is.null,sent_on.gte.' + since).order('sent_on', { ascending: false }).limit(300);
  if (!$('#content')) return;
  if (error) { c.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  S.hmJobs = data || [];
  const out = S.hmJobs.filter((j) => !j.back_on), back = S.hmJobs.filter((j) => j.back_on);
  const row = (j) => '<div class="card rc-item tap" data-action="hm-job" data-id="' + j.id + '"><div><b class="noi18n">' + esc(j.centre) + '</b> · ' + esc((j.items || []).length === 1 ? '1 piece' : (j.items || []).length + ' pieces') +
    '<div class="rc-sub">' + esc(['Sent ' + fmtD(j.sent_on), j.back_on ? 'back ' + fmtD(j.back_on) : 'not back yet', j.charges != null ? inrNum(j.charges) : ''].filter(Boolean).join(' · ')) + '</div></div><span class="mr-go">›</span></div>';
  c.innerHTML = (qualityOn() ? '<button class="btn btn-primary" data-action="hm-new" style="margin-bottom:12px">＋ Send for hallmarking</button>' : '') +
    '<div class="section-label">' + esc('At the centre (' + out.length + ')') + '</div>' + (out.length ? out.map(row).join('') : '<div class="empty">Nothing at the centre.</div>') +
    (back.length ? '<div class="section-label">Came back</div>' + back.map(row).join('') : '');
}
async function renderHallmarkNew() {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const [it, os] = await Promise.all([
    db.from('catalogue_items').select('id, tag_no, design_no, category, gross_wt, metal, huid').in('status', ['available', 'reserved', 'approval']).is('huid', null).order('created_at', { ascending: false }).limit(500),
    db.from('orders').select('id, order_no, status, clients(trade_name)').in('status', ['finished', 'igi', 'ready']).order('due_date').limit(300),
  ]);
  if (!$('#content')) return;
  const items = (it.data || []).filter((x) => (x.metal || 'Gold') === 'Gold');
  S.hmPick = { items, orders: os.data || [], on: new Set() };
  const last = (S.hmJobs || [])[0];
  c.innerHTML = '<div class="card"><div class="o-2col"><div class="field"><label>Hallmarking centre</label><input type="text" id="hm-centre" maxlength="100" autocomplete="off" value="' + esc(last ? last.centre : '') + '"></div>' +
    '<div class="field"><label>Sent on</label><input type="date" id="hm-date" value="' + todayStr() + '"></div></div>' +
    '<input type="search" id="hm-q" placeholder="Search a tag or order no." autocomplete="off"></div>' +
    '<div class="section-label">Stock pieces without a HUID</div><div id="hm-items">' + items.map((x) => '<label class="hm-row" data-q="' + esc((x.tag_no || '') + ' ' + (x.design_no || '') + ' ' + (x.category || '')).toLowerCase() + '">' +
      '<input type="checkbox" data-hm="i:' + x.id + '"><span class="noi18n">' + esc([x.tag_no, x.design_no].filter(Boolean).join(' · ') || x.category || '—') + '</span><small>' + esc([x.category, x.gross_wt != null ? grams(x.gross_wt) : ''].filter(Boolean).join(' · ')) + '</small></label>').join('') +
      (items.length ? '' : '<div class="empty">None.</div>') + '</div>' +
    '<div class="section-label">Orders that are made</div><div id="hm-orders">' + S.hmPick.orders.map((o) => '<label class="hm-row" data-q="' + esc((ordNo(o.order_no) + ' ' + ((o.clients || {}).trade_name || '')).toLowerCase()) + '">' +
      '<input type="checkbox" data-hm="o:' + o.id + '"><span class="noi18n">' + esc(ordNo(o.order_no) + ' · ' + ((o.clients || {}).trade_name || '')) + '</span><small>' + esc(OSTATUS_LABEL[o.status] || o.status) + '</small></label>').join('') +
      (S.hmPick.orders.length ? '' : '<div class="empty">None.</div>') + '</div>' +
    '<button class="btn btn-primary" data-action="hm-send" id="hm-send" style="margin-top:12px">Send</button>';
  $('#hm-q').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    c.querySelectorAll('.hm-row').forEach((r) => { r.hidden = !!q && r.dataset.q.indexOf(q) < 0; });
  });
}
async function hallmarkSend(btn) {
  const centre = $('#hm-centre').value.trim();
  const picked = Array.from(document.querySelectorAll('[data-hm]:checked')).map((x) => x.dataset.hm);
  if (!centre) { toast('Write the hallmarking centre.', 'err'); return; }
  if (!picked.length) { toast('Choose the pieces you send.', 'err'); return; }
  const P = S.hmPick, items = picked.map((k) => {
    const [t, id] = k.split(':');
    if (t === 'i') { const x = P.items.find((y) => y.id === id) || {}; return { item_id: id, label: [x.tag_no, x.design_no].filter(Boolean).join(' · ') || x.category || '', weight_g: x.gross_wt != null ? num(x.gross_wt) : null }; }
    const o = P.orders.find((y) => y.id === id) || {};
    return { order_id: id, label: ordNo(o.order_no) + (o.clients ? ' · ' + o.clients.trade_name : '') };
  });
  btn.disabled = true;
  const { error } = await db.from('hallmark_jobs').insert({ centre, sent_on: $('#hm-date').value || todayStr(), items, created_by: S.me.id });
  if (error) { btn.disabled = false; toast('Could not save — try again.', 'err'); return; }
  toast(items.length === 1 ? '1 piece sent ✓' : items.length + ' pieces sent ✓', 'ok');
  goBack();
}
function hallmarkJob(id) {
  const j = (S.hmJobs || []).find((x) => x.id === id);
  if (!j) return;
  const edit = qualityOn();
  const ov = openModal('<h3 class="noi18n">' + esc(j.centre) + '</h3><p>' + esc('Sent ' + fmtD(j.sent_on) + (j.back_on ? ' · back ' + fmtD(j.back_on) : '')) + '</p>' +
    '<div class="hm-items">' + (j.items || []).map((x, i) => '<div class="hm-item"><span class="noi18n">' + esc(x.label || '—') + (x.weight_g ? ' · ' + grams(x.weight_g) : '') + '</span>' +
      (edit ? '<input type="text" data-huid="' + i + '" maxlength="6" autocapitalize="characters" autocomplete="off" placeholder="HUID" value="' + esc(x.huid || '') + '">' : '<b class="noi18n">' + esc(x.huid || '—') + '</b>') + '</div>').join('') + '</div>' +
    (edit ? '<div class="o-2col"><div class="field"><label>Came back on</label><input type="date" id="hj-back" value="' + esc(j.back_on || todayStr()) + '"></div>' +
      '<div class="field"><label>Charges (₹)</label><input type="text" inputmode="decimal" id="hj-chg" value="' + (j.charges != null ? esc(String(num(j.charges))) : '') + '"></div></div>' +
      (moneyOn() && j.charges == null ? '<label class="sw-row"><span class="sw-t"><b>Paid in cash</b><span>Write the charges in the cash book</span></span><input type="checkbox" class="sw" id="hj-cash"></label>' : '') : '') +
    '<div class="modal-actions">' + (edit ? '<button class="btn btn-danger-ghost" data-m="del">Delete</button><button class="btn btn-primary" data-m="yes">Save</button>' : '<button class="btn btn-secondary" data-m="no">Close</button>') + '</div>');
  const no = ov.querySelector('[data-m=no]'); if (no) no.onclick = closeModal;
  if (!edit) return;
  ov.querySelector('[data-m=del]').onclick = () => confirmModal('Delete this?', 'The HUIDs already saved on the pieces stay.', 'Delete', async () => {
    const r = await db.from('hallmark_jobs').delete().eq('id', j.id).select('id');
    if (r.error || !r.data || !r.data.length) { toast('Could not delete — try again.', 'err'); return; }
    toast('Deleted', 'ok');
    renderHallmark();
  }, true);
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    const items = (j.items || []).map((x) => Object.assign({}, x));
    let bad = false;
    ov.querySelectorAll('[data-huid]').forEach((inp) => {
      const v = inp.value.trim().toUpperCase().replace(/\s+/g, '');
      if (v && !/^[A-Z0-9]{6}$/.test(v)) bad = true;
      items[+inp.dataset.huid].huid = v || null;
    });
    if (bad) { toast('A HUID is 6 letters or digits.', 'err'); return; }
    const chg = numOrNull($('#hj-chg').value), back = $('#hj-back').value || null;
    if (back && back < j.sent_on) { toast('It cannot come back before it was sent.', 'err'); return; }
    e.target.disabled = true;
    const { error } = await db.from('hallmark_jobs').update({ items, back_on: back, charges: chg }).eq('id', j.id);
    if (error) { e.target.disabled = false; toast('Could not save — try again.', 'err'); return; }
    let fails = 0;
    for (const x of items) if (x.item_id && x.huid) { const r = await db.from('catalogue_items').update({ huid: x.huid }).eq('id', x.item_id); if (r.error) fails++; }
    if (chg > 0 && $('#hj-cash') && $('#hj-cash').checked) {
      await loadAccounts();
      const cash = S.accounts.find((a) => a.kind === 'cash' && a.is_default) || S.accounts.find((a) => a.kind === 'cash');
      if (cash) await db.from('cash_entries').insert({ entry_date: back || todayStr(), account_id: cash.id, dir: 'out', amount: chg, head: 'hallmark', note: j.centre, created_by: S.me.id });
    }
    closeModal();
    toast(fails ? 'Saved — ' + fails + ' HUID(s) could not go on the piece' : 'Saved ✓', fails ? 'err' : 'ok');
    renderHallmark();
  };
}

/* ---------------- the CAD desk and the dispatch desk ---------------- */
async function renderCadDesk() {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const { data, error } = await db.from('orders').select('*, clients(trade_name), ' + ORDER_PHOTO_COLS).in('status', ['new', 'cad']).order('due_date', { ascending: true }).limit(500);
  if (!$('#content')) return;
  if (error) { c.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  const all = data || [];
  const groups = [
    ['The shop asked for a change', all.filter((o) => o.cad_state === 'change'), true],
    ['Approved by the shop — mark CAD done', all.filter((o) => o.status === 'new' && o.cad_state === 'approved')],
    ['CAD to make', all.filter((o) => o.status === 'new' && !o.cad_state)],
    ['Waiting for the shop', all.filter((o) => o.cad_state === 'sent')],
  ];
  c.innerHTML = '<div class="st-tot">' + groups.map((g) => '<div><b class="' + (g[2] && g[1].length ? 'o-red' : '') + '">' + g[1].length + '</b><span>' + esc(g[0].split(' — ')[0]) + '</span></div>').join('') + '</div>' +
    groups.filter((g) => g[1].length).map((g) => '<div class="section-label">' + esc(g[0]) + '</div>' + g[1].map((o) => orderListItemHTML(o, true)).join('')).join('') +
    (all.length ? '' : '<div class="empty">No order is waiting for its CAD.</div>');
  fillOrderThumbs(c);
}
async function renderDispatchDesk() {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const since = addDaysStr(todayStr(), -7);
  const [rd, sent] = await Promise.all([
    db.from('orders').select('*, clients(trade_name), ' + ORDER_PHOTO_COLS).eq('status', 'ready').order('due_date', { ascending: true }).limit(300),
    db.from('orders').select('*, clients(trade_name), ' + ORDER_PHOTO_COLS).eq('status', 'delivered').gte('delivered_on', since).order('delivered_on', { ascending: false }).limit(300),
  ]);
  if (!$('#content')) return;
  if (rd.error) { c.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  const ready = rd.data || [], gone = sent.data || [];
  c.innerHTML = '<div class="st-tot"><div><b>' + ready.length + '</b><span>Ready to send</span></div><div><b>' + gone.length + '</b><span>Sent this week</span></div></div>' +
    '<div class="section-label">Ready to send</div>' + (ready.length ? ready.map((o) => orderListItemHTML(o, true)).join('') : '<div class="empty">Nothing ready to send.</div>') +
    (gone.length ? '<div class="section-label">Sent in the last 7 days</div>' + gone.map((o) => '<div class="ds-o">' + orderListItemHTML(o, true) +
      (typeof dispatchLine === 'function' && dispatchLine(o) ? '<div class="qc-bar"><span class="rc-sub noi18n-mix">' + esc(dispatchLine(o)) + '</span></div>' : '') + '</div>').join('') : '');
  fillOrderThumbs(c);
}

onAct('qc-open', () => showSub('Quality check', renderQC));
onAct('qc-order', (el) => {
  const o = S.qcOrders && S.qcOrders.get(el.dataset.id);
  if (o) qcModal({ order_id: o.id, label: ordNo(o.order_no) + (o.clients ? ' · ' + o.clients.trade_name : ''), client: o.client_id ? { id: o.client_id, trade_name: (o.clients || {}).trade_name || '' } : null, orderNo: ordNo(o.order_no) });
});
onAct('qc-piece', () => qcPiece());
onAct('hm-open', () => showSub('Hallmarking', renderHallmark));
onAct('hm-new', () => showSub('Send for hallmarking', renderHallmarkNew));
onAct('hm-send', (el) => hallmarkSend(el));
onAct('hm-job', (el) => hallmarkJob(el.dataset.id));
onAct('cad-desk', () => showSub('CAD desk', renderCadDesk));
onAct('ds-desk', () => showSub('Dispatch', renderDispatchDesk));
