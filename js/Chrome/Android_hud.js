
export const HUD = (() => {
  const hud = document.getElementById("hud");

  return {

show(msg) {
  hud.style.display = "block";
  hud.innerHTML = msg;
},

    log(msg) {
      const line = document.createElement("div");
      line.className = "line";
      line.textContent = msg;
      hud.appendChild(line);
    },
    error(msg) {
      const line = document.createElement("div");
      line.className = "line";
      line.style.color = "#ff7676";
      line.textContent = "✖ " + msg;
      hud.appendChild(line);
    }
  };
})();
