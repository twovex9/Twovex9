/* global window, document */
/**
 * klachten.js — overzicht + registratie van klachten (klachtenregister).
 * Leest/schrijft via window.klachtenDB. DIEHARD: nooit hard-delete — alleen
 * archiveren (soft). Feedback via de save-feedback helpers (geen alert/confirm).
 */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function escHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  var STATUS_LABEL = { nieuw: "Nieuw", in_behandeling: "In behandeling", afgehandeld: "Afgehandeld" };
  var STATUS_CLS = { nieuw: "kl-status--nieuw", in_behandeling: "kl-status--behandeling", afgehandeld: "kl-status--afgehandeld" };
  var PRIO_LABEL = { laag: "Laag", middel: "Middel", hoog: "Hoog" };
  var MELDER_LABEL = { client: "Cliënt", familie: "Familie / naaste", medewerker: "Medewerker", extern: "Externe partij", anoniem: "Anoniem" };

  function fmtDate(s) {
    if (!s) return "—";
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
    if (m) return m[3] + "-" + m[2] + "-" + m[1];
    var t = Date.parse(s);
    if (!isFinite(t)) return "—";
    var d = new Date(t);
    var pad = function (n) { return String(n).padStart(2, "0"); };
    return pad(d.getDate()) + "-" + pad(d.getMonth() + 1) + "-" + d.getFullYear();
  }
  function todayISO() {
    var d = new Date();
    var pad = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  var state = { search: "", status: "", showArchived: false, editId: null };

  function all() {
    try { return (window.klachtenDB && window.klachtenDB.getAllSync()) || []; }
    catch (e) { return []; }
  }

  // ─── Cliënt-koppeling ──────────────────────────────────────────────────────
  function clientNaam(c) {
    if (!c) return "";
    var delen = [];
    if (c.achternaam) delen.push(c.achternaam);
    if (c.voornaam) delen.push(c.voornaam);
    return delen.join(", ");
  }
  function clientNaamById(id) {
    if (!id || !window.clientenDB || !window.clientenDB.getByIdSync) return "";
    return clientNaam(window.clientenDB.getByIdSync(id));
  }
  function populateClientSelect(currentId) {
    var sel = $("kl-f-client");
    if (!sel) return;
    sel.innerHTML = '<option value="">— Geen cliënt —</option>';
    var cs = (window.clientenDB && window.clientenDB.getAllSync) ? (window.clientenDB.getAllSync() || []) : [];
    cs.filter(function (c) { return c && !c.archived; })
      .sort(function (a, b) {
        var an = (a.achternaam || "") + " " + (a.voornaam || "");
        var bn = (b.achternaam || "") + " " + (b.voornaam || "");
        return an.localeCompare(bn, "nl");
      })
      .forEach(function (c) {
        var opt = document.createElement("option");
        opt.value = c.id;
        var label = clientNaam(c) || String(c.id);
        if (c.clientnummer !== "" && c.clientnummer != null) label += " (" + c.clientnummer + ")";
        opt.textContent = label;
        sel.appendChild(opt);
      });
    sel.value = currentId ? String(currentId) : "";
    // Gearchiveerde/onbekende cliënt van een bestaande klacht toch tonen,
    // zodat bewerken de koppeling niet stilzwijgend wist.
    if (currentId && sel.value !== String(currentId)) {
      var extra = document.createElement("option");
      extra.value = String(currentId);
      extra.textContent = clientNaamById(currentId) || String(currentId);
      sel.appendChild(extra);
      sel.value = String(currentId);
    }
  }

  function renderStats() {
    var act = all().filter(function (k) { return !k.archived; });
    $("kl-stat-total").textContent = act.filter(function (k) { return k.status !== "afgehandeld"; }).length;
    $("kl-stat-nieuw").textContent = act.filter(function (k) { return k.status === "nieuw"; }).length;
    $("kl-stat-behandeling").textContent = act.filter(function (k) { return k.status === "in_behandeling"; }).length;
    $("kl-stat-afgehandeld").textContent = act.filter(function (k) { return k.status === "afgehandeld"; }).length;
  }

  function rowsToShow() {
    var q = state.search.trim().toLowerCase();
    return all().filter(function (k) {
      if (state.showArchived ? !k.archived : k.archived) return false;
      if (state.status && k.status !== state.status) return false;
      if (q) {
        var hay = (k.onderwerp + " " + (k.melderNaam || "") + " " + (k.behandelaarNaam || "")).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    }).sort(function (a, b) {
      return (Date.parse(b.ontvangenOp || b.aanmaakdatum) || 0) - (Date.parse(a.ontvangenOp || a.aanmaakdatum) || 0);
    });
  }

  function statusSelectHtml(k) {
    var opts = ["nieuw", "in_behandeling", "afgehandeld"].map(function (s) {
      return '<option value="' + s + '"' + (k.status === s ? " selected" : "") + ">" + STATUS_LABEL[s] + "</option>";
    }).join("");
    return '<select class="kl-row-status ' + (STATUS_CLS[k.status] || "") + '" data-id="' + escHtml(k.id) + '" aria-label="Status wijzigen">' + opts + "</select>";
  }

  function actionsHtml(k) {
    if (k.archived) {
      return '<div class="hr-row-actions">'
        + '<button type="button" class="btn-outline hr-restore-btn kl-restore" data-id="' + escHtml(k.id) + '">Herstel</button>'
        + "</div>";
    }
    return '<div class="hr-row-actions">'
      + '<button type="button" class="icon-btn kl-edit" data-id="' + escHtml(k.id) + '" aria-label="Bewerken" title="Bewerken">'
      + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>'
      + '<button type="button" class="icon-btn kl-archive" data-id="' + escHtml(k.id) + '" aria-label="Archiveren" title="Archiveren">'
      + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg></button>'
      + "</div>";
  }

  function render() {
    renderStats();
    var tbody = $("kl-tbody");
    var rows = rowsToShow();
    var empty = $("kl-empty");
    if (!rows.length) {
      tbody.innerHTML = "";
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    tbody.innerHTML = rows.map(function (k) {
      var melder = escHtml(k.melderNaam || "—");
      if (k.melderType && MELDER_LABEL[k.melderType]) melder += ' <span class="kl-melder-type">' + MELDER_LABEL[k.melderType] + "</span>";
      return "<tr>"
        + '<td class="kl-cell-onderwerp"><span class="kl-onderwerp-t">' + escHtml(k.onderwerp || "—") + "</span>"
        + (k.omschrijving ? '<span class="kl-onderwerp-s">' + escHtml(String(k.omschrijving).slice(0, 90)) + (k.omschrijving.length > 90 ? "…" : "") + "</span>" : "")
        + "</td>"
        + "<td>" + statusSelectHtml(k) + "</td>"
        + '<td><span class="kl-prio kl-prio--' + escHtml(k.prioriteit) + '">' + (PRIO_LABEL[k.prioriteit] || "—") + "</span></td>"
        + "<td>" + melder + "</td>"
        + "<td>" + escHtml(clientNaamById(k.clientId) || "—") + "</td>"
        + "<td>" + escHtml(fmtDate(k.ontvangenOp)) + "</td>"
        + "<td>" + escHtml(k.behandelaarNaam || "—") + "</td>"
        + '<td class="kl-action-td">' + actionsHtml(k) + "</td>"
        + "</tr>";
    }).join("");
  }

  // ─── Modal ────────────────────────────────────────────────────────────────
  function openModal(k) {
    state.editId = k ? k.id : null;
    $("kl-modal-title").textContent = k ? "Klacht bewerken" : "Klacht registreren";
    $("kl-f-onderwerp").value = k ? (k.onderwerp || "") : "";
    $("kl-f-omschrijving").value = k ? (k.omschrijving || "") : "";
    $("kl-f-status").value = k ? k.status : "nieuw";
    $("kl-f-prioriteit").value = k ? k.prioriteit : "middel";
    $("kl-f-melder").value = k ? (k.melderNaam || "") : "";
    $("kl-f-meldertype").value = k ? (k.melderType || "") : "";
    populateClientSelect(k ? (k.clientId || "") : "");
    $("kl-f-ontvangen").value = k ? (k.ontvangenOp ? String(k.ontvangenOp).slice(0, 10) : "") : todayISO();
    $("kl-f-behandelaar").value = k ? (k.behandelaarNaam || "") : "";
    var err = $("kl-form-err"); if (err) { err.hidden = true; err.textContent = ""; }
    var m = $("kl-modal");
    m.removeAttribute("hidden");
    m.setAttribute("aria-hidden", "false");
    setTimeout(function () { try { $("kl-f-onderwerp").focus(); } catch (e) { /* */ } }, 30);
  }
  function closeModal() {
    var m = $("kl-modal");
    m.setAttribute("hidden", "");
    m.setAttribute("aria-hidden", "true");
    state.editId = null;
  }

  async function save(e) {
    if (e) e.preventDefault();
    var onderwerp = $("kl-f-onderwerp").value.trim();
    var err = $("kl-form-err");
    if (!onderwerp) {
      if (err) { err.hidden = false; err.textContent = "Onderwerp is verplicht."; }
      try { $("kl-f-onderwerp").focus(); } catch (e2) { /* */ }
      return;
    }
    var rec = {
      onderwerp: onderwerp,
      omschrijving: $("kl-f-omschrijving").value.trim(),
      status: $("kl-f-status").value,
      prioriteit: $("kl-f-prioriteit").value,
      melderNaam: $("kl-f-melder").value.trim(),
      melderType: $("kl-f-meldertype").value,
      clientId: $("kl-f-client").value || null,
      ontvangenOp: $("kl-f-ontvangen").value || null,
      behandelaarNaam: $("kl-f-behandelaar").value.trim(),
    };
    var saveBtn = $("kl-save");
    if (saveBtn) saveBtn.disabled = true;
    try {
      if (state.editId) {
        await window.klachtenDB.update(state.editId, rec);
        if (window.showActionFeedback) window.showActionFeedback("updated", "Klacht");
      } else {
        await window.klachtenDB.add(rec);
        if (window.showActionFeedback) window.showActionFeedback("added", "Klacht");
      }
      closeModal();
      render();
    } catch (ex) {
      if (window.showError) window.showError((ex && ex.message) || "Opslaan mislukt.", "Opslaan mislukt");
      else if (err) { err.hidden = false; err.textContent = (ex && ex.message) || "Opslaan mislukt."; }
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  // ─── Acties (event-delegatie) ──────────────────────────────────────────────
  async function onTbodyClick(e) {
    var editBtn = e.target.closest(".kl-edit");
    if (editBtn) {
      var k = window.klachtenDB.getByIdSync(editBtn.getAttribute("data-id"));
      if (k) openModal(k);
      return;
    }
    var arBtn = e.target.closest(".kl-archive");
    if (arBtn) {
      var id = arBtn.getAttribute("data-id");
      var item = window.klachtenDB.getByIdSync(id);
      var ok = window.showArchiveConfirm
        ? await window.showArchiveConfirm({ preview: item ? item.onderwerp : "", message: "De klacht verdwijnt uit de actieve lijst en blijft terugvindbaar via de Gearchiveerd-toggle." })
        : true;
      if (!ok) return;
      try { await window.klachtenDB.archive(id); if (window.showActionFeedback) window.showActionFeedback("archived", "Klacht"); render(); }
      catch (ex) { if (window.showError) window.showError((ex && ex.message) || "Archiveren mislukt."); }
      return;
    }
    var restBtn = e.target.closest(".kl-restore");
    if (restBtn) {
      var rid = restBtn.getAttribute("data-id");
      try { await window.klachtenDB.restore(rid); if (window.showActionFeedback) window.showActionFeedback("restored", "Klacht"); render(); }
      catch (ex) { if (window.showError) window.showError((ex && ex.message) || "Herstellen mislukt."); }
      return;
    }
  }
  async function onStatusChange(e) {
    var sel = e.target.closest(".kl-row-status");
    if (!sel) return;
    var id = sel.getAttribute("data-id");
    var nieuw = sel.value;
    try {
      await window.klachtenDB.update(id, { status: nieuw });
      if (window.showActionFeedback) window.showActionFeedback("updated", "Status");
      render();
    } catch (ex) {
      if (window.showError) window.showError((ex && ex.message) || "Status wijzigen mislukt.");
      render();
    }
  }

  function init() {
    render();
    $("kl-add-btn").addEventListener("click", function () { openModal(null); });
    $("kl-modal-close").addEventListener("click", closeModal);
    $("kl-cancel").addEventListener("click", closeModal);
    $("kl-form").addEventListener("submit", save);
    $("kl-modal").addEventListener("click", function (e) { if (e.target === $("kl-modal")) closeModal(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !$("kl-modal").hasAttribute("hidden")) closeModal();
    });
    $("kl-search").addEventListener("input", function (e) { state.search = e.target.value; render(); });
    $("kl-filter-status").addEventListener("change", function (e) { state.status = e.target.value; render(); });
    $("kl-archived-toggle").addEventListener("change", function (e) { state.showArchived = e.target.checked; render(); });
    var tbody = $("kl-tbody");
    tbody.addEventListener("click", onTbodyClick);
    tbody.addEventListener("change", onStatusChange);
    window.addEventListener("ff:klachten-updated", render);
    window.addEventListener("ff:clienten-updated", function () {
      render();
      var m = $("kl-modal");
      if (m && !m.hasAttribute("hidden")) {
        var sel = $("kl-f-client");
        populateClientSelect(sel ? sel.value : "");
      }
    });
    if (window.clientenDB && window.clientenDB.ready && typeof window.clientenDB.ready.then === "function") {
      window.clientenDB.ready.then(render, function () { /* fout-feedback via ff-sync-reporter */ });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
