
(function () {

  const M_TO_IN = 39.37;
  const exitBtn = document.getElementById("exit-ar-hard-btn");

  function show(t) {
    const hud = document.getElementById("hud");
    if (hud) hud.style.whiteSpace = "pre-line", hud.textContent = t;
  }

  let groundY = null;
  let calibrated = false;

  let smoothVertical = null;
  let prevRawY = null;

  let fastCam = null;
  let slowHeight = null;

  let baselineHeight = null;
  let steadyFrames = 0;
  let isLocked = false;

  let velocityHistory = [];

  function smooth(value, prev, alpha) {
    if (prev === null) return value;
    return alpha * value + (1 - alpha) * prev;
  }

  function rejectSpike(current, prev, maxDelta = 0.15) {
    if (prev === null) return current;
    if (Math.abs(current - prev) > maxDelta) return prev;
    return current;
  }

  function computeVelocity(v) {
    velocityHistory.push(v);
    if (velocityHistory.length > 5) velocityHistory.shift();

    return velocityHistory.reduce((a, b) => a + b, 0) / velocityHistory.length;
  }

  /* ===============================
     GROUND DETECTION (same)
  =============================== */

  function detectGround(x, y) {

    let samples = [];
    let frame = 0;
    const MAX = 60;

    function sample() {
      const hits = XR8.XrController.hitTest(x, y);
      if (hits && hits.length > 0) {
        hits.forEach(h => samples.push(h.position.y));
      }

      frame++;
      if (frame < MAX) {
        requestAnimationFrame(sample);
      } else {
        finalize(samples);
      }
    }

    function finalize(samples) {

      if (samples.length < 30) {
        show("⚠️ Move slowly & retry");
        return;
      }

      samples.sort((a, b) => a - b);

      let bestCluster = [];
      let tempCluster = [samples[0]];

      for (let i = 1; i < samples.length; i++) {
        if (Math.abs(samples[i] - samples[i - 1]) < 0.015) {
          tempCluster.push(samples[i]);
        } else {
          if (tempCluster.length > bestCluster.length) {
            bestCluster = tempCluster;
          }
          tempCluster = [samples[i]];
        }
      }

      if (tempCluster.length > bestCluster.length) {
        bestCluster = tempCluster;
      }

      const avg = bestCluster.reduce((a, b) => a + b, 0) / bestCluster.length;

      if (avg < -2 || avg > 0.5) {
        show("⚠️ Bad ground — retry");
        return;
      }

      groundY = avg;
      calibrated = true;

      show("✅ Ground detected\nHold steady...");
    }

    sample();
  }

  document.addEventListener("pointerdown", (e) => {

    if (calibrated) {
      show("✅ Already calibrated");
      return;
    }

    detectGround(
      e.clientX / window.innerWidth,
      e.clientY / window.innerHeight
    );
  });

  /* ===============================
     XR PIPELINE
  =============================== */

  window.wireXR = function () {

    XR8.XrController.configure({
      enableWorldPoints: true,
      scale: 'absolute',
    });

    XR8.addCameraPipelineModules([
      XR8.GlTextureRenderer.pipelineModule(),
      XR8.Threejs.pipelineModule(),
      XR8.XrController.pipelineModule(),
      XRExtras.FullWindowCanvas.pipelineModule(),

      {
        name: "height-system",

        onStart: () => {
          show("Tap floor → hold steady");
        },

        onUpdate: () => {

          const xrs = XR8.Threejs.xrScene();
          if (!xrs || !xrs.camera) return;

          const camera = xrs.camera;

          /* ===============================
             ✅ TRUE VERTICAL PROJECTION
          =============================== */

          const up = new THREE.Vector3(0, 1, 0);
          let rawVertical = camera.position.dot(up);
          let rawVertical1 = camera.position.dot(up);
          /* ===============================
             ✅ SPIKE FILTER
          =============================== */

          rawVertical = rejectSpike(rawVertical, prevRawY);
          const velocity = prevRawY !== null ? Math.abs(rawVertical - prevRawY) : 0;
          prevRawY = rawVertical;

          const stableVelocity = computeVelocity(velocity);

          /* ===============================
             ✅ SMOOTH CAMERA
          =============================== */

          fastCam = smooth(rawVertical, fastCam, 0.3);
          smoothVertical = smooth(fastCam, smoothVertical, 0.1);

          if (!calibrated || groundY === null) {
            show("Tap floor to start");
            return;
          }

          let rawHeight = smoothVertical - groundY;

          /* ===============================
             ✅ AUTO LOCK
          =============================== */

          if (!isLocked) {

            if (stableVelocity < 0.002) {
              steadyFrames++;
            } else {
              steadyFrames = 0;
            }

            if (steadyFrames > 30) {
              baselineHeight = rawHeight;
              isLocked = true;

              show("✅ Locked\nMove phone");
            } else {
              show("Hold steady...\nLocking...");
            }

            return;
          }

          /* ===============================
             ✅ DELTA HEIGHT
          =============================== */

          let correctedHeight = rawHeight;

          /* ===============================
             ✅ HARD CLAMP (KEY FIX)
          =============================== */


if (slowHeight !== null) {
  const maxStep = 0.02; // meters per frame (~0.8 inches)

  let delta = correctedHeight - slowHeight;

  if (delta > maxStep) delta = maxStep;
  if (delta < -maxStep) delta = -maxStep;

  correctedHeight = slowHeight + delta;
}


          /* ===============================
             ✅ DEAD ZONE
          =============================== */

          if (Math.abs(correctedHeight) < 0.003) {
            correctedHeight = 0;
          }

          /* ===============================
             ✅ FINAL SMOOTHING
          =============================== */

          slowHeight = smooth(correctedHeight, slowHeight, 0.08);

          const heightInches = slowHeight * M_TO_IN;

          show(`Δ Height: ${heightInches.toFixed(2)} in\n✅ Stable`);
        }
      }
    ]);
  };

  exitBtn.onclick = () => {
    try { XR8.stop(); } catch {}
    location.reload();
  };

})();
