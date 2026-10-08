/* ============================================================
   PAYMENT STATUS — for each party: payment DUE (by a date) or
   DONE (paid on a date). No amounts anywhere.
   Every change is a dated entry (table party_pay_log), so a
   party's page shows the history of payment dates; the newest
   entry is the party's current status.
   Screens: the Payment card on a party's page, the Payment dues
   list (overdue / today / coming up, WhatsApp reminders) and the
   block on the Today screen.
   ============================================================ */
'use strict';

const PAY_STATUS_LABEL = { due: 'Payment due', done: 'Payment done' };

/* the database update (05) has not been run yet */
function payTableMissing(error) {
  const c = String((error && error.code) || ''), m = String((error && error.message) || '');
  return c === '42P01' || c === 'PGRST205' || /party_pay_log/.test(m);
}
const PAY_SETUP_NOTE = 'Payment status needs a one-time database update (ark-update-payments-vendors.sql). Ask the owner to run it in Supabase.';

/* text for a due date: overdue / today / the date */
function payDueInfo(d) {
  const t = todayStr();
  if (d < t) { const n = daysBetween(d, t); return { cls: 'late', text: 'Overdue ' + n + (n === 1 ? ' day' : ' days') }; }
  if (d === t) return { cls: 'today', text: 'Due today' };
  if (d === todayStr(1)) return { cls: 'soon', text: 'Due tomorrow' };
  return { cls: 'soon', text: 'Due by ' + fmtD(d) };
}
function payEntryText(r) { return r.status === 'done' ? 'Paid on ' + fmtD(r.on_date) : 'Due by ' + fmtD(r.on_date); }

/* every entry, oldest first → per party: the current entry and the last "done" */
async function payAllEntries() {
  return fetchPaged(() => db.from('party_pay_log')
    .select('id, client_id, status, on_date, note, created_by, created_at, clients(trade_name, city, mobile, contact_person)')
    .order('created_at', { ascending: true }).order('id', { ascending: true }));
}
function payIndex(rows) {
  const m = new Map();
  (rows || []).forEach((r) => {
    if (!m.has(r.client_id)) m.set(r.client_id, { id: r.client_id, cl: r.clients || {}, cur: null, lastDone: null, n: 0 });
    const e = m.get(r.client_id);
    e.cur = r;
    e.n++;
    if (r.status === 'done') e.lastDone = r;
    if (r.clients && !e.cl.trade_name) e.cl = r.clients;
  });
  return m;
}
/* parties whose payment is due, oldest due date first, in groups */
function payDueGroups(index) {
  const t = todayStr(), wk = todayStr(7);
  const due = Array.from(index.values()).filter((e) => e.cur && e.cur.status === 'due')
    .sort((a, b) => (a.cur.on_date < b.cur.on_date ? -1 : a.cur.on_date > b.cur.on_date ? 1 : String(a.cl.trade_name || '').localeCompare(String(b.cl.trade_name || ''))));
  return {
    all: due,
    late: due.filter((e) => e.cur.on_date < t),
    today: due.filter((e) => e.cur.on_date === t),
    week: due.filter((e) => e.cur.on_date > t && e.cur.on_date <= wk),
    later: due.filter((e) => e.cur.on_date > wk),
  };
}

/* ---------------- WhatsApp reminder (no amount) ---------------- */
function payReminderText(cl, dueOn) {
  const name = cl.contact_person || cl.trade_name || '';
  const t = todayStr();
  const when = dueOn < t ? 'your payment was due on ' + fmtDLong(dueOn)
    : dueOn === t ? 'your payment is due today (' + fmtDLong(dueOn) + ')'
      : 'your payment is due on ' + fmtDLong(dueOn);
  return ['Namaste ' + name + ',', '', 'This is a gentle reminder from ' + bizName() + ' — ' + when + '.', '',
    'Kindly arrange it at your earliest convenience. Thank you!'].join('\n');
}

/* ---------------- the Payment card on a party's page ---------------- */
async function loadClientPay(cl) {
  const el = $('#client-pay');
  if (!el) return;
  const { data, error } = await db.from('party_pay_log').select('*').eq('client_id', cl.id)
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(200);
  if (!$('#client-pay') || S.currentClientId !== cl.id) return;
  if (error) {
    el.innerHTML = payTableMissing(error) ? '<div class="section-label">Payment</div><div class="notice">' + esc(PAY_SETUP_NOTE) + '</div>' : '';
    return;
  }
  const rows = data || [];
  S.payClient = { cl, rows };
  const cur = rows[0] || null;
  let now;
  if (!cur) now = '<div class="pay-now"><span class="chip chip-off">No status yet</span></div><div class="hint" style="margin:2px 0 10px">Mark the payment as due (with the date) or done.</div>';
  else if (cur.status === 'due') {
    const info = payDueInfo(cur.on_date);
    now = '<div class="pay-now"><span class="chip pay-chip-' + (info.cls === 'late' ? 'late' : 'due') + '">Payment due</span>' +
      '<b>' + esc('Due by ' + fmtD(cur.on_date)) + '</b>' + (info.cls === 'late' || info.cls === 'today' ? '<span class="pay-flag ' + info.cls + '">' + esc(info.text) + '</span>' : '') + '</div>';
  } else {
    now = '<div class="pay-now"><span class="chip pay-chip-done">Payment done</span><b>' + esc('Paid on ' + fmtD(cur.on_date)) + '</b></div>';
  }
  if (cur && cur.note) now += '<div class="o-item-meta" style="margin:-2px 0 8px">' + esc(cur.note) + '</div>';
  const owner = isOwner();
  const btns = !cur || cur.status === 'done'
    ? '<button class="btn btn-small btn-secondary" data-action="pay-set" data-s="due">⏰ Payment due</button>' +
      (!cur ? '<button class="btn btn-small btn-secondary" data-action="pay-set" data-s="done">✓ Payment done</button>' : '')
    : '<button class="btn btn-small btn-primary" data-action="pay-set" data-s="done">✓ Payment done</button>' +
      '<button class="btn btn-small btn-secondary" data-action="pay-set" data-s="due">Change date</button>' +
      '<button class="btn btn-small btn-secondary" data-action="pay-wa">WhatsApp</button>';
  el.innerHTML = '<div class="section-label">Payment</div><div class="card pay-card">' + now +
    '<div class="pay-btns">' + btns + '</div>' +
    (rows.length ? '<div class="pay-hist"><div class="pay-hist-h">Payment dates</div>' + rows.slice(0, 30).map((r) =>
      '<div class="pay-row"><span class="pay-dot ' + r.status + '"></span><div class="pay-main"><b>' + esc(payEntryText(r)) + '</b>' +
      '<div class="o-item-meta">' + esc([r.note, nameOf(r.created_by), fmtD(r.created_at)].filter(Boolean).join(' · ')) + '</div></div>' +
      (owner ? '<button class="fu-x" data-action="pay-del" data-id="' + r.id + '" aria-label="Remove entry">✕</button>' : '') + '</div>').join('') +
      (rows.length > 30 ? '<div class="hint">' + (rows.length - 30) + ' older entries are in Reports → Payment dates</div>' : '') + '</div>' : '') +
    '</div>';
}

/* mark due (with the due date) or done (with the date paid) */
function openPayStatusModal(cl, status, after) {
  const due = status === 'due';
  const cur = S.payClient && S.payClient.cl.id === cl.id ? S.payClient.rows[0] : null;
  const def = due ? (cur && cur.status === 'due' ? cur.on_date : todayStr(7)) : todayStr();
  const ov = openModal('<h3>' + (due ? 'Payment due' : 'Payment done') + ' — ' + esc(cl.trade_name || '') + '</h3>' +
    '<p>' + (due ? 'The date by which the party should pay.' : 'The date the party paid.') + '</p>' +
    '<div class="field"><label>' + (due ? 'Due by' : 'Paid on') + '</label><input type="date" id="pay-date" value="' + esc(def) + '"></div>' +
    '<div class="field"><label>Note (optional)</label><input type="text" id="pay-note" placeholder="' + (due ? 'e.g. For ORD-0004' : 'e.g. Cheque given') + '"></div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Save</button></div>');
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    const d = $('#pay-date').value;
    if (!d) { toast('Choose the date.', 'err'); return; }
    e.target.disabled = true;
    const { error } = await db.from('party_pay_log').insert({ client_id: cl.id, status, on_date: d, note: $('#pay-note').value.trim() || null, created_by: S.me.id });
    if (error) { e.target.disabled = false; toast(payTableMissing(error) ? PAY_SETUP_NOTE : 'Could not save — try again.', 'err'); return; }
    closeModal();
    toast(due ? 'Payment due ' + fmtD(d) + ' ✓' : 'Payment done ✓', 'ok');
    if (after) after(); else if (S.currentClientId === cl.id) loadClientPay(cl);
  };
}

/* ---------------- Payment dues list ---------------- */
async function renderPayDues() {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  let rows;
  try { rows = await payAllEntries(); } catch (e) {
    if (!$('#content')) return;
    c.innerHTML = '<div class="empty">' + esc(payTableMissing(e) ? PAY_SETUP_NOTE : 'Could not load — try again.') + '</div>';
    return;
  }
  if (!$('#content') || !S.sub.length || S.sub[S.sub.length - 1].title !== 'Payment dues') return;
  const idx = payIndex(rows);
  const G = payDueGroups(idx);
  S.payDues = G.all;
  const since = todayStr(-30);
  const done = Array.from(idx.values()).filter((e) => e.cur && e.cur.status === 'done' && e.cur.on_date >= since)
    .sort((a, b) => (a.cur.on_date < b.cur.on_date ? 1 : a.cur.on_date > b.cur.on_date ? -1 : 0));
  const item = (e) => {
    const i = G.all.indexOf(e), info = payDueInfo(e.cur.on_date);
    return '<div class="list-item" style="cursor:default">' +
      '<div class="li-main" data-action="open-client" data-id="' + e.id + '" style="cursor:pointer">' +
      '<div class="li-title">' + esc(e.cl.trade_name || 'Party') + '</div>' +
      '<div class="li-sub">' + esc([e.cl.city, 'Due by ' + fmtD(e.cur.on_date), e.cur.note].filter(Boolean).join(' · ')) + '</div>' +
      (info.cls !== 'soon' ? '<div class="li-chips"><span class="chip pay-chip-' + (info.cls === 'late' ? 'late' : 'due') + '">' + esc(info.text) + '</span></div>' : '') + '</div>' +
      '<div class="dues-btns"><button class="btn btn-small btn-primary" data-action="pay-quick-done" data-idx="' + i + '">✓ Done</button>' +
      '<button class="btn btn-small btn-secondary" data-action="pay-remind" data-idx="' + i + '">Remind</button>' +
      (e.cl.mobile ? '<a class="btn btn-small btn-ghost" href="' + esc(telHref(e.cl.mobile)) + '">Call</a>' : '') + '</div></div>';
  };
  const group = (label, cls, arr) => arr.length ? '<div class="due-group-label ' + cls + '">' + label + ' (' + arr.length + ')</div>' + arr.map(item).join('') : '';
  c.innerHTML =
    '<div class="stat-row">' +
    '<div class="stat"><div class="st-num' + (G.late.length ? ' o-red' : '') + '">' + G.late.length + '</div><div class="st-label">Overdue</div></div>' +
    '<div class="stat"><div class="st-num">' + G.today.length + '</div><div class="st-label">Due today</div></div>' +
    '<div class="stat"><div class="st-num">' + (G.week.length + G.later.length) + '</div><div class="st-label">Coming up</div></div>' +
    '</div><div style="height:8px"></div>' +
    (G.all.length
      ? group('Overdue', 'overdue', G.late) + group('Due today', 'today', G.today) + group('Next 7 days', 'soon', G.week) + group('Later', 'soon', G.later)
      : '<div class="empty"><div class="big">🎉</div>No payments due.<br>Open a party and tap “Payment due” to add one.</div>') +
    (done.length ? '<div class="section-label">Paid in the last 30 days (' + done.length + ')</div><div class="card" style="padding:4px 14px">' +
      done.slice(0, 50).map((e) => '<div class="acc-row tap" data-action="open-client" data-id="' + e.id + '"><div class="acc-main"><b>' + esc(e.cl.trade_name || 'Party') + '</b>' +
        '<div class="o-item-meta">' + esc([e.cl.city, e.cur.note].filter(Boolean).join(' · ')) + '</div></div>' +
        '<div class="acc-amt in">' + esc('Paid on ' + fmtD(e.cur.on_date)) + '</div></div>').join('') + '</div>' : '');
}

/* ---------------- Today screen: overdue and due today ---------------- */
async function loadTodayPay() {
  const el = $('#today-pay');
  if (!el) return;
  let rows;
  try { rows = await payAllEntries(); } catch (e) { return; }
  if (!$('#today-pay')) return;
  const G = payDueGroups(payIndex(rows));
  const list = G.late.concat(G.today);
  if (!list.length) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="due-group-label overdue sl-row"><span>Payments due — overdue and today (' + list.length + ')</span>' +
    '<a href="#" data-action="dues-open">See all ›</a></div>' +
    list.slice(0, 8).map((e) => {
      const info = payDueInfo(e.cur.on_date);
      return '<div class="list-item" data-action="open-client" data-id="' + e.id + '"><div class="li-main">' +
        '<div class="li-title">' + esc(e.cl.trade_name || 'Party') + '</div>' +
        '<div class="li-sub">' + esc([e.cl.city, 'Due by ' + fmtD(e.cur.on_date)].filter(Boolean).join(' · ')) + '</div>' +
        '<div class="li-chips"><span class="chip pay-chip-' + (info.cls === 'late' ? 'late' : 'due') + '">' + esc(info.text) + '</span></div></div>' +
        '<div style="color:var(--muted)">›</div></div>';
    }).join('') +
    (list.length > 8 ? '<div class="hint" style="text-align:center;margin:-4px 0 10px">+ ' + (list.length - 8) + ' more in Payment dues</div>' : '');
}

/* ---------------- owner backup (More → Export all data) ---------------- */
async function exportPayData(pName, cName, today) {
  const rows = await fetchAll('party_pay_log', 'created_at');
  await new Promise((r) => setTimeout(r, 450));
  downloadFile('bj-payment-dates-' + today + '.csv', buildCsv(
    ['Party', 'Status', 'Due by / paid on', 'Note', 'Added by', 'Added on'],
    rows.map((r) => [cName.get(r.client_id) || '', r.status === 'done' ? 'Payment done' : 'Payment due', r.on_date, r.note, pName.get(r.created_by) || '', fmtExp(r.created_at)])));
}

onAct('dues-open', () => showSub('Payment dues', renderPayDues));
onAct('pay-set', (el) => { const P = S.payClient; if (P) openPayStatusModal(P.cl, el.dataset.s); });
onAct('pay-wa', () => {
  const P = S.payClient;
  const cur = P && P.rows[0];
  if (cur && cur.status === 'due') openWa(P.cl.mobile, payReminderText(P.cl, cur.on_date));
});
onAct('pay-remind', (el) => {
  const e = S.payDues && S.payDues[+el.dataset.idx];
  if (e) openWa(e.cl.mobile, payReminderText(e.cl, e.cur.on_date));
});
onAct('pay-quick-done', (el) => {
  const e = S.payDues && S.payDues[+el.dataset.idx];
  if (e) openPayStatusModal({ id: e.id, trade_name: e.cl.trade_name }, 'done', () => renderPayDues());
});
onAct('pay-del', (el) => confirmModal('Remove this entry?', 'The party\'s payment status goes back to the entry before it.', 'Remove', async () => {
  const { error } = await db.from('party_pay_log').delete().eq('id', el.dataset.id);
  if (error) { toast('Could not remove — only the owner can remove entries.', 'err'); return; }
  toast('Entry removed', 'ok');
  if (S.payClient) loadClientPay(S.payClient.cl);
}, true));
