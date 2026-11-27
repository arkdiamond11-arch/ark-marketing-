/* ============================================================
   CUSTOMER CARE, THE ACTIVITY LOG, WHO SEES WHICH DEPARTMENT (database update 21)
   · Complaints: a shop's complaint (a loose stone, a wrong size, a late
     delivery…) with photos — given as work to someone in one tap, followed
     till it is solved, and the shop told on WhatsApp.
   · Feedback: the stars shops gave (lowest first), and delivered orders
     to ask for stars.
   · Activity: who did what, and when (the owner).
   · Departments for each person (the owner, in Team members).
   ============================================================ */
'use strict';

function careOn() { return !!S.dbv21; }
const caseTask = (x) => (x && x.tasks && x.tasks.status ? x.tasks : null);   // the work given for a complaint (if any)

/* ---------------- complaints ---------------- */
async function renderCare() {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data, error } = await db.from('care_cases').select('*, clients(trade_name, mobile), orders(order_no), tasks(status, given_to)')
    .or('status.eq.open,solved_at.gte.' + since).order('created_at', { ascending: true }).limit(500);
  if (!$('#content')) return;
  if (error) { c.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  S.cases = new Map((data || []).map((x) => [x.id, x]));
  const open = (data || []).filter((x) => x.status === 'open'), done = (data || []).filter((x) => x.status === 'solved').reverse();
  const row = (x) => {
    const days = Math.floor((Date.now() - new Date(x.created_at).getTime()) / 86400000);
    return '<div class="card rc-item tap" data-action="cs-case" data-id="' + x.id + '"><div><b class="noi18n">' + esc((x.clients || {}).trade_name || '—') + '</b>' +
      (x.orders ? ' · <span class="noi18n">' + esc(ordNo(x.orders.order_no)) + '</span>' : '') +
      '<div class="cs-issue noi18n">' + esc(x.issue) + '</div>' +
      '<div class="rc-sub">' + esc(x.status === 'open' ? (days < 1 ? 'Today' : days === 1 ? '1 day open' : days + ' days open') : 'Solved ' + fmtD(x.solved_at)) +
      (caseTask(x) ? ' · ' + esc('Work: ' + ({ todo: 'to do', started: 'started', done: 'completed', accepted: 'done ✓', cancelled: 'cancelled' }[x.tasks.status] || x.tasks.status)) + ' · <span class="noi18n">' + esc(nameOf(x.tasks.given_to)) + '</span>' : '') +
      ((x.files || []).length ? ' · 📎' : '') + '</div></div><span class="mr-go">›</span></div>';
  };
  c.innerHTML = '<button class="btn btn-primary" data-action="cs-new" style="margin-bottom:12px">＋ New complaint</button>' +
    '<div class="section-label">' + esc('Open (' + open.length + ')') + '</div>' + (open.length ? open.map(row).join('') : '<div class="empty">No open complaints. 🎉</div>') +
    (done.length ? '<div class="section-label">Solved in the last 30 days</div>' + done.map(row).join('') : '');
}
function careNew(client, order) {
  WO_ATT.cs = { list: [], draw: () => { const el = $('#cs-atts'); if (el) el.innerHTML = woAttHTML(WO_ATT.cs.list, 'cs'); } };
  const ov = openModal('<h3>New complaint</h3><p class="noi18n">' + esc(client.trade_name) + '</p>' +
    '<div class="field"><label>What is the complaint? <span class="req">*</span></label><textarea id="cs-issue" rows="3" maxlength="1000" placeholder="e.g. A stone fell out of the ring"></textarea></div>' +
    '<div class="field"><label>Order no. (if it is about an order)</label><input type="text" id="cs-ord" autocomplete="off" placeholder="ORD-0012" value="' + esc(order || '') + '"></div>' +
    '<div class="wo-atts" id="cs-atts"></div>' + woPickHTML('cs') +
    (typeof workOn === 'function' && workOn() ? '<label class="sw-row"><span class="sw-t"><b>Give it as work to someone</b><span>Next you choose who solves it</span></span><input type="checkbox" class="sw" id="cs-work" checked></label>' : '') +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Save</button></div>');
  woModalActs(ov);
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    const issue = $('#cs-issue').value.trim(), on = $('#cs-ord').value.trim();
    if (!issue) { toast('Write what the complaint is.', 'err'); return; }
    let orderId = null;
    if (on) {
      const n = parseInt(on.replace(/\D/g, ''), 10);
      const { data: o } = n ? await db.from('orders').select('id').eq('order_no', n).eq('client_id', client.id).maybeSingle() : { data: null };
      if (!o) { toast('This shop has no such order.', 'err'); return; }
      orderId = o.id;
    }
    e.target.disabled = true;
    const id = crypto.randomUUID();
    let files = [], fails = 0;
    if (WO_ATT.cs.list.length) { const up = await woUpload('care/' + id + '/', WO_ATT.cs.list); files = up.files; fails = up.fails; }
    const { error } = await db.from('care_cases').insert({ id, client_id: client.id, order_id: orderId, issue, files, created_by: S.me.id });
    if (error) { e.target.disabled = false; toast('Could not save — try again.', 'err'); return; }
    const give = $('#cs-work') && $('#cs-work').checked;
    closeModal();
    toast('Complaint saved ✓' + (fails ? ' — ' + fails + ' file(s) did not upload' : ''), fails ? 'err' : 'ok');
    if (give) careWork(id, client, issue, on);
    else if ($('#content') && $('#content').querySelector('[data-action="cs-new"]')) renderCare();
  };
}
/* the complaint as work: the work is linked to it when it is given */
function careWork(caseId, client, issue, orderNo) {
  giveWork({ title: ('Complaint: ' + issue).slice(0, 200), details: issue.length > 180 ? issue : '', client: { id: client.id, trade_name: client.trade_name }, orderNo: orderNo || '',
    onGiven: (ids) => { if (ids && ids[0]) db.from('care_cases').update({ task_id: ids[0] }).eq('id', caseId).then(() => {}, () => {}); } });
}
async function renderCase(id) {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const { data: x } = await db.from('care_cases').select('*, clients(id, trade_name, mobile), orders(order_no), tasks(id, status, given_to)').eq('id', id).maybeSingle();
  if (!$('#content')) return;
  if (!x) { c.innerHTML = '<div class="empty">This complaint is not there any more.</div>'; return; }
  S.caseNow = x;
  const cl = x.clients || {};
  c.innerHTML = '<div class="card"><div class="wo-top"><span class="wo-st ' + (x.status === 'open' ? 'st-todo' : 'st-accepted') + '">' + esc(x.status === 'open' ? 'Open' : 'Solved ✓') + '</span></div>' +
    '<h3 class="noi18n" style="margin:8px 0 4px">' + esc(cl.trade_name || '') + (x.orders ? ' · ' + esc(ordNo(x.orders.order_no)) : '') + '</h3>' +
    '<div class="cs-issue big noi18n">' + esc(x.issue) + '</div>' + woFilesHTML(x.files || [], 'Complaint') +
    '<div class="rc-sub">' + esc('Written by ' + nameOf(x.created_by) + ' · ' + fmtDT(x.created_at)) + '</div>' +
    (x.status === 'solved' ? '<div class="bf-row sub"><span>' + esc('Solved by ' + nameOf(x.solved_by) + ' · ' + fmtDT(x.solved_at)) + '</span></div>' + (x.solved_note ? '<div class="noi18n">' + esc(x.solved_note) + '</div>' : '') : '') + '</div>' +
    (caseTask(x) ? '<button class="more-row" data-action="wo-open" data-id="' + x.tasks.id + '"><span class="mr-ic">📝</span><span class="mr-t"><b>' + esc('The work: ' + ({ todo: 'to do', started: 'started', done: 'completed — check it', accepted: 'done ✓', cancelled: 'cancelled' }[x.tasks.status] || x.tasks.status)) + '</b><span class="noi18n">' + esc(nameOf(x.tasks.given_to)) + '</span></span><span class="mr-go">›</span></button>' : '') +
    '<div class="action-row">' + (x.status === 'open' ? '<button class="btn btn-primary" data-action="cs-solve">✓ Solved</button>' + (!caseTask(x) && typeof workOn === 'function' && workOn() ? '<button class="btn btn-secondary" data-action="cs-work">Give as work</button>' : '') : '') +
    (cl.mobile ? '<button class="btn btn-secondary" data-action="cs-wa">WhatsApp the shop</button>' : '') + '</div>' +
    '<button class="btn btn-ghost" data-action="open-client" data-id="' + esc(cl.id || '') + '">Open the shop</button>';
  woLoadPics(c);
}
function careSolve() {
  const x = S.caseNow;
  if (!x) return;
  const ov = openModal('<h3>Solved</h3><div class="field"><label>What was done</label><textarea id="cs-note" rows="3" maxlength="1000" placeholder="e.g. Stone set again, sent back by courier"></textarea></div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Solved</button></div>');
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    e.target.disabled = true;
    const note = $('#cs-note').value.trim();
    const { data, error } = await db.from('care_cases').update({ status: 'solved', solved_at: new Date().toISOString(), solved_by: S.me.id, solved_note: note || null }).eq('id', x.id).select('id');
    if (error || !data || !data.length) { e.target.disabled = false; toast('Could not save — only Customer care or whoever wrote it can close it.', 'err'); return; }
    closeModal();
    toast('Solved ✓', 'ok');
    const mob = (x.clients || {}).mobile;
    renderCase(x.id);
    if (mob) confirmModal('Tell the shop?', 'A WhatsApp message that its complaint is solved.', 'WhatsApp', () => openWa(mob, careText(x, note)));
  };
}
function careText(x, note) {
  return 'Namaste 🙏\n' + (x.status === 'open' && note === undefined ? 'About your complaint: ' + x.issue : 'Your complaint is solved: ' + x.issue + (note ? '\n' + note : '')) + '\n— ' + bizName();
}

/* ---------------- feedback ---------------- */
async function renderFeedback() {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const since = addDaysStr(todayStr(), -90), ask = addDaysStr(todayStr(), -30);
  const [fb, dl] = await Promise.all([
    db.from('orders').select('id, order_no, feedback_stars, feedback_note, feedback_at, clients(trade_name)').not('feedback_stars', 'is', null).gte('feedback_at', since).order('feedback_at', { ascending: false }).limit(500),
    db.from('orders').select('id, order_no, delivered_on, clients(trade_name, mobile)').eq('status', 'delivered').gte('delivered_on', ask).is('feedback_stars', null).order('delivered_on', { ascending: false }).limit(200),
  ]);
  if (!$('#content')) return;
  if (fb.error) { c.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  const list = (fb.data || []).slice().sort((a, b) => a.feedback_stars - b.feedback_stars || String(b.feedback_at).localeCompare(String(a.feedback_at)));
  const avg = list.length ? list.reduce((s, o) => s + o.feedback_stars, 0) / list.length : 0;
  c.innerHTML = '<div class="st-tot"><div><b>' + (list.length ? (Math.round(avg * 10) / 10) + ' ★' : '—') + '</b><span>Average, 90 days</span></div><div><b>' + list.length + '</b><span>Shops gave stars</span></div>' +
    '<div><b class="' + (list.filter((o) => o.feedback_stars <= 3).length ? 'o-red' : '') + '">' + list.filter((o) => o.feedback_stars <= 3).length + '</b><span>3 stars or less</span></div></div>' +
    (list.length ? '<div class="section-label">Stars from shops (lowest first)</div>' + list.map((o) => '<div class="card rc-item tap" data-action="o-open" data-id="' + o.id + '"><div><b class="' + (o.feedback_stars <= 3 ? 'o-red' : 'o-gold') + ' noi18n">' + esc(starsText(o.feedback_stars)) + '</b> · <span class="noi18n">' + esc(((o.clients || {}).trade_name || '') + ' · ' + ordNo(o.order_no)) + '</span>' +
      (o.feedback_note ? '<div class="cs-issue noi18n">' + esc(o.feedback_note) + '</div>' : '') + '<div class="rc-sub">' + esc(fmtD(o.feedback_at)) + '</div></div><span class="mr-go">›</span></div>').join('') : '') +
    '<div class="section-label">' + esc('Delivered, no stars yet (' + (dl.data || []).length + ')') + '</div>' +
    ((dl.data || []).length ? (dl.data || []).map((o) => '<div class="card rc-item"><div><b class="noi18n">' + esc(((o.clients || {}).trade_name || '') + ' · ' + ordNo(o.order_no)) + '</b><div class="rc-sub">' + esc('Delivered ' + fmtD(o.delivered_on)) + '</div></div>' +
      ((o.clients || {}).mobile ? '<button class="btn btn-small btn-secondary" data-action="fb-ask" data-id="' + o.id + '">Ask for stars</button>' : '') + '</div>').join('') : '<div class="empty">Every delivered order has its stars.</div>');
}

/* ---------------- the activity log (owner) ---------------- */
const AC_KINDS = [['all', 'All', null], ['orders', 'Orders', ['orders', 'repairs', 'karigar_txns', 'qc_checks', 'hallmark_jobs']], ['money', 'Bills and money', ['bills', 'receipts', 'bill_returns', 'cash_handovers', 'cash_entries', 'money_accounts', 'expenses', 'gold_rates', 'purchases']],
  ['stock', 'Stock', ['catalogue_items', 'approvals']], ['clients', 'Clients', ['clients', 'care_cases']], ['people', 'Team and work', ['tasks', 'profiles', 'staff', 'leaves']]];
function acLine(r, cn) {
  const d = r.d || {}, ch = d._ch || [], st = (s) => (typeof OSTATUS_LABEL !== 'undefined' && OSTATUS_LABEL[s]) || s;
  const money = (v) => (v != null ? inrNum(v) : '');
  const shop = (id) => (id && cn.get(id)) || '';
  const A = { add: 'added', change: 'changed', delete: 'deleted' };
  switch (r.tbl) {
    case 'clients': return ['👤', { add: 'Added a client', change: 'Changed a client', delete: 'Deleted a client' }[r.op], d.trade_name];
    case 'orders':
      if (r.op === 'add') return ['📋', 'Took an order', ordNo(d.order_no) + ' · ' + shop(d.client_id)];
      if (r.op === 'delete') return ['📋', 'Deleted an order', ordNo(d.order_no)];
      if (ch.indexOf('status') > -1) return ['📋', 'Moved an order', ordNo(d.order_no) + ' · ' + st(d._was_status) + ' → ' + st(d.status)];
      if (ch.indexOf('due_date') > -1) return ['📅', 'Changed a delivery date', ordNo(d.order_no) + ' · ' + (d.due_date ? fmtD(d.due_date) : '—')];
      return ['📋', 'Changed an order', ordNo(d.order_no)];
    case 'bills':
      if (r.op === 'add') return ['🧾', d.kind === 'quote' ? 'Made a quotation' : d.kind === 'sale' ? 'Made a sale bill' : 'Made a bill', [d.bill_no, shop(d.client_id), money(d.total_amt)].filter(Boolean).join(' · ')];
      if (ch.indexOf('status') > -1 && d.status === 'cancelled') return ['🧾', 'Cancelled a bill', [d.bill_no, money(d.total_amt)].filter(Boolean).join(' · ')];
      return ['🧾', 'Changed a bill', [d.bill_no, money(d.total_amt)].filter(Boolean).join(' · ')];
    case 'receipts': return ['💰', r.op === 'delete' ? 'Removed a payment' : 'Got a payment', [shop(d.client_id), d.kind === 'metal' ? grams(d.fine_g) + ' fine' : money(d.amount), d.mode ? payModeLabel(d.mode) : ''].filter(Boolean).join(' · ')];
    case 'bill_returns': return ['↩️', r.op === 'add' ? 'Took back pieces (return)' : 'Changed a return', [shop(d.client_id), money(d.money_amt)].filter(Boolean).join(' · ')];
    case 'catalogue_items':
      if (r.op === 'add') return ['💎', 'Added a piece to stock', [d.tag_no, d.design_no, d.category].filter(Boolean).join(' · ')];
      if (r.op === 'delete') return ['💎', 'Deleted a piece', [d.tag_no, d.design_no].filter(Boolean).join(' · ')];
      if (ch.indexOf('status') > -1) return ['💎', 'A piece is now ' + ({ available: 'in stock', sold: 'sold', approval: 'on approval', reserved: 'in an order' }[d.status] || d.status), [d.tag_no, d.design_no].filter(Boolean).join(' · ')];
      return ['💎', 'Kept a piece for a shop', [d.tag_no, shop(d.hold_client)].filter(Boolean).join(' · ')];
    case 'approvals': return ['💎', r.op === 'add' ? 'Gave pieces on approval' : r.op === 'delete' ? 'Deleted an approval memo' : 'Changed an approval memo', [d.memo_no, shop(d.client_id)].filter(Boolean).join(' · ')];
    case 'repairs': return ['🔧', r.op === 'add' ? 'Took a repair' : r.op === 'delete' ? 'Deleted a repair' : 'Moved a repair', [d.repair_no != null ? 'R-' + d.repair_no : '', shop(d.client_id), r.op === 'change' ? d.status : ''].filter(Boolean).join(' · ')];
    case 'karigar_txns': return ['🔨', r.op === 'delete' ? 'Deleted a karigar entry' : { issue: 'Gave metal to a karigar', receive: 'Got back from a karigar', wastage: 'Wrote karigar wastage' }[d.kind] || 'Paid a karigar',
      d.fine_g != null ? grams(d.fine_g) + ' fine' : money(d.amount)];
    case 'expenses': return ['💸', r.op === 'add' ? 'Claimed an expense' : r.op === 'delete' ? 'Deleted an expense' : { approved: 'Approved an expense', paid: 'Paid an expense', rejected: 'Did not approve an expense' }[d.status] || 'Changed an expense', [d.category, money(d.amount)].filter(Boolean).join(' · ')];
    case 'gold_rates': return ['🏷️', 'Set the gold rate', [d.r24 ? '24K ' + inrNum(d.r24) : '', d.r22 ? '22K ' + inrNum(d.r22) : ''].filter(Boolean).join(' · ')];
    case 'cash_handovers': return ['💵', r.op === 'add' ? 'Handed over cash' : d.status === 'received' ? 'Got the cash handed over' : d.status === 'disputed' ? 'Did not get the cash' : 'Changed a cash handover', money(d.amount) + (r.op === 'add' ? '' : ' · ' + nameOf(d.from_user))];
    case 'tasks': return ['📝', r.op === 'add' ? 'Gave work' : r.op === 'delete' ? 'Deleted work' : { started: 'Started work', done: 'Completed work', accepted: 'Accepted work', cancelled: 'Cancelled work', todo: 'Sent work back' }[d.status] || 'Changed work', d.title + (r.op === 'add' && d.given_to ? ' → ' + nameOf(d.given_to) : '')];
    case 'profiles': return ['👥', r.op === 'add' ? 'Added a team member' : ch.indexOf('depts') > -1 ? 'Changed departments' : ch.indexOf('active') > -1 ? (d.active ? 'Switched on a team member' : 'Switched off a team member') : 'Changed a team member', d.full_name];
    case 'purchases': return ['🛒', r.op === 'add' ? 'Bought' : r.op === 'delete' ? 'Deleted a purchase' : 'Changed a purchase', [vendorName(d.vendor_id), typeof puKind === 'function' ? puKind(d.kind) : d.kind, d.weight_g != null ? grams(d.weight_g) : '', money(d.total)].filter(Boolean).join(' · ')];
    case 'cash_entries': return ['💵', r.op === 'delete' ? 'Deleted a cash entry' : d.dir === 'in' ? 'Wrote money in' : 'Wrote money out', [typeof cbHead === 'function' ? cbHead(d.head, d.dir) : d.head, money(d.amount)].filter(Boolean).join(' · ')];
    case 'money_accounts': return ['🏦', r.op === 'add' ? 'Added an account' : 'Changed an account', d.name];
    case 'staff': return ['👥', { add: 'Added staff', change: 'Changed staff', delete: 'Deleted staff' }[r.op], d.name];
    case 'leaves': return ['🗓️', r.op === 'add' ? 'Leave asked' : r.op === 'delete' ? 'Leave taken back' : d.status === 'approved' ? 'Approved leave' : d.status === 'rejected' ? 'Did not approve leave' : 'Changed leave', [fmtD(d.from_day), d.to_day !== d.from_day ? fmtD(d.to_day) : ''].filter(Boolean).join(' – ')];
    case 'qc_checks': return ['✅', d.result === 'pass' ? 'Quality check passed' : 'Sent back for rework', ''];
    case 'hallmark_jobs': return ['🔖', r.op === 'add' ? 'Sent for hallmarking' : ch.indexOf('back_on') > -1 && d.back_on ? 'Got back from hallmarking' : 'Changed hallmarking', d.centre];
    case 'care_cases': return ['🙋', r.op === 'add' ? 'Wrote a complaint' : d.status === 'solved' ? 'Solved a complaint' : 'Changed a complaint', shop(d.client_id)];
    default: return ['•', A[r.op] || r.op, r.tbl];
  }
}
async function renderActivity(more) {
  const c = $('#content');
  if (!more) { S.acRows = []; c.innerHTML = loadingHTML(); }
  S.acKind = S.acKind || 'all';
  const k = AC_KINDS.find((x) => x[0] === S.acKind) || AC_KINDS[0];
  let q = db.from('activity_log').select('*').order('at', { ascending: false }).order('id', { ascending: false });
  if (S.acWho) q = S.acWho === 'system' ? q.is('user_id', null) : q.eq('user_id', S.acWho);
  if (k[2]) q = q.in('tbl', k[2]);
  const from = S.acRows.length;
  const [{ data, error }] = await Promise.all([q.range(from, from + 149), typeof loadVendors === 'function' && !S.vendors ? loadVendors() : null]);
  if (!$('#content')) return;
  if (error) { c.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  S.acRows = S.acRows.concat(data || []);
  S.acMore = (data || []).length === 150;
  const ids = Array.from(new Set(S.acRows.map((r) => (r.d || {}).client_id || (r.d || {}).hold_client).filter(Boolean)));
  const missing = ids.filter((id) => !(S.acNames || new Map()).has(id));
  S.acNames = S.acNames || new Map();
  if (missing.length) { const { data: cs } = await db.from('clients').select('id, trade_name').in('id', missing.slice(0, 500)); (cs || []).forEach((x) => S.acNames.set(x.id, x.trade_name)); }
  const team = Array.from((S.team || new Map()).values());
  let day = '';
  c.innerHTML = '<div class="wf-quick">' + AC_KINDS.map((x) => '<button class="chip-btn' + (x[0] === S.acKind ? ' on' : '') + '" data-action="ac-kind" data-k="' + x[0] + '">' + esc(x[1]) + '</button>').join('') + '</div>' +
    '<div class="field"><select id="ac-who"><option value="">Everyone</option>' + team.map((p) => '<option value="' + p.id + '"' + (S.acWho === p.id ? ' selected' : '') + ' class="noi18n">' + esc(p.full_name || p.email || '—') + '</option>').join('') +
    '<option value="system"' + (S.acWho === 'system' ? ' selected' : '') + '>Shops\' links and the app itself</option></select></div>' +
    (S.acRows.length ? S.acRows.map((r) => {
      const t = acLine(r, S.acNames), dd = ymd(new Date(r.at));
      const head = dd !== day ? '<div class="section-label">' + esc(fmtDLong(dd)) + '</div>' : '';
      day = dd;
      return head + '<div class="ac-row"><span class="ac-ic">' + t[0] + '</span><div><b>' + esc(t[1]) + '</b>' + (t[2] ? ' · <span class="noi18n">' + esc(t[2]) + '</span>' : '') +
        '<div class="rc-sub">' + esc(fmtTime(r.at)) + ' · <span class="noi18n">' + esc(r.user_id ? nameOf(r.user_id) : '') + '</span>' + (r.user_id ? '' : esc('Shop\'s link / the app')) + '</div></div></div>';
    }).join('') : '<div class="empty">Nothing here yet.</div>') +
    (S.acMore ? '<button class="btn btn-secondary" data-action="ac-more" style="margin-top:10px">Show more</button>' : '');
  $('#ac-who').addEventListener('change', (e) => { S.acWho = e.target.value || null; renderActivity(); });
}

/* ---------------- which departments a person sees (the owner, in Team members) ---------------- */
function deptAccessHTML(p) {
  if (!S.dbv21 || !isOwner() || p.role === 'owner' || typeof DEPTS === 'undefined') return '';
  const d = p.depts;
  const names = Array.isArray(d) ? DEPTS.filter((x) => d.indexOf(x.k) > -1 && x.k !== 'work' && x.k !== 'settings').map((x) => x.t) : null;
  return '<div class="m-depts"><span class="sw-t"><b>Departments</b><span>' + esc(names ? (names.length ? names.join(', ') : 'Only Work and Settings') : 'The usual ones (not Purchase, Cash & Bank, HR)') + '</span></span>' +
    '<button class="btn btn-small btn-ghost" data-action="dp-access" data-id="' + p.id + '">Choose</button></div>';
}
function deptAccessModal(id) {
  const p = S.team && S.team.get(id);
  if (!p) return;
  const cur = Array.isArray(p.depts) ? p.depts : DEPTS.map((x) => x.k).filter((k) => DEPT_LOCKED.indexOf(k) < 0);
  const list = DEPTS.filter((x) => x.k !== 'work' && x.k !== 'settings');
  const ov = openModal('<h3>' + esc('Departments') + '</h3><p class="noi18n">' + esc(p.full_name || p.email || '') + '</p>' +
    '<div class="dpa-list">' + list.map((x) => '<label class="dpa-row" style="--dc:' + x.c + '"><span class="dpa-ic">' + x.ic + '</span><span class="dpa-t">' + esc(x.t) + '</span>' +
      '<input type="checkbox" class="sw" data-k="' + x.k + '"' + (cur.indexOf(x.k) > -1 ? ' checked' : '') + '></label>').join('') + '</div>' +
    '<p class="hint">Work and Settings are always there. For Purchase, Cash & Bank and HR the database itself checks it.</p>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="usual">The usual ones</button><button class="btn btn-primary" data-m="yes">Save</button></div>');
  const save = async (val, btn) => {
    btn.disabled = true;
    const { data, error } = await db.rpc('set_depts', { p_user: id, p_depts: val });
    if (error) { btn.disabled = false; toast('Could not save — try again.', 'err'); return; }
    p.depts = val === null ? null : data || val;
    closeModal();
    toast('Saved ✓', 'ok');
    if (typeof renderTeamList === 'function') renderTeamList();
  };
  ov.querySelector('[data-m=usual]').onclick = (e) => save(null, e.target);
  ov.querySelector('[data-m=yes]').onclick = (e) => save(Array.from(ov.querySelectorAll('[data-k]:checked')).map((x) => x.dataset.k), e.target);
}

onAct('cs-list', () => showSub('Complaints', renderCare));
onAct('cs-new', () => pickClientThen('New complaint', (cl) => careNew(cl)));
onAct('cs-new-for', async (el) => {
  const { data } = await db.from('clients').select('id, trade_name').eq('id', el.dataset.c).maybeSingle();
  if (data) careNew(data, el.dataset.o ? ordNo(+el.dataset.o) : '');
});
onAct('cs-case', (el) => showSub('Complaint', () => renderCase(el.dataset.id)));
onAct('cs-solve', () => careSolve());
onAct('cs-work', () => { const x = S.caseNow; if (x) careWork(x.id, x.clients || {}, x.issue, x.orders ? ordNo(x.orders.order_no) : ''); });
onAct('cs-wa', () => { const x = S.caseNow; if (x && x.clients) openWa(x.clients.mobile, careText(x, x.status === 'solved' ? x.solved_note || '' : undefined)); });
onAct('cs-fb', () => showSub('Feedback', renderFeedback));
onAct('ac-open', () => { S.acKind = 'all'; S.acWho = null; showSub('Activity', () => renderActivity()); });
onAct('ac-kind', (el) => { S.acKind = el.dataset.k; renderActivity(); });
onAct('ac-more', () => renderActivity(true));
onAct('dp-access', (el) => deptAccessModal(el.dataset.id));
