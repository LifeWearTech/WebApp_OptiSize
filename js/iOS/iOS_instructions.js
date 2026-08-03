
// =========================================================
// iOS_instructions.js — MINIMAL CLEAN VERSION
// =========================================================

const params = new URLSearchParams(window.location.search);
const type = params.get("p") || "Knee";

/* --------------------------------------------------------
   Instructions Data
-------------------------------------------------------- */

const INSTRUCTIONS = {
  Knee: {
    image: "/assets/Instructions/KneeInstructions.png",
    bullets: [
      "Position your knee clearly in the frame.",
      "Make sure lighting is even and glare-free.",
      "Stand still for accurate measurement.",
      "Align your knee with the curved ruler overlay."
    ]
  }
};

const instructionSet = INSTRUCTIONS[type];

/* --------------------------------------------------------
   Render Instructions
-------------------------------------------------------- */

const container = document.getElementById("scroll-container");
container.innerHTML = "";

const card = document.createElement("div");
card.className = "instruction-card";



instructionSet.bullets.forEach(text => {
  const p = document.createElement("p");
  p.textContent = `• ${text}`;
  card.appendChild(p);
});

container.appendChild(card);

/* --------------------------------------------------------
   Single Start Button ONLY
-------------------------------------------------------- */

const measureBtn = document.getElementById("measure-btn");

/* --------------------------------------------------------
   AR DOM (only what AR needs)
-------------------------------------------------------- */

function ensureARDom() {

  // ✅ HUD
  if (!document.getElementById("hud")) {
    const hud = document.createElement("div");
    hud.id = "hud";
    hud.textContent = "Starting AR…";

    hud.style.position = "fixed";
    hud.style.top = "20px";
    hud.style.left = "20px";
    hud.style.zIndex = "10000";
    hud.style.padding = "8px 12px";
    hud.style.background = "rgba(0,0,0,0.6)";
    hud.style.color = "#fff";
    hud.style.borderRadius = "8px";

    document.body.appendChild(hud);
  }

  // ✅ Action row (hidden until AR starts)
  if (!document.getElementById("ar-action-row")) {
    const row = document.createElement("div");
    row.id = "ar-action-row";

    row.style.position = "fixed";
    row.style.bottom = "30px";
    row.style.left = "20px";
    row.style.right = "20px";
    row.style.display = "flex";
    row.style.gap = "10px";
    row.style.zIndex = "10001";

    document.body.appendChild(row);
  }

  // ✅ Recommendation button
  if (!document.getElementById("exit-ar-btn")) {
    const btn = document.createElement("button");
    btn.id = "exit-ar-btn";
    btn.textContent = "Product Recommendation";
    btn.style.flex = "1";
    btn.style.display = "none";

    document.getElementById("ar-action-row").appendChild(btn);
  }

  // ✅ Exit button (AR only — not instructions)
  if (!document.getElementById("exit-ar-hard-btn")) {
    const btn = document.createElement("button");
    btn.id = "exit-ar-hard-btn";
    btn.textContent = "Exit AR";
    btn.style.flex = "1";
    btn.style.display = "none";

    document.getElementById("ar-action-row").appendChild(btn);
  }
}

/* --------------------------------------------------------
   START AR (clean + correct)
-------------------------------------------------------- */

measureBtn.onclick = () => {

  ensureARDom();

  // ✅ Hide entire instructions UI
  container.style.display = "none";
  measureBtn.style.display = "none";

  document.body.style.background = "#000";

  // ✅ Create XR canvas
  const canvas = document.createElement("canvas");
  canvas.id = "xr8-canvas";
  document.body.appendChild(canvas);

  function startAR() {
    try {
      XR8.run({ canvas });
    } catch (e) {
      console.error("XR start failed:", e);
    }
  }

  // ✅ Ensure pipeline wired BEFORE run
  if (window.XR8) {
    window.wireXR();
    startAR();
  } else {
    window.addEventListener("xrloaded", () => {
      window.wireXR();
      startAR();
    }, { once: true });
  }
};
