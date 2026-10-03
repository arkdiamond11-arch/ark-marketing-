/* ============================================================
   Shared helpers for the add-on screens + Business details.
   Loaded after orders.js and before app.js. Uses app.js helpers
   ($, db, S, esc, toast, showSub …) only at call time.
   ============================================================ */
'use strict';

/* register a handler for <… data-action="name"> */
function onAct(name, fn) { window.ACTIONS[name] = fn; }

function isOwner() { return !!(S.me && S.me.role === 'owner'); }

/* leave the current sub-screen (same as the ‹ back arrow) */
function backOne() {
  if (!S.sub.length) return;
  S.suppressPop = true;
  try { history.back(); } catch (_) {}
  goBack();
}

/* ---------------- dates ---------------- */
function ymd(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function monthStart(d) {
  d = d ? new Date(d) : new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
}
function addMonths(ms, n) {
  const d = new Date(ms + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return monthStart(d);
}
function monthLabel(ms) {
  return new Date(ms + 'T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}
function daysInMonth(ms) {
  const d = new Date(ms + 'T00:00:00');
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}
/* the moment a local calendar day starts, as an ISO timestamp */
function dayStartISO(ds) { return new Date(ds + 'T00:00:00').toISOString(); }
function fmtDLong(ds) {
  if (!ds) return '';
  const d = new Date(String(ds).length === 10 ? ds + 'T00:00:00' : ds);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}
function daysBetween(a, b) { return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000); }

/* ---------------- periods (reports) ---------------- */
const ACC_PERIODS = [['today', 'Today'], ['7d', '7 days'], ['month', 'This month'], ['lastmonth', 'Last month'], ['fy', 'This year'], ['all', 'All'], ['custom', 'Dates']];
/* financial year: 1 April – 31 March */
function fyStart() {
  const d = new Date();
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return y + '-04-01';
}
function periodRange(p, from, to) {
  const t = todayStr();
  if (p === 'today') return [t, t];
  if (p === '7d') return [todayStr(-6), t];
  if (p === 'month') return [monthStart(), t];
  if (p === 'lastmonth') { const s = addMonths(monthStart(), -1); return [s, todayStr(-new Date().getDate())]; }
  if (p === 'fy') return [fyStart(), t];
  if (p === 'custom') return [from || null, to || null];
  return [null, null];
}
function rangeLabel(r) {
  if (!r[0] && !r[1]) return 'All dates';
  if (r[0] === r[1]) return fmtDLong(r[0]);
  return (r[0] ? fmtD(r[0]) : '…') + ' – ' + (r[1] ? fmtD(r[1]) : '…');
}
function inRange(q, col, r) {
  if (r[0]) q = q.gte(col, r[0]);
  if (r[1]) q = q.lte(col, r[1]);
  return q;
}

/* ---------------- phone / WhatsApp / maps ---------------- */
function waUrl(mobile, text) {
  const m = normMobile(mobile || '');
  return 'https://wa.me/' + (isIndianMobile(m) ? '91' + m : '') + '?text=' + encodeURIComponent(text || '');
}
function openWa(mobile, text) { window.open(waUrl(mobile, text), '_blank'); }
function telHref(m) { const d = normMobile(m); return 'tel:' + (d || String(m || '')); }
function mapsSearchUrl(lat, lng) { return 'https://www.google.com/maps/search/?api=1&query=' + lat + ',' + lng; }
function mapsDirUrl(lat, lng) { return 'https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lng; }
function distKm(lat1, lng1, lat2, lng2) {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR, dLng = (lng2 - lng1) * toR;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function fmtDist(km) { return km < 1 ? Math.round(km * 1000) + ' m' : (Math.round(km * 10) / 10) + ' km'; }

/* ---------------- files ---------------- */
function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
/* Share a file to WhatsApp etc. where the phone allows it; otherwise download it. */
async function shareBlob(blob, filename, text) {
  try {
    const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: filename, text: text || '' });
      return 'shared';
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelled';
  }
  downloadBlob(blob, filename);
  return 'downloaded';
}
function safeFileName(s) {
  return String(s || 'file').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

/* signed photo links, cached for 50 minutes */
const SIGNED = new Map();
async function signedUrls(bucket, paths) {
  const out = new Map();
  const need = [];
  const now = Date.now();
  (paths || []).filter(Boolean).forEach((p) => {
    const c = SIGNED.get(bucket + '|' + p);
    if (c && c.exp > now) out.set(p, c.url); else need.push(p);
  });
  for (let i = 0; i < need.length; i += 100) {
    const { data } = await db.storage.from(bucket).createSignedUrls(need.slice(i, i + 100), 3600);
    (data || []).forEach((d) => {
      if (d && d.signedUrl) {
        out.set(d.path, d.signedUrl);
        SIGNED.set(bucket + '|' + d.path, { url: d.signedUrl, exp: now + 50 * 60000 });
      }
    });
  }
  return out;
}

/* every row of a query, 1000 at a time (the server sends at most 1000 per request).
   makeQuery() must build a fresh, ordered query each time. */
async function fetchPaged(makeQuery, max) {
  const out = [];
  for (let from = 0; from < (max || 50000); from += 1000) {
    const { data, error } = await makeQuery().range(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/* ---------------- small UI bits ---------------- */
function loadingHTML() { return '<div class="empty">Loading…</div>'; }
/* progress bar: actual of target, coloured by whether it keeps pace with the month */
function progressHTML(label, actual, target, fmt, pace) {
  const a = num(actual), t = num(target);
  const pct = t > 0 ? Math.min(100, Math.round(a / t * 100)) : 0;
  const ok = t <= 0 || a >= t * (pace == null ? 1 : pace) - 1e-9;
  const f = fmt || ((x) => String(Math.round(x)));
  return '<div class="pg-row"><div class="pg-top"><span>' + esc(label) + '</span><b>' + esc(f(a)) +
    (t > 0 ? ' <span class="pg-of">/ ' + esc(f(t)) + '</span>' : '') + '</b></div>' +
    (t > 0 ? '<div class="pg-bar"><i class="' + (a >= t ? 'done' : ok ? 'ok' : 'behind') + '" style="width:' + pct + '%"></i></div>' : '') +
    '</div>';
}

/* ---------------- GST state codes ---------------- */
const GST_STATE_CODES = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand',
  '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
  '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya',
  '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '29': 'Karnataka',
  '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
};
function isValidGstin(g) { return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(String(g || '').trim().toUpperCase()); }
function stateCodeFor(stateName, gstin) {
  const g = String(gstin || '').trim();
  if (/^\d{2}/.test(g) && GST_STATE_CODES[g.slice(0, 2)]) return g.slice(0, 2);
  const s = String(stateName || '').trim().toLowerCase();
  if (!s) return '';
  const hit = Object.keys(GST_STATE_CODES).find((k) => GST_STATE_CODES[k].toLowerCase() === s);
  return hit || '';
}
function stateFromGstin(gstin) {
  const g = String(gstin || '').trim();
  return /^\d{2}/.test(g) ? (GST_STATE_CODES[g.slice(0, 2)] || '') : '';
}

/* ============================================================
   BUSINESS DETAILS (owner) — printed on slips, quotations, challans
   ============================================================ */
async function loadBiz() {
  const { data, error } = await db.from('business_settings').select('*').eq('id', 1).maybeSingle();
  S.biz = (!error && data) || {};
  return S.biz;
}
function bizName() { return String((S.biz && S.biz.legal_name) || BRAND).trim(); }

function renderBizForm() {
  const b = S.biz || {};
  const v = (k) => esc(b[k] == null ? '' : b[k]);
  $('#content').innerHTML =
    '<div class="notice">These details are printed on order slips, quotations and challans. Type them in English letters — PDFs cannot print Hindi or Gujarati letters.</div>' +
    '<div class="card">' +
    '<div class="field"><label>Business / legal name</label><input type="text" id="biz-name" value="' + esc(b.legal_name || BRAND) + '"></div>' +
    '<div class="field"><label>Address</label><textarea id="biz-address" style="min-height:70px" placeholder="Shop no., building, street, area">' + v('address') + '</textarea></div>' +
    '<div class="o-2col">' +
    '<div class="field"><label>City</label><input type="text" id="biz-city" value="' + v('city') + '"></div>' +
    '<div class="field"><label>PIN code</label><input type="text" id="biz-pin" inputmode="numeric" value="' + v('pincode') + '"></div>' +
    '</div>' +
    '<div class="field"><label>State</label><div class="combo"><input type="text" id="biz-state" autocomplete="off" value="' + v('state') + '" placeholder="Type or pick a state"><button type="button" class="combo-arr" tabindex="-1" aria-label="Show states">▾</button><div class="combo-list" id="cl-biz-state"></div></div></div>' +
    '<div class="field"><label>GSTIN</label><input type="text" id="biz-gstin" autocapitalize="characters" value="' + v('gstin') + '" placeholder="15-character GST number"></div>' +
    '<div class="o-2col">' +
    '<div class="field"><label>Phone</label><input type="tel" id="biz-phone" value="' + v('phone') + '"></div>' +
    '<div class="field"><label>Email</label><input type="email" id="biz-email" value="' + v('email') + '"></div>' +
    '</div>' +
    '<div class="field" style="margin-bottom:2px"><label>Terms (printed at the bottom)</label><textarea id="biz-terms" style="min-height:80px" placeholder="e.g. Goods once sold will not be taken back. Subject to Jaipur jurisdiction.">' + v('terms') + '</textarea></div>' +
    '</div>' +
    '<button class="btn btn-primary" data-action="biz-save" id="biz-save-btn">Save details</button><div style="height:10px"></div>';
  attachCombo('#biz-state', '#cl-biz-state', INDIAN_STATES);
}

async function saveBiz() {
  const g = $('#biz-gstin').value.trim().toUpperCase();
  const row = {
    legal_name: $('#biz-name').value.trim() || null,
    address: $('#biz-address').value.trim() || null,
    city: $('#biz-city').value.trim() || null,
    pincode: $('#biz-pin').value.trim() || null,
    state: $('#biz-state').value.trim() || stateFromGstin(g) || null,
    gstin: g || null,
    phone: $('#biz-phone').value.trim() || null,
    email: $('#biz-email').value.trim() || null,
    terms: $('#biz-terms').value.trim() || null,
    updated_by: S.me.id,
  };
  const go = async () => {
    const btn = $('#biz-save-btn'); if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    const { error } = await db.from('business_settings').update(row).eq('id', 1);
    if (btn) { btn.disabled = false; btn.textContent = 'Save details'; }
    if (error) { toast('Could not save — try again.', 'err'); return; }
    S.biz = Object.assign({}, S.biz, row);
    toast('Business details saved ✓', 'ok');
    backOne();
  };
  if (g && !isValidGstin(g)) confirmModal('GSTIN looks wrong', '"' + g + '" is not in the usual 15-character GSTIN format. Save it anyway?', 'Save anyway', go);
  else go();
}

onAct('biz-open', () => showSub('Business details', renderBizForm));
onAct('biz-save', () => saveBiz());

window.LOGIN_HOOKS.push(loadBiz);
