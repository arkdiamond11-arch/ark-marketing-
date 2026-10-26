/* ============================================================
   PHOTO CROP — after taking or choosing a photo, a full-screen crop
   screen opens: drag the corners or the sides, drag inside the box to
   move it, ⟳ turns the photo. "Use photo" keeps just that part.
   · Visiting cards: the box starts on the card when the card can be
     found in the photo; "▣ Card" puts it back on the card and
     "⤢ Full photo" takes the whole photo. The scanner reads a cropped
     card better and the upload is smaller.
   · Every other photo (order design, finished piece, catalogue) opens
     with the whole photo chosen — "Use photo" keeps it as it is.
   "Crop" under a new card or design photo opens it again (the
   original is kept until it is saved).
   ============================================================ */
'use strict';

const CROP_WORK_MAX = 2200;   // working copy, longest side (px)
const CROP_OUT_MAX = 1600;    // saved photo, longest side (px)
const CROP_FIND_MAX = 300;    // small copy used to find the card (px)
let CROP_OPEN = null;         // the crop screen that is open: { cancel }

/* turn a canvas a quarter turn clockwise */
function rotateCanvas90(src) {
  const cv = document.createElement('canvas');
  cv.width = src.height; cv.height = src.width;
  const g = cv.getContext('2d');
  g.translate(cv.width, 0);
  g.rotate(Math.PI / 2);
  g.drawImage(src, 0, 0);
  return cv;
}
/* the same quarter turn for a box on the photo (H = the photo's height before turning) */
function rotateRect90(r, H) {
  return { x: H - (r.y + r.h), y: r.x, w: r.h, h: r.w };
}

/* where the visiting card is in the photo → a box in the photo's pixels, or null when not sure */
function findCardRect(cv) {
  try {
    const s = Math.min(1, CROP_FIND_MAX / Math.max(cv.width, cv.height));
    const w = Math.max(1, Math.round(cv.width * s)), h = Math.max(1, Math.round(cv.height * s));
    const sm = document.createElement('canvas');
    sm.width = w; sm.height = h;
    const g = sm.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(cv, 0, 0, w, h);
    const b = findCardBox(g.getImageData(0, 0, w, h).data, w, h);
    if (!b) return null;
    const kx = cv.width / w, ky = cv.height / h;
    const x = Math.max(0, Math.floor(b.x * kx)), y = Math.max(0, Math.floor(b.y * ky));
    return { x, y, w: Math.min(cv.width - x, Math.ceil(b.w * kx)), h: Math.min(cv.height - y, Math.ceil(b.h * ky)) };
  } catch (e) { return null; }
}

/* ---------- finding the card in a photo ----------
   Looks for a card-shaped outline (four clear, nearly straight sides, each at
   most about 12° from upright / level, 1.35–2.1 times as long as wide) with
   printing inside and no printing just outside — so the white part under a
   coloured band with the name in it is not taken for the whole card. When it
   is not sure, it gives up and the crop screen starts with the whole photo.
   px = RGBA pixels of a small copy of the photo (about 300 px), W × H.
   → { x, y, w, h } in those small pixels, or null. */
function findCardBox(px, W, H) {
  const N = W * H;
  if (W < 60 || H < 60) return null;
  const DEG = Math.PI / 180;

  /* 1. the three colour channels, softened (two 3×3 box passes) so paper grain and noise fade */
  const ch = [new Float32Array(N), new Float32Array(N), new Float32Array(N)];
  for (let i = 0; i < N; i++) { ch[0][i] = px[i * 4]; ch[1][i] = px[i * 4 + 1]; ch[2][i] = px[i * 4 + 2]; }
  const tmp = new Float32Array(N);
  ch.forEach((a) => {
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < H; y++) {
        const o = y * W;
        for (let x = 0; x < W; x++) tmp[o + x] = (a[o + (x > 0 ? x - 1 : x)] + a[o + x] + a[o + (x < W - 1 ? x + 1 : x)]) / 3;
      }
      for (let y = 0; y < H; y++) {
        const o = y * W, u = y > 0 ? o - W : o, d = y < H - 1 ? o + W : o;
        for (let x = 0; x < W; x++) a[o + x] = (tmp[u + x] + tmp[o + x] + tmp[d + x]) / 3;
      }
    }
  });

  /* 2. edges: how strongly the colour changes, and in which direction (0 = from left to right) */
  const mag = new Float32Array(N), dir = new Float32Array(N);
  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      const i = y * W + x;
      let jxx = 0, jyy = 0, jxy = 0;
      for (let c = 0; c < 3; c++) {
        const a = ch[c];
        const gx = (a[i - W + 1] + 2 * a[i + 1] + a[i + W + 1]) - (a[i - W - 1] + 2 * a[i - 1] + a[i + W - 1]);
        const gy = (a[i + W - 1] + 2 * a[i + W] + a[i + W + 1]) - (a[i - W - 1] + 2 * a[i - W] + a[i - W + 1]);
        jxx += gx * gx; jyy += gy * gy; jxy += gx * gy;
      }
      mag[i] = Math.sqrt(jxx + jyy) / 4;
      dir[i] = 0.5 * Math.atan2(2 * jxy, jxx - jyy);
    }
  }
  /* thin each edge to one pixel (keep only the strongest point across it) */
  const thin = new Float32Array(N);
  let maxM = 0;
  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      const i = y * W + x, m = mag[i];
      if (m < 3) continue;
      const a = dir[i];
      const o = Math.round(Math.sin(a)) * W + Math.round(Math.cos(a));
      if (m >= mag[i + o] && m > mag[i - o]) { thin[i] = m; if (m > maxM) maxM = m; }
    }
  }
  if (maxM < 14) return null;   // a flat photo, nothing to find
  const TLO = Math.max(6, Math.min(22, maxM * 0.06));    // faint edges count for the card's outline
  const THI = Math.max(12, Math.min(36, maxM * 0.12));   // printing: clear edges only

  /* edge maps for the two kinds of side (EV: left/right, EH: top/bottom) */
  const EV = new Uint8Array(N), EH = new Uint8Array(N);
  const pts = [];
  for (let i = 0; i < N; i++) {
    if (thin[i] < TLO) continue;
    const ad = dir[i] / DEG;
    const ah = ad > 0 ? ad - 90 : ad + 90;
    if (Math.abs(ad) <= 22) { EV[i] = 1; pts.push(i, ad, 0); }
    else if (Math.abs(ah) <= 22) { EH[i] = 1; pts.push(i, ah, 1); }
  }
  const widen = (E) => {
    const out = new Uint8Array(N);
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (E[i] || E[i - 1] || E[i + 1] || E[i - W] || E[i + W] || E[i - W - 1] || E[i - W + 1] || E[i + W - 1] || E[i + W + 1]) out[i] = 1;
      }
    }
    return out;
  };
  const WV = widen(EV), WH = widen(EH);

  /* 3. straight lines (Hough), −12°…12° from upright / level */
  const SPAN = 12, NA = 2 * SPAN + 1;
  const diag = Math.ceil(Math.hypot(W, H)), NR = 2 * diag + 1;
  const cs = [], sn = [];
  for (let k = 0; k < NA; k++) { cs[k] = Math.cos((k - SPAN) * DEG); sn[k] = Math.sin((k - SPAN) * DEG); }
  const acc = [new Float32Array(NA * NR), new Float32Array(NA * NR)];
  for (let p = 0; p < pts.length; p += 3) {
    const i = pts[p], a = Math.round(pts[p + 1]), fam = pts[p + 2];
    const x = i % W, y = (i - x) / W;
    const k0 = Math.max(0, a + SPAN - 2), k1 = Math.min(NA - 1, a + SPAN + 2);
    const A = acc[fam];
    for (let k = k0; k <= k1; k++) {
      // left/right side: x·cos t + y·sin t = r ; top/bottom side: y·cos t − x·sin t = r
      const r = Math.round(fam === 0 ? x * cs[k] + y * sn[k] : y * cs[k] - x * sn[k]) + diag;
      A[k * NR + r] += 1;
    }
  }
  const minVotes = Math.max(14, 0.1 * Math.min(W, H));
  const peaks = (A) => {
    const out = [];
    for (let k = 0; k < NA; k++) {
      for (let r = 1; r < NR - 1; r++) {
        const v = A[k * NR + r];
        if (v < minVotes) continue;
        let top = true;
        for (let dk = -2; dk <= 2 && top; dk++) {
          const kk = k + dk;
          if (kk < 0 || kk >= NA) continue;
          for (let dr = -3; dr <= 3; dr++) {
            if (!dk && !dr) continue;
            const rr = r + dr;
            if (rr < 0 || rr >= NR) continue;
            const w = A[kk * NR + rr];
            if (w > v || (w === v && (dk < 0 || (dk === 0 && dr < 0)))) { top = false; break; }
          }
        }
        if (top) out.push({ t: (k - SPAN) * DEG, r: r - diag, v });
      }
    }
    out.sort((a, b) => b.v - a.v);
    return out.slice(0, 20);
  };
  const LV = peaks(acc[0]), LH = peaks(acc[1]);
  if (LV.length < 2 || LH.length < 2) return null;
  LV.forEach((l) => { l.m = (l.r - (H / 2) * Math.sin(l.t)) / Math.cos(l.t); });   // x at mid-height
  LH.forEach((l) => { l.m = (l.r + (W / 2) * Math.sin(l.t)) / Math.cos(l.t); });   // y at mid-width
  LV.sort((a, b) => a.m - b.m);
  LH.sort((a, b) => a.m - b.m);

  const meet = (v, h) => {   // where a left/right line crosses a top/bottom line
    const c1 = Math.cos(v.t), s1 = Math.sin(v.t), c2 = Math.cos(h.t), s2 = Math.sin(h.t);
    const det = c1 * c2 + s1 * s2;
    return { x: (v.r * c2 - s1 * h.r) / det, y: (c1 * h.r + s2 * v.r) / det };
  };
  const support = (a, b, E) => {   // how much of the stretch from a to b lies on an edge of the right kind
    const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y)));
    let hit = 0;
    for (let s = 0; s <= n; s++) {
      const x = Math.round(a.x + (b.x - a.x) * s / n), y = Math.round(a.y + (b.y - a.y) * s / n);
      if (x >= 0 && y >= 0 && x < W && y < H && E[y * W + x]) hit++;
    }
    return hit / (n + 1);
  };

  /* 4. card-shaped outlines: every left/right pair with every top/bottom pair */
  const cands = [];
  for (let a = 0; a < LV.length; a++) {
    for (let b = a + 1; b < LV.length; b++) {
      const L = LV[a], R = LV[b];
      if (R.m - L.m < 0.16 * W || Math.abs(L.t - R.t) > 12 * DEG) continue;
      for (let c = 0; c < LH.length; c++) {
        for (let d = c + 1; d < LH.length; d++) {
          const Tp = LH[c], Bt = LH[d];
          if (Bt.m - Tp.m < 0.14 * H || Math.abs(Tp.t - Bt.t) > 12 * DEG) continue;
          const tl = meet(L, Tp), tr = meet(R, Tp), bl = meet(L, Bt), br = meet(R, Bt);
          if ([tl, tr, bl, br].some((q) => q.x < -1.5 || q.y < -1.5 || q.x > W + 0.5 || q.y > H + 0.5)) continue;
          const area = 0.5 * Math.abs((tl.x * tr.y - tr.x * tl.y) + (tr.x * br.y - br.x * tr.y) + (br.x * bl.y - bl.x * br.y) + (bl.x * tl.y - tl.x * bl.y));
          if (area < 0.06 * W * H) continue;
          const wTop = Math.hypot(tr.x - tl.x, tr.y - tl.y), wBot = Math.hypot(br.x - bl.x, br.y - bl.y);
          const hL = Math.hypot(bl.x - tl.x, bl.y - tl.y), hR = Math.hypot(br.x - tr.x, br.y - tr.y);
          if (Math.min(wTop, wBot) / Math.max(wTop, wBot) < 0.7 || Math.min(hL, hR) / Math.max(hL, hR) < 0.7) continue;
          // people hold the card near the middle of the photo
          const mx = (tl.x + tr.x + br.x + bl.x) / 4, my = (tl.y + tr.y + br.y + bl.y) / 4;
          const off = Math.max(Math.abs(mx - W / 2) / W, Math.abs(my - H / 2) / H);
          if (off > 0.32) continue;
          const asp = (wTop + wBot) / (hL + hR), long = Math.max(asp, 1 / asp);
          if (long < 1.35 || long > 2.1) continue;   // visiting cards are 1.4 … 2 times as long as wide
          const sT = support(tl, tr, WH), sB = support(bl, br, WH), sL = support(tl, bl, WV), sR = support(tr, br, WV);
          const mn = Math.min(sT, sB, sL, sR), mean = (sT + sB + sL + sR) / 4;
          if (mn < 0.5 || mean < 0.7) continue;
          cands.push({ area, mean, mn, q: [tl, tr, br, bl], score: mean + 0.5 * mn + 0.4 * Math.sqrt(area / (W * H)) - 0.5 * off });
        }
      }
    }
  }
  if (!cands.length) return null;
  cands.sort((a, b) => b.score - a.score);

  /* 5. printing: the card has some inside, and none just outside (else only part of the card was found) */
  const strong = (i) => thin[i] >= THI;
  const GX = 10, GY = 8, cell = [];
  for (let gy = 0; gy < GY; gy++) {
    for (let gx = 0; gx < GX; gx++) {
      const x0 = Math.floor(gx * W / GX), x1 = Math.floor((gx + 1) * W / GX), y0 = Math.floor(gy * H / GY), y1 = Math.floor((gy + 1) * H / GY);
      let c = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (strong(y * W + x)) c++;
      cell.push({ x0, y0, x1, y1, d: c / ((x1 - x0) * (y1 - y0)) });
    }
  }
  const dens = (x0, y0, x1, y1, skip) => {   // share of clear edges; skip 1: not level ones, 0: not upright ones, 2: slanted ones only
    x0 = Math.max(2, Math.round(x0)); y0 = Math.max(2, Math.round(y0)); x1 = Math.min(W - 2, Math.round(x1)); y1 = Math.min(H - 2, Math.round(y1));
    if (x1 - x0 < 3 || y1 - y0 < 3) return null;
    let c = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * W + x;
        if (strong(i) && !(skip === 1 ? EH[i] : skip === 0 ? EV[i] : skip === 2 ? EV[i] || EH[i] : 0)) c++;
      }
    }
    return c / ((x1 - x0) * (y1 - y0));
  };
  const tried = [];
  for (let n = 0; n < cands.length && tried.length < 10; n++) {
    const cd = cands[n];
    const xs = cd.q.map((p) => p.x), ys = cd.q.map((p) => p.y);
    const bx0 = Math.min.apply(null, xs), by0 = Math.min.apply(null, ys), bx1 = Math.max.apply(null, xs), by1 = Math.max.apply(null, ys);
    if (tried.some((t) => Math.abs(t[0] - bx0) < 4 && Math.abs(t[1] - by0) < 4 && Math.abs(t[2] - bx1) < 4 && Math.abs(t[3] - by1) < 4)) continue;
    tried.push([bx0, by0, bx1, by1]);
    const bw = bx1 - bx0, bh = by1 - by0;
    const inside = dens(bx0 + 0.12 * bw, by0 + 0.12 * bh, bx1 - 0.12 * bw, by1 - 0.12 * bh, -1) || 0;
    const slant = dens(bx0 + 0.12 * bw, by0 + 0.12 * bh, bx1 - 0.12 * bw, by1 - 0.12 * bh, 2) || 0;   // letters have slanted and round strokes; boxes and table edges do not
    // how busy the photo is away from this outline (median of the grid cells)
    const ex = 0.15 * bw, ey = 0.15 * bh;
    const away = cell.filter((c) => c.x1 <= bx0 - ex || c.x0 >= bx1 + ex || c.y1 <= by0 - ey || c.y0 >= by1 + ey).map((c) => c.d).sort((a, b) => a - b);
    const bg = away.length >= 4 ? away[Math.floor(away.length / 2)] : cell.map((c) => c.d).sort((a, b) => a - b)[Math.floor(cell.length * 0.2)];
    const g = 3, tb = Math.max(0.18 * bh, 0.06 * Math.min(W, H)), tw = Math.max(0.18 * bw, 0.06 * Math.min(W, H));
    const bands = [
      dens(bx0, by0 - g - tb, bx1, by0 - g, 1),   // above (lines along the side — a shadow, a table edge — do not count)
      dens(bx0, by1 + g, bx1, by1 + g + tb, 1),   // below
      dens(bx0 - g - tw, by0, bx0 - g, by1, 0),   // left
      dens(bx1 + g, by0, bx1 + g + tw, by1, 0),   // right
    ];
    const lim = Math.max(0.03, 3 * bg + 0.01);
    const ok = inside >= 0.012 && slant >= 0.002 && !bands.some((d) => d !== null && d > lim);
    if (!ok) continue;
    const m = 0.02 * Math.max(W, H) + 1;   // a little room so the card's own edge is kept
    const x0 = Math.max(0, bx0 - m), y0 = Math.max(0, by0 - m), x1 = Math.min(W, bx1 + 1 + m), y1 = Math.min(H, by1 + 1 + m);
    if ((x1 - x0) * (y1 - y0) > 0.92 * W * H) return null;   // that is (almost) the whole photo anyway
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, score: cd.mean, min: cd.mn };
  }
  return null;
}
/* end of findCardBox */

/* open the photo and let the person crop it → { blob, base64, mime, src } — or null (cancelled / unreadable).
   opt.card: a visiting card — the box starts on the card when it can be found.
   prev = the src of the same photo cropped before ("Crop" again): { file, rot, rect, card } */
async function cropPhotoFile(file, title, prev, opt) {
  opt = opt || {};
  let work;
  try { work = await decodeImage(file, CROP_WORK_MAX); }
  catch (e) { toast(imageErrMsg(e), 'err'); return null; }
  // the card is found once, on the photo as it was taken, and kept with the photo
  const card0 = prev ? prev.card || null : (opt.card ? findCardRect(work) : null);
  const rot0 = (prev && prev.rot) || 0;
  let card = card0;
  for (let i = 0; i < rot0; i++) {
    if (card) card = rotateRect90(card, work.height);
    work = rotateCanvas90(work);
  }
  const hint = !opt.card ? 'Drag the corners to keep just the part you want'
    : card && !prev ? 'Card found — drag the corners if needed' : 'Drag the corners to the edges of the card';
  const res = await cropScreen(work, title, prev ? prev.rect : card, rot0, { hint, card });
  if (!res) return null;
  const r = res.rect;
  const sc = Math.min(1, CROP_OUT_MAX / Math.max(r.w, r.h));
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(r.w * sc));
  out.height = Math.max(1, Math.round(r.h * sc));
  const g = out.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(res.canvas, r.x, r.y, r.w, r.h, 0, 0, out.width, out.height);
  let photo;
  try { photo = await canvasToPhoto(out, 0.86); }
  catch (e) { toast('Could not save the photo — try again.', 'err'); return null; }
  photo.src = { file, rot: res.rot, rect: r, card: card0 };
  return photo;
}

/* "Crop" under a card photo that was just added */
async function recropPhoto(side) {
  const p = S.photos && S.photos[side];
  if (!p || !p.src) return;
  const np = await cropPhotoFile(p.src.file, side === 'back' ? 'Back side' : 'Front side', p.src, { card: true });
  if (!np) return;
  S.photos[side] = np;
  redrawPhotos();
}

/* the crop screen → { canvas, rect, rot } or null.
   opt.hint: the line under the title; opt.card: where the card is (the "▣ Card" button) */
function cropScreen(work, title, startRect, startRot, opt) {
  opt = opt || {};
  return new Promise((resolve) => {
    let cv = work, rot = startRot || 0;
    const full = () => ({ x: 0, y: 0, w: cv.width, h: cv.height });
    const okRect = (r) => r && r.w > 0 && r.h > 0 && r.x >= 0 && r.y >= 0 && r.x + r.w <= cv.width + 1 && r.y + r.h <= cv.height + 1;
    let C = okRect(opt.card) ? Object.assign({}, opt.card) : null;     // the card, in photo pixels
    let R = okRect(startRect) ? Object.assign({}, startRect) : full();   // the crop, in photo pixels

    const ov = document.createElement('div');
    ov.className = 'crop-ov';
    ov.tabIndex = -1;
    ov.innerHTML =
      '<div class="crop-head"><b>' + esc(title) + '</b><span>' + esc(opt.hint || 'Drag the corners to the edges of the card') + '</span></div>' +
      '<div class="crop-stage"><canvas class="crop-img"></canvas><div class="crop-box">' +
      ['n', 'e', 's', 'w', 'nw', 'ne', 'sw', 'se'].map((h) => '<i class="crop-h crop-' + h + '" data-h="' + h + '"></i>').join('') +
      '</div></div>' +
      '<div class="crop-tools"><button type="button" class="crop-tool" data-c="rot">⟳ Rotate</button>' +
      (C ? '<button type="button" class="crop-tool" data-c="card">▣ Card</button>' : '') +
      '<button type="button" class="crop-tool" data-c="full">⤢ Full photo</button></div>' +
      '<div class="crop-actions"><button type="button" class="btn btn-secondary" data-c="no">Cancel</button>' +
      '<button type="button" class="btn btn-primary" data-c="ok">✓ Use photo</button></div>';
    document.body.appendChild(ov);
    document.body.classList.add('crop-open');
    const stage = ov.querySelector('.crop-stage'), img = ov.querySelector('.crop-img'), box = ov.querySelector('.crop-box');

    /* photo pixels → screen: X = V.ox + x * V.s */
    let V = { s: 1, ox: 0, oy: 0 };
    const PAD = 22;   // room around the photo so the corner handles can be grabbed
    const place = () => {
      box.style.left = (V.ox + R.x * V.s) + 'px';
      box.style.top = (V.oy + R.y * V.s) + 'px';
      box.style.width = (R.w * V.s) + 'px';
      box.style.height = (R.h * V.s) + 'px';
    };
    const layout = () => {
      const sw = stage.clientWidth - PAD * 2, sh = stage.clientHeight - PAD * 2;
      if (sw <= 0 || sh <= 0) return;
      const s = Math.min(sw / cv.width, sh / cv.height);
      const dw = cv.width * s, dh = cv.height * s;
      V = { s, ox: PAD + (sw - dw) / 2, oy: PAD + (sh - dh) / 2 };
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      img.width = Math.max(1, Math.round(dw * dpr));
      img.height = Math.max(1, Math.round(dh * dpr));
      img.style.width = dw + 'px'; img.style.height = dh + 'px';
      img.style.left = V.ox + 'px'; img.style.top = V.oy + 'px';
      const g = img.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(cv, 0, 0, img.width, img.height);
      place();
    };

    /* dragging: a handle resizes, the box itself moves */
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    let drag = null;
    stage.addEventListener('pointerdown', (e) => {
      const h = e.target && e.target.dataset ? e.target.dataset.h : null;
      if (!h && e.target !== box) return;
      e.preventDefault();
      try { stage.setPointerCapture(e.pointerId); } catch (_) { /* older browser */ }
      drag = { h: h || 'move', id: e.pointerId, sx: e.clientX, sy: e.clientY, r: Object.assign({}, R) };
      box.classList.add('dragging');
    });
    stage.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      e.preventDefault();
      const dx = (e.clientX - drag.sx) / V.s, dy = (e.clientY - drag.sy) / V.s;
      const r = drag.r, W = cv.width, H = cv.height, m = Math.min(W, H, 40 / V.s);   // smallest crop: 40 px on screen
      if (drag.h === 'move') {
        R = { x: clamp(r.x + dx, 0, W - r.w), y: clamp(r.y + dy, 0, H - r.h), w: r.w, h: r.h };
      } else {
        let x1 = r.x, y1 = r.y, x2 = r.x + r.w, y2 = r.y + r.h;
        if (drag.h.indexOf('w') > -1) x1 = clamp(r.x + dx, 0, x2 - m);
        if (drag.h.indexOf('e') > -1) x2 = clamp(r.x + r.w + dx, x1 + m, W);
        if (drag.h.indexOf('n') > -1) y1 = clamp(r.y + dy, 0, y2 - m);
        if (drag.h.indexOf('s') > -1) y2 = clamp(r.y + r.h + dy, y1 + m, H);
        R = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
      }
      place();
    });
    const endDrag = (e) => { if (drag && e.pointerId === drag.id) { drag = null; box.classList.remove('dragging'); } };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);

    /* closing — the phone's Back button cancels (see the popstate listener below) */
    let pushed = false;
    try { history.pushState({ crop: 1 }, ''); pushed = true; } catch (_) { /* ignore */ }
    const onResize = () => layout();
    const finish = (val) => {
      if (CROP_OPEN !== me) return false;
      CROP_OPEN = null;
      window.removeEventListener('resize', onResize);
      ov.remove();
      document.body.classList.remove('crop-open');
      resolve(val);
      return true;
    };
    const close = (val) => {
      if (finish(val) && pushed) { S.suppressPop = true; try { history.back(); } catch (_) { S.suppressPop = false; } }
    };
    const me = { cancel: () => finish(null) };
    CROP_OPEN = me;

    ov.querySelector('[data-c=rot]').onclick = () => {
      const H = cv.height;
      cv = rotateCanvas90(cv);
      rot = (rot + 1) % 4;
      R = rotateRect90(R, H);   // keep the same part of the photo chosen
      if (C) C = rotateRect90(C, H);
      layout();
    };
    const cb = ov.querySelector('[data-c=card]');
    if (cb) cb.onclick = () => { R = Object.assign({}, C); place(); };
    ov.querySelector('[data-c=full]').onclick = () => { R = full(); place(); };
    ov.querySelector('[data-c=no]').onclick = () => close(null);
    ov.querySelector('[data-c=ok]').onclick = () => {
      const W = cv.width, H = cv.height;
      const x = clamp(Math.round(R.x), 0, W - 1), y = clamp(Math.round(R.y), 0, H - 1);
      const rect = { x, y, w: clamp(Math.round(R.w), 1, W - x), h: clamp(Math.round(R.h), 1, H - y) };
      close({ canvas: cv, rect, rot });
    };
    ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(null); });
    window.addEventListener('resize', onResize);
    requestAnimationFrame(layout);
    setTimeout(layout, 120);   // again once the screen has settled (phones resize after the camera closes)
    try { ov.focus({ preventScroll: true }); } catch (_) { /* ignore */ }
  });
}

/* phone Back while cropping = Cancel (and nothing else) */
window.addEventListener('popstate', () => {
  if (!CROP_OPEN) return;
  S.suppressPop = true;   // app.js's Back handling skips this one
  CROP_OPEN.cancel();
});

onAct('crop-photo', (el) => recropPhoto(el.dataset.side || 'front'));
