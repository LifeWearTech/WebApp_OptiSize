
let canvas, ctx;
let dpr = window.devicePixelRatio || 1;

export function createRulerCanvas() {
  canvas = document.createElement("canvas");
  canvas.id = "ruler-canvas";
  canvas.style.position = "fixed";
  canvas.style.top = "0";
  canvas.style.left = "0";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "99998";

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  document.body.appendChild(canvas);
  ctx = canvas.getContext("2d");
}

export function removeRulerCanvas() {
  if (canvas) {
    canvas.remove();
    canvas = null;
  }
}

function resizeCanvas() {
  if (!canvas) return;

  const w = window.innerWidth;
  const h = window.innerHeight;

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
}


export function drawRulerOverlay(widthIn, tiltDeg) {
  if (!ctx || !canvas) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.scale(dpr, dpr);

  const w = window.innerWidth;
  const h = window.innerHeight;

  /* ==========================================
     Colors
  ========================================== */

  const green = "#4CAF50";
  const red = "#F44336";

  const color = Math.abs(tiltDeg) > 5 ? red : green;

  ctx.strokeStyle = color;
  ctx.fillStyle = color;

  /* ==========================================
     Scale (matches Flutter)
  ========================================== */

  const referenceCircumference = 5.25;

  const scale = Math.max(
    0.1,
    Math.min(widthIn / referenceCircumference, 1.0)
  );

  const rulerWidth = w * 0.17 * scale;

  const centerX = w / 2;
  const baselineY = h * 0.60;

  const startX = centerX - rulerWidth / 2;
  const endX = centerX + rulerWidth / 2;

  /* ==========================================
     Active Size Range
  ========================================== */

  let activeIndex = 0;

  if (widthIn >= 5.0) activeIndex = 3;
  else if (widthIn >= 4.5) activeIndex = 2;
  else if (widthIn >= 4.0) activeIndex = 1;

  const ranges = [
    "[3.5-4]",
    "[4-4.5]",
    "[4.5-5]",
    "[5-5.5]"
  ];

  /* ==========================================
     Top Size Bar
  ========================================== */

  const barWidth = w * 0.70;
  const barHeight = 40;

  const barLeft = (w - barWidth) / 2;
  const barTop = h * 0.30;

  const segWidth = barWidth / ranges.length;

  ctx.textAlign = "center";

  ctx.fillStyle = "#FFF";
  ctx.font = "700 18px sans-serif";

  ctx.fillText(
    "Range (inches)",
    barLeft + barWidth / 2,
    barTop - 12
  );

  for (let i = 0; i < ranges.length; i++) {
    const x = barLeft + i * segWidth;

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

    ctx.font = "600 14px sans-serif";

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
  ctx.moveTo(startX, baselineY);
  ctx.lineTo(endX, baselineY);
  ctx.stroke();

  /* ==========================================
     End Ticks (Flutter style)
  ========================================== */

  const endHalfLen = 20;

  ctx.beginPath();
  ctx.moveTo(startX, baselineY - 40);
  ctx.lineTo(startX, baselineY + 20);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(endX, baselineY - 40);
  ctx.lineTo(endX, baselineY + 20);
  ctx.stroke();

  /* ==========================================
     Single Center Minor Tick
  ========================================== */

  const midX = (startX + endX) / 2;

  ctx.lineWidth = 3;

  ctx.beginPath();
  ctx.moveTo(midX, baselineY - 5);
  ctx.lineTo(midX, baselineY + 5);
  ctx.stroke();

  /* ==========================================
     Numeric Labels
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

  /* ==========================================
     Units Label
  ========================================== */

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

  const leftLines = [
    "Left Edge",
    "of Ankle"
  ];

  const rightLines = [
    "Right Edge",
    "of Ankle"
  ];

  const lineHeight = 18;
  const margin = 8;

  const leftWidth = Math.max(
    ...leftLines.map(line => ctx.measureText(line).width)
  );

  const rightWidth = Math.max(
    ...rightLines.map(line => ctx.measureText(line).width)
  );

  const labelBlockHeight = lineHeight * 2;
  const textY = baselineY - labelBlockHeight / 2;

  leftLines.forEach((line, i) => {
    ctx.fillText(
      line,
      startX - margin - leftWidth / 2,
      textY + i * lineHeight
    );
  });

  rightLines.forEach((line, i) => {
    ctx.fillText(
      line,
      endX + margin + rightWidth / 2,
      textY + i * lineHeight
    );
  });

  ctx.restore();
}
