/* ============================================================
   PURCHASE AND CASH & BANK (database update 21)
   · Purchase: what you buy from suppliers (gold, silver, diamonds, stones,
     findings, anything else) with the supplier's bill photo; what you owed
     a supplier before the app; what you owe each supplier now, and paying
     them. Gold and silver bought go into the gold register by themselves.
   · Cash & Bank: the cash account and your bank accounts with their
     opening balance; money in and out that is not a shop's payment (rent,
     salary, suppliers, petrol, tea…); moving money between accounts; the
     day book. Shops' payments come in by themselves (cash: when the owner
     took it, or when the team handed it over; bank / UPI / cheque / card:
     into the main bank account), expense claims paid go out of cash.
   · Who sees which department (hasDept): the owner chooses for each person.
   ============================================================ */
'use strict';

const DEPT_LOCKED = ['purchase', 'cash', 'hr'];   // not in "the usual departments"
function hasDept(k) {
  if (!S.me) return false;
  if (isOwner() || k === 'work' || k === 'settings') return true;
  const d = S.me.depts;
  return Array.isArray(d) ? d.indexOf(k) > -1 : DEPT_LOCKED.indexOf(k) < 0;
}
function purchaseOn() { return !!S.dbv21 && hasDept('purchase'); }
function moneyOn() { return !!S.dbv21 && hasDept('cash'); }
const P100 = (x) => Math.round(num(x) * 100);   // ₹ → paise

/* ---------------- suppliers (the vendors list) ---------------- */
/* loadVendors() and vendorName() are in vendors.js */
function vendorOptions(sel) {
  return '<option value="">— Choose the supplier —</option>' + (S.vendors || []).filter((v) => v.active || v.id === sel)
    .map((v) => '<option value="' + v.id + '"' + (v.id === sel ? ' selected' : '') + ' class="noi18n">' + esc(v.name + (v.city ? ' · ' + v.city : '')) + '</option>').join('') +
    '<option value="__new">＋ New supplier…</option>';
}
/* a new supplier in one step; onDone(id) */
function newVendorModal(onDone) {
  const ov = openModal('<h3>New supplier</h3>' +
    '<div class="field"><label>Name <span class="req">*</span></label><input type="text" id="nv-name" autocomplete="off" maxlength="80" placeholder="e.g. Shree Bullion"></div>' +
    '<div class="field"><label>City</label><input type="text" id="nv-city" autocomplete="off" maxlength="60"></div>' +
    '<div class="field"><label>Phone</label><input type="tel" id="nv-phone" autocomplete="off" maxlength="20"></div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Add</button></div>');
  ov.querySelector('[data-m=no]').onclick = () => { closeModal(); onDone(null); };
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    const name = $('#nv-name').value.trim();
    if (!name) { toast('Write the supplier\'s name.', 'err'); return; }
    e.target.disabled = true;
    const { data, error } = await db.from('vendors').insert({ name, city: $('#nv-city').value.trim() || null, phone: $('#nv-phone').value.trim() || null, created_by: S.me.id }).select('id').single();
    if (error) { e.target.disabled = false; toast(/duplicate/i.test(error.message || '') ? 'This supplier is already in the list.' : 'Could not save — try again.', 'err'); return; }
    closeModal();
    await loadVendors();
    onDone(data.id);
  };
}
function wireVendorSelect(sel, onNew) {
  if (!sel) return;
  sel.addEventListener('change', () => {
    if (sel.value !== '__new') return;
    newVendorModal((id) => { sel.innerHTML = vendorOptions(id || ''); if (onNew) onNew(id); });
  });
}

/* ---------------- purchases ---------------- */
const PU_KINDS = [['gold', 'Gold'], ['silver', 'Silver'], ['diamond', 'Diamonds'], ['stone', 'Stones'], ['findings', 'Findings'], ['other', 'Other'], ['opening', 'Old dues']];
const puKind = (k) => (PU_KINDS.find((x) => x[0] === k) || [k, k])[1];
function puWhat(p) {
  const bits = [puKind(p.kind)];
  if (p.weight_g != null) bits.push(grams(p.weight_g) + (p.purity != null ? ' · ' + num(p.purity) + '%' : ''));
  if (p.carats != null) bits.push(num(p.carats) + ' ct');
  if (p.pcs != null) bits.push(p.pcs + ' pcs');
  return bits.join(' · ');
}
async function renderPurchases() {
  S.puMonth = S.puMonth || monthStart();
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const ms = S.puMonth, me = addMonths(ms, 1);
  const [{ data, error }] = await Promise.all([
    db.from('purchases').select('*').gte('bill_date', ms).lt('bill_date', me).order('bill_date', { ascending: false }).order('created_at', { ascending: false }).limit(2000),
    loadVendors(),
  ]);
  if (!$('#content')) return;
  if (error) { c.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  const list = data || [];
  const tot = list.filter((p) => p.kind !== 'opening').reduce((s, p) => s + P100(p.total), 0);
  const fine = list.filter((p) => p.kind === 'gold').reduce((s, p) => s + Math.round(num(p.fine_g) * 1000), 0);
  const ct = list.filter((p) => p.kind === 'diamond').reduce((s, p) => s + num(p.carats), 0);
  c.innerHTML = '<div class="action-row"><button class="btn btn-primary" data-action="pu-new">＋ New purchase</button><button class="btn btn-secondary" data-action="pu-dues">What you owe</button></div>' +
    '<div class="section-label sl-row"><span class="tg-month"><button data-action="pu-month" data-d="-1" aria-label="Month before">‹</button><b>' + esc(monthLabel(ms)) + '</b>' +
    '<button data-action="pu-month" data-d="1" aria-label="Next month"' + (ms >= monthStart() ? ' disabled' : '') + '>›</button></span></div>' +
    '<div class="st-tot"><div><b>' + esc(inr(tot)) + '</b><span>Bought</span></div><div><b>' + esc(gM(fine)) + '</b><span>Gold (fine)</span></div>' +
    '<div><b>' + esc((Math.round(ct * 1000) / 1000) + ' ct') + '</b><span>Diamonds</span></div></div>' +
    (list.length ? list.map((p) => '<div class="card rc-item tap" data-action="pu-edit" data-id="' + p.id + '"><div><b>' + esc(inrNum(p.total)) + '</b> · <span class="noi18n">' + esc(vendorName(p.vendor_id) || '—') + '</span>' +
      '<div class="rc-sub">' + esc([fmtD(p.bill_date), puWhat(p)].join(' · ')) + (p.bill_no ? ' · <span class="noi18n">' + esc('#' + p.bill_no) + '</span>' : '') +
      ((p.files || []).length ? ' · 📎' : '') + '</div></div><span class="mr-go">›</span></div>').join('')
      : '<div class="empty">No purchases in this month.</div>');
}
function purchaseForm(p, vendorId) {
  S.pf = p ? Object.assign({}, p, { keep: (p.files || []).slice() }) : { id: null, kind: 'gold', vendor_id: vendorId || '', bill_date: todayStr(), to_register: true, keep: [] };
  woAtt('pu', () => { const el = $('#pu-atts'); if (el) el.innerHTML = woAttHTML(WO_ATT.pu.list, 'pu'); });
  showSub(S.pf.id ? 'Purchase' : 'New purchase', renderPurchaseForm);
}
function renderPurchaseForm() {
  const F = S.pf, k = F.kind, metal = k === 'gold' || k === 'silver', stone = k === 'diamond' || k === 'stone';
  const v = (x) => (x == null ? '' : esc(String(num(x))));
  const pur = k === 'silver' ? ['99.9', '92.5'] : ['99.5', '99.9', '91.6', '75'];
  $('#content').innerHTML = '<div class="card">' +
    '<div class="field"><label>Supplier <span class="req">*</span></label><select id="pu-v">' + vendorOptions(F.vendor_id) + '</select></div>' +
    '<div class="field"><label>What did you buy?</label><div class="seg">' + PU_KINDS.map((x) => '<button type="button" data-action="pu-kind" data-k="' + x[0] + '" class="' + (k === x[0] ? 'on' : '') + '">' + esc(x[1]) + '</button>').join('') + '</div></div>' +
    (k === 'opening' ? '<p class="hint">What you owed this supplier before you started using the app.</p>' : '') +
    '<div class="o-2col"><div class="field"><label>' + (k === 'opening' ? 'As on' : 'Bill date') + '</label><input type="date" id="pu-date" value="' + esc(F.bill_date || todayStr()) + '"></div>' +
    (k === 'opening' ? '' : '<div class="field"><label>Bill no.</label><input type="text" id="pu-no" maxlength="60" autocomplete="off" value="' + esc(F.bill_no || '') + '"></div>') + '</div>' +
    (metal ? '<div class="o-2col"><div class="field"><label>Weight (g) <span class="req">*</span></label><input type="text" inputmode="decimal" id="pu-w" value="' + v(F.weight_g) + '" placeholder="0.000"></div>' +
      '<div class="field"><label>Purity (%) <span class="req">*</span></label><input type="text" inputmode="decimal" id="pu-pur" value="' + v(F.purity) + '" placeholder="99.5"></div></div>' +
      '<div class="wf-quick">' + pur.map((x) => '<button type="button" class="chip-btn" data-action="pu-pur" data-v="' + x + '">' + x + '%</button>').join('') + '</div>' +
      '<div class="hint" id="pu-fine"></div>' : '') +
    (stone ? '<div class="o-2col"><div class="field"><label>Carats</label><input type="text" inputmode="decimal" id="pu-ct" value="' + v(F.carats) + '" placeholder="0.000"></div>' +
      '<div class="field"><label>Pieces</label><input type="text" inputmode="numeric" id="pu-pcs" value="' + (F.pcs || '') + '"></div></div>' : '') +
    '<div class="field"><label>' + (k === 'opening' ? 'Note' : 'Description') + '</label><input type="text" id="pu-d" maxlength="300" autocomplete="off" value="' + esc(F.descr || '') + '" placeholder="' +
      esc(stone ? 'e.g. VVS-EF, 1.5 mm rounds' : k === 'findings' ? 'e.g. screws, locks, chains' : k === 'opening' ? 'Old dues before the app' : '') + '"></div>' +
    (k === 'opening' ? '' : '<div class="field"><label>' + (metal ? 'Rate (₹ per gram)' : stone ? 'Rate (₹ per carat)' : 'Rate') + '</label><input type="text" inputmode="decimal" id="pu-rate" value="' + v(F.rate) + '"></div>') +
    '<div class="o-2col"><div class="field"><label>' + (k === 'opening' ? 'Amount you owed (₹)' : 'Amount (₹, before GST)') + (metal ? '' : ' <span class="req">*</span>') + '</label><input type="text" inputmode="decimal" id="pu-amt" value="' + v(F.amount) + '"></div>' +
    (k === 'opening' ? '' : '<div class="field"><label>GST (₹)</label><div class="in-btn"><input type="text" inputmode="decimal" id="pu-gst" value="' + v(F.gst_amt) + '"><button type="button" class="btn btn-small btn-ghost" data-action="pu-gst3">3%</button></div></div>') + '</div>' +
    '<div class="bf-row sub pu-total"><span>Total</span><b id="pu-tot"></b></div>' +
    (k === 'opening' ? '' : '<div class="field"><label>Pay by</label><input type="date" id="pu-payby" value="' + esc(F.pay_by || '') + '"></div>') +
    (metal ? '<label class="sw-row"><span class="sw-t"><b>Put in the gold register</b><span>As raw ' + (k === 'silver' ? 'silver' : 'gold') + ' in, on the bill date</span></span><input type="checkbox" class="sw" id="pu-reg"' + (F.to_register !== false ? ' checked' : '') + '></label>' : '') +
    '<div class="field"><label>Note</label><input type="text" id="pu-note" maxlength="1000" autocomplete="off" value="' + esc(F.note || '') + '"></div>' +
    '</div>' +
    (k === 'opening' ? '' : '<div class="section-label">The supplier\'s bill</div><div class="card">' + woFilesHTML(F.keep, 'Bill') +
      (F.keep.length ? '<div class="wf-quick">' + F.keep.map((f, i) => '<button type="button" class="chip-btn" data-action="pu-file-x" data-i="' + i + '">✕ <span class="noi18n">' + esc(f.n || 'File') + '</span></button>').join('') + '</div>' : '') +
      '<div class="wo-atts" id="pu-atts">' + woAttHTML(WO_ATT.pu ? WO_ATT.pu.list : [], 'pu') + '</div>' + woPickHTML('pu') + '</div>') +
    '<button class="btn btn-primary" data-action="pu-save" id="pu-save">' + (F.id ? 'Save the changes' : 'Save the purchase') + '</button>' +
    (F.id ? '<button class="btn btn-danger-ghost" data-action="pu-del" style="margin-top:10px">Delete this purchase</button>' : '');
  wireVendorSelect($('#pu-v'), (id) => { S.pf.vendor_id = id || ''; });
  ['pu-w', 'pu-pur', 'pu-ct', 'pu-rate', 'pu-amt', 'pu-gst'].forEach((id) => { const el = $('#' + id); if (el) el.addEventListener('input', () => puCalc(id)); });
  woLoadPics($('#content'));
  puCalc();
}
function puRead() {
  const F = S.pf, val = (id) => { const el = $('#' + id); return el ? el.value : undefined; };
  const n = (id) => { const x = val(id); return x === undefined ? undefined : numOrNull(x); };
  F.vendor_id = val('pu-v') === '__new' ? '' : val('pu-v') || '';
  F.bill_date = val('pu-date') || todayStr();
  if (val('pu-no') !== undefined) F.bill_no = val('pu-no').trim();
  ['weight_g:pu-w', 'purity:pu-pur', 'carats:pu-ct', 'rate:pu-rate', 'amount:pu-amt', 'gst_amt:pu-gst'].forEach((x) => { const [k, id] = x.split(':'); const v = n(id); if (v !== undefined) F[k] = v; });
  const pcs = val('pu-pcs'); if (pcs !== undefined) F.pcs = pcs.trim() ? parseInt(pcs, 10) || null : null;
  F.descr = (val('pu-d') || '').trim();
  if (val('pu-payby') !== undefined) F.pay_by = val('pu-payby') || null;
  if ($('#pu-reg')) F.to_register = $('#pu-reg').checked;
  F.note = (val('pu-note') || '').trim();
}
/* weight × rate → amount; the fine gold; the total */
function puCalc(changed) {
  const F = S.pf, n = (id) => { const el = $('#' + id); return el ? numOrNull(el.value) : null; };
  const metal = F.kind === 'gold' || F.kind === 'silver';
  const qty = metal ? n('pu-w') : n('pu-ct'), rate = n('pu-rate');
  if ((changed === 'pu-rate' || changed === 'pu-w' || changed === 'pu-ct') && qty && rate && $('#pu-amt')) $('#pu-amt').value = String(Math.round(qty * rate * 100) / 100);
  if (metal && $('#pu-fine')) { const w = n('pu-w'), p = n('pu-pur'); $('#pu-fine').textContent = w && p ? 'Fine: ' + grams(Math.round(w * p * 10) / 1000) : ''; }
  const t = $('#pu-tot'); if (t) t.textContent = inr(P100(n('pu-amt') || 0) + P100(n('pu-gst') || 0));
}
async function savePurchase(btn) {
  puRead();
  const F = S.pf, metal = F.kind === 'gold' || F.kind === 'silver';
  if (!F.vendor_id) { toast('Choose the supplier.', 'err'); return; }
  if (metal && (!F.weight_g || F.weight_g <= 0 || !F.purity || F.purity <= 0 || F.purity > 100)) { toast('Write the weight and the purity.', 'err'); return; }
  if (!metal && !(F.amount > 0)) { toast('Write the amount.', 'err'); return; }
  if ((F.amount || 0) < 0 || (F.gst_amt || 0) < 0) { toast('The amount cannot be below zero.', 'err'); return; }
  btn.disabled = true;
  const id = F.id || crypto.randomUUID();
  let files = F.keep.slice(), fails = 0;
  if (WO_ATT.pu && WO_ATT.pu.list.length) { const up = await woUpload('purchase/' + id + '/', WO_ATT.pu.list); files = files.concat(up.files); fails = up.fails; }
  const row = { vendor_id: F.vendor_id, bill_no: F.kind === 'opening' ? null : F.bill_no || null, bill_date: F.bill_date, kind: F.kind, descr: F.descr || (F.kind === 'opening' ? 'Old dues before the app' : null),
    weight_g: metal ? F.weight_g : null, purity: metal ? F.purity : null, carats: F.kind === 'diamond' || F.kind === 'stone' ? F.carats || null : null,
    pcs: F.kind === 'diamond' || F.kind === 'stone' ? F.pcs || null : null, rate: F.kind === 'opening' ? null : F.rate || null, amount: F.amount || 0,
    gst_amt: F.kind === 'opening' ? 0 : F.gst_amt || 0, pay_by: F.kind === 'opening' ? null : F.pay_by || null, to_register: metal ? F.to_register !== false : true, note: F.note || null, files };
  const r = F.id ? await db.from('purchases').update(row).eq('id', id).select('id') : await db.from('purchases').insert(Object.assign({ id, created_by: S.me.id }, row)).select('id');
  if (r.error || !r.data || !r.data.length) { btn.disabled = false; toast('Could not save — check the amounts and try again.', 'err'); return; }
  toast((F.id ? 'Saved ✓' : 'Purchase saved ✓') + (fails ? ' — ' + fails + ' file(s) did not upload' : ''), fails ? 'err' : 'ok');
  goBack();
}

/* ---------------- what you owe each supplier ---------------- */
async function renderSupplierDues() {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const [{ data, error }] = await Promise.all([db.rpc('supplier_dues'), loadVendors()]);
  if (!$('#content')) return;
  if (error) { c.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  const list = data || [], owe = list.reduce((s, x) => s + Math.max(0, P100(x.due)), 0);
  c.innerHTML = '<div class="st-tot"><div><b class="' + (owe ? 'o-red' : '') + '">' + esc(inr(owe)) + '</b><span>You owe suppliers</span></div><div><b>' + list.filter((x) => P100(x.due) > 0).length + '</b><span>Suppliers to pay</span></div></div>' +
    (list.length ? list.map((x) => '<div class="card rc-item tap" data-action="pu-sup" data-id="' + x.vendor_id + '"><div><b class="noi18n">' + esc(x.name) + '</b>' +
      '<div class="rc-sub">' + esc('Bought ' + inrNum(x.bought) + ' · paid ' + inrNum(x.paid)) + '</div></div><b class="' + (P100(x.due) > 0 ? 'o-red' : '') + '">' + esc(inrNum(x.due)) + '</b></div>').join('')
      : '<div class="empty">No purchases yet.</div>');
}
async function renderSupplier(vid) {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const [ps, pays, dues] = await Promise.all([
    db.from('purchases').select('*').eq('vendor_id', vid).order('bill_date', { ascending: false }).limit(500),
    db.from('cash_entries').select('*').eq('vendor_id', vid).eq('head', 'purchase').order('entry_date', { ascending: false }).limit(500),
    db.rpc('supplier_dues'), loadVendors(),
  ]);
  if (!$('#content')) return;
  const d = (dues.data || []).find((x) => x.vendor_id === vid) || { bought: 0, paid: 0, due: 0 };
  setHeader(vendorName(vid) || 'Supplier', true);
  const rows = (ps.data || []).map((p) => ({ d: p.bill_date, at: p.created_at, h: '<div class="card rc-item tap" data-action="pu-edit" data-id="' + p.id + '"><div><b>' + esc(inrNum(p.total)) + '</b> · ' + esc(puWhat(p)) +
    '<div class="rc-sub">' + esc(fmtD(p.bill_date)) + (p.bill_no ? ' · <span class="noi18n">' + esc('#' + p.bill_no) + '</span>' : '') + '</div></div><span class="mr-go">›</span></div>' }))
    .concat((pays.data || []).map((e) => ({ d: e.entry_date, at: e.created_at, h: '<div class="card rc-item tap" data-action="cb-edit" data-id="' + e.id + '"><div><b class="o-green">' + esc('Paid ' + inrNum(e.amount)) + '</b>' +
      '<div class="rc-sub">' + esc(fmtD(e.entry_date)) + (e.ref_no ? ' · <span class="noi18n">' + esc(e.ref_no) + '</span>' : '') + (e.note ? ' · <span class="noi18n">' + esc(e.note) + '</span>' : '') + '</div></div></div>' })))
    .sort((a, b) => (b.d || '').localeCompare(a.d || '') || String(b.at).localeCompare(String(a.at)));
  c.innerHTML = '<div class="st-tot"><div><b class="' + (P100(d.due) > 0 ? 'o-red' : '') + '">' + esc(inrNum(d.due)) + '</b><span>You owe</span></div><div><b>' + esc(inrNum(d.bought)) + '</b><span>Bought</span></div><div><b>' + esc(inrNum(d.paid)) + '</b><span>Paid</span></div></div>' +
    '<div class="action-row"><button class="btn btn-primary" data-action="pu-pay" data-id="' + vid + '" data-due="' + Math.max(0, P100(d.due)) + '">Pay</button><button class="btn btn-secondary" data-action="pu-new" data-v="' + vid + '">＋ New purchase</button></div>' +
    (rows.length ? rows.map((x) => x.h).join('') : '<div class="empty">Nothing yet.</div>');
}

/* ---------------- money accounts, money in / out ---------------- */
async function loadAccounts() {
  const { data } = await db.from('money_accounts').select('*').order('kind', { ascending: false }).order('is_default', { ascending: false }).order('name');
  S.accounts = data || [];
  return S.accounts;
}
function accountOptions(sel) {
  return S.accounts.filter((a) => a.active || a.id === sel).map((a) => '<option value="' + a.id + '"' + (a.id === sel ? ' selected' : '') + ' class="noi18n">' + esc((a.kind === 'cash' ? '💵 ' : '🏦 ') + a.name) + '</option>').join('');
}
const CB_HEADS = {
  out: [['purchase', 'Supplier'], ['salary', 'Salary'], ['advance', 'Advance to staff'], ['bonus', 'Bonus'], ['rent', 'Rent'], ['power', 'Electricity'], ['phone', 'Phone / internet'],
    ['transport', 'Petrol / transport'], ['food', 'Tea / food'], ['repairs', 'Repairs'], ['packing', 'Packing'], ['hallmark', 'Hallmark charges'], ['courier', 'Courier'],
    ['tax', 'Tax / GST paid'], ['bank_charges', 'Bank charges'], ['owner', 'Owner took out'], ['loan', 'Loan'], ['other', 'Other']],
  in: [['sale', 'Sale (not on a bill)'], ['owner', 'Owner put in'], ['loan', 'Loan'], ['other', 'Other']],
};
function cbHead(h, dir) {
  if (h === 'transfer') return 'Moved between accounts';
  const x = (CB_HEADS[dir || 'out'].find((y) => y[0] === h) || CB_HEADS.out.find((y) => y[0] === h) || CB_HEADS.in.find((y) => y[0] === h));
  return x ? x[1] : h;
}
/* staff for salary / advance (HR only) */
async function loadStaffList() {
  if (!hasDept('hr')) return [];
  const { data } = await db.from('staff').select('id, name, active, salary, user_id').order('name').limit(1000);
  S.staffList = data || [];
  return S.staffList;
}
async function cbEntryModal(dir, e, pre) {
  await Promise.all([loadAccounts(), loadVendors(), loadStaffList()]);
  const E = e ? Object.assign({}, e) : Object.assign({ dir, head: dir === 'in' ? 'sale' : 'other', entry_date: todayStr(), account_id: (S.accounts.find((a) => a.kind === 'cash') || {}).id }, pre || {});
  dir = E.dir;
  if (E.head === 'transfer') {   // both lines go together
    confirmModal('Money moved between accounts', 'Delete it (both lines), and move it again if it was wrong.', 'Delete', async () => {
      const r = await db.from('cash_entries').delete().eq('transfer_id', E.transfer_id).select('id');
      if (r.error || !r.data || !r.data.length) { toast('Could not delete — try again.', 'err'); return; }
      toast('Deleted', 'ok');
      cbRefresh();
    }, true);
    return;
  }
  const HR3 = ['salary', 'advance', 'bonus'];
  const heads = CB_HEADS[dir].filter((h) => (HR3.indexOf(h[0]) > -1 ? hasDept('hr') : h[0] === 'purchase' ? hasDept('purchase') || hasDept('cash') : hasDept('cash')));
  if (heads.length && !heads.some((h) => h[0] === E.head)) E.head = heads[0][0];
  const staff = (S.staffList || []).filter((s) => s.active || s.id === E.staff_id);
  const mo = (m) => '<option value="' + m + '"' + (m === (E.for_month || monthStart()) ? ' selected' : '') + '>' + esc(monthLabel(m)) + '</option>';
  WO_ATT.cb = { list: [], draw: () => { const el = $('#cb-atts'); if (el) el.innerHTML = woAttHTML(WO_ATT.cb.list, 'cb'); } };
  const ov = openModal('<h3>' + (e ? (dir === 'in' ? 'Money in' : 'Money out') : dir === 'in' ? '＋ Money in' : '− Money out') + '</h3>' +
    '<div class="o-2col"><div class="field"><label>Amount (₹) <span class="req">*</span></label><input type="text" inputmode="decimal" id="cb-amt" value="' + (E.amount ? esc(String(num(E.amount))) : '') + '"></div>' +
    '<div class="field"><label>Date</label><input type="date" id="cb-date" value="' + esc(E.entry_date) + '"></div></div>' +
    '<div class="field"><label>' + (dir === 'in' ? 'Into' : 'From') + '</label><select id="cb-acc">' + accountOptions(E.account_id) + '</select></div>' +
    '<div class="field"><label>For</label><div class="wf-quick" id="cb-heads">' + heads.map((h) => '<button type="button" class="chip-btn' + (E.head === h[0] ? ' on' : '') + '" data-h="' + h[0] + '">' + esc(h[1]) + '</button>').join('') + '</div></div>' +
    '<div class="field" id="cb-vf" hidden><label>Supplier</label><select id="cb-v">' + vendorOptions(E.vendor_id || '') + '</select></div>' +
    '<div class="field" id="cb-sf" hidden><label>Who</label><select id="cb-s"><option value="">— Choose —</option>' + staff.map((s) => '<option value="' + s.id + '"' + (s.id === E.staff_id ? ' selected' : '') + ' class="noi18n">' + esc(s.name) + '</option>').join('') + '</select></div>' +
    '<div class="field" id="cb-mf" hidden><label>Salary for</label><select id="cb-m">' + [-2, -1, 0, 1].map((i) => mo(addMonths(monthStart(), i))).join('') + '</select></div>' +
    '<div class="o-2col"><div class="field"><label>Cheque / UTR no.</label><input type="text" id="cb-ref" maxlength="60" autocomplete="off" value="' + esc(E.ref_no || '') + '"></div>' +
    '<div class="field"><label>Note</label><input type="text" id="cb-note" maxlength="500" autocomplete="off" value="' + esc(E.note || '') + '"></div></div>' +
    ((E.files || []).length ? woFilesHTML(E.files, 'Slip') : '') +
    '<div class="wo-atts" id="cb-atts"></div>' + woPickHTML('cb') +
    '<div class="modal-actions">' + (e ? '<button class="btn btn-danger-ghost" data-m="del">Delete</button>' : '<button class="btn btn-secondary" data-m="no">Cancel</button>') + '<button class="btn btn-primary" data-m="yes">Save</button></div>');
  woModalActs(ov);
  woLoadPics(ov);
  const show = () => {
    $('#cb-vf').hidden = E.head !== 'purchase';
    $('#cb-sf').hidden = ['salary', 'advance', 'bonus'].indexOf(E.head) < 0;
    $('#cb-mf').hidden = E.head !== 'salary';
  };
  show();
  ov.querySelector('#cb-heads').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-h]');
    if (!b) return;
    E.head = b.dataset.h;
    ov.querySelectorAll('#cb-heads .chip-btn').forEach((x) => x.classList.toggle('on', x === b));
    show();
  });
  wireVendorSelect($('#cb-v'));
  const del = ov.querySelector('[data-m=del]');
  if (del) del.onclick = () => confirmModal('Delete this entry?', 'It goes out of the cash book.', 'Delete', async () => {
    const r = await db.from('cash_entries').delete().eq('id', E.id).select('id');
    if (r.error || !r.data || !r.data.length) { toast('Could not delete — try again.', 'err'); return; }
    toast('Deleted', 'ok');
    cbRefresh();
  }, true);
  const no = ov.querySelector('[data-m=no]'); if (no) no.onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = async (ev) => {
    const amt = numOrNull($('#cb-amt').value);
    if (!(amt > 0)) { toast('Write the amount.', 'err'); return; }
    const row = { entry_date: $('#cb-date').value || todayStr(), account_id: $('#cb-acc').value, dir, amount: Math.round(amt * 100) / 100, head: E.head,
      vendor_id: E.head === 'purchase' ? ($('#cb-v').value || '').replace('__new', '') || null : null,
      staff_id: ['salary', 'advance', 'bonus'].indexOf(E.head) > -1 ? $('#cb-s').value || null : null,
      for_month: E.head === 'salary' ? $('#cb-m').value : null, purchase_id: E.head === 'purchase' ? E.purchase_id || null : null,
      client_id: E.client_id || null, ref_no: $('#cb-ref').value.trim() || null, note: $('#cb-note').value.trim() || null };
    if (E.head === 'purchase' && !row.vendor_id) { toast('Choose the supplier.', 'err'); return; }
    if (HR3.indexOf(E.head) > -1 && !row.staff_id) { toast('Choose who it is for.', 'err'); return; }
    ev.target.disabled = true;
    const id = E.id || crypto.randomUUID();
    let files = (E.files || []).slice(), fails = 0;
    if (WO_ATT.cb.list.length) { const up = await woUpload('cash/' + id + '/', WO_ATT.cb.list); files = files.concat(up.files); fails = up.fails; }
    row.files = files;
    const r = E.id ? await db.from('cash_entries').update(row).eq('id', id).select('id') : await db.from('cash_entries').insert(Object.assign({ id, created_by: S.me.id }, row)).select('id');
    if (r.error || !r.data || !r.data.length) { ev.target.disabled = false; toast('Could not save — try again.', 'err'); return; }
    closeModal();
    toast('Saved ✓' + (fails ? ' — ' + fails + ' file(s) did not upload' : ''), fails ? 'err' : 'ok');
    cbRefresh();
  };
}
/* after a change: draw again whichever money screen is open */
function cbRefresh() {
  const c = $('#content');
  if (!c) return;
  if (c.querySelector('.cb-home')) renderMoney();
  else if (c.querySelector('.cb-day')) renderDayBook();
  else if (c.querySelector('.cb-accs')) renderAccounts();
  else if (S.supId && c.querySelector('[data-action="pu-pay"]')) renderSupplier(S.supId);
  else if (c.querySelector('.hr-sal')) { if (typeof renderSalary === 'function') renderSalary(); }
}
async function transferModal() {
  await loadAccounts();
  const acc = S.accounts.filter((a) => a.active);
  if (acc.length < 2) { toast('Add a bank account first (Accounts).', 'err'); return; }
  const cash = acc.find((a) => a.kind === 'cash') || acc[0], bank = acc.find((a) => a.id !== cash.id);
  const ov = openModal('<h3>⇄ Move money</h3><p>Cash put in the bank, money taken out of the bank, or from one bank to another.</p>' +
    '<div class="o-2col"><div class="field"><label>From</label><select id="tr-from">' + accountOptions(cash.id) + '</select></div><div class="field"><label>To</label><select id="tr-to">' + accountOptions(bank.id) + '</select></div></div>' +
    '<div class="o-2col"><div class="field"><label>Amount (₹)</label><input type="text" inputmode="decimal" id="tr-amt"></div><div class="field"><label>Date</label><input type="date" id="tr-date" value="' + todayStr() + '"></div></div>' +
    '<div class="field"><label>Note</label><input type="text" id="tr-note" maxlength="500" autocomplete="off" placeholder="e.g. Deposited at the branch"></div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Move</button></div>');
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    const a = numOrNull($('#tr-amt').value);
    if (!(a > 0)) { toast('Write the amount.', 'err'); return; }
    if ($('#tr-from').value === $('#tr-to').value) { toast('Choose two different accounts.', 'err'); return; }
    e.target.disabled = true;
    const { error } = await db.rpc('cash_transfer', { p_from: $('#tr-from').value, p_to: $('#tr-to').value, p_amount: Math.round(a * 100) / 100, p_day: $('#tr-date').value || todayStr(), p_note: $('#tr-note').value.trim() || null });
    if (error) { e.target.disabled = false; toast('Could not move — try again.', 'err'); return; }
    closeModal();
    toast('Moved ✓', 'ok');
    cbRefresh();
  };
}

/* ---------------- Cash & Bank: the balances; today ---------------- */
async function renderMoney() {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const [{ data: bal, error }] = await Promise.all([db.rpc('money_balances', { p_on: todayStr() }), loadAccounts(), loadVendors()]);
  if (!$('#content')) return;
  if (error) { c.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  const list = bal || [], total = list.reduce((s, a) => s + P100(a.balance), 0);
  c.innerHTML = '<div class="cb-home">' +
    '<div class="cb-accs-row">' + list.map((a) => '<div class="card cb-acc' + (P100(a.balance) < 0 ? ' neg' : '') + '"><span>' + (a.kind === 'cash' ? '💵' : '🏦') + ' <span class="noi18n">' + esc(a.name) + '</span>' +
      (a.kind === 'bank' && a.is_default ? ' <small>' + esc('main') + '</small>' : '') + '</span><b>' + esc(inrNum(a.balance)) + '</b></div>').join('') +
      (list.length > 1 ? '<div class="card cb-acc tot"><span>Total</span><b>' + esc(inr(total)) + '</b></div>' : '') + '</div>' +
    '<div class="action-row"><button class="btn btn-primary" data-action="cb-in">＋ Money in</button><button class="btn btn-primary" data-action="cb-out">− Money out</button></div>' +
    '<div class="cb-tools"><button class="btn btn-secondary" data-action="cb-move">⇄ Move money</button><button class="btn btn-secondary" data-action="cb-day">📒 Day book</button><button class="btn btn-secondary" data-action="cb-accs">🏦 Accounts</button></div>' +
    '<div class="section-label">Today</div><div id="cb-today">' + loadingHTML() + '</div>' +
    '<p class="hint">Shops\' payments come in by themselves: cash when you took it or when the team handed it over; bank, UPI, cheque and card into the main bank account. Expense claims paid go out of cash.</p></div>';
  const t = todayStr();
  cbLines(t, t, $('#cb-today'));
}
/* the lines of money between two days, drawn into el (grouped by account when there are several) */
async function cbLines(from, to, el, withOpening) {
  const [{ data, error }, open, close] = await Promise.all([
    db.rpc('money_lines', { p_from: from, p_to: to }),
    withOpening ? db.rpc('money_balances', { p_on: addDaysStr(from, -1) }) : Promise.resolve({ data: null }),
    withOpening ? db.rpc('money_balances', { p_on: to }) : Promise.resolve({ data: null }),
  ]);
  if (!el || !document.body.contains(el)) return;
  if (error) { el.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  const lines = (data || []).sort((a, b) => (a.day || '').localeCompare(b.day || '') || String(a.at).localeCompare(String(b.at)));
  const cl = Array.from(new Set(lines.map((l) => l.client_id).filter(Boolean)));
  const st = Array.from(new Set(lines.map((l) => l.staff_id).filter(Boolean)));
  const [cs, ss] = await Promise.all([
    cl.length ? db.from('clients').select('id, trade_name').in('id', cl) : Promise.resolve({ data: [] }),
    st.length && hasDept('hr') ? db.from('staff').select('id, name').in('id', st) : Promise.resolve({ data: [] }),
  ]);
  const cn = new Map((cs.data || []).map((x) => [x.id, x.trade_name])), sn = new Map((ss.data || []).map((x) => [x.id, x.name]));
  /* [what it is, whose (a name), a word about it, the person's own note] */
  const what = (l) => {
    if (l.src === 'receipt') return ['Shop payment', cn.get(l.client_id) || '', payModeLabel(l.head), l.note || ''];
    if (l.src === 'handover') return ['Cash handed over', nameOf(l.who), '', l.note || ''];
    if (l.src === 'expense') return ['Expense claim', nameOf(l.who), '', l.note || ''];
    const who = l.vendor_id ? vendorName(l.vendor_id) : l.staff_id ? sn.get(l.staff_id) || '' : l.client_id ? cn.get(l.client_id) || '' : '';
    return [cbHead(l.head, l.dir), who, '', [l.ref_no, l.note].filter(Boolean).join(' · ')];
  };
  const accs = S.accounts || [];
  const byAcc = accs.filter((a) => lines.some((l) => l.account_id === a.id) || (withOpening && a.active));
  const one = (l) => {
    const w = what(l), tap = l.src === 'entry';
    const sub = [from !== to ? esc(fmtD(l.day)) : '', w[2] ? esc(w[2]) : '', w[3] ? '<span class="noi18n">' + esc(w[3]) + '</span>' : '', (l.files || []).length ? '📎' : ''].filter(Boolean);
    return '<div class="cb-line' + (tap ? ' tap' : '') + '"' + (tap ? ' data-action="cb-edit" data-id="' + l.ref_id + '"' : '') + '><div><b>' + esc(w[0]) + '</b>' +
      (w[1] ? ' · <span class="noi18n">' + esc(w[1]) + '</span>' : '') + (sub.length ? '<div class="rc-sub">' + sub.join(' · ') + '</div>' : '') + '</div>' +
      '<b class="' + (l.dir === 'in' ? 'o-green' : 'o-red') + '">' + esc((l.dir === 'in' ? '+ ' : '− ') + inrNum(l.amount)) + '</b></div>';
  };
  const bal = (r, id) => { const x = (r.data || []).find((a) => a.account_id === id); return x ? inrNum(x.balance) : '—'; };
  el.innerHTML = byAcc.length ? byAcc.map((a) => {
    const ls = lines.filter((l) => l.account_id === a.id);
    return '<div class="card cb-book"><div class="cb-book-h"><b>' + (a.kind === 'cash' ? '💵 ' : '🏦 ') + '<span class="noi18n">' + esc(a.name) + '</span></b>' +
      (withOpening ? '<span>' + esc('Opening ' + bal(open, a.id)) + '</span>' : '') + '</div>' +
      (ls.length ? ls.map(one).join('') : '<div class="rc-sub" style="padding:6px 0">Nothing in or out.</div>') +
      (withOpening ? '<div class="bf-row sub"><span>Closing</span><b>' + esc(bal(close, a.id)) + '</b></div>' : '') + '</div>';
  }).join('') : '<div class="empty">Nothing in or out.</div>';
}
async function renderDayBook() {
  S.cbDay = S.cbDay || todayStr();
  const c = $('#content');
  await Promise.all([loadAccounts(), loadVendors()]);
  if (!$('#content')) return;
  c.innerHTML = '<div class="cb-day"><div class="section-label sl-row"><span class="tg-month"><button data-action="cb-dayp" data-d="-1" aria-label="Day before">‹</button><b>' + esc(fmtDLong(S.cbDay)) + '</b>' +
    '<button data-action="cb-dayp" data-d="1" aria-label="Next day"' + (S.cbDay >= todayStr() ? ' disabled' : '') + '>›</button></span></div><div id="cb-book">' + loadingHTML() + '</div></div>';
  cbLines(S.cbDay, S.cbDay, $('#cb-book'), true);
}
async function renderAccounts() {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  await loadAccounts();
  if (!$('#content')) return;
  c.innerHTML = '<div class="cb-accs">' + S.accounts.map((a) => '<div class="card rc-item tap' + (a.active ? '' : ' closed') + '" data-action="cb-acc" data-id="' + a.id + '"><div><b>' + (a.kind === 'cash' ? '💵 ' : '🏦 ') + '<span class="noi18n">' + esc(a.name) + '</span></b>' +
    (a.kind === 'bank' && a.is_default ? ' <span class="chip chip-role">main</span>' : '') +
    '<div class="rc-sub">' + esc('Opening ' + inrNum(a.opening_amt) + ' on ' + fmtD(a.opening_on)) + (a.active ? '' : ' · ' + esc('Not in use')) + '</div></div><span class="mr-go">›</span></div>').join('') +
    '<button class="btn btn-secondary" data-action="cb-acc">＋ Add a bank account</button>' +
    '<p class="hint">The opening balance is what the account had on that day; the app counts everything from then on. "Main" bank: shops\' payments by bank, UPI, cheque and card come into it.</p></div>';
}
function accountModal(id) {
  const a = id ? S.accounts.find((x) => x.id === id) : { kind: 'bank', name: '', opening_amt: 0, opening_on: todayStr(), is_default: !S.accounts.some((x) => x.kind === 'bank' && x.is_default), active: true };
  if (!a) return;
  const ov = openModal('<h3>' + (id ? esc(a.kind === 'cash' ? 'Cash account' : 'Bank account') : 'New bank account') + '</h3>' +
    '<div class="field"><label>Name</label><input type="text" id="ma-name" maxlength="60" autocomplete="off" value="' + esc(a.name) + '" placeholder="e.g. HDFC current"></div>' +
    '<div class="o-2col"><div class="field"><label>Opening balance (₹)</label><input type="text" inputmode="decimal" id="ma-open" value="' + esc(String(num(a.opening_amt))) + '"></div>' +
    '<div class="field"><label>On</label><input type="date" id="ma-on" value="' + esc(a.opening_on) + '"></div></div>' +
    (a.kind === 'bank' ? '<label class="sw-row"><span class="sw-t"><b>Main bank account</b><span>Shops\' payments by bank, UPI, cheque and card come here</span></span><input type="checkbox" class="sw" id="ma-def"' + (a.is_default ? ' checked' : '') + '></label>' : '') +
    (id ? '<label class="sw-row"><span class="sw-t"><b>In use</b><span>Switch off an account you closed</span></span><input type="checkbox" class="sw" id="ma-act"' + (a.active ? ' checked' : '') + '></label>' : '') +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Save</button></div>');
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    const name = $('#ma-name').value.trim(), open = numOrNull($('#ma-open').value);
    if (!name) { toast('Write a name.', 'err'); return; }
    const row = { name, opening_amt: open == null ? 0 : Math.round(open * 100) / 100, opening_on: $('#ma-on').value || todayStr() };
    if ($('#ma-act')) row.active = $('#ma-act').checked;
    const makeMain = $('#ma-def') && $('#ma-def').checked;
    e.target.disabled = true;
    if (makeMain && !a.is_default) await db.from('money_accounts').update({ is_default: false }).eq('kind', 'bank').eq('is_default', true);
    if ($('#ma-def')) row.is_default = makeMain;
    const r = id ? await db.from('money_accounts').update(row).eq('id', id).select('id') : await db.from('money_accounts').insert(Object.assign({ kind: 'bank' }, row)).select('id');
    if (r.error || !r.data || !r.data.length) { e.target.disabled = false; toast(/duplicate/i.test((r.error || {}).message || '') ? 'There is already an account with this name.' : 'Could not save — try again.', 'err'); return; }
    closeModal();
    toast('Saved ✓', 'ok');
    renderAccounts();
  };
}

onAct('pu-list', () => { S.puMonth = monthStart(); showSub('Purchases', renderPurchases); });
onAct('pu-month', (el) => { S.puMonth = addMonths(S.puMonth || monthStart(), +el.dataset.d); if (S.puMonth > monthStart()) S.puMonth = monthStart(); renderPurchases(); });
onAct('pu-new', async (el) => { await loadVendors(); purchaseForm(null, el.dataset.v || ''); });
onAct('pu-edit', async (el) => {
  const [{ data }] = await Promise.all([db.from('purchases').select('*').eq('id', el.dataset.id).maybeSingle(), loadVendors()]);
  if (data) purchaseForm(data); else toast('This purchase is not there any more.', 'err');
});
onAct('pu-kind', (el) => { puRead(); S.pf.kind = el.dataset.k; renderPurchaseForm(); });
onAct('pu-pur', (el) => { const p = $('#pu-pur'); if (p) { p.value = el.dataset.v; puCalc('pu-pur'); } });
onAct('pu-gst3', () => { const a = numOrNull(($('#pu-amt') || {}).value || ''); if (a) { $('#pu-gst').value = String(Math.round(a * 3) / 100); puCalc('pu-gst'); } });
onAct('pu-file-x', (el) => { puRead(); S.pf.keep.splice(+el.dataset.i, 1); renderPurchaseForm(); });
onAct('pu-save', (el) => savePurchase(el));
onAct('pu-del', () => confirmModal('Delete this purchase?', 'It also goes out of the gold register.', 'Delete', async () => {
  const { data, error } = await db.from('purchases').delete().eq('id', S.pf.id).select('id');
  if (error || !data || !data.length) { toast('Could not delete — try again.', 'err'); return; }
  toast('Deleted', 'ok');
  goBack();
}, true));
onAct('pu-dues', () => showSub('What you owe', renderSupplierDues));
onAct('pu-sup', (el) => { S.supId = el.dataset.id; showSub('Supplier', () => renderSupplier(S.supId)); });
onAct('pu-pay', (el) => cbEntryModal('out', null, { head: 'purchase', vendor_id: el.dataset.id, amount: (+el.dataset.due || 0) / 100 || null }));
onAct('cb-open', () => showSub('Cash & Bank', renderMoney));
onAct('cb-in', () => cbEntryModal('in'));
onAct('cb-out', () => cbEntryModal('out'));
onAct('cb-move', () => transferModal());
onAct('cb-day', () => { S.cbDay = todayStr(); showSub('Day book', renderDayBook); });
onAct('cb-dayp', (el) => { S.cbDay = addDaysStr(S.cbDay || todayStr(), +el.dataset.d); if (S.cbDay > todayStr()) S.cbDay = todayStr(); renderDayBook(); });
onAct('cb-accs', () => showSub('Accounts', renderAccounts));
onAct('cb-acc', (el) => accountModal(el.dataset.id || null));
onAct('cb-edit', async (el) => {
  const { data } = await db.from('cash_entries').select('*').eq('id', el.dataset.id).maybeSingle();
  if (data) cbEntryModal(data.dir, data); else toast('This entry is not there any more.', 'err');
});
