/* ============================================================
   THE SHOPS AS PARTNERS (v36, database update 24)
   · Rate alerts: a shop asks to know when 24K goes below (or above) a
     rate. When the day's rate reaches one, whoever set the rate sees
     who to tell, with WhatsApp in one tap.
   · Levels: Silver / Gold / Diamond… by the fine gold a shop bought
     this year — % off making on its bills; "their year with us".
   · What sold: the pieces a shop bought, marked when they sell (the
     shop on its page, or you) — and more of the same, in a ready-stock
     link, in one go.
   · Exchange: a shop asks to change pieces that did not sell.
   · Referrals: a shop tells you of another shop; the reward for it.
   ============================================================ */
'use strict';

function x24() { return !!S.dbv24; }
function fyStart24(d) { const t = d || todayStr(), y = +t.slice(0, 4), m = +t.slice(5, 7); return (m >= 4 ? y : y - 1) + '-04-01'; }

/* ---------------- rate alerts ---------------- */
/* "below ₹ 7,000" in the person's own word order (not run through the translations) */
function raKindRate(kind, rate) {
  const r = rsWhole(rate);
  if (LANG === 'hi') return r + (kind === 'below' ? ' से कम' : ' से ज़्यादा');
  if (LANG === 'gu') return r + (kind === 'below' ? 'થી ઓછો' : 'થી વધુ');
  return (kind === 'below' ? 'below ' : 'above ') + r;
}
function rateAlertText(a, r24) {
  return 'Namaste 🙏\nGold (24K) is ' + rsWhole(r24 || a.hit_rate) + ' for 1 g today — ' + (a.kind === 'below' ? 'below' : 'above') + ' the ' + rsWhole(a.rate) +
    ' you asked to know about. Shall we book the rate for you?\n— ' + bizName();
}
async function rateAlertsAfterSave(r24) {
  if (!x24()) return;
  const { data } = await db.from('rate_alerts').select('*, clients(id, trade_name, mobile)').eq('hit_on', todayStr()).is('told_at', null).limit(200);
  const list = data || [];
  if (!list.length) return;
  S.raHit = new Map(list.map((a) => [a.id, a]));
  const ov = openModal('<h3>🔔 ' + esc(list.length === 1 ? '1 shop asked to know' : list.length + ' shops asked to know') + '</h3>' +
    '<p class="hint">Today\'s rate reached what they asked for — tell them now, while the rate holds.</p>' +
    '<div class="ra-hit">' + list.map((a) => '<div class="ra-row" data-id="' + a.id + '"><div><b class="noi18n">' + esc((a.clients || {}).trade_name || '—') + '</b>' +
      '<div class="rc-sub noi18n">' + esc(raKindRate(a.kind, a.rate)) + '</div></div>' +
      '<button class="btn btn-small btn-primary" data-m="tell" data-id="' + a.id + '">💬 Tell</button></div>').join('') + '</div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Later</button></div>');
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelectorAll('[data-m=tell]').forEach((b) => {
    b.onclick = async () => {
      const a = S.raHit.get(b.dataset.id);
      if (!a) return;
      openWa((a.clients || {}).mobile, rateAlertText(a, r24));
      await db.from('rate_alerts').update({ told_at: new Date().toISOString() }).eq('id', a.id);
      b.textContent = '✓'; b.disabled = true;
    };
  });
}
async function renderRateAlerts() {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const { data, error } = await db.from('rate_alerts').select('*, clients(id, trade_name, mobile)').or('active.eq.true,hit_on.gte.' + addDaysStr(todayStr(), -30)).order('created_at', { ascending: false }).limit(500);
  if (!$('#content')) return;
  if (error) { c.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  const list = data || [];
  S.raList = new Map(list.map((a) => [a.id, a]));
  const wait = list.filter((a) => a.active), hit = list.filter((a) => !a.active && a.hit_on);
  const row = (a) => '<div class="card rc-item"><div><b class="noi18n">' + esc((a.clients || {}).trade_name || '—') + '</b>' +
    '<div class="rc-sub"><span class="noi18n">' + esc(raKindRate(a.kind, a.rate)) + '</span> · ' + esc([a.via === 'shop' ? 'from its page' : 'by the team',
      a.hit_on ? 'reached ' + rsWhole(a.hit_rate) + ' on ' + fmtD(a.hit_on) : '', a.told_at ? 'told' : ''].filter(Boolean).join(' · ')) + '</div></div>' +
    (a.hit_on && !a.told_at ? '<button class="btn btn-small btn-primary" data-action="ra-tell" data-id="' + a.id + '">💬 Tell</button>'
      : a.active ? '<button class="btn btn-small btn-ghost" data-action="ra-del" data-id="' + a.id + '">Remove</button>' : '') + '</div>';
  c.innerHTML = '<button class="btn btn-primary" data-action="ra-new" style="margin-bottom:12px">＋ Alert for a shop</button>' +
    '<p class="hint">A shop asks on its own page — or you set it here — to be told when 24K goes below or above a rate. When you save the day\'s rate and it reaches one, you see who to tell.</p>' +
    '<div class="section-label">' + esc('Waiting (' + wait.length + ')') + '</div>' + (wait.length ? wait.map(row).join('') : '<div class="empty">None waiting.</div>') +
    (hit.length ? '<div class="section-label">Reached in the last 30 days</div>' + hit.map(row).join('') : '');
}
async function rateAlertModal(cl) {
  const t = typeof loadTodayRate === 'function' ? await loadTodayRate() : null;
  let kind = 'below';
  const ov = openModal('<h3>🔔 Rate alert</h3><p class="noi18n">' + esc(cl.trade_name) + '</p>' +
    '<div class="bf-days ra-kind"><button type="button" class="chip-btn on" data-k="below">Below</button><button type="button" class="chip-btn" data-k="above">Above</button></div>' +
    '<div class="field"><label>Gold 24K (₹ per g)</label><input type="text" inputmode="decimal" id="ra-rate" value="' + (t && num(t.r24) ? esc(String(Math.round(num(t.r24) * 0.98))) : '') + '"></div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Save</button></div>');
  ov.querySelectorAll('.ra-kind .chip-btn').forEach((b) => { b.onclick = () => { kind = b.dataset.k; ov.querySelectorAll('.ra-kind .chip-btn').forEach((x) => x.classList.toggle('on', x === b)); }; });
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    const r = numOrNull($('#ra-rate').value);
    if (!(r >= 100 && r <= 1000000)) { toast('Write the 24K rate for 1 g.', 'err'); return; }
    e.target.disabled = true;
    const { error } = await db.from('rate_alerts').insert({ client_id: cl.id, kind, rate: Math.round(r * 100) / 100, via: 'team', created_by: S.me.id });
    if (error) { e.target.disabled = false; toast('Could not save — try again.', 'err'); return; }
    closeModal(); toast('Saved ✓', 'ok');
    if ($('#content') && $('#content').querySelector('[data-action="ra-new"]')) renderRateAlerts();
  };
}

/* ---------------- levels ---------------- */
async function loadLevels(force) {
  if (!x24()) return [];
  if (!force && S.levels) return S.levels;
  const { data } = await db.from('reward_levels').select('*').order('min_g').order('sort').limit(50);
  S.levels = data || [];
  return S.levels;
}
async function clientLevel(clientId) {
  if (!x24()) return null;
  const { data, error } = await db.rpc('client_level', { p_client: clientId });
  return error ? null : data;
}
function levelText(L) {
  if (!L || !L.name) return '';
  return [L.name, num(L.making_off) ? num(L.making_off) + '% off making' : '', 'This year: ' + grams(L.g)].filter(Boolean).join(' · ');
}
async function renderLevels() {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const list = await loadLevels(true);
  if (!$('#content')) return;
  const rw = (appOpts().referral_reward || '').trim();
  c.innerHTML = '<p class="hint">A shop\'s level comes from the fine gold it bought this year (from 1 April). The % off making is offered on its bills in one tap.</p>' +
    (list.length ? list.map((l) => '<div class="card rc-item"><div><b class="noi18n">' + esc(l.name) + '</b><div class="rc-sub">' +
      esc((num(l.min_g) ? 'from ' + grams(l.min_g) : 'from the first gram') + ' · ' + (num(l.making_off) ? num(l.making_off) + '% off making' : 'no discount')) + '</div></div>' +
      (isOwner() ? '<button class="btn btn-small btn-ghost" data-action="lv-edit" data-id="' + l.id + '">Change</button>' : '') + '</div>').join('') : '<div class="empty">No levels.</div>') +
    (isOwner() ? '<button class="btn btn-secondary" data-action="lv-edit" style="margin:4px 0 16px">＋ A level</button>' : '') +
    '<div class="section-label">Reward for telling you of a shop</div><div class="card"><div class="noi18n">' + esc(rw || '—') + '</div>' +
    '<p class="hint" style="margin:6px 0 0">Each shop sees it on its own page, where it can refer a shop.</p>' +
    (isOwner() ? '<button class="btn btn-small btn-ghost" data-action="rw-edit" style="margin-top:6px">Change</button>' : '') + '</div>';
}
function levelModal(id) {
  const l = (S.levels || []).find((x) => x.id === id) || null;
  const ov = openModal('<h3>' + esc(l ? 'Change the level' : 'A new level') + '</h3>' +
    '<div class="field"><label>Name</label><input type="text" id="lv-n" maxlength="30" value="' + esc(l ? l.name : '') + '" placeholder="e.g. Platinum"></div>' +
    '<div class="o-2col"><div class="field"><label>From how many grams (fine gold this year)</label><input type="text" inputmode="decimal" id="lv-g" value="' + (l ? esc(String(num(l.min_g))) : '') + '"></div>' +
    '<div class="field"><label>Off making (%)</label><input type="text" inputmode="decimal" id="lv-p" value="' + (l ? esc(String(num(l.making_off))) : '0') + '"></div></div>' +
    '<div class="modal-actions">' + (l ? '<button class="btn btn-danger-ghost" data-m="del">Remove</button>' : '<button class="btn btn-secondary" data-m="no">Cancel</button>') +
    '<button class="btn btn-primary" data-m="yes">Save</button></div>');
  const no = ov.querySelector('[data-m=no]'); if (no) no.onclick = closeModal;
  const del = ov.querySelector('[data-m=del]');
  if (del) del.onclick = async () => {
    const { error } = await db.from('reward_levels').delete().eq('id', l.id);
    closeModal();
    if (error) { toast('Could not remove — try again.', 'err'); return; }
    renderLevels();
  };
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    const name = $('#lv-n').value.trim(), g = numOrNull($('#lv-g').value), pct = numOrNull($('#lv-p').value);
    if (!name) { toast('Write the name.', 'err'); return; }
    if (g == null || g < 0) { toast('Write from how many grams.', 'err'); return; }
    if (pct == null || pct < 0 || pct > 50) { toast('Off making: 0 to 50%.', 'err'); return; }
    e.target.disabled = true;
    const row = { name, min_g: Math.round(g * 1000) / 1000, making_off: Math.round(pct * 100) / 100 };
    const res = l ? await db.from('reward_levels').update(row).eq('id', l.id) : await db.from('reward_levels').insert(Object.assign({ sort: (S.levels || []).length + 1 }, row));
    if (res.error) { e.target.disabled = false; toast(/duplicate/i.test(res.error.message || '') ? 'There is a level with this name.' : 'Could not save — try again.', 'err'); return; }
    closeModal(); toast('Saved ✓', 'ok'); renderLevels();
  };
}
function rewardModal() {
  const ov = openModal('<h3>Reward for telling you of a shop</h3><p class="hint">What a shop gets when a shop it told you of joins and buys.</p>' +
    '<div class="field"><input type="text" id="rw-t" maxlength="150" value="' + esc(appOpts().referral_reward || '') + '" placeholder="e.g. ₹ 1,000 off making on your next bill"></div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Save</button></div>');
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = async (e) => {
    e.target.disabled = true;
    const o = Object.assign({}, appOpts(), { referral_reward: $('#rw-t').value.trim() || null });
    const { error } = await db.from('business_settings').update({ app_options: o, updated_by: S.me.id }).eq('id', 1);
    if (error) { e.target.disabled = false; toast('Could not save — try again.', 'err'); return; }
    if (S.biz) S.biz.app_options = o;
    closeModal(); toast('Saved ✓', 'ok'); renderLevels();
  };
}
/* the shop's page: its level (a chip) */
async function loadClientLevel(cl) {
  const el = $('#cl-level');
  if (!el || !x24()) return;
  const L = await clientLevel(cl.id);
  if (!$('#cl-level') || !L || !L.name) return;
  el.innerHTML = '<span class="chip lv-chip" title="' + esc(levelText(L)) + '">🏅 <span class="noi18n">' + esc(L.name) + '</span></span>';
}
/* the bill screen: the shop's level, its % off making in one tap */
async function billLevelOffer(F) {
  const box = $('#bf-level');
  if (!box || !x24() || !F || F.kind !== 'sale' || !F.client) return;
  const L = F.level || (F.level = await clientLevel(F.client.id));
  if (!$('#bf-level') || !L || !num(L.making_off)) { if ($('#bf-level')) box.innerHTML = ''; return; }
  box.innerHTML = '<div class="bf-offer lv-offer"><span>🏅 ' + esc(L.name + ' level: ' + num(L.making_off) + '% off making') + '</span>' +
    (F.levelUsed ? '<b>' + esc('Applied ✓') + '</b>' : '<button type="button" class="btn btn-small btn-primary" data-action="bf-level">Apply</button>') + '</div>';
}

/* ---------------- what a shop sold, and more of the same ---------------- */
async function soldData(clientId) {
  const since = addDaysStr(todayStr(), -365);
  const { data: bills } = await db.from('bills').select('id, bill_date').eq('client_id', clientId).eq('kind', 'sale').eq('status', 'open').gte('bill_date', since).limit(1000);
  const ids = (bills || []).map((b) => b.id), day = new Map((bills || []).map((b) => [b.id, b.bill_date]));
  let lines = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await db.from('bill_lines').select('bill_id, catalogue_id').in('bill_id', ids.slice(i, i + 150)).not('catalogue_id', 'is', null);
    lines = lines.concat(data || []);
  }
  const pids = [...new Set(lines.map((l) => l.catalogue_id))];
  const pcs = new Map();
  for (let i = 0; i < pids.length; i += 150) {
    const { data } = await db.from('catalogue_items').select('id, tag_no, design_no, category, metal, purity, gross_wt, net_wt, photo_paths').in('id', pids.slice(i, i + 150));
    (data || []).forEach((p) => pcs.set(p.id, p));
  }
  const { data: sold } = await db.from('shop_sold').select('catalogue_id, sold_on, via').eq('client_id', clientId).limit(5000);
  const sm = new Map((sold || []).map((s) => [s.catalogue_id, s]));
  const on = new Map();
  lines.forEach((l) => { const d = day.get(l.bill_id); if (!on.has(l.catalogue_id) || d > on.get(l.catalogue_id)) on.set(l.catalogue_id, d); });
  return pids.map((id) => Object.assign({}, pcs.get(id) || { id }, { bought: on.get(id), sold: sm.get(id) || null })).filter((p) => p.tag_no || p.design_no || p.category)
    .sort((a, b) => (a.bought < b.bought ? 1 : -1));
}
/* in stock now, like the ones that sold: the same category, the weight within a fifth */
async function refillFor(soldPieces) {
  const cats = [...new Set(soldPieces.map((p) => p.category).filter(Boolean))];
  if (!cats.length) return [];
  const { data } = await db.from('catalogue_items').select('id, tag_no, design_no, category, purity, gross_wt, net_wt, photo_paths, hold_client, hold_till')
    .eq('status', 'available').in('category', cats).order('created_at', { ascending: false }).limit(500);
  const t = todayStr();
  return (data || []).filter((k) => !(k.hold_client && k.hold_till && k.hold_till >= t)).filter((k) => soldPieces.some((p) => p.category === k.category
    && (!num(p.net_wt) || !num(k.net_wt) || Math.abs(num(k.net_wt) - num(p.net_wt)) <= num(p.net_wt) * 0.2))).slice(0, 60);
}
async function renderSold(clientId) {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const [cl, list] = await Promise.all([fetchClient(clientId), soldData(clientId)]);
  if (!$('#content') || !cl) return;
  const sold = list.filter((p) => p.sold);
  const more = sold.length ? await refillFor(sold) : [];
  if (!$('#content')) return;
  S.soldOf = { cl, list, more, pick: new Set(more.slice(0, 12).map((k) => k.id)) };
  const pc = (p, act) => '<button type="button" class="se-pc' + (p.sold ? ' sold' : '') + '" data-action="' + act + '" data-id="' + p.id + '">' +
    ((p.photo_paths || [])[0] ? '<img data-catimg="' + esc(p.photo_paths[0]) + '" alt="">' : '<span class="cat-noimg">💍</span>') +
    '<span class="noi18n">' + esc(p.tag_no || p.design_no || p.category || '') + '</span>' + (p.sold ? '<i class="sd-tick">✓</i>' : '') + '</button>';
  c.innerHTML = '<div class="st-tot"><div><b>' + list.length + '</b><span>Bought in 12 months</span></div><div><b>' + sold.length + '</b><span>Sold</span></div>' +
    '<div><b>' + (list.length ? Math.round(sold.length * 100 / list.length) : 0) + '%</b><span>Sold through</span></div></div>' +
    '<p class="hint">The shop marks what it sold on its own page — or tap a piece here when it tells you.</p>' +
    (list.length ? '<div class="sd-grid">' + list.map((p) => pc(p, 'sd-toggle')).join('') + '</div>' : '<div class="empty">No pieces from your stock on its bills yet.</div>') +
    (sold.length ? '<div class="section-label">More like what sold — in stock now</div>' +
      (more.length ? '<div class="sd-grid sd-more">' + more.map((k) => '<button type="button" class="se-pc' + (S.soldOf.pick.has(k.id) ? ' on' : '') + '" data-action="sd-pick" data-id="' + k.id + '">' +
        ((k.photo_paths || [])[0] ? '<img data-catimg="' + esc(k.photo_paths[0]) + '" alt="">' : '<span class="cat-noimg">💍</span>') +
        '<span class="noi18n">' + esc(k.tag_no || k.design_no || '') + '</span><i class="sd-tick">✓</i></button>').join('') + '</div>' +
        '<button class="btn btn-primary" data-action="sd-send" style="margin-top:10px">📦 ' + esc('Send these to the shop') + '</button>'
        : '<div class="empty">Nothing like them in stock just now.</div>') : '');
  if (typeof fillCatImages === 'function') fillCatImages(c);
}
async function soldToggle(id) {
  const O = S.soldOf;
  const p = O && O.list.find((x) => x.id === id);
  if (!p) return;
  const res = p.sold ? await db.from('shop_sold').delete().eq('client_id', O.cl.id).eq('catalogue_id', id)
    : await db.from('shop_sold').insert({ client_id: O.cl.id, catalogue_id: id, via: 'team' });
  if (res.error) { toast('Could not save — try again.', 'err'); return; }
  renderSold(O.cl.id);
}
async function soldSend() {
  const O = S.soldOf;
  if (!O || !O.pick.size) { toast('Choose the pieces.', 'err'); return; }
  const { data, error } = await db.from('stock_links').insert({ client_id: O.cl.id, title: 'More like what sold', items: [...O.pick].slice(0, 100), created_by: S.me.id }).select('*').maybeSingle();
  if (error || !data) { toast('Could not make the link — try again.', 'err'); return; }
  openWa(O.cl.mobile, 'Namaste 🙏\nYour customers liked these — we have more like them in stock now. See the photos and tap the ones you want:\n' +
    (typeof stockUrl === 'function' ? stockUrl(data.token) : new URL('stock.html#' + data.token, location.href).href) + '\n— ' + bizName());
  toast('Ready-stock link made ✓', 'ok');
}

/* ---------------- exchange requests ---------------- */
async function renderExchanges() {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const { data, error } = await db.from('exchange_requests').select('*, clients(id, trade_name, mobile)').order('created_at', { ascending: false }).limit(200);
  if (!$('#content')) return;
  if (error) { c.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
  const list = data || [];
  const ids = [...new Set(list.flatMap((e) => e.items || []))], pcs = new Map();
  for (let i = 0; i < ids.length; i += 150) {
    const { data: p } = await db.from('catalogue_items').select('id, tag_no, design_no, category, purity, net_wt, photo_paths').in('id', ids.slice(i, i + 150));
    (p || []).forEach((x) => pcs.set(x.id, x));
  }
  if (!$('#content')) return;
  S.exList = new Map(list.map((e) => [e.id, Object.assign(e, { pieces: (e.items || []).map((id) => pcs.get(id)).filter(Boolean) })]));
  const card = (e) => '<div class="card se-card' + (e.status === 'new' ? ' se-new' : '') + '" id="ex-' + e.id + '"><div class="se-top"><div>' +
    '<a href="#" class="noi18n" data-action="open-client" data-id="' + e.client_id + '"><b>' + esc((e.clients || {}).trade_name || '—') + '</b></a>' +
    '<div class="rc-sub">' + esc(fmtDT(e.created_at) + ' · ' + e.pieces.length + (e.pieces.length === 1 ? ' piece' : ' pieces')) + '</div></div>' +
    '<span class="chip' + (e.status === 'new' ? ' se-chip' : '') + '">' + esc(e.status === 'new' ? 'New' : e.status === 'accepted' ? 'Yes' : 'No') + '</span></div>' +
    '<div class="se-pcs">' + e.pieces.map((p) => '<button type="button" class="se-pc" data-action="open-cat" data-id="' + p.id + '">' +
      ((p.photo_paths || [])[0] ? '<img data-catimg="' + esc(p.photo_paths[0]) + '" alt="">' : '<span class="cat-noimg">💍</span>') +
      '<span class="noi18n">' + esc(p.tag_no || p.design_no || '') + '</span></button>').join('') + '</div>' +
    (e.note ? '<div class="se-note noi18n">“' + esc(e.note) + '”</div>' : '') + (e.answer ? '<div class="rc-sub" style="margin-top:6px">↳ <span class="noi18n">' + esc(e.answer) + '</span></div>' : '') +
    '<div class="se-acts">' + (e.status === 'new' ? '<button class="btn btn-small btn-primary" data-action="ex-yes" data-id="' + e.id + '">✓ Yes</button>' +
      '<button class="btn btn-small btn-secondary" data-action="ex-no" data-id="' + e.id + '">✕ No</button>' : '<button class="btn btn-small btn-secondary" data-action="ex-wa" data-id="' + e.id + '">💬 Tell the shop</button>') + '</div></div>';
  const fresh = list.filter((e) => e.status === 'new'), done = list.filter((e) => e.status !== 'new');
  c.innerHTML = '<p class="hint">Pieces a shop bought and could not sell — it asks on its own page to change them.</p>' +
    (fresh.length ? fresh.map(card).join('') : '<div class="empty">Nothing new.</div>') +
    (done.length ? '<div class="section-label">Answered</div>' + done.slice(0, 50).map(card).join('') : '');
  if (typeof fillCatImages === 'function') fillCatImages(c);
  if (S.exFocus) { const el = $('#ex-' + S.exFocus); S.exFocus = null; if (el) el.scrollIntoView({ block: 'center' }); }
}
function exchangeAnswer(id, yes) {
  const e = S.exList && S.exList.get(id);
  if (!e) return;
  const ov = openModal('<h3>' + esc(yes ? 'Yes — change them' : 'No') + '</h3><p class="noi18n">' + esc((e.clients || {}).trade_name || '') + '</p>' +
    '<div class="field"><label>' + esc(yes ? 'How (the shop sees it on its page)' : 'Why (the shop sees it on its page)') + '</label>' +
    '<textarea id="ex-a" rows="3" maxlength="500" placeholder="' + esc(yes ? 'e.g. Send them with the courier on Monday; new designs are ready' : 'e.g. These were made to your order') + '"></textarea></div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Save</button></div>');
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = async (ev) => {
    ev.target.disabled = true;
    const answer = $('#ex-a').value.trim() || null;
    const { error } = await db.from('exchange_requests').update({ status: yes ? 'accepted' : 'declined', answer, decided_by: S.me.id, decided_at: new Date().toISOString() }).eq('id', id);
    if (error) { ev.target.disabled = false; toast('Could not save — try again.', 'err'); return; }
    closeModal(); toast('Saved ✓', 'ok');
    Object.assign(e, { status: yes ? 'accepted' : 'declined', answer });
    openWa((e.clients || {}).mobile, exchangeText(e));
    renderExchanges();
  };
}
function exchangeText(e) {
  return 'Namaste 🙏\nAbout the ' + (e.pieces.length === 1 ? 'piece' : e.pieces.length + ' pieces') + ' you asked to exchange (' + e.pieces.map((p) => p.tag_no || p.design_no).filter(Boolean).join(', ') + '): ' +
    (e.status === 'accepted' ? 'yes, we will change them.' : 'sorry, we cannot change them.') + (e.answer ? '\n' + e.answer : '') + '\n— ' + bizName();
}

/* ---------------- referrals ---------------- */
const RF_STATUS = { new: 'New', talking: 'Talking', joined: 'Joined', not_interested: 'Not interested' };
async function renderReferrals() {
  const c = $('#content');
  c.innerHTML = loadingHTML();
  const { data, error } = await db.from('referrals').select('*, clients!referrals_client_id_fkey(id, trade_name, mobile)').order('created_at', { ascending: false }).limit(500);
  let list = data;
  if (error) {   // without the named link
    const r2 = await db.from('referrals').select('*').order('created_at', { ascending: false }).limit(500);
    list = r2.data;
    if (r2.error) { c.innerHTML = '<div class="empty">Could not load — try again.</div>'; return; }
    const cids = [...new Set((list || []).map((r) => r.client_id).filter(Boolean))];
    const { data: cs } = cids.length ? await db.from('clients').select('id, trade_name, mobile').in('id', cids) : { data: [] };
    const cm = new Map((cs || []).map((x) => [x.id, x]));
    (list || []).forEach((r) => { r.clients = cm.get(r.client_id) || null; });
  }
  if (!$('#content')) return;
  list = list || [];
  S.rfList = new Map(list.map((r) => [r.id, r]));
  const rw = (appOpts().referral_reward || '').trim();
  const card = (r) => '<div class="card" id="rf-' + r.id + '"><div class="se-top"><div><b class="noi18n">' + esc(r.shop_name) + '</b>' +
    '<div class="rc-sub"><span class="noi18n">' + esc([r.city, r.person].filter(Boolean).join(' · ')) + '</span>' + (r.mobile ? ' · <a href="' + esc(telHref(r.mobile)) + '" class="noi18n">' + esc(r.mobile) + '</a>' : '') + '</div>' +
    '<div class="rc-sub">' + (r.clients ? '🤝 <a href="#" class="noi18n" data-action="open-client" data-id="' + r.client_id + '">' + esc(r.clients.trade_name) + '</a> · ' : '') + esc(fmtD(r.created_at)) + '</div></div>' +
    '<span class="chip' + (r.status === 'new' ? ' se-chip' : '') + '">' + esc(RF_STATUS[r.status] || r.status) + '</span></div>' +
    (r.note ? '<div class="se-note noi18n">“' + esc(r.note) + '”</div>' : '') +
    (r.rewarded_on ? '<div class="rc-sub">🎁 ' + esc('Reward given ' + fmtD(r.rewarded_on)) + (r.reward_note ? ' · <span class="noi18n">' + esc(r.reward_note) + '</span>' : '') + '</div>' : '') +
    '<div class="se-acts">' + (r.status !== 'joined' ? '<button class="btn btn-small btn-primary" data-action="rf-add" data-id="' + r.id + '">＋ Add as a client</button>' : '') +
    (r.status === 'new' ? '<button class="btn btn-small btn-secondary" data-action="rf-set" data-s="talking" data-id="' + r.id + '">Talking</button>' : '') +
    (r.status !== 'joined' ? '<button class="btn btn-small btn-secondary" data-action="rf-joined" data-id="' + r.id + '">Joined</button>' : '') +
    (r.status !== 'not_interested' && r.status !== 'joined' ? '<button class="btn btn-small btn-ghost" data-action="rf-set" data-s="not_interested" data-id="' + r.id + '">Not interested</button>' : '') +
    (r.status === 'joined' && !r.rewarded_on ? '<button class="btn btn-small btn-primary" data-action="rf-reward" data-id="' + r.id + '">🎁 Reward given</button>' : '') + '</div></div>';
  c.innerHTML = '<p class="hint">Shops tell you of other shops on their own page.' + (rw ? '' : ' Write the reward in Marketing → Levels for shops.') + '</p>' +
    (rw ? '<div class="card rf-rw">🎁 <span class="noi18n">' + esc(rw) + '</span></div>' : '') +
    (list.length ? list.map(card).join('') : '<div class="empty">No shops told yet.</div>');
  if (S.rfFocus) { const el = $('#rf-' + S.rfFocus); S.rfFocus = null; if (el) el.scrollIntoView({ block: 'center' }); }
}
async function referralSet(id, patch) {
  const { error } = await db.from('referrals').update(Object.assign({ updated_at: new Date().toISOString() }, patch)).eq('id', id);
  if (error) { toast('Could not save — try again.', 'err'); return false; }
  return true;
}

/* ---------------- their year with us (a card to share) ---------------- */
async function yearCardOpen(clientId) {
  const cl = await fetchClient(clientId);
  if (!cl) return;
  const t = todayStr(), early = (new Date(t) - new Date(fyStart24(t))) / 864e5 < 45;
  const from = early ? (+fyStart24(t).slice(0, 4) - 1) + '-04-01' : fyStart24(t), to = early ? addDaysStr(fyStart24(t), -1) : t;
  const [{ data: bills }, { data: orders }, L] = await Promise.all([
    db.from('bills').select('id, fine_due_g').eq('client_id', clientId).eq('kind', 'sale').eq('status', 'open').gte('bill_date', from).lte('bill_date', to).limit(2000),
    db.from('orders').select('status, due_date, delivered_on').eq('client_id', clientId).gte('order_date', from).lte('order_date', to).limit(2000),
    clientLevel(clientId)]);
  const ids = (bills || []).map((b) => b.id);
  let lines = [];
  for (let i = 0; i < ids.length; i += 150) { const { data } = await db.from('bill_lines').select('category, qty').in('bill_id', ids.slice(i, i + 150)); lines = lines.concat(data || []); }
  const cats = new Map(); lines.forEach((l) => { if (l.category) cats.set(l.category, (cats.get(l.category) || 0) + (l.qty || 1)); });
  const ok = (orders || []).filter((o) => ['quote', 'declined', 'cancelled'].indexOf(o.status) < 0);
  const del = ok.filter((o) => o.status === 'delivered');
  const Y = { shop: cl.trade_name, city: cl.city, from, to, g: (bills || []).reduce((s, b) => s + num(b.fine_due_g), 0), bills: (bills || []).length,
    pieces: lines.reduce((s, l) => s + (l.qty || 1), 0), top: [...cats.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0])[0] || '',
    orders: ok.length, delivered: del.length, on_time: del.filter((o) => !o.due_date || (o.delivered_on && o.delivered_on <= o.due_date)).length, level: L, business: bizName() };
  const cv = window.ArkPoster && ArkPoster.yearCard ? ArkPoster.yearCard(Y, { lang: LANG === 'hi' || LANG === 'gu' ? LANG : 'en' }) : null;
  const ov = openModal('<h3>🎁 Their year with us</h3><p class="noi18n">' + esc(cl.trade_name) + '</p><div id="yc-box" class="yc-box"></div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Close</button><button class="btn btn-primary" data-m="yes">📤 Share / Save</button></div>');
  if (cv) { cv.className = 'po-canvas'; $('#yc-box').appendChild(cv); }
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = () => { if (cv) ArkPoster.share(cv, 'year-with-us', ''); };
}

/* ---------------- actions ---------------- */
onAct('ra-list', () => showSub('Rate alerts', renderRateAlerts));
onAct('ra-for', async (el) => { const cl = await fetchClient(el.dataset.id); if (cl) rateAlertModal(cl); });
onAct('ra-new', () => pickClientThen('Rate alert for which shop?', (cl) => { if (typeof pickedBack === 'function') pickedBack(); rateAlertModal(cl); }));
onAct('ra-tell', async (el) => {
  const a = S.raList && S.raList.get(el.dataset.id);
  if (!a) return;
  openWa((a.clients || {}).mobile, rateAlertText(a));
  await db.from('rate_alerts').update({ told_at: new Date().toISOString() }).eq('id', a.id);
  renderRateAlerts();
});
onAct('ra-del', (el) => confirmModal('Remove this alert?', 'The shop will not be told when the rate gets there.', 'Remove', async () => {
  const { error } = await db.from('rate_alerts').delete().eq('id', el.dataset.id);
  if (error) { toast('Could not remove — try again.', 'err'); return; }
  renderRateAlerts();
}, true));
onAct('lv-list', () => showSub('Levels for shops', renderLevels));
onAct('lv-edit', (el) => levelModal(el.dataset.id || null));
onAct('rw-edit', () => rewardModal());
onAct('bf-level', () => {
  const F = S.bf, L = F && F.level;
  if (!L || F.levelUsed) return;
  const inp = document.querySelector('[data-bfr="labour_rate"]');
  const lab = inp ? numOrNull(inp.value) : null;
  if (!(lab > 0)) { toast('Write the labour first.', 'err'); return; }
  if (bfSetRate('labour_rate', String(Math.round(lab * (100 - num(L.making_off))) / 100))) { F.levelUsed = true; toast(num(L.making_off) + '% off making ✓', 'ok'); billLevelOffer(F); }
});
onAct('sd-for', (el) => showSub('What sold', () => renderSold(el.dataset.id)));
onAct('sd-toggle', (el) => soldToggle(el.dataset.id));
onAct('sd-pick', (el) => { const O = S.soldOf; if (!O) return; const id = el.dataset.id; if (O.pick.has(id)) O.pick.delete(id); else O.pick.add(id); el.classList.toggle('on', O.pick.has(id)); });
onAct('sd-send', () => soldSend());
onAct('ex-list', () => showSub('Exchange requests', renderExchanges));
onAct('ex-yes', (el) => exchangeAnswer(el.dataset.id, true));
onAct('ex-no', (el) => exchangeAnswer(el.dataset.id, false));
onAct('ex-wa', (el) => { const e = S.exList && S.exList.get(el.dataset.id); if (e) openWa((e.clients || {}).mobile, exchangeText(e)); });
onAct('rf-list', () => showSub('Shops told of by shops', renderReferrals));
onAct('rf-set', async (el) => { if (await referralSet(el.dataset.id, { status: el.dataset.s })) renderReferrals(); });
onAct('rf-add', (el) => {
  const r = S.rfList && S.rfList.get(el.dataset.id);
  if (!r) return;
  S.photos = { front: null, back: null };
  showSub('New Client', () => renderClientForm(null, { trade_name: r.shop_name, city: r.city || '', mobile: r.mobile || '', contact_person: r.person || '',
    notes: 'Told of by ' + ((r.clients || {}).trade_name || 'a shop') + (r.note ? ' — ' + r.note : '') }, 'manual'));
});
onAct('rf-joined', (el) => {
  const id = el.dataset.id;
  pickClientThen('Which card is the new shop?', async (cl) => {
    if (typeof pickedBack === 'function') pickedBack();
    if (await referralSet(id, { status: 'joined', joined_client: cl.id })) { toast('Joined ✓', 'ok'); renderReferrals(); }
  });
});
onAct('rf-reward', (el) => {
  const r = S.rfList && S.rfList.get(el.dataset.id);
  if (!r) return;
  const ov = openModal('<h3>🎁 Reward given</h3><p class="noi18n">' + esc((r.clients || {}).trade_name || '') + '</p>' +
    '<div class="field"><label>What you gave (a note)</label><input type="text" id="rf-n" maxlength="200" value="' + esc(appOpts().referral_reward || '') + '"></div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Save</button></div>');
  ov.querySelector('[data-m=no]').onclick = closeModal;
  ov.querySelector('[data-m=yes]').onclick = async () => {
    if (await referralSet(r.id, { rewarded_on: todayStr(), reward_note: $('#rf-n').value.trim() || null })) { closeModal(); toast('Saved ✓', 'ok'); renderReferrals(); }
  };
});
onAct('yc-for', (el) => yearCardOpen(el.dataset.id));
