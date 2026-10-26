(function () {


const exitBtn = document.getElementById("exit-ar-hard-btn");
const recommendationBtn = document.getElementById("exit-ar-btn");
const M_TO_IN = 39.37;

const LOW_DIST = 25.0;
const HIGH_DIST = 51.2;
let measurementHeight = null;
let trackingPaused = false;
let resumeBaseY = null;
let stableFrames = 0;

const MIN_RESUME_FRAMES = 10;
const MIN_TILT_DEG = 0;

let filteredQuat = null;

const ROT_SMOOTH = 0.08;
const ROT_JUMP_THRESHOLD = 5.0;

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

let biasEstimate = 0;
const BIAS_ALPHA = 0.01;
let startupCameraYIn = null;
let firstMovementSample = true;
let frozenFrameCount = 0;
let lastFrozenCheckHeight = null;
let frozenStartTime = null;
let tooHighStartTime = null;
let tooLowStartTime = null;
const HEIGHT_TIMEOUT_MS = 2000;
let spikeCount = 0;
let previousQuaternion = null;
let anchorY = null;
let xr8Ready = false;
let floorPlane = null;
let rayOrigin = new THREE.Vector3();
let rayDirection = new THREE.Vector3();
let hitPoint = new THREE.Vector3();
let startPos = null;
let startQuat = null;
let startUp = null;
// ====================================================
// UI
// ====================================================

let currentHudKey = "";
let startMatrix = null;
let startMatrixInv = null;
let recommendationEnabled = false;
let cachedWidthIn = 6.0;
let lastDrawnWidth = -1;
let lastTiltGood = null;
const rawDeltaBuffer = [];
const smoothedDeltaBuffer = [];
let lastUpdateTimeMs = null;
let lastGoodTrackingTime = performance.now();
let totalOffsetIn = 0;
let previousWidthIn = null;
const MAX_SPIKES = 25;
const MAX_FROZEN_FRAMES = 20;
const FROZEN_TIMEOUT_MS = 500;
const MIN_VALID_DELTA_IN = 0.008;
const MAX_VALID_DELTA_IN = 0.4;
const TRACKING_TIMEOUT_MS = 8000;
let stopReason = "";
let arStopping = false;
let previousPosition = null;
let poseJumpCount = 0;
let debugCamera = null;
let debugScene = null;
const POSE_JUMP_THRESHOLD_IN = 0.5;
const MAX_POSE_JUMPS = 3;
let calibrationPositionY = null;
// ====================================================
// XR
// ====================================================

let xrCamera = null;
// ====================================================
// TRACKING RECOVERY
// ====================================================

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


function stopARWithReason(reason) {

  if (arStopping) {
    return;
  }

  arStopping = true;

  stopReason = reason;

  console.error(
    "[AR STOP]",
    reason,
    {
      height: baselineHeightIn,
      width: cachedWidthIn,
      offset: totalOffsetIn,
      pitch: TILT.pitchDeg
    }
  );

  show(`❌ ${reason}`);

  setTimeout(() => {
    stopAR();
    window.history.back();
  }, 3000);
}


function stopAR() {
  try {
    removeRulerCanvas();
    trackingStable = false;
    startupCameraYIn = null;
    previousCameraYIn = null;
    baselineHeightIn = null;
    totalOffsetIn = 0;
    rawDeltaBuffer.length = 0;
    smoothedDeltaBuffer.length = 0;
    deltaYBuffer.length = 0;
    lastUpdateTimeMs = null;
    frozenFrameCount = 0;
    lastFrozenCheckHeight = null;
    frozenStartTime = null;
    tooHighStartTime = null;
    tooLowStartTime = null;
    spikeCount = 0;
    previousWidthIn = null;
    firstMovementSample = true;
    lastGoodTrackingTime = performance.now();
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
  scale: 'absolute'
});


 XR8.addCameraPipelineModules([
  XR8.GlTextureRenderer.pipelineModule(),
  XR8.Threejs.pipelineModule(),
  XR8.XrController.pipelineModule(),
  XRExtras.FullWindowCanvas.pipelineModule(),

  {
    name: "local-floor",

onStart: function () {

  const xrScene = XR8.Threejs.xrScene();

  xrCamera = xrScene.camera;

  debugScene = xrScene.scene;

  debugCamera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.01,
    100
  );

  createRulerCanvas();
},

onUpdate: function () {

  if (!xrCamera) {
    return;
  }

  if (!startMatrix) {

    xrCamera.updateMatrixWorld(true);

    startMatrix = xrCamera.matrixWorld.clone();
    startMatrixInv = startMatrix.clone().invert();

    startQuat = xrCamera.quaternion.clone();
    startPos = xrCamera.position.clone();

    previousPosition = xrCamera.position.clone();
    previousQuaternion = xrCamera.quaternion.clone();

    filteredQuat = xrCamera.quaternion.clone();

    measurementHeight =
      xrCamera.position.y * M_TO_IN;

    resumeBaseY =
      xrCamera.position.y;

    return;
  }

  const cameraY =
    xrCamera.position.y * M_TO_IN;

  const posJump =
    xrCamera.position.distanceTo(
      previousPosition
    ) * M_TO_IN;

  const rotJump =
    THREE.MathUtils.radToDeg(
      previousQuaternion.angleTo(
        xrCamera.quaternion
      )
    );

  // determine how flat phone is
  const tiltDeg =
    Math.abs(TILT.pitchDeg)

  const phoneTooFlat =
    tiltDeg < MIN_TILT_DEG;

  // tracking quality lost
  if (
    phoneTooFlat ||
    rotJump > 5 ||
    posJump > 1
  ) {

    if (!trackingPaused) {

      trackingPaused = true;

      stableFrames = 0;

      measurementHeight =
        measurementHeight ?? cameraY;
    }

    show(
      `⚠️ Tracking Paused\n\n` +
      `Tilt Phone More\n` +
      `Tilt: ${tiltDeg.toFixed(1)}°\n\n` +
      `Height: ${measurementHeight.toFixed(2)} in\n` +
      `PosJump: ${posJump.toFixed(2)}\n` +
      `RotJump: ${rotJump.toFixed(2)}°`
    );

    previousPosition =
      xrCamera.position.clone();

    previousQuaternion =
      xrCamera.quaternion.clone();

    return;
  }

  // wait until tracking is stable
  if (trackingPaused) {

    stableFrames++;

    if (stableFrames < MIN_RESUME_FRAMES) {

      show(
        `✅ Tracking Recovering\n\n` +
        `Stable: ${stableFrames}/${MIN_RESUME_FRAMES}`
      );

      previousPosition =
        xrCamera.position.clone();

      previousQuaternion =
        xrCamera.quaternion.clone();

      return;
    }

    // re-baseline after recovery
    resumeBaseY =
      xrCamera.position.y;

    trackingPaused = false;

    stableFrames = 0;
  }

  // continue from frozen height
  const offsetIn =
    (xrCamera.position.y - resumeBaseY) *
    M_TO_IN;

  const currentHeight =
    measurementHeight + offsetIn;

  show(
    `Height: ${currentHeight.toFixed(2)} in\n\n` +
    `Tilt: ${tiltDeg.toFixed(1)}°\n` +
    `PosJump: ${posJump.toFixed(2)}\n` +
    `RotJump: ${rotJump.toFixed(2)}°`
  );

  previousPosition =
    xrCamera.position.clone();

  previousQuaternion =
    xrCamera.quaternion.clone();
}
  }
]);
};


exitBtn.onclick = () => {
  stopAR();
  window.history.back();
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
