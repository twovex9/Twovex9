/**
 * medewerker-functioneren.js — "Functioneren"-tab in het medewerkerdossier (G36-42).
 * Functioneringscyclus (gesprekken/doelen/verbetertrajecten/waarschuwingen) +
 * gestructureerde opleidingen/certificeringen per medewerker.
 * Office-only (RLS via is_office_staff; de detailpagina is sowieso HR/office-gegate).
 * Config-gedreven CRUD rechtstreeks via ffSupabase (RLS-gescoped).
 */
(function () {
  "use strict";

  function supa() {
    if (!window.ffSupabase) throw new Error("Supabase client niet geladen");
    return window.ffSupabase;
  }
  function esc(s) { var t = document.createElement("div"); t.textContent = s == null ? "" : String(s); return t.innerHTML; }
  function fmtDate(d) {
    if (!d) return "—";
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
    return m ? (m[3] + "-" + m[2] + "-" + m[1]) : esc(d);
  }
  function currentMid() {
    try {
      var raw = window.sessionStorage.getItem("selectedEmployee");
      if (!raw) return null;
      var o = JSON.parse(raw);
      return o && o.empId ? o.empId : null;
    } catch (e) { return null; }
  }

  // ── Entiteit-configuratie ─────────────────────────────────────────────────
  var ENTITIES = [
    {
      key: "gesprek", table: "functioneringsgesprekken", titel: "Functionerings- & beoordelingsgesprekken",
      addLabel: "+ Gesprek toevoegen", hasArchived: true,
      cols: [
        { f: "type", h: "Type" }, { f: "gepland_op", h: "Gepland", date: true },
        { f: "gehouden_op", h: "Gehouden", date: true }, { f: "status", h: "Status" }, { f: "score", h: "Score" },
      ],
      fields: [
        { f: "type", label: "Type", type: "select", opts: ["functionering", "beoordeling", "voortgang"], def: "functionering" },
        { f: "gepland_op", label: "Gepland op", type: "date" },
        { f: "gehouden_op", label: "Gehouden op", type: "date" },
        { f: "status", label: "Status", type: "select", opts: ["gepland", "gehouden", "afgerond", "geannuleerd"], def: "gepland" },
        { f: "score", label: "Score", type: "select", opts: ["", "onvoldoende", "voldoende", "goed", "uitstekend"] },
        { f: "samenvatting", label: "Samenvatting", type: "textarea" },
      ],
      order: { col: "gepland_op", asc: false },
    },
    {
      key: "doel", table: "functionering_doelen", titel: "Ontwikkeldoelen",
      addLabel: "+ Doel toevoegen", hasArchived: false,
      cols: [
        { f: "omschrijving", h: "Doel" }, { f: "deadline", h: "Deadline", date: true }, { f: "status", h: "Status" },
      ],
      fields: [
        { f: "omschrijving", label: "Omschrijving", type: "text", required: true },
        { f: "deadline", label: "Deadline", type: "date" },
        { f: "status", label: "Status", type: "select", opts: ["open", "behaald", "vervallen"], def: "open" },
      ],
      order: { col: "deadline", asc: true },
    },
    {
      key: "verbeter", table: "verbetertrajecten", titel: "Verbetertrajecten",
      addLabel: "+ Traject toevoegen", hasArchived: true,
      cols: [
        { f: "startdatum", h: "Start", date: true }, { f: "einddatum", h: "Einde", date: true },
        { f: "doel", h: "Doel" }, { f: "status", h: "Status" },
      ],
      fields: [
        { f: "startdatum", label: "Startdatum", type: "date" },
        { f: "einddatum", label: "Einddatum", type: "date" },
        { f: "doel", label: "Doel", type: "text" },
        { f: "status", label: "Status", type: "select", opts: ["lopend", "afgerond", "gestopt"], def: "lopend" },
        { f: "evaluatie", label: "Evaluatie", type: "textarea" },
      ],
      order: { col: "startdatum", asc: false },
    },
    {
      key: "waarschuwing", table: "medewerker_waarschuwingen", titel: "Officiële waarschuwingen",
      addLabel: "+ Waarschuwing toevoegen", hasArchived: true,
      cols: [
        { f: "type", h: "Type" }, { f: "datum", h: "Datum", date: true }, { f: "reden", h: "Reden" },
      ],
      fields: [
        { f: "type", label: "Type", type: "select", opts: ["mondeling", "schriftelijk", "officieel", "laatste"], def: "mondeling" },
        { f: "datum", label: "Datum", type: "date" },
        { f: "reden", label: "Reden", type: "text", required: true },
        { f: "toelichting", label: "Toelichting", type: "textarea" },
      ],
      order: { col: "datum", asc: false },
    },
    {
      key: "opleiding", table: "medewerker_opleidingen", titel: "Opleidingen & certificeringen",
      addLabel: "+ Opleiding toevoegen", hasArchived: true,
      cols: [
        { f: "opleiding_naam", h: "Opleiding" }, { f: "categorie", h: "Categorie" }, { f: "status", h: "Status" },
        { f: "behaaldatum", h: "Behaald", date: true }, { f: "verloopdatum", h: "Verloopt", date: true }, { f: "skj_punten", h: "SKJ-punten" },
      ],
      fields: [
        { f: "opleiding_naam", label: "Naam", type: "text", required: true },
        { f: "categorie", label: "Categorie", type: "select", opts: ["BHV", "medicatie", "agressie", "SKJ", "overig"], def: "overig" },
        { f: "status", label: "Status", type: "select", opts: ["gepland", "behaald", "verlopen"], def: "behaald" },
        { f: "behaaldatum", label: "Behaaldatum", type: "date" },
        { f: "verloopdatum", label: "Verloopt op (herhaaldatum)", type: "date" },
        { f: "skj_punten", label: "SKJ-punten", type: "number" },
      ],
      order: { col: "behaaldatum", asc: false },
    },
  ];

  function cellVal(row, col) {
    var v = row[col.f];
    if (col.date) return fmtDate(v);
    if (v == null || v === "") return "—";
    return esc(v);
  }

  function fieldInputHtml(ent, fld) {
    var id = "cf-" + ent.key + "-" + fld.f;
    if (fld.type === "select") {
      var opts = fld.opts.map(function (o) {
        var sel = (o === (fld.def || "")) ? " selected" : "";
        return '<option value="' + esc(o) + '"' + sel + '>' + (o === "" ? "—" : esc(o)) + "</option>";
      }).join("");
      return '<label class="emp-field"><span>' + esc(fld.label) + '</span><select id="' + id + '" class="emp-select">' + opts + "</select></label>";
    }
    if (fld.type === "textarea") {
      return '<label class="emp-field emp-field--full"><span>' + esc(fld.label) + '</span><textarea id="' + id + '" rows="2"></textarea></label>';
    }
    var t = fld.type === "number" ? 'type="number" step="0.5" min="0"' : (fld.type === "date" ? 'type="date"' : 'type="text"');
    return '<label class="emp-field"><span>' + esc(fld.label) + (fld.required ? ' <span class="im-req">*</span>' : "") + '</span><input id="' + id + '" ' + t + "></label>";
  }

  function renderSection(ent, rows) {
    var head = ent.cols.map(function (c) { return "<th>" + esc(c.h) + "</th>"; }).join("") + "<th></th>";
    var body;
    if (!rows.length) {
      body = '<tr><td colspan="' + (ent.cols.length + 1) + '" class="emp-opleiding-empty">Nog geen items.</td></tr>';
    } else {
      body = rows.map(function (r) {
        var tds = ent.cols.map(function (c) { return "<td>" + cellVal(r, c) + "</td>"; }).join("");
        return "<tr>" + tds + '<td data-col="acties" class="cf-actions"><button type="button" class="employee-delete-btn cf-del" data-id="' + esc(r.id) + '" aria-label="Verwijderen"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></td></tr>';
      }).join("");
    }
    var formFields = ent.fields.map(function (f) { return fieldInputHtml(ent, f); }).join("");
    // G41 — SKJ-saldo: som van skj_punten over niet-verlopen opleidingen.
    var saldoHtml = "";
    if (ent.key === "opleiding") {
      var vandaag = new Date(); vandaag.setHours(0, 0, 0, 0);
      var saldo = 0;
      rows.forEach(function (r) {
        var p = Number(r.skj_punten);
        if (!isFinite(p) || p <= 0) return;
        if (r.verloopdatum) {
          var vd = new Date(r.verloopdatum);
          if (!isNaN(vd.getTime()) && vd < vandaag) return; // verlopen telt niet mee
        }
        saldo += p;
      });
      saldoHtml = '<span class="cf-skj-saldo" title="Som van SKJ-punten van geldige (niet-verlopen) opleidingen">SKJ-saldo: '
        + esc(String(Math.round(saldo * 10) / 10)) + " punten</span>";
    }
    return '<section class="emp-section card rounded-lg border bg-card text-card-foreground shadow-sm cf-section" data-ent="' + ent.key + '">'
      + '<div class="md-head"><h3>' + esc(ent.titel) + "</h3>" + saldoHtml + '<button type="button" class="btn-primary cf-add" data-ent="' + ent.key + '">' + esc(ent.addLabel) + "</button></div>"
      + '<div class="cf-form" data-ent="' + ent.key + '" hidden><div class="emp-form-grid">' + formFields + "</div>"
      + '<div class="cf-form-actions"><button type="button" class="btn-outline cf-cancel" data-ent="' + ent.key + '">Annuleren</button>'
      + '<button type="button" class="btn-primary cf-save" data-ent="' + ent.key + '">Opslaan</button></div>'
      + '<p class="im-error cf-err" data-ent="' + ent.key + '" hidden></p></div>'
      + '<div class="table-wrapper"><table class="employees-table cf-table"><thead><tr>' + head + "</tr></thead><tbody data-body=\"" + ent.key + "\">" + body + "</tbody></table></div>"
      + "</section>";
  }

  async function loadEntity(ent, mid) {
    var q = supa().from(ent.table).select("*").eq("medewerker_id", mid);
    q = q.order(ent.order.col, { ascending: ent.order.asc, nullsFirst: false });
    var res = await q;
    if (res.error) throw res.error;
    var rows = res.data || [];
    if (ent.hasArchived) rows = rows.filter(function (r) { return !r.archived; });
    return rows;
  }

  async function renderAll() {
    var root = document.getElementById("emp-functioneren-root");
    if (!root) return;
    var mid = currentMid();
    if (!mid) { root.innerHTML = '<div class="emp-opleiding-empty">Geen medewerker geselecteerd.</div>'; return; }
    root.innerHTML = '<div class="emp-opleiding-empty">Laden…</div>';
    try {
      var results = await Promise.all(ENTITIES.map(function (e) { return loadEntity(e, mid).catch(function () { return []; }); }));
      root.innerHTML = ENTITIES.map(function (e, i) { return renderSection(e, results[i]); }).join("");
      wire(root, mid);
    } catch (err) {
      console.error("[functioneren] laden mislukt:", err);
      root.innerHTML = '<div class="emp-opleiding-empty">Kon de gegevens niet laden.</div>';
      if (window.ffReportSyncFailure) window.ffReportSyncFailure("Functioneren — laden", err);
    }
  }

  function entByKey(k) { for (var i = 0; i < ENTITIES.length; i++) if (ENTITIES[i].key === k) return ENTITIES[i]; return null; }

  function wire(root, mid) {
    root.addEventListener("click", async function (e) {
      var addBtn = e.target.closest && e.target.closest(".cf-add");
      if (addBtn) { toggleForm(root, addBtn.getAttribute("data-ent"), true); return; }
      var cancelBtn = e.target.closest && e.target.closest(".cf-cancel");
      if (cancelBtn) { toggleForm(root, cancelBtn.getAttribute("data-ent"), false); return; }
      var saveBtn = e.target.closest && e.target.closest(".cf-save");
      if (saveBtn) { await saveNew(root, saveBtn.getAttribute("data-ent"), mid); return; }
      var delBtn = e.target.closest && e.target.closest(".cf-del");
      if (delBtn) { await delRow(delBtn.closest(".cf-section").getAttribute("data-ent"), delBtn.getAttribute("data-id")); return; }
    });
  }

  function toggleForm(root, key, show) {
    var form = root.querySelector('.cf-form[data-ent="' + key + '"]');
    if (form) form.hidden = !show;
  }

  async function saveNew(root, key, mid) {
    var ent = entByKey(key);
    if (!ent) return;
    var payload = { medewerker_id: mid };
    var errEl = root.querySelector('.cf-err[data-ent="' + key + '"]');
    if (errEl) { errEl.hidden = true; errEl.textContent = ""; }
    for (var i = 0; i < ent.fields.length; i++) {
      var fld = ent.fields[i];
      var el = document.getElementById("cf-" + key + "-" + fld.f);
      var v = el ? String(el.value).trim() : "";
      if (fld.required && !v) { if (errEl) { errEl.textContent = fld.label + " is verplicht."; errEl.hidden = false; } return; }
      if (v === "") continue;
      payload[fld.f] = (fld.type === "number") ? Number(v) : v;
    }
    try {
      var res = await supa().from(ent.table).insert(payload);
      if (res.error) throw res.error;
      if (window.showActionFeedback) window.showActionFeedback("saved", ent.titel);
      await renderAll();
    } catch (err) {
      console.error("[functioneren] opslaan mislukt:", err);
      if (errEl) { errEl.textContent = "Opslaan mislukt: " + (err && err.message ? err.message : "onbekende fout"); errEl.hidden = false; }
      if (window.ffReportSyncFailure) window.ffReportSyncFailure("Functioneren — opslaan", err);
    }
  }

  async function delRow(key, id) {
    var ent = entByKey(key);
    if (!ent || !id) return;
    var ok = window.showSliderConfirmModal
      ? await window.showSliderConfirmModal({ title: "Verwijderen?", preview: ent.titel, okLabel: "Verwijderen", cancelLabel: "Annuleren" })
      : window.confirm("Verwijderen?");
    if (!ok) return;
    try {
      var res;
      if (ent.hasArchived) res = await supa().from(ent.table).update({ archived: true }).eq("id", id);
      else res = await supa().from(ent.table).delete().eq("id", id);
      if (res.error) throw res.error;
      if (window.showActionFeedback) window.showActionFeedback("deleted", ent.titel);
      await renderAll();
    } catch (err) {
      console.error("[functioneren] verwijderen mislukt:", err);
      if (window.showError) window.showError("Verwijderen mislukt: " + (err && err.message ? err.message : "onbekende fout"));
    }
  }

  function start() {
    if (!document.getElementById("emp-functioneren-root")) return;
    renderAll();
    // Herlaad als een andere medewerker geselecteerd wordt (zelfde tab-navigatie).
    window.addEventListener("ff:selected-employee-changed", renderAll);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
