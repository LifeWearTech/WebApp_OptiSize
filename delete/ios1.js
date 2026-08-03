
/****************************************************
 * ios.js — Bare height (camera Y) with snap-guard + recenter
 * ----------------------------------------------------------
 * - configure() BEFORE run(): SLAM ON; scale:'responsive' (ground = y=0)
 * - Shows height = camera.position.y (m & in)
 * - Locks baseline after tracking is NORMAL for ~0.8s
 * - Rejects sudden outliers (>2 cm/frame) to avoid ground "snaps"
 * - Recenter button to reset ground context
 * - DPR canvas + updateCameraProjectionMatrix() on start & resize
 ****************************************************/
(function () {
  const IN_PER_M = 39.37007874015748;

  const hud     = document.getElementById('hud');
  const start   = document.getElementById('start');
  const show    = (t) => { if (hud) hud.textContent = t; };

  // Optional: add a simple recenter button (top-left under HUD)
  let recenterBtn = document.getElementById('recenter');
  if (!recenterBtn) {
    recenterBtn = document.createElement('button');
    recenterBtn.id = 'recenter';
    recenterBtn.textContent = 'Recenter';
    Object.assign(recenterBtn.style, {
      position: 'fixed', top: '4rem', left: '1rem', zIndex: 99998,
      padding: '.35rem .6rem', borderRadius: '.4rem',
      background: '#222', color: '#0ff', border: '1px solid #044', fontSize: '12px'
    });
    recenterBtn.style.display = 'none';
    document.body.appendChild(recenterBtn);
  }

  /************** Minimal canvas sizing **************/
  function resizeCanvasToViewport(canvas) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;

    canvas.style.position = 'fixed';
    canvas.style.inset    = '0';
    canvas.style.width    = `${vw}px`;
    canvas.style.height   = `${vh}px`;
    canvas.style.display  = 'block';
    canvas.style.zIndex   = '0';

    const bw = Math.max(1, Math.floor(vw * dpr));
    const bh = Math.max(1, Math.floor(vh * dpr));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width  = bw;
      canvas.height = bh;
    }
    return { bw, bh };
  }

  function ensureCanvas() {
    let canvas = document.getElementById('xr8-canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'xr8-canvas';
      document.body.appendChild(canvas);
    }

    const onResize = () => {
      const { bw, bh } = resizeCanvasToViewport(canvas);
      // Keep display geometry aligned with actual buffer size
      if (window.XR8?.XrController?.updateCameraProjectionMatrix) {
        XR8.XrController.updateCameraProjectionMatrix({
          cam: { pixelRectWidth: bw, pixelRectHeight: bh }
        });
      }
    };
    onResize();
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);

    return canvas;
  }

  /************** XR init **************/
  function initXR() {
    if (!window.XR8) {
      show('XR8 not loaded');
      return;
    }

    // Configure BEFORE run(): SLAM on; responsive => ground is y=0  (one horizontal plane)  [World Tracking behavior]
    XR8.XrController?.configure?.({
      disableWorldTracking: false,
      scale: 'absolute',
      mirroredDisplay: false,
      leftHandedAxes: false,
    }); // Must be before run()  [3](https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API)
    // With responsive, engine’s floor = y=0; height = camera.position.y  [1](https://developer.apple.com/forums/tags/webxr)

    // --- Snap guard state
    let baselineLocked = false;
    let baselineLockStart = 0;
    const BASELINE_LOCK_MS = 800;   // wait this long after NORMAL to lock
    const MAX_DELTA_PER_FRAME_M = 0.02; // 2 cm/frame clamp
    let lastHeightM = null;

    // Minimal loop: compute height, lock baseline when NORMAL, clamp jumps
    const heightModule = () => ({
      name: 'height',
      onUpdate: ({ processCpuResult }) => {
        const r = processCpuResult?.reality;
        const status = r?.trackingStatus || 'LIMITED';
        const reason = r?.trackingReason || 'UNSPECIFIED';

        const sceneObj = XR8.Threejs.xrScene?.();
        const camY = sceneObj?.camera?.position?.y ?? 0;

        // Track stabilization window
        if (status === 'NORMAL') {
          if (!baselineLocked) {
            if (!baselineLockStart) baselineLockStart = performance.now();
            else if (performance.now() - baselineLockStart >= BASELINE_LOCK_MS) {
              baselineLocked = true; // consider ground stable now
            }
          }
        } else {
          // tracking limited again: reset lock window
          baselineLocked = false;
          baselineLockStart = 0;
        }

        // Height from camera pose (ground = y=0)
        let heightM = Math.max(0, camY);

        // Simple per-frame clamp to avoid visible snaps when baseline is locked
        if (baselineLocked && lastHeightM != null) {
          const delta = heightM - lastHeightM;
          if (Math.abs(delta) > MAX_DELTA_PER_FRAME_M) {
            heightM = lastHeightM + Math.sign(delta) * MAX_DELTA_PER_FRAME_M;
          }
        }
        lastHeightM = heightM;

        const heightIn = heightM * 39.37007874015748;
        show(
          `Height: ${heightM.toFixed(2)} m (${heightIn.toFixed(1)} in)` +
          ` | Tracking: ${status}${status !== 'NORMAL' ? ` (${reason})` : ''}` +
          `${baselineLocked ? ' | Stable' : ' | Calibrating…'}`
        );
      }
    });

    // Build minimal pipeline
    XR8.addCameraPipelineModules([
      XR8.GlTextureRenderer.pipelineModule(),
      XR8.Threejs.pipelineModule(),
      XR8.XrController.pipelineModule(),
      heightModule(),
    ]);

    // Recenter UI
    recenterBtn.onclick = () => {
      try {
        XR8.XrController?.recenter?.();
        // Reset lock so we re-stabilize after recenter
        baselineLocked = false;
        baselineLockStart = 0;
        show('Recentered. Stabilizing…');
      } catch {}
    };

    // Start
    start.addEventListener('click', () => {
      const canvas = ensureCanvas();
      XR8.run({ canvas });

      // Initial projection sync  (keep rays/pose aligned on iOS after start & resizes)
      const dpr = window.devicePixelRatio || 1;
      const bw = Math.max(1, Math.floor(window.innerWidth  * dpr));
      const bh = Math.max(1, Math.floor(window.innerHeight * dpr));
      XR8.XrController?.updateCameraProjectionMatrix?.({
        cam: { pixelRectWidth: bw, pixelRectHeight: bh }
      }); // Projection updates recommended after display geometry changes  [2](https://github.com/Goldsheep-On-Github/8th-wall-self-host)

      // Reveal recenter control
      recenterBtn.style.display = 'inline-block';

      start.style.display = 'none';
      show('Initializing…');
    }, { once: true });

    show('Engine ready. Tap Start.');
  }

  // Wait for engine (or run immediately if already present)
  if (window.XR8) initXR();
  else window.addEventListener('xrloaded', initXR);
})();


