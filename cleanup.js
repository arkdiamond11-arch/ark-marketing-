/* ============================================================
   CLIENTS SAVED TWICE · MERGE · DELETED CLIENTS
   · Adding a client: a warning when a shop with the same name is
     already saved in the same city (the mobile number was already
     checked) — and before saving, "Already saved?" with Open client.
   · Merge (database update 11, merge_clients): everything saved for
     one copy moves to the client you keep; its phone numbers and any
     details missing there are added; the copy goes to the bin.
     The owner, and team members the owner allows to delete clients.
   · Deleted clients (the owner, update 11): every deleted client is
     kept for 30 days — bring it back with its meetings, follow-ups,
     notes and payment dates.
   Loaded before app.js; uses its helpers only at call time.
   ============================================================ */
'use strict';

/* "Suvarna  Nagari." and "suvarna nagari" are the same shop */
function shopKey(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9ऀ-૿]+/g, ''); }

/* other clients with this name in this city (a client without a city counts as the same city) */
async function findSameShop(name, city, exceptId) {
  const key = shopKey(name);
  if (key.length < 3) return [];
  const word = String(name || '').trim().split(/\s+/)[0].replace(/[%_\\,()*]/g, '');
  if (word.length < 2) return [];
  const { data, error } = await db.from('clients').select('id, trade_name, city, area, mobile, contact_person, created_at')
    .ilike('trade_name', '%' + word + '%').limit(300);
  if (error) return [];
  const ck = shopKey(city);
  return (data || []).filter((c) => c.id !== exceptId && shopKey(c.trade_name) === key &&
    (!ck || !shopKey(c.city) || shopKey(c.city) === ck));
}
function sameShopRows(list, btn) {
  return list.slice(0, 4).map((c) => '<div class="dup-row"><span><b class="noi18n">' + esc(c.trade_name) + '</b>' +
    '<small class="noi18n">' + esc([c.contact_person, c.area, c.city, c.mobile].filter(Boolean).join(' · ')) + '</small>' +
    '<small>' + esc('Added ' + fmtD(c.created_at)) + '</small></span>' + btn(c) + '</div>').join('');
}

/* the client form: the warning under the name, when the name or the city is filled in */
function watchSameShop(exceptId) {
  const nameEl = $('#f-company'), cityEl = $('#f-city');
  if (!nameEl || !$('#name-note')) return;
  let seq = 0;
  const run = async () => {
    const my = ++seq;
    const list = await findSameShop(nameEl.value, cityEl ? cityEl.value : '', exceptId);
    const note = $('#name-note');
    if (my !== seq || !note) return;
    note.innerHTML = list.length ? '<div class="dup">⚠ Already saved in this city:' +
      sameShopRows(list, (c) => '<a href="#" data-action="open-client" data-id="' + c.id + '">Open that client</a>') + '</div>' : '';
  };
  nameEl.addEventListener('blur', run);
  if (cityEl) cityEl.addEventListener('blur', () => setTimeout(run, 250));   // after a city is picked from the list
  if (nameEl.value.trim()) run();
}

/* before a new client is saved: the same shop already there? → open it, or save anyway */
async function sameShopCheck(name, city, go) {
  let list = [];
  try { list = await findSameShop(name, city, null); } catch (e) { list = []; }
  if (!list.length) { go(); return; }
  const ov = openModal('<h3>Already saved?</h3>' +
    '<p>A shop with this name is already saved in this city. Open it instead of saving it twice — or save anyway if it is a different shop.</p>' +
    '<div class="dup-list">' + sameShopRows(list, (c) => '<button class="btn btn-small btn-secondary" data-open="' + c.id + '">Open client</button>') + '</div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button>' +
    '<button class="btn btn-primary" data-m="yes">Save anyway</button></div>');
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = () => { closeModal(); go(); };
  ov.querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => { closeModal(); openClient(b.dataset.open); }; });
}

/* ---------------- merge ---------------- */
function mergeOn() { return !!S.dbv11 && typeof canDeleteClients === 'function' && canDeleteClients(); }
function mergeErrText(e) {
  const m = String((e && e.message) || '');
  if (/only the owner can merge it/.test(m)) return 'This copy has orders or account entries — only the owner can merge it.';
  if (/Only the owner/.test(m)) return 'You are not allowed to merge clients — ask the owner.';
  if (/not found/.test(m)) return 'One of the two clients is not there any more.';
  return 'Could not merge — try again.';
}

/* "Merge with another client" on a client's page: choose the copy to keep */
async function mergePick(dupId) {
  const dup = await fetchClient(dupId);
  if (!dup) return;
  const twins = typeof clientTwins === 'function' ? await clientTwins(dup) : [];
  const ov = openModal('<h3>Merge with another client</h3>' +
    '<p>Choose the copy to keep. Everything saved for this one moves there.</p>' +
    '<div class="cd-name">' + clientIdHTML(dup) + '</div>' +
    '<div class="field" style="margin-bottom:8px"><input type="text" id="mg-q" placeholder="Search name, mobile, city…" autocomplete="off"></div>' +
    '<div id="mg-list" class="mg-list"></div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button></div>');
  ov.querySelector('.modal').classList.add('mg-modal');
  ov.querySelector('[data-m=no]').onclick = closeModal;
  const draw = (list, label) => {
    const el = ov.querySelector('#mg-list');
    if (!el) return;
    el.innerHTML = list.length
      ? (label ? '<div class="cd-tl">' + esc(label) + '</div>' : '') + list.map((c) => '<div class="cd-twin"><div>' + clientIdHTML(c) + '</div>' +
        '<button class="btn btn-small btn-primary" data-keep="' + esc(c.id) + '">Keep this one</button></div>').join('')
      : '<div class="empty" style="padding:10px">' + esc(label === null ? 'No client matches.' : 'Search for the copy to keep.') + '</div>';
    el.querySelectorAll('[data-keep]').forEach((b) => { b.onclick = () => { closeModal(); mergeAsk(dupId, b.dataset.keep); }; });
  };
  draw(twins, twins.length ? 'Also saved with the same name or mobile' : '');
  let timer = null, seq = 0;
  ov.querySelector('#mg-q').addEventListener('input', (e) => {
    clearTimeout(timer);
    const q = e.target.value.trim().replace(/[,%()*\\]/g, ' ').trim();
    timer = setTimeout(async () => {
      const my = ++seq;
      if (!q) { draw(twins, twins.length ? 'Also saved with the same name or mobile' : ''); return; }
      const pat = '%' + q + '%';
      const { data } = await db.from('clients').select('id, trade_name, city, mobile, area, contact_person')
        .or('trade_name.ilike.' + pat + ',mobile.ilike.' + pat + ',city.ilike.' + pat + ',contact_person.ilike.' + pat)
        .neq('id', dupId).limit(30);
      if (my === seq) draw(data || [], null);
    }, 280);
  });
}

/* merge dup into keep — after showing what moves */
async function mergeAsk(dupId, keepId) {
  if (!S.dbv11) { toast('Merging needs the database update (ark-update-08-to-11.sql).', 'err'); return; }
  const [dup, keep] = await Promise.all([fetchClient(dupId), fetchClient(keepId)]);
  if (!dup || !keep) return;
  let links = [];
  try { links = typeof clientLinks === 'function' ? await clientLinks(dupId) : []; } catch (e) { links = []; }
  const ov = openModal('<h3>Merge these two?</h3>' +
    '<div class="mg-side"><span>Keep</span><div class="cd-name">' + clientIdHTML(keep) + '</div></div>' +
    '<div class="mg-side"><span>Remove</span><div class="cd-name mg-dup">' + clientIdHTML(dup) + '</div></div>' +
    '<p class="cd-with">' + esc(links.length ? 'Moves to the one you keep: ' + links.map((x) => x.label).join(' · ') : 'Nothing else is saved for the copy.') + '</p>' +
    '<p>Its phone numbers and any details missing there are added. The copy then goes to Deleted clients for 30 days.</p>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button>' +
    '<button class="btn btn-primary" data-m="yes">Merge</button></div>');
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    e.target.disabled = true;
    const { error } = await db.rpc('merge_clients', { p_dup: dupId, p_keep: keepId });
    if (error) { e.target.disabled = false; toast(mergeErrText(error), 'err'); return; }
    closeModal();
    toast('Merged ✓ — ' + (keep.trade_name || ''), 'ok');
    S.lastMet = null; S.leadCache = null; S.vpData = null; S.currentClientId = null;
    openClient(keepId, true);   // the kept client takes the copy's place
  };
}

/* ---------------- Deleted clients (the owner) ---------------- */
function binOn() { return !!S.dbv11 && isOwner(); }
async function renderBin() {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const { data, error } = await db.rpc('client_bin_list');
  if (!$('#content') || !S.sub.length || S.sub[S.sub.length - 1].title !== 'Deleted clients') return;
  if (error) { c.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  const rows = data || [];
  S.binRows = rows;
  const saved = (r) => [[r.meetings, 'meeting', 'meetings'], [r.followups, 'follow-up', 'follow-ups'], [r.notes, 'note', 'notes'], [r.pay_dates, 'payment date', 'payment dates']]
    .filter((x) => x[0] > 0).map((x) => x[0] + ' ' + (x[0] === 1 ? x[1] : x[2])).join(' · ');
  c.innerHTML = '<div class="hint" style="margin:2px 2px 12px">Clients deleted in the last 30 days. Bring one back with its meetings, follow-ups, notes and payment dates.</div>' +
    (rows.length ? rows.map((r, i) => '<div class="card bin-item">' +
      '<div class="bin-main"><b class="noi18n">' + esc(r.trade_name || '') + '</b>' +
      '<span class="noi18n">' + esc([r.city, r.mobile].filter(Boolean).join(' · ')) + '</span>' +
      (r.note ? '<span class="bin-note">' + esc(r.note) + '</span>' : '') +
      '<small>' + esc('Deleted by') + ' <span class="noi18n">' + esc(r.deleted_by_name || '—') + '</span> · ' + esc(fmtDT(r.deleted_at)) + '</small>' +
      (saved(r) ? '<small>' + esc('Deleted with it: ' + saved(r)) + '</small>' : '') + '</div>' +
      '<button class="btn btn-small btn-secondary" data-action="bin-back" data-idx="' + i + '">Bring back</button></div>').join('')
      : '<div class="empty"><div class="big">🗑️</div>No deleted clients in the last 30 days.</div>');
}
async function binRestore(binId, clientId, quiet) {
  const { error } = await db.rpc('client_restore', { p_bin: binId });
  if (error) {
    toast(/already back/.test(String(error.message || '')) ? 'This client is already back.' : 'Could not bring it back — try again.', 'err');
    return false;
  }
  S.lastMet = null; S.leadCache = null; S.vpData = null;
  toast('Client is back ✓', 'ok');
  if (!quiet) openClient(clientId);
  return true;
}
/* the owner just deleted a client: Undo brings it back */
function binUndo(clientId) {
  if (!binOn() || typeof showUndo !== 'function') return;
  showUndo('Client deleted', async () => {
    const { data } = await db.rpc('client_bin_list');
    const r = (data || []).find((x) => x.client_id === clientId);
    if (!r) { toast('Could not bring it back — see More → Deleted clients.', 'err'); return; }
    if (await binRestore(r.bin_id, clientId, true)) openClient(clientId);
  });
}

onAct('cl-merge', (el) => mergePick(el.dataset.id));
onAct('bin-open', () => showSub('Deleted clients', renderBin));
onAct('bin-back', (el) => {
  const r = S.binRows && S.binRows[+el.dataset.idx];
  if (!r) return;
  confirmModal('Bring this client back?', 'It comes back with its meetings, follow-ups, notes and payment dates.', 'Bring back', async () => {
    if (await binRestore(r.bin_id, r.client_id, true)) openClient(r.client_id);   // Back shows the bin without it
  });
});
