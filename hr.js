/* ============================================================
   HR / STAFF (database update 21)
   · Staff: everyone who works for you, in the app or not (karigars in the
     workshop, the office boy…) — post, phone, joining date, monthly salary,
     papers (ID, photo).
   · Attendance: one tap a person a day — present, half day, absent, leave,
     off. People in the app who started their day show it.
   · Leave: anyone asks from the app; HR says yes or no.
   · Salary: for each month — the salary, cut for absent days, half days and
     leave without pay, advances taken; pay it (it goes in the cash book).
   Everyone sees his own attendance and leave; HR sees everyone.
   ============================================================ */
'use strict';

function hrOn() { return !!S.dbv21 && hasDept('hr'); }
const ATT = [['present', 'P', 'Present'], ['half', '½', 'Half day'], ['absent', 'A', 'Absent'], ['leave', 'L', 'Leave'], ['off', 'Off', 'Holiday / off']];
const attLabel = (s) => (ATT.find((x) => x[0] === s) || [s, s, s])[2];
const LV_KIND = [['casual', 'Casual leave'], ['sick', 'Sick leave'], ['unpaid', 'Leave without pay']];
const lvKind = (k) => (LV_KIND.find((x) => x[0] === k) || [k, k])[1];
const LV_ST = { asked: 'Waiting for HR', approved: 'Approved ✓', rejected: 'Not approved' };
function lvDays(l) { return Math.round((new Date(l.to_day + 'T00:00:00') - new Date(l.from_day + 'T00:00:00')) / 86400000) + 1; }
function lvWhen(l) { return l.from_day === l.to_day ? fmtD(l.from_day) : fmtD(l.from_day) + ' – ' + fmtD(l.to_day); }
async function myStaffId() {
  if (S.myStaff !== undefined) return S.myStaff;
  const { data } = await db.rpc('my_staff_id');
  S.myStaff = data || null;
  return S.myStaff;
}

/* ---------------- the staff list ---------------- */
async function renderStaff() {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const { data, error } = await db.from('staff').select('*').order('active', { ascending: false }).order('name').limit(1000);
  if (!$('#content')) return;
  if (error) { c.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  S.staffList = data || [];
  const on = S.staffList.filter((s) => s.active), pay = on.reduce((t, s) => t + P100(s.salary), 0);
  c.innerHTML = '<div class="st-tot"><div><b>' + on.length + '</b><span>Working</span></div><div><b>' + esc(inr(pay)) + '</b><span>Salaries a month</span></div></div>' +
    '<button class="btn btn-primary" data-action="hr-add" style="margin-bottom:12px">＋ Add staff</button>' +
    S.staffList.map((s) => '<div class="card rc-item tap' + (s.active ? '' : ' closed') + '" data-action="hr-edit" data-id="' + s.id + '"><div><b class="noi18n">' + esc(s.name) + '</b>' +
      (s.user_id ? ' <span class="chip chip-role">In the app</span>' : '') +
      '<div class="rc-sub">' + [s.post ? '<span class="noi18n">' + esc(s.post) + '</span>' : '', s.salary != null ? esc(inrNum(s.salary) + ' a month') : '',
        s.joined_on ? esc('Since ' + fmtD(s.joined_on)) : '', s.active ? '' : esc('Left')].filter(Boolean).join(' · ') + '</div></div><span class="mr-go">›</span></div>').join('');
}
function staffModal(id) {
  const s = id ? (S.staffList || []).find((x) => x.id === id) : { name: '', active: true, files: [] };
  if (!s) return;
  const keep = (s.files || []).slice();
  WO_ATT.hr = { list: [], draw: () => { const el = $('#hr-atts'); if (el) el.innerHTML = woAttHTML(WO_ATT.hr.list, 'hr'); } };
  const ov = openModal('<h3>' + (id ? 'Staff' : 'New staff') + '</h3>' +
    '<div class="field"><label>Name <span class="req">*</span></label><input type="text" id="sf-name" maxlength="80" autocomplete="off" value="' + esc(s.name) + '"></div>' +
    '<div class="o-2col"><div class="field"><label>Work</label><input type="text" id="sf-post" maxlength="60" autocomplete="off" placeholder="e.g. Polisher, salesman" value="' + esc(s.post || '') + '"></div>' +
    '<div class="field"><label>Phone</label><input type="tel" id="sf-phone" maxlength="20" autocomplete="off" value="' + esc(s.phone || '') + '"></div></div>' +
    '<div class="o-2col"><div class="field"><label>Salary a month (₹)</label><input type="text" inputmode="decimal" id="sf-sal" value="' + (s.salary != null ? esc(String(num(s.salary))) : '') + '"></div>' +
    '<div class="field"><label>Joined on</label><input type="date" id="sf-join" value="' + esc(s.joined_on || '') + '"></div></div>' +
    '<div class="field"><label>Note</label><input type="text" id="sf-note" maxlength="1000" autocomplete="off" value="' + esc(s.note || '') + '"></div>' +
    (id ? '<label class="sw-row"><span class="sw-t"><b>Working here</b><span>Switch off when the person leaves</span></span><input type="checkbox" class="sw" id="sf-act"' + (s.active ? ' checked' : '') + '></label>' : '') +
    '<div class="section-label">Papers (ID, photo)</div>' + woFilesHTML(keep, s.name) + '<div class="wo-atts" id="hr-atts"></div>' + woPickHTML('hr') +
    '<div class="modal-actions">' + (id && !s.user_id ? '<button class="btn btn-danger-ghost" data-m="del">Delete</button>' : '<button class="btn btn-secondary" data-m="no">Cancel</button>') + '<button class="btn btn-primary" data-m="yes">Save</button></div>');
  woModalActs(ov);
  woLoadPics(ov);
  const no = ov.querySelector('[data-m=no]'); if (no) no.onclick = closeModal;
  const del = ov.querySelector('[data-m=del]');
  if (del) del.onclick = () => confirmModal('Delete ' + s.name + '?', 'Attendance and leave go too. To keep them, switch off "Working here" instead.', 'Delete', async () => {
    const r = await db.from('staff').delete().eq('id', id).select('id');
    if (r.error || !r.data || !r.data.length) { toast('Could not delete — try again.', 'err'); return; }
    toast('Deleted', 'ok');
    renderStaff();
  }, true);
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    const name = $('#sf-name').value.trim(), sal = numOrNull($('#sf-sal').value);
    if (!name) { toast('Write the name.', 'err'); return; }
    if (sal != null && sal < 0) { toast('The salary cannot be below zero.', 'err'); return; }
    e.target.disabled = true;
    const sid = id || crypto.randomUUID();
    let files = keep, fails = 0;
    if (WO_ATT.hr.list.length) { const up = await woUpload('hr/' + sid + '/', WO_ATT.hr.list); files = keep.concat(up.files); fails = up.fails; }
    const row = { name, post: $('#sf-post').value.trim() || null, phone: $('#sf-phone').value.trim() || null, salary: sal == null ? null : Math.round(sal * 100) / 100,
      joined_on: $('#sf-join').value || null, note: $('#sf-note').value.trim() || null, files };
    if ($('#sf-act')) row.active = $('#sf-act').checked;
    const r = id ? await db.from('staff').update(row).eq('id', id).select('id') : await db.from('staff').insert(Object.assign({ id: sid }, row)).select('id');
    if (r.error || !r.data || !r.data.length) { e.target.disabled = false; toast('Could not save — try again.', 'err'); return; }
    closeModal();
    toast('Saved ✓' + (fails ? ' — ' + fails + ' file(s) did not upload' : ''), fails ? 'err' : 'ok');
    renderStaff();
  };
}

/* ---------------- attendance: one day, everyone ---------------- */
async function renderAttendance() {
  S.attDay = S.attDay || todayStr();
  const d = S.attDay, c = $('#content');
  c.innerHTML = loadingHTML();
  const [st, at, wd, lv] = await Promise.all([
    db.from('staff').select('id, name, post, user_id, active').eq('active', true).order('name').limit(1000),
    db.from('attendance').select('*').eq('day', d).limit(2000),
    db.from('work_days').select('user_id, started_at, ended_at').eq('day', d).limit(1000),
    db.from('leaves').select('staff_id, kind, status').eq('status', 'approved').lte('from_day', d).gte('to_day', d).limit(500),
  ]);
  if (!$('#content') || S.attDay !== d) return;
  if (st.error) { c.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  const staff = st.data || [], mark = new Map((at.data || []).map((a) => [a.staff_id, a.status]));
  const started = new Map((wd.data || []).filter((w) => w.started_at).map((w) => [w.user_id, w]));
  const onLeave = new Map((lv.data || []).map((l) => [l.staff_id, l]));
  const cnt = (s) => staff.filter((x) => mark.get(x.id) === s).length;
  S.attStaff = staff; S.attLeave = onLeave;
  c.innerHTML = '<div class="section-label sl-row"><span class="tg-month"><button data-action="att-day" data-d="-1" aria-label="Day before">‹</button><b>' + esc(fmtDLong(d)) + '</b>' +
    '<button data-action="att-day" data-d="1" aria-label="Next day"' + (d >= todayStr() ? ' disabled' : '') + '>›</button></span></div>' +
    '<div class="st-tot"><div><b>' + cnt('present') + '</b><span>Present</span></div><div><b>' + cnt('half') + '</b><span>Half day</span></div><div><b>' + cnt('absent') + '</b><span>Absent</span></div>' +
    '<div><b>' + (cnt('leave') + cnt('off')) + '</b><span>Leave / off</span></div></div>' +
    (staff.some((x) => !mark.has(x.id)) ? '<button class="btn btn-secondary" data-action="att-all" style="margin-bottom:12px">' + esc('Mark the rest present (' + staff.filter((x) => !mark.has(x.id)).length + ')') + '</button>' : '') +
    (staff.length ? staff.map((s) => {
      const m = mark.get(s.id), w = s.user_id && started.get(s.user_id), l = onLeave.get(s.id);
      const hint = [w ? 'Started ' + fmtTime(w.started_at) + (w.ended_at ? ' · ended ' + fmtTime(w.ended_at) : '') : '', l ? lvKind(l.kind) + ' (approved)' : ''].filter(Boolean).join(' · ');
      return '<div class="card att-row"><div class="att-n"><b class="noi18n">' + esc(s.name) + '</b>' + (hint ? '<div class="rc-sub">' + esc(hint) + '</div>' : (s.post ? '<div class="rc-sub noi18n">' + esc(s.post) + '</div>' : '')) + '</div>' +
        '<div class="att-seg">' + ATT.map((a) => '<button type="button" class="att-' + a[0] + (m === a[0] ? ' on' : '') + '" data-action="att-set" data-id="' + s.id + '" data-s="' + a[0] + '" title="' + esc(a[2]) + '" aria-label="' + esc(a[2]) + '"><span class="noi18n">' + a[1] + '</span></button>').join('') + '</div></div>';
    }).join('') : '<div class="empty">No staff yet — add them in Staff.</div>') +
    '<p class="hint">P present · ½ half day · A absent · L leave · Off holiday. Tap again to clear.</p>';
}
async function attSet(staffId, status, btn) {
  const on = btn.classList.contains('on');
  btn.closest('.att-seg').querySelectorAll('button').forEach((b) => { b.disabled = true; });
  const r = on ? await db.from('attendance').delete().eq('staff_id', staffId).eq('day', S.attDay).select('staff_id')
    : await db.from('attendance').upsert({ staff_id: staffId, day: S.attDay, status, marked_by: S.me.id, marked_at: new Date().toISOString() }, { onConflict: 'staff_id,day' }).select('staff_id');
  if (r.error) toast('Could not save — try again.', 'err');
  renderAttendance();
}
async function attAll(btn) {
  btn.disabled = true;
  const marked = new Set(Array.from(document.querySelectorAll('.att-seg button.on')).map((b) => b.dataset.id));
  const rows = (S.attStaff || []).filter((s) => !marked.has(s.id)).map((s) => ({ staff_id: s.id, day: S.attDay, status: S.attLeave && S.attLeave.has(s.id) ? 'leave' : 'present', marked_by: S.me.id }));
  if (rows.length) { const r = await db.from('attendance').upsert(rows, { onConflict: 'staff_id,day' }); if (r.error) toast('Could not save — try again.', 'err'); else toast('Marked ✓', 'ok'); }
  renderAttendance();
}

/* ---------------- leave ---------------- */
async function renderLeaves() {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const hr = hrOn(), mine = await myStaffId();
  const since = addDaysStr(todayStr(), -90);
  const [lv, st] = await Promise.all([
    db.from('leaves').select('*').gte('to_day', since).order('from_day', { ascending: false }).limit(1000),
    hr ? db.from('staff').select('id, name').limit(1000) : Promise.resolve({ data: [] }),
  ]);
  if (!$('#content')) return;
  if (lv.error) { c.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  const names = new Map((st.data || []).map((s) => [s.id, s.name]));
  const all = lv.data || [], t = todayStr();
  const row = (l, acts) => '<div class="card rc-item"><div><b>' + esc(lvWhen(l)) + '</b> · ' + esc(lvDays(l) === 1 ? '1 day' : lvDays(l) + ' days') +
    (hr && l.staff_id !== mine ? ' · <span class="noi18n">' + esc(names.get(l.staff_id) || '') + '</span>' : '') +
    '<div class="rc-sub">' + esc(lvKind(l.kind) + ' · ' + (LV_ST[l.status] || l.status)) + (l.reason ? ' · <span class="noi18n">' + esc(l.reason) + '</span>' : '') + '</div></div>' + (acts || '') + '</div>';
  const asked = hr ? all.filter((l) => l.status === 'asked' && l.staff_id !== mine) : [];
  const own = all.filter((l) => l.staff_id === mine);
  const others = hr ? all.filter((l) => l.status !== 'asked' && l.staff_id !== mine) : [];
  c.innerHTML = '<div class="action-row">' + (mine ? '<button class="btn btn-primary" data-action="lv-ask">Ask for leave</button>' : '') +
    (hr ? '<button class="btn btn-secondary" data-action="lv-add">＋ Leave for someone</button>' : '') + '</div>' +
    (asked.length ? '<div class="section-label">' + esc('Asked (' + asked.length + ')') + '</div>' + asked.map((l) => row(l,
      '<span class="rt-acts"><button class="btn btn-small btn-primary" data-action="lv-ok" data-id="' + l.id + '" data-s="approved">Approve</button>' +
      '<button class="btn btn-small btn-ghost" data-action="lv-ok" data-id="' + l.id + '" data-s="rejected">No</button></span>')).join('') : '') +
    (mine ? '<div class="section-label">My leave</div>' + (own.length ? own.map((l) => row(l, l.status === 'asked' ? '<button class="btn btn-small btn-ghost" data-action="lv-del" data-id="' + l.id + '" aria-label="Take back">✕</button>' : '')).join('')
      : '<div class="empty">No leave asked in the last 3 months.</div>') : '') +
    (hr ? '<div class="section-label">Coming up</div>' + (others.filter((l) => l.to_day >= t).map((l) => row(l, l.status === 'approved' ? '<button class="btn btn-small btn-ghost" data-action="lv-del" data-id="' + l.id + '" aria-label="Remove">✕</button>' : '')).join('') || '<div class="empty">Nobody is on leave ahead.</div>') +
      (others.some((l) => l.to_day < t) ? '<div class="section-label">Before</div>' + others.filter((l) => l.to_day < t).map((l) => row(l)).join('') : '') : '');
}
async function leaveModal(forOther) {
  const mine = await myStaffId();
  let staff = [];
  if (forOther) { const { data } = await db.from('staff').select('id, name').eq('active', true).order('name').limit(1000); staff = data || []; }
  if (!forOther && !mine) { toast('You are not on the staff list — ask HR to add you.', 'err'); return; }
  let kind = 'casual';
  const ov = openModal('<h3>' + (forOther ? 'Leave for someone' : 'Ask for leave') + '</h3>' +
    (forOther ? '<div class="field"><label>Who</label><select id="lv-who"><option value="">— Choose —</option>' + staff.map((s) => '<option value="' + s.id + '" class="noi18n">' + esc(s.name) + '</option>').join('') + '</select></div>' : '') +
    '<div class="o-2col"><div class="field"><label>From</label><input type="date" id="lv-from" value="' + todayStr(1) + '"></div><div class="field"><label>To</label><input type="date" id="lv-to" value="' + todayStr(1) + '"></div></div>' +
    '<div class="field"><label>Kind</label><div class="wf-quick" id="lv-kinds">' + LV_KIND.map((k) => '<button type="button" class="chip-btn' + (k[0] === kind ? ' on' : '') + '" data-k="' + k[0] + '">' + esc(k[1]) + '</button>').join('') + '</div></div>' +
    '<div class="field"><label>Reason</label><input type="text" id="lv-why" maxlength="500" autocomplete="off" placeholder="' + esc(forOther ? '' : 'HR sees this') + '"></div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">' + (forOther ? 'Save' : 'Ask') + '</button></div>');
  ov.querySelector('#lv-kinds').addEventListener('click', (e) => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    kind = b.dataset.k;
    ov.querySelectorAll('#lv-kinds .chip-btn').forEach((x) => x.classList.toggle('on', x === b));
  });
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    const who = forOther ? $('#lv-who').value : mine, from = $('#lv-from').value, to = $('#lv-to').value;
    if (!who) { toast('Choose who.', 'err'); return; }
    if (!from || !to || to < from) { toast('Check the dates: "To" cannot be before "From".', 'err'); return; }
    e.target.disabled = true;
    const row = { staff_id: who, from_day: from, to_day: to, kind, reason: $('#lv-why').value.trim() || null, created_by: S.me.id };
    if (forOther) Object.assign(row, { status: 'approved', decided_by: S.me.id, decided_at: new Date().toISOString() });
    const { error } = await db.from('leaves').insert(row);
    if (error) { e.target.disabled = false; toast('Could not save — try again.', 'err'); return; }
    closeModal();
    toast(forOther ? 'Saved ✓' : 'Asked ✓ — HR will answer', 'ok');
    if ($('#content') && typeof renderLeaves === 'function' && document.querySelector('[data-action="lv-ask"],[data-action="lv-add"]')) renderLeaves();
  };
}

/* ---------------- my attendance (everyone) ---------------- */
async function renderMyAttendance() {
  S.myAttMonth = S.myAttMonth || monthStart();
  const ms = S.myAttMonth, c = $('#content');
  c.innerHTML = loadingHTML();
  const mine = await myStaffId();
  if (!mine) { c.innerHTML = '<div class="empty">You are not on the staff list yet — HR adds you.</div>'; return; }
  const { data } = await db.from('attendance').select('day, status, note').eq('staff_id', mine).gte('day', ms).lt('day', addMonths(ms, 1)).order('day').limit(40);
  if (!$('#content')) return;
  const list = data || [], cnt = (s) => list.filter((a) => a.status === s).length;
  c.innerHTML = '<div class="section-label sl-row"><span class="tg-month"><button data-action="my-att-m" data-d="-1" aria-label="Month before">‹</button><b>' + esc(monthLabel(ms)) + '</b>' +
    '<button data-action="my-att-m" data-d="1" aria-label="Next month"' + (ms >= monthStart() ? ' disabled' : '') + '>›</button></span></div>' +
    '<div class="st-tot"><div><b>' + cnt('present') + '</b><span>Present</span></div><div><b>' + cnt('half') + '</b><span>Half day</span></div><div><b>' + cnt('absent') + '</b><span>Absent</span></div><div><b>' + cnt('leave') + '</b><span>Leave</span></div></div>' +
    (list.length ? '<div class="card bf-total">' + list.map((a) => '<div class="bf-row"><span>' + esc(fmtDLong(a.day)) + '</span><b class="' + (a.status === 'absent' ? 'o-red' : '') + '">' + esc(attLabel(a.status)) + '</b></div>').join('') + '</div>'
      : '<div class="empty">Nothing marked in this month.</div>');
}

/* ---------------- salary: one month, everyone ---------------- */
async function salaryData(ms) {
  const me = addMonths(ms, 1), last = addDaysStr(me, -1), D = daysInMonth(ms);
  const [st, at, lv, ce] = await Promise.all([
    db.from('staff').select('*').order('name').limit(1000),
    db.from('attendance').select('staff_id, day, status').gte('day', ms).lt('day', me).limit(20000),
    db.from('leaves').select('staff_id, from_day, to_day, kind').eq('status', 'approved').eq('kind', 'unpaid').lte('from_day', last).gte('to_day', ms).limit(2000),
    db.from('cash_entries').select('id, staff_id, head, amount, entry_date, for_month').in('head', ['salary', 'advance', 'bonus']).not('staff_id', 'is', null).gte('entry_date', addMonths(ms, -1)).limit(5000),
  ]);
  if (st.error) return null;
  const out = [];
  for (const s of st.data || []) {
    const sal = P100(s.salary);
    const att = (at.data || []).filter((a) => a.staff_id === s.id);
    const marked = new Map(att.map((a) => [a.day, a.status]));
    let unpaid = 0;
    (lv.data || []).filter((l) => l.staff_id === s.id).forEach((l) => {
      for (let d = l.from_day < ms ? ms : l.from_day; d <= l.to_day && d <= last; d = addDaysStr(d, 1)) {
        const m = marked.get(d);
        if (m !== 'present' && m !== 'half' && m !== 'absent') unpaid++;
      }
    });
    const absent = att.filter((a) => a.status === 'absent').length, half = att.filter((a) => a.status === 'half').length;
    const cutDays = absent + half / 2 + unpaid;
    const cut = sal ? Math.round(sal * cutDays / D) : 0;
    const mine = (ce.data || []).filter((e) => e.staff_id === s.id);
    const adv = mine.filter((e) => e.head === 'advance' && e.entry_date >= ms && e.entry_date < me).reduce((t, e) => t + P100(e.amount), 0);
    const bonus = mine.filter((e) => e.head === 'bonus' && e.entry_date >= ms && e.entry_date < me).reduce((t, e) => t + P100(e.amount), 0);
    const paid = mine.filter((e) => e.head === 'salary' && e.for_month === ms).reduce((t, e) => t + P100(e.amount), 0);
    if (!s.active && !paid && !adv) continue;
    if (!sal && !paid && !adv && !bonus) continue;
    out.push({ s, sal, D, absent, half, unpaid, cutDays, cut, adv, bonus, paid, toPay: Math.max(0, sal - cut - adv - paid) });
  }
  return out;
}
async function renderSalary() {
  S.salMonth = S.salMonth || monthStart();
  const ms = S.salMonth, c = $('#content');
  c.innerHTML = loadingHTML();
  const rows = await salaryData(ms);
  if (!$('#content') || S.salMonth !== ms) return;
  if (!rows) { c.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  S.salRows = rows;
  const tot = (k) => rows.reduce((t, r) => t + r[k], 0);
  c.innerHTML = '<div class="hr-sal"><div class="section-label sl-row"><span class="tg-month"><button data-action="sal-m" data-d="-1" aria-label="Month before">‹</button><b>' + esc(monthLabel(ms)) + '</b>' +
    '<button data-action="sal-m" data-d="1" aria-label="Next month"' + (ms >= monthStart() ? ' disabled' : '') + '>›</button></span></div>' +
    '<div class="st-tot"><div><b>' + esc(inr(tot('sal'))) + '</b><span>Salaries</span></div><div><b>' + esc(inr(tot('paid'))) + '</b><span>Paid</span></div><div><b class="' + (tot('toPay') ? 'o-red' : '') + '">' + esc(inr(tot('toPay'))) + '</b><span>To pay</span></div></div>' +
    (rows.length ? rows.map((r, i) => '<div class="card sal-card"><div class="bf-row"><span><b class="noi18n">' + esc(r.s.name) + '</b>' + (r.s.post ? ' · <span class="noi18n">' + esc(r.s.post) + '</span>' : '') + '</span><b>' + esc(inr(r.sal)) + '</b></div>' +
      (r.cutDays ? '<div class="bf-row"><span>' + esc([r.absent ? r.absent + ' absent' : '', r.half ? r.half + ' half day' : '', r.unpaid ? r.unpaid + ' without pay' : ''].filter(Boolean).join(' · ')) + '</span><b class="o-red">' + esc('− ' + inr(r.cut)) + '</b></div>' : '') +
      (r.adv ? '<div class="bf-row"><span>Advance taken</span><b class="o-red">' + esc('− ' + inr(r.adv)) + '</b></div>' : '') +
      (r.paid ? '<div class="bf-row"><span>Paid</span><b class="o-green">' + esc(inr(r.paid)) + '</b></div>' : '') +
      (r.bonus ? '<div class="bf-row"><span>Bonus given</span><b>' + esc(inr(r.bonus)) + '</b></div>' : '') +
      '<div class="bf-row sub"><span>To pay</span><b class="' + (r.toPay ? 'o-red' : 'o-green') + '">' + esc(r.toPay ? inr(r.toPay) : 'Paid ✓') + '</b></div>' +
      '<div class="sal-acts">' + (r.toPay ? '<button class="btn btn-small btn-primary" data-action="sal-pay" data-i="' + i + '">Pay</button>' : '') +
      '<button class="btn btn-small btn-ghost" data-action="sal-adv" data-i="' + i + '">Advance</button>' +
      (r.s.phone ? '<button class="btn btn-small btn-ghost" data-action="sal-wa" data-i="' + i + '">WhatsApp slip</button>' : '') + '</div></div>').join('')
      : '<div class="empty">Write each person\'s salary in Staff to see it here.</div>') +
    '<p class="hint">Salary for the month, less absent days, half days (half a day each) and leave without pay — by the days in the month — and the advances taken this month.</p></div>';
}
function salarySlip(r) {
  const L = [monthLabel(S.salMonth) + ' — ' + r.s.name, 'Salary: ' + inr(r.sal)];
  if (r.cutDays) L.push('Days cut: ' + (Math.round(r.cutDays * 10) / 10) + ' → − ' + inr(r.cut));
  if (r.adv) L.push('Advance: − ' + inr(r.adv));
  if (r.paid) L.push('Paid: ' + inr(r.paid));
  L.push(r.toPay ? 'To pay: ' + inr(r.toPay) : 'Fully paid ✓');
  return L.join('\n') + '\n— ' + bizName();
}

onAct('hr-staff', () => showSub('Staff', renderStaff));
onAct('hr-add', () => staffModal(null));
onAct('hr-edit', (el) => staffModal(el.dataset.id));
onAct('hr-att', () => { S.attDay = todayStr(); showSub('Attendance', renderAttendance); });
onAct('att-day', (el) => { S.attDay = addDaysStr(S.attDay || todayStr(), +el.dataset.d); if (S.attDay > todayStr()) S.attDay = todayStr(); renderAttendance(); });
onAct('att-set', (el) => attSet(el.dataset.id, el.dataset.s, el));
onAct('att-all', (el) => attAll(el));
onAct('hr-leave', () => showSub('Leave', renderLeaves));
onAct('lv-ask', () => leaveModal(false));
onAct('lv-add', () => leaveModal(true));
onAct('lv-ok', async (el) => {
  el.disabled = true;
  const { data, error } = await db.from('leaves').update({ status: el.dataset.s, decided_by: S.me.id, decided_at: new Date().toISOString() }).eq('id', el.dataset.id).select('id');
  if (error || !data || !data.length) { toast('Could not save — try again.', 'err'); el.disabled = false; return; }
  toast(el.dataset.s === 'approved' ? 'Approved ✓' : 'Not approved', 'ok');
  renderLeaves();
});
onAct('lv-del', (el) => confirmModal('Remove this leave?', '', 'Remove', async () => {
  const { data, error } = await db.from('leaves').delete().eq('id', el.dataset.id).select('id');
  if (error || !data || !data.length) { toast('Could not remove — HR may have answered it already.', 'err'); return; }
  toast('Removed', 'ok');
  renderLeaves();
}, true));
onAct('hr-me', () => { S.myAttMonth = monthStart(); showSub('My attendance', renderMyAttendance); });
onAct('my-att-m', (el) => { S.myAttMonth = addMonths(S.myAttMonth || monthStart(), +el.dataset.d); if (S.myAttMonth > monthStart()) S.myAttMonth = monthStart(); renderMyAttendance(); });
onAct('hr-salary', () => { S.salMonth = monthStart(); showSub('Salary', renderSalary); });
onAct('sal-m', (el) => { S.salMonth = addMonths(S.salMonth || monthStart(), +el.dataset.d); if (S.salMonth > monthStart()) S.salMonth = monthStart(); renderSalary(); });
onAct('sal-pay', (el) => { const r = (S.salRows || [])[+el.dataset.i]; if (r) cbEntryModal('out', null, { head: 'salary', staff_id: r.s.id, for_month: S.salMonth, amount: r.toPay / 100, note: monthLabel(S.salMonth) }); });
onAct('sal-adv', (el) => { const r = (S.salRows || [])[+el.dataset.i]; if (r) cbEntryModal('out', null, { head: 'advance', staff_id: r.s.id }); });
onAct('sal-wa', (el) => { const r = (S.salRows || [])[+el.dataset.i]; if (r) openWa(r.s.phone, salarySlip(r)); });
