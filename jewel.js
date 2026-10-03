/* ============================================================
   JEWELLERY DETAILS — gold colour / silver finish, diamonds and
   other stones (Natural, CVD, HPHT, Moissanite, Polki, CZ …),
   diamond certificate and jewellery certificate (BIS hallmark
   HUID or a lab). Used by order items, catalogue pieces, PDFs,
   WhatsApp messages and reports.
   ============================================================ */
'use strict';

const GOLD_COLORS = ['Yellow', 'Rose', 'White', 'Two-tone', 'Tri-colour'];
const SILVER_FINISHES = ['Plain', 'Oxidised', 'Rhodium', 'Gold plated'];
const DIAMOND_TYPES = ['Natural', 'CVD', 'HPHT', 'Moissanite', 'Polki', 'CZ', 'Colour stones'];
const DIAMOND_LABEL = {
  Natural: 'Natural diamond', CVD: 'CVD lab-grown', HPHT: 'HPHT lab-grown', Moissanite: 'Moissanite',
  Polki: 'Polki (uncut)', CZ: 'CZ / American diamond', 'Colour stones': 'Colour stones',
};
const DIAMOND_LABS = ['IGI', 'GIA', 'SGL', 'HRD', 'IIG', 'GII', 'Other lab'];
const JEWEL_CERTS = ['BIS Hallmark (HUID)', 'IGI', 'SGL', 'GIA', 'Other'];

function colorOptions(metal) { return metal === 'Silver' ? SILVER_FINISHES : GOLD_COLORS; }
function colorLabel(metal, c) {
  if (!c) return '';
  return metal === 'Silver' ? c + ' silver' : c + ' gold';
}
function diamondLabel(t) { return t ? (DIAMOND_LABEL[t] || t) : ''; }

/* the database columns for one item, from the form's text values */
function jewelRow(it) {
  const s = (v) => String(v == null ? '' : v).trim();
  const type = s(it.diamond_type) || null;
  const lab = type ? (s(it.diamond_cert_lab) || null) : null;
  const jc = s(it.jewel_cert_type) || null;
  return {
    metal_color: s(it.metal_color) || null,
    diamond_type: type,
    diamond_ct: type ? numOrNull(it.diamond_ct) : null,
    diamond_pcs: type && numOrNull(it.diamond_pcs) != null ? Math.round(num(it.diamond_pcs)) : null,
    diamond_quality: type ? (s(it.diamond_quality) || null) : null,
    diamond_rate: type ? numOrNull(it.diamond_rate) : null,
    diamond_certified: type ? !!lab : null,
    diamond_cert_lab: lab,
    diamond_cert_no: lab ? (s(it.diamond_cert_no) || null) : null,
    jewel_certified: !!jc,
    jewel_cert_type: jc,
    jewel_cert_no: jc ? (s(it.jewel_cert_no) || null) : null,
  };
}
/* database row → the form's text values */
function jewelForm(r) {
  const s = (v) => (v == null ? '' : String(v));
  return {
    metal_color: s(r.metal_color), diamond_type: s(r.diamond_type), diamond_ct: s(r.diamond_ct), diamond_pcs: s(r.diamond_pcs),
    diamond_quality: s(r.diamond_quality), diamond_rate: s(r.diamond_rate), diamond_cert_lab: s(r.diamond_cert_lab),
    diamond_cert_no: s(r.diamond_cert_no), jewel_cert_type: s(r.jewel_cert_type), jewel_cert_no: s(r.jewel_cert_no),
  };
}
const JEWEL_BLANK = { metal_color: '', diamond_type: '', diamond_ct: '', diamond_pcs: '', diamond_quality: '', diamond_rate: '',
  diamond_cert_lab: '', diamond_cert_no: '', jewel_cert_type: '', jewel_cert_no: '' };

/* one-line descriptions */
function diamondLine(it) {
  if (!it || !it.diamond_type) return '';
  const b = [diamondLabel(it.diamond_type)];
  if (num(it.diamond_ct)) b.push(num(it.diamond_ct) + ' ct');
  if (num(it.diamond_pcs)) b.push(Math.round(num(it.diamond_pcs)) + ' pcs');
  if (it.diamond_quality) b.push(it.diamond_quality);
  if (num(it.diamond_rate)) b.push(inr(it.diamond_rate) + '/ct');
  if (it.diamond_cert_lab) b.push(it.diamond_cert_lab + ' certified' + (it.diamond_cert_no ? ' ' + it.diamond_cert_no : ''));
  else b.push('not certified');
  return b.join(' · ');
}
function jewelCertLine(it) {
  if (!it || !it.jewel_cert_type) return '';
  return it.jewel_cert_type + (it.jewel_cert_no ? ' ' + it.jewel_cert_no : '');
}
/* for PDFs (plain text, "Rs." for ₹) */
function jewelPdfBits(it, metal) {
  const b = [];
  if (it.metal_color) b.push(colorLabel(metal, it.metal_color));
  if (it.diamond_type) {
    const d = [diamondLabel(it.diamond_type)];
    if (num(it.diamond_ct)) d.push(num(it.diamond_ct) + ' ct');
    if (num(it.diamond_pcs)) d.push(Math.round(num(it.diamond_pcs)) + ' pcs');
    if (it.diamond_quality) d.push(it.diamond_quality);
    if (it.diamond_cert_lab) d.push(it.diamond_cert_lab + (it.diamond_cert_no ? ' cert ' + it.diamond_cert_no : ' certified'));
    b.push(d.join(' '));
  }
  if (it.jewel_cert_type) b.push(it.jewel_cert_type + (it.jewel_cert_no ? ' ' + it.jewel_cert_no : ''));
  return b;
}

/* HTML lines under an item on the order / catalogue pages */
function jewelMetaHTML(it, metal) {
  let h = '';
  if (it.metal_color) h += '<div class="o-item-meta">Colour: <b>' + esc(colorLabel(metal, it.metal_color)) + '</b></div>';
  if (it.diamond_type) h += '<div class="o-item-meta">💎 ' + esc(diamondLine(it)) + '</div>';
  if (it.jewel_cert_type) h += '<div class="o-item-meta">🏷️ ' + esc(jewelCertLine(it)) + '</div>';
  return h;
}

/* the colour all the items share ('' when they differ or none is set) */
function commonColor(items) {
  const list = (items || []).map((x) => x.metal_color || '');
  return list.length && list[0] && list.every((c) => c === list[0]) ? list[0] : '';
}
function colorFieldLabel(metal) { return metal === 'Silver' ? 'Silver finish' : 'Gold colour'; }

/* ---------------- the extra boxes inside an order item card ---------------- */
function jewelItemFieldsHTML(it, i, metal, opts) {
  const inp = (k, label, ph, dec, full) => '<div class="' + (full ? 'full' : '') + '"><div class="oi-l">' + label + '</div>' +
    '<input type="text"' + (dec ? ' inputmode="decimal"' : '') + ' autocomplete="off" data-oi="' + k + '" data-idx="' + i + '" value="' + esc(it[k]) + '" placeholder="' + (ph || '') + '"></div>';
  const sel = (k, label, opts, emptyLabel, full) => {
    const cur = it[k] || '';
    const list = opts.slice();
    if (cur && list.indexOf(cur) === -1) list.unshift(cur);
    return '<div class="' + (full ? 'full' : '') + '"><div class="oi-l">' + label + '</div><select data-oi="' + k + '" data-idx="' + i + '">' +
      '<option value="">' + esc(emptyLabel) + '</option>' +
      list.map((o) => '<option value="' + esc(o) + '"' + (o === cur ? ' selected' : '') + '>' + esc(k === 'diamond_type' ? diamondLabel(o) : o) + '</option>').join('') +
      '</select></div>';
  };
  let h = (opts && opts.noColor ? '' : sel('metal_color', colorFieldLabel(metal), colorOptions(metal), '—')) +
    sel('jewel_cert_type', 'Jewellery certificate', JEWEL_CERTS, 'Not certified', !!(opts && opts.noColor));
  if (it.jewel_cert_type) h += inp('jewel_cert_no', it.jewel_cert_type.indexOf('HUID') > -1 ? 'HUID no.' : 'Certificate no.', '', false, true);
  h += sel('diamond_type', 'Diamonds / stones', DIAMOND_TYPES, 'None', !it.diamond_type);
  if (it.diamond_type) {
    h += inp('diamond_ct', 'Carats (ct)', '0.00', true) +
      inp('diamond_pcs', 'Pieces', '0', true) +
      inp('diamond_quality', 'Quality', 'e.g. EF VVS') +
      inp('diamond_rate', 'Rate ₹ / ct', '0', true) +
      sel('diamond_cert_lab', 'Diamond certificate', DIAMOND_LABS, 'Not certified');
    if (it.diamond_cert_lab) h += inp('diamond_cert_no', 'Certificate no.', '');
  }
  return h;
}
/* keys whose change shows / hides other boxes */
const JEWEL_TOGGLE_KEYS = ['diamond_type', 'diamond_cert_lab', 'jewel_cert_type'];

/* carats × rate → stone value (keeps the order totals right) */
function jewelAutoStoneValue(it) {
  const ct = num(it.diamond_ct), rate = num(it.diamond_rate);
  if (it.diamond_type && ct > 0 && rate > 0) return String(Math.round(ct * rate));
  return null;
}
