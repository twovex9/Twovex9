/* Salarishuis: salarisschalen-tabellen (data via salarishuis-data.js) */
(function () {
  "use strict";

  var page = document.getElementById("sal-page");
  var root = document.getElementById("sal-scales-root");
  var tabsRoot = document.getElementById("sal-scale-tabs");
  var btnCorr = document.getElementById("sal-btn-corrigeer");
  var btnAddSchaal = document.getElementById("sal-btn-add-schaal");
  var corrLabel = document.getElementById("sal-corr-label");
  var modal = document.getElementById("sal-modal-schaal");
  var modalForm = document.getElementById("sal-modal-schaal-form");
  var modalNaam = document.getElementById("sal-modal-schaal-naam");
  var modalClose = document.getElementById("sal-modal-schaal-close");
  var modalCancel = document.getElementById("sal-modal-schaal-cancel");
  var delModal = document.getElementById("sal-delete-modal");
  var delSlider = document.getElementById("sal-delete-slider");
  var delConfirmBtn = document.getElementById("sal-delete-confirm-btn");
  var delCancelBtn = document.getElementById("sal-delete-cancel-btn");
  var delCloseBtn = document.getElementById("sal-delete-close-btn");
  var delTitle = document.getElementById("sal-delete-title");
  var delMsg = document.getElementById("sal-delete-msg");
  var delPreview = document.getElementById("sal-delete-preview");
  var corrPctPanel = document.getElementById("sal-corr-pct-panel");
  var corrPctInput = document.getElementById("sal-corr-pct-input");
  var corrPctApply = document.getElementById("sal-corr-pct-apply");
  var corrDirPlus = document.getElementById("sal-corr-dir-plus");
  var corrDirMinus = document.getElementById("sal-corr-dir-minus");
  var pctConfirmModal = document.getElementById("sal-pct-confirm-modal");
  var pctConfirmTitle = document.getElementById("sal-pct-confirm-title");
  var pctConfirmMsg = document.getElementById("sal-pct-confirm-msg");
  var pctConfirmSlider = document.getElementById("sal-pct-confirm-slider");
  var pctConfirmOk = document.getElementById("sal-pct-confirm-ok-btn");
  var pctConfirmCancel = document.getElementById("sal-pct-confirm-cancel-btn");
  var pctConfirmClose = document.getElementById("sal-pct-confirm-close-btn");

  if (!page || !root || typeof getSalarisschalen !== "function") return;

  /** { pct: number, dir: "plus"|"minus" } tijdens bevestigingspopup */
  var salPctConfirmPending = null;

  var selectedScaleId = null;
  /** per schaal: true = aflopend, false/undefined = oplopend (standaard) */
  var tredeSortDescByScale = {};
  /** schaal-id waar inline “salaristrede toevoegen” open staat */
  var salTredeAddOpenId = null;
  /** inline bewerken rij: "si-ri" of null */
  var salRowEditKey = null;
  /** { kind: "scale", si } | { kind: "row", si, ri } | null */
  var salDeletePending = null;

  var ICO_CHECK =
    '<svg class="sal-add-trede-check-ico" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>';
  var ICO_X =
    '<svg class="sal-row-edit-cancel-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>';

  var ICO_PENCIL =
    '<svg class="sal-ico-pencil" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
  var ICO_TRASH =
    '<svg class="employee-delete-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
  var ICO_PLUS =
    '<svg class="sal-footer-add-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

  function escapeAttr(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function showToast(message) {
    if (typeof showSaveModal === "function" && message) {
      var msg = String(message);
      if (
        /^Alle bedragen aangepast|^Percentage-aanpassing beëindigd|^Schaal (verwijderd|toegevoegd|bijgewerkt)|^Rij verwijderd|^Salaristrede (bijgewerkt|toegevoegd)/.test(
          msg
        )
      ) {
        showSaveModal(msg);
        return;
      }
    }
    var backdrop = document.getElementById("app-toast-backdrop");
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.id = "app-toast-backdrop";
      backdrop.className = "app-toast-backdrop";
      document.body.appendChild(backdrop);
    }
    var toast = document.getElementById("app-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "app-toast";
      toast.className = "app-toast app-toast--centered";
      toast.setAttribute("role", "status");
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    backdrop.classList.remove("is-visible");
    toast.classList.remove("is-visible");
    void backdrop.offsetWidth;
    backdrop.classList.add("is-visible");
    toast.classList.add("is-visible");
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(function () {
      toast.classList.remove("is-visible");
      backdrop.classList.remove("is-visible");
    }, 2000);
  }

  function ensureSelectedId(data) {
    if (!data.length) {
      selectedScaleId = null;
      return;
    }
    if (selectedScaleId && data.some(function (s) { return s.id === selectedScaleId; })) return;
    var pref = data.filter(function (s) { return s.id === "schaal-4"; })[0];
    selectedScaleId = pref ? pref.id : data[0].id;
  }

  function tredeRank(trede) {
    var t = String(trede == null ? "" : trede).trim();
    if (/^\d+$/.test(t)) return { k: 0, n: parseInt(t, 10), s: "" };
    return { k: 1, n: 0, s: t.toLowerCase() };
  }

  function compareTrede(ta, tb) {
    var ra = tredeRank(ta);
    var rb = tredeRank(tb);
    if (ra.k !== rb.k) return ra.k - rb.k;
    if (ra.k === 0) return ra.n - rb.n;
    if (ra.s < rb.s) return -1;
    if (ra.s > rb.s) return 1;
    return 0;
  }

  function formatEuroFromInput(input) {
    var t = String(input || "").trim();
    if (!t) return "€ 0,00";
    // Parse via dezelfde robuuste logica als parseEuroToNumber (handelt zowel
    // NL "1.234,56" als punt-decimaal "1234.56" correct af) en formatteer dan.
    // Voorheen strippte deze functie ÁLLE punten en nam de komma als decimaal —
    // bij invoer "1234.56" werd dat € 123.456,00 (100x te hoog).
    return formatEuroFromNumber(parseEuroToNumber(t));
  }

  /** Parseert een opgeslagen bedragstring (€ 1.234,56 of € 1234.56) naar een getal. */
  function parseEuroToNumber(s) {
    var t = String(s || "").trim();
    if (!t) return 0;
    t = t.replace(/€/gi, "").replace(/\s/g, "");
    if (t.indexOf(",") !== -1) {
      var normalized = t.replace(/\./g, "").replace(",", ".");
      var n = parseFloat(normalized);
      return !isNaN(n) && isFinite(n) ? n : 0;
    }
    var lastDot = t.lastIndexOf(".");
    if (lastDot !== -1) {
      var intPart = t.slice(0, lastDot).replace(/\./g, "");
      var decPart = t.slice(lastDot + 1);
      var n2 = parseFloat(intPart + "." + decPart);
      return !isNaN(n2) && isFinite(n2) ? n2 : 0;
    }
    var n3 = parseFloat(t);
    return !isNaN(n3) && isFinite(n3) ? n3 : 0;
  }

  function formatEuroFromNumber(n) {
    if (!isFinite(n)) return "€ 0,00";
    var fixed = (Math.round(n * 100) / 100).toFixed(2);
    var parts = fixed.split(".");
    var intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return "€ " + intPart + "," + parts[1];
  }

  /** Percentage-invoer: accepteert 0,5 of 0.5 (geen duizendtallen). */
  function parsePercentageInput(raw) {
    var t = String(raw || "").trim().replace(/\s/g, "");
    if (!t) return NaN;
    t = t.replace(",", ".");
    return parseFloat(t);
  }

  function getCorrDirection() {
    if (corrDirMinus && corrDirMinus.classList.contains("is-active")) return "minus";
    return "plus";
  }

  function setCorrDirection(dir) {
    var isMinus = dir === "minus";
    if (corrDirPlus) {
      corrDirPlus.classList.toggle("is-active", !isMinus);
      corrDirPlus.setAttribute("aria-pressed", isMinus ? "false" : "true");
    }
    if (corrDirMinus) {
      corrDirMinus.classList.toggle("is-active", isMinus);
      corrDirMinus.setAttribute("aria-pressed", isMinus ? "true" : "false");
    }
  }

  /** Toont percentage met komma voor NL (bijv. 0,5). */
  function formatPctForMessage(pct) {
    var r = Math.round(pct * 10000) / 10000;
    if (Math.abs(r - Math.round(r)) < 1e-9) return String(Math.round(r));
    var s = String(r);
    var i = s.indexOf(".");
    if (i === -1) return s;
    return s.slice(0, i) + "," + s.slice(i + 1);
  }

  function executeApplyPercentage(pct, dir) {
    var sign = dir === "minus" ? -1 : 1;
    var factor = 1 + sign * (pct / 100);
    if (factor <= 0) return false;
    var data = getSalarisschalen();
    data.forEach(function (scale) {
      if (!scale.rows) return;
      scale.rows.forEach(function (row) {
        var n = parseEuroToNumber(row.bedrag);
        row.bedrag = formatEuroFromNumber(n * factor);
      });
    });
    saveSalarisschalen(data);
    return true;
  }

  function syncSalPctConfirmSlider() {
    if (!pctConfirmSlider) return;
    var v = Math.min(100, Math.max(0, parseInt(pctConfirmSlider.value, 10) || 0));
    pctConfirmSlider.value = String(v);
    pctConfirmSlider.style.setProperty("--employee-slider-pct", v + "%");
    pctConfirmSlider.setAttribute("aria-valuenow", String(v));
    if (pctConfirmOk) pctConfirmOk.disabled = v < 100;
  }

  function resetSalPctConfirmSlider() {
    if (pctConfirmSlider) {
      pctConfirmSlider.value = "0";
      syncSalPctConfirmSlider();
    }
  }

  function closeSalPctConfirmModal() {
    if (pctConfirmModal) {
      pctConfirmModal.setAttribute("hidden", "");
      pctConfirmModal.setAttribute("aria-hidden", "true");
    }
    salPctConfirmPending = null;
    resetSalPctConfirmSlider();
  }

  function openSalPctConfirmModal(pct, dir) {
    salPctConfirmPending = { pct: pct, dir: dir };
    var pctStr = formatPctForMessage(pct);
    var verb = dir === "minus" ? "verlagen" : "verhogen";
    if (pctConfirmTitle) pctConfirmTitle.textContent = "Percentage toepassen";
    if (pctConfirmMsg) {
      pctConfirmMsg.textContent =
        "Weet je zeker dat je alle bedragen wilt " + verb + " met " + pctStr + "%?";
    }
    resetSalPctConfirmSlider();
    if (pctConfirmModal) {
      pctConfirmModal.removeAttribute("hidden");
      pctConfirmModal.setAttribute("aria-hidden", "false");
    }
  }

  function requestApplyPercentageWithConfirm() {
    var pct = parsePercentageInput(corrPctInput ? corrPctInput.value : "");
    if (!isFinite(pct) || pct < 0) {
      showToast("Voer een geldig percentage in (bijv. 0,5)");
      if (corrPctInput) corrPctInput.focus();
      return;
    }
    if (pct > 999) {
      showToast("Percentage te groot");
      return;
    }
    var dir = getCorrDirection();
    var sign = dir === "minus" ? -1 : 1;
    var factor = 1 + sign * (pct / 100);
    if (factor <= 0) {
      showToast("Percentage te groot: bedragen zouden op nul of negatief uitkomen");
      return;
    }
    openSalPctConfirmModal(pct, dir);
  }

  function confirmSalPctApply() {
    if (!salPctConfirmPending || (pctConfirmOk && pctConfirmOk.disabled)) return;
    var p = salPctConfirmPending;
    if (!executeApplyPercentage(p.pct, p.dir)) {
      showToast("Aanpassing mislukt");
      closeSalPctConfirmModal();
      return;
    }
    if (typeof logSalarishuisWijziging === "function") {
      var pctLabel = (p.dir === "minus" ? "− " : "+ ") + formatPctForMessage(p.pct) + "%";
      logSalarishuisWijziging("Percentage op alle bedragen toegepast", pctLabel + " (alle schalen).");
    }
    var label = p.dir === "minus" ? "− " : "+ ";
    showToast("Alle bedragen aangepast: " + label + formatPctForMessage(p.pct) + "%");
    closeSalPctConfirmModal();
    render();
  }

  /** Schalen: eerst "Schaal &lt;n&gt;" numeriek (3 vóór 4 en 10), daarna overige titels A–Z. */
  function compareScales(a, b) {
    var ma = /^schaal\s+(\d+)$/i.exec(String(a.title || "").trim());
    var mb = /^schaal\s+(\d+)$/i.exec(String(b.title || "").trim());
    if (ma && mb) return parseInt(ma[1], 10) - parseInt(mb[1], 10);
    if (ma && !mb) return -1;
    if (!ma && mb) return 1;
    var ta = String(a.title || "").toLowerCase();
    var tb = String(b.title || "").toLowerCase();
    if (ta < tb) return -1;
    if (ta > tb) return 1;
    return 0;
  }

  function applyScaleOrder(data) {
    var before = data.map(function (s) { return s.id; }).join("\0");
    data.sort(compareScales);
    var after = data.map(function (s) { return s.id; }).join("\0");
    if (before !== after) saveSalarisschalen(data);
  }

  function applyTredeSortToAll(data) {
    var changed = false;
    data.forEach(function (scale) {
      if (!scale.rows || !scale.rows.length) return;
      var desc = !!tredeSortDescByScale[scale.id];
      var before = scale.rows.map(function (r) { return r.trede; }).join("\0");
      scale.rows.sort(function (a, b) {
        var c = compareTrede(a.trede, b.trede);
        return desc ? -c : c;
      });
      var after = scale.rows.map(function (r) { return r.trede; }).join("\0");
      if (before !== after) changed = true;
    });
    if (changed) saveSalarisschalen(data);
  }

  function render() {
    var data = getSalarisschalen();
    ensureSelectedId(data);
    applyScaleOrder(data);
    applyTredeSortToAll(data);

    if (tabsRoot) {
      if (data.length > 1) {
        tabsRoot.hidden = false;
        tabsRoot.innerHTML = data
          .map(function (s) {
            var active = s.id === selectedScaleId;
            return (
              '<button type="button" role="tab" class="sal-scale-tab' +
              (active ? " is-active" : "") +
              '" data-scale-id="' +
              escapeAttr(s.id) +
              '" aria-selected="' +
              (active ? "true" : "false") +
              '">' +
              escapeHtml(s.title) +
              "</button>"
            );
          })
          .join("");
      } else {
        tabsRoot.hidden = true;
        tabsRoot.innerHTML = "";
      }
    }

    if (!data.length) {
      root.innerHTML = "";
      return;
    }
    var corr = page.classList.contains("sal--corrigeer");

    var parts = [];
    data.forEach(function (scale, si) {
      var addFormOpen = !corr && salTredeAddOpenId === scale.id;
      var tredeDesc = !!tredeSortDescByScale[scale.id];
      var tredeThClass =
        "th-sort sal-th-trede " + (tredeDesc ? "th-sort--desc" : "th-sort--asc");
      var tredeHeadHtml = corr
        ? '<th data-col="trede"><span class="th-label">Salaristrede</span></th>'
        : '<th data-col="trede" class="' +
          tredeThClass +
          '"><div class="th-sort-inner">' +
          '<span class="th-label">Salaristrede</span>' +
          '<button type="button" class="th-sort-trigger sal-trede-sort-btn" data-scale-id="' +
          escapeAttr(scale.id) +
          '" aria-label="Sorteer Salaristrede"><span class="th-sort-arrows" aria-hidden="true"></span></button>' +
          "</div></th>";
      var actiesHeadHtml = corr
        ? '<th class="sal-th-acties sal-th-acties--pct-lock" aria-hidden="true"></th>'
        : '<th class="sal-th-acties">Acties</th>';
      var rowsHtml = [];
      scale.rows.forEach(function (row, ri) {
        var rowKey = scale.id + "|" + ri;
        var isInlineEdit = !corr && salRowEditKey === rowKey;
        if (isInlineEdit) {
          rowsHtml.push(
            '<tr class="sal-row sal-row--editing">' +
              '<td data-col="trede">' +
              '<input type="text" class="comp-modal-input sal-row-edit-trede" data-si="' +
              si +
              '" data-ri="' +
              ri +
              '" value="' +
              escapeAttr(row.trede) +
              '" autocomplete="off" aria-label="Salaristrede" />' +
              "</td>" +
              '<td data-col="bedrag">' +
              '<input type="text" class="comp-modal-input sal-row-edit-bedrag" data-si="' +
              si +
              '" data-ri="' +
              ri +
              '" value="' +
              escapeAttr(row.bedrag) +
              '" autocomplete="off" aria-label="Bedrag" />' +
              "</td>" +
              '<td class="sal-td-acties" data-col="acties">' +
              '<div class="sal-row-acties sal-row-acties--edit">' +
              '<button type="button" class="sal-row-edit-save" data-si="' +
              si +
              '" data-ri="' +
              ri +
              '" aria-label="Wijzigingen opslaan">' +
              ICO_CHECK +
              "</button>" +
              '<button type="button" class="sal-row-edit-cancel" data-si="' +
              si +
              '" data-ri="' +
              ri +
              '" aria-label="Annuleren">' +
              ICO_X +
              "</button>" +
              "</div></td></tr>"
          );
          return;
        }
        var bedragCell = '<span class="sal-bedrag-txt">' + escapeHtml(row.bedrag) + "</span>";
        var actiesRowHtml = corr
          ? '<td class="sal-td-acties sal-td-acties--pct-lock" data-col="acties" aria-hidden="true"></td>'
          : '<td class="sal-td-acties" data-col="acties">' +
            '<div class="sal-row-acties">' +
            '<button type="button" class="sal-row-edit-btn sal-row-edit" data-si="' +
            si +
            '" data-ri="' +
            ri +
            '" aria-label="Trede bewerken">' +
            ICO_PENCIL +
            "</button>" +
            '<button type="button" class="employee-delete-btn sal-row-del" data-si="' +
            si +
            '" data-ri="' +
            ri +
            '" aria-label="Rij verwijderen">' +
            ICO_TRASH +
            "</button>" +
            "</div></td>";
        rowsHtml.push(
          "<tr>" +
            '<td data-col="trede">' +
            escapeHtml(row.trede) +
            "</td>" +
            '<td data-col="bedrag">' +
            bedragCell +
            "</td>" +
            actiesRowHtml +
            "</tr>"
        );
      });

      parts.push(
        '<section class="table-card table-card--sal sal-scale-card" data-scale-id="' +
          escapeAttr(scale.id) +
          '">' +
          '<div class="sal-card-head">' +
          '<h2 class="sal-card-title">' +
          escapeHtml(scale.title) +
          "</h2>" +
          '<div class="sal-card-actions">' +
          (corr
            ? ""
            : '<button type="button" class="icon-btn sal-scale-edit" data-si="' +
              si +
              '" aria-label="Schaal hernoemen">' +
              ICO_PENCIL +
              "</button>" +
              '<button type="button" class="icon-btn sal-scale-del" data-si="' +
              si +
              '" aria-label="Schaal verwijderen">' +
              ICO_TRASH +
              "</button>") +
          "</div></div>" +
          '<div class="table-wrapper">' +
          '<table class="employees-table sal-schaal-table">' +
          "<thead><tr>" +
          tredeHeadHtml +
          "<th>Bedrag</th>" +
          actiesHeadHtml +
          "</tr></thead>" +
          "<tbody>" +
          rowsHtml.join("") +
          "</tbody></table></div>" +
          '<div class="sal-scale-footer' +
          (corr
            ? " sal-scale-footer--pct-only"
            : addFormOpen
              ? " sal-scale-footer--form"
              : " sal-scale-footer--end") +
          '">' +
          (corr
            ? ""
            : addFormOpen
            ? '<div class="sal-add-trede-form" data-scale-id="' +
              escapeAttr(scale.id) +
              '">' +
              '<div class="sal-add-trede-row">' +
              '<input type="text" class="comp-modal-input sal-add-trede-naam" placeholder="Naam" autocomplete="off" aria-label="Salaristrede naam" />' +
              '<input type="text" class="comp-modal-input sal-add-trede-bedrag" placeholder="Bedrag" autocomplete="off" aria-label="Bedrag" />' +
              '<div class="sal-add-trede-actions">' +
              '<button type="button" class="sal-add-trede-submit" aria-label="Salaristrede toevoegen">' +
              ICO_CHECK +
              "</button>" +
              '<button type="button" class="sal-add-trede-cancel" aria-label="Annuleren">' +
              ICO_X +
              "</button>" +
              "</div></div></div>"
            : '<button type="button" class="sal-footer-add sal-btn-add-trede" data-scale-id="' +
              escapeAttr(scale.id) +
              '">' +
              ICO_PLUS +
              " Salaristrede toevoegen</button>") +
          "</div></section>"
      );
    });
    root.innerHTML = parts.join("");

    if (salTredeAddOpenId) {
      requestAnimationFrame(function () {
        var wrap = root.querySelector(
          '.sal-add-trede-form[data-scale-id="' + salTredeAddOpenId + '"]'
        );
        var na = wrap && wrap.querySelector(".sal-add-trede-naam");
        if (na) na.focus();
      });
    } else if (salRowEditKey) {
      requestAnimationFrame(function () {
        var parts = salRowEditKey.split("|");
        var sid = parts[0];
        var eri = parts[1];
        var card = sid
          ? root.querySelector('.sal-scale-card[data-scale-id="' + sid + '"]')
          : null;
        var inp = card && card.querySelector('.sal-row-edit-trede[data-ri="' + eri + '"]');
        if (inp) inp.focus();
      });
    }
  }

  function scrollToScale(scaleId) {
    if (!scaleId || !page) return;

    function findCard() {
      var found = null;
      root.querySelectorAll(".sal-scale-card").forEach(function (card) {
        if (card.getAttribute("data-scale-id") === scaleId) found = card;
      });
      return found;
    }

    /* Bovenkant schaalkaart = bovenkant <main class="content">-scrollport (direct onder topbar). */
    function viewportTopY() {
      var r = page.getBoundingClientRect();
      return r.top + (page.clientTop || 0);
    }

    var waitIx = 0;
    var refineIx = 0;
    var maxWait = 40;
    var maxRefine = 20;

    function step() {
      var card = findCard();
      if (!card) {
        if (++waitIx < maxWait) requestAnimationFrame(step);
        return;
      }

      var wantY = viewportTopY();
      var drift = card.getBoundingClientRect().top - wantY;

      if (Math.abs(drift) <= 1 || refineIx >= maxRefine) return;

      var maxScroll = Math.max(0, page.scrollHeight - page.clientHeight);
      var next = Math.max(0, Math.min(maxScroll, page.scrollTop + drift));
      page.scrollTop = next;
      refineIx++;
      requestAnimationFrame(step);
    }

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        requestAnimationFrame(step);
      });
    });
  }

  btnCorr.addEventListener("click", function () {
    var on = page.classList.toggle("sal--corrigeer");
    if (on) {
      salRowEditKey = null;
      salTredeAddOpenId = null;
    } else {
      showToast("Percentage-aanpassing beëindigd");
    }
    if (btnAddSchaal) {
      btnAddSchaal.disabled = !!on;
      btnAddSchaal.setAttribute("aria-disabled", on ? "true" : "false");
    }
    if (corrPctPanel) {
      if (on) corrPctPanel.removeAttribute("hidden");
      else corrPctPanel.setAttribute("hidden", "");
    }
    if (corrLabel) corrLabel.textContent = on ? "Corrigeren beëindigen" : "Corrigeer salarisschalen";
    btnCorr.classList.toggle("btn-sal-corrigeer", !on);
    btnCorr.classList.toggle("btn-outline", on);
    render();
  });

  if (corrDirPlus) {
    corrDirPlus.addEventListener("click", function () {
      setCorrDirection("plus");
    });
  }
  if (corrDirMinus) {
    corrDirMinus.addEventListener("click", function () {
      setCorrDirection("minus");
    });
  }
  if (corrPctApply) {
    corrPctApply.addEventListener("click", function () {
      requestApplyPercentageWithConfirm();
    });
  }

  if (pctConfirmSlider) {
    pctConfirmSlider.addEventListener("input", syncSalPctConfirmSlider);
    pctConfirmSlider.addEventListener("change", syncSalPctConfirmSlider);
  }
  if (pctConfirmOk) pctConfirmOk.addEventListener("click", confirmSalPctApply);
  if (pctConfirmCancel) pctConfirmCancel.addEventListener("click", closeSalPctConfirmModal);
  if (pctConfirmClose) pctConfirmClose.addEventListener("click", closeSalPctConfirmModal);
  if (pctConfirmModal) {
    pctConfirmModal.addEventListener("click", function (e) {
      if (e.target === pctConfirmModal) closeSalPctConfirmModal();
    });
  }

  function openModal() {
    if (modalNaam) modalNaam.value = "";
    if (modal) {
      modal.style.display = "";
      modal.setAttribute("aria-hidden", "false");
    }
    if (modalNaam) modalNaam.focus();
  }

  function closeModal() {
    if (modal) {
      modal.style.display = "none";
      modal.setAttribute("aria-hidden", "true");
    }
  }

  function syncSalDelSlider() {
    if (!delSlider) return;
    var v = Math.min(100, Math.max(0, parseInt(delSlider.value, 10) || 0));
    delSlider.value = String(v);
    delSlider.style.setProperty("--employee-slider-pct", v + "%");
    delSlider.setAttribute("aria-valuenow", String(v));
    if (delConfirmBtn) delConfirmBtn.disabled = v < 100;
  }

  function resetSalDelSlider() {
    if (delSlider) {
      delSlider.value = "0";
      syncSalDelSlider();
    }
  }

  function closeSalDeleteModal() {
    if (delModal) {
      delModal.setAttribute("hidden", "");
      delModal.setAttribute("aria-hidden", "true");
    }
    salDeletePending = null;
    resetSalDelSlider();
    if (delPreview) delPreview.textContent = "";
  }

  function openSalDeleteModal(pending, title, msg, preview) {
    salDeletePending = pending;
    if (delTitle) delTitle.textContent = title;
    if (delMsg) delMsg.textContent = msg;
    if (delPreview) delPreview.textContent = preview || "";
    resetSalDelSlider();
    if (delModal) {
      delModal.removeAttribute("hidden");
      delModal.setAttribute("aria-hidden", "false");
    }
  }

  function confirmSalDelete() {
    if (!salDeletePending || (delConfirmBtn && delConfirmBtn.disabled)) return;
    var data = getSalarisschalen();
    var p = salDeletePending;
    if (p.kind === "scale") {
      var si = p.si;
      if (isNaN(si) || !data[si]) {
        closeSalDeleteModal();
        return;
      }
      if (data.length <= 1) {
        showToast("Minimaal één schaal behouden");
        closeSalDeleteModal();
        return;
      }
      var removedId = data[si].id;
      var removedTitle = data[si].title;
      data.splice(si, 1);
      delete tredeSortDescByScale[removedId];
      if (salTredeAddOpenId === removedId) salTredeAddOpenId = null;
      saveSalarisschalen(data);
      if (typeof logSalarishuisWijziging === "function") {
        logSalarishuisWijziging("Salarisschaal verwijderd", removedTitle);
      }
      ensureSelectedId(getSalarisschalen());
      closeSalDeleteModal();
      render();
      showToast("Schaal verwijderd");
      return;
    }
    if (p.kind === "row") {
      var siR = p.si;
      var ri = p.ri;
      if (isNaN(siR) || isNaN(ri) || !data[siR] || !data[siR].rows[ri]) {
        closeSalDeleteModal();
        return;
      }
      if (data[siR].rows.length <= 1) {
        showToast("Minimaal één rij behouden");
        closeSalDeleteModal();
        return;
      }
      var delRow = data[siR].rows[ri];
      var delScaleTitle = data[siR].title;
      data[siR].rows.splice(ri, 1);
      saveSalarisschalen(data);
      if (typeof logSalarishuisWijziging === "function") {
        logSalarishuisWijziging(
          "Salaristrede verwijderd",
          delScaleTitle + ": trede " + delRow.trede + " (" + delRow.bedrag + ")"
        );
      }
      salRowEditKey = null;
      closeSalDeleteModal();
      render();
      showToast("Rij verwijderd");
    }
  }

  if (delSlider) {
    delSlider.addEventListener("input", syncSalDelSlider);
    delSlider.addEventListener("change", syncSalDelSlider);
  }
  if (delConfirmBtn) delConfirmBtn.addEventListener("click", confirmSalDelete);
  if (delCancelBtn) delCancelBtn.addEventListener("click", closeSalDeleteModal);
  if (delCloseBtn) delCloseBtn.addEventListener("click", closeSalDeleteModal);
  if (delModal) {
    delModal.addEventListener("click", function (e) {
      if (e.target === delModal) closeSalDeleteModal();
    });
  }

  btnAddSchaal.addEventListener("click", openModal);
  if (modalClose) modalClose.addEventListener("click", closeModal);
  if (modalCancel) modalCancel.addEventListener("click", closeModal);
  if (modal) {
    modal.addEventListener("click", function (e) {
      if (e.target === modal) closeModal();
    });
  }

  // Module 08 Bug #27 fix: Escape sluit sal-modal-schaal + sal-delete-modal
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    // sal-modal-schaal is custom (uses style.display niet hidden-attr)
    if (modal && getComputedStyle(modal).display !== "none" && modal.getAttribute("aria-hidden") !== "true") {
      closeModal();
      e.preventDefault();
      return;
    }
    // Andere .modal-overlay modals
    var openModals = Array.from(document.querySelectorAll(".modal-overlay:not([hidden])"));
    if (openModals.length > 0) {
      var topmost = openModals[openModals.length - 1];
      topmost.setAttribute("hidden", "");
      topmost.setAttribute("aria-hidden", "true");
      e.preventDefault();
    }
  });

  if (modalForm) {
    modalForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var naam = modalNaam ? modalNaam.value.trim() : "";
      if (!naam) {
        if (modalNaam) modalNaam.focus();
        return;
      }
      var data = getSalarisschalen();
      var newId = "schaal-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
      data.push({
        id: newId,
        title: naam,
        rows: [{ trede: "0", bedrag: "€ 0,00" }]
      });
      saveSalarisschalen(data);
      if (typeof logSalarishuisWijziging === "function") {
        logSalarishuisWijziging("Salarisschaal toegevoegd", naam);
      }
      selectedScaleId = newId;
      closeModal();
      render();
      scrollToScale(newId);
      showToast("Schaal toegevoegd");
    });
  }

  if (tabsRoot) {
    tabsRoot.addEventListener("click", function (e) {
      var tab = e.target.closest(".sal-scale-tab");
      if (!tab) return;
      selectedScaleId = tab.getAttribute("data-scale-id");
      salRowEditKey = null;
      render();
      scrollToScale(selectedScaleId);
    });
  }

  root.addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    var rowField = e.target.closest(".sal-row-edit-trede, .sal-row-edit-bedrag");
    if (rowField) {
      e.preventDefault();
      var si = rowField.getAttribute("data-si");
      var ri = rowField.getAttribute("data-ri");
      var saveBtn = root.querySelector(
        '.sal-row-edit-save[data-si="' + si + '"][data-ri="' + ri + '"]'
      );
      if (saveBtn) saveBtn.click();
      return;
    }
    var field = e.target.closest(".sal-add-trede-naam, .sal-add-trede-bedrag");
    if (!field) return;
    var form = field.closest(".sal-add-trede-form");
    if (!form) return;
    e.preventDefault();
    var btn = form.querySelector(".sal-add-trede-submit");
    if (btn) btn.click();
  });

  root.addEventListener("click", function (e) {
    var tredeSortBtn = e.target.closest(".sal-trede-sort-btn");
    if (tredeSortBtn) {
      e.preventDefault();
      if (page.classList.contains("sal--corrigeer")) return;
      var sid = tredeSortBtn.getAttribute("data-scale-id");
      if (sid) {
        var scSort = getSalarisschalen().filter(function (s) {
          return s.id === sid;
        })[0];
        var sortTitle = scSort ? scSort.title : sid;
        tredeSortDescByScale[sid] = !tredeSortDescByScale[sid];
        var sortLabel = tredeSortDescByScale[sid] ? "aflopend" : "oplopend";
        if (typeof logSalarishuisWijziging === "function") {
          logSalarishuisWijziging("Sortering salaristredes gewijzigd", sortTitle + " (" + sortLabel + ")");
        }
        render();
      }
      return;
    }

    var editSc = e.target.closest(".sal-scale-edit");
    if (editSc) {
      var si = parseInt(editSc.getAttribute("data-si"), 10);
      (async function () {
        var data = getSalarisschalen();
        var sc = data[si];
        if (!sc) return;
        var oldTitle = sc.title;
        var n = await window.showPromptModal({
          title: "Schaal hernoemen",
          label: "Naam van de schaal",
          defaultValue: sc.title,
          okLabel: "Opslaan",
        });
        if (n != null && String(n).trim()) {
          sc.title = String(n).trim();
          saveSalarisschalen(data);
          if (typeof logSalarishuisWijziging === "function") {
            logSalarishuisWijziging("Schaal hernoemd", oldTitle + " → " + sc.title);
          }
          render();
          showToast("Schaal bijgewerkt");
        }
      })();
      return;
    }

    var delSc = e.target.closest(".sal-scale-del");
    if (delSc) {
      e.preventDefault();
      var si = parseInt(delSc.getAttribute("data-si"), 10);
      var data = getSalarisschalen();
      if (isNaN(si) || !data[si]) return;
      if (data.length <= 1) {
        showToast("Minimaal één schaal behouden");
        return;
      }
      var sc = data[si];
      openSalDeleteModal(
        { kind: "scale", si: si },
        "Salarisschaal verwijderen",
        "Weet je zeker dat je deze salarisschaal wilt verwijderen? Alle bijbehorende salaristredes gaan mee.",
        sc.title
      );
      return;
    }

    var editCancel = e.target.closest(".sal-row-edit-cancel");
    if (editCancel) {
      e.preventDefault();
      salRowEditKey = null;
      render();
      return;
    }

    var editSave = e.target.closest(".sal-row-edit-save");
    if (editSave) {
      e.preventDefault();
      var siS = parseInt(editSave.getAttribute("data-si"), 10);
      var riS = parseInt(editSave.getAttribute("data-ri"), 10);
      var tr = editSave.closest("tr");
      var tre = tr && tr.querySelector(".sal-row-edit-trede");
      var bed = tr && tr.querySelector(".sal-row-edit-bedrag");
      var naam = tre ? tre.value.trim() : "";
      if (!naam) {
        showToast("Vul een salaristrede in");
        if (tre) tre.focus();
        return;
      }
      var data = getSalarisschalen();
      if (isNaN(siS) || isNaN(riS) || !data[siS] || !data[siS].rows[riS]) return;
      var j;
      for (j = 0; j < data[siS].rows.length; j++) {
        if (j !== riS && String(data[siS].rows[j].trede).trim() === naam) {
          showToast("Deze salaristrede bestaat al");
          return;
        }
      }
      var scNm = data[siS].title;
      var prevRow = data[siS].rows[riS];
      var prevTrede = prevRow.trede;
      var prevBedrag = prevRow.bedrag;
      var newBedrag = formatEuroFromInput(bed ? bed.value : "");
      data[siS].rows[riS].trede = naam;
      data[siS].rows[riS].bedrag = newBedrag;
      saveSalarisschalen(data);
      if (typeof logSalarishuisWijziging === "function") {
        logSalarishuisWijziging(
          "Salaristrede bijgewerkt",
          scNm +
            ": trede " +
            prevTrede +
            " → " +
            naam +
            "; bedrag " +
            prevBedrag +
            " → " +
            newBedrag
        );
      }
      salRowEditKey = null;
      render();
      showToast("Salaristrede bijgewerkt");
      return;
    }

    var editRow = e.target.closest(".sal-row-edit");
    if (editRow) {
      e.preventDefault();
      var siFromEdit = parseInt(editRow.getAttribute("data-si"), 10);
      var ri = parseInt(editRow.getAttribute("data-ri"), 10);
      if (isNaN(siFromEdit) || isNaN(ri)) return;
      var scRow = getSalarisschalen()[siFromEdit];
      if (!scRow) return;
      var k = scRow.id + "|" + ri;
      salRowEditKey = salRowEditKey === k ? null : k;
      selectedScaleId = scRow.id;
      render();
      return;
    }

    var del = e.target.closest(".sal-row-del");
    if (del) {
      e.preventDefault();
      var si = parseInt(del.getAttribute("data-si"), 10);
      var ri = parseInt(del.getAttribute("data-ri"), 10);
      var data = getSalarisschalen();
      if (!isNaN(si) && !isNaN(ri) && data[si] && data[si].rows[ri]) {
        if (data[si].rows.length <= 1) {
          showToast("Minimaal één rij behouden");
          return;
        }
        var row = data[si].rows[ri];
        openSalDeleteModal(
          { kind: "row", si: si, ri: ri },
          "Salaristrede verwijderen",
          "Weet je zeker dat je deze salaristrede wilt verwijderen?",
          "Trede " + row.trede + " — " + row.bedrag
        );
      }
      return;
    }

    var addTredeCancel = e.target.closest(".sal-add-trede-cancel");
    if (addTredeCancel) {
      e.preventDefault();
      salTredeAddOpenId = null;
      render();
      return;
    }

    var addTredeSubmit = e.target.closest(".sal-add-trede-submit");
    if (addTredeSubmit) {
      var form = addTredeSubmit.closest(".sal-add-trede-form");
      if (!form) return;
      var id = form.getAttribute("data-scale-id");
      var na = form.querySelector(".sal-add-trede-naam");
      var bd = form.querySelector(".sal-add-trede-bedrag");
      var naam = na ? na.value.trim() : "";
      if (!naam) {
        showToast("Vul een naam in");
        if (na) na.focus();
        return;
      }
      var data = getSalarisschalen();
      var sc = data.filter(function (s) { return s.id === id; })[0];
      if (!sc) return;
      var bedrN = formatEuroFromInput(bd ? bd.value : "");
      sc.rows.push({
        trede: naam,
        bedrag: bedrN
      });
      saveSalarisschalen(data);
      if (typeof logSalarishuisWijziging === "function") {
        logSalarishuisWijziging("Salaristrede toegevoegd", sc.title + ": " + naam + " — " + bedrN);
      }
      salTredeAddOpenId = null;
      render();
      showToast("Salaristrede toegevoegd");
      return;
    }

    var addTrede = e.target.closest(".sal-btn-add-trede");
    if (addTrede) {
      var sid = addTrede.getAttribute("data-scale-id");
      if (salTredeAddOpenId === sid) salTredeAddOpenId = null;
      else salTredeAddOpenId = sid;
      render();
    }
  });

  render();

  // Re-render zodra de Supabase-bootstrap of een externe wijziging de cache
  // ververst (bv. eerste page-load op een nieuwe browser).
  window.addEventListener("besa:salarishuis-updated", function () {
    try { render(); } catch (e) { /* */ }
  });
})();
