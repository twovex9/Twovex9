/**
 * onderteken.js — publieke ondertekenpagina (Cliëntmodule 2.0 fase 2, geen login).
 *
 * Leest ?token=<uuid> → GET edge function `client-ondertekening` voor de
 * verklaring-info → toont de verklaring (body_html ALTIJD door
 * window.besaSanitizeHtml) + handtekening-canvas (muis + touch) + verplichte
 * lees-checkbox → POST {token, handtekening_png_base64} → succes-scherm.
 *
 * Foutstates per fout-slug: onbekend / verlopen / ondertekend / ingetrokken.
 */
(function () {
  "use strict";

  var ENDPOINT = "https://ukjflilnhigozfoxowmj.supabase.co/functions/v1/client-ondertekening";
  // Publieke anon-key (zelfde als supabase-client.js) — nodig zodat de edge
  // function ook werkt wanneer die met JWT-verificatie is gedeployed.
  var ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVramZsaWxuaGlnb3pmb3hvd21qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4MzkwMzEsImV4cCI6MjA5NjQxNTAzMX0." +
    "ePh91-gndGEP8ve169Hq1XWXdtr3G9nEBDuZ0iA1z5U";

  var UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

  var TYPE_LABELS = {
    client: "cliënt",
    ouder: "ouder",
    gezaghebbende: "gezaghebbende",
    voogd: "voogd",
  };

  var FOUT_TEKSTEN = {
    onbekend: {
      titel: "Deze link is ongeldig",
      tekst: "Controleer of u de volledige link uit het bericht heeft geopend, of neem contact op met Embrace the Future.",
    },
    verlopen: {
      titel: "Deze link is verlopen",
      tekst: "De termijn om deze verklaring te ondertekenen is verstreken. Neem contact op met Embrace the Future voor een nieuwe link.",
    },
    ondertekend: {
      titel: "Deze verklaring is al ondertekend",
      tekst: "Er is geen verdere actie nodig. U kunt dit venster sluiten.",
    },
    ingetrokken: {
      titel: "Dit verzoek is ingetrokken",
      tekst: "Het verzoek tot ondertekening is ingetrokken door Embrace the Future. Neem bij vragen contact met ons op.",
    },
  };

  function $(id) { return document.getElementById(id); }

  function setVisible(el, show) {
    if (!el) return;
    el.style.display = show ? "" : "none";
    el.hidden = !show;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function pad2(n) { return n < 10 ? "0" + n : "" + n; }

  // Lokale tijd als "DD-MM-YYYY HH:MM" (geen toISOString — UTC-datumshift).
  function nuTijdLokaal() {
    var d = new Date();
    return pad2(d.getDate()) + "-" + pad2(d.getMonth() + 1) + "-" + d.getFullYear() +
      " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }

  /* ------------------------------------------------------------------ */
  /* Schermstates                                                        */
  /* ------------------------------------------------------------------ */

  var loadingEl = $("ond-loading");
  var stateEl = $("ond-state");
  var contentEl = $("ond-content");
  var successEl = $("ond-success");

  function showState(slug, fallbackTitel, fallbackTekst) {
    var t = FOUT_TEKSTEN[slug] || { titel: fallbackTitel || "Er ging iets mis", tekst: fallbackTekst || "Probeer het later opnieuw of neem contact op met Embrace the Future." };
    $("ond-state-title").textContent = t.titel;
    $("ond-state-text").textContent = t.tekst;
    setVisible(loadingEl, false);
    setVisible(contentEl, false);
    setVisible(successEl, false);
    setVisible(stateEl, true);
  }

  var formErrEl = $("ond-form-error");

  function showFormError(message) {
    formErrEl.textContent = message;
    setVisible(formErrEl, true);
    try { formErrEl.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) { /* */ }
  }

  function hideFormError() {
    formErrEl.textContent = "";
    setVisible(formErrEl, false);
  }

  /* ------------------------------------------------------------------ */
  /* Token + info laden                                                  */
  /* ------------------------------------------------------------------ */

  var token = "";
  try {
    token = String(new URLSearchParams(window.location.search).get("token") || "").trim();
  } catch (e) { token = ""; }

  var infoData = null;

  function renderInfo(info) {
    infoData = info;
    $("ond-title").textContent = String(info.titel || "Verklaring");

    var typeLabel = TYPE_LABELS[String(info.ondertekenaar_type || "")] || String(info.ondertekenaar_type || "");
    var metaHtml = "Te ondertekenen door: <strong>" + escapeHtml(info.ondertekenaar_naam || "—") + "</strong>" +
      (typeLabel ? " (" + escapeHtml(typeLabel) + ")" : "");
    if (info.client_voornaam) {
      metaHtml += '<br>Betreft cliënt: <strong>' + escapeHtml(info.client_voornaam) + "</strong>";
    }
    $("ond-meta").innerHTML = metaHtml;

    // body_html ALTIJD door de allowlist-sanitizer vóór innerHTML-injectie.
    var bodyEl = $("ond-verklaring");
    var rawHtml = String(info.body_html || "");
    if (typeof window.besaSanitizeHtml === "function") {
      bodyEl.innerHTML = window.besaSanitizeHtml(rawHtml);
    } else {
      // Fail-safe: sanitizer niet geladen ⇒ volledig escapen (geen rauwe HTML).
      bodyEl.innerHTML = "<p>" + escapeHtml(rawHtml).replace(/\n/g, "<br>") + "</p>";
    }

    setVisible(loadingEl, false);
    setVisible(stateEl, false);
    setVisible(contentEl, true);
    initCanvas();
  }

  async function loadInfo() {
    if (!UUID_RE.test(token)) {
      showState("onbekend");
      return;
    }
    try {
      var resp = await fetch(ENDPOINT + "?token=" + encodeURIComponent(token), {
        method: "GET",
        headers: {
          "apikey": ANON_KEY,
          "Authorization": "Bearer " + ANON_KEY,
        },
      });
      var data = null;
      try { data = await resp.json(); } catch (e) { data = null; }

      if (data && data.ok) {
        renderInfo(data);
        return;
      }
      var fout = data && data.fout ? String(data.fout) : "";
      if (FOUT_TEKSTEN[fout]) {
        showState(fout);
      } else {
        showState("", "Verklaring laden mislukt", "De verklaring kon niet worden geladen (fout " + resp.status + "). Probeer het later opnieuw of neem contact op met Embrace the Future.");
      }
    } catch (err) {
      showState("", "Geen verbinding", "De verklaring kon niet worden geladen: " + (err && err.message ? err.message : "netwerkfout") + ". Controleer uw internetverbinding en vernieuw de pagina.");
    }
  }

  /* ------------------------------------------------------------------ */
  /* Handtekening-canvas (muis + touch, vanilla)                         */
  /* ------------------------------------------------------------------ */

  var canvas = $("ond-canvas");
  var hintEl = $("ond-canvas-hint");
  var ctx = null;
  var hasDrawn = false;
  var drawing = false;
  var lastX = 0;
  var lastY = 0;
  var canvasReady = false;

  // Inktkleur uit het actieve thema-token (zichtbaar in licht én donker).
  function inkColor() {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue("--text").trim();
      if (v) return v;
    } catch (e) { /* */ }
    return "rgb(31, 41, 55)"; // vangnet als het token onverhoopt ontbreekt
  }

  function sizeCanvas() {
    var wrap = canvas.parentElement;
    var cssW = Math.max(200, wrap.clientWidth);
    var cssH = canvas.clientHeight || 180;
    var dpr = Math.max(1, window.devicePixelRatio || 1);
    var newW = Math.round(cssW * dpr);
    var newH = Math.round(cssH * dpr);
    if (canvas.width === newW && canvas.height === newH && ctx) return;

    // Bestaande tekening bewaren bij resize (mobiel: adresbalk/rotatie).
    var prev = null;
    if (hasDrawn && canvas.width > 0 && canvas.height > 0) {
      prev = document.createElement("canvas");
      prev.width = canvas.width;
      prev.height = canvas.height;
      prev.getContext("2d").drawImage(canvas, 0, 0);
    }

    canvas.width = newW;
    canvas.height = newH;
    ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (prev) ctx.drawImage(prev, 0, 0, prev.width, prev.height, 0, 0, cssW, cssH);
  }

  function posFromEvent(e) {
    var rect = canvas.getBoundingClientRect();
    var p = (e.touches && e.touches.length) ? e.touches[0] : e;
    return { x: p.clientX - rect.left, y: p.clientY - rect.top };
  }

  function drawSegment(x, y) {
    if (!ctx) return;
    ctx.strokeStyle = inkColor();
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    // +0.01 zodat een losse tik (punt) ook zichtbaar wordt.
    ctx.lineTo(x + 0.01, y + 0.01);
    ctx.stroke();
    lastX = x;
    lastY = y;
    if (!hasDrawn) {
      hasDrawn = true;
      setVisible(hintEl, false);
    }
  }

  function startDraw(e) {
    if (!ctx) return;
    drawing = true;
    var p = posFromEvent(e);
    lastX = p.x;
    lastY = p.y;
    drawSegment(p.x, p.y);
    if (e.cancelable) e.preventDefault();
  }

  function moveDraw(e) {
    if (!drawing) return;
    var p = posFromEvent(e);
    drawSegment(p.x, p.y);
    if (e.cancelable) e.preventDefault();
  }

  function endDraw() { drawing = false; }

  function clearCanvas() {
    if (!ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    hasDrawn = false;
    setVisible(hintEl, true);
  }

  function initCanvas() {
    if (canvasReady) return;
    canvasReady = true;
    sizeCanvas();

    canvas.addEventListener("mousedown", startDraw);
    window.addEventListener("mousemove", moveDraw);
    window.addEventListener("mouseup", endDraw);
    canvas.addEventListener("touchstart", startDraw, { passive: false });
    canvas.addEventListener("touchmove", moveDraw, { passive: false });
    canvas.addEventListener("touchend", endDraw);
    canvas.addEventListener("touchcancel", endDraw);

    var resizeTimer = null;
    window.addEventListener("resize", function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(sizeCanvas, 150);
    });

    $("ond-clear").addEventListener("click", function () {
      clearCanvas();
      hideFormError();
    });
  }

  // Export: inkt normaliseren naar donker (donker thema tekent met licht
  // token) zodat de PNG/PDF altijd leesbaar is op een witte ondergrond.
  function exportPngBase64() {
    var out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height;
    var octx = out.getContext("2d");
    octx.drawImage(canvas, 0, 0);
    try {
      var img = octx.getImageData(0, 0, out.width, out.height);
      var d = img.data;
      for (var i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 0) { d[i] = 31; d[i + 1] = 41; d[i + 2] = 55; }
      }
      octx.putImageData(img, 0, 0);
    } catch (e) { /* eigen tekening — getImageData kan hier niet tainten */ }
    var dataUrl = out.toDataURL("image/png");
    var comma = dataUrl.indexOf(",");
    return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  }

  /* ------------------------------------------------------------------ */
  /* Versturen                                                           */
  /* ------------------------------------------------------------------ */

  var submitBtn = $("ond-submit");
  var akkoordCheck = $("ond-akkoord-check");
  var submitting = false;

  function setLoading(loading) {
    submitBtn.disabled = loading;
    submitBtn.textContent = loading ? "Bezig met ondertekenen…" : "Ondertekenen";
  }

  function showSuccess(data) {
    var naam = String((data && data.ondertekenaar_naam) || (infoData && infoData.ondertekenaar_naam) || "—");
    $("ond-success-text").textContent = "Ondertekend door " + naam + " op " + nuTijdLokaal() + ".";
    setVisible(contentEl, false);
    setVisible(stateEl, false);
    setVisible(loadingEl, false);
    setVisible(successEl, true);
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) { /* */ }
  }

  submitBtn.addEventListener("click", async function () {
    if (submitting) return; // dubbele-submit-guard
    hideFormError();

    var problems = [];
    if (!hasDrawn) problems.push("Zet eerst uw handtekening in het tekenveld.");
    if (!akkoordCheck.checked) problems.push("Bevestig dat u de verklaring heeft gelezen en deze digitaal ondertekent.");
    if (problems.length) {
      showFormError(problems.join(" "));
      return;
    }

    submitting = true;
    setLoading(true);

    try {
      var resp = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": ANON_KEY,
          "Authorization": "Bearer " + ANON_KEY,
        },
        body: JSON.stringify({
          token: token,
          handtekening_png_base64: exportPngBase64(),
        }),
      });

      var data = null;
      try { data = await resp.json(); } catch (e) { data = null; }

      if (resp.ok && data && data.ok) {
        showSuccess(data);
        return;
      }

      var fout = data && data.fout ? String(data.fout) : "";
      if (FOUT_TEKSTEN[fout]) {
        showState(fout);
        return;
      }
      showFormError("Ondertekenen is niet gelukt" + (fout ? " (" + fout + ")" : " (fout " + resp.status + ")") + ". Probeer het opnieuw of neem contact op met Embrace the Future.");
    } catch (err) {
      showFormError("Versturen is niet gelukt: " + (err && err.message ? err.message : "netwerkfout") + ". Controleer uw internetverbinding en probeer het opnieuw.");
    } finally {
      submitting = false;
      setLoading(false);
    }
  });

  /* ------------------------------------------------------------------ */
  /* Start                                                               */
  /* ------------------------------------------------------------------ */

  loadInfo();
})();
