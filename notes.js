/* ============================================================
   CLIENT NOTES — anything to remember about a client, typed or
   spoken. 🎤 Speak uses the phone's own speech recognition
   (English, हिन्दी, ગુજરાતી). Notes show on the client page
   (newest first), under each client in the Clients list, and
   the Clients search also looks inside notes. A note can be
   deleted by the person who wrote it, or by the owner.
   The same 🎤 Speak button is on the meeting form.
   Needs database update 06 (client_notes); until it is run,
   S.dbv6 is false and the notes box stays hidden.
   ============================================================ */
'use strict';

/* ---------------- speaking instead of typing ---------------- */
const DICT_LANGS = [['en-IN', 'English'], ['hi-IN', 'हिन्दी'], ['gu-IN', 'ગુજરાતી']];
let DICT = null;   // the dictation running now: { rec, btn, ended }

function dictSupported() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }
function dictLang() {
  let l = '';
  try { l = localStorage.getItem('dictLang') || ''; } catch (_) { /* private mode */ }
  if (DICT_LANGS.some((x) => x[0] === l)) return l;
  return LANG === 'hi' ? 'hi-IN' : LANG === 'gu' ? 'gu-IN' : 'en-IN';
}

/* the row under a text box: [🎤 Speak] [language] Listening… */
function dictRowHTML(taId) {
  if (!dictSupported()) return '<div class="mic-hint">' + IC.mic + ' Tip: tap the mic on your keyboard and just speak.</div>';
  const cur = dictLang();
  return '<div class="dict-row">' +
    '<button type="button" class="btn btn-small btn-secondary dict-btn" data-action="dict" data-ta="' + esc(taId) + '">' + IC.mic + ' <span>Speak</span></button>' +
    '<select class="dict-lang noi18n" aria-label="Language">' +
    DICT_LANGS.map((x) => '<option value="' + x[0] + '"' + (x[0] === cur ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select>' +
    '<span class="dict-status"></span></div>';
}

function dictErrMsg(code) {
  if (code === 'not-allowed' || code === 'service-not-allowed') return 'Allow the microphone for this app (in the browser settings), then try again.';
  if (code === 'no-speech') return 'Did not hear anything — tap Speak and talk.';
  if (code === 'audio-capture') return 'No microphone found on this phone.';
  if (code === 'network') return 'Speaking needs the internet — type it instead.';
  if (code === 'language-not-supported') return 'This language is not available for speaking on this phone — try English.';
  return 'Could not listen — try again.';
}

/* start listening (or stop, if this button is already listening). Words go at the end of the text box. */
function toggleDict(btn) {
  if (DICT && DICT.btn === btn) { stopDict(); return; }
  if (DICT) { try { DICT.rec.abort(); } catch (_) { /* gone */ } DICT = null; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const ta = document.getElementById(btn.dataset.ta);
  if (!ta) return;
  if (!SR) { toast('Speaking is not available here — use the mic on your keyboard.', 'err'); return; }
  const row = btn.closest('.dict-row');
  const sel = row && row.querySelector('.dict-lang');
  const st = row && row.querySelector('.dict-status');
  const lang = (sel && sel.value) || dictLang();
  try { localStorage.setItem('dictLang', lang); } catch (_) { /* private mode */ }
  let rec;
  try { rec = new SR(); } catch (_) { toast('Speaking is not available here — use the mic on your keyboard.', 'err'); return; }
  rec.lang = lang;
  rec.interimResults = true;
  rec.continuous = false;          // stops by itself after a pause — tap Speak again to add more
  rec.maxAlternatives = 1;
  const base = ta.value.replace(/\s+$/, '');
  let endIt = null;
  const me = { rec, btn, ended: new Promise((r) => { endIt = r; }) };
  const ui = (on) => {
    btn.classList.toggle('on', on);
    const lbl = btn.querySelector('span');
    if (lbl) lbl.textContent = on ? 'Stop' : 'Speak';
    if (st) st.textContent = on ? 'Listening…' : '';
  };
  rec.onresult = (ev) => {
    if (!document.body.contains(ta)) { try { rec.abort(); } catch (_) { /* gone */ } return; }
    let said = '';
    for (let i = 0; i < ev.results.length; i++) said += ev.results[i][0].transcript;
    said = said.replace(/\s+/g, ' ').trim();
    if (!said) return;
    if (!base || /[.!?।]$/.test(base)) said = said.charAt(0).toUpperCase() + said.slice(1);   // a new sentence
    ta.value = base ? base + ' ' + said : said;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  };
  rec.onerror = (ev) => { const c = ev && ev.error; if (c !== 'aborted') toast(dictErrMsg(c), 'err'); };
  rec.onend = () => { ui(false); if (DICT === me) DICT = null; endIt(); };
  DICT = me;
  try { rec.start(); } catch (_) { DICT = null; ui(false); endIt(); toast('Could not start the mic — try again.', 'err'); return; }
  ui(true);
}

/* stop listening; resolves once the last words are in the text box (or after 1.5 s) */
function stopDict() {
  const d = DICT;
  if (!d) return Promise.resolve();
  try { d.rec.stop(); } catch (_) { /* already stopped */ }
  return Promise.race([d.ended, new Promise((r) => setTimeout(r, 1500))]);
}

/* ---------------- notes on the client page ---------------- */
async function loadClientNotes(cl) {
  const el = $('#client-notes');
  if (!el) return;
  if (!S.dbv6) { el.innerHTML = ''; return; }
  const { data, error } = await db.from('client_notes').select('*').eq('client_id', cl.id).order('created_at', { ascending: false }).limit(300);
  if (!$('#client-notes')) return;
  if (error) { el.innerHTML = ''; return; }
  const all = !!(S.cnotes && S.cnotes.cl.id === cl.id && S.cnotes.all);
  S.cnotes = { cl, rows: data || [], all };
  drawClientNotes();
}

function drawClientNotes() {
  const el = $('#client-notes');
  const N = S.cnotes;
  if (!el || !N) return;
  const isOwner = S.me && S.me.role === 'owner';
  const show = N.all ? N.rows : N.rows.slice(0, 5);
  el.innerHTML =
    '<div class="section-label">Notes' + (N.rows.length ? ' (' + N.rows.length + ')' : '') + '</div>' +
    '<div class="card cn-card">' +
    '<div class="cn-add">' +
    '<button class="btn btn-small btn-secondary" data-action="cn-add">✎ Write note</button>' +
    (dictSupported() ? '<button class="btn btn-small btn-secondary" data-action="cn-add" data-speak="1">' + IC.mic + ' Speak note</button>' : '') +
    '</div>' +
    (show.length ? show.map((n) =>
      '<div class="cn-row">' +
      '<div class="cn-body noi18n">' + esc(n.body) + '</div>' +
      '<div class="cn-meta"><span>' + esc(nameOf(n.created_by)) + ' · ' + esc(fmtDT(n.created_at)) + '</span>' +
      (n.created_by === S.me.id || isOwner ? '<button type="button" class="cn-del" data-action="cn-del" data-id="' + n.id + '" aria-label="Delete note">✕</button>' : '') +
      '</div></div>').join('')
      : '<div class="hint" style="margin-top:10px">Anything to remember about this client — what they like, what they asked for, family, festivals… Type it or speak it.</div>') +
    (N.rows.length > show.length ? '<button class="btn btn-small btn-ghost" data-action="cn-all">Show all ' + N.rows.length + ' notes</button>' : '') +
    '</div>';
}

function openClientNoteModal(speak) {
  const N = S.cnotes;
  if (!N) return;
  const ov = openModal('<h3>Note — ' + esc(N.cl.trade_name) + '</h3>' +
    '<div class="field"><textarea id="cn-text" style="min-height:110px" placeholder="Type here, or tap Speak and talk…"></textarea>' + dictRowHTML('cn-text') + '</div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Save note</button></div>');
  const mic = ov.querySelector('.dict-btn');
  if (mic) mic.onclick = () => toggleDict(mic);   // modals are outside the screen's tap handler
  ov.querySelector('[data-m=no]').onclick = () => { if (DICT) { try { DICT.rec.abort(); } catch (_) { /* gone */ } } closeModal(); };
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    await stopDict();
    const body = ($('#cn-text') ? $('#cn-text').value : '').trim();
    if (!body) { b.disabled = false; toast('Type or speak the note first.', 'err'); return; }
    const { error } = await db.from('client_notes').insert({ client_id: N.cl.id, body, created_by: S.me.id });
    if (error) { b.disabled = false; toast('Could not save — try again.', 'err'); return; }
    closeModal();
    toast('Note saved ✓', 'ok');
    loadClientNotes(N.cl);
  };
  if (speak && mic) toggleDict(mic);
  else setTimeout(() => { const t = $('#cn-text'); if (t) t.focus(); }, 60);
}

onAct('cn-add', (el) => openClientNoteModal(el.dataset.speak === '1'));
onAct('cn-all', () => { if (S.cnotes) { S.cnotes.all = true; drawClientNotes(); } });
onAct('cn-del', (el) => confirmModal('Delete this note?', 'It will be removed for everyone.', 'Delete', async () => {
  const { data, error } = await db.from('client_notes').delete().eq('id', el.dataset.id).select('id');
  if (error) { toast('Could not delete — try again.', 'err'); return; }
  if (!data || !data.length) { toast('Only the person who wrote it, or the owner, can delete this note.', 'err'); return; }
  toast('Note deleted', 'ok');
  if (S.cnotes) loadClientNotes(S.cnotes.cl);
}, true));
onAct('dict', (el) => toggleDict(el));

/* ---------------- notes in the Clients list and search ---------------- */
/* clients whose notes mention the search words (not already found by name / mobile / city) */
async function clientsFromNotes(q, haveIds) {
  if (!S.dbv6 || !q) return [];
  const { data, error } = await db.from('client_notes').select('client_id').ilike('body', '%' + q + '%').limit(200);
  if (error || !data) return [];
  const have = new Set(haveIds);
  const ids = Array.from(new Set(data.map((n) => n.client_id))).filter((id) => !have.has(id)).slice(0, 40);
  if (!ids.length) return [];
  const r = await db.from('clients').select('id, trade_name, company_name, contact_person, city, area, category, interest, mobile').in('id', ids);
  return r.data || [];
}

/* under each client in a list: the newest note (or, when searching, the note that matches) */
async function fillClientNoteSnippets(box, ids, q, stillCurrent) {
  if (!S.dbv6 || !box || !ids.length) return;
  const { data, error } = await db.from('client_notes').select('client_id, body, created_at').in('client_id', ids)
    .order('created_at', { ascending: false }).limit(500);
  if (error || !data || !data.length || !document.body.contains(box) || (stillCurrent && !stillCurrent())) return;
  const want = String(q || '').toLowerCase();
  const pick = new Map();
  data.forEach((n) => {
    const hit = want && n.body.toLowerCase().indexOf(want) > -1;
    const cur = pick.get(n.client_id);
    if (!cur || (hit && !cur.hit)) pick.set(n.client_id, { body: n.body, hit });
  });
  box.querySelectorAll('[data-action="open-client"][data-id]').forEach((li) => {
    const p = pick.get(li.dataset.id);
    const main = li.querySelector('.li-main');
    if (!p || !main || main.querySelector('.li-note')) return;
    const d = document.createElement('div');
    d.className = 'li-note noi18n';
    d.textContent = '📝 ' + p.body.replace(/\s+/g, ' ');
    main.appendChild(d);
  });
}

/* ---------------- owner backup (More → Export all data) ---------------- */
async function exportNotesData(pName, cName, today) {
  if (!S.dbv6) return;
  const rows = await fetchAll('client_notes', 'created_at');
  await new Promise((r) => setTimeout(r, 450));
  downloadFile('bj-client-notes-' + today + '.csv', buildCsv(['Client', 'Note', 'Written by', 'Written on'],
    rows.map((n) => [cName.get(n.client_id) || '', n.body, pName.get(n.created_by) || '', fmtExp(n.created_at)])));
}
