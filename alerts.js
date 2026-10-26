/* ============================================================
   PHONE ALERTS  (database update 09 + the send-alerts function)
   · More → Phone alerts: turn alerts on for this phone; choose which
     ones; send a test alert. The owner sets them up once (the keys are
     made on the owner's phone; the secret half goes only to the server).
   · Alerts: an order moved to a new step (to whoever took the order and
     the owner), and every morning at 8:30 each person's day.
   · Tapping an alert opens the app on that order.
   Loaded before app.js; uses its helpers only at call time.
   ============================================================ */
'use strict';

function alertsOn() { return !!S.dbv9; }
function pushSupported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
function alertB64u(b) {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function alertUnb64u(s) {
  const t = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '==='.slice((t.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
function alertDevice() {
  const u = navigator.userAgent || '';
  const os = /iPhone|iPad/.test(u) ? 'iPhone' : /Android/.test(u) ? 'Android' : /Windows/.test(u) ? 'Windows' : /Mac/.test(u) ? 'Mac' : 'Phone';
  const br = /SamsungBrowser/.test(u) ? 'Samsung Internet' : /EdgA?\//.test(u) ? 'Edge' : /Firefox|FxiOS/.test(u) ? 'Firefox' : /CriOS|Chrome/.test(u) ? 'Chrome' : /Safari/.test(u) ? 'Safari' : '';
  return os + (br ? ' · ' + br : '');
}
function alertIsIphone() { return /iPhone|iPad/.test(navigator.userAgent || ''); }
function alertStandalone() { return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }

/* the public half of the alert keys (null = not set up yet, or no database update 09) — loaded when
   Phone alerts is opened; nothing else needs it */
async function loadPushKey() {
  try { const { data, error } = await db.rpc('push_public_key'); S.pushKey = !error && data ? data : null; } catch (e) { S.pushKey = null; }
}
async function alertSub() {
  if (!pushSupported()) return null;
  try { const reg = await navigator.serviceWorker.ready; return await reg.pushManager.getSubscription(); } catch (e) { return null; }
}

/* ---------------- More → Phone alerts ---------------- */
async function renderAlerts() {
  const c = $('#content');
  if (!S.dbv9) { c.innerHTML = '<div class="notice">Phone alerts need the database update (ark-update-09.sql).</div>'; return; }
  c.innerHTML = loadingHTML();
  await loadPushKey();
  const owner = S.me.role === 'owner';
  let h = '';
  if (!S.pushKey) {
    h += owner
      ? '<div class="card al-card"><div class="al-ic">📳</div><b>Phone alerts are not set up yet</b>' +
        '<p>Set them up once — then everyone in the team can turn alerts on for their own phone.</p>' +
        '<button class="btn btn-primary" data-action="al-setup" id="al-setup">Set up phone alerts</button></div>'
      : '<div class="notice">Phone alerts are not set up yet — ask the owner to set them up (More → Phone alerts).</div>';
  } else if (!pushSupported()) {
    h += '<div class="notice">' + (alertIsIphone() && !alertStandalone()
      ? 'On iPhone, alerts work when the app is on the Home Screen: tap Share → Add to Home Screen, then open the app from there.'
      : 'This phone\'s browser cannot show alerts from the app. Open the app in Chrome.') + '</div>';
  } else if (Notification.permission === 'denied') {
    h += '<div class="notice">Alerts are blocked for this app in the phone\'s settings. Allow notifications for this site, then come back here.</div>';
  } else {
    const sub = await alertSub();
    let row = null;
    if (sub) {
      const { data } = await db.from('push_subscriptions').select('id, kinds').eq('endpoint', sub.endpoint).maybeSingle();
      row = data || null;
    }
    S.alRow = row;
    if (row) {
      const k = row.kinds || [];
      const sw = (v, title, sub2) => '<label class="sw-row"><span class="sw-t"><b>' + esc(title) + '</b><span>' + esc(sub2) + '</span></span>' +
        '<input type="checkbox" class="sw" data-al-kind="' + v + '"' + (k.indexOf(v) > -1 ? ' checked' : '') + '></label>';
      h += '<div class="card al-card on"><div class="al-ic">✅</div><b>Alerts are on for this phone</b></div>' +
        '<div class="section-label">Alerts on this phone</div><div class="card sw-card">' +
        sw('steps', 'Orders moving to a new step', (owner ? 'Every order as it moves' : 'Orders you took, as they move') + ' — CAD done, Finished, Delivered…') +
        sw('today', 'Morning summary, 8:30 am', 'Reminders, orders due or late, repairs ready, pieces to collect') + '</div>' +
        '<div class="action-row"><button class="btn btn-secondary" data-action="al-test" id="al-test">Send a test alert</button>' +
        '<button class="btn btn-ghost" data-action="al-off">Turn off on this phone</button></div>';
    } else {
      h += '<div class="card al-card"><div class="al-ic">📳</div><b>Alerts are off on this phone</b>' +
        '<p>Turn them on to hear when your orders move to the next step, and to get a summary of your day at 8:30 every morning.</p>' +
        '<button class="btn btn-primary" data-action="al-on" id="al-on">Turn on alerts on this phone</button></div>';
    }
    if (alertIsIphone() && !alertStandalone()) h += '<div class="hint" style="margin:0 2px 12px">On iPhone: add the app to the Home Screen (Share → Add to Home Screen) and open it from there.</div>';
  }
  if (owner && S.pushKey) {
    h += '<div class="section-label">Team</div><div class="card" id="al-team">' + loadingHTML() + '</div>' +
      '<div style="text-align:center;margin:6px 0 10px"><button class="btn btn-small btn-ghost" data-action="al-setup" data-again="1">Make new alert keys</button></div>';
  }
  if (!$('#content')) return;
  c.innerHTML = h;
  document.querySelectorAll('[data-al-kind]').forEach((el) => el.addEventListener('change', alertSaveKinds));
  if ($('#al-team')) loadAlertTeam();
}
async function loadAlertTeam() {
  const el = $('#al-team');
  const { data, error } = await db.rpc('push_phones');
  if (!$('#al-team')) return;
  if (error) { el.innerHTML = '<div class="empty" style="padding:8px">Could not load — try again.</div>'; return; }
  el.innerHTML = (data || []).map((p) => '<div class="al-person"><span>' + esc(p.full_name || '') + '</span>' +
    (+p.phones ? '<b class="ok">' + esc(+p.phones === 1 ? '1 phone' : p.phones + ' phones') + '</b>' : '<b>Off</b>') + '</div>').join('') ||
    '<div class="empty" style="padding:8px">No one yet.</div>';
}

/* the owner, once: the alert keys are made here, on this phone */
async function alertSetup(again) {
  const go = async () => {
    const btn = $('#al-setup');
    if (btn) btn.disabled = true;
    try {
      const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
      const pub = alertB64u(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey)));
      const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
      const email = (S.me && S.me.email) || (S.session && S.session.user && S.session.user.email) || '';
      const { error } = await db.rpc('push_set_keys', { p_public: pub, p_private: JSON.stringify(jwk),
        p_subject: email ? 'mailto:' + email : '', p_functions_url: String(CFG.SUPABASE_URL).replace(/\/$/, '') + '/functions/v1' });
      if (error) throw error;
      S.pushKey = pub;
      toast('Phone alerts set up ✓', 'ok');
      renderAlerts();
    } catch (e) {
      if (btn) btn.disabled = false;
      toast('Could not set up alerts — try again.', 'err');
    }
  };
  if (again) confirmModal('Make new alert keys?', 'Every phone will have to turn alerts on again. Only needed if alerts stopped working.', 'Make new keys', go, true);
  else go();
}

/* this phone: ask, subscribe, save */
async function alertTurnOn() {
  const btn = $('#al-on');
  if (btn) btn.disabled = true;
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('Alerts were not allowed on this phone.', 'err'); renderAlerts(); return; }
    const reg = await navigator.serviceWorker.ready;
    const key = alertUnb64u(S.pushKey);
    let sub = await reg.pushManager.getSubscription();
    if (sub && sub.options && sub.options.applicationServerKey && alertB64u(new Uint8Array(sub.options.applicationServerKey)) !== S.pushKey) {
      await sub.unsubscribe();   // made with old keys
      sub = null;
    }
    if (!sub) {
      try {
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      } catch (e) {
        // iPhone: the first tap went to the Allow question — the sign-up needs one more tap
        if (e && e.name === 'NotAllowedError' && Notification.permission === 'granted') {
          toast('Allowed ✓ — now tap the button once more to finish', 'ok');
          renderAlerts();
          return;
        }
        throw e;
      }
    }
    const j = sub.toJSON();
    const { data, error } = await db.rpc('push_claim', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_device: alertDevice() });
    if (error || data !== true) throw error || new Error('claim');
    toast('Alerts are on for this phone ✓', 'ok');
  } catch (e) {
    toast('Could not turn alerts on — try again.', 'err');
  }
  renderAlerts();
}
async function alertTurnOff() {
  const sub = await alertSub();
  if (sub) {
    await db.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    try { await sub.unsubscribe(); } catch (e) { /* already gone */ }
  }
  toast('Alerts are off for this phone', 'ok');
  renderAlerts();
}
async function alertSaveKinds() {
  const row = S.alRow;
  if (!row) return;
  const kinds = Array.from(document.querySelectorAll('[data-al-kind]')).filter((x) => x.checked).map((x) => x.dataset.alKind);
  const { error } = await db.from('push_subscriptions').update({ kinds }).eq('id', row.id);
  if (error) { toast('Could not save — try again.', 'err'); return; }
  row.kinds = kinds;
  toast('Saved ✓', 'ok');
}
async function alertTest() {
  const btn = $('#al-test');
  if (btn) btn.disabled = true;
  let r = null;
  try { r = await db.functions.invoke('send-alerts', { body: { kind: 'test' } }); } catch (e) { r = { error: e }; }
  if (btn) btn.disabled = false;
  if (!r || r.error) { toast('The alerts server is not ready — deploy the send-alerts function (see the setup steps).', 'err'); return; }
  const d = r.data || {};
  toast(d.sent ? 'Test alert sent ✓ — it should show in a moment' : 'Could not reach this phone — turn alerts off and on again.', d.sent ? 'ok' : 'err');
}

/* after an order moved: tell the others — a little later, so an Undo cancels it (the server
   sends nothing when the order is no longer at that step). Not skipped when this phone has not
   loaded the alert keys: the owner may have set them up after the app was opened here. */
const AL_WAITING = new Map();   // order id → { status, t }
function alertSend(orderId, status) {
  db.functions.invoke('send-alerts', { body: { kind: 'step', order_id: orderId, status } }).then(() => {}, () => {});
}
function alertStep(orderId, status) {
  if (S.dbv9 === false) return;   // database update 09 not run
  const w = AL_WAITING.get(orderId);
  if (w) clearTimeout(w.t);       // moved again: only where it is now
  AL_WAITING.set(orderId, { status, t: setTimeout(() => { AL_WAITING.delete(orderId); alertSend(orderId, status); }, 10000) });
}
/* leaving the app: send what is waiting now — a phone may stop the app's timers in the background */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden' || !AL_WAITING.size) return;
  AL_WAITING.forEach((w, id) => { clearTimeout(w.t); alertSend(id, w.status); });
  AL_WAITING.clear();
});

/* a tapped alert opens its order: index.html#o=<order id> */
function alertOpenUrl(u) {
  const m = /#o=([0-9a-f-]{36})/i.exec(String(u || ''));
  if (!m || !S.me) return false;
  try { history.replaceState(history.state, '', location.pathname + location.search); } catch (e) { /* ignore */ }
  openOrder(m[1]);
  return true;
}
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.type === 'open') alertOpenUrl(e.data.url); });
}
window.addEventListener('hashchange', () => { if (/#o=/.test(location.hash)) alertOpenUrl(location.hash); });

onAct('al-open', () => showSub('Phone alerts', renderAlerts));
onAct('al-setup', (el) => alertSetup(el.dataset.again === '1'));
onAct('al-on', () => alertTurnOn());
onAct('al-off', () => confirmModal('Turn alerts off?', 'This phone will stop getting alerts from the app.', 'Turn off', alertTurnOff));
onAct('al-test', () => alertTest());
