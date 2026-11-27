/* ============================================================
   MORE FOR THE BUSINESS (v34, database update 22)
   · Old dues: what a shop owed before the app (money and fine gold) —
     in its statement, "To collect", its page.
   · Gold rate booking: a shop books today's rate for so many grams; a
     sale bill for the shop uses the booked rate in one tap.
   · Offers on making for festivals: so many % off the labour, offered on
     the bill screen in one tap; a WhatsApp message to the shops.
   · Your UPI ID: a QR on sale bills to pay the amount (business details).
   · Places for the stock (safe, showroom, with a salesman…): each piece's
     place, the pieces in each place, moving pieces by scanning their tags.
   · A scanner gun (USB / Bluetooth) anywhere: scan a tag — it opens the
     piece, or goes into the bill, the stock check or "Move pieces".
   · Profit & loss for a month: the margin on the bills less what was spent.
   · This year and last year, month by month, with charts; top shops.
   · Old gold from a shop: tested purity and melting loss → a gold receipt.
   ============================================================ */
'use strict';

function x22() { return !!S.dbv22; }
const KT = [['24K', 99.9], ['22K', 91.6], ['18K', 75], ['14K', 58.5]];

/* ---------------- old dues of a shop ---------------- */
async function loadOpening(clientId) {
  if (!x22()) return null;
  const { data } = await db.from('client_openings').select('*').eq('client_id', clientId).maybeSingle();
  return data || null;
}
function openingLine(op) {
  if (!op) return '';
  const p = Math.round(num(op.money_amt) * 100), m = Math.round(num(op.fine_g) * 1000);
  return [p ? (p > 0 ? inr(p) : inr(-p) + ' ' + 'paid in advance') : '', m ? (m > 0 ? gM(m) + ' fine gold' : gM(-m) + ' gold with us') : ''].filter(Boolean).join(' · ');
}
function openingModal(client, op) {
  if (!isOwner()) return;
  const ov = openModal('<h3>Old dues</h3><p class="noi18n">' + esc(client.trade_name || '') + '</p>' +
    '<p class="hint">What this shop owed you on the day you started with the app. Minus: what you owed the shop.</p>' +
    '<div class="field"><label>As on</label><input type="date" id="op-on" value="' + esc(op ? op.as_on : todayStr()) + '"></div>' +
    '<div class="o-2col"><div class="field"><label>Money (₹)</label><input type="text" inputmode="decimal" id="op-amt" value="' + (op && num(op.money_amt) ? esc(String(num(op.money_amt))) : '') + '"></div>' +
    '<div class="field"><label>Fine gold (g)</label><input type="text" inputmode="decimal" id="op-g" value="' + (op && num(op.fine_g) ? esc(String(num(op.fine_g))) : '') + '"></div></div>' +
    '<div class="field"><label>Note</label><input type="text" id="op-note" maxlength="500" autocomplete="off" value="' + esc((op && op.note) || '') + '" placeholder="e.g. From the old account book"></div>' +
    '<div class="modal-actions">' + (op ? '<button class="btn btn-danger-ghost" data-m="del">Remove</button>' : '<button class="btn btn-secondary" data-m="no">Cancel</button>') + '<button class="btn btn-primary" data-m="yes">Save</button></div>');
  const no = ov.querySelector('[data-m=no]'); if (no) no.onclick = closeModal;
  const del = ov.querySelector('[data-m=del]');
  if (del) del.onclick = () => confirmModal('Remove the old dues?', 'The shop\'s dues then start from its first bill.', 'Remove', async () => {
    const { error } = await db.from('client_openings').delete().eq('client_id', client.id);
    if (error) { toast('Could not remove — try again.', 'err'); return; }
    toast('Removed', 'ok');
    openingRefresh(client.id);
  }, true);
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    const a = numOrNull($('#op-amt').value) || 0, g = numOrNull($('#op-g').value) || 0;
    if (!a && !g) { toast('Write the money or the gold.', 'err'); return; }
    e.target.disabled = true;
    const { error } = await db.from('client_openings').upsert({ client_id: client.id, as_on: $('#op-on').value || todayStr(), money_amt: Math.round(a * 100) / 100,
      fine_g: Math.round(g * 1000) / 1000, note: $('#op-note').value.trim() || null, set_by: S.me.id, updated_at: new Date().toISOString() }, { onConflict: 'client_id' });
    if (error) { e.target.disabled = false; toast('Could not save — try again.', 'err'); return; }
    closeModal();
    toast('Saved ✓', 'ok');
    openingRefresh(client.id);
  };
}
function openingRefresh(clientId) {
  const c = $('#content');
  if (!c) return;
  if (c.querySelector('.op-list')) renderOpenings();
  else if ($('#client-bills') && typeof loadClientBills === 'function') fetchClient(clientId).then((cl) => { if (cl && $('#client-bills')) loadClientBills(cl); });
}
/* the shop's page (in "Bills & payments") */
function openingBoxHTML(cl, op) {
  if (!x22() || (!op && !isOwner())) return '';
  if (!op) return '';
  return '<div class="card op-box"><div><b>Old dues</b> · ' + esc('as on ' + fmtD(op.as_on)) + '<div class="rc-sub">' + esc(openingLine(op)) + (op.note ? ' · <span class="noi18n">' + esc(op.note) + '</span>' : '') + '</div></div>' +
    (isOwner() ? '<button class="btn btn-small btn-ghost" data-action="op-edit" data-id="' + cl.id + '">Change</button>' : '') + '</div>';
}
async function renderOpenings() {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const { data, error } = await db.from('client_openings').select('*, clients(id, trade_name, city)').order('as_on').limit(5000);
  if (!$('#content')) return;
  if (error) { c.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  const list = data || [];
  const tP = list.reduce((s, o) => s + Math.max(0, Math.round(num(o.money_amt) * 100)), 0), tM = list.reduce((s, o) => s + Math.max(0, Math.round(num(o.fine_g) * 1000)), 0);
  c.innerHTML = '<div class="op-list">' + (isOwner() ? '<button class="btn btn-primary" data-action="op-new" style="margin-bottom:12px">＋ Old dues of a shop</button>' : '') +
    '<div class="st-tot"><div><b>' + list.length + '</b><span>Shops</span></div><div><b>' + esc(inr(tP)) + '</b><span>Money</span></div>' + (tM ? '<div><b>' + esc(gM(tM)) + '</b><span>Fine gold</span></div>' : '') + '</div>' +
    (list.length ? list.map((o) => '<div class="card rc-item tap" data-action="open-client" data-id="' + o.client_id + '"><div><b class="noi18n">' + esc((o.clients || {}).trade_name || '—') + '</b>' +
      '<div class="rc-sub">' + esc(openingLine(o) + ' · as on ' + fmtD(o.as_on)) + '</div></div>' +
      (isOwner() ? '<button class="btn btn-small btn-ghost" data-action="op-edit" data-id="' + o.client_id + '">Change</button>' : '') + '</div>').join('')
      : '<div class="empty">No old dues written yet. Write what each shop owed when you started with the app — its statement and dues then start from there.</div>') + '</div>';
}

/* ---------------- gold rate bookings ---------------- */
async function bookingsWithUse(q) {
  const [{ data, error }, used] = await Promise.all([q, db.from('bills').select('booking_id, fine_due_g, bill_no, bill_date').not('booking_id', 'is', null).eq('kind', 'sale').eq('status', 'open').limit(5000)]);
  if (error) return null;
  const u = new Map();
  (used.data || []).forEach((b) => { const x = u.get(b.booking_id) || { g: 0, n: 0 }; x.g += num(b.fine_due_g); x.n++; u.set(b.booking_id, x); });
  return (data || []).map((k) => Object.assign(k, { used: Math.round(((u.get(k.id) || {}).g || 0) * 1000) / 1000, nBills: (u.get(k.id) || {}).n || 0 }));
}
async function renderBookings() {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const since = addDaysStr(todayStr(), -60);
  const list = await bookingsWithUse(db.from('rate_bookings').select('*, clients(trade_name, mobile)').or('status.eq.open,booked_on.gte.' + since).order('booked_on', { ascending: false }).limit(1000));
  if (!$('#content')) return;
  if (!list) { c.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  S.bookings = new Map(list.map((k) => [k.id, k]));
  const t = todayStr(), open = list.filter((k) => k.status === 'open'), done = list.filter((k) => k.status !== 'open');
  const left = (k) => Math.max(0, num(k.fine_g) - k.used);
  const row = (k) => '<div class="card rc-item tap" data-action="bk-open" data-id="' + k.id + '"><div><b class="noi18n">' + esc((k.clients || {}).trade_name || '—') + '</b> · ' + esc(grams(k.fine_g) + ' at ' + rsWhole(k.rate)) +
    '<div class="rc-sub">' + esc([k.status === 'open' ? grams(left(k)) + ' left' : k.status === 'closed' ? 'Closed' : 'Cancelled', k.valid_till ? 'till ' + fmtD(k.valid_till) : '',
      num(k.advance_amt) ? 'advance ' + inrNum(k.advance_amt) : ''].filter(Boolean).join(' · ')) +
    (k.status === 'open' && k.valid_till && k.valid_till < t ? ' · <b class="o-red">' + esc('Past its date') + '</b>' : '') + '</div></div><span class="mr-go">›</span></div>';
  c.innerHTML = '<button class="btn btn-primary" data-action="bk-new" style="margin-bottom:12px">＋ Book a rate for a shop</button>' +
    '<div class="st-tot"><div><b>' + open.length + '</b><span>Open bookings</span></div><div><b>' + esc(grams(open.reduce((s, k) => s + left(k), 0))) + '</b><span>Gold still to bill</span></div></div>' +
    (open.length ? open.map(row).join('') : '<div class="empty">No open bookings.</div>') +
    (done.length ? '<div class="section-label">Closed in the last 60 days</div>' + done.map(row).join('') : '') +
    '<p class="hint">A sale bill for the shop shows its booked rate — one tap uses it. The grams used are the fine gold of those bills.</p>';
}
async function bookingModal(client) {
  const t = typeof loadTodayRate === 'function' ? await loadTodayRate() : null;
  const ov = openModal('<h3>Book a gold rate</h3><p class="noi18n">' + esc(client.trade_name) + '</p>' +
    '<div class="o-2col"><div class="field"><label>Fine gold (g)</label><input type="text" inputmode="decimal" id="bk-g" placeholder="e.g. 100"></div>' +
    '<div class="field"><label>Rate (24K, ₹ a gram)</label><input type="text" inputmode="decimal" id="bk-rate" value="' + (t && num(t.r24) ? esc(String(num(t.r24))) : '') + '"></div></div>' +
    '<div class="o-2col"><div class="field"><label>Valid till</label><input type="date" id="bk-till" value="' + todayStr(30) + '"></div>' +
    '<div class="field"><label>Advance (₹)</label><input type="text" inputmode="decimal" id="bk-adv" placeholder="0"></div></div>' +
    (typeof billsOn === 'function' && billsOn() ? '<label class="sw-row"><span class="sw-t"><b>Write the advance as money received</b><span>On the shop\'s account, in cash</span></span><input type="checkbox" class="sw" id="bk-rc" checked></label>' : '') +
    '<div class="field"><label>Note</label><input type="text" id="bk-note" maxlength="500" autocomplete="off"></div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Book</button></div>');
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    const g = numOrNull($('#bk-g').value), r = numOrNull($('#bk-rate').value), adv = numOrNull($('#bk-adv').value), till = $('#bk-till').value || null;
    if (!(g > 0)) { toast('Write the grams.', 'err'); return; }
    if (!(r > 0)) { toast('Write the rate.', 'err'); return; }
    if (till && till < todayStr()) { toast('"Valid till" cannot be before today.', 'err'); return; }
    e.target.disabled = true;
    const { error } = await db.from('rate_bookings').insert({ client_id: client.id, fine_g: Math.round(g * 1000) / 1000, rate: Math.round(r * 100) / 100, valid_till: till,
      advance_amt: adv > 0 ? Math.round(adv * 100) / 100 : null, note: $('#bk-note').value.trim() || null, created_by: S.me.id });
    if (error) { e.target.disabled = false; toast('Could not save — try again.', 'err'); return; }
    if (adv > 0 && $('#bk-rc') && $('#bk-rc').checked) {
      const rc = await db.from('receipts').insert({ client_id: client.id, kind: 'money', amount: Math.round(adv * 100) / 100, mode: 'cash', received_on: todayStr(), note: 'Advance for the gold rate booking', created_by: S.me.id });
      if (rc.error) toast('Booked — but the advance could not be written as received.', 'err');
    }
    closeModal();
    toast('Rate booked ✓', 'ok');
    if ($('#content') && $('#content').querySelector('[data-action="bk-new"]')) renderBookings();
  };
}
function bookingDetail(id) {
  const k = S.bookings && S.bookings.get(id);
  if (!k) return;
  const mine = isOwner() || k.created_by === S.me.id;
  const ov = openModal('<h3 class="noi18n">' + esc((k.clients || {}).trade_name || '') + '</h3>' +
    '<div class="card bf-total" style="box-shadow:none;padding:4px 0">' +
    [['Booked', grams(k.fine_g) + ' at ' + rsWhole(k.rate) + ' (24K)'], ['On', fmtD(k.booked_on)], ['Valid till', k.valid_till ? fmtD(k.valid_till) : '—'],
      ['Used in bills', grams(k.used) + (k.nBills ? ' (' + k.nBills + ')' : '')], ['Left', grams(Math.max(0, num(k.fine_g) - k.used))]]
      .concat(num(k.advance_amt) ? [['Advance', inrNum(k.advance_amt)]] : []).map((r) => '<div class="bf-row"><span>' + esc(r[0]) + '</span><b>' + esc(r[1]) + '</b></div>').join('') + '</div>' +
    (k.note ? '<p class="noi18n">' + esc(k.note) + '</p>' : '') +
    '<div class="modal-actions">' + (mine && k.status === 'open' ? '<button class="btn btn-danger-ghost" data-m="cancel">Cancel it</button><button class="btn btn-primary" data-m="close">Close it</button>'
      : '<button class="btn btn-secondary" data-m="no">Close</button>') + '</div>');
  const set = async (status) => {
    const { data, error } = await db.from('rate_bookings').update({ status }).eq('id', id).select('id');
    if (error || !data || !data.length) { toast('Could not save — try again.', 'err'); return; }
    closeModal();
    toast(status === 'closed' ? 'Closed ✓' : 'Cancelled', 'ok');
    renderBookings();
  };
  const b1 = ov.querySelector('[data-m=no]'); if (b1) b1.onclick = closeModal;
  const b2 = ov.querySelector('[data-m=close]'); if (b2) b2.onclick = () => set('closed');
  const b3 = ov.querySelector('[data-m=cancel]'); if (b3) b3.onclick = () => set('cancelled');
}

/* ---------------- offers on making ---------------- */
async function renderOffers() {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const { data, error } = await db.from('making_offers').select('*').order('from_day', { ascending: false }).limit(200);
  if (!$('#content')) return;
  if (error) { c.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  S.offers = data || [];
  const t = todayStr();
  c.innerHTML = (isOwner() ? '<button class="btn btn-primary" data-action="mo-new" style="margin-bottom:12px">＋ New offer</button>' : '') +
    (S.offers.length ? S.offers.map((o) => {
      const now = o.active && o.from_day <= t && o.to_day >= t;
      return '<div class="card rc-item' + (o.active ? '' : ' closed') + '"><div><b class="noi18n">' + esc(o.title) + '</b> · ' + esc(num(o.pct) + '% off making') +
        '<div class="rc-sub">' + esc(fmtD(o.from_day) + ' – ' + fmtD(o.to_day)) + (now ? ' · <b class="o-green">' + esc('On now') + '</b>' : !o.active ? ' · ' + esc('Off') : o.to_day < t ? ' · ' + esc('Over') : '') + '</div></div>' +
        '<span class="rt-acts"><button class="btn btn-small btn-secondary" data-action="mo-wa" data-id="' + o.id + '">WhatsApp</button>' +
        (isOwner() ? '<button class="btn btn-small btn-ghost" data-action="mo-edit" data-id="' + o.id + '">Change</button>' : '') + '</span></div>';
    }).join('') : '<div class="empty">No offers yet. A festival offer — so many % off the making charge — shows on the bill screen in those days.</div>');
}
function offerModal(id) {
  const o = id ? (S.offers || []).find((x) => x.id === id) : { title: '', from_day: todayStr(), to_day: todayStr(7), pct: '', active: true };
  if (!o) return;
  const ov = openModal('<h3>' + (id ? 'Offer' : 'New offer') + '</h3>' +
    '<div class="field"><label>Name</label><input type="text" id="mo-t" maxlength="80" autocomplete="off" value="' + esc(o.title) + '" placeholder="e.g. Diwali offer"></div>' +
    '<div class="o-2col"><div class="field"><label>From</label><input type="date" id="mo-from" value="' + esc(o.from_day) + '"></div><div class="field"><label>To</label><input type="date" id="mo-to" value="' + esc(o.to_day) + '"></div></div>' +
    '<div class="field"><label>Off the making charge (%)</label><input type="text" inputmode="decimal" id="mo-pct" value="' + esc(o.pct === '' ? '' : String(num(o.pct))) + '" placeholder="e.g. 10"></div>' +
    (id ? '<label class="sw-row"><span class="sw-t"><b>On</b><span>Switch off to stop it early</span></span><input type="checkbox" class="sw" id="mo-on"' + (o.active ? ' checked' : '') + '></label>' : '') +
    '<div class="modal-actions">' + (id ? '<button class="btn btn-danger-ghost" data-m="del">Delete</button>' : '<button class="btn btn-secondary" data-m="no">Cancel</button>') + '<button class="btn btn-primary" data-m="yes">Save</button></div>');
  const no = ov.querySelector('[data-m=no]'); if (no) no.onclick = closeModal;
  const del = ov.querySelector('[data-m=del]');
  if (del) del.onclick = () => confirmModal('Delete this offer?', '', 'Delete', async () => {
    const { error } = await db.from('making_offers').delete().eq('id', id);
    if (error) { toast('Could not delete — try again.', 'err'); return; }
    toast('Deleted', 'ok'); renderOffers();
  }, true);
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    const title = $('#mo-t').value.trim(), pct = numOrNull($('#mo-pct').value), from = $('#mo-from').value, to = $('#mo-to').value;
    if (!title) { toast('Write a name.', 'err'); return; }
    if (!(pct > 0 && pct <= 100)) { toast('Write the % off (1 to 100).', 'err'); return; }
    if (!from || !to || to < from) { toast('Check the dates: "To" cannot be before "From".', 'err'); return; }
    e.target.disabled = true;
    const row = { title, from_day: from, to_day: to, pct: Math.round(pct * 100) / 100 };
    if ($('#mo-on')) row.active = $('#mo-on').checked;
    const r = id ? await db.from('making_offers').update(row).eq('id', id).select('id') : await db.from('making_offers').insert(Object.assign({ created_by: S.me.id }, row)).select('id');
    if (r.error || !r.data || !r.data.length) { e.target.disabled = false; toast('Could not save — try again.', 'err'); return; }
    closeModal(); toast('Saved ✓', 'ok'); renderOffers();
  };
}
function offerText(o) {
  return '🎉 ' + o.title + ' — ' + num(o.pct) + '% off making charges, ' + fmtD(o.from_day) + ' to ' + fmtD(o.to_day) + '.\nNew designs ready — tell us what you need.\n— ' + bizName();
}

/* ---------------- the bill screen: a booked rate, an offer on making ---------------- */
async function billExtras(F) {
  const el = $('#bf-offers');
  if (!el || !x22() || !F || F.kind === 'approval') return;
  const day = F.bill_date || todayStr();
  const [bk, of] = await Promise.all([
    F.kind === 'sale' ? bookingsWithUse(db.from('rate_bookings').select('*').eq('client_id', F.client.id).eq('status', 'open').limit(20)) : Promise.resolve([]),
    db.from('making_offers').select('*').eq('active', true).lte('from_day', day).gte('to_day', day).limit(5),
  ]);
  if (!$('#bf-offers') || S.bf !== F) return;
  const live = (bk || []).filter((k) => !k.valid_till || k.valid_till >= day);
  const offer = ((of && of.data) || [])[0] || null;
  F.bookings = live; F.offerNow = offer;
  el.innerHTML = live.map((k) => {
    const left = Math.max(0, num(k.fine_g) - k.used), on = F.booking === k.id;
    return '<div class="bf-offer' + (on ? ' on' : '') + '"><span>🔒 ' + esc('Rate booked: ' + grams(left) + ' left at ' + rsWhole(k.rate) + (k.valid_till ? ' till ' + fmtD(k.valid_till) : '')) + '</span>' +
      (on ? '<b>' + esc('Used ✓') + '</b>' : '<button type="button" class="btn btn-small btn-primary" data-action="bf-book" data-id="' + k.id + '">Use it</button>') + '</div>';
  }).join('') +
    (offer ? '<div class="bf-offer' + (F.offerUsed === offer.id ? ' on' : '') + '"><span>🎉 <span class="noi18n">' + esc(offer.title) + '</span>: ' + esc(num(offer.pct) + '% off making') + '</span>' +
      (F.offerUsed === offer.id ? '<b>' + esc('Applied ✓') + '</b>' : '<button type="button" class="btn btn-small btn-primary" data-action="bf-offer" data-id="' + offer.id + '">Apply</button>') + '</div>' : '');
}
function bfSetRate(key, value) {
  const inp = document.querySelector('[data-bfr="' + key + '"]');
  if (!inp) return false;
  inp.value = value;
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  inp.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}
/* after the bill is saved: the booking it used */
async function billBookingLink(billId, bookingId) {
  const { error } = await db.rpc('bill_booking', { p_bill: billId, p_booking: bookingId });
  if (error) toast('The bill is saved — but it could not be linked to the booking.', 'err');
}

/* ---------------- UPI: a QR on a sale bill ---------------- */
function upiUrl(amount, note) {
  const b = S.biz || {};
  if (!b.upi_id) return '';
  return 'upi://pay?pa=' + encodeURIComponent(b.upi_id) + '&pn=' + encodeURIComponent(b.upi_name || b.legal_name || bizName()) +
    (amount > 0 ? '&am=' + (Math.round(amount * 100) / 100).toFixed(2) : '') + '&cu=INR' + (note ? '&tn=' + encodeURIComponent(note) : '');
}
function billUpiQr(d, b) {
  const amt = num(b.total_amt);
  const url = upiUrl(amt, 'Bill ' + billNo(b));
  if (!url || !(amt > 0) || typeof QR === 'undefined') return;
  d.ensure(38);
  QR.pdf(d, url, PM, d.y, 30);
  d.text(PM + 34, d.y + 9, 'Scan to pay Rs. ' + amt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' by UPI', { size: 10, bold: true });
  d.text(PM + 34, d.y + 15, 'UPI ID: ' + S.biz.upi_id, { size: 8.6, color: C_MUTED });
  d.text(PM + 34, d.y + 20, 'Any UPI app: Google Pay, PhonePe, Paytm, BHIM…', { size: 8, color: C_MUTED });
  d.y += 34;
}

/* ---------------- places for the stock ---------------- */
async function loadPlaces() {
  const { data } = await db.from('stock_places').select('*').order('sort').order('name').limit(200);
  S.places = data || [];
  return S.places;
}
async function loadCatPlace(it) {
  const el = $('#cat-place');
  if (!el || !x22()) return;
  el.innerHTML = '<div class="card rc-item cat-place-row"><div><span class="rc-sub">' + esc('Place') + '</span><div><b class="noi18n">' + esc(it.place || '—') + '</b></div></div>' +
    '<button class="btn btn-small btn-secondary" data-action="pl-set" data-id="' + it.id + '">' + esc(it.place ? 'Move' : 'Set the place') + '</button></div>';
}
async function placeChooser(title, onPick) {
  await loadPlaces();
  const ov = openModal('<h3>' + esc(title) + '</h3><div class="wf-quick" id="pl-pick">' + S.places.map((p) => '<button type="button" class="chip-btn noi18n" data-n="' + esc(p.name) + '">' + esc(p.name) + '</button>').join('') +
    '</div>' + (S.places.length ? '' : '<p class="hint">No places yet — the owner adds them in Places.</p>') +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button></div>');
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('#pl-pick').addEventListener('click', (e) => { const b = e.target.closest('[data-n]'); if (b) { closeModal(); onPick(b.dataset.n); } });
}
async function setPiecePlace(id, place) {
  const { data, error } = await db.from('catalogue_items').update({ place }).eq('id', id).select('id, place');
  if (error || !data || !data.length) { toast('Could not save — try again.', 'err'); return false; }
  return true;
}
async function renderPlaces() {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const [pl, it] = await Promise.all([loadPlaces(), db.from('catalogue_items').select('place, status').in('status', ['available', 'approval', 'reserved']).limit(20000)]);
  if (!$('#content')) return;
  const cnt = new Map();
  (it.data || []).forEach((x) => { const k = x.place || ''; cnt.set(k, (cnt.get(k) || 0) + 1); });
  c.innerHTML = '<div class="action-row"><button class="btn btn-primary" data-action="pl-move">📦 Move pieces</button>' + (isOwner() ? '<button class="btn btn-secondary" data-action="pl-add">＋ Add a place</button>' : '') + '</div>' +
    pl.map((p) => '<div class="card rc-item tap" data-action="pl-show" data-n="' + esc(p.name) + '"><div><b class="noi18n">' + esc(p.name) + '</b></div><span class="pl-n">' + esc(String(cnt.get(p.name) || 0)) + '</span>' +
      (isOwner() ? '<button class="btn btn-small btn-ghost" data-action="pl-del" data-id="' + p.id + '" aria-label="Remove">✕</button>' : '') + '</div>').join('') +
    (cnt.get('') ? '<div class="card rc-item tap" data-action="pl-show" data-n=""><div><b>No place yet</b></div><span class="pl-n">' + cnt.get('') + '</span></div>' : '') +
    '<p class="hint">Pieces in stock, on approval and kept in orders. A scanner gun works here too: scan the tags in "Move pieces".</p>';
}
async function renderPlacePieces(name) {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  let q = db.from('catalogue_items').select('id, tag_no, design_no, category, gross_wt, status').in('status', ['available', 'approval', 'reserved']).order('tag_no').limit(2000);
  q = name ? q.eq('place', name) : q.is('place', null);
  const { data } = await q;
  if (!$('#content')) return;
  c.innerHTML = (data || []).length ? (data || []).map((x) => '<div class="card rc-item tap" data-action="cat-open" data-id="' + x.id + '"><div><b class="noi18n">' + esc([x.tag_no, x.design_no].filter(Boolean).join(' · ') || x.category || '—') + '</b>' +
    '<div class="rc-sub">' + esc([x.category, x.gross_wt != null ? grams(x.gross_wt) : '', CAT_STATUS_LABEL[x.status] || x.status].filter(Boolean).join(' · ')) + '</div></div><span class="mr-go">›</span></div>').join('')
    : '<div class="empty">No pieces here.</div>';
}
/* "Move pieces": choose the place, then scan or type each tag */
function renderMovePieces() {
  const M = S.mv;
  $('#content').innerHTML = '<div class="pl-move"><div class="card"><div class="field"><label>Move to</label><select id="mv-place">' + S.places.map((p) => '<option class="noi18n"' + (p.name === M.place ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select></div>' +
    '<div class="in-btn"><input type="text" id="mv-code" placeholder="Tag no. — or scan" autocomplete="off" autocapitalize="characters"><button type="button" class="btn btn-small btn-primary" data-action="mv-add">Move</button></div>' +
    (typeof codeScanOn === 'function' && codeScanOn() ? '<button type="button" class="btn btn-secondary" data-action="mv-cam" style="margin-top:10px">📷 Scan with the camera</button>' : '') + '</div>' +
    '<div class="section-label">' + esc('Moved (' + M.done.length + ')') + '</div>' + (M.done.length ? M.done.slice().reverse().map((x) => '<div class="card rc-item"><div><b class="noi18n">' + esc(x.t) + '</b>' +
      '<div class="rc-sub">' + esc((x.from ? x.from + ' → ' : '→ ') + x.to) + '</div></div></div>').join('') : '<div class="empty">Scan a tag, or type its number.</div>') + '</div>';
  const sel = $('#mv-place'); if (sel) sel.addEventListener('change', () => { M.place = sel.value; });
  const inp = $('#mv-code');
  if (inp) { inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); moveCode(inp.value); } }); setTimeout(() => inp.focus(), 50); }
}
async function moveCode(raw) {
  const M = S.mv, code = String(raw || '').trim();
  if (!M || !code) return null;
  const list = typeof findStockByCode === 'function' ? await findStockByCode(code) : [];
  const it = (list || [])[0];
  if (!it) { toast(code + ' — not in the stock', 'err'); return { text: code + ' — not in the stock', kind: 'err' }; }
  if (it.place === M.place) { toast((it.tag_no || it.design_no) + ' — already in ' + M.place, ''); return { text: (it.tag_no || it.design_no) + ' — already there', kind: '' }; }
  if (!(await setPiecePlace(it.id, M.place))) return { text: 'Could not save', kind: 'err' };
  M.done.push({ t: it.tag_no || it.design_no || it.category || '—', from: it.place || '', to: M.place });
  if ($('.pl-move')) renderMovePieces();
  toast((it.tag_no || it.design_no) + ' → ' + M.place + ' ✓', 'ok');
  return { text: (it.tag_no || it.design_no) + ' ✓', kind: 'ok' };
}

/* ---------------- a scanner gun (it types the code and Enter) ---------------- */
const SCAN_GUN = { buf: '', last: 0, fast: 0 };
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const now = Date.now(), gap = now - SCAN_GUN.last;
  SCAN_GUN.last = now;
  if (gap > 80) { SCAN_GUN.buf = ''; SCAN_GUN.fast = 0; }
  if (e.key === 'Enter') {
    const code = SCAN_GUN.buf;
    SCAN_GUN.buf = '';
    if (code.length >= 5 && SCAN_GUN.fast >= code.length - 2) {
      const t = e.target, typing = t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && t.id !== 'mv-code' && t.id !== 'gun-sink'));
      if (typing && t.value && t.value.indexOf(code) < 0) return;
      e.preventDefault(); e.stopPropagation();
      if (typing && t.value.indexOf(code) > -1) t.value = t.value.replace(code, '');
      gunScan(code);
    }
    return;
  }
  if (e.key.length === 1) { SCAN_GUN.buf += e.key; if (gap < 40) SCAN_GUN.fast++; }
}, true);
async function gunScan(code) {
  if (!S.me) return;
  if ($('.pl-move') && S.mv) { const i = $('#mv-code'); if (i) i.value = ''; moveCode(code); return; }
  if ($('#bf-form') && S.bf && typeof bfAddPieces === 'function') {
    const F = S.bf, list = await findStockByCode(code);
    if (!list.length) { toast(code + ' — not in the stock', 'err'); return; }
    const fresh = list.filter((c) => !F.pieces.some((p) => p.id === c.id)).filter((c) => c.status === 'available' || (F.kind !== 'approval' && c.status === 'approval'));
    if (!fresh.length) { toast((list[0].tag_no || list[0].design_no) + ' — already in the bill or not in stock', 'err'); return; }
    bfAddPieces([fresh[0]]); drawBillPieces(); billRecalcView();
    toast((fresh[0].tag_no || fresh[0].design_no) + ' ✓ added', 'ok');
    return;
  }
  if ($('#sc-screen') && typeof scanCode === 'function') { scanCode(code); return; }
  if (typeof findStockByCode !== 'function') return;
  const list = await findStockByCode(code);
  if (!list.length) { toast(code + ' — not in the stock', 'err'); return; }
  openCatItem(list[0].id);
}

/* ---------------- profit & loss for a month ---------------- */
const PL_SKIP = ['purchase', 'transfer', 'owner', 'loan', 'advance'];   // not expenses: stock, moving money, the owner's own, loans, advances (paid back)
async function renderPL() {
  S.plMonth = S.plMonth || monthStart();
  const ms = S.plMonth, me = addMonths(ms, 1), c = $('#content');
  c.innerHTML = loadingHTML();
  const [pd, ce, ex] = await Promise.all([
    typeof profitData === 'function' ? profitData(ms) : Promise.resolve({ rows: [], noCost: 0 }),
    db.from('cash_entries').select('head, dir, amount').eq('dir', 'out').gte('entry_date', ms).lt('entry_date', me).limit(20000),
    db.from('expenses').select('category, amount, status, paid_on').eq('status', 'paid').gte('paid_on', ms).lt('paid_on', me).limit(5000),
  ]);
  if (!$('#content') || S.plMonth !== ms) return;
  const sales = pd.rows.reduce((s, x) => s + num(x.value), 0), margin = pd.rows.reduce((s, x) => s + num(x.profit), 0);
  const heads = new Map();
  (ce.data || []).filter((e) => PL_SKIP.indexOf(e.head) < 0).forEach((e) => heads.set(e.head, (heads.get(e.head) || 0) + num(e.amount)));
  const claims = (ex.data || []).reduce((s, e) => s + num(e.amount), 0);
  if (claims) heads.set('claims', claims);
  const spent = Array.from(heads.values()).reduce((s, v) => s + v, 0), net = margin - spent;
  const rs = (v) => inr(Math.round(v * 100));
  c.innerHTML = '<div class="section-label sl-row"><span class="tg-month"><button data-action="pl-m" data-d="-1" aria-label="Month before">‹</button><b>' + esc(monthLabel(ms)) + '</b>' +
    '<button data-action="pl-m" data-d="1" aria-label="Next month"' + (ms >= monthStart() ? ' disabled' : '') + '>›</button></span></div>' +
    '<div class="st-tot"><div><b>' + esc(rs(sales)) + '</b><span>Sales (before GST)</span></div><div><b>' + esc(rs(margin)) + '</b><span>Margin on bills</span></div>' +
    '<div><b class="' + (net < 0 ? 'o-red' : 'o-green') + '">' + esc(rs(net)) + '</b><span>' + esc(net < 0 ? 'Loss' : 'Profit') + '</span></div></div>' +
    '<div class="card bf-total"><div class="bf-row"><span>Margin on the bills</span><b>' + esc(rs(margin)) + '</b></div>' +
    Array.from(heads.entries()).sort((a, b) => b[1] - a[1]).map((h) => '<div class="bf-row"><span>' + esc(h[0] === 'claims' ? 'Expense claims paid' : typeof cbHead === 'function' ? cbHead(h[0], 'out') : h[0]) + '</span><b class="o-red">' + esc('− ' + rs(h[1])) + '</b></div>').join('') +
    '<div class="bf-row sub"><span><b>' + esc(net < 0 ? 'Loss' : 'Profit') + '</b></span><b class="' + (net < 0 ? 'o-red' : 'o-green') + '">' + esc(rs(net)) + '</b></div></div>' +
    (pd.noCost ? '<div class="notice">' + esc(pd.noCost + ' piece(s) sold with no cost written — the margin counts them as full profit. Write their cost on the piece (owner).') + '</div>' : '') +
    '<p class="hint">Margin: what the bills earned over the cost of the pieces (as in Profit). Spent: money out in Cash & Bank — not supplier payments, money moved, the owner\'s own, loans or advances — and expense claims paid.</p>';
}

/* ---------------- this year and last year ---------------- */
function fyStartOf(d) { const y = +d.slice(0, 4), m = +d.slice(5, 7); return (m >= 4 ? y : y - 1) + '-04-01'; }
const YY_KINDS = [['sales', 'Sales'], ['orders', 'Orders'], ['meet', 'Meetings'], ['clients', 'New clients']];
async function yyData() {
  const fy = fyStartOf(todayStr()), ly = (+fy.slice(0, 4) - 1) + '-04-01', end = (+fy.slice(0, 4) + 1) + '-04-01';
  const [bs, os, ms, cs] = await Promise.all([
    fetchAllRows(() => db.from('bills').select('bill_date, total_amt, client_id, clients(trade_name)').eq('kind', 'sale').eq('status', 'open').gte('bill_date', ly).lt('bill_date', end)),
    fetchAllRows(() => db.from('orders').select('order_date, status').gte('order_date', ly).lt('order_date', end)),
    fetchAllRows(() => db.from('interactions').select('happened_at').gte('happened_at', dayStartISO(ly)).lt('happened_at', dayStartISO(end))),
    fetchAllRows(() => db.from('clients').select('created_at').gte('created_at', dayStartISO(ly)).lt('created_at', dayStartISO(end))),
  ]);
  const months = Array.from({ length: 12 }, (_, i) => i);
  const idx = (ds) => { const y = +ds.slice(0, 4), m = +ds.slice(5, 7); const fyY = m >= 4 ? y : y - 1; return { cur: fyY === +fy.slice(0, 4), i: (m + 8) % 12 }; };
  const blank = () => ({ cur: months.map(() => 0), last: months.map(() => 0) });
  const D = { sales: blank(), orders: blank(), meet: blank(), clients: blank(), fy, ly };
  const add = (k, ds, v) => { if (!ds) return; const x = idx(ds.slice(0, 10)); D[k][x.cur ? 'cur' : 'last'][x.i] += v; };
  (bs || []).forEach((b) => add('sales', b.bill_date, num(b.total_amt)));
  (os || []).filter((o) => ['quote', 'declined', 'cancelled'].indexOf(o.status) < 0).forEach((o) => add('orders', o.order_date, 1));
  (ms || []).forEach((m) => add('meet', ymd(new Date(m.happened_at)), 1));
  (cs || []).forEach((c) => add('clients', ymd(new Date(c.created_at)), 1));
  const top = new Map();
  (bs || []).filter((b) => b.bill_date >= fy).forEach((b) => { const n = (b.clients || {}).trade_name || '—'; top.set(n, (top.get(n) || 0) + num(b.total_amt)); });
  D.top = Array.from(top.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
  return D;
}
async function fetchAllRows(make) {
  const out = [];
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await make().range(from, from + 999);
    if (error) return from ? out : null;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}
const MON3 = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
function yyChart(cur, last, money) {
  const W = 340, Hh = 170, pad = 22, max = Math.max(1, ...cur, ...last), bw = (W - pad) / 12;
  const h = (v) => Math.round((v / max) * (Hh - 30));
  const nowI = (new Date().getMonth() + 9) % 12;
  return '<svg class="yy-chart" viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="' + esc('This year and last year, month by month') + '">' +
    cur.map((v, i) => {
      const x = pad + i * bw;
      return '<rect x="' + (x + 2).toFixed(1) + '" y="' + (Hh - 18 - h(last[i])) + '" width="' + (bw / 2 - 3).toFixed(1) + '" height="' + h(last[i]) + '" class="yy-last"/>' +
        (i <= nowI ? '<rect x="' + (x + bw / 2).toFixed(1) + '" y="' + (Hh - 18 - h(v)) + '" width="' + (bw / 2 - 3).toFixed(1) + '" height="' + h(v) + '" class="yy-cur"/>' : '') +
        '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (Hh - 4) + '" text-anchor="middle">' + MON3[i] + '</text>';
    }).join('') + '<line x1="' + pad + '" y1="' + (Hh - 18) + '" x2="' + W + '" y2="' + (Hh - 18) + '" class="yy-axis"/>' +
    '<text x="2" y="12" class="yy-max">' + esc(money ? rsShortNum(max) : String(Math.round(max))) + '</text></svg>';
}
function rsShortNum(v) { return typeof rsShort === 'function' ? rsShort(v) : '₹ ' + Math.round(v).toLocaleString('en-IN'); }
async function renderYY() {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const D = S.yy && S.yyAt > Date.now() - 120000 ? S.yy : await yyData();
  if (!$('#content')) return;
  S.yy = D; S.yyAt = Date.now(); S.yyKind = S.yyKind || 'sales';
  const k = S.yyKind, X = D[k], money = k === 'sales';
  const nowI = (new Date().getMonth() + 9) % 12;
  const sum = (a, n) => a.slice(0, n + 1).reduce((s, v) => s + v, 0);
  const cur = sum(X.cur, nowI), last = sum(X.last, nowI), ch = last ? Math.round((cur - last) / last * 100) : null;
  const fmt = (v) => (money ? inr(Math.round(v * 100)) : String(Math.round(v)));
  const fyL = (s) => s.slice(0, 4) + '–' + String(+s.slice(0, 4) + 1).slice(2);
  c.innerHTML = '<div class="wf-quick">' + YY_KINDS.map((x) => '<button class="chip-btn' + (x[0] === k ? ' on' : '') + '" data-action="yy-kind" data-k="' + x[0] + '">' + esc(x[1]) + '</button>').join('') + '</div>' +
    '<div class="st-tot"><div><b>' + esc(fmt(cur)) + '</b><span class="noi18n">' + esc(fyL(D.fy)) + '</span></div><div><b>' + esc(fmt(last)) + '</b><span class="noi18n">' + esc(fyL(D.ly)) + '</span></div>' +
    (ch != null ? '<div><b class="' + (ch < 0 ? 'o-red' : 'o-green') + '">' + (ch > 0 ? '+' : '') + ch + '%</b><span>' + esc('So far this year') + '</span></div>' : '') + '</div>' +
    '<div class="card yy-card">' + yyChart(X.cur, X.last, money) + '<div class="yy-key"><span class="yy-k cur"></span><span class="noi18n">' + esc(fyL(D.fy)) + '</span><span class="yy-k last"></span><span class="noi18n">' + esc(fyL(D.ly)) + '</span></div></div>' +
    '<div class="card bf-total">' + MON3.map((m, i) => '<div class="bf-row"><span>' + esc(m) + '</span><b>' + esc((i <= nowI ? fmt(X.cur[i]) : '—') + ' · ' + fmt(X.last[i])) + '</b></div>').join('') + '</div>' +
    (money && D.top.length ? '<div class="section-label">Top shops this year</div><div class="card">' + D.top.map((t) => '<div class="yy-bar"><span class="noi18n">' + esc(t[0]) + '</span><b>' + esc(inr(Math.round(t[1] * 100))) + '</b>' +
      '<i style="width:' + Math.max(3, Math.round(t[1] / D.top[0][1] * 100)) + '%"></i></div>').join('') + '</div>' : '');
}

/* ---------------- old gold from a shop ---------------- */
async function oldGoldModal(client) {
  const t = typeof loadTodayRate === 'function' ? await loadTodayRate() : null;
  const r24 = t ? num(t.r24) : 0;
  const ov = openModal('<h3>Old gold</h3><p class="noi18n">' + esc(client.trade_name) + '</p>' +
    '<div class="o-2col"><div class="field"><label>Weight (g)</label><input type="text" inputmode="decimal" id="og-w"></div>' +
    '<div class="field"><label>Tested purity (%)</label><input type="text" inputmode="decimal" id="og-p" placeholder="91.6"></div></div>' +
    '<div class="wf-quick">' + KT.slice(1).map((k) => '<button type="button" class="chip-btn" data-p="' + k[1] + '">' + k[0] + ' · ' + k[1] + '%</button>').join('') + '</div>' +
    '<div class="field"><label>Melting loss (%)</label><input type="text" inputmode="decimal" id="og-l" value="0.5"></div>' +
    '<div class="card bf-total" id="og-sum" style="box-shadow:none;padding:4px 0"></div>' +
    '<p class="hint">It goes on the shop\'s account as raw gold received (its fine gold).</p>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Save</button></div>');
  const calc = () => {
    const w = numOrNull($('#og-w').value) || 0, p = numOrNull($('#og-p').value) || 0, l = numOrNull($('#og-l').value) || 0;
    const net = Math.round(w * (1 - l / 100) * 1000) / 1000, fine = Math.round(net * p * 10) / 1000;
    $('#og-sum').innerHTML = '<div class="bf-row"><span>After melting</span><b>' + esc(grams(net)) + '</b></div><div class="bf-row"><span>Fine gold</span><b>' + esc(grams(fine)) + '</b></div>' +
      (r24 ? '<div class="bf-row"><span>' + esc('Worth at today\'s rate') + '</span><b>' + esc(inr(Math.round(fine * r24 * 100))) + '</b></div>' : '');
    return { w, p, l, net, fine };
  };
  ov.querySelectorAll('#og-w, #og-p, #og-l').forEach((i) => i.addEventListener('input', calc));
  ov.querySelector('.wf-quick').addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b) { $('#og-p').value = b.dataset.p; calc(); } });
  calc();
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    const x = calc();
    if (!(x.w > 0) || !(x.p > 0 && x.p <= 100)) { toast('Write the weight and the purity.', 'err'); return; }
    if (x.l < 0 || x.l >= 50) { toast('Check the melting loss.', 'err'); return; }
    e.target.disabled = true;
    const { error } = await db.from('receipts').insert({ client_id: client.id, kind: 'metal', metal_g: x.net, metal_purity: x.p, received_on: todayStr(),
      note: 'Old gold: ' + grams(x.w) + (x.l ? ', melting loss ' + x.l + '%' : ''), created_by: S.me.id });
    if (error) { e.target.disabled = false; toast('Could not save — try again.', 'err'); return; }
    closeModal();
    toast('Old gold received ✓ — ' + grams(x.fine) + ' fine', 'ok');
  };
}

/* a shop picked from the list: back to where we were, then the box */
function pickedBack() { if (S.sub.length) { S.suppressPop = true; try { history.back(); } catch (_) { /* ignore */ } goBack(); } }
onAct('op-list', () => showSub('Old dues of shops', renderOpenings));
onAct('op-new', () => pickClientThen('Old dues of a shop', async (cl) => { pickedBack(); openingModal(cl, await loadOpening(cl.id)); }));
onAct('op-edit', async (el) => {
  const [{ data: cl }, op] = await Promise.all([db.from('clients').select('id, trade_name').eq('id', el.dataset.id).maybeSingle(), loadOpening(el.dataset.id)]);
  if (cl) openingModal(cl, op);
});
onAct('bk-list', () => showSub('Gold rate bookings', renderBookings));
onAct('bk-new', () => pickClientThen('Book a gold rate', (cl) => { pickedBack(); bookingModal(cl); }));
onAct('bk-open', (el) => bookingDetail(el.dataset.id));
onAct('bf-book', (el) => {
  const F = S.bf, k = F && (F.bookings || []).find((x) => x.id === el.dataset.id);
  if (!k) return;
  if (bfSetRate('gold_rate', String(num(k.rate)))) { F.booking = k.id; toast('The booked rate is used ✓', 'ok'); billExtras(F); }
});
onAct('bf-offer', (el) => {
  const F = S.bf, o = F && F.offerNow;
  if (!o || o.id !== el.dataset.id || F.offerUsed === o.id) return;
  const inp = document.querySelector('[data-bfr="labour_rate"]');
  const lab = inp ? numOrNull(inp.value) : null;
  if (!(lab > 0)) { toast('Write the labour first.', 'err'); return; }
  if (bfSetRate('labour_rate', String(Math.round(lab * (100 - num(o.pct))) / 100))) { F.offerUsed = o.id; toast(num(o.pct) + '% off making ✓', 'ok'); billExtras(F); }
});
onAct('mo-list', () => showSub('Offers on making', renderOffers));
onAct('mo-new', () => offerModal(null));
onAct('mo-edit', (el) => offerModal(el.dataset.id));
onAct('mo-wa', (el) => { const o = (S.offers || []).find((x) => x.id === el.dataset.id); if (o) openWa('', offerText(o)); });
onAct('pl-open', () => showSub('Places', renderPlaces));
onAct('pl-show', (el) => showSub(el.dataset.n || 'No place yet', () => renderPlacePieces(el.dataset.n || null)));
onAct('pl-set', (el) => placeChooser('Move to', async (name) => {
  if (await setPiecePlace(el.dataset.id, name)) { toast('Moved to ' + name + ' ✓', 'ok'); const it = await fetchCatItem(el.dataset.id); if (it) loadCatPlace(it); }
}));
onAct('pl-add', () => {
  const ov = openModal('<h3>Add a place</h3><div class="field"><label>Name</label><input type="text" id="pl-name" maxlength="40" autocomplete="off" placeholder="e.g. Counter 2"></div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Add</button></div>');
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    const name = $('#pl-name').value.trim();
    if (!name) { toast('Write a name.', 'err'); return; }
    e.target.disabled = true;
    const { error } = await db.from('stock_places').insert({ name, sort: (S.places || []).length + 1 });
    if (error) { e.target.disabled = false; toast(/duplicate/i.test(error.message || '') ? 'This place is already there.' : 'Could not save — try again.', 'err'); return; }
    closeModal(); toast('Added ✓', 'ok'); renderPlaces();
  };
});
onAct('pl-del', (el) => confirmModal('Remove this place?', 'Its pieces keep the name until you move them.', 'Remove', async () => {
  const { error } = await db.from('stock_places').delete().eq('id', el.dataset.id);
  if (error) { toast('Could not remove — try again.', 'err'); return; }
  toast('Removed', 'ok'); renderPlaces();
}, true));
onAct('pl-move', async () => { await loadPlaces(); if (!S.places.length) { toast('Add a place first.', 'err'); return; } S.mv = { place: S.places[0].name, done: [] }; showSub('Move pieces', renderMovePieces); });
onAct('mv-add', () => { const i = $('#mv-code'); if (i && i.value.trim()) { const v = i.value; i.value = ''; moveCode(v); } });
onAct('mv-cam', () => {
  if (typeof openCodeScanner !== 'function') return;
  openCodeScanner({ title: 'Move pieces', sub: 'Point the camera at the QR code on each tag.', onCode: async (text) => moveCode(text) });
});
onAct('pnl-open', () => { S.plMonth = monthStart(); showSub('Profit & loss', renderPL); });
onAct('pl-m', (el) => { S.plMonth = addMonths(S.plMonth || monthStart(), +el.dataset.d); if (S.plMonth > monthStart()) S.plMonth = monthStart(); renderPL(); });
onAct('yy-open', () => { S.yyKind = 'sales'; showSub('This year and last year', renderYY); });
onAct('yy-kind', (el) => { S.yyKind = el.dataset.k; renderYY(); });
onAct('og-new', () => pickClientThen('Old gold from a shop', (cl) => { pickedBack(); oldGoldModal(cl); }));
onAct('og-for', async (el) => { const { data } = await db.from('clients').select('id, trade_name').eq('id', el.dataset.id).maybeSingle(); if (data) oldGoldModal(data); });
