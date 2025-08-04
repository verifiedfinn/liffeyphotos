// Full update with fixes and features (final cleanup)
let images = [];
let centeredImages = [];
let allImageURLs = { normal: [], centered: [] };
let numImages = 0;

let scrollAmount = 0;
let targetScroll = 0;
let dragging = false;
let dragAmt = 0;
let sliderVisible = false;
let sliderHeight = 100;
let sliderAnim = 0;

let autoplay = false;
let centeredView = false;
let loading = true;
let loadedCount = 0;
let loadingSpinnerAngle = 0;

let sliderOffset = 0;
let isDraggingSlider = false;
let lastDragX = 0;
let thumbWidth;
let lastScrollIndex = -1;

let showArrows = false;
let speedSlider;
let autoplaySpeed = 1;

let imageOrder = [];

function preload() {
  loadJSON("images.json", (data) => {
    allImageURLs = data;
    imageOrder = data.normal.slice(); // preserve original order

    let allURLs = [...data.normal, ...data.centered];
    let seen = new Set(allURLs);
    let totalToLoad = seen.size;
    let loadedSoFar = 0;

    images = new Array(data.normal.length);
    centeredImages = new Array(data.centered.length);

    data.normal.forEach((url, i) => {
      loadImage(url, (img) => {
        images[i] = img;
        loadedSoFar++;
        if (loadedSoFar === totalToLoad) loading = false;
      });
    });

    let reversed = data.centered.slice().reverse();
    reversed.forEach((url, i) => {
      loadImage(url, (img) => {
        centeredImages[i] = img;
        loadedSoFar++;
        if (loadedSoFar === totalToLoad) loading = false;
      });
    });
  });
}

function checkIfDone() {
  if (loadedCount >= new Set([...allImageURLs.normal, ...allImageURLs.centered]).size) {
    loading = false;
  }
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  background(0);
  imageMode(CENTER);
  textFont("Helvetica");
  createSpeedSlider();
}

function createSpeedSlider() {
  speedSlider = createSlider(0.1, 3, 1, 0.1);
  speedSlider.position(20, height - 40);
  speedSlider.style("width", "120px");
  speedSlider.input(() => autoplaySpeed = speedSlider.value());
  speedSlider.hide();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  speedSlider.position(20, height - 40); // keep it consistent
}

function getAutoplaySpeed() {
  let base = centeredView ? 0.02 : 0.02; // same speed for both modes
  return base * autoplaySpeed;
}
function getActiveImages() {
  return centeredView ? centeredImages : images;
}

function draw() {
  background(0);

  if (loading) {
    drawLoadingSpinner();
    return;
  }

  let activeImages = getActiveImages();
  numImages = activeImages.length;

  if (autoplay) {
    scrollAmount += getAutoplaySpeed();
    if (scrollAmount >= numImages - 1) scrollAmount = 0;
    targetScroll = scrollAmount;
  } else if (!dragging) {
    scrollAmount = lerp(scrollAmount, targetScroll, 0.1);
  } else {
    scrollAmount = constrain(scrollAmount, 0, numImages - 1);
  }

  sliderAnim = lerp(sliderAnim, sliderVisible ? 1 : 0, 0.1);

  let indexA = floor(scrollAmount);
  let indexB = min(indexA + 1, numImages - 1);
  let lerpAmt = dragging ? dragAmt : scrollAmount - indexA;

  let imgA = activeImages[indexA];
  let imgB = activeImages[indexB];

  if (imgA && imgB) {
    drawImageFitted(imgA);
    push();
    translate(width / 2, height / 2);
    let size = getFittedSize(imgB);
    copy(
      imgB, 0, 0, int(imgB.width * lerpAmt), imgB.height,
      -size.w / 2, -size.h / 2, int(size.w * lerpAmt), size.h
    );
    pop();

    let wipeX = (width / 2 - size.w / 2) + size.w * lerpAmt;
    stroke(255);
    strokeWeight(1);
    line(wipeX, (height - size.h) / 2, wipeX, (height + size.h) / 2);
    noStroke();
    fill(255);
    ellipse(wipeX, height / 2, 8, 8);
    drawSlider(getActiveImages()); // draw the horizontal menu
    drawSliderTab();               // draw the pull tab
  }

  noStroke();
  fill(255, 180);
  textSize(width < 500 ? 14 : 20);
  textAlign(CENTER, BOTTOM);
  text(`Day ${round(scrollAmount) + 1}`, width / 2, height - (sliderAnim * sliderHeight + 50));


  drawBottomButtons();
  autoScrollThumbBar();

  if (showArrows) {
    noStroke();
    fill(255, 180);
    textSize(40);
    textAlign(LEFT, CENTER);
    text("❮", 20, height / 2);
    textAlign(RIGHT, CENTER);
    text("❯", width - 20, height / 2);
  }
}


function drawLoadingSpinner() {
  push();
  translate(width / 2, height / 2);
  noFill();
  stroke(255);
  strokeWeight(4);
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
    w = width;
    h = width / imgAspect;
  } else {
    h = height;
    w = height * imgAspect;
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


function mouseWheel(event) {
  if (!dragging && !autoplay) {
    targetScroll += event.delta * 0.01;
    targetScroll = constrain(targetScroll, 0, numImages - 1);
  }
}

function mousePressed() {
  let tabW = 120;
  let tabH = 20;
  let tabX = width / 2 - tabW / 2;
  let tabY = height - sliderAnim * sliderHeight - tabH + 1;

  // --- 1. First check for arrow click (take priority and block everything else)
  if (showArrows && mouseY > height / 2 - 40 && mouseY < height / 2 + 40) {
    if (mouseX < 60) {
      targetScroll = constrain(targetScroll - 1, 0, numImages - 1);
      dragging = false;
      return;
    }
    if (mouseX > width - 60) {
      targetScroll = constrain(targetScroll + 1, 0, numImages - 1);
      dragging = false;
      return;
    }
  }

  // --- 2. Toggle slider tab
  if (mouseX > tabX && mouseX < tabX + tabW && mouseY > tabY && mouseY < tabY + tabH) {
    sliderVisible = !sliderVisible;

    if (sliderVisible) {
      // Temporarily force sliderAnim full to allow drawing and sizing
      sliderAnim = 1;
      drawSlider(getActiveImages()); // Force layout for thumbWidth
      thumbWidth = min(60, width / 8);
      autoScrollThumbBar(); // Safe to call now
    }

    return;
  }

  // --- 3. Bottom buttons (arrow, autoplay, centered)
  let size = 32;
  let gap = 10;
  let startX = width - (size * 4 + gap * 4);
  let y = height - sliderAnim * sliderHeight - size - 10;

  let arrowX = startX;
  let playX = arrowX + size + gap;
  let centerX = playX + size + gap;
  let fullscreenX = centerX + size + gap;

  if (mouseX > arrowX && mouseX < arrowX + size && mouseY > y && mouseY < y + size) {
    showArrows = !showArrows;
    return;
  }
  if (mouseX > playX && mouseX < playX + size && mouseY > y && mouseY < y + size) {
    autoplay = !autoplay;
    return;
  }
  if (mouseX > centerX && mouseX < centerX + size && mouseY > y && mouseY < y + size) {
    centeredView = !centeredView;
    scrollAmount = targetScroll = 0;
    return;
  }

if (mouseX > fullscreenX && mouseX < fullscreenX + size && mouseY > y && mouseY < y + size) {
  let fsEl = document.documentElement;
  if (!document.fullscreenElement) {
    fsEl.requestFullscreen().catch(err => {
      console.error(`Error attempting to enable full-screen mode: ${err.message}`);
    });
  } else {
    document.exitFullscreen();
  }
  return;
}


  // --- 4. Begin dragging slider if clicked inside slider area
  if (sliderVisible && mouseY > height - sliderAnim * sliderHeight) {
    isDraggingSlider = true;
    lastDragX = mouseX;
    return;
  }

  // --- 5. Begin image drag (only if not in UI zones)
  if (mouseY < height - sliderAnim * sliderHeight - 40 && mouseY > 40) {
    dragging = true;
    updateDragAmt(mouseX);
  }
}


function mouseDragged() {
  if (dragging) updateDragAmt(mouseX);
  if (isDraggingSlider) {
    let dx = mouseX - lastDragX;
    sliderOffset += dx;
    lastDragX = mouseX;
  }
}

function mouseReleased() {
  if (dragging) {
    dragging = false;
    targetScroll = floor(scrollAmount) + dragAmt;
  }
  if (isDraggingSlider) isDraggingSlider = false;
}

function updateDragAmt(x) {
  dragAmt = constrain(x / width, 0, 1);
}

function drawSlider(imgList) {
  if (sliderAnim > 0.01) {
    noStroke();
    fill(0, 230);
    rect(0, height - sliderAnim * sliderHeight, width, sliderAnim * sliderHeight);

    thumbWidth = min(60, width / 8);
    let margin = 10;
    let x = margin + sliderOffset;
    for (let i = 0; i < imgList.length; i++) {
      let y = height - sliderAnim * sliderHeight + 10;
      let img = imgList[i];
      let thumbH = thumbWidth * (img.height / img.width);
      image(img, x + thumbWidth / 2, y + thumbH / 2, thumbWidth, thumbH);

      if (i === round(scrollAmount)) {
        stroke(255);
        strokeWeight(2);
        noFill();
        rect(x - 2, y - 2, thumbWidth + 4, thumbH + 4, 6);
      }
      x += thumbWidth + margin;
    }
  }
}

function drawSliderTab() {
  let tabW = 120;
  let tabH = 20;
  let tabX = width / 2 - tabW / 2;
  let tabY = height - sliderAnim * sliderHeight - tabH + 1;

  push();
  translate(tabX, tabY);
  noStroke();
  fill(0, 180);
  beginShape();
  vertex(0, tabH);
  vertex(0, 6);
  quadraticVertex(0, 0, 6, 0);
  vertex(tabW - 6, 0);
  quadraticVertex(tabW, 0, tabW, 6);
  vertex(tabW, tabH);
  endShape(CLOSE);

  fill(255);
  textSize(14);
  textAlign(CENTER, CENTER);
  text(sliderVisible ? "▼" : "▲", tabW / 2, tabH / 2);
  pop();
}

function drawBottomButtons() {
  let size = 32;
  let gap = 10;
  let startX = width - (size * 4 + gap * 4);
  let y = height - sliderAnim * sliderHeight - size - 10;

  // Arrows toggle button
  let arrowX = startX;
  fill(showArrows ? color(0, 255, 255) : color(0, 180));
  stroke(255);
  strokeWeight(1);
  rect(arrowX, y, size, size, 6);
  noStroke();
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(12);
  text("⇄", arrowX + size / 2, y + size / 2);
  textSize(10);
  text("Arrows", arrowX + size / 2, y - 8);

  // Autoplay button
  let playX = arrowX + size + gap;
  fill(0, 180);
  stroke(255);
  strokeWeight(1);
  rect(playX, y, size, size, 6);
  noStroke();
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(16);
  text(autoplay ? "■" : "▶", playX + size / 2, y + size / 2);
  textSize(10);
  text("Play", playX + size / 2, y - 8);

  // Centered view toggle
  let centerX = playX + size + gap;
  fill(centeredView ? color(0, 255, 255) : color(0, 180));
  stroke(255);
  strokeWeight(1);
  rect(centerX, y, size, size, 6);
  noStroke();
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(12);
  text("C", centerX + size / 2, y + size / 2);
  textSize(10);
  text("Centered", centerX + size / 2, y - 8);

  // Show/hide speed slider
  if (autoplay) {
    speedSlider.show();
  } else {
    speedSlider.hide();
  }

  // Fullscreen toggle button
let fsX = centerX + size + gap;
fill(document.fullscreenElement ? color(0, 255, 255) : color(0, 180));
stroke(255);
strokeWeight(1);
rect(fsX, y, size, size, 6);
noStroke();
fill(255);
textAlign(CENTER, CENTER);
textSize(14);
text("⛶", fsX + size / 2, y + size / 2); // fullscreen symbol
textSize(10);
text("Full", fsX + size / 2, y - 8);
}


function keyPressed() {
  if (key === "c" || key === "C") centeredView = !centeredView;

  if (keyCode === 122) { // F11 key
    let fsEl = document.documentElement;
    if (!document.fullscreenElement) {
      fsEl.requestFullscreen().catch(err => {
        console.error(`Error enabling full-screen mode: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
    return false; // prevent default F11 behavior
  }
}





