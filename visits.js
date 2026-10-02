/* ============================================================
   VISIT CHECK-IN — where the executive was when a meeting was
   recorded, the client's shop location, and the owner's
   "route for a day" view with a Google Maps link.
   Location is only read when a meeting is saved (or when someone
   taps "Save shop location"); the app never tracks people.
   ============================================================ */
'use strict';

const AT_SHOP_KM = 0.3;   // within 300 m of the saved shop location counts as "at the shop"

function getPosition(timeoutMs) {
  const ms = timeoutMs || 9000;
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve({ status: 'unavailable' }); return; }
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; resolve({ status: 'unavailable' }); } }, ms);
    navigator.geolocation.getCurrentPosition(
      (p) => { if (done) return; done = true; clearTimeout(t); resolve({ status: 'ok', lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }); },
      (err) => { if (done) return; done = true; clearTimeout(t); resolve({ status: err && err.code === 1 ? 'denied' : 'unavailable' }); },
      { enableHighAccuracy: true, timeout: ms - 400, maximumAge: 60000 });
  });
}

/* fields to store with a meeting */
function visitFields(pos) {
  if (!pos) return {};
  if (pos.status !== 'ok') return { loc_status: pos.status };
  return { lat: pos.lat, lng: pos.lng, loc_accuracy: Math.round(pos.acc || 0), loc_status: 'ok' };
}

/* after a meeting: remember the shop location the first time (if the reading is good) */
async function maybeSaveShopLocation(cl, pos) {
  if (!cl || cl.lat != null || !pos || pos.status !== 'ok' || !(pos.acc <= 250)) return;
  await db.from('clients').update({ lat: pos.lat, lng: pos.lng, loc_accuracy: Math.round(pos.acc), loc_set_at: new Date().toISOString() }).eq('id', cl.id);
}

/* one line under a meeting in the client's history */
function visitLocHTML(it, cl) {
  if (!it.loc_status) return '';
  if (it.loc_status !== 'ok' || it.lat == null) return '<div class="v-loc off">📍 ' + (it.loc_status === 'denied' ? 'Location not shared' : 'Location not available') + '</div>';
  let label = 'Location';
  let cls = '';
  if (cl && cl.lat != null) {
    const km = distKm(it.lat, it.lng, cl.lat, cl.lng);
    if (km <= AT_SHOP_KM) { label = 'At the shop'; cls = ' ok'; }
    else { label = fmtDist(km) + ' from the shop'; cls = ' far'; }
  }
  return '<div class="v-loc' + cls + '">📍 <a href="' + esc(mapsSearchUrl(it.lat, it.lng)) + '" target="_blank" rel="noopener">' + esc(label) + '</a></div>';
}

/* row in the client details card */
function clientLocRowHTML(cl) {
  if (cl.lat != null) {
    return '<div class="detail-row"><div class="dk">Shop location</div><div class="dv">' +
      '<a href="' + esc(mapsDirUrl(cl.lat, cl.lng)) + '" target="_blank" rel="noopener">Navigate ›</a>' +
      ' <span style="color:var(--muted);font-weight:500;font-size:12.5px">· <a href="#" data-action="v-shop-loc" data-id="' + cl.id + '" style="color:var(--muted)">update</a></span></div></div>';
  }
  return '<div class="detail-row"><div class="dk">Shop location</div><div class="dv"><a href="#" data-action="v-shop-loc" data-id="' + cl.id + '">Save my current location as the shop ›</a></div></div>';
}

async function saveShopLocationNow(clientId) {
  const ov = document.createElement('div');
  ov.className = 'scan-overlay';
  ov.innerHTML = '<div class="spinner"></div><div>Getting your location…</div>';
  document.body.appendChild(ov);
  const pos = await getPosition(12000);
  ov.remove();
  if (pos.status !== 'ok') {
    toast(pos.status === 'denied' ? 'Location permission is off — allow it for this app in your phone settings.' : 'Could not get your location — try again outside or near a window.', 'err');
    return;
  }
  const { error } = await db.from('clients').update({ lat: pos.lat, lng: pos.lng, loc_accuracy: Math.round(pos.acc || 0), loc_set_at: new Date().toISOString() }).eq('id', clientId);
  if (error) { toast('Could not save — try again.', 'err'); return; }
  toast('Shop location saved ✓' + (pos.acc > 100 ? ' (accuracy about ' + Math.round(pos.acc) + ' m)' : ''), 'ok');
  if (typeof openClient === 'function') openClient(clientId, true);
}

/* ---------------- owner: one executive's route for a day ---------------- */
async function renderDayRoute(execId, execName) {
  const day = S.routeDay || todayStr();
  const c = $('#content');
  c.innerHTML =
    '<div class="card" style="padding:12px 14px"><div class="field" style="margin:0"><label>Day</label>' +
    '<input type="date" id="rt-day" value="' + day + '" max="' + todayStr() + '"></div></div>' +
    '<div id="rt-body">' + loadingHTML() + '</div>';
  $('#rt-day').addEventListener('change', (e) => { S.routeDay = e.target.value || todayStr(); renderDayRoute(execId, execName); });
  const next = ymd(new Date(new Date(day + 'T00:00:00').getTime() + 86400000));
  const { data, error } = await db.from('interactions')
    .select('id, client_id, happened_at, outcome, lat, lng, loc_accuracy, loc_status, clients(trade_name, city, lat, lng)')
    .eq('exec_id', execId).gte('happened_at', dayStartISO(day)).lt('happened_at', dayStartISO(next))
    .order('happened_at', { ascending: true }).limit(200);
  const box = $('#rt-body');
  if (!box) return;
  if (error) { box.innerHTML = '<div class="empty">Could not load.</div>'; return; }
  const rows = data || [];
  if (!rows.length) { box.innerHTML = '<div class="empty"><div class="big">🗺️</div>No meetings recorded by ' + esc(execName) + ' on ' + esc(fmtDLong(day)) + '.</div>'; return; }
  const located = rows.filter((r) => r.loc_status === 'ok' && r.lat != null);
  const atShop = located.filter((r) => r.clients && r.clients.lat != null && distKm(r.lat, r.lng, r.clients.lat, r.clients.lng) <= AT_SHOP_KM).length;
  const pts = located.slice(0, 10).map((r) => r.lat.toFixed(6) + ',' + r.lng.toFixed(6));
  box.innerHTML =
    '<div class="stat-row">' +
    '<div class="stat"><div class="st-num">' + rows.length + '</div><div class="st-label">Meetings</div></div>' +
    '<div class="stat"><div class="st-num">' + located.length + '</div><div class="st-label">With location</div></div>' +
    '<div class="stat"><div class="st-num">' + atShop + '</div><div class="st-label">At the shop</div></div>' +
    '</div>' +
    (pts.length ? '<a class="btn btn-primary" style="margin:10px 0 4px" href="' + esc('https://www.google.com/maps/dir/' + pts.join('/')) + '" target="_blank" rel="noopener">Open the route in Google Maps</a>' +
      (located.length > 10 ? '<div class="hint" style="text-align:center">Google Maps shows the first 10 stops.</div>' : '') : '') +
    '<div style="height:6px"></div>' +
    rows.map((r, i) => {
      const cl = r.clients || {};
      return '<div class="timeline-item"><div class="t-meta"><span>' + (i + 1) + '. ' + esc(fmtTime(r.happened_at)) + '</span>' +
        (r.outcome ? '<span>' + esc(r.outcome) + '</span>' : '') + '</div>' +
        '<div class="rem-client" data-action="open-client" data-id="' + r.client_id + '">' + esc(cl.trade_name || 'Client') + (cl.city ? ' · ' + esc(cl.city) : '') + ' ›</div>' +
        (r.loc_status ? visitLocHTML(r, cl) : '<div class="v-loc off">📍 Recorded before check-in was added</div>') +
        (r.loc_status === 'ok' && cl.lat == null ? '<div class="hint">Shop location not saved yet — it is saved on the first visit with a good signal.</div>' : '') +
        '</div>';
    }).join('');
}

onAct('v-shop-loc', (el) => {
  const id = el.dataset.id;
  confirmModal('Save shop location?', 'Use this only while you are standing at the client\'s shop. It is used for "Navigate" and to check visits.', 'Save location', () => saveShopLocationNow(id));
});
onAct('v-route', (el) => {
  const id = el.dataset.id, nm = el.dataset.name;
  S.routeDay = todayStr();
  showSub('Route — ' + nm, () => renderDayRoute(id, nm));
});
