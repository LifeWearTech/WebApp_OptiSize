
let canvas, ctx;
const dpr = Math.min(window.devicePixelRatio || 1, 2);
let screenWidth = window.innerWidth;
let screenHeight = window.innerHeight;
let leftWidthCached = 0;
let rightWidthCached = 0;
const leftLines = ["Left Edge", "of Knee"];
const rightLines = ["Right Edge", "of Knee"];
const ranges = ["[4-5]", "[5-6]", "[6-7]", "[7-8]"];  

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

  document.body.appendChild(
    canvas
  );

  ctx = canvas.getContext("2d");

  // Cache text widths once
  ctx.font = "700 16px sans-serif";

  leftWidthCached = Math.max(
    ctx.measureText("Left Edge").width,
    ctx.measureText("of Knee").width
  );

  rightWidthCached = Math.max(
    ctx.measureText("Right Edge").width,
    ctx.measureText("of Knee").width
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

function drawRulerOverlay(widthIn, tiltDeg) {

  if (!ctx || !canvas) return;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.save();
  ctx.scale(dpr, dpr);
  const w = screenWidth;
  const h = screenHeight;
  const green = "#4CAF50";
  const red = "#F44336";
  const color = Math.abs(tiltDeg) > 10 ? green : red;
  const referenceCircumference = 7.6;
  const scale = Math.max(0.4,Math.min(widthIn / referenceCircumference, 1.0));
  const rulerWidth = w * 0.44 * scale;
  const centerX = w / 2;
  const baselineY = h * 0.90;
  const startX =centerX - rulerWidth / 2;
  const endX = centerX + rulerWidth / 2;
  let activeIndex = 0;
  if (widthIn >= 7.0) { activeIndex = 3;} 
  else if (widthIn >= 6.0) {activeIndex = 2;} 
  else if (widthIn >= 5.0) {activeIndex = 1;}

  const barWidth = w * 0.70;
  const barHeight = 40;
  const barLeft = (w - barWidth) / 2;
  const barTop = h * 0.30;
  const segWidth = barWidth / ranges.length;
  ctx.textAlign = "center";
  ctx.fillStyle = "#FFF";
  ctx.font = "700 18px sans-serif";
  ctx.fillText("Range (inches)",centerX,barTop - 12);
  for (let i = 0; i < ranges.length; i++) {
    const x =barLeft + i * segWidth;
    ctx.fillStyle = i === activeIndex ? green: "#BDBDBD";
    ctx.fillRect(x,barTop,segWidth,barHeight);
    ctx.strokeStyle = "#666";
    ctx.lineWidth = 1;
    ctx.strokeRect(x,barTop,segWidth,barHeight);
    ctx.fillStyle = i === activeIndex ? "#FFF": "#000";
    ctx.font = "600 14px sans-serif";
    ctx.fillText(ranges[i],x + segWidth / 2,barTop + 25 );
  }
  ctx.fillStyle = "#FFF";
  ctx.font = "600 20px sans-serif";
  ctx.fillText(`Knee Width: ${widthIn.toFixed(1)} in`,centerX, barTop + barHeight + 30);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(startX,baselineY);
  ctx.lineTo(endX,baselineY);
  ctx.stroke();
  ctx.beginPath();
  ctx.lineWidth = 6;

  ctx.arc(centerX,baselineY,rulerWidth / 2,Math.PI, 0);
  ctx.stroke();
  const majorTickCount = 6;
  const minorTicksPerMajor = 2;
  const labelStep = 2;
  const majorTickSpacing =(endX - startX) /majorTickCount;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  for (let i = 0; i <= majorTickCount; i++ ) {
    const x =startX +i * majorTickSpacing;
    const isEndTick = i === 0 || i === majorTickCount;
    const tickHeight = isEndTick ? 20 : 10;
    ctx.beginPath();
    ctx.moveTo(x, baselineY);
    ctx.lineTo(x,baselineY + tickHeight);
    ctx.stroke();

    if (isEndTick || i % labelStep === 0) {
      ctx.fillStyle = "#FFF";
      ctx.font = "700 14px sans-serif";
      ctx.fillText(((widthIn * i) /majorTickCount).toFixed(1),x,baselineY + 35);
    }

    if (i < majorTickCount) {
      const minorSpacing =majorTickSpacing /(minorTicksPerMajor + 1);
      for (let m = 1;m <= minorTicksPerMajor; m++) {
        const mx =x +m * minorSpacing;
        ctx.beginPath();
        ctx.moveTo(mx,baselineY - 5);
        ctx.lineTo(mx,baselineY + 5);
        ctx.stroke();
      }
    }
  }
  ctx.fillStyle = "#FFF";
  ctx.font = "600 13px sans-serif";
  ctx.fillText("Knee Width (in)",centerX,baselineY + 60);
  ctx.fillStyle = color;
  ctx.font = "600 20px sans-serif";
  ctx.fillText("Knee",centerX,baselineY +rulerWidth * 0.16 -35);
  ctx.fillStyle = "#FFF";
  ctx.font = "700 16px sans-serif";
  const margin = 8;
  const lineHeight = 18;
  const leftWidth =leftWidthCached;
  const rightWidth = rightWidthCached;
  const labelBlockHeight =lineHeight * 2;
  const textY =baselineY - labelBlockHeight / 2;
  leftLines.forEach(
        (line, i) => {ctx.fillText(line,startX -margin -leftWidth / 2,textY + i * lineHeight);}
  );

  rightLines.forEach(
      (line, i) => {ctx.fillText(line,endX +margin +rightWidth / 2,textY + i * lineHeight);}
  );
  ctx.restore();
}

window.KneeOverlay = {
  createRulerCanvas,
  removeRulerCanvas,
  drawRulerOverlay
};