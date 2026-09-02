
// ---------------------------------------------------------
// mainKnee.js — AR module with width indicators + ruler overlay
// ORIGINAL CODE + minimal groundY stability check
// ---------------------------------------------------------

import { HUD } from './Android_hud.js';
import { computeWidthFromHeight } from './Android_ModelKnee.js';
import {
  createRulerCanvas,
  removeRulerCanvas,
  drawRulerOverlay
} from './Android_overlay-Knee.js';

window.__MAIN_LOADED__ = true;
window.__MAIN_VERSION__ = "1.0.2-mainKnee";

// ---------------------------------------------------------
// Tilt sensing
// ---------------------------------------------------------

let TILT = { pitchDeg: 0, rollDeg: 0, ready: false };

let lastMeasuredWidth = 0;
let lastHeightIn = 0;
let hudErrorActive = false;

let calibratedGroundY = null; // meters
let groundDeviationIn = 0; // inches (latest)

let orientationListener = null;
let tiltTimeoutId = null;
let orientationChangeHandler = null;
let arExitInProgress = false;

let xrLoadingOverlay = null;
let xrReady = false;

let calibrationStartTime = null;
let groundSamples = [];

const GROUND_CALIBRATION_DELAY_MS = 1000;
const GROUND_CALIBRATION_SAMPLES = 30;

let calibrationFailed = false;
let unstableFrames = 0;

function isPortraitOrientation() {
  if (screen.orientation?.type) {
    return screen.orientation.type.startsWith("portrait");
  }

  return window.innerHeight > window.innerWidth;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

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

  if (lastHeightIn < 25) {
    hudErrorActive = true;

    HUD.error("Phone too low");

    setTimeout(() => {
      hudErrorActive = false;
    }, 4000);

    return null;
  }

  if (lastHeightIn > 55) {
    hudErrorActive = true;

    HUD.error("Phone too high");

    setTimeout(() => {
      hudErrorActive = false;
    }, 4000);

    return null;
  }

  // ✅ ORIGINAL behavior stays the same

  const width = lastMeasuredWidth;

  if (state.rafHandle && state.session) {
    try {
      state.session.cancelAnimationFrame(state.rafHandle);
    } catch (_) {}
  }

  if (state.session) {
    try {
      await state.session.end();
    } catch (_) {}
  }
  removeRulerCanvas();
  cleanup();

  return width;
}

export async function forceExitAR() {
  try {
    if (state.rafHandle && state.session) {
      try {
        state.session.cancelAnimationFrame(state.rafHandle);
      } catch {}
    }

    if (state.session) {
      try {
        await state.session.end();
      } catch {}
    }

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
    const roll = clamp(e.gamma, -90, 90);

    TILT.pitchDeg = ema(TILT.pitchDeg, pitch);
    TILT.rollDeg = ema(TILT.rollDeg, roll);

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

function showXRLoadingOverlay() {
  if (xrLoadingOverlay) return;

  xrLoadingOverlay = document.createElement("div");

  xrLoadingOverlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.65);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 999999;
    color: white;
    font-family: system-ui, sans-serif;
    font-size: 18px;
    font-weight: 600;
    pointer-events: none;
    text-align: center;
    white-space: pre-line;
  `;

  xrLoadingOverlay.textContent =
    "Please Wait...\nLoading AR & Calibrating\n\nSlowly Move Phone Around";

  document.body.appendChild(xrLoadingOverlay);
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
    session = await navigator.xr.requestSession(
      "immersive-ar",
      {
        requiredFeatures: ["hit-test"],
        optionalFeatures: ["dom-overlay", "local-floor"],
        domOverlay: { root: document.body }
      }
    );
  } catch (err) {
    HUD.error("Failed to request AR session.");
    console.error(err);
    return;
  }

  state.session = session;

  calibrationStartTime = performance.now();
  groundSamples = [];

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
    removeRulerCanvas();
    cleanup();
  });

  const glCanvas = document.createElement("canvas");

  const gl = glCanvas.getContext("webgl", {
    xrCompatible: true
  });

  if (!gl) {
    HUD.error("WebGL unavailable.");
    session.end();
    return;
  }

  await gl.makeXRCompatible();

  state.gl = gl;

  session.updateRenderState({
    baseLayer: new XRWebGLLayer(session, gl)
  });

  let refSpace;

  try {
    refSpace = await session.requestReferenceSpace(
      "local-floor"
    );
  } catch {
    refSpace = await session.requestReferenceSpace(
      "local"
    );
  }

  state.refSpace = refSpace;

  state.viewerSpace =
    await session.requestReferenceSpace("viewer");

  let hitSource;

  try {
    hitSource = await session.requestHitTestSource({
      space: state.viewerSpace,
      offsetRay: new XRRay(
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: -1 }
      )
    });
  } catch (err) {
    HUD.error("Unable to start measurement.");
    await session.end();
    return;
  }

  state.hitSource = hitSource;
  createRulerCanvas();

  HUD.show("");

  function onFrame(t, frame) {
    const pose = frame.getViewerPose(refSpace);

    if (pose) {
      const hits = frame.getHitTestResults(hitSource);

      if (hits.length) {
        const hit = hits[0].getPose(refSpace);

        if (hit) {
          const camY = pose.transform.position.y;
          const groundY = hit.transform.position.y;

          // -------------------------------------------------
          // Ground calibration
          // Wait 1 second, then collect 20 samples and average
          // -------------------------------------------------

          if (calibratedGroundY === null) {
            const elapsed =
              performance.now() - calibrationStartTime;

            if (
              !calibrationFailed &&
              elapsed > 10000
            ) {
              calibrationFailed = true;

              HUD.error(
                "Unable to start measurement.\nPlease try again."
              );

              setTimeout(() => {
                forceExitAR();
              }, 2000);

              return;
            }

            if (elapsed < GROUND_CALIBRATION_DELAY_MS) {
              state.rafHandle =
                session.requestAnimationFrame(onFrame);
              return;
            }

            groundSamples.push(groundY);

            if (
              groundSamples.length <
              GROUND_CALIBRATION_SAMPLES
            ) {
              state.rafHandle =
                session.requestAnimationFrame(onFrame);
              return;
            }

            calibratedGroundY =
              groundSamples.reduce(
                (sum, v) => sum + v,
                0
              ) / groundSamples.length;

            groundSamples = [];
          }

          if (!xrReady) {
            xrReady = true;
            hideXRLoadingOverlay();
          }

          // ✅ Compute deviation from calibration (in inches)

          groundDeviationIn = Math.abs((groundY - calibratedGroundY) * M_TO_IN);

          const heightM = Math.max(0,camY - calibratedGroundY);

          const heightIn = heightM * M_TO_IN;
          const widthIn = computeWidthFromHeight(heightIn);

          lastMeasuredWidth = widthIn;
          lastHeightIn = heightIn;
          drawRulerOverlay(widthIn, TILT.pitchDeg);

          // -------------------------------------------------
          // Ground deviation latch (ONE‑WAY)
          // -------------------------------------------------

          
          if (groundDeviationIn > 5.0) {
           unstableFrames++;
          } else {
           unstableFrames = 0;
          }

          if (unstableFrames > 30) {
          calibratedGroundY = groundY;
          unstableFrames = 0;
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

          const tiltOk =
            TILT.ready &&
            Math.abs(TILT.pitchDeg) < 10;

          // -------------------------------------------------
          // Final button eligibility
          // -------------------------------------------------

          const buttonEnabled =
            heightOk &&
            tiltOk &&
            widthIn > 4.0 &&
            widthIn < 8.0 &&
            heightIn < 51 &&
            heightIn > 25;

          updateRecommendationButton(buttonEnabled);

          // -------------------------------------------------
          // HUD messaging priority
          // -------------------------------------------------
          
          if (
            unstableFrames >=30 &&
            !hudErrorActive
          ) {
            HUD.show(
              "Recalibrating AR plane..."
            );
          } else if (
            !tiltOk &&
            !hudErrorActive &&
            heightOk
          ) {
            HUD.show("Hold Phone Flat");
          } else if (
            !hudErrorActive &&
            heightOk &&
            tiltOk
          ) {
            HUD.show(
              "1: Position Knee in Overlay<br>" +
              "2: Move Phone to align Knee edges<br>" +
              "3: Tap “Product Recommendation”."
            );
          }

        }
      }
    }

    state.rafHandle =
      session.requestAnimationFrame(onFrame);
  }

  state.rafHandle =
    session.requestAnimationFrame(onFrame);
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

  calibrationStartTime = null;
  groundSamples = [];
  calibrationFailed = false;
  unstableFrames = 0;
  state.session = null;
  state.gl = null;
  state.hitSource = null;
  state.refSpace = null;
  state.viewerSpace = null;
  state.rafHandle = null;
}
