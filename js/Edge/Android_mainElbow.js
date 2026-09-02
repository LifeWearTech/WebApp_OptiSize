
// ---------------------------------------------------------
// mainKnee.js — AR module with width indicators + ruler overlay
// ORIGINAL CODE + minimal groundY stability check
// ---------------------------------------------------------

import { HUD } from './Android_hud.js';
import { computeWidthFromHeight } from './Android_ModelElbow.js';
import {
  createRulerCanvas,
  removeRulerCanvas,
  drawRulerOverlay
} from './Android_overlay-Elbow.js';

window.__MAIN_LOADED__ = true;
window.__MAIN_VERSION__ = "1.0.2-mainElbow";

// ---------------------------------------------------------
// Tilt sensing
// ---------------------------------------------------------
let TILT = { pitchDeg: 0, rollDeg: 0, ready: false };
let lastMeasuredWidth = 0;
let lastHeightIn = 0;
let hudErrorActive = false;

let calibratedGroundY = null;   // meters
let groundDeviationIn = 0;     // inches (latest)
let groundPlaneEverUnstable = false;   // 🔒 latched forever
let orientationListener = null;
let tiltTimeoutId = null;
let orientationChangeHandler = null;
let arExitInProgress = false;

let xrLoadingOverlay = null;
let xrReady = false;




function isPortraitOrientation() {

  if (screen.orientation?.type) {
    return screen.orientation.type.startsWith("portrait");
  }

  return window.innerHeight > window.innerWidth;
}


function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function ema(prev, next, a = 0.2) {
  return prev == null ? next : prev * (1 - a) + next * a;
}

// ---------------------------------------------------------
// Environment + State
// ---------------------------------------------------------
const M_TO_IN = 39.37007874015748;

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
  if (groundDeviationIn > 5.0) {
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


export async function forceExitAR() {
  try {
    HUD.show("Exiting AR…");

    if (state.rafHandle && state.session) {
      try { state.session.cancelAnimationFrame(state.rafHandle); } catch {}
    }

    if (state.session) {
      try { await state.session.end(); } catch {}
    }

    removeWidthIndicators();
    removeRulerCanvas();
    cleanup();
  } finally {
    // Navigate home unconditionally
    window.location.href = "/";
  }
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


  
  HUD.show("Checking device…");

  if (!isPortraitOrientation()) {
    HUD.error(
      "Please hold phone in portrait orientation."
    );
    return;
  }


  await startTiltSensing();
  await startWebXR();
}

// ---------------------------------------------------------
// TILT SENSOR INITIALIZATION
// ---------------------------------------------------------

function startTiltSensing() {

  TILT.ready = false;

  orientationListener = (e) => {

    if (
      e.beta === null ||
      e.gamma === null
    ) {
      return;
    }

    const pitch = clamp(e.beta, -180, 180);
    const roll  = clamp(e.gamma, -90, 90);

    TILT.pitchDeg = ema(TILT.pitchDeg, pitch);
    TILT.rollDeg  = ema(TILT.rollDeg, roll);

    TILT.ready = true;
  };


window.addEventListener(
  "deviceorientation",
  orientationListener,
  { passive: true }
);

  // Fail-safe if sensor never starts
  tiltTimeoutId = setTimeout(() => {

    if (!TILT.ready) {

      HUD.error(
        "Orientation sensor unavailable.\n" +
        "Tilt detection is not working."
      );

      updateRecommendationButton(false);
    }

  }, 3000);
}




function updateRecommendationButton(enabled) {
  const btn = document.getElementById("exit-ar-btn");
  if (!btn) return;

  btn.disabled = !enabled;
  btn.style.opacity = enabled ? "1.0" : "0.5";
  btn.style.pointerEvents = enabled ? "auto" : "none";
}



// ---------------------------------------------------------
// WIDTH INDICATORS UI
// ---------------------------------------------------------



function createWidthIndicators() {
  const container = document.createElement("div");
  container.id = "width-indicators";
  container.style.cssText = `
    position: fixed;
    top: 15rem;
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
    z-index: 99999;

    /* ✅ Safe-area + responsiveness */
    padding-left: calc(1rem + env(safe-area-inset-left));
    padding-right: calc(1rem + env(safe-area-inset-right));
    pointer-events: none;
  `;

  const row = document.createElement("div");
  row.style.cssText = `
    display: flex;
    flex-wrap: wrap;               /* ✅ wrap on small screens */
    gap: 0.5rem;
    max-width: 420px;              /* ✅ prevents tablet overstretch */
    justify-content: center;
  `;

  const ranges = ["4-5", "5-6", "6-7", "7-8"];

  ranges.forEach(r => {
    const btn = document.createElement("button");
    btn.className = "indicator";
    btn.dataset.range = r;
    btn.textContent = r.replace("-", "–") + " in";
    btn.style.cssText = `
      padding: 0.45rem 0.7rem;
      background: #666;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      white-space: nowrap;          /* ✅ prevents text wrapping */
      pointer-events: none;
    `;
    row.appendChild(btn);
  });

  container.appendChild(row);
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



function showXRLoadingOverlay() {

  if (xrLoadingOverlay) return;

  xrLoadingOverlay = document.createElement("div");

  xrLoadingOverlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.65);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    z-index: 999999;
    color: white;
    font-family: system-ui, sans-serif;
  `;

  xrLoadingOverlay.innerHTML = `
    <div style="
      width:48px;
      height:48px;
      border:5px solid rgba(255,255,255,0.3);
      border-top-color:white;
      border-radius:50%;
      animation:spin 1s linear infinite;
    "></div>

    <div style="
      margin-top:16px;
      font-size:18px;
      font-weight:600;
    ">
      Loading AR...
    </div>

    <div style="
      margin-top:8px;
      font-size:14px;
      opacity:0.85;
      text-align:center;
    ">
      Move phone slowly to detect floor
    </div>
  `;

  document.body.appendChild(xrLoadingOverlay);

  if (!document.getElementById("xr-loading-style")) {

    const style = document.createElement("style");

    style.id = "xr-loading-style";

    style.textContent = `
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `;

    document.head.appendChild(style);
  }
}


function hideXRLoadingOverlay() {

  if (xrLoadingOverlay) {
    xrLoadingOverlay.remove();
    xrLoadingOverlay = null;
  }
}





// ---------------------------------------------------------
// START WEBXR — EXACT ORIGINAL STRUCTURE
// ---------------------------------------------------------
async function startWebXR() {

  HUD.show("Requesting AR session…");
  
  xrReady = false;
  showXRLoadingOverlay();


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



orientationChangeHandler = async () => {

  if (arExitInProgress) {
    return;
  }

  if (!isPortraitOrientation()) {

    arExitInProgress = true;

    HUD.error(
      "Landscape mode detected.\nExiting AR..."
    );

    await forceExitAR();
  }
};

screen.orientation?.addEventListener(
  "change",
  orientationChangeHandler
);

window.addEventListener(
  "orientationchange",
  orientationChangeHandler
);


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

  createWidthIndicators();
  createRulerCanvas();
  HUD.show("");
 


function onFrame(t, frame) {
  const pose = frame.getViewerPose(refSpace);

  if (pose) {
    const hits = frame.getHitTestResults(hitSource);

    if (hits.length) {
      const hit = hits[0].getPose(refSpace);

      if (hit) {
        
        if (!xrReady) {
        xrReady = true;
        hideXRLoadingOverlay();
        }

        const camY = pose.transform.position.y;
        const groundY = hit.transform.position.y;

        // ✅ Calibrate on first valid groundY
        if (calibratedGroundY === null) {
          calibratedGroundY = groundY;
        }

        // ✅ Compute deviation from calibration (in inches)
        groundDeviationIn = Math.abs(
          (groundY - calibratedGroundY) * M_TO_IN
        );

        const heightM  = Math.max(0, camY - groundY);
        const heightIn = heightM * M_TO_IN;
        const widthIn  = computeWidthFromHeight(heightIn);

        lastMeasuredWidth = widthIn;
        lastHeightIn = heightIn;

        updateWidthIndicators(widthIn);
        drawRulerOverlay(widthIn, TILT.pitchDeg);

        // -------------------------------------------------
        // Ground deviation latch (ONE‑WAY)
        // -------------------------------------------------
        if (groundDeviationIn > 5.0 && !groundPlaneEverUnstable) {
          groundPlaneEverUnstable = true;
        }

        // -------------------------------------------------
        // Height bands
        // -------------------------------------------------
        let heightOk = true;

        if (heightIn > 51) {
          heightOk = false;
          HUD.show("Phone too high");
        } else if (heightIn < 25) {
          heightOk = false;
          HUD.show("Phone too close to ground");
        }

        // -------------------------------------------------
        // Tilt check (absolute)
        // -------------------------------------------------
        
        
        const tiltOk =  TILT.ready &&   Math.abs(TILT.pitchDeg) < 10;


        // -------------------------------------------------
        // Final button eligibility
        // -------------------------------------------------

        const buttonEnabled =
          heightOk &&
          tiltOk &&
          !groundPlaneEverUnstable &&
          widthIn > 4.0 && 
          widthIn < 8.0 && 
          heightIn <51 &&
          heightIn >25;

        updateRecommendationButton(buttonEnabled);

        // -------------------------------------------------
        // HUD messaging priority
        // -------------------------------------------------
        if (groundPlaneEverUnstable) {
          HUD.show(
            "AR plane not stable\n" +
            "Exit AR and measure again"
          );

        } else if (!tiltOk && !hudErrorActive && heightOk) {
          HUD.show("Hold Phone Flat");

        } else if (!hudErrorActive && heightOk && tiltOk) {
          /*HUD.show(
            `Height: ${heightIn.toFixed(1)} in\n` +
            `Width: ${widthIn.toFixed(2)} in\n` +
            `ΔGround: ${groundDeviationIn.toFixed(2)} in\n` +
            `Pitch: ${TILT.pitchDeg.toFixed(1)}°`
          );*/
        
          HUD.show(
          "1: Position Knee in Overlay<br>" +
          "2: Move Phone to align Knee edges<br>" +
          "3: Tap “Product Recommendation” for products that fit you."
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


if (orientationChangeHandler) {

  screen.orientation?.removeEventListener(
    "change",
    orientationChangeHandler
  );

  window.removeEventListener(
    "orientationchange",
    orientationChangeHandler
  );

  orientationChangeHandler = null;
}


  if (orientationListener) {
    window.removeEventListener(
      "deviceorientation",
      orientationListener
    );
    orientationListener = null;
  }

  if (state.hitSource?.cancel) {
    try {
      state.hitSource.cancel();
    } catch (_) {}
  }

  if (state.rafHandle && state.session) {
    try {
      state.session.cancelAnimationFrame(
        state.rafHandle
      );
    } catch (_) {}
  }

  // Reset AR state
  calibratedGroundY = null;
  groundDeviationIn = 0;
  groundPlaneEverUnstable = false;

  lastMeasuredWidth = 0;
  lastHeightIn = 0;
  arExitInProgress = false;

  hudErrorActive = false;

  TILT = {
    pitchDeg: 0,
    rollDeg: 0,
    ready: false
  };

  
if (tiltTimeoutId) {
  clearTimeout(tiltTimeoutId);
  tiltTimeoutId = null;
}


  hideXRLoadingOverlay();
  xrReady = false;


  state.session = null;
  state.gl = null;
  state.hitSource = null;
  state.refSpace = null;
  state.viewerSpace = null;
  state.rafHandle = null;
}
