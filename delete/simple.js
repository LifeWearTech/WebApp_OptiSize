
/****************************************************
 * ios.js — Height from camera pose (absolute) using XR Extras FullWindowCanvas
 * ---------------------------------------------------------------------------
 * - NO manual sizing, NO projection sync code.
 * - XRExtras.FullWindowCanvas.pipelineModule() keeps canvas full-window and synced.
 * - configure() BEFORE run(): scale:'absolute' => camera.position.y is meters.
 * - onUpdate(): prints height (m & in).
 ****************************************************/
(function () {
  const IN_PER_M = 39.37007874015748;

  const hud   = document.getElementById('hud');
  const start = document.getElementById('start');
  const canvas = document.getElementById('xr8-canvas');
  const show  = (t) => { if (hud) hud.textContent = t; };

  function initXR() {
    if (!window.XR8) { show('XR8 not loaded'); return; }

    // Configure BEFORE run(): absolute => pose values in real-world meters
    XR8.XrController?.configure?.({
      disableWorldTracking: false,
      scale: 'absolute',
      mirroredDisplay: false,
      leftHandedAxes: false,
    });

    // Height-only module
    const heightModule = () => ({
      name: 'height',
      onUpdate: () => {
        const scene = XR8.Threejs.xrScene?.();
        const camY  = scene?.camera?.position?.y ?? 0;   // meters in absolute scale
        const m  = Math.max(0, camY);
        const in_ = m * IN_PER_M;
        show(`Height: ${m.toFixed(2)} m (${in_.toFixed(1)} in)`);
      }
    });

    // Build pipeline (Extras handles full-window sizing & display geometry for you)
    const modules = [
      XR8.GlTextureRenderer.pipelineModule(),     // draws camera feed
      XR8.Threejs.pipelineModule(),               // creates Three.js scene/camera
      XR8.XrController.pipelineModule(),          // SLAM + pose
      XRExtras.FullWindowCanvas.pipelineModule(), // <<< zero-code sizing
      heightModule(),
    ];

    XR8.addCameraPipelineModules(modules);

    start.addEventListener('click', () => {
      start.style.display = 'none';
      XR8.run({ canvas });                       // Extras will size/sync this canvas
      show('Stabilizing… move slowly for ~1–2s');
    }, { once: true });

    show('Engine ready. Tap Start.');
  }

  // Start when engine is ready
  if (window.XR8) initXR();
  else window.addEventListener('xrloaded', initXR);
})();
