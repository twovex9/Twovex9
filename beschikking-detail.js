/* global getBeschikkingById, getClientenById, getClientenItems, setBeschikkingField, SUPPORTED_ZORGSOORT_KEYS_BESC, getBescZorgsoortLabel, document, window, showSaveModal */
(function initBdtlFactViewCtx() {
  "use strict";
  if (typeof getBeschikkingById !== "function") return;
  try {
    var p = new URLSearchParams(window.location.search);
    var id = p.get("id");
    if (!id) return;
    var b = getBeschikkingById(id);
    if (!b) return;
    window.__FVIEW_PREFIX = "bdtl-";
    window.__FVIEW_BESC = b;
    window.__FVIEW_ROW_FILTER = function (r) {
      if (!r) return false;
      if (r.bescId && b.id) return String(r.bescId) === String(b.id);
      return String((r.besch == null ? "" : r.besch)).trim() === String(b.naam || "").trim();
    };
  } catch (e) { /* */ }
})();

(function () {
  "use strict";

  if (typeof getBeschikkingById !== "function") return;

  var toastEl = document.getElementById("bdtl-toast");
  var contentEl = document.getElementById("bdtl-content");
  var missEl = document.getElementById("bdtl-missing");
  var loadedBesc = null;

  var BESC_DTL_ZORG_OPTS = [
    { key: "gecombineerd", label: "Gecombineerd" },
    { key: "vlz", label: "VLZ" },
    { key: "ambulant-extern", label: "Ambulant extern" },
    { key: "fasewonen", label: "Fase wonen" },
    { key: "ambulant-intern", label: "Ambulant intern" },
    { key: "verblijf-behandeling", label: "Verblijf en behandeling" },
    { key: "overig", label: "Overig" },
  ];
  var BESC_DTL_FASE_OPTS = [
    { key: "in_aanvraag", label: "In aanvraag" },
    { key: "actief", label: "Actief" },
    { key: "in_zorg", label: "In zorg" },
    { key: "verlopen", label: "Verlopen" },
    { key: "uit_zorg", label: "Uit zorg" },
    { key: "in_dienst", label: "In dienst" },
    { key: "uit_dienst", label: "Uit dienst" },
  ];
  var BESC_DTL_DECL_BASE = [
    { key: "Handmatig", label: "Handmatig" },
    { key: "ONS", label: "ONS" },
    { key: "DNS", label: "DNS" },
    { key: "WLZ", label: "WLZ" },
    { key: "SVB", label: "SVB" },
    { key: "Overig", label: "Overig" },
  ];

  function showToast(msg) {
    if (!msg || !toastEl) return;
    toastEl.textContent = msg;
    toastEl.removeAttribute("hidden");
    toastEl.classList.add("is-visible");
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(function () {
      toastEl.classList.remove("is-visible");
      toastEl.setAttribute("hidden", "");
    }, 2400);
  }

  function n2(x) {
    if (x == null || x === "") return 0;
    if (typeof x === "string") {
      var ts = x.trim();
      if (ts === "" || ts === "—" || ts === "-") return 0;
      if (ts.indexOf(",") >= 0) ts = ts.replace(/\./g, "").replace(/,/g, ".");
      x = parseFloat(ts, 10);
    }
    var n = Number(x);
    if (isNaN(n)) return 0;
    return Math.round(n * 100) / 100;
  }

  function fmtEur(n) {
    return "€ " + n2(n).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtDateDisplay(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(String(iso))) return "—";
    var p = String(iso).slice(0, 10).split("-");
    return p[2] + "/" + p[1] + "/" + p[0];
  }

  // Tarieven worden in Supabase opgeslagen via window.beschikkingTarievenDB
  // (zie beschikking-tarieven-data.js). De legacy localStorage-key
  // "beschikking_tarieven_supp_v1" wordt automatisch eenmalig gemigreerd
  // bij eerste boot.
  function reportTarievenError(label, err) {
    try { console.error("[beschikking-detail tarieven]", label, err); } catch (e) { /* */ }
    var msg = "Tarief opslaan mislukt. Controleer je verbinding en probeer opnieuw.";
    if (err && err.message) msg = "Tarief opslaan mislukt: " + err.message;
    if (typeof showSaveModal === "function") {
      showSaveModal(msg, "Fout");
    } else if (typeof showToast === "function") {
      showToast(msg);
    }
  }

  function getTarievenForBesc(bescId) {
    if (!bescId) return [];
    if (window.beschikkingTarievenDB && typeof window.beschikkingTarievenDB.getForBescSync === "function") {
      return window.beschikkingTarievenDB.getForBescSync(bescId);
    }
    return [];
  }

  function openTarAddModal() {
    var m = document.getElementById("bdtl-tar-add-modal");
    var f = document.getElementById("bdtl-tar-add-form");
    if (f) f.reset();
    if (m) {
      m.removeAttribute("hidden");
      m.setAttribute("aria-hidden", "false");
    }
    var g = document.getElementById("bdtl-tar-add-geldig");
    if (g) {
      window.setTimeout(function () {
        g.focus();
      }, 0);
    }
  }

  function closeTarAddModal() {
    var m = document.getElementById("bdtl-tar-add-modal");
    if (m) {
      m.setAttribute("hidden", "");
      m.setAttribute("aria-hidden", "true");
    }
  }

  function renderBdtlTarievenTable() {
    var b = loadedBesc;
    if (!b || !b.id) return;
    var tb = document.getElementById("bdtl-tar-tbody");
    var rangeEl = document.getElementById("bdtl-tar-pager-range");
    var pageEl = document.getElementById("bdtl-tar-pager-page");
    if (!tb) return;
    var all = getTarievenForBesc(b.id);
    var qel = document.getElementById("bdtl-tar-search");
    var q = (qel && qel.value) ? String(qel.value).trim().toLowerCase() : "";
    var fVel = document.getElementById("bdtl-tar-geldig-van");
    var filterVan = fVel && fVel.value;
    var rows = all.filter(function (r) {
      if (filterVan && r.geldigVan && r.geldigVan < filterVan) return false;
      if (!q) return true;
      var s = (String(r.geldigVan) + " " + (r.reden == null ? "" : r.reden) + " " + fmtEur(r.weektarief) + " " + fmtDateDisplay((r.aangemaakt == null ? "" : String(r.aangemaakt)).slice(0, 10))).toLowerCase();
      return s.indexOf(q) !== -1;
    });
    rows = rows.slice().sort(function (a, c) {
      return (c.geldigVan || "").localeCompare(a.geldigVan || "");
    });
    var total = rows.length;
    tb.innerHTML = "";
    if (total === 0) {
      var tr0 = document.createElement("tr");
      var tdE = document.createElement("td");
      tdE.className = "bdtl-tar-empty";
      tdE.colSpan = 5;
      tdE.textContent = "Geen resultaten gevonden";
      tr0.appendChild(tdE);
      tb.appendChild(tr0);
    } else {
      for (var i = 0; i < total; i += 1) {
        var r = rows[i];
        var tr = document.createElement("tr");
        tr.setAttribute("data-tar-id", r.id);
        var td1 = document.createElement("td");
        td1.setAttribute("data-col", "select");
        var cbx = document.createElement("input");
        cbx.type = "checkbox";
        cbx.className = "table-checkbox";
        cbx.setAttribute("disabled", "");
        cbx.setAttribute("aria-label", "Selecteer rij");
        td1.appendChild(cbx);
        tr.appendChild(td1);
        var td2 = document.createElement("td");
        td2.textContent = fmtDateDisplay(r.geldigVan);
        tr.appendChild(td2);
        var td3 = document.createElement("td");
        td3.textContent = fmtEur(r.weektarief);
        tr.appendChild(td3);
        var td4 = document.createElement("td");
        td4.textContent = (r.reden && String(r.reden).trim()) ? String(r.reden) : "—";
        tr.appendChild(td4);
        var td5 = document.createElement("td");
        td5.textContent = fmtDateDisplay((r.aangemaakt == null ? "" : String(r.aangemaakt)).slice(0, 10));
        tr.appendChild(td5);
        tb.appendChild(tr);
      }
    }
    if (rangeEl) {
      rangeEl.textContent = total ? ("1–" + total + " van " + total + " totaal") : "0–0 van 0 totaal";
    }
    if (pageEl) {
      pageEl.textContent = total ? "Pagina 1 van 1" : "Pagina 1 van 0";
    }
  }

  async function onTarAddSubmit(e) {
    e.preventDefault();
    if (!loadedBesc || !loadedBesc.id) {
      showToast("Geen beschikking.");
      return;
    }
    if (!window.beschikkingTarievenDB || typeof window.beschikkingTarievenDB.add !== "function") {
      reportTarievenError("data-laag niet beschikbaar", new Error("beschikkingTarievenDB ontbreekt"));
      return;
    }
    var gEl = document.getElementById("bdtl-tar-add-geldig");
    var wEl = document.getElementById("bdtl-tar-add-week");
    var rEl = document.getElementById("bdtl-tar-add-reden");
    var geldig = gEl && gEl.value;
    if (!geldig) {
      showToast("Kies Geldig vanaf.");
      return;
    }
    var wk = wEl && wEl.value;
    if (!wk || !String(wk).trim()) {
      showToast("Vul weektarief in.");
      return;
    }
    var wn = n2(wk);
    if (wn <= 0) {
      showToast("Weektarief moet groter dan 0 zijn.");
      return;
    }
    var reden = (rEl && rEl.value) ? String(rEl.value).trim() : "";
    var submitBtn = document.getElementById("bdtl-tar-add-submit");
    if (submitBtn) submitBtn.setAttribute("disabled", "");
    try {
      await window.beschikkingTarievenDB.add({
        bescId: loadedBesc.id,
        geldigVan: geldig,
        weektarief: wn,
        reden: reden,
        aangemaakt: new Date().toISOString(),
      });
      closeTarAddModal();
      // UI ververst zichzelf via besa:beschikking-tarieven-updated event.
      if (typeof showSaveModal === "function") showSaveModal("Tarief is toegevoegd.");
      else showToast("Tarief toegevoegd.");
    } catch (err) {
      reportTarievenError("toevoegen mislukt", err);
    } finally {
      if (submitBtn) submitBtn.removeAttribute("disabled");
    }
  }

  // Notities worden in Supabase opgeslagen via window.beschikkingNotitiesDB
  // (zie beschikking-notities-data.js). De legacy localStorage-key
  // "beschikking_notities_v1" wordt automatisch eenmalig gemigreerd
  // bij eerste boot.
  var bdtlNoteEditingId = null;

  function reportNotitiesError(label, err) {
    try { console.error("[beschikking-detail notities]", label, err); } catch (e) { /* */ }
    var msg = "Notitie opslaan mislukt. Controleer je verbinding en probeer opnieuw.";
    if (err && err.message) msg = "Notitie opslaan mislukt: " + err.message;
    if (typeof showSaveModal === "function") {
      showSaveModal(msg, "Fout");
    } else if (typeof showToast === "function") {
      showToast(msg);
    }
  }

  function getNotesForBesc(bescId) {
    if (!bescId) return [];
    if (window.beschikkingNotitiesDB && typeof window.beschikkingNotitiesDB.getForBescSync === "function") {
      return window.beschikkingNotitiesDB.getForBescSync(bescId);
    }
    return [];
  }

  function notePlainPreview(html) {
    var d = document.createElement("div");
    d.innerHTML = html == null ? "" : String(html);
    var t = (d.textContent || "").replace(/\s+/g, " ").trim();
    if (t.length > 100) return t.slice(0, 100) + "…";
    return t;
  }

  function updateBdtlSideNotesSummary() {
    if (!loadedBesc || !loadedBesc.id) return;
    var p = document.getElementById("bdtl-side-notes");
    if (!p) return;
    var notes = getNotesForBesc(loadedBesc.id).slice().sort(function (a, c) {
      return new Date(c.createdAt) - new Date(a.createdAt);
    });
    if (notes.length === 0) {
      p.textContent = "Er zijn nog geen notities";
      return;
    }
    var c = notes.length;
    var prv = notePlainPreview(notes[0].bodyHtml);
    p.textContent = c === 1
      ? ("1 notitie" + (prv ? " — " + prv : ""))
      : (c + " notities" + (prv ? " — " + prv : ""));
  }

  function fmtNoteWhen(iso) {
    if (!iso) return "—";
    var d;
    try { d = new Date(iso); } catch (e) { return "—"; }
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("nl-NL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function clearBdtlNoteEditor() {
    bdtlNoteEditingId = null;
    var ed = document.getElementById("bdtl-note-editor");
    if (ed) { ed.innerHTML = ""; }
    var h2 = document.getElementById("bdtl-note-composer-h2");
    if (h2) h2.textContent = "Nieuwe notitie";
    var hi = document.getElementById("bdtl-note-editing-hint");
    if (hi) hi.setAttribute("hidden", "");
  }

  function renderBdtlNotesList() {
    if (!loadedBesc || !loadedBesc.id) return;
    var all = getNotesForBesc(loadedBesc.id);
    var list = all.slice().sort(function (a, c) {
      return new Date(c.createdAt) - new Date(a.createdAt);
    });
    var ul = document.getElementById("bdtl-note-list");
    var empty = document.getElementById("bdtl-note-empty");
    if (!ul) return;
    if (list.length === 0) {
      if (empty) empty.removeAttribute("hidden");
      ul.setAttribute("hidden", "");
      ul.innerHTML = "";
    } else {
      if (empty) empty.setAttribute("hidden", "");
      ul.removeAttribute("hidden");
      ul.innerHTML = "";
      for (var i = 0; i < list.length; i += 1) {
        var n = list[i];
        var li = document.createElement("li");
        li.className = "bdtl-note-item";
        li.setAttribute("data-note-id", n.id);
        var w = document.createElement("div");
        w.className = "bdtl-note-item-head";
        var t = document.createElement("time");
        t.className = "bdtl-note-time";
        t.setAttribute("datetime", n.createdAt);
        t.textContent = fmtNoteWhen(n.createdAt);
        w.appendChild(t);
        var act = document.createElement("div");
        act.className = "bdtl-note-item-actions";
        var bEd = document.createElement("button");
        bEd.type = "button";
        bEd.className = "btn-outline bdtl-note-bew";
        bEd.setAttribute("data-bew-id", n.id);
        bEd.textContent = "Bewerken";
        var bDel = document.createElement("button");
        bDel.type = "button";
        bDel.className = "btn-outline bdtl-note-del";
        bDel.setAttribute("data-del-id", n.id);
        bDel.textContent = "Verwijderen";
        act.appendChild(bEd);
        act.appendChild(bDel);
        w.appendChild(act);
        li.appendChild(w);
        var bd = document.createElement("div");
        bd.className = "bdtl-note-body bdtl-note-body--in-list";
        bd.setAttribute("data-note-id", n.id);
        bd.innerHTML = n.bodyHtml || "<p>—</p>";
        li.appendChild(bd);
        ul.appendChild(li);
      }
    }
  }

  function bdtlNoteRteAction(btn) {
    var cmd = btn.getAttribute("data-cmd");
    var val = btn.getAttribute("data-cmd-value");
    var ed = document.getElementById("bdtl-note-editor");
    if (ed) ed.focus();
    try {
      if (cmd === "formatBlock" && val) {
        document.execCommand("formatBlock", false, val.toLowerCase() === "h3" ? "h3" : val);
        return;
      }
      if (cmd) {
        document.execCommand(cmd, false, null);
      }
    } catch (e) { /* */ }
  }

  async function onBdtlNoteVerzenden() {
    if (!loadedBesc || !loadedBesc.id) {
      showToast("Geen beschikking.");
      return;
    }
    if (!window.beschikkingNotitiesDB || typeof window.beschikkingNotitiesDB.add !== "function") {
      reportNotitiesError("data-laag niet beschikbaar", new Error("beschikkingNotitiesDB ontbreekt"));
      return;
    }
    var ed = document.getElementById("bdtl-note-editor");
    var bodyHtml = (ed && ed.innerHTML) ? String(ed.innerHTML) : "";
    if (!notePlainPreview(bodyHtml)) {
      showToast("Vul de notitie in.");
      return;
    }
    var verzendBtn = document.getElementById("bdtl-note-verzend");
    if (verzendBtn) verzendBtn.setAttribute("disabled", "");
    try {
      if (bdtlNoteEditingId) {
        await window.beschikkingNotitiesDB.update(bdtlNoteEditingId, {
          bescId: loadedBesc.id,
          bodyHtml: bodyHtml,
        });
        if (typeof showSaveModal === "function") showSaveModal("Notitie is opgeslagen.");
        else showToast("Notitie opgeslagen.");
      } else {
        await window.beschikkingNotitiesDB.add({
          bescId: loadedBesc.id,
          bodyHtml: bodyHtml,
          createdAt: new Date().toISOString(),
        });
        if (typeof showSaveModal === "function") showSaveModal("Notitie is toegevoegd.");
        else showToast("Notitie toegevoegd.");
      }
      clearBdtlNoteEditor();
      // UI ververst zichzelf via besa:beschikking-notities-updated event.
    } catch (err) {
      reportNotitiesError("opslaan mislukt", err);
    } finally {
      if (verzendBtn) verzendBtn.removeAttribute("disabled");
    }
  }

  function parseQueryId() {
    var p;
    try {
      p = new URLSearchParams(window.location.search);
    } catch (e) {
      return "";
    }
    return p.get("id") || "";
  }

  function oneLineName(cl) {
    if (!cl) return "";
    return (String(cl.voornaam || "").trim() + " " + String(cl.achternaam || "").trim()).trim();
  }

  function buildClientLabel(cl) {
    if (!cl) return "—";
    var s = oneLineName(cl);
    var n = cl.clientnummer != null && !isNaN(cl.clientnummer) ? " " + cl.clientnummer : "";
    return (s || "—") + (n ? " — " + n.trim() : "");
  }

  function clientFasePillClass(fase) {
    if (typeof window.besaFaseClientPillClass === "function") {
      return window.besaFaseClientPillClass(fase);
    }
    var t = String(fase || "").toLowerCase();
    if (t === "in aanvraag") return "cl-fase-pill cl-fase-pill--in-aanvraag";
    if (t === "uit zorg") return "cl-fase-pill cl-fase-pill--uit-zorg";
    if (t === "in zorg") return "cl-fase-pill cl-fase-pill--in-zorg";
    return "cl-fase-pill cl-fase-pill--in-zorg";
  }

  function clientFasePillLabel(fase) {
    var t = String(fase || "").toLowerCase();
    if (t === "in zorg") return "In zorg";
    if (t === "in aanvraag") return "In aanvraag";
    if (t === "uit zorg") return "Uit zorg";
    return fase && String(fase).trim() ? fase : "—";
  }

  function faseBescToDotClass(f) {
    if (typeof window.besaFaseBescDotClass === "function") {
      return window.besaFaseBescDotClass(f);
    }
    f = String(f || "").toLowerCase();
    if (f === "in_aanvraag") return "bdtl-fase-dot bdtl-fase-dot--fase-in-aanvraag";
    if (f === "actief") return "bdtl-fase-dot bdtl-fase-dot--fase-actief";
    if (f === "in_zorg") return "bdtl-fase-dot bdtl-fase-dot--fase-in-zorg";
    if (f === "verlopen") return "bdtl-fase-dot bdtl-fase-dot--fase-verlopen";
    if (f === "uit_zorg") return "bdtl-fase-dot bdtl-fase-dot--fase-uit-zorg";
    if (f === "in_dienst") return "bdtl-fase-dot bdtl-fase-dot--fase-in-dienst";
    if (f === "uit_dienst") return "bdtl-fase-dot bdtl-fase-dot--fase-uit-dienst";
    return "bdtl-fase-dot bdtl-fase-dot--fase-onbekend";
  }

  function syncBescFaseDot() {
    var dot = document.getElementById("bdtl-fase-dot");
    var sel = document.getElementById("bdtl-fase-besc");
    if (!dot || !sel) return;
    dot.className = faseBescToDotClass(sel.value);
  }

  function setDeclOptionsWithValue(current) {
    var sel = document.getElementById("bdtl-dm");
    if (!sel) return;
    var seen = {};
    var k;
    for (k = 0; k < BESC_DTL_DECL_BASE.length; k += 1) {
      var d = BESC_DTL_DECL_BASE[k];
      seen[d.key] = d.label;
    }
    if (current && !seen[String(current)]) {
      var cv = String(current);
      seen[cv] = cv;
    }
    var keys = Object.keys(seen).sort(function (a, b) { return String(seen[a]).localeCompare(String(seen[b]), "nl"); });
    sel.innerHTML = "";
    for (k = 0; k < keys.length; k += 1) {
      var o = document.createElement("option");
      o.value = keys[k];
      o.textContent = seen[keys[k]];
      sel.appendChild(o);
    }
    if (current && String(current)) sel.value = String(current);
  }

  function setZorgOptionsWithValue(currentKey) {
    var sel = document.getElementById("bdtl-zorg");
    if (!sel) return;
    var byKey = {};
    var b;
    for (b = 0; b < BESC_DTL_ZORG_OPTS.length; b += 1) {
      byKey[BESC_DTL_ZORG_OPTS[b].key] = BESC_DTL_ZORG_OPTS[b].label;
    }
    if (typeof SUPPORTED_ZORGSOORT_KEYS_BESC === "function" && typeof getBescZorgsoortLabel === "function") {
      var ar = SUPPORTED_ZORGSOORT_KEYS_BESC() || [];
      for (b = 0; b < ar.length; b += 1) {
        byKey[ar[b]] = getBescZorgsoortLabel(ar[b]) || ar[b];
      }
    }
    if (currentKey && !byKey[String(currentKey)]) {
      byKey[String(currentKey)] = typeof getBescZorgsoortLabel === "function"
        ? (getBescZorgsoortLabel(currentKey) || String(currentKey))
        : String(currentKey);
    }
    var klist = Object.keys(byKey).sort(function (a, c) { return String(byKey[a]).localeCompare(String(byKey[c]), "nl"); });
    sel.innerHTML = "";
    for (b = 0; b < klist.length; b += 1) {
      var o2 = document.createElement("option");
      o2.value = klist[b];
      o2.textContent = byKey[klist[b]];
      sel.appendChild(o2);
    }
    if (currentKey && String(currentKey)) sel.value = String(currentKey);
  }

  function setFaseSelectValue(current) {
    var sel = document.getElementById("bdtl-fase-besc");
    if (!sel) return;
    var cur = String(current || "actief").toLowerCase();
    sel.innerHTML = "";
    for (var f = 0; f < BESC_DTL_FASE_OPTS.length; f += 1) {
      var fo = document.createElement("option");
      fo.value = BESC_DTL_FASE_OPTS[f].key;
      fo.textContent = BESC_DTL_FASE_OPTS[f].label;
      sel.appendChild(fo);
    }
    var has = false;
    for (var o = 0; o < sel.options.length; o += 1) {
      if (sel.options[o].value === cur) { has = true; break; }
    }
    if (!has) {
      var o3 = document.createElement("option");
      o3.value = cur;
      o3.textContent = cur;
      sel.appendChild(o3);
    }
    sel.value = cur;
    syncBescFaseDot();
  }

  function fillClientSelect(selectedId) {
    var cSel = document.getElementById("bdtl-client");
    if (!cSel || typeof getClientenItems !== "function") return;
    var clis = (getClientenItems() || []).filter(function (x) { return x && x.id; });
    clis = clis.slice().sort(function (a, c) {
      return oneLineName(a).toLowerCase().localeCompare(oneLineName(c).toLowerCase(), "nl", { sensitivity: "base" });
    });
    cSel.innerHTML = "";
    for (var c = 0; c < clis.length; c += 1) {
      var o = document.createElement("option");
      o.value = clis[c].id;
      o.textContent = buildClientLabel(clis[c]);
      if (clis[c].archived) o.textContent += " (gearchiveerd)";
      cSel.appendChild(o);
    }
    if (selectedId) cSel.value = String(selectedId);
  }

  function updateClFasePill(clientId) {
    var pill = document.getElementById("bdtl-pill-clfase");
    if (!pill) return;
    if (typeof getClientenById !== "function") {
      pill.textContent = "—";
      return;
    }
    var cl = getClientenById(clientId);
    if (!cl) {
      pill.className = "cl-fase-pill cl-fase-pill--in-zorg";
      pill.textContent = "Onbekend";
      return;
    }
    pill.className = clientFasePillClass(cl.fase);
    pill.textContent = clientFasePillLabel(cl.fase);
  }

  function setFactViewContextForB(b) {
    if (!b || !b.id) return;
    window.__FVIEW_BESC = b;
    var bRef = b;
    window.__FVIEW_ROW_FILTER = function (r) {
      if (!r) return false;
      if (r.bescId && bRef.id) return String(r.bescId) === String(bRef.id);
      return String((r.besch == null ? "" : r.besch)).trim() === String(bRef.naam || "").trim();
    };
    var fbsel = document.getElementById("bdtl-fact-add-besch");
    if (fbsel && b.naam) {
      fbsel.innerHTML = "";
      var o = document.createElement("option");
      o.value = String(b.naam).trim();
      o.textContent = String(b.naam).trim();
      fbsel.appendChild(o);
    }
    if (typeof window.__bdtlFactRerender === "function") {
      window.__bdtlFactRerender();
    }
  }

  function applyForm(b) {
    loadedBesc = b;
    if (document.getElementById("bdtl-id-hid")) document.getElementById("bdtl-id-hid").textContent = b.id || "";
    if (document.getElementById("bdtl-h1")) document.getElementById("bdtl-h1").textContent = b.naam && String(b.naam).trim() ? b.naam : "Beschikking";
    try {
      document.title = (b.naam && String(b.naam).trim() ? b.naam : "Beschikking") + " — Beschikking — HR";
    } catch (e2) { /* */ }
    if (document.getElementById("bdtl-hero-naam")) document.getElementById("bdtl-hero-naam").textContent = b.naam && String(b.naam).trim() ? b.naam : "—";

    if (document.getElementById("bdtl-side-client")) {
      var sideTxt = b.clientLabel && String(b.clientLabel).trim() ? b.clientLabel : null;
      if (!sideTxt && typeof getClientenById === "function") {
        var cl0 = getClientenById(b.clientId);
        if (cl0) sideTxt = buildClientLabel(cl0);
      }
      document.getElementById("bdtl-side-client").textContent = sideTxt || "—";
    }

    (function setBedragenKvs() {
      var o = fmtEur(b.betaaldCumulatief);
      var t = fmtEur(b.teDeclarerenLM);
      var n = fmtEur(b.nogNietGedeclareerd);
      [ ["bdtl-ont", o], ["bdtl-ted", t], ["bdtl-nng", n] ].forEach(function (pair) {
        var el = document.getElementById(pair[0]);
        if (el) el.textContent = pair[1];
      });
    }());
    if (document.getElementById("bdtl-side-maandbedr")) document.getElementById("bdtl-side-maandbedr").textContent = fmtEur(b.teDeclarerenLM);

    if (document.getElementById("bdtl-side-s")) document.getElementById("bdtl-side-s").textContent = fmtDateDisplay(b.startISO);
    if (document.getElementById("bdtl-side-e")) document.getElementById("bdtl-side-e").textContent = fmtDateDisplay(b.eindISO);

    fillClientSelect(b.clientId);
    updateClFasePill(b.clientId);
    if (document.getElementById("bdtl-naam")) document.getElementById("bdtl-naam").value = b.naam || "";
    setDeclOptionsWithValue(b.declMeth);
    setZorgOptionsWithValue(b.zorgsoortKey);
    if (document.getElementById("bdtl-start")) document.getElementById("bdtl-start").value = b.startISO || "";
    if (document.getElementById("bdtl-eind")) document.getElementById("bdtl-eind").value = b.eindISO || "";
    setFaseSelectValue(b.fase);
    var wt = document.getElementById("bdtl-weekt");
    if (wt) {
      if (b.tariefEenheid === "week") {
        var te = b.tariefEur;
        if (te != null && n2(te) > 0) {
          var s0 = String(te).indexOf(".") >= 0 ? n2(te).toFixed(2) : String(te);
          if (s0.indexOf(".") >= 0) s0 = s0.replace(".", ",");
          wt.value = s0;
        } else { wt.value = ""; }
      } else {
        wt.value = "";
      }
    }
    setFactViewContextForB(b);
    renderBdtlTarievenTable();
    updateBdtlSideNotesSummary();
    renderBdtlNotesList();
    initBescAuditForView(b);
  }

  function onSave(e) {
    e.preventDefault();
    if (!setBeschikkingField || !loadedBesc || !loadedBesc.id) return;
    var cSel = document.getElementById("bdtl-client");
    var na = (document.getElementById("bdtl-naam") && document.getElementById("bdtl-naam").value) || "";
    var cId = cSel && cSel.value;
    if (!cId) {
      showToast("Kies een cliënt");
      return;
    }
    if (typeof getClientenById !== "function") return;
    var wk = document.getElementById("bdtl-weekt") && document.getElementById("bdtl-weekt").value.trim();
    setBeschikkingField(loadedBesc.id, function (row) {
      var cl = getClientenById(cId) || null;
      row.clientId = cId;
      row.clientLabel = cl
        ? (String((cl.voornaam || "")).trim() + " " + String((cl.achternaam || "")).trim()).trim() || "—"
        : (row.clientLabel || "—");
      row.locatie = cl && cl.locatie != null ? String(cl.locatie).trim() || "—" : (row.locatie || "—");
      row.naam = na.trim() || "Beschikking";
      row.declMeth = (document.getElementById("bdtl-dm") && document.getElementById("bdtl-dm").value) || "ONS";
      row.zorgsoortKey = (document.getElementById("bdtl-zorg") && document.getElementById("bdtl-zorg").value) || "gecombineerd";
      row.fase = (document.getElementById("bdtl-fase-besc") && document.getElementById("bdtl-fase-besc").value) || "actief";
      row.startISO = (document.getElementById("bdtl-start") && document.getElementById("bdtl-start").value) || "";
      row.eindISO = (document.getElementById("bdtl-eind") && document.getElementById("bdtl-eind").value) || "";
      if (wk) {
        row.tariefEenheid = "week";
        row.tariefEur = n2(wk);
      } else if (loadedBesc.tariefEenheid === "week") {
        row.tariefEenheid = "uur";
        row.tariefEur = 0;
      }
    });
    var fresh = getBeschikkingById(loadedBesc.id);
    if (fresh) applyForm(fresh);
    if (typeof showSaveModal === "function") showSaveModal("Beschikking is opgeslagen.");
    else showToast("Beschikking opgeslagen");
    if (loadedBesc && loadedBesc.id) {
      appendBescAudit(loadedBesc.id, "bewerken", "Beschikking opgeslagen (wijziging vastgelegd).", "Beschikking");
      var pA0 = document.getElementById("bdtl-panel-aud");
      if (pA0 && !pA0.hidden) {
        bdtlAudPage = 1;
        renderBdtlAuditTable();
      }
    }
  }

  // Audit-rijen worden in Supabase opgeslagen via window.beschikkingAuditDB
  // (zie beschikking-audit-data.js). De legacy localStorage-key
  // "besa_besc_audit_v1" wordt automatisch eenmalig gemigreerd bij eerste
  // boot. LS_BESC_AUDIT_COLS blijft in localStorage want dat is UI-state
  // (kolomvoorkeur per gebruiker, niet inhoudelijke data).
  var LS_BESC_AUDIT_COLS = "besa_besc_audit_cols_v1";
  var bdtlAudPage = 1;
  var BDTL_AUD_COLS = [
    { id: "ts", label: "Tijdstempel" },
    { id: "act", label: "Actie" },
    { id: "user", label: "Veroorzaker" },
    { id: "det", label: "Details" },
    { id: "ip", label: "IP-adres" },
    { id: "res", label: "Resource" },
  ];

  function bdtlGetCurrentUser() {
    var av = document.querySelector(".top-avatar");
    var t = av && av.textContent ? String(av.textContent).trim() : "";
    if (t) return t;
    try {
      var s = localStorage.getItem("besa_display_name");
      if (s && s.trim()) return s.trim();
    } catch (e) { /* */ }
    return "Huidige gebruiker";
  }

  function bdtlSimIp() {
    try {
      var k = "besa_sim_ip_v1";
      var v = localStorage.getItem(k);
      if (v) return v;
      var n = 100 + Math.floor(Math.random() * 150);
      v = "10.0.0." + n;
      localStorage.setItem(k, v);
      return v;
    } catch (e) {
      return "—";
    }
  }

  function reportBescAuditError(label, err) {
    try { console.error("[beschikking-detail audit]", label, err); } catch (e) { /* */ }
    // Audit-failures niet als modal tonen — anders krijg je een rode pop-up
    // bij elke page-view. Console-log + silent doorgaan is hier juist.
  }

  function getBescAuditList(bid) {
    if (!bid) return [];
    if (window.beschikkingAuditDB && typeof window.beschikkingAuditDB.getForBescSync === "function") {
      return window.beschikkingAuditDB.getForBescSync(bid);
    }
    return [];
  }

  function appendBescAudit(bid, act, details, res) {
    act = String(act || "").toLowerCase();
    if (act !== "bekijken" && act !== "aanmaken" && act !== "bewerken") return;
    if (!bid) return;
    if (!window.beschikkingAuditDB || typeof window.beschikkingAuditDB.add !== "function") {
      reportBescAuditError("data-laag niet beschikbaar", new Error("beschikkingAuditDB ontbreekt"));
      return;
    }
    var ua;
    try {
      ua = typeof navigator !== "undefined" && navigator.userAgent ? String(navigator.userAgent) : "";
    } catch (e2) {
      ua = "";
    }
    // Fire-and-forget: UI ververst zichzelf via besa:beschikking-audit-updated
    // event zodra Supabase de definitieve rij heeft teruggegeven (de cache
    // krijgt eerst een optimistic insert, daarna replacement).
    window.beschikkingAuditDB.add({
      bescId: bid,
      act: act,
      user: bdtlGetCurrentUser(),
      details: details || "—",
      res: res || "Beschikking",
      ip: bdtlSimIp(),
      ua: ua,
      st: "succes",
    }).catch(function (err) { reportBescAuditError("toevoegen mislukt", err); });
  }

  function seedBescAuditIfEmpty(_bid) {
    // No-op sinds Stage 3: audit-data komt nu uit Supabase, geen demo-rijen
    // meer lokaal seeden. Lege beschikkingen krijgen pas een eerste rij
    // wanneer de gebruiker hem opent (via maybeLogBescAuditView).
  }

  function maybeLogBescAuditView(bid) {
    if (!bid) return;
    try {
      var sk = "bdtl_aud_view_" + String(bid);
      if (sessionStorage.getItem(sk)) return;
      sessionStorage.setItem(sk, "1");
    } catch (e) { /* */ }
    appendBescAudit(bid, "bekijken", "Beschikking geopend of bekeken in dit dossier.", "Beschikking");
  }

  function loadAudColState() {
    try {
      var o = JSON.parse(localStorage.getItem(LS_BESC_AUDIT_COLS) || "null");
      if (o && typeof o === "object") return o;
    } catch (e) { /* */ }
    var d = {};
    for (var i = 0; i < BDTL_AUD_COLS.length; i += 1) d[BDTL_AUD_COLS[i].id] = true;
    return d;
  }

  function saveAudColState(st) {
    try {
      localStorage.setItem(LS_BESC_AUDIT_COLS, JSON.stringify(st));
    } catch (e) { /* */ }
  }

  function applyAudColVisibility() {
    var st = loadAudColState();
    var tbl = document.getElementById("bdtl-aud-table");
    if (!tbl) return;
    tbl.querySelectorAll("[data-bdtl-aud-col]").forEach(function (el) {
      var c = el.getAttribute("data-bdtl-aud-col");
      var on = st[c] !== false;
      el.classList.toggle("col-hidden", !on);
    });
  }

  function buildBdtlAudColsList() {
    var ul = document.getElementById("bdtl-aud-cols-list");
    if (!ul) return;
    var st = loadAudColState();
    ul.innerHTML = "";
    for (var i = 0; i < BDTL_AUD_COLS.length; i += 1) {
      var c = BDTL_AUD_COLS[i];
      var li = document.createElement("li");
      li.setAttribute("role", "none");
      var on = st[c.id] !== false;
      li.innerHTML = "<label class=\"column-toggle" + (on ? " is-checked" : "") + "\" data-bdtl-aud-col-id=\"" + c.id + "\" role=\"menuitemcheckbox\" aria-checked=\"" + (on ? "true" : "false") + "\"><span class=\"column-check\" aria-hidden=\"true\">✓</span> " + c.label + "</label>";
      ul.appendChild(li);
    }
  }

  function fmtAudTs(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("nl-NL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function auditPillClass(act) {
    var a = String(act || "").toLowerCase();
    if (a === "bekijken") return "bdtl-audit-pill bdtl-audit-pill--bekijken";
    if (a === "aanmaken") return "bdtl-audit-pill bdtl-audit-pill--aanmaken";
    if (a === "bewerken") return "bdtl-audit-pill bdtl-audit-pill--bewerken";
    return "bdtl-audit-pill bdtl-audit-pill--onbekend";
  }

  function auditActLabel(act) {
    var a = String(act || "").toLowerCase();
    if (a === "bekijken") return "Bekijken";
    if (a === "aanmaken") return "Aanmaken";
    if (a === "bewerken") return "Bewerken";
    return act || "—";
  }

  function auditActEnForDetail(act) {
    var a = String(act || "").toLowerCase();
    if (a === "bekijken") return "VIEW";
    if (a === "aanmaken") return "CREATE";
    if (a === "bewerken") return "UPDATE";
    return "—";
  }

  function fmtAudDtlModalTs(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function renderBdtlAuditTable() {
    var b = loadedBesc;
    var tb = document.getElementById("bdtl-aud-tbody");
    var rge = document.getElementById("bdtl-aud-pager-range");
    var pge = document.getElementById("bdtl-aud-pager-page");
    if (!b || !b.id || !tb) return;
    var all = getBescAuditList(b.id);
    var fUser = document.getElementById("bdtl-aud-sel-user");
    if (fUser) {
      var users = [];
      var seen = {};
      for (var u = 0; u < all.length; u += 1) {
        var us = all[u] && all[u].user != null ? String(all[u].user) : "";
        if (us && !seen[us]) { seen[us] = 1; users.push(us); }
      }
      users.sort(function (a, c) { return a.localeCompare(c, "nl", { sensitivity: "base" }); });
      var curU = fUser.value;
      fUser.innerHTML = "<option value=\"\">Alle</option>";
      for (var ui = 0; ui < users.length; ui += 1) {
        var o = document.createElement("option");
        o.value = users[ui];
        o.textContent = users[ui];
        fUser.appendChild(o);
      }
      if (curU && users.indexOf(curU) >= 0) fUser.value = curU;
    }
    var rows = getBescAuditFilteredRows();
    var total = rows.length;
    var perEl = document.getElementById("bdtl-aud-rows");
    var per = perEl ? parseInt(perEl.value, 10) : 15;
    if (isNaN(per) || per < 1) per = 15;
    var pages = Math.max(1, Math.ceil(total / per) || 1);
    if (bdtlAudPage > pages) bdtlAudPage = pages;
    if (bdtlAudPage < 1) bdtlAudPage = 1;
    var start = (bdtlAudPage - 1) * per;
    var slice = rows.slice(start, start + per);
    tb.innerHTML = "";
    if (total === 0) {
      var trE = document.createElement("tr");
      var tdE = document.createElement("td");
      tdE.colSpan = 6;
      tdE.className = "bdtl-aud-empty";
      var rawN = all.length;
      tdE.textContent = rawN > 0
        ? "Geen resultaten. Pas zoek- of filterinstellingen aan."
        : "Geen auditregels. Acties (bekijken, wijzigen) worden hier vastgelegd.";
      trE.appendChild(tdE);
      tb.appendChild(trE);
    }
    for (var i = 0; i < slice.length; i += 1) {
      var row = slice[i];
      var tr = document.createElement("tr");
      if (row && row.id) {
        tr.classList.add("bdtl-aud-tr");
        tr.setAttribute("data-bdtl-aud-id", String(row.id));
      }
      var td1 = document.createElement("td");
      td1.setAttribute("data-bdtl-aud-col", "ts");
      td1.setAttribute("data-col", "ts");
      td1.textContent = fmtAudTs(row.t);
      tr.appendChild(td1);
      var td2 = document.createElement("td");
      td2.setAttribute("data-bdtl-aud-col", "act");
      td2.setAttribute("data-col", "act");
      var sp = document.createElement("span");
      sp.className = auditPillClass(row.act);
      sp.textContent = auditActLabel(row.act);
      td2.appendChild(sp);
      tr.appendChild(td2);
      var td3 = document.createElement("td");
      td3.setAttribute("data-bdtl-aud-col", "user");
      td3.setAttribute("data-col", "user");
      var usp = document.createElement("span");
      usp.className = "bdtl-aud-user";
      usp.textContent = row.user != null ? String(row.user) : "—";
      td3.appendChild(usp);
      tr.appendChild(td3);
      var td4 = document.createElement("td");
      td4.setAttribute("data-bdtl-aud-col", "det");
      td4.setAttribute("data-col", "det");
      td4.textContent = row.details != null ? String(row.details) : "—";
      tr.appendChild(td4);
      var td5 = document.createElement("td");
      td5.setAttribute("data-bdtl-aud-col", "ip");
      td5.setAttribute("data-col", "ip");
      td5.className = "bdtl-aud-ip";
      td5.textContent = row.ip != null ? String(row.ip) : "—";
      tr.appendChild(td5);
      var td6 = document.createElement("td");
      td6.setAttribute("data-bdtl-aud-col", "res");
      td6.setAttribute("data-col", "res");
      var a = document.createElement("a");
      a.className = "bdtl-aud-res";
      a.href = "#";
      a.textContent = row.res != null && String(row.res).trim() ? String(row.res) : "Beschikking";
      a.addEventListener("click", function (e) { e.preventDefault(); });
      td6.appendChild(a);
      tr.appendChild(td6);
      tb.appendChild(tr);
    }
    if (rge) {
      rge.textContent = total === 0 ? "0 van 0" : (start + 1) + "–" + (start + slice.length) + " van " + total;
    }
    if (pge) pge.textContent = "Pagina " + bdtlAudPage + " van " + pages;
    var pf = document.getElementById("bdtl-aud-pager-first");
    var pp = document.getElementById("bdtl-aud-pager-prev");
    var pn = document.getElementById("bdtl-aud-pager-next");
    var pl = document.getElementById("bdtl-aud-pager-last");
    if (pf) pf.disabled = bdtlAudPage <= 1;
    if (pp) pp.disabled = bdtlAudPage <= 1;
    if (pn) pn.disabled = bdtlAudPage >= pages;
    if (pl) pl.disabled = bdtlAudPage >= pages;
    applyAudColVisibility();
  }

  function wireBdtlAudit() {
    buildBdtlAudColsList();
    var sq = document.getElementById("bdtl-aud-search");
    if (sq) {
      sq.addEventListener("input", function () {
        bdtlAudPage = 1;
        renderBdtlAuditTable();
      });
    }
    [ "bdtl-aud-sel-res", "bdtl-aud-sel-user", "bdtl-aud-sel-act" ].forEach(function (id) {
      var s = document.getElementById(id);
      if (s) s.addEventListener("change", function () {
        bdtlAudPage = 1;
        renderBdtlAuditTable();
      });
    });
    var rws = document.getElementById("bdtl-aud-rows");
    if (rws) {
      rws.addEventListener("change", function () {
        bdtlAudPage = 1;
        renderBdtlAuditTable();
      });
    }
    var acb = document.getElementById("bdtl-aud-cols-btn");
    var acp = document.getElementById("bdtl-aud-cols-panel");
    if (acb && acp) {
      acb.addEventListener("click", function (e) {
        e.stopPropagation();
        if (acp.hasAttribute("hidden")) {
          acp.removeAttribute("hidden");
          acb.setAttribute("aria-expanded", "true");
        } else {
          acp.setAttribute("hidden", "");
          acb.setAttribute("aria-expanded", "false");
        }
      });
    }
    var aul = document.getElementById("bdtl-aud-cols-list");
    if (aul) {
      aul.addEventListener("click", function (e) {
        var t = e.target && e.target.closest && e.target.closest("label.column-toggle");
        if (!t) return;
        t.classList.toggle("is-checked");
        var on = t.classList.contains("is-checked");
        t.setAttribute("aria-checked", on ? "true" : "false");
        var cid = t.getAttribute("data-bdtl-aud-col-id");
        if (cid) {
          var st = loadAudColState();
          st[cid] = on;
          saveAudColState(st);
        }
        applyAudColVisibility();
      });
    }
    document.addEventListener("click", function (ev) {
      if (!acb || !acp || acp.hasAttribute("hidden")) return;
      if (ev.target === acb || (acb.contains && acb.contains(ev.target)) || (acp.contains && acp.contains(ev.target))) return;
      acp.setAttribute("hidden", "");
      acb.setAttribute("aria-expanded", "false");
    });
    function bdtlAudPageCount() {
      var t = getBescAuditFilteredRows().length;
      var per3 = rws && rws.value ? parseInt(rws.value, 10) : 15;
      if (isNaN(per3) || per3 < 1) per3 = 15;
      return Math.max(1, Math.ceil(t / per3) || 1);
    }
    var pfirst = document.getElementById("bdtl-aud-pager-first");
    if (pfirst) pfirst.addEventListener("click", function () { bdtlAudPage = 1; renderBdtlAuditTable(); });
    var pprev = document.getElementById("bdtl-aud-pager-prev");
    if (pprev) pprev.addEventListener("click", function () { bdtlAudPage -= 1; if (bdtlAudPage < 1) bdtlAudPage = 1; renderBdtlAuditTable(); });
    var pnext = document.getElementById("bdtl-aud-pager-next");
    if (pnext) pnext.addEventListener("click", function () {
      var pages3 = bdtlAudPageCount();
      bdtlAudPage += 1;
      if (bdtlAudPage > pages3) bdtlAudPage = pages3;
      renderBdtlAuditTable();
    });
    var plast = document.getElementById("bdtl-aud-pager-last");
    if (plast) plast.addEventListener("click", function () { bdtlAudPage = bdtlAudPageCount(); renderBdtlAuditTable(); });
    (function wireBdtlAudDtl() {
      var tbaud = document.getElementById("bdtl-aud-tbody");
      if (tbaud) {
        tbaud.addEventListener("click", function (e) {
          var tr0 = e.target && e.target.closest && e.target.closest("tr.bdtl-aud-tr");
          if (!tr0) return;
          var aid = tr0.getAttribute("data-bdtl-aud-id");
          if (!aid || !loadedBesc || !loadedBesc.id) return;
          var list0 = getBescAuditList(loadedBesc.id);
          var found0 = null;
          for (var j0 = 0; j0 < list0.length; j0 += 1) {
            if (list0[j0] && String(list0[j0].id) === String(aid)) { found0 = list0[j0]; break; }
          }
          if (found0) openBdtlAudDtlModal(found0);
        });
      }
      var mo = document.getElementById("bdtl-aud-dtl-modal");
      if (mo) {
        mo.addEventListener("click", function (ev) {
          if (ev.target === mo) closeBdtlAudDtlModal();
        });
      }
      var bx = document.getElementById("bdtl-aud-dtl-x");
      if (bx) bx.addEventListener("click", function () { closeBdtlAudDtlModal(); });
      var bc = document.getElementById("bdtl-aud-dtl-close");
      if (bc) bc.addEventListener("click", function () { closeBdtlAudDtlModal(); });
      document.addEventListener("keydown", function (ev) {
        if (ev.key !== "Escape") return;
        var m1 = document.getElementById("bdtl-aud-dtl-modal");
        if (m1 && !m1.hasAttribute("hidden")) {
          ev.preventDefault();
          closeBdtlAudDtlModal();
        }
      });
    }());
  }

  function openBdtlAudDtlModal(row) {
    if (!row || !loadedBesc || !loadedBesc.id) return;
    var m = document.getElementById("bdtl-aud-dtl-modal");
    if (!m) return;
    var rname = row.res != null && String(row.res).trim() ? String(row.res) : "Beschikking";
    var actEl = document.getElementById("bdtl-aud-dtl-act");
    if (actEl) actEl.textContent = auditActEnForDetail(row.act);
    var stPill = document.getElementById("bdtl-aud-dtl-st");
    if (stPill) {
      stPill.className = "bdtl-aud-dtl-pill-in";
      var s = String(row.st != null ? row.st : "succes").toLowerCase();
      if (s === "fout" || s === "error" || s === "mislukt") {
        stPill.classList.add("bdtl-aud-dtl-pill-in--err");
        stPill.textContent = "Fout";
      } else {
        stPill.classList.add("bdtl-aud-dtl-pill-in--ok");
        stPill.textContent = "Succes";
      }
    }
    var rnm = document.getElementById("bdtl-aud-dtl-res-name");
    if (rnm) rnm.textContent = rname;
    var tsE = document.getElementById("bdtl-aud-dtl-ts");
    if (tsE) tsE.textContent = fmtAudDtlModalTs(row.t);
    var uE = document.getElementById("bdtl-aud-dtl-user");
    if (uE) uE.textContent = row.user != null && String(row.user).trim() ? String(row.user) : "—";
    var rtyE = document.getElementById("bdtl-aud-dtl-rtype");
    if (rtyE) rtyE.textContent = rname;
    var riE = document.getElementById("bdtl-aud-dtl-rid");
    if (riE) riE.textContent = String(loadedBesc.id);
    var ipE = document.getElementById("bdtl-aud-dtl-ip");
    if (ipE) ipE.textContent = row.ip != null && String(row.ip).trim() ? String(row.ip) : "—";
    var uaE = document.getElementById("bdtl-aud-dtl-ua");
    if (uaE) {
      var uas = row.ua != null && String(row.ua).trim() ? String(row.ua) : "—";
      uaE.textContent = uas;
    }
    m.removeAttribute("hidden");
    m.setAttribute("aria-hidden", "false");
  }

  function closeBdtlAudDtlModal() {
    var m2 = document.getElementById("bdtl-aud-dtl-modal");
    if (!m2) return;
    m2.setAttribute("hidden", "");
    m2.setAttribute("aria-hidden", "true");
  }

  function initBescAuditForView(b) {
    if (!b || !b.id) return;
    seedBescAuditIfEmpty(b.id);
    maybeLogBescAuditView(b.id);
  }

  function getBescAuditFilteredRows() {
    var b = loadedBesc;
    if (!b || !b.id) return [];
    var all = getBescAuditList(b.id);
    var qel = document.getElementById("bdtl-aud-search");
    var q = (qel && qel.value) ? String(qel.value).trim().toLowerCase() : "";
    var fRes = document.getElementById("bdtl-aud-sel-res");
    var fUser = document.getElementById("bdtl-aud-sel-user");
    var fAct = document.getElementById("bdtl-aud-sel-act");
    var vRes = fRes && fRes.value ? String(fRes.value) : "";
    var vUser = fUser && fUser.value ? String(fUser.value) : "";
    var vAct = fAct && fAct.value ? String(fAct.value).toLowerCase() : "";
    return all.filter(function (r) {
      if (!r) return false;
      if (vRes && String(r.res || "") !== vRes) return false;
      if (vUser && String(r.user || "") !== vUser) return false;
      if (vAct && String(r.act || "").toLowerCase() !== vAct) return false;
      if (!q) return true;
      var blob = (String(r.t) + " " + String(r.act) + " " + String(r.user) + " " + String(r.details) + " " + String(r.ip) + " " + String(r.res) + " " + String(r.ua != null ? r.ua : "")).toLowerCase();
      return blob.indexOf(q) !== -1;
    });
  }

  function parseQueryTab() {
    try {
      var t = new URLSearchParams(window.location.search).get("tab");
      if (!t) return "details";
      t = String(t).toLowerCase();
      if (t === "audit") return "aud";
      return t;
    } catch (e) {
      return "details";
    }
  }

  function setBdtlTab(tab) {
    var chD = document.getElementById("bdtl-ch-details");
    var chF = document.getElementById("bdtl-ch-fact");
    var chT = document.getElementById("bdtl-ch-tarf");
    var chN = document.getElementById("bdtl-ch-note");
    var chA = document.getElementById("bdtl-ch-aud");
    var pD = document.getElementById("bdtl-panel-details");
    var pF = document.getElementById("bdtl-panel-fact");
    var pT = document.getElementById("bdtl-panel-tarf");
    var pN = document.getElementById("bdtl-panel-note");
    var pA = document.getElementById("bdtl-panel-aud");
    var tD = document.getElementById("bdtl-tab-dtl");
    var tF = document.getElementById("bdtl-tab-fact");
    var tT = document.getElementById("bdtl-tab-tarf");
    var tNote = document.getElementById("bdtl-tab-note");
    var tAud = document.getElementById("bdtl-tab-aud");
    if (chD) chD.hidden = tab !== "details";
    if (chF) chF.hidden = tab !== "fact";
    if (chT) chT.hidden = tab !== "tarf";
    if (chN) chN.hidden = tab !== "note";
    if (chA) chA.hidden = tab !== "aud";
    if (pD) pD.hidden = tab !== "details";
    if (pF) pF.hidden = tab !== "fact";
    if (pT) pT.hidden = tab !== "tarf";
    if (pN) pN.hidden = tab !== "note";
    if (pA) pA.hidden = tab !== "aud";
    if (tD) {
      tD.classList.toggle("besc-dtl-tab--is-active", tab === "details");
      tD.setAttribute("aria-selected", tab === "details" ? "true" : "false");
    }
    if (tF) {
      tF.classList.toggle("besc-dtl-tab--is-active", tab === "fact");
      tF.setAttribute("aria-selected", tab === "fact" ? "true" : "false");
    }
    if (tT) {
      tT.classList.toggle("besc-dtl-tab--is-active", tab === "tarf");
      tT.setAttribute("aria-selected", tab === "tarf" ? "true" : "false");
    }
    if (tNote) {
      tNote.classList.toggle("besc-dtl-tab--is-active", tab === "note");
      tNote.setAttribute("aria-selected", tab === "note" ? "true" : "false");
    }
    if (tAud) {
      tAud.classList.toggle("besc-dtl-tab--is-active", tab === "aud");
      tAud.setAttribute("aria-selected", tab === "aud" ? "true" : "false");
    }
    var bo = document.querySelector('a[href="beschikkingen.html"].side-link--nested');
    var bf = document.querySelector('a[href="facturen.html"].side-link--nested');
    if (bo) {
      if (tab === "fact") {
        bo.classList.remove("is-active");
        bo.removeAttribute("aria-current");
      } else {
        bo.classList.add("is-active");
        bo.setAttribute("aria-current", "page");
      }
    }
    if (bf) {
      if (tab === "fact") {
        bf.classList.add("is-active");
        bf.setAttribute("aria-current", "page");
      } else {
        bf.classList.remove("is-active");
        bf.removeAttribute("aria-current");
      }
    }
    if (tab === "fact" && typeof window.__bdtlFactRerender === "function") {
      window.__bdtlFactRerender();
    }
    if (tab === "tarf") {
      renderBdtlTarievenTable();
    }
    if (tab === "note") {
      renderBdtlNotesList();
      updateBdtlSideNotesSummary();
    }
    if (tab === "aud") {
      bdtlAudPage = 1;
      renderBdtlAuditTable();
    }
  }

  function run() {
    var id = parseQueryId();
    if (missEl) {
      if (!id) {
        missEl.removeAttribute("hidden");
        if (contentEl) contentEl.setAttribute("hidden", "");
        return;
      }
    }
    if (!id) return;
    var b = getBeschikkingById(id);
    if (!b) {
      if (missEl) missEl.removeAttribute("hidden");
      if (contentEl) contentEl.setAttribute("hidden", "");
      return;
    }
    if (missEl) missEl.setAttribute("hidden", "");
    if (contentEl) contentEl.removeAttribute("hidden");
    applyForm(b);
    var tab = parseQueryTab();
    if (tab === "fact") {
      setBdtlTab("fact");
    } else if (tab === "tarf" || tab === "tarieven" || tab === "rates") {
      setBdtlTab("tarf");
    } else if (tab === "note" || tab === "notities") {
      setBdtlTab("note");
    } else if (tab === "aud" || tab === "audit") {
      setBdtlTab("aud");
    } else {
      setBdtlTab("details");
    }
  }

  function wire() {
    var fSel = document.getElementById("bdtl-fase-besc");
    if (fSel) fSel.addEventListener("change", syncBescFaseDot);
    var cSel = document.getElementById("bdtl-client");
    if (cSel) cSel.addEventListener("change", function () { updateClFasePill(cSel.value); });
    var form = document.getElementById("bdtl-form");
    if (form) form.addEventListener("submit", onSave);
    var tD = document.getElementById("bdtl-tab-dtl");
    if (tD) tD.addEventListener("click", function () { setBdtlTab("details"); });
    var tF = document.getElementById("bdtl-tab-fact");
    if (tF) tF.addEventListener("click", function () { setBdtlTab("fact"); });
    var tT = document.getElementById("bdtl-tab-tarf");
    if (tT) tT.addEventListener("click", function () { setBdtlTab("tarf"); });
    var tN = document.getElementById("bdtl-tab-note");
    if (tN) tN.addEventListener("click", function () { setBdtlTab("note"); });
    var tAud2 = document.getElementById("bdtl-tab-aud");
    if (tAud2) tAud2.addEventListener("click", function () { setBdtlTab("aud"); });
    var tbar = document.getElementById("bdtl-panel-note");
    if (tbar) {
      tbar.querySelectorAll(".bdtl-rte-btn").forEach(function (b) {
        b.addEventListener("mousedown", function (e) { e.preventDefault(); });
        b.addEventListener("click", function (e) {
          e.preventDefault();
          bdtlNoteRteAction(b);
        });
      });
    }
    var bdtlVerz = document.getElementById("bdtl-note-verzend");
    if (bdtlVerz) bdtlVerz.addEventListener("click", onBdtlNoteVerzenden);
    var cne2 = document.getElementById("bdtl-note-cancel-edit");
    if (cne2) cne2.addEventListener("click", function () { clearBdtlNoteEditor(); });
    var nlist2 = document.getElementById("bdtl-note-list");
    if (nlist2) {
      nlist2.addEventListener("click", function (e) {
        if (!e.target || !e.target.closest) return;
        var bew = e.target.closest("button.bdtl-note-bew");
        if (bew) {
          var bid = bew.getAttribute("data-bew-id");
          if (!loadedBesc || !loadedBesc.id || !bid) return;
          var all0 = getNotesForBesc(loadedBesc.id);
          for (var j2 = 0; j2 < all0.length; j2 += 1) {
            if (all0[j2] && all0[j2].id === bid) {
              bdtlNoteEditingId = bid;
              var ed2 = document.getElementById("bdtl-note-editor");
              if (ed2) ed2.innerHTML = all0[j2].bodyHtml || "";
              var h2b = document.getElementById("bdtl-note-composer-h2");
              if (h2b) h2b.textContent = "Notitie bewerken";
              var hih2 = document.getElementById("bdtl-note-editing-hint");
              if (hih2) hih2.removeAttribute("hidden");
            }
          }
          return;
        }
        var del2 = e.target.closest("button.bdtl-note-del");
        if (del2) {
          var delId = del2.getAttribute("data-del-id");
          var notePreview = "";
          try {
            var noteRow = (window.beschikkingNotitiesDB && typeof window.beschikkingNotitiesDB.getByIdSync === "function")
              ? window.beschikkingNotitiesDB.getByIdSync(delId)
              : null;
            if (noteRow) {
              var rawText = String(noteRow.bodyHtml || "")
                .replace(/<[^>]+>/g, " ")
                .replace(/\s+/g, " ")
                .trim();
              if (rawText.length > 80) rawText = rawText.slice(0, 80) + "…";
              notePreview = rawText;
            }
          } catch (_e) { /* noop */ }
          var noteConfirm;
          if (typeof window.showSliderConfirmModal === "function") {
            noteConfirm = window.showSliderConfirmModal({
              title: "Notitie verwijderen",
              message: "Weet je zeker dat je deze notitie wilt verwijderen?",
              preview: notePreview,
              okLabel: "Verwijderen",
            });
          } else {
            console.warn("[beschikking-detail] showSliderConfirmModal niet beschikbaar — actie geannuleerd.");
            noteConfirm = Promise.resolve(false);
          }
          noteConfirm.then(async function (ok) {
            if (!ok) return;
            if (!window.beschikkingNotitiesDB || typeof window.beschikkingNotitiesDB.remove !== "function") {
              reportNotitiesError("verwijderen mislukt", new Error("beschikkingNotitiesDB ontbreekt"));
              return;
            }
            try {
              await window.beschikkingNotitiesDB.remove(delId);
              if (bdtlNoteEditingId === delId) clearBdtlNoteEditor();
              // UI ververst zichzelf via besa:beschikking-notities-updated event.
              if (typeof window.showActionFeedback === "function") {
                window.showActionFeedback("deleted", "Notitie");
              } else if (typeof showSaveModal === "function") {
                showSaveModal("Notitie is verwijderd.", "Verwijderd");
              } else {
                showToast("Notitie verwijderd.");
              }
            } catch (err) {
              reportNotitiesError("verwijderen mislukt", err);
            }
          });
        }
      });
    }
    (function wireTarifHeader() {
      var tcb = document.getElementById("bdtl-tar-cols-btn");
      var tcp = document.getElementById("bdtl-tar-cols-panel");
      if (tcb && tcp) {
        tcb.addEventListener("click", function (e) {
          e.stopPropagation();
          var o = tcp.hasAttribute("hidden");
          if (o) {
            tcp.removeAttribute("hidden");
            tcb.setAttribute("aria-expanded", "true");
          } else {
            tcp.setAttribute("hidden", "");
            tcb.setAttribute("aria-expanded", "false");
          }
        });
      }
      var addB = document.getElementById("bdtl-tar-add-btn");
      if (addB) {
        addB.addEventListener("click", function () {
          openTarAddModal();
        });
      }
      var taf = document.getElementById("bdtl-tar-add-form");
      if (taf) taf.addEventListener("submit", onTarAddSubmit);
      var tax = document.getElementById("bdtl-tar-add-x");
      if (tax) {
        tax.addEventListener("click", function () {
          closeTarAddModal();
        });
      }
      var tac = document.getElementById("bdtl-tar-add-cancel");
      if (tac) {
        tac.addEventListener("click", function () {
          closeTarAddModal();
        });
      }
      var tmo = document.getElementById("bdtl-tar-add-modal");
      if (tmo) {
        tmo.addEventListener("click", function (ev) {
          if (ev.target === tmo) closeTarAddModal();
        });
      }
      document.addEventListener("keydown", function (ev) {
        if (ev.key !== "Escape") return;
        var tmo2 = document.getElementById("bdtl-tar-add-modal");
        if (tmo2 && !tmo2.hasAttribute("hidden")) {
          ev.preventDefault();
          closeTarAddModal();
        }
      });
      var tsearch = document.getElementById("bdtl-tar-search");
      if (tsearch) {
        tsearch.addEventListener("input", function () {
          renderBdtlTarievenTable();
        });
      }
      var tgf = document.getElementById("bdtl-tar-geldig-van");
      if (tgf) {
        tgf.addEventListener("change", function () {
          renderBdtlTarievenTable();
        });
      }
    }());
    document.addEventListener("click", function (ev) {
      var tcb = document.getElementById("bdtl-tar-cols-btn");
      var tcp = document.getElementById("bdtl-tar-cols-panel");
      if (!tcb || !tcp || tcp.hasAttribute("hidden")) return;
      if (ev.target === tcb || tcb.contains(ev.target) || ev.target === tcp || tcp.contains(ev.target)) return;
      tcp.setAttribute("hidden", "");
      tcb.setAttribute("aria-expanded", "false");
    });
    wireBdtlAudit();

    // Live re-render bij elke wijziging in de Supabase-data-lagen (incl.
    // bootstrap, andere tab, externe sync). De handlers zijn no-op als
    // er nog geen beschikking geladen is.
    window.addEventListener("besa:beschikking-tarieven-updated", function () {
      try { if (loadedBesc && loadedBesc.id) renderBdtlTarievenTable(); } catch (e) { /* */ }
    });
    window.addEventListener("besa:beschikking-notities-updated", function () {
      try {
        if (!loadedBesc || !loadedBesc.id) return;
        renderBdtlNotesList();
        updateBdtlSideNotesSummary();
      } catch (e) { /* */ }
    });
    window.addEventListener("besa:beschikking-audit-updated", function () {
      try { if (loadedBesc && loadedBesc.id) renderBdtlAuditTable(); } catch (e) { /* */ }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { wire(); run(); });
  } else {
    wire();
    run();
  }
})();
