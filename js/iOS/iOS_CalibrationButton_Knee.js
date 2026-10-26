function createButton() {

  let calibrateBtn =
    document.getElementById("calibrate-btn");

  if (!calibrateBtn) {

    calibrateBtn =
      document.createElement("button");

    calibrateBtn.id =
      "calibrate-btn";

    document.body.appendChild(
      calibrateBtn
    );
  }

  calibrateBtn.textContent =
    "Tap to Calibrate";

  const buttonTop =
    window.innerHeight * 0.08;

  calibrateBtn.style.position =
    "fixed";

  calibrateBtn.style.top =
    `${buttonTop + 60}px`;

  calibrateBtn.style.left =
    "50%";

  calibrateBtn.style.transform =
    "translateX(-50%)";

  calibrateBtn.style.bottom =
    "auto";

  calibrateBtn.style.zIndex =
    "10001";

  calibrateBtn.style.padding =
    "12px 24px";

  calibrateBtn.style.fontSize =
    "18px";

  calibrateBtn.style.whiteSpace =
    "pre-line";

  calibrateBtn.style.textAlign =
    "center";

  calibrateBtn.style.width =
    "auto";

  calibrateBtn.style.minWidth =
    "280px";

  calibrateBtn.style.background =
    "#1976D2";

  calibrateBtn.style.color =
    "#FFF";

  calibrateBtn.style.border =
    "none";

  calibrateBtn.style.borderRadius =
    "12px";

  calibrateBtn.style.display =
    "block";

  return calibrateBtn;
}


function updateButton(
  tiltValid
) {

  const btn =
    document.getElementById(
      "calibrate-btn"
    );

  if (!btn) return;

  btn.disabled = !tiltValid;

  btn.style.background =
    tiltValid
      ? "#1976D2"
      : "#f10f0f";

  btn.textContent =
    tiltValid
      ? "Tap to Calibrate"
      : "Tilt Phone Up";
}

window.KneeCalButton = {
  createButton,
  updateButton
};