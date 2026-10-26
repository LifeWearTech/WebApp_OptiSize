function showToast(message, duration = 2500) {

  const existingToast =
    document.getElementById(
      "calibration-toast"
    );

  if (existingToast) {
    existingToast.remove();
  }

  const toast =
    document.createElement("div");

  toast.id = "calibration-toast";
  toast.textContent = message;

  toast.style.position = "fixed";
  toast.style.left = "50%";
  toast.style.bottom = "60px";
  toast.style.transform = "translateX(-50%)";

  toast.style.width = "80vw";
  toast.style.maxWidth = "500px";
  toast.style.minWidth = "220px";
  toast.style.boxSizing = "border-box";

  toast.style.padding = "12px 16px";

  toast.style.background =
    "rgba(0,0,0,0.85)";
  toast.style.color = "#FFFFFF";

  toast.style.fontSize = "16px";
  toast.style.fontWeight = "600";
  toast.style.lineHeight = "1.4";

  toast.style.textAlign = "center";
  toast.style.whiteSpace = "normal";
  toast.style.wordBreak = "break-word";

  toast.style.borderRadius = "12px";
  toast.style.boxShadow =
    "0 4px 12px rgba(0,0,0,0.35)";

  toast.style.pointerEvents = "none";
  toast.style.zIndex = "999999";

  document.body.appendChild(toast);

  clearTimeout(toast._timer);

  toast._timer = setTimeout(() => {

    if (
      toast &&
      toast.parentNode
    ) {
      toast.remove();
    }

  }, duration);
}

window.KneeToast = {
  showToast
};