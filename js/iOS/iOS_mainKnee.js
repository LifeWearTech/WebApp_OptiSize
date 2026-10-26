(function () {


const exitBtn = document.getElementById("exit-ar-hard-btn");
const recommendationBtn = document.getElementById("exit-ar-btn");
const M_TO_IN = 39.37;
let measurementEnabled = false;
const rawRateBuffer = [];
const smoothedRateBuffer = [];
const calibrationBuffer = [];
let lastTiltValid = null;
let previousCameraYIn = null;
let baselineHeightIn = null;
let calibrationHeightIn = null;
let lastDrawnWidth = -1;
let lastUpdateTimeMs = null;
let totalOffsetIn = 0;
let xrCamera = null;
let startMatrix = null;
let previousPosition = null;
let previousQuaternion = null;
let startupToastShown = false;
let trackingUnstable = false;


const MAX_TRACKING_JUMPS = 3;
const MAX_BAD_TRACKING_FRAMES = 60;
const MAX_VALID_RATE = 15.0;
const CALIBRATION_BUFFER_SIZE = 30;
const MIN_CAL_HEIGHT_IN = 35;
const MAX_CAL_HEIGHT_IN = 39;
let cachedWidthIn = 6.0;
const MIN_TILT_DEG = 20;
const MIN_VALID_DELTA_IN = 0.005;
const MAX_VALID_DELTA_IN = 0.5;
const SMOOTHEDRATE_THRES = 1.25;
const POSE_JUMP_THRESHOLD_IN =1;
const ROT_JUMP_THRESHOLD_IN =5;
const FRAME_TIME=0.25;
const RAW_RATEBUFFERLENGTH=20;
const SMOOTH_RATEBUFFERLENGTH=5;
let trackingJumpCount = 0;
let trackingBadFrames = 0;


function stopAR() {
  try {
    window.KneeOverlay.removeRulerCanvas();
    previousCameraYIn = null;
    baselineHeightIn = null;
    totalOffsetIn = 0;
    lastUpdateTimeMs = null;
    calibrationHeightIn = null;
    startMatrix = null;
    calibrationBuffer.length = 0;
    previousPosition = null;
    previousQuaternion = null;
    cachedWidthIn = 6.0;
    lastDrawnWidth = -1;
    trackingUnstable = false;
    trackingJumpCount = 0;
    trackingBadFrames = 0;
    XR8.stop();
  } catch (e) {
    console.error(e);
  }
  updateRecommendationButton(false);
}

function updateRecommendationButton(enabled) {
  const btn = document.getElementById("exit-ar-btn");
  if (!btn) return;
  btn.disabled = !enabled;
  btn.style.opacity = enabled ? "1.0" : "0.5";
  btn.style.pointerEvents = enabled ? "auto" : "none";
}

// Helper Functions 
function processCalibration(cameraYIn) {
  if (!measurementEnabled) return false;
  if (calibrationHeightIn !== null) return false;
  calibrationBuffer.push(cameraYIn);
  while (calibrationBuffer.length >CALIBRATION_BUFFER_SIZE) {calibrationBuffer.shift();}
  if (calibrationBuffer.length <CALIBRATION_BUFFER_SIZE) {return true;}
  let sum = 0;
  for (let i = 0; i < calibrationBuffer.length; i++) {sum += calibrationBuffer[i];}
  const avgHeight =  sum / calibrationBuffer.length-2;
  if (avgHeight >= MIN_CAL_HEIGHT_IN && avgHeight <= MAX_CAL_HEIGHT_IN) {
    calibrationHeightIn = avgHeight;
    const btn =document.getElementById("calibrate-btn");
    if (btn) {btn.disabled = false; btn.style.background = "#1976D2"; }
    return true;
  }
  calibrationBuffer.length = 0;
  calibrationHeightIn = null;
  measurementEnabled = false;
  recommendationBtn.style.display ="none";
  window.KneeOverlay.removeRulerCanvas();
  totalOffsetIn = 0;
  previousCameraYIn = null;
  lastUpdateTimeMs = null;
  lastDrawnWidth = -1;
  cachedWidthIn = 6.0;
  previousPosition = null;
  previousQuaternion = null;  
  window.KneeToast.showToast("Calibration Failed. Tap Again to Calibrate", 5000);
  return true;
}

function processMovement(cameraYIn, rotJump, posJump) {

  const trackingBad = rotJump >= ROT_JUMP_THRESHOLD_IN ||   posJump >= POSE_JUMP_THRESHOLD_IN;

  // =========================================
  // TRACKING HEALTH MONITOR
  // =========================================

  if (trackingBad) {
    trackingBadFrames++;
    // Rising edge detection
    if (!trackingUnstable) {
      trackingUnstable = true;
      trackingJumpCount++;
      // Too many tracking disturbances
      if (trackingJumpCount >= MAX_TRACKING_JUMPS) {
        measurementEnabled = false;
        recommendationBtn.style.display = "none";
        window.KneeToast.showToast("Tracking Unstable. Hold Close to Waist and Tap Calibrate Again", 5000);
        trackingJumpCount = 0;
      }
    }

    // Tracking bad continuously too long
    if (trackingBadFrames >= MAX_BAD_TRACKING_FRAMES) {
      measurementEnabled = false;
      recommendationBtn.style.display = "none";
      window.KneeToast.showToast(  "Tracking Unstable. Hold Close to Waist and Tap Calibrate Again",5000);
      trackingBadFrames = 0;
      trackingJumpCount = 0;
    }
    return null;
  }

  // Tracking recovered
  trackingBadFrames = 0;
  trackingUnstable = false;

  // =========================================
  // MOTION PROCESSING
  // =========================================

  if (previousCameraYIn === null) {previousCameraYIn = cameraYIn;return null;}
  const deltaY = cameraYIn - previousCameraYIn;
  previousCameraYIn = cameraYIn;

  if (Math.abs(deltaY) < MIN_VALID_DELTA_IN) {return null;}
  const nowMs = performance.now();
  if (lastUpdateTimeMs === null) {lastUpdateTimeMs = nowMs; return null;}
  const dt =(nowMs - lastUpdateTimeMs) / 1000;
  lastUpdateTimeMs = nowMs;

  if (!Number.isFinite(dt) || dt <= 0 || dt > FRAME_TIME) { return null; }
  const deltaRate = deltaY / dt;
  if ( Math.abs(deltaRate) > MAX_VALID_RATE) {return null;}
  rawRateBuffer.push(deltaRate);
  while (rawRateBuffer.length >RAW_RATEBUFFERLENGTH) {rawRateBuffer.shift();}
  let avgRate = 0;
  for (let i = 0;i < rawRateBuffer.length; i++) {avgRate += rawRateBuffer[i];}
  avgRate /= rawRateBuffer.length;
  smoothedRateBuffer.push(avgRate);
  while (smoothedRateBuffer.length > SMOOTH_RATEBUFFERLENGTH) {smoothedRateBuffer.shift();}
  let smoothedRate = 0;
  for (let i = 0;i < smoothedRateBuffer.length; i++) {smoothedRate += smoothedRateBuffer[i];}
  smoothedRate /= smoothedRateBuffer.length;
  if (smoothedRateBuffer.length <SMOOTH_RATEBUFFERLENGTH) {return null;}
  const n = smoothedRateBuffer.length;
  const allPositive =
    smoothedRateBuffer[n - 1] > 0 &&
    smoothedRateBuffer[n - 2] > 0 &&
    smoothedRateBuffer[n - 3] > 0 &&
    smoothedRateBuffer[n - 4] > 0 &&
    smoothedRateBuffer[n - 5] > 0;

  const allNegative =
    smoothedRateBuffer[n - 1] < 0 &&
    smoothedRateBuffer[n - 2] < 0 &&
    smoothedRateBuffer[n - 3] < 0 &&
    smoothedRateBuffer[n - 4] < 0 &&
    smoothedRateBuffer[n - 5] < 0;

  return {dt,smoothedRate,consistentDirection:  allPositive || allNegative };
}


function updateWidth(smoothedRate,dt) {
  if (Math.abs(smoothedRate) > SMOOTHEDRATE_THRES) { totalOffsetIn += smoothedRate * dt; }
  baselineHeightIn =calibrationHeightIn + totalOffsetIn;
  cachedWidthIn = window.KneeModel.computeWidthFromHeight(baselineHeightIn);
}

function updateOverlay() {
  const widthChanged =Math.abs(cachedWidthIn - lastDrawnWidth) > 0.05;
  if (!widthChanged) return;
  window.KneeOverlay.drawRulerOverlay(cachedWidthIn,window.KneeTilt.TILT.pitchDeg);
  lastDrawnWidth = cachedWidthIn;
}

window.wireXR = function () {
  exitBtn.style.display = "block";
  recommendationBtn.style.display = "none";
   measurementEnabled = false;   
  // =========================================
// BUTTON LAYOUT
// =========================================

exitBtn.style.position = "fixed";
const buttonTop = `${window.innerHeight * 0.08}px`; // 5% of screen height
exitBtn.style.top = buttonTop;
recommendationBtn.style.top = buttonTop;
exitBtn.style.left = "20px";
exitBtn.style.bottom = "auto";
exitBtn.style.zIndex = "10000";

recommendationBtn.style.position = "fixed";
recommendationBtn.style.top = buttonTop;
recommendationBtn.style.right = "20px";
recommendationBtn.style.left = "auto";
recommendationBtn.style.transform = "none";
recommendationBtn.style.bottom = "auto";
recommendationBtn.style.zIndex = "10000";

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
      name: "Knee_Meas",
onStart: function () {
  xrCamera = XR8.Threejs.xrScene().camera;
  window.KneeOverlay.createRulerCanvas();
  window.KneeTilt.createIndicator();
    if (!startupToastShown) {
    startupToastShown = true;
    window.KneeToast.showToast("Hold Phone Close to Waist then Tap Calibrate",5000);
  }

  const calibrateBtn =window.KneeCalButton.createButton();
  calibrateBtn.onclick = async () => {
    try {
      calibrationBuffer.length = 0;
      calibrationHeightIn = null;
      lastTiltValid = null;
      previousPosition = null;
      previousQuaternion = null;
      XR8.stop();
      xrCamera = null;
    } catch (e) {
    }
    // Clear ALL session state
    startMatrix = null;
    baselineHeightIn = null;
    previousCameraYIn = null;
    lastUpdateTimeMs = null;
    rawRateBuffer.length = 0;
    smoothedRateBuffer.length = 0;
    trackingUnstable = false;
    trackingJumpCount = 0;
    trackingBadFrames = 0;
    totalOffsetIn = 0;
    await new Promise(resolve => setTimeout(resolve, 500) );
    XR8.XrController.configure({
      enableWorldPoints: true,
      enableLighting: false,
      scale: "absolute"
    });
    recommendationBtn.style.display =  "block";
    measurementEnabled = true;
    window.startAR();
  };
},
onUpdate: function () {
  if (!xrCamera) return;
  const tiltDeg = Math.abs(window.KneeTilt.TILT.pitchDeg);
  window.KneeTilt.updateIndicator(tiltDeg,MIN_TILT_DEG);
  const tiltValid =tiltDeg >= (MIN_TILT_DEG - 10);
  if (lastTiltValid !== tiltValid) {
    window.KneeCalButton.updateButton(tiltValid);
    updateRecommendationButton(tiltValid);
    lastTiltValid = tiltValid;
  }

  if (!startMatrix) {
    xrCamera.updateMatrixWorld(true);
    startMatrix =xrCamera.matrixWorld.clone();
    previousPosition =xrCamera.position.clone();
    previousQuaternion =xrCamera.quaternion.clone();
    lastDrawnWidth = -1;
    return;
  }
  const cameraYIn = xrCamera.position.y * M_TO_IN;
  const posJump = xrCamera.position.distanceTo(previousPosition) * M_TO_IN;
  const rotJump =THREE.MathUtils.radToDeg(previousQuaternion.angleTo(xrCamera.quaternion)
  );
  previousPosition.copy(xrCamera.position);
  previousQuaternion.copy(xrCamera.quaternion);
  if (processCalibration(cameraYIn)) {return;}
  const movement = processMovement(cameraYIn,rotJump,posJump);
  if (!movement) {return;}
  updateWidth(movement.consistentDirection ? movement.smoothedRate : 0, movement.dt);
  if (measurementEnabled) {updateOverlay();}}
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

