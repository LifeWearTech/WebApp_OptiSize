
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
    image: "/assets/Instructions/KneeInstructions.jpg",
    bullets: [
      "Position your knee clearly in the frame.",
      "Make sure lighting is even and glare-free.",
      "Stand still for accurate measurement.",
      "Align your knee with the ruler."
    ]
  },

  Ankle: {
    image: "/assets/Instructions/AnkleInstructions.jpg",
    bullets: [
      "Center your ankle in the frame.",
      "Ensure a clean background behind your foot.",
      "Hold your phone steady.",
      "Follow the on-screen measurement guide."
    ]
  }

};

const instructionSet =INSTRUCTIONS[type] ||INSTRUCTIONS.Knee;

/* --------------------------------------------------------
   Render Instructions
-------------------------------------------------------- */

const container = document.getElementById("scroll-container");
container.innerHTML = "";

const card = document.createElement("div");
card.className = "instruction-card";


/* --------------------------------------------------------
   IMAGE
-------------------------------------------------------- */

const img = document.createElement("img");

img.loading = "eager";
img.decoding = "async";

img.src = instructionSet.image;

img.alt =  `${type} measurement instructions`;

card.appendChild(img);

/* --------------------------------------------------------
   BULLETS
-------------------------------------------------------- */

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

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");

    script.src = src;
    script.onload = resolve;
    script.onerror = reject;

    document.head.appendChild(script);
  });
}
/* --------------------------------------------------------
   START AR (clean + correct)
-------------------------------------------------------- */
measureBtn.onclick = async () => {

  ensureARDom();

  // Load Knee Model
  if (!window.KneeModel) {
    try {await loadScript("/js/iOS/iOS_Model_Knee.js");
    } catch (e) {return;}
  }
  if (!window.KneeOverlay) {
    try {await loadScript("/js/iOS/iOS_Overlay_Knee.js");
    } catch (e) {return;}
}
  if (!window.KneeTilt) {
    try {await loadScript("/js/iOS/iOS_Tilt_Knee.js");
    } catch (e) {return;}
}

  if (!window.KneeCalButton) {
    try {await loadScript("/js/iOS/iOS_CalibrationButton_Knee.js");
    } catch (e) {return;}
}

  if (!window.KneeToast) {
    try {await loadScript("/js/iOS/iOS_Toast_Knee.js");
    } catch (e) {return;}
}
  // Request iOS motion permission
  if (
    typeof DeviceOrientationEvent !== "undefined" &&
    typeof DeviceOrientationEvent.requestPermission === "function"
  ) {

    try {

      const permission =
        await DeviceOrientationEvent.requestPermission();

      if (permission !== "granted") {
        alert("Motion access is required.");
        return;
      }

    } catch (e) {
      console.error("Motion permission denied:", e);
      return;
    }
  }

  // Hide entire instructions UI
  container.style.display = "none";
  measureBtn.style.display = "none";

  document.body.style.background = "#000";

  window.xrCanvas = document.createElement("canvas");
  window.xrCanvas.id = "xr8-canvas";
  document.body.appendChild(window.xrCanvas);

  window.startAR = function () {
    try {
      XR8.run({
        canvas: window.xrCanvas,
        xrConfig: {
          referenceSpaceType: "local-floor"
        }
      });
    } catch (e) {
      console.error("XR start failed:", e);
    }
  };

  if (window.XR8) {

    window.wireXR();
    window.startAR();

  } else {

    window.addEventListener(
      "xrloaded",
      () => {
        window.wireXR();
        window.startAR();
      },
      { once: true }
    );

  }

};