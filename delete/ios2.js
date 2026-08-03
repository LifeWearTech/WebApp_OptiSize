
/****************************************************
 * ios.js — World Points (dots) + Height (absolute) using XR Extras
 * ---------------------------------------------------------------
 * - Zero-code sizing: XRExtras.FullWindowCanvas keeps canvas + projection synced.
 * - configure() BEFORE run(): enableWorldPoints, scale:'absolute'
 * - onUpdate(): render worldPoints as cyan THREE.Points, show height (m, in)
 ****************************************************/
(function () {
  const IN_PER_M = 39.37007874015748;

  const hud    = document.getElementById('hud');
  const start  = document.getElementById('start');
  const canvas = document.getElementById('xr8-canvas');
  const show   = (t) => { if (hud) hud.textContent = t; };

  // ---------- Preflight (defensive checks so Start always wires up) ----------
  function preflight() {
    if (!window.THREE) {
      show('Three.js not loaded — check <script> tag for Three.');
      return false;
    }
    if (!window.XR8) {
      show('XR8 not loaded yet…');
      return false;
    }
    if (!window.XRExtras?.FullWindowCanvas?.pipelineModule) {
      show('XR Extras not loaded — check xrextras.js.');
      return false;
    }
    return true;
  }

  // ---------- Dots renderer (THREE.Points) ----------
  let pointsGeom, pointsMat, pointsMesh;
  function ensurePointsMesh(scene, count) {
    const needed = count * 3;
    if (!pointsGeom) pointsGeom = new THREE.BufferGeometry();
    const posAttr = pointsGeom.getAttribute('position');
    if (!posAttr || posAttr.array.length !== needed) {
      pointsGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(needed), 3));
    }
    if (!pointsMat) {
      pointsMat = new THREE.PointsMaterial({
        color: 0x00e5ff,  // cyan
        size: 0.01,       // ~1 cm (absolute scale)
        sizeAttenuation: true
      });
    }
    if (!pointsMesh) {
      pointsMesh = new THREE.Points(pointsGeom, pointsMat);
      pointsMesh.frustumCulled = false;
      scene.add(pointsMesh);
    }
    return pointsGeom.getAttribute('position');
  }

  // ---------- Build XR pipeline ----------
  function wireXR() {
    if (!preflight()) return;

    // Configure BEFORE run(): publish worldPoints; return real meters.
    XR8.XrController.configure({
      disableWorldTracking: false,
      enableWorldPoints: true,
      scale: 'absolute',
      mirroredDisplay: false,
      leftHandedAxes: false,
    });

    // Module: render world points + show height in HUD
    const worldPointsModule = () => ({
      name: 'worldpoints',
      onUpdate: ({ processCpuResult }) => {
        const r = processCpuResult?.reality;         // controller pipeline data
        const pts = r?.worldPoints || [];            // world points stream
        const status = r?.trackingStatus ?? 'LIMITED';
        const reason = r?.trackingReason ?? 'UNSPECIFIED';

        const { scene, camera } = XR8.Threejs.xrScene();

        // Normalize world points to Float32Array [x,y,z,...]
        let arr;
        if (Array.isArray(pts)) {
          const n = pts.length;
          arr = new Float32Array(n * 3);
          for (let i = 0; i < n; i++) {
            const p = pts[i].position || pts[i]; // tolerate {x,y,z} direct
            arr[i*3+0] = p.x;
            arr[i*3+1] = p.y;
            arr[i*3+2] = p.z;
          }
        } else if (pts && pts.buffer) {
          arr = new Float32Array(pts.buffer, pts.byteOffset, pts.length);
        } else {
          show(`Tracking: ${status} (${reason}) — World points: 0`);
          return;
        }

        // Render the point cloud
        const count = Math.floor(arr.length / 3);
        const pos = ensurePointsMesh(scene, count);
        pos.array.set(arr);
        pos.needsUpdate = true;
        pointsGeom.computeBoundingSphere?.();

        // Height (absolute scale → meters)
        const camY = camera?.position?.y ?? 0;
        const m  = Math.max(0, camY);
        const inch = m * IN_PER_M;

        show(
          `Tracking: ${status}${status==='LIMITED' ? ` (${reason})` : ''} | ` +
          `World points: ${count.toLocaleString()} | ` +
          `Height: ${m.toFixed(2)} m (${inch.toFixed(1)} in)`
        );
      }
    });

    // Pipeline (XR Extras FullWindowCanvas keeps canvas sized & projection synced)
    XR8.addCameraPipelineModules([
      XR8.GlTextureRenderer.pipelineModule(),     // camera feed
      XR8.Threejs.pipelineModule(),               // Three.js scene/camera managed by XR8
      XR8.XrController.pipelineModule(),          // SLAM + per-frame controller data
      XRExtras.FullWindowCanvas.pipelineModule(), // zero-code sizing/projection sync
      worldPointsModule(),
    ]);

    // One-time Start wiring (defensive)
    start.addEventListener('click', () => {
      try {
        start.style.display = 'none';
        XR8.run({ canvas });                      // Extras handles sizing/sync automatically
        show('Stabilizing… move slowly for ~1–2s');
      } catch (e) {
        show(`Start error: ${e?.message || e}`);
        console.error(e);
      }
    }, { once: true });

    show('Engine ready. Tap Start.');
  }

  // ---------- Boot when engine is ready ----------
  if (window.XR8) {
    wireXR();
  } else {
    window.addEventListener('xrloaded', wireXR);
  }
})();
