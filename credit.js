/* ============================================================
   CREDIT RULES (database update 12) — the app keeps no amounts, so a
   shop's credit is judged by its payment dates and its orders:
   · its payment is late by more than N days (the app setting — 30 —
     or the shop's own number)
   · it already has its limit of orders in work (if the owner set one)
   · the owner put it on hold (with a reason)
   An approved order for such a shop: the owner sees why and can go
   ahead; a team member saves it as a quotation for the owner.
   Approving a quotation asks the same. Delivering to such a shop asks
   first. Only the owner sets the rules (the database makes sure).
   ============================================================ */
'use strict';

const CREDIT_DAYS_DEFAULT = 30;
function creditOn() { return !!S.dbv12 && appOn('credit'); }
function creditDaysDefault() {
  const n = parseInt(appOpts().credit_days, 10);
  return isFinite(n) && n >= 0 ? Math.min(n, 365) : CREDIT_DAYS_DEFAULT;
}
function creditDaysFor(cl) { return cl && cl.credit_days != null ? +cl.credit_days : creditDaysDefault(); }

/* what stands in the way of a new order for this shop right now: [] = nothing.
   Not readable (no internet…) = nothing: the rules never stop work by mistake. */
async function creditProblems(clientId) {
  let cr, pr, or;
  try {
    [cr, pr, or] = await Promise.all([
      db.from('clients').select('id, trade_name, credit_hold, credit_days, credit_max_open, credit_note').eq('id', clientId).maybeSingle(),
      appOn('payments') ? db.from('party_pay_log').select('status, on_date').eq('client_id', clientId)
        .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1) : Promise.resolve({ data: [] }),
      db.from('orders').select('id').eq('client_id', clientId).in('status', OPEN_STATUSES).limit(500),
    ]);
  } catch (e) { return []; }
  const cl = cr && cr.data;
  if (!cl) return [];
  const out = [];
  if (cl.credit_hold) out.push({ k: 'hold', text: 'On hold' + (cl.credit_note ? ' — ' + cl.credit_note : '') });
  const cur = pr && !pr.error && pr.data && pr.data[0];
  if (cur && cur.status === 'due') {
    const late = daysBetween(cur.on_date, todayStr());
    if (late > creditDaysFor(cl)) out.push({ k: 'late', text: 'Payment late by ' + late + (late === 1 ? ' day' : ' days') + ' (due by ' + fmtD(cur.on_date) + ')' });
  }
  const open = (or && or.data ? or.data : []).length;
  if (cl.credit_max_open && open >= cl.credit_max_open) {
    out.push({ k: 'max', text: (open === 1 ? '1 order' : open + ' orders') + ' in work — the limit is ' + cl.credit_max_open });
  }
  return out;
}
function creditListHTML(probs) { return '<ul class="cr-list">' + probs.map((p) => '<li>' + esc(p.text) + '</li>').join('') + '</ul>'; }
function creditNoteText(probs, overridden) { return (overridden ? 'Credit rules overridden: ' : 'Credit rules: ') + probs.map((p) => p.text).join('; '); }

/* a new approved order: the owner can go ahead; anyone can save a quotation instead */
function creditAskOrder(probs, shopName, onGo, onQuote) {
  const owner = isOwner();
  const ov = openModal('<h3>⚠ Check before taking this order</h3>' +
    '<p class="cr-shop"><b>' + esc(shopName || '') + '</b></p>' + creditListHTML(probs) +
    '<p class="hint">' + (owner ? 'You can still take the order — or save it as a quotation for now.'
      : 'Only the owner can take an order for this shop now. Save it as a quotation — the owner can approve it.') + '</p>' +
    '<div class="modal-actions cr-acts"><button class="btn btn-secondary" data-m="no">Cancel</button>' +
    '<button class="btn ' + (owner ? 'btn-secondary' : 'btn-primary') + '" data-m="quote">Save as quotation</button>' +
    (owner ? '<button class="btn btn-primary" data-m="go">Take order anyway</button>' : '') + '</div>');
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=quote]').onclick = () => { closeModal(); onQuote(); };
  const g = ov.querySelector('[data-m=go]');
  if (g) g.onclick = () => { closeModal(); onGo(); };
}
/* approving a quotation: the owner can go ahead; a team member is told why not */
function creditAskApprove(probs, shopName, onGo) {
  if (!isOwner()) {
    const ov = openModal('<h3>⚠ The owner has to approve this one</h3><p class="cr-shop"><b>' + esc(shopName || '') + '</b></p>' + creditListHTML(probs) +
      '<p class="hint">Ask the owner to approve the quotation.</p><div class="modal-actions"><button class="btn btn-primary" data-m="ok">Close</button></div>');
    ov.querySelector('[data-m=ok]').onclick = closeModal;
    return;
  }
  const ov = openModal('<h3>⚠ Approve anyway?</h3><p class="cr-shop"><b>' + esc(shopName || '') + '</b></p>' + creditListHTML(probs) +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="go">Approve anyway</button></div>');
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=go]').onclick = () => { closeModal(); onGo(); };
}
/* delivering: a gentle check for everyone (the goods leave the shop) */
async function creditCheckDelivery(o, go) {
  if (!creditOn()) { go(); return; }
  const probs = (await creditProblems(o.client_id)).filter((p) => p.k !== 'max');
  if (!probs.length) { go(); return; }
  const shop = (o.clients && o.clients.trade_name) || '';
  const ov = openModal('<h3>⚠ Deliver to this shop?</h3><p class="cr-shop"><b>' + esc(shop) + '</b></p>' + creditListHTML(probs) +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="go">Deliver anyway</button></div>');
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=go]').onclick = () => { closeModal(); go(); };
}

/* ---------------- the shop's page: its credit, and the owner's rules ---------------- */
async function loadClientCredit(cl) {
  const el = $('#client-credit');
  if (!el || !creditOn()) return;
  const probs = await creditProblems(cl.id);
  if (!$('#client-credit') || S.currentClientId !== cl.id) return;
  S.crClient = cl;
  const owner = isOwner();
  const set = !!cl.credit_hold || cl.credit_days != null || !!cl.credit_max_open;
  if (!owner && !set && !probs.length) { el.innerHTML = ''; return; }
  const rules = [];
  if (cl.credit_hold) rules.push('On hold' + (cl.credit_note ? ' — ' + cl.credit_note : ''));
  const d = creditDaysFor(cl);
  rules.push((d === 0 ? 'No late payment allowed' : 'Payment can be late by up to ' + d + (d === 1 ? ' day' : ' days')) + (cl.credit_days == null ? ' (app setting)' : ''));
  if (cl.credit_max_open) rules.push('At most ' + cl.credit_max_open + (cl.credit_max_open === 1 ? ' order' : ' orders') + ' in work');
  el.innerHTML = '<div class="section-label">Credit</div><div class="card cr-card' + (probs.length ? ' warn' : '') + '">' +
    (probs.length ? '<div class="cr-warn">⚠ New approved orders need the owner\'s OK</div>' + creditListHTML(probs)
      : '<div class="cr-ok">✓ New orders are fine</div>') +
    '<div class="cr-rules">' + rules.map((r) => '<div>' + esc(r) + '</div>').join('') + '</div>' +
    (owner ? '<button class="btn btn-small btn-secondary" data-action="cr-edit">Credit rules</button>' : '') + '</div>';
}

function creditEdit() {
  const cl = S.crClient;
  if (!cl || !isOwner()) return;
  const ov = openModal('<h3>Credit rules</h3><p class="cr-shop"><b>' + esc(cl.trade_name || '') + '</b></p>' +
    '<label class="sw-row"><span class="sw-t"><b>On hold</b><span>No new approved orders without your OK</span></span>' +
    '<input type="checkbox" class="sw" id="cr-hold"' + (cl.credit_hold ? ' checked' : '') + '></label>' +
    '<div class="field"><label>Reason (the team sees it)</label><input type="text" id="cr-note" maxlength="120" autocomplete="off" value="' + esc(cl.credit_note || '') + '" placeholder="e.g. Cheque returned"></div>' +
    '<div class="field"><label>Payment can be late by up to (days)</label><input type="number" inputmode="numeric" min="0" max="365" id="cr-days" value="' +
    (cl.credit_days != null ? esc(cl.credit_days) : '') + '" placeholder="' + creditDaysDefault() + ' (app setting)"></div>' +
    '<div class="field"><label>Most orders in work at once</label><input type="number" inputmode="numeric" min="1" max="99" id="cr-max" value="' +
    (cl.credit_max_open ? esc(cl.credit_max_open) : '') + '" placeholder="No limit"></div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Save</button></div>');
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    const int = (id, lo, hi) => { const v = String($(id).value || '').trim(); if (!v) return null; const n = parseInt(v, 10); return isFinite(n) && n >= lo && n <= hi ? n : NaN; };
    const days = int('#cr-days', 0, 365), max = int('#cr-max', 1, 99);
    if (Number.isNaN(days)) { toast('Days: a number from 0 to 365, or leave it empty.', 'err'); return; }
    if (Number.isNaN(max)) { toast('Orders in work: a number from 1 to 99, or leave it empty.', 'err'); return; }
    const patch = { credit_hold: $('#cr-hold').checked, credit_note: $('#cr-note').value.trim() || null, credit_days: days, credit_max_open: max };
    e.target.disabled = true;
    const { error } = await db.from('clients').update(patch).eq('id', cl.id);
    if (error) { e.target.disabled = false; toast(/owner/i.test(error.message || '') ? 'Only the owner can change credit rules.' : 'Could not save — try again.', 'err'); return; }
    closeModal();
    toast('Credit rules saved ✓', 'ok');
    openClient(cl.id, true);
  };
}

onAct('cr-edit', () => creditEdit());
