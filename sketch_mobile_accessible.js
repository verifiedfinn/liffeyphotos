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

function isMobileLayout() {
   return /Mobi|Android/i.test(navigator.userAgent);
}

function preload() {
  // Only load the JSON file, NOT the images themselves
  loadJSON("images.json", (data) => {
    allImageURLs = data;
    imageOrder = data.normal.slice();

    // Just prep the arrays — don’t load any images yet
    images = new Array(data.normal.length);
    centeredImages = new Array(data.centered.length);

    loading = false;
  });
}

    data.centered.forEach((url, i) => {
      loadImage(url, (img) => {
        centeredImages[i] = img;
        if (++loadedSoFar === totalToLoad) loading = false;
      });
    });

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

  speedSlider.input(() => {
    autoplaySpeed = speedSlider.value();
    console.log("Speed changed to:", autoplaySpeed);
  });

  speedSlider.style("width", "120px");
  speedSlider.style("height", "20px");
  speedSlider.style("z-index", "1001");
  speedSlider.style("position", "fixed");
  speedSlider.style("display", "none");
  speedSlider.style("pointer-events", "auto");
  speedSlider.style("background", "rgba(255,255,255,0.8)");
  speedSlider.style("border-radius", "4px");

  document.body.appendChild(speedSlider.elt);
}

function positionSpeedSlider() {
  if (!speedSlider) return;

  let sliderX = 10;
  let sliderY = 60;

  speedSlider.style('left', sliderX + 'px');
  speedSlider.style('top', sliderY + 'px');
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  positionSpeedSlider();
   showArrows = isMobileLayout();
}

function startSketch() {
  if (!sketchStarted) {
    sketchStarted = true;
    overlayDiv.remove();
    mousePressed(); // trigger tap logic

    if (isMobileLayout()) {
      showArrows = true;
    }

    if (autoplay) {
      speedSlider.show();
      positionSpeedSlider();
    }
  }
}

function getAutoplaySpeed() {
  return 0.02 * autoplaySpeed;
}

function getActiveImages() {
  let list = centeredView ? centeredImages : images;
  let urls = centeredView ? allImageURLs.centered : allImageURLs.normal;

  let currentIndex = Math.floor(scrollAmount);
  let nextIndex = Math.min(currentIndex + 1, urls.length - 1);

  // Clean up unused images
  for (let i = 0; i < list.length; i++) {
    if (i !== currentIndex && i !== nextIndex && list[i]) {
      if (list[i].canvas) list[i].canvas = null;
      list[i] = null;
    }
  }

  // Load only the current and next images
  if (!list[currentIndex] && urls[currentIndex]) {
    list[currentIndex] = loadImage(urls[currentIndex]);
  }
  if (!list[nextIndex] && urls[nextIndex]) {
    list[nextIndex] = loadImage(urls[nextIndex]);
  }

  return list;
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

  let indexA = floor(scrollAmount), indexB = min(indexA + 1, numImages - 1);
  let lerpAmt = dragging ? dragAmt : scrollAmount - indexA;
  let imgA = activeImages[indexA], imgB = activeImages[indexB];

  if (imgA && imgB) {
    drawImageFitted(imgA);
    push();
    translate(width / 2, height / 2);
    let fittedSize = getFittedSize(imgB);
    copy(imgB, 0, 0, int(imgB.width * lerpAmt), imgB.height,
         -fittedSize.w / 2, -fittedSize.h / 2, int(fittedSize.w * lerpAmt), fittedSize.h);
    pop();

    let wipeX = (width / 2 - fittedSize.w / 2) + fittedSize.w * lerpAmt;
    stroke(255); strokeWeight(1);
    line(wipeX, (height - fittedSize.h) / 2, wipeX, (height + fittedSize.h) / 2);
    noStroke(); fill(255); ellipse(wipeX, height / 2, 8, 8);
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
  positionSpeedSlider();
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
  image(img, width / 2, height / 2, w, h);
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
  if (sliderAnim > 0.01) {
    noStroke(); fill(0, 230);
    rect(0, height - sliderAnim * sliderHeight, width, sliderAnim * sliderHeight);

    thumbWidth = min(60, width / 8);
    let margin = 10, x = margin + sliderOffset;
    for (let i = 0; i < imgList.length; i++) {
      let y = height - sliderAnim * sliderHeight + 10;
      let img = imgList[i];
      let thumbH = thumbWidth * (img.height / img.width);
      image(img, x + thumbWidth / 2, y + thumbH / 2, thumbWidth, thumbH);
      if (i === round(scrollAmount)) {
        stroke(255); strokeWeight(2); noFill();
        rect(x - 2, y - 2, thumbWidth + 4, thumbH + 4, 6);
      }
      x += thumbWidth + margin;
    }
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
    autoplay ? speedSlider.show() : speedSlider.hide();
    positionSpeedSlider();
  });

  let centerX = playX + fittedSize + gap;
  drawButton(centerX, y, fittedSize, "C", "Centered", centeredView, () => {
    centeredView = !centeredView;
    scrollAmount = targetScroll = 0;
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
      speedSlider.show();
      positionSpeedSlider();
    } else {
      speedSlider.hide();
    }
    return;
  }
  if (inside(mouseX, mouseY, centerX, y, fittedSize)) {
    centeredView = !centeredView;
    scrollAmount = targetScroll = 0;
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
    targetScroll = max(0, round(scrollAmount) - 1);
    return;
  }
  if (showArrows && mouseX > width - arrowZoneW) {
    suppressDrag = true;
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
    targetScroll += event.delta * 0.01;
    targetScroll = constrain(targetScroll, 0, numImages - 1);
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
  mousePressed(); 
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
  mouseDragged(); 
  return false; 
}

function touchEnded() { mouseReleased(); return false; }
