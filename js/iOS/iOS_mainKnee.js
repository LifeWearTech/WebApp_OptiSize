(function () {


const exitBtn = document.getElementById("exit-ar-hard-btn");
const recommendationBtn = document.getElementById("exit-ar-btn");
const M_TO_IN = 39.37;

const LOW_DIST = 25.0;
const HIGH_DIST = 51.2;

// ====================================================
// OVERLAY
// ====================================================

let canvas, ctx;

const dpr = Math.min(window.devicePixelRatio || 1, 2);

let screenWidth = window.innerWidth;
let screenHeight = window.innerHeight;

let leftWidthCached = 0;
let rightWidthCached = 0;

const leftLines = ["Left Edge", "of Knee"];
const rightLines = ["Right Edge", "of Knee"];

const ranges = ["[4-5]", "[5-6]", "[6-7]", "[7-8]"];

const centers = [
  4.5,
  5.5,
  6.675,
  7.7
];

// ====================================================
// ORIENTATION
// ====================================================

const TILT = {
  pitchDeg: 0,
  rollDeg: 0
};

// ====================================================
// TRACKING
// ====================================================

let trackingStable = false;
let previousCameraYIn = null;
let baselineHeightIn = null;

const MOVEMENT_BUFFER_SIZE = 25;

const deltaYBuffer = [];
const rateBuffer = [];
const smoothedRateBuffer = [];
let sustainedMotionFrames = 0;
const SUSTAINED_MOTION_FRAMES = 10;
const SUSTAINED_RATE_THRESHOLD = 0.02;
let biasEstimate = 0;
const BIAS_ALPHA = 0.01;
let startupCameraYIn = null;

// ====================================================
// UI
// ====================================================

let currentHudKey = "";

let recommendationEnabled = false;

let cachedWidthIn = 6.0;

let lastWidthHeightIn = null;
let lastDrawnWidth = -1;
let lastTiltGood = null;
const rawDeltaBuffer = [];
const smoothedDeltaBuffer = [];
let lastUpdateTimeMs = null;

let totalOffsetIn = 0;

// ====================================================
// XR
// ====================================================

let xrCamera = null;

// ====================================================
// HUD COLORS
// ====================================================

const HUD_COLORS = {
  INFO: "#1565C0",
  SUCCESS: "#2E7D32",
  WARNING: "#EF6C00",
  ERROR: "#C62828"
};



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
  const finalWidth = computeWeightedEstimate(probs, centers);
  return finalWidth;
}

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
  const color = Math.abs(tiltDeg) > 10 ? red : green;
  const referenceCircumference = 7.6;
  const scale = Math.max(0.4,Math.min(widthIn / referenceCircumference, 1.0));
  const rulerWidth = w * 0.44 * scale;
  const centerX = w / 2;
  const baselineY = h * 0.70;
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

  function show(t) {
    const hud = document.getElementById("hud");
    if (hud) {
      hud.style.whiteSpace = "pre-line";
      hud.textContent = t;
    }
  }



function showOnce(message,bgColor = "#1E1E1E",textColor = "#FFFFFF") {

  const key =`${message}|${bgColor}|${textColor}`;

  if (key === currentHudKey) {
    return;
  }
  currentHudKey = key;

  show(message,bgColor,textColor);
}

function stopAR() {
  try {
    removeRulerCanvas();
    startupCameraYIn = null;
    XR8.stop();
  } catch (e) {
    console.error(e);
  }



  updateRecommendationButton(false);
}
window.addEventListener(
  "deviceorientation",
  (e) => {
    if (e.beta == null || e.gamma == null) {
      return;
    }
    TILT.pitchDeg = e.beta;
    TILT.rollDeg = e.gamma;
  },
  { passive: true }
);


function updateRecommendationButton(enabled) {
  const btn = document.getElementById("exit-ar-btn");
  if (!btn) return;
  btn.disabled = !enabled;
  btn.style.opacity = enabled ? "1.0" : "0.5";
  btn.style.pointerEvents = enabled ? "auto" : "none";
}

window.wireXR = function () {
  recommendationBtn.style.display = "block";
  exitBtn.style.display = "block";

XR8.XrController.configure({
  enableWorldPoints: true,
  enableLighting: false,
  scale: 'relative'
});

  XR8.addCameraPipelineModules([
    XR8.GlTextureRenderer.pipelineModule(),
    XR8.Threejs.pipelineModule(),
    XR8.XrController.pipelineModule(),
    XRExtras.FullWindowCanvas.pipelineModule(),
 
    {
      name: "median-height-debug",
      onStart: function () {
        xrCamera = XR8.Threejs.xrScene().camera;
        createRulerCanvas();
      },

onUpdate: function () {

  if (!xrCamera) {return;}

  const cameraY = xrCamera.position.y;
  if (!Number.isFinite(cameraY)) {return;}
  const currentCameraYIn = cameraY * M_TO_IN;
  if (!Number.isFinite(currentCameraYIn)) {return;}

  // --------------------------------------------------
  // INITIALIZATION
  // --------------------------------------------------

  if (startupCameraYIn === null) {
    startupCameraYIn = currentCameraYIn;
    previousCameraYIn = currentCameraYIn;
    lastUpdateTimeMs = performance.now();
    baselineHeightIn = 38;
    return;
  }

  // --------------------------------------------------
  // STARTUP STABILIZATION
  // --------------------------------------------------

  if (!trackingStable) {
    deltaYBuffer.push(currentCameraYIn);
    if (deltaYBuffer.length > MOVEMENT_BUFFER_SIZE) {
      deltaYBuffer.shift();
    }
    const progress = Math.min(100, Math.round((deltaYBuffer.length /MOVEMENT_BUFFER_SIZE) * 100)
    );

    showOnce(
      `🔵 Preparing Measurement\nHold phone steady (${progress}%)`,
      HUD_COLORS.INFO
    );

    if (deltaYBuffer.length >= MOVEMENT_BUFFER_SIZE) {
      trackingStable = true;
      startupCameraYIn = currentCameraYIn;
      previousCameraYIn = currentCameraYIn;
      lastUpdateTimeMs = performance.now();
      rawDeltaBuffer.length = 0;
      smoothedDeltaBuffer.length = 0;
      totalOffsetIn = 0;
      baselineHeightIn = 38;
      showOnce(
        "✅ Ready To Measure",
        HUD_COLORS.SUCCESS
      );
    }

    return;
  }

  // --------------------------------------------------
  // DELTA TIME
  // --------------------------------------------------

  const nowMs = performance.now();
  let dt =  (nowMs - lastUpdateTimeMs) / 1000;
  lastUpdateTimeMs = nowMs;
  if (!Number.isFinite(dt) ||  dt <= 0 || dt > 0.25 ) {
    dt = 1 / 60;
  }

  // --------------------------------------------------
  // POSITION DELTA
  // --------------------------------------------------

  let deltaY = currentCameraYIn - previousCameraYIn;
  previousCameraYIn = currentCameraYIn;

  // Reject tracking spikes

  if (Math.abs(deltaY) > 0.3 || Math.abs(deltaY)<.005) {return;}
  // Convert to inches/sec
  const deltaRate = deltaY / dt;

  // --------------------------------------------------
  // RAW BUFFER
  // --------------------------------------------------

  rawDeltaBuffer.push(deltaRate);

  if (rawDeltaBuffer.length > 20) {rawDeltaBuffer.shift();}

  let avgRate = 0;
  for (let i = 0; i < rawDeltaBuffer.length; i++) {
    avgRate += rawDeltaBuffer[i];
  }
  avgRate /= rawDeltaBuffer.length;

  // --------------------------------------------------
  // SMOOTHED BUFFER
  // --------------------------------------------------

  smoothedDeltaBuffer.push(avgRate);

  if (smoothedDeltaBuffer.length > 25) {
    smoothedDeltaBuffer.shift();
  }

  let smoothedRate = 0;
  for (let i = 0; i < smoothedDeltaBuffer.length; i++) {
    smoothedRate += smoothedDeltaBuffer[i];
  }
  smoothedRate /= smoothedDeltaBuffer.length;

  // --------------------------------------------------
  // DEADBAND
  // --------------------------------------------------

 // if (Math.abs(smoothedRate) < 0.01) {smoothedRate = 0;}

  let minValue = Infinity;
  let maxValue = -Infinity;

  for (let i = 0; i < smoothedDeltaBuffer.length; i++) {
  const v = smoothedDeltaBuffer[i];
  if (v < minValue) {
    minValue = v;
  }
  if (v > maxValue) {
    maxValue = v;
  }
 }

const signalRange =  maxValue - minValue;
const recent =  smoothedDeltaBuffer.slice(-10);
const allPositive =  recent.every(v => v > 0);
const allNegative =  recent.every(v => v < 0);
const consistentDirection =  allPositive || allNegative;
const phoneMoving =  signalRange > 0.5 &&  consistentDirection;

  // --------------------------------------------------
  // FRAME-RATE-INDEPENDENT INTEGRATION
  // --------------------------------------------------

if (phoneMoving) {
  totalOffsetIn += smoothedRate * dt;
  baselineHeightIn = 38 + totalOffsetIn;
}


  baselineHeightIn = Math.max(LOW_DIST,Math.min(HIGH_DIST,baselineHeightIn));
  // --------------------------------------------------
  // WIDTH UPDATE
  // --------------------------------------------------


    cachedWidthIn =computeWidthFromHeight(baselineHeightIn);
    lastWidthHeightIn = baselineHeightIn;


  // --------------------------------------------------
  // UI STATE
  // --------------------------------------------------

  const tiltGood = Math.abs(TILT.pitchDeg) <= 10;
  const shouldEnable =trackingStable && tiltGood;
  if (shouldEnable !== recommendationEnabled) {
    recommendationEnabled = shouldEnable;
    updateRecommendationButton(shouldEnable );
  }

  // --------------------------------------------------
  // STATUS
  // --------------------------------------------------

  if (!tiltGood) {

    showOnce(
      "⚠️ Phone Tilted\nHold Flat until the ruler turns green",
      HUD_COLORS.ERROR
    );

  } else if (
    baselineHeightIn > HIGH_DIST
  ) {

    showOnce(
      "⚠️ Phone Too High\nMove the phone closer to your knee",
      HUD_COLORS.WARNING
    );

  } else if (
    baselineHeightIn < LOW_DIST
  ) {

    showOnce(
      "⚠️ Phone Too Low\nRaise the phone slightly",
      HUD_COLORS.WARNING
    );

  } else {

    showOnce(
      "✅ Ready to Measure\n" +
      `Height: ${baselineHeightIn.toFixed(1)} in\n` +
      `Offset: ${totalOffsetIn.toFixed(2)} in\n` +
      `Rate: ${smoothedRate.toFixed(3)} in/s\n` +
      "Align the ruler with the left and right edges of your knee\n" +
      "Then tap Product Recommendation",
      HUD_COLORS.SUCCESS
    );
  }

  // --------------------------------------------------
  // DRAW
  // --------------------------------------------------

  const widthChanged =Math.abs(cachedWidthIn - lastDrawnWidth) > 0.1;
  const tiltChanged = tiltGood !==  lastTiltGood;

  if (widthChanged || tiltChanged) {
    drawRulerOverlay(cachedWidthIn,TILT.pitchDeg);
    lastDrawnWidth =  cachedWidthIn;
    lastTiltGood =  tiltGood;
  }
}
    }
  ]);
};


exitBtn.onclick = () => {
  stopAR();
  location.reload();
};

recommendationBtn.onclick = () => {

  const widthIn = cachedWidthIn;

  stopAR();

  const params = new URLSearchParams(window.location.search);

  const type = params.get("p") || "Knee";
  const productId = params.get("prod") || "";

  window.location.href =
    `/pages/iOS/iOS_results.html` +
    `?width=${encodeURIComponent(widthIn)}` +
    `&type=${encodeURIComponent(type)}` +
    `&prod=${encodeURIComponent(productId)}`;
};

})();
