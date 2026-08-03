
// ---------------------------------------------------------
// mainKnee.js — AR module with width indicators + ruler overlay
// ORIGINAL CODE + minimal groundY stability check
// ---------------------------------------------------------

import { HUD } from '../Android/hud.js';
import { computeWidthFromHeight } from './WidthModel.js';
import {
  createRulerCanvas,
  removeRulerCanvas,
  drawRulerOverlay
} from './overlay-ruler.js';

window.__MAIN_LOADED__ = true;
window.__MAIN_VERSION__ = "1.0.1-mainKnee";

// ---------------------------------------------------------
// Tilt sensing
// ---------------------------------------------------------
let TILT = { pitchDeg: 0, rollDeg: 0, ready: false };
let lastMeasuredWidth = 0;
let lastHeightIn = 0;
let hudErrorActive = false;

let calibratedGroundY = null;   // meters
let groundDeviationIn = 0;     // inches (latest)


function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function ema(prev, next, a = 0.2) {
  return prev == null ? next : prev * (1 - a) + next * a;
}

// ---------------------------------------------------------
// Environment + State
// ---------------------------------------------------------
const M_TO_IN = 39.37007874015748;

// ✅ MINIMAL ground stability tracking (PASSIVE ONLY)
const GROUND_WINDOW_SIZE = 15;   // ~250ms worth of frames
const GROUND_STABILITY_IN = 5;   // inches
let groundYSamples = [];

const state = {
  session: null,
  gl: null,
  hitSource: null,
  refSpace: null,
  viewerSpace: null,
  rafHandle: null
};

// ---------------------------------------------------------
// Required Exports
// ---------------------------------------------------------
export function isSessionActive() {
  return !!state.session;
}


export async function stopMain() {

  // ✅ validation first (INLINE, original flow preserved)
  if (groundDeviationIn > 2.0) {
    hudErrorActive = true;
    HUD.error("AR plane not stable. Hold still.");
    setTimeout(() => hudErrorActive = false, 4000);
    return null;
  }

  if (lastHeightIn < 25) {
    hudErrorActive = true;
    HUD.error("Phone too low");
    setTimeout(() => hudErrorActive = false, 4000);
    return null;
  }

  if (lastHeightIn > 55) {
    hudErrorActive = true;
    HUD.error("Phone too high");
    setTimeout(() => hudErrorActive = false, 4000);
    return null;
  }

  // ✅ ORIGINAL behavior stays the same
  const width = lastMeasuredWidth;

  if (state.rafHandle && state.session) {
    try { state.session.cancelAnimationFrame(state.rafHandle); } catch (_) {}
  }

  if (state.session) {
    try { await state.session.end(); } catch (_) {}
  }

  removeWidthIndicators();
  removeRulerCanvas();
  cleanup();

  return width;
}


// ---------------------------------------------------------
// ENTRY POINT
// ---------------------------------------------------------
export async function startMain() {
  HUD.show("Checking device…");

  if (!isSecureContext) {
    HUD.error("HTTPS required.");
    return;
  }

  let supported = false;
  try {
    supported =
      navigator.xr &&
      navigator.xr.isSessionSupported &&
      await navigator.xr.isSessionSupported("immersive-ar");
  } catch {}

  if (!supported) {
    HUD.error("WebXR AR not supported.");
    return;
  }

  await startTiltSensing();
  await startWebXR();
}

// ---------------------------------------------------------
// TILT SENSOR INITIALIZATION
// ---------------------------------------------------------
async function startTiltSensing() {
  try {
    window.addEventListener("deviceorientation", e => {
      const pitch = clamp(e.beta ?? 0, -180, 180);
      const roll  = clamp(e.gamma ?? 0, -90, 90);
      TILT.pitchDeg = ema(TILT.pitchDeg, pitch);
      TILT.rollDeg  = ema(TILT.rollDeg, roll);
      TILT.ready = true;
    }, { passive:true });
  } catch {
    TILT.ready = false;
  }
}

// ---------------------------------------------------------
// WIDTH INDICATORS UI
// ---------------------------------------------------------
function createWidthIndicators() {
  const container = document.createElement("div");
  container.id = "width-indicators";
  container.style.cssText = `
    position: fixed;
    top: 6rem;
    left: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    z-index: 99999;
  `;

  const ranges = ["4-5", "5-6", "6-7", "7-8"];

  ranges.forEach(r => {
    const btn = document.createElement("button");
    btn.className = "indicator";
    btn.dataset.range = r;
    btn.textContent = r.replace("-", "–") + " in";
    btn.style.cssText = `
      padding: 0.5rem 1rem;
      background: #666;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 14px;
    `;
    container.appendChild(btn);
  });

  document.body.appendChild(container);
}

function removeWidthIndicators() {
  const el = document.getElementById("width-indicators");
  if (el) el.remove();
}

function updateWidthIndicators(widthIn) {
  const buttons = document.querySelectorAll(".indicator");
  buttons.forEach(btn => {
    btn.style.background = "#666";
    const [min, max] = btn.dataset.range.split("-").map(Number);
    if (widthIn >= min && widthIn < max) {
      btn.style.background = "green";
    }
  });
}


// ---------------------------------------------------------
// START WEBXR — EXACT ORIGINAL STRUCTURE
// ---------------------------------------------------------
async function startWebXR() {

  HUD.show("Requesting AR session…");

let session;
  try {
    session = await navigator.xr.requestSession("immersive-ar", {
      requiredFeatures:["hit-test"],
      optionalFeatures:["dom-overlay","local-floor"],
      domOverlay:{ root:document.body }
    });
  } catch (err) {
    HUD.error("Failed to request AR session.");
    console.error(err);
    return;
  }

  state.session = session;

  session.addEventListener("end", () => {
    removeWidthIndicators();
    removeRulerCanvas();
    cleanup();
    HUD.show("AR session ended.");
  });

  const glCanvas = document.createElement("canvas");
  const gl = glCanvas.getContext("webgl", { xrCompatible:true });

  if (!gl) {
    HUD.error("WebGL unavailable.");
    session.end();
    return;
  }

  await gl.makeXRCompatible();
  state.gl = gl;

  session.updateRenderState({ baseLayer:new XRWebGLLayer(session, gl) });

  let refSpace;
  try { refSpace = await session.requestReferenceSpace("local-floor"); }
  catch { refSpace = await session.requestReferenceSpace("local"); }

  state.refSpace = refSpace;
  state.viewerSpace = await session.requestReferenceSpace("viewer");

  const hitSource = await session.requestHitTestSource({
    space: state.viewerSpace,
    offsetRay: new XRRay({x:0,y:0,z:0}, {x:0,y:0,z:-1})
  });
  state.hitSource = hitSource;

  HUD.show("Point the camera at the floor…");
  createWidthIndicators();
  createRulerCanvas();

  //document.getElementById("exit-ar-btn").style.display = "block";
  
 
function onFrame(t, frame) {

  const pose = frame.getViewerPose(refSpace);

  if (pose) {
    const hits = frame.getHitTestResults(hitSource);

    if (hits.length) {
      const hit = hits[0].getPose(refSpace);

      if (hit) {
        const camY = pose.transform.position.y;
        const groundY = hit.transform.position.y;
        const groundYIn = groundY * M_TO_IN;

        // ✅ Calibrate on first valid groundY
        if (calibratedGroundY === null) {
          calibratedGroundY = groundY;
        }

        // ✅ Compute deviation from calibration (in inches)
        groundDeviationIn = Math.abs(
          (groundY - calibratedGroundY) * M_TO_IN
        );

        const heightM = Math.max(0, camY - groundY);
        const heightIn = heightM * M_TO_IN;
        const widthIn = computeWidthFromHeight(heightIn);

        lastMeasuredWidth = widthIn;
        lastHeightIn = heightIn;

        updateWidthIndicators(widthIn);
        drawRulerOverlay(widthIn, TILT.rollDeg);

        if (!hudErrorActive) {
          HUD.show(
            `Height: ${heightIn.toFixed(1)} in\n` +
            `Width: ${widthIn.toFixed(2)} in\n` +
            `GroundY: ${groundYIn.toFixed(2)} in\n` +
            `ΔGround: ${groundDeviationIn.toFixed(2)} in\n` +
            `Pitch: ${TILT.pitchDeg.toFixed(1)}°`
          );
        }
      }
    }
  }

  state.rafHandle = session.requestAnimationFrame(onFrame);
}


  state.rafHandle = session.requestAnimationFrame(onFrame);
}

// ---------------------------------------------------------
// CLEANUP
// ---------------------------------------------------------
function cleanup() {
  if (state.hitSource?.cancel) {
    try { state.hitSource.cancel(); } catch (_) {}
  }

  if (state.rafHandle) {
    try { state.session.cancelAnimationFrame(state.rafHandle); } catch (_) {}
  }

  groundYSamples.length = 0;

  state.session = null;
  state.gl = null;
  state.hitSource = null;
  state.refSpace = null;
  state.viewerSpace = null;
  state.rafHandle = null;
}
