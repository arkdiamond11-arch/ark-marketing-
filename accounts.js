/* ============================================================
   ACCOUNTS — for the owner only (database update 19)
   · The cost of a piece (diamonds per carat, making) — saved where only
     the owner can read it; on the piece's page and when adding stock.
   · Profit: each sale bill's margin — the wastage gold at the bill's
     rate, diamonds and stones over their cost, labour over making —
     by bill and by shop, for a month. Pieces without a cost are left
     out of that part and counted.
   · GST sales register (for GSTR-1): sales, credit notes and the HSN
     summary of a month, as Excel (CSV) files.
   · Tally: the month's sales, credit notes and money received as Tally
     XML (with the party ledgers), for the accountant to import.
   ============================================================ */
'use strict';

function accOn() { return !!S.dbv19 && isOwner() && typeof billsOn === 'function' && billsOn(); }
const m2s = (x) => (Math.round(num(x) * 100) / 100).toFixed(2);

/* ---------------- the cost of a piece ---------------- */
async function loadCatCost(it) {
  const el = $('#cat-cost');
  if (!el || !accOn()) return;
  const { data } = await db.from('catalogue_costs').select('*').eq('catalogue_id', it.id).maybeSingle();
  if (!$('#cat-cost')) return;
  S.catCost = data || null;
  const c = data || {};
  const bits = [c.dia_cost_rate != null ? 'Diamonds ' + rsWhole(c.dia_cost_rate) + '/ct' : '', c.cs_cost_rate != null ? 'Stones ' + rsWhole(c.cs_cost_rate) + '/ct' : '',
    c.making_cost != null ? 'Making ' + rsWhole(c.making_cost) : '', c.other_cost != null ? 'Other ' + rsWhole(c.other_cost) : ''].filter(Boolean);
  el.innerHTML = '<div class="card cost-card" data-action="cost-edit" data-id="' + it.id + '" role="button"><div class="gr-h"><span>🔒 Cost — only you see this</span><b>' + esc(data ? 'Change' : 'Add') + ' ›</b></div>' +
    (bits.length ? '<div class="gr-v">' + esc(bits.join(' · ')) + '</div>' : '') + '</div>';
}
function costModal(id) {
  const c = S.catCost && S.catCost.catalogue_id === id ? S.catCost : {};
  const f = (k, label) => '<div class="field"><label>' + esc(label) + '</label><input type="text" inputmode="decimal" id="cc-' + k + '" value="' + esc(c[k] != null ? String(num(c[k])) : '') + '"></div>';
  const ov = openModal('<h3>Cost of the piece</h3><p>Only you see this. It is used for the profit on bills and the stock value.</p>' +
    '<div class="o-2col">' + f('dia_cost_rate', 'Diamonds (₹ per ct)') + f('cs_cost_rate', 'Colour stones (₹ per ct)') + f('making_cost', 'Making / labour paid (₹)') + f('other_cost', 'Other (₹)') + '</div>' +
    '<div class="field"><label>Note</label><input type="text" id="cc-note" value="' + esc(c.note || '') + '" autocomplete="off"></div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Save</button></div>');
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    const row = { catalogue_id: id, note: $('#cc-note').value.trim() || null, updated_by: S.me.id, updated_at: new Date().toISOString() };
    for (const k of ['dia_cost_rate', 'cs_cost_rate', 'making_cost', 'other_cost']) {
      const v = numOrNull($('#cc-' + k).value);
      if (v != null && v < 0) { toast('Costs cannot be below zero.', 'err'); return; }
      row[k] = v == null ? null : Math.round(v * 100) / 100;
    }
    e.target.disabled = true;
    const { error } = await db.from('catalogue_costs').upsert(row, { onConflict: 'catalogue_id' });
    if (error) { e.target.disabled = false; toast('Could not save — try again.', 'err'); return; }
    closeModal();
    toast('Cost saved ✓', 'ok');
    loadCatCost({ id });
  };
}

/* ---------------- profit ---------------- */
async function profitData(ms) {
  const next = addMonths(ms, 1);
  const { data: bs } = await db.from('bills').select('id, kind, bill_no, bill_date, client_id, gold_rate, silver_rate, gold_mode, extra_amt, discount_amt, total_amt, clients(trade_name), ' +
    'bill_lines(id, catalogue_id, metal, purity, net_wt, fine_g, gold_amt, dia_ct, dia_amt, cs_ct, cs_amt, labour_amt, return_id)')
    .eq('kind', 'sale').eq('status', 'open').gte('bill_date', ms).lt('bill_date', next).order('bill_date', { ascending: true }).limit(3000);
  const bills = bs || [];
  const ids = Array.from(new Set(bills.flatMap((b) => (b.bill_lines || []).map((l) => l.catalogue_id)).filter(Boolean)));
  const costs = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from('catalogue_costs').select('*').in('catalogue_id', ids.slice(i, i + 200));
    (data || []).forEach((c) => costs.set(c.catalogue_id, c));
  }
  let noCost = 0;
  const rows = bills.map((b) => {
    const kept = (b.bill_lines || []).filter((l) => !l.return_id);
    const x = { b, value: 0, gold: 0, dia: 0, cs: 0, lab: 0, other: 0, extra: 0, missing: 0 };
    kept.forEach((l) => {
      const c = costs.get(l.catalogue_id) || {};
      const rate = l.metal === 'Silver' ? num(b.silver_rate) : num(b.gold_rate);
      // the wastage: fine gold billed (purity + wastage) less the gold in the piece — in milligrams, exactly
      const fineMg = Math.round(num(l.fine_g) * 1000);
      const pureMg = l.purity != null ? Math.round(num(l.net_wt) * 1000) * Math.round(num(l.purity) * 1000) / 100000 : fineMg;
      x.value += num(l.gold_amt) + num(l.dia_amt) + num(l.cs_amt) + num(l.labour_amt);
      x.gold += Math.max(0, fineMg - pureMg) * rate / 1000;
      let miss = false;
      if (num(l.dia_ct) > 0) { if (c.dia_cost_rate != null) x.dia += num(l.dia_amt) - num(l.dia_ct) * num(c.dia_cost_rate); else miss = true; }
      if (num(l.cs_ct) > 0) { if (c.cs_cost_rate != null) x.cs += num(l.cs_amt) - num(l.cs_ct) * num(c.cs_cost_rate); else miss = true; }
      if (c.making_cost != null) x.lab += num(l.labour_amt) - num(c.making_cost); else if (num(l.labour_amt) > 0) miss = true;
      x.other -= num(c.other_cost);
      if (miss) { x.missing++; noCost++; }
    });
    if (kept.length === (b.bill_lines || []).length) { x.extra = num(b.extra_amt) - num(b.discount_amt); x.value += x.extra; }
    x.profit = x.gold + x.dia + x.cs + x.lab + x.other + x.extra;
    return x;
  }).filter((x) => x.value || x.profit);
  return { rows, noCost };
}
async function renderProfit() {
  S.pfMonth = S.pfMonth || monthStart();
  const ms = S.pfMonth;
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const P = await profitData(ms);
  if (!$('#content')) return;
  const t = (k) => P.rows.reduce((s, x) => s + x[k], 0);
  const shops = new Map();
  P.rows.forEach((x) => { const k = (x.b.clients || {}).trade_name || '—'; const a = shops.get(k) || { v: 0, p: 0, n: 0 }; a.v += x.value; a.p += x.profit; a.n++; shops.set(k, a); });
  const row = (k, v, cls) => '<div class="bf-row' + (cls ? ' ' + cls : '') + '"><span>' + esc(k) + '</span><b>' + esc(v) + '</b></div>';
  c.innerHTML = '<div class="section-label sl-row"><span class="tg-month"><button data-action="pf-month" data-d="-1" aria-label="Previous month">‹</button><b>' + esc(monthLabel(ms)) + '</b>' +
    '<button data-action="pf-month" data-d="1" aria-label="Next month"' + (ms >= monthStart() ? ' disabled' : '') + '>›</button></span></div>' +
    '<div class="card bf-total">' + row('Sales (without GST)', rsWhole(t('value'))) + row('Gold (wastage at the bill\'s rate)', rsWhole(t('gold'))) +
    row('Diamonds over cost', rsWhole(t('dia'))) + (t('cs') ? row('Colour stones over cost', rsWhole(t('cs'))) : '') + row('Labour over making', rsWhole(t('lab'))) +
    (t('other') ? row('Other costs', rsWhole(t('other'))) : '') + (t('extra') ? row('Extra less discount', rsWhole(t('extra'))) : '') +
    row('Profit', rsWhole(t('profit')), 'tot') + (t('value') ? row('Margin', (Math.round(t('profit') / t('value') * 1000) / 10) + '%') : '') + '</div>' +
    (P.noCost ? '<div class="notice">' + esc((P.noCost === 1 ? '1 piece has' : P.noCost + ' pieces have') + ' no cost — add it on the piece\'s page; until then that part is not counted.') + '</div>' : '') +
    (shops.size ? '<div class="section-label">By shop</div><div class="card bf-total">' + Array.from(shops.entries()).sort((a, b) => b[1].p - a[1].p)
      .map((e) => row(e[0] + ' · ' + e[1].n, rsWhole(e[1].p) + ' · sales ' + rsWhole(e[1].v))).join('') + '</div>' : '') +
    (P.rows.length ? '<div class="section-label">By bill</div>' + P.rows.slice().reverse().map((x) =>
      '<div class="card rc-item" data-action="bl-open" data-id="' + x.b.id + '" role="button"><div><b>' + esc(billNo(x.b)) + '</b> · ' + esc((x.b.clients || {}).trade_name || '') +
      '<div class="rc-sub">' + esc(fmtD(x.b.bill_date) + ' · ' + rsWhole(x.value) + (x.missing ? ' · cost missing' : '')) + '</div></div><b>' + esc(rsWhole(x.profit)) + '</b></div>').join('')
      : '<div class="empty">No sale bills this month.</div>');
}

/* ---------------- GST sales register (CSV) ---------------- */
function bizStateCode() { return stateCodeFor(S.biz && S.biz.state, S.biz && S.biz.gstin); }
function gstSplit(gstP, shopCode) {
  const same = !shopCode || shopCode === bizStateCode();
  if (!same) return { igst: gstP, cgst: 0, sgst: 0 };
  const half = Math.round(gstP / 2);
  return { igst: 0, cgst: half, sgst: gstP - half };
}
async function monthBills(ms) {
  const next = addMonths(ms, 1);
  const [bs, rs, rc] = await Promise.all([
    db.from('bills').select('*, clients(trade_name, gstin, state, city), bill_lines(gross_wt, net_wt, return_id)').eq('kind', 'sale').eq('status', 'open')
      .gte('bill_date', ms).lt('bill_date', next).order('bill_date', { ascending: true }).order('bill_no', { ascending: true }).limit(5000),
    db.from('bill_returns').select('*, bills(bill_no, kind, bill_date, gst_pct), clients(trade_name, gstin, state)').eq('status', 'open')
      .gte('return_date', ms).lt('return_date', next).order('return_date', { ascending: true }).limit(5000),
    db.from('receipts').select('*, clients(trade_name)').eq('kind', 'money').gte('received_on', ms).lt('received_on', next).order('received_on', { ascending: true }).limit(10000),
  ]);
  return { bills: bs.data || [], returns: rs.data || [], receipts: rc.data || [] };
}
async function exportGst(ms) {
  const M = await monthBills(ms);
  const tag = ms.slice(0, 7);
  const P = (x) => Math.round(num(x) * 100);
  const rows = M.bills.map((b) => {
    const cl = b.clients || {}, code = stateCodeFor(cl.state, cl.gstin), s = gstSplit(P(b.gst_amt), code);
    return [billNo(b), b.bill_date, cl.trade_name || '', cl.gstin || '', cl.gstin ? 'B2B' : 'B2C', code ? code + '-' + (GST_STATE_CODES[code] || '') : '', m2s(b.gst_pct),
      m2s(b.taxable_amt), m2s(s.igst / 100), m2s(s.cgst / 100), m2s(s.sgst / 100), m2s((P(b.taxable_amt) + P(b.gst_amt)) / 100), m2s(b.total_amt), b.gold_mode === 'metal' ? num(b.fine_due_g).toFixed(3) : ''];
  });
  downloadFile('bj-gst-sales-' + tag + '.csv', buildCsv(['Invoice no', 'Invoice date', 'Party', 'GSTIN', 'Type', 'Place of supply', 'GST rate %', 'Taxable value', 'IGST', 'CGST', 'SGST',
    'Invoice value', 'Money billed', 'Raw gold billed (g fine)'], rows));
  await new Promise((r) => setTimeout(r, 450));
  downloadFile('bj-gst-credit-notes-' + tag + '.csv', buildCsv(['Note no', 'Note date', 'Against invoice', 'Invoice date', 'Party', 'GSTIN', 'Place of supply', 'GST rate %', 'Taxable value', 'IGST', 'CGST', 'SGST', 'Note value'],
    M.returns.map((r) => {
      const cl = r.clients || {}, code = stateCodeFor(cl.state, cl.gstin), s = gstSplit(P(r.gst_amt), code), b = r.bills || {};
      return [cnNo(r), r.return_date, billNo(b), b.bill_date || '', cl.trade_name || '', cl.gstin || '', code ? code + '-' + (GST_STATE_CODES[code] || '') : '', m2s(b.gst_pct),
        m2s(r.taxable_amt), m2s(s.igst / 100), m2s(s.cgst / 100), m2s(s.sgst / 100), m2s((P(r.taxable_amt) + P(r.gst_amt)) / 100)];
    })));
  await new Promise((r) => setTimeout(r, 450));
  const h = { qty: 0, tax: 0, igst: 0, cgst: 0, sgst: 0, val: 0 };
  M.bills.forEach((b) => {
    const cl = b.clients || {}, s = gstSplit(P(b.gst_amt), stateCodeFor(cl.state, cl.gstin));
    h.qty += (b.bill_lines || []).reduce((x, l) => x + num(l.gross_wt), 0);
    h.tax += P(b.taxable_amt); h.igst += s.igst; h.cgst += s.cgst; h.sgst += s.sgst; h.val += P(b.taxable_amt) + P(b.gst_amt);
  });
  downloadFile('bj-gst-hsn-' + tag + '.csv', buildCsv(['HSN', 'Description', 'UQC', 'Total quantity', 'Total value', 'Taxable value', 'IGST', 'CGST', 'SGST'],
    M.bills.length ? [['7113', 'Articles of jewellery', 'GMS', h.qty.toFixed(3), m2s(h.val / 100), m2s(h.tax / 100), m2s(h.igst / 100), m2s(h.cgst / 100), m2s(h.sgst / 100)]] : []));
  toast('3 files saved ✓ — sales, credit notes, HSN', 'ok');
}

/* ---------------- Tally (XML) ---------------- */
const TALLY_DEF = { sales: 'Sales - Jewellery', returns: 'Sales Returns', cgst: 'Output CGST', sgst: 'Output SGST', igst: 'Output IGST', round: 'Round Off', cash: 'Cash', bank: 'Bank', group: 'Sundry Debtors' };
function tallyNames() { try { return Object.assign({}, TALLY_DEF, JSON.parse(localStorage.getItem('tallyNames') || '{}')); } catch (e) { return Object.assign({}, TALLY_DEF); } }
function xmlEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }
function tDate(ds) { return String(ds || '').replace(/-/g, ''); }
function tEntry(ledger, amountP, debit) {   // Tally: a debit is negative with ISDEEMEDPOSITIVE Yes
  return '<ALLLEDGERENTRIES.LIST><LEDGERNAME>' + xmlEsc(ledger) + '</LEDGERNAME><ISDEEMEDPOSITIVE>' + (debit ? 'Yes' : 'No') + '</ISDEEMEDPOSITIVE><AMOUNT>' +
    (debit ? '-' : '') + (Math.abs(amountP) / 100).toFixed(2) + '</AMOUNT></ALLLEDGERENTRIES.LIST>';
}
function tVoucher(type, no, date, party, narration, entries) {
  return '<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="' + xmlEsc(type) + '" ACTION="Create"><DATE>' + tDate(date) + '</DATE><VOUCHERTYPENAME>' + xmlEsc(type) + '</VOUCHERTYPENAME>' +
    '<VOUCHERNUMBER>' + xmlEsc(no) + '</VOUCHERNUMBER><PARTYLEDGERNAME>' + xmlEsc(party) + '</PARTYLEDGERNAME><PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>' +
    '<NARRATION>' + xmlEsc(narration) + '</NARRATION>' + entries.join('') + '</VOUCHER></TALLYMESSAGE>';
}
function tEnvelope(report, body) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>' + report +
    '</REPORTNAME></REQUESTDESC><REQUESTDATA>' + body + '</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>\n';
}
/* GST of a bill or a return, split by the party's state */
function taxEntries(N, gstP, code, debit) {
  const s = gstSplit(gstP, code);
  return [s.igst ? tEntry(N.igst, s.igst, debit) : '', s.cgst ? tEntry(N.cgst, s.cgst, debit) : '', s.sgst ? tEntry(N.sgst, s.sgst, debit) : ''].filter(Boolean);
}
async function exportTally(ms) {
  const N = tallyNames();
  const M = await monthBills(ms);
  const P = (x) => Math.round(num(x) * 100);
  const party = (cl) => (cl && cl.trade_name) || 'Cash Sales';
  const parties = new Map();
  M.bills.forEach((b) => parties.set(party(b.clients), b.clients || {}));
  M.returns.forEach((r) => parties.set(party(r.clients), r.clients || {}));
  M.receipts.forEach((r) => parties.set(party(r.clients), r.clients || {}));
  const ledgers = Array.from(parties.entries()).map(([name, cl]) => '<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="' + xmlEsc(name) + '" ACTION="Create"><NAME.LIST><NAME>' + xmlEsc(name) +
    '</NAME></NAME.LIST><PARENT>' + xmlEsc(N.group) + '</PARENT>' + (cl.gstin ? '<PARTYGSTIN>' + xmlEsc(cl.gstin) + '</PARTYGSTIN>' : '') +
    (cl.state ? '<LEDSTATENAME>' + xmlEsc(cl.state) + '</LEDSTATENAME>' : '') + '</LEDGER></TALLYMESSAGE>').join('');
  const v = [];
  M.bills.forEach((b) => {
    const cl = b.clients || {}, code = stateCodeFor(cl.state, cl.gstin), total = P(b.total_amt), gst = P(b.gst_amt), ro = P(b.round_off);
    const goods = total - gst - ro;   // the money part of the goods (in a bill paid in raw gold, without the gold)
    v.push(tVoucher('Sales', billNo(b), b.bill_date, party(cl), (b.gold_mode === 'metal' ? 'Gold paid in raw gold: ' + num(b.fine_due_g).toFixed(3) + ' g fine. ' : '') + 'Ready-stock bill',
      [tEntry(party(cl), total, true), tEntry(N.sales, goods, false)].concat(taxEntries(N, gst, code, false), ro ? [tEntry(N.round, ro, ro < 0)] : [])));
  });
  M.returns.forEach((r) => {
    const cl = r.clients || {}, code = stateCodeFor(cl.state, cl.gstin), total = P(r.money_amt), gst = P(r.gst_amt), ro = P(r.round_off);
    v.push(tVoucher('Credit Note', cnNo(r), r.return_date, party(cl), 'Goods returned against ' + billNo(r.bills || {}) + (num(r.fine_g) ? '; gold credit ' + num(r.fine_g).toFixed(3) + ' g fine' : ''),
      [tEntry(N.returns, total - gst - ro, true)].concat(taxEntries(N, gst, code, true), ro ? [tEntry(N.round, ro, ro > 0)] : [], [tEntry(party(cl), total, false)])));
  });
  M.receipts.forEach((r) => {
    const cl = r.clients || {}, a = P(r.amount);
    v.push(tVoucher('Receipt', 'RC-' + String(r.id).slice(0, 8), r.received_on, party(cl), [payModeLabel(r.mode), r.ref_no || ''].filter(Boolean).join(' '),
      [tEntry(r.mode === 'cash' ? N.cash : N.bank, a, true), tEntry(party(cl), a, false)]));
  });
  const tag = ms.slice(0, 7);
  downloadFile('bj-tally-ledgers-' + tag + '.xml', tEnvelope('All Masters', ledgers));
  await new Promise((r) => setTimeout(r, 450));
  downloadFile('bj-tally-vouchers-' + tag + '.xml', tEnvelope('Vouchers', v.join('')));
  toast('2 Tally files saved ✓ — import the ledgers first', 'ok');
}
function renderAccExports() {
  S.axMonth = S.axMonth || addMonths(monthStart(), -1);
  const ms = S.axMonth, N = tallyNames();
  const f = (k, label) => '<div class="field"><label>' + esc(label) + '</label><input type="text" data-tn="' + k + '" value="' + esc(N[k]) + '" autocomplete="off"></div>';
  $('#content').innerHTML = '<div class="section-label sl-row"><span class="tg-month"><button data-action="ax-month" data-d="-1" aria-label="Previous month">‹</button><b>' + esc(monthLabel(ms)) + '</b>' +
    '<button data-action="ax-month" data-d="1" aria-label="Next month"' + (ms >= monthStart() ? ' disabled' : '') + '>›</button></span></div>' +
    '<div class="card"><b>GST sales register</b><div class="hint" style="margin:4px 0 10px">Sales (B2B and B2C), credit notes and the HSN summary — for GSTR-1. Opens in Excel.</div>' +
    '<button class="btn btn-primary" data-action="ax-gst">Save 3 files</button></div>' +
    '<div class="card" style="margin-top:12px"><b>Tally</b><div class="hint" style="margin:4px 0 10px">Sales, credit notes and money received as Tally vouchers, with the party ledgers. ' +
    'Check the ledger names match your Tally (Gateway of Tally → Import Data).</div>' +
    '<div class="o-2col">' + f('sales', 'Sales ledger') + f('returns', 'Returns ledger') + f('cgst', 'CGST ledger') + f('sgst', 'SGST ledger') + f('igst', 'IGST ledger') +
    f('round', 'Round off ledger') + f('cash', 'Cash ledger') + f('bank', 'Bank ledger') + f('group', 'Party group') + '</div>' +
    '<button class="btn btn-primary" data-action="ax-tally">Save Tally files</button></div>';
  document.querySelectorAll('[data-tn]').forEach((i) => i.addEventListener('change', () => {
    const cur = tallyNames();
    document.querySelectorAll('[data-tn]').forEach((x) => { cur[x.dataset.tn] = x.value.trim() || TALLY_DEF[x.dataset.tn]; });
    try { localStorage.setItem('tallyNames', JSON.stringify(cur)); } catch (e) { /* private mode */ }
  }));
}

onAct('cost-edit', (el) => costModal(el.dataset.id));
onAct('pf-open', () => { S.pfMonth = monthStart(); showSub('Profit', renderProfit); });
onAct('pf-month', (el) => { S.pfMonth = addMonths(S.pfMonth || monthStart(), +el.dataset.d); renderProfit(); });
onAct('ax-open', () => showSub('GST and Tally', renderAccExports));
onAct('ax-month', (el) => { S.axMonth = addMonths(S.axMonth || monthStart(), +el.dataset.d); renderAccExports(); });
onAct('ax-gst', () => exportGst(S.axMonth || monthStart()));
onAct('ax-tally', () => exportTally(S.axMonth || monthStart()));
