/* ============================================================
   POSTERS (v35) — today's gold rate card, a festival greeting, a
   new design — with a shop's own name (or yours), to share on
   WhatsApp or put on a status. The drawing: poster.js.
   ============================================================ */
'use strict';

function postersOn() { return typeof window.ArkPoster === 'object' && !!window.ArkPoster; }
const PO_KINDS = [['rate', '📈', 'Rate card'], ['fest', '🪔', 'Festival'], ['new', '💍', 'New design']];
const PO_GREET = {
  en: (n) => 'Happy ' + n, hi: (n) => n + ' की शुभकामनाएँ', gu: (n) => n + 'ની શુભેચ્છાઓ',
};
const PO_LINE = {
  en: 'Wishing you and your family joy, good health and prosperity.',
  hi: 'आपको और आपके परिवार को ख़ुशियाँ, अच्छी सेहत और समृद्धि की शुभकामनाएँ।',
  gu: 'આપને અને આપના પરિવારને ખુશી, સારું સ્વાસ્થ્ય અને સમૃદ્ધિની શુભેચ્છાઓ.',
};
async function posterStart(clientId, kind) {
  if (!postersOn()) return;
  const P = S.po = { kind: kind || 'rate', lang: LANG === 'hi' || LANG === 'gu' ? LANG : 'en', theme: 'maroon', tall: false,
    shop: bizName(), city: (S.biz && S.biz.city) || '', phone: (S.biz && S.biz.phone) || '', mobile: '', clientId: null,
    rows: [], fest: null, title: '', line: '', piece: null, img: null };
  if (clientId) {
    const cl = await fetchClient(clientId);
    if (cl) Object.assign(P, { clientId: cl.id, shop: cl.trade_name || '', city: cl.city || '', phone: cl.mobile || '', mobile: cl.mobile || '' });
  }
  const r = typeof loadTodayRate === 'function' ? await loadTodayRate() : null;
  P.rate = r || S.rateLast || null;
  P.rows = ArkPoster.rateRows(P.rate, P.lang);
  try {
    if (typeof festRows === 'function' && typeof festOn === 'function' && festOn()) {
      const fs = await festRows(todayStr(), addDaysStr(todayStr(), 45));
      P.fest = fs[0] || null;
    }
  } catch (e) { P.fest = null; }
  posterFestText(P);
  showSub('Posters', renderPoster);
}
function posterFestText(P) {
  const name = P.fest ? P.fest.name : 'Diwali';
  P.title = (PO_GREET[P.lang] || PO_GREET.en)(name);
  P.line = PO_LINE[P.lang] || PO_LINE.en;
}
function posterOpts(P) {
  const base = { shop: P.shop, city: P.city, phone: P.phone, lang: P.lang, theme: P.theme, tall: P.tall };
  if (P.kind === 'rate') return Object.assign(base, { date: P.rate ? P.rate.rate_date : todayStr(), rows: P.rows });
  if (P.kind === 'fest') return Object.assign(base, { title: P.title, line: P.line, img: P.img });
  const it = P.piece || {};
  return Object.assign(base, { img: P.img, lines: [[it.category, kt(it.purity)].filter(Boolean).join(' · '), num(it.gross_wt) ? 'Gross ' + grams(it.gross_wt) + (num(it.net_wt) ? ' · Net ' + grams(it.net_wt) : '') : ''].filter(Boolean) });
}
function posterCanvas(P) {
  const o = posterOpts(P);
  return P.kind === 'rate' ? ArkPoster.rateCard(o) : P.kind === 'fest' ? ArkPoster.festival(o) : ArkPoster.arrival(o);
}
function renderPoster() {
  const P = S.po, c = $('#content');
  if (!P || !c) return;
  const seg = (k, list, cur, raw) => '<div class="po-seg' + (raw ? ' noi18n' : '') + '" data-k="' + k + '">' + list.map((x) => '<button type="button" class="chip-btn' + (x[0] === cur ? ' on' : '') + '" data-v="' + x[0] + '">' + esc(x[1]) + '</button>').join('') + '</div>';
  const field = (id, label, v, ph, mode, labelHTML) => '<div class="field"><label>' + (labelHTML || esc(label)) + '</label><input type="text" id="' + id + '" value="' + esc(v == null ? '' : v) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + (mode ? ' inputmode="' + mode + '"' : '') + ' autocomplete="off"></div>';
  let form = '';
  if (P.kind === 'rate') {
    form = (P.rows.length ? '' : '<p class="hint">Today\'s gold rate is not set — write the rates here, or set it in Accounts → Gold rate.</p>') +
      '<div class="o-2col">' + [['24K (999)', '10g'], ['22K (916)', '10g'], ['18K (750)', '10g'], ['Silver', 'kg']].map((k, i) => {
        const row = P.rows.find((r) => r.k === k[0] || (k[1] === 'kg' && r.per === 'kg'));
        return field('po-r' + i, '', row ? row.v : '', '', 'numeric', (k[1] === 'kg' ? esc('Silver') : '<span class="noi18n">' + esc(k[0]) + '</span>') + ' · ' + esc(k[1] === 'kg' ? '₹ for 1 kg' : '₹ for 10 g'));
      }).join('') + '</div>';
  } else if (P.kind === 'fest') {
    form = field('po-title', 'Greeting', P.title, 'e.g. Happy Diwali') +
      '<div class="field"><label>A line under it</label><textarea id="po-line" rows="2" maxlength="160">' + esc(P.line) + '</textarea></div>' +
      '<div class="po-pick"><button class="btn btn-small btn-secondary" data-action="po-piece">' + (P.piece ? '💍 Another piece' : '💍 Add a piece\'s photo') + '</button>' +
      (P.piece ? '<button class="btn btn-small btn-ghost" data-action="po-nopiece">No photo</button>' : '') + '</div>';
  } else {
    form = '<div class="po-pick"><button class="btn btn-small btn-primary" data-action="po-piece">' + (P.piece ? '💍 Another piece' : '💍 Choose the piece') + '</button>' +
      (P.piece ? '<span class="noi18n" style="margin-left:8px">' + esc(pieceShort(P.piece)) + '</span>' : '') + '</div>';
  }
  c.innerHTML = '<div class="po-wrap"><div class="po-side">' +
    seg('kind', PO_KINDS.map((k) => [k[0], k[1] + ' ' + k[2]]), P.kind) +
    '<div class="card"><div class="o-2col">' + field('po-shop', 'Name on it', P.shop) + field('po-city', 'City', P.city) + '</div>' +
    field('po-phone', 'Phone on it', P.phone, '', 'tel') +
    (P.clientId ? '' : '<button class="btn btn-small btn-ghost" data-action="po-shop" style="margin-top:2px">🏪 A shop\'s name instead</button>') + '</div>' +
    '<div class="card">' + form + '</div>' +
    '<div class="card"><div class="field"><label>Language on it</label>' + seg('lang', [['en', 'English'], ['hi', 'हिन्दी'], ['gu', 'ગુજરાતી']], P.lang, true) + '</div>' +
    '<div class="field"><label>Colours</label><div class="po-seg po-themes" data-k="theme">' + ArkPoster.themes.map((t) => '<button type="button" class="po-sw po-sw-' + t + (t === P.theme ? ' on' : '') + '" data-v="' + t + '"></button>').join('') + '</div></div>' +
    '<div class="field"><label>Size</label>' + seg('tall', [['0', 'Post (4:5)'], ['1', 'WhatsApp status (9:16)']], P.tall ? '1' : '0') + '</div></div>' +
    '</div><div class="po-main"><div class="po-prev" id="po-prev"></div>' +
    '<div class="po-acts"><button class="btn btn-primary" data-action="po-share">📤 Share / Save</button>' +
    (P.mobile ? '<button class="btn btn-secondary" data-action="po-wa">💬 Tell the shop</button>' : '') + '</div>' +
    '<p class="hint">On a phone, "Share" opens WhatsApp and other apps with the picture. On a computer it saves the picture.</p></div></div>';
  c.querySelectorAll('.po-seg').forEach((g) => g.querySelectorAll('[data-v]').forEach((b) => {
    b.onclick = () => {
      const k = g.dataset.k, v = b.dataset.v;
      posterKeep();
      if (k === 'kind') P.kind = v;
      else if (k === 'lang') { P.lang = v; posterFestText(P); P.rows = posterRowsKeep(P); }
      else if (k === 'theme') P.theme = v;
      else if (k === 'tall') P.tall = v === '1';
      renderPoster();
    };
  }));
  c.querySelectorAll('input, textarea').forEach((i) => { i.oninput = () => { posterKeep(); posterDraw(); }; });
  posterDraw();
}
/* the silver row's name follows the language */
function posterRowsKeep(P) { const L = (ArkPoster.words[P.lang] || ArkPoster.words.en).silver; return P.rows.map((r) => (r.per === 'kg' ? Object.assign({}, r, { k: L }) : r)); }
function posterKeep() {
  const P = S.po;
  const v = (id) => { const el = $('#' + id); return el ? el.value : null; };
  if (v('po-shop') != null) P.shop = v('po-shop').trim();
  if (v('po-city') != null) P.city = v('po-city').trim();
  if (v('po-phone') != null) P.phone = v('po-phone').trim();
  if (P.kind === 'rate' && $('#po-r0')) {
    const L = (ArkPoster.words[P.lang] || ArkPoster.words.en).silver;
    P.rows = [['24K (999)', '10g'], ['22K (916)', '10g'], ['18K (750)', '10g'], [L, 'kg']].map((k, i) => ({ k: k[0], per: k[1], v: Math.round(numOrNull(v('po-r' + i)) || 0) })).filter((r) => r.v > 0);
  }
  if (P.kind === 'fest' && $('#po-title')) { P.title = v('po-title').trim(); P.line = $('#po-line').value.trim(); }
}
function posterDraw() {
  const P = S.po, box = $('#po-prev');
  if (!P || !box) return;
  const cv = posterCanvas(P);
  cv.className = 'po-canvas';
  box.innerHTML = '';
  box.appendChild(cv);
  S.poCanvas = cv;
}
async function posterPiece() {
  const P = S.po;
  const done = async (list) => {
    const it = list && list[0];
    if (!it) return;
    P.piece = it; P.img = null;
    const ph = (it.photo_paths || [])[0];
    if (ph) {
      const { data } = await db.storage.from('catalogue').createSignedUrl(ph, 600);
      if (data && data.signedUrl) P.img = await ArkPoster.loadImage(data.signedUrl);
      if (!P.img) toast('Could not load the photo — try again.', 'err');
    } else toast('This piece has no photo.', 'err');
    renderPoster();
  };
  const code = await promptText('Which piece?', 'Tag no. or design no.');
  if (!code) return;
  const list = typeof findStockByCode === 'function' ? await findStockByCode(code) : [];
  if (!list.length) { toast('No piece with this code.', 'err'); return; }
  if (list.length === 1) done(list); else choosePieces('Which piece?', list, false, done);
}
function promptText(title, label) {
  return new Promise((res) => {
    const ov = openModal('<h3>' + esc(title) + '</h3><div class="field"><label>' + esc(label) + '</label><input type="text" id="po-q" autocomplete="off" autocapitalize="characters"></div>' +
      '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Cancel</button><button class="btn btn-primary" data-m="yes">Find</button></div>');
    const go = () => { const v = $('#po-q').value.trim(); closeModal(); res(v || null); };
    ov.querySelector('[data-m=no]').onclick = () => { closeModal(); res(null); };
    ov.querySelector('[data-m=yes]').onclick = go;
    $('#po-q').onkeydown = (e) => { if (e.key === 'Enter') go(); };
    setTimeout(() => { const i = $('#po-q'); if (i) i.focus(); }, 50);
  });
}
async function posterShare() {
  const P = S.po;
  posterKeep();
  if (P.kind === 'new' && !P.img) { toast('Choose a piece with a photo first.', 'err'); return; }
  const cv = posterCanvas(P);
  const name = (P.kind === 'rate' ? 'rate-card-' : P.kind === 'fest' ? 'greeting-' : 'new-design-') + todayStr();
  const r = await ArkPoster.share(cv, name, '');
  if (r === 'downloaded') toast('Saved the picture ✓', 'ok');
}
function posterWaText(P) {
  if (P.kind === 'rate') return 'Namaste 🙏\nToday\'s rate card with your shop\'s name is ready — I am sending the picture. Put it on your WhatsApp status for your customers.\n— ' + bizName();
  if (P.kind === 'fest') return 'Namaste 🙏\nA greeting with your shop\'s name for ' + (P.fest ? P.fest.name : 'the festival') + ' — I am sending the picture. Share it with your customers.\n— ' + bizName();
  return 'Namaste 🙏\nA new design, with your shop\'s name on the picture — I am sending it. Share it with your customers.\n— ' + bizName();
}

onAct('po-open', () => posterStart(null));
onAct('po-for', (el) => posterStart(el.dataset.id));
onAct('po-shop', () => {
  posterKeep();
  pickClientThen('Whose name on it?', (cl) => {
    if (S.po) Object.assign(S.po, { clientId: cl.id, shop: cl.trade_name || '', city: cl.city || '', phone: cl.mobile || '', mobile: cl.mobile || '' });
    S.suppressPop = true; try { history.back(); } catch (_) { /* ignore */ } goBack();   // back to the poster, with the shop's name
  });
});
onAct('po-piece', () => { posterKeep(); posterPiece(); });
onAct('po-nopiece', () => { posterKeep(); S.po.piece = null; S.po.img = null; renderPoster(); });
onAct('po-share', () => posterShare());
onAct('po-wa', () => { const P = S.po; if (P && P.mobile) openWa(P.mobile, posterWaText(P)); });
