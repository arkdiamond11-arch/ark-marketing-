/* ============================================================
   WORKSHOP — job cards with a QR code (order page → Documents),
   QR stickers for catalogue pieces, the workload calendar (Orders →
   Workload), the karigar report card (karigar page, Reports) and
   the karigar's own link (database update 14: his jobs with designs,
   CAD, sizes and the date to give back; he taps "Ready").
   Loaded after qr.js. No amounts anywhere — weights and dates.
   ============================================================ */
'use strict';

function karigarLinkOn() { return !!S.dbv14 && appOn('karigars'); }

/* ---------------- job card (PDF) ---------------- */
async function buildJobCardPdf(orderId) {
  const [or, ir] = await Promise.all([
    db.from('orders').select('*').eq('id', orderId).maybeSingle(),
    db.from('order_items').select('*').eq('order_id', orderId).order('sort', { ascending: true }),
  ]);
  if (or.error || !or.data) throw new Error('order');
  const o = or.data, items = ir.data || [];
  const back = o.karigar_due || o.due_date;
  const meta = [['Order no.', ordNo(o.order_no)], ['Date', pDate(o.order_date)]];
  if (back) meta.push([o.karigar_due ? 'Give back by' : 'Delivery by', pDate(back)]);
  meta.push(['Type', OTYPE_LABEL[o.order_type] || '']);
  const d = await pdfStart('JOB CARD', meta);
  // the details on the left, the QR on the right
  const qw = 36, top = d.y;
  QR.pdf(d, qrOrderUrl(o.id), PG_W - PM - qw, top - 2, qw);
  d.text(PG_W - PM - qw / 2, top + qw + 0.5, 'Scan: opens the order in the app', { size: 6.6, color: C_MUTED, align: 'center' });
  const w = PG_W - PM * 2 - qw - 8;
  let y = top;
  const row = (k, v) => {
    if (!v) return;
    d.text(PM, y + 3.4, k, { size: 8, color: C_MUTED });
    y = d.para(PM + 34, y, v, w - 34, { size: 10, bold: true }) + 1.2;
  };
  row('Metal', (o.metal || 'Gold') + (o.purity ? ' ' + pPurity(o.purity) : ''));
  row('Step now', OSTATUS_LABEL[o.status] || '');
  row('Karigar', o.karigar_name || '');
  row('Metal given', o.karigar_issued_g != null ? pG(o.karigar_issued_g) + ' g' + (o.karigar_issued_on ? ' on ' + pDate(o.karigar_issued_on) : '') : '');
  row('Received back', o.karigar_received_g != null ? pG(o.karigar_received_g) + ' g' + (o.karigar_received_on ? ' on ' + pDate(o.karigar_received_on) : '') : '');
  d.y = Math.max(y, top + qw + 4) + 2;
  const cols = [{ h: '#', w: 7 }, { h: 'Piece', w: 22 }, { h: 'Tag / design', w: 24 }, { h: 'Details', w: 0 },
    { h: 'Qty', w: 10, a: 'right' }, { h: 'Size', w: 14 }, { h: 'Net (g)', w: 17, a: 'right' }, { h: 'Stones', w: 30 }];
  cols[3].w = PG_W - PM * 2 - cols.reduce((a, x) => a + x.w, 0);
  const rows = items.map((it, i) => [String(i + 1), it.category || '', it.design_code || '', [it.description].concat(jewelPdfBits(it, o.metal)).filter(Boolean).join('; '),
    String(it.qty || 1), it.size || '', it.net_wt != null ? pG(it.net_wt) : '', it.stone_details || '']);
  pHeading(d, 'Items');
  d.table(cols, rows.length ? rows : [['', '', '', 'No items yet', '', '', '', '']], { zebra: true });
  pNote(d, 'NOTES', o.notes);
  // the CAD (pictures) and the design photos
  const cad = (o.cad_paths || []).filter((p) => p && !/\.pdf$/i.test(p)).slice(0, 3);
  if (cad.length) {
    const m = await signedUrls('orders', cad);
    const imgs = (await Promise.all(cad.map((p) => (m.get(p) ? pdfImage(m.get(p), 900) : null)))).filter(Boolean);
    if (imgs.length) {
      pHeading(d, 'CAD');
      const gap = 4, cw = (PG_W - PM * 2 - gap * 2) / 3, ch = cw;
      d.ensure(ch + 4);
      imgs.forEach((im, j) => {
        const x = PM + j * (cw + gap), r = Math.min(cw / im.w, ch / im.h), iw = im.w * r, ih = im.h * r;
        d.rect(x, d.y, cw, ch, [0.975, 0.965, 0.955]);
        d.image(im, x + (cw - iw) / 2, d.y + (ch - ih) / 2, iw, ih);
      });
      d.y += ch + 5;
    }
  }
  await pPhotos(d, items, await orderItemPhotoUrls(items));
  return { pdf: d, name: safeFileName(ordNo(o.order_no) + ' - Job card') + '.pdf', text: 'Job card ' + ordNo(o.order_no) + ' — ' + bizName() };
}
onAct('d-jobcard', (el) => makeAndOfferPdf(() => buildJobCardPdf(el.dataset.id)));

/* ---------------- QR stickers for catalogue pieces (A4, 24 labels: 63.5 × 33.9 mm) ---------------- */
const STK = { w: 63.5, h: 33.9, px: 66.04, top: 12.9, left: 6.47, cols: 3, rows: 8 };
function stickerLines(c) {
  const wt = [c.gross_wt != null ? 'G ' + pG(c.gross_wt) : '', c.net_wt != null ? 'N ' + pG(c.net_wt) : ''].filter(Boolean).join('  ');
  return [
    [c.category, c.title].filter(Boolean).join(' - '),
    (c.metal || 'Gold') + (c.purity ? ' ' + (purityKey(c.purity) || num(c.purity) + '%') : '') + (c.metal_color ? ' ' + c.metal_color : ''),
    wt ? wt + ' g' : '',
    c.diamond_type ? diamondLabel(c.diamond_type) + (num(c.diamond_ct) ? ' ' + fmtCtS(c.diamond_ct) + ' ct' : '') : '',
  ].filter(Boolean);
}
function fmtCtS(x) { return String(Math.round(num(x) * 100) / 100); }
function buildStickersPdf(pieces, startAt) {
  const d = new PDF();
  d.footerText = bizName() + ' · QR stickers · ' + fmtDLong(todayStr());
  let slot = Math.max(0, Math.min(23, +startAt || 0));
  pieces.forEach((c, n) => {
    if (slot >= STK.cols * STK.rows) { d.addPage(); slot = 0; }
    const col = slot % STK.cols, rw = Math.floor(slot / STK.cols);
    const x = STK.left + col * STK.px, y = STK.top + rw * STK.h;
    d.rect(x, y, STK.w, STK.h, null, [0.86, 0.84, 0.82]);
    const q = STK.h - 5;
    QR.pdf(d, qrPieceUrl(c.id), x + 1.5, y + 2.5, q);
    const tx = x + q + 3.5, tw = STK.w - q - 5;
    let ty = y + 4.8;
    d.text(tx, ty, c.tag_no || 'Design', { size: 11, bold: true, color: C_MAROON });
    ty += 1.2;
    stickerLines(c).slice(0, 4).forEach((ln) => { ty = d.para(tx, ty, ln, tw, { size: 7.2 }); });
    d.text(tx, y + STK.h - 2.4, bizName(), { size: 6, color: C_MUTED });
    slot++;
  });
  return d;
}
async function catStickers(ids, all) {   // all: every piece in stock (from Departments), not the pieces shown now
  let pieces = [];
  if (ids && ids.length) {
    const { data } = await db.from('catalogue_items').select('*').in('id', ids);
    pieces = data || [];
  } else {
    const { data } = await catQuery((!all && S.cat) || { q: '', status: 'available', cat: 'all' }, false);
    pieces = data || [];
  }
  if (!pieces.length) { toast('No pieces here to print.', 'err'); return; }
  pieces.sort((a, b) => String(a.tag_no || '').localeCompare(String(b.tag_no || ''), 'en', { numeric: true }));
  const one = pieces.length === 1;
  const ov = openModal('<h3>QR stickers</h3><p>' + (one ? esc('One sticker for') + ' <b class="noi18n">' + esc(pieces[0].tag_no || '—') + '</b>' : '<b>' + pieces.length + '</b> ' + esc(all ? 'stickers — every piece in stock' : 'stickers — the pieces shown now')) + '</p>' +
    '<p class="hint">' + esc('A4 sheet of 24 labels (63.5 × 33.9 mm), or plain paper to cut. Scanning a sticker opens the piece in the app.') + '</p>' +
    '<div class="field"><label>Start at label no.</label><input type="number" id="stk-start" min="1" max="24" value="1" inputmode="numeric">' +
    '<div class="hint">On a part-used sheet, start at the first free label.</div></div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Make PDF</button></div>');
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = () => {
    const start = Math.max(1, Math.min(24, parseInt($('#stk-start').value, 10) || 1)) - 1;
    closeModal();
    makeAndOfferPdf(async () => ({ pdf: buildStickersPdf(pieces, start), name: safeFileName('QR stickers ' + (one ? pieces[0].tag_no || '' : pieces.length + ' pieces') + ' ' + todayStr()) + '.pdf',
      text: 'QR stickers — ' + bizName() }));
  };
}
onAct('cat-stickers', () => catStickers(null));
onAct('cat-sticker', (el) => catStickers([el.dataset.id]));

/* ---------------- workload calendar ---------------- */
function wlMonday(ds) { const d = new Date(ds + 'T00:00:00'); const k = (d.getDay() + 6) % 7; d.setDate(d.getDate() - k); return ymd(d); }
function wlAdd(ds, n) { const d = new Date(ds + 'T00:00:00'); d.setDate(d.getDate() + n); return ymd(d); }
async function workloadData() {
  const cols = 'id, order_no, status, order_type, due_date, karigar_id, karigar_name' + (S.dbv14 ? ', karigar_due, karigar_ready_at' : '') + (S.dbv6 ? ', vendor_id' : '') + ', clients(trade_name, city)';
  const [orders, reps] = await Promise.all([
    fetchPaged(() => db.from('orders').select(cols).in('status', OPEN_STATUSES).order('id', { ascending: true })),
    typeof repairsOn === 'function' && repairsOn()
      ? fetchPaged(() => db.from('repairs').select('id, repair_no, piece, status, due_date, clients(trade_name)').in('status', ['received', 'at_work']).order('id', { ascending: true })).catch(() => [])
      : Promise.resolve([]),
  ]);
  return { orders, reps };
}
async function renderWorkload() {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  let D;
  try { D = await workloadData(); } catch (e) { c.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  S.wl = Object.assign({ sel: todayStr(), by: 'due' }, S.wl || {}, { D });
  drawWorkload();
}
function wlDate(o) { return S.wl.by === 'karigar' ? (o.karigar_due || null) : (o.due_date || null); }
function drawWorkload() {
  const W = S.wl, D = W.D, c = $('#content');
  if (!c || !D) return;
  const t = todayStr(), start = wlMonday(t), end = wlAdd(start, 41);
  const byDay = new Map();
  const add = (ds, x) => { if (!byDay.has(ds)) byDay.set(ds, []); byDay.get(ds).push(x); };
  const late = [];
  D.orders.forEach((o) => {
    const ds = wlDate(o);
    if (!ds) return;
    if (ds < t) late.push({ o });
    else if (ds <= end) add(ds, { o });
  });
  if (W.by !== 'karigar') D.reps.forEach((r) => { if (r.due_date && r.due_date >= t && r.due_date <= end) add(r.due_date, { r }); else if (r.due_date && r.due_date < t) late.push({ r }); });
  const noDate = D.orders.filter((o) => !wlDate(o)).length;
  const max = Math.max(1, ...Array.from(byDay.values()).map((l) => l.length));
  const heads = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  let grid = '<div class="wl-grid">' + heads.map((h) => '<div class="wl-h">' + h + '</div>').join('');
  for (let i = 0; i < 42; i++) {
    const ds = wlAdd(start, i), n = (byDay.get(ds) || []).length;
    const lvl = n ? Math.min(4, Math.ceil(n / max * 4)) : 0;
    grid += '<button type="button" class="wl-d lv' + lvl + (ds === t ? ' today' : '') + (ds === W.sel ? ' sel' : '') + (ds < t ? ' past' : '') + '" data-action="wl-day" data-d="' + ds + '"' + (ds < t ? ' disabled' : '') + '>' +
      '<span class="wl-n">' + new Date(ds + 'T00:00:00').getDate() + (new Date(ds + 'T00:00:00').getDate() === 1 || i === 0 ? '<small>' + esc(new Date(ds + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short' })) + '</small>' : '') + '</span>' +
      (n ? '<b>' + n + '</b>' : '') + '</button>';
  }
  grid += '</div>';
  const rowHTML = (x) => x.o
    ? '<div class="list-item" data-action="o-open" data-id="' + x.o.id + '"><div class="li-main"><div class="li-title">' + esc(ordNo(x.o.order_no) + ' · ' + ((x.o.clients || {}).trade_name || '')) + '</div>' +
      '<div class="li-sub">' + esc([OSTATUS_LABEL[x.o.status], x.o.karigar_name ? '🔨 ' + x.o.karigar_name : '', wlDate(x.o) && wlDate(x.o) < t ? dueLabel(wlDate(x.o)) : ''].filter(Boolean).join(' · ')) + '</div>' +
      (x.o.karigar_ready_at ? '<div class="li-chips"><span class="chip ro-due">' + esc('Karigar says ready') + '</span></div>' : '') + '</div><div class="li-go">›</div></div>'
    : '<div class="list-item" data-action="rp-open" data-id="' + x.r.id + '"><div class="li-main"><div class="li-title">' + esc(repNo(x.r.repair_no) + ' · ' + ((x.r.clients || {}).trade_name || '')) + '</div>' +
      '<div class="li-sub">' + esc(['🔧 ' + (x.r.piece || 'Repair'), x.r.due_date < t ? dueLabel(x.r.due_date) : ''].filter(Boolean).join(' · ')) + '</div></div><div class="li-go">›</div></div>';
  const sel = W.sel === 'late' ? late : (byDay.get(W.sel) || []);
  // per karigar: jobs in work, due this week, late
  const kg = new Map();
  D.orders.forEach((o) => {
    if (!o.karigar_name) return;
    const k = o.karigar_name, x = kg.get(k) || { k, n: 0, week: 0, late: 0 };
    x.n++;
    const ds = o.karigar_due || o.due_date;
    if (ds && ds < t) x.late++; else if (ds && ds <= wlAdd(t, 6)) x.week++;
    kg.set(k, x);
  });
  const kList = Array.from(kg.values()).sort((a, b) => b.n - a.n || a.k.localeCompare(b.k));
  c.innerHTML =
    (S.dbv14 ? '<div class="filter-chips">' + [['due', 'Delivery dates'], ['karigar', 'Karigar dates']].map((x) =>
      '<button class="' + (W.by === x[0] ? 'on' : '') + '" data-action="wl-by" data-v="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>' : '') +
    (late.length ? '<button type="button" class="wl-late' + (W.sel === 'late' ? ' sel' : '') + '" data-action="wl-day" data-d="late">' + esc('⚠ Late: ' + late.length) + ' ›</button>' : '') +
    '<div class="card wl-card">' + grid + '<div class="hint wl-hint">' + esc(D.orders.length + ' orders in work' + (noDate ? ' · ' + noDate + ' without a date' : '')) + '</div></div>' +
    '<div class="section-label">' + esc(W.sel === 'late' ? 'Late' : fmtDLong(W.sel)) + ' (' + sel.length + ')</div>' +
    (sel.length ? sel.map(rowHTML).join('') : '<div class="empty" style="padding:14px">Nothing due this day.</div>') +
    (kList.length ? '<div class="section-label">By karigar</div><div class="card rep-gtable"><div class="rep-grow rep-ghead"><span>Karigar</span><span>In work</span><span>This week</span><span>Late</span></div>' +
      kList.map((x) => '<div class="rep-grow"><span class="noi18n">' + esc(x.k) + '</span><span>' + x.n + '</span><span>' + x.week + '</span><span' + (x.late ? ' class="o-red"' : '') + '>' + x.late + '</span></div>').join('') + '</div>' : '');
}
onAct('wl-open', () => showSub('Workload', renderWorkload));
onAct('wl-day', (el) => { if (!S.wl) return; S.wl.sel = el.dataset.d; drawWorkload(); });
onAct('wl-by', (el) => { if (!S.wl) return; S.wl.by = el.dataset.v; drawWorkload(); });

/* ---------------- karigar report card ---------------- */
/* orders: karigar_id, karigar_issued_g / _on, karigar_received_g / _on, due_date[, karigar_due], status
   → per karigar: jobs back in the period, average days, on time, metal loss; jobs with him now */
function karigarCardOf(orders, from, to) {
  const t = todayStr();
  const done = orders.filter((o) => o.karigar_received_on && (!from || o.karigar_received_on >= from) && (!to || o.karigar_received_on <= to)
    && o.karigar_issued_g != null && o.karigar_received_g != null);
  const days = done.filter((o) => o.karigar_issued_on).map((o) => Math.max(0, daysBetween(o.karigar_issued_on, o.karigar_received_on)));
  const withDue = done.filter((o) => o.karigar_due || o.due_date);
  const onTime = withDue.filter((o) => o.karigar_received_on <= (o.karigar_due || o.due_date)).length;
  const given = done.reduce((a, o) => a + num(o.karigar_issued_g), 0), back = done.reduce((a, o) => a + num(o.karigar_received_g), 0);
  const now = orders.filter((o) => ['quote', 'declined', 'cancelled', 'delivered'].indexOf(o.status) < 0 &&
    (['new', 'cad', 'wax', 'in_production', 'setting'].indexOf(o.status) > -1 || (o.karigar_issued_g != null && o.karigar_received_g == null)));
  const oldest = now.filter((o) => o.karigar_issued_on && o.karigar_received_g == null).map((o) => daysBetween(o.karigar_issued_on, t));
  return {
    n: done.length, avg: days.length ? days.reduce((a, x) => a + x, 0) / days.length : null,
    onTime: withDue.length ? Math.round(onTime / withDue.length * 100) : null, withDue: withDue.length,
    loss: given > 0 ? (given - back) / given * 100 : null, lossG: given - back,
    now: now.length, late: now.filter((o) => (o.karigar_due || o.due_date) && (o.karigar_due || o.due_date) < t).length,
    oldest: oldest.length ? Math.max(...oldest) : null,
  };
}
function fmt1(x) { return (Math.round(x * 10) / 10).toLocaleString('en-IN', { maximumFractionDigits: 1 }); }
function karigarCardHTML(k) {
  const tile = (v, label, cls) => '<div class="stat"><div class="st-num o-num-sm' + (cls ? ' ' + cls : '') + '">' + esc(v) + '</div><div class="st-label">' + esc(label) + '</div></div>';
  return '<div class="stat-row kc-tiles">' +
    tile(String(k.n), 'Jobs back') +
    tile(k.avg == null ? '—' : fmt1(k.avg), 'Days per job') +
    tile(k.onTime == null ? '—' : k.onTime + '%', 'On time') +
    tile(k.loss == null ? '—' : fmt1(k.loss) + '%', 'Metal loss', k.loss != null && k.loss > 5 ? 'o-red' : '') + '</div>' +
    '<div class="hint kc-now">' + esc((k.now ? k.now + (k.now === 1 ? ' job with him now' : ' jobs with him now') : 'No job with him now') +
      (k.late ? ' · ' + k.late + ' late' : '') + (k.oldest != null ? ' · oldest metal out ' + k.oldest + ' days' : '')) + '</div>';
}
async function loadKarigarCard(karigarId) {
  const el = $('#k-card');
  if (!el) return;
  const { data, error } = await db.from('orders').select('id, status, due_date, karigar_issued_g, karigar_issued_on, karigar_received_g, karigar_received_on' + (S.dbv14 ? ', karigar_due' : ''))
    .eq('karigar_id', karigarId).limit(3000);
  if (!$('#k-card') || error) return;
  const from = todayStr(-90);
  el.innerHTML = '<div class="section-label">Report card — last 3 months</div><div class="card">' + karigarCardHTML(karigarCardOf(data || [], from, todayStr())) + '</div>';
}

/* ---------------- the karigar's own link (update 14) ---------------- */
function karigarLinkUrl(token) { return new URL('karigar.html#' + token, location.href).href; }
async function openKarigarLink(karigarId) {
  if (!karigarLinkOn()) return;
  const K = S.kpage && S.kpage.k && S.kpage.k.id === karigarId ? S.kpage.k : null;
  let token = null;
  try {
    const { data, error } = await db.rpc('karigar_share_link', { p_karigar: karigarId, p_on: true });
    token = !error && data ? data : null;
  } catch (e) { token = null; }
  if (!token) { toast('Could not make the link — try again.', 'err'); return; }
  const url = karigarLinkUrl(token);
  const name = (K && K.name) || 'The karigar';
  const text = 'Namaste ' + (K ? K.name : '') + ' 🙏\nYour jobs from us — designs, CAD, sizes and the date to give back — all on one page. Tap "Ready" when a job is done:\n' + url + '\n— ' + bizName();
  const m = openModal('<h3>Karigar\'s link</h3>' +
    '<p>' + esc(name) + ' can open this page any time to see the jobs he has from you — designs, CAD, sizes, weights and the date to give back — and tap "Ready" when one is done. No shop names on it. Turn it off any time.</p>' +
    '<div class="hint" id="kl-seen"></div>' +
    '<div class="sl-url noi18n">' + esc(url) + '</div>' +
    '<div class="fin-ask"><button class="btn btn-primary" data-m="wa">Send on WhatsApp</button>' +
    '<button class="btn btn-secondary" data-m="open">Open the page</button>' +
    '<button class="btn btn-secondary" data-m="copy">Copy the link</button>' +
    '<button class="btn btn-ghost" data-m="off">Turn the link off</button>' +
    '<button class="btn btn-ghost" data-m="no">Close</button></div>');
  if (typeof seenOf === 'function') seenOf('karigar', karigarId).then((v) => { const el = $('#kl-seen'); if (el && v) el.textContent = seenText(v); });
  m.querySelector('[data-m=wa]').onclick = () => { openWa(K && K.phone, text); closeModal(); };
  m.querySelector('[data-m=open]').onclick = () => { window.open(url, '_blank'); };
  m.querySelector('[data-m=copy]').onclick = async () => {
    try { await navigator.clipboard.writeText(url); toast('Link copied ✓', 'ok'); }
    catch (e) { toast('Could not copy — press and hold the link to copy it.', 'err'); }
  };
  m.querySelector('[data-m=off]').onclick = () => {
    closeModal();
    confirmModal('Turn the karigar\'s link off?', 'The link will stop working. Making it again gives a new link.', 'Turn off', async () => {
      let ok = false;
      try { const { error } = await db.rpc('karigar_share_link', { p_karigar: karigarId, p_on: false }); ok = !error; } catch (e) { ok = false; }
      toast(ok ? 'Link turned off ✓' : 'Could not turn it off — try again.', ok ? 'ok' : 'err');
    }, true);
  };
  m.querySelector('[data-m=no]').onclick = closeModal;
}
onAct('k-link', (el) => openKarigarLink(el.dataset.id));
