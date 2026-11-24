/* ============================================================
   APP LOCK (this phone) and SIGN OUT A LOST PHONE
   · A 4-digit PIN, and the phone's own fingerprint / face lock if
     it has one — asked when the app opens and when you come back
     to it after a while. Kept on this phone only (the PIN as a
     salted hash). The owner can ask everyone to set one.
   · "Sign out on all phones" (database update 17): the owner for
     anyone in the team, anyone for themselves. Phones signed in
     before that are signed out the next time they open the app.
   ============================================================ */
'use strict';

const LOCK_KEY = 'appLock';
const LOCK_AFTER = [[0, 'Right away'], [1, 'After 1 minute'], [5, 'After 5 minutes'], [15, 'After 15 minutes']];
function b64uEnc(u8) { let s = ''; u8.forEach((b) => { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64uDec(s) { const t = String(s).replace(/-/g, '+').replace(/_/g, '/'); const bin = atob(t + '==='.slice((t.length + 3) % 4)); return Uint8Array.from(bin, (c) => c.charCodeAt(0)); }
/* this phone's lock for the person signed in (null = none) */
function lockCfg() {
  try {
    const v = JSON.parse(localStorage.getItem(LOCK_KEY) || 'null');
    return v && v.hash && S.me && v.uid === S.me.id ? v : null;
  } catch (e) { return null; }
}
function lockStore(v) { try { if (v) localStorage.setItem(LOCK_KEY, JSON.stringify(v)); else localStorage.removeItem(LOCK_KEY); return true; } catch (e) { return false; } }
async function pinHash(pin, salt, iter) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: b64uDec(salt), iterations: iter }, key, 256);
  return b64uEnc(new Uint8Array(bits));
}
function lockRequired() { return !!(appOpts().lock_required); }
async function bioAvailable() {
  try { return !!(window.PublicKeyCredential && PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); }
  catch (e) { return false; }
}
/* the phone's fingerprint / face lock, for this app (nothing is sent anywhere) */
async function bioRegister() {
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rp: { name: bizName() },
    user: { id: new TextEncoder().encode(String(S.me.id)).slice(0, 64), name: S.me.email || S.me.full_name || 'me', displayName: S.me.full_name || 'me' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
    timeout: 60000, attestation: 'none',
  } });
  return cred ? b64uEnc(new Uint8Array(cred.rawId)) : null;
}
async function bioCheck(id) {
  const a = await navigator.credentials.get({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    allowCredentials: [{ type: 'public-key', id: b64uDec(id), transports: ['internal'] }],
    userVerification: 'required', timeout: 60000,
  } });
  return !!a;
}

/* ---------------- the PIN pad (lock screen, and setting a PIN) ---------------- */
function pinPadHTML(title, sub, opt) {
  const o = opt || {};
  return '<div class="lk-box"><div class="lk-logo">🔒</div><div class="lk-biz noi18n">' + esc(bizName()) + '</div><h2 class="lk-title">' + esc(title) + '</h2>' +
    '<div class="lk-sub" id="lk-sub">' + esc(sub || '') + '</div><div class="lk-dots" id="lk-dots">' + '<i></i>'.repeat(4) + '</div>' +
    '<div class="lk-pad">' + ['1', '2', '3', '4', '5', '6', '7', '8', '9', o.bio ? 'bio' : '', '0', 'del'].map((k) =>
      !k ? '<span></span>' : k === 'del' ? '<button type="button" class="lk-k lk-del" data-k="del" aria-label="Delete">⌫</button>'
        : k === 'bio' ? '<button type="button" class="lk-k lk-bio" data-k="bio" aria-label="Fingerprint">👆</button>'
          : '<button type="button" class="lk-k" data-k="' + k + '">' + k + '</button>').join('') + '</div>' +
    (o.foot || '') + '</div>';
}
/* a cover over the whole app while it is locked (also between two screens of the lock) */
function lockShield(on) {
  let sh = $('#lock-shield');
  if (on && !sh) { sh = document.createElement('div'); sh.id = 'lock-shield'; sh.className = 'lock lk-shield'; document.body.appendChild(sh); }
  if (!on && sh) sh.remove();
}
/* a full-screen PIN pad; resolves with the 4 digits (or 'bio' / 'forgot' / null) */
function pinPad(title, sub, opt) {
  const o = opt || {};
  return new Promise((done) => {
    const old = $('#lock'); if (old) old.remove();
    const el = document.createElement('div');
    el.id = 'lock'; el.className = 'lock' + (o.cancel ? ' lk-soft' : '');
    el.innerHTML = pinPadHTML(title, sub, o);
    document.body.appendChild(el);
    if (typeof i18nNode === 'function') i18nNode(el);
    let pin = '';
    const dots = () => el.querySelectorAll('#lk-dots i').forEach((d, i) => d.classList.toggle('on', i < pin.length));
    const finish = (v) => { document.removeEventListener('keydown', onKey); el.remove(); done(v); };
    const press = (k) => {
      if (k === 'del') { pin = pin.slice(0, -1); dots(); return; }
      if (k === 'bio') { finish('bio'); return; }
      if (!/^\d$/.test(k) || pin.length >= 4) return;
      pin += k; dots();
      if (pin.length === 4) setTimeout(() => finish(pin), 120);
    };
    const onKey = (e) => { if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('del'); else if (e.key === 'Escape' && o.cancel) finish(null); };
    document.addEventListener('keydown', onKey);
    el.querySelectorAll('.lk-k').forEach((b) => { b.onclick = () => press(b.dataset.k); });
    const c = el.querySelector('[data-lk="cancel"]'); if (c) c.onclick = () => finish(null);
    const f = el.querySelector('[data-lk="forgot"]'); if (f) f.onclick = () => { finish('forgot'); };
    if (o.err) { const s2 = el.querySelector('#lk-sub'); s2.textContent = typeof trText === 'function' ? trText(o.err) : o.err; s2.classList.add('err'); el.querySelector('#lk-dots').classList.add('shake'); }
  });
}

/* a question on the lock screen itself (the app stays covered) */
function lockConfirm(title, text, yes) {
  return new Promise((done) => {
    const old = $('#lock'); if (old) old.remove();
    const el = document.createElement('div');
    el.id = 'lock'; el.className = 'lock';
    el.innerHTML = '<div class="lk-box"><div class="lk-logo">🔒</div><h2 class="lk-title">' + esc(title) + '</h2><div class="lk-sub">' + esc(text) + '</div>' +
      '<div class="lk-acts"><button type="button" class="btn btn-primary lk-danger" data-lk="yes">' + esc(yes) + '</button>' +
      '<button type="button" class="btn btn-secondary" data-lk="no">Back</button></div></div>';
    document.body.appendChild(el);
    el.querySelector('[data-lk="yes"]').onclick = () => { el.remove(); done(true); };
    el.querySelector('[data-lk="no"]').onclick = () => { el.remove(); done(false); };
  });
}

/* ---------------- locking ---------------- */
let LOCK_BUSY = false, LOCK_HIDDEN_AT = 0;
async function lockNow() {
  const cfg = lockCfg();
  if (!cfg || LOCK_BUSY) return;
  LOCK_BUSY = true;
  lockShield(true);   // over everything, an open form too (what was typed stays)
  let err = '', tries = 0, waitUntil = 0;
  const foot = '<button type="button" class="lk-link" data-lk="forgot">Forgot the PIN? Sign out</button>';
  try {
    // the phone's fingerprint first, when it is set up
    if (cfg.bio) { try { if (await bioCheck(cfg.bio)) { lockOk(); return; } } catch (e) { /* the PIN below */ } }
    for (;;) {
      if (Date.now() < waitUntil) err = 'Too many tries — wait ' + Math.ceil((waitUntil - Date.now()) / 1000) + ' seconds';
      const v = await pinPad('Enter your PIN', err ? '' : 'The app is locked', { bio: !!cfg.bio, foot, err });
      if (v === 'forgot') {
        if (await lockConfirm('Sign out?', 'You will need your email and password to sign in again — then set a new PIN.', 'Sign out')) { lockStore(null); await forceSignOut(null); return; }
        err = ''; continue;
      }
      if (v === 'bio') { try { if (await bioCheck(cfg.bio)) { lockOk(); return; } } catch (e) { /* stay */ } err = ''; continue; }
      if (Date.now() < waitUntil) continue;
      if (v && await pinHash(v, cfg.salt, cfg.iter) === cfg.hash) { lockOk(); return; }
      tries++;
      err = 'Wrong PIN — try again';
      if (tries % 5 === 0) waitUntil = Date.now() + 30000 * (tries / 5);
    }
  } finally { LOCK_BUSY = false; lockShield(false); }
}
function lockOk() { try { sessionStorage.setItem('lockOk', String(Date.now())); } catch (e) { /* ignore */ } }
document.addEventListener('visibilitychange', () => {
  if (!S.me) return;
  if (document.visibilityState === 'hidden') { LOCK_HIDDEN_AT = Date.now(); return; }
  const cfg = lockCfg();
  if (cfg && LOCK_HIDDEN_AT && Date.now() - LOCK_HIDDEN_AT >= (cfg.after || 0) * 60000) lockNow();
  LOCK_HIDDEN_AT = 0;
  signedOutCheck(true);
});

/* ---------------- setting the PIN ---------------- */
async function lockSetup(required) {
  const sub = required ? 'The owner asks everyone to lock the app on their phone. Choose 4 digits you will remember.' : 'Choose 4 digits you will remember.';
  const cancel = required ? '' : '<button type="button" class="lk-link" data-lk="cancel">Cancel</button>';
  let err = '';
  if (required) lockShield(true);
  try {
  for (;;) {
    const a = await pinPad('Set a PIN for the app', sub, { cancel: !required, foot: cancel, err });
    if (!a) return false;
    const b = await pinPad('Type the PIN again', '', { cancel: !required, foot: cancel });
    if (!b) return false;
    if (a !== b) { err = 'The two PINs were not the same — try again'; continue; }
    const salt = b64uEnc(crypto.getRandomValues(new Uint8Array(16))), iter = 100000;
    const old = lockCfg();
    lockStore({ uid: S.me.id, salt, iter, hash: await pinHash(a, salt, iter), after: old ? old.after : 1, bio: old ? old.bio || null : null });
    lockOk();
    toast('App lock is on ✓', 'ok');
    return true;
  }
  } finally { if (required) lockShield(false); }
}
async function lockAskPin(why) {
  const cfg = lockCfg();
  if (!cfg) return true;
  const v = await pinPad('Enter your PIN', why, { cancel: true, foot: '<button type="button" class="lk-link" data-lk="cancel">Cancel</button>' });
  if (!v) return false;
  if (await pinHash(v, cfg.salt, cfg.iter) === cfg.hash) return true;
  toast('Wrong PIN', 'err');
  return false;
}

/* ---------------- More → App lock ---------------- */
async function renderLock() {
  const c = $('#content');
  const cfg = lockCfg();
  const bioOk = await bioAvailable();
  if (!$('#content')) return;
  c.innerHTML = (lockRequired() ? '<div class="notice">The owner asks everyone to keep an app lock on their phone.</div>' : '') +
    '<div class="card lk-card ' + (cfg ? 'on' : '') + '"><div class="wd-row"><div><b>' + esc(cfg ? 'App lock is on' : 'App lock is off') + '</b>' +
    '<div class="hint">' + esc(cfg ? 'The app asks for your PIN when it opens, and when you come back to it.' : 'Lock the app with a 4-digit PIN — useful if the phone is shared or lost.') + '</div></div>' +
    (cfg ? '' : '<button class="btn btn-primary btn-small" data-action="lk-set">Set a PIN</button>') + '</div></div>' +
    (cfg ? '<div class="card sw-card">' +
      (bioOk ? '<label class="sw-row"><span class="sw-t"><b>Fingerprint / face</b><span>Open the app with the phone\'s own lock</span></span><input type="checkbox" class="sw" id="lk-bio"' + (cfg.bio ? ' checked' : '') + '></label>' : '') +
      '<div class="field" style="margin:10px 0 4px"><label>Lock the app</label><div class="seg" id="lk-after">' + LOCK_AFTER.map((x) =>
        '<button type="button" data-v="' + x[0] + '" class="' + ((cfg.after || 0) === x[0] ? 'on' : '') + '">' + esc(x[1]) + '</button>').join('') + '</div>' +
      '<div class="hint">' + esc('…after you leave it') + '</div></div></div>' +
      '<div class="action-row"><button class="btn btn-secondary" data-action="lk-change">Change PIN</button>' +
      (lockRequired() ? '' : '<button class="btn btn-ghost" data-action="lk-off">Turn off</button>') + '</div>' : '') +
    (S.dbv17 ? '<div class="section-label">Lost a phone?</div><div class="card"><p class="hint" style="margin:0 0 10px">Sign out on every phone where you are signed in — this one too. Then sign in again here.' +
      (isOwner() ? ' For someone in the team: More → Team → their name.' : ' Or ask the owner to do it for you.') + '</p>' +
      '<button class="btn btn-danger-ghost" data-action="so-me">Sign out on all my phones</button></div>' : '');
  const bio = $('#lk-bio');
  if (bio) bio.addEventListener('change', async () => {
    const v = lockCfg();
    if (!v) return;
    if (bio.checked) {
      try { const id = await bioRegister(); if (!id) throw new Error('none'); v.bio = id; lockStore(v); toast('Fingerprint / face lock is on ✓', 'ok'); }
      catch (e) { bio.checked = false; toast('The phone\'s fingerprint / face lock could not be set up.', 'err'); }
    } else { v.bio = null; lockStore(v); }
  });
  c.querySelectorAll('#lk-after button').forEach((b) => {
    b.onclick = () => { const v = lockCfg(); if (!v) return; v.after = +b.dataset.v; lockStore(v); c.querySelectorAll('#lk-after button').forEach((x) => x.classList.toggle('on', x === b)); };
  });
}
onAct('lk-open', () => showSub('App lock', renderLock));
onAct('lk-set', async () => { if (await lockSetup(false)) renderLock(); });
onAct('lk-change', async () => { if (await lockAskPin('Your PIN now') && await lockSetup(false)) renderLock(); });
onAct('lk-off', async () => {
  if (!(await lockAskPin('Your PIN, to turn the lock off'))) return;
  lockStore(null);
  toast('App lock is off', 'ok');
  renderLock();
});

/* ---------------- sign out on all phones (database update 17) ---------------- */
function signedInAtKey() { return 'signedInAt:' + (S.me ? S.me.id : ''); }
/* right after signing in with the password: the time the server gave this login */
function noteSignIn(session) {
  const u = session && session.user;
  if (!u) return;
  try { localStorage.setItem('signedInAt:' + u.id, new Date(u.last_sign_in_at || Date.now()).toISOString()); } catch (e) { /* ignore */ }
}
/* signed out on all phones after this phone signed in → sign out here too */
let SO_LAST = 0;
async function signedOutCheck(fetchNow) {
  if (!S.me || !S.dbv17) return false;
  let at = S.me.signed_out_at;
  if (fetchNow) {
    if (Date.now() - SO_LAST < 120000) return false;
    SO_LAST = Date.now();
    const { data } = await db.from('profiles').select('signed_out_at, active').eq('id', S.me.id).maybeSingle();
    if (!data) return false;
    at = data.signed_out_at;
    S.me.signed_out_at = at;
  }
  if (!at) return false;
  let mine = '';
  try { mine = localStorage.getItem(signedInAtKey()) || ''; } catch (e) { /* none */ }
  if (!mine) {   // signed in before this version of the app: the time the server gave that sign-in
    try {
      const { data: s } = await db.auth.getSession();
      const t = s && s.session && s.session.user && s.session.user.last_sign_in_at;
      if (t) mine = new Date(t).toISOString();
    } catch (e) { /* none */ }
  }
  if (mine && mine > new Date(at).toISOString()) return false;
  await forceSignOut('You were signed out on all phones. Sign in again.');
  return true;
}
async function forceSignOut(msg) {
  try { lockStore(null); } catch (e) { /* ignore */ }
  if (typeof offClear === 'function') { try { await offClear(); } catch (e) { /* ignore */ } }
  try { sessionStorage.clear(); } catch (e) { /* ignore */ }
  if (msg) { try { sessionStorage.setItem('signedOutMsg', msg); } catch (e) { /* ignore */ } }
  try { await db.auth.signOut({ scope: 'local' }); } catch (e) { /* ignore */ }   // this phone only
  // without internet the sign-out above cannot finish — forget the sign-in on this phone anyway
  try { Object.keys(localStorage).filter((k) => /^sb-.+-auth-token/.test(k)).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* ignore */ }
  location.reload();
}
async function signOutEverywhere(uid, name) {
  const me = uid === S.me.id;
  confirmModal(me ? 'Sign out on all your phones?' : 'Sign out on all phones?',
    me ? 'Every phone where you are signed in is signed out — this one too.' : 'Every phone where this person is signed in is signed out the next time it opens the app. Their data stays in the app.',
    'Sign out', async () => {
      const { error } = await db.rpc('sign_out_everywhere', { p_user: uid });
      if (error) { toast(/owner/i.test(error.message || '') ? 'Only the owner can sign out someone else.' : 'Could not sign out — try again.', 'err'); return; }
      if (me) { await forceSignOut('You were signed out on all phones. Sign in again.'); return; }
      toast('Signed out on all phones ✓', 'ok');
    }, true);
}
onAct('so-me', () => signOutEverywhere(S.me.id));
onAct('so-member', (el) => signOutEverywhere(el.dataset.id));

/* when the app opens: signed out elsewhere? then the lock (or the owner's "set a lock") */
window.LOGIN_HOOKS.push(async () => {
  for (let i = 0; i < 40 && !S.bizAt; i++) await new Promise((ok) => setTimeout(ok, 150));   // the business settings and the update in (util.js)
  if (await signedOutCheck(false)) return;
  let fresh = false;
  try { fresh = Date.now() - (+sessionStorage.getItem('lockOk') || 0) < 60000; } catch (e) { /* ignore */ }
  const cfg = lockCfg();
  if (cfg && !fresh) await lockNow();
  else if (!cfg && lockRequired()) await lockSetup(true);
});
