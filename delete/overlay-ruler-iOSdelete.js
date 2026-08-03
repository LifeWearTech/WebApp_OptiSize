
/****************************************************
 * overlay-ruler-iOS.js
 * --------------------------------------------------
 * XR8-SAFE ruler overlay using Three.js (no DOM canvas)
 * Matches Android ruler behavior visually
 ****************************************************/

let rulerGroup = null;
let arc = null;
let baseline = null;
let ticks = [];
let labelMesh = null;

/* --------------------------------------------------
   Create overlay (called ONCE after XR starts)
-------------------------------------------------- */
function createRulerOverlayXR8(scene) {
  if (rulerGroup) return;

  rulerGroup = new THREE.Group();
  rulerGroup.visible = true;

  /* ===== Baseline ===== */
  const baseGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3( 1, 0, 0),
  ]);
  baseline = new THREE.Line(
    baseGeom,
    new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 })
  );
  rulerGroup.add(baseline);

  /* ===== Arc ===== */
  const arcPoints = [];
  const segments = 48;
  for (let i = 0; i <= segments; i++) {
    const t = Math.PI * (i / segments);
    arcPoints.push(
      new THREE.Vector3(Math.cos(t), Math.sin(t), 0)
    );
  }

  const arcGeom = new THREE.BufferGeometry().setFromPoints(arcPoints);
  arc = new THREE.Line(
    arcGeom,
    new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 })
  );
  rulerGroup.add(arc);

  /* ===== Ticks ===== */
  for (let i = 0; i <= 20; i++) {
    const isMajor = i % 4 === 0;
    const h = isMajor ? 0.12 : 0.06;

    const tickGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -h, 0),
      new THREE.Vector3(0,  h, 0),
    ]);

    const tick = new THREE.Line(
      tickGeom,
      new THREE.LineBasicMaterial({ color: 0x00ff00 })
    );
    ticks.push(tick);
    rulerGroup.add(tick);
  }

  /* ===== Label ===== */
  const sprite = makeTextSprite("0.00 in");
  labelMesh = sprite;
  rulerGroup.add(labelMesh);

  // Position relative to camera later
  scene.add(rulerGroup);
}

/* --------------------------------------------------
   Update overlay every frame
-------------------------------------------------- */
function drawRulerOverlayXR8(scene, camera, widthIn, tiltDeg) {
  if (!rulerGroup || !Number.isFinite(widthIn)) return;

  const color = Math.abs(tiltDeg) > 5 ? 0xff0000 : 0x00ff00;
  baseline.material.color.setHex(color);
  arc.material.color.setHex(color);
  ticks.forEach(t => t.material.color.setHex(color));

  const reference = 7.6;
  const scale = Math.max(0.4, Math.min(widthIn / reference, 1.0));

  const y = -0.7;
  rulerGroup.position.set(0, y, -1.5);
  rulerGroup.scale.set(scale, scale, scale);
  rulerGroup.quaternion.copy(camera.quaternion);

  const leftX = -1;
  const rightX = 1;

  baseline.geometry.setFromPoints([
    new THREE.Vector3(leftX, 0, 0),
    new THREE.Vector3(rightX, 0, 0),
  ]);

  // Update ticks
  for (let i = 0; i < ticks.length; i++) {
    const t = ticks[i];
    const x = leftX + (i / 20) * (rightX - leftX);
    t.position.set(x, 0, 0);
  }

  labelMesh.position.set(0, 0.35, 0);
  updateTextSprite(labelMesh, `${widthIn.toFixed(2)} in`);
}

/* --------------------------------------------------
   Cleanup
-------------------------------------------------- */
function removeRulerOverlayXR8(scene) {
  if (!rulerGroup) return;
  scene.remove(rulerGroup);
  rulerGroup = null;
  arc = null;
  baseline = null;
  ticks = [];
}

/* --------------------------------------------------
   Text helpers
-------------------------------------------------- */
function makeTextSprite(text) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = "48px sans-serif";
  ctx.fillStyle = "#00ff00";
  ctx.fillText(text, 10, 50);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1, 0.4, 1);
  sprite.userData.ctx = ctx;
  sprite.userData.canvas = canvas;
  sprite.userData.texture = texture;
  return sprite;
}

function updateTextSprite(sprite, text) {
  const ctx = sprite.userData.ctx;
  const canvas = sprite.userData.canvas;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillText(text, 10, 50);
  sprite.material.map.needsUpdate = true;
}

/* --------------------------------------------------
   ✅ Globals for ios.js
-------------------------------------------------- */
window.createRulerOverlayXR8 = createRulerOverlayXR8;
window.drawRulerOverlayXR8   = drawRulerOverlayXR8;
window.removeRulerOverlayXR8 = removeRulerOverlayXR8;
