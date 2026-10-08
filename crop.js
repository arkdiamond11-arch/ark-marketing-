/* ============================================================
   PHOTO CROP — after taking or choosing a visiting-card photo, a
   full-screen crop screen opens: drag the corners or the sides to
   the card's edges, drag inside the box to move it, ⟳ turns the
   photo. "Use photo" keeps just that part — the scanner reads it
   better and the upload is smaller. "Crop" under the photo opens
   it again (the original is kept until the client is saved).
   ============================================================ */
'use strict';

const CROP_WORK_MAX = 2200;   // working copy, longest side (px)
const CROP_OUT_MAX = 1600;    // saved photo, longest side (px)
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

/* open the photo and let the person crop it → { blob, base64, mime, src } — or null (cancelled / unreadable).
   src = { file, rot, rect } so "Crop" can adjust it again later. */
async function cropPhotoFile(file, title, prev) {
  let work;
  try { work = await decodeImage(file, CROP_WORK_MAX); }
  catch (e) { toast(imageErrMsg(e), 'err'); return null; }
  const rot0 = (prev && prev.rot) || 0;
  for (let i = 0; i < rot0; i++) work = rotateCanvas90(work);
  const res = await cropScreen(work, title, prev ? prev.rect : null, rot0);
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
  photo.src = { file, rot: res.rot, rect: r };
  return photo;
}

/* "Crop" under a card photo that was just added */
async function recropPhoto(side) {
  const p = S.photos && S.photos[side];
  if (!p || !p.src) return;
  const np = await cropPhotoFile(p.src.file, side === 'back' ? 'Back side' : 'Front side', p.src);
  if (!np) return;
  S.photos[side] = np;
  redrawPhotos();
}

/* the crop screen → { canvas, rect, rot } or null */
function cropScreen(work, title, startRect, startRot) {
  return new Promise((resolve) => {
    let cv = work, rot = startRot || 0;
    const full = () => ({ x: 0, y: 0, w: cv.width, h: cv.height });
    const okRect = (r) => r && r.w > 0 && r.h > 0 && r.x >= 0 && r.y >= 0 && r.x + r.w <= cv.width + 1 && r.y + r.h <= cv.height + 1;
    let R = okRect(startRect) ? Object.assign({}, startRect) : full();   // the crop, in photo pixels

    const ov = document.createElement('div');
    ov.className = 'crop-ov';
    ov.tabIndex = -1;
    ov.innerHTML =
      '<div class="crop-head"><b>' + esc(title) + '</b><span>Drag the corners to the edges of the card</span></div>' +
      '<div class="crop-stage"><canvas class="crop-img"></canvas><div class="crop-box">' +
      ['n', 'e', 's', 'w', 'nw', 'ne', 'sw', 'se'].map((h) => '<i class="crop-h crop-' + h + '" data-h="' + h + '"></i>').join('') +
      '</div></div>' +
      '<div class="crop-tools"><button type="button" class="crop-tool" data-c="rot">⟳ Rotate</button>' +
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
      R = { x: H - (R.y + R.h), y: R.x, w: R.h, h: R.w };   // keep the same part of the photo chosen
      layout();
    };
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
