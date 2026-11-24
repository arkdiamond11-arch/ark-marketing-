/* ============================================================
   FIELD TEAM (database update 15)
   · Day start / day end — the time, and the place once (no live
     tracking); the owner sees the team's day: start, meetings, end,
     km, and the route on Google Maps.
   · Expense claims — what the team spent, with a photo of the bill;
     the owner approves, rejects or marks paid. The only place in the
     app with rupee amounts.
   · Voice notes on a meeting (recorded on the phone, up to 2 minutes).
   · Sample bag — catalogue pieces a team member carries.
   · Exhibitions — visitors and meetings at a trade show kept together
     ("exhibition mode" on this phone stamps new clients and meetings).
   ============================================================ */
'use strict';

function dayOn() { return !!S.dbv15 && appOn('workday'); }
function expOn() { return !!S.dbv15 && appOn('expenses'); }
function bagOn() { return !!S.dbv15 && appOn('samples') && appOn('catalogue'); }
function eventsOn() { return !!S.dbv15 && appOn('events'); }
function voiceOn() { return !!S.dbv15 && !!(window.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }
function rupees(n) { return '₹' + num(n).toLocaleString('en-IN', { maximumFractionDigits: 2 }); }
function dayEndISO(ds) { const d = new Date(ds + 'T00:00:00'); d.setDate(d.getDate() + 1); return d.toISOString(); }

/* ================= DAY START / END ================= */
async function myDay() {
  const { data } = await db.from('work_days').select('*').eq('user_id', S.me.id).eq('day', todayStr()).maybeSingle();
  return data || null;
}
async function loadTodayDay() {
  const el = $('#today-day');
  if (!el) return;
  if (!dayOn()) { el.innerHTML = ''; return; }
  const [w, mt] = await Promise.all([
    myDay(),
    db.from('interactions').select('id', { count: 'exact', head: true }).eq('exec_id', S.me.id).gte('happened_at', dayStartISO(todayStr())),
  ]);
  if (!$('#today-day')) return;
  const n = mt && mt.count ? mt.count : 0;
  const meets = n === 1 ? '1 meeting' : n + ' meetings';
  if (!w || !w.started_at) {
    el.innerHTML = '<div class="card wd-card"><div class="wd-row"><div><b>☀️ Start my day</b><div class="hint">Notes the time and where you are, once — no tracking.</div></div>' +
      '<button class="btn btn-primary btn-small" data-action="wd-start">Start</button></div></div>';
  } else if (!w.ended_at) {
    el.innerHTML = '<div class="card wd-card on"><div class="wd-row"><div><b>' + esc('Day started ' + fmtTime(w.started_at)) + '</b><div class="hint">' + esc(meets + ' so far') + '</div></div>' +
      '<button class="btn btn-secondary btn-small" data-action="wd-end">End my day</button></div></div>';
  } else {
    el.innerHTML = '<div class="card wd-card done"><div class="wd-row"><div><b>' + esc('Day: ' + fmtTime(w.started_at) + ' – ' + fmtTime(w.ended_at)) + '</b><div class="hint">' +
      esc([meets, w.km != null ? num(w.km) + ' km' : ''].filter(Boolean).join(' · ')) + '</div></div>' +
      '<button class="btn btn-ghost btn-small" data-action="wd-end">Change</button></div></div>';
  }
}
async function wdStart(btn) {
  if (btn) btn.disabled = true;
  const pos = appOn('location') && typeof getPosition === 'function' ? await getPosition(9000) : null;
  const row = { user_id: S.me.id, day: todayStr(), started_at: new Date().toISOString() };
  if (pos && pos.status === 'ok') Object.assign(row, { start_lat: pos.lat, start_lng: pos.lng, start_acc: Math.round(pos.acc || 0) });
  const { error } = await db.from('work_days').insert(row);
  if (error && !/duplicate/i.test(error.message || '')) { if (btn) btn.disabled = false; toast('Could not save — try again.', 'err'); return; }
  toast('Day started ✓', 'ok');
  loadTodayDay();
}
async function wdEnd() {
  const w = await myDay();
  if (!w) return;
  const ov = openModal('<h3>' + (w.ended_at ? 'Your day' : 'End my day') + '</h3>' +
    '<div class="field"><label>Km travelled today (optional)</label><input type="text" inputmode="decimal" id="wd-km" value="' + esc(w.km != null ? w.km : '') + '" placeholder="e.g. 42"></div>' +
    '<div class="field"><label>Note (optional)</label><input type="text" id="wd-note" value="' + esc(w.note || '') + '" placeholder="e.g. Rajkot trip"></div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">' + (w.ended_at ? 'Save' : 'End my day') + '</button></div>');
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    const km = numOrNull($('#wd-km').value);
    if (km != null && (km < 0 || km > 3000)) { toast('Type the km (0 – 3000).', 'err'); return; }
    e.target.disabled = true;
    const patch = { km, note: $('#wd-note').value.trim() || null };
    if (!w.ended_at) {
      patch.ended_at = new Date().toISOString();
      const pos = appOn('location') && typeof getPosition === 'function' ? await getPosition(9000) : null;
      if (pos && pos.status === 'ok') Object.assign(patch, { end_lat: pos.lat, end_lng: pos.lng, end_acc: Math.round(pos.acc || 0) });
    }
    const { error } = await db.from('work_days').update(patch).eq('id', w.id);
    closeModal();
    if (error) { toast('Could not save — try again.', 'err'); return; }
    toast(w.ended_at ? 'Saved ✓' : 'Day ended ✓', 'ok');
    loadTodayDay();
  };
}
onAct('wd-start', (el) => wdStart(el));
onAct('wd-end', () => wdEnd());

/* ---------------- the owner: the team's day ---------------- */
const TEAM_COLORS = ['#7b1e3c', '#2b5fb8', '#1a7f4e', '#b47814', '#6b3fa0', '#b3372f', '#0f7c8c'];
async function teamDayData(ds) {
  const [wr, ir, pr] = await Promise.all([
    db.from('work_days').select('*').eq('day', ds),
    db.from('interactions').select('id, exec_id, happened_at, lat, lng, loc_status, outcome, client_id, clients(trade_name, city)')
      .gte('happened_at', dayStartISO(ds)).lt('happened_at', dayEndISO(ds)).order('happened_at', { ascending: true }).limit(2000),
    db.from('profiles').select('id, full_name, role, active').eq('active', true),
  ]);
  const days = new Map((wr.data || []).map((w) => [w.user_id, w]));
  const meets = new Map();
  (ir.data || []).forEach((m) => { if (!meets.has(m.exec_id)) meets.set(m.exec_id, []); meets.get(m.exec_id).push(m); });
  const people = (pr.data || []).filter((p) => p.role !== 'owner' || days.has(p.id) || meets.has(p.id))
    .sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || '')))
    .map((p, i) => ({ p, w: days.get(p.id) || null, m: meets.get(p.id) || [], color: TEAM_COLORS[i % TEAM_COLORS.length] }));
  return people;
}
function personPoints(x) {
  const pts = [];
  if (x.w && x.w.start_lat != null) pts.push({ lat: x.w.start_lat, lng: x.w.start_lng, kind: 'start' });
  x.m.forEach((m) => { if (m.lat != null && m.loc_status === 'ok') pts.push({ lat: m.lat, lng: m.lng, kind: 'meet' }); });
  if (x.w && x.w.end_lat != null) pts.push({ lat: x.w.end_lat, lng: x.w.end_lng, kind: 'end' });
  return pts;
}
function routeUrl(pts) {
  if (pts.length < 2) return pts.length ? mapsSearchUrl(pts[0].lat, pts[0].lng) : '';
  const ll = (p) => p.lat.toFixed(5) + ',' + p.lng.toFixed(5);
  const mid = pts.slice(1, -1).slice(0, 8);
  return 'https://www.google.com/maps/dir/?api=1&origin=' + ll(pts[0]) + '&destination=' + ll(pts[pts.length - 1]) +
    (mid.length ? '&waypoints=' + encodeURIComponent(mid.map(ll).join('|')) : '') + '&travelmode=driving';
}
/* a small picture of where everyone was (no map tiles — the route opens in Google Maps) */
function teamMapSVG(people) {
  const all = [];
  people.forEach((x) => personPoints(x).forEach((p) => all.push(p)));
  if (!all.length) return '';
  const W = 340, Hh = 220, pad = 18;
  let minLat = Math.min(...all.map((p) => p.lat)), maxLat = Math.max(...all.map((p) => p.lat));
  let minLng = Math.min(...all.map((p) => p.lng)), maxLng = Math.max(...all.map((p) => p.lng));
  const k = Math.cos((minLat + maxLat) / 2 * Math.PI / 180);
  let spanX = (maxLng - minLng) * k, spanY = maxLat - minLat;
  const span = Math.max(spanX, spanY * (W / Hh), 0.01);
  const cx = (minLng + maxLng) / 2, cy = (minLat + maxLat) / 2;
  const sx = (W - pad * 2) / span, sy = sx;
  const X = (lng) => W / 2 + (lng - cx) * k * sx, Y = (lat) => Hh / 2 - (lat - cy) * sy;
  const kmPerPx = span * 111 / (W - pad * 2);
  let svg = '<svg class="tm-svg" viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="Where the team was">' +
    '<rect width="' + W + '" height="' + Hh + '" rx="12" fill="#f6f2ee"/>';
  people.forEach((x) => {
    const pts = personPoints(x);
    if (pts.length > 1) svg += '<polyline fill="none" stroke="' + x.color + '" stroke-width="2" stroke-opacity=".55" points="' + pts.map((p) => X(p.lng).toFixed(1) + ',' + Y(p.lat).toFixed(1)).join(' ') + '"/>';
    pts.forEach((p) => {
      const px = X(p.lng).toFixed(1), py = Y(p.lat).toFixed(1);
      svg += p.kind === 'meet' ? '<circle cx="' + px + '" cy="' + py + '" r="5" fill="' + x.color + '" stroke="#fff" stroke-width="1.5"/>'
        : '<rect x="' + (px - 5) + '" y="' + (py - 5) + '" width="10" height="10" rx="2" fill="#fff" stroke="' + x.color + '" stroke-width="2.5"/>';
    });
  });
  const bar = Math.max(1, Math.round(kmPerPx * 60));
  svg += '<line x1="14" y1="' + (Hh - 12) + '" x2="' + (14 + bar / kmPerPx) + '" y2="' + (Hh - 12) + '" stroke="#857e8c" stroke-width="2"/>' +
    '<text x="14" y="' + (Hh - 17) + '" font-size="10" fill="#857e8c">' + bar + ' km</text></svg>';
  return svg;
}
async function renderTeamDay() {
  const c = $('#content');
  S.td = S.td || { day: todayStr() };
  c.innerHTML = loadingHTML();
  let people;
  try { people = await teamDayData(S.td.day); } catch (e) { c.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  if (!$('#content')) return;
  const map = teamMapSVG(people);
  c.innerHTML = '<div class="card td-pick"><div class="field" style="margin:0"><label>Day</label><input type="date" id="td-day" value="' + esc(S.td.day) + '" max="' + todayStr() + '"></div></div>' +
    (map ? '<div class="card tm-card">' + map + '<div class="tm-key">' + people.filter((x) => personPoints(x).length).map((x) =>
      '<span class="noi18n"><i style="background:' + x.color + '"></i>' + esc(String(x.p.full_name || '').split(' ')[0]) + '</span>').join('') +
      '<span class="hint">□ start / end · ● meeting</span></div></div>' : '') +
    (people.length ? people.map((x) => {
      const w = x.w, pts = personPoints(x), url = routeUrl(pts);
      const head = !w || !w.started_at ? 'Not started' : 'Started ' + fmtTime(w.started_at) + (w.ended_at ? ' · ended ' + fmtTime(w.ended_at) : ' · still out');
      return '<div class="card td-person" style="border-left:4px solid ' + x.color + '"><div class="td-top"><b class="noi18n">' + esc(x.p.full_name || '') + '</b><span>' + esc(head) + '</span></div>' +
        '<div class="hint">' + esc([x.m.length === 1 ? '1 meeting' : x.m.length + ' meetings', w && w.km != null ? num(w.km) + ' km' : '', w && w.note ? w.note : ''].filter(Boolean).join(' · ')) + '</div>' +
        (x.m.length ? '<div class="td-meets">' + x.m.map((m) => '<a href="#" class="td-m" data-action="open-client" data-id="' + m.client_id + '"><span>' + esc(fmtTime(m.happened_at)) + '</span><b class="noi18n">' +
          esc((m.clients || {}).trade_name || '') + '</b>' + ((m.clients || {}).city ? '<em class="noi18n">' + esc(m.clients.city) + '</em>' : '') + (m.loc_status === 'ok' ? ' 📍' : '') + '</a>').join('') + '</div>' : '') +
        (url ? '<a class="btn btn-small btn-secondary td-route" href="' + esc(url) + '" target="_blank" rel="noopener">🗺️ Route on the map</a>' : '') + '</div>';
    }).join('') : '<div class="empty">No team members yet.</div>');
  const inp = $('#td-day');
  if (inp) inp.addEventListener('change', () => { S.td.day = inp.value || todayStr(); renderTeamDay(); });
}
/* the owner's Today: one line per person */
async function loadTodayTeam() {
  const el = $('#today-team');
  if (!el) return;
  if (!dayOn() || !isOwner()) { el.innerHTML = ''; return; }
  let people;
  try { people = await teamDayData(todayStr()); } catch (e) { return; }
  if (!$('#today-team')) return;
  const team = people.filter((x) => x.p.role !== 'owner');
  if (!team.length) { el.innerHTML = ''; return; }
  el.innerHTML = '<button class="more-row td-row" data-action="td-open"><span class="mr-ic">👥</span><span class="mr-t"><b>Team today</b><span>' +
    team.map((x) => '<span class="noi18n">' + esc(String(x.p.full_name || '').split(' ')[0]) + '</span>: ' +
      esc((!x.w || !x.w.started_at ? 'not started' : x.w.ended_at ? 'done' : 'out since ' + fmtTime(x.w.started_at)) + ' · ' + x.m.length + ' met')).join(' — ') +
    '</span></span><span class="mr-go">›</span></button>';
}
onAct('td-open', () => { S.td = { day: todayStr() }; showSub('Team today', renderTeamDay); });

/* ================= EXPENSE CLAIMS ================= */
const EXP_CATS = ['Travel', 'Fuel', 'Food', 'Stay', 'Courier', 'Other'];
const EXP_MODES = ['Cash', 'UPI', 'Card'];
const EXP_ST = { claimed: 'Waiting', approved: 'Approved', rejected: 'Not approved', paid: 'Paid' };
function expChip(st) { return '<span class="chip exp-' + esc(st) + '">' + esc(EXP_ST[st] || st) + '</span>'; }
async function renderExpenses() {
  const c = $('#content');
  S.ex = S.ex || { show: isOwner() ? 'claimed' : 'all', who: '' };
  const E = S.ex;
  c.innerHTML = loadingHTML();
  let q = db.from('expenses').select('*').order('exp_date', { ascending: false }).order('created_at', { ascending: false }).limit(500);
  if (!isOwner()) q = q.eq('created_by', S.me.id);
  if (E.show !== 'all') q = q.eq('status', E.show);
  const { data, error } = await q;
  if (!$('#content')) return;
  if (error) { c.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  const rows = (data || []).filter((x) => !E.who || x.created_by === E.who);
  E.rows = rows;
  const tot = rows.reduce((a, x) => a + num(x.amount), 0);
  const chip = (v, label) => '<button class="' + (E.show === v ? 'on' : '') + '" data-action="ex-show" data-v="' + v + '">' + label + '</button>';
  const people = isOwner() ? Array.from(new Set((data || []).map((x) => x.created_by))) : [];
  const urlsWanted = [];
  rows.forEach((x) => (x.bill_paths || []).forEach((p) => { if (!/\.pdf$/i.test(p)) urlsWanted.push(p); }));
  c.innerHTML = '<button class="btn btn-primary" data-action="ex-new" style="margin-bottom:12px">＋ Add expense</button>' +
    '<div class="filter-chips">' + chip('claimed', 'Waiting') + chip('approved', 'Approved') + chip('paid', 'Paid') + chip('rejected', 'Not approved') + chip('all', 'All') + '</div>' +
    (people.length > 1 ? '<div class="card" style="padding:10px 14px"><div class="field" style="margin:0"><label>Who</label><select id="ex-who"><option value="">Everyone</option>' +
      people.map((id) => '<option class="noi18n" value="' + esc(id) + '"' + (E.who === id ? ' selected' : '') + '>' + esc(nameOf(id)) + '</option>').join('') + '</select></div></div>' : '') +
    '<div class="stat-row"><div class="stat"><div class="st-num o-num-sm">' + esc(rupees(tot)) + '</div><div class="st-label">' + esc(rows.length === 1 ? '1 claim' : rows.length + ' claims') + '</div></div></div>' +
    (rows.length ? rows.map((x) => '<div class="card ex-card">' +
      '<div class="ex-top"><b>' + esc(rupees(x.amount)) + '</b>' + expChip(x.status) + '</div>' +
      '<div class="ex-sub">' + esc([fmtD(x.exp_date), x.category, x.km != null ? num(x.km) + ' km' : '', x.mode, isOwner() ? nameOf(x.created_by) : ''].filter(Boolean).join(' · ')) + '</div>' +
      (x.note ? '<div class="ex-note noi18n">' + esc(x.note) + '</div>' : '') +
      ((x.bill_paths || []).length ? '<div class="ex-bills">' + x.bill_paths.map((p) => /\.pdf$/i.test(p)
        ? '<button type="button" class="ex-pdf" data-action="ex-bill" data-p="' + esc(p) + '">PDF</button>'
        : '<img data-bill="' + esc(p) + '" data-action="ex-bill" data-p="' + esc(p) + '" alt="">').join('') + '</div>' : '') +
      (x.owner_note ? '<div class="hint">' + esc('Owner: ' + x.owner_note) + '</div>' : '') +
      '<div class="photo-row">' +
      (isOwner() && x.status === 'claimed' ? '<button class="btn btn-small btn-primary" data-action="ex-set" data-id="' + x.id + '" data-s="approved">✓ Approve</button>' +
        '<button class="btn btn-small btn-secondary" data-action="ex-set" data-id="' + x.id + '" data-s="rejected">Not approved</button>' : '') +
      (isOwner() && x.status === 'approved' ? '<button class="btn btn-small btn-primary" data-action="ex-set" data-id="' + x.id + '" data-s="paid">Mark paid</button>' : '') +
      (isOwner() && x.status !== 'claimed' ? '<button class="btn btn-small btn-ghost" data-action="ex-set" data-id="' + x.id + '" data-s="claimed">Back to waiting</button>' : '') +
      (x.status === 'claimed' && (x.created_by === S.me.id || isOwner()) ? '<button class="btn btn-small btn-ghost" data-action="ex-edit" data-id="' + x.id + '">Edit</button>' +
        '<button class="btn btn-small btn-danger-ghost" data-action="ex-del" data-id="' + x.id + '">Delete</button>' : '') +
      '</div></div>').join('') : '<div class="empty"><div class="big">🧾</div>No expenses here.</div>');
  const sel = $('#ex-who');
  if (sel) sel.addEventListener('change', () => { E.who = sel.value; renderExpenses(); });
  if (urlsWanted.length) signedUrls('bills', urlsWanted).then((m) => { c.querySelectorAll('img[data-bill]').forEach((im) => { const u = m.get(im.dataset.bill); if (u) im.src = u; }); });
}
function expenseForm(x) {
  const f = S.exf = { id: x ? x.id : null, cat: x ? x.category : 'Travel', mode: x ? x.mode : 'Cash', bills: (x && x.bill_paths ? x.bill_paths.slice() : []), add: [] };
  const seg = (grp, list, cur) => '<div class="seg">' + list.map((v) => '<button type="button" data-g="' + grp + '" data-v="' + esc(v) + '" class="' + (v === cur ? 'on' : '') + '">' + esc(v) + '</button>').join('') + '</div>';
  const ov = openModal('<h3>' + (x ? 'Edit expense' : 'Add expense') + '</h3>' +
    '<div class="o-2col"><div class="field"><label>Date</label><input type="date" id="exf-date" value="' + esc(x ? x.exp_date : todayStr()) + '" max="' + todayStr() + '"></div>' +
    '<div class="field"><label>Amount (₹)</label><input type="text" inputmode="decimal" id="exf-amt" value="' + esc(x && x.amount != null ? x.amount : '') + '" placeholder="0"></div></div>' +
    '<div class="field"><label>For</label>' + seg('cat', EXP_CATS, f.cat) + '</div>' +
    '<div class="field" id="exf-km-wrap"' + (f.cat === 'Travel' || f.cat === 'Fuel' ? '' : ' hidden') + '><label>Km (optional)</label><input type="text" inputmode="decimal" id="exf-km" value="' + esc(x && x.km != null ? x.km : '') + '"></div>' +
    '<div class="field"><label>Paid by</label>' + seg('mode', EXP_MODES, f.mode) + '</div>' +
    '<div class="field"><label>Note</label><input type="text" id="exf-note" value="' + esc(x ? x.note || '' : '') + '" placeholder="e.g. Rajkot trip — bus both ways"></div>' +
    '<div class="field"><label>Bill</label><div class="ex-bills" id="exf-bills"></div>' +
    '<div class="photo-row"><button type="button" class="btn btn-small btn-secondary" data-m="cam">📷 Photo of the bill</button><button type="button" class="btn btn-small btn-secondary" data-m="gal">🖼️ Gallery</button>' +
    '<button type="button" class="btn btn-small btn-secondary" data-m="pdf">📄 PDF</button></div></div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Save</button></div>');
  const drawBills = () => {
    const box = ov.querySelector('#exf-bills');
    box.innerHTML = f.bills.map((p, i) => '<span class="ex-b">' + (/\.pdf$/i.test(p) ? 'PDF' : '🧾') + '<button type="button" data-rm="' + i + '">✕</button></span>').join('') +
      f.add.map((a, i) => '<span class="ex-b new">' + (a.pdf ? 'PDF' : '<img src="' + URL.createObjectURL(a.blob) + '" alt="">') + '<button type="button" data-rmn="' + i + '">✕</button></span>').join('');
    box.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => { f.bills.splice(+b.dataset.rm, 1); drawBills(); }; });
    box.querySelectorAll('[data-rmn]').forEach((b) => { b.onclick = () => { f.add.splice(+b.dataset.rmn, 1); drawBills(); }; });
  };
  drawBills();
  ov.querySelectorAll('.seg button').forEach((b) => {
    b.onclick = () => {
      f[b.dataset.g] = b.dataset.v;
      ov.querySelectorAll('.seg button[data-g="' + b.dataset.g + '"]').forEach((x2) => x2.classList.toggle('on', x2 === b));
      const kw = ov.querySelector('#exf-km-wrap');
      if (kw) kw.hidden = !(f.cat === 'Travel' || f.cat === 'Fuel');
    };
  });
  const photo = (gal) => pickImage(async (file) => { const p = await downscale(file, 1600).catch(() => null); if (p) { f.add.push({ blob: p.blob, pdf: false }); drawBills(); } }, gal);
  ov.querySelector('[data-m=cam]').onclick = () => photo(false);
  ov.querySelector('[data-m=gal]').onclick = () => photo(true);
  ov.querySelector('[data-m=pdf]').onclick = () => pickFile('application/pdf', (fl) => {
    if (fl.size > 8 * 1024 * 1024) { toast('That PDF is too big (more than 8 MB).', 'err'); return; }
    f.add.push({ blob: fl, pdf: true }); drawBills();
  });
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    const amt = numOrNull($('#exf-amt').value);
    if (!(amt > 0)) { toast('Type the amount.', 'err'); return; }
    const km = f.cat === 'Travel' || f.cat === 'Fuel' ? numOrNull($('#exf-km').value) : null;
    e.target.disabled = true;
    const busy = busyOverlay('Saving…');
    let fails = 0;
    const paths = f.bills.slice();
    for (const a of f.add) {
      const path = S.me.id + '/bill-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) + (a.pdf ? '.pdf' : '.jpg');
      const r = await db.storage.from('bills').upload(path, a.blob, { contentType: a.pdf ? 'application/pdf' : 'image/jpeg' });
      if (r.error) fails++; else paths.push(path);
    }
    const row = { exp_date: $('#exf-date').value || todayStr(), amount: amt, category: f.cat, mode: f.mode, km, note: $('#exf-note').value.trim() || null, bill_paths: paths };
    const res = f.id ? await db.from('expenses').update(row).eq('id', f.id).select('id') : await db.from('expenses').insert(Object.assign({ created_by: S.me.id, status: 'claimed' }, row)).select('id');
    busy.remove();
    if (res.error || !res.data || !res.data.length) { e.target.disabled = false; toast('Could not save — try again.', 'err'); return; }
    closeModal();
    toast(fails ? 'Saved — but a bill could not be uploaded.' : 'Expense saved ✓', fails ? 'err' : 'ok');
    renderExpenses();
  };
}
async function expenseSet(id, st) {
  const go = async (note) => {
    const patch = { status: st };
    if (note != null) patch.owner_note = note || null;
    const { data, error } = await db.from('expenses').update(patch).eq('id', id).select('id');
    if (error || !data || !data.length) { toast('Could not update — try again.', 'err'); return; }
    toast(st === 'approved' ? 'Approved ✓' : st === 'paid' ? 'Marked paid ✓' : st === 'rejected' ? 'Marked not approved' : 'Back to waiting', 'ok');
    renderExpenses();
  };
  if (st !== 'rejected') { go(null); return; }
  const ov = openModal('<h3>Not approved</h3><div class="field"><label>Why? (they will see it)</label><input type="text" id="ex-why" placeholder="e.g. No bill"></div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes" style="background:#b3372f">Not approved</button></div>');
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = () => { const w = $('#ex-why').value.trim(); closeModal(); go(w); };
}
onAct('ex-open', () => { S.ex = null; showSub(isOwner() ? 'Expense claims' : 'My expenses', renderExpenses); });
onAct('ex-show', (el) => { if (!S.ex) return; S.ex.show = el.dataset.v; renderExpenses(); });
onAct('ex-new', () => expenseForm(null));
onAct('ex-edit', (el) => { const x = S.ex && (S.ex.rows || []).find((r) => r.id === el.dataset.id); if (x) expenseForm(x); });
onAct('ex-del', (el) => confirmModal('Delete this expense?', 'It will be removed.', 'Delete', async () => {
  const x = S.ex && (S.ex.rows || []).find((r) => r.id === el.dataset.id);
  const { data, error } = await db.from('expenses').delete().eq('id', el.dataset.id).select('id');
  if (error || !data || !data.length) { toast('Could not delete — try again.', 'err'); return; }
  if (x && (x.bill_paths || []).length) db.storage.from('bills').remove(x.bill_paths).then(() => {}, () => {});
  toast('Deleted', 'ok');
  renderExpenses();
}, true));
onAct('ex-set', (el) => expenseSet(el.dataset.id, el.dataset.s));
onAct('ex-bill', async (el) => {
  const m = await signedUrls('bills', [el.dataset.p]);
  const u = m.get(el.dataset.p);
  if (!u) { toast('Could not open it — try again.', 'err'); return; }
  if (/\.pdf$/i.test(el.dataset.p)) window.open(u, '_blank'); else photoViewer('Bill', [{ u, cap: 'Bill' }], null, null, 0);
});

/* ================= VOICE NOTES ON A MEETING ================= */
const VOICE_MAX = 120;   // seconds
function voiceBoxHTML() {
  if (!voiceOn()) return '';
  return '<div class="voice-box" id="voice-box"><button type="button" class="btn btn-small btn-secondary" data-action="vn-rec">🎙️ Voice note</button><span class="hint">Up to 2 minutes</span></div>';
}
function voiceDraw() {
  const box = $('#voice-box');
  const V = S.voice || {};
  if (!box) return;
  if (V.rec) box.innerHTML = '<button type="button" class="btn btn-small btn-primary vn-stop" data-action="vn-stop">■ Stop</button><span class="vn-live">● ' + esc(fmtSecs(V.secs || 0)) + '</span>';
  else if (V.blob) box.innerHTML = '<audio controls src="' + V.url + '"></audio><button type="button" class="fu-x" data-action="vn-del" aria-label="Remove">✕</button>';
  else box.innerHTML = '<button type="button" class="btn btn-small btn-secondary" data-action="vn-rec">🎙️ Voice note</button><span class="hint">Up to 2 minutes</span>';
}
function fmtSecs(s) { s = Math.round(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
async function voiceRecord() {
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (e) { toast('The microphone could not be opened — allow it for this app.', 'err'); return; }
  const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => window.MediaRecorder.isTypeSupported && window.MediaRecorder.isTypeSupported(t)) || '';
  const rec = new window.MediaRecorder(stream, type ? { mimeType: type } : undefined);
  const parts = [];
  S.voice = { rec, secs: 0, stream, t0: Date.now() };
  rec.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
  rec.onstop = () => {
    stream.getTracks().forEach((t) => { try { t.stop(); } catch (_) { /* ignore */ } });
    const blob = new Blob(parts, { type: (rec.mimeType || type || 'audio/webm').split(';')[0] });
    const secs = Math.max(1, Math.round((Date.now() - S.voice.t0) / 1000));
    clearInterval(S.voice.tick);
    S.voice = blob.size ? { blob, secs, url: URL.createObjectURL(blob) } : null;
    voiceDraw();
  };
  rec.start(1000);
  S.voice.tick = setInterval(() => {
    if (!S.voice || !S.voice.rec) return;
    S.voice.secs = (Date.now() - S.voice.t0) / 1000;
    if (S.voice.secs >= VOICE_MAX) { voiceStop(); return; }
    const live = document.querySelector('.vn-live');
    if (live) live.textContent = '● ' + fmtSecs(S.voice.secs);
  }, 500);
  voiceDraw();
}
function voiceStop() { const V = S.voice; if (V && V.rec && V.rec.state !== 'inactive') V.rec.stop(); }
/* after the meeting is saved: send the recording, note it on the meeting */
async function voiceAfterSave(interactionId) {
  const V = S.voice;
  S.voice = null;
  if (!V || !V.blob || !interactionId) return true;
  const ext = /mp4/.test(V.blob.type) ? 'm4a' : /ogg/.test(V.blob.type) ? 'ogg' : 'webm';
  const path = S.me.id + '/' + interactionId + '-' + Date.now() + '.' + ext;
  const up = await db.storage.from('voice').upload(path, V.blob, { contentType: V.blob.type || 'audio/webm' });
  if (up.error) return false;
  const { error } = await db.from('interactions').update({ voice_path: path, voice_secs: V.secs }).eq('id', interactionId);
  return !error;
}
function voiceHTML(it) {
  if (!it.voice_path) return '';
  return '<button type="button" class="vn-play" data-action="vn-play" data-p="' + esc(it.voice_path) + '">▶ ' + esc('Voice note' + (it.voice_secs ? ' (' + fmtSecs(it.voice_secs) + ')' : '')) + '</button>';
}
onAct('vn-rec', () => voiceRecord());
onAct('vn-stop', () => voiceStop());
onAct('vn-del', () => { S.voice = null; voiceDraw(); });
onAct('vn-play', async (el) => {
  const m = await signedUrls('voice', [el.dataset.p]);
  const u = m.get(el.dataset.p);
  if (!u) { toast('Could not open it — try again.', 'err'); return; }
  const a = document.createElement('audio');
  a.controls = true; a.autoplay = true; a.src = u; a.className = 'vn-audio';
  el.replaceWith(a);
});

/* ================= SAMPLE BAG ================= */
async function bagRows(userId) {
  let q = db.from('sample_bag').select('*, catalogue_items(*)').is('back_at', null).order('out_at', { ascending: false }).limit(500);
  if (userId) q = q.eq('user_id', userId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}
async function renderBag() {
  const c = $('#content');
  S.bag = S.bag || { who: S.me.id };
  c.innerHTML = loadingHTML();
  let rows;
  try { rows = await bagRows(isOwner() && S.bag.who === 'all' ? null : S.bag.who); } catch (e) { c.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  if (!$('#content')) return;
  S.bag.rows = rows;
  const gross = rows.reduce((a, r) => a + num((r.catalogue_items || {}).gross_wt), 0);
  const mine = S.bag.who === S.me.id;
  c.innerHTML = (isOwner() ? '<div class="filter-chips"><button class="' + (S.bag.who === S.me.id ? 'on' : '') + '" data-action="bag-who" data-v="me">My bag</button>' +
      '<button class="' + (S.bag.who === 'all' ? 'on' : '') + '" data-action="bag-who" data-v="all">Everyone\'s</button></div>' : '') +
    (mine ? '<div class="action-row"><button class="btn btn-primary" data-action="bag-take">＋ Take pieces</button>' +
      (rows.length ? '<button class="btn btn-secondary" data-action="bag-back-all">Give all back</button>' : '') + '</div>' : '') +
    '<div class="stat-row"><div class="stat"><div class="st-num">' + rows.length + '</div><div class="st-label">Pieces</div></div>' +
    '<div class="stat"><div class="st-num o-num-sm">' + esc(grams(gross)) + '</div><div class="st-label">Gross weight</div></div></div>' +
    (rows.length ? rows.map((r) => {
      const it = r.catalogue_items || {};
      return '<div class="list-item bag-item" data-action="cat-open" data-id="' + r.catalogue_id + '">' +
        '<div class="bag-img">' + ((it.photo_paths || [])[0] ? '<img data-catimg="' + esc(it.photo_paths[0]) + '" alt="">' : '💍') + '</div>' +
        '<div class="li-main"><div class="li-title noi18n">' + esc(it.tag_no || it.title || 'Design') + '</div>' +
        '<div class="li-sub">' + esc([it.category, it.gross_wt != null ? grams(it.gross_wt) : '', S.bag.who === 'all' ? nameOf(r.user_id) : ''].filter(Boolean).join(' · ')) + '</div>' +
        '<div class="li-when">' + esc('Since ' + fmtD(r.out_at)) + '</div></div>' +
        (r.user_id === S.me.id || isOwner() ? '<button type="button" class="btn btn-small btn-ghost" data-action="bag-back" data-id="' + r.id + '">Give back</button>' : '') + '</div>';
    }).join('') : '<div class="empty"><div class="big">👜</div>' + (mine ? 'Your sample bag is empty.<br>Tap “Take pieces” when you carry catalogue pieces to shops.' : 'No pieces out.') + '</div>');
  if (typeof fillCatImages === 'function') fillCatImages(c);
}
async function bagTake() {
  const [cr, br] = await Promise.all([
    db.from('catalogue_items').select('*').eq('status', 'available').order('tag_no', { ascending: true }).limit(400),
    db.from('sample_bag').select('catalogue_id').is('back_at', null).limit(2000),
  ]);
  const out = new Set((br.data || []).map((x) => x.catalogue_id));
  const list = (cr.data || []).filter((x) => !out.has(x.id));
  if (!list.length) { toast('No available pieces to take.', 'err'); return; }
  const sel = new Set();
  const ov = openModal('<h3>Take pieces in your bag</h3><input type="text" id="bag-q" placeholder="Search tag no." autocomplete="off" style="margin-bottom:8px">' +
    '<div class="bag-pick" id="bag-pick"></div><div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Take (0)</button></div>');
  const draw = () => {
    const q = String($('#bag-q').value || '').trim().toLowerCase();
    ov.querySelector('#bag-pick').innerHTML = list.filter((x) => !q || [x.tag_no, x.title, x.category].join(' ').toLowerCase().indexOf(q) > -1).slice(0, 150).map((x) =>
      '<label class="bag-opt"><input type="checkbox" data-id="' + x.id + '"' + (sel.has(x.id) ? ' checked' : '') + '><b class="noi18n">' + esc(x.tag_no || x.title || '') + '</b><span>' +
      esc([x.category, x.gross_wt != null ? grams(x.gross_wt) : ''].filter(Boolean).join(' · ')) + '</span></label>').join('');
    ov.querySelectorAll('#bag-pick input').forEach((cb) => { cb.onchange = () => { if (cb.checked) sel.add(cb.dataset.id); else sel.delete(cb.dataset.id); ov.querySelector('[data-m=yes]').textContent = 'Take (' + sel.size + ')'; }; });
  };
  draw();
  $('#bag-q').addEventListener('input', draw);
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    if (!sel.size) { toast('Tick the pieces you take.', 'err'); return; }
    e.target.disabled = true;
    const { error } = await db.from('sample_bag').insert(Array.from(sel).map((id) => ({ catalogue_id: id, user_id: S.me.id })));
    closeModal();
    if (error) { toast(/duplicate|sample_bag_open/i.test(error.message || '') ? 'A piece is already in someone\'s bag — try again.' : 'Could not save — try again.', 'err'); renderBag(); return; }
    toast(sel.size === 1 ? '1 piece in your bag ✓' : sel.size + ' pieces in your bag ✓', 'ok');
    renderBag();
  };
}
async function bagBack(ids) {
  if (!ids.length) return;
  const { error } = await db.from('sample_bag').update({ back_at: new Date().toISOString() }).in('id', ids).is('back_at', null);
  if (error) { toast('Could not save — try again.', 'err'); return; }
  toast(ids.length === 1 ? 'Given back ✓' : ids.length + ' pieces given back ✓', 'ok');
  if (S.sub.length && S.sub[S.sub.length - 1].title === 'Sample bag') renderBag();
  else if (S.catItem) openCatItem(S.catItem.id, true);
}
/* on a catalogue piece's page */
async function loadCatBag(it) {
  const el = $('#cat-bag');
  if (!el || !bagOn()) return;
  const { data } = await db.from('sample_bag').select('id, user_id, out_at').eq('catalogue_id', it.id).is('back_at', null).maybeSingle();
  if (!$('#cat-bag')) return;
  if (data) {
    el.innerHTML = '<div class="notice bag-note">' + esc('👜 In ' + nameOf(data.user_id) + '\'s sample bag since ' + fmtD(data.out_at)) +
      (data.user_id === S.me.id || isOwner() ? ' <button class="btn btn-small btn-ghost" data-action="bag-back" data-id="' + data.id + '">Give back</button>' : '') + '</div>';
  } else if (it.status === 'available') {
    el.innerHTML = '<button class="btn btn-small btn-secondary" data-action="bag-take-one" data-id="' + it.id + '" style="margin-bottom:10px">👜 Take in my sample bag</button>';
  } else el.innerHTML = '';
}
onAct('bag-open', () => { S.bag = { who: S.me.id }; showSub('Sample bag', renderBag); });
onAct('bag-who', (el) => { S.bag.who = el.dataset.v === 'all' ? 'all' : S.me.id; renderBag(); });
onAct('bag-take', () => bagTake());
onAct('bag-back', (el) => bagBack([el.dataset.id]));
onAct('bag-back-all', () => confirmModal('Give all back?', 'Every piece in your bag is marked as given back.', 'Give all back', () => bagBack((S.bag.rows || []).map((r) => r.id))));
onAct('bag-take-one', async (el) => {
  const { error } = await db.from('sample_bag').insert({ catalogue_id: el.dataset.id, user_id: S.me.id });
  if (error) { toast(/duplicate|sample_bag_open/i.test(error.message || '') ? 'It is already in someone\'s bag.' : 'Could not save — try again.', 'err'); return; }
  toast('In your sample bag ✓', 'ok');
  openCatItem(el.dataset.id, true);
});

/* ================= EXHIBITIONS ================= */
function eventMode() {
  if (!eventsOn()) return null;
  try { const v = JSON.parse(localStorage.getItem('eventMode') || 'null'); return v && v.id && v.until >= todayStr() ? v : null; } catch (e) { return null; }
}
function eventStamp() { const m = eventMode(); return m ? { event_id: m.id } : {}; }
function eventBannerHTML() {
  const m = eventMode();
  return m ? '<button class="ev-banner" data-action="ev-open" data-id="' + esc(m.id) + '">🎪 ' + esc('Exhibition mode: ' + m.name) + ' ›</button>' : '';
}
async function renderEvents() {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const [er, cr] = await Promise.all([
    db.from('events').select('*').order('starts_on', { ascending: false, nullsFirst: false }).limit(200),
    db.from('clients').select('event_id').not('event_id', 'is', null).limit(5000),
  ]);
  if (!$('#content')) return;
  const n = new Map();
  (cr.data || []).forEach((x) => n.set(x.event_id, (n.get(x.event_id) || 0) + 1));
  const list = er.data || [];
  const on = eventMode();
  c.innerHTML = '<button class="btn btn-primary" data-action="ev-new" style="margin-bottom:12px">＋ New exhibition</button>' +
    (list.length ? list.map((e) => '<div class="list-item" data-action="ev-open" data-id="' + e.id + '"><div class="li-main"><div class="li-title noi18n">' + esc(e.name) + '</div>' +
      '<div class="li-sub">' + esc([e.city, e.starts_on ? fmtD(e.starts_on) + (e.ends_on && e.ends_on !== e.starts_on ? ' – ' + fmtD(e.ends_on) : '') : ''].filter(Boolean).join(' · ')) + '</div>' +
      '<div class="li-chips"><span class="chip">' + esc((n.get(e.id) || 0) + ' visitors') + '</span>' + (on && on.id === e.id ? '<span class="chip ev-on">Exhibition mode on</span>' : '') + '</div></div>' +
      '<div class="li-go">›</div></div>').join('') : '<div class="empty"><div class="big">🎪</div>No exhibitions yet.<br>Add one before a trade show — every visitor you add there is kept with it.</div>');
}
function eventForm() {
  const ov = openModal('<h3>New exhibition</h3><div class="field"><label>Name</label><input type="text" id="evf-name" placeholder="e.g. IIJS Premiere 2026"></div>' +
    '<div class="field"><label>City</label><input type="text" id="evf-city"></div>' +
    '<div class="o-2col"><div class="field"><label>From</label><input type="date" id="evf-from" value="' + todayStr() + '"></div><div class="field"><label>To</label><input type="date" id="evf-to" value="' + todayStr(3) + '"></div></div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Save</button></div>');
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    const name = $('#evf-name').value.trim();
    if (name.length < 2) { toast('Type the exhibition\'s name.', 'err'); return; }
    e.target.disabled = true;
    const from = $('#evf-from').value || null, to = $('#evf-to').value || from;
    const { data, error } = await db.from('events').insert({ name, city: $('#evf-city').value.trim() || null, starts_on: from, ends_on: to && from && to < from ? from : to, created_by: S.me.id }).select('*').single();
    closeModal();
    if (error || !data) { toast('Could not save — try again.', 'err'); return; }
    eventModeSet(data);
    showSub(data.name, () => renderEvent(data.id));
  };
}
function eventModeSet(e) {
  try {
    if (e) localStorage.setItem('eventMode', JSON.stringify({ id: e.id, name: e.name, until: e.ends_on || todayStr() }));
    else localStorage.removeItem('eventMode');
  } catch (err) { /* private mode: it works for this visit only */ }
  toast(e ? 'Exhibition mode on — new clients and meetings are kept with ' + e.name : 'Exhibition mode off', 'ok');
}
async function renderEvent(id) {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const [er, cr, ir] = await Promise.all([
    db.from('events').select('*').eq('id', id).maybeSingle(),
    db.from('clients').select('id, trade_name, contact_person, city, mobile, interest, created_by, created_at').eq('event_id', id).order('created_at', { ascending: false }).limit(1000),
    db.from('interactions').select('id, client_id').eq('event_id', id).limit(5000),
  ]);
  if (!$('#content')) return;
  const e = er.data;
  if (!e) { c.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  S.ev = { e, visitors: cr.data || [] };
  const on = eventMode();
  const vis = S.ev.visitors;
  const hot = vis.filter((v) => v.interest === 'Hot').length;
  c.innerHTML = '<div class="client-head"><h2 class="noi18n">' + esc(e.name) + '</h2><div class="co">' +
    esc([e.city, e.starts_on ? fmtD(e.starts_on) + (e.ends_on && e.ends_on !== e.starts_on ? ' – ' + fmtD(e.ends_on) : '') : ''].filter(Boolean).join(' · ')) + '</div></div>' +
    '<div class="card ev-mode"><div class="wd-row"><div><b>' + esc(on && on.id === e.id ? 'Exhibition mode is on' : 'Exhibition mode is off') + '</b><div class="hint">' +
    esc('While it is on, every client and meeting you add on this phone is kept with this exhibition.') + '</div></div>' +
    '<button class="btn btn-small ' + (on && on.id === e.id ? 'btn-ghost' : 'btn-primary') + '" data-action="ev-mode" data-id="' + e.id + '">' + (on && on.id === e.id ? 'Turn off' : 'Turn on') + '</button></div></div>' +
    '<button class="btn btn-primary" data-action="ev-visitor" data-id="' + e.id + '">＋ Add visitor</button>' +
    '<div class="stat-row" style="margin-top:12px"><div class="stat"><div class="st-num">' + vis.length + '</div><div class="st-label">Visitors</div></div>' +
    '<div class="stat"><div class="st-num">' + hot + '</div><div class="st-label">Hot</div></div>' +
    '<div class="stat"><div class="st-num">' + (ir.data || []).length + '</div><div class="st-label">Meetings</div></div></div>' +
    (vis.length ? '<div class="action-row"><button class="btn btn-secondary" data-action="ev-csv">⬇ Excel</button></div>' : '') +
    '<div class="section-label">Visitors (' + vis.length + ')</div>' +
    (vis.length ? vis.map((v) => '<div class="list-item" data-action="open-client" data-id="' + v.id + '"><div class="li-main"><div class="li-title noi18n">' + esc(v.trade_name) + '</div>' +
      '<div class="li-sub">' + esc([v.contact_person, v.city, nameOf(v.created_by)].filter(Boolean).join(' · ')) + '</div>' +
      '<div class="li-chips">' + chipInterest(v.interest) + '</div></div>' +
      (isIndianMobile(normMobile(v.mobile)) ? '<button type="button" class="camp-send ro-wa" data-action="ev-thanks" data-id="' + v.id + '" aria-label="WhatsApp">' + WA_SVG + '</button>' : '<div class="li-go">›</div>') + '</div>').join('')
      : '<div class="empty">No visitors yet — tap “Add visitor” at the stall.</div>');
}
onAct('ev-list', () => showSub('Exhibitions', renderEvents));
onAct('ev-new', () => eventForm());
onAct('ev-open', (el) => { const t = el.querySelector && el.querySelector('.li-title'); showSub(t ? t.textContent : 'Exhibition', () => renderEvent(el.dataset.id)); });
onAct('ev-mode', (el) => {
  const on = eventMode();
  if (on && on.id === el.dataset.id) eventModeSet(null);
  else if (S.ev && S.ev.e.id === el.dataset.id) eventModeSet(S.ev.e);
  renderEvent(el.dataset.id);
});
onAct('ev-visitor', (el) => {
  const on = eventMode();
  if (!(on && on.id === el.dataset.id) && S.ev) eventModeSet(S.ev.e);
  showSub('New Client', renderNewChoice);
});
onAct('ev-thanks', (el) => {
  const v = S.ev && S.ev.visitors.find((x) => x.id === el.dataset.id);
  if (!v) return;
  openWa(v.mobile, 'Namaste' + (v.contact_person ? ' ' + String(v.contact_person).split(' ')[0] : '') + ' 🙏\nThank you for visiting our stall at ' + S.ev.e.name +
    '. We will send you the designs you liked. For anything, message us here.\n— ' + bizName());
});
onAct('ev-csv', () => {
  if (!S.ev) return;
  downloadFile(safeFileName(S.ev.e.name + ' visitors') + '.csv', buildCsv(['Shop', 'Contact', 'City', 'Mobile', 'Interest', 'Added by', 'Added on'],
    S.ev.visitors.map((v) => [v.trade_name, v.contact_person, v.city, v.mobile, v.interest, nameOf(v.created_by), fmtExp(v.created_at)])));
});
