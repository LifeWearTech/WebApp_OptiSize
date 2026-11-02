let canvas, ctx;

const dpr = Math.min(window.devicePixelRatio || 1, 2);

let screenWidth = window.innerWidth;
let screenHeight = window.innerHeight;

let leftWidthCached = 0;
let rightWidthCached = 0;

const leftLines = [
  "Left Edge",
  "of Ankle"
];

const rightLines = [
  "Right Edge",
  "of Ankle"
];

const ranges = [
  "[3.5-4]",
  "[4-4.5]",
  "[4.5-5]",
  "[5-5.5]"
];

function createRulerCanvas() {

  if (canvas) return;

  canvas = document.createElement("canvas");
  canvas.id = "ruler-canvas";

  canvas.style.position = "fixed";
  canvas.style.top = "0";
  canvas.style.left = "0";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "99998";

  resizeCanvas();

  window.addEventListener(
    "resize",
    resizeCanvas
  );

  document.body.appendChild(canvas);

  ctx = canvas.getContext("2d");

  ctx.font = "700 16px sans-serif";

  leftWidthCached = Math.max(
    ctx.measureText("Left Edge").width,
    ctx.measureText("of Ankle").width
  );

  rightWidthCached = Math.max(
    ctx.measureText("Right Edge").width,
    ctx.measureText("of Ankle").width
  );
}

function removeRulerCanvas() {

  if (canvas) {
    canvas.remove();
    canvas = null;
  }

  window.removeEventListener(
    "resize",
    resizeCanvas
  );
}

function resizeCanvas() {

  if (!canvas) return;

  screenWidth = window.innerWidth;
  screenHeight = window.innerHeight;

  canvas.width = screenWidth * dpr;
  canvas.height = screenHeight * dpr;

  canvas.style.width = `${screenWidth}px`;
  canvas.style.height = `${screenHeight}px`;
}

function drawRulerOverlay(
  widthIn,
  tiltDeg
) {

  if (!ctx || !canvas) return;

  ctx.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  ctx.save();
  ctx.scale(dpr, dpr);

  const w = screenWidth;
  const h = screenHeight;

  const green = "#4CAF50";
  const red = "#F44336";

  const color =
    Math.abs(tiltDeg) >= 10
      ? green
      : red;

  /* ==========================================
     Scale
  ========================================== */

  const referenceCircumference = 5.25;

  const scale = Math.max(
    0.1,
    Math.min(
      widthIn / referenceCircumference,
      1.0
    )
  );

  const rulerWidth =
    w * 0.17 * scale;

  const centerX = w / 2;
  const baselineY = h * 0.90;

  const startX =
    centerX - rulerWidth / 2;

  const endX =
    centerX + rulerWidth / 2;

  /* ==========================================
     Active Size Range
  ========================================== */

  let activeIndex = 0;

  if (widthIn >= 5.0) {
    activeIndex = 3;
  }
  else if (widthIn >= 4.5) {
    activeIndex = 2;
  }
  else if (widthIn >= 4.0) {
    activeIndex = 1;
  }

  /* ==========================================
     Top Size Bar
  ========================================== */

  const barWidth = w * 0.70;
  const barHeight = 40;

  const barLeft =
    (w - barWidth) / 2;

  const barTop = h * 0.30;

  const segWidth =
    barWidth / ranges.length;

  ctx.textAlign = "center";

  ctx.fillStyle = "#FFF";
  ctx.font = "700 18px sans-serif";

  ctx.fillText(
    "Range (inches)",
    centerX,
    barTop - 12
  );

  for (let i = 0; i < ranges.length; i++) {

    const x =
      barLeft + i * segWidth;

    ctx.fillStyle =
      i === activeIndex
        ? green
        : "#BDBDBD";

    ctx.fillRect(
      x,
      barTop,
      segWidth,
      barHeight
    );

    ctx.strokeStyle = "#666";
    ctx.lineWidth = 1;

    ctx.strokeRect(
      x,
      barTop,
      segWidth,
      barHeight
    );

    ctx.fillStyle =
      i === activeIndex
        ? "#FFF"
        : "#000";

    ctx.font =
      "600 14px sans-serif";

    ctx.fillText(
      ranges[i],
      x + segWidth / 2,
      barTop + 25
    );
  }

  ctx.fillStyle = "#FFF";
  ctx.font = "600 20px sans-serif";

  ctx.fillText(
    `Ankle Width: ${widthIn.toFixed(1)} in`,
    centerX,
    barTop + barHeight + 30
  );

  /* ==========================================
     Main Ruler
  ========================================== */

  ctx.strokeStyle = color;
  ctx.lineWidth = 5;

  ctx.beginPath();
  ctx.moveTo(
    startX,
    baselineY
  );
  ctx.lineTo(
    endX,
    baselineY
  );
  ctx.stroke();

  /* ==========================================
     End Ticks
  ========================================== */

  ctx.beginPath();
  ctx.moveTo(
    startX,
    baselineY - 40
  );
  ctx.lineTo(
    startX,
    baselineY + 20
  );
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(
    endX,
    baselineY - 40
  );
  ctx.lineTo(
    endX,
    baselineY + 20
  );
  ctx.stroke();

  /* ==========================================
     Center Tick
  ========================================== */

  const midX =
    (startX + endX) / 2;

  ctx.lineWidth = 3;

  ctx.beginPath();
  ctx.moveTo(
    midX,
    baselineY - 5
  );
  ctx.lineTo(
    midX,
    baselineY + 5
  );
  ctx.stroke();

  /* ==========================================
     Width Labels
  ========================================== */

  ctx.fillStyle = "#FFF";
  ctx.font = "700 14px sans-serif";

  ctx.fillText(
    "0.0",
    startX,
    baselineY + 35
  );

  ctx.fillText(
    widthIn.toFixed(1),
    endX,
    baselineY + 35
  );

  ctx.font = "600 13px sans-serif";

  ctx.fillText(
    "Ankle Width (in)",
    centerX,
    baselineY + 60
  );

  /* ==========================================
     Edge Labels
  ========================================== */

  ctx.fillStyle = "#FFF";
  ctx.font = "700 16px sans-serif";

  const margin = 8;
  const lineHeight = 18;

  const leftWidth =
    leftWidthCached;

  const rightWidth =
    rightWidthCached;

  const labelBlockHeight =
    lineHeight * 2;

  const textY =
    baselineY -
    labelBlockHeight / 2;

  leftLines.forEach(
    (line, i) => {
      ctx.fillText(
        line,
        startX -
          margin -
          leftWidth / 2,
        textY +
          i * lineHeight
      );
    }
  );

  rightLines.forEach(
    (line, i) => {
      ctx.fillText(
        line,
        endX +
          margin +
          rightWidth / 2,
        textY +
          i * lineHeight
      );
    }
  );

  ctx.restore();
}

window.AnkleOverlay = {
  createRulerCanvas,
  removeRulerCanvas,
  drawRulerOverlay
};