/* global window, document, FileReader */
/**
 * onboarding-upload.js — publieke, geïsoleerde uploadpagina voor nieuwe
 * medewerkers. Géén login/app-toegang: validatie loopt via het upload-token
 * in de URL (?token=…) en de edge function `onboarding-upload` (service role).
 *
 * Twee acties op de edge function:
 *   { action: "info",   token }                → { voornaam, dienstverband, status, allowedTypes, uploaded[] }
 *   { action: "upload", token, naam, type, fileName, fileMime, fileBase64, vervaldatum }
 */
(function () {
  "use strict";

  var FN = "onboarding-upload";
  var contentEl = document.getElementById("onbup-content");
  var token = "";
  try {
    token = (new URLSearchParams(window.location.search)).get("token") || "";
  } catch (e) { token = ""; }

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
      } catch (e) { /* gebruik fallback-msg */ }
      throw new Error(msg);
    }
    return res.data || {};
  }

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () {
        var s = String(r.result || "");
        var i = s.indexOf(",");
        resolve(i >= 0 ? s.slice(i + 1) : s);
      };
      r.onerror = function () { reject(new Error("Bestand kon niet gelezen worden.")); };
      r.readAsDataURL(file);
    });
  }

  function renderError(msg) {
    setContent('<div class="onbup-alert onbup-alert--error">' + esc(msg) + "</div>");
  }

  function renderMain(info) {
    var voornaam = (info.voornaam || "").trim();
    // allowedTypes: nieuw formaat [{value,label}] (canonical lowercase value),
    // met fallback voor het oude strings-formaat (versie-skew tijdens deploy).
    var rawTypes = Array.isArray(info.allowedTypes) ? info.allowedTypes : [];
    var types = rawTypes.map(function (t) {
      if (t && typeof t === "object") return { value: String(t.value || ""), label: String(t.label || t.value || "") };
      return { value: String(t), label: String(t) };
    }).filter(function (t) { return t.value; });
    if (!types.length) {
      types = [
        { value: "contract", label: "Contract" }, { value: "education", label: "Opleiding" },
        { value: "vog", label: "VOG" }, { value: "id", label: "ID" },
        { value: "addendum", label: "Addendum" }, { value: "employment_conditions", label: "Arbeidsvoorwaarden" },
        { value: "other", label: "Overig" },
      ];
    }
    var uploaded = Array.isArray(info.uploaded) ? info.uploaded : [];

    var begroeting = voornaam ? "Welkom " + esc(voornaam) + "!" : "Welkom!";
    var ontvangenHtml;
    if (uploaded.length) {
      ontvangenHtml = '<ul class="onbup-doclist">'
        + uploaded.map(function (d) {
          return '<li class="onbup-docitem"><span class="onbup-doc-check" aria-hidden="true">✓</span>'
            + '<span class="onbup-doc-naam">' + esc(d.naam || "Document") + "</span>"
            + (d.type ? '<span class="onbup-doc-type">' + esc(d.type) + "</span>" : "")
            + "</li>";
        }).join("")
        + "</ul>";
    } else {
      ontvangenHtml = '<p class="onbup-muted">Er zijn nog geen documenten ontvangen.</p>';
    }

    var typeOpts = '<option value="">Kies een type…</option>'
      + types.map(function (t) { return '<option value="' + esc(t.value) + '">' + esc(t.label) + "</option>"; }).join("");

    setContent(
      '<p class="onbup-welcome">' + begroeting + "</p>"
      + '<p class="onbup-intro">Upload hieronder de documenten die HR nodig heeft voor je indiensttreding — bijvoorbeeld je identiteitsbewijs, VOG, diploma’s/certificaten en overige gevraagde documenten. Je kunt meerdere bestanden na elkaar uploaden.</p>'
      + '<div class="onbup-section">'
      + '<div class="onbup-section-title">Reeds ontvangen</div>'
      + ontvangenHtml
      + "</div>"
      + '<div class="onbup-section">'
      + '<div class="onbup-section-title">Nieuw document uploaden</div>'
      + '<form id="onbup-form" class="onbup-form">'
      + '<label class="onbup-field"><span>Bestand</span>'
      + '<input type="file" id="onbup-file" accept=".pdf,.png,.jpg,.jpeg,.svg,.xlsx,.xls,.csv,.docx,.doc" required></label>'
      + '<label class="onbup-field"><span>Naam</span>'
      + '<input type="text" id="onbup-naam" placeholder="Bijv. Identiteitsbewijs" required></label>'
      + '<label class="onbup-field"><span>Type</span>'
      + '<select id="onbup-type" required>' + typeOpts + "</select></label>"
      + '<label class="onbup-field"><span>Verloopdatum (indien van toepassing)</span>'
      + '<input type="date" id="onbup-verval">'
      + '<span class="onbup-muted">Bijvoorbeeld bij een VOG, identiteitsbewijs of certificaat met einddatum.</span></label>'
      + '<p class="onbup-alert onbup-alert--error" id="onbup-err" hidden></p>'
      + '<p class="onbup-alert onbup-alert--ok" id="onbup-ok" hidden></p>'
      + '<button type="submit" class="btn-primary onbup-submit" id="onbup-submit">Uploaden</button>'
      + "</form>"
      + "</div>"
    );

    wireForm(info);
  }

  function wireForm(info) {
    var form = document.getElementById("onbup-form");
    var fileEl = document.getElementById("onbup-file");
    var naamEl = document.getElementById("onbup-naam");
    var typeEl = document.getElementById("onbup-type");
    var errEl = document.getElementById("onbup-err");
    var okEl = document.getElementById("onbup-ok");
    var submitBtn = document.getElementById("onbup-submit");
    if (!form) return;

    // Naam alvast invullen met bestandsnaam (zonder extensie) als die leeg is.
    fileEl.addEventListener("change", function () {
      if (naamEl.value.trim()) return;
      var f = fileEl.files && fileEl.files[0];
      if (!f) return;
      naamEl.value = String(f.name || "").replace(/\.[^.]+$/, "");
    });

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      errEl.hidden = true; okEl.hidden = true;
      var f = fileEl.files && fileEl.files[0];
      var naam = naamEl.value.trim();
      var type = typeEl.value;
      if (!f) { errEl.textContent = "Selecteer een bestand."; errEl.hidden = false; return; }
      if (!naam) { errEl.textContent = "Geef het document een naam."; errEl.hidden = false; return; }
      if (!type) { errEl.textContent = "Kies een type."; errEl.hidden = false; return; }
      if (f.size > 20 * 1024 * 1024) { errEl.textContent = "Bestand te groot (max 20 MB)."; errEl.hidden = false; return; }

      submitBtn.disabled = true;
      submitBtn.textContent = "Bezig met uploaden…";
      try {
        var base64 = await fileToBase64(f);
        var vervalEl = document.getElementById("onbup-verval");
        await callFn({
          action: "upload",
          token: token,
          naam: naam,
          type: type,
          fileName: f.name || "bestand",
          fileMime: f.type || "application/octet-stream",
          fileBase64: base64,
          vervaldatum: (vervalEl && vervalEl.value) ? vervalEl.value : "",
        });
        // Ververs de lijst met ontvangen documenten.
        var fresh = await callFn({ action: "info", token: token });
        renderMain(fresh);
        var ok2 = document.getElementById("onbup-ok");
        if (ok2) { ok2.textContent = "✓ “" + naam + "” is geüpload. Bedankt!"; ok2.hidden = false; }
      } catch (err) {
        errEl.textContent = (err && err.message) ? err.message : "Uploaden mislukt.";
        errEl.hidden = false;
        submitBtn.disabled = false;
        submitBtn.textContent = "Uploaden";
      }
    });
  }

  async function init() {
    if (!token || !/^[0-9a-fA-F-]{36}$/.test(token)) {
      renderError("Deze uploadlink is ongeldig. Vraag HR om een nieuwe link.");
      return;
    }
    if (window.besaSupabaseReady && typeof window.besaSupabaseReady.then === "function") {
      try { await window.besaSupabaseReady; } catch (e) { /* */ }
    }
    try {
      var info = await callFn({ action: "info", token: token });
      renderMain(info);
    } catch (err) {
      renderError((err && err.message) ? err.message : "Deze link is niet (meer) geldig.");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
