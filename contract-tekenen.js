/* global window, document */
/**
 * contract-tekenen.js — publieke, geïsoleerde teken-pagina.
 *
 * Token in de URL (?token=) bepaalt welke tekenaar (medewerker of werkgever).
 * Validatie + vastleggen (incl. IP) via de edge function `contract-sign`:
 *   { action:"info", token } → { rol, status, kanTekenen, contractNaam, medewerkerNaam, tekst, reden }
 *   { action:"sign", token, naam, methode, handtekeningPng }
 * Tekenen kan met een handtekening (canvas) of met "Ik ga akkoord en onderteken".
 */
(function () {
  "use strict";

  var FN = "contract-sign";
  var contentEl = document.getElementById("tk-content");
  var token = "";
  try { token = (new URLSearchParams(window.location.search)).get("token") || ""; } catch (e) { token = ""; }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function setContent(html) { if (contentEl) contentEl.innerHTML = html; }

  async function callFn(body) {
    if (!window.besaSupabase || !window.besaSupabase.functions) {
      throw new Error("Verbinding met de server kon niet worden opgezet. Vernieuw de pagina.");
    }
    var res = await window.besaSupabase.functions.invoke(FN, { body: body });
    if (res.error) {
      var msg = res.error.message || "Er ging iets mis.";
      try {
        if (res.error.context && typeof res.error.context.json === "function") {
          var j = await res.error.context.json();
          if (j && j.error) msg = j.error;
        }
      } catch (e) { /* */ }
      throw new Error(msg);
    }
    return res.data || {};
  }

  function renderError(msg) {
    setContent('<div class="onbup-alert onbup-alert--error">' + esc(msg) + "</div>");
  }

  // ---- handtekening-canvas ----
  var canvas, ctx, drawing = false, hasDrawn = false;
  function initCanvas() {
    canvas = document.getElementById("tk-canvas");
    if (!canvas) return;
    ctx = canvas.getContext("2d");
    ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#1a1a1a";
    function pos(e) {
      var r = canvas.getBoundingClientRect();
      var t = (e.touches && e.touches[0]) || e;
      return { x: (t.clientX - r.left) * (canvas.width / r.width), y: (t.clientY - r.top) * (canvas.height / r.height) };
    }
    function start(e) { drawing = true; var p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); }
    function move(e) { if (!drawing) return; var p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); hasDrawn = true; e.preventDefault(); }
    function end() { drawing = false; }
    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", end);
    var clear = document.getElementById("tk-canvas-clear");
    if (clear) clear.addEventListener("click", function () { ctx.clearRect(0, 0, canvas.width, canvas.height); hasDrawn = false; });
  }

  function renderSign(info) {
    var naam = (info.medewerkerNaam || "").trim();
    var rolLabel = info.rol === "werkgever" ? "namens de werkgever (Embrace The Future)" : "als medewerker";
    var reedsHtml = (info.reedsGetekend && info.reedsGetekend.length)
      ? '<p class="tk-reeds">Reeds getekend: ' + info.reedsGetekend.map(function (s) { return esc((s.rol === "werkgever" ? "werkgever" : "medewerker") + " (" + (s.naam || "") + ")"); }).join(", ") + "</p>"
      : "";

    if (!info.kanTekenen) {
      setContent(
        '<p class="onbup-welcome">' + esc(info.contractNaam || "Contract") + "</p>"
        + reedsHtml
        + '<div class="onbup-alert onbup-alert--ok">' + esc(info.reden || "Dit contract kan nu niet getekend worden.") + "</div>"
        + '<div class="tk-contract" id="tk-contract">' + esc(info.tekst || "") + "</div>"
      );
      return;
    }

    setContent(
      '<p class="onbup-welcome">' + esc(info.contractNaam || "Contract") + "</p>"
      + '<p class="onbup-intro">Lees het contract hieronder en onderteken ' + esc(rolLabel) + ".</p>"
      + reedsHtml
      + '<div class="tk-contract" id="tk-contract">' + esc(info.tekst || "") + "</div>"
      + '<div class="onbup-section">'
      + '<div class="onbup-section-title">Ondertekenen</div>'
      + '<label class="onbup-field"><span>Naam</span><input type="text" id="tk-naam" value="' + esc(naam) + '" autocomplete="name"></label>'
      + '<div class="tk-sign-label">Zet hier je handtekening (met muis of vinger):</div>'
      + '<div class="tk-canvas-wrap"><canvas id="tk-canvas" width="600" height="180"></canvas></div>'
      + '<button type="button" class="btn-outline tk-canvas-clear" id="tk-canvas-clear">Wissen</button>'
      + '<label class="tk-akkoord"><input type="checkbox" id="tk-akkoord"> Of: ik ga akkoord met dit contract en onderteken (zonder handtekening te tekenen).</label>'
      + '<p class="onbup-alert onbup-alert--error" id="tk-err" hidden></p>'
      + '<p class="onbup-alert onbup-alert--ok" id="tk-ok" hidden></p>'
      + '<button type="button" class="btn-primary tk-submit" id="tk-submit">Ondertekenen</button>'
      + "</div>"
    );
    initCanvas();
    var submit = document.getElementById("tk-submit");
    if (submit) submit.addEventListener("click", function () { doSign(); });
  }

  async function doSign() {
    var errEl = document.getElementById("tk-err");
    var okEl = document.getElementById("tk-ok");
    var submit = document.getElementById("tk-submit");
    if (errEl) errEl.hidden = true;
    if (okEl) okEl.hidden = true;
    var naam = (document.getElementById("tk-naam") || {}).value || "";
    naam = naam.trim();
    var akkoord = (document.getElementById("tk-akkoord") || {}).checked;
    if (!naam) { if (errEl) { errEl.textContent = "Vul je naam in."; errEl.hidden = false; } return; }
    var methode = "akkoord";
    var png = null;
    if (hasDrawn && canvas) { methode = "getekend"; try { png = canvas.toDataURL("image/png"); } catch (e) { png = null; } }
    else if (!akkoord) { if (errEl) { errEl.textContent = "Teken je handtekening of vink het akkoord aan."; errEl.hidden = false; } return; }

    if (submit) { submit.disabled = true; submit.textContent = "Bezig met ondertekenen…"; }
    try {
      var r = await callFn({ action: "sign", token: token, naam: naam, methode: methode, handtekeningPng: png });
      var done = r && r.done;
      setContent('<div class="onbup-alert onbup-alert--ok">'
        + (done
          ? "Bedankt! Het contract is nu volledig ondertekend. Een getekende kopie is opgeslagen in het dossier."
          : "Bedankt, je handtekening is vastgelegd. Het contract gaat nu door naar de werkgever voor ondertekening.")
        + "</div>");
    } catch (err) {
      if (errEl) { errEl.textContent = (err && err.message) ? err.message : "Ondertekenen mislukt."; errEl.hidden = false; }
      if (submit) { submit.disabled = false; submit.textContent = "Ondertekenen"; }
    }
  }

  async function init() {
    if (!token || !/^[0-9a-fA-F-]{36}$/.test(token)) {
      renderError("Deze teken-link is ongeldig. Vraag HR om een nieuwe link.");
      return;
    }
    if (window.besaSupabaseReady && typeof window.besaSupabaseReady.then === "function") {
      try { await window.besaSupabaseReady; } catch (e) { /* */ }
    }
    try {
      var info = await callFn({ action: "info", token: token });
      renderSign(info);
    } catch (err) {
      renderError((err && err.message) ? err.message : "Deze link is niet (meer) geldig.");
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
