
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

          // ✅ generate sampling grid
          this.xs = generateRange(X_START, X_END, X_STEP);
          this.ys = generateRange(Y_START, Y_END, Y_STEP);

          // ✅ EXACT number of points
          this.totalPoints = this.xs.length * this.ys.length;

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

          let groundYSamples = [];
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

              groundYSamples.push(p.y);

              const heightMeters = cameraY - p.y;

              const heightIn = heightMeters * M_TO_IN;
              frameHeightsIn.push(heightIn);

            }
          }

if (frameHeightsIn.length > 10) {

const validHeights =frameHeightsIn.filter(h => h >= 25 && h <= 51);
const sortedHeights =validHeights.slice().sort((a, b) => a - b);

const trimCount = Math.floor(sortedHeights.length * 0.25);
const trimmedHeights = sortedHeights.slice( trimCount, sortedHeights.length - trimCount);
if (trimmedHeights.length > 0) {
    const avgHeight = trimmedHeights.reduce((a, b) => a + b,0) / trimmedHeights.length;
    const sdHeight = standardDeviation(trimmedHeights);

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


  txt =
    `Avg Height: ${stableHeightIn.toFixed(2)} in\n` +
    `SD: ${sdHeight.toFixed(2)} in\n` +
    `Ground Drift: ${groundDriftIn.toFixed(2)} in\n` +
    `Height Drift: ${heightDriftIn.toFixed(2)} in`;
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
    try { XR8.stop(); } catch {}
    location.reload();
  };

})();
