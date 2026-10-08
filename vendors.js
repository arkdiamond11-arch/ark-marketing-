/* ============================================================
   VENDORS — the people / companies who make your orders (D2B).
   Each order can have a vendor. On the order page you list the
   diamonds you have to find and give the vendor — type, shape,
   size, colour, purity, pieces, carats — and mark each one given.
   A vendor's page shows their orders in work and the diamonds
   still to give them.
   Needs database update 06 (vendors, order_diamonds); until it
   is run, S.dbv6 is false and these screens stay hidden.
   ============================================================ */
'use strict';

const DIA_SHAPES = ['Round', 'Princess', 'Oval', 'Pear', 'Marquise', 'Emerald', 'Cushion', 'Heart', 'Baguette', 'Taper', 'Radiant', 'Asscher', 'Trillion', 'Other'];
const DIA_COLORS = ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'EF', 'FG', 'GH', 'HI', 'IJ', 'Fancy'];
const DIA_CLARITY = ['FL', 'IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2', 'I1', 'VVS', 'VS', 'SI'];

async function loadVendors() {
  const get = () => db.from('vendors').select('*').order('name', { ascending: true });
  let r = await get();
  if (r.error && !dbObjMissing(r.error)) { await new Promise((ok) => setTimeout(ok, 1200)); r = await get(); }   // network blip — once more
  S.dbv6 = !r.error;          // false until the database update (06) is run
  S.vendors = (!r.error && r.data) || [];
  return S.vendors;
}
/* the table / column is not there yet (database update not run) */
function dbObjMissing(error) {
  const c = String((error && error.code) || '');
  return c === '42P01' || c === 'PGRST205' || c === '42703' || c === 'PGRST204';
}
function vendorById(id) { return (S.vendors || []).find((v) => v.id === id) || null; }
function vendorName(id) { const v = vendorById(id); return v ? v.name : ''; }
function vendorOptionsHTML(sel) {
  const list = (S.vendors || []).filter((v) => v.active || v.id === sel);
  return '<option value="">— Not chosen yet —</option>' +
    list.map((v) => '<option value="' + esc(v.id) + '"' + (v.id === sel ? ' selected' : '') + '>' + esc(v.name) + '</option>').join('') +
    '<option value="__new">＋ Add new vendor…</option>';
}

/* one line describing a diamond requirement */
function diamondNeedLine(d) {
  const a = [d.shape, d.size, d.dtype ? diamondLabel(d.dtype) : ''].filter(Boolean).join(' · ');
  const b = [d.color ? 'Colour ' + d.color : '', d.clarity ? 'Purity ' + d.clarity : '', d.pcs ? d.pcs + ' pcs' : '',
    num(d.carats) ? (Math.round(num(d.carats) * 100) / 100) + ' ct' : ''].filter(Boolean).join(' · ');
  return [a || 'Diamond', b];
}

/* ---------------- list ---------------- */
async function renderVendors() {
  const c = $('#content');
  if (!S.dbv6) { await loadVendors(); }
  if (!S.dbv6) {
    c.innerHTML = '<div class="notice">Vendors need the database update (ark-update-payments-vendors.sql). Ask the owner to run it in Supabase.</div>';
    return;
  }
  c.innerHTML = '<button class="btn btn-primary" data-action="v-new" style="margin-bottom:12px">＋ Add vendor</button><div id="vd-list">' + loadingHTML() + '</div>';
  const [vr, orr, dr] = await Promise.all([
    db.from('vendors').select('*').order('name', { ascending: true }),
    db.from('orders').select('vendor_id').not('vendor_id', 'is', null).in('status', OPEN_STATUSES).limit(5000),
    db.from('order_diamonds').select('id, orders!inner(vendor_id, status)').eq('given', false).in('orders.status', OPEN_STATUSES).limit(5000),
  ]);
  const box = $('#vd-list');
  if (!box) return;
  if (vr.error) { box.innerHTML = '<div class="empty">Could not load vendors.</div>'; return; }
  S.vendors = vr.data || [];
  const open = new Map(), dia = new Map();
  (orr.data || []).forEach((o) => open.set(o.vendor_id, (open.get(o.vendor_id) || 0) + 1));
  (dr.data || []).forEach((d) => { const v = d.orders && d.orders.vendor_id; if (v) dia.set(v, (dia.get(v) || 0) + 1); });
  if (!S.vendors.length) {
    box.innerHTML = ((dr.data || []).length ? '<button class="btn btn-secondary" data-action="dia-todo" style="margin-bottom:12px">💎 Diamonds to give — ' + dr.data.length + '</button>' : '') +
      '<div class="empty"><div class="big">🏭</div>No vendors yet.<br>Add the people or companies who make your orders.</div>';
    return;
  }
  const list = S.vendors.slice().sort((a, b) => (b.active - a.active) || ((open.get(b.id) || 0) - (open.get(a.id) || 0)) || a.name.localeCompare(b.name));
  const nDia = (dr.data || []).length;
  box.innerHTML = (nDia ? '<button class="btn btn-secondary" data-action="dia-todo" style="margin-bottom:12px">💎 Diamonds to give — ' + nDia + '</button>' : '') +
    list.map((v) =>
    '<div class="list-item" data-action="v-open" data-id="' + v.id + '">' +
    '<div class="li-main"><div class="li-title">' + esc(v.name) + (v.active ? '' : ' <span class="chip chip-off">Off</span>') + '</div>' +
    '<div class="li-sub">' + esc([v.speciality, v.city, v.phone].filter(Boolean).join(' · ')) + '</div>' +
    '<div class="li-chips">' +
    (open.get(v.id) ? '<span class="chip chip-st-in_production">' + open.get(v.id) + ' in work</span>' : '') +
    (dia.get(v.id) ? '<span class="chip chip-hot">💎 ' + dia.get(v.id) + ' to give</span>' : '') +
    '</div></div><div style="color:var(--muted)">›</div></div>').join('');
}

/* ---------------- one vendor ---------------- */
async function vendorData(id) {
  const [vr, orr, dr] = await Promise.all([
    db.from('vendors').select('*').eq('id', id).maybeSingle(),
    db.from('orders').select('id, order_no, order_type, status, order_date, due_date, clients(trade_name, city)')   // no vendor_id: no vendor chip on the vendor's own page
      .eq('vendor_id', id).order('order_date', { ascending: false }).limit(300),
    db.from('order_diamonds').select('*, orders!inner(id, order_no, status, vendor_id)').eq('orders.vendor_id', id)
      .order('created_at', { ascending: true }).limit(2000),
  ]);
  return { v: vr.data || null, orders: orr.data || [], dias: dr.data || [] };
}
async function openVendor(id, replace) {
  const V = await vendorData(id);
  if (!V.v) { toast('Could not open the vendor.', 'err'); return; }
  const title = V.v.name;
  let first = V;
  showSub(title, () => {
    if (first) { const x = first; first = null; renderVendorPage(x); return; }
    $('#content').innerHTML = loadingHTML();
    vendorData(id).then((x) => { const top = S.sub[S.sub.length - 1]; if (x.v && top && top.title === title) renderVendorPage(x); });
  }, replace);
}
function renderVendorPage(V) {
  S.vpage = V;
  const v = V.v;
  const inWork = V.orders.filter((o) => isOpenStatus(o.status));
  const done = V.orders.filter((o) => !isOpenStatus(o.status) && o.status !== 'quote');
  const quotes = V.orders.filter((o) => o.status === 'quote');
  const toGive = V.dias.filter((d) => !d.given && d.orders && isOpenStatus(d.orders.status));
  const given = V.dias.filter((d) => d.given).sort((a, b) => (a.given_on < b.given_on ? 1 : -1));
  const diaRow = (d) => {
    const L = diamondNeedLine(d);
    return '<div class="dia-row"><div class="dia-main" data-action="o-open" data-id="' + d.order_id + '"><b>' + esc(L[0]) + '</b>' +
      '<div class="o-item-meta">' + esc([ordNo(d.orders.order_no), L[1], d.note].filter(Boolean).join(' · ')) + '</div></div>' +
      (d.given ? '<span class="chip dia-given">' + esc('Given ' + fmtD(d.given_on || d.created_at)) + '</span>'
        : '<button class="btn btn-small btn-primary" data-action="dia-give" data-id="' + d.id + '" data-from="vendor">Mark given</button>') + '</div>';
  };
  $('#content').innerHTML =
    '<div class="client-head"><h2>' + esc(v.name) + '</h2>' +
    '<div class="co">' + esc([v.contact_person, v.speciality, v.city].filter(Boolean).join(' · ')) + '</div>' +
    '<div class="lg-nums">' +
    '<div class="' + (inWork.length ? 'due' : 'clear') + '"><span>Orders in work</span><b>' + inWork.length + '</b></div>' +
    '<div class="' + (toGive.length ? 'due' : 'clear') + '"><span>Diamonds to give</span><b>' + toGive.length + '</b></div>' +
    '</div></div>' +
    '<div class="action-row">' +
    (v.phone ? '<a class="btn btn-secondary" href="' + esc(telHref(v.phone)) + '">Call</a>' : '') +
    '<button class="btn btn-secondary" data-action="v-wa">WhatsApp</button>' +
    '<button class="btn btn-secondary" data-action="v-edit">Edit</button>' +
    '</div>' +
    (toGive.length ? '<div class="section-label">Diamonds to give (' + toGive.length + ')</div><div class="card dia-card">' + toGive.map(diaRow).join('') + '</div>' : '') +
    '<div class="section-label">Orders in work (' + inWork.length + ')</div>' +
    (inWork.length ? inWork.map((o) => orderListItemHTML(o, true)).join('') : '<div class="empty" style="padding:12px">No orders in work with this vendor.</div>') +
    (quotes.length ? '<div class="section-label">Quotations (' + quotes.length + ')</div>' + quotes.map((o) => orderListItemHTML(o, true)).join('') : '') +
    (done.length ? '<div class="section-label">Finished and older (' + done.length + ')</div>' + done.slice(0, 50).map((o) => orderListItemHTML(o, true)).join('') : '') +
    (given.length ? '<div class="section-label">Diamonds given (' + given.length + ')</div><div class="card dia-card">' + given.slice(0, 50).map(diaRow).join('') + '</div>' : '') +
    (v.address || v.gstin || v.notes ? '<div class="section-label">Details</div><div class="card">' +
      (v.address ? '<div class="detail-row"><div class="dk">Address</div><div class="dv">' + esc(v.address) + '</div></div>' : '') +
      (v.gstin ? '<div class="detail-row"><div class="dk">GSTIN</div><div class="dv">' + esc(v.gstin) + '</div></div>' : '') +
      (v.notes ? '<div class="detail-row"><div class="dk">Notes</div><div class="dv" style="white-space:pre-wrap">' + esc(v.notes) + '</div></div>' : '') + '</div>' : '') +
    '<div style="display:flex;gap:10px;justify-content:center;margin:16px 0 6px">' +
    '<button class="btn btn-small ' + (v.active ? 'btn-danger-ghost' : 'btn-ghost') + '" data-action="v-active">' + (v.active ? 'Switch off' : 'Switch on') + '</button>' +
    '</div>';
}

/* ---------------- add / edit ---------------- */
function openVendorModal(existing, onSaved) {
  const v = existing || {};
  const val = (k) => esc(v[k] == null ? '' : v[k]);
  const ov = openModal('<h3>' + (v.id ? 'Edit vendor' : 'Add vendor') + '</h3>' +
    '<div class="field"><label>Vendor / company name <span class="req">*</span></label><input type="text" id="vf-name" value="' + val('name') + '"></div>' +
    '<div class="o-2col">' +
    '<div class="field"><label>Contact person</label><input type="text" id="vf-person" value="' + val('contact_person') + '"></div>' +
    '<div class="field"><label>Mobile</label><input type="tel" id="vf-phone" inputmode="numeric" value="' + val('phone') + '"></div>' +
    '<div class="field"><label>City</label><input type="text" id="vf-city" value="' + val('city') + '"></div>' +
    '<div class="field"><label>Makes</label><input type="text" id="vf-spec" value="' + val('speciality') + '" placeholder="e.g. Diamond rings, CAD + casting"></div>' +
    '</div>' +
    '<div class="field"><label>Address</label><input type="text" id="vf-addr" value="' + val('address') + '"></div>' +
    '<div class="field"><label>GSTIN (if any)</label><input type="text" id="vf-gstin" value="' + val('gstin') + '" autocapitalize="characters"></div>' +
    '<div class="field"><label>Notes</label><textarea id="vf-notes" style="min-height:60px">' + val('notes') + '</textarea></div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Save</button></div>');
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    const name = $('#vf-name').value.trim();
    if (!name) { toast('Type the vendor\'s name.', 'err'); return; }
    const row = {
      name, contact_person: $('#vf-person').value.trim() || null,
      phone: normMobile($('#vf-phone').value) || $('#vf-phone').value.trim() || null,
      city: $('#vf-city').value.trim() || null, speciality: $('#vf-spec').value.trim() || null,
      address: $('#vf-addr').value.trim() || null, gstin: $('#vf-gstin').value.trim().toUpperCase() || null,
      notes: $('#vf-notes').value.trim() || null,
    };
    e.target.disabled = true;
    let res;
    if (v.id) res = await db.from('vendors').update(row).eq('id', v.id).select('*').single();
    else res = await db.from('vendors').insert(Object.assign({ created_by: S.me.id }, row)).select('*').single();
    if (res.error) {
      e.target.disabled = false;
      toast(String(res.error.code) === '23505' || /duplicate/i.test(res.error.message || '') ? 'A vendor with this name already exists.' : 'Could not save — try again.', 'err');
      return;
    }
    closeModal();
    await loadVendors();
    toast(v.id ? 'Vendor updated ✓' : 'Vendor added ✓', 'ok');
    if (onSaved) onSaved(res.data);
  };
}

/* ---------------- on the order page: vendor + diamonds to give ---------------- */
async function loadOrderVendorBox(o) {
  const el = $('#o-vendor-view');
  if (!el || !S.dbv6) return;
  const { data, error } = await db.from('order_diamonds').select('*').eq('order_id', o.id).order('sort', { ascending: true }).order('created_at', { ascending: true });
  if (!$('#o-vendor-view')) return;
  const dias = error ? [] : (data || []);
  S.odia = { o, dias };
  const v = o.vendor_id ? vendorById(o.vendor_id) : null;
  const nGiven = dias.filter((d) => d.given).length;
  el.innerHTML =
    '<div class="section-label">Vendor</div>' +
    '<div class="card vendor-card">' +
    (v ? '<div class="vendor-line"><div><b class="o-headlink" data-action="v-open" data-id="' + v.id + '">' + esc(v.name) + ' ›</b>' +
        '<div class="o-item-meta">' + esc([v.contact_person, v.speciality, v.city].filter(Boolean).join(' · ')) + '</div></div>' +
        '<button class="btn btn-small btn-ghost" data-action="o-vendor-set">Change</button></div>' +
        '<div class="vendor-btns"><button class="btn btn-small btn-secondary" data-action="o-vendor-wa">Send order to vendor (WhatsApp)</button>' +
        '<button class="btn btn-small btn-secondary" data-action="o-vendor-pdf">Vendor order (PDF)</button></div>'
      : '<div class="vendor-line"><span class="hint" style="margin:0">No vendor chosen yet.</span>' +
        '<button class="btn btn-small btn-primary" data-action="o-vendor-set">Choose vendor</button></div>') +
    '</div>' +
    '<div class="section-label">Diamonds to give the vendor' + (dias.length ? ' (' + dias.length + (nGiven ? ' · ' + nGiven + ' given' : '') + ')' : '') + '</div>' +
    '<div class="card dia-card">' +
    (dias.length ? dias.map((d) => {
      const L = diamondNeedLine(d);
      return '<div class="dia-row"><div class="dia-main" data-action="dia-edit" data-id="' + d.id + '"><b>' + esc(L[0]) + '</b>' +
        (L[1] || d.note ? '<div class="o-item-meta">' + esc([L[1], d.note].filter(Boolean).join(' · ')) + '</div>' : '') + '</div>' +
        (d.given ? '<span class="chip dia-given" data-action="dia-edit" data-id="' + d.id + '">' + esc('Given ' + fmtD(d.given_on || d.created_at)) + '</span>'
          : '<button class="btn btn-small btn-primary" data-action="dia-give" data-id="' + d.id + '">Mark given</button>') + '</div>';
    }).join('') : '<div class="hint" style="margin:0 0 4px">Note the diamonds you have to find and give the vendor — size, shape, colour, purity — and mark each one when it is given.</div>') +
    '<button class="btn btn-small btn-secondary" data-action="dia-add" style="margin-top:8px">＋ Add diamond</button>' +
    '</div>';
}

function selectHTML(id, opts, cur, emptyLabel, labelFn) {
  const list = opts.slice();
  if (cur && list.indexOf(cur) === -1) list.unshift(cur);
  return '<select id="' + id + '"><option value="">' + esc(emptyLabel) + '</option>' +
    list.map((x) => '<option value="' + esc(x) + '"' + (x === cur ? ' selected' : '') + '>' + esc(labelFn ? labelFn(x) : x) + '</option>').join('') + '</select>';
}

function openDiamondModal(d) {
  const ctx = S.odia;
  if (!ctx) return;
  const e = d || {};
  const ov = openModal('<h3>' + (e.id ? 'Diamond' : 'Add diamond') + ' — ' + esc(ordNo(ctx.o.order_no)) + '</h3>' +
    '<p>What you have to find and give the vendor for this order.</p>' +
    '<div class="o-2col">' +
    '<div class="field"><label>Shape</label>' + selectHTML('dm-shape', DIA_SHAPES, e.shape || '', '—') + '</div>' +
    '<div class="field"><label>Size</label><input type="text" id="dm-size" value="' + esc(e.size || '') + '" placeholder="e.g. 2.5 mm"></div>' +
    '<div class="field"><label>Colour</label>' + selectHTML('dm-color', DIA_COLORS, e.color || '', '—') + '</div>' +
    '<div class="field"><label>Purity (clarity)</label>' + selectHTML('dm-clarity', DIA_CLARITY, e.clarity || '', '—') + '</div>' +
    '<div class="field"><label>Pieces</label><input type="text" inputmode="numeric" id="dm-pcs" value="' + esc(e.pcs == null ? '' : e.pcs) + '"></div>' +
    '<div class="field"><label>Total carats</label><input type="text" inputmode="decimal" id="dm-ct" value="' + esc(e.carats == null ? '' : num(e.carats)) + '"></div>' +
    '</div>' +
    '<div class="field"><label>Type</label>' + selectHTML('dm-type', DIAMOND_TYPES, e.dtype || '', '—', diamondLabel) + '</div>' +
    '<div class="field"><label>Note</label><input type="text" id="dm-note" value="' + esc(e.note || '') + '" placeholder="e.g. for the pendant, matching pair"></div>' +
    '<label class="pr-check"><input type="checkbox" id="dm-given"' + (e.given ? ' checked' : '') + '> Given to the vendor</label>' +
    '<div class="field" id="dm-date-wrap" style="' + (e.given ? '' : 'display:none') + '"><label>Given on</label><input type="date" id="dm-date" value="' + esc(e.given_on || todayStr()) + '"></div>' +
    '<div class="modal-actions">' + (e.id ? '<button class="btn btn-ghost" data-m="del" style="color:var(--red)">Delete</button>' : '') +
    '<button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Save</button></div>');
  const g = ov.querySelector('#dm-given');
  g.onchange = () => { $('#dm-date-wrap').style.display = g.checked ? '' : 'none'; };
  ov.querySelector('[data-m=no]').onclick = closeModal;
  if (e.id) ov.querySelector('[data-m=del]').onclick = async () => {
    const { error } = await db.from('order_diamonds').delete().eq('id', e.id);
    if (error) { toast('Could not delete — try again.', 'err'); return; }
    closeModal(); toast('Diamond removed', 'ok');
    loadOrderVendorBox(ctx.o);
  };
  ov.querySelector('[data-m=yes]').onclick = async (ev) => {
    const row = {
      shape: $('#dm-shape').value || null, size: $('#dm-size').value.trim() || null, color: $('#dm-color').value || null,
      clarity: $('#dm-clarity').value || null, pcs: numOrNull($('#dm-pcs').value) == null ? null : Math.round(num($('#dm-pcs').value)),
      carats: numOrNull($('#dm-ct').value), dtype: $('#dm-type').value || null, note: $('#dm-note').value.trim() || null,
      given: g.checked, given_on: g.checked ? ($('#dm-date').value || todayStr()) : null,
    };
    if (!row.shape && !row.size && !row.color && !row.clarity && !row.pcs && !row.carats && !row.note) { toast('Fill in at least the shape or size.', 'err'); return; }
    if (row.given && !e.given) row.given_by = S.me.id;
    if (!row.given) row.given_by = null;
    ev.target.disabled = true;
    let error;
    if (e.id) ({ error } = await db.from('order_diamonds').update(row).eq('id', e.id));
    else ({ error } = await db.from('order_diamonds').insert(Object.assign({ order_id: ctx.o.id, sort: ctx.dias.length, created_by: S.me.id }, row)));
    if (error) { ev.target.disabled = false; toast('Could not save — try again.', 'err'); return; }
    closeModal();
    toast(e.id ? 'Diamond updated ✓' : 'Diamond added ✓', 'ok');
    loadOrderVendorBox(ctx.o);
  };
}

async function markDiamondGiven(id, from) {
  const { error } = await db.from('order_diamonds').update({ given: true, given_on: todayStr(), given_by: S.me.id }).eq('id', id);
  if (error) { toast('Could not update — try again.', 'err'); return; }
  toast('Marked given ✓', 'ok');
  if (from === 'vendor' && S.vpage) openVendor(S.vpage.v.id, true);
  else if (from === 'todo') renderDiamondsToGive();
  else if (S.odia) loadOrderVendorBox(S.odia.o);
}

/* ---------------- every diamond still to give — a shopping list ---------------- */
function diaSpec(d) {
  return [[d.shape, d.size, d.dtype ? diamondLabel(d.dtype) : ''].filter(Boolean).join(' · ') || 'Diamond',
    [d.color ? 'Colour ' + d.color : '', d.clarity ? 'Purity ' + d.clarity : ''].filter(Boolean).join(' · ')];
}
async function renderDiamondsToGive() {
  const c = $('#content');
  if (!S.dbv6) { c.innerHTML = '<div class="notice">Diamonds to give need the database update (ark-update-payments-vendors.sql). Ask the owner to run it in Supabase.</div>'; return; }
  c.innerHTML = loadingHTML();
  const { data, error } = await db.from('order_diamonds')
    .select('*, orders!inner(id, order_no, status, vendor_id, due_date, clients(trade_name))')
    .eq('given', false).in('orders.status', OPEN_STATUSES).order('created_at', { ascending: true }).limit(3000);
  const top = S.sub[S.sub.length - 1];
  if (!top || top.title !== 'Diamonds to give') return;   // moved on meanwhile
  if (error) { c.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  const rows = data || [];
  if (!rows.length) {
    c.innerHTML = '<div class="empty"><div class="big">💎</div>Nothing to give right now.<br>Add the diamonds an order needs on its order page — size, shape, colour, purity.</div>';
    return;
  }
  // the same kind of stone, added up across orders
  const kinds = new Map();
  rows.forEach((d) => {
    const k = [d.dtype, d.shape, d.size, d.color, d.clarity].map((x) => String(x || '').trim().toLowerCase()).join('|');
    if (!kinds.has(k)) kinds.set(k, { d, pcs: 0, ct: 0, orders: new Set() });
    const x = kinds.get(k);
    x.pcs += num(d.pcs); x.ct += num(d.carats); x.orders.add(d.order_id);
  });
  const kindList = Array.from(kinds.values()).sort((a, b) => b.pcs - a.pcs || b.ct - a.ct);
  const byV = new Map();
  rows.forEach((d) => { const v = d.orders.vendor_id || ''; if (!byV.has(v)) byV.set(v, []); byV.get(v).push(d); });
  const vList = Array.from(byV.entries()).sort((a, b) => (!a[0]) - (!b[0]) || vendorName(a[0]).localeCompare(vendorName(b[0])));
  const totPcs = rows.reduce((a, d) => a + num(d.pcs), 0), totCt = rows.reduce((a, d) => a + num(d.carats), 0);
  const ct = (v) => (Math.round(v * 100) / 100) + ' ct';
  S.diaTodo = kindList;
  c.innerHTML =
    '<div class="stat-row">' +
    '<div class="stat"><div class="st-num">' + rows.length + '</div><div class="st-label">To give</div></div>' +
    (totPcs ? '<div class="stat"><div class="st-num">' + Math.round(totPcs) + '</div><div class="st-label">Pieces</div></div>' : '') +
    (totCt ? '<div class="stat"><div class="st-num o-num-sm">' + esc(ct(totCt)) + '</div><div class="st-label">Carats</div></div>' : '') +
    '</div>' +
    '<div class="section-label">Diamonds to find</div>' +
    '<div class="card dia-card">' + kindList.map((x) => {
      const L = diaSpec(x.d);
      return '<div class="dia-row"><div class="dia-main"><b>' + esc(L[0]) + '</b>' + (L[1] ? '<div class="o-item-meta">' + esc(L[1]) + '</div>' : '') + '</div>' +
        '<div class="dia-sum"><b>' + esc([x.pcs ? Math.round(x.pcs) + ' pcs' : '', x.ct ? ct(x.ct) : ''].filter(Boolean).join(' · ') || '—') + '</b>' +
        '<span>' + x.orders.size + (x.orders.size === 1 ? ' order' : ' orders') + '</span></div></div>';
    }).join('') + '</div>' +
    '<button class="btn btn-small btn-secondary" data-action="dia-todo-wa" style="margin:-4px 0 6px">Share this list on WhatsApp</button>' +
    vList.map((e) => '<div class="section-label">' + esc(e[0] ? vendorName(e[0]) || 'Vendor' : 'No vendor chosen yet') + ' (' + e[1].length + ')</div>' +
      '<div class="card dia-card">' + e[1].map((d) => {
        const L = diamondNeedLine(d);
        return '<div class="dia-row"><div class="dia-main" data-action="o-open" data-id="' + d.order_id + '"><b>' + esc(L[0]) + '</b>' +
          '<div class="o-item-meta">' + esc([ordNo(d.orders.order_no), d.orders.clients && d.orders.clients.trade_name, L[1], d.note].filter(Boolean).join(' · ')) + '</div></div>' +
          '<button class="btn btn-small btn-primary" data-action="dia-give" data-id="' + d.id + '" data-from="todo">Mark given</button></div>';
      }).join('') + '</div>').join('');
}

function openChooseVendorModal(o) {
  const ov = openModal('<h3>Vendor — ' + esc(ordNo(o.order_no)) + '</h3>' +
    '<div class="field"><label>Who makes this order</label><select id="cv-sel">' + vendorOptionsHTML(o.vendor_id || '') + '</select></div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Save</button></div>');
  const sel = ov.querySelector('#cv-sel');
  sel.onchange = () => {
    if (sel.value !== '__new') return;
    sel.value = o.vendor_id || '';
    closeModal();
    openVendorModal(null, (v) => saveOrderVendor(o, v.id));
  };
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = () => { const v = sel.value; closeModal(); saveOrderVendor(o, v || null); };
}
async function saveOrderVendor(o, vendorId) {
  const { error } = await db.from('orders').update({ vendor_id: vendorId }).eq('id', o.id);
  if (error) { toast('Could not save — try again.', 'err'); return; }
  await db.from('order_updates').insert({ order_id: o.id, note: vendorId ? 'Vendor: ' + vendorName(vendorId) : 'Vendor removed', created_by: S.me.id });
  toast(vendorId ? 'Vendor saved ✓' : 'Vendor removed', 'ok');
  openOrder(o.id, true);
}

/* the order for the vendor — items, metal and the diamonds (no client name, no prices) */
async function vendorOrderText(o) {
  const [ir, dr] = await Promise.all([
    db.from('order_items').select('*').eq('order_id', o.id).order('sort', { ascending: true }),
    db.from('order_diamonds').select('*').eq('order_id', o.id).order('sort', { ascending: true }).order('created_at', { ascending: true }),
  ]);
  const items = ir.data || [], dias = dr.data || [];
  const v = vendorById(o.vendor_id);
  const L = [];
  L.push('*' + bizName() + ' — Order ' + ordNo(o.order_no) + '*');
  if (v) L.push('For: ' + v.name);
  L.push(OTYPE_LABEL[o.order_type] + ' · ' + (o.metal || 'Gold') + (o.purity ? ' ' + purityLabel(o.purity) : ''));
  if (o.due_date) L.push('Delivery by: ' + fmtD(o.due_date));
  L.push('');
  L.push('*Items*');
  items.forEach((it, i) => {
    const w = [];
    if (num(it.qty) > 1) w.push(it.qty + ' pcs');
    if (it.net_wt != null) w.push('net ' + grams(it.net_wt));
    if (it.size) w.push('size ' + it.size);
    L.push((i + 1) + '. ' + [it.category, it.design_code, it.description].filter(Boolean).join(' — ') + (w.length ? ' (' + w.join(', ') + ')' : ''));
    const jb = jewelPdfBits(it, o.metal);
    if (jb.length) L.push('   ' + jb.join(' · '));
    if (it.stone_details) L.push('   Stones: ' + it.stone_details);
  });
  if (dias.length) {
    L.push('');
    L.push('*Diamonds we give you*');
    dias.forEach((d, i) => {
      const x = diamondNeedLine(d);
      L.push((i + 1) + '. ' + x[0] + (x[1] ? ' · ' + x[1] : '') + (d.note ? ' (' + d.note + ')' : '') + ' — ' + (d.given ? 'given ' + fmtD(d.given_on || d.created_at) : 'to be given'));
    });
  }
  if (o.notes) { L.push(''); L.push('Notes: ' + o.notes); }
  L.push('');
  L.push('Please confirm. Thank you!');
  return L.join('\n');
}

/* the order sheet for the vendor (PDF) — items with photos, metal, the diamonds we give; no client name, no prices */
async function buildVendorSheetPdf(orderId) {
  const [or, ir, dr] = await Promise.all([
    db.from('orders').select('*').eq('id', orderId).maybeSingle(),
    db.from('order_items').select('*').eq('order_id', orderId).order('sort', { ascending: true }),
    db.from('order_diamonds').select('*').eq('order_id', orderId).order('sort', { ascending: true }).order('created_at', { ascending: true }),
  ]);
  if (or.error || !or.data) throw new Error('order');
  const o = or.data, items = ir.data || [], dias = dr.data || [];
  const v = vendorById(o.vendor_id);
  const meta = [['Order no.', ordNo(o.order_no)], ['Order date', pDate(o.order_date)]];
  if (o.due_date) meta.push(['Delivery by', pDate(o.due_date)]);
  meta.push(['Type', OTYPE_LABEL[o.order_type] || '']);
  const d = await pdfStart('VENDOR ORDER', meta);
  if (v) pNote(d, 'VENDOR', [v.name, v.contact_person, v.phone, v.city].filter(Boolean).join(', '));
  pNote(d, 'METAL', (o.metal || 'Gold') + (o.purity ? ' ' + pPurity(o.purity) : ''));
  pHeading(d, 'Items');
  const cols = [{ h: '#', w: 7 }, { h: 'Piece', w: 24 }, { h: 'Tag / design', w: 24 }, { h: 'Details', w: 0 }, { h: 'Qty', w: 10, a: 'right' },
    { h: 'Gross (g)', w: 18, a: 'right' }, { h: 'Net (g)', w: 18, a: 'right' }];
  cols[3].w = PG_W - PM * 2 - cols.reduce((a, x) => a + x.w, 0);
  d.table(cols, items.map((it, i) => [String(i + 1), it.category || '', it.design_code || '',
    [it.description, it.size ? 'Size ' + it.size : '', it.stone_details ? 'Stones: ' + it.stone_details : ''].concat(jewelPdfBits(it, o.metal)).filter(Boolean).join('; '),
    String(it.qty || 1), it.gross_wt != null ? pG(it.gross_wt) : '', it.net_wt != null ? pG(it.net_wt) : '']), { zebra: true });
  if (dias.length) {
    pHeading(d, 'Diamonds we give you');
    const dc = [{ h: '#', w: 7 }, { h: 'Shape', w: 22 }, { h: 'Size', w: 22 }, { h: 'Colour', w: 16 }, { h: 'Purity', w: 16 }, { h: 'Pcs', w: 12, a: 'right' },
      { h: 'Carats', w: 16, a: 'right' }, { h: 'Type / note', w: 0 }, { h: 'Given', w: 22 }];
    dc[7].w = PG_W - PM * 2 - dc.reduce((a, x) => a + x.w, 0);
    d.table(dc, dias.map((x, i) => [String(i + 1), x.shape || '', x.size || '', x.color || '', x.clarity || '', x.pcs != null ? String(x.pcs) : '',
      num(x.carats) ? String(Math.round(num(x.carats) * 1000) / 1000) : '', [x.dtype ? diamondLabel(x.dtype) : '', x.note].filter(Boolean).join('; '),
      x.given ? fmtD(x.given_on || x.created_at) : 'To give']), { zebra: true });
  }
  pNote(d, 'NOTES', o.notes);
  const urls = await orderItemPhotoUrls(items);
  await pPhotos(d, items, urls);
  return { pdf: d, name: safeFileName(ordNo(o.order_no) + (v ? ' ' + v.name : '') + ' - Vendor order') + '.pdf', text: 'Order ' + ordNo(o.order_no) + (v ? ' for ' + v.name : '') };
}

/* ---------------- owner backup (More → Export all data) ---------------- */
async function exportVendorData(pName, today) {
  if (!S.dbv6) return;
  const [vs, ds, os] = await Promise.all([fetchAll('vendors', 'created_at'), fetchAll('order_diamonds', 'created_at'), fetchAll('orders', 'created_at')]);
  const oNo = new Map(os.map((o) => [o.id, ordNo(o.order_no)]));
  const vName = new Map(vs.map((v) => [v.id, v.name]));
  const oVendor = new Map(os.map((o) => [o.id, vName.get(o.vendor_id) || '']));
  await new Promise((r) => setTimeout(r, 450));
  downloadFile('bj-vendors-' + today + '.csv', buildCsv(
    ['Vendor', 'Contact person', 'Mobile', 'City', 'Makes', 'Address', 'GSTIN', 'Notes', 'Active', 'Added on'],
    vs.map((v) => [v.name, v.contact_person, v.phone, v.city, v.speciality, v.address, v.gstin, v.notes, v.active ? 'Yes' : 'No', fmtExp(v.created_at)])));
  await new Promise((r) => setTimeout(r, 450));
  downloadFile('bj-order-diamonds-' + today + '.csv', buildCsv(
    ['Order no', 'Vendor', 'Shape', 'Size', 'Colour', 'Purity', 'Pieces', 'Carats', 'Type', 'Note', 'Given', 'Given on', 'Given by'],
    ds.map((d) => [oNo.get(d.order_id) || '', oVendor.get(d.order_id) || '', d.shape, d.size, d.color, d.clarity, d.pcs, d.carats, diamondLabel(d.dtype), d.note,
      d.given ? 'Yes' : 'No', d.given_on || '', pName.get(d.given_by) || ''])));
}

onAct('v-list', () => showSub('Vendors', renderVendors));
onAct('v-new', () => openVendorModal(null, (v) => openVendor(v.id)));
onAct('v-open', (el) => openVendor(el.dataset.id));
onAct('v-edit', () => { const V = S.vpage; if (V) openVendorModal(V.v, () => openVendor(V.v.id, true)); });
onAct('v-wa', () => {
  const V = S.vpage;
  if (!V) return;
  const toGive = V.dias.filter((d) => !d.given && d.orders && isOpenStatus(d.orders.status));
  const lines = ['Namaste ' + (V.v.contact_person || V.v.name) + ','];
  if (toGive.length) {
    lines.push('', 'Diamonds we will give you:');
    toGive.forEach((d) => { const x = diamondNeedLine(d); lines.push('• ' + ordNo(d.orders.order_no) + ': ' + x[0] + (x[1] ? ' · ' + x[1] : '')); });
  }
  lines.push('', '— ' + bizName());
  openWa(V.v.phone, lines.join('\n'));
});
onAct('v-active', async () => {
  const V = S.vpage;
  if (!V) return;
  const { error } = await db.from('vendors').update({ active: !V.v.active }).eq('id', V.v.id);
  if (error) { toast('Could not update — try again.', 'err'); return; }
  await loadVendors();
  toast(V.v.active ? 'Switched off — hidden from new orders' : 'Switched on ✓', 'ok');
  openVendor(V.v.id, true);
});
onAct('o-vendor-set', () => { if (S.odia) openChooseVendorModal(S.odia.o); });
onAct('o-vendor-wa', async () => {
  const ctx = S.odia;
  if (!ctx) return;
  const v = vendorById(ctx.o.vendor_id);
  openWa(v && v.phone, await vendorOrderText(ctx.o));
});
onAct('o-vendor-pdf', () => { if (S.odia) makeAndOfferPdf(() => buildVendorSheetPdf(S.odia.o.id)); });
onAct('dia-add', () => openDiamondModal(null));
onAct('dia-edit', (el) => { const d = S.odia && S.odia.dias.find((x) => x.id === el.dataset.id); if (d) openDiamondModal(d); });
onAct('dia-give', (el) => markDiamondGiven(el.dataset.id, el.dataset.from));
onAct('dia-todo', () => showSub('Diamonds to give', renderDiamondsToGive));
onAct('dia-todo-wa', () => {
  const list = S.diaTodo || [];
  if (!list.length) return;
  const L = ['*' + bizName() + ' — diamonds to find*', ''];
  list.forEach((x, i) => {
    const sp = diaSpec(x.d);
    L.push((i + 1) + '. ' + sp[0] + (sp[1] ? ' · ' + sp[1] : '') + ' — ' +
      ([x.pcs ? Math.round(x.pcs) + ' pcs' : '', x.ct ? (Math.round(x.ct * 100) / 100) + ' ct' : ''].filter(Boolean).join(', ') || 'qty not noted'));
  });
  openWa('', L.join('\n'));
});

window.LOGIN_HOOKS.push(loadVendors);
