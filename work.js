/* ============================================================
   WORK (TO-DO) — database update 20
   · Anyone gives work to anyone in the team (one person or several
     at once, or themselves): what to do, details, a date and time to
     finish by, urgent or not, files (photos, PDFs, any document) and a
     voice note, a shop or an order it is about, repeated every day /
     week / month.
   · The person sees it on Today, taps ▶ Started and ✓ Finished — the
     date and time of each are kept — and adds a note and the files of
     what was done.
   · Whoever gave it accepts it, or sends it back with what is still
     to do. Comments (with files) on each piece of work.
   · Phone alerts for each step (send-alerts, kind "work").
   ============================================================ */
'use strict';

function workOn() { return !!S.dbv20 && appOn('work'); }

const WORK_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'application/pdf',
  'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac', 'audio/wav', 'audio/x-m4a',
  'video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv', 'application/zip', 'application/x-zip-compressed', 'application/octet-stream'];
const WORK_MAX = 25 * 1024 * 1024;
const WO_OPEN = ['todo', 'started'];
const WO_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<rect x="4" y="3.5" width="16" height="17" rx="2.5"/><path d="M8 8.5l1.5 1.5L12.5 7"/><path d="M14.5 8.5H17"/><path d="M8 14l1.5 1.5 3-3"/><path d="M14.5 14H17"/></svg>';

/* ---------------- small helpers ---------------- */
function woLate(t) { return WO_OPEN.indexOf(t.status) > -1 && !!t.due_at && new Date(t.due_at).getTime() < Date.now(); }
function woDayWord(iso) {
  const d = new Date(iso), k = ymd(d);
  if (k === todayStr()) return 'Today';
  if (k === todayStr(1)) return 'Tomorrow';
  if (k === todayStr(-1)) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}
function woWhen(iso) { return woDayWord(iso) + ', ' + fmtTime(iso); }
function woDue(t) {
  if (!t.due_at) return '';
  if (woLate(t)) return 'Late · was due ' + woWhen(t.due_at);
  return 'Finish by ' + woWhen(t.due_at);
}
/* 2 h 15 min · 3 days 4 h · 12 min */
function woTook(a, b) {
  const m = Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000));
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d) return d + (d === 1 ? ' day' : ' days') + (h % 24 ? ' ' + (h % 24) + ' h' : '');
  return h + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : '');
}
function woFirst(id) { return String(nameOf(id) || '').split(' ')[0] || '—'; }
function woWho(id) { return id === S.me.id ? 'Me' : nameOf(id); }
function woWhoHTML(id) { return id === S.me.id ? '<span>' + esc('Me') + '</span>' : '<span class="noi18n">' + esc(nameOf(id)) + '</span>'; }
/* "Hardik → Parth", or "Parth — own work" */
function woPeopleHTML(t) {
  return t.given_by === t.given_to ? woWhoHTML(t.given_to) + ' <span>' + esc('(own work)') + '</span>' : woWhoHTML(t.given_by) + ' → ' + woWhoHTML(t.given_to);
}
function woStatus(t) {
  const mine = t.given_to === S.me.id, gave = t.given_by === S.me.id || isOwner();
  if (t.status === 'todo') return ['To do', 'todo'];
  if (t.status === 'started') return ['Started', 'started'];
  if (t.status === 'done') return [mine && !gave ? 'Completed — waiting for a check' : 'Completed — check it', 'done'];
  if (t.status === 'accepted') return ['Done ✓', 'accepted'];
  return ['Cancelled', 'cancelled'];
}
function woSort(a, b) {
  const open = (t) => (WO_OPEN.indexOf(t.status) > -1 ? 0 : 1);
  if (open(a) !== open(b)) return open(a) - open(b);
  if (!open(a)) {
    if (woLate(a) !== woLate(b)) return woLate(a) ? -1 : 1;
    if (!!a.urgent !== !!b.urgent) return a.urgent ? -1 : 1;
    if (!!a.due_at !== !!b.due_at) return a.due_at ? -1 : 1;
    if (a.due_at && b.due_at && a.due_at !== b.due_at) return a.due_at < b.due_at ? -1 : 1;
    return String(b.created_at).localeCompare(String(a.created_at));
  }
  return String(b.done_at || b.updated_at || '').localeCompare(String(a.done_at || a.updated_at || ''));
}
function woAlert(event, ids) {   // phone alerts (send-alerts, kind "work") — nothing is lost when alerts are not set up
  if (S.dbv9 === false) return;
  db.functions.invoke('send-alerts', { body: Object.assign({ kind: 'work', event }, ids) }).then(() => {}, () => {});
}
function woErr(error, fallback) {
  const m = String((error && error.message) || '');
  const known = ['Write what the work is', 'Choose who will do it', 'up to 200 letters', 'needs a date and time', 'not in the team', 'given already',
    'Only the person it was given to', 'Only whoever gave the work', 'already finished or cancelled', 'not finished yet', 'Write what is still to be done',
    'already done and accepted', 'cannot be changed', 'Write something, or add a file', 'not there any more', 'This work was cancelled'];
  const hit = known.find((k) => m.indexOf(k) > -1);
  return hit ? m.replace(/^.*?ERROR:\s*/, '').split('\n')[0] : fallback;
}

/* ---------------- files: pick, upload, show ---------------- */
function woFileType(f) { const t = String((f && f.type) || '').toLowerCase(); return WORK_TYPES.indexOf(t) > -1 ? t : 'application/octet-stream'; }
function woSafeName(n) { return String(n || 'file').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(-80) || 'file'; }
function woSize(s) { return !s ? '' : s < 1024 * 1024 ? Math.max(1, Math.round(s / 1024)) + ' KB' : (Math.round(s / 104857.6) / 10) + ' MB'; }
/* the add-a-file buttons of a form: camera, a photo, any file */
function woPickHTML(key) {
  return '<div class="wo-pick"><button type="button" class="btn btn-small btn-secondary" data-action="wo-add" data-k="' + key + '" data-how="cam">📷 Camera</button>' +
    '<button type="button" class="btn btn-small btn-secondary" data-action="wo-add" data-k="' + key + '" data-how="gal">🖼️ Photo</button>' +
    '<button type="button" class="btn btn-small btn-secondary" data-action="wo-add" data-k="' + key + '" data-how="file">📎 File</button></div>';
}
const WO_ATT = {};   // form key → { list: [{ blob, name, type, size, url, img }], draw() }
function woAtt(key, draw) { WO_ATT[key] = { list: [], draw }; return WO_ATT[key]; }
/* a box (modal) is outside the page: its add-a-file and remove buttons are wired here */
function woModalActs(ov) {
  ov.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (el && ov.contains(el) && window.ACTIONS[el.dataset.action]) { e.preventDefault(); window.ACTIONS[el.dataset.action](el, e); }
  });
}
function woAttHTML(list, key) {
  return list.map((a, i) => '<span class="wo-att' + (a.img ? ' img' : '') + '">' +
    (a.img ? '<img src="' + a.url + '" alt="">' : '<span class="wo-att-n noi18n">' + (a.voice ? '🎙️ ' : '📄 ') + esc(a.name) + '</span><span class="wo-att-s noi18n">' + esc(woSize(a.size)) + '</span>') +
    '<button type="button" data-action="wo-att-x" data-k="' + key + '" data-i="' + i + '" aria-label="Remove">✕</button></span>').join('');
}
onAct('wo-add', (el) => {
  const A = WO_ATT[el.dataset.k];
  if (!A) return;
  if (A.list.length >= 20) { toast('Up to 20 files.', 'err'); return; }
  const push = (x) => { A.list.push(x); A.draw(); };
  if (el.dataset.how === 'file') {
    pickFile('*/*', (f) => {
      if (!f) return;
      if (f.size > WORK_MAX) { toast('That file is too big (more than 25 MB).', 'err'); return; }
      const t = woFileType(f);
      if (/^image\/(jpeg|png|webp)$/.test(t) && f.size > 1500000) {   // a big photo from the files: made smaller like the others
        downscale(f, 1600).then((p) => push({ blob: p.blob, name: f.name.replace(/\.[^.]+$/, '') + '.jpg', type: 'image/jpeg', size: p.blob.size, url: URL.createObjectURL(p.blob), img: true }),
          () => push({ blob: f, name: f.name, type: t, size: f.size, url: URL.createObjectURL(f), img: true }));
        return;
      }
      push({ blob: f, name: f.name || 'file', type: t, size: f.size, url: URL.createObjectURL(f), img: /^image\//.test(t) && !/heic|heif/.test(t) });
    });
    return;
  }
  pickImage(async (file) => {
    let p;
    try { p = await downscale(file, 1600); } catch (e) { toast(imageErrMsg(e), 'err'); return; }
    push({ blob: p.blob, name: 'photo-' + (A.list.length + 1) + '.jpg', type: 'image/jpeg', size: p.blob.size, url: URL.createObjectURL(p.blob), img: true });
  }, el.dataset.how === 'gal');
});
onAct('wo-att-x', (el) => {
  const A = WO_ATT[el.dataset.k];
  if (!A) return;
  const [gone] = A.list.splice(+el.dataset.i, 1);
  if (gone && gone.url) { try { URL.revokeObjectURL(gone.url); } catch (e) { /* ignore */ } }
  A.draw();
});
/* upload under prefix (b/<batch>/ or t/<work>/) → the list the database keeps */
async function woUpload(prefix, list) {
  const files = [];
  let fails = 0;
  for (const a of list) {
    const path = prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + '-' + woSafeName(a.name);
    let r;
    try { r = await db.storage.from('work').upload(path, a.blob, { contentType: a.type }); } catch (e) { r = { error: e }; }
    if (r && r.error) fails++;
    else files.push(Object.assign({ p: path, n: a.name, t: a.type, s: a.size || 0 }, a.secs ? { d: a.secs } : {}));
  }
  return { files, fails };
}
/* files kept on a piece of work: photos as pictures, voice notes to play, the rest to open */
function woFilesHTML(files, title) {
  if (!files || !files.length) return '';
  const pics = files.filter((f) => /^image\//.test(f.t) && !/heic|heif/.test(f.t));
  const rest = files.filter((f) => pics.indexOf(f) < 0);
  return '<div class="wo-files" data-title="' + esc(title || '') + '" data-pics="' + esc(JSON.stringify(pics.map((f) => ({ p: f.p, n: f.n })))) + '">' +
    (pics.length ? '<div class="wo-pics">' + pics.map((f, i) => '<button type="button" class="wo-pic" data-action="wo-pic" data-i="' + i + '"><img data-wp="' + esc(f.p) + '" alt=""></button>').join('') + '</div>' : '') +
    rest.map((f) => /^audio\//.test(f.t)
      ? '<button type="button" class="vn-play" data-action="wo-play" data-p="' + esc(f.p) + '">▶ ' + esc('Voice note' + (f.d ? ' (' + fmtSecs(f.d) + ')' : '')) + '</button>'
      : '<button type="button" class="wo-doc" data-action="wo-doc" data-p="' + esc(f.p) + '"><span class="noi18n">' + (/pdf/.test(f.t) ? '📕' : /video/.test(f.t) ? '🎬' : /sheet|excel|csv/.test(f.t) ? '📊' : '📄') +
        ' ' + esc(f.n || 'File') + '</span><small class="noi18n">' + esc(woSize(f.s)) + '</small></button>').join('') + '</div>';
}
/* after drawing: fill in the pictures */
async function woLoadPics(root) {
  const imgs = Array.from((root || document).querySelectorAll('img[data-wp]'));
  if (!imgs.length) return;
  const m = await signedUrls('work', imgs.map((i) => i.dataset.wp));
  imgs.forEach((i) => { const u = m.get(i.dataset.wp); if (u) i.src = u; });
}
onAct('wo-pic', async (el) => {
  const box = el.closest('.wo-files');
  let pics = [];
  try { pics = JSON.parse(box.dataset.pics || '[]'); } catch (e) { pics = []; }
  const m = await signedUrls('work', pics.map((f) => f.p));
  const slides = pics.map((f) => ({ u: m.get(f.p), cap: f.n || '' })).filter((x) => x.u);
  if (!slides.length) { toast('Could not open it — try again.', 'err'); return; }
  photoViewer(box.dataset.title || 'Photos', slides, null, null, Math.min(+el.dataset.i, slides.length - 1));
});
onAct('wo-doc', async (el) => {
  const m = await signedUrls('work', [el.dataset.p]);
  const u = m.get(el.dataset.p);
  if (!u) { toast('Could not open it — try again.', 'err'); return; }
  window.open(u, '_blank');
});
onAct('wo-play', async (el) => {
  const m = await signedUrls('work', [el.dataset.p]);
  const u = m.get(el.dataset.p);
  if (!u) { toast('Could not open it — try again.', 'err'); return; }
  const a = document.createElement('audio');
  a.controls = true; a.autoplay = true; a.src = u; a.className = 'vn-audio';
  el.replaceWith(a);
});

/* ---------------- Today: my work ---------------- */
async function loadTodayWork() {
  const el = $('#today-work');
  if (!el) return;
  if (!workOn()) { el.innerHTML = ''; return; }
  let mine, check;
  try {
    [mine, check] = await Promise.all([
      db.from('tasks').select('id, title, status, urgent, due_at, given_by, given_to, started_at, created_at, files').eq('given_to', S.me.id).in('status', WO_OPEN).limit(300),
      db.from('tasks').select('id', { count: 'exact', head: true }).eq('given_by', S.me.id).eq('status', 'done'),
    ]);
  } catch (e) { el.innerHTML = ''; return; }
  if (!$('#today-work') || !mine || mine.error) return;
  const list = (mine.data || []).slice().sort(woSort);
  const nCheck = (check && check.count) || 0;
  el.innerHTML = '<div class="card wo-today">' +
    '<div class="wo-today-h"><span class="wo-today-ic">' + WO_ICON + '</span><b>My work</b>' + (list.length ? '<span class="wo-count">' + list.length + '</span>' : '') +
    '<button class="btn btn-small btn-secondary" data-action="wo-give">＋ Give work</button></div>' +
    (list.length ? list.slice(0, 5).map(woTodayRow).join('') : '<div class="wo-none">No work for you right now.</div>') +
    (list.length > 5 ? '<button class="wo-more" data-action="wo-list" data-who="me">See all my work (' + list.length + ') ›</button>' : '') +
    (nCheck ? '<button class="wo-check" data-action="wo-list" data-who="by" data-show="check">✓ ' + esc(nCheck === 1 ? '1 completed — check it' : nCheck + ' completed — check them') + ' ›</button>' : '') +
    '</div>';
}
function woTodayRow(t) {
  return '<div class="wo-row' + (woLate(t) ? ' late' : '') + (t.urgent ? ' urgent' : '') + '">' +
    '<div class="wo-row-main" data-action="wo-open" data-id="' + t.id + '"><div class="wo-row-t">' + (t.urgent ? '<span class="wo-urg">Urgent</span> ' : '') + '<span class="noi18n">' + esc(t.title) + '</span>' +
    ((t.files || []).length ? ' <span class="wo-clip">📎</span>' : '') + '</div>' +
    '<div class="wo-row-s">' + [t.given_by !== S.me.id ? '<span>' + esc('Given by') + '</span> <span class="noi18n">' + esc(woFirst(t.given_by)) + '</span>' : '<span>' + esc('My own') + '</span>',
      woDue(t) ? '<span>' + esc(woDue(t)) + '</span>' : '', t.status === 'started' ? '<span>' + esc('Started ' + woWhen(t.started_at)) + '</span>' : ''].filter(Boolean).join(' · ') + '</div></div>' +
    '<div class="wo-row-b">' + (t.status === 'todo' ? '<button class="btn btn-small btn-secondary" data-action="wo-start" data-id="' + t.id + '">▶ Start</button>' : '') +
    '<button class="btn btn-small btn-primary" data-action="wo-finish" data-id="' + t.id + '">✓ Finish</button></div></div>';
}

/* ---------------- the list ---------------- */
function woListTitle(who) { return who === 'by' ? 'Work I gave' : who === 'all' ? 'Everyone\'s work' : 'My work'; }
async function renderWork() {
  const c = $('#content');
  if (!workOn()) { c.innerHTML = '<div class="notice">Work needs the database update (ark-update-08-to-20.sql).</div>'; return; }
  S.wo = S.wo || { who: 'me', show: 'open', q: '' };
  const W = S.wo;
  if (W.who === 'all' && !isOwner()) W.who = 'me';
  const chip = (g, v, label) => '<button class="' + (W[g] === v ? 'on' : '') + '" data-action="wo-f" data-g="' + g + '" data-v="' + v + '">' + esc(label) + '</button>';
  c.innerHTML = '<button class="btn btn-primary" data-action="wo-give" style="margin-bottom:12px">＋ Give work</button>' +
    '<div class="filter-chips">' + chip('who', 'me', 'My work') + chip('who', 'by', 'Work I gave') + (isOwner() ? chip('who', 'all', 'Everyone') : '') + '</div>' +
    '<div class="filter-chips">' + chip('show', 'open', 'Open') + chip('show', 'check', 'To check') + chip('show', 'done', 'Done') + chip('show', 'all', 'All') + '</div>' +
    '<div class="search-box"><input type="text" id="wo-q" placeholder="Search the work…" autocomplete="off" value="' + esc(W.q) + '"></div>' +
    '<div id="wo-list">' + loadingHTML() + '</div>';
  const inp = $('#wo-q');
  inp.addEventListener('input', () => { clearTimeout(S.woT); S.woT = setTimeout(() => { W.q = inp.value; drawWorkList(); }, 250); });
  drawWorkList();
}
async function drawWorkList() {
  const W = S.wo, seq = (S.woSeq = (S.woSeq || 0) + 1);
  let q = db.from('tasks').select('*, clients(trade_name), orders(order_no)');
  if (W.who === 'me') q = q.eq('given_to', S.me.id);
  else if (W.who === 'by') q = q.eq('given_by', S.me.id);
  if (W.show === 'open') q = q.in('status', WO_OPEN);
  else if (W.show === 'check') q = q.eq('status', 'done');
  else if (W.show === 'done') q = q.eq('status', 'accepted');
  const s = String(W.q || '').trim().replace(/[,%()]/g, ' ').trim();
  if (s) q = q.ilike('title', '%' + s + '%');
  const { data, error } = await q.order('created_at', { ascending: false }).limit(400);
  const box = $('#wo-list');
  if (!box || seq !== S.woSeq) return;
  if (error) { box.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  const list = (data || []).slice().sort(woSort);
  box.innerHTML = list.length ? list.map(woItemHTML).join('')
    : '<div class="empty"><div class="big">📝</div>' + esc(W.show === 'check' ? 'Nothing waiting for a check.' : W.show === 'open' ? 'No open work here.' : 'No work here yet.') + '</div>';
}
function woItemHTML(t) {
  const st = woStatus(t);
  const about = [t.clients && t.clients.trade_name, t.orders && ordLabel(t.orders.order_no)].filter(Boolean).join(' · ');
  return '<div class="list-item wo-item' + (woLate(t) ? ' late' : '') + '" data-action="wo-open" data-id="' + t.id + '">' +
    '<div class="li-main"><div class="li-title">' + (t.urgent && WO_OPEN.indexOf(t.status) > -1 ? '<span class="wo-urg">Urgent</span> ' : '') + '<span class="noi18n">' + esc(t.title) + '</span></div>' +
    '<div class="li-sub">' + woPeopleHTML(t) + (about ? ' · <span class="noi18n">' + esc(about) + '</span>' : '') + '</div>' +
    '<div class="wo-meta"><span class="wo-st st-' + st[1] + '">' + esc(st[0]) + '</span>' +
    (t.due_at && WO_OPEN.indexOf(t.status) > -1 ? '<span class="wo-due">' + esc(woDue(t)) + '</span>' : '') +
    (t.done_at && t.status !== 'cancelled' ? '<span class="wo-due">' + esc('Completed ' + woWhen(t.done_at)) + '</span>' : '') +
    ((t.files || []).length + (t.done_files || []).length ? '<span class="wo-clip">📎 ' + ((t.files || []).length + (t.done_files || []).length) + '</span>' : '') +
    (t.repeat ? '<span class="wo-clip">⟳</span>' : '') + '</div></div><div class="li-go">›</div></div>';
}
function ordLabel(n) { return 'ORD-' + String(n || 0).padStart(4, '0'); }
onAct('wo-f', (el) => { S.wo[el.dataset.g] = el.dataset.v; renderWork(); });
onAct('wo-list', (el) => {
  S.wo = { who: el.dataset.who || 'me', show: el.dataset.show || 'open', q: '' };
  showSub(woListTitle(S.wo.who), renderWork);
});

/* ---------------- one piece of work ---------------- */
function openTask(id) { showSub('Work', () => renderTask(id)); }
async function renderTask(id) {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const [tr, nr] = await Promise.all([
    db.from('tasks').select('*, clients(id, trade_name, city), orders(id, order_no, status)').eq('id', id).maybeSingle(),
    db.from('task_notes').select('*').eq('task_id', id).order('created_at', { ascending: true }).limit(500),
  ]);
  if (!$('#content')) return;
  const t = tr && tr.data;
  if (!t) { c.innerHTML = '<div class="empty">This work is not there any more.</div>'; return; }
  S.woTask = t;
  const me = S.me.id, mine = t.given_to === me, gave = t.given_by === me || isOwner();
  if (mine && !t.seen_at) db.rpc('task_seen', { p_id: t.id }).then(() => {}, () => {});
  const st = woStatus(t);
  const time = (label, iso, extra) => iso ? '<div class="wo-time"><span>' + esc(label) + '</span><b>' + esc(fmtDT(iso)) + '</b>' + (extra ? '<em>' + esc(extra) + '</em>' : '') + '</div>' : '';
  const open = WO_OPEN.indexOf(t.status) > -1;
  let btns = '';
  if (mine && open) {
    btns += (t.status === 'todo' ? '<button class="btn btn-secondary wo-big" data-action="wo-start" data-id="' + t.id + '">▶ Start</button>' : '') +
      '<button class="btn btn-primary wo-big" data-action="wo-finish" data-id="' + t.id + '">✓ Finish</button>';
  }
  if (gave && t.status === 'done') {
    btns += '<button class="btn btn-primary wo-big" data-action="wo-accept" data-id="' + t.id + '">✓ Accept</button>' +
      '<button class="btn btn-secondary wo-big" data-action="wo-back" data-id="' + t.id + '">↩ Send back</button>';
  }
  let more = '';
  if (gave && open) more += '<button class="btn btn-small btn-ghost" data-action="wo-edit" data-id="' + t.id + '">✎ Change</button>';
  if (gave && t.status !== 'cancelled' && t.status !== 'accepted') more += '<button class="btn btn-small btn-danger-ghost" data-action="wo-cancel" data-id="' + t.id + '">✕ Cancel the work</button>';
  if (gave && t.status === 'accepted' && t.given_by !== t.given_to) more += '<button class="btn btn-small btn-ghost" data-action="wo-back" data-id="' + t.id + '">↩ Send back</button>';
  more += '<button class="btn btn-small btn-ghost" data-action="wo-again" data-id="' + t.id + '">⟳ Give again</button>';
  const notes = (nr && nr.data) || [];
  c.innerHTML =
    '<div class="card wo-card' + (woLate(t) ? ' late' : '') + '">' +
      '<div class="wo-top"><span class="wo-st st-' + st[1] + '">' + esc(st[0]) + '</span>' + (t.urgent && open ? '<span class="wo-urg">Urgent</span>' : '') +
      (t.repeat ? '<span class="wo-rep">' + esc(t.repeat === 'daily' ? '⟳ Every day' : t.repeat === 'weekly' ? '⟳ Every week' : '⟳ Every month') + '</span>' : '') + '</div>' +
      '<h3 class="wo-title noi18n">' + esc(t.title) + '</h3>' +
      (t.details ? '<div class="wo-det noi18n">' + esc(t.details) + '</div>' : '') +
      '<div class="wo-people">' + woPeopleHTML(t) + '</div>' +
      (t.due_at ? '<div class="wo-duel' + (woLate(t) ? ' late' : '') + '">' + esc(woDue(t)) + '</div>' : '') +
      ((t.clients || t.orders) ? '<div class="wo-links">' +
        (t.clients ? '<button class="chip-btn noi18n" data-action="open-client" data-id="' + t.clients.id + '">🏪 ' + esc(t.clients.trade_name) + ' ›</button>' : '') +
        (t.orders ? '<button class="chip-btn noi18n" data-action="wo-order" data-id="' + t.orders.id + '">📋 ' + esc(ordLabel(t.orders.order_no)) + ' ›</button>' : '') + '</div>' : '') +
      woFilesHTML(t.files, t.title) +
    '</div>' +
    (btns ? '<div class="action-row wo-actions">' + btns + '</div>' : '') +
    '<div class="card wo-times">' + time('Given', t.created_at) + (t.given_by !== t.given_to ? time('Seen', t.seen_at) : '') + time('Started', t.started_at) +
      time('Completed', t.done_at, t.started_at && t.done_at ? 'took ' + woTook(t.started_at, t.done_at) : '') +
      (t.status === 'accepted' && t.given_by !== t.given_to ? time('Accepted', t.checked_at) : '') +
      (t.back_count ? '<div class="wo-time"><span>' + esc('Sent back') + '</span><b>' + esc(t.back_count === 1 ? 'once' : t.back_count + ' times') + '</b></div>' : '') + '</div>' +
    ((t.status === 'done' || t.status === 'accepted') && (t.done_note || (t.done_files || []).length)
      ? '<div class="section-label">What was done</div><div class="card wo-donec">' + (t.done_note ? '<div class="wo-det noi18n">' + esc(t.done_note) + '</div>' : '') + woFilesHTML(t.done_files, 'What was done') + '</div>' : '') +
    '<div class="section-label">Story and comments</div>' +
    '<div class="card wo-thread">' + (notes.map(woNoteHTML).join('') || '<div class="empty" style="padding:6px">Nothing yet.</div>') + '</div>' +
    '<div class="card wo-compose"><textarea id="wo-c" rows="2" placeholder="Write a comment or a question…"></textarea>' +
      '<div id="wo-c-att" class="wo-atts"></div>' + woPickHTML('note') +
      '<button class="btn btn-primary" data-action="wo-send" data-id="' + t.id + '">Send</button></div>' +
    '<div class="wo-more-acts">' + more + '</div>';
  woAtt('note', () => { const b = $('#wo-c-att'); if (b) b.innerHTML = woAttHTML(WO_ATT.note.list, 'note'); });
  woLoadPics(c);
}
const WO_NOTE = { given: 'gave this work', started: 'started the work', done: 'completed the work', accepted: 'accepted the work ✓', back: 'sent the work back', cancelled: 'cancelled the work', edited: 'changed the work' };
function woNoteHTML(n) {
  const me = n.by_user === S.me.id;
  if (n.kind === 'note') {
    return '<div class="wo-msg' + (me ? ' me' : '') + '"><div class="wo-msg-h">' + (me ? '<b>' + esc('You') + '</b>' : '<b class="noi18n">' + esc(woFirst(n.by_user)) + '</b>') +
      '<span>' + esc(woWhen(n.created_at)) + '</span></div>' +
      (n.body ? '<div class="wo-msg-b noi18n">' + esc(n.body) + '</div>' : '') + woFilesHTML(n.files, 'Comment') + '</div>';
  }
  const what = WO_NOTE[n.kind] || n.kind;
  return '<div class="wo-ev ev-' + n.kind + '"><span class="wo-ev-t">' + (me ? '<span>' + esc('You ' + what) + '</span>' : '<span class="noi18n">' + esc(woFirst(n.by_user)) + '</span> <span>' + esc(what) + '</span>') +
    '</span><span class="wo-ev-d">' + esc(woWhen(n.created_at)) + '</span>' +
    (n.body ? '<div class="wo-ev-b noi18n">' + esc(n.body) + '</div>' : '') + ((n.files || []).length ? woFilesHTML(n.files, 'What was done') : '') + '</div>';
}
onAct('wo-open', (el) => openTask(el.dataset.id));
onAct('wo-order', (el) => { if (typeof openOrder === 'function') openOrder(el.dataset.id); });

/* after a change: the screen that is open now is drawn again */
function woRefresh(id) {
  if ($('#wo-list')) { drawWorkList(); return; }
  if ($('#today-work') && !S.sub.length) { loadTodayWork(); return; }
  if (S.woTask && S.woTask.id === id && $('.wo-card')) { renderTask(id); return; }
  if ($('.dp-page')) { const k = $('.dp-page').dataset.k; if (typeof renderDept === 'function') renderDept(k); }
}

/* ---------------- started / finished ---------------- */
onAct('wo-start', async (el) => {
  el.disabled = true;
  const { data, error } = await db.rpc('task_start', { p_id: el.dataset.id });
  if (error) { el.disabled = false; toast(woErr(error, 'Could not save — try again.'), 'err'); return; }
  toast('Started ✓', 'ok');
  woAlert('started', { task_id: el.dataset.id });
  woRefresh(el.dataset.id);
});
onAct('wo-finish', async (el) => {
  const id = el.dataset.id;
  const { data: t } = await db.from('tasks').select('id, title, done_files, given_by, given_to, status').eq('id', id).maybeSingle();
  if (!t) { toast('This work is not there any more.', 'err'); return; }
  const kept = (t.done_files || []).slice();
  const ov = openModal('<h3>Finish the work?</h3><p class="wo-m-t noi18n">' + esc(t.title) + '</p>' +
    '<div class="field"><label>Note (if you want)</label><textarea id="wfin-note" rows="3" placeholder="What was done"></textarea></div>' +
    (kept.length ? '<div class="hint" style="margin:-4px 0 8px">' + esc(kept.length === 1 ? '1 file added before is kept.' : kept.length + ' files added before are kept.') + '</div>' : '') +
    '<div class="field"><label>Files of what was done (if you want)</label><div id="wfin-att" class="wo-atts"></div>' + woPickHTML('fin') + '</div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">✓ Finish</button></div>');
  const A = woAtt('fin', () => { const b = $('#wfin-att'); if (b) b.innerHTML = woAttHTML(A.list, 'fin'); });
  woModalActs(ov);
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    e.target.disabled = true;
    const busy = A.list.length ? busyOverlay('Sending the files…') : null;
    const up = await woUpload('t/' + id + '/', A.list);
    const { data, error } = await db.rpc('task_finish', { p_id: id, p_note: $('#wfin-note').value.trim() || null, p_files: kept.concat(up.files).slice(0, 20) });
    if (busy) busy.remove();
    if (error) { e.target.disabled = false; toast(woErr(error, 'Could not save — try again.'), 'err'); return; }
    closeModal();
    toast(up.fails ? 'Completed — but a file could not be sent.' : 'Completed ✓', up.fails ? 'err' : 'ok');
    if (t.given_by !== t.given_to) woAlert('done', { task_id: id });
    woRefresh(id);
  };
});

/* ---------------- accept / send back / cancel ---------------- */
onAct('wo-accept', async (el) => {
  el.disabled = true;
  const { error } = await db.rpc('task_accept', { p_id: el.dataset.id });
  if (error) { el.disabled = false; toast(woErr(error, 'Could not save — try again.'), 'err'); return; }
  toast('Accepted ✓', 'ok');
  woAlert('accepted', { task_id: el.dataset.id });
  woRefresh(el.dataset.id);
});
onAct('wo-back', (el) => {
  const id = el.dataset.id;
  const ov = openModal('<h3>Send it back</h3><p>Write what is still to be done — it goes back to the person\'s to-do list.</p>' +
    '<div class="field"><textarea id="wback-why" rows="3" placeholder="What is still to be done"></textarea></div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">↩ Send back</button></div>');
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    const why = $('#wback-why').value.trim();
    if (!why) { toast('Write what is still to be done.', 'err'); return; }
    e.target.disabled = true;
    const { error } = await db.rpc('task_back', { p_id: id, p_reason: why });
    if (error) { e.target.disabled = false; toast(woErr(error, 'Could not save — try again.'), 'err'); return; }
    closeModal();
    toast('Sent back ↩', 'ok');
    woAlert('back', { task_id: id });
    woRefresh(id);
  };
});
onAct('wo-cancel', (el) => {
  const id = el.dataset.id;
  const ov = openModal('<h3>Cancel this work?</h3><p>It goes off the person\'s to-do list. You can write why.</p>' +
    '<div class="field"><textarea id="wcan-why" rows="2" placeholder="Why (if you want)"></textarea></div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Keep it</button><button class="btn btn-primary" data-m="yes" style="background:#b3372f">Cancel the work</button></div>');
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    e.target.disabled = true;
    const { error } = await db.rpc('task_cancel', { p_id: id, p_reason: $('#wcan-why').value.trim() || null });
    if (error) { e.target.disabled = false; toast(woErr(error, 'Could not save — try again.'), 'err'); return; }
    closeModal();
    toast('Cancelled', 'ok');
    woAlert('cancelled', { task_id: id });
    woRefresh(id);
  };
});

/* ---------------- comments ---------------- */
onAct('wo-send', async (el) => {
  const id = el.dataset.id, A = WO_ATT.note || { list: [] };
  const body = ($('#wo-c') && $('#wo-c').value.trim()) || '';
  if (!body && !A.list.length) { toast('Write something, or add a file.', 'err'); return; }
  el.disabled = true;
  const busy = A.list.length ? busyOverlay('Sending…') : null;
  const up = await woUpload('t/' + id + '/', A.list);
  const { error } = await db.rpc('task_note', { p_id: id, p_body: body || null, p_files: up.files });
  if (busy) busy.remove();
  if (error) { el.disabled = false; toast(woErr(error, 'Could not send — try again.'), 'err'); return; }
  toast(up.fails ? 'Sent — but a file could not be added.' : 'Sent ✓', up.fails ? 'err' : 'ok');
  woAlert('note', { task_id: id });
  renderTask(id);
});

/* ---------------- giving work (and changing it) ---------------- */
function giveWork(pre) {
  if (!workOn()) { toast('Work needs the database update (ark-update-08-to-20.sql).', 'err'); return; }
  S.voice = null;
  S.wf = Object.assign({ id: null, title: '', details: '', to: [], date: '', time: '', urgent: false, repeat: '', client: null, orderNo: '', keep: [] }, pre || {});
  woAtt('give', woDrawGiveAtt);
  showSub(S.wf.id ? 'Change the work' : 'Give work', renderGiveForm);
}
function woPeople() {
  return Array.from(S.team.values()).filter((p) => p.active)
    .sort((a, b) => (a.id === S.me.id ? -1 : b.id === S.me.id ? 1 : String(a.full_name || '').localeCompare(String(b.full_name || ''))));
}
function renderGiveForm() {
  const F = S.wf, edit = !!F.id;
  const people = woPeople();
  const seg = (v, label) => '<button type="button" class="' + (F.repeat === v ? 'on' : '') + '" data-action="wf-rep" data-v="' + v + '">' + esc(label) + '</button>';
  $('#content').innerHTML =
    '<div class="card">' +
      '<div class="field"><label>What is the work? <span class="req">*</span></label><input type="text" id="wf-title" maxlength="200" placeholder="For example: collect the payment from the shop" value="' + esc(F.title) + '"></div>' +
      '<div class="field"><label>Details</label><textarea id="wf-det" rows="3" placeholder="Anything they should know">' + esc(F.details) + '</textarea></div>' +
    '</div>' +
    (edit ? '<div class="hint" style="margin:-4px 2px 12px">' + esc('Given to ' + (F.toName || '')) + '</div>'
      : '<div class="section-label">Give to <span class="req">*</span></div><div class="card"><div class="wf-people">' +
        people.map((p) => '<button type="button" class="wf-p' + (F.to.indexOf(p.id) > -1 ? ' on' : '') + '" data-action="wf-to" data-id="' + p.id + '">' +
          (p.id === S.me.id ? esc('Me') : '<span class="noi18n">' + esc(p.full_name || p.email || '—') + '</span>') + '</button>').join('') +
        (people.length > 2 ? '<button type="button" class="wf-p wf-all' + (F.to.length === people.length ? ' on' : '') + '" data-action="wf-to" data-id="all">' + esc('Everyone') + '</button>' : '') +
        '</div><div class="hint">' + esc('Each person gets their own copy to start and finish.') + '</div></div>') +
    '<div class="section-label">Finish by</div><div class="card">' +
      '<div class="wf-quick">' + [['t18', 'Today 6 pm'], ['m11', 'Tomorrow 11 am'], ['d3', 'In 3 days'], ['none', 'No date']].map((x) =>
        '<button type="button" class="chip-btn" data-action="wf-when" data-v="' + x[0] + '">' + esc(x[1]) + '</button>').join('') + '</div>' +
      '<div class="o-2col"><div class="field"><label>Date</label><input type="date" id="wf-date" value="' + esc(F.date) + '"></div>' +
      '<div class="field"><label>Time</label><input type="time" id="wf-time" value="' + esc(F.time) + '"></div></div>' +
      '<label class="sw-row"><span class="sw-t"><b>Urgent</b><span>Shown first, in red</span></span><input type="checkbox" class="sw" id="wf-urgent"' + (F.urgent ? ' checked' : '') + '></label>' +
      '<div class="field" style="margin-top:10px"><label>Repeat</label><div class="seg wf-rep">' + seg('', 'No') + seg('daily', 'Every day') + seg('weekly', 'Every week') + seg('monthly', 'Every month') + '</div>' +
      '<div class="hint">' + esc('When it is finished, the next one is made by itself.') + '</div></div>' +
    '</div>' +
    '<div class="section-label">About a shop or an order (if you want)</div><div class="card">' +
      (F.client ? '<div class="wf-client"><span>🏪 ' + esc(F.client.trade_name) + '</span><button type="button" class="fu-x" data-action="wf-client-x" aria-label="Remove">✕</button></div>'
        : '<button type="button" class="btn btn-small btn-secondary" data-action="wf-client">🏪 Choose a shop</button>') +
      '<div class="field" style="margin-top:10px"><label>Order number</label><input type="text" id="wf-ord" inputmode="numeric" placeholder="12" value="' + esc(F.orderNo) + '"></div>' +
    '</div>' +
    '<div class="section-label">Attach (if you want)</div><div class="card">' +
      (F.keep.length ? '<div id="wf-keep" class="wo-atts"></div>' : '') +
      '<div id="wf-att" class="wo-atts"></div>' + woPickHTML('give') +
      (typeof voiceBoxHTML === 'function' ? voiceBoxHTML() : '') +
    '</div>' +
    '<button class="btn btn-primary" data-action="wf-save" id="wf-save">' + esc(edit ? 'Save the changes' : 'Give work') + '</button><div style="height:10px"></div>';
  const keep = (id, k) => { const x = $('#' + id); if (x) x.addEventListener('input', () => { F[k] = x.value; }); };
  keep('wf-title', 'title'); keep('wf-det', 'details'); keep('wf-date', 'date'); keep('wf-time', 'time'); keep('wf-ord', 'orderNo');
  $('#wf-urgent').addEventListener('change', (e) => { F.urgent = e.target.checked; });
  woDrawGiveAtt();
  if (typeof voiceDraw === 'function' && S.voice) voiceDraw();
}
function woDrawGiveAtt() {
  const b = $('#wf-att');
  if (b && WO_ATT.give) b.innerHTML = woAttHTML(WO_ATT.give.list, 'give');
  const k = $('#wf-keep');
  if (k && S.wf) k.innerHTML = S.wf.keep.map((f, i) => '<span class="wo-att"><span class="wo-att-n noi18n">' + (/^image\//.test(f.t) ? '🖼️ ' : /^audio\//.test(f.t) ? '🎙️ ' : '📄 ') + esc(f.n || 'File') +
    '</span><button type="button" data-action="wf-keep-x" data-i="' + i + '" aria-label="Remove">✕</button></span>').join('');
}
onAct('wf-keep-x', (el) => { S.wf.keep.splice(+el.dataset.i, 1); S.wf.keepChanged = true; woDrawGiveAtt(); });
onAct('wf-to', (el) => {
  const F = S.wf, id = el.dataset.id, all = woPeople().map((p) => p.id);
  if (id === 'all') F.to = F.to.length === all.length ? [] : all.slice();
  else F.to = F.to.indexOf(id) > -1 ? F.to.filter((x) => x !== id) : F.to.concat([id]);
  document.querySelectorAll('[data-action="wf-to"]').forEach((b) => b.classList.toggle('on', b.dataset.id === 'all' ? F.to.length === all.length : F.to.indexOf(b.dataset.id) > -1));
});
onAct('wf-when', (el) => {
  const F = S.wf, v = el.dataset.v;
  if (v === 'none') { F.date = ''; F.time = ''; }
  else if (v === 't18') { F.date = todayStr(); F.time = '18:00'; }
  else if (v === 'm11') { F.date = todayStr(1); F.time = '11:00'; }
  else { F.date = todayStr(3); F.time = F.time || '18:00'; }
  $('#wf-date').value = F.date; $('#wf-time').value = F.time;
});
onAct('wf-rep', (el) => {
  S.wf.repeat = el.dataset.v;
  document.querySelectorAll('[data-action="wf-rep"]').forEach((b) => b.classList.toggle('on', b === el));
});
onAct('wf-client', () => pickClientThen('Which shop is it about?', (c) => { S.wf.client = { id: c.id, trade_name: c.trade_name }; goBack(); }));
onAct('wf-client-x', () => { S.wf.client = null; renderGiveForm(); });
onAct('wf-save', async (el) => {
  const F = S.wf;
  F.title = $('#wf-title').value.trim(); F.details = $('#wf-det').value.trim();
  F.date = $('#wf-date').value; F.time = $('#wf-time').value; F.orderNo = $('#wf-ord').value.trim();
  if (!F.title) { toast('Write what the work is.', 'err'); $('#wf-title').focus(); return; }
  if (!F.id && !F.to.length) { toast('Choose who will do it.', 'err'); return; }
  if (F.repeat && !F.date) { toast('Work that repeats needs a date.', 'err'); return; }
  const due = F.date ? new Date(F.date + 'T' + (F.time || '18:00') + ':00').toISOString() : null;
  let orderId = null;
  if (F.orderNo) {
    const n = parseInt(F.orderNo.replace(/\D/g, ''), 10);
    const { data: o } = n ? await db.from('orders').select('id').eq('order_no', n).maybeSingle() : { data: null };
    if (!o) { toast('There is no order ' + (n ? ordLabel(n) : F.orderNo) + '.', 'err'); return; }
    orderId = o.id;
  }
  const V = S.voice && S.voice.blob ? S.voice : null;
  if (S.voice && S.voice.rec) { toast('Stop the voice note first.', 'err'); return; }
  const add = (WO_ATT.give ? WO_ATT.give.list : []).slice();
  if (V) add.push({ blob: V.blob, name: 'voice-note.' + (/mp4/.test(V.blob.type) ? 'm4a' : /ogg/.test(V.blob.type) ? 'ogg' : 'webm'), type: woFileType(V.blob), size: V.blob.size, secs: V.secs, voice: true });
  el.disabled = true;
  const busy = busyOverlay(add.length ? 'Sending…' : 'Saving…');
  const fields = { title: F.title, details: F.details || null, due_at: due, urgent: !!F.urgent, client_id: F.client ? F.client.id : null, order_id: orderId, repeat: F.repeat || null };
  let batch = F.batch || null, ids = [], fails = 0;
  if (F.id) {
    const { error } = await db.rpc('task_edit', { p_id: F.id, p: fields });
    if (error) { busy.remove(); el.disabled = false; toast(woErr(error, 'Could not save — try again.'), 'err'); return; }
    ids = [F.id];
  } else {
    batch = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : null;
    const { data, error } = await db.rpc('task_give', { p: Object.assign({ to: F.to }, fields, batch ? { batch_id: batch } : {}) });
    if (error || !data) { busy.remove(); el.disabled = false; toast(woErr(error, 'Could not give the work — try again.'), 'err'); return; }
    batch = data.batch_id; ids = data.ids || [];
  }
  if (add.length || (F.id && F.keepChanged)) {
    const up = await woUpload('b/' + batch + '/', add);
    fails = up.fails;
    const files = (F.keep || []).concat(up.files).slice(0, 20);
    const r = await db.rpc('task_files', { p_batch: batch, p_files: files });
    if (r.error) fails = fails || 1;
  }
  busy.remove();
  S.voice = null;
  if (F.id) woAlert('edited', { task_id: F.id });
  else woAlert('given', { batch_id: batch });
  if (!F.id && typeof F.onGiven === 'function') { try { F.onGiven(ids, batch); } catch (e) { /* the work is given all the same */ } }   // e.g. a complaint (care.js)
  const n = F.id ? 0 : F.to.filter((x) => x !== S.me.id).length;
  toast(fails ? 'Saved — but a file could not be sent.' : F.id ? 'Changed ✓' : n ? (n === 1 ? 'Work given to ' + woFirst(F.to.find((x) => x !== S.me.id)) + ' ✓' : 'Work given to ' + n + ' people ✓') : 'Added to my work ✓', fails ? 'err' : 'ok');
  S.wf = null;
  goBack();
});
onAct('wo-give', () => giveWork({}));
/* from a shop's page or an order: the work is about that shop (and order) */
onAct('wo-give-for', async (el) => {
  let client = null;
  if (el.dataset.c) {
    const { data } = await db.from('clients').select('id, trade_name').eq('id', el.dataset.c).maybeSingle();
    if (data) client = { id: data.id, trade_name: data.trade_name };
  }
  giveWork({ client, orderNo: el.dataset.o || '' });
});
onAct('wo-edit', async (el) => {
  const { data: t } = await db.from('tasks').select('*, clients(id, trade_name), orders(order_no)').eq('id', el.dataset.id).maybeSingle();
  if (!t) return;
  const d = t.due_at ? new Date(t.due_at) : null;
  giveWork({ id: t.id, batch: t.batch_id, title: t.title, details: t.details || '', toName: woWho(t.given_to), urgent: !!t.urgent, repeat: t.repeat || '',
    date: d ? ymd(d) : '', time: d ? String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') : '',
    client: t.clients ? { id: t.clients.id, trade_name: t.clients.trade_name } : null, orderNo: t.orders ? String(t.orders.order_no) : '', keep: (t.files || []).slice() });
});
onAct('wo-again', async (el) => {
  const { data: t } = await db.from('tasks').select('*, clients(id, trade_name), orders(order_no)').eq('id', el.dataset.id).maybeSingle();
  if (!t) return;
  giveWork({ title: t.title, details: t.details || '', to: [t.given_to], urgent: !!t.urgent, repeat: '',
    client: t.clients ? { id: t.clients.id, trade_name: t.clients.trade_name } : null, orderNo: t.orders ? String(t.orders.order_no) : '' });
});

/* ---------------- the owner: work report ---------------- */
async function renderWorkReport() {
  const c = $('#content');
  S.wr = S.wr || { p: 'month' };
  const P = S.wr.p;
  const now = new Date();
  const from = P === 'last' ? dayStartISO(addMonths(monthStart(), -1)) : P === '30' ? new Date(now.getTime() - 30 * 86400000).toISOString() : dayStartISO(monthStart());
  const to = P === 'last' ? dayStartISO(monthStart()) : null;
  const chip = (v, label) => '<button class="' + (P === v ? 'on' : '') + '" data-action="wr-p" data-v="' + v + '">' + esc(label) + '</button>';
  c.innerHTML = '<div class="filter-chips">' + chip('month', 'This month') + chip('last', 'Last month') + chip('30', 'Last 30 days') + '</div><div id="wr-box">' + loadingHTML() + '</div>';
  let q = db.from('tasks').select('given_to, given_by, status, due_at, started_at, done_at, created_at').neq('status', 'cancelled').gte('created_at', from).limit(20000);
  if (to) q = q.lt('created_at', to);
  const [r, openR] = await Promise.all([q, db.from('tasks').select('given_to, due_at, status').in('status', WO_OPEN).limit(20000)]);
  const box = $('#wr-box');
  if (!box) return;
  if (r.error) { box.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  const per = new Map();
  const get = (id) => { if (!per.has(id)) per.set(id, { given: 0, done: 0, onTime: 0, late: 0, mins: 0, timed: 0, open: 0, lateNow: 0 }); return per.get(id); };
  (r.data || []).forEach((t) => {
    if (t.given_by === t.given_to) return;   // own lists are not counted
    const x = get(t.given_to);
    x.given++;
    if (t.done_at) {
      x.done++;
      if (t.due_at) { if (t.done_at <= t.due_at) x.onTime++; else x.late++; }
      if (t.started_at) { x.mins += Math.max(0, (new Date(t.done_at) - new Date(t.started_at)) / 60000); x.timed++; }
    }
  });
  ((openR && openR.data) || []).forEach((t) => { const x = get(t.given_to); x.open++; if (woLate(t)) x.lateNow++; });
  const rows = Array.from(per.entries()).map(([id, x]) => Object.assign({ id, name: nameOf(id) }, x)).sort((a, b) => b.given - a.given || a.name.localeCompare(b.name));
  box.innerHTML = rows.length ? rows.map((x) => '<div class="card wr-card"><div class="wr-h"><b class="noi18n">' + esc(x.name) + '</b>' +
      (x.lateNow ? '<span class="wo-urg">' + esc(x.lateNow + ' late now') + '</span>' : '') + '</div>' +
      '<div class="wr-nums">' +
      [[x.given, 'Given'], [x.done, 'Done'], [x.onTime, 'On time'], [x.late, 'Late'], [x.timed ? woTook(0, x.mins / x.timed * 60000) : '—', 'Average time'], [x.open, 'Open now']]
        .map((n) => '<div><b>' + esc(String(n[0])) + '</b><span>' + esc(n[1]) + '</span></div>').join('') + '</div></div>').join('')
    : '<div class="empty">No work given in this time.</div>';
}
onAct('wr-p', (el) => { S.wr.p = el.dataset.v; renderWorkReport(); });
onAct('wo-report', () => showSub('Work report', renderWorkReport));

/* ---------------- Export all data: the work ---------------- */
async function exportWorkData(pName, cName, today) {
  const rows = await fetchAll('tasks', 'created_at');
  const at = (x) => (x ? fmtExp(x) : '');
  downloadFile('bj-work-' + today + '.csv', buildCsv(
    ['Work', 'Details', 'Given by', 'Given to', 'Shop', 'Finish by', 'Urgent', 'Repeat', 'Status', 'Given on', 'Seen', 'Started', 'Finished', 'Time taken', 'Accepted', 'Sent back', 'Note on finishing', 'Files'],
    rows.map((t) => [t.title, t.details || '', pName.get(t.given_by) || '', pName.get(t.given_to) || '', cName.get(t.client_id) || '', at(t.due_at), t.urgent ? 'Yes' : '', t.repeat || '',
      t.status, at(t.created_at), at(t.seen_at), at(t.started_at), at(t.done_at), t.started_at && t.done_at ? woTook(t.started_at, t.done_at) : '', at(t.checked_at),
      t.back_count || '', t.done_note || '', ((t.files || []).length + (t.done_files || []).length) || ''])));
}
