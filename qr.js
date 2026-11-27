/* ============================================================
   QR CODES — made inside the app (no outside library, works
   offline): job cards and catalogue stickers carry a QR that opens
   the order / the piece in the app. Also an in-app scanner on
   phones that have one (Android Chrome); elsewhere the phone's own
   camera opens the link.
   The encoder follows the QR Code standard (ISO/IEC 18004): byte
   mode, error correction level M, the best of the 8 masks.
   ============================================================ */
'use strict';

const QR = (function () {
  const ECC_PER_BLOCK = {   // [level][version]
    L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  };
  const NUM_BLOCKS = {
    L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  };
  const FORMAT_BITS = { L: 1, M: 0 };

  function rawModules(ver) {
    let r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const na = Math.floor(ver / 7) + 2;
      r -= (25 * na - 10) * na - 55;
      if (ver >= 7) r -= 36;
    }
    return r;
  }
  function dataCodewords(ver, ecl) { return Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ecl][ver] * NUM_BLOCKS[ecl][ver]; }

  /* GF(256) with the polynomial 0x11D */
  function gmul(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 255;
  }
  function rsDivisor(degree) {
    const r = new Array(degree).fill(0);
    r[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < r.length; j++) {
        r[j] = gmul(r[j], root);
        if (j + 1 < r.length) r[j] ^= r[j + 1];
      }
      root = gmul(root, 2);
    }
    return r;
  }
  function rsRemainder(data, div) {
    const r = div.map(() => 0);
    data.forEach((b) => {
      const f = b ^ r.shift();
      r.push(0);
      div.forEach((c, i) => { r[i] ^= gmul(c, f); });
    });
    return r;
  }
  function utf8(s) {
    const out = [];
    const e = unescape(encodeURIComponent(String(s)));
    for (let i = 0; i < e.length; i++) out.push(e.charCodeAt(i));
    return out;
  }

  function encode(text, eclIn) {
    const ecl = eclIn === 'L' ? 'L' : 'M';
    const bytes = utf8(text);
    let ver = 1;
    for (; ver <= 40; ver++) {
      const cc = ver < 10 ? 8 : 16;
      if (4 + cc + bytes.length * 8 <= dataCodewords(ver, ecl) * 8) break;
    }
    if (ver > 40) throw new Error('Too long for a QR code');
    // the data bits
    const bits = [];
    const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
    put(4, 4);
    put(bytes.length, ver < 10 ? 8 : 16);
    bytes.forEach((b) => put(b, 8));
    const cap = dataCodewords(ver, ecl) * 8;
    put(0, Math.min(4, cap - bits.length));
    put(0, (8 - bits.length % 8) % 8);
    for (let pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) put(pad, 8);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) { let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; data.push(b); }
    // error correction, interleaved
    const nb = NUM_BLOCKS[ecl][ver], eccLen = ECC_PER_BLOCK[ecl][ver];
    const raw = Math.floor(rawModules(ver) / 8);
    const nShort = nb - raw % nb, shortLen = Math.floor(raw / nb);
    const div = rsDivisor(eccLen);
    const blocks = [];
    for (let i = 0, k = 0; i < nb; i++) {
      const dat = data.slice(k, k + shortLen - eccLen + (i < nShort ? 0 : 1));
      k += dat.length;
      const ecc = rsRemainder(dat, div);
      if (i < nShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    const all = [];
    for (let i = 0; i < blocks[0].length; i++) {
      blocks.forEach((b, j) => { if (i !== shortLen - eccLen || j >= nShort) all.push(b[i]); });
    }
    // the grid
    const size = ver * 4 + 17;
    const mod = [], fn = [];
    for (let y = 0; y < size; y++) { mod.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
    const setF = (x, y, dark) => { mod[y][x] = dark; fn[y][x] = true; };
    for (let i = 0; i < size; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) setF(x, y, d !== 2 && d !== 4);
      }
    };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    const align = [];
    if (ver > 1) {
      const na = Math.floor(ver / 7) + 2;
      const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (na * 2 - 2)) * 2;
      align.push(6);
      for (let pos = size - 7; align.length < na; pos -= step) align.splice(1, 0, pos);
    }
    align.forEach((ay, i) => align.forEach((ax, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setF(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }));
    const bit = (v, i) => ((v >>> i) & 1) !== 0;
    const formatBits = (mask) => {
      const d = (FORMAT_BITS[ecl] << 3) | mask;
      let r = d;
      for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      const b = ((d << 10) | r) ^ 0x5412;
      for (let i = 0; i <= 5; i++) setF(8, i, bit(b, i));
      setF(8, 7, bit(b, 6)); setF(8, 8, bit(b, 7)); setF(7, 8, bit(b, 8));
      for (let i = 9; i < 15; i++) setF(14 - i, 8, bit(b, i));
      for (let i = 0; i < 8; i++) setF(size - 1 - i, 8, bit(b, i));
      for (let i = 8; i < 15; i++) setF(8, size - 15 + i, bit(b, i));
      setF(8, size - 8, true);
    };
    formatBits(0);   // reserve the places
    if (ver >= 7) {
      let r = ver;
      for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25);
      const b = (ver << 12) | r;
      for (let i = 0; i < 18; i++) {
        const a = size - 11 + i % 3, c = Math.floor(i / 3);
        setF(a, c, bit(b, i)); setF(c, a, bit(b, i));
      }
    }
    // the data, in the zigzag
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
          if (!fn[y][x] && i < all.length * 8) { mod[y][x] = bit(all[i >>> 3], 7 - (i & 7)); i++; }
        }
      }
    }
    const masked = (m, x, y) => {
      switch (m) {
        case 0: return (x + y) % 2 === 0;
        case 1: return y % 2 === 0;
        case 2: return x % 3 === 0;
        case 3: return (x + y) % 3 === 0;
        case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
        case 5: return (x * y) % 2 + (x * y) % 3 === 0;
        case 6: return ((x * y) % 2 + (x * y) % 3) % 2 === 0;
        default: return ((x + y) % 2 + (x * y) % 3) % 2 === 0;
      }
    };
    const applyMask = (m) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && masked(m, x, y)) mod[y][x] = !mod[y][x]; };
    const penalty = () => {
      let p = 0, dark = 0;
      const line = (get) => {
        let s = '';
        for (let k = 0; k < size; k++) s += get(k) ? '1' : '0';
        return s;
      };
      for (let a = 0; a < size; a++) {
        [line((k) => mod[a][k]), line((k) => mod[k][a])].forEach((s) => {
          let run = 1;
          for (let k = 1; k <= s.length; k++) {
            if (k < s.length && s[k] === s[k - 1]) run++;
            else { if (run >= 5) p += 3 + run - 5; run = 1; }
          }
          const t = '0000' + s + '0000';
          for (let k = 0; k + 11 <= t.length; k++) {
            const w = t.substr(k, 11);
            if (w === '10111010000' || w === '00001011101') p += 40;
          }
        });
      }
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        if (mod[y][x]) dark++;
        if (x < size - 1 && y < size - 1 && mod[y][x] === mod[y][x + 1] && mod[y][x] === mod[y + 1][x] && mod[y][x] === mod[y + 1][x + 1]) p += 3;
      }
      const total = size * size;
      p += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
      return p;
    };
    let best = 0, bestP = Infinity;
    for (let m = 0; m < 8; m++) {
      applyMask(m); formatBits(m);
      const p = penalty();
      if (p < bestP) { bestP = p; best = m; }
      applyMask(m);
    }
    applyMask(best); formatBits(best);
    return { size, ver, mask: best, dark: (x, y) => mod[y][x] };
  }

  /* dark runs in each row: [y, x, length] — fewer shapes to draw */
  function runs(q) {
    const out = [];
    for (let y = 0; y < q.size; y++) {
      let x = 0;
      while (x < q.size) {
        if (!q.dark(x, y)) { x++; continue; }
        let n = 1;
        while (x + n < q.size && q.dark(x + n, y)) n++;
        out.push([y, x, n]);
        x += n;
      }
    }
    return out;
  }
  /* an SVG picture with the white border (4 modules) */
  function svg(text, px) {
    const q = encode(text);
    const n = q.size + 8;
    const d = runs(q).map((r) => 'M' + (r[1] + 4) + ' ' + (r[0] + 4) + 'h' + r[2] + 'v1h-' + r[2] + 'z').join('');
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + ' ' + n + '" width="' + (px || 160) + '" height="' + (px || 160) + '" shape-rendering="crispEdges">' +
      '<rect width="' + n + '" height="' + n + '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
  }
  /* into a PDF made by docs.js: w mm wide, the white border included */
  function pdf(d, text, x, y, w) {
    const q = encode(text);
    const m = w / (q.size + 8);
    d.rect(x, y, w, w, [1, 1, 1]);
    runs(q).forEach((r) => d.rect(x + (r[1] + 4) * m, y + (r[0] + 4) * m, r[2] * m + 0.01, m + 0.01, [0, 0, 0]));
  }
  return { encode, svg, pdf, runs };
})();

/* the links in the codes: open the order / the piece in the app */
function qrOrderUrl(id) { return new URL('index.html#o=' + id, location.href).href; }
/* a piece: its passport (update 23) — anyone can open it; the app finds the piece from it too */
function qrPieceUrl(id, passport) { return passport && S.dbv23 ? new URL('piece.html#' + passport, location.href).href : new URL('index.html#c=' + id, location.href).href; }

/* ---------------- scan a code with the phone's camera (where the browser can) ---------------- */
function qrScanOn() { return 'BarcodeDetector' in window && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }
async function qrScan() {
  if (!qrScanOn()) { toast('Open the phone\'s camera and point it at the code.', 'ok'); return; }
  let det;
  try { det = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { toast('Open the phone\'s camera and point it at the code.', 'ok'); return; }
  const ov = openModal('<h3>Scan a QR code</h3><p>Point the camera at the code on a job card or a sticker.</p>' +
    '<div class="qr-cam"><video id="qr-video" playsinline muted></video></div>' +
    '<div class="modal-actions"><button class="btn btn-secondary" data-m="no">Close</button></div>');
  let stream = null, done = false, timer = null;
  const stop = () => {
    done = true;
    if (timer) clearTimeout(timer);
    if (stream) stream.getTracks().forEach((t) => { try { t.stop(); } catch (e) { /* ignore */ } });
  };
  ov._cleanup = stop;
  ov.querySelector('[data-m=no]').onclick = () => { stop(); closeModal(); };
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  } catch (e) {
    stop(); closeModal();
    toast('The camera could not be opened — allow the camera for this app, or use the phone\'s camera.', 'err');
    return;
  }
  const v = $('#qr-video');
  if (!v || done) { stop(); return; }
  v.srcObject = stream;
  try { await v.play(); } catch (e) { /* some phones start on their own */ }
  const look = async () => {
    if (done) return;
    try {
      const found = await det.detect(v);
      const hit = (found || []).map((f) => String(f.rawValue || '')).find((s) => /#[oc]=[0-9a-f-]{36}|piece\.html#[0-9a-f-]{36}/i.test(s));
      if (hit) {
        stop(); closeModal();
        if (!qrOpenUrl(hit)) toast('This code is not from the app.', 'err');
        return;
      }
      if ((found || []).length) toast('This code is not from the app.', 'err');
    } catch (e) { /* the next frame */ }
    timer = setTimeout(look, 350);
  };
  look();
}
/* "#o=<order>" or "#c=<piece>" (from a scan, or a code opened in the browser) */
function qrOpenUrl(u) {
  const pp = typeof passportCode === 'function' ? passportCode(u) : null;   // a piece's passport (update 23)
  if (pp && S.me) { openPassportPiece(pp); return true; }
  const m = /#([oc])=([0-9a-f-]{36})/i.exec(String(u || ''));
  if (!m || !S.me) return false;
  if (m[1].toLowerCase() === 'o') openOrder(m[2]);
  else if (typeof openCatItem === 'function') openCatItem(m[2]);
  return true;
}
onAct('qr-scan', () => qrScan());
