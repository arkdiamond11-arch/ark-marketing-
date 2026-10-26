/* ============================================================
   WISHES — birthdays and anniversaries of your clients
   (database update 08). Only the day and the month are kept.
   On the day, Today shows who to wish, with a greeting ready to
   send on WhatsApp; the app remembers who was already wished.
   Loaded before app.js; uses its helpers only at call time.
   ============================================================ */
'use strict';

const WISH_KINDS = [
  { k: 'birthday', col: 'birth_date', label: 'Birthday', icon: '🎂' },
  { k: 'wedding', col: 'wedding_date', label: 'Wedding anniversary', icon: '💐' },
  { k: 'shop', col: 'shop_date', label: 'Shop anniversary', icon: '🎊' },
];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function wishesOn() { return !!S.dbv8 && appOn('wishes'); }

/* "2000-10-27" → "27 Oct" */
function wishDay(d) {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(String(d || ''));
  return m ? (+m[2]) + ' ' + MONTHS_SHORT[+m[1] - 1] : '';
}

/* ---------------- client form: day + month (no year needed) ---------------- */
function wishFieldsHTML(cl) {
  if (!wishesOn()) return '';
  const row = (w) => {
    const m = /^\d{4}-(\d{2})-(\d{2})/.exec(String((cl && cl[w.col]) || ''));
    const dd = m ? +m[2] : 0, mm = m ? +m[1] : 0;
    return '<div class="field wish-f"><label>' + esc(w.label) + '</label><div class="wish-dm">' +
      '<select id="wd-' + w.k + '" aria-label="Day"><option value="">Day</option>' +
      Array.from({ length: 31 }, (_, i) => '<option value="' + (i + 1) + '"' + (dd === i + 1 ? ' selected' : '') + '>' + (i + 1) + '</option>').join('') + '</select>' +
      '<select id="wm-' + w.k + '" aria-label="Month"><option value="">Month</option>' +
      MONTHS_SHORT.map((x, i) => '<option value="' + (i + 1) + '"' + (mm === i + 1 ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></div></div>';
  };
  return '<div class="section-label">Dates for wishes</div><div class="card">' + WISH_KINDS.map(row).join('') +
    '<div class="hint" style="margin-top:-4px">On the day, Today reminds you — with a greeting ready to send.</div></div>';
}

/* → { birth_date, wedding_date, shop_date } (null = not set), or { error } */
function readWishFields() {
  const out = {};
  for (const w of WISH_KINDS) {
    const d = $('#wd-' + w.k), m = $('#wm-' + w.k);
    if (!d || !m) continue;
    const dd = +d.value, mm = +m.value;
    if (!dd && !mm) { out[w.col] = null; continue; }
    if (!dd || !mm) return { error: 'Choose both the day and the month for the ' + w.label.toLowerCase() + '.' };
    const ok = dd <= new Date(2000, mm, 0).getDate();   // 2000 is a leap year: 29 Feb is allowed
    if (!ok) return { error: 'That day does not exist in ' + MONTHS_SHORT[mm - 1] + '.' };
    out[w.col] = '2000-' + String(mm).padStart(2, '0') + '-' + String(dd).padStart(2, '0');
  }
  return out;
}

/* client page detail rows */
function wishRowsHTML(cl) {
  if (!wishesOn() || !cl) return [];
  return WISH_KINDS.filter((w) => cl[w.col]).map((w) => [w.label, w.icon + ' ' + wishDay(cl[w.col])]);
}

/* ---------------- Today: who to wish ---------------- */
/* the date of this year's (or next year's) day for "2000-MM-DD" */
function wishOn(d, year) {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(String(d || ''));
  if (!m) return null;
  let mm = +m[1], dd = +m[2];
  if (mm === 2 && dd === 29 && new Date(year, 1, 29).getMonth() !== 1) dd = 28;   // no 29 Feb this year
  return year + '-' + String(mm).padStart(2, '0') + '-' + String(dd).padStart(2, '0');
}
function wishText(kind, cl) {
  const who = String(cl.contact_person || '').trim().split(/\s+/)[0];
  const me = String((S.me && S.me.full_name) || '').trim().split(/\s+/)[0];
  const sign = '\n— ' + (me ? me + ', ' : '') + bizName();
  if (kind === 'birthday') return 'Happy Birthday' + (who ? ', ' + who + ' ji' : '') + '! 🎂🎉\nWishing you a wonderful year ahead — good health, happiness and success.' + sign;
  if (kind === 'wedding') return 'Happy Wedding Anniversary' + (who ? ', ' + who + ' ji' : '') + '! 💐\nWishing you both many more happy years together.' + sign;
  return 'Congratulations on the anniversary of ' + (cl.trade_name || 'your shop') + '! 🎊\nWishing you many more years of growth and success.' + sign;
}

async function loadTodayWishes() {
  const el = $('#today-wishes');
  if (!el || !wishesOn()) return;
  let rows;
  try {
    rows = await fetchPaged(() => db.from('clients').select('id, trade_name, contact_person, mobile, birth_date, wedding_date, shop_date')
      .or('birth_date.not.is.null,wedding_date.not.is.null,shop_date.not.is.null').order('id', { ascending: true }));
  } catch (e) { return; }
  const t = todayStr(), end = todayStr(7), y = new Date().getFullYear();
  const ev = [];
  rows.forEach((cl) => WISH_KINDS.forEach((w) => {
    if (!cl[w.col]) return;
    let on = wishOn(cl[w.col], y);
    if (on < t) on = wishOn(cl[w.col], y + 1);   // already passed this year: next year's (late December → early January)
    if (on <= end) ev.push({ cl, w, on });
  }));
  if (!ev.length) { el.innerHTML = ''; return; }
  const { data: sent } = await db.from('client_greetings').select('client_id, kind, on_date').gte('on_date', t).lte('on_date', end);
  const done = new Set((sent || []).map((g) => g.client_id + '|' + g.kind + '|' + g.on_date));
  if (!$('#today-wishes')) return;
  ev.sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : String(a.cl.trade_name).localeCompare(String(b.cl.trade_name))));
  const today = ev.filter((e) => e.on === t), soon = ev.filter((e) => e.on > t);
  const line = (e) => {
    const wished = done.has(e.cl.id + '|' + e.w.k + '|' + e.on);
    const name = e.w.k === 'shop' ? e.cl.trade_name : (e.cl.contact_person || e.cl.trade_name);
    return '<div class="wish-item' + (wished ? ' done' : '') + '">' +
      '<span class="wi-ic">' + e.w.icon + '</span>' +
      '<span class="wi-t"><b>' + esc(name || '') + '</b><span>' + esc(e.w.label + (e.w.k === 'shop' ? '' : ' · ' + (e.cl.trade_name || ''))) + '</span></span>' +
      (wished ? '<span class="wi-done">✓ Wished</span>'
        : e.cl.mobile ? '<button type="button" class="btn btn-small btn-primary" data-action="wish-send" data-id="' + e.cl.id + '" data-k="' + e.w.k + '" data-on="' + e.on + '">Send wishes</button>'
          : '<span class="wi-done" data-action="open-client" data-id="' + e.cl.id + '">No mobile ›</span>') + '</div>';
  };
  el.innerHTML =
    (today.length ? '<div class="due-group-label wishes">🎉 Wishes today (' + today.length + ')</div><div class="card wish-card">' + today.map(line).join('') + '</div>' : '') +
    (soon.length ? '<div class="wish-soon"><b>Coming up</b> ' + soon.map((e) => '<span data-action="open-client" data-id="' + e.cl.id + '">' + e.w.icon + ' ' +
      esc((e.w.k === 'shop' ? e.cl.trade_name : (e.cl.contact_person || e.cl.trade_name)) + ' · ' + fmtD(e.on)) + '</span>').join('') + '</div>' : '');
  S.wishRows = rows;
}

async function sendWish(clientId, kind, on) {
  const cl = (S.wishRows || []).find((c) => c.id === clientId);
  if (!cl) return;
  window.open(waUrl(cl.mobile, wishText(kind, cl)), '_blank');
  const { error } = await db.from('client_greetings').insert({ client_id: clientId, kind, on_date: on, sent_by: S.me.id });
  if (error && String(error.code) !== '23505') { toast('Could not mark it as sent.', 'err'); return; }
  loadTodayWishes();
}
onAct('wish-send', (el) => sendWish(el.dataset.id, el.dataset.k, el.dataset.on));
