/* ============================================================
   GOLD (database update 19)
   · Today's gold rate — the owner sets the 24K rate each morning
     (22K / 18K / 14K follow); every new bill and quotation starts
     from it. Shown on the Today screen.
   · Stock value — the pieces we own (in stock, kept for orders, on
     approval) at today's rate: gold, diamonds at cost, making. PDF.
   · The gold register — where all the fine gold is: raw gold with us
     (the owner's own entries + raw gold from shops − gold given to
     karigars), with karigars, in ready stock, on approval, owed by
     shops. Stock value and the register are for the owner only.
   ============================================================ */
'use strict';

function goldOn() { return !!S.dbv19 && typeof billsOn === 'function' && billsOn(); }
const KARATS = [['22K', 0.916, 'r22'], ['18K', 0.75, 'r18'], ['14K', 0.585, 'r14']];
function rsWhole(n) { return '₹ ' + Math.round(num(n)).toLocaleString('en-IN'); }

/* ---------------- today's rate ---------------- */
async function loadTodayRate(force) {
  if (!goldOn()) return null;
  if (!force && S.rateDay === todayStr() && S.rateLoaded) return S.rateToday;
  const { data, error } = await db.from('gold_rates').select('*').order('rate_date', { ascending: false }).limit(2);
  if (error) return S.rateToday || null;
  S.rateDay = todayStr(); S.rateLoaded = true;
  S.rateLast = (data || []).find((r) => num(r.r24) > 0) || null;
  S.rateToday = S.rateLast && S.rateLast.rate_date === todayStr() ? S.rateLast : null;
  return S.rateToday;
}
function rateLine(r) {
  return [['24K', r.r24]].concat(KARATS.slice(0, 2).map((k) => [k[0], r[k[2]]])).filter((x) => num(x[1]) > 0).map((x) => x[0] + ' ' + rsWhole(x[1]))
    .concat(num(r.silver) ? ['Silver ' + rsWhole(r.silver)] : []).join(' · ');
}
async function renderTodayRate(el) {
  if (!el) return;
  if (!goldOn()) { el.innerHTML = ''; return; }
  const t = await loadTodayRate(true);
  const r = t || S.rateLast, owner = isOwner();
  if (!$('#today-rate')) return;
  if (!r && !owner) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="card gr-card' + (t ? '' : ' old') + '"' + (owner ? ' data-action="gr-set" role="button"' : '') + '>' +
    '<div class="gr-h"><span>🪙 ' + esc(t ? 'Today\'s gold rate (per g)' : r ? 'Gold rate of ' + fmtD(r.rate_date) + ' (per g)' : 'Today\'s gold rate') + '</span>' +
    (owner ? '<b>' + esc(t ? 'Change' : 'Set today\'s rate') + ' ›</b>' : '') + '</div>' +
    (r ? '<div class="gr-v">' + esc(rateLine(r)) + '</div>' : '<div class="gr-v muted">' + esc('Not set yet — bills use the rate you type') + '</div>') + '</div>';
}
function rateModal() {
  if (!isOwner()) return;
  const cur = S.rateToday || {}, last = S.rateLast || {};
  const ov = openModal('<h3>Today\'s gold rate</h3><p>' + esc(fmtD(todayStr())) + ' — per gram. New bills and quotations start from it.</p>' +
    '<div class="field"><label>Gold 24K (₹ per g)</label><input type="text" inputmode="decimal" id="gr-24" value="' + esc(cur.r24 != null ? String(num(cur.r24)) : '') +
    '" placeholder="' + esc(last.r24 ? String(num(last.r24)) : 'e.g. 13250') + '"></div>' +
    '<div class="hint" id="gr-k" style="margin:-6px 0 12px"></div>' +
    '<div class="field"><label>Silver (₹ per g, optional)</label><input type="text" inputmode="decimal" id="gr-ag" value="' + esc(cur.silver != null ? String(num(cur.silver)) : '') +
    '" placeholder="' + esc(last.silver ? String(num(last.silver)) : '') + '"></div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Save</button></div>');
  const show = () => {
    const v = num($('#gr-24').value);
    const k = $('#gr-k');
    if (!k) return;
    k.textContent = v >= 50000 ? '⚠ That looks like the rate for 10 g — write the rate for 1 g.'
      : v > 0 ? KARATS.map((x) => x[0] + ' ' + rsWhole(v * x[1])).join(' · ') : '';
  };
  $('#gr-24').addEventListener('input', show);
  show();
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    const v = numOrNull($('#gr-24').value), ag = numOrNull($('#gr-ag').value);
    if (v == null || v <= 0 || v >= 1000000) { toast('Write the 24K rate for 1 g.', 'err'); return; }
    if (ag != null && (ag <= 0 || ag >= 100000)) { toast('Write the silver rate for 1 g.', 'err'); return; }
    const r2 = (x) => Math.round(x * 100) / 100;
    const row = { rate_date: todayStr(), r24: r2(v), silver: ag == null ? null : r2(ag), set_by: S.me.id };
    KARATS.forEach((k) => { row[k[2]] = Math.round(v * k[1]); });
    e.target.disabled = true;
    const { error } = await db.from('gold_rates').upsert(row, { onConflict: 'rate_date' });
    if (error) { e.target.disabled = false; toast('Could not save — only the owner sets the rate.', 'err'); return; }
    closeModal();
    toast('Gold rate saved ✓', 'ok');
    S.rateLoaded = false;
    renderTodayRate($('#today-rate'));
  };
}

/* ---------------- what the stock is worth (owner) ---------------- */
function svDefaults() { try { return JSON.parse(localStorage.getItem('stockValueRates') || '{}') || {}; } catch (e) { return {}; } }
function svSaveDefaults(v) { try { localStorage.setItem('stockValueRates', JSON.stringify(v)); } catch (e) { /* private mode */ } }
async function stockValueData() {
  await loadTodayRate();
  const [ps, cs] = await Promise.all([
    db.from('catalogue_items').select('id, tag_no, design_no, category, metal, purity, net_wt, gross_wt, diamond_ct, cs_ct, status').in('status', ['available', 'reserved', 'approval']).limit(5000),
    db.from('catalogue_costs').select('*').limit(5000),
  ]);
  const costs = new Map((cs.data || []).map((c) => [c.catalogue_id, c]));
  const r = S.rateToday || S.rateLast || {};
  const D = svDefaults();
  const dDia = num(D.dia), dCs = num(D.cs);
  const rows = (ps.data || []).map((p) => {
    const c = costs.get(p.id) || {};
    const silver = p.metal === 'Silver';
    const fine = num(p.net_wt) * (p.purity != null ? num(p.purity) : 0) / 100;
    const gold = fine * (silver ? num(r.silver) : num(r.r24));
    const dia = num(p.diamond_ct) * (c.dia_cost_rate != null ? num(c.dia_cost_rate) : dDia);
    const csv = num(p.cs_ct) * (c.cs_cost_rate != null ? num(c.cs_cost_rate) : dCs);
    const mk = num(c.making_cost) + num(c.other_cost);
    return { p, silver, fine, gold, dia, cs: csv, mk, total: gold + dia + csv + mk, noCost: c.dia_cost_rate == null && num(p.diamond_ct) > 0 };
  });
  return { rows, rate: r, dDia, dCs };
}
async function renderStockValue() {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const V = await stockValueData();
  S.sv = V;
  const sum = (f, rs) => (rs || V.rows).reduce((s, x) => s + f(x), 0);
  const gold = V.rows.filter((x) => !x.silver);
  const by = new Map();
  V.rows.forEach((x) => { const k = x.p.category || 'Other'; const a = by.get(k) || []; a.push(x); by.set(k, a); });
  const st = [['available', 'In stock'], ['reserved', 'Reserved'], ['approval', 'On approval']];
  const miss = V.rows.filter((x) => x.noCost).length;
  c.innerHTML = '<div class="notice">' + esc(V.rate.r24 ? 'Gold at ' + rsWhole(V.rate.r24) + ' per g (24K, ' + fmtD(V.rate.rate_date) + ')' : 'Set today\'s gold rate first — gold is valued at it') + '</div>' +
    '<div class="st-tot"><div><b>' + V.rows.length + '</b><span>Pieces</span></div><div><b>' + grams(Math.round(sum((x) => x.fine, gold) * 1000) / 1000) + '</b><span>Fine gold</span></div>' +
    '<div><b>' + rsWhole(sum((x) => x.total)) + '</b><span>Value</span></div></div>' +
    '<div class="card bf-total">' +
    [['Gold', sum((x) => x.gold)], ['Diamonds (at cost)', sum((x) => x.dia)], ['Colour stones (at cost)', sum((x) => x.cs)], ['Making', sum((x) => x.mk)]]
      .filter((x) => x[1] > 0).map((x) => '<div class="bf-row"><span>' + esc(x[0]) + '</span><b>' + rsWhole(x[1]) + '</b></div>').join('') +
    '<div class="bf-row tot"><span>Total</span><b>' + rsWhole(sum((x) => x.total)) + '</b></div></div>' +
    '<div class="section-label">Where</div><div class="card bf-total">' +
    st.map((s) => { const rs = V.rows.filter((x) => x.p.status === s[0]); return rs.length ? '<div class="bf-row"><span>' + esc(s[1] + ' · ' + rs.length) + '</span><b>' + rsWhole(sum((x) => x.total, rs)) + '</b></div>' : ''; }).join('') + '</div>' +
    '<div class="section-label">By kind</div><div class="card bf-total">' +
    Array.from(by.entries()).sort((a, b) => sum((x) => x.total, b[1]) - sum((x) => x.total, a[1]))
      .map((e) => '<div class="bf-row"><span>' + esc(e[0] + ' · ' + e[1].length) + '</span><b>' + rsWhole(sum((x) => x.total, e[1])) + '</b></div>').join('') + '</div>' +
    '<div class="section-label">Diamond cost when a piece has none</div><div class="card">' +
    '<div class="o-2col"><div class="field"><label>Diamonds (₹ per ct)</label><input type="text" inputmode="decimal" id="sv-dia" value="' + esc(V.dDia ? String(V.dDia) : '') + '"></div>' +
    '<div class="field"><label>Colour stones (₹ per ct)</label><input type="text" inputmode="decimal" id="sv-cs" value="' + esc(V.dCs ? String(V.dCs) : '') + '"></div></div>' +
    (miss ? '<div class="hint">' + esc(miss === 1 ? '1 piece has no diamond cost of its own' : miss + ' pieces have no diamond cost of their own') + '</div>' : '') + '</div>' +
    '<div class="action-row"><button class="btn btn-primary" data-action="sv-pdf">Stock value (PDF)</button></div>';
  const save = () => { svSaveDefaults({ dia: numOrNull($('#sv-dia').value), cs: numOrNull($('#sv-cs').value) }); renderStockValue(); };
  ['#sv-dia', '#sv-cs'].forEach((s) => $(s).addEventListener('change', save));
}
async function buildStockValuePdf() {
  const V = S.sv || await stockValueData();
  const d = await pdfStart('STOCK VALUATION', [['Date', pDate(todayStr())], ['Gold 24K', V.rate.r24 ? 'Rs. ' + num(V.rate.r24).toLocaleString('en-IN') + '/g' : '-']], '');
  const m0 = (x) => Math.round(num(x)).toLocaleString('en-IN');
  const cols = [{ h: '#', w: 7 }, { h: 'Piece', w: 0 }, { h: 'Net g', w: 17, a: 'right' }, { h: 'Fine g', w: 17, a: 'right' }, { h: 'Dia ct', w: 15, a: 'right' },
    { h: 'Gold Rs.', w: 22, a: 'right' }, { h: 'Stones Rs.', w: 22, a: 'right' }, { h: 'Making Rs.', w: 20, a: 'right' }, { h: 'Value Rs.', w: 24, a: 'right' }];
  cols[1].w = PG_W - PM * 2 - cols.reduce((a, x) => a + x.w, 0);
  const rows = V.rows.map((x, i) => [String(i + 1), [x.p.category, x.p.tag_no, x.p.design_no].filter(Boolean).join(' ') + (x.p.status !== 'available' ? ' (' + (x.p.status === 'approval' ? 'on approval' : 'reserved') + ')' : ''),
    x.p.net_wt != null ? pG(x.p.net_wt) : '', pG(x.fine), num(x.p.diamond_ct) ? num(x.p.diamond_ct).toFixed(3) : '', m0(x.gold), m0(x.dia + x.cs), m0(x.mk), m0(x.total)]);
  const t = (f) => V.rows.reduce((s, x) => s + f(x), 0);
  const tot = ['', 'Total (' + V.rows.length + ')', pG(t((x) => num(x.p.net_wt))), pG(t((x) => x.fine)), t((x) => num(x.p.diamond_ct)).toFixed(3), m0(t((x) => x.gold)), m0(t((x) => x.dia + x.cs)), m0(t((x) => x.mk)), m0(t((x) => x.total))];
  tot.bold = true;
  rows.push(tot);
  d.table(cols, rows, { size: 7.4 });
  pNote(d, '', 'Gold valued at the 24K rate on its fine content (net weight x purity). Diamonds and colour stones at their cost' +
    (V.dDia ? ' (Rs. ' + V.dDia.toLocaleString('en-IN') + '/ct where a piece has none)' : '') + '. Making as paid.');
  return { pdf: d, name: safeFileName('Stock value ' + todayStr()) + '.pdf', text: 'Stock value ' + fmtD(todayStr()) };
}

/* ---------------- the gold register (owner) ---------------- */
const GE_KIND = { opening: 'Opening balance', in: 'Gold in', out: 'Gold out' };
async function renderGoldRegister() {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const [en, rc, kt, ps, du, kg] = await Promise.all([
    db.from('gold_entries').select('*').order('entry_date', { ascending: false }).order('created_at', { ascending: false }).limit(2000),
    db.from('receipts').select('id, client_id, received_on, metal_g, metal_purity, fine_g, kind, clients(trade_name)').eq('kind', 'metal').order('received_on', { ascending: false }).limit(3000),
    db.from('karigar_txns').select('id, karigar_id, txn_date, kind, metal, weight_g, purity, fine_g').in('kind', ['issue', 'receive', 'wastage']).order('txn_date', { ascending: false }).limit(5000),
    db.from('catalogue_items').select('metal, purity, net_wt, status').in('status', ['available', 'reserved', 'approval']).limit(5000),
    db.rpc('party_dues'),
    db.from('karigars').select('id, name').limit(1000),
  ]);
  const kn = new Map((kg.data || []).map((k) => [k.id, k.name]));
  const isG = (m) => (m || 'Gold') !== 'Silver';
  const mv = [];
  (en.data || []).forEach((e) => { if (isG(e.metal)) mv.push({ d: e.entry_date, t: GE_KIND[e.kind] + (e.note ? ' — ' + e.note : ''), f: (e.kind === 'out' ? -1 : 1) * num(e.fine_g), id: e.id, w: e.weight_g, p: e.purity }); });
  (rc.data || []).forEach((r) => mv.push({ d: r.received_on, t: 'Raw gold from ' + ((r.clients || {}).trade_name || 'a shop'), f: num(r.fine_g), w: r.metal_g, p: r.metal_purity }));
  (kt.data || []).filter((t) => t.kind === 'issue' && isG(t.metal)).forEach((t) => mv.push({ d: t.txn_date, t: 'Given to ' + (kn.get(t.karigar_id) || 'a karigar'), f: -num(t.fine_g), w: t.weight_g, p: t.purity }));
  mv.sort((a, b) => String(b.d).localeCompare(String(a.d)));
  const raw = mv.reduce((s, x) => s + x.f, 0);
  const withK = (kt.data || []).filter((t) => isG(t.metal)).reduce((s, t) => s + (t.kind === 'issue' ? 1 : -1) * num(t.fine_g), 0);
  const fine = (st) => (ps.data || []).filter((p) => isG(p.metal) && st.indexOf(p.status) > -1).reduce((s, p) => s + num(p.net_wt) * num(p.purity) / 100, 0);
  const inStock = fine(['available', 'reserved']), onAppr = fine(['approval']);
  const owed = (du.data || []).reduce((s, x) => s + Math.max(0, num(x.gold_due)), 0);
  const g3 = (x) => grams(Math.round(x * 1000) / 1000);
  const row = (k, v, cls) => '<div class="bf-row' + (cls ? ' ' + cls : '') + '"><span>' + esc(k) + '</span><b>' + esc(v) + '</b></div>';
  c.innerHTML = '<div class="notice">Fine gold (24K) — where it all is today.</div>' +
    '<div class="card bf-total">' + row('Raw gold with us', g3(raw)) + row('With karigars', g3(withK)) + row('In ready stock', g3(inStock)) + row('On approval with shops', g3(onAppr)) +
    row('Ours in all', g3(raw + withK + inStock + onAppr), 'tot gold') + (owed > 0.0005 ? row('Shops still owe (raw gold on bills)', g3(owed)) : '') + '</div>' +
    '<div class="action-row"><button class="btn btn-primary" data-action="ge-new">＋ Entry</button></div>' +
    '<div class="hint" style="margin:-4px 2px 10px">Raw gold from shops and gold given to karigars come in by themselves. Add your opening balance, and gold bought, sold or melted.</div>' +
    '<div class="section-label">Raw gold in and out</div>' +
    (mv.length ? mv.slice(0, 200).map((x) => '<div class="card rc-item"><div><b>' + esc((x.f >= 0 ? '+ ' : '− ') + g3(Math.abs(x.f))) + '</b> · ' + esc(x.t) +
      '<div class="rc-sub">' + esc(fmtD(x.d) + (x.w != null && x.p != null ? ' · ' + grams(x.w) + ' · ' + num(x.p) + '%' : '')) + '</div></div>' +
      (x.id ? '<button class="btn btn-small btn-ghost" data-action="ge-del" data-id="' + x.id + '" aria-label="Remove">✕</button>' : '') + '</div>').join('')
      : '<div class="empty">Nothing yet — add your opening balance.</div>');
}
function goldEntryModal() {
  let kind = 'opening';
  const ov = openModal('<h3>Gold register</h3>' +
    '<div class="field"><label>What</label><div class="seg" id="ge-k">' + [['opening', 'Opening balance'], ['in', 'Gold in'], ['out', 'Gold out']].map((x, i) =>
      '<button type="button" data-v="' + x[0] + '" class="' + (i ? '' : 'on') + '">' + esc(x[1]) + '</button>').join('') + '</div></div>' +
    '<div class="o-2col"><div class="field"><label>Weight (g)</label><input type="text" inputmode="decimal" id="ge-w"></div>' +
    '<div class="field"><label>Purity (%)</label><input type="text" inputmode="decimal" id="ge-p" value="99.5"></div></div>' +
    '<div class="hint" id="ge-f" style="margin:-6px 0 12px"></div>' +
    '<div class="field"><label>Date</label><input type="date" id="ge-d" value="' + todayStr() + '"></div>' +
    '<div class="field"><label>Note</label><input type="text" id="ge-n" placeholder="e.g. Bought from bullion dealer" autocomplete="off"></div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Save</button></div>');
  ov.querySelectorAll('#ge-k button').forEach((b) => { b.onclick = () => { kind = b.dataset.v; ov.querySelectorAll('#ge-k button').forEach((x) => x.classList.toggle('on', x === b)); }; });
  const fine = () => { const w = num($('#ge-w').value), p = num($('#ge-p').value); $('#ge-f').textContent = w > 0 && p > 0 && p <= 100 ? '= ' + grams(Math.round(w * p * 10) / 1000) + ' fine' : ''; };
  ['#ge-w', '#ge-p'].forEach((s) => $(s).addEventListener('input', fine));
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    const w = numOrNull($('#ge-w').value), p = numOrNull($('#ge-p').value);
    if (w == null || w <= 0) { toast('Write the weight.', 'err'); return; }
    if (p == null || p <= 0 || p > 100) { toast('Purity must be 1 – 100 %', 'err'); return; }
    e.target.disabled = true;
    const { error } = await db.from('gold_entries').insert({ kind, metal: 'Gold', weight_g: Math.round(w * 1000) / 1000, purity: Math.round(p * 1000) / 1000,
      entry_date: $('#ge-d').value || todayStr(), note: $('#ge-n').value.trim() || null, created_by: S.me.id });
    if (error) { e.target.disabled = false; toast('Could not save — try again.', 'err'); return; }
    closeModal();
    toast('Saved ✓', 'ok');
    renderGoldRegister();
  };
}

onAct('gr-set', () => rateModal());
onAct('sv-open', () => showSub('Stock value', renderStockValue));
onAct('sv-pdf', () => makeAndOfferPdf(buildStockValuePdf));
onAct('ge-open', () => showSub('Gold register', renderGoldRegister));
onAct('ge-new', () => goldEntryModal());
onAct('ge-del', (el) => confirmModal('Remove this entry?', 'It comes out of the gold register.', 'Remove', async () => {
  const { error } = await db.from('gold_entries').delete().eq('id', el.dataset.id);
  if (error) { toast('Could not remove — try again.', 'err'); return; }
  toast('Removed', 'ok');
  renderGoldRegister();
}, true));
