
(function () {

  const M_TO_IN = 39.37;

  const exitBtn = document.getElementById("exit-ar-hard-btn");

  function show(t) {
    const hud = document.getElementById("hud");
    if (hud) hud.textContent = t;
  }

  /* ===============================
     STATE
  =============================== */

  let groundY = null;
  let samplingGround = false;
  let groundSamples = [];

  let smoothCamY = null;
  let lastStableHeight = 0;
  let prevCamY = null;

  /* ===============================
     FILTER HELPERS
  =============================== */

  function smooth(value, alpha = 0.15) {
    if (smoothCamY === null) {
      smoothCamY = value;
    } else {
      smoothCamY = alpha * value + (1 - alpha) * smoothCamY;
    }
    return smoothCamY;
  }

  function rejectSpike(current, prev, maxDelta = 0.05) {
    if (prev === null) return current;
    if (Math.abs(current - prev) > maxDelta) {
      return prev;
    }
    return current;
  }

  function stabilizeHeight(h, threshold = 0.01) {
    if (Math.abs(h - lastStableHeight) < threshold) {
      return lastStableHeight;
    }
    lastStableHeight = h;
    return h;
  }

  /* ===============================
     TOUCH → GROUND DETECTION (IMPROVED)
  =============================== */

  const hitTestHandler = (e) => {
    if (samplingGround) return;

    samplingGround = true;
    groundSamples = [];

    const x = e.touches[0].clientX / window.innerWidth;
    const y = e.touches[0].clientY / window.innerHeight;

    let frames = 0;
    const maxFrames = 15;

    const sampleLoop = () => {
      const hits = XR8.XrController.hitTest(x, y, ['FEATURE_POINT']);

      if (hits.length > 0) {
        hits.forEach(h => {
          if (h.position.y <= 0.2) { // allow near-ground
            groundSamples.push(h.position.y);
          }
        });
      }

      frames++;

      if (frames < maxFrames) {
        requestAnimationFrame(sampleLoop);
      } else {
        finalizeGround();
      }
    };

    sampleLoop();
  };

  function finalizeGround() {
    samplingGround = false;

    if (groundSamples.length < 5) {
      show("⚠️ Poor ground detection. Try again.");
      return;
    }

    // Average + slight trimming
    groundSamples.sort((a, b) => a - b);
    const trimmed = groundSamples.slice(2, -2);

    groundY =
      trimmed.reduce((a, b) => a + b, 0) /
      trimmed.length;

    show(
      `Ground locked ✅\n` +
      `Samples: ${groundSamples.length}\n` +
      `Ground Y: ${(groundY * M_TO_IN).toFixed(2)} in`
    );
  }


document.addEventListener("pointerdown", (e) => {
  if (samplingGround) return;

  const x = e.clientX / window.innerWidth;
  const y = e.clientY / window.innerHeight;

  const hits = XR8.XrController.hitTest(x, y, ['FEATURE_POINT']);

  console.log("HITS:", hits); // ✅ DEBUG

  if (!hits || hits.length === 0) {
    show("⚠️ No surface yet — move phone slowly");
    return;
  }

  // ✅ Take ALL hits (no filtering yet)
  const ys = hits.map(h => h.position.y);

  // ✅ Just average everything for now
  const avgY = ys.reduce((a, b) => a + b, 0) / ys.length;

  groundY = avgY;

  show(
    `Ground locked ✅\n` +
    `Y: ${(groundY * M_TO_IN).toFixed(2)} in`
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
        name: "main",

        onStart: () => {
          show("Tap ground to calibrate");
        },

        onUpdate: () => {
          const xrs = XR8.Threejs.xrScene();
          if (!xrs || !xrs.camera) return;

          let camY = xrs.camera.position.y;

          // ✅ Reject big jumps (tracking glitches)
          camY = rejectSpike(camY, prevCamY);
          prevCamY = camY;

          // ✅ Smooth camera noise
          camY = smooth(camY);

          if (groundY === null) {
            show("Tap the ground");
            return;
          }

          /* ===============================
             HEIGHT CALCULATION
          =============================== */

          let height = camY - groundY;

          // ✅ Stabilize small fluctuations
          height = stabilizeHeight(height);

          const heightInches = height * M_TO_IN;

          show(
            `Height: ${heightInches.toFixed(2)} in\n` +
            `Stability: ✅ filtered`
          );
        }
      }
    ]);
  };

  /* ===============================
     EXIT BUTTON
  =============================== */

  exitBtn.onclick = () => {
    try { XR8.stop(); } catch {}
    location.reload();
  };

})();
