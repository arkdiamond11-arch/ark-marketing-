/* ============================================================
   PRODUCTION STEPS — each order's journey from design to the
   finished piece: start and finish dates, karigar, weight after
   each step (so any loss shows up), notes. The owner can change
   the standard step lists (More → Production steps).
   The order moves to "In production" when the first step starts
   and the app offers "Mark Ready" when the last step is done.
   ============================================================ */
'use strict';

const STEP_TEMPLATES_DEFAULT = [
  ['Standard', ['Design / CAD', 'Casting', 'Filing & assembly', 'Stone setting', 'Polishing', 'Plating / rhodium', 'Hallmarking', 'Certification', 'Quality check & packing']],
  ['Polki / Kundan', ['Design approval', 'Ghaat (frame making)', 'Meena work', 'Polki / kundan setting', 'Polishing', 'Stringing (patwa)', 'Hallmarking', 'Quality check & packing']],
  ['Ready stock', ['Hallmarking', 'Certification', 'Quality check & packing']],
];
const STEP_STATUS_LABEL = { pending: 'Not started', in_progress: 'In progress', done: 'Done', skipped: 'Skipped' };

function stepTemplates() {
  const t = S.biz && S.biz.step_templates;
  if (Array.isArray(t)) {
    const ok = t.filter((x) => Array.isArray(x) && x[0] && Array.isArray(x[1]) && x[1].length);
    if (ok.length) return ok;
  }
  return STEP_TEMPLATES_DEFAULT;
}
function stepIsClosed(st) { return st.status === 'done' || st.status === 'skipped'; }
function currentStep(steps) { return steps.find((st) => !stepIsClosed(st)) || null; }
function stepsDone(steps) { return steps.filter((st) => st.status === 'done').length; }
function stepsCounted(steps) { return steps.filter((st) => st.status !== 'skipped').length; }

/* ---------------- on the order page ---------------- */
async function loadOrderSteps(o) {
  const box = $('#o-steps-view');
  if (!box) return;
  if (o.status === 'quote' || o.status === 'cancelled') { box.innerHTML = ''; return; }
  const { data, error } = await db.from('order_steps').select('*').eq('order_id', o.id).order('sort', { ascending: true }).order('created_at', { ascending: true });
  if (!$('#o-steps-view')) return;
  if (error) { box.innerHTML = ''; return; }
  S.osteps = { order: o, steps: data || [] };
  drawOrderSteps();
}

function drawOrderSteps() {
  const box = $('#o-steps-view');
  if (!box || !S.osteps) return;
  const o = S.osteps.order, steps = S.osteps.steps;
  if (!steps.length) {
    if (o.status === 'delivered') { box.innerHTML = ''; return; }
    const pref = o.order_type === 'ready_stock' ? 'Ready stock' : null;
    const list = stepTemplates().slice().sort((a, b) => (b[0] === pref) - (a[0] === pref));
    box.innerHTML = '<div class="section-label">Production</div><div class="card">' +
      '<p class="st-intro">Track this order step by step — design, casting, setting, polishing … till the piece is finished.</p>' +
      '<div class="st-tpls">' + list.map((t) => '<button class="btn btn-small btn-secondary" data-action="st-start" data-tpl="' + esc(t[0]) + '">' +
        esc(t[0]) + ' <span class="st-n">(' + t[1].length + ')</span></button>').join('') + '</div></div>';
    return;
  }
  const done = stepsDone(steps), counted = stepsCounted(steps);
  const cur = currentStep(steps);
  let lastW = null;
  const rows = steps.map((st) => {
    const isCur = cur && cur.id === st.id;
    let wTxt = '';
    if (st.weight_g != null) {
      const w = num(st.weight_g);
      wTxt = grams(w);
      if (lastW != null && Math.abs(lastW - w) > 0.0005) wTxt += ' (' + (w < lastW ? '−' : '+') + grams(Math.abs(lastW - w)) + ')';
      lastW = w;
    }
    const meta = [
      st.status === 'done' ? 'Done ' + (st.done_on ? fmtD(st.done_on) : '') : st.status === 'in_progress' ? 'Started ' + (st.started_on ? fmtD(st.started_on) : '') : st.status === 'skipped' ? 'Skipped' : '',
      st.karigar_id ? kName(st.karigar_id) : '', wTxt, st.note || '',
    ].filter((x) => x && String(x).trim()).join(' · ');
    const ic = st.status === 'done' ? '✓' : st.status === 'in_progress' ? '●' : st.status === 'skipped' ? '–' : '○';
    const btn = isCur ? (st.status === 'in_progress'
      ? '<button class="btn btn-small btn-primary" data-action="st-done" data-id="' + st.id + '">Done ✓</button>'
      : '<button class="btn btn-small btn-secondary" data-action="st-begin" data-id="' + st.id + '">Start</button>') : '';
    return '<div class="st-row st-' + esc(st.status) + (isCur ? ' st-cur' : '') + '">' +
      '<span class="st-ic">' + ic + '</span>' +
      '<div class="st-main" data-action="st-open" data-id="' + st.id + '"><b>' + esc(st.name) + '</b>' + (meta ? '<div class="st-meta">' + esc(meta) + '</div>' : '') + '</div>' +
      btn + '</div>';
  }).join('');
  box.innerHTML = '<div class="section-label sl-row"><span>Production · ' + done + ' of ' + counted + ' done</span>' +
    '<a href="#" data-action="st-jobcard" data-id="' + o.id + '">Job card PDF</a></div>' +
    '<div class="card st-card"><div class="pg-bar"><i class="' + (done >= counted ? 'done' : 'ok') + '" style="width:' + (counted ? Math.round(done / counted * 100) : 0) + '%"></i></div>' +
    rows +
    '<button class="btn btn-small btn-ghost" data-action="st-add" style="margin-top:8px">＋ Add step</button></div>';
}
function kName(id) { const k = (S.karigars || []).find((x) => x.id === id); return k ? k.name : ''; }

async function startSteps(tplName) {
  const S0 = S.osteps;
  if (!S0) return;
  const tpl = stepTemplates().find((t) => t[0] === tplName) || stepTemplates()[0];
  const rows = tpl[1].map((name, i) => ({ order_id: S0.order.id, sort: i, name, status: 'pending' }));
  const { error } = await db.from('order_steps').insert(rows);
  if (error) { toast('Could not save — try again.', 'err'); return; }
  await db.from('order_updates').insert({ order_id: S0.order.id, note: 'Production steps added: ' + tpl[0], created_by: S.me.id });
  loadOrderSteps(S0.order);
}

/* the order follows its steps: first step started → In production; last step done → offer Ready */
async function afterStepChange(prevStatus, st) {
  const o = S.osteps.order;
  const fresh = await fetchOrder(o.id);
  if (!fresh) return;
  if (fresh.status === 'new' && (st.status === 'in_progress' || st.status === 'done')) {
    const { error } = await db.from('orders').update({ status: 'in_production', delivered_on: null }).eq('id', o.id);
    if (!error) await db.from('order_updates').insert({ order_id: o.id, status: 'in_production', note: 'Production started', created_by: S.me.id });
  }
  const { data } = await db.from('order_steps').select('status').eq('order_id', o.id);
  const all = data || [];
  const finished = all.length && all.every(stepIsClosed) && all.some((x) => x.status === 'done');
  const now = await fetchOrder(o.id);
  if (finished && now && (now.status === 'new' || now.status === 'in_production') && prevStatus !== 'done') {
    openOrder(o.id, true);
    confirmModal('All steps done', 'Mark ' + ordNo(o.order_no) + ' as Ready for delivery?', 'Mark Ready', () => setOrderStatus(o.id, 'ready'));
    return;
  }
  openOrder(o.id, true);
}

function stepModal(st, mode) {
  const O = S.osteps;
  if (!O) return;
  const isNew = !st;
  const s = st || { name: '', status: 'pending' };
  const status = mode === 'done' ? 'done' : mode === 'begin' ? 'in_progress' : s.status;
  const kOpts = '<option value="">— None —</option>' + (S.karigars || []).filter((k) => k.active || k.id === s.karigar_id)
    .map((k) => '<option value="' + esc(k.id) + '"' + (k.id === s.karigar_id ? ' selected' : '') + '>' + esc(k.name) + '</option>').join('');
  const ov = openModal('<h3>' + (isNew ? 'Add step' : esc(s.name)) + '</h3>' +
    (isNew || mode === 'edit' ? '<div class="field"><label>Step</label><input type="text" id="sm-name" value="' + esc(s.name) + '" placeholder="e.g. Polishing"></div>' : '') +
    '<div class="field"><label>Status</label><select id="sm-status">' + Object.keys(STEP_STATUS_LABEL).map((k) =>
      '<option value="' + k + '"' + (k === status ? ' selected' : '') + '>' + STEP_STATUS_LABEL[k] + '</option>').join('') + '</select></div>' +
    '<div class="o-2col">' +
    '<div class="field"><label>Started on</label><input type="date" id="sm-start" value="' + esc(s.started_on || (status === 'in_progress' || status === 'done' ? todayStr() : '')) + '"></div>' +
    '<div class="field"><label>Done on</label><input type="date" id="sm-done" value="' + esc(s.done_on || (status === 'done' ? todayStr() : '')) + '"></div>' +
    '</div>' +
    '<div class="o-2col">' +
    '<div class="field"><label>Karigar</label><select id="sm-karigar">' + kOpts + '</select></div>' +
    '<div class="field"><label>Weight after step (g)</label><input type="text" inputmode="decimal" id="sm-weight" value="' + (s.weight_g != null ? esc(String(num(s.weight_g))) : '') + '" placeholder="optional"></div>' +
    '</div>' +
    '<div class="field"><label>Note</label><input type="text" id="sm-note" value="' + esc(s.note || '') + '" placeholder="optional"></div>' +
    '<div class="modal-actions">' + (isNew ? '' : '<button class="btn btn-ghost" data-m="del" style="flex:0 0 auto">Delete</button>') +
    '<button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Save</button></div>');
  ov.querySelector('[data-m=no]').onclick = closeModal;
  const del = ov.querySelector('[data-m=del]');
  if (del) del.onclick = () => {
    closeModal();
    confirmModal('Delete this step?', s.name, 'Delete', async () => {
      const { error } = await db.from('order_steps').delete().eq('id', s.id);
      if (error) { toast('Could not delete — try again.', 'err'); return; }
      loadOrderSteps(O.order);
    }, true);
  };
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    const nameEl = $('#sm-name');
    const name = nameEl ? nameEl.value.trim() : s.name;
    if (!name) { toast('Type the step name.', 'err'); return; }
    const stv = $('#sm-status').value;
    const row = {
      name, status: stv,
      started_on: $('#sm-start').value || (stv === 'in_progress' || stv === 'done' ? todayStr() : null),
      done_on: stv === 'done' ? ($('#sm-done').value || todayStr()) : null,
      karigar_id: $('#sm-karigar').value || null,
      weight_g: numOrNull($('#sm-weight').value),
      note: $('#sm-note').value.trim() || null,
      done_by: stv === 'done' ? S.me.id : (s.done_by || null),
    };
    e.target.disabled = true;
    let error;
    if (isNew) ({ error } = await db.from('order_steps').insert(Object.assign({ order_id: O.order.id, sort: O.steps.length ? Math.max.apply(null, O.steps.map((x) => x.sort)) + 1 : 0 }, row)));
    else ({ error } = await db.from('order_steps').update(row).eq('id', s.id));
    if (error) { e.target.disabled = false; toast('Could not save — try again.', 'err'); return; }
    closeModal();
    if (!isNew && row.status === 'done' && s.status !== 'done') {
      await db.from('order_updates').insert({ order_id: O.order.id, note: 'Step done: ' + name + (row.weight_g != null ? ' (' + grams(row.weight_g) + ')' : ''), created_by: S.me.id });
    }
    toast(row.status === 'done' && s.status !== 'done' ? 'Step done ✓' : 'Saved ✓', 'ok');
    afterStepChange(s.status, row);
  };
}

async function quickBegin(id) {
  const st = S.osteps && S.osteps.steps.find((x) => x.id === id);
  if (!st) return;
  const { error } = await db.from('order_steps').update({ status: 'in_progress', started_on: todayStr() }).eq('id', id);
  if (error) { toast('Could not update — try again.', 'err'); return; }
  toast('Started: ' + st.name, 'ok');
  afterStepChange(st.status, Object.assign({}, st, { status: 'in_progress' }));
}

/* ---------------- job card PDF (travels with the piece in the workshop) ---------------- */
async function buildJobCardPdf(orderId) {
  const [or, ir, sr] = await Promise.all([
    db.from('orders').select('*, clients(trade_name, city)').eq('id', orderId).maybeSingle(),
    db.from('order_items').select('*').eq('order_id', orderId).order('sort', { ascending: true }),
    db.from('order_steps').select('*').eq('order_id', orderId).order('sort', { ascending: true }),
  ]);
  if (or.error || !or.data) throw new Error('order');
  const o = or.data, cl = o.clients || {}, items = ir.data || [], steps = sr.data || [];
  const meta = [['Order no.', ordNo(o.order_no)], ['Order date', pDate(o.order_date)]];
  if (o.due_date) meta.push(['Delivery by', pDate(o.due_date)]);
  meta.push(['Type', OTYPE_LABEL[o.order_type] || '']);
  const d = await pdfStart('JOB CARD', meta);
  pNote(d, 'CLIENT', [cl.trade_name, cl.city].filter(Boolean).join(', '));
  pNote(d, 'METAL', (o.metal || 'Gold') + (o.purity ? ' ' + pPurity(o.purity) : '') + (num(o.wastage_pct) ? '   |   Wastage ' + num(o.wastage_pct) + '%' : ''));
  pHeading(d, 'Items');
  const cols = [{ h: '#', w: 7 }, { h: 'Piece', w: 24 }, { h: 'Tag / design', w: 24 }, { h: 'Details', w: 0 }, { h: 'Qty', w: 10, a: 'right' },
    { h: 'Gross (g)', w: 18, a: 'right' }, { h: 'Net (g)', w: 18, a: 'right' }];
  cols[3].w = PG_W - PM * 2 - cols.reduce((a, x) => a + x.w, 0);
  d.table(cols, items.map((it, i) => [String(i + 1), it.category || '', it.design_code || '',
    [it.description, it.size ? 'Size ' + it.size : '', it.stone_details ? 'Stones: ' + it.stone_details : ''].concat(jewelPdfBits(it, o.metal)).filter(Boolean).join('; '),
    String(it.qty || 1), it.gross_wt != null ? pG(it.gross_wt) : '', it.net_wt != null ? pG(it.net_wt) : '']), { zebra: true });
  pHeading(d, 'Production steps');
  const scol = [{ h: '#', w: 7 }, { h: 'Step', w: 0 }, { h: 'Karigar', w: 30 }, { h: 'Started', w: 22 }, { h: 'Done', w: 22 }, { h: 'Weight (g)', w: 20, a: 'right' }, { h: 'Sign', w: 22 }];
  scol[1].w = PG_W - PM * 2 - scol.reduce((a, x) => a + x.w, 0);
  const list = steps.length ? steps : (stepTemplates()[0][1].map((n) => ({ name: n })));
  d.table(scol, list.map((st, i) => [String(i + 1), st.name + (st.status === 'skipped' ? ' (skipped)' : ''), st.karigar_id ? kName(st.karigar_id) : '',
    st.started_on ? fmtD(st.started_on) : '', st.done_on ? fmtD(st.done_on) : '', st.weight_g != null ? pG(st.weight_g) : '', '']), { zebra: true });
  pNote(d, 'NOTES', o.notes);
  const urls = await orderItemPhotoUrls(items);
  await pPhotos(d, items, urls);
  return { pdf: d, name: safeFileName(ordNo(o.order_no) + ' ' + (cl.trade_name || '') + ' - Job card') + '.pdf', text: 'Job card ' + ordNo(o.order_no) };
}

/* ---------------- the owner's step lists ---------------- */
function renderStepTemplates() {
  const c = $('#content');
  const list = stepTemplates().map((t) => [t[0], t[1].slice()]);
  S.stplEdit = list;
  const draw = () => {
    c.innerHTML = '<div class="notice">One step per line. These lists are offered when you start tracking an order; each order\'s steps can still be changed on its own.</div>' +
      S.stplEdit.map((t, i) => '<div class="card"><div class="field"><label>List name</label><input type="text" data-tn="' + i + '" value="' + esc(t[0]) + '"></div>' +
        '<div class="field" style="margin-bottom:6px"><label>Steps</label><textarea data-ts="' + i + '" style="min-height:150px">' + esc(t[1].join('\n')) + '</textarea></div>' +
        (S.stplEdit.length > 1 ? '<button class="btn btn-small btn-danger-ghost" data-action="stpl-del" data-i="' + i + '">Remove this list</button>' : '') + '</div>').join('') +
      '<button class="btn btn-secondary" data-action="stpl-add" style="margin-bottom:10px">＋ Add a list</button>' +
      '<button class="btn btn-primary" data-action="stpl-save" id="stpl-save">Save step lists</button>' +
      '<button class="btn btn-ghost" data-action="stpl-reset" style="margin-top:8px">Use the standard lists</button><div style="height:10px"></div>';
  };
  draw();
  S.stplDraw = draw;
}
function readStepTemplates() {
  S.stplEdit.forEach((t, i) => {
    const n = $('[data-tn="' + i + '"]'), s = $('[data-ts="' + i + '"]');
    if (n) t[0] = n.value.trim();
    if (s) t[1] = s.value.split('\n').map((x) => x.trim()).filter(Boolean);
  });
}
async function saveStepTemplates(list) {
  const clean = list.filter((t) => t[0] && t[1].length);
  if (!clean.length) { toast('Add at least one list with steps.', 'err'); return; }
  const { data, error } = await db.from('business_settings').update({ step_templates: clean, updated_by: S.me.id }).eq('id', 1).select('*');
  if (error || !data || !data.length) { toast('Could not save — only the owner can change these.', 'err'); return; }
  S.biz = data[0];
  toast('Step lists saved ✓', 'ok');
  backOne();
}

onAct('st-start', (el) => startSteps(el.dataset.tpl));
onAct('st-open', (el) => { const st = S.osteps && S.osteps.steps.find((x) => x.id === el.dataset.id); if (st) stepModal(st, 'edit'); });
onAct('st-begin', (el) => quickBegin(el.dataset.id));
onAct('st-done', (el) => { const st = S.osteps && S.osteps.steps.find((x) => x.id === el.dataset.id); if (st) stepModal(st, 'done'); });
onAct('st-add', () => stepModal(null, 'edit'));
onAct('st-jobcard', (el) => makeAndOfferPdf(() => buildJobCardPdf(el.dataset.id)));
onAct('stpl-open', () => showSub('Production steps', renderStepTemplates));
onAct('stpl-add', () => { readStepTemplates(); S.stplEdit.push(['New list', []]); S.stplDraw(); });
onAct('stpl-del', (el) => { readStepTemplates(); S.stplEdit.splice(+el.dataset.i, 1); S.stplDraw(); });
onAct('stpl-save', () => { readStepTemplates(); saveStepTemplates(S.stplEdit); });
onAct('stpl-reset', () => confirmModal('Use the standard lists?', 'Your own lists will be replaced by the standard ones.', 'Use standard', () => {
  S.stplEdit = STEP_TEMPLATES_DEFAULT.map((t) => [t[0], t[1].slice()]);
  S.stplDraw();
}));

/* owner backup (More → Export all data) */
async function exportStepsData(pName, today) {
  const [steps, orders] = await Promise.all([fetchAll('order_steps', 'created_at'), fetchAll('orders', 'created_at')]);
  const oNo = new Map(orders.map((o) => [o.id, ordNo(o.order_no)]));
  const kN = new Map((S.karigars || []).map((k) => [k.id, k.name]));
  steps.sort((a, b) => (a.order_id === b.order_id ? a.sort - b.sort : (oNo.get(a.order_id) || '') < (oNo.get(b.order_id) || '') ? -1 : 1));
  await new Promise((r) => setTimeout(r, 450));
  downloadFile('bj-production-steps-' + today + '.csv', buildCsv(
    ['Order no', '#', 'Step', 'Status', 'Started on', 'Done on', 'Karigar', 'Weight after step (g)', 'Note', 'Done by'],
    steps.map((st) => [oNo.get(st.order_id) || '', st.sort + 1, st.name, STEP_STATUS_LABEL[st.status] || st.status, st.started_on || '', st.done_on || '',
      kN.get(st.karigar_id) || '', st.weight_g, st.note, pName.get(st.done_by) || ''])));
}

/* ---------------- current step for the orders list ---------------- */
async function loadStepInfo(orderIds) {
  const m = new Map();
  if (!orderIds.length) return m;
  const { data } = await db.from('order_steps').select('order_id, name, status, sort').in('order_id', orderIds).order('sort', { ascending: true });
  const by = new Map();
  (data || []).forEach((r) => { if (!by.has(r.order_id)) by.set(r.order_id, []); by.get(r.order_id).push(r); });
  by.forEach((steps, id) => {
    const cur = currentStep(steps);
    m.set(id, { done: stepsDone(steps), total: stepsCounted(steps), cur: cur ? cur.name : null });
  });
  return m;
}
