let tiltIndicator = null;
let tiltFill = null;

const TILT = {
  pitchDeg: 0,
  rollDeg: 0
};

const pitchBuffer = [];
const rollBuffer = [];
const ORIENTATION_BUFFER_SIZE = 15;

window.addEventListener(
  "deviceorientation",
  (e) => {

    if (
      e.beta == null ||
      e.gamma == null
    ) {
      return;
    }

    pitchBuffer.push(e.beta);
    rollBuffer.push(e.gamma);

    if (
      pitchBuffer.length >
      ORIENTATION_BUFFER_SIZE
    ) {
      pitchBuffer.shift();
    }

    if (
      rollBuffer.length >
      ORIENTATION_BUFFER_SIZE
    ) {
      rollBuffer.shift();
    }

    const avgPitch =
      pitchBuffer.reduce((a, b) => a + b, 0) /
      pitchBuffer.length;

    const avgRoll =
      rollBuffer.reduce((a, b) => a + b, 0) /
      rollBuffer.length;

    TILT.pitchDeg = avgPitch;
    TILT.rollDeg = avgRoll;
  },
  { passive: true }
);

function createIndicator() {

  if (tiltIndicator) return;

  tiltIndicator = document.createElement("div");

  tiltIndicator.style.position = "fixed";
  tiltIndicator.style.left = "20px";
  tiltIndicator.style.top = "65%";
  tiltIndicator.style.transform = "translateY(-50%)";
  tiltIndicator.style.width = "40px";
  tiltIndicator.style.height = "160px";
  tiltIndicator.style.border = "2px solid white";
  tiltIndicator.style.borderRadius = "12px";
  tiltIndicator.style.background = "rgba(255,255,255,0.15)";
  tiltIndicator.style.zIndex = "10001";

  tiltFill = document.createElement("div");
  tiltFill.style.position = "absolute";
  tiltFill.style.bottom = "0";
  tiltFill.style.left = "0";
  tiltFill.style.width = "100%";
  tiltFill.style.height = "0%";
  tiltFill.style.borderRadius = "10px";

  tiltIndicator.appendChild(tiltFill);

  document.body.appendChild(tiltIndicator);

const tiltStatus = document.createElement("div");
tiltStatus.id = "tilt-status";
tiltStatus.style.position = "absolute";
tiltStatus.style.top = "170px";
tiltStatus.style.left = "50%";
tiltStatus.style.transform = "translateX(-50%)";
tiltStatus.style.width = "90px";
tiltStatus.style.whiteSpace = "nowrap";
tiltStatus.style.textAlign = "center";
tiltStatus.style.color = "#FFF";
tiltStatus.style.fontSize = "18px";
tiltStatus.style.fontWeight = "700";
tiltStatus.style.zIndex = "10001";
tiltStatus.style.textShadow = "0 0 6px rgba(0,0,0,0.8)";

tiltIndicator.appendChild(tiltStatus);

  tiltIndicator.appendChild(tiltStatus);
}

function updateIndicator(tiltDeg, minTiltDeg) {

  if (!tiltFill) return;

  const DISPLAY_MAX_DEG = 20;

  const progress = Math.min(
    tiltDeg / DISPLAY_MAX_DEG,
    1.0
  );

  tiltFill.style.height =
    `${progress * 100}%`;

  if (tiltDeg >= minTiltDeg) {
    tiltFill.style.backgroundColor = "#4CAF50";

  } else if (tiltDeg >= minTiltDeg - 10) {
    tiltFill.style.backgroundColor = "#FFC107";

  } else {
    tiltFill.style.backgroundColor = "#FF5252";
  }

  const tiltStatus =
    document.getElementById("tilt-status");

  if (!tiltStatus) return;

  if (tiltDeg >= minTiltDeg) {
    tiltStatus.innerHTML = "Ready";
    tiltStatus.style.color = "#4CAF50";

  } else if (tiltDeg >= minTiltDeg - 10) {
    tiltStatus.innerHTML = "Tilt Up";
    tiltStatus.style.color = "#FFC107";

  } else {
    tiltStatus.innerHTML = "X Tilt";
    tiltStatus.style.color = "#FF5252";
  }
}

window.KneeTilt = {
  TILT,
  createIndicator,
  updateIndicator
};