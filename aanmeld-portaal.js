/**
 * aanmeld-portaal.js — publiek aanmeldportaal voor verwijzers (geen login).
 *
 * Verstuurt de aanmelding via POST naar de edge function
 * `client-aanmelding` (service-role kant roept aanmelding_dien_in aan).
 * Body: { aanmelding, contactpersonen, documenten, website }.
 * Documenten gaan als base64 mee: { naam, type, mime, size, data_base64 } per bestand.
 */
(function () {
  "use strict";

  var ENDPOINT = "https://ukjflilnhigozfoxowmj.supabase.co/functions/v1/client-aanmelding";
  // Publieke anon-key (zelfde als supabase-client.js) — nodig zodat de edge
  // function ook werkt wanneer die met JWT-verificatie is gedeployed.
  var ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVramZsaWxuaGlnb3pmb3hvd21qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4MzkwMzEsImV4cCI6MjA5NjQxNTAzMX0." +
    "ePh91-gndGEP8ve169Hq1XWXdtr3G9nEBDuZ0iA1z5U";

  var MAX_FILES = 10;
  var MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
  var MAX_CONTACTS = 10;
  var ALLOWED_EXT = ["pdf", "doc", "docx", "xls", "xlsx", "jpg", "jpeg", "png"];
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var BSN_RE = /^[0-9]{8,9}$/;

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

  function formatBytes(bytes) {
    var n = Number(bytes) || 0;
    if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(1).replace(".", ",") + " MB";
    if (n >= 1024) return Math.round(n / 1024) + " kB";
    return n + " B";
  }

  function fileExt(name) {
    var m = /\.([A-Za-z0-9]+)$/.exec(String(name || ""));
    return m ? m[1].toLowerCase() : "";
  }

  function val(id) {
    var el = $(id);
    return el ? String(el.value || "").trim() : "";
  }

  function valOrNull(id) {
    var v = val(id);
    return v === "" ? null : v;
  }

  /* ------------------------------------------------------------------ */
  /* Foutbanner                                                          */
  /* ------------------------------------------------------------------ */

  var errEl = $("amp-error");

  function showError(messages) {
    var list = Array.isArray(messages) ? messages : [messages];
    var html = "";
    if (list.length === 1) {
      html = "<p>" + escapeHtml(list[0]) + "</p>";
    } else {
      html = "<p>Controleer het formulier:</p><ul>" +
        list.map(function (m) { return "<li>" + escapeHtml(m) + "</li>"; }).join("") +
        "</ul>";
    }
    errEl.innerHTML = html;
    setVisible(errEl, true);
    try { errEl.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) { /* */ }
  }

  function clearError() {
    errEl.innerHTML = "";
    setVisible(errEl, false);
    var marked = document.querySelectorAll(".amp-input--invalid");
    for (var i = 0; i < marked.length; i++) marked[i].classList.remove("amp-input--invalid");
  }

  function markInvalid(id) {
    var el = $(id);
    if (el) el.classList.add("amp-input--invalid");
  }

  /* ------------------------------------------------------------------ */
  /* Contactpersoon-blokken                                              */
  /* ------------------------------------------------------------------ */

  var contactsWrap = $("amp-contacts");
  var contactAddBtn = $("amp-contact-add");
  var contactSeq = 0;

  function contactCount() {
    return contactsWrap.querySelectorAll(".amp-contact").length;
  }

  function addContactBlock() {
    if (contactCount() >= MAX_CONTACTS) return;
    contactSeq += 1;
    var idp = "amp-c" + contactSeq;
    var block = document.createElement("div");
    block.className = "amp-contact";
    // Statisch template — geen gebruikersdata, alleen gegenereerde id's (cijfers).
    block.innerHTML =
      '<div class="amp-contact-head">' +
        '<span class="amp-contact-title"></span>' +
        '<button type="button" class="btn-outline amp-contact-remove">Verwijderen</button>' +
      "</div>" +
      '<div class="amp-grid">' +
        '<label class="amp-field"><span>Naam</span>' +
          '<input type="text" id="' + idp + '-naam" class="amp-input" maxlength="120" data-c="naam"></label>' +
        '<label class="amp-field"><span>Relatie</span>' +
          '<select id="' + idp + '-relatie" class="amp-input" data-c="relatie">' +
            '<option value="Ouder">Ouder</option>' +
            '<option value="Voogd">Voogd</option>' +
            '<option value="Gezaghebbende">Gezaghebbende</option>' +
            '<option value="Overig">Overig</option>' +
          "</select></label>" +
        '<label class="amp-field"><span>Gezaghebbend</span>' +
          '<select id="' + idp + '-gezag" class="amp-input" data-c="gezaghebbend">' +
            '<option value="ja">Ja</option>' +
            '<option value="nee">Nee</option>' +
          "</select></label>" +
        '<label class="amp-field"><span>Telefoonnummer</span>' +
          '<input type="tel" id="' + idp + '-telefoon" class="amp-input" maxlength="30" data-c="telefoon"></label>' +
        '<label class="amp-field"><span>E-mailadres</span>' +
          '<input type="email" id="' + idp + '-email" class="amp-input" maxlength="160" data-c="email"></label>' +
        '<label class="amp-field"><span>Adres</span>' +
          '<input type="text" id="' + idp + '-adres" class="amp-input" maxlength="200" data-c="adres"></label>' +
      "</div>";
    block.querySelector(".amp-contact-remove").addEventListener("click", function () {
      block.remove();
      renumberContacts();
    });
    contactsWrap.appendChild(block);
    renumberContacts();
  }

  function renumberContacts() {
    var blocks = contactsWrap.querySelectorAll(".amp-contact");
    for (var i = 0; i < blocks.length; i++) {
      var t = blocks[i].querySelector(".amp-contact-title");
      if (t) t.textContent = "Contactpersoon " + (i + 1);
    }
    setVisible(contactAddBtn, blocks.length < MAX_CONTACTS);
  }

  function collectContacts() {
    var out = [];
    var blocks = contactsWrap.querySelectorAll(".amp-contact");
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      function f(key) {
        var el = b.querySelector('[data-c="' + key + '"]');
        return el ? String(el.value || "").trim() : "";
      }
      var naam = f("naam");
      var telefoon = f("telefoon");
      var email = f("email");
      var adres = f("adres");
      // Volledig leeg blok overslaan (alleen defaults in de selects).
      if (!naam && !telefoon && !email && !adres) continue;
      var relatie = f("relatie") || "Overig";
      out.push({
        naam: naam,
        relatie: relatie,
        gezaghebbend: f("gezaghebbend") === "ja",
        telefoon: telefoon || null,
        email: email || null,
        adres: adres || null,
        contact_rol: relatie.toLowerCase(),
      });
    }
    return out;
  }

  contactAddBtn.addEventListener("click", addContactBlock);
  // Start met één leeg blok zodat de sectie direct invulbaar is.
  addContactBlock();

  /* ------------------------------------------------------------------ */
  /* Documenten                                                          */
  /* ------------------------------------------------------------------ */

  var fileInput = $("amp-file-input");
  var fileBtn = $("amp-file-btn");
  var fileListEl = $("amp-files");
  var pickedFiles = []; // File-objecten

  fileBtn.addEventListener("click", function () { fileInput.click(); });

  fileInput.addEventListener("change", function () {
    var incoming = Array.prototype.slice.call(fileInput.files || []);
    var problems = [];
    for (var i = 0; i < incoming.length; i++) {
      var file = incoming[i];
      if (pickedFiles.length >= MAX_FILES) {
        problems.push("Maximaal " + MAX_FILES + " bestanden — '" + file.name + "' is niet toegevoegd.");
        continue;
      }
      var ext = fileExt(file.name);
      if (ALLOWED_EXT.indexOf(ext) === -1) {
        problems.push("'" + file.name + "' heeft een niet-toegestaan bestandstype (toegestaan: " + ALLOWED_EXT.join(", ") + ").");
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        problems.push("'" + file.name + "' is groter dan 10 MB (" + formatBytes(file.size) + ").");
        continue;
      }
      var dup = pickedFiles.some(function (f) { return f.name === file.name && f.size === file.size; });
      if (dup) continue;
      pickedFiles.push(file);
    }
    fileInput.value = ""; // zelfde bestand later opnieuw kunnen kiezen
    renderFileList();
    if (problems.length) showError(problems); else clearError();
  });

  function renderFileList() {
    if (!pickedFiles.length) {
      fileListEl.innerHTML = "";
      setVisible(fileListEl, false);
      return;
    }
    setVisible(fileListEl, true);
    var html = "";
    for (var i = 0; i < pickedFiles.length; i++) {
      var f = pickedFiles[i];
      html +=
        '<li class="amp-file">' +
          '<span class="amp-file-name">' + escapeHtml(f.name) + "</span>" +
          '<span class="amp-file-size">' + escapeHtml(formatBytes(f.size)) + "</span>" +
          '<button type="button" class="amp-file-remove" data-idx="' + i + '" aria-label="Verwijder ' + escapeHtml(f.name) + '">&times;</button>' +
        "</li>";
    }
    fileListEl.innerHTML = html;
  }

  fileListEl.addEventListener("click", function (e) {
    var btn = e.target.closest(".amp-file-remove");
    if (!btn) return;
    var idx = parseInt(btn.getAttribute("data-idx"), 10);
    if (isNaN(idx)) return;
    pickedFiles.splice(idx, 1);
    renderFileList();
  });

  function readFileAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var result = String(reader.result || "");
        var comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = function () {
        reject(new Error("Bestand '" + file.name + "' kon niet worden gelezen."));
      };
      reader.readAsDataURL(file);
    });
  }

  async function buildDocumentsPayload(onProgress) {
    var docs = [];
    for (var i = 0; i < pickedFiles.length; i++) {
      var f = pickedFiles[i];
      if (typeof onProgress === "function") onProgress(i + 1, pickedFiles.length);
      var base64 = await readFileAsBase64(f); // sequentieel: geheugen sparen
      docs.push({
        naam: f.name,
        type: "",
        mime: f.type || "application/octet-stream",
        size: f.size,
        data_base64: base64,
      });
    }
    return docs;
  }

  /* ------------------------------------------------------------------ */
  /* Validatie                                                           */
  /* ------------------------------------------------------------------ */

  function validate() {
    var errors = [];
    var required = [
      ["amp-voornaam", "Voornaam (cliënt) is verplicht."],
      ["amp-achternaam", "Achternaam (cliënt) is verplicht."],
      ["amp-gemeente", "Gemeente is verplicht."],
      ["amp-verw-organisatie", "Organisatie van de verwijzer is verplicht."],
      ["amp-verw-naam", "Naam van de verwijzer is verplicht."],
      ["amp-verw-email", "E-mailadres van de verwijzer is verplicht."],
      ["amp-reden", "Reden aanmelding is verplicht."],
      ["amp-hulpvraag", "Hulpvraag is verplicht."],
    ];
    for (var i = 0; i < required.length; i++) {
      if (!val(required[i][0])) {
        errors.push(required[i][1]);
        markInvalid(required[i][0]);
      }
    }

    var email = val("amp-verw-email");
    if (email && !EMAIL_RE.test(email)) {
      errors.push("E-mailadres van de verwijzer is geen geldig e-mailadres.");
      markInvalid("amp-verw-email");
    }

    var bsn = val("amp-bsn");
    if (bsn && !BSN_RE.test(bsn)) {
      errors.push("BSN moet uit 8 of 9 cijfers bestaan.");
      markInvalid("amp-bsn");
    }

    // Contactpersoon-e-mails (indien ingevuld) op formaat checken.
    var contactEmails = contactsWrap.querySelectorAll('[data-c="email"]');
    for (var j = 0; j < contactEmails.length; j++) {
      var ce = String(contactEmails[j].value || "").trim();
      if (ce && !EMAIL_RE.test(ce)) {
        errors.push("E-mailadres van contactpersoon " + (j + 1) + " is geen geldig e-mailadres.");
        contactEmails[j].classList.add("amp-input--invalid");
      }
    }

    // Bestanden nogmaals hard checken (defense-in-depth).
    if (pickedFiles.length > MAX_FILES) errors.push("Maximaal " + MAX_FILES + " bestanden toegestaan.");
    for (var k = 0; k < pickedFiles.length; k++) {
      if (pickedFiles[k].size > MAX_FILE_BYTES) {
        errors.push("'" + pickedFiles[k].name + "' is groter dan 10 MB.");
      }
    }

    return errors;
  }

  /* ------------------------------------------------------------------ */
  /* Versturen                                                           */
  /* ------------------------------------------------------------------ */

  var form = $("amp-form");
  var submitBtn = $("amp-submit");
  var submitting = false;
  var RATE_LIMIT_MSG = "Te veel aanmeldingen vanaf dit netwerk, probeer het later opnieuw.";

  function setLoading(loading, label) {
    submitBtn.disabled = loading;
    submitBtn.textContent = loading ? (label || "Bezig met versturen…") : "Aanmelding versturen";
  }

  function buildAanmelding() {
    return {
      voornaam: val("amp-voornaam"),
      achternaam: val("amp-achternaam"),
      bsn: valOrNull("amp-bsn"),
      geboortedatum: valOrNull("amp-geboortedatum"),
      geslacht: valOrNull("amp-geslacht"),
      adres: valOrNull("amp-adres"),
      postcode: valOrNull("amp-postcode"),
      woonplaats: valOrNull("amp-woonplaats"),
      gemeente: val("amp-gemeente"),
      nationaliteit: valOrNull("amp-nationaliteit"),
      verwijzer_organisatie: val("amp-verw-organisatie"),
      verwijzer_naam: val("amp-verw-naam"),
      verwijzer_functie: valOrNull("amp-verw-functie"),
      verwijzer_telefoon: valOrNull("amp-verw-telefoon"),
      verwijzer_email: val("amp-verw-email"),
      reden_aanmelding: val("amp-reden"),
      hulpvraag: val("amp-hulpvraag"),
      urgentie: val("amp-urgentie") || "middel",
      veiligheidsrisicos: valOrNull("amp-veiligheid"),
      diagnoses: valOrNull("amp-diagnoses"),
      huidige_hulpverlening: valOrNull("amp-hulpverlening"),
      school_dagbesteding: valOrNull("amp-school"),
      gewenste_zorgvorm: valOrNull("amp-zorgvorm"),
      gewenste_startdatum: valOrNull("amp-startdatum"),
    };
  }

  function showSuccess(referentie) {
    setVisible(form, false);
    setVisible(errEl, false);
    var intro = document.querySelector(".amp-intro");
    if (intro) setVisible(intro, false);
    var refEl = $("amp-ref");
    refEl.textContent = referentie || "—";
    var success = $("amp-success");
    setVisible(success, true);
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) { /* */ }
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (submitting) return; // dubbele-submit-guard
    clearError();

    var errors = validate();
    if (errors.length) {
      showError(errors);
      return;
    }

    submitting = true;
    setLoading(true);

    try {
      var documenten = [];
      if (pickedFiles.length) {
        documenten = await buildDocumentsPayload(function (n, m) {
          setLoading(true, "Bestanden voorbereiden… (" + n + "/" + m + ")");
        });
        setLoading(true);
      }

      var body = {
        aanmelding: buildAanmelding(),
        contactpersonen: collectContacts(),
        documenten: documenten,
        website: String(($("amp-website") || {}).value || ""), // honeypot
      };

      var resp = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": ANON_KEY,
          "Authorization": "Bearer " + ANON_KEY,
        },
        body: JSON.stringify(body),
      });

      if (resp.status === 429) {
        showError(RATE_LIMIT_MSG);
        return;
      }

      var data = null;
      try { data = await resp.json(); } catch (parseErr) { data = null; }

      if (resp.ok && data && data.ok) {
        showSuccess(data.referentie);
        return;
      }

      var fout = data && data.fout ? String(data.fout) : "";
      if (fout === "rate_limit") {
        showError(RATE_LIMIT_MSG);
      } else if (fout === "naam_verplicht") {
        showError("Voor- en achternaam van de cliënt zijn verplicht.");
      } else if (fout) {
        showError("De aanmelding kon niet worden verwerkt: " + fout + ". Probeer het opnieuw of neem contact op met Embrace the Future.");
      } else {
        showError("De aanmelding kon niet worden verstuurd (fout " + resp.status + "). Probeer het later opnieuw of neem contact op met Embrace the Future.");
      }
    } catch (err) {
      showError("Versturen is niet gelukt: " + (err && err.message ? err.message : "netwerkfout") + ". Controleer uw internetverbinding en probeer het opnieuw.");
    } finally {
      submitting = false;
      setLoading(false);
    }
  });
})();
