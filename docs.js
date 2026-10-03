/* ============================================================
   PDF DOCUMENTS — made inside the app (no outside library, works
   offline). Order slip · Quotation · Job-work delivery challan ·
   Gold receipt · Karigar issue challan · Client statement ·
   Karigar statement.
   PDFs use the standard Helvetica font, so ₹ prints as "Rs." and
   text in Hindi/Gujarati letters prints as "?".
   ============================================================ */
'use strict';

/* ---------------- tiny PDF writer ---------------- */
const PDF_WIDTHS = [
  [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584],
  [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584],
];
const MM = 72 / 25.4;
const PG_W = 210, PG_H = 297, PM = 14;
const C_INK = [0.15, 0.13, 0.17], C_MUTED = [0.45, 0.43, 0.48], C_LINE = [0.85, 0.83, 0.81];
const C_MAROON = [0.482, 0.118, 0.235], C_GOLD = [0.79, 0.59, 0.24], C_SOFT = [0.968, 0.937, 0.945];
const C_RED = [0.7, 0.2, 0.18], C_GREEN = [0.1, 0.5, 0.31], C_WHITE = [1, 1, 1];

/* keep only characters the standard PDF font can show */
function pdfText(s) {
  return String(s == null ? '' : s)
    .replace(/₹\s?/g, 'Rs. ')
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/•/g, '*').replace(/…/g, '...')
    .replace(/[   ]/g, ' ')
    .replace(/[\r\t]/g, ' ')
    .replace(/[^\x20-\x7E\n\xA0-\xFF]/g, '?');
}
function pdfEsc(s) { return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); }
function pdfWidth(s, size, bold) {
  const t = PDF_WIDTHS[bold ? 1 : 0];
  let w = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    w += (c >= 32 && c <= 126) ? t[c - 32] : 556;
  }
  return w * size / 1000 / MM;   // in mm
}
function f2(n) { return (Math.round(n * 100) / 100).toString(); }
function latin1Bytes(s) {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255;
  return b;
}

function PDF() {
  this.pages = [];
  this.imgs = [];
  this.y = PM;
  this.footerText = '';
  this.addPage();
}
PDF.prototype.addPage = function () {
  this.page = [];
  this.pages.push(this.page);
  this.y = PM;
};
PDF.prototype.op = function (s) { this.page.push(s); };
PDF.prototype.color = function (c, stroke) { this.op(f2(c[0]) + ' ' + f2(c[1]) + ' ' + f2(c[2]) + (stroke ? ' RG' : ' rg')); };
/* text with its baseline at y (mm from the top) */
PDF.prototype.text = function (x, y, s, o) {
  o = o || {};
  const size = o.size || 9, bold = !!o.bold;
  s = pdfText(s).replace(/\n/g, ' ');
  const w = pdfWidth(s, size, bold);
  const xx = o.align === 'right' ? x - w : o.align === 'center' ? x - w / 2 : x;
  this.color(o.color || C_INK);
  this.op('BT /' + (bold ? 'F2' : 'F1') + ' ' + f2(size) + ' Tf ' + f2(xx * MM) + ' ' + f2((PG_H - y) * MM) + ' Td (' + pdfEsc(s) + ') Tj ET');
  return w;
};
PDF.prototype.lineH = function (size) { return size * 0.3528 * 1.32; };
/* split text into lines that fit the width */
PDF.prototype.wrap = function (s, width, size, bold) {
  const out = [];
  pdfText(s).split('\n').forEach((para) => {
    const words = para.split(' ');
    let line = '';
    words.forEach((w) => {
      const tryLine = line ? line + ' ' + w : w;
      if (pdfWidth(tryLine, size, bold) <= width) { line = tryLine; return; }
      if (line) out.push(line);
      // a single word wider than the box: cut it
      let rest = w;
      while (pdfWidth(rest, size, bold) > width && rest.length > 1) {
        let k = rest.length - 1;
        while (k > 1 && pdfWidth(rest.slice(0, k), size, bold) > width) k--;
        out.push(rest.slice(0, k));
        rest = rest.slice(k);
      }
      line = rest;
    });
    out.push(line);
  });
  return out.length ? out : [''];
};
/* paragraph starting at top y; returns the y below it */
PDF.prototype.para = function (x, y, s, width, o) {
  o = o || {};
  const size = o.size || 9, lh = this.lineH(size);
  const lines = this.wrap(s, width, size, o.bold);
  lines.forEach((ln, i) => this.text(x, y + lh * 0.78 + i * lh, ln, o));
  return y + lines.length * lh;
};
PDF.prototype.line = function (x1, y1, x2, y2, c, w) {
  this.color(c || C_LINE, true);
  this.op(f2(w || 0.3) + ' w ' + f2(x1 * MM) + ' ' + f2((PG_H - y1) * MM) + ' m ' + f2(x2 * MM) + ' ' + f2((PG_H - y2) * MM) + ' l S');
};
PDF.prototype.rect = function (x, y, w, h, fill, stroke) {
  const r = f2(x * MM) + ' ' + f2((PG_H - y - h) * MM) + ' ' + f2(w * MM) + ' ' + f2(h * MM) + ' re';
  if (fill) { this.color(fill); this.op(r + ' f'); }
  if (stroke) { this.color(stroke, true); this.op('0.3 w ' + r + ' S'); }
};
PDF.prototype.image = function (img, x, y, w, h) {
  const id = this.imgs.length;
  this.imgs.push(img);
  this.op('q ' + f2(w * MM) + ' 0 0 ' + f2(h * MM) + ' ' + f2(x * MM) + ' ' + f2((PG_H - y - h) * MM) + ' cm /Im' + id + ' Do Q');
};
/* start a new page if h mm will not fit */
PDF.prototype.ensure = function (h) {
  if (this.y + h > PG_H - PM - 8) { this.addPage(); return true; }
  return false;
};
/* table: cols [{h, w, a}], rows = arrays of cell text (row.bold = true for a bold row) */
PDF.prototype.table = function (cols, rows, o) {
  o = o || {};
  const size = o.size || 8.4, lh = this.lineH(size), pad = 1.5;
  const x0 = PM, totalW = cols.reduce((a, c) => a + c.w, 0);
  const cellX = (x, c) => (c.a === 'right' ? x + c.w - pad : c.a === 'center' ? x + c.w / 2 : x + pad);
  const head = () => {
    const hl = cols.map((c) => this.wrap(c.h, c.w - pad * 2, size - 0.6, true));
    const nl = Math.max(...hl.map((l) => l.length));
    const hh = nl * lh + pad * 2;
    this.rect(x0, this.y, totalW, hh, C_SOFT);
    let x = x0;
    cols.forEach((c, i) => {
      hl[i].forEach((ln, li) => this.text(cellX(x, c), this.y + pad + lh * 0.78 + li * lh, ln, { size: size - 0.6, bold: true, color: C_MAROON, align: c.a }));
      x += c.w;
    });
    this.y += hh;
  };
  this.ensure(lh * 3 + pad * 4);
  head();
  rows.forEach((r, ri) => {
    const bold = !!r.bold;
    const cl = cols.map((c, i) => this.wrap(r[i] == null ? '' : String(r[i]), c.w - pad * 2, size, bold));
    const nl = Math.max(1, ...cl.map((l) => l.length));
    const rh = nl * lh + pad * 2;
    if (this.y + rh > PG_H - PM - 8) { this.addPage(); head(); }
    if (bold) this.rect(x0, this.y, totalW, rh, [0.985, 0.97, 0.94]);
    else if (o.zebra && ri % 2 === 1) this.rect(x0, this.y, totalW, rh, [0.985, 0.982, 0.978]);
    let x = x0;
    cols.forEach((c, i) => {
      cl[i].forEach((ln, li) => this.text(cellX(x, c), this.y + pad + lh * 0.78 + li * lh, ln, { size, bold, align: c.a }));
      x += c.w;
    });
    this.y += rh;
    this.line(x0, this.y, x0 + totalW, this.y, C_LINE, 0.2);
  });
  this.y += 3;
};
/* finish: page numbers + footer, then the file bytes */
PDF.prototype.blob = function () {
  const n = this.pages.length;
  this.pages.forEach((pg, i) => {
    this.page = pg;
    this.line(PM, PG_H - 11, PG_W - PM, PG_H - 11, C_LINE, 0.2);
    if (this.footerText) this.text(PM, PG_H - 7, this.footerText, { size: 7, color: C_MUTED });
    this.text(PG_W - PM, PG_H - 7, 'Page ' + (i + 1) + ' of ' + n, { size: 7, color: C_MUTED, align: 'right' });
  });
  const chunks = [];
  let len = 0;
  const offsets = [];
  const push = (x) => { const b = typeof x === 'string' ? latin1Bytes(x) : x; chunks.push(b); len += b.length; };
  const obj = (k) => { offsets[k] = len; push(k + ' 0 obj\n'); };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const imgBase = 5, pageBase = imgBase + this.imgs.length;
  obj(1); push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  obj(2); push('<< /Type /Pages /Kids [' + this.pages.map((_, i) => (pageBase + i * 2) + ' 0 R').join(' ') + '] /Count ' + n + ' >>\nendobj\n');
  obj(3); push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n');
  obj(4); push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n');
  this.imgs.forEach((im, k) => {
    obj(imgBase + k);
    push('<< /Type /XObject /Subtype /Image /Width ' + im.w + ' /Height ' + im.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + im.bytes.length + ' >>\nstream\n');
    push(im.bytes);
    push('\nendstream\nendobj\n');
  });
  const xo = this.imgs.length ? ' /XObject << ' + this.imgs.map((_, k) => '/Im' + k + ' ' + (imgBase + k) + ' 0 R').join(' ') + ' >>' : '';
  this.pages.forEach((pg, i) => {
    obj(pageBase + i * 2);
    push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>' + xo + ' >> /Contents ' + (pageBase + i * 2 + 1) + ' 0 R >>\nendobj\n');
    const cb = latin1Bytes(pg.join('\n'));
    obj(pageBase + i * 2 + 1);
    push('<< /Length ' + cb.length + ' >>\nstream\n');
    push(cb);
    push('\nendstream\nendobj\n');
  });
  const size = pageBase + n * 2;
  const xrefAt = len;
  let xref = 'xref\n0 ' + size + '\n0000000000 65535 f \n';
  for (let k = 1; k < size; k++) xref += String(offsets[k]).padStart(10, '0') + ' 00000 n \n';
  push(xref);
  push('trailer\n<< /Size ' + size + ' /Root 1 0 R >>\nstartxref\n' + xrefAt + '\n%%EOF\n');
  return new Blob(chunks, { type: 'application/pdf' });
};

/* photo (signed link) → small JPEG for the PDF */
async function pdfImage(url, maxPx) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const src = URL.createObjectURL(blob);
    const img = new Image();
    img.src = src;
    await img.decode();
    const scale = Math.min(1, (maxPx || 700) / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(src);
    const bin = atob(cv.toDataURL('image/jpeg', 0.82).split(',')[1]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, w, h };
  } catch (e) {
    return null;
  }
}

/* ---------------- shared document parts ---------------- */
function pRs(n) { return 'Rs. ' + Math.round(num(n)).toLocaleString('en-IN'); }
function pG(n) { return (Math.round(num(n) * 1000) / 1000).toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 }); }
function pPurity(p) {
  if (p == null || p === '') return '-';
  const k = purityKey(p);
  return k ? k + ' (' + num(p) + '%)' : num(p) + '%';
}
function pDate(ds) { return fmtDLong(ds) || '-'; }

async function pdfStart(title, meta, subtitle) {
  if (!S.biz || !S.biz.id) await loadBiz();
  const d = new PDF();
  d.footerText = bizName() + ' · ' + fmtDLong(todayStr());
  const b = S.biz || {};
  let y = PM + 5;
  d.text(PM, y, bizName(), { size: 15, bold: true, color: C_MAROON });
  y += 2.5;
  const addr = [b.address, [b.city, b.state].filter(Boolean).join(', ') + (b.pincode ? ' - ' + b.pincode : '')].filter((x) => x && x.trim()).join(', ');
  if (addr) y = d.para(PM, y, addr, 108, { size: 8.4, color: C_MUTED });
  const contact = [b.phone ? 'Phone: ' + b.phone : '', b.email || ''].filter(Boolean).join('    ');
  if (contact) y = d.para(PM, y, contact, 108, { size: 8.4, color: C_MUTED });
  if (b.gstin) y = d.para(PM, y, 'GSTIN: ' + b.gstin + (stateCodeFor(b.state, b.gstin) ? '   State code: ' + stateCodeFor(b.state, b.gstin) : ''), 108, { size: 8.4, bold: true });
  const tw = 64, tx = PG_W - PM - tw;
  d.rect(tx, PM, tw, 9.5, C_MAROON);
  d.text(tx + tw / 2, PM + 6.5, title, { size: 11.5, bold: true, color: C_WHITE, align: 'center' });
  let my = PM + 14.5;
  (meta || []).forEach((m) => {
    d.text(tx, my, m[0], { size: 8.4, color: C_MUTED });
    d.text(PG_W - PM, my, m[1], { size: 8.6, bold: true, align: 'right' });
    my += 4.6;
  });
  d.y = Math.max(y, my - 2) + 3;
  if (subtitle) { d.text(PM, d.y + 1, subtitle, { size: 8, color: C_MUTED }); d.y += 3.5; }
  d.line(PM, d.y, PG_W - PM, d.y, C_GOLD, 0.8);
  d.y += 5;
  return d;
}
function pHeading(d, s) {
  d.ensure(14);
  d.text(PM, d.y + 3.5, String(s).toUpperCase(), { size: 8, bold: true, color: C_MAROON });
  d.y += 6;
}
function pParty(d, x, y, w, label, lines) {
  d.text(x, y + 2.6, label, { size: 7.5, bold: true, color: C_MUTED });
  let yy = y + 4;
  lines.filter((l) => l && String(l).trim()).forEach((ln, i) => {
    yy = d.para(x, yy, ln, w, { size: i === 0 ? 10.5 : 8.6, bold: i === 0 });
  });
  return yy;
}
function clientLines(cl) {
  const st = cl.state || stateFromGstin(cl.gstin);
  const code = stateCodeFor(st, cl.gstin);
  return [
    cl.trade_name,
    cl.company_name && cl.company_name !== cl.trade_name ? cl.company_name : '',
    [cl.contact_person, cl.designation].filter(Boolean).join(', '),
    cl.address,
    [cl.area, cl.city, st].filter(Boolean).join(', ') + (code ? ' (State code ' + code + ')' : ''),
    cl.gstin ? 'GSTIN: ' + cl.gstin : '',
    cl.mobile ? 'Mobile: ' + cl.mobile : '',
  ];
}
function bizLines() {
  const b = S.biz || {};
  const code = stateCodeFor(b.state, b.gstin);
  return [
    bizName(),
    b.address,
    [b.city, b.state].filter(Boolean).join(', ') + (b.pincode ? ' - ' + b.pincode : '') + (code ? ' (State code ' + code + ')' : ''),
    b.gstin ? 'GSTIN: ' + b.gstin : 'GSTIN: not set (More > Business details)',
    b.phone ? 'Phone: ' + b.phone : '',
  ];
}
function pTwoParties(d, leftLabel, left, rightLabel, right) {
  d.ensure(40);
  const w = (PG_W - PM * 2 - 8) / 2;
  const y1 = pParty(d, PM, d.y, w, leftLabel, left);
  const y2 = pParty(d, PM + w + 8, d.y, w, rightLabel, right);
  d.y = Math.max(y1, y2) + 4;
}
function pTotals(d, rows) {
  const w = 84, x = PG_W - PM - w;
  d.ensure(rows.length * 5.4 + 6);
  rows.forEach((r) => {
    const st = r[2];
    if (st === 'total') {
      d.rect(x, d.y, w, 7.5, C_SOFT);
      d.text(x + 2.5, d.y + 5.1, r[0], { size: 10, bold: true, color: C_MAROON });
      d.text(x + w - 2.5, d.y + 5.1, r[1], { size: 10, bold: true, color: C_MAROON, align: 'right' });
      d.y += 8.5;
    } else {
      d.text(x + 2.5, d.y + 3.7, r[0], { size: 8.8, color: C_MUTED });
      d.text(x + w - 2.5, d.y + 3.7, r[1], { size: 8.8, bold: st === 'bold' || st === 'due' || st === 'paid', align: 'right', color: st === 'due' ? C_RED : st === 'paid' ? C_GREEN : C_INK });
      d.y += 5.3;
    }
  });
  d.y += 2;
}
function pNote(d, label, text, size) {
  if (!text || !String(text).trim()) return;
  d.ensure(12);
  if (label) { d.text(PM, d.y + 3, label, { size: 7.8, bold: true, color: C_MUTED }); d.y += 4.2; }
  d.y = d.para(PM, d.y, text, PG_W - PM * 2, { size: size || 8.6 }) + 2.5;
}
function pSignatures(d, leftLabel) {
  d.ensure(30);
  d.y += 16;
  if (leftLabel) {
    d.line(PM, d.y, PM + 66, d.y, C_INK, 0.3);
    d.para(PM, d.y + 1, leftLabel, 66, { size: 8, color: C_MUTED });
  }
  d.line(PG_W - PM - 66, d.y, PG_W - PM, d.y, C_INK, 0.3);
  d.text(PG_W - PM, d.y + 4, 'For ' + bizName(), { size: 8.6, bold: true, align: 'right' });
  d.text(PG_W - PM, d.y + 8, 'Authorised signatory', { size: 7.6, color: C_MUTED, align: 'right' });
  d.y += 12;
}
async function pPhotos(d, items, urls) {
  const list = items.map((it, i) => ({ it, i, url: urls[i] })).filter((e) => e.url).slice(0, 12);
  if (!list.length) return;
  const imgs = await Promise.all(list.map((e) => pdfImage(e.url, 640)));
  const ok = list.map((e, k) => Object.assign(e, { img: imgs[k] })).filter((e) => e.img);
  if (!ok.length) return;
  pHeading(d, 'Design photos');
  const cols = 3, gap = 4, cw = (PG_W - PM * 2 - gap * (cols - 1)) / cols, ch = cw * 0.82;
  for (let k = 0; k < ok.length; k += cols) {
    d.ensure(ch + 9);
    ok.slice(k, k + cols).forEach((e, j) => {
      const x = PM + j * (cw + gap);
      const r = Math.min(cw / e.img.w, ch / e.img.h);
      const w = e.img.w * r, h = e.img.h * r;
      d.rect(x, d.y, cw, ch, [0.975, 0.965, 0.955]);
      d.image(e.img, x + (cw - w) / 2, d.y + (ch - h) / 2, w, h);
      d.text(x, d.y + ch + 3.8, (e.i + 1) + '. ' + [e.it.category, e.it.design_code].filter(Boolean).join(' - '), { size: 7.8, color: C_MUTED });
    });
    d.y += ch + 7.5;
  }
}

/* photos for order lines: own photo, else the catalogue piece's photo */
async function orderItemPhotoUrls(items) {
  const own = items.map((it) => it.photo_path).filter(Boolean);
  const catIds = items.filter((it) => !it.photo_path && it.catalogue_id).map((it) => it.catalogue_id);
  const catPath = new Map();
  if (catIds.length) {
    const { data } = await db.from('catalogue_items').select('id, photo_paths').in('id', catIds);
    (data || []).forEach((c) => { if (c.photo_paths && c.photo_paths[0]) catPath.set(c.id, c.photo_paths[0]); });
  }
  const [u1, u2] = await Promise.all([signedUrls('orders', own), signedUrls('catalogue', Array.from(catPath.values()))]);
  return items.map((it) => it.photo_path ? (u1.get(it.photo_path) || null)
    : (it.catalogue_id && catPath.get(it.catalogue_id) ? (u2.get(catPath.get(it.catalogue_id)) || null) : null));
}

/* challan numbers: reuse the one already given to this order / entry */
async function challanNoFor(kind, orderId, txnId, party, details) {
  let q = db.from('challans').select('challan_no').eq('kind', kind);
  q = orderId ? q.eq('order_id', orderId) : q.eq('karigar_txn_id', txnId);
  const { data } = await q.order('challan_no', { ascending: true }).limit(1);
  if (data && data.length) return data[0].challan_no;
  const ins = await db.from('challans').insert({
    kind, order_id: orderId || null, karigar_txn_id: txnId || null, party_name: party || null, details: details || null, created_by: S.me.id,
  }).select('challan_no').single();
  if (ins.error) throw new Error('challan number');
  return ins.data.challan_no;
}
function dcNo(n) { return 'DC-' + String(n).padStart(4, '0'); }

/* ============================================================
   ORDER DOCUMENTS
   kind: 'slip' | 'quote' | 'challan' (job work return) | 'receipt' (client's gold)
   ============================================================ */
async function buildOrderPdf(orderId, kind) {
  const [or, ir, pr] = await Promise.all([
    db.from('orders').select('*, clients(*)').eq('id', orderId).maybeSingle(),
    db.from('order_items').select('*').eq('order_id', orderId).order('sort', { ascending: true }),
    db.from('order_payments').select('*').eq('order_id', orderId).order('paid_on', { ascending: true }),
  ]);
  if (or.error || !or.data) throw new Error('order');
  const o = or.data, cl = o.clients || {}, items = ir.data || [], pays = pr.data || [];
  if (kind === 'challan') return orderChallanPdf(o, cl, items);
  if (kind === 'receipt') return goldReceiptPdf(o, cl, items);

  const quote = kind === 'quote';
  const meta = [[quote ? 'Quotation no.' : 'Order no.', ordNo(o.order_no)], ['Date', pDate(quote ? todayStr() : o.order_date)]];
  if (quote) meta.push(['Valid till', pDate(ymd(new Date(Date.now() + 7 * 86400000)))]);
  if (o.due_date) meta.push(['Delivery by', pDate(o.due_date)]);
  meta.push(['Type', OTYPE_LABEL[o.order_type] || '']);
  const d = await pdfStart(quote ? 'QUOTATION' : 'ORDER SLIP', meta);

  d.y = pParty(d, PM, d.y, PG_W - PM * 2, quote ? 'QUOTATION FOR' : 'CUSTOMER', clientLines(cl)) + 3;

  const c = orderCalc(o, items);
  const priced = c.total > 0;
  const mline = [
    (o.metal || 'Gold') + (o.purity ? ' ' + pPurity(o.purity) : ''),
    o.order_type !== 'job_work' && num(o.rate_per_g) ? 'Rate ' + pRs(o.rate_per_g) + '/g' : '',
    num(o.making_per_g) ? (o.order_type === 'job_work' ? 'Labour ' : 'Making ') + pRs(o.making_per_g) + '/g' : '',
    num(o.wastage_pct) ? 'Wastage ' + num(o.wastage_pct) + '%' : '',
  ].filter(Boolean).join('   |   ');
  pNote(d, 'METAL', mline);

  const cols = [{ h: '#', w: 7 }, { h: 'Piece', w: 22 }, { h: 'Tag / design', w: 22 }, { h: 'Description', w: 0 },
    { h: 'Qty', w: 10, a: 'right' }, { h: 'Gross (g)', w: 17, a: 'right' }, { h: 'Net (g)', w: 17, a: 'right' }, { h: 'Stones', w: 26 }];
  if (priced) cols.push({ h: 'Amount', w: 24, a: 'right' });
  cols[3].w = PG_W - PM * 2 - cols.reduce((a, x) => a + x.w, 0);
  const rows = items.map((it, i) => {
    const r = [String(i + 1), it.category || '', it.design_code || '', [it.description].concat(jewelPdfBits(it, o.metal)).filter(Boolean).join('; '), String(it.qty || 1),
      it.gross_wt != null ? pG(it.gross_wt) : '', it.net_wt != null ? pG(it.net_wt) : '',
      [it.stone_details, num(it.stone_amount) ? pRs(it.stone_amount) : ''].filter(Boolean).join(' - ')];
    if (priced) r.push(pRs(orderCalc(o, [it]).subtotal));
    return r;
  });
  const tot = ['', 'Total', '', '', String(c.pcs || ''), c.gross ? pG(c.gross) : '', pG(c.net), c.stones ? pRs(c.stones) : ''];
  if (priced) tot.push(pRs(c.subtotal));
  tot.bold = true;
  rows.push(tot);
  pHeading(d, 'Items');
  d.table(cols, rows, { zebra: true });

  if (priced) {
    const t = [];
    if (o.order_type !== 'job_work' && c.metalValue) t.push(['Metal value', pRs(c.metalValue)]);
    if (c.wastageValue) t.push(['Wastage', pRs(c.wastageValue)]);
    if (c.making) t.push([o.order_type === 'job_work' ? 'Labour' : 'Making', pRs(c.making)]);
    if (c.stones) t.push(['Stones', pRs(c.stones)]);
    if (num(o.discount)) t.push(['Discount', '- ' + pRs(o.discount)]);
    if (num(o.gst_pct)) t.push(['GST ' + num(o.gst_pct) + '%', pRs(c.gst)]);
    t.push([quote ? 'Estimated total' : 'Order total', pRs(o.total_amount || c.total), 'total']);
    if (!quote) {
      const disc = pays.filter((p) => p.mode === 'Discount').reduce((a, p) => a + num(p.amount), 0);
      t.push(['Received', pRs(num(o.paid_amount) - disc)]);
      if (disc) t.push(['Settlement discount', '- ' + pRs(disc)]);
      const bal = balanceOf(o);
      t.push(['Balance due', pRs(bal), bal > 0 ? 'due' : 'paid']);
    }
    pTotals(d, t);
  }

  const money = pays.filter((p) => p.mode !== 'Discount');
  if (!quote && money.length) {
    pHeading(d, 'Payments received');
    d.table([{ h: 'Date', w: 30 }, { h: 'Mode', w: 28 }, { h: 'Note', w: PG_W - PM * 2 - 30 - 28 - 32 }, { h: 'Amount', w: 32, a: 'right' }],
      money.map((p) => [pDate(p.paid_on), p.mode || '', p.note || '', pRs(p.amount)]));
  }

  const led = jwLedger(o, c.net);
  if (led) {
    pHeading(d, 'Client\'s gold (job work)');
    d.table([{ h: 'Gold received', w: 60 }, { h: 'Purity', w: 32 }, { h: 'Fine received (g)', w: 30, a: 'right' }, { h: 'Fine used incl. wastage (g)', w: 30, a: 'right' }, { h: 'Balance (g)', w: 30, a: 'right' }],
      [[pG(o.client_metal_g) + ' g' + (o.client_metal_on ? ' on ' + pDate(o.client_metal_on) : ''), pPurity(o.client_metal_purity), pG(led.inFine), pG(led.usedFine), pG(led.bal)]]);
  }

  if (quote) {
    const m = o.metal === 'Silver' ? 'silver' : 'gold';
    pNote(d, '', 'Prices are worked out at the ' + m + ' rate shown above. The final bill uses the ' + m + ' rate on the day of delivery. Weights are approximate until the pieces are made.', 8.2);
  }
  pNote(d, 'NOTES', o.notes);
  if (quote) pNote(d, 'BANK DETAILS', S.biz && S.biz.bank_details);
  pNote(d, 'TERMS', S.biz && S.biz.terms, 7.8);

  const urls = await orderItemPhotoUrls(items);
  await pPhotos(d, items, urls);

  pSignatures(d, quote ? '' : 'Customer\'s signature');
  return { pdf: d, name: safeFileName(ordNo(o.order_no) + ' ' + (cl.trade_name || '') + (quote ? ' - Quotation' : ' - Order slip')) + '.pdf',
    text: (quote ? 'Quotation ' : 'Order slip ') + ordNo(o.order_no) + ' from ' + bizName() };
}

async function orderChallanPdf(o, cl, items) {
  const no = await challanNoFor(o.order_type === 'job_work' ? 'jw_return' : 'delivery', o.id, null, cl.trade_name, { order_no: o.order_no });
  const st = cl.state || stateFromGstin(cl.gstin);
  const d = await pdfStart('DELIVERY CHALLAN', [['Challan no.', dcNo(no)], ['Date', pDate(todayStr())], ['Order ref.', ordNo(o.order_no)]],
    o.order_type === 'job_work' ? 'Return of goods after job work - Rule 55, CGST Rules 2017' : 'Delivery of goods - Rule 55, CGST Rules 2017');
  pTwoParties(d, 'CONSIGNOR (FROM)', bizLines(), 'CONSIGNEE (TO)', clientLines(cl));
  if (st) pNote(d, '', 'Place of supply: ' + st + (stateCodeFor(st, cl.gstin) ? ' (' + stateCodeFor(st, cl.gstin) + ')' : ''));

  const pur = num(o.purity);
  const cols = [{ h: '#', w: 7 }, { h: 'Description of goods', w: 0 }, { h: 'HSN', w: 13 }, { h: 'Qty', w: 10, a: 'right' },
    { h: 'Gross wt (g)', w: 20, a: 'right' }, { h: 'Net wt (g)', w: 20, a: 'right' }, { h: 'Purity', w: 22 }, { h: 'Fine wt (g)', w: 21, a: 'right' }];
  cols[1].w = PG_W - PM * 2 - cols.reduce((a, x) => a + x.w, 0);
  let q = 0, g = 0, n = 0, f = 0;
  const rows = items.map((it, i) => {
    const fine = pur ? num(it.net_wt) * pur / 100 : 0;
    q += Math.max(1, parseInt(it.qty, 10) || 1); g += num(it.gross_wt); n += num(it.net_wt); f += fine;
    return [String(i + 1), [it.category, it.design_code, it.description].filter(Boolean).join(' - ') + (it.stone_details ? ' (stones: ' + it.stone_details + ')' : '') +
      (jewelPdfBits(it, o.metal).length ? '; ' + jewelPdfBits(it, o.metal).join('; ') : ''),
      '7113', String(it.qty || 1), it.gross_wt != null ? pG(it.gross_wt) : '', it.net_wt != null ? pG(it.net_wt) : '', pPurity(o.purity), pur ? pG(fine) : ''];
  });
  const t = ['', 'Total', '', String(q), g ? pG(g) : '', pG(n), '', pur ? pG(f) : ''];
  t.bold = true;
  rows.push(t);
  d.table(cols, rows);

  const led = jwLedger(o, n);
  if (led) {
    pNote(d, 'GOLD ACCOUNT', 'Gold received from you: ' + pG(o.client_metal_g) + ' g at ' + pPurity(o.client_metal_purity) + ' = ' + pG(led.inFine) + ' g fine.  ' +
      'Fine gold in these goods including ' + num(o.wastage_pct) + '% wastage: ' + pG(led.usedFine) + ' g.  ' +
      (Math.abs(led.bal) < 0.0005 ? 'Settled.' : led.bal > 0 ? 'Your gold still with us: ' + pG(led.bal) + ' g fine.' : 'Gold due from you: ' + pG(-led.bal) + ' g fine.'));
  }
  const rate = num(o.rate_per_g);
  if (rate && n) {
    pNote(d, 'VALUE OF GOODS', 'Approximately ' + pRs(n * rate + items.reduce((a, it) => a + num(it.stone_amount), 0)) +
      ' (net weight at ' + pRs(rate) + '/g, plus stones).');
  }
  if (o.order_type === 'job_work') pNote(d, '', 'Job-work (making) charges are billed separately on a tax invoice.', 8.2);
  pNote(d, 'TERMS', S.biz && S.biz.terms, 7.8);
  pSignatures(d, 'Received the above goods in good condition - receiver\'s signature, name and date');
  return { pdf: d, name: safeFileName(dcNo(no) + ' ' + (cl.trade_name || '') + ' - Challan') + '.pdf', text: 'Delivery challan ' + dcNo(no) + ' from ' + bizName() };
}

async function goldReceiptPdf(o, cl, items) {
  if (numOrNull(o.client_metal_g) == null) throw new Error('no gold');
  const d = await pdfStart('GOLD RECEIPT', [['Order ref.', ordNo(o.order_no)], ['Date', pDate(o.client_metal_on || o.order_date)]]);
  d.y = pParty(d, PM, d.y, PG_W - PM * 2, 'RECEIVED FROM', clientLines(cl)) + 3;
  pNote(d, '', 'We have received the following gold from you for making jewellery (job work) under order ' + ordNo(o.order_no) + ':');
  const fine = num(o.client_metal_g) * num(o.client_metal_purity) / 100;
  d.table([{ h: 'Description', w: 82 }, { h: 'Weight (g)', w: 32, a: 'right' }, { h: 'Purity', w: 36 }, { h: 'Fine wt (g)', w: 32, a: 'right' }],
    [['Gold for job work', pG(o.client_metal_g), pPurity(o.client_metal_purity), o.client_metal_purity ? pG(fine) : '']]);
  const pieces = items.map((it) => [it.qty > 1 ? it.qty + ' x' : '', it.category, it.design_code].filter(Boolean).join(' ')).filter(Boolean);
  if (pieces.length) pNote(d, 'TO BE MADE', pieces.join(', '));
  if (num(o.wastage_pct)) pNote(d, 'WASTAGE AGREED', num(o.wastage_pct) + '% of the net weight of the finished jewellery.');
  if (o.due_date) pNote(d, 'EXPECTED DELIVERY', pDate(o.due_date));
  pSignatures(d, 'Client\'s signature');
  return { pdf: d, name: safeFileName(ordNo(o.order_no) + ' ' + (cl.trade_name || '') + ' - Gold receipt') + '.pdf', text: 'Gold receipt for ' + ordNo(o.order_no) + ' from ' + bizName() };
}

/* ============================================================
   KARIGAR ISSUE CHALLAN (gold sent out for job work)
   ============================================================ */
async function buildKarigarChallanPdf(txnId) {
  const { data: t, error } = await db.from('karigar_txns').select('*, karigars(*), orders(order_no)').eq('id', txnId).maybeSingle();
  if (error || !t) throw new Error('entry');
  const k = t.karigars || {};
  const silver = t.metal === 'Silver';
  const no = await challanNoFor('karigar_issue', null, t.id, k.name, { weight_g: t.weight_g, purity: t.purity, metal: silver ? 'Silver' : 'Gold' });
  const meta = [['Challan no.', dcNo(no)], ['Date', pDate(t.txn_date)]];
  if (t.orders && t.orders.order_no) meta.push(['Order ref.', ordNo(t.orders.order_no)]);
  const d = await pdfStart('DELIVERY CHALLAN', meta, 'Goods sent for job work - Section 143, CGST Act 2017');
  pTwoParties(d, 'CONSIGNOR (FROM)', bizLines(), 'JOB WORKER (TO)',
    [k.name, k.address, k.city, k.gstin ? 'GSTIN: ' + k.gstin : '', k.phone ? 'Mobile: ' + k.phone : '']);
  const cols = [{ h: '#', w: 7 }, { h: 'Description of goods', w: 0 }, { h: 'HSN', w: 14 }, { h: 'Weight (g)', w: 24, a: 'right' }, { h: 'Purity', w: 30 }, { h: 'Fine wt (g)', w: 24, a: 'right' }];
  cols[1].w = PG_W - PM * 2 - cols.reduce((a, x) => a + x.w, 0);
  d.table(cols, [['1', (silver ? 'Silver' : 'Gold') + ' for making jewellery' + (t.note ? ' - ' + t.note : ''), silver ? '7106' : '7108', pG(t.weight_g), pPurity(t.purity), pG(t.fine_g)]]);
  pNote(d, 'PURPOSE', 'Job work - making of jewellery. The goods remain our property and are to be returned after the job work, with any scrap / dust.');
  pSignatures(d, 'Karigar\'s signature');
  return { pdf: d, name: safeFileName(dcNo(no) + ' ' + (k.name || '') + ' - Karigar challan') + '.pdf', text: 'Job work challan ' + dcNo(no) };
}

/* ============================================================
   STATEMENTS
   ============================================================ */
async function buildClientStatementPdf(clientId) {
  const cl = await fetchClient(clientId);
  if (!cl) throw new Error('client');
  const L = await clientLedgerData(clientId);
  const T = L.totals;
  const d = await pdfStart('ACCOUNT STATEMENT', [['Date', pDate(todayStr())], ['Orders', String(L.live.length)]]);
  d.y = pParty(d, PM, d.y, PG_W - PM * 2, 'CUSTOMER', clientLines(cl)) + 3;
  const tot = [];
  if (T.opening) tot.push(['Opening balance', pRs(T.opening)]);
  tot.push(['Total of orders', pRs(T.business)]);
  if (T.charges) tot.push(['Other charges', pRs(T.charges)]);
  if (T.refunds) tot.push(['Refunds paid', pRs(T.refunds)]);
  tot.push(['Received', pRs(T.received)]);
  if (T.discount) tot.push(['Discount', pRs(T.discount)]);
  tot.push(Math.abs(T.due) < 1 ? ['Account clear', 'Rs. 0', 'total'] : [T.due <= -1 ? 'Advance with us' : 'Balance due', pRs(Math.abs(T.due)), 'total']);
  pTotals(d, tot);
  if (L.entries.length) {
    pHeading(d, 'Account statement');
    const cols = [{ h: 'Date', w: 24 }, { h: 'Particulars', w: 0 }, { h: 'Debit', w: 27, a: 'right' }, { h: 'Credit', w: 27, a: 'right' }, { h: 'Balance', w: 32, a: 'right' }];
    cols[1].w = PG_W - PM * 2 - cols.reduce((a, x) => a + x.w, 0);
    d.table(cols, L.entries.map((e) => [pDate(e.date), e.text, e.debit ? pRs(e.debit) : '', e.credit ? pRs(e.credit) : '',
      Math.abs(e.bal) < 1 ? 'Clear' : pRs(Math.abs(e.bal)) + (e.bal > 0 ? ' Dr' : ' Cr')]), { zebra: true, size: 8.4 });
  }
  if (L.gold.length) {
    pHeading(d, 'Gold account (job work)');
    const rows = L.gold.map((g) => [ordNo(g.o.order_no), pDate(g.o.order_date), pG(g.led.inFine), pG(g.led.usedFine), pG(g.led.bal)]);
    const t = ['Total', '', pG(T.goldIn), pG(T.goldUsed), pG(T.goldBal)];
    t.bold = true;
    rows.push(t);
    d.table([{ h: 'Order', w: 26 }, { h: 'Date', w: 30 }, { h: 'Fine gold received (g)', w: 42, a: 'right' }, { h: 'Fine gold used (g)', w: 42, a: 'right' }, { h: 'Balance (g)', w: 42, a: 'right' }], rows);
    pNote(d, '', T.goldBal > 0.0005 ? 'Your gold with us: ' + pG(T.goldBal) + ' g fine.' : T.goldBal < -0.0005 ? 'Gold due from you: ' + pG(-T.goldBal) + ' g fine.' : 'Gold account settled.');
  }
  pNote(d, '', 'Dr = amount due from you, Cr = advance with us. Please check this statement and let us know of any difference. Thank you for your business.', 8.2);
  pSignatures(d, '');
  return { pdf: d, name: safeFileName((cl.trade_name || 'Client') + ' - Statement ' + todayStr()) + '.pdf', text: 'Account statement from ' + bizName() };
}

async function buildKarigarStatementPdf(karigarId) {
  const K = await karigarData(karigarId);
  if (!K.k) throw new Error('karigar');
  const k = K.k;
  const d = await pdfStart('KARIGAR STATEMENT', [['Date', pDate(todayStr())], ['Entries', String(K.txns.length)]]);
  d.y = pParty(d, PM, d.y, PG_W - PM * 2, 'KARIGAR', [k.name, k.address, k.city, k.gstin ? 'GSTIN: ' + k.gstin : '', k.phone ? 'Mobile: ' + k.phone : '']) + 3;
  const B = K.bal;
  const tot = [['Fine gold issued', pG(B.issued) + ' g'], ['Fine gold received back', pG(B.received) + ' g'], ['Wastage allowed', pG(B.wastage) + ' g'],
    ['Gold with karigar (fine)', pG(B.gold) + ' g', 'total']];
  if (B.hasSilver) tot.push(['Fine silver issued', pG(B.Silver.issued) + ' g'], ['Fine silver received back', pG(B.Silver.received) + ' g'],
    ['Silver wastage allowed', pG(B.Silver.wastage) + ' g'], ['Silver with karigar (fine)', pG(B.silver) + ' g', 'total']);
  tot.push(['Labour total', pRs(B.labour)], ['Paid', pRs(B.paid)], ['Labour payable', pRs(B.payable), 'total']);
  pTotals(d, tot);
  const cols = (balHead) => [{ h: 'Date', w: 24 }, { h: 'Entry', w: 22 }, { h: 'Weight (g)', w: 19, a: 'right' }, { h: 'Purity', w: 22 }, { h: 'Fine (g)', w: 18, a: 'right' },
    { h: 'Amount', w: 22, a: 'right' }, { h: 'Order / note', w: 35 }, { h: balHead, w: 20, a: 'right' }];
  const ref = (t) => {
    const on = t.orders && t.orders.order_no ? ordNo(t.orders.order_no) : '';
    if (t.auto && t.note && on && t.note.indexOf(on) === 0) return t.note;   // entries from an order already start with its number
    return [on, t.note || ''].filter(Boolean).join(' - ');
  };
  const metalRows = (list) => {
    let run = 0;
    return list.map((t) => {
      const s = KTXN_SIGN[t.kind] || 0;
      if (s) run += s * num(t.fine_g);
      return [pDate(t.txn_date), KTXN_LABEL[t.kind] || t.kind, t.weight_g != null ? pG(t.weight_g) : '', t.purity != null && t.kind !== 'wastage' ? pPurity(t.purity) : '',
        s ? pG(t.fine_g) : '', t.amount != null ? pRs(t.amount) : '', ref(t), s ? pG(run) : ''];
    });
  };
  const all = K.txns.slice().reverse();
  if (!B.hasSilver) {
    pHeading(d, 'Entries');
    d.table(cols('Gold bal. (g)'), metalRows(all.filter((t) => txnMetal(t) === 'Gold' || !KTXN_SIGN[t.kind])), { zebra: true, size: 8 });
  } else {
    pHeading(d, 'Gold entries');
    d.table(cols('Gold bal. (g)'), metalRows(all.filter((t) => KTXN_SIGN[t.kind] && txnMetal(t) === 'Gold')), { zebra: true, size: 8 });
    pHeading(d, 'Silver entries');
    d.table(cols('Silver bal. (g)'), metalRows(all.filter((t) => KTXN_SIGN[t.kind] && txnMetal(t) === 'Silver')), { zebra: true, size: 8 });
    const money = all.filter((t) => !KTXN_SIGN[t.kind]);
    if (money.length) {
      pHeading(d, 'Labour and payments');
      d.table(cols(''), metalRows(money), { zebra: true, size: 8 });
    }
  }
  pSignatures(d, 'Karigar\'s signature');
  return { pdf: d, name: safeFileName((k.name || 'Karigar') + ' - Statement ' + todayStr()) + '.pdf', text: 'Karigar statement from ' + bizName() };
}

/* ---------------- make → share / download ---------------- */
async function makeAndOfferPdf(builder) {
  const ov = document.createElement('div');
  ov.className = 'scan-overlay';
  ov.innerHTML = '<div class="spinner"></div><div>Preparing PDF…</div>';
  document.body.appendChild(ov);
  let res;
  try { res = await builder(); }
  catch (e) {
    ov.remove();
    toast(e && e.message === 'no gold' ? 'Record the client\'s gold on the order first (Edit).' : 'Could not make the PDF — try again.', 'err');
    return;
  }
  const blob = res.pdf.blob();
  ov.remove();
  const file = new File([blob], res.name, { type: 'application/pdf' });
  const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
  const m = openModal('<h3>PDF ready</h3><p>' + esc(res.name) + ' · ' + Math.max(1, Math.round(blob.size / 1024)) + ' KB</p>' +
    '<div style="display:flex;flex-direction:column;gap:10px">' +
    (canShare ? '<button class="btn btn-primary" data-m="share">Share (WhatsApp, email…)</button>' : '') +
    '<button class="btn ' + (canShare ? 'btn-secondary' : 'btn-primary') + '" data-m="dl">Download</button>' +
    '<button class="btn btn-ghost" data-m="no">Close</button></div>');
  if (canShare) m.querySelector('[data-m=share]').onclick = async () => {
    try { await navigator.share({ files: [file], title: res.name, text: res.text || '' }); closeModal(); }
    catch (e) { if (!(e && e.name === 'AbortError')) { downloadBlob(blob, res.name); closeModal(); toast('PDF downloaded ✓', 'ok'); } }
  };
  m.querySelector('[data-m=dl]').onclick = () => { downloadBlob(blob, res.name); closeModal(); toast('PDF downloaded ✓', 'ok'); };
  m.querySelector('[data-m=no]').onclick = closeModal;
}

onAct('d-order', (el) => makeAndOfferPdf(() => buildOrderPdf(el.dataset.id, el.dataset.kind)));
onAct('d-client', (el) => makeAndOfferPdf(() => buildClientStatementPdf(el.dataset.id)));
onAct('d-karigar', (el) => makeAndOfferPdf(() => buildKarigarStatementPdf(el.dataset.id)));
onAct('d-kchallan', (el) => makeAndOfferPdf(() => buildKarigarChallanPdf(el.dataset.id)));
