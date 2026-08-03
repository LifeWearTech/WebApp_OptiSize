
/****************************************************
 * ios.js — XR8 SAFE, Android-Parity Overlay + Width
 ****************************************************/
(function () {

  const M_TO_IN = 39.37007874015748;

  const hud    = document.getElementById("hud");
  const start  = document.getElementById("start");
  const canvas = document.getElementById("xr8-canvas");
  const recBtn = document.getElementById("exit-ar-btn");
  const exitBtn = document.getElementById("exit-ar-hard-btn");

  const show = t => { if (hud) hud.textContent = t; };

  let lastMeasuredWidth = 0;
  let calibratedGroundY = null;

  /* =====================================================
     WIDTH INDICATORS — SAME AS ANDROID
     ===================================================== */
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
      padding-left: calc(1rem + env(safe-area-inset-left));
      padding-right: calc(1rem + env(safe-area-inset-right));
      pointer-events: none;
    `;

    const row = document.createElement("div");
    row.style.cssText = `
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      max-width: 420px;
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
        white-space: nowrap;
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

  /* =====================================================
     XR helpers (unchanged)
     ===================================================== */
  function preflight() {
    if (!window.THREE) { show("Three.js not loaded"); return false; }
    if (!window.XR8) { show("XR8 not loaded"); return false; }
    if (!(window.XRExtras && XRExtras.FullWindowCanvas)) {
      show("XRExtras missing"); return false;
    }
    return true;
  }

  function getXRSceneSafe() {
    if (!(window.XR8 && XR8.Threejs && XR8.Threejs.xrScene)) return null;
    const xrs = XR8.Threejs.xrScene();
    if (!xrs || !xrs.camera) return null;
    return xrs;
  }

  function centerRayToGround(scene) {
    const cam = scene.camera;
    const o = cam.position.clone();
    const d = new THREE.Vector3(0,-1,0)
      .applyQuaternion(cam.quaternion)
      .normalize();

    if (Math.abs(d.y) < 1e-6) return null;
    const t = -o.y / d.y;
    return t > 0 ? o.add(d.multiplyScalar(t)) : null;
  }

  /* =====================================================
     XR8 wiring (DO NOT TOUCH)
     ===================================================== */
  function wireXR() {
    if (!preflight()) return;

    XR8.XrController.configure({
      disableWorldTracking: false,
      enableWorldPoints: true,
      scale: "absolute"
    });

    const worldModule = () => ({
      name: "world_ios_parity",

      onStart() {
        if (recBtn) recBtn.style.display = "block";
        if (exitBtn) exitBtn.style.display = "block";

        // ✅ same lifecycle as Android
        window.createRulerCanvas();
        createWidthIndicators();
      },

      onUpdate() {
        const xrs = getXRSceneSafe();
        if (!xrs) {
          show("Initializing camera…");
          return;
        }

        const hit = centerRayToGround(xrs);
        if (!hit) {
          show("Searching for ground…");
          return;
        }

        if (calibratedGroundY === null) {
          calibratedGroundY = hit.y;
        }

        const heightIn =
          Math.max(0, xrs.camera.position.y - hit.y) * M_TO_IN;

        lastMeasuredWidth = window.computeWidthFromHeight(heightIn);

        window.drawRulerOverlay(lastMeasuredWidth, 3);
        updateWidthIndicators(lastMeasuredWidth);

        show(
          `Height: ${heightIn.toFixed(1)} in\n` +
          `Width: ${lastMeasuredWidth.toFixed(2)} in`
        );
      }
    });

    XR8.addCameraPipelineModules([
      XR8.GlTextureRenderer.pipelineModule(),
      XR8.Threejs.pipelineModule(),
      XR8.XrController.pipelineModule(),
      XRExtras.FullWindowCanvas.pipelineModule(),
      worldModule()
    ]);

    start.addEventListener("click", () => {
      start.style.display = "none";
      XR8.run({ canvas });
      show("Stabilizing… move slowly");
    }, { once:true });

    show("Engine ready. Tap Start.");
  }

  if (window.XR8) wireXR();
  else window.addEventListener("xrloaded", wireXR);

  /* =====================================================
     Buttons (unchanged semantics)
     ===================================================== */
  recBtn.onclick = () => {
    try { XR8.stop(); } catch {}
    removeWidthIndicators();
    window.removeRulerCanvas();
    window.location.href =
      `/pages/results.html?width=${encodeURIComponent(lastMeasuredWidth)}`;
  };

  exitBtn.onclick = () => {
    try { XR8.stop(); } catch {}
    removeWidthIndicators();
    window.removeRulerCanvas();
    window.location.href = "/";
  };

})();
