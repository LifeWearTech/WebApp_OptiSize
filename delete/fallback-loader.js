
import { HUD } from '../Android/hud.js';

export function ensureMainLoaded() {
  const RETRIES = [200, 400, 800];
  let attempt = 0;

  function checkExecution() {
    if (window.__MAIN_LOADED__) {
      HUD.log(`main.js executed ✔ (version: ${window.__MAIN_VERSION__ || "unknown"})`);
      return;
    }

    if (attempt >= RETRIES.length) {
      HUD.error("main.js still not executing — check file path, server root, MIME type, or CSP.");
      return;
    }

    const delay = RETRIES[attempt++];
    HUD.log(`Static load failed — retrying dynamically in ${delay}ms…`);
    setTimeout(dynamicReload, delay);
  }

  function dynamicReload() {
    const url = `/js/main.js?v=retry_${Date.now()}`;
    HUD.log("Dynamic load attempt: " + url);

    const s = document.createElement("script");
    s.src = url;
    s.onload = () => HUD.log("Dynamic: request completed ✔");
    s.onerror = () => HUD.error("Dynamic: script request FAILED");

    document.body.appendChild(s);

    setTimeout(checkExecution, 150);
  }

  // initial check
  setTimeout(checkExecution, 150);
}
