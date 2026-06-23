/*
 * popup.js — Estado rápido desde la barra de Chrome.
 * Muestra si está configurado, un código 2FA en vivo y accesos directos.
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const stateEl = $("state");
  const codeBox = $("codeBox");
  const codeEl = $("code");
  const countEl = $("count");

  let totp = null;

  chrome.storage.local.get(["username", "password", "totp", "deviceName"]).then((data) => {
    const configured = !!(data.username && data.password && data.totp && data.totp.secret);
    if (configured) {
      totp = data.totp;
      stateEl.innerHTML =
        '<span class="ok">✓ Configurado</span> como <span class="user"></span>' +
        '<br><span class="muted">Dispositivo: <span class="dev"></span></span>';
      stateEl.querySelector(".user").textContent = data.username;
      stateEl.querySelector(".dev").textContent = data.deviceName || "UPC Accessify";
      codeBox.classList.remove("hidden");
      tick();
      setInterval(tick, 1000);
    } else {
      stateEl.innerHTML =
        '<span class="muted">Sin configurar. Pulsa <b>Configuración</b> para empezar.</span>';
    }
  });

  async function tick() {
    if (!totp) return;
    try {
      const code = await UPCTOTP.generateTOTP(totp.secret, totp);
      const mid = Math.ceil(code.length / 2);
      codeEl.textContent = code.slice(0, mid) + " " + code.slice(mid);
      countEl.textContent = UPCTOTP.secondsRemaining(totp.period || 30) + " s";
    } catch (e) {
      codeEl.textContent = "error";
    }
  }

  $("openLogin").addEventListener("click", () => {
    chrome.tabs.create({ url: "https://login.upc.edu/" });
    window.close();
  });
  $("openOptions").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });
})();
