(function () {


  const exitBtn = document.getElementById("exit-ar-hard-btn");
  const recommendationBtn = document.getElementById("exit-ar-btn");
const M_TO_IN = 39.37;

const LOW_DIST = 25.0;
const HIGH_DIST = 51.2;

// Overlay
let canvas, ctx;
const dpr = Math.min(window.devicePixelRatio || 1,2);

let leftWidthCached = 0;
let rightWidthCached = 0;

const leftLines = ["Left Edge", "of Knee"];
const rightLines = ["Right Edge", "of Knee"];
const ranges = ["[4-5]", "[5-6]", "[6-7]", "[7-8]"];
const centers = [4.5,5.5,6.675,7.7];

// Calibration
const X_START = 0.2;
const X_END = 0.8;
const X_STEP = 0.02;

const Y_START = 0.1;
const Y_END = 0.6;
const Y_STEP = 0.02;

const GROUND_CALIBRATION_FRAMES = 10;
let groundSamples = [];
let calibratedHeightIn = null;

// Orientation (used for overlay color and button enable/disable)
const TILT = {pitchDeg: 0,rollDeg: 0};

// UI
let currentHudMessage = "";

// Tracking
let trackingStable = false;
let previousCameraYIn = null;
let baselineHeightIn = null;
let currentHeightIn = null;
let cumulativeShiftIn = 0;

// Delta processing
const deltaBuffer = [];
const TRACKING_BUFFER_SIZE = 100;
const STABILITY_SAMPLE_COUNT = 50;
const STABILITY_RMS_THRESHOLD = 0.05;

// Spike verification
let pendingSpike = null;
let verificationBuffer = [];
const SPIKE_THRESHOLD = 0.5;
const STABILITY_THRESHOLD = 0.25;
const VERIFICATION_FRAMES = 5;

// EMA
let emaDeltaIn = 0;
const ALPHA_SAME_DIRECTION = 0.20;
const ALPHA_DIRECTION_CHANGE = 0.50;
let statsFrameCounter = 0;
let filteredDeltaAvg = 0;
let filteredDeltaRms = 0;
let recommendationEnabled = false;
let cachedWidthIn = 6.0;
let lastDrawnWidth = -1;
let lastTiltGood = null;
let screenWidth = window.innerWidth;
let screenHeight = window.innerHeight;
const sortBuffer = [];
let statsReady = false;
let lastWidthHeightIn = null;
let driftDirectionFrames = 0;
let previousFilteredDeltaAvg = 0;
const DRIFT_AVG_THRESHOLD = 0.01;
const DRIFT_DIRECTION_THRESHOLD = 50;
let xrCamera = null;
const HUD_COLORS = {
  INFO: "#1565C0",      // blue
  SUCCESS: "#2E7D32",   // green
  WARNING: "#EF6C00",   // orange
  ERROR: "#C62828"      // red
};

let directionConfidence = 0;
let driftRatio = 0;
let stationaryReferenceHeightIn = null;
let stationaryHeightDriftIn = 0;

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

/*  function showOnce(msg) {
  if (msg === currentHudMessage) {
    return;
  }
  currentHudMessage = msg;
  show(msg);
}*/


let currentHudKey = "";

function showOnce(message,bgColor = "#1E1E1E",textColor = "#FFFFFF") {

  const key =`${message}|${bgColor}|${textColor}`;

  if (key === currentHudKey) {
    return;
  }
  currentHudKey = key;

  show(message,bgColor,textColor);
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
  } catch (e) {
    console.error(e);
  }

  trackingStable = false;
  calibratedHeightIn = null;
  currentHeightIn = null;
  baselineHeightIn = null;
  previousCameraYIn = null;
  cumulativeShiftIn = 0;
  emaDeltaIn = 0;
  pendingSpike = null;
  verificationBuffer = [];
  deltaBuffer.length = 0;
  groundSamples.length = 0;
  currentHudMessage = "";
  statsReady = false;
  lastDrawnWidth = -1;
  lastTiltGood = null;
  lastWidthHeightIn = null;
  statsFrameCounter = 0;
  filteredDeltaAvg = 0;
  filteredDeltaRms = 0;
  recommendationEnabled = false;
  sortBuffer.length = 0;
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
        this.frameHeightsIn = [];
        this.lastUpdate = 0;
        this.xs = generateRange(X_START,X_END,X_STEP);
        this.ys = generateRange(Y_START,Y_END, Y_STEP);
        this.xLen = this.xs.length;
        this.yLen = this.ys.length;
        this.totalPoints = this.xLen * this.yLen;
        xrCamera = XR8.Threejs.xrScene().camera;
        createRulerCanvas();
      },

onUpdate: function () {
  const cameraY =xrCamera.position.y;
if (calibratedHeightIn !== null) {

  const currentCameraYIn = cameraY * M_TO_IN;

  // ====================================================
  // FIRST SAMPLE
  // ====================================================

  if (previousCameraYIn === null) {
    previousCameraYIn = currentCameraYIn;
    if (baselineHeightIn === null) {
      baselineHeightIn = calibratedHeightIn;
    }
    return;
  }

  const deltaIn = currentCameraYIn - previousCameraYIn;

  // ====================================================
  // SPIKE VERIFICATION
  // ====================================================

  if (pendingSpike !== null) {
    verificationBuffer.push(deltaIn);
    if (verificationBuffer.length >= VERIFICATION_FRAMES) {
      const avgAbsDelta =verificationBuffer.reduce((sum, value) => sum + Math.abs(value),0) / verificationBuffer.length;
      if (avgAbsDelta < STABILITY_THRESHOLD) {
        const totalMovement = pendingSpike + verificationBuffer.reduce((sum, value) => sum + value, 0);
        deltaBuffer.push(totalMovement);
        if (deltaBuffer.length > TRACKING_BUFFER_SIZE) {
          deltaBuffer.shift();
        }
      }
      pendingSpike = null;
      verificationBuffer.length = 0;
    }

  } else if (Math.abs(deltaIn) > SPIKE_THRESHOLD) {
    pendingSpike = deltaIn;
    verificationBuffer.length = 0;
  } else {
    deltaBuffer.push(deltaIn);
    if (deltaBuffer.length > TRACKING_BUFFER_SIZE) {
      deltaBuffer.shift();
    }
  }

  // ====================================================
  // UPDATE STATS EVERY 10 FRAMES
  // ====================================================

  if (deltaBuffer.length >= STABILITY_SAMPLE_COUNT && ++statsFrameCounter >= 10) {
    statsFrameCounter = 0;
    sortBuffer.length = 0;
    sortBuffer.push(...deltaBuffer);
    sortBuffer.sort(
      (a, b) => Math.abs(a) - Math.abs(b)
    );

    const filtered =sortBuffer.slice(5,sortBuffer.length - 5);
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < filtered.length; i++) {
      const v = filtered[i];
      sum += v;
      sumSq += v * v;
    }

    if (filtered.length > 0) {
      filteredDeltaAvg = sum / filtered.length;
      filteredDeltaRms = Math.sqrt(sumSq / filtered.length);
      statsReady = true;
      // ------------------------------------
// DRIFT RATIO
// ------------------------------------

   driftRatio =  Math.abs(filteredDeltaAvg) /  Math.max(filteredDeltaRms, 0.0001);

      // ------------------------------------
// DIRECTION CONFIDENCE
// ------------------------------------

      let positiveCount = 0;
      let negativeCount = 0;

      for (let i = 0; i < filtered.length; i++) {
        const v = filtered[i];

        if (v > DRIFT_AVG_THRESHOLD) {
          positiveCount++;
        } else if (v < -DRIFT_AVG_THRESHOLD) {
          negativeCount++;
        }
      }

      const directionalSamples = positiveCount + negativeCount;

      directionConfidence = directionalSamples > 0 ? Math.max(positiveCount, negativeCount) / directionalSamples : 0;

      // ------------------------------------
      // DRIFT OBSERVATION ONLY
      // ------------------------------------

      if (Math.abs(filteredDeltaAvg) > DRIFT_AVG_THRESHOLD && Math.abs(previousFilteredDeltaAvg) >    DRIFT_AVG_THRESHOLD && Math.sign(filteredDeltaAvg) === Math.sign(previousFilteredDeltaAvg)
      ) {
        driftDirectionFrames++;
      } else {
        driftDirectionFrames = 0;
      }
      previousFilteredDeltaAvg = filteredDeltaAvg;
    }
  }

  // ====================================================
  // TRACKING STABILIZATION
  // ====================================================

  if (!trackingStable) {
    if (deltaBuffer.length < STABILITY_SAMPLE_COUNT ) {

      showOnce(
        `Collecting Samples\n${deltaBuffer.length}/${STABILITY_SAMPLE_COUNT}`
      );
      previousCameraYIn = currentCameraYIn;
      return;
    }

    if (statsReady && filteredDeltaRms < STABILITY_RMS_THRESHOLD) {
      trackingStable = true;
      baselineHeightIn = calibratedHeightIn;
      cumulativeShiftIn = 0;
      emaDeltaIn = 0;
      showOnce("Hold Still");
      previousCameraYIn = currentCameraYIn;
      return;
    }

   const progress = Math.min(100,Math.round((deltaBuffer.length / STABILITY_SAMPLE_COUNT) * 100));
    showOnce(
      `🔵 Preparing Measurement\n` +
      `Hold phone steady (${progress}%)`,
      HUD_COLORS.INFO
    );
    previousCameraYIn = currentCameraYIn;
    return;
  }

  // ====================================================
  // EMA UPDATE
  // ====================================================

  if (statsReady) {
    emaDeltaIn = ALPHA_DIRECTION_CHANGE * filteredDeltaAvg + (1 - ALPHA_DIRECTION_CHANGE) * emaDeltaIn;
  }

  // ====================================================
  // DRIFT DETECTION
  // ====================================================

 

const phoneStationary =  filteredDeltaRms < (STABILITY_RMS_THRESHOLD * 0.5);

if (phoneStationary) {

  if (stationaryReferenceHeightIn === null) {
    stationaryReferenceHeightIn = currentHeightIn;
  }

  stationaryHeightDriftIn =
    Math.abs(currentHeightIn - stationaryReferenceHeightIn);

} else {

  stationaryReferenceHeightIn = currentHeightIn;
  stationaryHeightDriftIn = 0;
}

const suspiciousDrift =
  phoneStationary &&
  (
    (
      driftDirectionFrames >= DRIFT_DIRECTION_THRESHOLD &&
      directionConfidence > 0.6 &&
      driftRatio > 0.6
    ) ||
    stationaryHeightDriftIn > 0.25
  );

  // ====================================================
  // HEIGHT UPDATE
  // ====================================================

let appliedDeltaIn = emaDeltaIn;
if (suspiciousDrift) {
  appliedDeltaIn *= 0.1;
}
   cumulativeShiftIn += appliedDeltaIn;
  const updatedHeightIn = baselineHeightIn +  cumulativeShiftIn;
  currentHeightIn = updatedHeightIn;
  previousCameraYIn = currentCameraYIn;

  // ====================================================
  // WIDTH UPDATE
  // ====================================================

  if (lastWidthHeightIn === null ||  Math.abs(updatedHeightIn -lastWidthHeightIn) > 0.05
  ) {
    cachedWidthIn =computeWidthFromHeight(updatedHeightIn);
    lastWidthHeightIn = updatedHeightIn;
  }

  // ====================================================
  // BUTTON STATE
  // ====================================================
  const tiltGood = Math.abs(TILT.pitchDeg) <= 10;
  const shouldEnable = trackingStable && tiltGood && currentHeightIn !== null;
  if (shouldEnable !== recommendationEnabled) {
    recommendationEnabled = shouldEnable;
    updateRecommendationButton(shouldEnable);
  }

  // ====================================================
  // HUD MESSAGE PRIORITY
  // ====================================================

 if (!tiltGood) {

  showOnce(
    "⚠️ Phone Tilted\n" +
    "Hold Flat until the ruler turns green",
    HUD_COLORS.ERROR
  );

} else if (suspiciousDrift) {

  showOnce(
    "⚠️ Tracking Needs Verification\n" +
    "Hold phone near waist height and keep it steady",
    HUD_COLORS.WARNING
  );

} else if (currentHeightIn > 51) {

  showOnce(
    "⚠️ Phone Too High\n" +
    "Move the phone closer to your knee",
    HUD_COLORS.WARNING
  );

} else if (currentHeightIn < 25) {

  showOnce(
    "⚠️ Phone Too Low\n" +
    "Raise the phone slightly",
    HUD_COLORS.WARNING
  );

} else {

  showOnce(
    "✅ Ready to Measure\n" +
    "Align the ruler with the left and right edges of your knee\n" +
    "Then tap Product Recommendation",
    HUD_COLORS.SUCCESS
  );

}

  // ====================================================
  // REDRAW OVERLAY ONLY WHEN NEEDED
  // ====================================================
  const widthChanged =  Math.abs(cachedWidthIn - lastDrawnWidth) > 0.1;
  const tiltChanged =  tiltGood !== lastTiltGood;

  if (widthChanged || tiltChanged) {
    drawRulerOverlay(cachedWidthIn,TILT.pitchDeg);
    lastDrawnWidth = cachedWidthIn;
    lastTiltGood = tiltGood;
  }
  return;
}

 // =====================================
// CALIBRATION MODE
// =====================================

const xs = this.xs;
const ys = this.ys;

this.frameHeightsIn.length = 0;
const frameHeightsIn = this.frameHeightsIn;

for (let xi = 0; xi < this.xLen; xi++) {
  const x = xs[xi];
  for (let yi = 0; yi < this.yLen; yi++) {

    const hits = XR8.XrController.hitTest(x,ys[yi],["FEATURE_POINT"]);
    if (!hits || hits.length === 0) continue;
    const p = hits[0].position;
    if (!p) continue;
    if (!isFinite(p.x) || !isFinite(p.y) || !isFinite(p.z)) continue;
    if (p.y < 0 || p.y >= cameraY) continue;
    frameHeightsIn.push((cameraY - p.y) * M_TO_IN);
  }
}

let heightSum = 0;
let heightCount = 0;

for (let i = 0; i < frameHeightsIn.length; i++) {
  const h = frameHeightsIn[i];
  if (h >= 20 && h <= 40) {
    heightSum += h;
    heightCount++;
  }
}
if (heightCount > 0) {

  const avgHeight = heightSum / heightCount;
  groundSamples.push(avgHeight);

  showOnce(
    `🔵 Preparing Measurement\n` +
    `Detecting floor (${groundSamples.length}/${GROUND_CALIBRATION_FRAMES})\n` +
    `Slowly move your phone`,
    HUD_COLORS.INFO
  );

  if (groundSamples.length >= GROUND_CALIBRATION_FRAMES) {

    const avgHeightIn =
      groundSamples.reduce((a, b) => a + b, 0) /
      groundSamples.length;

    calibratedHeightIn =
      Math.min(44, Math.max(36, avgHeightIn));

    groundSamples = [];
  }

} else {

  showOnce(
    "🟠 Floor Not Detected\n" +
    "Point the camera toward the floor",
    HUD_COLORS.WARNING
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
