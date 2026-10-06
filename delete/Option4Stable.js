(function () {


  const exitBtn = document.getElementById("exit-ar-hard-btn");
  const recommendationBtn = document.getElementById("exit-ar-btn");

  const M_TO_IN = 39.37;
  const LOW_DIST = 25.0
  const HIGH_DIST = 51.2;

  let leftWidthCached = 0;
  let rightWidthCached = 0;
  let canvas, ctx;
  let dpr = window.devicePixelRatio || 1;
  const leftLines = ["Left Edge","of Knee"];
  const rightLines = ["Right Edge","of Knee"];
  const ranges = ["[4-5]","[5-6]","[6-7]","[7-8]"];


  const MAX_SD = 0.16;
  const MIN_SD = 0.08; // 0.01 in
    // ✅ CONFIG
  const X_START = 0.2;
  const X_END = 0.8;
  const X_STEP = 0.02;
  const Y_START = 0.1;
  const Y_END = 0.6;
  const Y_STEP = 0.02;
  let groundSamples = [];
  let calibratedHeightIn = null;
  const GROUND_CALIBRATION_FRAMES = 10;
  let cameraYBuffer = [];
  let TILT = {pitchDeg: 0,rollDeg: 0, ready: false};
  let currentHudMessage = "";
  let currentHeightIn = null;

  const HEIGHT_SMOOTH_WINDOW = 3;
  let lastSampleTime = 0;
  let previousCameraYIn = null;
  let integratedCameraYDeltaIn = 0;
  let rejectedDeltaCount = 0;
  let trackingStable = false;
  let stableFrameCount = 0;
  const REQUIRED_STABLE_FRAMES = 50;
  let consecutiveRejectedCount = 0;
  let maxRejectedStreak = 0;
  let lastDrawnWidthIn = null;
  let motionScore = 0;



const WINDOW_SIZE = 5;
const DEBOUNCE_DELAY = 75;
let phoneIsMoving = false;
let stateTimeout = null;
let currentPendingState = null;

// Motion detection
const MOTION_MULTIPLIER = 3.0;     // Start with 2.0
const BASELINE_ALPHA = 0.001;      // Very slow baseline
let varianceBaseline = null;
let currentVariance = 0;
let currentThreshold = 0;
const MOTION_THRESHOLD = 0.05; // tune 0.03 - 0.10
let accelerationBaseline = null;
let smoothedAccelerationHistory = [];
const ACCEL_WINDOW_SIZE = 50;      // smoothing
const VAR_WINDOW_SIZE = 5;         // variance window
const VAR_MULTIPLIER = 1.2;        // 20% increase
const VAR_BASELINE_ALPHA = 0.01;   // slow adaptation
let previousPitch = null;
let previousRoll = null;
let pitchHistory = [];
let rollHistory = [];
let avgPitchDelta = 0;
let avgRollDelta = 0;


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

  const w = window.innerWidth;
  const h = window.innerHeight;

  canvas.width = w * dpr;
  canvas.height = h * dpr;

  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
}

function drawRulerOverlay(widthIn, tiltDeg) {

  if (!ctx || !canvas) return;

  ctx.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  ctx.save();
  ctx.scale(dpr, dpr);

  const w = window.innerWidth;
  const h = window.innerHeight;

  const green = "#4CAF50";
  const red = "#F44336";

  const color =
    Math.abs(tiltDeg) > 10
      ? red
      : green;

  const referenceCircumference = 7.6;

  const scale = Math.max(
    0.4,
    Math.min(widthIn / referenceCircumference, 1.0)
  );

  const rulerWidth =
    w * 0.44 * scale;

  const centerX = w / 2;
  const baselineY = h * 0.70;

  const startX =
    centerX - rulerWidth / 2;

  const endX =
    centerX + rulerWidth / 2;

  let activeIndex = 0;

  if (widthIn >= 7.0) {
    activeIndex = 3;
  } else if (widthIn >= 6.0) {
    activeIndex = 2;
  } else if (widthIn >= 5.0) {
    activeIndex = 1;
  }

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

  ctx.strokeStyle = color;
  ctx.lineWidth = 3;

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

  const majorTickCount = 6;
  const minorTicksPerMajor = 2;
  const labelStep = 2;

  const majorTickSpacing =
    (endX - startX) /
    majorTickCount;

  ctx.strokeStyle = color;
  ctx.lineWidth = 3;

  for (
    let i = 0;
    i <= majorTickCount;
    i++
  ) {

    const x =
      startX +
      i * majorTickSpacing;

    const isEndTick =
      i === 0 ||
      i === majorTickCount;

    const tickHeight =
      isEndTick ? 20 : 10;

    ctx.beginPath();

    ctx.moveTo(
      x,
      baselineY
    );

    ctx.lineTo(
      x,
      baselineY + tickHeight
    );

    ctx.stroke();

    if (
      isEndTick ||
      i % labelStep === 0
    ) {

      ctx.fillStyle = "#FFF";
      ctx.font = "700 14px sans-serif";

      ctx.fillText(
        (
          (widthIn * i) /
          majorTickCount
        ).toFixed(1),
        x,
        baselineY + 35
      );
    }

    if (i < majorTickCount) {

      const minorSpacing =
        majorTickSpacing /
        (minorTicksPerMajor + 1);

      for (
        let m = 1;
        m <= minorTicksPerMajor;
        m++
      ) {

        const mx =
          x +
          m * minorSpacing;

        ctx.beginPath();

        ctx.moveTo(
          mx,
          baselineY - 5
        );

        ctx.lineTo(
          mx,
          baselineY + 5
        );

        ctx.stroke();
      }
    }
  }

  ctx.fillStyle = "#FFF";
  ctx.font = "600 13px sans-serif";

  ctx.fillText(
    "Knee Width (in)",
    centerX,
    baselineY + 60
  );

  ctx.fillStyle = color;
  ctx.font = "600 20px sans-serif";

  ctx.fillText(
    "Knee",
    centerX,
    baselineY +
      rulerWidth * 0.16 -
      35
  );

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

  function show(t) {
    const hud = document.getElementById("hud");
    if (hud) {
      hud.style.whiteSpace = "pre-line";
      hud.textContent = t;
    }
  }

  function showOnce(msg) {
  if (msg === currentHudMessage) {
    return;
  }
  currentHudMessage = msg;
  show(msg);
}

  function generateRange(start, end, step) {
    const arr = [];
    for (let v = start; v <= end + 1e-6; v += step) {
      arr.push(parseFloat(v.toFixed(5)));
    }
    return arr;
  }

  function stopAR() {
    try {
      removeRulerCanvas();
      XR8.stop();
      trackingStable = false;
      stableFrameCount = 0;
      previousCameraYIn = null;
      integratedCameraYDeltaIn = 0;
      rejectedDeltaCount = 0;
      consecutiveRejectedCount = 0;
      maxRejectedStreak = 0;
      phoneIsMoving = false;
      accelerationHistory = [];
      lastDrawnWidthIn = null;
      lastOverlayDrawTime = 0;
    } catch (e) {
      console.error(e);
    }
    
    baselineEstablished = false;
    integratedShiftIn = 0;
    runningDeltaCount = 0;
    runningDeltaMean = 0;
    runningDeltaM2 = 0;
    cameraYBuffer = [];
    groundSamples = [];
    baselineCameraYIn = 0;
    calibratedHeightIn = null;
    currentHudMessage = "";
    currentSD = 0;
    currentUCL = 0;
  }

function processSensorData() {

  let motionEvidence = 0;

  const pitchTrigger = avgPitchDelta >= 0.04;
  const rollTrigger = avgRollDelta >= 0.04;

  if (pitchTrigger) motionEvidence++;
  if (rollTrigger) motionEvidence++;

  // Bonus point when both are active
  if (pitchTrigger && rollTrigger) {
    motionEvidence++;
  }

  if (motionEvidence > 0) {motionScore = Math.min(motionScore + 1,10);
  } else {
    motionScore = Math.max(motionScore - 0.5,0);
  }

  debounceStateTransition(motionScore >= 3);
}


function evaluateMotionVariance(history) {

  currentVariance =
    computeVariance(history);

  // Initialize baseline
  if (varianceBaseline === null) {
    varianceBaseline = currentVariance;
    currentThreshold = currentVariance * MOTION_MULTIPLIER;
    return false;
  }

  currentThreshold =
    varianceBaseline * MOTION_MULTIPLIER;

  const moving =
    currentVariance > currentThreshold;

  // Only learn baseline when still
  if (!moving) {

    varianceBaseline =
      varianceBaseline * (1 - BASELINE_ALPHA) +
      currentVariance * BASELINE_ALPHA;
  }

  return moving;
}



function computeVariance(history) {

  const mean =
    history.reduce((a, b) => a + b, 0) /
    history.length;

  return history.reduce(
    (sum, v) => sum + (v - mean) ** 2,
    0
  ) / history.length;
}

function debounceStateTransition(isMovingNow) {

  if (isMovingNow === currentPendingState) {
    return;
  }

  currentPendingState = isMovingNow;

  if (stateTimeout) {
    clearTimeout(stateTimeout);
  }

  stateTimeout = setTimeout(() => {
    phoneIsMoving = isMovingNow;
  }, DEBOUNCE_DELAY);
}


window.addEventListener(
  "deviceorientation",
  (e) => {
    if (e.beta == null || e.gamma == null) {
      return;
    }

    if (previousPitch !== null) {pitchHistory.push(Math.abs(e.beta - previousPitch));
    if (pitchHistory.length > 10) { pitchHistory.shift();}
    avgPitchDelta = pitchHistory.reduce((a, b) => a + b, 0) /pitchHistory.length;}

    if (previousRoll !== null) {
      rollHistory.push(Math.abs(e.gamma - previousRoll));
      if (rollHistory.length > 10) {rollHistory.shift();}
      avgRollDelta =rollHistory.reduce((a, b) => a + b, 0) /rollHistory.length;}
    previousPitch = e.beta;
    previousRoll = e.gamma;

    // Actual orientation for overlay logic
    TILT.pitchDeg = e.beta;
    TILT.rollDeg = e.gamma;
    TILT.ready = true;
  },
  { passive: true }
);

window.addEventListener('devicemotion', processSensorData);

function updateRecommendationButton(enabled) {
  const btn = document.getElementById("exit-ar-btn");
  if (!btn) return;
  btn.disabled = !enabled;
  btn.style.opacity = enabled ? "1.0" : "0.5";
  btn.style.pointerEvents = enabled ? "auto" : "none";
}

function drawCameraYGraph() {

  if (!ctx || !canvas) return;
  if (smoothedAccelerationHistory.length < 2) return;

  ctx.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  ctx.save();
  ctx.scale(dpr, dpr);

  const w = window.innerWidth;

  const graphWidth = w * 0.85;
  const graphHeight = 250;
  const graphLeft = w * 0.075;
  const graphTop = 50;

  const minY = Math.min(...smoothedAccelerationHistory);
  const maxY = Math.max(...smoothedAccelerationHistory);

  const range = Math.max(
    maxY - minY,
    0.001
  );

  // Border
  ctx.strokeStyle = "#777";
  ctx.lineWidth = 1;

  ctx.strokeRect(
    graphLeft,
    graphTop,
    graphWidth,
    graphHeight
  );

  // Center line
  ctx.strokeStyle = "#444";
  ctx.beginPath();
  ctx.moveTo(
    graphLeft,
    graphTop + graphHeight / 2
  );
  ctx.lineTo(
    graphLeft + graphWidth,
    graphTop + graphHeight / 2
  );
  ctx.stroke();

  // Smoothed acceleration line
  ctx.strokeStyle = "#00FF00";
  ctx.lineWidth = 2;
  ctx.beginPath();

  smoothedAccelerationHistory.forEach((v, i) => {

    const x =
      graphLeft +
      (i / (smoothedAccelerationHistory.length - 1)) *
      graphWidth;

    const y =
      graphTop +
      graphHeight -
      ((v - minY) / range) *
      graphHeight;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.stroke();

  // Points
  smoothedAccelerationHistory.forEach((v, i) => {

    const x =
      graphLeft +
      (i / (smoothedAccelerationHistory.length - 1)) *
      graphWidth;

    const y =
      graphTop +
      graphHeight -
      ((v - minY) / range) *
      graphHeight;

    let color = "#00FF00";

    if (i > 0) {

      const delta = Math.abs(
        smoothedAccelerationHistory[i] -
        smoothedAccelerationHistory[i - 1]
      );

      if (delta > MOTION_THRESHOLD) {
        color = "#FF3333";
      }
      else if (delta > MOTION_THRESHOLD * 0.5) {
        color = "#FFFF00";
      }
    }

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(
      x,
      y,
      3,
      0,
      Math.PI * 2
    );
    ctx.fill();
  });

  // Highlight latest sample
  const latest =
    smoothedAccelerationHistory[
      smoothedAccelerationHistory.length - 1
    ];

  const latestX =
    graphLeft + graphWidth;

  const latestY =
    graphTop +
    graphHeight -
    ((latest - minY) / range) *
    graphHeight;

  ctx.fillStyle = "#00FFFF";
  ctx.beginPath();
  ctx.arc(
    latestX,
    latestY,
    7,
    0,
    Math.PI * 2
  );
  ctx.fill();

  // Stats
  const accelDelta =
    accelerationBaseline === null
      ? 0
      : latest - accelerationBaseline;

  ctx.fillStyle = "#FFF";
  ctx.font = "16px monospace";

  ctx.fillText(
    `Smooth: ${latest.toFixed(4)}`,
    graphLeft,
    graphTop + graphHeight + 25
  );

  ctx.fillText(
    `Baseline: ${
      accelerationBaseline
        ? accelerationBaseline.toFixed(4)
        : '--'
    }`,
    graphLeft + 240,
    graphTop + graphHeight + 25
  );

  ctx.fillText(
    `Delta: ${accelDelta.toFixed(4)}`,
    graphLeft + 500,
    graphTop + graphHeight + 25
  );

  ctx.fillText(
    `Moving: ${phoneIsMoving}`,
    graphLeft,
    graphTop + graphHeight + 50
  );

  ctx.restore();
}

window.wireXR = function () {

  recommendationBtn.style.display = "block";
  exitBtn.style.display = "block";

XR8.XrController.configure({
  enableWorldPoints: true,
  enableLighting: false,
  scale: 'responsive'
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
        this.xs = generateRange(X_START,X_END,X_STEP);
        this.ys = generateRange(Y_START,Y_END, Y_STEP);
        this.xLen = this.xs.length;
        this.yLen = this.ys.length;
        this.totalPoints = this.xLen * this.yLen;
        createRulerCanvas();
      },

onUpdate: function () {
  const { camera } =
  XR8.Threejs.xrScene();
  const cameraY =camera.position.y;
if (calibratedHeightIn !== null) {

  const now = performance.now();

  if (now - lastSampleTime < 60) {
    drawCameraYGraph();
    return;
  }

  lastSampleTime = now;

  const currentCameraYIn = cameraY * M_TO_IN;

  // First sample
  if (previousCameraYIn === null) {
    previousCameraYIn = currentCameraYIn;
    return;
  }

  // =====================================
  // STARTUP STABILIZATION
  // =====================================

  if (!trackingStable) {

    const percentDelta =
      Math.abs((currentCameraYIn - previousCameraYIn) / previousCameraYIn ) * 100;
    latestCameraYPercentDelta = percentDelta;
    // Require consecutive stable frames
    if (percentDelta <= 0.5) {
      stableFrameCount++;
    } else {
      stableFrameCount = 0;
    }

    previousCameraYIn = currentCameraYIn;

    if (stableFrameCount >= REQUIRED_STABLE_FRAMES) {

      trackingStable = true;

      integratedCameraYDeltaIn = 0;
      rejectedDeltaCount = 0;
      consecutiveRejectedCount = 0;
      maxRejectedStreak = 0;

      show("Tracking Stable");

      return;
    }

    show(
      `Stabilizing Tracking...\n` +
      `${stableFrameCount}/${REQUIRED_STABLE_FRAMES}\n` +
      `Δ%: ${percentDelta.toFixed(3)}`
    );

    drawCameraYGraph();
    return;
  }

  // =====================================
  // NORMAL PROCESSING
  // =====================================
const percentDelta = (currentCameraYIn - previousCameraYIn) / previousCameraYIn;
const percentDeltaAbs = Math.abs(percentDelta) * 100;
latestCameraYPercentDelta = percentDeltaAbs;
// Reject anything larger than 1.0%
const validFrame = percentDeltaAbs <= 1.0 && !phoneIsMoving;

if (validFrame) {

  const deltaShiftIn = calibratedHeightIn * percentDelta;
  integratedCameraYDeltaIn += deltaShiftIn;
  consecutiveRejectedCount = 0;
} else {
  rejectedDeltaCount++;
  consecutiveRejectedCount++;
  maxRejectedStreak = Math.max(maxRejectedStreak,consecutiveRejectedCount);
}

previousCameraYIn = currentCameraYIn;
const estimatedHeightIn =  calibratedHeightIn + integratedCameraYDeltaIn;
cameraYBuffer.push(currentCameraYIn);
if (cameraYBuffer.length > 50) {
  cameraYBuffer.shift();
}

show(
  `Moving: ${phoneIsMoving}\n` +
  `Score: ${motionScore.toFixed(1)}\n` +
  `Pitch Δ: ${avgPitchDelta.toFixed(3)}° [${
    avgPitchDelta >= 0.04 ? "ON" : "OFF"
  }]\n` +
  `Roll Δ: ${avgRollDelta.toFixed(3)}° [${
    avgRollDelta >= 0.04 ? "ON" : "OFF"
  }]\n` +
  `Pitch: ${TILT.pitchDeg.toFixed(2)}°\n` +
  `Roll: ${TILT.rollDeg.toFixed(2)}°`
);
drawCameraYGraph();

// Update calculations every frame
updatedHeightIn = estimatedHeightIn;
const widthIn = computeWidthFromHeight(updatedHeightIn);
const tiltOk = TILT.ready && Math.abs(TILT.pitchDeg) < 10;

  const widthChanged =  lastDrawnWidthIn === null || Math.abs(widthIn - lastDrawnWidthIn) >= 0.1;

  if (widthChanged) {
    //drawRulerOverlay(widthIn, TILT.pitchDeg);
    lastDrawnWidthIn = widthIn;
  }

  return;
}
  // =====================================
  // CALIBRATION MODE
  // =====================================

  const xs = this.xs;
  const ys = this.ys;

  const frameHeightsIn = [];

  for (let xi = 0; xi < this.xLen; xi++) {

    const x = xs[xi];

    for (let yi = 0; yi < this.yLen; yi++ ) {
      const hits =XR8.XrController.hitTest(x,ys[yi],["FEATURE_POINT"]);
      if (!hits ||  hits.length === 0) continue;
      const p = hits[0].position;
      if (!p) continue;
      if (!isFinite(p.x) || !isFinite(p.y) || !isFinite(p.z)) continue;
      if (p.y < 0 || p.y >= cameraY) continue;
      frameHeightsIn.push((cameraY - p.y) * M_TO_IN );
    }
  }

  const validHeights =frameHeightsIn.filter( h => h >= 20 && h <= 40 );
  if (validHeights.length > 0) {
    const avgHeight = validHeights.reduce((a, b) => a + b,0) / validHeights.length;
    groundSamples.push(avgHeight);

    showOnce(
      "Preparing Measurement...\n" +
      "Please slowly move your phone around."
    );
    if (
      groundSamples.length >= GROUND_CALIBRATION_FRAMES
    ) {
      const avgHeightIn =  groundSamples.reduce((a, b) => a + b, 0) / groundSamples.length;

      calibratedHeightIn = Math.min(44,Math.max(36, avgHeightIn));
      cameraYBuffer =[]
      groundSamples = [];
    }

  } else {

    showOnce(
      "Preparing Measurement...\n" +
      "Please point your phone toward the floor."
    );
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

  stopAR();

  const widthIn = computeWidthFromHeight(currentHeightIn);
  const params = new URLSearchParams(window.location.search);
  const type = params.get("p") || "Knee";
  const productId =params.get("prod") || "";

  window.location.href =
    `/pages/iOS/iOS_results.html` +
    `?width=${encodeURIComponent(widthIn)}` +
    `&type=${encodeURIComponent(type)}` +
    `&prod=${encodeURIComponent(productId)}`;

};

})();
