/* ============================================================
   FESTIVAL CALENDAR (database update 16)
   Selling days — shops buy stock before them, so Today reminds you
   early to send your new designs — and days to send wishes. The
   2027 dates come with the update; the owner adds, changes or
   removes days (a removed day stays away).
   ============================================================ */
'use strict';

function festOn() { return !!S.dbv16 && appOn('festivals'); }
function festHidden() { try { return JSON.parse(localStorage.getItem('festHide') || '[]'); } catch (e) { return []; } }
function festHide(id) {
  try { const a = festHidden(); if (a.indexOf(id) === -1) a.push(id); localStorage.setItem('festHide', JSON.stringify(a.slice(-200))); } catch (e) { /* private mode: it shows again */ }
}
async function festRows(from, to) {
  let q = db.from('festivals').select('*').eq('hidden', false).order('on_date', { ascending: true }).limit(500);
  if (from) q = q.gte('on_date', from);
  if (to) q = q.lte('on_date', to);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}
function festDays(f) { return daysBetween(todayStr(), f.on_date); }
function festWhen(f) {
  const n = festDays(f);
  return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n > 1 ? 'In ' + n + ' days' : n === -1 ? 'Yesterday' : (-n) + ' days ago';
}
function festDate(f) { return new Date(f.on_date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }); }
function festYear(f) { return String(f.on_date).slice(0, 4); }
function festSaleText(f) {
  return 'Namaste 🙏\n' + f.name + ' is coming — ' + fmtDLong(f.on_date) + '. Our new designs for it are ready. Have a look at the photos, tell us which ones you like, and we will send the details.';
}
function festWishText(f) {
  return 'Wishing you and your family a very happy ' + f.name + '! 🙏✨\nMay it bring you joy, good health and good business.';
}
function festMessage(f, kind) {
  if (typeof campNewFrom !== 'function' || typeof campaignsOn !== 'function' || !campaignsOn()) { toast('Messages to shops are switched off (App settings).', 'err'); return; }
  if (kind === 'sale') campNewFrom({ title: f.name + ' ' + festYear(f) + ' — new designs', message: festSaleText(f) });
  else campNewFrom({ title: f.name + ' ' + festYear(f) + ' — wishes', message: festWishText(f) });
}

/* ---------------- Today: the next selling day / day to send wishes ---------------- */
async function loadTodayFest() {
  const el = $('#today-fest');
  if (!el) return;
  if (!festOn()) { el.innerHTML = ''; return; }
  let rows;
  try { rows = await festRows(todayStr(), todayStr(120)); } catch (e) { el.innerHTML = ''; return; }
  if (!$('#today-fest')) return;
  const hide = festHidden();
  const due = rows.filter((f) => hide.indexOf(f.id) === -1 && festDays(f) <= f.lead_days).slice(0, 2);
  S.festToday = due;
  if (!due.length) { el.innerHTML = ''; return; }
  const msgs = typeof campaignsOn === 'function' && campaignsOn();
  el.innerHTML = due.map((f) => {
    const sale = f.kind === 'sale';
    return '<div class="card fest-card ' + (sale ? 'sale' : 'wish') + '"><div class="fest-top"><span class="fest-ic">' + (sale ? '🪔' : '🎉') + '</span>' +
      '<div class="fest-t"><b>' + esc(f.name) + '</b><span>' + esc(festWhen(f) + ' · ' + festDate(f)) + '</span></div>' +
      '<button type="button" class="fest-x" data-action="fest-hide" data-id="' + f.id + '" aria-label="Hide">✕</button></div>' +
      '<div class="fest-line">' + esc(sale ? 'Shops buy stock before it — send them your new designs now.' : 'A good day to send wishes to your shops.') + '</div>' +
      (msgs ? '<button class="btn btn-small btn-primary" data-action="fest-msg" data-id="' + f.id + '" data-k="' + (sale ? 'sale' : 'wish') + '">' + esc(sale ? 'Send new designs' : 'Send wishes') + '</button>' : '') +
      '</div>';
  }).join('');
}

/* ---------------- the calendar ---------------- */
async function renderFest() {
  const c = $('#content');
  S.fest = S.fest || { past: false };
  c.innerHTML = loadingHTML();
  let rows;
  try { rows = S.fest.past ? (await festRows(todayStr(-400), todayStr(-1))).reverse() : await festRows(todayStr(), null); } catch (e) { c.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  if (!$('#content')) return;
  S.fest.rows = rows;
  const chip = (v, label) => '<button class="' + (S.fest.past === v ? 'on' : '') + '" data-action="fest-past" data-v="' + (v ? '1' : '0') + '">' + label + '</button>';
  let month = '';
  c.innerHTML = (isOwner() ? '<button class="btn btn-primary" data-action="fest-add" style="margin-bottom:12px">＋ Add a day</button>' : '') +
    '<div class="filter-chips">' + chip(false, 'Coming up') + chip(true, 'Past') + '</div>' +
    (rows.length ? rows.map((f) => {
      const m = new Date(f.on_date + 'T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      const head = m !== month ? '<div class="section-label">' + esc(m) + '</div>' : '';
      month = m;
      const sale = f.kind === 'sale';
      return head + '<div class="list-item fest-row" data-action="fest-open" data-id="' + f.id + '"><div class="fest-day"><b>' + esc(String(+f.on_date.slice(8, 10))) + '</b>' +
        '<span>' + esc(new Date(f.on_date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' })) + '</span></div>' +
        '<div class="li-main"><div class="li-title">' + esc(f.name) + '</div>' +
        '<div class="li-sub">' + esc([festWhen(f), sale ? 'reminder ' + f.lead_days + ' days before' : ''].filter(Boolean).join(' · ')) + '</div>' +
        (f.note ? '<div class="li-when">' + esc(f.note) + '</div>' : '') + '</div>' +
        '<span class="chip ' + (sale ? 'fest-chip-sale' : 'fest-chip-wish') + '">' + esc(sale ? 'Selling day' : 'Wishes') + '</span></div>';
    }).join('') : '<div class="empty"><div class="big">🗓️</div>' + (S.fest.past ? 'Nothing here.' : 'No days on the calendar.') + '</div>') +
    '<div class="hint" style="margin:14px 4px">Dates for 2027 from the Government of India holiday lists and panchang calendars. Eid depends on the moon.</div>';
}
function festFind(id) { return (S.fest && (S.fest.rows || []).find((x) => x.id === id)) || (S.festToday || []).find((x) => x.id === id); }
function festActions(f) {
  const msgs = typeof campaignsOn === 'function' && campaignsOn();
  const ov = openModal('<h3>' + esc(f.name) + '</h3><p>' + esc(festDate(f) + ' · ' + festWhen(f)) + '</p>' +
    '<div style="display:flex;flex-direction:column;gap:10px">' +
    (msgs ? '<button class="btn btn-primary" data-m="sale">Send new designs</button><button class="btn btn-secondary" data-m="wish">Send wishes</button>' : '') +
    (isOwner() ? '<button class="btn btn-secondary" data-m="edit">Change</button>' : '') +
    '<button class="btn btn-ghost" data-m="no">Close</button></div>');
  ov.querySelector('[data-m=no]').onclick = closeModal;
  if (msgs) {
    ov.querySelector('[data-m=sale]').onclick = () => { closeModal(); festMessage(f, 'sale'); };
    ov.querySelector('[data-m=wish]').onclick = () => { closeModal(); festMessage(f, 'wish'); };
  }
  if (isOwner()) ov.querySelector('[data-m=edit]').onclick = () => { closeModal(); festForm(f); };
}
function festForm(f) {
  const x = f || { name: '', on_date: todayStr(7), kind: 'sale', lead_days: 21, note: '' };
  let kind = x.kind;
  const ov = openModal('<h3>' + (f ? 'Change the day' : 'Add a day') + '</h3>' +
    '<div class="field"><label>Name</label><input type="text" id="ff-name" maxlength="80" value="' + esc(x.name) + '" placeholder="e.g. Shop anniversary sale"></div>' +
    '<div class="field"><label>Date</label><input type="date" id="ff-date" value="' + esc(x.on_date) + '"></div>' +
    '<div class="field"><label>What kind of day</label><div class="seg" id="ff-kind"><button type="button" data-v="sale" class="' + (kind === 'sale' ? 'on' : '') + '">Selling day</button>' +
    '<button type="button" data-v="wish" class="' + (kind === 'wish' ? 'on' : '') + '">Wishes</button></div></div>' +
    '<div class="field"><label>Show it on Today from (days before)</label><input type="number" inputmode="numeric" min="0" max="120" id="ff-lead" value="' + esc(x.lead_days) + '"></div>' +
    '<div class="field"><label>Note (optional)</label><input type="text" id="ff-note" value="' + esc(x.note || '') + '"></div>' +
    '<div class="modal-actions">' + (f ? '<button class="btn btn-danger-ghost" data-m="del">Remove</button>' : '') +
    '<button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Save</button></div>');
  ov.querySelectorAll('#ff-kind button').forEach((b) => { b.onclick = () => { kind = b.dataset.v; ov.querySelectorAll('#ff-kind button').forEach((y) => y.classList.toggle('on', y === b)); }; });
  ov.querySelector('[data-m=no]').onclick = closeModal;
  if (f) ov.querySelector('[data-m=del]').onclick = async () => {
    const { data, error } = await db.from('festivals').update({ hidden: true }).eq('id', f.id).select('id');
    closeModal();
    if (error || !data || !data.length) { toast('Could not remove — only the owner can change the calendar.', 'err'); return; }
    toast('Removed', 'ok');
    renderFest();
  };
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    const name = $('#ff-name').value.trim(), on = $('#ff-date').value;
    const lead = parseInt($('#ff-lead').value, 10);
    if (name.length < 2) { toast('Type the name of the day.', 'err'); return; }
    if (!on) { toast('Choose the date.', 'err'); return; }
    if (!(lead >= 0 && lead <= 120)) { toast('The days before must be 0 – 120.', 'err'); return; }
    e.target.disabled = true;
    const row = { name, on_date: on, kind, lead_days: lead, note: $('#ff-note').value.trim() || null };
    const res = f ? await db.from('festivals').update(row).eq('id', f.id).select('id') : await db.from('festivals').insert(Object.assign({ created_by: S.me.id }, row)).select('id');
    closeModal();
    if (res.error || !res.data || !res.data.length) {
      toast(/duplicate/i.test((res.error && res.error.message) || '') ? 'That day is already on the calendar.' : 'Could not save — only the owner can change the calendar.', 'err');
      return;
    }
    toast('Saved ✓', 'ok');
    renderFest();
  };
}
onAct('fest-open-list', () => { S.fest = null; showSub('Festival calendar', renderFest); });
onAct('fest-past', (el) => { S.fest.past = el.dataset.v === '1'; renderFest(); });
onAct('fest-add', () => festForm(null));
onAct('fest-open', (el) => { const f = festFind(el.dataset.id); if (f) festActions(f); });
onAct('fest-msg', (el) => { const f = festFind(el.dataset.id); if (f) festMessage(f, el.dataset.k); });
onAct('fest-hide', (el) => { festHide(el.dataset.id); loadTodayFest(); });
