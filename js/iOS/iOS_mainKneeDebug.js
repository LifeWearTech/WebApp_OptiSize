
(function () {

  const exitBtn = document.getElementById("exit-ar-hard-btn");
  const M_TO_IN = 39.37;

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


  window.wireXR = function () {

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

  // Cache lengths
  this.xLen = this.xs.length;
  this.yLen = this.ys.length;

  this.totalPoints =
    this.xLen * this.yLen;
},
onUpdate: function () {

  const now = Date.now();

  // Only throttle while calibrating
  if (calibratedHeightIn === null) {

    if (now - this.lastUpdate < 100) {
      return;
    }

    this.lastUpdate = now;
  }

  const { camera } = XR8.Threejs.xrScene();
  const cameraY = camera.position.y;

if (calibratedHeightIn !== null) {

  // Add latest cameraY to rolling buffer
  cameraYBuffer.push(cameraY);

  // Keep only last 10 samples
  if (cameraYBuffer.length > 5) {
    cameraYBuffer.shift();
  }

const minY = Math.min(...cameraYBuffer);
const maxY = Math.max(...cameraYBuffer);
const rangeIn =   (maxY - minY) * M_TO_IN;

if (rangeIn > 2.0) {
  cameraYBuffer=[];
  calibratedCameraY = cameraY;
  return;
}

  // Sort a copy
   const filteredCameraY = cameraYBuffer.reduce((a, b) => a + b, 0) /cameraYBuffer.length;
   const deltaIn = (filteredCameraY - calibratedCameraY) * M_TO_IN;

  // Ignore large tracking jumps
  if (Math.abs(deltaIn) > 2.0) {
    calibratedCameraY = filteredCameraY;
  } else {
    
    calibratedHeightIn = calibratedHeightIn + deltaIn;
    calibratedCameraY = filteredCameraY;
    show(
      `Height: ${calibratedHeightIn.toFixed(2)} in\n` +
      `Delta: ${deltaIn.toFixed(2)} in\n` +
      `CameraY: ${(filteredCameraY * M_TO_IN).toFixed(2)}in\n`
    );
  }

  return; // No more hit tests after calibration
}

  // =================================
  // CALIBRATION MODE ONLY
  // =================================

  const xs = this.xs;
  const ys = this.ys;

  let txt = "";
  const frameHeightsIn = [];

  for (let xi = 0; xi < this.xLen; xi++) {
    const x = xs[xi];
    for (let yi = 0; yi < this.yLen; yi++) {
      const hits = XR8.XrController.hitTest(
        x,
        ys[yi],
        ["FEATURE_POINT"]
      );
      if (!hits || hits.length === 0) continue;
      const p = hits[0].position;
      if (!p) continue;

      if (
        !isFinite(p.x) ||
        !isFinite(p.y) ||
        !isFinite(p.z)
      ) continue;
      if (p.y < 0 || p.y >= cameraY) continue;
      frameHeightsIn.push((cameraY-p.y) * M_TO_IN
      
      );
    }

  }

   const validHeights =frameHeightsIn.filter(h => h >= 20 && h <= 40);

  if ( validHeights.length > 0) {
  const avgHeight = validHeights.reduce((a, b) => a + b,0) / validHeights.length;

  groundSamples.push(avgHeight);
  cameraYSamples.push(cameraY);
  if (groundSamples.length >= GROUND_CALIBRATION_FRAMES) {
    calibratedHeightIn =groundSamples.reduce((a, b) => a + b,0) / groundSamples.length;
    calibratedCameraY = cameraYSamples.reduce((a, b) => a + b, 0) / cameraYSamples.length;
    cameraYBuffer = Array(5).fill(calibratedCameraY);
    groundSamples = [];
    cameraYSamples = [];
  }

};
}
      }
    ]);
  };

  exitBtn.onclick = () => {
    try { XR8.stop(); } catch {}
    location.reload();
  };

})();
