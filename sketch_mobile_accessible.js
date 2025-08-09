let sketchStarted = false;
let images = [], centeredImages = [], allImageURLs = { normal: [], centered: [] };
let numImages = 0, isEmbedded = window.self !== window.top;

let scrollAmount = 0, targetScroll = 0, dragging = false, dragAmt = 0;
let sliderVisible = false, sliderHeight = 100, sliderAnim = 0;

let autoplay = false, centeredView = false, loading = true;
let loadingSpinnerAngle = 0, thumbWidth, lastScrollIndex = -1;
let sliderOffset = 0, isDraggingSlider = false, lastDragX = 0;

let showArrows; // initialize later in setup()
let speedSlider, autoplaySpeed = 1;
let overlayDiv, imageOrder = [];
let suppressDrag = false;
let dragDistance = 0;
let canvas;
let lastImageIndex = -1;
let lastWipeDirection = 1;
let dirLockFrames = 0;
let loadedImages = {};
const MAX_LOADED_IMAGES = 3; // Very strict limit for mobile
let frameCount = 0; // Add this if you don't have it
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


function isMobileLayout() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function preload() {
  loadJSON("images.json", (data) => {
    allImageURLs = data;
    imageOrder = data.normal.slice();
    
    // 🚫 DON'T LOAD ALL IMAGES! Just set up empty arrays
    images = new Array(data.normal.length).fill(null);
    centeredImages = new Array(data.centered.length).fill(null);
    
    loading = false; // Skip loading screen since we're not preloading
    console.log(`Loaded ${data.normal.length} image URLs (not the actual images)`);
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

  createSpeedSlider(); // ✅ Move it here so it's always defined
  speedSlider.hide();  // ✅ Ensure it's hidden at start

  showArrows = isMobileLayout();
  background(0);
  imageMode(CENTER);
  textFont("Helvetica");
}

function createSpeedSlider() {
  speedSlider = createSlider(0.1, 3, autoplaySpeed, 0.1);
  if (!speedSlider || !speedSlider.elt || !speedSlider.style) return;
  // Give Safari/iOS a real intrinsic size to respect
speedSlider.size(100, 16);

  speedSlider.input(() => {
    autoplaySpeed = speedSlider.value();
  });

speedSlider.style("width", "100px");
speedSlider.style("height", "16px");
  speedSlider.style("z-index", "1001");
  speedSlider.style("position", "fixed");
  speedSlider.style("display", "none");
  speedSlider.style("pointer-events", "auto");
  speedSlider.style("background", "rgba(0, 0, 0, 0.9)");
  speedSlider.style("border-radius", "6px");
  speedSlider.style("border", "none");

  //  iOS safe area friendly top-right placement:
  speedSlider.elt.style.right = "calc(env(safe-area-inset-right, 0px) + 12px)";
  speedSlider.elt.style.top   = "calc(env(safe-area-inset-top, 0px) + 12px)";

  // Force proper sizing on iOS/Android
speedSlider.elt.style.appearance = 'none';
speedSlider.elt.style.webkitAppearance = 'none';
speedSlider.elt.style.height = '16px';
speedSlider.elt.style.width  = '100px';

// One-time CSS injection for track/thumb
if (!document.getElementById('range-css-patch')) {
  const style = document.createElement('style');
  style.id = 'range-css-patch';
  style.textContent = `
    input[type="range"]{
      -webkit-appearance:none;
      appearance:none;
height:16px;
width:100px;
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
  width:16px; height:16px; 
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
speedSlider.elt.style.lineHeight = '16px';
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

  // Guard if JSON hasn't landed yet
  if (!urls || urls.length === 0) return list;

  // Only check ONCE, not every frame
  let iFloor = Math.floor(scrollAmount);
  let iCeil  = Math.min(iFloor + 1, urls.length - 1);

  // Load floor
  if (!list[iFloor] && iFloor >= 0 && iFloor < urls.length) {
    list[iFloor] = loadImage(urls[iFloor]);
  }
  // Load ceil
  if (!list[iCeil] && iCeil >= 0 && iCeil < urls.length) {
    list[iCeil] = loadImage(urls[iCeil]);
  }

  // Cleanup distant images to save memory
  manageImageMemory(list, iFloor);

  // RETURN THE LIST ✅
  return list;
}

function manageImageMemory(list, currentIndex) {
  for (let i = 0; i < list.length; i++) {
    if (i < currentIndex - 2 || i > currentIndex + 2) {
      if (list[i]) {
        list[i] = null; // allow garbage collection
      }
    }
  }
}

function draw() {
if (!sketchStarted) {
  speedSlider.hide();  // Always hide if not started
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

  let smoothing = dragging ? 0.2 : 0.1;
if (abs(scrollAmount - targetScroll) > 0.001) {
  scrollAmount = lerp(scrollAmount, targetScroll, smoothing);
} else {
  scrollAmount = targetScroll;
}
  sliderAnim = lerp(sliderAnim, sliderVisible ? 1 : 0, 0.1);

let indexFloor = floor(scrollAmount);
let indexCeil = min(indexFloor + 1, numImages - 1);
let frac = scrollAmount - indexFloor;

// Decide which image is "from" (A) and "to" (B)
// and a monotonic progress t ∈ [0..1] regardless of direction
let aIndex, bIndex, t;
if (lastWipeDirection > 0) {
  // forward: floor -> ceil
  aIndex = indexFloor;
  bIndex = indexCeil;
  t = dragging ? dragAmt : frac;
} else {
  // backward: ceil -> floor
  aIndex = indexCeil;
  bIndex = indexFloor;
  t = dragging ? (1 - dragAmt) : (1 - frac);
}

let imgA = activeImages[aIndex];
let imgB = activeImages[bIndex];
let currentIndex = round(scrollAmount);

// --- direction fallback (only if we didn't just set it explicitly) ---
if (dirLockFrames > 0) {
  dirLockFrames--;
} else if (currentIndex !== lastImageIndex) {
  lastWipeDirection = (scrollAmount - lastImageIndex > 0) ? 1 : -1;
}
lastImageIndex = currentIndex;

if (imgA) {
  drawImageFitted(imgA);

if (imgA && imgB) {
  // Draw base A
  drawImageFitted(imgA);

 let blendAmt = constrain(t, 0, 1);
  let fittedB = getFittedSize(imgB);

  // Draw B with a clipping rectangle that grows/shrinks
  push();
  translate(width / 2, height / 2);

  // Apply zoom & pan (see section 3 for the improved order)
  if (zoomLevel !== 1) {
    translate(panX, panY);
    scale(zoomLevel);
  }

  const ctx = drawingContext;
  const left = -fittedB.w / 2;
  const top  = -fittedB.h / 2;

  let clipW = lastWipeDirection > 0
    ? fittedB.w * blendAmt           // forward: left → right
    : fittedB.w * (1 - blendAmt);    // backward: right → left (we clip from left but compute line accordingly)

  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, clipW, fittedB.h);
  ctx.clip();

  imageMode(CENTER);
  image(imgB, 0, 0, fittedB.w, fittedB.h);
  ctx.restore();

  // Draw the wipe line IN THE SAME TRANSFORMED SPACE
  // Local coords: center is (0,0), top-left is (left, top)
  let wipeLocalX = left + clipW;

  // Keep line thickness roughly constant in screen pixels
  stroke(255);
  strokeWeight(2 / max(zoomLevel, 0.001));
  line(wipeLocalX, top, wipeLocalX, top + fittedB.h);

  // Little handle dot at the center line, also size-compensated
  noStroke();
  fill(255);
  ellipse(wipeLocalX, 0, 8 / max(zoomLevel, 0.001), 8 / max(zoomLevel, 0.001));

  pop(); // <- now we pop AFTER drawing the line in transformed space
}
}

  drawSlider(activeImages);
  drawSliderTab();
  drawBottomButtons();
  autoScrollThumbBar();

  fill(255, 180); noStroke(); textSize(width < 500 ? 14 : 20); textAlign(CENTER, BOTTOM);
  text(`Day ${round(scrollAmount) + 1}`, width / 2, height - (sliderAnim * sliderHeight + 50));

  if (showArrows) {
    noStroke(); fill(255, 180); textSize(40);
    textAlign(LEFT, CENTER); text("❮", 20, height / 2);
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
  
  // Apply zoom and pan
  if (zoomLevel !== 1) {
    scale(zoomLevel);
    translate(panX / zoomLevel, panY / zoomLevel);
  }
  
  imageMode(CENTER);
  image(img, 0, 0, w, h);
  pop();
}

function getFittedSize(img) {
  let imgAspect = img.width / img.height;
  let canvasAspect = width / height;
  let w, h;
  if (imgAspect > canvasAspect) {
    w = width; h = width / imgAspect;
  } else {
    h = height; w = height * imgAspect;
  }
  return { w, h };
}

function autoScrollThumbBar() {
  let currentIndex = floor(scrollAmount);
  if (currentIndex !== lastScrollIndex && thumbWidth && sliderAnim > 0.01) {
    sliderOffset = -(thumbWidth + 10) * currentIndex + width / 3;
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
  let range = 1; // one before and one after = 3 total
  let indices = [];

  // Gather 3 indices: left, center, right
  for (let i = centerIndex - range; i <= centerIndex + range; i++) {
    if (i >= 0 && i < imgList.length) {
      indices.push(i);
    }
  }

  // Check that center image is fully loaded before rendering
  if (!imgList[centerIndex]) return; // Wait until center is loaded

  // Compute total width and starting x so it’s centered
  let visibleThumbs = indices.length;
  let totalWidth = visibleThumbs * (thumbWidth + margin) - margin;
  let x = (width - totalWidth) / 2;

  for (let idx of indices) {
    let img = imgList[idx];
    if (!img) {
      x += thumbWidth + margin;
      continue;
    }

    let thumbH = thumbWidth * (img.height / img.width);
    image(img, x + thumbWidth / 2, y + thumbH / 2, thumbWidth, thumbH);

    if (idx === centerIndex) {
      stroke(255);
      strokeWeight(2);
      noFill();
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
  let y = 20; // ✅ force top-left for all layouts

  let arrowX = startX;
  drawButton(arrowX, y, fittedSize, "⇄", "Arrows", showArrows, () => showArrows = !showArrows);

  let playX = arrowX + fittedSize + gap;
drawButton(playX, y, fittedSize, autoplay ? "■" : "▶", "Play", autoplay, () => {
  autoplay = !autoplay;
if (autoplay) {
  lastWipeDirection = +1; dirLockFrames = 12; // →
  targetScroll = scrollAmount;  // 🩹 Fix white line jump
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

  let newList = centeredView ? centeredImages : images;
  let newURLs = centeredView ? allImageURLs.centered : allImageURLs.normal;
  let newMax = newList.length || newURLs.length;
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
  // FIRST: Check if clicking on speed slider - if so, do NOTHING
  if (speedSlider && speedSlider.elt && autoplay) {
    let rect = speedSlider.elt.getBoundingClientRect();
    if (mouseX >= rect.left && mouseX <= rect.right && 
        mouseY >= rect.top && mouseY <= rect.bottom) {
      return false; // Stop p5.js from handling this event
    }
  }

  dragDistance = 0;
  let fittedSize = 32, gap = 10, startX = 10, y = 20;
  let arrowX = startX, playX = arrowX + fittedSize + gap;
  let centerX = playX + fittedSize + gap, sliderX = centerX + fittedSize + gap;

  if (inside(mouseX, mouseY, arrowX, y, fittedSize)) return showArrows = !showArrows;
if (inside(mouseX, mouseY, playX, y, fittedSize)) {
  autoplay = !autoplay;
if (autoplay) {
  lastWipeDirection = +1; dirLockFrames = 12; // →
  targetScroll = scrollAmount;  // 🩹 Fix white line jump
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

let newList = centeredView ? centeredImages : images;
let newURLs = centeredView ? allImageURLs.centered : allImageURLs.normal;

let newMax = newList.length || newURLs.length;
let clampedIndex = constrain(oldIndex, 0, newMax - 1);

lastWipeDirection = (clampedIndex > round(scrollAmount)) ? +1 : -1;
dirLockFrames = 12;
scrollAmount = targetScroll = clampedIndex;
return;
  }
  if (inside(mouseX, mouseY, sliderX, y, fittedSize)) {
    sliderVisible = !sliderVisible;
    return;
  }

  // slider tab
  let tabW = 120, tabH = 20, tabX = width / 2 - tabW / 2, tabY = height - tabH;
  if (inside(mouseX, mouseY, tabX, tabY, tabW, tabH)) {
    sliderVisible = !sliderVisible;
    return;
  }

let arrowZoneW = 80;
if (showArrows && mouseX < arrowZoneW) {
  suppressDrag = true;
  lastWipeDirection = -1; dirLockFrames = 12; // ←
  targetScroll = max(0, round(scrollAmount) - 1);
  return;
}
if (showArrows && mouseX > width - arrowZoneW) {
  suppressDrag = true;
  lastWipeDirection = +1; dirLockFrames = 12; // →
  targetScroll = min(numImages - 1, round(scrollAmount) + 1);
  return;
}

  else if (
    !suppressDrag &&
    mouseY > 100 &&
    mouseY < height - sliderAnim * sliderHeight - 40 &&
    mouseX > 60 && mouseX < width - 60
  ) {
    dragging = true;
    updateDragAmt(mouseX);
  }
  
  if (
    sliderVisible &&
    mouseY > height - sliderAnim * sliderHeight &&
    dragDistance < 10
  ) {
    isDraggingSlider = true;
    lastDragX = mouseX;
  }
}

function inside(mx, my, x, y, w, h = w) {
  return mx > x && mx < x + w && my > y && my < y + h;
}

function mouseDragged() {
  if (dragging) {
    dragDistance += abs(mouseX - pmouseX);  // ✅ Track how far user dragged
    updateDragAmt(mouseX);
  }

  if (isDraggingSlider) {
    let dx = mouseX - lastDragX;
    sliderOffset += dx;
    lastDragX = mouseX;
  }
}

function mouseReleased() {
  if (dragging) {
    dragging = false;
    targetScroll = constrain(round(scrollAmount), 0, numImages - 1);
  }
  if (isDraggingSlider) isDraggingSlider = false;
  suppressDrag = false;

    // Handle thumbnail clicks inside slider
if (
  sliderVisible &&
  mouseY > height - sliderAnim * sliderHeight &&
  dragDistance < 1 // much more strict
) {
  let thumbW = min(60, width / 8);
  let margin = 10;
  let x = margin + sliderOffset;

  for (let i = 0; i < numImages; i++) {
    let thumbH = thumbW * (height / width); // aspect ratio estimate
    let thumbX = x;
    let thumbY = height - sliderAnim * sliderHeight + 10;

if (inside(mouseX, mouseY, thumbX, thumbY, thumbW, thumbH)) {
  lastWipeDirection = (i > round(scrollAmount)) ? +1 : -1;
  dirLockFrames = 12;
  targetScroll = i;
  dragging = false;
  suppressDrag = true;
  return;
}
    x += thumbW + margin;
  }
}
}

suppressDrag = false;

function updateDragAmt(x) {
  dragAmt = constrain(x / width, 0, 1);
}

function mouseWheel(event) {
  if (!dragging && !autoplay) {
    const dx = event.deltaX || 0;
    const dy = event.deltaY || 0;
    // Only react if the gesture is mostly horizontal
    if (Math.abs(dx) > Math.abs(dy)) {
      targetScroll += dx * 0.01;
      targetScroll = constrain(targetScroll, 0, numImages - 1);
    }
  }
  // don't preventDefault; page can still scroll vertically
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
  // Check if touching the speed slider area
  if (speedSlider && speedSlider.elt && autoplay) {
    let rect = speedSlider.elt.getBoundingClientRect();
    if (touches.length > 0) {
      let touch = touches[0];
      if (touch.x >= rect.left && touch.x <= rect.right &&
          touch.y >= rect.top && touch.y <= rect.bottom) {
        return true; // Allow default touch behavior for slider
      }
    }
  }

  if (touches.length === 1) {
    // Single touch - handle navigation or panning
    let touch = touches[0];
    lastTouchX = touch.x;
    lastTouchY = touch.y;
    
    if (zoomLevel > 1) {
      // If zoomed in, enable panning
      isPanning = true;
    } else {
      // If not zoomed, handle normal navigation
      mousePressed();
    }
  } else if (touches.length === 2) {
    // Two finger touch - start zoom
    isZooming = true;
    let touch1 = touches[0];
    let touch2 = touches[1];
    
    // Calculate distance between touches
    lastTouchDistance = dist(touch1.x, touch1.y, touch2.x, touch2.y);
    
    // Calculate center point between touches
    zoomCenterX = (touch1.x + touch2.x) / 2 - width / 2;
    zoomCenterY = (touch1.y + touch2.y) / 2 - height / 2;
  }
  
  return false;
}

function touchMoved() {
  // Check if touching the speed slider area
  if (speedSlider && speedSlider.elt && autoplay) {
    let rect = speedSlider.elt.getBoundingClientRect();
    if (touches.length > 0) {
      let touch = touches[0];
      if (touch.x >= rect.left && touch.x <= rect.right &&
          touch.y >= rect.top && touch.y <= rect.bottom) {
        return true; // Allow default touch behavior for slider
      }
    }
  }

  if (touches.length === 1 && isPanning && zoomLevel > 1) {
    // Single finger pan when zoomed
    let touch = touches[0];
    let deltaX = touch.x - lastTouchX;
    let deltaY = touch.y - lastTouchY;
    
    panX += deltaX;
    panY += deltaY;
    
    // Limit panning to image bounds
    let maxPanX = (width * (zoomLevel - 1)) / 2;
    let maxPanY = (height * (zoomLevel - 1)) / 2;
    panX = constrain(panX, -maxPanX, maxPanX);
    panY = constrain(panY, -maxPanY, maxPanY);
    
    lastTouchX = touch.x;
    lastTouchY = touch.y;
    
  } else if (touches.length === 1 && !isPanning) {
    // Single finger swipe for navigation
    let touch = touches[0];
    let deltaX = touch.x - lastTouchX;
    
    // 📱 SWIPE NAVIGATION: Left/Right swipes
if (abs(deltaX) > 50) { // Minimum swipe distance
  if (deltaX > 0) {
    lastWipeDirection = +1; dirLockFrames = 12; // →
    targetScroll = min(numImages - 1, round(scrollAmount) + 1);
  } else {
    lastWipeDirection = -1; dirLockFrames = 12; // ←
    targetScroll = max(0, round(scrollAmount) - 1);
  }
  lastTouchX = touch.x; // Reset to prevent multiple triggers
}
    
  } else if (touches.length === 2 && isZooming) {
    // Two finger zoom
    let touch1 = touches[0];
    let touch2 = touches[1];
    let currentDistance = dist(touch1.x, touch1.y, touch2.x, touch2.y);
    
    // Calculate zoom change
    let zoomChange = currentDistance / lastTouchDistance;
    zoomLevel *= zoomChange;
    zoomLevel = constrain(zoomLevel, 0.5, 4); // Limit zoom range
    
    lastTouchDistance = currentDistance;
    
    // Update zoom center
    zoomCenterX = (touch1.x + touch2.x) / 2 - width / 2;
    zoomCenterY = (touch1.y + touch2.y) / 2 - height / 2;
  }
  
  return false;
}

function touchEnded() {
  isPanning = false;
  isZooming = false;
  
  // Reset zoom if very close to 1
  if (abs(zoomLevel - 1) < 0.1) {
    zoomLevel = 1;
    panX = 0;
    panY = 0;
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

      // Remove images that are too far from current index
      for (let k in loadedImages) {
        let isC = k.startsWith("c");
        let i = parseInt(k.slice(1));
        if (isC === useCentered && Math.abs(i - index) > 2) {
          delete loadedImages[k];
        }
      }
    });
  }

  return loadedImages[key] || null;
}
