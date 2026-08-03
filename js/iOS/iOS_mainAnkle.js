
/****************************************************
 * ios.js — XR8 SAFE, Android-Parity Overlay + Width
 ****************************************************/
(function () {

  const M_TO_IN = 39.37007874015748;
  const IN_PER_M = 39.37007874015748;
  const DRAW_EVERY = 2;        // draw points every N frames; set 1 for max fidelity
  const MAX_POINTS = 150000;   // sanity cap
  const params = new URLSearchParams(window.location.search);
  const type = params.get("p") || "Knee";
  const selectedProductId = params.get("prod") || "";
  const selectedRetailer = params.get("retailer") || "All";


  const hud    = document.getElementById("hud");
  const start  = document.getElementById("start");
  const canvas = document.getElementById("xr8-canvas");
  const recBtn = document.getElementById("exit-ar-btn");
  const exitBtn = document.getElementById("exit-ar-hard-btn");

  const show = t => { if (hud) hud.textContent = t; };

  let lastMeasuredWidth = 0;
  let calibratedGroundY = null;
  
  let lastHeightIn = 0;
  let hudErrorActive = false;



// ---------------------------------------------------------
// Width model — knee width from height (iOS runtime-safe)
// ---------------------------------------------------------

const LOW_DIST = 25.0
const HIGH_DIST = 51.2;

function clampDistance(d) {
  return Math.min(Math.max(d, LOW_DIST), HIGH_DIST);
}

function calculateWidth(distance) {
  const clamped = clampDistance(distance);
   return (0.1522 * clamped + 0.1957);
}

function erfUpdate(x) {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p  = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);

  const t = 1.0 / (1.0 + p * x);
  const poly = (((((a5*t + a4)*t + a3)*t + a2)*t + a1)*t);
  const y = 1.0 - poly * Math.exp(-x * x);

  return Math.min(Math.max(sign * y, -1), 1);
}

function phiUpdate(x) {
  const sqrt2 = 1.4142135623730951;
  const ax = Math.abs(x);

  if (ax < 8.0) {
    return 0.5 * (1.0 + erfUpdate(x / sqrt2));
  }

  const invSqrt2pi = 0.3989422804014327;
  const phi = invSqrt2pi * Math.exp(-0.5 * x * x);

  if (x > 0) {
    return 1.0 - phi / (ax + 1.0/(ax + 2.0/(ax + 3.0)));
  } else {
    return phi / (ax + 1.0/(ax + 2.0/(ax + 3.0)));
  }
}

function probabilityInRange(lower, upper, measuredValue, sd) {
  const zLower = (lower - measuredValue) / sd;
  const zUpper = (upper - measuredValue) / sd;
  return (phiUpdate(zUpper) - phiUpdate(zLower)) * 100.0;
}

function computeWeightedEstimate(probabilities, centers) {
  const total = probabilities.reduce((a, b) => a + b, 0);
  if (total === 0) return centers[0];

  let weighted = 0;
  for (let i = 0; i < probabilities.length; i++) {
    weighted += centers[i] * probabilities[i];
  }
  return weighted / total;
}

function computeWidthFromHeight(heightIn) {
  if (!Number.isFinite(heightIn) || heightIn <= 0) {
    return NaN;
  }

  const est = calculateWidth(heightIn);

  const probs = [
    probabilityInRange(4.0, 5.25, est, 0.2) / 100.0,
    probabilityInRange(5.0, 6.3,  est, 0.2) / 100.0,
    probabilityInRange(6.0, 7.35, est, 0.2) / 100.0,
    probabilityInRange(7.0, 8.4,  est, 0.2) / 100.0
  ].map(p => Math.min(Math.max(p, 0), 1));

  const centers = [4.5, 5.5, 6.675, 7.7];
  return computeWeightedEstimate(probs, centers);
}

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

  
function updateRecommendationButton(enabled) {
  if (!recBtn) return;

  recBtn.disabled = !enabled;
  recBtn.style.opacity = enabled ? "1.0" : "0.5";
  recBtn.style.pointerEvents = enabled ? "auto" : "none";
}


/* =====================================================
   PURE 2D RULER OVERLAY — XR8 SAFE (iOS + Android)
   ===================================================== */


let rulerCanvas = null;
let rulerCtx = null;
let rulerDPR = window.devicePixelRatio || 1;

function createRulerCanvas() {
  if (rulerCanvas) return;

  rulerCanvas = document.createElement("canvas");
  rulerCanvas.id = "ruler-canvas";
  rulerCanvas.style.position = "fixed";
  rulerCanvas.style.top = "0";
  rulerCanvas.style.left = "0";
  rulerCanvas.style.width = "100%";
  rulerCanvas.style.height = "100%";
  rulerCanvas.style.pointerEvents = "none";
  rulerCanvas.style.zIndex = "99998";

  document.body.appendChild(rulerCanvas);
  rulerCtx = rulerCanvas.getContext("2d");

  resizeRulerCanvas();
  window.addEventListener("resize", resizeRulerCanvas);
}

function removeRulerCanvas() {
  if (!rulerCanvas) return;
  rulerCanvas.remove();
  rulerCanvas = null;
  rulerCtx = null;
}

function resizeRulerCanvas() {
  if (!rulerCanvas) return;

  const w = window.innerWidth;
  const h = window.innerHeight;

  rulerCanvas.width  = w * rulerDPR;
  rulerCanvas.height = h * rulerDPR;
}

function drawRulerOverlay2D(widthIn, tiltDeg) {
  if (!rulerCtx || !rulerCanvas) return;

  const ctx = rulerCtx;
  ctx.clearRect(0, 0, rulerCanvas.width, rulerCanvas.height);
  ctx.save();
  ctx.scale(rulerDPR, rulerDPR);

  const w = window.innerWidth;
  const h = window.innerHeight;

  /* ===== Color based on tilt ===== */
  const strokeColor = Math.abs(tiltDeg) > 5 ? "red" : "lime";

  /* ===== Scale logic ===== */
  const reference = 5;
  const raw = widthIn / reference;
  const scale = Math.max(0.6, Math.min(raw, 1.0));

  /* ===== Placement ===== */
  const centerX = w / 2;
  const centerY = h * 0.6;
  const radius = (w * 0.18) * scale;

  const leftX = centerX - radius;
  const rightX = centerX + radius;

  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 4;

  /* ===== Baseline ===== */
  ctx.beginPath();
  ctx.moveTo(leftX, centerY);
  ctx.lineTo(rightX, centerY);
  ctx.stroke();

  /* =========================================================
     Long end ticks (unchanged)
     ========================================================= */

  const endTickHeight = 30;

  ctx.beginPath();
  ctx.moveTo(leftX, centerY - endTickHeight);
  ctx.lineTo(leftX, centerY + endTickHeight);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(rightX, centerY - endTickHeight);
  ctx.lineTo(rightX, centerY + endTickHeight);
  ctx.stroke();

  /* =========================================================
     POLISHED: Uniform graduations with every 4th tick taller
     ========================================================= */

  const totalTicks = 10;        // evenly spaced across the ruler
  const shortTickHeight = 8;    // normal tick
  const longTickHeight = 15;    // every 4th tick

  const stepX = (rightX - leftX) / totalTicks;
  ctx.lineWidth = 2;

  for (let i = 0; i <= totalTicks; i++) {
    const x = leftX + i * stepX;
    const isMajorTick = i % 4 === 0;
    const tickHeight = isMajorTick ? longTickHeight : shortTickHeight;

    ctx.beginPath();
    ctx.moveTo(x, centerY - tickHeight);
    ctx.lineTo(x, centerY + tickHeight);
    ctx.stroke();
  }

  /* ===== Centered width label ===== */
  ctx.fillStyle = strokeColor;
  ctx.font = "22px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(
    `${widthIn.toFixed(2)} in`,
    centerX,
    centerY - endTickHeight - 10
  );

  /* ===== Center label ===== */
  ctx.font = "20px sans-serif";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Knee", centerX, centerY + 40);

  /* ===== Side labels (unchanged) ===== */
  const labelLeft = ["Left", "Side", "of", "Ankle"];
  const labelRight = ["Right", "Side", "of", "Ankle"];

  ctx.font = "15px sans-serif";
  ctx.textAlign = "center";

  const lineHeight = 18;

  let yLeft = centerY - ((labelLeft.length - 1) * lineHeight) / 2;
  labelLeft.forEach(line => {
    ctx.fillText(line, leftX - 15, yLeft);
    yLeft += lineHeight;
  });

  let yRight = centerY - ((labelRight.length - 1) * lineHeight) / 2;
  labelRight.forEach(line => {
    ctx.fillText(line, rightX + 15, yRight);
    yRight += lineHeight;
  });

  ctx.restore();
}


 
  // ----------- Preflight -----------
  function preflight() {
    if (!window.THREE) { show('Three.js not loaded'); return false; }
    if (!window.XR8)   { show('XR8 not loaded yet…'); return false; }
    if (!(window.XRExtras && XRExtras.FullWindowCanvas && XRExtras.FullWindowCanvas.pipelineModule)) {
      show('XR Extras not loaded — check xrextras.js'); return false;
    }
    return true;
  }

  // Safe scene accessor (guards undefined camera in early frames)
  function getXRSceneSafe() {
    if (!(window.XR8 && XR8.Threejs && XR8.Threejs.xrScene)) return null;
    var xrs = XR8.Threejs.xrScene();
    if (!xrs || !xrs.camera) return null;
    return xrs;
  }

  // ----------- THREE Objects -----------
  var pointsGeom, pointsMat, pointsMesh;
  var capacity = 0;                 // xyz capacity
  var posAttr = null;               // cached BufferAttribute
  var frameCount = 0;

  var gridHelper = null;
  var reticle    = null;

  function ensureGround(scene) {
    if (!gridHelper) {
      gridHelper = new THREE.GridHelper(6, 24, 0x22ffaa, 0x0b3a2e);
      gridHelper.position.set(0, 0, 0);
      gridHelper.material.opacity = 0.6;
      gridHelper.material.transparent = true;
      gridHelper.visible = false; // show once tracking NORMAL
      scene.add(gridHelper);
    }
    if (!reticle) {
      var inner = 0.07, outer = 0.085;
      var ring = new THREE.RingGeometry(inner, outer, 48);
      var mat  = new THREE.MeshBasicMaterial({ color: 0xffd54f, side: THREE.DoubleSide });
      reticle = new THREE.Mesh(ring, mat);
      reticle.rotation.x = -Math.PI / 2;
      reticle.position.set(0, 0, 0);
      reticle.visible = false;
      scene.add(reticle);
    }
  }

  function ensurePointsMesh(scene, requiredCount) {
    var neededXYZ = requiredCount * 3;
    if (!pointsGeom) pointsGeom = new THREE.BufferGeometry();

    if (!posAttr || capacity < neededXYZ) {
      var newCap = Math.min(
        Math.max(neededXYZ, capacity ? Math.ceil(capacity * 1.5) : 3000),
        MAX_POINTS * 3
      );
      var arr = new Float32Array(newCap);
      pointsGeom.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      posAttr  = pointsGeom.getAttribute('position');
      capacity = newCap;
    }

    if (!pointsMat) {
      pointsMat = new THREE.PointsMaterial({
        color: 0x00e5ff, size: 0.01, sizeAttenuation: true
      });
    }
    if (!pointsMesh) {
      pointsMesh = new THREE.Points(pointsGeom, pointsMat);
      pointsMesh.frustumCulled = false;
      scene.add(pointsMesh);
    }
    return posAttr;
  }

  // Center-ray ∩ y=0 (horizontal ground)
  function centerRayToGround(scene, biasV) {
    var camera = scene.camera;
    var u = 0.50, v = Math.min(1.0, Math.max(0.0, biasV || 0.70));
    var ndcX = (u * 2.0) - 1.0;
    var ndcY = (v * 2.0) - 1.0;

    var origin = new THREE.Vector3().copy(camera.position);
    var ndcVec = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(camera);
    var dir    = new THREE.Vector3().copy(ndcVec).sub(camera.position).normalize();

    var EPS = 1e-6;
    if (Math.abs(dir.y) < EPS) return null;
    var t = -origin.y / dir.y;
    if (t <= 0) return null;

    return new THREE.Vector3(origin.x + t * dir.x, 0.0, origin.z + t * dir.z);
  }

  // ----------- Build XR pipeline -----------
  function wireXR() {
    if (!preflight()) return;

    // Surface runtime errors (avoid silent freezes)
    window.addEventListener('xrerror', function (e) {
      show('XR error: ' + (e && e.message ? e.message : e));
      console.error('[XR error]', e);
    });

    // Configure BEFORE run(): enable worldPoints, return meters (absolute)
    XR8.XrController.configure({
      disableWorldTracking: false,
      enableWorldPoints: true,
      scale: 'absolute',
      mirroredDisplay: false,
      leftHandedAxes: false
    });

    var worldModule = function () {
      return {
        name: 'world_dots_ground',
        onException: function (err) {
          show('Module error: ' + (err && err.message ? err.message : err));
          console.error('[Module error]', err);
        },

        onStart: function () {
          updateRecommendationButton(false);
          var xrs = getXRSceneSafe();
          if (!xrs) return;
          ensureGround(xrs.scene);
          // ✅ UI only: create width indicators once
          if (!document.getElementById("width-indicators")) {
          createWidthIndicators();
          createRulerCanvas();
          }
          
          // ✅ SHOW AR ACTION BUTTONS
          exitBtn.style.display = "block";
          recBtn.style.display = "block";
         
        },

        onUpdate: function (evt) {
          var r = evt && evt.processCpuResult && evt.processCpuResult.reality;
          var status = (r && r.trackingStatus) || 'LIMITED';
          var reason = (r && r.trackingReason) || 'UNSPECIFIED';
          var pts    = (r && r.worldPoints) || [];

          var xrs = getXRSceneSafe();
          if (!xrs) {
            show('Initializing camera…');
            return;
          }
          var scene  = xrs.scene;
          var camera = xrs.camera;

          // --- Draw world points (throttled) ---
          frameCount++;
          var shouldDraw = (frameCount % DRAW_EVERY === 0);

          var count = 0;
          if (shouldDraw) {
            if (Array.isArray(pts)) {
              count = Math.min(pts.length, MAX_POINTS);
              var attr = ensurePointsMesh(scene, count);
              var arr  = attr.array;
              for (var i = 0; i < count; i++) {
                var p = pts[i].position || pts[i];
                var j = i * 3;
                arr[j+0] = p.x; arr[j+1] = p.y; arr[j+2] = p.z;
              }
              pointsGeom.setDrawRange(0, count);
              attr.needsUpdate = true;
              if ((frameCount % (DRAW_EVERY * 15)) === 0) {
                pointsGeom.computeBoundingSphere && pointsGeom.computeBoundingSphere();
              }
            } else if (pts && pts.buffer) {
              var raw = new Float32Array(pts.buffer, pts.byteOffset, pts.length);
              count = Math.min(Math.floor(raw.length / 3), MAX_POINTS);
              var attr2 = ensurePointsMesh(scene, count);
              attr2.array.set(raw.subarray(0, count * 3));
              pointsGeom.setDrawRange(0, count);
              attr2.needsUpdate = true;
              if ((frameCount % (DRAW_EVERY * 15)) === 0) {
                pointsGeom.computeBoundingSphere && pointsGeom.computeBoundingSphere();
              }
            } else {
              if (pointsGeom) pointsGeom.setDrawRange(0, 0);
            }
          } else {
            count = pointsGeom ? Math.floor(pointsGeom.drawRange.count) : 0;
          }

          // --- Ground grid + reticle ---
          if (gridHelper) gridHelper.visible = (status === 'NORMAL');
          if (reticle) {
            var hit = centerRayToGround(xrs, 0.70);
            if (hit) {
              reticle.position.copy(hit);
              reticle.visible = (status === 'NORMAL');
            } else {
              reticle.visible = false;
            }
          }

          // --- HUD: height + status + world point count ---
          var camY = camera && camera.position ? camera.position.y : 0;
          var m    = Math.max(0, camY)*M_TO_IN;
          
          lastHeightIn = m;
          lastMeasuredWidth = computeWidthFromHeight(m);
          
        const heightOk = (lastHeightIn >= 25 && lastHeightIn <= 55);

// ✅ (optional simple tilt proxy — XR8 doesn't give same tilt directly)
// keep always true for now (safe)
        const tiltOk = true;

// ✅ no ground tracking in XR8 → assume stable
        const groundStable = true;

        const buttonEnabled = heightOk && tiltOk && groundStable;
        updateRecommendationButton(buttonEnabled);


          drawRulerOverlay2D(lastMeasuredWidth, 3);
          updateWidthIndicators(lastMeasuredWidth);
          
      if (!heightOk) {
       if (lastHeightIn < 25) {
       show("Phone too close to ground");
  } else {
    show("Phone too high");
  }
} else {
  show(
    "1: Position Knee in Overlay\n" +
    "2: Move Phone to align Knee edges\n" +
    "3: Tap Product Recommendation"
  );
}

        }
      };
    };

    // Pipeline — XR Extras FullWindowCanvas = zero-code sizing & projection sync
    XR8.addCameraPipelineModules([
      XR8.GlTextureRenderer.pipelineModule(), // camera feed
      XR8.Threejs.pipelineModule(),           // Three.js scene & camera
      XR8.XrController.pipelineModule(),      // 6DoF + controller feed (reality.*)
      XRExtras.FullWindowCanvas.pipelineModule(),
      worldModule()
    ]);

    // Start (one-time)
    start.addEventListener('click', function () {
      try {
        start.style.display = 'none';
        XR8.run({ canvas }); // Extras manages canvas sizing + projection
        show('Stabilizing… move slowly for ~1–2s');
      } catch (e) {
        show('Start error: ' + (e && e.message ? e.message : e));
        console.error(e);
      }
    }, { once: true });

    show('Engine ready. Tap Start.');
  }



  if (window.XR8) wireXR();
  else window.addEventListener("xrloaded", wireXR);

  /* =====================================================
     Buttons (unchanged semantics)
     ===================================================== */
    

recBtn.onclick = () => {

  if (lastHeightIn < 25) {
    show("Phone too low");
    return;
  }

  if (lastHeightIn > 55) {
    show("Phone too high");
    return;
  }

  try { XR8.stop(); } catch {}

  removeWidthIndicators();
  removeRulerCanvas();

  // ✅ correct values
  const measuredWidth = lastMeasuredWidth;

  // ✅ correct condition
  if (selectedProductId && selectedProductId !== "null") {

    const url =
      `/pages/iOS/iOS_results.html` +
      `?width=${encodeURIComponent(measuredWidth)}` +
      `&type=${encodeURIComponent(type)}` +
      `&prod=${encodeURIComponent(selectedProductId)}`;

    setTimeout(() => {
      window.location.href = url;
    }, 50); // ✅ XR8 safe

    return;
  }

  // ✅ retailer flow
  const url =
    `/pages/iOS/iOS_Select_Retailer.html` +
    `?type=${encodeURIComponent(type)}` +
    `&width=${encodeURIComponent(measuredWidth)}`;

  setTimeout(() => {
    window.location.href = url;
  }, 50);
};

  exitBtn.onclick = () => {
    try { XR8.stop(); } catch {}
    removeWidthIndicators();
    removeRulerCanvas();
    window.location.href = "/";
  };

})();
