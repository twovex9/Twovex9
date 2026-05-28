/* global window, document */
/**
 * onboarding-inwerken.js — publieke, geïsoleerde inwerk-pagina.
 *
 * Token in de URL (?token=) = het upload_token van het onboarding-traject.
 * Validatie + voortgang via de edge function `onboarding-inwerken`:
 *   { action:"info",    token }                  → { voornaam, doelgroep, items[] }
 *   { action:"akkoord", token, itemId, akkoord } → { ok, akkoord }
 * De medewerker bekijkt elk onderdeel (video of document) en vinkt
 * "gelezen en akkoord" aan; dat wordt direct vastgelegd (met IP).
 */
(function () {
  "use strict";

  var FN = "onboarding-inwerken";
  var contentEl = document.getElementById("inw-content");
  var token = "";
  try { token = (new URLSearchParams(window.location.search)).get("token") || ""; } catch (e) { token = ""; }

  var _items = [];

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function setContent(html) { if (contentEl) contentEl.innerHTML = html; }

  function fmtDateTime(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString("nl-NL", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

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

  // Alleen bekende video-hosts in een iframe embedden; veilige conversie van
  // gewone YouTube/Vimeo-links. Onbekende/overige links → "open"-knop.
  function toEmbed(url) {
    var u = String(url || "").trim();
    if (!/^https?:\/\//i.test(u)) return null;
    var m = u.match(/(?:youtube\.com\/watch\?[^#]*\bv=|youtu\.be\/|youtube\.com\/embed\/|youtube-nocookie\.com\/embed\/)([A-Za-z0-9_-]{6,})/);
    if (m) return "https://www.youtube.com/embed/" + m[1];
    m = u.match(/(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d{4,})/);
    if (m) return "https://player.vimeo.com/video/" + m[1];
    return null;
  }

  function mediaHtml(item) {
    var url = String(item.url || "").trim();
    if (item.type === "video") {
      var embed = toEmbed(url);
      if (embed) {
        return '<div class="inw-video"><iframe src="' + esc(embed)
          + '" title="' + esc(item.titel || "Inwerkvideo") + '" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>';
      }
    }
    // Document of niet-embedbare video → veilige open-link.
    if (/^https?:\/\//i.test(url)) {
      return '<a class="btn-outline inw-doc-link" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">'
        + (item.type === "video" ? "Video openen in nieuw tabblad" : "Document openen") + "</a>";
    }
    return '<p class="onbup-muted">Geen geldige link ingesteld.</p>';
  }

  function progressHtml() {
    var verplicht = _items.filter(function (i) { return i.verplicht; });
    var done = verplicht.filter(function (i) { return i.akkoord; }).length;
    var total = verplicht.length;
    var alles = total > 0 && done === total;
    var bar = total > 0
      ? '<div class="inw-progress">' + (alles ? "✓ " : "") + esc(done + " van " + total) + " verplichte onderdelen afgerond</div>"
      : "";
    var klaar = alles
      ? '<div class="onbup-alert onbup-alert--ok">Je hebt alle verplichte inwerk-onderdelen afgerond. Bedankt! HR ziet dit automatisch.</div>'
      : "";
    return klaar + bar;
  }

  function render(info) {
    var voornaam = (info && info.voornaam ? info.voornaam : "").trim();
    var begroeting = voornaam ? "Welkom " + esc(voornaam) + "!" : "Welkom!";

    if (!_items.length) {
      setContent(
        '<p class="onbup-welcome">' + begroeting + "</p>"
        + '<p class="onbup-intro">Er staan op dit moment nog geen inwerk-onderdelen voor je klaar. HR zet ze binnenkort klaar — kom later nog eens terug via deze link.</p>'
      );
      return;
    }

    var itemsHtml = _items.map(function (it, idx) {
      return '<div class="inw-item" data-item="' + esc(it.id) + '">'
        + '<div class="inw-item-head">'
        + '<span class="inw-item-num">' + (idx + 1) + "</span>"
        + '<span class="inw-item-title">' + esc(it.titel || "Onderdeel") + "</span>"
        + (it.verplicht ? '<span class="iw-badge iw-badge--ja">Verplicht</span>' : '<span class="iw-badge iw-badge--nee">Optioneel</span>')
        + "</div>"
        + (it.beschrijving ? '<p class="inw-item-desc">' + esc(it.beschrijving) + "</p>" : "")
        + mediaHtml(it)
        + '<label class="inw-akkoord"><input type="checkbox" class="inw-akkoord-cb" data-item="' + esc(it.id) + '"' + (it.akkoord ? " checked" : "") + "> "
        + "Ik heb dit " + (it.type === "video" ? "bekeken" : "gelezen") + " en ga akkoord.</label>"
        + '<div class="inw-akkoord-done" data-done="' + esc(it.id) + '"' + (it.akkoord ? "" : " hidden") + ">"
        + (it.akkoordOp ? "Akkoord op " + esc(fmtDateTime(it.akkoordOp)) : "Akkoord vastgelegd")
        + "</div>"
        + "</div>";
    }).join("");

    setContent(
      '<p class="onbup-welcome">' + begroeting + "</p>"
      + '<p class="onbup-intro">Bekijk elk onderdeel hieronder en vink daarna "gelezen en akkoord" aan. Je kunt op elk moment terugkomen via deze link; je voortgang wordt bewaard.</p>'
      + '<p class="onbup-alert onbup-alert--error" id="inw-error" hidden></p>'
      + '<div id="inw-progress-wrap">' + progressHtml() + "</div>"
      + '<div class="inw-list">' + itemsHtml + "</div>"
    );
    wire();
  }

  var _errTimer = null;
  function showInlineError(msg) {
    var el = document.getElementById("inw-error");
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    try { el.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch (e) { /* */ }
    if (_errTimer) clearTimeout(_errTimer);
    _errTimer = setTimeout(function () { el.hidden = true; }, 6000);
  }

  function refreshProgress() {
    var wrap = document.getElementById("inw-progress-wrap");
    if (wrap) wrap.innerHTML = progressHtml();
  }

  function wire() {
    var cbs = document.querySelectorAll(".inw-akkoord-cb");
    Array.prototype.forEach.call(cbs, function (cb) {
      cb.addEventListener("change", async function () {
        var id = cb.getAttribute("data-item");
        var item = _items.find(function (i) { return String(i.id) === String(id); });
        if (!item) return;
        var wanted = cb.checked;
        cb.disabled = true;
        try {
          var r = await callFn({ action: "akkoord", token: token, itemId: id, akkoord: wanted });
          item.akkoord = !!(r && r.akkoord);
          if (item.akkoord) item.akkoordOp = new Date().toISOString();
          var done = document.querySelector('[data-done="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
          if (done) {
            done.hidden = !item.akkoord;
            if (item.akkoord) done.textContent = "Akkoord op " + fmtDateTime(item.akkoordOp);
          }
          refreshProgress();
        } catch (err) {
          cb.checked = !wanted; // revert
          showInlineError((err && err.message) ? err.message : "Opslaan mislukt. Probeer het opnieuw.");
        } finally {
          cb.disabled = false;
        }
      });
    });
  }

  async function init() {
    if (!token || !/^[0-9a-fA-F-]{36}$/.test(token)) {
      renderError("Deze inwerk-link is ongeldig. Vraag HR om een nieuwe link.");
      return;
    }
    if (window.besaSupabaseReady && typeof window.besaSupabaseReady.then === "function") {
      try { await window.besaSupabaseReady; } catch (e) { /* */ }
    }
    try {
      var info = await callFn({ action: "info", token: token });
      _items = Array.isArray(info.items) ? info.items : [];
      render(info);
    } catch (err) {
      renderError((err && err.message) ? err.message : "Deze link is niet (meer) geldig.");
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
