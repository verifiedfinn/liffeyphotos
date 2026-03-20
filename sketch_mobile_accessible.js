let sketchStarted = false;
let images = [], centeredImages = [], allImageURLs = { normal: [], centered: [] };
let numImages = 0, isEmbedded = window.self !== window.top;

let scrollAmount = 0, targetScroll = 0, dragging = false, dragAmt = 0;
let sliderVisible = false, sliderHeight = 100, sliderAnim = 0;

let autoplay = false, centeredView = false, loading = true;
let loadingSpinnerAngle = 0, thumbWidth, lastScrollIndex = -1;
let sliderOffset = 0, isDraggingSlider = false, lastDragX = 0;

let showArrows;
let speedSlider, autoplaySpeed = 1;
let overlayDiv, imageOrder = [];
let suppressDrag = false;
let dragDistance = 0;
let canvas;
let lastImageIndex = -1;
let lastWipeDirection = 1;
let dirLockFrames = 0;
let loadedImages = {};
const MAX_LOADED_IMAGES = 3;
let frameCount = 0;
let zoomLevel = 1;
let zoomCenterX = 0, zoomCenterY = 0;
let isZooming = false;
let lastTouchDistance = 0;
let panX = 0, panY = 0;
let isPanning = false;
let lastTouchX = 0, lastTouchY = 0;
let lastTapTime = 0;
let tapCount = 0;
let swipeStartX = 0, swipeStartY = 0;
let isWipeDragging = false;
let lastWipeXScreen = NaN;
let lastBaseXScreen = NaN;
let lastFittedW = NaN, lastFittedH = NaN;
let lastPairLeftIndex = 0;
let lastBlendAmt = 0;
let dragPairLeft = -1, dragPairRight = -1;


function isMobileLayout() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function preload() {
  loadJSON("images.json", (data) => {
    allImageURLs = data;
    imageOrder = data.normal.slice();
    images = new Array(data.normal.length).fill(null);
    centeredImages = new Array(data.centered.length).fill(null);
    loading = false;
    console.log(`Loaded ${data.normal.length} image URLs (lazy loading)`);
  });
}

function setupOverlay() {
  overlayDiv = createDiv('<div style="color:white; font-family: Helvetica; font-size: 24px;">Tap to Begin</div>');
  overlayDiv.id('tap-overlay');
  overlayDiv.style('position', 'fixed');
  overlayDiv.style('top', '0'); overlayDiv.style('left', '0');
  overlayDiv.style('width', '100vw'); overlayDiv.style('height', '100vh');
  overlayDiv.style('background', 'black');
  overlayDiv.style('display', 'flex');
  overlayDiv.style('justify-content', 'center');
  overlayDiv.style('align-items', 'center');
  overlayDiv.style('z-index', '999');
  overlayDiv.mousePressed(startSketch);
  overlayDiv.touchStarted(startSketch);
}

function setup() {
  setupOverlay();
  canvas = createCanvas(windowWidth, windowHeight);
  canvas.elt.style.touchAction = 'none';
  canvas.position(0, 0).style('z-index', '10');

  createSpeedSlider();
  speedSlider.hide();

  showArrows = isMobileLayout();
  background(0);
  imageMode(CENTER);
  textFont("Helvetica");
}

function createSpeedSlider() {
  speedSlider = createSlider(0.1, 3, autoplaySpeed, 0.1);
  if (!speedSlider || !speedSlider.elt || !speedSlider.style) return;
  speedSlider.size(70, 14);

  speedSlider.input(() => {
    autoplaySpeed = speedSlider.value();
  });

  speedSlider.style("width", "70px");
  speedSlider.style("height", "14px");
  speedSlider.style("z-index", "1001");
  speedSlider.style("position", "fixed");
  speedSlider.style("display", "none");
  speedSlider.style("pointer-events", "auto");
  speedSlider.style("background", "rgba(0, 0, 0, 0.9)");
  speedSlider.style("border-radius", "6px");
  speedSlider.style("border", "none");

  speedSlider.elt.style.right = "calc(env(safe-area-inset-right, 0px) + 12px)";
  speedSlider.elt.style.top   = "calc(env(safe-area-inset-top, 0px) + 12px)";

  speedSlider.elt.style.appearance = 'none';
  speedSlider.elt.style.webkitAppearance = 'none';
  speedSlider.elt.style.height = '14px';
  speedSlider.elt.style.width  = '70px';

  if (!document.getElementById('range-css-patch')) {
    const style = document.createElement('style');
    style.id = 'range-css-patch';
    style.textContent = `
      input[type="range"]{
        -webkit-appearance:none;
        appearance:none;
        height:14px;
        width:70px;
        background:transparent;
      }
      input[type="range"]::-webkit-slider-runnable-track{
        height:3px;
        border-radius:8px;
        background:rgba(255,255,255,0.6);
      }
      input[type="range"]::-moz-range-track{
        height:3px;
        border-radius:8px;
        background:rgba(255,255,255,0.6);
      }
      input[type="range"]::-webkit-slider-thumb{
        -webkit-appearance:none;
        appearance:none;
        width:14px; height:14px;
        background:#fff; border:1px solid rgba(0,0,0,0.1);
        margin-top:-5px;
      }
      input[type="range"]::-moz-range-thumb{
        width:10px; height:10px; margin-top:-3px;
        background:#fff; border:none;
      }
    `;
    document.head.appendChild(style);
  }
  speedSlider.elt.style.lineHeight = '14px';
  speedSlider.elt.style.padding = '0';
  speedSlider.elt.style.touchAction = 'manipulation';

  document.body.appendChild(speedSlider.elt);
}

function positionSpeedSlider() {}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function startSketch() {
  if (!sketchStarted) {
    sketchStarted = true;
    overlayDiv.remove();

    if (isMobileLayout()) {
      showArrows = true;
    }

    if (autoplay) {
      speedSlider.show();
    }
  }
}

function getAutoplaySpeed() {
  return 0.02 * autoplaySpeed;
}

function getActiveImages() {
  let list = centeredView ? centeredImages : images;
  let urls = centeredView ? allImageURLs.centered : allImageURLs.normal;

  if (!urls || urls.length === 0) return list;

  let iFloor = Math.floor(scrollAmount);
  let iCeil  = Math.min(iFloor + 1, urls.length - 1);

  if (!list[iFloor] && iFloor >= 0 && iFloor < urls.length) {
    list[iFloor] = loadImage(urls[iFloor]);
  }
  if (!list[iCeil] && iCeil >= 0 && iCeil < urls.length) {
    list[iCeil] = loadImage(urls[iCeil]);
  }

  manageImageMemory(list, iFloor);

  return list;
}

function manageImageMemory(list, currentIndex) {
  for (let i = 0; i < list.length; i++) {
    if (i < currentIndex - 2 || i > currentIndex + 2) {
      if (list[i]) {
        list[i] = null;
      }
    }
  }
}

function draw() {
  if (!sketchStarted) {
    speedSlider.hide();
    return;
  }

  background(0);

  if (loading) {
    drawLoadingSpinner();
    return;
  }

  let activeImages = getActiveImages();
  numImages = activeImages.length;

  if (autoplay) {
    targetScroll += getAutoplaySpeed();
    if (targetScroll >= numImages - 1) targetScroll = 0;
  }

  if (isWipeDragging) {
    scrollAmount = targetScroll;
  } else {
    let smoothing = dragging ? 0.2 : 0.1;
    scrollAmount = abs(scrollAmount - targetScroll) > 0.001
      ? lerp(scrollAmount, targetScroll, smoothing)
      : targetScroll;
  }

  sliderAnim = lerp(sliderAnim, sliderVisible ? 1 : 0, 0.1);

  let indexFloor = floor(scrollAmount);
  let indexCeil  = min(indexFloor + 1, numImages - 1);
  let frac       = scrollAmount - indexFloor;

  // FIX: Always use floor→ceil as A→B. Direction is handled by clipW logic below.
  let aIndex, bIndex, t;
  if (isWipeDragging && dragPairLeft >= 0) {
    aIndex = dragPairLeft;
    bIndex = dragPairRight;
    t = constrain(scrollAmount - dragPairLeft, 0, 1);
  } else {
    aIndex = indexFloor;
    bIndex = indexCeil;
    t = dragging ? dragAmt : frac;
  }

  let imgA = activeImages[aIndex];
  let imgB = activeImages[bIndex];
  let currentIndex = round(scrollAmount);

  // Update direction tracking
  if (!isWipeDragging) {
    if (dirLockFrames > 0) {
      dirLockFrames--;
    } else if (currentIndex !== lastImageIndex) {
      lastWipeDirection = (scrollAmount - lastImageIndex > 0) ? 1 : -1;
    }
    lastImageIndex = currentIndex;
  }

  // FIX: Draw imgA exactly once
  if (imgA) {
    drawImageFitted(imgA);
  }

  // FIX: Only draw wipe when we have two distinct images
  if (imgA && imgB && aIndex !== bIndex) {
    let blendAmt = constrain(t, 0, 1);
    let fittedB  = getFittedSize(imgB);

    // FIX: Consistent transform — matches drawImageFitted exactly
    push();
    translate(width / 2, height / 2);
    if (zoomLevel !== 1) {
      translate(panX, panY);
      scale(zoomLevel);
    }

    const ctx  = drawingContext;
    const left = -fittedB.w / 2;
    const top  = -fittedB.h / 2;

    // FIX: direction purely from lastWipeDirection; A is always floor
    let forward = lastWipeDirection >= 0;
    let clipW   = forward
      ? fittedB.w * blendAmt
      : fittedB.w * (1 - blendAmt);

    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, clipW, fittedB.h);
    ctx.clip();
    imageMode(CENTER);
    image(imgB, 0, 0, fittedB.w, fittedB.h);
    ctx.restore();

    // Wipe line + handle dot in same transformed space
    let wipeLocalX = left + clipW;
    stroke(255);
    strokeWeight(2 / max(zoomLevel, 0.001));
    line(wipeLocalX, top, wipeLocalX, top + fittedB.h);
    noStroke();
    fill(255);
    ellipse(wipeLocalX, 0, 8 / max(zoomLevel, 0.001), 8 / max(zoomLevel, 0.001));

    // FIX: Screen-space bookkeeping computed from THIS frame's fittedB (not stale)
    const screenLeft = width / 2 - fittedB.w / 2;
    lastWipeXScreen  = screenLeft + clipW;
    lastBaseXScreen  = screenLeft;
    lastFittedW      = fittedB.w;
    lastFittedH      = fittedB.h;
    lastPairLeftIndex = aIndex;
    lastBlendAmt     = blendAmt;

    pop();
  }

  drawSlider(activeImages);
  drawSliderTab();
  drawBottomButtons();
  autoScrollThumbBar();

  fill(255, 180); noStroke();
  textSize(width < 500 ? 14 : 20);
  textAlign(CENTER, BOTTOM);
  text(`Day ${round(scrollAmount) + 1}`, width / 2, height - (sliderAnim * sliderHeight + 50));

  if (showArrows) {
    noStroke(); fill(255, 180); textSize(40);
    textAlign(LEFT, CENTER);  text("❮", 20, height / 2);
    textAlign(RIGHT, CENTER); text("❯", width - 20, height / 2);
  }

  if (autoplay && speedSlider) {
    speedSlider.show();
    speedSlider.elt.style.display = 'block';
  } else if (speedSlider) {
    speedSlider.hide();
  }
}

function drawLoadingSpinner() {
  push();
  translate(width / 2, height / 2);
  noFill(); stroke(255); strokeWeight(4);
  rotate(loadingSpinnerAngle);
  arc(0, 0, 40, 40, 0, PI * 1.5);
  pop();
  loadingSpinnerAngle += 0.1;
}

function drawImageFitted(img) {
  let { w, h } = getFittedSize(img);

  push();
  translate(width / 2, height / 2);
  if (zoomLevel !== 1) {
    translate(panX, panY);
    scale(zoomLevel);
  }
  imageMode(CENTER);
  image(img, 0, 0, w, h);
  pop();
}

function getFittedSize(img) {
  let imgAspect    = img.width / img.height;
  let canvasAspect = width / height;
  let w, h;
  if (imgAspect > canvasAspect) {
    w = width;  h = width / imgAspect;
  } else {
    h = height; w = height * imgAspect;
  }
  return { w, h };
}

function autoScrollThumbBar() {
  let currentIndex = floor(scrollAmount);
  if (currentIndex !== lastScrollIndex && thumbWidth && sliderAnim > 0.01) {
    sliderOffset   = -(thumbWidth + 10) * currentIndex + width / 3;
    lastScrollIndex = currentIndex;
  }
}

function drawSlider(imgList) {
  if (sliderAnim < 0.01) return;

  noStroke();
  fill(0, 230);
  rect(0, height - sliderAnim * sliderHeight, width, sliderAnim * sliderHeight);

  thumbWidth = min(60, width / 8);
  let margin = 10;
  let y = height - sliderAnim * sliderHeight + 10;

  let centerIndex = round(scrollAmount);
  let range = 1;
  let indices = [];

  for (let i = centerIndex - range; i <= centerIndex + range; i++) {
    if (i >= 0 && i < imgList.length) indices.push(i);
  }

  if (!imgList[centerIndex]) return;

  let visibleThumbs = indices.length;
  let totalWidth = visibleThumbs * (thumbWidth + margin) - margin;
  let x = (width - totalWidth) / 2;

  for (let idx of indices) {
    let img = imgList[idx];
    if (!img) { x += thumbWidth + margin; continue; }

    let thumbH = thumbWidth * (img.height / img.width);
    image(img, x + thumbWidth / 2, y + thumbH / 2, thumbWidth, thumbH);

    if (idx === centerIndex) {
      stroke(255); strokeWeight(2); noFill();
      rect(x - 2, y - 2, thumbWidth + 4, thumbH + 4, 6);
    }

    x += thumbWidth + margin;
  }
}

function drawSliderTab() {
  let tabW = 120, tabH = 20, tabX = width / 2 - tabW / 2;
  let tabY = height - tabH;

  push(); translate(tabX, tabY);
  noStroke(); fill(0, 180);
  beginShape();
  vertex(0, tabH); vertex(0, 6); quadraticVertex(0, 0, 6, 0);
  vertex(tabW - 6, 0); quadraticVertex(tabW, 0, tabW, 6); vertex(tabW, tabH);
  endShape(CLOSE);
  fill(255); textSize(14); textAlign(CENTER, CENTER);
  text(sliderVisible ? "▼" : "▲", tabW / 2, tabH / 2);
  pop();
}

function drawBottomButtons() {
  let fittedSize = 32, gap = 10, startX = 10;
  let y = 20;

  let arrowX = startX;
  drawButton(arrowX, y, fittedSize, "⇄", "Arrows", showArrows, () => showArrows = !showArrows);

  let playX = arrowX + fittedSize + gap;
  drawButton(playX, y, fittedSize, autoplay ? "■" : "▶", "Play", autoplay, () => {
    autoplay = !autoplay;
    if (autoplay) {
      lastWipeDirection = +1; dirLockFrames = 12;
      targetScroll = scrollAmount;
      speedSlider.show();
      speedSlider.elt.style.display = 'block';
    } else {
      speedSlider.hide();
    }
  });

  let centerX = playX + fittedSize + gap;
  drawButton(centerX, y, fittedSize, "C", "Centered", centeredView, () => {
    let oldIndex = round(scrollAmount);
    centeredView = !centeredView;

    let newURLs = centeredView ? allImageURLs.centered : allImageURLs.normal;
    let newMax  = newURLs ? newURLs.length : 0;
    let clampedIndex = constrain(oldIndex, 0, newMax - 1);

    lastWipeDirection = (clampedIndex > round(scrollAmount)) ? +1 : -1;
    dirLockFrames = 12;
    scrollAmount = targetScroll = clampedIndex;
  });

  let sliderX = centerX + fittedSize + gap;
  drawButton(sliderX, y, fittedSize, "⇵", "Slider", sliderVisible, () => {
    sliderVisible = !sliderVisible;
  });
}

function drawButton(x, y, size, symbol, label, active, onClick) {
  fill(active ? color(0, 255, 255) : color(0, 180));
  stroke(255); strokeWeight(1);
  rect(x, y, size, size, 6);
  noStroke(); fill(255); textAlign(CENTER, CENTER);
  textSize(14); text(symbol, x + size / 2, y + size / 2);
  textSize(10); text(label, x + size / 2, y - 8);
}

function mousePressed() {
  if (speedSlider && speedSlider.elt && autoplay) {
    let r = speedSlider.elt.getBoundingClientRect();
    if (mouseX >= r.left && mouseX <= r.right &&
        mouseY >= r.top  && mouseY <= r.bottom) {
      return false;
    }
  }

  dragDistance = 0;
  let fittedSize = 32, gap = 10, startX = 10, y = 20;
  let arrowX = startX, playX = arrowX + fittedSize + gap;
  let centerX = playX + fittedSize + gap, sliderX = centerX + fittedSize + gap;

  if (inside(mouseX, mouseY, arrowX, y, fittedSize)) { showArrows = !showArrows; return; }

  if (inside(mouseX, mouseY, playX, y, fittedSize)) {
    autoplay = !autoplay;
    if (autoplay) {
      lastWipeDirection = +1; dirLockFrames = 12;
      targetScroll = scrollAmount;
      speedSlider.show();
      speedSlider.elt.style.display = 'block';
    } else {
      speedSlider.hide();
    }
    return;
  }

  if (inside(mouseX, mouseY, centerX, y, fittedSize)) {
    let oldIndex = round(scrollAmount);
    centeredView = !centeredView;
    let newURLs  = centeredView ? allImageURLs.centered : allImageURLs.normal;
    let newMax   = newURLs ? newURLs.length : 0;
    let clampedIndex = constrain(oldIndex, 0, newMax - 1);
    lastWipeDirection = (clampedIndex > round(scrollAmount)) ? +1 : -1;
    dirLockFrames = 12;
    scrollAmount = targetScroll = clampedIndex;
    return;
  }

  if (inside(mouseX, mouseY, sliderX, y, fittedSize)) { sliderVisible = !sliderVisible; return; }

  // Slider tab
  let tabW = 120, tabH = 20, tabX = width / 2 - tabW / 2, tabY = height - tabH;
  if (inside(mouseX, mouseY, tabX, tabY, tabW, tabH)) { sliderVisible = !sliderVisible; return; }

  // Wipe handle grab
  if (!autoplay && isFinite(lastWipeXScreen) && isFinite(lastBaseXScreen) && isFinite(lastFittedW)) {
    const handleRadius = 18;
    const imgTop    = (height - lastFittedH) / 2;
    const imgBottom = imgTop + lastFittedH;

    if (mouseY >= imgTop && mouseY <= imgBottom && abs(mouseX - lastWipeXScreen) <= handleRadius) {
      dragPairLeft  = floor(scrollAmount);
      dragPairRight = min(dragPairLeft + 1, numImages - 1);

      isWipeDragging = true;
      autoplay       = false;
      lastWipeDirection = +1;
      dragging       = false;
      suppressDrag   = true;
      targetScroll   = scrollAmount;
      dirLockFrames  = 12;
      return;
    }
  }

  let arrowZoneW = 80;
  if (showArrows && mouseX < arrowZoneW) {
    suppressDrag = true;
    lastWipeDirection = -1; dirLockFrames = 12;
    targetScroll = max(0, round(scrollAmount) - 1);
    return;
  }
  if (showArrows && mouseX > width - arrowZoneW) {
    suppressDrag = true;
    lastWipeDirection = +1; dirLockFrames = 12;
    targetScroll = min(numImages - 1, round(scrollAmount) + 1);
    return;
  }

  if (
    !suppressDrag &&
    mouseY > 100 &&
    mouseY < height - sliderAnim * sliderHeight - 40 &&
    mouseX > 60 && mouseX < width - 60
  ) {
    dragging = true;
    updateDragAmt(mouseX);
  }

  if (sliderVisible && mouseY > height - sliderAnim * sliderHeight && dragDistance < 10) {
    isDraggingSlider = true;
    lastDragX = mouseX;
  }
}

function inside(mx, my, x, y, w, h = w) {
  return mx > x && mx < x + w && my > y && my < y + h;
}

function mouseDragged() {
  if (isWipeDragging && dragPairLeft >= 0) {
    let t = (mouseX - lastBaseXScreen) / lastFittedW;
    t = constrain(t, 0, 1);
    scrollAmount = targetScroll = dragPairLeft + t;
    dirLockFrames = 2;
    return;
  }

  if (dragging) {
    dragDistance += abs(mouseX - pmouseX);
    updateDragAmt(mouseX);
  }

  if (isDraggingSlider) {
    let dx = mouseX - lastDragX;
    sliderOffset += dx;
    lastDragX = mouseX;
  }
}

function mouseReleased() {
  if (isWipeDragging) {
    isWipeDragging = false;
    suppressDrag   = false;
    targetScroll   = constrain(round(scrollAmount), 0, numImages - 1);
    dragPairLeft   = dragPairRight = -1;
    return;
  }

  if (dragging) {
    dragging     = false;
    targetScroll = constrain(round(scrollAmount), 0, numImages - 1);
  }
  if (isDraggingSlider) isDraggingSlider = false;
  suppressDrag = false;

  if (
    sliderVisible &&
    mouseY > height - sliderAnim * sliderHeight &&
    dragDistance < 1
  ) {
    let thumbW = min(60, width / 8);
    let margin = 10;
    let x = margin + sliderOffset;

    for (let i = 0; i < numImages; i++) {
      let thumbH = thumbW * (height / width);
      let thumbX = x;
      let thumbY = height - sliderAnim * sliderHeight + 10;

      if (inside(mouseX, mouseY, thumbX, thumbY, thumbW, thumbH)) {
        lastWipeDirection = (i > round(scrollAmount)) ? +1 : -1;
        dirLockFrames = 12;
        targetScroll  = i;
        dragging      = false;
        suppressDrag  = true;
        return;
      }
      x += thumbW + margin;
    }
  }
}

function updateDragAmt(x) {
  dragAmt = constrain(x / width, 0, 1);
}

function mouseWheel(event) {
  if (!dragging && !autoplay) {
    const dx = event.deltaX || 0;
    const dy = event.deltaY || 0;
    if (Math.abs(dx) > Math.abs(dy)) {
      targetScroll += dx * 0.01;
      targetScroll = constrain(targetScroll, 0, numImages - 1);
    }
  }
}

function keyPressed() {
  if (key === "c" || key === "C") centeredView = !centeredView;
  if (keyCode === 122) {
    let fsEl = document.documentElement;
    document.fullscreenElement ? document.exitFullscreen() : fsEl.requestFullscreen();
    return false;
  }
}

function touchStarted() {
  // FIX: Guard wipe drag first — prevent touchMoved from fighting it
  if (isWipeDragging) return false;

  if (speedSlider && speedSlider.elt && autoplay) {
    let r = speedSlider.elt.getBoundingClientRect();
    if (touches.length > 0) {
      let touch = touches[0];
      if (touch.x >= r.left && touch.x <= r.right &&
          touch.y >= r.top  && touch.y <= r.bottom) {
        return true;
      }
    }
  }

  if (touches.length === 1) {
    let touch = touches[0];
    swipeStartX  = touch.x;
    swipeStartY  = touch.y;
    lastTouchX   = touch.x;
    lastTouchY   = touch.y;

    if (zoomLevel > 1) {
      isPanning = true;
    } else {
      mousePressed();
    }
  } else if (touches.length === 2) {
    isZooming = true;
    isPanning  = false;
    let touch1 = touches[0];
    let touch2 = touches[1];
    lastTouchDistance = dist(touch1.x, touch1.y, touch2.x, touch2.y);
    zoomCenterX = (touch1.x + touch2.x) / 2 - width / 2;
    zoomCenterY = (touch1.y + touch2.y) / 2 - height / 2;
  }

  return false;
}

function touchMoved() {
  // FIX: If wipe handle is being dragged, handle it and nothing else
  if (isWipeDragging && dragPairLeft >= 0) {
    if (touches.length > 0) {
      let touch = touches[0];
      let t = (touch.x - lastBaseXScreen) / lastFittedW;
      t = constrain(t, 0, 1);
      scrollAmount = targetScroll = dragPairLeft + t;
      dirLockFrames = 2;
    }
    return false;
  }

  if (speedSlider && speedSlider.elt && autoplay) {
    let r = speedSlider.elt.getBoundingClientRect();
    if (touches.length > 0) {
      let touch = touches[0];
      if (touch.x >= r.left && touch.x <= r.right &&
          touch.y >= r.top  && touch.y <= r.bottom) {
        return true;
      }
    }
  }

  if (touches.length === 1 && isPanning && zoomLevel > 1) {
    let touch  = touches[0];
    let deltaX = touch.x - lastTouchX;
    let deltaY = touch.y - lastTouchY;

    panX += deltaX;
    panY += deltaY;

    let maxPanX = (width  * (zoomLevel - 1)) / 2;
    let maxPanY = (height * (zoomLevel - 1)) / 2;
    panX = constrain(panX, -maxPanX, maxPanX);
    panY = constrain(panY, -maxPanY, maxPanY);

    lastTouchX = touch.x;
    lastTouchY = touch.y;

  } else if (touches.length === 1 && !isPanning && !isWipeDragging) {
    let touch  = touches[0];
    let deltaX = touch.x - swipeStartX; // FIX: measure from swipe START not last frame

    if (abs(deltaX) > 50) {
      if (deltaX > 0) {
        lastWipeDirection = -1; dirLockFrames = 12;
        targetScroll = max(0, round(scrollAmount) - 1);
      } else {
        lastWipeDirection = +1; dirLockFrames = 12;
        targetScroll = min(numImages - 1, round(scrollAmount) + 1);
      }
      // Reset swipe origin so user has to do a full new swipe
      swipeStartX = touch.x;
    }

  } else if (touches.length === 2 && isZooming) {
    let touch1 = touches[0];
    let touch2 = touches[1];
    let currentDistance = dist(touch1.x, touch1.y, touch2.x, touch2.y);

    let zoomChange = currentDistance / lastTouchDistance;
    zoomLevel = constrain(zoomLevel * zoomChange, 1, 3);

    lastTouchDistance = currentDistance;
    zoomCenterX = (touch1.x + touch2.x) / 2 - width / 2;
    zoomCenterY = (touch1.y + touch2.y) / 2 - height / 2;
  }

  return false;
}

function touchEnded() {
  isPanning  = false;
  isZooming  = false;

  if (abs(zoomLevel - 1) < 0.1) {
    zoomLevel = 1;
    panX = 0;
    panY = 0;
  }

  // FIX: Don't call mouseReleased if wipe-dragging — handle it cleanly
  if (isWipeDragging) {
    isWipeDragging = false;
    suppressDrag   = false;
    targetScroll   = constrain(round(scrollAmount), 0, numImages - 1);
    dragPairLeft   = dragPairRight = -1;
    return false;
  }

  mouseReleased();
  return false;
}

function getImage(index, useCentered = false) {
  if (!allImageURLs) return null;

  let list = useCentered ? allImageURLs.centered : allImageURLs.normal;
  if (!list || !list[index]) return null;

  let key = (useCentered ? "c" : "n") + index;

  if (!loadedImages[key]) {
    loadImage(list[index], (img) => {
      loadedImages[key] = img;
      for (let k in loadedImages) {
        let isC = k.startsWith("c");
        let i   = parseInt(k.slice(1));
        if (isC === useCentered && Math.abs(i - index) > 2) {
          delete loadedImages[k];
        }
      }
    });
  }

  return loadedImages[key] || null;
}
