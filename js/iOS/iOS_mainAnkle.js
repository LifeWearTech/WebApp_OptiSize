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
let lastDrawnTiltDeg = null;

const MAX_TRACKING_JUMPS = 3;
const MAX_BAD_TRACKING_FRAMES = 60;
const MAX_VALID_RATE = 15.0;
const CALIBRATION_BUFFER_SIZE = 30;
const MIN_CAL_HEIGHT_IN = 35;
const MAX_CAL_HEIGHT_IN = 39;
let cachedWidthIn = 4.75;
const MIN_TILT_DEG = 20;
const MIN_VALID_DELTA_IN = 0.005;
const SMOOTHEDRATE_THRES = 1.25;
const POSE_JUMP_THRESHOLD_IN =1;
const ROT_JUMP_THRESHOLD_DEG =5;
const FRAME_TIME=0.25;
const RAW_RATEBUFFERLENGTH=20;
const SMOOTH_RATEBUFFERLENGTH=5;
let trackingJumpCount = 0;
let trackingBadFrames = 0;
let orientationChangeHandler = null;
let lastTrackingToastMs = 0;
const CAMERA_TO_WAIST_OFFSET_IN = 2;
const TRACKING_TOAST =  "Tracking Unstable. Hold Close to Waist and Tap Calibrate Again";
const INITIAL_TOAST =  "Hold Phone Close to Waist then Tap Calibrate";
const CAL_FAILED_TOAST= "Calibration Failed. Tap to Calibrate Again";
const TRACKING_TOAST_DURATION = 10000;
const TRACKING_TOAST_COOLDOWN = 5000;

function showTrackingToast(message) {
  const now = Date.now();
  if (now - lastTrackingToastMs < TRACKING_TOAST_COOLDOWN) {return;}
  lastTrackingToastMs = now;
  window.AnkleToast.showToast(message,TRACKING_TOAST_DURATION);
}

function isPortraitOrientation() {
  return window.innerHeight > window.innerWidth;
}


function stopAR() {
  try {
    window.AnkleOverlay.removeRulerCanvas();
    previousCameraYIn = null;
    baselineHeightIn = null;
    totalOffsetIn = 0;
    lastUpdateTimeMs = null;
    calibrationHeightIn = null;
    startMatrix = null;
    calibrationBuffer.length = 0;
    previousPosition = null;
    previousQuaternion = null;
    cachedWidthIn = 4.75;
    lastDrawnWidth = -1;
    lastDrawnTiltDeg = null;
    trackingUnstable = false;
    trackingJumpCount = 0;
    trackingBadFrames = 0;
    updateRecommendationButton(false);
    if (orientationChangeHandler) {window.removeEventListener("orientationchange", orientationChangeHandler);
      window.removeEventListener("resize", orientationChangeHandler);
      orientationChangeHandler = null;
    }
    try {XR8.stop();} catch (e) {console.error(e);}
  } catch (e) {
    console.error(e);
  }
  updateRecommendationButton(false);
}

function updateRecommendationButton(enabled) {
  const btn = recommendationBtn;
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
  const avgHeight = (sum / calibrationBuffer.length) - CAMERA_TO_WAIST_OFFSET_IN;
  if (avgHeight >= MIN_CAL_HEIGHT_IN && avgHeight <= MAX_CAL_HEIGHT_IN) {
  calibrationHeightIn = avgHeight;
  window.AnkleToast.hideToast();
  lastTrackingToastMs = 0;
   const btn = document.getElementById("calibrate-btn");
   if (btn) {btn.disabled = true;btn.style.background = "#666";} 
  updateRecommendationButton(true);
  return true;
}
  calibrationBuffer.length = 0;
  calibrationHeightIn = null;
  measurementEnabled = false;
  updateRecommendationButton(false);
  window.AnkleOverlay.removeRulerCanvas();
  totalOffsetIn = 0;
  previousCameraYIn = null;
  lastUpdateTimeMs = null;
  lastDrawnWidth = -1;
  cachedWidthIn = 4.75;
  previousPosition = null;
  previousQuaternion = null;  
  const btn = document.getElementById("calibrate-btn");
  if (btn) {btn.disabled = false;btn.style.background = "#1976D2";}
  showTrackingToast(CAL_FAILED_TOAST);
  return true;
}

function processMovement(cameraYIn, rotJump, posJump) {

  const trackingBad = rotJump >= ROT_JUMP_THRESHOLD_DEG ||   posJump >= POSE_JUMP_THRESHOLD_IN;

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
        updateRecommendationButton(false);
        const btn = document.getElementById("calibrate-btn");
        if (btn) {btn.disabled = false; btn.style.background = "#1976D2";}
        showTrackingToast(TRACKING_TOAST);
        trackingJumpCount = 0;
      }
    }

    // Tracking bad continuously too long
    if (trackingBadFrames >= MAX_BAD_TRACKING_FRAMES) {
      measurementEnabled = false;
      updateRecommendationButton(false);
      const btn = document.getElementById("calibrate-btn");
      if (btn) {btn.disabled = false; btn.style.background = "#1976D2";}
      showTrackingToast(TRACKING_TOAST);
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
  cachedWidthIn = window.AnkleModel.computeWidthFromHeight(baselineHeightIn);
}

function updateOverlay() {

  const currentTiltDeg = Math.abs(window.AnkleTilt.TILT.pitchDeg);
  const widthChanged = Math.abs(cachedWidthIn - lastDrawnWidth) > 0.05;
  const tiltChanged = lastDrawnTiltDeg === null || Math.abs(currentTiltDeg - lastDrawnTiltDeg) > 1.0;
  if (!widthChanged && !tiltChanged) { return;}
  window.AnkleOverlay.drawRulerOverlay(cachedWidthIn, currentTiltDeg );
  lastDrawnWidth = cachedWidthIn;
  lastDrawnTiltDeg = currentTiltDeg;
}

window.wireXR = function () {
  exitBtn.style.display = "block";
  recommendationBtn.style.display = "block";
  updateRecommendationButton(false);

   measurementEnabled = false;   
  // =========================================
// BUTTON LAYOUT
// =========================================

exitBtn.style.position = "fixed";
const buttonTop = `max(${window.innerHeight * 0.08}px, calc(env(safe-area-inset-top) + 16px))`;
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
      name: "Ankle_Meas",
onStart: function () {
  xrCamera = XR8.Threejs.xrScene().camera;
    orientationChangeHandler = () => {
    if (!isPortraitOrientation()) {
      stopAR();
      setTimeout(() => {window.history.back(); }, 500);}
  };

  window.addEventListener("orientationchange",orientationChangeHandler);
  window.addEventListener("resize",orientationChangeHandler);
  window.AnkleOverlay.createRulerCanvas();
  window.AnkleTilt.createIndicator();
    if (!startupToastShown) {
    startupToastShown = true;
    window.AnkleToast.showToast(INITIAL_TOAST,5000);
  }

  const calibrateBtn =window.AnkleCalButton.createButton();
  calibrateBtn.disabled = false;
  calibrateBtn.style.background = "#1976D2";
  calibrateBtn.onclick = async () => {
    try {
      calibrationBuffer.length = 0;
      calibrationHeightIn = null;
      lastTiltValid = null;
      previousPosition = null;
      previousQuaternion = null;
      lastDrawnTiltDeg = null;
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
    updateRecommendationButton(false);
    measurementEnabled = true;
    window.startAR();
  };
},
onUpdate: function () {
  if (!xrCamera) return;
  const tiltDeg = Math.abs(window.AnkleTilt.TILT.pitchDeg);
  window.AnkleTilt.updateIndicator(tiltDeg,MIN_TILT_DEG);
const tiltValid = tiltDeg >= (MIN_TILT_DEG - 10);

if (lastTiltValid !== tiltValid) {
  window.AnkleCalButton.updateButton(tiltValid); 
  lastTiltValid = tiltValid;
}
const recommendationEnabled = calibrationHeightIn !== null &&  tiltValid &&  measurementEnabled;
updateRecommendationButton(recommendationEnabled);

  if (!startMatrix) {
    xrCamera.updateMatrixWorld(true);
    startMatrix =xrCamera.matrixWorld.clone();
    previousPosition =xrCamera.position.clone();
    previousQuaternion =xrCamera.quaternion.clone();
    lastDrawnWidth = -1;
    return;
  }
  if (!Number.isFinite(xrCamera.position.y)) {return;}
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
  const widthIn = Number(cachedWidthIn.toFixed(2));
  stopAR();
  const params = new URLSearchParams(window.location.search);

  const type = params.get("p") || "Ankle";
  const productId = params.get("prod") || "";

  // Product already selected
  if (productId) {
    window.location.href =
      `/pages/iOS/iOS_results.html` +
      `?width=${encodeURIComponent(widthIn)}` +
      `&type=${encodeURIComponent(type)}` +
      `&prod=${encodeURIComponent(productId)}`;

    return;
  }

  // No product selected → Select Retailer flow
  window.location.href =
    `/pages/iOS/iOS_Select_Retailer.html` +
    `?type=${encodeURIComponent(type)}` +
    `&width=${encodeURIComponent(widthIn)}`;
};
})();

