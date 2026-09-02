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
}


  // ✅ CONFIG
  const X_START = 0.2;
  const X_END = 0.8;
  const X_STEP = 0.01;
  const Y_START = 0.1;
  const Y_END = 0.6;
  const Y_STEP = 0.01;


let groundSamples = [];
let calibratedHeightIn = null;
const GROUND_CALIBRATION_FRAMES = 10;
let calibratedCameraY = null;
let cameraYSamples = [];
let cameraYBuffer = [];
const MA_WINDOW = 30;
let TILT = {pitchDeg: 0,rollDeg: 0, ready: false};

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


function drawBufferGraph(buffer) {

  if (!ctx || !canvas || buffer.length < 2) {
    return;
  }

  ctx.save();
  ctx.scale(dpr, dpr);

  const graphX = 20;
  const graphY = 20;
  const graphW = 300;
  const graphH = 150;

  const minVal = Math.min(...buffer);
  const maxVal = Math.max(...buffer);

  const range =
    Math.max(
      maxVal - minVal,
      0.000001
    );

  // Background
  ctx.fillStyle =
    "rgba(0,0,0,0.75)";
  ctx.fillRect(
    graphX,
    graphY,
    graphW,
    graphH
  );

  // Border
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 1;
  ctx.strokeRect(
    graphX,
    graphY,
    graphW,
    graphH
  );

  // -------------------------
  // Y Axis Grid / Labels
  // -------------------------

  const numTicks = 5;

  ctx.font =
    "11px sans-serif";

  ctx.fillStyle =
    "#FFFFFF";

  ctx.strokeStyle =
    "rgba(255,255,255,0.2)";

  ctx.lineWidth = 1;

  for (
    let i = 0;
    i <= numTicks;
    i++
  ) {

    const value =
      minVal +
      ((maxVal - minVal) *
       (numTicks - i)) /
      numTicks;

    const y =
      graphY +
      (graphH * i) /
      numTicks;

    // grid line
    ctx.beginPath();
    ctx.moveTo(graphX, y);
    ctx.lineTo(
      graphX + graphW,
      y
    );
    ctx.stroke();

    // label
    ctx.fillText(
      value.toFixed(2),
      graphX - 40,
      y + 4
    );
  }

  // -------------------------
  // Plot Line
  // -------------------------

  ctx.strokeStyle =
    "#00FF00";

  ctx.lineWidth = 2;

  ctx.beginPath();

  buffer.forEach(
    (value, i) => {

      const x =
        graphX +
        (i / (buffer.length - 1)) *
        graphW;

      const y =
        graphY +
        graphH -
        ((value - minVal) /
          range) *
        graphH;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
  );

  ctx.stroke();

  // -------------------------
  // Draw Dots
  // -------------------------

  ctx.fillStyle =
    "#FFEB3B";

  buffer.forEach(
    (value, i) => {

      const x =
        graphX +
        (i / (buffer.length - 1)) *
        graphW;

      const y =
        graphY +
        graphH -
        ((value - minVal) /
          range) *
        graphH;

      ctx.beginPath();
      ctx.arc(
        x,
        y,
        3,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  );

  // -------------------------
  // Stats
  // -------------------------

  ctx.fillStyle =
    "#FFFFFF";

  ctx.font =
    "12px sans-serif";

  ctx.fillText(
    `Min: ${minVal.toFixed(2)}`,
    graphX,
    graphY + graphH + 18
  );

  ctx.fillText(
    `Max: ${maxVal.toFixed(2)}`,
    graphX + 120,
    graphY + graphH + 18
  );

  ctx.fillText(
    `Range: ${(maxVal - minVal).toFixed(2)}`,
    graphX + 220,
    graphY + graphH + 18
  );

  ctx.restore();
}

function updateRecommendationButton(enabled) {
  const btn = document.getElementById("exit-ar-btn");

  if (!btn) return;

  btn.disabled = !enabled;
  btn.style.opacity = enabled ? "1.0" : "0.5";
  btn.style.pointerEvents = enabled ? "auto" : "none";
}

let baselineEstablished = false;
let baselineHeightIn = 0;
let baselineCameraYIn = 0;
let integratedShiftIn = 0;
let runningDeltaCount = 0;
let runningDeltaMean = 0;
let runningDeltaM2 = 0;
let currentSD = 0;
let currentUCL = 0;
let currentLCL = 0;
const MIN_SD = 0.1; // 0.01 in
let smoothedHeightIn = null;

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

        this.xs = generateRange(
          X_START,
          X_END,
          X_STEP
        );

        this.ys = generateRange(
          Y_START,
          Y_END,
          Y_STEP
        );

        this.xLen = this.xs.length;
        this.yLen = this.ys.length;

        this.totalPoints =
          this.xLen * this.yLen;

        createRulerCanvas();
      },

onUpdate: function () {
  const { camera } =
  XR8.Threejs.xrScene();
  const cameraY =camera.position.y;
  const cameraDeltaIn =(camera.position.y)*M_TO_IN ;
  const now = Date.now();

if (calibratedHeightIn !== null) {
  cameraYBuffer.push(cameraY);

  if (cameraYBuffer.length > 30) {cameraYBuffer.shift();}
  let updatedHeightIn = calibratedHeightIn;
  if (cameraYBuffer.length >= 30) {
    if (!baselineEstablished) {
      const cameraYInBuffer = cameraYBuffer.map(y => y * M_TO_IN);
      const rangeIn = Math.max(...cameraYInBuffer) - Math.min(...cameraYInBuffer);
      const baselineDeltas = [];
      for (let i = 1; i < cameraYInBuffer.length; i++) {
        baselineDeltas.push(cameraYInBuffer[i] - cameraYInBuffer[i - 1]);
      }
      const maxAbsDelta = Math.max(...baselineDeltas.map(d => Math.abs(d)));
    if (maxAbsDelta > 0.25 || rangeIn > 0.5) {
         cameraYBuffer.shift();
      show(
    `Calibrating...\n` +
    `Hold phone still\n` +
    `Max Delta: ${maxAbsDelta.toFixed(3)} in\n` +
    `Range: ${rangeIn.toFixed(3)} in\n` +
    `Stable Samples: ${cameraYBuffer.length}/30`
  );
  return;
}
      // Stable baseline accepted
      baselineCameraYIn = cameraYInBuffer.reduce((a, b) => a + b, 0) / cameraYInBuffer.length;
      baselineHeightIn = calibratedHeightIn;
      runningDeltaCount = baselineDeltas.length;
      runningDeltaMean = baselineDeltas.reduce((a, b) => a + b, 0) /baselineDeltas.length;
      runningDeltaM2 = 0;

      for (const d of baselineDeltas) {
        const diff = d - runningDeltaMean;
        runningDeltaM2 += diff * diff;
      }
      currentSD = Math.max(Math.sqrt(runningDeltaM2 / Math.max(runningDeltaCount - 1, 1)),MIN_SD);
      currentUCL = 3*currentSD;
      currentLCL = -3*currentSD;   
      baselineEstablished = true;
    }

const current = cameraYBuffer[cameraYBuffer.length - 1];
const prev1 = cameraYBuffer[cameraYBuffer.length - 2];
const cameraYIn = current * M_TO_IN;
const deltaIn = (current - prev1) * M_TO_IN;
let accepted = false;

if (Math.abs(deltaIn) <= currentUCL) {
  accepted = true;
  integratedShiftIn += deltaIn;
  runningDeltaCount++;
  const d1 = deltaIn - runningDeltaMean;
  runningDeltaMean += d1 / runningDeltaCount;
  const d2 = deltaIn - runningDeltaMean;
  runningDeltaM2 += d1 * d2;
  currentSD = Math.max(Math.sqrt(runningDeltaM2 /Math.max(runningDeltaCount - 1, 1)),MIN_SD);
  currentUCL = 3 * currentSD;
  currentLCL = -3 * currentSD;
}

updatedHeightIn = baselineHeightIn + integratedShiftIn / 2;

/*show(
  `Camera Y: ${cameraYIn.toFixed(2)} in\n` +
  `Baseline Y: ${baselineCameraYIn.toFixed(2)} in\n\n` +
  `Mean: ${runningDeltaMean.toFixed(4)}\n` +
  `SD: ${currentSD.toFixed(4)}\n` +
  `LCL: ${currentLCL.toFixed(4)}\n` +
  `UCL: ${currentUCL.toFixed(4)}\n\n` +
  `Accepted: ${accepted}\n` +
  `Integrated Shift: ${integratedShiftIn.toFixed(2)} in\n` +
  `Height: ${updatedHeightIn.toFixed(2)} in`
);*/
  calibratedHeightIn = updatedHeightIn;
  }

  const widthIn = computeWidthFromHeight(updatedHeightIn);
  drawRulerOverlay(widthIn,TILT.pitchDeg);
         let heightOk = true;

          if (heightIn > 51) {
            heightOk = false;
            HUD.show("Phone too high");
          } else if (heightIn < 25) {
            heightOk = false;
            HUD.show("Phone too close to ground");
          }

          // -------------------------------------------------
          // Tilt check (absolute)
          // -------------------------------------------------

          const tiltOk =TILT.ready &&  Math.abs(TILT.pitchDeg) < 10;

          // -------------------------------------------------
          // Final button eligibility
          // -------------------------------------------------

          const buttonEnabled =
            heightOk &&
            tiltOk &&
            widthIn > 4.0 &&
            widthIn < 8.0 &&
            heightIn < 51 &&
            heightIn > 25;

          updateRecommendationButton(buttonEnabled);

 
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
    cameraYSamples.push(cameraY);
    show(
      `Calibrating...\n` +
      `Frames: ${groundSamples.length}/${GROUND_CALIBRATION_FRAMES}\n` +
      `Height: ${avgHeight.toFixed(2)} in`
    );

    if (
      groundSamples.length >= GROUND_CALIBRATION_FRAMES
    ) {

      calibratedHeightIn = groundSamples.reduce((a, b) => a + b,0) / groundSamples.length;
      calibratedCameraY =cameraYSamples.reduce((a, b) => a + b, 0) / cameraYSamples.length;
      cameraYBuffer =[]
      groundSamples = [];
      cameraYSamples = [];
    }

  } else {

    show(
      "Collecting Samples..."
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

  const widthIn = computeWidthFromHeight(calibratedHeightIn);

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
