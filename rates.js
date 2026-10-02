/* ============================================================
   TODAY'S GOLD RATE — the owner sets it once a day; new orders,
   catalogue prices and quotations pick it up automatically.
   ============================================================ */
'use strict';

const RATE_FIELDS = [
  ['r24', '24K', 'Gold 24K (995)'],
  ['r22', '22K', 'Gold 22K (916)'],
  ['r18', '18K', 'Gold 18K (750)'],
  ['r14', '14K', 'Gold 14K (585)'],
  ['silver', 'Silver', 'Silver (999 fine)'],
];

/* the latest rate on or before today */
async function loadRate() {
  const { data, error } = await db.from('gold_rates').select('*').lte('rate_date', todayStr())
    .order('rate_date', { ascending: false }).limit(1);
  S.rate = (!error && data && data[0]) || null;
  return S.rate;
}
function rateIsToday() { return !!(S.rate && S.rate.rate_date === todayStr()); }

/* ₹ per gram for a metal + purity, from the latest rate (null if not known) */
function rateFor(metal, purity) {
  const r = S.rate;
  if (!r) return null;
  if (metal === 'Silver') {   // the silver rate is for fine (999) silver; 925 etc. pay for their silver content
    const s = num(r.silver), p = num(purity);
    return s ? (p > 0 && p < 99.9 ? Math.round(s * p / 99.9 * 100) / 100 : s) : null;
  }
  const map = { '24K': 'r24', '22K': 'r22', '18K': 'r18', '14K': 'r14' };
  const k = purityKey(purity);
  let v = k && map[k] ? num(r[map[k]]) : 0;
  if (!v && num(r.r24) && num(purity)) v = Math.round(num(r.r24) * num(purity) / 99.5);   // worked out from 24K
  return v || null;
}
function rateDateLabel() {
  if (!S.rate) return '';
  return rateIsToday() ? 'today' : fmtD(S.rate.rate_date);
}

/* ---------------- Today screen card ---------------- */
async function renderTodayRate(el) {
  if (!el) return;
  await loadRate();
  if (!$('#today-rate')) return;
  const r = S.rate;
  if (!r) {
    el.innerHTML = isOwner()
      ? '<button class="card rate-card rate-empty" data-action="rate-edit"><b>Set today\'s gold rate</b><span>New orders and catalogue prices will use it.</span></button>'
      : '';
    return;
  }
  const cells = RATE_FIELDS.filter((f) => num(r[f[0]])).map((f) =>
    '<div><span>' + esc(f[1]) + '</span><b>' + inr(r[f[0]]) + '</b></div>').join('');
  el.innerHTML =
    '<div class="card rate-card">' +
    '<div class="rate-top"><div><div class="rate-title">Gold rate <span class="rate-unit">₹ / gram</span></div>' +
    '<div class="rate-date' + (rateIsToday() ? '' : ' stale') + '">' + (rateIsToday() ? 'Today · ' + esc(fmtD(r.rate_date)) : 'Last set ' + esc(fmtD(r.rate_date)) + (isOwner() ? ' — not updated today' : '')) + '</div></div>' +
    (isOwner() ? '<button class="btn btn-small ' + (rateIsToday() ? 'btn-ghost' : 'btn-primary') + '" data-action="rate-edit">' + (rateIsToday() ? 'Update' : 'Set today') + '</button>' : '') +
    '</div>' +
    '<div class="rate-grid">' + (cells || '<div><span>—</span><b>—</b></div>') + '</div>' +
    '</div>';
}

/* ---------------- set / update (owner) ---------------- */
function openRateModal() {
  if (!isOwner()) { toast('Only the owner can set the gold rate.', 'err'); return; }
  const base = S.rate || {};
  const ov = openModal(
    '<h3>Gold rate for today</h3><p>' + esc(fmtDLong(todayStr())) + ' · ₹ per gram. Leave a box empty if you don\'t deal in it.</p>' +
    '<div class="o-2col">' +
    RATE_FIELDS.map((f) => '<div class="field"><label>' + esc(f[2]) + '</label><input type="text" inputmode="decimal" id="rt-' + f[0] + '" value="' +
      (num(base[f[0]]) ? esc(String(num(base[f[0]]))) : '') + '" placeholder="₹ / g"></div>').join('') +
    '</div>' +
    '<button class="btn btn-small btn-secondary" data-m="fill" style="margin:-4px 0 14px">Fill 22K / 18K / 14K from 24K</button>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Save rate</button></div>');
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=fill]').onclick = () => {
    const r24 = num($('#rt-r24').value);
    if (!r24) { toast('Type the 24K rate first.', 'err'); return; }
    $('#rt-r22').value = Math.round(r24 * 91.6 / 99.5);
    $('#rt-r18').value = Math.round(r24 * 75 / 99.5);
    $('#rt-r14').value = Math.round(r24 * 58.5 / 99.5);
  };
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    const row = { rate_date: todayStr(), set_by: S.me.id };
    RATE_FIELDS.forEach((f) => { row[f[0]] = numOrNull($('#rt-' + f[0]).value); });
    if (!RATE_FIELDS.some((f) => row[f[0]])) { toast('Type at least one rate.', 'err'); return; }
    e.target.disabled = true;
    const { error } = await db.from('gold_rates').upsert(row, { onConflict: 'rate_date' });
    if (error) { e.target.disabled = false; toast('Could not save — try again.', 'err'); return; }
    closeModal();
    toast('Gold rate saved ✓', 'ok');
    await loadRate();
    const el = $('#today-rate');
    if (el) renderTodayRate(el);
    if ($('#rate-history')) renderRateHistory();
  };
}

/* ---------------- history ---------------- */
async function renderRateHistory() {
  const c = $('#content');
  c.innerHTML = (isOwner() ? '<button class="btn btn-primary" data-action="rate-edit" style="margin-bottom:12px">Set today\'s rate</button>' : '') +
    '<div id="rate-history">' + loadingHTML() + '</div>';
  const { data, error } = await db.from('gold_rates').select('*').order('rate_date', { ascending: false }).limit(90);
  const box = $('#rate-history');
  if (!box) return;
  if (error) { box.innerHTML = '<div class="empty">Could not load rates.</div>'; return; }
  if (!data || !data.length) { box.innerHTML = '<div class="empty"><div class="big">🪙</div>No gold rate saved yet.</div>'; return; }
  box.innerHTML = '<div class="card" style="padding:6px 14px">' + data.map((r) =>
    '<div class="rh-row"><div class="rh-date">' + esc(fmtDLong(r.rate_date)) + '</div><div class="rh-vals">' +
    RATE_FIELDS.filter((f) => num(r[f[0]])).map((f) => '<span>' + esc(f[1]) + ' <b>' + inr(r[f[0]]) + '</b></span>').join('') +
    '</div></div>').join('') + '</div>';
}

onAct('rate-edit', () => openRateModal());
onAct('rate-history', () => showSub('Gold rate history', renderRateHistory));

window.LOGIN_HOOKS.push(loadRate);
