
(function () {

  const exitBtn = document.getElementById("exit-ar-hard-btn");
  const M_TO_IN = 39.37;

  function show(t) {
    const hud = document.getElementById("hud");
    if (hud) {
      hud.style.whiteSpace = "pre-line";
      hud.textContent = t;
    }
  }

  // ✅ CONFIG
  const SAMPLE_COUNT = 12;

  // ✅ STATE
  let samples = [];
  let floorY = null;

  // ✅ UTIL: percentile
  function getPercentile(arr, p) {
    const idx = (arr.length - 1) * p;
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    if (lower === upper) return arr[lower];
    return arr[lower] * (upper - idx) + arr[upper] * (idx - lower);
  }

  // ✅ UTIL: median
  function median(arr) {
    const mid = Math.floor(arr.length / 2);
    return arr.length % 2 === 0
      ? (arr[mid - 1] + arr[mid]) / 2
      : arr[mid];
  }

  window.wireXR = function () {

    XR8.XrController.configure({
      enableWorldPoints: true
    });

    XR8.addCameraPipelineModules([

      XR8.GlTextureRenderer.pipelineModule(),
      XR8.Threejs.pipelineModule(),
      XR8.XrController.pipelineModule(),
      XRExtras.FullWindowCanvas.pipelineModule(),

      {
        name: "height-ground-debug",

        onStart: function () {
          const { scene } = XR8.Threejs.xrScene();

          this.meshes = [];
          this.lastUpdate = 0;

          this.MAX_POINTS = 120;
          this.currentIndex = 0;

          const geo = new THREE.SphereGeometry(0.02, 6, 6);
          const mat = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            depthTest: true
          });

          for (let i = 0; i < this.MAX_POINTS; i++) {
            const m = new THREE.Mesh(geo, mat);
            m.visible = false;
            scene.add(m);
            this.meshes.push(m);
          }

          show("✅ IQR Floor Detection Active");
        },

        onUpdate: function () {

          const now = Date.now();
          if (now - this.lastUpdate < 250) return;
          this.lastUpdate = now;

          const { camera } = XR8.Threejs.xrScene();

          // ✅ bias downward (important for floor)
          const xs = [0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9];
          const ys = [0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9];

          let txt = "H / Y (in):\n";

          let countDisplay = 0;
          const MAX_DISPLAY = 20;

          let frameYs = [];

          // ✅ collect points
          for (let xi = 0; xi < xs.length; xi++) {
            for (let yi = 0; yi < ys.length; yi++) {

              const hits = XR8.XrController.hitTest(
                xs[xi],
                ys[yi],
                ["FEATURE_POINT"]
              );

              if (!hits || hits.length === 0) continue;

              const p = hits[0].position;
              if (!p) continue;

              if (!isFinite(p.x) || !isFinite(p.y) || !isFinite(p.z)) continue;

              const cameraY = camera.position.y;

              // ✅ collect candidate Ys
              if (p.y < cameraY) {
                frameYs.push(p.y);
              }

              // ✅ debug display (unchanged)
              const heightMeters = cameraY - p.y;
              const heightIn = heightMeters * M_TO_IN;
              const groundYIn = p.y * M_TO_IN;

              if (countDisplay < MAX_DISPLAY) {
                txt += `${heightIn.toFixed(1)} / ${groundYIn.toFixed(1)}\n`;
                countDisplay++;
              }

              // ✅ render feature point
              const m = this.meshes[this.currentIndex];

              m.position.lerp(
                new THREE.Vector3(p.x, p.y, p.z),
                0.5
              );

              m.visible = true;

              this.currentIndex++;
              if (this.currentIndex >= this.MAX_POINTS) {
                this.currentIndex = 0;
              }
            }
          }

          // ✅ ===== IQR FILTER + MEDIAN =====
          if (frameYs.length > 0) {

            const sorted = [...frameYs].sort((a, b) => a - b);

            const Q1 = getPercentile(sorted, 0.25);
            const Q3 = getPercentile(sorted, 0.75);
            const IQR = Q3 - Q1;

            const lowerBound = Q1 - 1.5 * IQR;
            const upperBound = Q3 + 1.5 * IQR;

            // ✅ remove outliers
            const filtered = sorted.filter(v =>
              v >= lowerBound && v <= upperBound
            );

            if (filtered.length > 0) {

              const med = median(filtered);

              // ✅ temporal stability
              samples.push(med);
              if (samples.length > SAMPLE_COUNT) samples.shift();

              if (samples.length === SAMPLE_COUNT) {

                const sortedSamples = [...samples].sort((a, b) => a - b);
                floorY = median(sortedSamples);
              }

              // ✅ debug info
              txt += `\nIQR Filtered Count: ${filtered.length}`;
              txt += `\nQ1/Q3: ${Q1.toFixed(2)} / ${Q3.toFixed(2)}`;
            }
          }

          // ✅ FINAL OUTPUT
          if (floorY !== null) {

            const camY = camera.position.y;
            const heightMeters = camY - floorY;
            const heightInches = heightMeters * M_TO_IN;

            txt += `\n\n✅ FloorY: ${(floorY * M_TO_IN).toFixed(1)} in`;
            txt += `\n📏 Stable Height: ${heightInches.toFixed(2)} in`;

          } else {
            txt += "\n\n⏳ Detecting floor...";
          }

          show(txt);
        }
      }

    ]);
  };

  exitBtn.onclick = () => {
    try { XR8.stop(); } catch {}
    location.reload();
  };

})();
