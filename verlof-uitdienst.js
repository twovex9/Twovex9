/* global window, document */
/**
 * verlof-uitdienst.js — rekenmodule voor verlof bij uitdiensttreding.
 *
 * INPUT (HR-handmatig):
 *   - medewerker_id
 *   - uitdienst-datum (yyyy-mm-dd)
 *   - indienst-datum (default: 1 januari van het jaar van uitdienst)
 *   - volledig jaarrecht wettelijk in dagen (default 20)
 *   - volledig jaarrecht bovenwettelijk in dagen (default 5)
 *
 * BEREKENING (indicatief):
 *   - dagen_in_dienst = (uitdienst - indienst) in dagen (inclusief beide)
 *   - dagen_jaar = 365 (of 366 in schrikkeljaar)
 *   - opbouw_wet = jaarrecht_wet * dagen_in_dienst / dagen_jaar
 *   - opbouw_bovenwet = jaarrecht_bovenwet * dagen_in_dienst / dagen_jaar
 *   - verbruikt_lopend_jaar = SUM(verlof_aanvragen WHERE status=goedgekeurd
 *       AND start_datum in [indienst, uitdienst])
 *     → split per type (wet / bovenwet / overig)
 *   - overdracht_wet = wet_beschikbaar uit medewerker_verlof_overgedragen
 *   - overdracht_bovenwet = idem
 *   - eind_wet  = opbouw_wet + overdracht_wet - verbruikt_wet
 *   - eind_bovenwet = opbouw_bovenwet + overdracht_bovenwet - verbruikt_bovenwet
 *   - positief = uitbetalen / negatief = teruggeven aan werkgever
 *
 * READ-ONLY: nergens schrijven naar Supabase op deze pagina.
 */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function fmt(n) {
    if (n == null || !isFinite(n)) return "—";
    if (Math.abs(n - Math.round(n)) < 0.05) return String(Math.round(n));
    return n.toFixed(2).replace(".", ",");
  }
  function parseDate(iso) {
    if (!iso) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
    if (!m) return null;
    var d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return isFinite(d.getTime()) ? d : null;
  }
  function isSchrikkel(y) {
    return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
  }

  function fillMedewerkers() {
    var sel = $("vu-medewerker");
    if (!sel || !window.medewerkersDB) return;
    var items = (window.medewerkersDB.getAllSync() || []).filter(function (m) { return m && !m.archived; });
    items.sort(function (a, b) {
      return (((a.voornaam || "") + " " + (a.achternaam || ""))
        .localeCompare(((b.voornaam || "") + " " + (b.achternaam || ""))));
    });
    var keep = sel.value;
    sel.innerHTML = '<option value="">— Kies medewerker —</option>' + items.map(function (m) {
      return '<option value="' + escapeHtml(m.id) + '">' +
        escapeHtml(((m.voornaam || "") + " " + (m.achternaam || "")).trim()) + '</option>';
    }).join("");
    if (keep) sel.value = keep;
  }

  function setDefaultDates() {
    var einde = $("vu-einddatum");
    if (einde && !einde.value) {
      // standaard: vandaag
      var today = new Date();
      einde.value = today.toISOString().slice(0, 10);
    }
    var start = $("vu-startdatum");
    if (start && !start.value && einde && einde.value) {
      // standaard: 1 jan van jaar van einde
      var y = String(einde.value).slice(0, 4);
      start.value = y + "-01-01";
    }
  }

  function syncStartOnEndChange() {
    var einde = $("vu-einddatum");
    var start = $("vu-startdatum");
    if (!einde || !start) return;
    // Als start nog op het oude '1 januari van vorig jaar' staat, herzet naar
    // 1 jan van het nieuwe einde-jaar. Niet overschrijven als user het zelf
    // heeft aangepast naar een andere datum.
    if (!start.value) {
      var y = String(einde.value || "").slice(0, 4);
      if (y) start.value = y + "-01-01";
      return;
    }
    var currentY = String(start.value).slice(0, 4);
    var newY = String(einde.value || "").slice(0, 4);
    var isJan1 = /^\d{4}-01-01$/.test(start.value);
    if (isJan1 && newY && newY !== currentY) {
      start.value = newY + "-01-01";
    }
  }

  function verbruiktInPeriode(medewerkerId, startIso, eindIso) {
    if (!medewerkerId || !window.verlofDB) return { totaal: 0, wet: 0, bovenwet: 0, overig: 0 };
    var items = window.verlofDB.getForMedewerkerSync(medewerkerId);
    var totaal = 0, wet = 0, bovenwet = 0, overig = 0;
    items.forEach(function (v) {
      if (!v || v.status !== "goedgekeurd") return;
      if (!v.startDatum) return;
      // Aanvraag valt binnen periode als startDatum tussen startIso en eindIso
      if (v.startDatum < startIso || v.startDatum > eindIso) return;
      var d = Number(v.aantalDagen || 0);
      if (!isFinite(d) || d <= 0) return;
      totaal += d;
      if (v.type === "wettelijk") wet += d;
      else if (v.type === "bovenwettelijk") bovenwet += d;
      else overig += d;
    });
    return { totaal: totaal, wet: wet, bovenwet: bovenwet, overig: overig };
  }

  function recompute() {
    var empId = $("vu-medewerker").value;
    var startIso = $("vu-startdatum").value;
    var eindIso = $("vu-einddatum").value;
    var jaarWet = Number($("vu-jaar-wet").value || 0);
    var jaarBovenwet = Number($("vu-jaar-bovenwet").value || 0);

    if (!empId || !startIso || !eindIso) {
      $("vu-result-empty").hidden = false;
      $("vu-result").hidden = true;
      return;
    }
    var start = parseDate(startIso);
    var einde = parseDate(eindIso);
    if (!start || !einde) {
      $("vu-result-empty").hidden = false;
      $("vu-result").hidden = true;
      return;
    }
    if (einde < start) {
      $("vu-result-empty").hidden = false;
      $("vu-result-empty").textContent = "Uitdienst-datum ligt vóór indienst-datum. Corrigeer de datums.";
      $("vu-result").hidden = true;
      return;
    }

    var dagenInDienst = Math.floor((einde - start) / (1000 * 60 * 60 * 24)) + 1;
    var dagenJaar = isSchrikkel(start.getUTCFullYear()) ? 366 : 365;

    var opbouwWet = jaarWet * dagenInDienst / dagenJaar;
    var opbouwBoven = jaarBovenwet * dagenInDienst / dagenJaar;

    var verbruikt = verbruiktInPeriode(empId, startIso, eindIso);

    var overdracht = window.medewerkerVerlofOvergedragenDB
      ? window.medewerkerVerlofOvergedragenDB.getForMedewerkerSync(empId)
      : null;
    var overdrachtWet = overdracht ? Number(overdracht.wetBeschikbaar || 0) : 0;
    var overdrachtBoven = overdracht ? Number(overdracht.bovenwetBeschikbaar || 0) : 0;

    var eindWet = opbouwWet + overdrachtWet - verbruikt.wet;
    var eindBoven = opbouwBoven + overdrachtBoven - verbruikt.bovenwet;

    $("vu-out-dagen-dienst").textContent = dagenInDienst + " (van " + dagenJaar + ")";
    $("vu-out-opbouw-wet").textContent = fmt(opbouwWet) + " dagen";
    $("vu-out-opbouw-bovenwet").textContent = fmt(opbouwBoven) + " dagen";
    $("vu-out-verbruikt-totaal").textContent = fmt(verbruikt.totaal) + " dagen" +
      (verbruikt.overig > 0 ? " (waarvan " + fmt(verbruikt.overig) + " ander type)" : "");
    $("vu-out-verbruikt-wet").textContent = fmt(verbruikt.wet) + " dagen";
    $("vu-out-verbruikt-bovenwet").textContent = fmt(verbruikt.bovenwet) + " dagen";
    $("vu-out-overdracht-wet").textContent = fmt(overdrachtWet) + " dagen";
    $("vu-out-overdracht-bovenwet").textContent = fmt(overdrachtBoven) + " dagen";

    var eindWetEl = $("vu-out-eind-wet");
    var eindBovenEl = $("vu-out-eind-bovenwet");
    eindWetEl.textContent = (eindWet >= 0 ? "+" : "") + fmt(eindWet) + " dagen";
    eindBovenEl.textContent = (eindBoven >= 0 ? "+" : "") + fmt(eindBoven) + " dagen";
    eindWetEl.style.color = eindWet >= 0 ? "var(--green)" : "var(--red)";
    eindBovenEl.style.color = eindBoven >= 0 ? "var(--green)" : "var(--red)";

    $("vu-out-uitleg").textContent =
      "Positief = werknemer heeft nog tegoed (wettelijk: laat per 1 juli vervallen indien van toepassing; bovenwettelijk: uitbetalen). " +
      "Negatief = werknemer heeft meer verlof opgenomen dan opgebouwd; eventueel terugvorderen via Loket.";

    $("vu-result-empty").hidden = true;
    $("vu-result").hidden = false;
  }

  function copyToClipboard() {
    var empSel = $("vu-medewerker");
    var label = empSel.options[empSel.selectedIndex] ? empSel.options[empSel.selectedIndex].text : "Medewerker";
    var lines = [
      "Verlof-saldering bij uitdiensttreding",
      "Medewerker: " + label,
      "In dienst: " + $("vu-startdatum").value,
      "Uit dienst: " + $("vu-einddatum").value,
      "",
      "Pro-rata opbouw lopend jaar:",
      "  • Wettelijk: " + $("vu-out-opbouw-wet").textContent,
      "  • Bovenwettelijk: " + $("vu-out-opbouw-bovenwet").textContent,
      "Verbruikt in lopend jaar:",
      "  • Wettelijk: " + $("vu-out-verbruikt-wet").textContent,
      "  • Bovenwettelijk: " + $("vu-out-verbruikt-bovenwet").textContent,
      "  • Totaal: " + $("vu-out-verbruikt-totaal").textContent,
      "Saldo overdracht:",
      "  • Wettelijk beschikbaar: " + $("vu-out-overdracht-wet").textContent,
      "  • Bovenwet. beschikbaar: " + $("vu-out-overdracht-bovenwet").textContent,
      "",
      "Eindstand:",
      "  Wettelijk: " + $("vu-out-eind-wet").textContent,
      "  Bovenwettelijk: " + $("vu-out-eind-bovenwet").textContent,
    ].join("\n");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(lines).then(function () {
        if (window.showActionFeedback) window.showActionFeedback("exported", "Berekening");
      }).catch(function (err) {
        if (window.showError) window.showError("Kopiëren mislukt: " + (err && err.message || err));
      });
    } else if (window.showError) {
      window.showError("Clipboard niet beschikbaar in deze browser.");
    }
  }

  function wire() {
    $("vu-medewerker").addEventListener("change", recompute);
    $("vu-einddatum").addEventListener("change", function () { syncStartOnEndChange(); recompute(); });
    $("vu-startdatum").addEventListener("change", recompute);
    $("vu-jaar-wet").addEventListener("input", recompute);
    $("vu-jaar-bovenwet").addEventListener("input", recompute);
    $("vu-copy-btn").addEventListener("click", copyToClipboard);

    window.addEventListener("besa:medewerkers-updated", fillMedewerkers);
    window.addEventListener("besa:medewerker-verlof-overgedragen-updated", recompute);
    window.addEventListener("besa:verlof-updated", recompute);
  }

  function init() {
    fillMedewerkers();
    setDefaultDates();
    wire();
    Promise.all([
      window.medewerkersDB ? window.medewerkersDB.ready : Promise.resolve(),
      window.medewerkerVerlofOvergedragenDB ? window.medewerkerVerlofOvergedragenDB.ready : Promise.resolve(),
      window.verlofDB ? window.verlofDB.ready : Promise.resolve(),
    ]).then(function () {
      fillMedewerkers();
      recompute();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
