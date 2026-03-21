// ============================================================
//  sketch_mobile_accessible.js  —  vanilla Canvas2D, no p5
//  Drop-in replacement for mobile. Desktop keeps sketch.js.
// ============================================================

(function () {
  "use strict";

  // ── Config ─────────────────────────────────────────────────
  const AUTOPLAY_SPEED   = 0.018; // fraction per frame
  const SWIPE_THRESHOLD  = 40;    // px before a swipe fires
  const HANDLE_RADIUS    = 24;    // px tap target on wipe handle
  const MAX_ZOOM         = 3;
  const ZOOM_SNAP        = 0.12;  // snap to 1× if within this
  const SMOOTH_K         = 0.14;  // lerp factor for scroll easing

  // ── State ──────────────────────────────────────────────────
  let allURLs      = { normal: [], centered: [] };
  let imageCache   = {};   // key → {img, w, h} or null while loading
  let numImages    = 0;
  let centeredView = false;

  let scroll       = 0;   // display scroll (eased)
  let target       = 0;   // target scroll (integer snapped)
  let autoplay     = false;
  let autoSpeed    = 1.0; // multiplier

  let showArrows   = true;
  let sliderOpen   = false;
  let sliderAnim   = 0;   // 0→1 eased

  // Wipe drag
  let wipeDragging = false;
  let wipePairL    = -1, wipePairR = -1;
  let wipeBaseX    = NaN, wipeFitW = NaN, wipeFitH = NaN;
  let wipeScreenX  = NaN; // current handle position in screen px
  let wipeDir      = 1;   // +1 forward, -1 backward
  let dirLock      = 0;   // frames remaining

  // Touch state
  let touch0       = null; // {x,y} first touch
  let touch1       = null; // second touch (zoom)
  let swipeOriginX = 0;
  let pinchDist0   = 0;
  let zoomLevel    = 1;
  let panX = 0, panY = 0;
  let isPanning    = false;

  // Spinner
  let spinAngle    = 0;
  let loading      = true;

  // Buttons geometry (computed in resize)
  const BTN_SIZE = 36, BTN_GAP = 8, BTN_Y = 18, BTN_X0 = 10;

  // ── Canvas setup ───────────────────────────────────────────
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed;top:0;left:0;z-index:10;touch-action:none;";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener("resize", resize);

  // ── Overlay ────────────────────────────────────────────────
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position:fixed;inset:0;background:#000;z-index:999;
    display:flex;align-items:center;justify-content:center;
    color:#fff;font-family:Helvetica,sans-serif;font-size:24px;
  `;
  overlay.textContent = "Tap to Begin";
  document.body.appendChild(overlay);

  let started = false;
  function start() {
    if (started) return;
    started = true;
    overlay.remove();
    requestAnimationFrame(loop);
  }
  overlay.addEventListener("pointerdown", start);

  // ── Speed slider (HTML range input) ────────────────────────
  const slider = document.createElement("input");
  slider.type  = "range";
  slider.min   = "0.1"; slider.max = "3"; slider.step = "0.1"; slider.value = "1";
  slider.style.cssText = `
    position:fixed;right:12px;top:12px;width:70px;height:14px;
    z-index:1001;display:none;touch-action:manipulation;
    -webkit-appearance:none;appearance:none;background:transparent;
  `;
  // inject minimal track/thumb CSS once
  const sliderCSS = document.createElement("style");
  sliderCSS.textContent = `
    #mob-speed::-webkit-slider-runnable-track{height:3px;border-radius:4px;background:rgba(255,255,255,.6)}
    #mob-speed::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:#fff;margin-top:-5.5px}
    #mob-speed::-moz-range-track{height:3px;border-radius:4px;background:rgba(255,255,255,.6)}
    #mob-speed::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:#fff;border:none}
  `;
  slider.id = "mob-speed";
  document.head.appendChild(sliderCSS);
  document.body.appendChild(slider);
  slider.addEventListener("input", () => autoSpeed = parseFloat(slider.value));

  // ── Load JSON + lazy image cache ───────────────────────────
  fetch("images.json")
    .then(r => r.json())
    .then(data => {
      allURLs    = data;
      numImages  = data.normal.length;
      loading    = false;
    });

  function getURL(index) {
    let arr = centeredView ? allURLs.centered : allURLs.normal;
    return arr[index] || null;
  }

  function getImg(index) {
    let arr   = centeredView ? allURLs.centered : allURLs.normal;
    let key   = (centeredView ? "c" : "n") + index;
    let entry = imageCache[key];

    if (entry === "loading") return null;
    if (entry) return entry;

    let url = arr[index];
    if (!url) return null;

    imageCache[key] = "loading";
    let img = new Image();
    img.onload = () => { imageCache[key] = { img, w: img.naturalWidth, h: img.naturalHeight }; };
    img.onerror= () => { delete imageCache[key]; };
    img.src    = url;
    return null;
  }

  // Prefetch floor + ceil, evict distant
  function prefetch() {
    let f = Math.floor(scroll);
    let c = Math.min(f + 1, numImages - 1);
    getImg(f);
    getImg(c);

    // Also prefetch one ahead for smoother transitions
    if (c + 1 < numImages) getImg(c + 1);

    // Evict
    let prefix = centeredView ? "c" : "n";
    for (let k in imageCache) {
      if (!k.startsWith(prefix)) continue;
      let i = parseInt(k.slice(1));
      if (Math.abs(i - f) > 3) delete imageCache[k];
    }
  }

  // ── Fitted size ────────────────────────────────────────────
  function fittedSize(entry) {
    let cw = canvas.width, ch = canvas.height;
    let iw = entry.w,      ih = entry.h;
    let ir = iw / ih,      cr = cw / ch;
    if (ir > cr) return { w: cw,       h: cw / ir };
    else          return { w: ch * ir,  h: ch       };
  }

  // ── Draw helpers ───────────────────────────────────────────
  function drawEntry(entry) {
    let { w, h } = fittedSize(entry);
    let cx = canvas.width / 2, cy = canvas.height / 2;
    ctx.save();
    ctx.translate(cx, cy);
    if (zoomLevel !== 1) {
      ctx.translate(panX, panY);
      ctx.scale(zoomLevel, zoomLevel);
    }
    ctx.drawImage(entry.img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  function drawWipe(entryA, entryB, t) {
    // entryA already drawn; clip entryB
    let { w, h } = fittedSize(entryB);
    let cx = canvas.width / 2, cy = canvas.height / 2;
    let left = -w / 2, top = -h / 2;

    let forward = wipeDir >= 0;
    let clipW   = forward ? w * t : w * (1 - t);

    ctx.save();
    ctx.translate(cx, cy);
    if (zoomLevel !== 1) {
      ctx.translate(panX, panY);
      ctx.scale(zoomLevel, zoomLevel);
    }

    // Clip & draw B
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, clipW, h);
    ctx.clip();
    ctx.drawImage(entryB.img, left, top, w, h);
    ctx.restore();

    // Wipe line
    let lx = left + clipW;
    let lw = 2 / Math.max(zoomLevel, 0.001);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth   = lw;
    ctx.beginPath();
    ctx.moveTo(lx, top);
    ctx.lineTo(lx, top + h);
    ctx.stroke();

    // Handle dot
    let r = 5 / Math.max(zoomLevel, 0.001);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(lx, 0, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Store screen-space coords for hit testing (no zoom applied to these)
    let screenLeft = cx - w / 2;
    wipeScreenX    = screenLeft + clipW;
    wipeBaseX      = screenLeft;
    wipeFitW       = w;
    wipeFitH       = h;
  }

  function drawSpinner() {
    let cx = canvas.width / 2, cy = canvas.height / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(spinAngle);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth   = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 1.5);
    ctx.stroke();
    ctx.restore();
    spinAngle += 0.1;
  }

  // ── Buttons ────────────────────────────────────────────────
  function btnX(index) { return BTN_X0 + index * (BTN_SIZE + BTN_GAP); }

  const BUTTONS = [
    { label: "⇄", tag: "Arrows",  get active() { return showArrows;    } },
    { label: "▶", tag: "Play",    get active() { return autoplay;      }, get symbol() { return autoplay ? "■" : "▶"; } },
    { label: "C", tag: "Centered",get active() { return centeredView;  } },
    { label: "⇵", tag: "Slider",  get active() { return sliderOpen;   } },
  ];

  function drawButtons() {
    ctx.font      = "10px Helvetica";
    ctx.textAlign = "center";

    BUTTONS.forEach((b, i) => {
      let x = btnX(i), y = BTN_Y;
      ctx.fillStyle   = b.active ? "#00ffff" : "rgba(0,0,0,.7)";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth   = 1;
      roundRect(ctx, x, y, BTN_SIZE, BTN_SIZE, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#fff";
      ctx.font      = "14px Helvetica";
      ctx.fillText(b.symbol || b.label, x + BTN_SIZE / 2, y + BTN_SIZE / 2 + 5);
      ctx.font      = "10px Helvetica";
      ctx.fillText(b.tag, x + BTN_SIZE / 2, y - 4);
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y,     x + w, y + r,     r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x,     y + h, x,     y + h - r, r);
    ctx.lineTo(x,     y + r);
    ctx.arcTo(x,     y,     x + r, y,         r);
    ctx.closePath();
  }

  function drawSliderTab() {
    let tabW = 120, tabH = 20;
    let tabX = canvas.width / 2 - tabW / 2;
    let tabY = canvas.height - tabH;

    ctx.fillStyle = "rgba(0,0,0,.7)";
    ctx.beginPath();
    ctx.moveTo(tabX, tabY + tabH);
    ctx.lineTo(tabX, tabY + 6);
    ctx.arcTo(tabX, tabY, tabX + 6, tabY, 6);
    ctx.lineTo(tabX + tabW - 6, tabY);
    ctx.arcTo(tabX + tabW, tabY, tabX + tabW, tabY + 6, 6);
    ctx.lineTo(tabX + tabW, tabY + tabH);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#fff";
    ctx.font      = "14px Helvetica";
    ctx.textAlign = "center";
    ctx.fillText(sliderOpen ? "▼" : "▲", canvas.width / 2, tabY + tabH - 4);
  }

  const THUMB_H_SLIDER = 100; // px, matches sliderHeight
  let thumbW = 60;

  function drawSlider() {
    if (sliderAnim < 0.01) return;
    let ch = canvas.height, cw = canvas.width;
    let barH = sliderAnim * THUMB_H_SLIDER;
    ctx.fillStyle = "rgba(0,0,0,.9)";
    ctx.fillRect(0, ch - barH, cw, barH);

    let ci = Math.round(scroll);
    thumbW = Math.min(60, cw / 8);
    let margin = 10;

    // Show center ± 1
    let indices = [];
    for (let i = ci - 1; i <= ci + 1; i++) {
      if (i >= 0 && i < numImages) indices.push(i);
    }

    let totalW = indices.length * (thumbW + margin) - margin;
    let startX = (cw - totalW) / 2;
    let y      = ch - barH + 10;

    indices.forEach(idx => {
      let entry = getImg(idx);
      if (!entry) { startX += thumbW + margin; return; }
      let th = thumbW * (entry.h / entry.w);
      ctx.drawImage(entry.img, startX, y, thumbW, th);
      if (idx === ci) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth   = 2;
        ctx.strokeRect(startX - 2, y - 2, thumbW + 4, th + 4);
      }
      startX += thumbW + margin;
    });
  }

  function drawArrows() {
    ctx.fillStyle = "rgba(255,255,255,.7)";
    ctx.font      = "40px Helvetica";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("❮", 18, canvas.height / 2);
    ctx.textAlign = "right";
    ctx.fillText("❯", canvas.width - 18, canvas.height / 2);
  }

  function drawDayLabel() {
    ctx.fillStyle    = "rgba(255,255,255,.7)";
    ctx.font         = `${canvas.width < 500 ? 14 : 20}px Helvetica`;
    ctx.textAlign    = "center";
    ctx.textBaseline = "alphabetic";
    let bottomY = canvas.height - (sliderAnim * THUMB_H_SLIDER + 50);
    ctx.fillText(`Day ${Math.round(scroll) + 1}`, canvas.width / 2, bottomY);
  }

  // ── Main loop ──────────────────────────────────────────────
  function loop() {
    requestAnimationFrame(loop);

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (loading) { drawSpinner(); return; }

    // Update scroll
    if (autoplay && !wipeDragging) {
      target += AUTOPLAY_SPEED * autoSpeed;
      if (target >= numImages - 1) target = 0;
      scroll = target;
    } else if (wipeDragging) {
      scroll = target; // 1:1 during drag
    } else {
      let diff = target - scroll;
      if (Math.abs(diff) > 0.001) scroll += diff * SMOOTH_K;
      else scroll = target;
    }

    sliderAnim += ((sliderOpen ? 1 : 0) - sliderAnim) * 0.12;

    prefetch();

    let iF = Math.floor(scroll);
    let iC = Math.min(iF + 1, numImages - 1);
    let frac = scroll - iF;

    // Determine A/B pair
    let aIdx = wipeDragging && wipePairL >= 0 ? wipePairL : iF;
    let bIdx = wipeDragging && wipePairR >= 0 ? wipePairR : iC;
    let t    = wipeDragging ? Math.max(0, Math.min(1, scroll - wipePairL)) : frac;

    // Direction tracking
    if (!wipeDragging) {
      if (dirLock > 0) {
        dirLock--;
      } else {
        let ci = Math.round(scroll);
        if (ci !== Math.round(scroll - (target - scroll))) {
          wipeDir = target >= scroll ? 1 : -1;
        }
      }
    }

    let eA = getImg(aIdx);
    let eB = getImg(bIdx);

    if (eA) drawEntry(eA);
    if (eA && eB && aIdx !== bIdx) drawWipe(eA, eB, t);

    drawSlider();
    drawSliderTab();
    drawButtons();
    drawDayLabel();
    if (showArrows) drawArrows();

    // Speed slider visibility
    slider.style.display = autoplay ? "block" : "none";
  }

  // ── Input: hit tests ───────────────────────────────────────
  function inBtn(x, y, idx) {
    let bx = btnX(idx);
    return x >= bx && x <= bx + BTN_SIZE && y >= BTN_Y && y <= BTN_Y + BTN_SIZE;
  }

  function inTab(x, y) {
    let tabW = 120, tabH = 20;
    let tabX = canvas.width / 2 - tabW / 2;
    let tabY = canvas.height - tabH;
    return x >= tabX && x <= tabX + tabW && y >= tabY && y <= tabY + tabH;
  }

  function inWipeHandle(x, y) {
    if (!isFinite(wipeScreenX) || autoplay) return false;
    let imgTop = (canvas.height - wipeFitH) / 2;
    return Math.abs(x - wipeScreenX) <= HANDLE_RADIUS &&
           y >= imgTop && y <= imgTop + wipeFitH;
  }

  function inArrowLeft(x, y)  { return showArrows && x < 80; }
  function inArrowRight(x, y) { return showArrows && x > canvas.width - 80; }

  // ── Input: pointer events (unified mouse + touch) ──────────
  canvas.addEventListener("pointerdown", onDown, { passive: false });
  canvas.addEventListener("pointermove", onMove, { passive: false });
  canvas.addEventListener("pointerup",   onUp,   { passive: false });
  canvas.addEventListener("pointercancel", onUp, { passive: false });

  // Track active pointers
  const pointers = new Map();

  function onDown(e) {
    e.preventDefault();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2) {
      // Start pinch
      let pts = [...pointers.values()];
      pinchDist0 = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      return;
    }

    let x = e.clientX, y = e.clientY;

    // Buttons
    for (let i = 0; i < BUTTONS.length; i++) {
      if (inBtn(x, y, i)) {
        handleBtnTap(i);
        return;
      }
    }

    // Slider tab
    if (inTab(x, y)) {
      sliderOpen = !sliderOpen;
      return;
    }

    // Slider area
    if (sliderOpen && y > canvas.height - sliderAnim * THUMB_H_SLIDER) {
      handleSliderTap(x, y);
      return;
    }

    // Wipe handle
    if (inWipeHandle(x, y)) {
      wipeDragging = true;
      wipePairL    = Math.floor(scroll);
      wipePairR    = Math.min(wipePairL + 1, numImages - 1);
      wipeDir      = 1;
      dirLock      = 12;
      target       = scroll;
      return;
    }

    // Arrows
    if (inArrowLeft(x, y)) {
      navigate(-1); return;
    }
    if (inArrowRight(x, y)) {
      navigate(+1); return;
    }

    // Swipe/pan start
    swipeOriginX = x;
    if (zoomLevel > 1) isPanning = true;
  }

  function onMove(e) {
    e.preventDefault();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Pinch zoom
    if (pointers.size === 2) {
      let pts = [...pointers.values()];
      let d   = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (pinchDist0 > 0) {
        zoomLevel = Math.max(1, Math.min(MAX_ZOOM, zoomLevel * (d / pinchDist0)));
      }
      pinchDist0 = d;
      isPanning  = false;
      return;
    }

    let x = e.clientX, y = e.clientY;

    // Wipe drag
    if (wipeDragging && wipePairL >= 0) {
      let t = (x - wipeBaseX) / wipeFitW;
      target = scroll = wipePairL + Math.max(0, Math.min(1, t));
      dirLock = 2;
      return;
    }

    // Pan when zoomed
    if (isPanning && zoomLevel > 1) {
      let prev = [...pointers.values()].find(p => p !== undefined);
      // simple: use movementX/Y
      panX += e.movementX;
      panY += e.movementY;
      let mx = (canvas.width  * (zoomLevel - 1)) / 2;
      let my = (canvas.height * (zoomLevel - 1)) / 2;
      panX = Math.max(-mx, Math.min(mx, panX));
      panY = Math.max(-my, Math.min(my, panY));
      return;
    }

    // Swipe
    if (!wipeDragging && zoomLevel === 1) {
      let dx = x - swipeOriginX;
      if (Math.abs(dx) > SWIPE_THRESHOLD) {
        navigate(dx > 0 ? -1 : 1);
        swipeOriginX = x; // reset so continuous slow drag fires once per image
      }
    }
  }

  function onUp(e) {
    e.preventDefault();
    pointers.delete(e.pointerId);

    if (wipeDragging) {
      wipeDragging = false;
      target = Math.max(0, Math.min(numImages - 1, Math.round(scroll)));
      wipePairL = wipePairR = -1;
      return;
    }

    isPanning = false;

    // Snap zoom
    if (Math.abs(zoomLevel - 1) < ZOOM_SNAP) {
      zoomLevel = 1; panX = 0; panY = 0;
    }
  }

  // ── Button actions ─────────────────────────────────────────
  function handleBtnTap(i) {
    if (i === 0) { showArrows = !showArrows; return; }
    if (i === 1) {
      autoplay = !autoplay;
      if (autoplay) { wipeDir = 1; dirLock = 12; target = scroll; }
      return;
    }
    if (i === 2) {
      let old = Math.round(scroll);
      centeredView = !centeredView;
      let newMax = (centeredView ? allURLs.centered : allURLs.normal).length;
      let clamped = Math.max(0, Math.min(newMax - 1, old));
      scroll = target = clamped;
      // Reset image cache for new view
      for (let k in imageCache) {
        let prefix = centeredView ? "n" : "c";
        if (k.startsWith(prefix)) delete imageCache[k];
      }
      return;
    }
    if (i === 3) { sliderOpen = !sliderOpen; return; }
  }

  function navigate(dir) {
    if (autoplay) return;
    wipeDir = dir > 0 ? 1 : -1;
    dirLock = 12;
    target  = Math.max(0, Math.min(numImages - 1, Math.round(scroll) + dir));
  }

  function handleSliderTap(x, y) {
    let ch   = canvas.height;
    let barH = sliderAnim * THUMB_H_SLIDER;
    let ci   = Math.round(scroll);
    let indices = [];
    for (let i = ci - 1; i <= ci + 1; i++) {
      if (i >= 0 && i < numImages) indices.push(i);
    }
    let totalW = indices.length * (thumbW + 10) - 10;
    let sx = (canvas.width - totalW) / 2;
    let ty = ch - barH + 10;

    for (let idx of indices) {
      let entry = getImg(idx);
      let th = entry ? thumbW * (entry.h / entry.w) : thumbW;
      if (x >= sx && x <= sx + thumbW && y >= ty && y <= ty + th) {
        wipeDir = idx > Math.round(scroll) ? 1 : -1;
        dirLock = 12;
        target  = idx;
        return;
      }
      sx += thumbW + 10;
    }
  }

  // ── Keyboard ───────────────────────────────────────────────
  window.addEventListener("keydown", e => {
    if (e.key === "c" || e.key === "C") handleBtnTap(2);
    if (e.key === "ArrowLeft")  navigate(-1);
    if (e.key === "ArrowRight") navigate(+1);
  });

})();
