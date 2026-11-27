/* ============================================================
   RETURNS, STATEMENTS, LIMITS (database update 19)
   · Pieces came back from a sale bill → a credit note (CN-0001): the
     pieces are back in stock, the shop owes less money (and less fine
     gold on a bill paid in raw gold). PDF and WhatsApp. Cancel (owner
     or who made it) while the pieces are still free.
   · A shop's statement for a month / any dates: opening balance, bills,
     money and gold received, returns, closing balance — PDF.
   · Before a sale bill is saved: a warning when it takes the shop over
     its bill limit, when the shop is on hold, or when bills are overdue.
   ============================================================ */
'use strict';

function cnNo(r) { return 'CN-' + String((r && r.return_no) || 0).padStart(4, '0'); }
function returnsOn() { return !!S.dbv19 && typeof billsOn === 'function' && billsOn(); }

/* ---------------- a return ---------------- */
function returnForm(billId) {
  const got = S.billPage && S.billPage.b.id === billId ? S.billPage : null;
  if (!got) return;
  const left = got.lines.filter((l) => !l.return_id);
  if (!left.length) { toast('Every piece on this bill is already returned.', 'err'); return; }
  const ov = openModal('<h3>Pieces came back</h3><p>' + esc(billNo(got.b) + ' · ' + ((got.b.clients || {}).trade_name || '')) + '</p>' +
    '<div class="st-choose">' + left.map((l) => '<button type="button" class="st-ch" data-id="' + l.id + '">' +
      (l.photo_path ? '<img data-catimg="' + esc(l.photo_path) + '" alt="">' : '<span class="cat-noimg">💍</span>') +
      '<span><b>' + esc(pieceTitle(l)) + '</b><span>' + esc(inrNum(l.line_amt) + (num(l.fine_g) && got.b.gold_mode === 'metal' ? ' + ' + grams(l.fine_g) + ' fine' : '')) + '</span></span>' +
      '<span class="st-ck">✓</span></button>').join('') + '</div>' +
    '<div class="field"><label>Why (optional)</label><input type="text" id="rt-why" maxlength="300" autocomplete="off" placeholder="e.g. Customer did not like the finish"></div>' +
    '<div class="field"><label>Date</label><input type="date" id="rt-date" value="' + todayStr() + '"></div>' +
    '<div class="hint" style="margin:-4px 0 12px">The pieces go back into the stock. When every piece comes back, so do the extra charges and the discount.</div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Make credit note</button></div>');
  fillCatImages(ov);
  const sel = new Set();
  ov.querySelectorAll('.st-ch').forEach((b) => { b.onclick = () => { if (sel.has(b.dataset.id)) sel.delete(b.dataset.id); else sel.add(b.dataset.id); b.classList.toggle('on', sel.has(b.dataset.id)); }; });
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    if (!sel.size) { toast('Tap the pieces that came back.', 'err'); return; }
    e.target.disabled = true;
    const { data, error } = await db.rpc('bill_return', { p: { bill_id: billId, line_ids: Array.from(sel), reason: $('#rt-why').value.trim() || null, return_date: $('#rt-date').value || todayStr() } });
    if (error || !data) { e.target.disabled = false; toast(rpcMsg(error), 'err'); return; }
    closeModal();
    toast(cnNo(data) + ' saved ✓', 'ok');
    openBill(billId, true);
  };
}
async function loadBillReturns(b) {
  const el = $('#bl-returns');
  if (!el || !returnsOn()) return;
  const { data } = await db.from('bill_returns').select('*').eq('bill_id', b.id).order('return_no', { ascending: true });
  const rs = data || [];
  if (!$('#bl-returns')) return;
  if (!rs.length) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="section-label">Returns</div>' + rs.map((r) => {
    const can = r.status === 'open' && (isOwner() || r.created_by === S.me.id);
    return '<div class="card rc-item' + (r.status !== 'open' ? ' closed' : '') + '"><div><b>' + esc(cnNo(r)) + '</b> · ' + esc((r.pieces === 1 ? '1 piece' : r.pieces + ' pieces') + ' · ' + inrNum(r.money_amt) +
      (num(r.fine_g) ? ' + ' + grams(r.fine_g) + ' fine' : '')) +
      '<div class="rc-sub">' + esc([fmtD(r.return_date), nameOf(r.created_by), r.reason || '', r.status !== 'open' ? 'Cancelled' : ''].filter(Boolean).join(' · ')) + '</div></div>' +
      '<span class="rt-acts"><button class="btn btn-small btn-ghost" data-action="rt-pdf" data-id="' + r.id + '">PDF</button>' +
      (can ? '<button class="btn btn-small btn-ghost" data-action="rt-cancel" data-id="' + r.id + '" data-bill="' + b.id + '">Cancel</button>' : '') + '</span></div>';
  }).join('');
}
function cancelReturn(id, billId) {
  confirmModal('Cancel this return?', 'The pieces go back on the bill as sold, and the shop owes the amount again.', 'Cancel return', async () => {
    const { error } = await db.rpc('return_cancel', { p_id: id });
    if (error) { toast(rpcMsg(error), 'err'); return; }
    toast('Return cancelled', 'ok');
    openBill(billId, true);
  }, true);
}
async function buildReturnPdf(id) {
  const { data: r } = await db.from('bill_returns').select('*').eq('id', id).maybeSingle();
  if (!r) throw new Error('return');
  const got = await fetchBill(r.bill_id);
  if (!got) throw new Error('bill');
  const b = got.b, cl = b.clients || {}, metal = b.gold_mode === 'metal';
  const lines = got.lines.filter((l) => l.return_id === r.id);
  const d = await pdfStart('CREDIT NOTE', [['Credit note no.', cnNo(r)], ['Date', pDate(r.return_date)], ['Against invoice', billNo(b) + ' (' + pDate(b.bill_date) + ')']], r.status !== 'open' ? 'CANCELLED' : 'Goods returned');
  pTwoParties(d, 'FROM', bizLines(), 'TO', clientLines(cl));
  const m2 = (x) => num(x).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cols = [{ h: '#', w: 7 }, { h: 'Piece', w: 0 }, { h: 'Gross g', w: 17, a: 'right' }, { h: 'Net g', w: 17, a: 'right' }, { h: metal ? 'Fine g' : 'Gold Rs.', w: 22, a: 'right' },
    { h: 'Dia + CS Rs.', w: 24, a: 'right' }, { h: 'Labour Rs.', w: 20, a: 'right' }, { h: 'Amount Rs.', w: 24, a: 'right' }];
  cols[1].w = PG_W - PM * 2 - cols.reduce((a, x) => a + x.w, 0);
  const rows = lines.map((l, i) => [String(i + 1), [l.category, l.tag_no].filter(Boolean).join(' ') + (l.design_no ? ' · Design ' + l.design_no : ''),
    l.gross_wt != null ? pG(l.gross_wt) : '', l.net_wt != null ? pG(l.net_wt) : '', metal && l.metal !== 'Silver' ? pG(l.fine_g) : m2(l.gold_amt), m2(num(l.dia_amt) + num(l.cs_amt)), m2(l.labour_amt), m2(l.line_amt)]);
  d.table(cols, rows, { size: 7.6 });
  const T = [['Value of the goods returned', m2(r.goods_amt)]];
  if (num(r.taxable_amt) !== num(r.goods_amt)) T.push(['Taxable value (with the gold)', m2(r.taxable_amt)]);
  if (num(r.gst_amt)) {
    const st = cl.state || stateFromGstin(cl.gstin), bst = (S.biz && S.biz.state) || stateFromGstin(S.biz && S.biz.gstin);
    if (sameState(st, bst)) {
      const half = Math.round(num(r.gst_amt) * 100 / 2);
      T.push(['CGST ' + num(b.gst_pct) / 2 + '%', m2(half / 100)], ['SGST ' + num(b.gst_pct) / 2 + '%', m2((Math.round(num(r.gst_amt) * 100) - half) / 100)]);
    } else T.push(['IGST ' + num(b.gst_pct) + '%', m2(r.gst_amt)]);
  }
  if (num(r.round_off)) T.push(['Round off', (num(r.round_off) > 0 ? '+ ' : '- ') + m2(Math.abs(num(r.round_off)))]);
  T.push(['Credit', 'Rs. ' + m2(r.money_amt), 'total']);
  if (num(r.fine_g)) T.push(['Gold credit', pG(r.fine_g) + ' g fine', 'bold']);
  pTotals(d, T);
  pNote(d, 'AMOUNT IN WORDS', 'Rupees ' + rupeesInWords(num(r.money_amt)) + ' Only' + (num(r.fine_g) ? ' — and ' + pG(r.fine_g) + ' g fine gold' : ''));
  pNote(d, 'REASON', r.reason);
  pSignatures(d, 'Goods received back - signature');
  return { pdf: d, name: safeFileName(cnNo(r) + ' ' + (cl.trade_name || '') + ' - Credit note') + '.pdf', text: 'Credit note ' + cnNo(r) + ' from ' + bizName() };
}

/* ---------------- a shop's statement ---------------- */
function statementForm(clientId) {
  const ms = monthStart(), lm = addMonths(ms, -1);
  const opts = [['This month', ms, todayStr()], ['Last month', lm, addDaysStr(ms, -1)], ['Last 3 months', addMonths(ms, -2), todayStr()], ['From the start', '2000-01-01', todayStr()]];
  let pick = 0;
  const ov = openModal('<h3>Statement</h3><div class="bf-days">' + opts.map((o, i) => '<button type="button" class="chip-btn' + (i ? '' : ' on') + '" data-i="' + i + '">' + esc(o[0]) + '</button>').join('') + '</div>' +
    '<div class="o-2col"><div class="field"><label>From</label><input type="date" id="stm-from" value="' + opts[0][1] + '"></div><div class="field"><label>To</label><input type="date" id="stm-to" value="' + opts[0][2] + '"></div></div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Make PDF</button></div>');
  ov.querySelectorAll('.chip-btn').forEach((b) => { b.onclick = () => {
    pick = +b.dataset.i; ov.querySelectorAll('.chip-btn').forEach((x) => x.classList.toggle('on', x === b));
    $('#stm-from').value = opts[pick][1]; $('#stm-to').value = opts[pick][2];
  }; });
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = () => {
    const from = $('#stm-from').value || ms, to = $('#stm-to').value || todayStr();
    if (to < from) { toast('The dates are the wrong way round.', 'err'); return; }
    closeModal();
    makeAndOfferPdf(() => buildStatementPdf(clientId, from, to));
  };
}
function addDaysStr(ds, n) { const d = new Date(ds + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
async function statementData(clientId, from, to) {
  const [cl, bs, rs, ts] = await Promise.all([
    fetchClient(clientId),
    db.from('bills').select('id, kind, bill_no, status, bill_date, gold_mode, fine_due_g, total_amt').eq('client_id', clientId).eq('kind', 'sale').eq('status', 'open').lte('bill_date', to).limit(5000),
    db.from('receipts').select('*').eq('client_id', clientId).lte('received_on', to).limit(5000),
    returnsOn() ? db.from('bill_returns').select('*, bills!inner(status)').eq('client_id', clientId).eq('status', 'open').eq('bills.status', 'open').lte('return_date', to).limit(5000) : Promise.resolve({ data: [] }),
  ]);
  const ev = [];
  (bs.data || []).forEach((b) => ev.push({ d: b.bill_date, k: 0, t: 'Bill ' + billNo(b), p: Math.round(num(b.total_amt) * 100), m: b.gold_mode === 'metal' ? Math.round(num(b.fine_due_g) * 1000) : 0 }));
  (rs.data || []).forEach((r) => ev.push({ d: r.received_on, k: 1, t: r.kind === 'money' ? 'Received — ' + payModeLabel(r.mode) + (r.ref_no ? ' ' + r.ref_no : '') : r.kind === 'metal' ? 'Raw gold received (' + num(r.metal_g) + ' g at ' + num(r.metal_purity) + '%)' : 'Gold paid in money (' + inrNum(r.amount) + ')',
    p: r.kind === 'money' ? -Math.round(num(r.amount) * 100) : 0, m: r.kind === 'money' ? 0 : -Math.round(num(r.fine_g) * 1000) }));
  (ts.data || []).forEach((r) => ev.push({ d: r.return_date, k: 2, t: 'Return ' + cnNo(r), p: -Math.round(num(r.money_amt) * 100), m: -Math.round(num(r.fine_g) * 1000) }));
  const op = typeof loadOpening === 'function' ? await loadOpening(clientId) : null;   // old dues before the app (update 22): the first line
  if (op && op.as_on <= to) ev.push({ d: op.as_on, k: -1, t: 'Old dues (before the app)' + (op.note ? ' — ' + op.note : ''), p: Math.round(num(op.money_amt) * 100), m: Math.round(num(op.fine_g) * 1000) });
  ev.sort((a, b) => String(a.d).localeCompare(String(b.d)) || a.k - b.k);
  const before = ev.filter((e) => e.d < from), inside = ev.filter((e) => e.d >= from);
  const open = { p: before.reduce((s, e) => s + e.p, 0), m: before.reduce((s, e) => s + e.m, 0) };
  return { cl, open, inside };
}
async function buildStatementPdf(clientId, from, to) {
  const D = await statementData(clientId, from, to);
  const cl = D.cl || {};
  const d = await pdfStart('STATEMENT OF ACCOUNT', [['From', pDate(from)], ['To', pDate(to)]], '');
  pTwoParties(d, 'FROM', bizLines(), 'TO', clientLines(cl));
  const m2 = (p) => (p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const g3 = (m) => (m / 1000).toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  const anyGold = D.open.m !== 0 || D.inside.some((e) => e.m);
  const cols = [{ h: 'Date', w: 22 }, { h: 'Details', w: 0 }, { h: 'Debit Rs.', w: 24, a: 'right' }, { h: 'Credit Rs.', w: 24, a: 'right' }, { h: 'Balance Rs.', w: 26, a: 'right' }]
    .concat(anyGold ? [{ h: 'Gold g', w: 18, a: 'right' }, { h: 'Gold bal. g', w: 20, a: 'right' }] : []);
  cols[1].w = PG_W - PM * 2 - cols.reduce((a, x) => a + x.w, 0);
  let p = D.open.p, m = D.open.m;
  const rows = [[pDate(from), 'Opening balance', '', '', m2(p)].concat(anyGold ? ['', g3(m)] : [])];
  rows[0].bold = true;
  D.inside.forEach((e) => {
    p += e.p; m += e.m;
    rows.push([pDate(e.d), e.t, e.p > 0 ? m2(e.p) : '', e.p < 0 ? m2(-e.p) : '', m2(p)].concat(anyGold ? [e.m ? (e.m > 0 ? '' : '- ') + g3(Math.abs(e.m)) : '', g3(m)] : []));
  });
  const last = [pDate(to), 'Closing balance', '', '', m2(p)].concat(anyGold ? ['', g3(m)] : []);
  last.bold = true;
  rows.push(last);
  d.table(cols, rows, { size: 7.6 });
  pTotals(d, [[p >= 0 ? 'Amount due' : 'Paid in advance', 'Rs. ' + m2(Math.abs(p)), 'total']].concat(anyGold && m ? [[m >= 0 ? 'Fine gold due' : 'Fine gold in advance', g3(Math.abs(m)) + ' g', 'bold']] : []));
  if (S.biz && S.biz.bank_details) pNote(d, 'BANK DETAILS', S.biz.bank_details);
  const text = 'Statement ' + fmtD(from) + ' – ' + fmtD(to) + ' from ' + bizName() + '\n' + (p >= 0 ? 'Amount due: ' : 'Paid in advance: ') + inr(Math.abs(p)) +
    (anyGold && m ? '\n' + (m >= 0 ? 'Fine gold due: ' : 'Fine gold in advance: ') + gM(Math.abs(m)) : '');
  return { pdf: d, name: safeFileName('Statement ' + (cl.trade_name || '') + ' ' + from + ' to ' + to) + '.pdf', text };
}

/* ---------------- before a sale bill is saved ---------------- */
function overdueBills(L) {
  const t = todayStr();
  return L.bills.filter((b) => b.kind === 'sale' && b.status === 'open' && b.pay_by && b.pay_by < t)
    .filter((b) => { const x = L.per.get(b.id); return x && (x.dueP - x.paidP > 50 || x.dueM - x.paidM > 0); });
}
async function billCreditCheck(clientId, totalP, editId) {
  if (!returnsOn()) return '';
  let cr, L;
  try { [cr, L] = await Promise.all([db.from('clients').select('bill_limit, credit_hold, credit_note').eq('id', clientId).maybeSingle(), clientLedger(clientId)]); } catch (e) { return ''; }
  const c = (cr && cr.data) || {};
  let dueP = L.moneyDueP;
  if (editId && L.per.get(editId)) dueP -= L.per.get(editId).dueP;
  const after = dueP + totalP;
  const out = [];
  if (c.credit_hold) out.push('This shop is on hold' + (c.credit_note ? ': ' + c.credit_note : '') + '.');
  if (c.bill_limit != null && after > Math.round(num(c.bill_limit) * 100)) out.push('With this bill the shop owes ' + inr(after) + ', over its limit of ' + inrNum(c.bill_limit) + '.');
  const late = overdueBills(L);
  if (late.length) out.push(late.length === 1 ? '1 bill is past its pay-by date.' : late.length + ' bills are past their pay-by date.');
  return out.join(' ');
}

onAct('rt-new', (el) => returnForm(el.dataset.id));
onAct('rt-pdf', (el) => makeAndOfferPdf(() => buildReturnPdf(el.dataset.id)));
onAct('rt-cancel', (el) => cancelReturn(el.dataset.id, el.dataset.bill));
onAct('stm-new', (el) => statementForm(el.dataset.id));
