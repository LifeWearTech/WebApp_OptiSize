

window.__MAIN_LOADED__ = true;
window.__MAIN_VERSION__ = 'dev13';
console.log("xr.js executed");


/**************** xr.js ****************/
import { showHUD, hideHUD } from './hud.js';
import { isIOS, M_TO_IN, state, setBtnRunning, disableBtnWith, smoothInches } from './state.js';
import { startTiltSensing, TILT } from './sensors.js';
// Add this import if you put the helpers in a separate file:
import { calcWidthFromHeightIn, updateBandsUI } from './bands.js';

// --- Startup flow (your original start() function, unchanged behavior) ---
export async function start() {
  disableBtnWith('Starting…');
  await startTiltSensing();
  showHUD('Checking device…');

  if (!isSecureContext) {
    setBtnRunning(false);
    showHUD('AR requires HTTPS (secure context).');
    alert('AR requires HTTPS. Please host this page on https://');
    return;
  }

  if (isIOS) {
    setBtnRunning(false);
    showHUD('WebXR AR hit‑tests are not supported on iOS Safari.');
    return;
  }

  const xr = navigator.xr;
  let supports = false;
  try {
    supports = !!(xr && xr.isSessionSupported && await xr.isSessionSupported('immersive-ar'));
  } catch {
    supports = false;
  }

  if (!supports) {
    setBtnRunning(false);
    showHUD('WebXR immersive‑ar not supported on this browser/device.');
    alert('AR not supported here.');
    return;
  }

  try {
    await startWebXR();
  } catch (err) {
    console.error(err);
    showHUD('Could not start WebXR AR.');
    setBtnRunning(false);
  }
}

/* ---------- 5) WebXR path: session + hit-test (height in inches) ---------- */
async function startWebXR() {
  showHUD('Requesting camera & AR session…');

  // Request immersive AR with hit-test; dom-overlay is optional
  let session;
  try {
    session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay', 'local-floor'],
      domOverlay: { root: document.body }
    });
  } catch (e) {
    showHUD(`Failed to requestSession: ${e?.message || e}`);
    setBtnRunning(false);
    return;
  }

  state.session = session;
  setBtnRunning(true);

  // Clean up on end (unchanged)
  session.addEventListener('end', () => {
    try {
      if (state.hitSource?.cancel) state.hitSource.cancel();
    } catch {}
    if (state.rafHandle) {
      try { session.cancelAnimationFrame(state.rafHandle); } catch {}
      state.rafHandle = null;
    }
    state.session = null;
    state.gl = null;
    state.hitSource = null;
    state.refSpace = null;
    state.viewerSpace = null;
    state.smoothWindow = [];
    showHUD('AR session ended.');
    setBtnRunning(false);
  });

  // WebGL setup (unchanged)
  showHUD('Initializing renderer…');
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { xrCompatible: true });
  if (!gl) {
    showHUD('WebGL not available.');
    setBtnRunning(false);
    await session.end().catch(() => {});
    return;
  }
  await gl.makeXRCompatible();
  state.gl = gl;

  session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl) });

  // Reference spaces (unchanged)
  let refSpace;
  try {
    refSpace = await session.requestReferenceSpace('local-floor');
  } catch {
    refSpace = await session.requestReferenceSpace('local');
  }
  const viewerSpace = await session.requestReferenceSpace('viewer');
  state.refSpace = refSpace;
  state.viewerSpace = viewerSpace;

  // Hit-test source: forward ray (z:-1); variable renamed for clarity
  const forwardRay = new XRRay({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 });
  const hitSource = await session.requestHitTestSource({
    space: viewerSpace,
    offsetRay: forwardRay
  });
  state.hitSource = hitSource;

  showHUD('Point the camera at the floor…');

  // Frame loop (unchanged text & fields aside from width calculation + bands update)
  function onFrame(time, frame) {
    const pose = frame.getViewerPose(refSpace);
    if (pose) {
      const results = frame.getHitTestResults(hitSource);
      if (results.length) {
        const hitPose = results[0].getPose(refSpace);
        if (hitPose) {
          const camY = pose.transform.position.y;
          const groundY = hitPose.transform.position.y;

          const heightM = Math.max(0, camY - groundY);
          const heightIn = heightM * M_TO_IN;

          // ---- width calculation (in inches) ----
          const widthIn = calcWidthFromHeightIn(heightIn);

          // Update buttons based on width
          updateBandsUI(widthIn);

          const tiltText = TILT.ready
            ? ` | Pitch: ${TILT.pitchDeg.toFixed(1)}°`
            : ' | Tilt: (initializing)';

          // Show both height and width in HUD
          showHUD(`Height: ${heightIn.toFixed(1)} in  |  Width: ${widthIn.toFixed(1)} in${tiltText}`);
        }
      } else {
        const tiltText = TILT.ready ? ` | Pitch: ${TILT.pitchDeg.toFixed(1)}° ` : '';
        showHUD(`No surface detected—aim at the floor.${tiltText}`);
      }
    } else {
      showHUD('Tracking…');
    }
    state.rafHandle = session.requestAnimationFrame(onFrame);
  }

  state.rafHandle = session.requestAnimationFrame(onFrame);
}

