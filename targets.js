/* ============================================================
   MONTHLY TARGETS — the owner sets meetings / new clients /
   orders per person per month; everyone sees their own progress
   on the Today screen, the owner sees all in Report.
   Order counts leave out quotations and cancelled orders.
   ============================================================ */
'use strict';

const TG_FIELDS = [
  ['meetings', 'Meetings', false],
  ['new_clients', 'New clients', false],
  ['orders', 'Orders', false],
];

/* how far through the month we are (1 for past months) */
function monthPace(ms) {
  const cur = monthStart();
  if (ms < cur) return 1;
  if (ms > cur) return 0;
  return new Date().getDate() / daysInMonth(ms);
}

async function monthActuals(ms) {
  const next = addMonths(ms, 1);
  const s = dayStartISO(ms), e = dayStartISO(next);
  const [ir, cr, or] = await Promise.all([
    db.from('interactions').select('exec_id').gte('happened_at', s).lt('happened_at', e).limit(20000),
    db.from('clients').select('created_by').gte('created_at', s).lt('created_at', e).limit(20000),
    db.from('orders').select('created_by, status').gte('order_date', ms).lt('order_date', next).limit(20000),
  ]);
  const a = new Map();
  const get = (id) => { if (!a.has(id)) a.set(id, { meetings: 0, new_clients: 0, orders: 0 }); return a.get(id); };
  (ir.data || []).forEach((r) => { if (r.exec_id) get(r.exec_id).meetings++; });
  (cr.data || []).forEach((r) => { if (r.created_by) get(r.created_by).new_clients++; });
  (or.data || []).forEach((r) => {
    if (!r.created_by || r.status === 'quote' || r.status === 'cancelled') return;
    get(r.created_by).orders++;
  });
  return a;
}

function targetBarsHTML(t, act, ms) {
  const pace = monthPace(ms);
  const rows = TG_FIELDS.filter((f) => t && num(t[f[0]]) > 0).map((f) =>
    progressHTML(f[1], act ? act[f[0]] : 0, t[f[0]], null, pace));
  return rows.join('');
}

/* ---------------- Report: everyone's targets (owner) ---------------- */
async function renderTargetsSection(el) {
  if (!el) return;
  S.tgMonth = S.tgMonth || monthStart();
  const ms = S.tgMonth;
  el.innerHTML = '<div class="section-label">Targets</div>' + loadingHTML();
  const [tr, act] = await Promise.all([db.from('targets').select('*').eq('month', ms), monthActuals(ms)]);
  if (!$('#report-targets')) return;
  const tmap = new Map((tr.data || []).map((t) => [t.exec_id, t]));
  const people = Array.from(S.team.values()).filter((p) => p.active)
    .sort((a, b) => (a.role === 'owner') - (b.role === 'owner') || String(a.full_name).localeCompare(String(b.full_name)));
  const pace = monthPace(ms);
  el.innerHTML =
    '<div class="section-label sl-row"><span>Targets</span><span class="tg-month">' +
    '<button data-action="tg-month" data-d="-1" aria-label="Previous month">‹</button><b>' + esc(monthLabel(ms)) + '</b>' +
    '<button data-action="tg-month" data-d="1" aria-label="Next month"' + (ms >= addMonths(monthStart(), 1) ? ' disabled' : '') + '>›</button></span></div>' +
    (ms === monthStart() ? '<div class="hint" style="margin:-4px 2px 8px">' + Math.round(pace * 100) + '% of the month gone — bars turn amber when someone is behind that pace.</div>' : '') +
    people.map((p) => {
      const t = tmap.get(p.id), a = act.get(p.id) || { meetings: 0, new_clients: 0, orders: 0 };
      return '<div class="card tg-card"><div class="tg-head"><b>' + esc(p.full_name || p.email || '—') + '</b>' +
        '<button class="btn btn-small btn-ghost" data-action="tg-set" data-id="' + p.id + '">' + (t ? 'Change' : 'Set targets') + '</button></div>' +
        (t && TG_FIELDS.some((f) => num(t[f[0]]) > 0) ? targetBarsHTML(t, a, ms) : '<div class="tg-none">No targets · ' + a.meetings + ' meetings, ' + a.new_clients + ' new clients, ' + a.orders + ' orders</div>') +
        '</div>';
    }).join('');
}

function openTargetModal(execId) {
  const ms = S.tgMonth || monthStart();
  const p = S.team.get(execId) || {};
  db.from('targets').select('*').eq('exec_id', execId).in('month', [ms, addMonths(ms, -1)]).then(({ data }) => {
    const cur = (data || []).find((t) => t.month === ms) || {};
    const prev = (data || []).find((t) => t.month === addMonths(ms, -1)) || null;
    const ov = openModal('<h3>Targets — ' + esc(p.full_name || '') + '</h3><p>' + esc(monthLabel(ms)) + '. Leave a box empty to skip it.</p>' +
      '<div class="o-2col">' +
      TG_FIELDS.map((f) => '<div class="field"><label>' + esc(f[1]) + '</label><input type="text" inputmode="numeric" id="tg-' + f[0] + '" value="' +
        (cur[f[0]] != null ? esc(String(num(cur[f[0]]))) : '') + '"></div>').join('') +
      '</div>' +
      (prev ? '<button class="btn btn-small btn-secondary" data-m="prev" style="margin:-4px 0 14px">Same as last month</button>' : '') +
      '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Save</button></div>');
    ov.querySelector('[data-m=no]').onclick = closeModal;
    if (prev) ov.querySelector('[data-m=prev]').onclick = () => {
      TG_FIELDS.forEach((f) => { $('#tg-' + f[0]).value = prev[f[0]] != null ? String(num(prev[f[0]])) : ''; });
    };
    ov.querySelector('[data-m=yes]').onclick = async (e) => {
      const row = { exec_id: execId, month: ms, set_by: S.me.id };
      TG_FIELDS.forEach((f) => { const v = numOrNull($('#tg-' + f[0]).value); row[f[0]] = v == null ? null : Math.round(v); });
      e.target.disabled = true;
      const { error } = await db.from('targets').upsert(row, { onConflict: 'exec_id,month' });
      if (error) { e.target.disabled = false; toast('Could not save — only the owner can set targets.', 'err'); return; }
      closeModal();
      toast('Targets saved ✓', 'ok');
      renderTargetsSection($('#report-targets'));
    };
  });
}

/* ---------------- Today: my month ---------------- */
async function renderMyTargets(el) {
  if (!el) return;
  const ms = monthStart();
  const { data } = await db.from('targets').select('*').eq('exec_id', S.me.id).eq('month', ms).maybeSingle();
  if (!data || !TG_FIELDS.some((f) => num(data[f[0]]) > 0)) { el.innerHTML = ''; return; }
  const act = (await monthActuals(ms)).get(S.me.id);
  if (!$('#today-targets')) return;
  el.innerHTML = '<div class="card tg-card"><div class="tg-head"><b>My targets · ' + esc(monthLabel(ms)) + '</b>' +
    '<span class="tg-days">' + (daysInMonth(ms) - new Date().getDate()) + ' days left</span></div>' + targetBarsHTML(data, act, ms) + '</div>';
}

onAct('tg-month', (el) => { S.tgMonth = addMonths(S.tgMonth || monthStart(), +el.dataset.d); renderTargetsSection($('#report-targets')); });
onAct('tg-set', (el) => openTargetModal(el.dataset.id));
