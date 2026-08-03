
import { HUD } from '../Android/hud.js';
import { createRulerCanvas, removeRulerCanvas, drawRulerOverlay } from './overlay-ruler.js';

window.__MAIN_LOADED__ = true;
window.__MAIN_VERSION__ = "product-module";

let TILT = { pitchDeg: 0, rollDeg: 0, ready: false, source: 'none' };
const M_TO_IN = 39.37007874015748;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

const state = {
  session: null,
  gl: null,
  hitSource: null,
  refSpace: null,
  viewerSpace: null,
  smoothWindow: [],
  rafHandle: null
};

function toDeg(rad) { return rad * (180 / Math.PI); }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function ema(prev, next, a=0.2) { return prev == null ? next : prev*(1-a)+next*a; }

export function isSessionActive() { return !!state.session; }

export async function stopMain() {
  if (state.session) {
    try { await state.session.end(); } catch(e){}
  }
}

export async function startMain() {
  HUD.show("Checking device...");
  if (!isSecureContext) { HUD.error("HTTPS required."); return; }
  if (isIOS) { HUD.error("iOS Safari has no AR hit test."); return; }

  let supports = false;
  try {
    const xr = navigator.xr;
    supports = xr && xr.isSessionSupported && await xr.isSessionSupported("immersive-ar");
  } catch(e) { supports = false; }

  if (!supports) { HUD.error("AR not supported."); return; }

  await startTilt();
  await startXR();
}

async function startTilt() {
  try {
    if (typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function") {
      let perm = await DeviceOrientationEvent.requestPermission();
      if (perm === "granted") {
        window.addEventListener("deviceorientation", onTilt, { passive:true });
        TILT.ready = true; return;
      }
    }
    window.addEventListener("deviceorientation", onTilt, { passive:true });
    TILT.ready = true;
  } catch(e){
    TILT.ready = false;
  }
}

function onTilt(e){
  const pitch = clamp(e.beta ?? 0, -180,180);
  const roll  = clamp(e.gamma ?? 0,-90,90);
  TILT.pitchDeg = ema(TILT.pitchDeg, pitch);
  TILT.rollDeg  = ema(TILT.rollDeg,  roll);
  TILT.ready = true;
}

async function startXR(){
  let session;
  try {
    session = await navigator.xr.requestSession("immersive-ar", {
      requiredFeatures:["hit-test"],
      optionalFeatures:["dom-overlay","local-floor"],
      domOverlay:{ root:document.body }
    });
  } catch(e){ HUD.error("AR request failed."); return; }

  state.session = session;

  session.addEventListener("end", ()=>{
    removeWidthIndicators();
    removeRulerCanvas();
    cleanup();
    HUD.show("AR session ended.");
  });

  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl",{ xrCompatible:true });
  if (!gl){ HUD.error("WebGL unavailable."); session.end(); return; }

  await gl.makeXRCompatible();
  state.gl = gl;
  session.updateRenderState({ baseLayer:new XRWebGLLayer(session,gl) });

  let refSpace;
  try { refSpace = await session.requestReferenceSpace("local-floor"); }
  catch{ refSpace = await session.requestReferenceSpace("local"); }
  state.refSpace = refSpace;
  state.viewerSpace = await session.requestReferenceSpace("viewer");

  const hitSource = await session.requestHitTestSource({
    space: state.viewerSpace,
    offsetRay: new XRRay({x:0,y:0,z:0},{x:0,y:0,z:-1})
  });
  state.hitSource = hitSource;

  HUD.show("Point the camera at the floor...");
  createWidthIndicators();
  createRulerCanvas();

  function onFrame(t, frame){
    const pose = frame.getViewerPose(refSpace);
    if (pose){
      const results = frame.getHitTestResults(hitSource);
      if (results.length){
        const hit = results[0].getPose(refSpace);
        if (hit){
          const camY = pose.transform.position.y;
          const groundY = hit.transform.position.y;
          const heightM = Math.max(0, camY-groundY);
          const height = heightM * M_TO_IN;
          const width = 0.1522*height + 0.1957;

          updateWidthIndicators(width);
          drawRulerOverlay(width, TILT.rollDeg);

          HUD.show(`Height: ${height.toFixed(1)}in\nWidth: ${width.toFixed(2)}in\nPitch: ${TILT.pitchDeg.toFixed(1)}°`);
        }
      }
    }
    state.rafHandle = session.requestAnimationFrame(onFrame);
  }

  state.rafHandle = session.requestAnimationFrame(onFrame);
}

function removeWidthIndicators(){
  const el = document.getElementById("width-indicators");
  if (el) el.remove();
}

function cleanup(){
  if (state.hitSource?.cancel) try{ state.hitSource.cancel(); }catch(e){}
  if (state.rafHandle) try{ state.session.cancelAnimationFrame(state.rafHandle); }catch(e){}
  state.session=null;
  state.gl=null;
  state.hitSource=null;
  state.refSpace=null;
  state.viewerSpace=null;
  state.rafHandle=null;
}
