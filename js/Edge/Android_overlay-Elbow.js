
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

  /* ===== Color based on tilt ===== */
  const strokeColor = Math.abs(tiltDeg) > 5 ? "red" : "lime";

  /* ===== Scale logic (unchanged) ===== */
  const reference = 7.6;
  const raw = widthIn / reference;
  const scale = Math.max(0.4, Math.min(raw, 1.0));

  /* ===== Placement ===== */
  const centerX = w / 2;
  const centerY = h * 0.60;
  const radius = (w * 0.22) * scale;

  const leftX = centerX - radius;
  const rightX = centerX + radius;

  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 4;

  /* ===== Baseline ===== */
  ctx.beginPath();
  ctx.moveTo(leftX, centerY);
  ctx.lineTo(rightX, centerY);
  ctx.stroke();

  /* ===== Arc ===== */
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, Math.PI, 0);
  ctx.stroke();

  // =========================================================
  // POLISHED: Uniform graduations with taller every 4th tick
  // =========================================================

  const totalTicks = 20;           // evenly spaced across ruler
  const shortTickHeight = 8;       // normal tick
  const longTickHeight = 15;       // every 4th tick
  const stepX = (rightX - leftX) / totalTicks;

  ctx.lineWidth = 2;

  for (let i = 0; i <= totalTicks; i++) {
    const x = leftX + i * stepX;
    const isMajorTick = i % 4 === 0;
    const tickHeight = isMajorTick ? longTickHeight : shortTickHeight;

    ctx.beginPath();
    ctx.moveTo(x, centerY - tickHeight);
    ctx.lineTo(x, centerY + tickHeight);
    ctx.stroke();
  }

  /* ===== Centered width label ===== */
  ctx.fillStyle = strokeColor;
  ctx.font = "16px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(
    `${widthIn.toFixed(1)} in`,
    centerX,
    centerY - longTickHeight -5
  );

  /* ===== Center label under arc ===== */
  ctx.font = "20px sans-serif";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Knee", centerX, centerY + radius / 2);

  /* ===== Side labels (unchanged) ===== */
  const labelLeft = ["Left", "Side", "of", "Knee"];
  const labelRight = ["Right", "Side", "of", "Knee"];

  ctx.font = "15px sans-serif";
  ctx.textAlign = "center";

  const lineHeight = 18;

  let y = centerY - ((labelLeft.length - 1) * lineHeight) / 2;
  labelLeft.forEach(line => {
    ctx.fillText(line, leftX - 15, y);
    y += lineHeight;
  });

  y = centerY - ((labelRight.length - 1) * lineHeight) / 2;
  labelRight.forEach(line => {
    ctx.fillText(line, rightX + 15, y);
    y += lineHeight;
  });

  ctx.restore();
}
