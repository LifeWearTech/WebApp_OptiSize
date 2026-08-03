
function updateRecommendationButton(enabled) {
  const btn = document.getElementById("exit-ar-btn");
  if (!btn) return;

  btn.disabled = !enabled;
  btn.style.opacity = enabled ? "1.0" : "0.5";
  btn.style.pointerEvents = enabled ? "auto" : "none";
}

function createWidthIndicators() {
  const container = document.createElement("div");
  container.id = "width-indicators";
  container.style.cssText = `
    position: fixed;
    top: 15rem;
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
    z-index: 99999;

    /* ✅ Safe-area + responsiveness */
    padding-left: calc(1rem + env(safe-area-inset-left));
    padding-right: calc(1rem + env(safe-area-inset-right));
    pointer-events: none;
  `;

  const row = document.createElement("div");
  row.style.cssText = `
    display: flex;
    flex-wrap: wrap;               /* ✅ wrap on small screens */
    gap: 0.5rem;
    max-width: 420px;              /* ✅ prevents tablet overstretch */
    justify-content: center;
  `;

  const ranges = ["3-3.75", "3.75-4.5", "4.5-5.25", "5.25-6"];

  ranges.forEach(r => {
    const btn = document.createElement("button");
    btn.className = "indicator";
    btn.dataset.range = r;
    btn.textContent = r.replace("-", "–") + " in";
    btn.style.cssText = `
      padding: 0.45rem 0.7rem;
      background: #666;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      white-space: nowrap;          /* ✅ prevents text wrapping */
      pointer-events: none;
    `;
    row.appendChild(btn);
  });

  container.appendChild(row);
  document.body.appendChild(container);
}

function removeWidthIndicators() {
  const el = document.getElementById("width-indicators");
  if (el) el.remove();
}

function updateWidthIndicators(widthIn) {
  const buttons = document.querySelectorAll(".indicator");
  buttons.forEach(btn => {
    btn.style.background = "#666";
    const [min, max] = btn.dataset.range.split("-").map(Number);
    if (widthIn >= min && widthIn < max) {
      btn.style.background = "green";
    }
  });
}
