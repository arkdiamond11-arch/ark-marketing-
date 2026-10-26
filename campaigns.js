/* ============================================================
   MESSAGES TO MANY SHOPS  (database update 08)
   New designs or a festival offer, sent on WhatsApp one shop at a
   time with one tap each. The message carries a link to a page with
   the photos (no login), so every shop sees them. The app remembers
   which shops already got it — on every phone.
   Photos go in the 'promo' folder, which anyone with the link can see.
   Loaded before app.js; uses its helpers only at call time.
   ============================================================ */
'use strict';

const CAMP_MAX_PHOTOS = 8;
const CAMP_WHO = [['all', 'All clients'], ['hot', 'Hot'], ['warm', 'Warm'], ['cold', 'Cold'], ['ordered', 'Ordered before'], ['lead', 'No order yet'], ['sleep', 'Sleeping']];
function campaignsOn() { return !!S.dbv8 && appOn('messages'); }
function showUrl(id) { return new URL('show.html#' + id, location.href).href; }
function promoUrl(path) { return String((window.APP_CONFIG || {}).SUPABASE_URL || '').replace(/\/$/, '') + '/storage/v1/object/public/promo/' + path.split('/').map(encodeURIComponent).join('/'); }
function campText(k) { return k.message + '\n\n' + (k.photo_paths && k.photo_paths.length ? 'See the photos: ' : 'More: ') + showUrl(k.id) + '\n— ' + bizName(); }

/* ---------------- the list ---------------- */
async function renderCampaigns() {
  const c = $('#content');
  if (!S.dbv8) { c.innerHTML = '<div class="notice">Messages to many shops need the database update (ark-update-08.sql).</div>'; return; }
  c.innerHTML = '<button class="btn btn-primary" data-action="camp-new" style="margin-bottom:12px">＋ New message</button>' +
    '<div class="notice">Write the message once, add photos of the new designs, choose the shops — then send it on WhatsApp one shop at a time with one tap each.</div>' +
    '<div id="camp-list">' + loadingHTML() + '</div>';
  const [kr, sr] = await Promise.all([
    db.from('campaigns').select('*').order('created_at', { ascending: false }).limit(100),
    fetchPaged(() => db.from('campaign_sends').select('campaign_id, sent_at').order('id', { ascending: true })).catch(() => []),
  ]);
  const box = $('#camp-list');
  if (!box) return;
  if (kr.error) { box.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  const list = kr.data || [];
  if (!list.length) { box.innerHTML = '<div class="empty"><div class="big">📣</div>No messages yet.</div>'; return; }
  const n = new Map();
  (sr || []).forEach((s) => { const x = n.get(s.campaign_id) || { all: 0, sent: 0 }; x.all++; if (s.sent_at) x.sent++; n.set(s.campaign_id, x); });
  box.innerHTML = '<div class="section-label">Messages</div>' + list.map((k) => {
    const x = n.get(k.id) || { all: 0, sent: 0 };
    return '<div class="list-item" data-action="camp-open" data-id="' + k.id + '"><div class="li-main">' +
      '<div class="li-title">' + esc(k.title) + '</div>' +
      '<div class="li-sub">' + esc(fmtD(k.created_at) + ' · ' + nameOf(k.created_by)) + '</div>' +
      '<div class="li-chips"><span class="chip ' + (x.all && x.sent === x.all ? 'chip-st-delivered' : 'chip-st-new') + '">' + esc(x.sent + ' of ' + x.all + ' sent') + '</span>' +
      (k.photo_paths && k.photo_paths.length ? '<span class="chip">' + esc(k.photo_paths.length === 1 ? '1 photo' : k.photo_paths.length + ' photos') + '</span>' : '') + '</div>' +
      '</div>' + (k.photo_paths && k.photo_paths[0] ? '<img class="camp-thumb" src="' + esc(promoUrl(k.photo_paths[0])) + '" alt="">' : '<div class="li-go">›</div>') + '</div>';
  }).join('');
}

/* ---------------- a new message ---------------- */
function campDefaultText() {
  return 'Namaste 🙏\nOur new designs are ready. Have a look at the photos — tell us which ones you like and we will send the details.';
}
function renderCampaignForm() {
  const F = S.campForm || (S.campForm = { title: '', message: campDefaultText(), photos: [], who: 'all', city: '' });
  const c = $('#content');
  c.innerHTML =
    '<div class="card">' +
    '<div class="field"><label>Title (only for you)</label><input type="text" id="cf-title" autocomplete="off" placeholder="e.g. Diwali designs" value="' + esc(F.title) + '"></div>' +
    '<div class="field" style="margin-bottom:2px"><label>Message</label><textarea id="cf-msg" style="min-height:120px">' + esc(F.message) + '</textarea>' +
    '<div class="hint">A link to the photos is added at the end, with your business name.</div></div>' +
    '</div>' +
    '<div class="section-label">Photos (' + F.photos.length + '/' + CAMP_MAX_PHOTOS + ')</div>' +
    '<div class="card"><div class="cf-photos" id="camp-photos">' +
    F.photos.map((p, i) => '<div class="cf-ph"><img src="' + URL.createObjectURL(p.blob) + '" alt=""><button type="button" class="cf-x" data-action="camp-ph-del" data-i="' + i + '" aria-label="Remove photo">✕</button></div>').join('') +
    (F.photos.length < CAMP_MAX_PHOTOS ? '<button type="button" class="cf-add" data-action="camp-ph-add">＋<span>Photo</span></button>' : '') + '</div></div>' +
    '<div class="section-label">Which shops?</div>' +
    '<div class="card"><div class="filter-chips camp-who">' + CAMP_WHO.map((x) => '<button class="' + (F.who === x[0] ? 'on' : '') + '" data-action="camp-who" data-v="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>' +
    '<div class="field" style="margin:8px 0 0"><label>City</label><select id="cf-city"><option value="">All cities</option></select></div>' +
    '<div class="camp-count" id="camp-count">…</div></div>' +
    '<button class="btn btn-primary" data-action="camp-save" id="camp-save">Save and start sending</button><div style="height:10px"></div>';
  const keep = () => { F.title = $('#cf-title').value; F.message = $('#cf-msg').value; };
  $('#cf-title').addEventListener('input', keep);
  $('#cf-msg').addEventListener('input', keep);
  campAudience().then((A) => {
    const sel = $('#cf-city');
    if (!sel) return;
    sel.innerHTML = '<option value="">All cities</option>' + A.cities.map((x) => '<option value="' + esc(x) + '"' + (x === F.city ? ' selected' : '') + '>' + esc(x) + '</option>').join('');
    sel.onchange = () => { F.city = sel.value; campCount(); };
    campCount();
  });
}

/* the clients and their orders, for choosing the shops (kept for a minute) */
async function campAudience() {
  if (S.campAud && Date.now() - S.campAud.at < 60000) return S.campAud;
  const [clients, orders] = await Promise.all([
    fetchPaged(() => db.from('clients').select('id, trade_name, contact_person, city, mobile, interest, category').order('trade_name', { ascending: true }).order('id', { ascending: true })),
    fetchPaged(() => db.from('orders').select('client_id, status, order_date').order('id', { ascending: true })),
  ]);
  const norm = (x) => String(x || '').trim().replace(/\s+/g, ' ');
  const cities = Array.from(new Set(clients.map((c) => norm(c.city)).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  S.campAud = { at: Date.now(), clients, orders, cities, norm };
  return S.campAud;
}
function campPick(A, who, city) {
  const live = new Set(A.orders.filter(isLive).map((o) => o.client_id));
  const sleep = who === 'sleep' && typeof sleepingClients === 'function' ? new Set(sleepingClients(A.clients, A.orders, 2).map((r) => r.c.id)) : null;
  return A.clients.filter((c) => {
    if (city && A.norm(c.city).toLowerCase() !== city.toLowerCase()) return false;
    if (who === 'hot' || who === 'warm' || who === 'cold') return String(c.interest || '').toLowerCase() === who;
    if (who === 'ordered') return live.has(c.id);
    if (who === 'lead') return !live.has(c.id);
    if (who === 'sleep') return sleep.has(c.id);
    return true;
  });
}
async function campCount() {
  const el = $('#camp-count');
  if (!el) return;
  const F = S.campForm;
  const A = await campAudience();
  const list = campPick(A, F.who, F.city);
  const withMobile = list.filter((c) => isIndianMobile(normMobile(c.mobile))).length;
  if (!$('#camp-count')) return;
  el.textContent = list.length === withMobile ? list.length + (list.length === 1 ? ' shop' : ' shops')
    : withMobile + ' shops with a mobile number, ' + (list.length - withMobile) + ' without';
}

function campAddPhoto() {
  const F = S.campForm;
  if (!F || F.photos.length >= CAMP_MAX_PHOTOS) return;
  const ov = openModal('<h3>Add a photo</h3><p>A design you want the shops to see.</p>' +
    '<div style="display:flex;flex-direction:column;gap:10px"><button class="btn btn-primary" data-m="cam">📷 Take photo</button>' +
    '<button class="btn btn-secondary" data-m="gal">🖼️ Choose from gallery</button></div>');
  const go = (gal) => {
    closeModal();
    pickImage(async (file) => {
      const p = await photoFromFile(file, 'Design photo');
      if (!p || !S.campForm) return;
      S.campForm.photos.push(p);
      renderCampaignForm();
    }, gal);
  };
  ov.querySelector('[data-m=cam]').onclick = () => go(false);
  ov.querySelector('[data-m=gal]').onclick = () => go(true);
}

async function saveCampaign() {
  const F = S.campForm;
  if (!F) return;
  F.title = $('#cf-title').value.trim();
  F.message = $('#cf-msg').value.trim();
  if (!F.title) { toast('Give the message a title.', 'err'); return; }
  if (!F.message) { toast('Write the message.', 'err'); return; }
  const A = await campAudience();
  const shops = campPick(A, F.who, F.city);
  if (!shops.length) { toast('No shop matches — choose other shops.', 'err'); return; }
  const btn = $('#camp-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  const fail = (msg) => { if (btn) { btn.disabled = false; btn.textContent = 'Save and start sending'; } toast(msg || 'Could not save — try again.', 'err'); };
  const { data: k, error } = await db.from('campaigns').insert({ title: F.title, message: F.message, created_by: S.me.id }).select('*').single();
  if (error || !k) { fail(); return; }
  const paths = [];
  for (let i = 0; i < F.photos.length; i++) {
    const path = k.id + '/' + (i + 1) + '-' + Date.now() + '.jpg';
    const r = await db.storage.from('promo').upload(path, F.photos[i].blob, { contentType: 'image/jpeg' });
    if (!r.error) paths.push(path);
  }
  if (paths.length) await db.from('campaigns').update({ photo_paths: paths }).eq('id', k.id);
  const rows = shops.map((c) => ({ campaign_id: k.id, client_id: c.id }));
  for (let i = 0; i < rows.length; i += 500) {
    const r = await db.from('campaign_sends').insert(rows.slice(i, i + 500));
    if (r.error) { fail('Saved, but the shop list could not be saved — open the message again.'); return; }
  }
  if (paths.length < F.photos.length) toast('Saved — but ' + (F.photos.length - paths.length) + ' photo(s) could not be uploaded.', 'err');
  else toast('Saved ✓ — now send it to each shop', 'ok');
  S.campForm = null;
  showSub(k.title, () => renderCampaign(k.id), true);
}

/* ---------------- one message: send it shop by shop ---------------- */
async function renderCampaign(id) {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const [kr, sr] = await Promise.all([
    db.from('campaigns').select('*').eq('id', id).maybeSingle(),
    fetchPaged(() => db.from('campaign_sends').select('id, client_id, sent_at, sent_by, clients(trade_name, contact_person, city, mobile)').eq('campaign_id', id).order('id', { ascending: true })),
  ]).catch(() => [{ error: true }, []]);
  if (kr.error || !kr.data) { c.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  const k = kr.data;
  S.camp = { k, rows: sr || [], show: (S.camp && S.camp.k.id === id && S.camp.show) || 'todo' };
  drawCampaign();
}
function drawCampaign() {
  const C = S.camp, k = C.k, c = $('#content');
  if (!c) return;
  const ok = (r) => isIndianMobile(normMobile(r.clients && r.clients.mobile));
  const sent = C.rows.filter((r) => r.sent_at).length, todo = C.rows.filter((r) => !r.sent_at && ok(r));
  const list = C.show === 'sent' ? C.rows.filter((r) => r.sent_at) : C.show === 'all' ? C.rows : todo;
  const chip = (v, label) => '<button class="' + (C.show === v ? 'on' : '') + '" data-action="camp-show" data-v="' + v + '">' + label + '</button>';
  c.innerHTML =
    '<div class="card camp-head">' +
    (k.photo_paths && k.photo_paths.length ? '<div class="camp-strip">' + k.photo_paths.map((p) => '<img src="' + esc(promoUrl(p)) + '" alt="">').join('') + '</div>' : '') +
    '<div class="camp-msg noi18n">' + esc(k.message) + '</div>' +
    '<div class="photo-row"><a class="btn btn-small btn-secondary" href="' + esc(showUrl(k.id)) + '" target="_blank" rel="noopener">See the page the shops get</a>' +
    (S.me.role === 'owner' || k.created_by === S.me.id ? '<button class="btn btn-small btn-ghost" data-action="camp-del" data-id="' + k.id + '">Delete</button>' : '') + '</div></div>' +
    '<div class="camp-prog"><b>' + esc(sent + ' of ' + C.rows.length + ' sent') + '</b><div class="pg-bar"><i class="' + (sent === C.rows.length ? 'done' : 'ok') + '" style="width:' +
    (C.rows.length ? Math.round(sent / C.rows.length * 100) : 0) + '%"></i></div></div>' +
    '<div class="filter-chips">' + chip('todo', 'To send (' + todo.length + ')') + chip('sent', 'Sent (' + sent + ')') + chip('all', 'All (' + C.rows.length + ')') + '</div>' +
    (list.length ? list.map((r) => {
      const cl = r.clients || {};
      return '<div class="list-item camp-row' + (r.sent_at ? ' sent' : '') + '" data-action="open-client" data-id="' + r.client_id + '"><div class="li-main">' +
        '<div class="li-title">' + esc(cl.trade_name || '') + '</div>' +
        '<div class="li-sub">' + esc([cl.contact_person, cl.city].filter(Boolean).join(' · ')) + '</div>' +
        (r.sent_at ? '<div class="li-when">' + esc('Sent ' + fmtD(r.sent_at) + ', ' + fmtTime(r.sent_at) + (r.sent_by ? ' · ' + String(nameOf(r.sent_by)).split(' ')[0] : '')) + '</div>' : '') +
        '</div>' +
        (r.sent_at ? '<button type="button" class="camp-again" data-action="camp-send" data-id="' + r.id + '">Again</button>'
          : ok(r) ? '<button type="button" class="camp-send" data-action="camp-send" data-id="' + r.id + '">' + WA_SVG + '<span>Send</span></button>'
            : '<span class="camp-nomob">No mobile</span>') + '</div>';
    }).join('') : '<div class="empty">' + (C.show === 'todo' ? (C.rows.length ? '🎉 Sent to every shop.' : 'No shops in this list.') : 'Nothing here yet.') + '</div>');
}

/* one tap: WhatsApp opens with the message for this shop; it is marked as sent */
async function campSend(rowId) {
  const C = S.camp;
  const r = C && C.rows.find((x) => x.id === rowId);
  if (!r) return;
  const cl = r.clients || {};
  window.open(waUrl(cl.mobile, campText(C.k)), '_blank');
  if (r.sent_at) return;   // "Again": nothing to record
  const now = new Date().toISOString();
  const { error } = await db.from('campaign_sends').update({ sent_at: now, sent_by: S.me.id }).eq('id', rowId).is('sent_at', null);
  if (error) { toast('Sent, but it could not be marked — try again.', 'err'); return; }
  r.sent_at = now; r.sent_by = S.me.id;
  drawCampaign();
}

function deleteCampaign(id) {
  confirmModal('Delete this message?', 'The list of who got it and its photos will be removed. Shops who already got the link will not see the photos any more.', 'Delete', async () => {
    const C = S.camp;
    const paths = (C && C.k.photo_paths) || [];
    const { error } = await db.from('campaigns').delete().eq('id', id);
    if (error) { toast('Could not delete — try again.', 'err'); return; }
    if (paths.length) db.storage.from('promo').remove(paths).then(() => {}, () => {});
    toast('Deleted', 'ok');
    backOne();
  }, true);
}

onAct('camp-open-list', () => showSub('Messages to shops', renderCampaigns));
onAct('camp-new', () => { S.campForm = null; S.campAud = null; showSub('New message', renderCampaignForm); });
onAct('camp-open', (el) => { const t = el.querySelector('.li-title'); showSub(t ? t.textContent : 'Message', () => renderCampaign(el.dataset.id)); });
onAct('camp-who', (el) => { if (!S.campForm) return; S.campForm.who = el.dataset.v; document.querySelectorAll('[data-action="camp-who"]').forEach((b) => b.classList.toggle('on', b === el)); campCount(); });
onAct('camp-ph-add', () => campAddPhoto());
onAct('camp-ph-del', (el) => { if (!S.campForm) return; S.campForm.photos.splice(+el.dataset.i, 1); renderCampaignForm(); });
onAct('camp-save', () => saveCampaign());
onAct('camp-show', (el) => { if (!S.camp) return; S.camp.show = el.dataset.v; drawCampaign(); });
onAct('camp-send', (el) => campSend(el.dataset.id));
onAct('camp-del', (el) => deleteCampaign(el.dataset.id));
