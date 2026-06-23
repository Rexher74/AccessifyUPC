/*
 * options.js — Lógica de la página de configuración.
 *  - Carga/guarda usuario, contraseña y la configuración TOTP.
 *  - Lee el QR desde una imagen con la API nativa BarcodeDetector.
 *  - Muestra una vista previa en vivo del código 2FA para que el usuario
 *    confirme que coincide con su app de autenticación.
 */
(function () {
  "use strict";

  const DEFAULT_DEVICE_NAME = "UPC Accessify";

  const $ = (id) => document.getElementById(id);
  const usernameEl = $("username");
  const passwordEl = $("password");
  const deviceNameEl = $("deviceName");
  const secretEl = $("secret");
  const dropzone = $("dropzone");
  const qrfile = $("qrfile");
  const previewEl = $("preview");
  const codeEl = $("code");
  const countEl = $("count");
  const statusEl = $("status");

  // Config TOTP en memoria mientras se edita: {secret, algorithm, digits, period, issuer}
  let totp = null;

  // ---------- carga inicial ----------
  chrome.storage.local.get(["username", "password", "totp", "deviceName"]).then((data) => {
    if (data.username) usernameEl.value = data.username;
    if (data.password) passwordEl.value = data.password;
    deviceNameEl.value = data.deviceName || DEFAULT_DEVICE_NAME;
    if (data.totp && data.totp.secret) {
      totp = data.totp;
      secretEl.value = data.totp.secret;
      markQrConfigured();
    }
  });

  // ---------- mostrar/ocultar contraseña ----------
  $("togglePw").addEventListener("click", () => {
    passwordEl.type = passwordEl.type === "password" ? "text" : "password";
  });

  // ---------- zona de QR ----------
  dropzone.addEventListener("click", () => qrfile.click());
  qrfile.addEventListener("change", () => {
    if (qrfile.files && qrfile.files[0]) handleQrFile(qrfile.files[0]);
  });
  ["dragenter", "dragover"].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.add("drag");
    })
  );
  ["dragleave", "drop"].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.remove("drag");
    })
  );
  dropzone.addEventListener("drop", (e) => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleQrFile(file);
  });

  async function handleQrFile(file) {
    if (!file.type.startsWith("image/")) {
      setStatus("El archivo no es una imagen.", "err");
      return;
    }
    let raw;
    try {
      raw = await decodeQr(file);
    } catch (e) {
      setStatus(
        "No se pudo leer el QR de la imagen. Prueba con una imagen más nítida o introduce la clave manualmente.",
        "err"
      );
      $("manualDetails").open = true;
      return;
    }
    const parsed = UPCTOTP.parseSecretInput(raw);
    if (!parsed) {
      setStatus("El QR no contiene una clave 2FA válida (otpauth).", "err");
      return;
    }
    totp = parsed;
    secretEl.value = parsed.secret;
    markQrConfigured();
    setStatus("QR leído correctamente. Comprueba el código de abajo.", "ok");
    refreshPreview();
  }

  // Lee un QR de una imagen usando la API nativa del navegador.
  async function decodeQr(file) {
    const bitmap = await createImageBitmap(file);
    if (!("BarcodeDetector" in window)) {
      throw new Error("BarcodeDetector no disponible");
    }
    const detector = new BarcodeDetector({ formats: ["qr_code"] });
    const codes = await detector.detect(bitmap);
    if (!codes || !codes.length) throw new Error("Sin códigos");
    return codes[0].rawValue;
  }

  function markQrConfigured() {
    dropzone.classList.add("ok");
    dropzone.textContent = "✓ Doble factor configurado";
  }

  // ---------- entrada manual de la clave ----------
  secretEl.addEventListener("input", () => {
    const parsed = UPCTOTP.parseSecretInput(secretEl.value);
    if (parsed) {
      totp = parsed;
      refreshPreview();
    } else {
      totp = null;
      previewEl.classList.add("hidden");
      if (dropzone.classList.contains("ok")) {
        dropzone.classList.remove("ok");
        dropzone.textContent = "📷 Arrastra aquí la imagen del QR o haz clic para seleccionarla";
      }
    }
  });

  // ---------- vista previa en vivo del código ----------
  async function refreshPreview() {
    if (!totp || !totp.secret) {
      previewEl.classList.add("hidden");
      return;
    }
    try {
      const code = await UPCTOTP.generateTOTP(totp.secret, totp);
      const period = totp.period || 30;
      const remaining = UPCTOTP.secondsRemaining(period);
      const mid = Math.ceil(code.length / 2);
      codeEl.textContent = code.slice(0, mid) + " " + code.slice(mid);
      countEl.textContent = remaining + " s";
      previewEl.classList.remove("hidden");
    } catch (e) {
      previewEl.classList.add("hidden");
    }
  }
  setInterval(refreshPreview, 1000);

  // ---------- guardar ----------
  $("save").addEventListener("click", async () => {
    const username = usernameEl.value.trim();
    const password = passwordEl.value;

    if (!username) return setStatus("Introduce tu usuario.", "err");
    if (!password) return setStatus("Introduce tu contraseña.", "err");

    // Permite guardar también si el usuario escribió la clave en el campo manual.
    if (!totp) totp = UPCTOTP.parseSecretInput(secretEl.value);
    if (!totp || !totp.secret) {
      return setStatus("Configura el 2FA: sube el QR o pega la clave.", "err");
    }

    await chrome.storage.local.set({
      username,
      password,
      deviceName: (deviceNameEl.value.trim() || DEFAULT_DEVICE_NAME),
      totp: {
        secret: totp.secret,
        algorithm: totp.algorithm || "SHA1",
        digits: totp.digits || 6,
        period: totp.period || 30,
        issuer: totp.issuer || "",
      },
    });
    setStatus("✓ Configuración guardada. Ya puedes entrar en login.upc.edu.", "ok");
  });

  function setStatus(msg, kind) {
    statusEl.textContent = msg;
    statusEl.className = kind || "";
  }
})();
