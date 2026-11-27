/* ============================================================
   THE SHOP'S OWN PAGE — more (v36, database update 24), used by
   shop.html: its level and "your year with us", gold rate alerts,
   the pieces it bought (mark what sold, ask to exchange), refer a
   shop. No login: everything goes through the shop's own link.
   ============================================================ */
(function () {
  'use strict';
  var T = {
    hi: {
      'member': 'सदस्य', 'off making': 'मेकिंग पर छूट', 'this year': 'इस साल', 'more to': 'और, फिर', 'Your year': 'आपका साल', 'Your year with us': 'हमारे साथ आपका साल',
      'Gold rate alerts': 'सोने के रेट का अलर्ट', 'Tell me when 24K (1 g) is': 'मुझे बताएँ जब 24K (1 ग्राम) हो', 'below': 'से कम', 'above': 'से ज़्यादा',
      'Tell me': 'मुझे बताएँ', 'reached on': 'पहुँचा', 'at': '—', 'Remove': 'हटाएँ', 'Waiting': 'इंतज़ार में', 'You can keep 3 alerts at a time — remove one first': 'एक समय में 3 अलर्ट रख सकते हैं — पहले एक हटाएँ',
      'Write the rate for 1 g of 24K': '24K के 1 ग्राम का रेट लिखें', 'Below or above?': 'कम या ज़्यादा?',
      'Pieces you bought': 'आपके ख़रीदे पीस', 'Tap "Sold" when a piece sells — we send more of what sells.': 'पीस बिकने पर "बिका" दबाएँ — जो बिकता है, हम वैसा और भेजते हैं।',
      'Tap the pieces to change, then send.': 'जो पीस बदलने हैं उन पर टैप करें, फिर भेजें।', 'Sold': 'बिका', 'Sold?': 'बिका?',
      'Ask to exchange pieces that did not sell': 'जो पीस नहीं बिके उन्हें बदलने के लिए कहें', 'A note (optional)': 'नोट (वैकल्पिक)',
      'Send the request': 'अनुरोध भेजें', 'Cancel': 'रद्द करें', 'Choose the pieces to change': 'बदलने वाले पीस चुनें',
      'You have 5 requests waiting — we will answer them first': 'आपके 5 अनुरोध इंतज़ार में हैं — पहले उनका जवाब देंगे',
      'Exchange': 'बदलाव', 'pieces': 'पीस', 'piece': 'पीस', 'waiting for our answer': 'हमारे जवाब का इंतज़ार', 'Yes': 'हाँ', 'No': 'नहीं', 'Sent ✓': 'भेज दिया ✓',
      'Refer a shop': 'कोई दुकान बताएँ', "Shop's name": 'दुकान का नाम', 'City': 'शहर', 'Person': 'व्यक्ति', 'Mobile': 'मोबाइल', 'Send': 'भेजें',
      'You told us of': 'आपने बताईं', 'joined': 'जुड़ीं', "Write the shop's name": 'दुकान का नाम लिखें', 'Check the mobile number': 'मोबाइल नंबर जाँचें',
      'That is many for one day — send the rest tomorrow': 'एक दिन के लिए काफ़ी — बाकी कल भेजें', 'Thank you — we will call them': 'धन्यवाद — हम उन्हें कॉल करेंगे',
      'Could not send — check the internet and try again.': 'भेजा नहीं जा सका — इंटरनेट देखें और फिर से कोशिश करें।', 'Share / Save': 'भेजें / सेव करें', 'Close': 'बंद करें',
      'This piece is not on your bills': 'यह पीस आपके बिलों में नहीं है'
    },
    gu: {
      'member': 'સભ્ય', 'off making': 'મેકિંગ પર છૂટ', 'this year': 'આ વર્ષે', 'more to': 'વધુ, પછી', 'Your year': 'તમારું વર્ષ', 'Your year with us': 'અમારી સાથે તમારું વર્ષ',
      'Gold rate alerts': 'સોનાના રેટનો અલર્ટ', 'Tell me when 24K (1 g) is': 'મને જણાવો જ્યારે 24K (1 ગ્રામ) થાય', 'below': 'થી ઓછો', 'above': 'થી વધુ',
      'Tell me': 'મને જણાવો', 'reached on': 'પહોંચ્યો', 'at': '—', 'Remove': 'કાઢો', 'Waiting': 'રાહમાં', 'You can keep 3 alerts at a time — remove one first': 'એક સમયે 3 અલર્ટ રાખી શકો — પહેલાં એક કાઢો',
      'Write the rate for 1 g of 24K': '24K ના 1 ગ્રામનો રેટ લખો', 'Below or above?': 'ઓછો કે વધુ?',
      'Pieces you bought': 'તમે ખરીદેલા પીસ', 'Tap "Sold" when a piece sells — we send more of what sells.': 'પીસ વેચાય ત્યારે "વેચાયો" દબાવો — જે વેચાય છે તેવા અમે વધુ મોકલીએ છીએ.',
      'Tap the pieces to change, then send.': 'જે પીસ બદલવા છે તેના પર ટેપ કરો, પછી મોકલો.', 'Sold': 'વેચાયો', 'Sold?': 'વેચાયો?',
      'Ask to exchange pieces that did not sell': 'ન વેચાયેલા પીસ બદલવા કહો', 'A note (optional)': 'નોંધ (વૈકલ્પિક)',
      'Send the request': 'વિનંતી મોકલો', 'Cancel': 'રદ કરો', 'Choose the pieces to change': 'બદલવાના પીસ પસંદ કરો',
      'You have 5 requests waiting — we will answer them first': 'તમારી 5 વિનંતી રાહમાં છે — પહેલાં તેનો જવાબ આપીશું',
      'Exchange': 'બદલાવ', 'pieces': 'પીસ', 'piece': 'પીસ', 'waiting for our answer': 'અમારા જવાબની રાહ', 'Yes': 'હા', 'No': 'ના', 'Sent ✓': 'મોકલ્યું ✓',
      'Refer a shop': 'કોઈ દુકાન જણાવો', "Shop's name": 'દુકાનનું નામ', 'City': 'શહેર', 'Person': 'વ્યક્તિ', 'Mobile': 'મોબાઇલ', 'Send': 'મોકલો',
      'You told us of': 'તમે જણાવી', 'joined': 'જોડાઈ', "Write the shop's name": 'દુકાનનું નામ લખો', 'Check the mobile number': 'મોબાઇલ નંબર તપાસો',
      'That is many for one day — send the rest tomorrow': 'એક દિવસ માટે ઘણું — બાકીનું કાલે મોકલો', 'Thank you — we will call them': 'આભાર — અમે તેમને કૉલ કરીશું',
      'Could not send — check the internet and try again.': 'મોકલી ન શકાયું — ઇન્ટરનેટ તપાસો અને ફરી પ્રયત્ન કરો.', 'Share / Save': 'મોકલો / સેવ કરો', 'Close': 'બંધ કરો',
      'This piece is not on your bills': 'આ પીસ તમારા બિલમાં નથી'
    }
  };
  var CSS = '.lvl b{font-size:15.5px}.ra-row,.ex-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--line)}' +
    '.ra-row:first-child,.ex-row:first-child{border-top:0}.ra-row span,.ex-row span{flex:1}.ra-row .x{border:0;background:none;color:var(--muted);font:inherit;font-size:18px;cursor:pointer}' +
    '.ra-form{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:8px}.ra-form select,.ra-form input,.rf-form input,.ex-bar input{font:inherit;padding:9px 10px;border:1.5px solid var(--line);border-radius:10px;background:#fff}' +
    '.ra-form input{width:120px}.ra-form button,.rf-form button,.ex-bar button,.link-btn{padding:9px 14px;border-radius:10px;border:0;background:var(--maroon);color:#fff;font:inherit;font-weight:750;cursor:pointer}' +
    '.link-btn{background:#fff;color:var(--maroon);border:1.5px solid var(--line);margin:4px 0 12px}.ex-bar .ghost{background:#fff;color:var(--ink,#27222b);border:1.5px solid var(--line)}' +
    '.pcs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px}.pc2{background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(40,20,30,.08);border:2.5px solid transparent;position:relative;font-size:12.5px}' +
    '.pc2 img{width:100%;aspect-ratio:1;object-fit:cover;display:block;background:#f1ede7}.pc2 b{display:block;padding:5px 7px 0;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.pc2 span{display:block;padding:0 7px;color:var(--muted)}.pc2.on{border-color:var(--maroon)}.pc2.sold img{opacity:.55}' +
    '.sold-btn{display:block;width:calc(100% - 10px);margin:5px;padding:6px 4px;border-radius:8px;border:1.5px solid var(--line);background:#fff;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;color:var(--maroon)}' +
    '.pc2.sold .sold-btn{background:var(--green,#1a7f4e);border-color:var(--green,#1a7f4e);color:#fff}.pc2 .tk{position:absolute;right:6px;top:6px;width:24px;height:24px;border-radius:50%;background:#fff;border:2px solid var(--maroon);color:var(--maroon);font-style:normal;font-weight:900;display:flex;align-items:center;justify-content:center}' +
    '.pc2.on .tk{background:var(--maroon);color:#fff}.ex-bar{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}.ex-bar input{flex:1;min-width:160px}' +
    '.rf-form{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}.rf-form>*{min-width:0;width:100%}.rf-form .w2{grid-column:1/-1}.rw{background:#fff6e5;border-radius:10px;padding:8px 10px;margin-bottom:8px;font-weight:650}' +
    '.sm-ok{color:var(--green,#1a7f4e);font-weight:700;margin-top:6px}.sm-err{color:var(--red);font-weight:650;margin-top:6px}';
  var st = { mode: '', pick: {}, note: '', ok: {}, err: {}, urls: {} };
  function M(lang) { return function (s) { return (T[lang] && T[lang][s]) || s; }; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function rs(v) { return '₹ ' + Math.round(Number(v) || 0).toLocaleString('en-IN'); }
  function gr(n) { return (Math.round(Number(n || 0) * 1000) / 1000).toLocaleString('en-IN', { maximumFractionDigits: 3 }) + ' g'; }
  var MON = { en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    hi: ['जन', 'फ़र', 'मार्च', 'अप्रै', 'मई', 'जून', 'जुला', 'अग', 'सित', 'अक्टू', 'नव', 'दिस'],
    gu: ['જાન્યુ', 'ફેબ્રુ', 'માર્ચ', 'એપ્રિ', 'મે', 'જૂન', 'જુલા', 'ઑગ', 'સપ્ટે', 'ઑક્ટો', 'નવે', 'ડિસે'] };
  function day(iso, lang) { if (!iso) return ''; var d = new Date(String(iso).length === 10 ? iso + 'T00:00:00' : iso); return d.getDate() + ' ' + (MON[lang] || MON.en)[d.getMonth()]; }
  function msg(k, lang) { var t = M(lang); return (st.ok[k] ? '<div class="sm-ok">' + esc(t(st.ok[k])) + '</div>' : '') + (st.err[k] ? '<div class="sm-err">' + esc(t(st.err[k])) + '</div>' : ''); }
  function errOf(r) { return String((r && r.error && r.error.message) || '').replace(/\.$/, '') || 'Could not send — check the internet and try again.'; }

  function html(d, lang) {
    if (!('alerts' in d)) return '';   // before update 24
    if (!document.getElementById('sm-css')) { var s = document.createElement('style'); s.id = 'sm-css'; s.textContent = CSS; document.head.appendChild(s); }
    var t = M(lang), h = '';
    var L = d.level;
    if (L && L.name) {
      h += '<div class="card extra lvl"><span class="ic">🏅</span><div><b>' + esc(L.name + ' ' + t('member') + (Number(L.making_off) ? ' · ' + Number(L.making_off) + '% ' + t('off making') : '')) + '</b>' +
        '<span>' + esc(gr(L.g) + ' ' + t('this year') + (L.next ? ' · ' + gr(L.next_g) + ' ' + t('more to') + ' ' + L.next : '')) + '</span></div>' +
        '<button class="go" data-sm-year="1">' + esc(t('Your year')) + '</button></div>';
    }
    var al = d.alerts || [], act = al.filter(function (a) { return a.active; });
    h += '<h2>🔔 ' + esc(t('Gold rate alerts')) + '</h2><div class="card">' + al.map(function (a) {
      return '<div class="ra-row"><span>' + esc((lang === 'en' ? (a.kind === 'below' ? 'below ' : 'above ') + rs(a.rate) : rs(a.rate) + ' ' + t(a.kind))) +
        (a.active ? ' · ' + esc(t('Waiting')) : ' · ✓ ' + esc(t('reached on') + ' ' + day(a.hit_on, lang) + ' ' + t('at') + ' ' + rs(a.hit_rate))) + '</span>' +
        '<button class="x" data-sm-raoff="' + esc(a.id) + '" aria-label="✕">✕</button></div>';
    }).join('') +
      (act.length < 3 ? '<div class="ra-form"><span>' + esc(t('Tell me when 24K (1 g) is')) + '</span><select id="sm-rak"><option value="below">' + esc(t('below')) + '</option><option value="above">' + esc(t('above')) + '</option></select>' +
        '<input id="sm-rar" inputmode="numeric" placeholder="₹" value="' + esc(d.rate && d.rate.r24 ? Math.round(Number(d.rate.r24) * 0.98) : '') + '"><button data-sm-ra="1">' + esc(t('Tell me')) + '</button></div>' : '') +
      msg('ra', lang) + '</div>';
    var ps = d.pieces || [];
    if (ps.length) {
      var ex = st.mode === 'exchange';
      h += '<h2>' + esc(t('Pieces you bought')) + '</h2><p class="hint">' + esc(t(ex ? 'Tap the pieces to change, then send.' : 'Tap "Sold" when a piece sells — we send more of what sells.')) + '</p>' +
        '<div class="pcs">' + ps.map(function (p) {
          return '<div class="pc2' + (p.sold ? ' sold' : '') + (st.pick[p.id] ? ' on' : '') + '" data-sm-pc="' + esc(p.id) + '"><img data-sm-ph="' + esc(p.photo || '') + '" alt=""' + (st.urls[p.photo] ? ' src="' + esc(st.urls[p.photo]) + '"' : '') + '>' +
            '<b>' + esc(p.tag || '') + '</b><span>' + esc([p.category, day(p.on, lang)].filter(Boolean).join(' · ')) + '</span>' +
            (ex ? (p.sold ? '' : '<i class="tk">' + (st.pick[p.id] ? '✓' : '') + '</i>') : '<button class="sold-btn" data-sm-sold="' + esc(p.id) + '">' + esc(p.sold ? '✓ ' + t('Sold') : t('Sold?')) + '</button>') + '</div>';
        }).join('') + '</div>' +
        (ex ? '<div class="ex-bar"><input id="sm-exn" maxlength="500" placeholder="' + esc(t('A note (optional)')) + '" value="' + esc(st.note) + '"><button data-sm-exgo="1">' + esc(t('Send the request')) + '</button>' +
          '<button class="ghost" data-sm-exno="1">' + esc(t('Cancel')) + '</button></div>' : '<button class="link-btn" data-sm-ex="1">🔄 ' + esc(t('Ask to exchange pieces that did not sell')) + '</button>') + msg('ex', lang);
    }
    var xs = d.exchanges || [];
    if (xs.length) {
      h += '<div class="card">' + xs.map(function (e) {
        return '<div class="ex-row"><span>🔄 ' + esc(t('Exchange') + ' · ' + e.n + ' ' + t(e.n === 1 ? 'piece' : 'pieces') + ' · ' + day(e.at, lang) + ' — ' +
          (e.status === 'new' ? t('waiting for our answer') : t(e.status === 'accepted' ? 'Yes' : 'No')) + (e.answer ? ': ' + e.answer : '')) + '</span></div>';
      }).join('') + '</div>';
    }
    var rf = d.referred || {};
    h += '<h2>🤝 ' + esc(t('Refer a shop')) + '</h2><div class="card">' + (d.reward ? '<div class="rw">🎁 ' + esc(d.reward) + '</div>' : '') +
      (rf.n ? '<p class="hint" style="margin:0 0 8px">' + esc(t('You told us of') + ' ' + rf.n + ' · ' + t('joined') + ' ' + (rf.joined || 0)) + '</p>' : '') +
      '<div class="rf-form"><input class="w2" id="sm-rfn" maxlength="100" placeholder="' + esc(t("Shop's name")) + '"><input id="sm-rfc" maxlength="60" placeholder="' + esc(t('City')) + '">' +
      '<input id="sm-rfp" maxlength="80" placeholder="' + esc(t('Person')) + '"><input id="sm-rfm" inputmode="tel" maxlength="16" placeholder="' + esc(t('Mobile')) + '">' +
      '<input id="sm-rfo" maxlength="500" placeholder="' + esc(t('A note (optional)')) + '"><button class="w2" data-sm-rf="1">' + esc(t('Send')) + '</button></div>' + msg('rf', lang) + '</div>';
    return h;
  }

  function sheet(inner) {
    var old = document.querySelector('.sheet'); if (old) old.remove();
    var s = document.createElement('div'); s.className = 'sheet';
    s.innerHTML = '<div class="in">' + inner + '</div>';
    s.onclick = function (e) { if (e.target === s) s.remove(); };
    document.body.appendChild(s);
    return s;
  }
  function wire(root, ctx) {
    var db = ctx.db, token = ctx.token, d = ctx.data, t = M(ctx.lang);
    function again() { ctx.redraw(); }
    function reload() {
      return db.rpc('shop_page', { p_token: token }).then(function (r) { if (!r.error && r.data) { Object.keys(r.data).forEach(function (k) { d[k] = r.data[k]; }); } again(); });
    }
    function on(sel, fn) { root.querySelectorAll(sel).forEach(function (el) { el.onclick = function (e) { e.preventDefault(); fn(el); }; }); }
    on('[data-sm-ra]', function (b) {
      var kind = root.querySelector('#sm-rak').value, rate = Number(String(root.querySelector('#sm-rar').value).replace(/[^\d.]/g, ''));
      st.ok.ra = ''; st.err.ra = '';
      b.disabled = true;
      db.rpc('shop_rate_alert', { p_token: token, p_kind: kind, p_rate: rate || null }).then(function (r) {
        if (r.error) { st.err.ra = errOf(r); again(); return; }
        st.ok.ra = 'Sent ✓'; reload();
      }, function () { st.err.ra = 'Could not send — check the internet and try again.'; again(); });
    });
    on('[data-sm-raoff]', function (b) {
      db.rpc('shop_rate_alert_off', { p_token: token, p_id: b.dataset.smRaoff }).then(function () { st.ok.ra = ''; reload(); }, function () {});
    });
    on('[data-sm-sold]', function (b) {
      var id = b.dataset.smSold, p = (d.pieces || []).filter(function (x) { return x.id === id; })[0];
      if (!p) return;
      b.disabled = true;
      db.rpc('shop_mark_sold', { p_token: token, p_piece: id, p_sold: !p.sold }).then(function (r) {
        if (r.error) { st.err.ex = errOf(r); again(); return; }
        p.sold = !p.sold; again();
      }, function () { b.disabled = false; });
    });
    on('[data-sm-ex]', function () { st.mode = 'exchange'; st.pick = {}; st.ok.ex = ''; st.err.ex = ''; again(); });
    on('[data-sm-exno]', function () { st.mode = ''; st.pick = {}; again(); });
    if (st.mode === 'exchange') {
      root.querySelectorAll('[data-sm-pc]').forEach(function (el) {
        el.onclick = function () {
          var id = el.dataset.smPc, p = (d.pieces || []).filter(function (x) { return x.id === id; })[0];
          if (!p || p.sold) return;
          var n = root.querySelector('#sm-exn'); if (n) st.note = n.value;
          if (st.pick[id]) delete st.pick[id]; else st.pick[id] = true;
          again();
        };
      });
    }
    on('[data-sm-exgo]', function (b) {
      var ids = Object.keys(st.pick).filter(function (k) { return st.pick[k]; });
      var n = root.querySelector('#sm-exn'); st.note = n ? n.value : '';
      st.err.ex = '';
      if (!ids.length) { st.err.ex = 'Choose the pieces to change'; again(); return; }
      b.disabled = true;
      db.rpc('shop_exchange_ask', { p_token: token, p_items: ids, p_note: st.note.trim() || null }).then(function (r) {
        if (r.error) { st.err.ex = errOf(r); again(); return; }
        st.mode = ''; st.pick = {}; st.note = ''; st.ok.ex = 'Sent ✓'; reload();
      }, function () { st.err.ex = 'Could not send — check the internet and try again.'; again(); });
    });
    on('[data-sm-rf]', function (b) {
      var v = function (id) { var el = root.querySelector('#' + id); return el ? el.value.trim() : ''; };
      st.ok.rf = ''; st.err.rf = '';
      if (!v('sm-rfn')) { st.err.rf = "Write the shop's name"; again(); return; }
      b.disabled = true;
      db.rpc('shop_refer', { p_token: token, p_name: v('sm-rfn'), p_city: v('sm-rfc') || null, p_person: v('sm-rfp') || null, p_mobile: v('sm-rfm') || null, p_note: v('sm-rfo') || null }).then(function (r) {
        if (r.error) { st.err.rf = errOf(r); again(); return; }
        st.ok.rf = 'Thank you — we will call them'; reload();
      }, function () { st.err.rf = 'Could not send — check the internet and try again.'; again(); });
    });
    on('[data-sm-year]', function () {
      if (!window.ArkPoster || !ArkPoster.yearCard) return;
      db.rpc('shop_year', { p_token: token }).then(function (r) {
        if (r.error || !r.data) return;
        var cv = ArkPoster.yearCard(r.data, { lang: ctx.lang });
        var s = sheet('<h3>🎁 ' + esc(t('Your year with us')) + '</h3><div id="sm-yc"></div><div class="row"><button id="sm-ycx">' + esc(t('Close')) + '</button>' +
          '<button class="pri" id="sm-ycg">' + esc(t('Share / Save')) + '</button></div>');
        s.querySelector('#sm-yc').appendChild(cv);
        s.querySelector('#sm-ycx').onclick = function () { s.remove(); };
        s.querySelector('#sm-ycg').onclick = function () { ArkPoster.share(cv, 'our-year', ''); };
      }, function () {});
    });
    /* the photos of the pieces */
    var need = [];
    root.querySelectorAll('img[data-sm-ph]').forEach(function (im) { var p = im.dataset.smPh; if (p && !st.urls[p] && need.indexOf(p) < 0) need.push(p); });
    if (need.length) {
      db.storage.from('catalogue').createSignedUrls(need.slice(0, 200), 3600).then(function (s) {
        (s.data || []).forEach(function (x) { if (x && x.signedUrl) st.urls[x.path] = x.signedUrl; });
        root.querySelectorAll('img[data-sm-ph]').forEach(function (im) { var u = st.urls[im.dataset.smPh]; if (u && !im.src) im.src = u; });
      }, function () { /* the photos stay blank */ });
    }
  }
  window.ShopMore = { html: html, wire: wire };
})();
