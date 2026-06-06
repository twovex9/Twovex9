/* global window, document */
/**
 * sharepoint.js — page-script voor /sharepoint.html.
 *
 * Interne documentbibliotheek met mappen (vergaderingen, locaties, beleid,
 * directie, management, …). Navigeer door mappen (breadcrumb), maak submappen,
 * upload bestanden, beheer per-map welke rollen toegang hebben.
 *
 * Toegang is server-side afgedwongen (RLS + is_office_staff + sp_folder_visible);
 * dit script toont alleen wat binnenkomt en biedt het beheer-UI.
 */
(function () {
  "use strict";

  // Office-rollen die je aan een map-toegang kunt koppelen. Wordt bij init
  // ververst uit bs2_roles; dit is de fallback (werkvloer-rollen weggelaten).
  var OFFICE_ROLES_FALLBACK = [
    "Eigenaar", "Directeur", "Admin", "HR", "Planner", "Zorgcoördinator",
    "Finance", "Salarisadministratie", "Beleid", "Facilitair",
    "Gedragswetenschapper", "Cliëntbeheer",
  ];
  var WERKVLOER_SLUGS = ["medewerker", "medewerker-test", "detacheringsbureau"];

  var state = {
    mapId: null,        // huidige map (null = root)
    search: "",
    allRoles: OFFICE_ROLES_FALLBACK.slice(),
    folderEditId: null, // null = nieuwe map
    fileEditId: null,
    delFileId: null,
    delFolderId: null,
    fileReplace: null,  // pending File voor vervangen
  };

  // ── helpers ──────────────────────────────────────────────────────────────
  function db() { return window.sharepointDB; }
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function fmtDate(iso) {
    if (!iso) return "—";
    var t = Date.parse(iso);
    if (!isFinite(t)) return "—";
    try {
      var p = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(new Date(t));
      var g = {}; p.forEach(function (x) { g[x.type] = x.value; });
      return g.day + "-" + g.month + "-" + g.year;
    } catch (e) {
      var d = new Date(t), pad = function (n) { return String(n).padStart(2, "0"); };
      return pad(d.getDate()) + "-" + pad(d.getMonth() + 1) + "-" + d.getFullYear();
    }
  }
  function fmtSize(bytes) {
    if (bytes == null || isNaN(bytes)) return "—";
    var b = +bytes;
    if (b < 1024) return b + " B";
    var kb = b / 1024;
    if (kb < 1024) return kb.toFixed(kb < 10 ? 1 : 0).replace(".", ",") + " KB";
    var mb = kb / 1024;
    if (mb < 1024) return mb.toFixed(mb < 10 ? 1 : 0).replace(".", ",") + " MB";
    return (mb / 1024).toFixed(1).replace(".", ",") + " GB";
  }

  var SVG_EYE = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
  var SVG_PEN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
  var SVG_TRASH = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="m8 6 1-2h6l1 2"/></svg>';
  var SVG_FILE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';

  // ── breadcrumb ────────────────────────────────────────────────────────────
  function pathTo(mapId) {
    var chain = [], guard = 0;
    var cur = mapId == null ? null : db().getMapByIdSync(mapId);
    while (cur && guard++ < 50) {
      chain.unshift(cur);
      cur = cur.parentId ? db().getMapByIdSync(cur.parentId) : null;
    }
    return chain;
  }
  function renderBreadcrumb() {
    var el = document.getElementById("sp-breadcrumb");
    if (!el) return;
    var parts = ['<button type="button" class="sp-crumb' + (state.mapId == null ? " sp-crumb--current" : "") + '" data-map="">SharePoint</button>'];
    pathTo(state.mapId).forEach(function (m, i, arr) {
      parts.push('<span class="sp-crumb-sep" aria-hidden="true">›</span>');
      var isLast = i === arr.length - 1;
      parts.push('<button type="button" class="sp-crumb' + (isLast ? " sp-crumb--current" : "") + '" data-map="' + escapeHtml(m.id) + '">' + (m.icon ? escapeHtml(m.icon) + " " : "") + escapeHtml(m.naam) + '</button>');
    });
    el.innerHTML = parts.join("");
  }

  // ── mappen-grid ────────────────────────────────────────────────────────────
  function visibleFolders() {
    var kids = db().getChildMappenSync(state.mapId);
    var q = state.search.trim().toLowerCase();
    if (q) kids = kids.filter(function (m) {
      return String(m.naam || "").toLowerCase().indexOf(q) >= 0 || String(m.beschrijving || "").toLowerCase().indexOf(q) >= 0;
    });
    return kids;
  }
  function folderCard(m) {
    var id = escapeHtml(m.id);
    var restricted = Array.isArray(m.toegestaneRollen) && m.toegestaneRollen.length > 0;
    var childCount = db().getChildMappenSync(m.id).length;
    var fileCount = db().getBestandenSync(m.id).length;
    var bits = [];
    if (childCount) bits.push(childCount + (childCount === 1 ? " map" : " mappen"));
    if (fileCount) bits.push(fileCount + (fileCount === 1 ? " bestand" : " bestanden"));
    if (!bits.length) bits.push("leeg");
    var lock = restricted
      ? '<span class="sp-lock" title="Beperkt tot: ' + escapeHtml(m.toegestaneRollen.join(", ")) + '"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Beperkt</span>'
      : '';
    return '<div class="sp-folder-card" data-folder="' + id + '" tabindex="0" role="button" aria-label="Open map ' + escapeHtml(m.naam) + '">' +
      '<div class="sp-folder-ico" aria-hidden="true">' + (m.icon ? escapeHtml(m.icon) : "📁") + '</div>' +
      '<div class="sp-folder-body">' +
        '<div class="sp-folder-name">' + escapeHtml(m.naam) + '</div>' +
        (m.beschrijving ? '<div class="sp-folder-desc">' + escapeHtml(m.beschrijving) + '</div>' : '') +
        '<div class="sp-folder-meta"><span>' + bits.join(" · ") + '</span>' + lock + '</div>' +
      '</div>' +
      '<div class="sp-card-actions">' +
        '<button type="button" class="sp-icon-btn" data-fedit="' + id + '" title="Map bewerken" aria-label="Map bewerken">' + SVG_PEN + '</button>' +
        '<button type="button" class="sp-icon-btn sp-icon-btn--del" data-fdel="' + id + '" title="Map verwijderen" aria-label="Map verwijderen">' + SVG_TRASH + '</button>' +
      '</div>' +
    '</div>';
  }

  // ── bestanden-tabel ──────────────────────────────────────────────────────
  function visibleFiles() {
    var files = db().getBestandenSync(state.mapId);
    var q = state.search.trim().toLowerCase();
    if (q) files = files.filter(function (f) {
      return String(f.naam || "").toLowerCase().indexOf(q) >= 0 || String(f.fileName || "").toLowerCase().indexOf(q) >= 0;
    });
    files.sort(function (a, b) {
      var an = String(a.naam || "").toLowerCase(), bn = String(b.naam || "").toLowerCase();
      return an < bn ? -1 : an > bn ? 1 : 0;
    });
    return files;
  }
  function fileRow(f) {
    var id = escapeHtml(f.id);
    var ext = f.fileExtension ? escapeHtml(f.fileExtension) : "";
    return '<tr data-file="' + id + '" class="me-row" style="cursor:pointer">' +
      '<td><div class="sp-file-name-cell"><span class="sp-file-ico" aria-hidden="true">' + SVG_FILE + '</span><span class="sp-file-name">' + escapeHtml(f.naam || f.fileName || "—") + '</span></div>' +
        (f.beschrijving ? '<div style="color:var(--text-muted);font-size:12px;margin-top:2px;margin-left:30px">' + escapeHtml(f.beschrijving) + '</div>' : '') + '</td>' +
      '<td>' + (ext ? '<span class="sp-type-pill">' + ext + '</span>' : '—') + '</td>' +
      '<td>' + escapeHtml(fmtSize(f.fileSize)) + '</td>' +
      '<td>' + escapeHtml(fmtDate(f.createdAt)) + '</td>' +
      '<td><div class="sp-file-actions">' +
        '<button type="button" class="sp-icon-btn" data-fileview="' + id + '" title="Bekijken" aria-label="Bekijken">' + SVG_EYE + '</button>' +
        '<button type="button" class="sp-icon-btn" data-fileedit="' + id + '" title="Bewerken" aria-label="Bewerken">' + SVG_PEN + '</button>' +
        '<button type="button" class="sp-icon-btn sp-icon-btn--del" data-filedel="' + id + '" title="Verwijderen" aria-label="Verwijderen">' + SVG_TRASH + '</button>' +
      '</div></td>' +
    '</tr>';
  }

  function render() {
    if (!db()) return;
    renderBreadcrumb();
    var folders = visibleFolders();
    var files = visibleFiles();

    var fWrap = document.getElementById("sp-folders-wrap");
    var grid = document.getElementById("sp-folder-grid");
    if (grid) grid.innerHTML = folders.map(folderCard).join("");
    if (fWrap) fWrap.hidden = folders.length === 0;

    var filWrap = document.getElementById("sp-files-wrap");
    var tbody = document.getElementById("sp-file-tbody");
    if (tbody) tbody.innerHTML = files.map(fileRow).join("");
    if (filWrap) filWrap.hidden = files.length === 0;

    var empty = document.getElementById("sp-empty");
    if (empty) {
      if (folders.length === 0 && files.length === 0) {
        empty.hidden = false;
        empty.textContent = state.search.trim()
          ? "Geen resultaten voor “" + state.search.trim() + "”."
          : "Deze map is nog leeg. Maak een submap aan of upload een bestand.";
      } else empty.hidden = true;
    }
  }

  function navigateTo(mapId) {
    state.mapId = mapId || null;
    state.search = "";
    var s = document.getElementById("sp-search"); if (s) s.value = "";
    render();
  }

  // ── rollen ──────────────────────────────────────────────────────────────
  async function loadRoles() {
    try {
      if (!window.besaSupabase) return;
      var res = await window.besaSupabase.from("bs2_roles").select("slug,name");
      if (res.error || !res.data) return;
      var names = res.data
        .filter(function (r) { return r && r.name && WERKVLOER_SLUGS.indexOf(r.slug) === -1; })
        .map(function (r) { return r.name; });
      if (names.length) {
        // admin-tier eerst, daarna alfabetisch
        var tier = ["Eigenaar", "Directeur", "Admin"];
        names.sort(function (a, b) {
          var ai = tier.indexOf(a), bi = tier.indexOf(b);
          if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
          return a.localeCompare(b, "nl");
        });
        state.allRoles = names;
      }
    } catch (e) { /* fallback blijft staan */ }
  }
  function renderRoleChecks(selected) {
    var wrap = document.getElementById("sp-folder-roles");
    if (!wrap) return;
    var sel = Array.isArray(selected) ? selected : [];
    wrap.innerHTML = state.allRoles.map(function (name) {
      var checked = sel.indexOf(name) >= 0 ? " checked" : "";
      return '<label class="sp-role"><input type="checkbox" value="' + escapeHtml(name) + '"' + checked + '>' + escapeHtml(name) + '</label>';
    }).join("");
  }
  function selectedRoles() {
    var wrap = document.getElementById("sp-folder-roles");
    if (!wrap) return [];
    return Array.prototype.slice.call(wrap.querySelectorAll("input:checked")).map(function (i) { return i.value; });
  }

  // ── map-modal ──────────────────────────────────────────────────────────
  function openFolderModal(map) {
    state.folderEditId = map ? map.id : null;
    document.getElementById("sp-folder-title").textContent = map ? "Map bewerken" : "Nieuwe map";
    document.getElementById("sp-folder-name").value = map ? (map.naam || "") : "";
    document.getElementById("sp-folder-desc").value = map ? (map.beschrijving || "") : "";
    document.getElementById("sp-folder-icon").value = map ? (map.icon || "") : "📁";
    renderRoleChecks(map ? map.toegestaneRollen : []);
    var m = document.getElementById("sp-folder-modal");
    m.removeAttribute("hidden"); m.setAttribute("aria-hidden", "false");
    setTimeout(function () { var n = document.getElementById("sp-folder-name"); if (n) n.focus(); }, 50);
  }
  function closeFolderModal() {
    state.folderEditId = null;
    var m = document.getElementById("sp-folder-modal");
    if (m) { m.setAttribute("hidden", ""); m.setAttribute("aria-hidden", "true"); }
  }
  async function saveFolder() {
    var btn = document.getElementById("sp-folder-save");
    var naam = (document.getElementById("sp-folder-name").value || "").trim();
    if (!naam) { if (window.showError) window.showError("Geef de map een naam."); return; }
    var payload = {
      naam: naam,
      beschrijving: (document.getElementById("sp-folder-desc").value || "").trim(),
      icon: (document.getElementById("sp-folder-icon").value || "").trim(),
      toegestaneRollen: selectedRoles(),
    };
    btn.disabled = true;
    try {
      if (state.folderEditId) {
        await db().updateMap(state.folderEditId, payload);
        if (window.showActionFeedback) window.showActionFeedback("saved", naam);
      } else {
        payload.parentId = state.mapId;
        await db().addMap(payload);
        if (window.showActionFeedback) window.showActionFeedback("saved", naam);
      }
      closeFolderModal(); render();
    } catch (e) {
      if (window.showError) window.showError("Opslaan mislukt: " + (e && e.message || e));
    } finally { btn.disabled = false; }
  }

  // ── bestand-modal ────────────────────────────────────────────────────────
  function openFileModal(file) {
    state.fileEditId = file.id; state.fileReplace = null;
    document.getElementById("sp-file-name").value = file.naam || "";
    document.getElementById("sp-file-desc").value = file.beschrijving || "";
    document.getElementById("sp-file-currentname").textContent = file.fileName || file.naam || "(geen bestand)";
    var m = document.getElementById("sp-file-modal");
    m.removeAttribute("hidden"); m.setAttribute("aria-hidden", "false");
    setTimeout(function () { var n = document.getElementById("sp-file-name"); if (n) n.focus(); }, 50);
  }
  function closeFileModal() {
    state.fileEditId = null; state.fileReplace = null;
    var m = document.getElementById("sp-file-modal");
    if (m) { m.setAttribute("hidden", ""); m.setAttribute("aria-hidden", "true"); }
  }
  async function saveFile() {
    var id = state.fileEditId; if (!id) return;
    var btn = document.getElementById("sp-file-save");
    btn.disabled = true;
    try {
      if (state.fileReplace) {
        await db().replaceFile(id, state.fileReplace);
      }
      await db().updateBestand(id, {
        naam: (document.getElementById("sp-file-name").value || "").trim(),
        beschrijving: (document.getElementById("sp-file-desc").value || "").trim(),
      });
      if (window.showActionFeedback) window.showActionFeedback("saved", "Bestand");
      closeFileModal(); render();
    } catch (e) {
      if (window.showError) window.showError("Opslaan mislukt: " + (e && e.message || e));
    } finally { btn.disabled = false; }
  }

  async function openFile(id) {
    try {
      var url = await db().getFileUrl(id);
      if (url) window.open(url, "_blank", "noopener");
      else if (window.showError) window.showError("Geen bestand gekoppeld.");
    } catch (e) { if (window.showError) window.showError("Openen mislukt: " + (e && e.message || e)); }
  }

  // ── verwijderen ──────────────────────────────────────────────────────────
  function setupSlider(sliderId, btnId) {
    var s = document.getElementById(sliderId), b = document.getElementById(btnId);
    if (!s || !b) return;
    s.addEventListener("input", function () { var p = Number(s.value); s.style.setProperty("--employee-slider-pct", p + "%"); b.disabled = p < 100; });
  }
  function openDelFile(file) {
    state.delFileId = file.id;
    document.getElementById("sp-delfile-preview").textContent = file.naam || file.fileName || "";
    var sl = document.getElementById("sp-delfile-slider");
    sl.value = 0; sl.style.setProperty("--employee-slider-pct", "0%");
    document.getElementById("sp-delfile-confirm").disabled = true;
    var m = document.getElementById("sp-delfile-modal");
    m.removeAttribute("hidden"); m.setAttribute("aria-hidden", "false");
  }
  function closeDelFile() {
    state.delFileId = null;
    var m = document.getElementById("sp-delfile-modal");
    if (m) { m.setAttribute("hidden", ""); m.setAttribute("aria-hidden", "true"); }
  }
  async function confirmDelFile() {
    var id = state.delFileId; if (!id) return;
    var file = db().getBestandByIdSync(id);
    try {
      await db().deleteBestand(id);
      if (window.showActionFeedback) window.showActionFeedback("deleted", file && file.naam || "");
      closeDelFile(); render();
    } catch (e) {
      if (window.showError) window.showError("Verwijderen mislukt: " + (e && e.message || e));
      closeDelFile();
    }
  }

  function openDelFolder(map) {
    state.delFolderId = map.id;
    var childMaps = db().getChildMappenSync(map.id).length;
    var childFiles = db().getBestandenSync(map.id).length;
    var leeg = childMaps === 0 && childFiles === 0;
    var msg = document.getElementById("sp-delfolder-msg");
    var confirm = document.getElementById("sp-delfolder-confirm");
    document.getElementById("sp-delfolder-preview").textContent = (map.icon ? map.icon + " " : "") + (map.naam || "");
    if (leeg) {
      msg.textContent = "Weet je zeker dat je deze (lege) map wilt verwijderen?";
      confirm.disabled = false; confirm.style.display = "";
    } else {
      msg.innerHTML = "Deze map bevat nog <strong>" + childMaps + " submap(pen)</strong> en <strong>" + childFiles + " bestand(en)</strong>. Verplaats of verwijder eerst de inhoud — een gevulde map kan niet worden verwijderd.";
      confirm.disabled = true; confirm.style.display = "none";
    }
    var m = document.getElementById("sp-delfolder-modal");
    m.removeAttribute("hidden"); m.setAttribute("aria-hidden", "false");
  }
  function closeDelFolder() {
    state.delFolderId = null;
    var m = document.getElementById("sp-delfolder-modal");
    if (m) { m.setAttribute("hidden", ""); m.setAttribute("aria-hidden", "true"); }
  }
  async function confirmDelFolder() {
    var id = state.delFolderId; if (!id) return;
    var map = db().getMapByIdSync(id);
    try {
      await db().deleteMap(id);
      if (window.showActionFeedback) window.showActionFeedback("deleted", map && map.naam || "");
      closeDelFolder(); render();
    } catch (e) {
      if (window.showError) window.showError(e && e.message || "Verwijderen mislukt.");
      closeDelFolder();
    }
  }

  // ── upload ────────────────────────────────────────────────────────────────
  async function doUpload(files) {
    if (!files || !files.length) return;
    var ok = 0, fail = 0;
    for (var i = 0; i < files.length; i++) {
      try { await db().uploadBestand(files[i], state.mapId); ok++; }
      catch (e) { fail++; console.error("[sharepoint] upload mislukt:", e); }
    }
    render();
    if (ok && window.showActionFeedback) window.showActionFeedback("saved", ok === 1 ? "1 bestand" : ok + " bestanden");
    if (fail && window.showError) window.showError(fail + " bestand(en) konden niet worden geüpload.");
  }

  // ── wiring ──────────────────────────────────────────────────────────────
  function wire() {
    // upload
    var fileInput = document.createElement("input");
    fileInput.type = "file"; fileInput.multiple = true; fileInput.style.display = "none";
    document.body.appendChild(fileInput);
    fileInput.addEventListener("change", function () { if (fileInput.files && fileInput.files.length) { doUpload(fileInput.files); fileInput.value = ""; } });
    document.getElementById("sp-upload-btn").addEventListener("click", function () { fileInput.click(); });
    document.getElementById("sp-new-folder-btn").addEventListener("click", function () { openFolderModal(null); });

    // zoeken
    document.getElementById("sp-search").addEventListener("input", function (e) { state.search = e.target.value || ""; render(); });
    document.getElementById("sp-reset").addEventListener("click", function () { state.search = ""; var s = document.getElementById("sp-search"); if (s) s.value = ""; render(); });

    // breadcrumb (delegation)
    document.getElementById("sp-breadcrumb").addEventListener("click", function (e) {
      var c = e.target.closest(".sp-crumb"); if (!c) return;
      var v = c.getAttribute("data-map");
      navigateTo(v || null);
    });

    // mappen-grid (delegation)
    document.getElementById("sp-folder-grid").addEventListener("click", function (e) {
      var edit = e.target.closest("[data-fedit]");
      if (edit) { e.stopPropagation(); var em = db().getMapByIdSync(edit.getAttribute("data-fedit")); if (em) openFolderModal(em); return; }
      var del = e.target.closest("[data-fdel]");
      if (del) { e.stopPropagation(); var dm = db().getMapByIdSync(del.getAttribute("data-fdel")); if (dm) openDelFolder(dm); return; }
      var card = e.target.closest("[data-folder]");
      if (card) navigateTo(card.getAttribute("data-folder"));
    });
    document.getElementById("sp-folder-grid").addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var card = e.target.closest("[data-folder]");
      if (card && !e.target.closest("[data-fedit],[data-fdel]")) { e.preventDefault(); navigateTo(card.getAttribute("data-folder")); }
    });

    // bestanden-tabel (delegation)
    document.getElementById("sp-file-tbody").addEventListener("click", function (e) {
      var v = e.target.closest("[data-fileview]");
      if (v) { e.stopPropagation(); openFile(v.getAttribute("data-fileview")); return; }
      var ed = e.target.closest("[data-fileedit]");
      if (ed) { e.stopPropagation(); var f = db().getBestandByIdSync(ed.getAttribute("data-fileedit")); if (f) openFileModal(f); return; }
      var de = e.target.closest("[data-filedel]");
      if (de) { e.stopPropagation(); var df = db().getBestandByIdSync(de.getAttribute("data-filedel")); if (df) openDelFile(df); return; }
      var tr = e.target.closest("tr[data-file]");
      if (tr) openFile(tr.getAttribute("data-file"));
    });

    // emoji-picker in map-modal
    document.getElementById("sp-emoji-pick").addEventListener("click", function (e) {
      var b = e.target.closest(".sp-emoji"); if (!b) return;
      var inp = document.getElementById("sp-folder-icon"); if (inp) inp.value = b.getAttribute("data-emoji");
    });

    // map-modal
    document.getElementById("sp-folder-close").addEventListener("click", closeFolderModal);
    document.getElementById("sp-folder-cancel").addEventListener("click", closeFolderModal);
    document.getElementById("sp-folder-save").addEventListener("click", saveFolder);
    var fm = document.getElementById("sp-folder-modal");
    if (fm) fm.addEventListener("click", function (e) { if (e.target === fm) closeFolderModal(); });

    // bestand-modal + vervangen
    document.getElementById("sp-file-close").addEventListener("click", closeFileModal);
    document.getElementById("sp-file-cancel").addEventListener("click", closeFileModal);
    document.getElementById("sp-file-save").addEventListener("click", saveFile);
    var repl = document.getElementById("sp-file-replaceinput");
    document.getElementById("sp-file-change").addEventListener("click", function () { repl.click(); });
    repl.addEventListener("change", function () {
      if (repl.files && repl.files[0]) {
        state.fileReplace = repl.files[0];
        document.getElementById("sp-file-currentname").textContent = repl.files[0].name + "  (nieuw)";
      }
    });
    var fim = document.getElementById("sp-file-modal");
    if (fim) fim.addEventListener("click", function (e) { if (e.target === fim) closeFileModal(); });

    // verwijder-bestand (slider)
    setupSlider("sp-delfile-slider", "sp-delfile-confirm");
    document.getElementById("sp-delfile-close").addEventListener("click", closeDelFile);
    document.getElementById("sp-delfile-cancel").addEventListener("click", closeDelFile);
    document.getElementById("sp-delfile-confirm").addEventListener("click", confirmDelFile);
    var dfm = document.getElementById("sp-delfile-modal");
    if (dfm) dfm.addEventListener("click", function (e) { if (e.target === dfm) closeDelFile(); });

    // verwijder-map
    document.getElementById("sp-delfolder-close").addEventListener("click", closeDelFolder);
    document.getElementById("sp-delfolder-cancel").addEventListener("click", closeDelFolder);
    document.getElementById("sp-delfolder-confirm").addEventListener("click", confirmDelFolder);
    var dfo = document.getElementById("sp-delfolder-modal");
    if (dfo) dfo.addEventListener("click", function (e) { if (e.target === dfo) closeDelFolder(); });

    // Escape sluit de bovenste open modal
    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape") return;
      var modals = ["sp-delfile-modal", "sp-delfolder-modal", "sp-file-modal", "sp-folder-modal"];
      for (var i = 0; i < modals.length; i++) {
        var el = document.getElementById(modals[i]);
        if (el && !el.hasAttribute("hidden")) {
          ev.stopPropagation();
          if (modals[i] === "sp-delfile-modal") closeDelFile();
          else if (modals[i] === "sp-delfolder-modal") closeDelFolder();
          else if (modals[i] === "sp-file-modal") closeFileModal();
          else closeFolderModal();
          return;
        }
      }
    });

    window.addEventListener("besa:sharepoint-updated", render);
  }

  function init() {
    if (!window.sharepointDB) { console.error("[sharepoint] sharepointDB niet geladen"); return; }
    wire();
    render();
    loadRoles();
    window.sharepointDB.ready.then(render);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
