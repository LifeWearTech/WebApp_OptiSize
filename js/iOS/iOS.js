
/****************************************************
 * ios.js — Optimized World Points + Height + Ground/Reticle (absolute)
 * --------------------------------------------------------------------
 * - Zero-code sizing: XRExtras.FullWindowCanvas (no manual fit/updates)
 * - configure() BEFORE run(): enableWorldPoints, scale:'absolute'
 * - Guards camera access to avoid "undefined camera.position" on early frames
 * - Optimized point cloud:
 *     • reuses buffers (no big per-frame allocation)
 *     • only reallocs when count increases
 *     • throttle to every Nth frame (DRAW_EVERY)
 * - Error surfacing: xrerror + onException to avoid silent freezes
 ****************************************************/
(function () {
  const IN_PER_M = 39.37007874015748;
  const DRAW_EVERY = 2;        // draw points every N frames; set 1 for max fidelity
  const MAX_POINTS = 150000;   // sanity cap

  const hud    = document.getElementById('hud');
  const start  = document.getElementById('start');
  const canvas = document.getElementById('xr8-canvas');
  const show   = (t) => { if (hud) hud.textContent = t; };



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
          var xrs = getXRSceneSafe();
          if (!xrs) return;
          ensureGround(xrs.scene);
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
          var m    = Math.max(0, camY);
          var inch = m * IN_PER_M;

          show(
            'Tracking: ' + status + (status === 'LIMITED' ? (' (' + reason + ')') : '') + ' | ' +
            'World points: ' + count.toLocaleString() + ' | ' +
            'Height: ' + m.toFixed(2) + ' m (' + inch.toFixed(1) + ' in)'
          );
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
  else window.addEventListener('xrloaded', wireXR);
})();

