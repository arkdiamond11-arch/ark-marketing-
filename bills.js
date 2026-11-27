/* ============================================================
   READY-STOCK BILLS  (database update 18)
   Pieces from the stock (scan the tag or pick them) →
   · a SALE BILL (INV-0001) — the pieces are sold,
   · a QUOTATION (QT-0001) — they stay in stock, one tap makes the sale,
   · or ON APPROVAL for a few days — an approval memo; the pieces go
     with the shop and come back to stock when returned.
   Rates: gold (24K, per gram) with wastage, diamonds per carat (each
   piece can have its own), colour stones, labour (per gram or per
   piece), extra charges, discount, GST. The gold can be paid in money
   or in raw gold; diamonds, stones and labour in money.
   What the shop pays — money (cash, bank, UPI, cheque) and gold (raw
   gold by weight × purity, or gold paid in money at a rate) — is kept
   against the shop; each bill shows how much of it is paid.
   The database works out every sum again when a bill is saved
   (bill_save) — the sums here are the same to the paisa.
   Loaded after tags.js, before app.js.
   ============================================================ */
'use strict';

function billsOn() { return !!S.dbv18 && appOn('bills'); }
const BILL_KIND = { sale: 'Sale bill', quote: 'Quotation' };
const BILL_STATUS = { open: 'Open', converted: 'Made into a sale', declined: 'Not taken', cancelled: 'Cancelled' };
const PAY_MODES = [['cash', 'Cash'], ['bank', 'Bank'], ['upi', 'UPI'], ['cheque', 'Cheque'], ['card', 'Card'], ['other', 'Other']];
const LABOUR_ON = [['net_g', 'per g (net)'], ['gross_g', 'per g (gross)'], ['piece', 'per piece']];
const BF_KINDS = [['sale', 'Sale bill'], ['quote', 'Quotation'], ['approval', 'On approval']];
const GOLD_MODES = [['money', 'Money'], ['metal', 'Raw gold']];
function billNo(b) { return (b.kind === 'quote' ? 'QT-' : 'INV-') + String((b && b.bill_no) || 0).padStart(4, '0'); }
function payModeLabel(m) { const x = PAY_MODES.find((p) => p[0] === m); return x ? x[1] : (m || ''); }

/* ---------------- exact sums: paise and milligrams, rounded like the database ---------------- */
/* "2.3225" at 3 decimals → 2323 (half up); empty or wrong → 0 */
function scaled(v, d) {
  if (v == null) return 0;
  let t = String(v).replace(/,/g, '').trim();
  if (!t || !/^\d*\.?\d*$/.test(t) || t === '.') return 0;
  const parts = t.split('.');
  const frac = ((parts[1] || '') + '0'.repeat(d + 1)).slice(0, d + 1);
  const n = parseInt((parts[0] || '0') + frac, 10);
  return Math.floor(n / 10) + (n % 10 >= 5 ? 1 : 0);
}
function divRound(a, b) {   // whole numbers, a ≥ 0, b > 0 → a / b rounded half up
  const q = Math.floor(a / b), r = a - q * b;
  return 2 * r >= b ? q + 1 : q;
}
function has(v) { return v != null && String(v).trim() !== ''; }
/* F = the bill form (S.bf) or a bill from the database with its lines → every amount in paise, every weight in mg */
function billCalc(F) {
  const R = F.r;
  const money = R.gold_mode !== 'metal';
  const rateP = scaled(R.gold_rate, 2), srateP = scaled(R.silver_rate, 2), wM = scaled(R.wastage_pct, 3);
  const diaP = scaled(R.dia_rate, 2), csRP = scaled(R.cs_rate, 2), labP = scaled(R.labour_rate, 2);
  const T = { fineM: 0, goldP: 0, goldOnlyP: 0, goldMoneyP: 0, diaP: 0, csP: 0, labP: 0, lines: [], needGold: false, needSilver: false };
  F.pieces.forEach((p) => {
    const silver = p.metal === 'Silver';
    const purM = scaled(p.purity, 3);
    const touchM = has(p.purity) ? Math.min(100000, purM + wM) : 0;
    const netM = scaled(p.net_wt, 3), grossM = scaled(p.gross_wt, 3);
    const fineM = has(p.purity) ? divRound(netM * touchM, 100000) : 0;
    const goldP = divRound(fineM * (silver ? srateP : rateP), 1000);
    const dRateP = has(p.dia_rate) ? scaled(p.dia_rate, 2) : diaP;
    const dP = divRound(scaled(p.diamond_ct, 3) * dRateP, 1000);
    const cP = divRound(scaled(p.cs_ct, 3) * csRP, 1000);
    const lRateP = has(p.labour_rate) ? scaled(p.labour_rate, 2) : labP;
    const baseM = R.labour_on === 'gross_g' ? grossM : R.labour_on === 'piece' ? 1000 * Math.max(1, parseInt(p.qty, 10) || 1) : netM;
    const lP = divRound(baseM * lRateP, 1000);
    const inMoney = money || silver;
    if (fineM > 0 && !silver) T.needGold = true;
    if (fineM > 0 && silver) T.needSilver = true;
    if (!silver) { T.fineM += fineM; T.goldOnlyP += goldP; }
    T.goldP += goldP; T.goldMoneyP += inMoney ? goldP : 0;
    T.diaP += dP; T.csP += cP; T.labP += lP;
    T.lines.push({ touchM, fineM, goldP, diaP: dP, csP: cP, labP: lP, lineP: (inMoney ? goldP : 0) + dP + cP + lP });
  });
  T.extraP = scaled(R.extra_amt, 2);
  T.discP = scaled(R.discount_amt, 2);
  T.goodsP = T.goldMoneyP + T.diaP + T.csP + T.labP + T.extraP - T.discP;
  T.taxableP = T.goodsP + (!money && R.gst_on_gold !== false ? T.goldOnlyP : 0);
  T.gstC = scaled(R.gst_pct, 2);
  T.gstP = divRound(Math.max(0, T.taxableP) * T.gstC, 10000);
  T.wholeP = T.goodsP + T.gstP;
  T.totalP = T.wholeP >= 0 ? divRound(T.wholeP, 100) * 100 : 0;
  T.roundP = T.totalP - T.wholeP;
  T.money = money;
  return T;
}
/* ₹ 1,49,582 (paise → text; decimals only when there are paise) */
function inr(p, sign) {
  const neg = p < 0, a = Math.abs(Math.round(p));
  const r = Math.floor(a / 100), ps = a % 100;
  const s = r.toLocaleString('en-IN') + (ps ? '.' + String(ps).padStart(2, '0') : '');
  return (neg ? '− ' : sign && a ? '+ ' : '') + '₹ ' + s;
}
function inrNum(n) { return inr(Math.round(num(n) * 100)); }
function gM(m) { return grams(m / 1000); }   // mg → "1.765 g"

/* ---------------- the form ---------------- */
function billDefaults() {
  try { return JSON.parse(localStorage.getItem('billRates') || 'null'); } catch (e) { return null; }
}
async function lastBillRates() {
  const { data } = await db.from('bills').select('gold_mode, gold_rate, silver_rate, wastage_pct, dia_rate, cs_rate, labour_rate, labour_on, gst_pct, gst_on_gold')
    .order('created_at', { ascending: false }).limit(1);
  return (data && data[0]) || null;
}
async function lastShopMode(clientId) {
  const { data } = await db.from('bills').select('gold_mode').eq('client_id', clientId).neq('status', 'cancelled').order('created_at', { ascending: false }).limit(1);
  return (data && data[0] && data[0].gold_mode) || 'money';
}
function ratesFrom(b) {
  const s = (v) => (v == null ? '' : String(v));
  return {
    gold_mode: (b && b.gold_mode) || 'money', gold_rate: s(b && b.gold_rate), silver_rate: s(b && b.silver_rate), wastage_pct: s(b && b.wastage_pct != null ? b.wastage_pct : 0),
    dia_rate: s(b && b.dia_rate), cs_rate: s(b && b.cs_rate), labour_rate: s(b && b.labour_rate), labour_on: (b && b.labour_on) || 'net_g',
    extra_amt: '', extra_note: '', discount_amt: '', gst_pct: s(b && b.gst_pct != null ? b.gst_pct : 3), gst_on_gold: !(b && b.gst_on_gold === false),
  };
}
function pieceFromStock(c) {
  return {
    id: c.id, tag_no: c.tag_no || '', design_no: c.design_no || '', category: c.category || '', title: c.title || '', metal: c.metal === 'Silver' ? 'Silver' : 'Gold',
    purity: c.purity, gross_wt: c.gross_wt, net_wt: c.net_wt, diamond_ct: c.diamond_ct, diamond_pcs: c.diamond_pcs, cs_ct: c.cs_ct, cs_pcs: c.cs_pcs,
    photo: (c.photo_paths || [])[0] || null, status: c.status, dia_rate: '', labour_rate: '', qty: 1,
  };
}
/* open the form: opt = { kind, pieces: [catalogue rows], from_bill, from_memo, bill (to edit), lines } */
async function startBill(client, opt) {
  opt = opt || {};
  let r;
  if (opt.bill) r = Object.assign(ratesFrom(opt.bill), { extra_amt: opt.bill.extra_amt ? String(opt.bill.extra_amt) : '', extra_note: opt.bill.extra_note || '',
    discount_amt: opt.bill.discount_amt ? String(opt.bill.discount_amt) : '' });
  else {
    r = ratesFrom(billDefaults() || await lastBillRates());   // today's rates: the last ones used
    r.gold_mode = await lastShopMode(client.id);               // money or raw gold: as this shop paid last time
    const t = typeof loadTodayRate === 'function' ? await loadTodayRate() : null;   // the owner's rate of the day (update 19)
    if (t && num(t.r24) > 0) { r.gold_rate = String(num(t.r24)); if (num(t.silver) > 0) r.silver_rate = String(num(t.silver)); }
  }
  S.bf = {
    id: opt.edit && opt.bill ? opt.bill.id : null, billNo: opt.edit && opt.bill ? billNo(opt.bill) : null,
    kind: opt.kind || (opt.bill ? opt.bill.kind : 'sale'), lockKind: !!opt.edit,
    client: { id: client.id, trade_name: client.trade_name, city: client.city || '' },
    pieces: (opt.pieces || []).map(pieceFromStock), r,
    bill_date: opt.edit && opt.bill ? opt.bill.bill_date : todayStr(), pay_by: (opt.edit && opt.bill && opt.bill.pay_by) || '', valid_till: (opt.edit && opt.bill && opt.bill.valid_till) || todayStr(15),
    return_by: todayStr(3), notes: (opt.edit && opt.bill && opt.bill.notes) || '',
    from_bill: opt.from_bill || null, from_memo: opt.from_memo || null,
  };
  if (opt.lines) {   // a bill's own pieces (edit, or a quotation made into a sale): its piece rates come along
    S.bf.pieces.forEach((p) => { const l = opt.lines.find((x) => x.catalogue_id === p.id); if (l) { p.dia_rate = l.dia_rate != null ? String(l.dia_rate) : ''; p.labour_rate = l.labour_rate != null ? String(l.labour_rate) : ''; } });
  }
  showSub(opt.edit ? 'Edit ' + S.bf.billNo : 'Ready stock', renderBillForm, !!opt.replace);
}
function kindLabel(k) { const x = BF_KINDS.find((p) => p[0] === k); return x ? x[1] : k; }
function renderBillForm() {
  const F = S.bf;
  if (!F) return;
  const R = F.r;
  const appr = F.kind === 'approval';
  S.formState.bf_kind = kindLabel(F.kind);
  S.formState.bf_mode = R.gold_mode === 'metal' ? 'Raw gold' : 'Money';
  S.formState.bf_labon = (LABOUR_ON.find((x) => x[0] === R.labour_on) || LABOUR_ON[0])[1];
  const anySilver = F.pieces.some((p) => p.metal === 'Silver'), anyCs = F.pieces.some((p) => num(p.cs_ct) > 0);
  const v = (k) => esc(R[k] == null ? '' : R[k]);
  $('#content').innerHTML = '<div id="bf-form">' +
    '<div class="card" style="padding:13px 15px"><b>' + esc(F.client.trade_name) + '</b>' + (F.client.city ? ' <span style="color:var(--muted);font-size:13px">· ' + esc(F.client.city) + '</span>' : '') +
    (F.billNo ? '<span class="chip" style="margin-left:6px">' + esc(F.billNo) + '</span>' : '') + '</div>' +
    (F.lockKind ? '' : '<div class="field"><label>What is it?</label>' + segHTML('bf_kind', BF_KINDS.map((x) => x[1]), kindLabel(F.kind)) + '</div>') +
    '<div class="section-label">Pieces (' + F.pieces.length + ')</div>' +
    '<div id="bf-pieces"></div>' +
    '<div class="action-row bf-add-row"><button type="button" class="btn btn-secondary" data-action="bf-scan">📷 Scan tag</button>' +
    '<button type="button" class="btn btn-secondary" data-action="bf-pick">🔍 Find in stock</button></div>' +
    '<div class="bf-sum" id="bf-sum"></div>' +
    (appr ? '<div class="section-label">On approval</div><div class="card"><div class="field"><label>Back by</label>' +
      '<div class="bf-days">' + [2, 3, 7].map((n) => '<button type="button" class="chip-btn' + (F.return_by === todayStr(n) ? ' on' : '') + '" data-action="bf-days" data-n="' + n + '">' + n + ' days</button>').join('') + '</div>' +
      '<input type="date" data-bfd="return_by" value="' + esc(F.return_by) + '"></div>' +
      '<div class="field" style="margin-bottom:2px"><label>Note (optional)</label><input type="text" data-bfd="notes" value="' + esc(F.notes) + '" autocomplete="off"></div>' +
      '<a href="#" class="bf-manual" data-action="ap-manual" data-id="' + F.client.id + '">Pieces that are not in the stock? Type them instead ›</a></div>'
      : '<div class="section-label">Rates</div><div class="card" id="bf-rates"><div id="bf-offers"></div>' +
      '<div class="field"><label>Gold paid in</label>' + segHTML('bf_mode', GOLD_MODES.map((x) => x[1]), S.formState.bf_mode) +
      '<div class="hint" id="bf-mode-hint">' + esc(R.gold_mode === 'metal' ? 'The shop gives raw gold for the gold in the pieces; diamonds, stones and labour are paid in money.' : 'Everything is paid in money.') + '</div></div>' +
      '<div class="o-2col"><div class="field"><label>Gold rate (24K, ₹ per g)</label><input type="text" inputmode="decimal" data-bfr="gold_rate" value="' + v('gold_rate') + '" placeholder="e.g. 13000"></div>' +
      '<div class="field"><label>Wastage (%)</label><input type="text" inputmode="decimal" data-bfr="wastage_pct" value="' + v('wastage_pct') + '" placeholder="0"></div></div>' +
      '<div class="hint" id="bf-rate-hint"></div>' +
      (anySilver ? '<div class="field"><label>Silver rate (fine, ₹ per g)</label><input type="text" inputmode="decimal" data-bfr="silver_rate" value="' + v('silver_rate') + '"></div>' : '') +
      '<div class="o-2col"><div class="field"><label>Diamond rate (₹ per ct)</label><input type="text" inputmode="decimal" data-bfr="dia_rate" value="' + v('dia_rate') + '" placeholder="e.g. 30000"></div>' +
      (anyCs ? '<div class="field"><label>Colour stones (₹ per ct)</label><input type="text" inputmode="decimal" data-bfr="cs_rate" value="' + v('cs_rate') + '"></div>' : '<div></div>') + '</div>' +
      '<div class="field"><label>Labour (₹)</label><input type="text" inputmode="decimal" data-bfr="labour_rate" value="' + v('labour_rate') + '" placeholder="e.g. 1200">' +
      segHTML('bf_labon', LABOUR_ON.map((x) => x[1]), S.formState.bf_labon) + '</div>' +
      '<div class="o-2col"><div class="field"><label>Extra charges (₹)</label><input type="text" inputmode="decimal" data-bfr="extra_amt" value="' + v('extra_amt') + '" placeholder="0"></div>' +
      '<div class="field"><label>For</label><input type="text" data-bfr="extra_note" value="' + v('extra_note') + '" placeholder="e.g. IGI certificate" autocomplete="off"></div></div>' +
      '<div class="o-2col"><div class="field"><label>Discount (₹)</label><input type="text" inputmode="decimal" data-bfr="discount_amt" value="' + v('discount_amt') + '" placeholder="0"></div>' +
      '<div class="field"><label>GST (%)</label><input type="text" inputmode="decimal" data-bfr="gst_pct" value="' + v('gst_pct') + '"></div></div>' +
      (R.gold_mode === 'metal' ? '<label class="bf-check"><input type="checkbox" data-bfr="gst_on_gold"' + (R.gst_on_gold !== false ? ' checked' : '') + '> GST on the gold\'s value too (needs the gold rate)</label>' : '') +
      '</div>' +
      '<div class="section-label">' + (F.kind === 'quote' ? 'Quotation' : 'Bill') + '</div><div class="card bf-total" id="bf-total"></div>' +
      '<div class="card"><div class="o-2col">' +
      (F.kind === 'quote' ? '<div class="field"><label>Valid till</label><input type="date" data-bfd="valid_till" value="' + esc(F.valid_till) + '"></div>'
        : '<div class="field"><label>Bill date</label><input type="date" data-bfd="bill_date" value="' + esc(F.bill_date) + '"></div>' +
        '<div class="field"><label>To be paid by</label><input type="date" data-bfd="pay_by" value="' + esc(F.pay_by) + '"></div>') + '</div>' +
      '<div class="field" style="margin-bottom:2px"><label>Note (printed on the ' + (F.kind === 'quote' ? 'quotation' : 'bill') + ')</label><input type="text" data-bfd="notes" value="' + esc(F.notes) + '" autocomplete="off"></div></div>') +
    '<button class="btn btn-primary" data-action="bf-save" id="bf-save">' + esc(appr ? 'Give on approval' : F.id ? 'Save changes' : F.kind === 'quote' ? 'Save quotation' : 'Save sale bill') + '</button>' +
    '<div style="height:10px"></div></div>';
  drawBillPieces();
  billRecalcView();
  const c = $('#bf-form');
  c.addEventListener('input', onBillInput);
  c.addEventListener('change', onBillInput);
  if (typeof billExtras === 'function') billExtras(F);   // a booked rate, an offer on making (extras.js)
}
function onBillInput(e) {
  const F = S.bf;
  if (!F || !$('#bf-save')) return;
  const t = e.target;
  if (t.dataset.bfr) { F.r[t.dataset.bfr] = t.type === 'checkbox' ? t.checked : t.value; billRecalcView(); }
  else if (t.dataset.bfd) { F[t.dataset.bfd] = t.value; if (t.dataset.bfd === 'return_by') document.querySelectorAll('[data-action="bf-days"]').forEach((b) => b.classList.toggle('on', todayStr(+b.dataset.n) === t.value)); }
  else if (t.dataset.bfp) { const p = F.pieces[+t.dataset.i]; if (p) { p[t.dataset.bfp] = t.value; billRecalcView(); } }
}
function pieceTitle(p) { return [p.tag_no || p.design_no || 'Piece', p.tag_no && p.design_no ? p.design_no : ''].filter(Boolean).join(' · '); }
function pieceWeights(p) {
  return [p.category, has(p.purity) ? (purityKey(p.purity) || num(p.purity) + '%') : '', num(p.gross_wt) ? 'G ' + grams(p.gross_wt) : '', num(p.net_wt) ? 'N ' + grams(p.net_wt) : '',
    num(p.diamond_ct) ? 'Dia ' + carats(p.diamond_ct) + (p.diamond_pcs ? '/' + p.diamond_pcs : '') : '', num(p.cs_ct) ? 'CS ' + carats(p.cs_ct) + (p.cs_pcs ? '/' + p.cs_pcs : '') : '']
    .filter(Boolean).join(' · ');
}
function drawBillPieces() {
  const F = S.bf, box = $('#bf-pieces');
  if (!F || !box) return;
  const appr = F.kind === 'approval';
  box.innerHTML = F.pieces.length ? F.pieces.map((p, i) =>
    '<div class="card bf-pc">' + (p.photo ? '<img class="bf-img" data-catimg="' + esc(p.photo) + '" alt="">' : '<span class="bf-img cat-noimg">💍</span>') +
    '<div class="bf-pc-b"><div class="bf-pc-t">' + esc(pieceTitle(p)) + '</div><div class="bf-pc-w">' + esc(pieceWeights(p)) + '</div>' +
    (appr || !num(p.diamond_ct) ? '' : '<div class="bf-pc-r"><span>Dia ₹/ct</span><input type="text" inputmode="decimal" data-bfp="dia_rate" data-i="' + i + '" value="' + esc(p.dia_rate || '') + '" placeholder="bill rate"></div>') +
    (appr ? '' : '<div class="bf-pc-amt" data-amt="' + i + '"></div>') + '</div>' +
    '<button type="button" class="fu-x" data-action="bf-del" data-i="' + i + '" aria-label="Remove">✕</button></div>').join('')
    : '<div class="empty bf-empty">Scan the tags of the pieces, or find them in the stock.</div>';
  fillCatImages(box);
  const sum = $('#bf-sum');
  if (sum) {
    const t = (k) => F.pieces.reduce((s, p) => s + num(p[k]), 0);
    sum.textContent = F.pieces.length ? [F.pieces.length === 1 ? '1 piece' : F.pieces.length + ' pieces', 'Gross ' + grams(t('gross_wt')), 'Net ' + grams(t('net_wt')),
      t('diamond_ct') ? 'Dia ' + carats(t('diamond_ct')) : '', t('cs_ct') ? 'CS ' + carats(t('cs_ct')) : ''].filter(Boolean).join(' · ') : '';
  }
}
function billRecalcView() {
  const F = S.bf;
  if (!F || F.kind === 'approval') return;
  const T = billCalc(F), R = F.r;
  T.lines.forEach((l, i) => { const el = document.querySelector('[data-amt="' + i + '"]'); if (el) el.textContent = inr(l.lineP); });
  const hint = $('#bf-rate-hint');
  if (hint) {
    const rateP = scaled(R.gold_rate, 2);
    const purs = Array.from(new Set(F.pieces.filter((p) => p.metal !== 'Silver' && has(p.purity)).map((p) => num(p.purity))));
    const w = num(R.wastage_pct);
    hint.textContent = rateP >= 5000000 ? '⚠ That looks like the rate for 10 g — write the rate for 1 g.'
      : rateP && purs.length ? purs.map((pu) => (purityKey(pu) || pu + '%') + (w ? ' + ' + w + '%' : '') + ': ₹ ' + Math.round(rateP / 100 * Math.min(100, pu + w) / 100).toLocaleString('en-IN') + '/g').join(' · ') : '';
  }
  const box = $('#bf-total');
  if (!box) return;
  const row = (k, val, cls) => '<div class="bf-row' + (cls ? ' ' + cls : '') + '"><span>' + k + '</span><b>' + val + '</b></div>';
  const metal = R.gold_mode === 'metal';
  const touchTxt = (() => { const t = Array.from(new Set(T.lines.filter((l, i) => F.pieces[i].metal !== 'Silver' && l.touchM).map((l) => l.touchM / 1000))); return t.length === 1 ? ' (' + t[0] + '%)' : ''; })();
  const lines = [];
  if (T.fineM) lines.push(row(esc((metal ? 'Gold — ' + gM(T.fineM) + ' fine' + touchTxt + ' in raw gold' : 'Gold — ' + gM(T.fineM) + ' fine' + touchTxt)),
    metal ? (T.goldOnlyP ? '<span class="muted">' + inr(T.goldOnlyP) + '</span>' : '—') : inr(T.goldOnlyP)));
  if (T.goldP - T.goldOnlyP) lines.push(row('Silver', inr(T.goldP - T.goldOnlyP)));
  if (T.diaP) lines.push(row(esc('Diamonds — ' + carats(F.pieces.reduce((s, p) => s + num(p.diamond_ct), 0))), inr(T.diaP)));
  if (T.csP) lines.push(row('Colour stones', inr(T.csP)));
  if (T.labP) lines.push(row('Labour', inr(T.labP)));
  if (T.extraP) lines.push(row(esc('Extra' + (R.extra_note ? ' — ' + R.extra_note : '')), inr(T.extraP)));
  if (T.discP) lines.push(row('Discount', '− ' + inr(T.discP)));
  lines.push(row(metal && T.taxableP !== T.goodsP ? 'Taxable value (with the gold)' : 'Taxable value', inr(T.taxableP), 'sub'));
  lines.push(row('GST ' + (T.gstC / 100) + '%', inr(T.gstP)));
  if (T.roundP) lines.push(row('Round off', inr(T.roundP, true)));
  lines.push(row(metal ? 'Money to receive' : 'Total', inr(T.totalP), 'tot'));
  if (metal && T.fineM) lines.push(row('Raw gold to receive', gM(T.fineM) + ' fine', 'tot gold'));
  const warn = [];
  if (T.needGold && !scaled(R.gold_rate, 2) && (!metal || (R.gst_on_gold !== false && scaled(R.gst_pct, 2) > 0))) warn.push('Write the gold rate.');
  if (T.needSilver && !scaled(R.silver_rate, 2)) warn.push('Write the silver rate.');
  if (T.goodsP < 0) warn.push('The discount is more than the bill.');
  box.innerHTML = F.pieces.length ? lines.join('') + (warn.length ? '<div class="bf-warn">' + esc(warn.join(' ')) + '</div>' : '') : '<div class="empty" style="padding:6px">Add pieces to see the bill.</div>';
}
function keepBillForm() {
  const F = S.bf;
  if (!F) return;
  document.querySelectorAll('[data-bfr]').forEach((el) => { F.r[el.dataset.bfr] = el.type === 'checkbox' ? el.checked : el.value; });
  document.querySelectorAll('[data-bfd]').forEach((el) => { F[el.dataset.bfd] = el.value; });
  document.querySelectorAll('[data-bfp]').forEach((el) => { const p = F.pieces[+el.dataset.i]; if (p) p[el.dataset.bfp] = el.value; });
}

/* adding pieces: by scanning (one after another), or picking from the stock */
function bfAddPieces(list) {
  const F = S.bf;
  if (!F) return { added: 0 };
  let added = 0, already = 0, out = [];
  list.forEach((c) => {
    if (F.pieces.some((p) => p.id === c.id)) { already++; return; }
    const okHere = c.status === 'available' || (F.kind !== 'approval' && c.status === 'approval');
    if (!okHere) { out.push(c); return; }
    F.pieces.push(pieceFromStock(c)); added++;
  });
  return { added, already, out };
}
function bfScan() {
  keepBillForm();
  const F = S.bf;
  const handle = async (code, closeCb) => {
    const list = await findStockByCode(code);
    if (!list.length) return { text: tagCode(parseTagText(code).code || code) + ' — not in the stock', kind: 'err' };
    const fresh = list.filter((c) => !F.pieces.some((p) => p.id === c.id));
    if (!fresh.length) return { text: (list[0].tag_no || list[0].design_no) + ' — already in the bill', kind: '' };
    const usable = fresh.filter((c) => c.status === 'available' || (F.kind !== 'approval' && c.status === 'approval'));
    if (!usable.length) return { text: stockWhere(fresh[0]), kind: 'err' };
    if (usable.length > 1) {
      if (closeCb) closeCb();
      choosePieces('Which ' + (usable[0].design_no || 'piece') + '?', usable, true, (chosen) => { bfAddPieces(chosen); renderBillForm(); });
      return null;
    }
    bfAddPieces(usable);
    drawBillPieces(); billRecalcView();
    return { text: (usable[0].tag_no || usable[0].design_no) + ' ✓ added', kind: 'ok' };
  };
  const viaPhoto = () => readCodeFromPhoto(async (code) => {
    const r = await handle(code, null);
    if (r) toast(r.text, r.kind === 'err' ? 'err' : 'ok');
    renderBillForm();
  });
  if (codeScanOn()) {
    openCodeScanner({
      title: 'Scan the tags', sub: 'Point the camera at each tag\'s QR code — the pieces are added one by one.',
      onCode: async (text, ctl) => handle(text, ctl.stop),
      onPhoto: viaPhoto, onDone: () => renderBillForm(),
    });
  } else viaPhoto();
}
function stockWhere(c) {
  const name = c.tag_no || c.design_no || 'This piece';
  return name + (c.status === 'sold' ? ' is already sold' : c.status === 'reserved' ? ' is in an order' : c.status === 'approval' ? ' is on approval with a shop' : ' cannot be added');
}
function bfPick() {
  keepBillForm();
  if (typeof openCatPicker !== 'function') return;
  openCatPicker();
  S.catPick.mode = 'bill';
  if (typeof updatePickBar === 'function') updatePickBar();
}
/* the picker's "Add" (catalogue.js calls this in bill mode) */
function billPicked() {
  const chosen = S.catPick.items.filter((i) => S.catPick.sel.has(i.id));
  if (!chosen.length) { toast('Tap the pieces you want first.', 'err'); return; }
  const r = bfAddPieces(chosen);
  backOne();
  toast(r.added === 1 ? '1 piece added ✓' : r.added + ' pieces added ✓', 'ok');
}

async function saveBill() {
  keepBillForm();
  const F = S.bf;
  if (!F) return;
  if (!F.pieces.length) { toast('Add at least one piece.', 'err'); return; }
  const btn = $('#bf-save');
  const fail = (m) => { if (btn) btn.disabled = false; toast(m, 'err'); };
  if (btn) btn.disabled = true;
  if (F.kind === 'approval') {
    const { data, error } = await db.rpc('approval_from_stock', { p: { client_id: F.client.id, return_by: F.return_by || null, notes: F.notes || null, ids: F.pieces.map((p) => p.id) } });
    if (error || !data) { fail(rpcMsg(error)); return; }
    toast(appNo(data.memo_no) + ' — ' + (F.pieces.length === 1 ? '1 piece' : F.pieces.length + ' pieces') + ' given on approval ✓', 'ok');
    S.bf = null;
    openApproval(data.id, true);
    return;
  }
  const T = billCalc(F), R = F.r;
  const noPur = F.pieces.find((x) => num(x.net_wt) > 0 && !has(x.purity));
  if (noPur) { fail((noPur.tag_no || noPur.design_no || 'A piece') + ': the purity is missing — set it on the piece in Stock.'); return; }
  if (T.needGold && !scaled(R.gold_rate, 2) && (R.gold_mode !== 'metal' || (R.gst_on_gold !== false && scaled(R.gst_pct, 2) > 0))) { fail('Write the gold rate.'); return; }
  if (T.needSilver && !scaled(R.silver_rate, 2)) { fail('Write the silver rate.'); return; }
  if (T.goodsP < 0) { fail('The discount is more than the bill.'); return; }
  const n = (x) => (has(x) ? String(x).replace(/,/g, '').trim() : null);
  const p = {
    id: F.id, kind: F.kind, client_id: F.client.id, bill_date: F.bill_date || todayStr(), valid_till: F.kind === 'quote' ? (F.valid_till || null) : null,
    pay_by: F.kind === 'sale' ? (F.pay_by || null) : null, gold_mode: R.gold_mode, gold_rate: n(R.gold_rate), silver_rate: n(R.silver_rate), wastage_pct: n(R.wastage_pct) || '0',
    dia_rate: n(R.dia_rate), cs_rate: n(R.cs_rate), labour_rate: n(R.labour_rate), labour_on: R.labour_on, extra_amt: n(R.extra_amt) || '0', extra_note: R.extra_note || null,
    discount_amt: n(R.discount_amt) || '0', gst_pct: n(R.gst_pct) || '0', gst_on_gold: R.gst_on_gold !== false, notes: F.notes || null,
    from_bill: F.from_bill, from_memo: F.from_memo,
    lines: F.pieces.map((x) => ({ catalogue_id: x.id, dia_rate: n(x.dia_rate), labour_rate: n(x.labour_rate) })),
  };
  if (F.kind === 'sale' && !F.creditOk && typeof billCreditCheck === 'function') {
    const warn = await billCreditCheck(F.client.id, T.totalP, F.id);
    if (warn) {
      if (btn) btn.disabled = false;
      confirmModal('Check before saving', warn, 'Save anyway', () => { if (S.bf === F) { F.creditOk = true; saveBill(); } });
      return;
    }
  }
  const { data, error } = await db.rpc('bill_save', { p });
  if (error || !data) { fail(rpcMsg(error)); return; }
  if (data.total_amt != null && Math.round(num(data.total_amt) * 100) !== T.totalP) console.warn('bill total differs', data.total_amt, T.totalP);
  if (F.booking && F.kind === 'sale' && typeof billBookingLink === 'function') await billBookingLink(data.id, F.booking);   // the booked rate used (extras.js)
  try { localStorage.setItem('billRates', JSON.stringify(Object.assign({}, R, { extra_amt: '', extra_note: '', discount_amt: '' }))); } catch (e) { /* ignore */ }
  toast(billNo(data) + ' saved ✓', 'ok');
  S.bf = null;
  openBill(data.id, true);
}
/* the database's own words when it says no */
function rpcMsg(error) {
  const m = String((error && error.message) || '');
  if (!m || /fetch|network|Failed/i.test(m)) return 'Could not save — check the connection and try again.';
  return m.replace(/^.*?ERROR:\s*/, '');
}

/* ---------------- one bill ---------------- */
async function fetchBill(id) {
  const [b, l] = await Promise.all([
    db.from('bills').select('*, clients(id, trade_name, city, mobile, contact_person, address, gstin, state, area, company_name, designation)').eq('id', id).maybeSingle(),
    db.from('bill_lines').select('*').eq('bill_id', id).order('sort', { ascending: true }),
  ]);
  if (b.error || !b.data) { toast('Could not open the bill — try again.', 'err'); return null; }
  return { b: b.data, lines: l.data || [] };
}
/* a bill from the database → the shape billCalc reads */
function billAsForm(b, lines) {
  return {
    r: ratesFrom(b) && Object.assign(ratesFrom(b), { extra_amt: b.extra_amt, discount_amt: b.discount_amt, extra_note: b.extra_note }),
    pieces: lines.map((l) => ({ metal: l.metal, purity: l.purity, net_wt: l.net_wt, gross_wt: l.gross_wt, diamond_ct: l.dia_ct, cs_ct: l.cs_ct, dia_rate: l.dia_rate, labour_rate: l.labour_rate, qty: l.qty })),
  };
}
/* what a shop owes, and how much of each bill is paid: payments against a bill go to it first, the rest to the oldest bills */
async function clientLedger(clientId) {
  const [bs, rs] = await Promise.all([
    db.from('bills').select('id, kind, bill_no, status, bill_date, pay_by, gold_mode, fine_due_g, total_amt, created_at').eq('client_id', clientId).order('bill_date', { ascending: true }).order('bill_no', { ascending: true }).limit(2000),
    db.from('receipts').select('*').eq('client_id', clientId).order('received_on', { ascending: false }).order('created_at', { ascending: false }).limit(2000),
  ]);
  const bills = bs.data || [], receipts = rs.data || [];
  const sales = bills.filter((b) => b.kind === 'sale' && b.status === 'open');
  const per = new Map();
  sales.forEach((b) => per.set(b.id, { dueP: Math.round(num(b.total_amt) * 100), paidP: 0, dueM: b.gold_mode === 'metal' ? Math.round(num(b.fine_due_g) * 1000) : 0, paidM: 0, retP: 0, retM: 0 }));
  let poolP = 0, poolM = 0;
  // returns (credit notes, update 19) take their amount off their own bill first
  let returns = [];
  if (S.dbv19) {
    const { data } = await db.from('bill_returns').select('*').eq('client_id', clientId).eq('status', 'open').limit(2000);
    returns = (data || []).filter((r) => per.has(r.bill_id));
    returns.forEach((r) => {
      const x = per.get(r.bill_id), a = Math.round(num(r.money_amt) * 100), m = Math.round(num(r.fine_g) * 1000);
      const tP = Math.min(a, Math.max(0, x.dueP - x.paidP)); x.paidP += tP; x.retP += tP; poolP += a - tP;
      const tM = Math.min(m, Math.max(0, x.dueM - x.paidM)); x.paidM += tM; x.retM += tM; poolM += m - tM;
    });
  }
  receipts.forEach((r) => {
    const x = r.bill_id ? per.get(r.bill_id) : null;
    if (r.kind === 'money') {
      const a = Math.round(num(r.amount) * 100);
      if (x) { const take = Math.min(a, Math.max(0, x.dueP - x.paidP)); x.paidP += take; poolP += a - take; } else poolP += a;
    } else {
      const m = Math.round(num(r.fine_g) * 1000);
      if (x && x.dueM) { const take = Math.min(m, Math.max(0, x.dueM - x.paidM)); x.paidM += take; poolM += m - take; } else poolM += m;
    }
  });
  const opening = typeof loadOpening === 'function' ? await loadOpening(clientId) : null;   // old dues before the app (update 22)
  const opP = opening ? Math.round(num(opening.money_amt) * 100) : 0, opM = opening ? Math.round(num(opening.fine_g) * 1000) : 0;
  if (opP < 0) poolP -= opP; else poolP -= Math.min(poolP, opP);
  if (opM < 0) poolM -= opM; else poolM -= Math.min(poolM, opM);
  sales.forEach((b) => {
    const x = per.get(b.id);
    const tP = Math.min(poolP, Math.max(0, x.dueP - x.paidP)); x.paidP += tP; poolP -= tP;
    const tM = Math.min(poolM, Math.max(0, x.dueM - x.paidM)); x.paidM += tM; poolM -= tM;
  });
  const sumP = sales.reduce((s, b) => s + per.get(b.id).dueP, 0), sumM = sales.reduce((s, b) => s + per.get(b.id).dueM, 0);
  const inP = receipts.filter((r) => r.kind === 'money').reduce((s, r) => s + Math.round(num(r.amount) * 100), 0);
  const inM = receipts.filter((r) => r.kind !== 'money').reduce((s, r) => s + Math.round(num(r.fine_g) * 1000), 0);
  const rtP = returns.reduce((s, r) => s + Math.round(num(r.money_amt) * 100), 0), rtM = returns.reduce((s, r) => s + Math.round(num(r.fine_g) * 1000), 0);
  return { bills, receipts, returns, per, opening, moneyDueP: sumP + opP - inP - rtP, goldDueM: sumM + opM - inM - rtM };
}
function billPayState(b, x) {
  if (b.kind !== 'sale') return null;
  if (b.status === 'cancelled') return { cls: 'bl-cancel', text: 'Cancelled' };
  if (!x) return null;
  const leftP = x.dueP - x.paidP, leftM = x.dueM - x.paidM;
  if (leftP <= 0 && leftM <= 0) return { cls: 'bl-paid', text: 'Paid' };
  if (x.paidP > 0 || x.paidM > 0) return { cls: 'bl-part', text: 'Part paid' };
  return { cls: 'bl-due', text: 'To collect' };
}
async function openBill(id, replace) {
  const got = await fetchBill(id);
  if (!got) return;
  let first = got;
  showSub(billNo(got.b), () => {
    if (first) { const x = first; first = null; renderBillPage(x); return; }
    $('#content').innerHTML = loadingHTML();
    fetchBill(id).then((x) => { if (x) renderBillPage(x); });
  }, replace);
}
function renderBillPage(got) {
  const b = got.b, lines = got.lines, cl = b.clients || {};
  S.billPage = got;
  const T = billCalc(billAsForm(b, lines));
  const metal = b.gold_mode === 'metal', sale = b.kind === 'sale', open = b.status === 'open';
  const mine = isOwner() || b.created_by === S.me.id;
  const row = (k, val, cls) => '<div class="bf-row' + (cls ? ' ' + cls : '') + '"><span>' + k + '</span><b>' + val + '</b></div>';
  const totals = [];
  if (num(b.fine_due_g)) totals.push(row(esc('Gold — ' + grams(b.fine_due_g) + ' fine' + (metal ? ' in raw gold' : '')), metal ? (num(b.gold_amt) ? '<span class="muted">' + inrNum(b.gold_amt) + '</span>' : '—') : inr(T.goldOnlyP)));
  if (T.goldP - T.goldOnlyP) totals.push(row('Silver', inr(T.goldP - T.goldOnlyP)));
  if (num(b.dia_amt)) totals.push(row('Diamonds', inrNum(b.dia_amt)));
  if (num(b.cs_amt)) totals.push(row('Colour stones', inrNum(b.cs_amt)));
  if (num(b.labour_amt)) totals.push(row('Labour', inrNum(b.labour_amt)));
  if (num(b.extra_amt)) totals.push(row(esc('Extra' + (b.extra_note ? ' — ' + b.extra_note : '')), inrNum(b.extra_amt)));
  if (num(b.discount_amt)) totals.push(row('Discount', '− ' + inrNum(b.discount_amt)));
  totals.push(row('Taxable value', inrNum(b.taxable_amt), 'sub'));
  totals.push(row('GST ' + num(b.gst_pct) + '%', inrNum(b.gst_amt)));
  if (num(b.round_off)) totals.push(row('Round off', inr(Math.round(num(b.round_off) * 100), true)));
  totals.push(row(metal ? 'Money to receive' : 'Total', inrNum(b.total_amt), 'tot'));
  if (metal && num(b.fine_due_g)) totals.push(row('Raw gold to receive', grams(b.fine_due_g) + ' fine', 'tot gold'));
  const chips = '<span class="chip bl-k-' + b.kind + '">' + esc(BILL_KIND[b.kind]) + '</span>' +
    (b.status !== 'open' ? '<span class="chip bl-st-' + b.status + '">' + esc(BILL_STATUS[b.status]) + '</span>' : '') + '<span id="bl-pay"></span>';
  $('#content').innerHTML =
    '<div class="client-head"><h2>' + esc(billNo(b)) + '</h2>' +
    '<div class="co"><span class="o-headlink" data-action="open-client" data-id="' + b.client_id + '">' + esc(cl.trade_name || 'Client') + ' ›</span>' + (cl.city ? ' · ' + esc(cl.city) : '') + '</div>' +
    '<div class="chips">' + chips + '<span class="chip">' + esc(fmtD(b.bill_date)) + '</span>' +
    (sale && b.pay_by && open ? '<span class="chip">' + esc('Pay by ' + fmtD(b.pay_by)) + '</span>' : '') +
    (!sale && b.valid_till ? '<span class="chip">' + esc('Valid till ' + fmtD(b.valid_till)) + '</span>' : '') + '</div></div>' +
    '<div class="action-row"><button class="btn btn-secondary" data-action="bl-pdf" data-id="' + b.id + '">' + esc(sale ? 'Bill (PDF)' : 'Quotation (PDF)') + '</button>' +
    '<button class="btn btn-secondary" data-action="bl-wa" data-id="' + b.id + '">WhatsApp</button></div>' +
    (sale && open ? '<div class="action-row"><button class="btn btn-primary" data-action="rc-new" data-kind="money" data-client="' + b.client_id + '" data-bill="' + b.id + '">＋ Money received</button>' +
      (metal ? '<button class="btn btn-primary" data-action="rc-new" data-kind="metal" data-client="' + b.client_id + '" data-bill="' + b.id + '">＋ Gold received</button>' : '') + '</div>' : '') +
    (sale && open && S.dbv19 && lines.some((l) => !l.return_id) ? '<div class="action-row"><button class="btn btn-secondary" data-action="rt-new" data-id="' + b.id + '">↩ Pieces came back</button></div>' : '') +
    (!sale && open ? '<div class="action-row"><button class="btn btn-primary" data-action="bl-convert" data-id="' + b.id + '">Make sale bill</button>' +
      '<button class="btn btn-secondary" data-action="bl-appr" data-id="' + b.id + '">Give on approval</button></div>' : '') +
    (b.from_bill ? '<div class="notice">Made from a quotation — <a href="#" data-action="bl-open" data-id="' + b.from_bill + '">open it ›</a></div>' : '') +
    (b.status === 'converted' ? '<div class="notice" id="bl-next">Made into a sale bill.</div>' : '') +
    '<div class="section-label">Pieces (' + lines.length + ')</div>' +
    lines.map((l, i) => '<div class="card bf-pc">' + (l.photo_path ? '<img class="bf-img" data-catimg="' + esc(l.photo_path) + '" alt="">' : '<span class="bf-img cat-noimg">💍</span>') +
      '<div class="bf-pc-b"><div class="bf-pc-t">' + (l.catalogue_id ? '<a href="#" data-action="cat-open" data-id="' + l.catalogue_id + '">' + esc(pieceTitle(l)) + ' ›</a>' : esc(pieceTitle(l) + (l.description ? ' · ' + l.description : ''))) + '</div>' +
      '<div class="bf-pc-w">' + esc(pieceWeights({ category: l.category, purity: l.purity, gross_wt: l.gross_wt, net_wt: l.net_wt, diamond_ct: l.dia_ct, diamond_pcs: l.dia_pcs, cs_ct: l.cs_ct, cs_pcs: l.cs_pcs }) + (l.qty > 1 ? ' · ' + l.qty + ' pcs' : '')) + '</div>' +
      '<div class="bf-pc-w muted">' + esc([num(l.fine_g) ? grams(l.fine_g) + ' fine' + (l.touch_pct != null ? ' (' + num(l.touch_pct) + '%)' : '') : '', num(l.dia_amt) && l.dia_rate != null ? 'Dia ₹ ' + num(l.dia_rate).toLocaleString('en-IN') + '/ct' : ''].filter(Boolean).join(' · ')) + '</div>' +
      '<div class="bf-pc-amt">' + inrNum(l.line_amt) + (l.return_id ? ' <span class="chip bl-st-cancelled">Returned</span>' : '') + '</div></div></div>').join('') +
    '<div class="section-label">' + esc(sale ? 'Bill' : 'Quotation') + '</div><div class="card bf-total">' +
    '<div class="bf-rates">' + esc([num(b.gold_rate) ? 'Gold ₹ ' + num(b.gold_rate).toLocaleString('en-IN') + '/g (24K)' : '', num(b.wastage_pct) ? 'wastage ' + num(b.wastage_pct) + '%' : '',
      num(b.dia_rate) ? 'Dia ₹ ' + num(b.dia_rate).toLocaleString('en-IN') + '/ct' : '', num(b.labour_rate) ? 'Labour ₹ ' + num(b.labour_rate).toLocaleString('en-IN') + ' ' + (LABOUR_ON.find((x) => x[0] === b.labour_on) || LABOUR_ON[0])[1] : ''].filter(Boolean).join(' · ')) + '</div>' +
    totals.join('') + '</div>' +
    (sale ? '<div id="bl-settle"></div><div id="bl-returns"></div>' : '') +
    (b.notes ? '<div class="section-label">Note</div><div class="card" style="white-space:pre-wrap;font-size:14.5px">' + esc(b.notes) + '</div>' : '') +
    '<div class="bl-made">' + esc('Made by ' + nameOf(b.created_by) + ' · ' + fmtD(b.created_at)) + (b.closed_at && b.status !== 'open' ? esc(' · ' + BILL_STATUS[b.status] + ' ' + fmtD(b.closed_at)) : '') + '</div>' +
    '<div class="bl-foot">' +
    (open && mine ? '<button class="btn btn-small btn-ghost" data-action="bl-edit" data-id="' + b.id + '">Edit</button>' : '') +
    (!sale && open ? '<button class="btn btn-small btn-ghost" data-action="bl-close" data-id="' + b.id + '" data-s="declined">Not taken</button>' : '') +
    (!sale && b.status === 'declined' ? '<button class="btn btn-small btn-ghost" data-action="bl-close" data-id="' + b.id + '" data-s="open">Open again</button>' : '') +
    (sale && open && mine ? '<button class="btn btn-small btn-danger-ghost" data-action="bl-close" data-id="' + b.id + '" data-s="cancelled">Cancel bill</button>' : '') + '</div>';
  fillCatImages($('#content'));
  if (sale) loadBillSettle(b);
  if (sale && typeof loadBillReturns === 'function') loadBillReturns(b);
  if (b.status === 'converted') {
    db.from('bills').select('id, kind, bill_no').eq('from_bill', b.id).limit(1).then(({ data }) => {
      const el = $('#bl-next');
      if (el && data && data[0]) el.innerHTML = esc('Made into a sale bill — ') + '<a href="#" data-action="bl-open" data-id="' + data[0].id + '">' + esc(billNo(data[0])) + ' ›</a>';
    });
  }
}
async function loadBillSettle(b) {
  const L = await clientLedger(b.client_id);
  const box = $('#bl-settle');
  if (!box) return;
  const x = L.per.get(b.id);
  const st = billPayState(b, x);
  const pc = $('#bl-pay');
  if (pc && st) pc.innerHTML = '<span class="chip ' + st.cls + '">' + esc(st.text) + '</span>';
  if (b.status !== 'open' || !x) { box.innerHTML = ''; return; }
  const mine = L.receipts.filter((r) => r.bill_id === b.id);
  const row = (k, val, cls) => '<div class="bf-row' + (cls ? ' ' + cls : '') + '"><span>' + k + '</span><b>' + val + '</b></div>';
  box.innerHTML = '<div class="section-label">Payment</div><div class="card bf-total">' +
    row('Money', inr(x.dueP)) + (x.retP ? row('Returned', inr(x.retP)) : '') + row('Received', inr(x.paidP - x.retP)) +
    row('Still to receive', inr(Math.max(0, x.dueP - x.paidP)), x.dueP - x.paidP > 0 ? 'tot due' : 'tot') +
    (x.dueM ? row('Raw gold (fine)', gM(x.dueM)) + (x.retM ? row('Returned', gM(x.retM)) : '') + row('Received', gM(x.paidM - x.retM)) +
      row('Still to receive', gM(Math.max(0, x.dueM - x.paidM)), x.dueM - x.paidM > 0 ? 'tot due gold' : 'tot gold') : '') +
    '<div class="hint">Payments against this bill count here first; payments the shop made without a bill count against its oldest bills.</div></div>' +
    (mine.length ? '<div class="section-label">Received against this bill</div>' + mine.map(receiptHTML).join('') : '');
}
function receiptHTML(r) {
  const what = r.kind === 'money' ? inrNum(r.amount) + ' · ' + payModeLabel(r.mode) + (r.ref_no ? ' · ' + r.ref_no : '')
    : r.kind === 'metal' ? grams(r.metal_g) + ' raw gold at ' + num(r.metal_purity) + '% = ' + grams(r.fine_g) + ' fine'
      : inrNum(r.amount) + ' for ' + grams(r.fine_g) + ' fine gold (₹ ' + num(r.rate).toLocaleString('en-IN') + '/g)';
  const canDel = isOwner() || (r.created_by === S.me.id && Date.now() - new Date(r.created_at).getTime() < 2 * 86400000);
  return '<div class="card rc-item"><div><b>' + esc(what) + '</b><div class="rc-sub">' + esc(fmtD(r.received_on) + ' · ' + nameOf(r.created_by) + (r.note ? ' · ' + r.note : '')) + '</div></div>' +
    (canDel ? '<button class="btn btn-small btn-ghost" data-action="rc-del" data-id="' + r.id + '">Remove</button>' : '') + '</div>';
}

/* the quotation → a sale bill (the same pieces and rates) */
async function convertBillQuote(id) {
  const got = S.billPage && S.billPage.b.id === id ? S.billPage : await fetchBill(id);
  if (!got) return;
  const ids = got.lines.map((l) => l.catalogue_id).filter(Boolean);
  const { data } = ids.length ? await db.from('catalogue_items').select('*').in('id', ids) : { data: [] };
  const rows = ids.map((x) => (data || []).find((c) => c.id === x)).filter(Boolean);
  const gone = rows.filter((c) => c.status !== 'available' && c.status !== 'approval');
  if (gone.length) { toast(stockWhere(gone[0]), 'err'); return; }
  const cl = got.b.clients || { id: got.b.client_id };
  await startBill({ id: got.b.client_id, trade_name: cl.trade_name, city: cl.city }, { kind: 'sale', pieces: rows, from_bill: id, bill: got.b, lines: got.lines });
}
async function quoteToApproval(id) {
  const got = S.billPage && S.billPage.b.id === id ? S.billPage : await fetchBill(id);
  if (!got) return;
  const ids = got.lines.map((l) => l.catalogue_id).filter(Boolean);
  const { data } = ids.length ? await db.from('catalogue_items').select('*').in('id', ids) : { data: [] };
  const rows = (data || []).filter((c) => c.status === 'available');
  if (!rows.length) { toast('None of these pieces is in the stock now.', 'err'); return; }
  const cl = got.b.clients || {};
  await startBill({ id: got.b.client_id, trade_name: cl.trade_name, city: cl.city }, { kind: 'approval', pieces: rows });
}
async function editBill(id) {
  if (S.billPage && S.billPage.b.id === id && S.billPage.lines.some((l) => l.return_id)) { toast('A return is recorded against this bill — it cannot be changed.', 'err'); return; }
  const got = S.billPage && S.billPage.b.id === id ? S.billPage : await fetchBill(id);
  if (!got) return;
  const ids = got.lines.map((l) => l.catalogue_id).filter(Boolean);
  if (ids.length !== got.lines.length) { toast('This bill has pieces that are no longer in the stock — it cannot be edited here.', 'err'); return; }
  if (got.b.kind === 'sale') {
    const { data: rc } = await db.from('receipts').select('id').eq('bill_id', id).limit(1);
    if (rc && rc.length) { toast('Payments are recorded against this bill — remove them first.', 'err'); return; }
  }
  const { data } = await db.from('catalogue_items').select('*').in('id', ids);
  const rows = ids.map((x) => (data || []).find((c) => c.id === x)).filter(Boolean);
  const cl = got.b.clients || {};
  await startBill({ id: got.b.client_id, trade_name: cl.trade_name, city: cl.city }, { edit: true, bill: got.b, lines: got.lines, pieces: rows });
}
function closeBill(id, s) {
  const run = async () => {
    const { error } = await db.rpc('bill_close', { p_id: id, p_status: s });
    if (error) { toast(rpcMsg(error), 'err'); return; }
    toast(s === 'cancelled' ? 'Bill cancelled — its pieces are back in stock' : s === 'declined' ? 'Marked not taken' : 'Open again', 'ok');
    openBill(id, true);
  };
  if (s === 'cancelled') confirmModal('Cancel this bill?', 'Its pieces go back into the stock (or back on approval with the shop). The bill keeps its number, marked cancelled.', 'Cancel bill', run, true);
  else run();
}

/* ---------------- money and gold received ---------------- */
function receiptForm(clientId, billId, kind) {
  S.rc = { kind: kind === 'metal' ? 'metal' : 'money', gold: 'metal' };
  const draw = () => {
    const ov = openModal('<h3>' + (S.rc.kind === 'money' ? 'Money received' : 'Gold received') + '</h3>' +
      (S.rc.kind === 'money'
        ? '<div class="field"><label>Amount (₹)</label><input type="text" inputmode="decimal" id="rc-amt" autocomplete="off"></div>' +
          '<div class="field"><label>How</label><div class="seg rc-modes">' + PAY_MODES.map((m, i) => '<button type="button" class="' + (i === 0 ? 'on' : '') + '" data-mode="' + m[0] + '">' + esc(m[1]) + '</button>').join('') + '</div></div>' +
          '<div class="field"><label>Cheque / UTR no. (optional)</label><input type="text" id="rc-ref" autocomplete="off"></div>'
        : '<div class="seg rc-gold">' + '<button type="button" class="' + (S.rc.gold === 'metal' ? 'on' : '') + '" data-g="metal">Raw gold</button><button type="button" class="' + (S.rc.gold === 'ratecut' ? 'on' : '') + '" data-g="ratecut">Paid in money</button></div>' +
          (S.rc.gold === 'metal'
            ? '<div class="o-2col"><div class="field"><label>Weight (g)</label><input type="text" inputmode="decimal" id="rc-g" autocomplete="off"></div>' +
              '<div class="field"><label>Purity (%)</label><input type="text" inputmode="decimal" id="rc-pur" value="99.5" autocomplete="off"></div></div>' +
              '<div class="bf-days">' + [['24K', 99.5], ['22K', 91.6], ['18K', 75]].map((x) => '<button type="button" class="chip-btn" data-pur="' + x[1] + '">' + x[0] + '</button>').join('') + '</div>' +
              '<div class="hint" id="rc-fine"></div>'
            : '<div class="o-2col"><div class="field"><label>Money (₹)</label><input type="text" inputmode="decimal" id="rc-amt" autocomplete="off"></div>' +
              '<div class="field"><label>Rate (₹ per g fine)</label><input type="text" inputmode="decimal" id="rc-rate" autocomplete="off"></div></div>' +
              '<div class="hint" id="rc-fine"></div>')) +
      '<div class="o-2col"><div class="field"><label>Date</label><input type="date" id="rc-date" value="' + todayStr() + '"></div>' +
      '<div class="field"><label>Note</label><input type="text" id="rc-note" autocomplete="off"></div></div>' +
      '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Save</button></div>');
    ov.querySelector('[data-m=no]').onclick = closeModal;
    let mode = 'cash';
    ov.querySelectorAll('.rc-modes button').forEach((bt) => { bt.onclick = () => { mode = bt.dataset.mode; ov.querySelectorAll('.rc-modes button').forEach((x) => x.classList.toggle('on', x === bt)); }; });
    ov.querySelectorAll('.rc-gold button').forEach((bt) => { bt.onclick = () => { S.rc.gold = bt.dataset.g; closeModal(); draw(); }; });
    const fine = () => {
      const el = ov.querySelector('#rc-fine');
      if (!el) return;
      if (S.rc.gold === 'metal') { const g = scaled(ov.querySelector('#rc-g').value, 3), p = scaled(ov.querySelector('#rc-pur').value, 3); el.textContent = g && p ? '= ' + gM(divRound(g * p, 100000)) + ' fine gold' : ''; }
      else { const a = scaled(ov.querySelector('#rc-amt').value, 2), r = scaled(ov.querySelector('#rc-rate').value, 2); el.textContent = a && r ? '= ' + gM(divRound(a * 1000, r)) + ' fine gold settled' : ''; }
    };
    ov.querySelectorAll('[data-pur]').forEach((bt) => { bt.onclick = () => { ov.querySelector('#rc-pur').value = bt.dataset.pur; fine(); }; });
    ov.addEventListener('input', fine);
    ov.querySelector('[data-m=yes]').onclick = async () => {
      const row = { client_id: clientId, bill_id: billId || null, received_on: ov.querySelector('#rc-date').value || todayStr(), note: ov.querySelector('#rc-note').value.trim() || null, created_by: S.me.id };
      if (S.rc.kind === 'money') {
        const a = scaled(ov.querySelector('#rc-amt').value, 2);
        if (!a) { toast('Write the amount.', 'err'); return; }
        Object.assign(row, { kind: 'money', amount: a / 100, mode, ref_no: ov.querySelector('#rc-ref').value.trim() || null });
      } else if (S.rc.gold === 'metal') {
        const g = scaled(ov.querySelector('#rc-g').value, 3), p = scaled(ov.querySelector('#rc-pur').value, 3);
        if (!g) { toast('Write the weight.', 'err'); return; }
        if (!p || p > 100000) { toast('Purity must be 1 – 100 %.', 'err'); return; }
        Object.assign(row, { kind: 'metal', metal_g: g / 1000, metal_purity: p / 1000 });
      } else {
        const a = scaled(ov.querySelector('#rc-amt').value, 2), r = scaled(ov.querySelector('#rc-rate').value, 2);
        if (!a || !r) { toast('Write the money and the rate.', 'err'); return; }
        Object.assign(row, { kind: 'ratecut', amount: a / 100, rate: r / 100, mode: 'other' });
      }
      const btn = ov.querySelector('[data-m=yes]');
      btn.disabled = true;
      const { error } = await db.from('receipts').insert(row);
      if (error) { btn.disabled = false; toast(/row-level/i.test(error.message || '') ? 'Not allowed — the bill may be cancelled.' : 'Could not save — try again.', 'err'); return; }
      closeModal();
      toast('Saved ✓', 'ok');
      refreshAfterReceipt(clientId, billId);
    };
  };
  draw();
}
function refreshAfterReceipt(clientId, billId) {
  if (billId && S.billPage && S.billPage.b.id === billId && $('#bl-settle')) { openBill(billId, true); return; }
  if ($('#client-bills')) loadClientBills({ id: clientId });
  if ($('#dues-list')) loadDues();
}
async function deleteReceipt(id) {
  confirmModal('Remove this entry?', 'It will no longer count as received.', 'Remove', async () => {
    const { data, error } = await db.from('receipts').delete().eq('id', id).select('id, client_id, bill_id');
    if (error || !data || !data.length) { toast('Only the owner, or the person who saved it (within 2 days), can remove it.', 'err'); return; }
    toast('Removed', 'ok');
    refreshAfterReceipt(data[0].client_id, data[0].bill_id);
  }, true);
}

/* ---------------- lists: bills, and what shops owe ---------------- */
function renderBills() {
  S.bl = S.bl || { show: 'all', q: '' };
  const chip = (v, label) => '<button class="' + (S.bl.show === v ? 'on' : '') + '" data-action="bl-show" data-v="' + v + '">' + label + '</button>';
  $('#content').innerHTML =
    '<div class="action-row" style="margin-bottom:12px"><button class="btn btn-primary" data-action="bl-new">＋ Bill from stock</button>' +
    '<button class="btn btn-secondary" data-action="dues-bills">To collect</button></div>' +
    '<div class="search-box"><input type="text" id="bl-search" placeholder="Search shop or bill no…" autocomplete="off" value="' + esc(S.bl.q) + '"></div>' +
    '<div class="filter-chips">' + chip('all', 'All') + chip('sale', 'Sale bills') + chip('quote', 'Quotations') + chip('cancelled', 'Cancelled') + '</div>' +
    '<div id="bl-list">' + loadingHTML() + '</div>';
  const inp = $('#bl-search');
  inp.addEventListener('input', () => { clearTimeout(S.searchTimer); S.searchTimer = setTimeout(() => { S.bl.q = inp.value; loadBillList(); }, 300); });
  loadBillList();
}
async function loadBillList() {
  const box = $('#bl-list');
  if (!box) return;
  let q = db.from('bills').select('id, kind, bill_no, status, bill_date, gold_mode, fine_due_g, total_amt, client_id, created_at, clients(trade_name, city)');
  if (S.bl.show === 'sale' || S.bl.show === 'quote') q = q.eq('kind', S.bl.show).neq('status', 'cancelled');
  if (S.bl.show === 'cancelled') q = q.eq('status', 'cancelled');
  const { data, error } = await q.order('created_at', { ascending: false }).limit(300);
  if (!$('#bl-list')) return;
  if (error) { box.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  const s = String(S.bl.q || '').trim().toLowerCase();
  const rows = (data || []).filter((b) => !s || billNo(b).toLowerCase().indexOf(s) > -1 || String((b.clients || {}).trade_name || '').toLowerCase().indexOf(s) > -1);
  box.innerHTML = rows.length ? rows.map((b) => billItemHTML(b, true)).join('') : '<div class="empty"><div class="big">🧾</div>' + (s ? 'Nothing matches.' : 'No bills yet — scan the tags of the pieces a shop takes.') + '</div>';
}
function billItemHTML(b, showClient, pay) {
  const cl = b.clients || {};
  return '<div class="list-item" data-action="bl-open" data-id="' + b.id + '"><div class="li-main">' +
    '<div class="li-title">' + esc(billNo(b)) + (showClient ? ' · ' + esc(cl.trade_name || '') : '') + '</div>' +
    '<div class="li-sub">' + esc([fmtD(b.bill_date), inrNum(b.total_amt), b.gold_mode === 'metal' && num(b.fine_due_g) ? grams(b.fine_due_g) + ' fine gold' : ''].filter(Boolean).join(' · ')) + '</div>' +
    '<div class="li-chips"><span class="chip bl-k-' + b.kind + '">' + esc(BILL_KIND[b.kind]) + '</span>' +
    (b.status !== 'open' ? '<span class="chip bl-st-' + b.status + '">' + esc(BILL_STATUS[b.status]) + '</span>' : '') +
    (pay ? '<span class="chip ' + pay.cls + '">' + esc(pay.text) + '</span>' : '') + '</div>' +
    '</div><div class="li-go">›</div></div>';
}
function renderDues() {
  $('#content').innerHTML = '<div class="notice">What each shop still has to pay for its sale bills — money, and raw gold for bills paid in gold.</div><div id="dues-list">' + loadingHTML() + '</div>';
  loadDues();
}
async function loadDues() {
  const box = $('#dues-list');
  if (!box) return;
  const { data, error } = await db.rpc('party_dues');
  if (!$('#dues-list')) return;
  if (error) { box.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  const rows = (data || []).filter((d) => num(d.money_due) > 0.004 || num(d.gold_due) > 0.0004);
  const tP = rows.reduce((s, d) => s + Math.max(0, Math.round(num(d.money_due) * 100)), 0), tM = rows.reduce((s, d) => s + Math.max(0, Math.round(num(d.gold_due) * 1000)), 0);
  box.innerHTML = rows.length ? '<div class="st-tot"><div><b>' + inr(tP) + '</b><span>Money to collect</span></div>' + (tM ? '<div><b>' + gM(tM) + '</b><span>Fine gold to collect</span></div>' : '') + '</div>' +
    rows.map((d) => '<div class="list-item" data-action="open-client" data-id="' + d.client_id + '"><div class="li-main"><div class="li-title">' + esc(d.trade_name) + (d.city ? ' <span class="muted">· ' + esc(d.city) + '</span>' : '') + '</div>' +
      '<div class="li-sub">' + esc([num(d.money_due) > 0.004 ? inrNum(d.money_due) : '', num(d.gold_due) > 0.0004 ? grams(d.gold_due) + ' fine gold' : '', d.oldest ? 'since ' + fmtD(d.oldest) : ''].filter(Boolean).join(' · ')) + '</div></div>' +
      (d.mobile ? '<button class="btn btn-small btn-secondary" data-action="dues-wa" data-id="' + d.client_id + '">WhatsApp</button>' : '') + '</div>').join('')
    : '<div class="empty"><div class="big">✓</div>Nothing to collect.</div>';
  S.duesRows = data || [];
}
function duesReminder(clientId) {
  const d = (S.duesRows || []).find((x) => x.client_id === clientId);
  if (!d) return;
  const parts = [num(d.money_due) > 0.004 ? inrNum(d.money_due) : '', num(d.gold_due) > 0.0004 ? grams(d.gold_due) + ' fine gold' : ''].filter(Boolean);
  const text = 'Namaste 🙏\nA gentle reminder from ' + bizName() + ': ' + parts.join(' and ') + ' is still due for our bills. Please let us know when it can be paid.\nThank you.';
  window.open(waUrl(d.mobile, text), '_blank');
}

/* ---------------- the client page ---------------- */
async function loadClientBills(cl) {
  const el = $('#client-bills');
  if (!el || !billsOn()) return;
  const L = await clientLedger(cl.id);
  if (!$('#client-bills')) return;
  const sales = L.bills.filter((b) => b.kind === 'sale');
  const recent = L.bills.slice().reverse().slice(0, 8);
  const moneyDue = L.moneyDueP, goldDue = L.goldDueM;
  el.innerHTML = '<div class="section-label sl-row"><span>Bills & payments</span>' + (L.bills.length > 8 ? '<a href="#" data-action="bl-list-for" data-id="' + cl.id + '">All ›</a>' : '') + '</div>' +
    (typeof openingBoxHTML === 'function' ? openingBoxHTML(cl, L.opening) : '') +
    (sales.length || L.receipts.length || L.opening ? '<div class="st-tot">' +
      '<div><b class="' + (moneyDue > 0 ? 'o-red' : '') + '">' + inr(Math.abs(moneyDue)) + '</b><span>' + (moneyDue >= 0 ? 'Money to receive' : 'Paid in advance') + '</span></div>' +
      (goldDue || L.receipts.some((r) => r.kind !== 'money') ? '<div><b class="' + (goldDue > 0 ? 'o-red' : '') + '">' + gM(Math.abs(goldDue)) + '</b><span>' + (goldDue >= 0 ? 'Fine gold to receive' : 'Shop\'s gold with us') + '</span></div>' : '') + '</div>' : '') +
    '<div class="o-more-acts"><button class="btn btn-small btn-secondary" data-action="bl-new-for" data-id="' + cl.id + '">🧾 Bill from stock</button>' +
    (S.dbv19 && (sales.length || L.receipts.length || L.opening) ? '<button class="btn btn-small btn-secondary" data-action="stm-new" data-id="' + cl.id + '">📄 Statement</button>' : '') +
    (S.dbv22 && isOwner() && !L.opening ? '<button class="btn btn-small btn-secondary" data-action="op-edit" data-id="' + cl.id + '">＋ Old dues</button>' : '') +
    (S.dbv22 ? '<button class="btn btn-small btn-secondary" data-action="og-for" data-id="' + cl.id + '">🪙 Old gold</button>' : '') +
    (sales.length ? '<button class="btn btn-small btn-secondary" data-action="rc-new" data-kind="money" data-client="' + cl.id + '">＋ Money received</button>' +
      '<button class="btn btn-small btn-secondary" data-action="rc-new" data-kind="metal" data-client="' + cl.id + '">＋ Gold received</button>' : '') + '</div>' +
    recent.map((b) => billItemHTML(b, false, billPayState(b, L.per.get(b.id)))).join('') +
    (L.receipts.length ? '<div class="section-label">Received</div>' + L.receipts.slice(0, 6).map(receiptHTML).join('') : '');
}

/* ---------------- export (More → Export all data) ---------------- */
async function exportBillsData(pName, cName, today) {
  const bills = await fetchAll('bills', 'created_at');
  const lines = await fetchAll('bill_lines', 'bill_id');
  const recs = await fetchAll('receipts', 'created_at');
  const no = new Map(bills.map((b) => [b.id, billNo(b)]));
  const shop = (id) => cName.get(id) || '';
  const lab = (v) => (LABOUR_ON.find((x) => x[0] === v) || [, v])[1];
  await new Promise((r) => setTimeout(r, 450));
  downloadFile('bj-bills-' + today + '.csv', buildCsv(
    ['Bill no', 'Kind', 'Status', 'Date', 'Shop', 'Gold paid in', 'Gold rate (24K, per g)', 'Silver rate', 'Wastage %', 'Diamond rate (per ct)', 'Colour stone rate (per ct)', 'Labour rate', 'Labour on',
      'Gold amount', 'Diamond amount', 'Colour stone amount', 'Labour amount', 'Extra', 'Extra for', 'Discount', 'Taxable', 'GST %', 'GST', 'Round off', 'Total', 'Fine gold due (g)',
      'Pay by', 'Valid till', 'Made from', 'Notes', 'Made by', 'Made on'],
    bills.map((b) => [billNo(b), BILL_KIND[b.kind], BILL_STATUS[b.status] || b.status, b.bill_date, shop(b.client_id), b.gold_mode === 'metal' ? 'Raw gold' : 'Money', b.gold_rate, b.silver_rate, b.wastage_pct,
      b.dia_rate, b.cs_rate, b.labour_rate, lab(b.labour_on), b.gold_amt, b.dia_amt, b.cs_amt, b.labour_amt, b.extra_amt, b.extra_note, b.discount_amt, b.taxable_amt, b.gst_pct, b.gst_amt, b.round_off,
      b.total_amt, b.fine_due_g, b.pay_by || '', b.valid_till || '', b.from_bill ? no.get(b.from_bill) || '' : '', b.notes, pName.get(b.created_by) || '', fmtExp(b.created_at)])));
  await new Promise((r) => setTimeout(r, 450));
  const bl = new Map(bills.map((b) => [b.id, b]));
  downloadFile('bj-bill-pieces-' + today + '.csv', buildCsv(
    ['Bill no', 'Shop', 'Tag no', 'Design no', 'Piece', 'Metal', 'Purity %', 'Gross wt (g)', 'Net wt (g)', 'Diamond ct', 'Diamond pcs', 'Colour stone ct', 'Colour stone pcs',
      'Diamond rate', 'Labour rate', 'Touch %', 'Fine gold (g)', 'Gold amount', 'Diamond amount', 'Colour stone amount', 'Labour amount', 'Piece amount'],
    lines.slice().sort((a, b) => String(no.get(a.bill_id)).localeCompare(String(no.get(b.bill_id))) || a.sort - b.sort)
      .map((l) => [no.get(l.bill_id) || '', shop((bl.get(l.bill_id) || {}).client_id), l.tag_no, l.design_no, l.category || l.description, l.metal, l.purity, l.gross_wt, l.net_wt, l.dia_ct, l.dia_pcs, l.cs_ct, l.cs_pcs,
        l.dia_rate, l.labour_rate, l.touch_pct, l.fine_g, l.gold_amt, l.dia_amt, l.cs_amt, l.labour_amt, l.line_amt])));
  await new Promise((r) => setTimeout(r, 450));
  const RK = { money: 'Money', metal: 'Raw gold', ratecut: 'Gold paid in money (rate cut)' };
  downloadFile('bj-received-' + today + '.csv', buildCsv(
    ['Received on', 'Shop', 'Against bill', 'Kind', 'Amount', 'Paid by', 'Cheque / UTR no', 'Raw gold (g)', 'Purity %', 'Rate (per g fine)', 'Fine gold (g)', 'Note', 'Entered by', 'Entered on'],
    recs.map((r) => [r.received_on, shop(r.client_id), r.bill_id ? no.get(r.bill_id) || '' : 'On account', RK[r.kind] || r.kind, r.amount, r.mode ? payModeLabel(r.mode) : '', r.ref_no,
      r.metal_g, r.metal_purity, r.rate, r.fine_g, r.note, pName.get(r.created_by) || '', fmtExp(r.created_at)])));
  if (!S.dbv19) return;
  const rets = await fetchAll('bill_returns', 'created_at');
  await new Promise((r) => setTimeout(r, 450));
  downloadFile('bj-returns-' + today + '.csv', buildCsv(
    ['Credit note', 'Date', 'Shop', 'Against bill', 'Pieces', 'Goods', 'Taxable', 'GST', 'Round off', 'Credit (money)', 'Credit (fine gold g)', 'Reason', 'Status', 'Made by', 'Made on'],
    rets.map((r) => ['CN-' + String(r.return_no).padStart(4, '0'), r.return_date, shop(r.client_id), no.get(r.bill_id) || '', r.pieces, r.goods_amt, r.taxable_amt, r.gst_amt, r.round_off,
      r.money_amt, r.fine_g, r.reason, r.status === 'open' ? 'Open' : 'Cancelled', pName.get(r.created_by) || '', fmtExp(r.created_at)])));
}

/* ---------------- WhatsApp and PDF ---------------- */
function billText(b, lines) {
  const cl = b.clients || {};
  const who = String(cl.contact_person || '').trim().split(/\s+/)[0];
  const metal = b.gold_mode === 'metal';
  return 'Namaste' + (who ? ' ' + who + ' ji' : '') + ' 🙏\n' +
    (b.kind === 'sale' ? 'Your bill ' : 'Our quotation ') + billNo(b) + ' (' + fmtD(b.bill_date) + ') from ' + bizName() + ':\n' +
    lines.map((l, i) => (i + 1) + '. ' + [l.category, l.tag_no, num(l.net_wt) ? 'Net ' + grams(l.net_wt) : '', num(l.dia_ct) ? carats(l.dia_ct) : ''].filter(Boolean).join(' · ') + ' — ' + inrNum(l.line_amt)).join('\n') +
    '\n' + (metal ? 'Money: ' : 'Total: ') + inrNum(b.total_amt) + (num(b.gst_amt) ? ' (with GST ' + num(b.gst_pct) + '%)' : '') +
    (metal && num(b.fine_due_g) ? '\nRaw gold: ' + grams(b.fine_due_g) + ' fine' : '') +
    (b.kind === 'sale' && b.pay_by ? '\nPlease pay by ' + fmtD(b.pay_by) + '.' : '') + (b.kind === 'quote' && b.valid_till ? '\nValid till ' + fmtD(b.valid_till) + '.' : '') +
    '\nThank you.';
}
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function words99(n) { return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : ''); }
function words999(n) { return (n >= 100 ? ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' : '') : '') + (n % 100 ? words99(n % 100) : ''); }
/* 149582 → "One Lakh Forty-Nine Thousand Five Hundred Eighty-Two" (Indian way) */
function rupeesInWords(r) {
  r = Math.floor(Math.abs(r));
  if (!r) return 'Zero';
  const parts = [];
  const cr = Math.floor(r / 10000000); r %= 10000000;
  const lk = Math.floor(r / 100000); r %= 100000;
  const th = Math.floor(r / 1000); r %= 1000;
  if (cr) parts.push((cr > 999 ? rupeesInWords(cr) : cr >= 100 ? words999(cr) : words99(cr)) + ' Crore');
  if (lk) parts.push(words99(lk) + ' Lakh');
  if (th) parts.push(words99(th) + ' Thousand');
  if (r) parts.push(words999(r));
  return parts.join(' ');
}
function sameState(a, b) { return !a || !b || String(a).trim().toLowerCase() === String(b).trim().toLowerCase(); }
async function buildBillPdf(id) {
  const got = await fetchBill(id);
  if (!got) throw new Error('bill');
  const b = got.b, lines = got.lines, cl = b.clients || {};
  const sale = b.kind === 'sale', metal = b.gold_mode === 'metal';
  const title = sale ? (num(b.gst_pct) > 0 ? 'TAX INVOICE' : 'SALE BILL') : 'QUOTATION';
  const meta = [[sale ? 'Invoice no.' : 'Quotation no.', billNo(b)], ['Date', pDate(b.bill_date)]];
  if (sale && b.pay_by) meta.push(['Pay by', pDate(b.pay_by)]);
  if (!sale && b.valid_till) meta.push(['Valid till', pDate(b.valid_till)]);
  const d = await pdfStart(title, meta, b.status === 'cancelled' ? 'CANCELLED' : (metal ? 'Gold to be paid in raw gold' : ''));
  pTwoParties(d, 'FROM', bizLines(), sale ? 'BILL TO' : 'FOR', clientLines(cl));
  const cols = [{ h: '#', w: 6 }, { h: 'Piece', w: 0 }, { h: 'Gross g', w: 15, a: 'right' }, { h: 'Net g', w: 15, a: 'right' }, { h: 'Dia ct/pcs', w: 18, a: 'right' },
    { h: metal ? 'Fine g' : 'Gold Rs.', w: 20, a: 'right' }, { h: 'Dia + CS Rs.', w: 21, a: 'right' }, { h: 'Labour Rs.', w: 18, a: 'right' }, { h: 'Amount Rs.', w: 23, a: 'right' }];
  cols[1].w = PG_W - PM * 2 - cols.reduce((a, x) => a + x.w, 0);
  const m2 = (x) => num(x).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let g = 0, n = 0, dc = 0, dp = 0;
  const rows = lines.map((l, i) => {
    g += num(l.gross_wt); n += num(l.net_wt); dc += num(l.dia_ct); dp += num(l.dia_pcs);
    const piece = [[l.category, l.tag_no].filter(Boolean).join(' '), l.design_no ? 'Design ' + l.design_no : '', l.purity != null ? pPurity(l.purity) + (num(l.touch_pct) !== num(l.purity) ? ', touch ' + num(l.touch_pct) + '%' : '') : '',
      num(l.cs_ct) ? 'CS ' + num(l.cs_ct).toFixed(3) + '/' + (l.cs_pcs || 0) : '', l.qty > 1 ? l.qty + ' pcs' : ''].filter(Boolean).join(' · ');
    return [String(i + 1), piece, l.gross_wt != null ? pG(l.gross_wt) : '', l.net_wt != null ? pG(l.net_wt) : '', num(l.dia_ct) ? num(l.dia_ct).toFixed(3) + '/' + (l.dia_pcs || 0) : '',
      metal && l.metal !== 'Silver' ? pG(l.fine_g) : m2(l.gold_amt), m2(num(l.dia_amt) + num(l.cs_amt)), m2(l.labour_amt), m2(l.line_amt)];
  });
  const tot = ['', 'Total (' + lines.length + (lines.length === 1 ? ' piece)' : ' pieces)'), pG(g), pG(n), dc ? dc.toFixed(3) + '/' + dp : '',
    metal ? pG(b.fine_due_g) : m2(b.gold_amt), m2(num(b.dia_amt) + num(b.cs_amt)), m2(b.labour_amt), m2(lines.reduce((s, l) => s + num(l.line_amt), 0))];
  tot.bold = true;
  rows.push(tot);
  d.table(cols, rows, { size: 7.4 });
  const T = [];
  if (num(b.gold_amt) && !metal) T.push(['Gold (' + pG(b.fine_due_g) + ' g fine @ Rs. ' + m2(b.gold_rate) + ')', m2(b.gold_amt)]);
  if (metal && num(b.fine_due_g)) T.push(['Gold: ' + pG(b.fine_due_g) + ' g fine, in raw gold', '-']);
  if (num(b.dia_amt)) T.push(['Diamonds', m2(b.dia_amt)]);
  if (num(b.cs_amt)) T.push(['Colour stones', m2(b.cs_amt)]);
  if (num(b.labour_amt)) T.push(['Labour', m2(b.labour_amt)]);
  if (num(b.extra_amt)) T.push([b.extra_note ? 'Extra: ' + b.extra_note : 'Extra charges', m2(b.extra_amt)]);
  if (num(b.discount_amt)) T.push(['Discount', '- ' + m2(b.discount_amt)]);
  T.push(['Taxable value' + (metal && b.gst_on_gold && num(b.gold_amt) ? ' (with gold Rs. ' + m2(b.gold_amt) + ')' : ''), m2(b.taxable_amt), 'bold']);
  if (num(b.gst_pct)) {
    const st = cl.state || stateFromGstin(cl.gstin), bst = (S.biz && S.biz.state) || stateFromGstin(S.biz && S.biz.gstin);
    if (sameState(st, bst)) {
      const half = Math.round(num(b.gst_amt) * 100 / 2);
      T.push(['CGST ' + num(b.gst_pct) / 2 + '%', m2(half / 100)]);
      T.push(['SGST ' + num(b.gst_pct) / 2 + '%', m2((Math.round(num(b.gst_amt) * 100) - half) / 100)]);
    } else T.push(['IGST ' + num(b.gst_pct) + '%', m2(b.gst_amt)]);
  }
  if (num(b.round_off)) T.push(['Round off', (num(b.round_off) > 0 ? '+ ' : '- ') + m2(Math.abs(num(b.round_off)))]);
  T.push([metal ? 'Money to pay' : 'Total', 'Rs. ' + m2(b.total_amt), 'total']);
  if (metal && num(b.fine_due_g)) T.push(['Raw gold to give', pG(b.fine_due_g) + ' g fine', 'bold']);
  pTotals(d, T);
  pNote(d, 'AMOUNT IN WORDS', 'Rupees ' + rupeesInWords(num(b.total_amt)) + ' Only' + (metal && num(b.fine_due_g) ? ' — and ' + pG(b.fine_due_g) + ' g fine gold' : ''));
  pNote(d, '', 'HSN 7113 - articles of jewellery. Rates: ' + [num(b.gold_rate) ? 'gold Rs. ' + m2(b.gold_rate) + '/g (24K)' : '', num(b.wastage_pct) ? 'wastage ' + num(b.wastage_pct) + '%' : '',
    num(b.dia_rate) ? 'diamonds Rs. ' + m2(b.dia_rate) + '/ct' : '', num(b.labour_rate) ? 'labour Rs. ' + m2(b.labour_rate) + ' ' + (LABOUR_ON.find((x) => x[0] === b.labour_on) || LABOUR_ON[0])[1] : ''].filter(Boolean).join(', ') + '.', 7.8);
  pNote(d, 'NOTE', b.notes);
  if (S.biz && S.biz.bank_details && sale) pNote(d, 'BANK DETAILS', S.biz.bank_details);
  if (sale && typeof billUpiQr === 'function') billUpiQr(d, b);   // pay by UPI (extras.js)
  if (S.biz && S.biz.terms) pNote(d, 'TERMS', S.biz.terms, 7.8);
  const urls = await signedUrls('catalogue', lines.map((l) => l.photo_path).filter(Boolean));
  await pPhotos(d, lines.map((l) => ({ category: l.category, design_code: l.tag_no })), lines.map((l) => (l.photo_path ? urls.get(l.photo_path) || null : null)));
  pSignatures(d, sale ? 'Received the above goods - customer\'s signature' : '');
  return { pdf: d, name: safeFileName(billNo(b) + ' ' + (cl.trade_name || '') + (sale ? ' - Bill' : ' - Quotation')) + '.pdf', text: (sale ? 'Bill ' : 'Quotation ') + billNo(b) + ' from ' + bizName() };
}

/* ---------------- the "New order" choice: from ready stock, or to be made ---------------- */
function orderOrStock(client, onMake, replace) {
  if (!billsOn()) { onMake(); return; }
  const ov = openModal('<h3>What did the shop choose?</h3>' +
    '<div style="display:flex;flex-direction:column;gap:10px;margin-top:6px">' +
    '<button class="choice-btn" data-m="stock"><span class="ico">📦</span><span><span class="ch-title">Pieces from our ready stock</span><br><span class="ch-sub">Scan the tags → sale bill, quotation or on approval</span></span></button>' +
    '<button class="choice-btn" data-m="make"><span class="ico">🛠️</span><span><span class="ch-title">An order to make</span><br><span class="ch-sub">Production — CAD, wax, casting, setting…</span></span></button></div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button></div>');
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=stock]').onclick = () => { closeModal(); startBill(client, { kind: 'sale', replace }); };
  ov.querySelector('[data-m=make]').onclick = () => { closeModal(); onMake(); };
}

/* ---------------- the choice buttons on the form ---------------- */
window.SEG_HOOKS.push((group) => {
  const F = S.bf;
  if (!F || !$('#bf-save')) return;
  if (group === 'bf_kind') {
    const x = BF_KINDS.find((k) => k[1] === S.formState.bf_kind);
    keepBillForm();
    if (x) F.kind = x[0];
    renderBillForm();
  } else if (group === 'bf_mode') {
    const x = GOLD_MODES.find((k) => k[1] === S.formState.bf_mode);
    keepBillForm();
    if (x) F.r.gold_mode = x[0];
    renderBillForm();
  } else if (group === 'bf_labon') {
    const x = LABOUR_ON.find((k) => k[1] === S.formState.bf_labon);
    if (x) F.r.labour_on = x[0];
    else S.formState.bf_labon = (LABOUR_ON.find((k) => k[0] === F.r.labour_on) || LABOUR_ON[0])[1];
    document.querySelectorAll('[data-group="bf_labon"]').forEach((b) => b.classList.toggle('on', b.dataset.val === S.formState.bf_labon));
    billRecalcView();
  }
});

onAct('bl-list', () => showSub('Bills', renderBills));
onAct('bl-show', (el) => { S.bl.show = el.dataset.v; renderBills(); });
onAct('bl-new', () => pickClientThen('Bill from stock — choose the shop', (c) => startBill(c, { kind: 'sale', replace: true })));
onAct('bl-new-for', async (el) => { const c = await fetchClient(el.dataset.id); if (c) startBill(c, { kind: 'sale' }); });
onAct('bl-list-for', async (el) => { const c = await fetchClient(el.dataset.id); if (c) { S.bl = { show: 'all', q: c.trade_name }; showSub('Bills', renderBills); } });
onAct('bl-open', (el) => openBill(el.dataset.id));
onAct('bl-pdf', (el) => makeAndOfferPdf(() => buildBillPdf(el.dataset.id)));
onAct('bl-wa', async (el) => { const got = S.billPage && S.billPage.b.id === el.dataset.id ? S.billPage : await fetchBill(el.dataset.id); if (got) window.open(waUrl((got.b.clients || {}).mobile, billText(got.b, got.lines)), '_blank'); });
onAct('bl-convert', (el) => convertBillQuote(el.dataset.id));
onAct('bl-appr', (el) => quoteToApproval(el.dataset.id));
onAct('bl-edit', (el) => editBill(el.dataset.id));
onAct('bl-close', (el) => closeBill(el.dataset.id, el.dataset.s));
onAct('bf-scan', () => bfScan());
onAct('bf-pick', () => bfPick());
onAct('bf-del', (el) => { keepBillForm(); S.bf.pieces.splice(+el.dataset.i, 1); renderBillForm(); });
onAct('bf-days', (el) => { keepBillForm(); S.bf.return_by = todayStr(+el.dataset.n); renderBillForm(); });
onAct('bf-save', () => saveBill());
onAct('rc-new', (el) => receiptForm(el.dataset.client, el.dataset.bill || null, el.dataset.kind));
onAct('rc-del', (el) => deleteReceipt(el.dataset.id));
onAct('dues-bills', () => showSub('To collect', renderDues));
onAct('dues-wa', (el) => duesReminder(el.dataset.id));
