/* ============================================================
   KARIGAR ACCOUNTS — gold / silver issued, received back and
   wastage allowed, per karigar. Entries made from an order's
   karigar section appear here automatically. No money here
   (older labour / payment entries stay in the database, hidden).
   Balance (per metal) = fine issued − fine received − wastage allowed.
   Gold and silver are always kept apart.
   ============================================================ */
'use strict';

const KTXN_LABEL = { issue: 'Issued', receive: 'Received back', wastage: 'Wastage allowed', labour: 'Labour', payment: 'Paid' };
const KTXN_SIGN = { issue: 1, receive: -1, wastage: -1 };   // effect on the gold the karigar holds

async function loadKarigars() {
  const { data, error } = await db.from('karigars').select('*').order('name', { ascending: true });
  S.karigars = (!error && data) || [];
  return S.karigars;
}

function txnMetal(t) { return t && t.metal === 'Silver' ? 'Silver' : 'Gold'; }

/* metal entries only (issue / receive / wastage) — older labour and payment entries are left out */
function isMetalTxn(t) { return KTXN_SIGN[t.kind] != null; }

/* gold: b.issued / b.received / b.wastage / b.gold · silver: b.Silver.{issued, received, wastage, bal} */
function karigarBalances(txns) {
  const z = () => ({ issued: 0, received: 0, wastage: 0, bal: 0 });
  const b = { Gold: z(), Silver: z() };
  (txns || []).forEach((t) => {
    const f = num(t.fine_g), m = b[txnMetal(t)];
    if (t.kind === 'issue') m.issued += f;
    else if (t.kind === 'receive') m.received += f;
    else if (t.kind === 'wastage') m.wastage += f;
  });
  ['Gold', 'Silver'].forEach((k) => { const m = b[k]; m.bal = m.issued - m.received - m.wastage; });
  b.issued = b.Gold.issued; b.received = b.Gold.received; b.wastage = b.Gold.wastage; b.gold = b.Gold.bal;
  b.silver = b.Silver.bal;
  b.hasSilver = (b.Silver.issued + b.Silver.received + b.Silver.wastage) > 0.0005;
  return b;
}

async function karigarData(id) {
  const [kr, tr] = await Promise.all([
    db.from('karigars').select('*').eq('id', id).maybeSingle(),
    db.from('karigar_txns').select('*, orders(order_no)').eq('karigar_id', id)
      .order('txn_date', { ascending: false }).order('created_at', { ascending: false }).limit(3000),
  ]);
  const txns = (tr.data || []).filter(isMetalTxn);
  return { k: kr.data || null, txns, bal: karigarBalances(txns) };
}

/* ---------------- list ---------------- */
async function renderKarigars() {
  const c = $('#content');
  c.innerHTML = '<button class="btn btn-primary" data-action="k-new" style="margin-bottom:12px">＋ Add karigar</button><div id="k-list">' + loadingHTML() + '</div>';
  const [kr, tr] = await Promise.all([
    db.from('karigars').select('*').order('name', { ascending: true }),
    db.from('karigar_txns').select('karigar_id, kind, metal, fine_g').in('kind', ['issue', 'receive', 'wastage']).limit(20000),
  ]);
  const box = $('#k-list');
  if (!box) return;
  if (kr.error) { box.innerHTML = '<div class="empty">Could not load karigars.<br>If you just installed the add-on, check its database step was run.</div>'; return; }
  S.karigars = kr.data || [];
  const byK = new Map();
  (tr.data || []).forEach((t) => { if (!byK.has(t.karigar_id)) byK.set(t.karigar_id, []); byK.get(t.karigar_id).push(t); });
  const list = S.karigars.map((k) => ({ k, b: karigarBalances(byK.get(k.id)) }))
    .sort((a, b) => (b.k.active - a.k.active) || (b.b.gold - a.b.gold) || a.k.name.localeCompare(b.k.name));
  const totGold = list.reduce((a, x) => a + Math.max(0, x.b.gold), 0);
  const totSilver = list.reduce((a, x) => a + Math.max(0, x.b.silver), 0);
  if (!list.length) {
    box.innerHTML = '<div class="empty"><div class="big">🔨</div>No karigars yet.<br>Add the people who make your jewellery to track the gold you give them.</div>';
    return;
  }
  box.innerHTML =
    '<div class="stat-row">' +
    '<div class="stat"><div class="st-num o-num-sm">' + grams(totGold) + '</div><div class="st-label">Fine gold with karigars</div></div>' +
    (totSilver > 0.0005 ? '<div class="stat"><div class="st-num o-num-sm">' + grams(totSilver) + '</div><div class="st-label">Fine silver with karigars</div></div>' : '') +
    '</div><div style="height:8px"></div>' +
    list.map((x) =>
      '<div class="list-item" data-action="k-open" data-id="' + x.k.id + '">' +
      '<div class="li-main"><div class="li-title">' + esc(x.k.name) + (x.k.active ? '' : ' <span class="chip chip-off">Off</span>') + '</div>' +
      '<div class="li-sub">' + esc([x.k.speciality, x.k.city, x.k.phone].filter(Boolean).join(' · ')) + '</div>' +
      '<div class="li-chips">' +
      (Math.abs(x.b.gold) > 0.0005 ? '<span class="chip chip-type">Gold ' + grams(x.b.gold) + '</span>' : '<span class="chip chip-cat">Gold settled</span>') +
      (Math.abs(x.b.silver) > 0.0005 ? '<span class="chip chip-type">Silver ' + grams(x.b.silver) + '</span>' : '') +
      '</div></div><div style="color:var(--muted)">›</div></div>').join('');
}

/* ---------------- one karigar ---------------- */
async function openKarigar(id, replace) {
  const K = await karigarData(id);
  if (!K.k) { toast('Could not open the karigar.', 'err'); return; }
  const title = K.k.name;
  let first = K;
  showSub(title, () => {
    if (first) { const x = first; first = null; renderKarigarPage(x); return; }
    $('#content').innerHTML = loadingHTML();
    karigarData(id).then((x) => { const top = S.sub[S.sub.length - 1]; if (x.k && top && top.title === title) renderKarigarPage(x); });
  }, replace);
}

function renderKarigarPage(K) {
  S.kpage = K;
  const k = K.k, b = K.bal;
  const btn = (kind, label) => '<button class="btn btn-small btn-secondary" data-action="k-txn" data-kind="' + kind + '">' + label + '</button>';
  $('#content').innerHTML =
    '<div class="client-head"><h2>' + esc(k.name) + '</h2>' +
    '<div class="co">' + esc([k.speciality, k.city].filter(Boolean).join(' · ')) + '</div>' +
    '<div class="lg-nums">' +
    '<div class="' + (b.gold > 0.0005 ? 'due' : 'clear') + '"><span>Fine gold with karigar</span><b>' + grams(b.gold) + '</b></div>' +
    (b.hasSilver ? '<div class="' + (b.silver > 0.0005 ? 'due' : 'clear') + '"><span>Fine silver with karigar</span><b>' + grams(b.silver) + '</b></div>' : '') +
    '</div></div>' +

    '<div class="k-actions">' + btn('issue', '＋ Issue') + btn('receive', '＋ Receive back') + btn('wastage', '＋ Wastage') + '</div>' +

    '<div class="action-row">' +
    '<button class="btn btn-secondary" data-action="d-karigar" data-id="' + k.id + '">Statement PDF</button>' +
    '<button class="btn btn-secondary" data-action="k-wa">WhatsApp</button>' +
    (k.phone ? '<a class="btn btn-secondary" href="' + esc(telHref(k.phone)) + '">Call</a>' : '') +
    '</div>' +

    '<div class="card">' +
    '<div class="o-lrow"><span>Fine gold issued</span><b>' + grams(b.issued) + '</b></div>' +
    '<div class="o-lrow"><span>Fine gold received back</span><b>' + grams(b.received) + '</b></div>' +
    '<div class="o-lrow"><span>Wastage allowed</span><b>' + grams(b.wastage) + '</b></div>' +
    '<div class="o-lrow o-total"><span>Gold with karigar</span><b>' + grams(b.gold) + '</b></div>' +
    (b.hasSilver ? '<div class="o-lrow" style="margin-top:6px"><span>Fine silver issued</span><b>' + grams(b.Silver.issued) + '</b></div>' +
      '<div class="o-lrow"><span>Fine silver received back</span><b>' + grams(b.Silver.received) + '</b></div>' +
      (b.Silver.wastage > 0.0005 ? '<div class="o-lrow"><span>Silver wastage allowed</span><b>' + grams(b.Silver.wastage) + '</b></div>' : '') +
      '<div class="o-lrow o-total"><span>Silver with karigar</span><b>' + grams(b.silver) + '</b></div>' : '') +
    '</div>' +

    '<div class="section-label">Entries (' + K.txns.length + ')</div>' +
    (K.txns.length ? K.txns.map((t) => {
      const what = '<b>' + grams(t.kind === 'wastage' ? t.fine_g : t.weight_g) + '</b>' + (txnMetal(t) === 'Silver' ? ' silver' : '') +
        (t.kind !== 'wastage' && t.purity != null ? ' · ' + esc(purityLabel(t.purity)) + ' → ' + grams(t.fine_g) + ' fine' : ' fine');
      return '<div class="k-txn"><div class="kt-main">' +
        '<span class="chip kt-' + esc(t.kind) + '">' + esc(KTXN_LABEL[t.kind] || t.kind) + '</span> ' + what +
        '<div class="o-item-meta">' + esc(fmtD(t.txn_date)) +
        (t.order_id && t.orders ? ' · <a href="#" data-action="o-open" data-id="' + t.order_id + '">' + ordNo(t.orders.order_no) + '</a>' : '') +
        (t.note && !(t.auto && t.orders) ? ' · ' + esc(t.note) : '') + (t.auto ? ' · from the order' : '') + '</div></div>' +
        '<div class="kt-btns">' +
        (t.kind === 'issue' ? '<button class="btn btn-small btn-ghost" data-action="d-kchallan" data-id="' + t.id + '">Challan</button>' : '') +
        (t.auto ? '' : '<button class="fu-x" data-action="k-txn-del" data-id="' + t.id + '" aria-label="Remove entry">✕</button>') +
        '</div></div>';
    }).join('') : '<div class="empty" style="padding:12px">No entries yet — use the buttons above when you give or get back gold.</div>') +

    '<div style="display:flex;gap:10px;justify-content:center;margin:16px 0 6px">' +
    '<button class="btn btn-small btn-ghost" data-action="k-edit">Edit details</button>' +
    '<button class="btn btn-small ' + (k.active ? 'btn-danger-ghost' : 'btn-ghost') + '" data-action="k-active">' + (k.active ? 'Switch off' : 'Switch on') + '</button>' +
    '</div>';
}

function karigarWaText(K) {
  const b = K.bal;
  return ['Namaste ' + K.k.name + ',', '', 'Account from ' + bizName() + ' as on ' + fmtDLong(todayStr()) + ':',
    'Fine gold with you: *' + grams(b.gold) + '*', '(issued ' + grams(b.issued) + ', received back ' + grams(b.received) + ', wastage ' + grams(b.wastage) + ')']
    .concat(b.hasSilver ? ['Fine silver with you: *' + grams(b.silver) + '*', '(issued ' + grams(b.Silver.issued) + ', received back ' + grams(b.Silver.received) + ', wastage ' + grams(b.Silver.wastage) + ')'] : [])
    .concat(['', 'Please check and let us know of any difference. Thank you.']).join('\n');
}

/* ---------------- add / edit karigar ---------------- */
function openKarigarModal(existing, onSaved) {
  const k = existing || {};
  const v = (x) => esc(k[x] == null ? '' : k[x]);
  const ov = openModal('<h3>' + (k.id ? 'Edit karigar' : 'Add karigar') + '</h3>' +
    '<div class="field"><label>Name <span class="req">*</span></label><input type="text" id="kf-name" value="' + v('name') + '"></div>' +
    '<div class="o-2col">' +
    '<div class="field"><label>Mobile</label><input type="tel" id="kf-phone" inputmode="numeric" value="' + v('phone') + '"></div>' +
    '<div class="field"><label>City</label><input type="text" id="kf-city" value="' + v('city') + '"></div>' +
    '</div>' +
    '<div class="field"><label>Speciality</label><input type="text" id="kf-spec" value="' + v('speciality') + '" placeholder="e.g. Polki setting, casting, polish"></div>' +
    '<div class="field"><label>Address (for challans)</label><input type="text" id="kf-addr" value="' + v('address') + '"></div>' +
    '<div class="field"><label>GSTIN (if any)</label><input type="text" id="kf-gstin" value="' + v('gstin') + '" autocapitalize="characters"></div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Save</button></div>');
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    const name = $('#kf-name').value.trim();
    if (!name) { toast('Type the karigar\'s name.', 'err'); return; }
    const row = {
      name, phone: normMobile($('#kf-phone').value) || $('#kf-phone').value.trim() || null, city: $('#kf-city').value.trim() || null,
      speciality: $('#kf-spec').value.trim() || null, address: $('#kf-addr').value.trim() || null,
      gstin: $('#kf-gstin').value.trim().toUpperCase() || null,
    };
    e.target.disabled = true;
    let res;
    if (k.id) res = await db.from('karigars').update(row).eq('id', k.id).select('*').single();
    else res = await db.from('karigars').insert(Object.assign({ created_by: S.me.id }, row)).select('*').single();
    if (res.error) {
      e.target.disabled = false;
      toast(String(res.error.code) === '23505' || /duplicate/i.test(res.error.message || '') ? 'A karigar with this name already exists.' : 'Could not save — try again.', 'err');
      return;
    }
    closeModal();
    await loadKarigars();
    toast(k.id ? 'Karigar updated ✓' : 'Karigar added ✓', 'ok');
    if (onSaved) onSaved(res.data);
  };
}

/* ---------------- entries ---------------- */
function openKTxnModal(kind) {
  const K = S.kpage;
  if (!K) return;
  const gold = kind === 'issue' || kind === 'receive';
  const purOpts = (m) => (m === 'Silver' ? SILVER_PURITY : PURITY).map((p) => '<option value="' + p[1] + '"' + (p[0] === defaultPurity(m) ? ' selected' : '') + '>' + p[0] + ' (' + p[1] + ')</option>').join('') +
    '<option value="custom">Other…</option>';
  const title = { issue: 'Issue metal', receive: 'Receive back', wastage: 'Wastage' }[kind] || '';
  const ov = openModal('<h3>' + esc(title) + ' — ' + esc(K.k.name) + '</h3>' +
    '<p>' + (kind === 'issue' ? 'Gold or silver you are giving for making jewellery.' : kind === 'receive' ? 'Jewellery or metal the karigar gives back (weigh it).' :
      'Fine metal you allow as wastage — it reduces what the karigar owes.') + '</p>' +
    (gold || kind === 'wastage' ? '<div class="field"><label>Metal</label><select id="kt-metal"><option value="Gold" selected>Gold</option><option value="Silver">Silver</option></select></div>' : '') +
    '<div class="o-2col">' +
    '<div class="field"><label>Date</label><input type="date" id="kt-date" value="' + todayStr() + '"></div>' +
    (gold ? '<div class="field"><label>Weight (g)</label><input type="text" inputmode="decimal" id="kt-w" placeholder="0.000"></div>' : '') +
    (kind === 'wastage' ? '<div class="field"><label>Fine weight (g)</label><input type="text" inputmode="decimal" id="kt-w" placeholder="0.000"></div>' : '') +
    '</div>' +
    (gold ? '<div class="o-2col"><div class="field"><label>Purity</label><select id="kt-pur">' + purOpts('Gold') + '</select></div>' +
      '<div class="field" id="kt-cpur-wrap" style="display:none"><label>Purity %</label><input type="text" inputmode="decimal" id="kt-cpur" placeholder="e.g. 83.3"></div></div>' : '') +
    '<div class="field"><label>Note</label><input type="text" id="kt-note" placeholder="' + (gold ? 'e.g. For 2 polki sets' : 'Optional') + '"></div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Save</button></div>');
  const sel = ov.querySelector('#kt-pur');
  if (sel) sel.onchange = () => { $('#kt-cpur-wrap').style.display = sel.value === 'custom' ? '' : 'none'; };
  const msel = ov.querySelector('#kt-metal');
  if (msel && sel) msel.onchange = () => { sel.innerHTML = purOpts(msel.value); sel.onchange(); };
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    const row = { karigar_id: K.k.id, kind, txn_date: $('#kt-date').value || todayStr(), note: $('#kt-note').value.trim() || null, created_by: S.me.id };
    if (gold || kind === 'wastage') {
      row.metal = msel ? msel.value : 'Gold';
      row.weight_g = numOrNull($('#kt-w').value);
      if (!(row.weight_g > 0)) { toast('Type the weight.', 'err'); return; }
      if (gold) {
        row.purity = sel.value === 'custom' ? numOrNull($('#kt-cpur').value) : num(sel.value);
        if (!(row.purity > 0 && row.purity <= 100)) { toast('Type the purity %.', 'err'); return; }
      } else row.purity = 100;
    }
    e.target.disabled = true;
    const { error } = await db.from('karigar_txns').insert(row);
    if (error) { e.target.disabled = false; toast('Could not save — try again.', 'err'); return; }
    closeModal();
    toast(({ issue: 'Issue recorded', receive: 'Receipt recorded', wastage: 'Wastage recorded' }[kind] || 'Saved') + ' ✓', 'ok');
    openKarigar(K.k.id, true);
  };
}

/* ---------------- export ---------------- */
async function exportKarigarData(pName, today) {
  const [ks, ts] = await Promise.all([fetchAll('karigars', 'created_at'), fetchAll('karigar_txns', 'created_at')]);
  const kName = new Map(ks.map((k) => [k.id, k.name]));
  await new Promise((r) => setTimeout(r, 450));
  downloadFile('bj-karigar-entries-' + today + '.csv', buildCsv(
    ['Karigar', 'Date', 'Entry', 'Metal', 'Weight (g)', 'Purity', 'Fine (g)', 'Note', 'From an order', 'Recorded by'],
    ts.filter(isMetalTxn).map((t) => [kName.get(t.karigar_id) || '', t.txn_date, KTXN_LABEL[t.kind] || t.kind, txnMetal(t), t.weight_g, t.purity, t.fine_g, t.note,
      t.auto ? 'Yes' : '', pName.get(t.created_by) || ''])));
}

onAct('k-list', () => showSub('Karigars', renderKarigars));
onAct('k-new', () => openKarigarModal(null, (k) => openKarigar(k.id)));
onAct('k-open', (el) => openKarigar(el.dataset.id));
onAct('k-edit', () => { const K = S.kpage; if (K) openKarigarModal(K.k, () => openKarigar(K.k.id, true)); });
onAct('k-active', async () => {
  const K = S.kpage;
  if (!K) return;
  const { error } = await db.from('karigars').update({ active: !K.k.active }).eq('id', K.k.id);
  if (error) { toast('Could not update — try again.', 'err'); return; }
  await loadKarigars();
  toast(K.k.active ? 'Switched off — hidden from new orders' : 'Switched on ✓', 'ok');
  openKarigar(K.k.id, true);
});
onAct('k-txn', (el) => openKTxnModal(el.dataset.kind));
onAct('k-txn-del', (el) => confirmModal('Remove this entry?', 'The karigar\'s balance will change.', 'Remove', async () => {
  const { error } = await db.from('karigar_txns').delete().eq('id', el.dataset.id);
  if (error) { toast('Could not remove — try again.', 'err'); return; }
  toast('Entry removed', 'ok');
  if (S.kpage) openKarigar(S.kpage.k.id, true);
}, true));
onAct('k-wa', () => { const K = S.kpage; if (K) openWa(K.k.phone, karigarWaText(K)); });

window.LOGIN_HOOKS.push(loadKarigars);
