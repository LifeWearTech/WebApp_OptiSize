(function () {


  const exitBtn = document.getElementById("exit-ar-hard-btn");
  const recommendationBtn = document.getElementById("exit-ar-btn");

  const M_TO_IN = 39.37;
  const LOW_DIST = 25.0
  const HIGH_DIST = 51.2;

function clampDistance(d) {
  return Math.min(Math.max(d, LOW_DIST), HIGH_DIST);
}

function calculateWidth(distance) {
  const clamped = clampDistance(distance);
  return (0.1522 * clamped + 0.1957);
}

function erfUpdate(x) {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p  = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);

  const t = 1.0 / (1.0 + p * x);
  const poly = (((((a5*t + a4)*t + a3)*t + a2)*t + a1)*t);
  const y = 1.0 - poly * Math.exp(-x * x);

  return Math.min(Math.max(sign * y, -1), 1);
}

function phiUpdate(x) {
  const sqrt2 = 1.4142135623730951;
  const ax = Math.abs(x);

  if (ax < 8.0) {
    return 0.5 * (1.0 + erfUpdate(x / sqrt2));
  }

  const invSqrt2pi = 0.3989422804014327;
  const phi = invSqrt2pi * Math.exp(-0.5 * x * x);

  if (x > 0) {
    return 1.0 - phi / (ax + 1.0/(ax + 2.0/(ax + 3.0)));
  } else {
    return phi / (ax + 1.0/(ax + 2.0/(ax + 3.0)));
  }
}

function probabilityInRange(lower, upper, measuredValue, sd) {
  const tolU = 0.00 * upper;
  const tolL = 0.00 * lower;

  const adjUpper = upper - tolU;
  const adjLower = lower - tolL;

  const zLower = (adjLower - measuredValue) / sd;
  const zUpper = (adjUpper - measuredValue) / sd;

  const prob = phiUpdate(zUpper) - phiUpdate(zLower);
  return prob * 100.0;
}

function computeWeightedEstimate(probabilities, centers) {
  if (!probabilities.length ||
      !centers.length ||
      probabilities.length !== centers.length) {
    throw new Error("Probabilities and centers must match.");
  }

  const total = probabilities.reduce((a,b)=>a+b, 0);
  if (total === 0) return centers[0];

  let weighted = 0;
  for (let i = 0; i < probabilities.length; i++) {
    weighted += centers[i] * probabilities[i];
  }
  return weighted / total;
}

function computeWidthFromHeight(heightIn) {

  const est = calculateWidth(heightIn);

  const probs = [
    probabilityInRange(4.0, 5.25, est, 0.2) / 100.0,
    probabilityInRange(5.0, 6.3,  est, 0.2) / 100.0,
    probabilityInRange(6.0, 7.35, est, 0.2) / 100.0,
    probabilityInRange(7.0, 8.4,  est, 0.2) / 100.0
  ].map(p => Math.min(Math.max(p, 0), 1));

  const centers = [4.5, 5.5, 6.675, 7.7];

  const finalWidth = computeWeightedEstimate(probs, centers);

  return finalWidth;
}

let canvas, ctx;
let dpr = window.devicePixelRatio || 1;

function createRulerCanvas() {
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

function removeRulerCanvas() {
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

  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
}
function drawRulerOverlay(widthIn, tiltDeg) {
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

  const color =
    Math.abs(tiltDeg) > 10
      ? red
      : green;

  /* ==========================================
     Scale (Flutter Match)
  ========================================== */

  const referenceCircumference = 7.6;

  const scale = Math.max(
    0.4,
    Math.min(widthIn / referenceCircumference, 1.0)
  );

  const rulerWidth = w * 0.44 * scale;

  const centerX = w / 2;
  const baselineY = h * 0.70;

  const startX = centerX - rulerWidth / 2;
  const endX = centerX + rulerWidth / 2;

  /* ==========================================
     Active Range
  ========================================== */

  let activeIndex = 0;

  if (widthIn >= 7.0) activeIndex = 3;
  else if (widthIn >= 6.0) activeIndex = 2;
  else if (widthIn >= 5.0) activeIndex = 1;

  const ranges = [
    "[4-5]",
    "[5-6]",
    "[6-7]",
    "[7-8]"
  ];

  /* ==========================================
     Size Bar
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
    centerX,
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
    `Knee Width: ${widthIn.toFixed(1)} in`,
    centerX,
    barTop + barHeight + 30
  );

  /* ==========================================
     Main Ruler
  ========================================== */

  ctx.strokeStyle = color;
  ctx.lineWidth = 3;

  ctx.beginPath();
  ctx.moveTo(startX, baselineY);
  ctx.lineTo(endX, baselineY);
  ctx.stroke();

  /* ==========================================
     Arc
  ========================================== */

  ctx.beginPath();
  ctx.lineWidth = 6;

  ctx.arc(
    centerX,
    baselineY,
    rulerWidth / 2,
    Math.PI,
    0
  );

  ctx.stroke();

  /* ==========================================
     Major + Minor Ticks
  ========================================== */

  const majorTickCount = 6;
  const minorTicksPerMajor = 2;
  const labelStep = 2;

  const majorTickSpacing =
    (endX - startX) / majorTickCount;

  ctx.strokeStyle = color;
  ctx.lineWidth = 3;

  for (let i = 0; i <= majorTickCount; i++) {
    const x = startX + i * majorTickSpacing;

    const isEndTick =
      i === 0 ||
      i === majorTickCount;

    const tickHeight =
      isEndTick ? 20 : 10;

    ctx.beginPath();
    ctx.moveTo(x, baselineY);
    ctx.lineTo(x, baselineY + tickHeight);
    ctx.stroke();

    if (isEndTick || i % labelStep === 0) {
      ctx.fillStyle = "#FFF";
      ctx.font = "700 14px sans-serif";

      ctx.fillText(
        ((widthIn * i) / majorTickCount).toFixed(1),
        x,
        baselineY + 35
      );
    }

    if (i < majorTickCount) {
      const minorSpacing =
        majorTickSpacing /
        (minorTicksPerMajor + 1);

      for (let m = 1; m <= minorTicksPerMajor; m++) {
        const mx =
          x + m * minorSpacing;

        ctx.beginPath();
        ctx.moveTo(mx, baselineY - 5);
        ctx.lineTo(mx, baselineY + 5);
        ctx.stroke();
      }
    }
  }

  /* ==========================================
     Units Label
  ========================================== */

  ctx.fillStyle = "#FFF";
  ctx.font = "600 13px sans-serif";

  ctx.fillText(
    "Knee Width (in)",
    centerX,
    baselineY + 60
  );

  /* ==========================================
     Knee Label
  ========================================== */

  ctx.fillStyle = color;
  ctx.font = "600 20px sans-serif";


ctx.fillStyle = color;
ctx.font = "600 20px sans-serif";
ctx.textAlign = "center";

ctx.fillText(
  "Knee",
  centerX,
  baselineY + rulerWidth * 0.16 - 35
);


  /* ==========================================
     Edge Labels
  ========================================== */

  ctx.fillStyle = "#FFF";
  ctx.font = "700 16px sans-serif";

  const leftLines = [
    "Left Edge",
    "of Knee"
  ];

  const rightLines = [
    "Right Edge",
    "of Knee"
  ];

  const margin = 8;
  const lineHeight = 18;

  const leftWidth = Math.max(
    ...leftLines.map(line =>
      ctx.measureText(line).width
    )
  );

  const rightWidth = Math.max(
    ...rightLines.map(line =>
      ctx.measureText(line).width
    )
  );

  const labelBlockHeight =
    lineHeight * 2;

  const textY =
    baselineY - labelBlockHeight / 2;

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






  function show(t) {
    const hud = document.getElementById("hud");
    if (hud) {
      hud.style.whiteSpace = "pre-line";
      hud.textContent = t;
    }
  }

  function generateRange(start, end, step) {
    const arr = [];
    for (let v = start; v <= end + 1e-6; v += step) {
      arr.push(parseFloat(v.toFixed(5)));
    }
    return arr;
  }



function standardDeviation(values) {

  if (values.length < 5) {
    return 0;
  }

  const avg =
    values.reduce(
      (a, b) => a + b,
      0
    ) / values.length;

  const variance =
    values.reduce(
      (sum, value) =>
        sum + Math.pow(value - avg, 2),
      0
    ) / values.length;

  return Math.sqrt(
    variance
  );
}



  // ✅ CONFIG
  const X_START = 0.1;
  const X_END = 0.9;
  const X_STEP = 0.01;
  const Y_START = 0.1;
  const Y_END = 0.7;
  const Y_STEP = 0.01;

let groundSamples = [];
let calibratedGroundY = null;
let calibratedHeightIn = null;
const GROUND_CALIBRATION_FRAMES = 5;
let driftViolationCount = 0;

let TILT = {
  pitchDeg: 0,
  rollDeg: 0,
  ready: false
};


window.addEventListener(
  "deviceorientation",
  (e) => {

    if (
      e.beta == null ||
      e.gamma == null
    ) {
      return;
    }

    TILT.pitchDeg = e.beta;
    TILT.rollDeg = e.gamma;
    TILT.ready = true;
  },
  { passive: true }
);


  window.wireXR = function () {
    
  recommendationBtn.style.display = "block";
  exitBtn.style.display = "block"

    XR8.XrController.configure({
      enableWorldPoints: true
    });

    XR8.addCameraPipelineModules([
      XR8.GlTextureRenderer.pipelineModule(),
      XR8.Threejs.pipelineModule(),
      XR8.XrController.pipelineModule(),
      XRExtras.FullWindowCanvas.pipelineModule(),
      {
        name: "median-height-debug",
        onStart: function () {


          this.lastUpdate = 0;

          // ✅ generate sampling grid
          this.xs = generateRange(X_START, X_END, X_STEP);
          this.ys = generateRange(Y_START, Y_END, Y_STEP);

          // ✅ EXACT number of points
          this.totalPoints = this.xs.length * this.ys.length;
          createRulerCanvas();
        },


        onUpdate: function () {

          const now = Date.now();
          if (now - this.lastUpdate < 100) return;
          this.lastUpdate = now;

          const { camera } = XR8.Threejs.xrScene();
          const cameraY = camera.position.y;

          const xs = this.xs;
          const ys = this.ys;
          
          let txt = "";

          let frameHeightsIn = [];
          for (let xi = 0; xi < xs.length; xi++) {
            for (let yi = 0; yi < ys.length; yi++) {

              const hits = XR8.XrController.hitTest(
                xs[xi],
                ys[yi],
                ["FEATURE_POINT"]
              );

              if (!hits || hits.length === 0) continue;

              const p = hits[0].position;
              if (!p) continue;
              if (!isFinite(p.x) || !isFinite(p.y) || !isFinite(p.z)) continue;
              if (p.y >= cameraY) continue;
              const heightMeters = cameraY - p.y;
              const heightIn = heightMeters * M_TO_IN;
              frameHeightsIn.push(heightIn);

            }
          }

if (frameHeightsIn.length > 2500) {

const validHeights =frameHeightsIn.filter(h => h >= 25 && h <= 51);
const sortedHeights =validHeights.slice().sort((a, b) => a - b);
const trimCount = Math.floor(sortedHeights.length * 0.10);
const trimmedHeights = sortedHeights.slice( trimCount, sortedHeights.length - trimCount);
const medianHeight = trimmedHeights[Math.floor(trimmedHeights.length / 2)];
const filteredHeights =  trimmedHeights.filter(h => Math.abs(h - medianHeight) <= 6);

if (filteredHeights.length >  1500) {
const avgHeight =  filteredHeights.reduce((a, b) => a + b, 0) / filteredHeights.length;
const sdHeight =  standardDeviation(filteredHeights);
   
if (sdHeight > 2.5) {
  txt =
    `Unstable Tracking\n` +
    `SD: ${sdHeight.toFixed(2)} in`;

  show(txt);
  return;
}


// ==================================
// Initial Floor Calibration
// ==================================

if (calibratedGroundY === null) {

  const inferredGroundY =  cameraY - (avgHeight / M_TO_IN);
  groundSamples.push(inferredGroundY);
  if (
    groundSamples.length >= GROUND_CALIBRATION_FRAMES) {
    calibratedGroundY = groundSamples.reduce((a, b) => a + b, 0 ) / groundSamples.length;
    calibratedHeightIn = (cameraY - calibratedGroundY) * M_TO_IN;
    groundSamples = [];
  }

} else {

  // ===============================
  // Tracking Quality Check
  // ===============================

  const inferredGroundY = cameraY -(avgHeight / M_TO_IN);
  const stableHeightIn = (cameraY - calibratedGroundY) *  M_TO_IN;
  const groundDriftIn = Math.abs(inferredGroundY -calibratedGroundY) * M_TO_IN;
  const heightDriftIn = Math.abs(stableHeightIn -calibratedHeightIn);
  
  const widthIn =   computeWidthFromHeight(stableHeightIn);
  drawRulerOverlay(widthIn,TILT.pitchDeg);
  
const heightOk =
  stableHeightIn >= 25 &&
  stableHeightIn <= 51;

const tiltOk =
  TILT.ready &&
  Math.abs(TILT.pitchDeg) < 10;

const buttonEnabled =
  heightOk &&
  tiltOk &&
  widthIn > 4.0 &&
  widthIn < 8.0;

recommendationBtn.disabled =
  !buttonEnabled;

recommendationBtn.style.opacity =
  buttonEnabled ? "1" : "0.5";

recommendationBtn.style.pointerEvents =
  buttonEnabled ? "auto" : "none";
 


if (heightDriftIn > 20 || groundDriftIn > 5) {
  driftViolationCount++;
} else {
  driftViolationCount = 0;
}
  
if (driftViolationCount >=5) {
  calibratedGroundY = null;
  calibratedHeightIn = null;
  groundSamples = [];
  driftViolationCount = 0;
  
  return;

}

  txt =
  `Avg Height: ${stableHeightIn.toFixed(2)} in\n` +
  `SD: ${sdHeight.toFixed(2)} in\n` +
  `Ground Drift: ${groundDriftIn.toFixed(2)} in\n` +
  `Height Drift: ${heightDriftIn.toFixed(2)} in\n` +
  `Count: ${filteredHeights.length}`


}
  }

} else {

  txt =
    "Collecting Samples...";
}

          show(txt);
        }
      }

    ]);
  };


exitBtn.onclick = () => {

  recommendationBtn.style.display = "none";
  exitBtn.style.display = "none";

  try {
    removeRulerCanvas();
    XR8.stop();
  } catch {}

  location.reload();
};


})();
