/* ============================================================
   POSTERS (v35) — drawn on a canvas, 1080 × 1350 (a post) or
   1080 × 1920 (a status), with a shop's own name on them:
   · today's gold rate card
   · a festival greeting
   · a new design (a photo of a piece)
   Used by the app (posters.js) and by the shop's own page
   (shop.html). Nothing here needs the app: plain functions on
   window.ArkPoster.
   ============================================================ */
(function () {
  'use strict';
  var THEMES = {
    maroon: { bg1: '#3a1424', bg2: '#5a2136', ink: '#fff7ec', gold: '#e0b65a', soft: 'rgba(255,247,236,.72)', line: 'rgba(224,182,90,.55)' },
    green:  { bg1: '#0f2e27', bg2: '#1d4a3e', ink: '#f4fbf6', gold: '#e3c06d', soft: 'rgba(244,251,246,.72)', line: 'rgba(227,192,109,.55)' },
    night:  { bg1: '#15131c', bg2: '#2b2738', ink: '#f7f3ea', gold: '#d8b35f', soft: 'rgba(247,243,234,.7)', line: 'rgba(216,179,95,.5)' },
    cream:  { bg1: '#fbf5ea', bg2: '#f1e4cc', ink: '#2a1c12', gold: '#a8781f', soft: 'rgba(42,28,18,.66)', line: 'rgba(168,120,31,.5)' }
  };
  var YW = {
    en: { title: 'Your year with us', gold: 'fine gold bought', bills: 'bills', bill: 'bill', pieces: 'pieces', piece: 'piece', orders: 'orders made', order: 'order made', ontime: 'delivered on time',
          top: 'Bought most', level: 'member', thanks: 'Thank you for a wonderful year', kg: 'kg', g: 'g' },
    hi: { title: 'हमारे साथ आपका साल', gold: 'फ़ाइन सोना ख़रीदा', bills: 'बिल', pieces: 'पीस', orders: 'ऑर्डर बने', ontime: 'समय पर डिलीवर',
          top: 'सबसे ज़्यादा ख़रीदा', level: 'सदस्य', thanks: 'शानदार साल के लिए धन्यवाद', kg: 'किलो', g: 'ग्राम' },
    gu: { title: 'અમારી સાથે તમારું વર્ષ', gold: 'ફાઇન સોનું ખરીદ્યું', bills: 'બિલ', pieces: 'પીસ', orders: 'ઓર્ડર બન્યા', ontime: 'સમયસર ડિલિવર',
          top: 'સૌથી વધુ ખરીદ્યું', level: 'સભ્ય', thanks: 'શાનદાર વર્ષ માટે આભાર', kg: 'કિલો', g: 'ગ્રામ' }
  };
  var WORDS = {
    en: { rate: "Today's gold rate", per10: 'for 10 g', perKg: 'for 1 kg', silver: 'Silver', note: 'Rates may change during the day · GST extra',
          newd: 'New arrival', visit: 'Visit us', call: 'Call' },
    hi: { rate: 'आज का सोने का भाव', per10: '10 ग्राम', perKg: '1 किलो', silver: 'चांदी', note: 'भाव दिन में बदल सकते हैं · GST अलग',
          newd: 'नई डिज़ाइन', visit: 'पधारें', call: 'कॉल करें' },
    gu: { rate: 'આજનો સોનાનો ભાવ', per10: '10 ગ્રામ', perKg: '1 કિલો', silver: 'ચાંદી', note: 'ભાવ દિવસ દરમિયાન બદલાઈ શકે · GST અલગ',
          newd: 'નવી ડિઝાઇન', visit: 'પધારો', call: 'કૉલ કરો' }
  };
  var SANS = '"Noto Sans", "Noto Sans Devanagari", "Noto Sans Gujarati", "Segoe UI", Roboto, Arial, sans-serif';
  var SERIF = 'Georgia, "Times New Roman", "Noto Serif", "Noto Serif Devanagari", "Noto Serif Gujarati", serif';
  var MONTHS = { en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    hi: ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'],
    gu: ['જાન્યુઆરી', 'ફેબ્રુઆરી', 'માર્ચ', 'એપ્રિલ', 'મે', 'જૂન', 'જુલાઈ', 'ઑગસ્ટ', 'સપ્ટેમ્બર', 'ઑક્ટોબર', 'નવેમ્બર', 'ડિસેમ્બર'] };

  function W(lang) { return WORDS[lang] || WORDS.en; }
  function theme(k) { return THEMES[k] || THEMES.maroon; }
  function inr(v) { return '₹ ' + Math.round(Number(v) || 0).toLocaleString('en-IN'); }
  function dayText(iso, lang) {
    var d = iso ? new Date(String(iso).length === 10 ? iso + 'T00:00:00' : iso) : new Date();
    return d.getDate() + ' ' + (MONTHS[lang] || MONTHS.en)[d.getMonth()] + ' ' + d.getFullYear();
  }
  function canvas(h) { var c = document.createElement('canvas'); c.width = 1080; c.height = h || 1350; return c; }
  /* shrink a font until the text fits */
  function fit(x, text, max, size, weight, family) {
    var s = size;
    do { x.font = (weight || '') + ' ' + s + 'px ' + (family || SANS); if (x.measureText(text).width <= max) break; s -= 2; } while (s > 14);
    return s;
  }
  function backdrop(x, th, w, h) {
    var gr = x.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, th.bg1); gr.addColorStop(1, th.bg2);
    x.fillStyle = gr; x.fillRect(0, 0, w, h);
    /* soft light from the top */
    var rg = x.createRadialGradient(w / 2, -h * 0.1, 10, w / 2, -h * 0.1, h * 0.9);
    rg.addColorStop(0, 'rgba(255,255,255,.10)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = rg; x.fillRect(0, 0, w, h);
    /* a double frame */
    x.strokeStyle = th.line; x.lineWidth = 3; x.strokeRect(36, 36, w - 72, h - 72);
    x.lineWidth = 1.5; x.strokeRect(50, 50, w - 100, h - 100);
    /* corner diamonds */
    [[36, 36], [w - 36, 36], [36, h - 36], [w - 36, h - 36]].forEach(function (p) {
      x.save(); x.translate(p[0], p[1]); x.rotate(Math.PI / 4); x.fillStyle = th.gold; x.fillRect(-9, -9, 18, 18); x.restore();
    });
  }
  function ornament(x, th, cx, y, wd) {
    x.strokeStyle = th.gold; x.lineWidth = 2;
    x.beginPath(); x.moveTo(cx - wd, y); x.lineTo(cx - 22, y); x.moveTo(cx + 22, y); x.lineTo(cx + wd, y); x.stroke();
    x.save(); x.translate(cx, y); x.rotate(Math.PI / 4); x.fillStyle = th.gold; x.fillRect(-8, -8, 16, 16); x.restore();
  }
  function centre(x, text, cx, y, size, weight, family, color, max) {
    x.fillStyle = color; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    fit(x, text, max || 900, size, weight, family);
    x.fillText(text, cx, y);
  }
  function header(x, th, o, w) {
    centre(x, o.shop || '', w / 2, 190, 76, '700', SERIF, th.gold, 900);
    if (o.city) centre(x, String(o.city).toUpperCase(), w / 2, 246, 30, '600', SANS, th.soft, 800);
    ornament(x, th, w / 2, 292, 230);
  }
  function footer(x, th, o, w, h) {
    var lang = o.lang || 'en';
    var line = [o.phone ? '📞 ' + o.phone : '', o.address || ''].filter(Boolean).join('   ·   ');
    if (line) centre(x, line, w / 2, h - 120, 36, '700', SANS, th.ink, 940);
    if (o.note !== false) centre(x, o.noteText || W(lang).note, w / 2, h - 76, 24, '500', SANS, th.soft, 940);
  }

  /* today's gold rate: o = { shop, city, phone, lang, theme, date, rows: [{ k: '24K (999)', v: 73000, per: '10g'|'kg' }] } */
  function rateCard(o) {
    var c = canvas(o.tall ? 1920 : 1350), x = c.getContext('2d'), w = c.width, h = c.height, th = theme(o.theme), L = W(o.lang);
    backdrop(x, th, w, h);
    header(x, th, o, w);
    var top = o.tall ? 470 : 380;
    centre(x, L.rate, w / 2, top, 58, '800', SANS, th.ink, 900);
    centre(x, dayText(o.date, o.lang), w / 2, top + 56, 32, '600', SANS, th.soft, 900);
    var rows = (o.rows || []).filter(function (r) { return r && Number(r.v) > 0; });
    var gap = o.tall ? 190 : 150, y0 = top + (o.tall ? 220 : 178);
    rows.forEach(function (r, i) {
      var y = y0 + i * gap;
      x.fillStyle = 'rgba(255,255,255,.07)';
      if (th === THEMES.cream) x.fillStyle = 'rgba(168,120,31,.08)';
      roundRect(x, 110, y - 82, w - 220, 116, 22); x.fill();
      x.strokeStyle = th.line; x.lineWidth = 1.5; roundRect(x, 110, y - 82, w - 220, 116, 22); x.stroke();
      x.textAlign = 'left'; x.fillStyle = th.gold; fit(x, r.k, 360, 46, '800', SANS); x.fillText(r.k, 150, y - 8);
      x.fillStyle = th.soft; x.font = '500 24px ' + SANS; x.fillText(r.per === 'kg' ? L.perKg : L.per10, 150, y + 22);
      x.textAlign = 'right'; x.fillStyle = th.ink; fit(x, inr(r.v), 480, 64, '800', SANS); x.fillText(inr(r.v), w - 150, y + 10);
    });
    footer(x, th, o, w, h);
    return c;
  }
  function roundRect(x, a, b, w, h, r) {
    x.beginPath(); x.moveTo(a + r, b); x.lineTo(a + w - r, b); x.quadraticCurveTo(a + w, b, a + w, b + r); x.lineTo(a + w, b + h - r);
    x.quadraticCurveTo(a + w, b + h, a + w - r, b + h); x.lineTo(a + r, b + h); x.quadraticCurveTo(a, b + h, a, b + h - r); x.lineTo(a, b + r);
    x.quadraticCurveTo(a, b, a + r, b); x.closePath();
  }
  /* a photo, covering a box (cropped to fill), with rounded corners */
  function photo(x, img, a, b, w, h, r) {
    if (!img) return;
    var s = Math.max(w / img.width, h / img.height), iw = img.width * s, ih = img.height * s;
    x.save(); roundRect(x, a, b, w, h, r || 28); x.clip();
    x.drawImage(img, a + (w - iw) / 2, b + (h - ih) / 2, iw, ih);
    x.restore();
  }
  function sparkle(x, th, cx, cy, s) {
    x.save(); x.translate(cx, cy); x.fillStyle = th.gold; x.beginPath();
    for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4, rr = i % 2 ? s * 0.28 : s; x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    x.closePath(); x.fill(); x.restore();
  }
  /* a festival greeting: o = { shop, city, phone, lang, theme, title ('Happy Diwali'), line (a wish), img (optional) } */
  function festival(o) {
    var c = canvas(o.tall ? 1920 : 1350), x = c.getContext('2d'), w = c.width, h = c.height, th = theme(o.theme);
    backdrop(x, th, w, h);
    var y = o.img ? (o.tall ? 300 : 210) : (o.tall ? 400 : 260);
    [[170, y - 40, 26], [910, y - 10, 18], [240, y + 120, 14], [860, y + 150, 24], [540, y - 90, 16]].forEach(function (p) { sparkle(x, th, p[0], p[1], p[2]); });
    centre(x, o.title || '', w / 2, y + 60, 96, '800', SERIF, th.gold, 900);
    if (o.img) {
      var ph = o.tall ? 860 : 560;
      photo(x, o.img, 150, y + 110, w - 300, ph, 30);
      x.strokeStyle = th.gold; x.lineWidth = 4; roundRect(x, 150, y + 110, w - 300, ph, 30); x.stroke();
      y += 110 + ph + 70;
    } else {
      y += 170;
      ornament(x, th, w / 2, y, 260);
      y += 100;
    }
    wrap(x, o.line || '', w / 2, y, 860, 44, '600', th.ink, 3);
    if (!o.img) rangoli(x, th, w / 2, y + (o.tall ? 560 : 300), o.tall ? 200 : 125);
    var by = h - (o.tall ? 330 : 260);
    ornament(x, th, w / 2, by - 70, 200);
    centre(x, o.shop || '', w / 2, by, 64, '700', SERIF, th.gold, 900);
    if (o.city) centre(x, String(o.city).toUpperCase(), w / 2, by + 48, 28, '600', SANS, th.soft, 800);
    footer(x, th, Object.assign({}, o, { note: false }), w, h);
    return c;
  }
  /* a rangoli: petals, a ring of dots, a gold centre */
  function rangoli(x, th, cx, cy, r) {
    x.save(); x.translate(cx, cy);
    x.strokeStyle = th.gold; x.lineWidth = 3;
    for (var i = 0; i < 12; i++) { x.save(); x.rotate(i * Math.PI / 6); x.beginPath(); x.ellipse(0, -r * 0.56, r * 0.16, r * 0.42, 0, 0, Math.PI * 2); x.stroke(); x.restore(); }
    x.beginPath(); x.arc(0, 0, r * 0.3, 0, Math.PI * 2); x.stroke();
    x.fillStyle = th.gold;
    x.beginPath(); x.arc(0, 0, r * 0.17, 0, Math.PI * 2); x.fill();
    for (var k = 0; k < 24; k++) { var a = k * Math.PI / 12; x.beginPath(); x.arc(Math.cos(a) * r * 1.08, Math.sin(a) * r * 1.08, Math.max(3, r * 0.035), 0, Math.PI * 2); x.fill(); }
    x.restore();
  }
  function wrap(x, text, cx, y, max, size, weight, color, lines) {
    x.font = weight + ' ' + size + 'px ' + SANS; x.fillStyle = color; x.textAlign = 'center';
    var words = String(text).split(/\s+/), line = '', out = [];
    words.forEach(function (wd) {
      var t = line ? line + ' ' + wd : wd;
      if (x.measureText(t).width > max && line) { out.push(line); line = wd; } else line = t;
    });
    if (line) out.push(line);
    out.slice(0, lines || 3).forEach(function (l, i) { x.fillText(l, cx, y + i * size * 1.3); });
  }
  /* a new design: o = { shop, city, phone, lang, theme, img, title, lines: [..] } */
  function arrival(o) {
    var c = canvas(o.tall ? 1920 : 1350), x = c.getContext('2d'), w = c.width, h = c.height, th = theme(o.theme), L = W(o.lang);
    backdrop(x, th, w, h);
    header(x, th, o, w);
    var y = 340, ph = o.tall ? 1060 : 700;
    if (o.img) {
      photo(x, o.img, 110, y, w - 220, ph, 30);
      x.strokeStyle = th.gold; x.lineWidth = 4; roundRect(x, 110, y, w - 220, ph, 30); x.stroke();
    }
    /* a ribbon */
    x.fillStyle = th.gold; roundRect(x, w / 2 - 190, y - 34, 380, 68, 34); x.fill();
    centre(x, (o.title || L.newd).toUpperCase(), w / 2, y + 12, 34, '800', SANS, th.bg1, 340);
    var ty = y + ph + 90;
    (o.lines || []).slice(0, 2).forEach(function (l, i) { centre(x, l, w / 2, ty + i * 58, i ? 34 : 46, i ? '600' : '800', SANS, i ? th.soft : th.ink, 900); });
    footer(x, th, Object.assign({}, o, { noteText: L.visit + ' · ' + (o.shop || '') }), w, h);
    return c;
  }
  function toBlob(c) {
    return new Promise(function (res) { c.toBlob(function (b) { res(b); }, 'image/jpeg', 0.92); });
  }
  /* share the picture (phones), or download it */
  function share(c, name, text) {
    return toBlob(c).then(function (b) {
      var f = null;
      try { f = new File([b], (name || 'poster') + '.jpg', { type: 'image/jpeg' }); } catch (e) { f = null; }
      if (f && navigator.canShare && navigator.canShare({ files: [f] })) {
        return navigator.share({ files: [f], text: text || '' }).then(function () { return 'shared'; }, function () { return 'cancelled'; });
      }
      var a = document.createElement('a');
      a.href = URL.createObjectURL(b); a.download = (name || 'poster') + '.jpg';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      return 'downloaded';
    });
  }
  function loadImage(url) {
    return new Promise(function (res) {
      if (!url) { res(null); return; }
      var i = new Image(); i.crossOrigin = 'anonymous';
      i.onload = function () { res(i); }; i.onerror = function () { res(null); };
      i.src = url;
    });
  }
  /* the rows of a rate card from a day's rates (₹ a gram): 10 g of gold, 1 kg of silver */
  function rateRows(r, lang) {
    if (!r) return [];
    var L = W(lang);
    return [['24K (999)', r.r24, '10g'], ['22K (916)', r.r22, '10g'], ['18K (750)', r.r18, '10g'], [L.silver, r.silver, 'kg']]
      .filter(function (a) { return Number(a[1]) > 0; })
      .map(function (a) { return { k: a[0], v: Math.round(Number(a[1]) * (a[2] === 'kg' ? 1000 : 10)), per: a[2] }; });
  }
  /* "your year with us": Y = { shop, city, from, to, g, bills, pieces, top, orders, delivered, on_time, level: { name }, business } */
  function yearCard(Y, o) {
    o = o || {};
    var c = canvas(1350), x = c.getContext('2d'), w = c.width, h = c.height, th = theme(o.theme || 'night'), L = YW[o.lang] || YW.en;
    backdrop(x, th, w, h);
    [[160, 150, 22], [930, 180, 16], [860, 90, 12], [220, 260, 12]].forEach(function (p) { sparkle(x, th, p[0], p[1], p[2]); });
    centre(x, L.title, w / 2, 170, 60, '800', SERIF, th.gold, 900);
    var M = MONTHS[o.lang] || MONTHS.en;
    var per = function (iso) { var d = new Date(iso + 'T00:00:00'); return M[d.getMonth()] + ' ' + d.getFullYear(); };
    centre(x, (Y.shop || '') + (Y.from ? '  ·  ' + per(Y.from) + ' – ' + per(Y.to) : ''), w / 2, 230, 32, '600', SANS, th.soft, 940);
    ornament(x, th, w / 2, 278, 230);
    var g = Number(Y.g) || 0;
    var big = g >= 1000 ? (Math.round(g / 10) / 100).toLocaleString('en-IN') + ' ' + L.kg : (Math.round(g * 10) / 10).toLocaleString('en-IN') + ' ' + L.g;
    centre(x, big, w / 2, 420, 130, '800', SANS, th.ink, 940);
    centre(x, L.gold, w / 2, 478, 34, '600', SANS, th.gold, 900);
    var one = function (n, k) { return (+n === 1 && L[k.slice(0, -1)]) || L[k]; };   // "1 bill", "3 bills" (hi / gu: the same word)
    var boxes = [[Y.bills, one(Y.bills, 'bills')], [Y.pieces, one(Y.pieces, 'pieces')], [Y.orders, one(Y.orders, 'orders')],
      [Y.delivered ? Math.round((Y.on_time || 0) * 100 / Y.delivered) + '%' : '—', L.ontime]];
    boxes.forEach(function (b, i) {
      var bx = 110 + (i % 2) * 440, by = 540 + Math.floor(i / 2) * 190;
      x.fillStyle = th === THEMES.cream ? 'rgba(168,120,31,.08)' : 'rgba(255,255,255,.07)';
      roundRect(x, bx, by, 420, 165, 24); x.fill();
      x.strokeStyle = th.line; x.lineWidth = 1.5; roundRect(x, bx, by, 420, 165, 24); x.stroke();
      centre(x, String(b[0] == null ? 0 : b[0]), bx + 210, by + 92, 70, '800', SANS, th.ink, 380);
      centre(x, b[1], bx + 210, by + 138, 28, '600', SANS, th.soft, 380);
    });
    var y = 970;
    if (Y.top) { centre(x, L.top + ': ' + Y.top, w / 2, y, 38, '700', SANS, th.ink, 940); y += 66; }
    if (Y.level && Y.level.name) {
      var t = '🏅 ' + Y.level.name + ' ' + L.level;
      x.font = '800 38px ' + SANS; var tw = Math.min(800, x.measureText(t).width + 80);
      x.fillStyle = th.gold; roundRect(x, w / 2 - tw / 2, y - 46, tw, 66, 33); x.fill();
      centre(x, t, w / 2, y, 38, '800', SANS, th.bg1, tw - 40); y += 70;
    }
    centre(x, L.thanks + ' 🙏', w / 2, h - 150, 40, '700', SERIF, th.gold, 940);
    if (Y.business) centre(x, Y.business, w / 2, h - 96, 30, '600', SANS, th.soft, 900);
    return c;
  }
  window.ArkPoster = { rateCard: rateCard, festival: festival, arrival: arrival, yearCard: yearCard, share: share, toBlob: toBlob, loadImage: loadImage, rateRows: rateRows,
    themes: Object.keys(THEMES), words: WORDS };
})();
