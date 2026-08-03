
// =========================================================
// Android_instructions.js
//
// Purpose:
// - Display measurement instructions
// - Provide navigation back to main page
// - Launch AR measurement flow
//
// Production-ready version
// =========================================================

const params = new URLSearchParams(window.location.search);

const type = params.get("p") || "Knee";
const selectedProductId = params.get("prod") || "";

/*
  Prevent accidental double taps
  on Measure My Size button.
*/
let launchInProgress = false;


/*
  Prevent duplicate navigation
  from Product Recommendation button.
*/
let resultNavigationInProgress = false;


/* =========================================================
   INSTRUCTION DATA
========================================================= */

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

const instructionSet =
  INSTRUCTIONS[type] || INSTRUCTIONS.Knee;

/* =========================================================
   BUILD PAGE CONTENT
========================================================= */

const container =
  document.getElementById("scroll-container");

container.innerHTML = "";

/*
  Wrapper holds:
  - Back link
  - Instruction card
*/

const wrapper = document.createElement("div");

wrapper.style.width = "90%";
wrapper.style.maxWidth = "360px";

/*
  Prevent back link from sitting
  against the very top edge.
*/

wrapper.style.marginTop = "60px";

/* =========================================================
   BACK LINK
========================================================= */


const homeBtn = document.createElement("a");

homeBtn.href =
  "/main_Android.html";

homeBtn.innerHTML =
  '<span class="material-icons">home</span>';

homeBtn.style.position = "fixed";
homeBtn.style.top = "16px";
homeBtn.style.right = "16px";

homeBtn.style.color = "#2563eb";
homeBtn.style.textDecoration = "none";

homeBtn.style.zIndex = "1000";

wrapper.appendChild(homeBtn);

/* =========================================================
   CARD
========================================================= */

const card = document.createElement("div");

card.className = "instruction-card";

/* =========================================================
   IMAGE
========================================================= */

const img = document.createElement("img");

img.loading = "eager";
img.decoding = "async";

img.src = instructionSet.image;

img.alt =
  `${type} measurement instructions`;

card.appendChild(img);

/* =========================================================
   BULLETS
========================================================= */

instructionSet.bullets.forEach(text => {

  const p = document.createElement("p");

  p.textContent = `• ${text}`;

  card.appendChild(p);

});

wrapper.appendChild(card);

container.appendChild(wrapper);

/* =========================================================
   MEASURE BUTTON
========================================================= */

const measureBtn =
  document.getElementById("measure-btn");

measureBtn.style.width = "90%";
measureBtn.style.maxWidth = "360px";
measureBtn.style.boxSizing = "border-box";

/* =========================================================
   AR DOM
========================================================= */

function ensureARDom() {

  if (!document.getElementById("hud")) {

    const hud = document.createElement("div");

    hud.id = "hud";
    hud.textContent = "Measuring…";

    hud.style.position = "fixed";
    hud.style.top =
      "calc(env(safe-area-inset-top) + 1rem)";
    hud.style.left = "1rem";

    hud.style.zIndex = "10000";

    hud.style.padding = "0.6rem 1rem";

    hud.style.background =
      "rgba(0,0,0,0.6)";

    hud.style.color = "#fff";

    hud.style.borderRadius = "8px";

    hud.style.display = "none";

    document.body.appendChild(hud);
  }

  if (!document.getElementById("ar-action-row")) {

    const row = document.createElement("div");

    row.id = "ar-action-row";

    row.style.position = "fixed";

    row.style.bottom =
      "calc(5rem + env(safe-area-inset-bottom))";

    row.style.left =
      "calc(1rem + env(safe-area-inset-left))";

    row.style.right =
      "calc(1rem + env(safe-area-inset-right))";

    row.style.display = "flex";

    row.style.gap = "0.75rem";

    row.style.maxWidth = "520px";

    row.style.margin = "0 auto";

    row.style.zIndex = "10001";

    document.body.appendChild(row);
  }

  if (!document.getElementById("exit-ar-btn")) {

    const btn = document.createElement("button");

    btn.id = "exit-ar-btn";

    btn.textContent =
      "Product Recommendation";

    btn.style.flex = "1 1 0";

    btn.style.padding = "1rem 0.5rem";

    btn.style.fontSize = "18px";

    btn.style.fontWeight = "bold";

    btn.style.background =
      "linear-gradient(135deg, #00c896, #009f75)";

    btn.style.color = "#fff";

    btn.style.border = "none";

    btn.style.borderRadius = "12px";

    btn.style.display = "none";

    btn.style.whiteSpace = "nowrap";

    document
      .getElementById("ar-action-row")
      .appendChild(btn);
  }

  if (!document.getElementById("exit-ar-hard-btn")) {

    const exitBtn =
      document.createElement("button");

    exitBtn.id = "exit-ar-hard-btn";

    exitBtn.textContent = "Exit";

    exitBtn.style.flex = "1 1 0";

    exitBtn.style.padding = "0.9rem 0.5rem";

    exitBtn.style.fontSize = "16px";

    exitBtn.style.fontWeight = "bold";

    exitBtn.style.background = "#9d9a9a";

    exitBtn.style.color = "#fff";

    exitBtn.style.border =
      "1px solid #888";

    exitBtn.style.borderRadius = "12px";

    exitBtn.style.display = "none";

    exitBtn.style.whiteSpace = "nowrap";

    document
      .getElementById("ar-action-row")
      .appendChild(exitBtn);
  }
}

/* =========================================================
   LAUNCH AR
========================================================= */

measureBtn.onclick = async () => {

  if (launchInProgress) {
    return;
  }

  launchInProgress = true;

  try {

    ensureARDom();

    container.style.display = "none";

    measureBtn.style.display = "none";

    document.body.style.background =
      "transparent";

    const MODULE_MAP = {
      Knee: "mainKnee.js",
      Ankle: "mainAnkle.js",
      Elbow: "mainElbow.js",
      Wrist: "mainWrist.js"
    };

    const arModule =
      await import(
        `/js/Android/Android_${MODULE_MAP[type]}`
      );

    document.getElementById(
      "exit-ar-btn"
    ).style.display = "block";

    document.getElementById(
      "exit-ar-hard-btn"
    ).style.display = "block";

    const exitBtn =
      document.getElementById("exit-ar-btn");

    exitBtn.onclick = async () => {

      const measuredWidth =
        await arModule.stopMain();

      if (selectedProductId) {

        window.location.href =
          `/pages/Android/Android_results.html` +
          `?width=${encodeURIComponent(measuredWidth)}` +
          `&type=${encodeURIComponent(type)}` +
          `&prod=${encodeURIComponent(selectedProductId)}`;

        return;
      }

      window.location.href =
        `/pages/Android/Android_Select_Retailer.html` +
        `?type=${encodeURIComponent(type)}` +
        `&width=${encodeURIComponent(measuredWidth)}`;
    };

    const exitHardBtn =
      document.getElementById(
        "exit-ar-hard-btn"
      );

    exitHardBtn.onclick = async () => {
      await arModule.forceExitAR();
    };

    await arModule.startMain();

  } catch (err) {

    console.error(err);

    alert(
      "Unable to start measurement. Please try again."
    );

    container.style.display = "";

    measureBtn.style.display = "";

    launchInProgress = false;
  }
};
