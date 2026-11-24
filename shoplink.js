/* ============================================================
   EACH SHOP'S OWN PAGE · "SEEN"  (database update 13)
   · One link per shop (shop.html, no login): its running orders with
     their step and delivery date, a CAD waiting for its OK, pieces it
     has on approval, repairs, and when the next payment is due. It can
     be turned off any time.
   · "Seen": the pages the shops open (order status, CAD, its own page,
     design photos) note when they were opened — shown here.
   ============================================================ */
'use strict';

function shopLinkOn() { return !!S.dbv13; }
function shopLinkUrl(token) { return new URL('shop.html#' + token, location.href).href; }

/* when a link was opened: { n, last } — or null when it cannot be told */
async function seenOf(kind, refId) {
  if (!S.dbv13 || !refId) return null;
  try {
    const { data, error } = await db.from('link_views').select('viewed_at').eq('kind', kind).eq('ref_id', refId)
      .order('viewed_at', { ascending: false }).limit(200);
    if (error) return null;
    const list = data || [];
    return { n: list.length, last: list.length ? list[0].viewed_at : null };
  } catch (e) { return null; }
}
/* one link sent to many shops (design photos): client id → { n, last } */
async function seenByShop(kind, refId) {
  const out = new Map();
  if (!S.dbv13 || !refId) return out;
  try {
    const { data, error } = await db.from('link_views').select('client_id, viewed_at').eq('kind', kind).eq('ref_id', refId)
      .order('viewed_at', { ascending: false }).limit(2000);
    if (error) return out;
    (data || []).forEach((v) => {
      if (!v.client_id) return;
      const x = out.get(v.client_id);
      if (x) x.n++; else out.set(v.client_id, { n: 1, last: v.viewed_at });
    });
  } catch (e) { /* nothing shown */ }
  return out;
}
function seenText(v) {
  if (!v || !v.n) return 'Not seen yet';
  return '👁 Seen ' + fmtD(v.last) + ', ' + fmtTime(v.last) + (v.n > 1 ? ' · ' + v.n + ' times' : '');
}

/* the shop's own page: make (or reuse) its link, send it, or turn it off */
async function openShopLink(clientId) {
  if (!shopLinkOn()) return;
  const cl = await fetchClient(clientId);
  if (!cl) return;
  let token = null;
  try {
    const { data, error } = await db.rpc('client_share_link', { p_client: clientId, p_on: true });
    token = !error && data ? data : null;
  } catch (e) { token = null; }
  if (!token) { toast('Could not make the link — try again.', 'err'); return; }
  const url = shopLinkUrl(token);
  const text = 'Namaste 🙏\nYour orders with us, pieces on approval and repairs — all on one page, any time:\n' + url + '\n— ' + bizName();
  const m = openModal('<h3>The shop\'s own page</h3>' +
    '<p>' + esc(cl.trade_name || 'The shop') + ' can open this page any time to see its orders in work, a CAD waiting for its OK, pieces on approval, repairs and the next payment date — no login needed. Turn it off any time.</p>' +
    '<div class="hint" id="shl-seen"></div>' +
    '<div class="sl-url noi18n">' + esc(url) + '</div>' +
    '<div class="fin-ask"><button class="btn btn-primary" data-m="wa">Send on WhatsApp</button>' +
    '<button class="btn btn-secondary" data-m="open">Open the page</button>' +
    '<button class="btn btn-secondary" data-m="copy">Copy the link</button>' +
    '<button class="btn btn-ghost" data-m="off">Turn the link off</button>' +
    '<button class="btn btn-ghost" data-m="no">Close</button></div>');
  seenOf('shop', clientId).then((v) => { const el = $('#shl-seen'); if (el && v) el.textContent = seenText(v); });
  m.querySelector('[data-m=wa]').onclick = () => { window.open(waUrl(cl.mobile, text), '_blank'); closeModal(); };
  m.querySelector('[data-m=open]').onclick = () => { window.open(url, '_blank'); };
  m.querySelector('[data-m=copy]').onclick = async () => {
    try { await navigator.clipboard.writeText(url); toast('Link copied ✓', 'ok'); }
    catch (e) { toast('Could not copy — press and hold the link to copy it.', 'err'); }
  };
  m.querySelector('[data-m=off]').onclick = () => {
    closeModal();
    confirmModal('Turn the shop\'s page off?', 'The link will stop working. Making it again gives a new link.', 'Turn off', async () => {
      let ok = false;
      try { const { error } = await db.rpc('client_share_link', { p_client: clientId, p_on: false }); ok = !error; } catch (e) { ok = false; }
      toast(ok ? 'Link turned off ✓' : 'Could not turn it off — try again.', ok ? 'ok' : 'err');
    }, true);
  };
  m.querySelector('[data-m=no]').onclick = closeModal;
}

onAct('cl-shoplink', (el) => openShopLink(el.dataset.id));
