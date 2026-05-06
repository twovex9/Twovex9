(function () {
  "use strict";

  var STORAGE_KEY = "besa.facturenImportJobs";
  var LS_FACT_SUPP = "facturen_supplement_v1";
  var MAX_BYTES = 20 * 1024 * 1024;
  var ALLOWED_EXT = ["svg", "png", "xlsx", "xls", "csv", "jpg", "jpeg", "pdf", "docx", "doc"];
  var ALLOWED_HUMAN = "SVG, PNG, Excel, CSV, JPG, PDF of .docx";
  var IMG_EXT = ["png", "jpg", "jpeg", "svg"];

  var state = {
    file: null,
    fileName: "",
    fileBaseName: "",
    fileType: "",
    fileSize: 0,
    fileExt: "",
    previewText: "",
    previewDataUrl: "",
    previewBlobUrl: "",
  };

  function $(id) { return document.getElementById(id); }

  function formatBytes(bytes) {
    if (!bytes && bytes !== 0) return "—";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1).replace(/\.0$/, "") + " KB";
    return (bytes / (1024 * 1024)).toFixed(2).replace(/\.00$/, "") + " MB";
  }

  function formatDateTime(iso) {
    if (!iso) return "—";
    try {
      var d = new Date(iso);
      var pad = function (n) { return n < 10 ? "0" + n : "" + n; };
      return pad(d.getDate()) + "-" + pad(d.getMonth() + 1) + "-" + d.getFullYear() +
        " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
    } catch (e) { return "—"; }
  }

  function formatDateNL(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
    } catch (e) { return "—"; }
  }

  function getExt(name) {
    if (!name) return "";
    var i = name.lastIndexOf(".");
    return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
  }

  function stripExt(name) {
    if (!name) return "";
    var i = name.lastIndexOf(".");
    return i >= 0 ? name.slice(0, i) : name;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function readJSONList(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function writeJSONList(key, arr) {
    try { localStorage.setItem(key, JSON.stringify(arr)); } catch (e) { /* quota */ }
  }

  function newId() { return "fi_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8); }

  function setStep(step) {
    [1, 2].forEach(function (n) {
      var li = document.querySelector('.fi-step[data-fi-step="' + n + '"]');
      var panel = document.querySelector('[data-fi-panel="' + n + '"]');
      if (li) {
        li.classList.toggle("is-active", n === step);
        li.classList.toggle("is-done", n < step);
      }
      if (panel) panel.hidden = n !== step;
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showError(msg) {
    var err = $("fi-error");
    if (!err) return;
    if (!msg) { err.hidden = true; err.textContent = ""; }
    else { err.hidden = false; err.textContent = msg; }
  }

  function revokePreviewBlob() {
    if (state.previewBlobUrl) {
      try { URL.revokeObjectURL(state.previewBlobUrl); } catch (e) { /* */ }
      state.previewBlobUrl = "";
    }
  }

  function clearDropzonePreview() {
    revokePreviewBlob();
    var empty = $("fi-dropzone-empty");
    var prev = $("fi-dropzone-preview");
    var media = $("fi-dropzone-preview-media");
    if (empty) empty.hidden = false;
    if (prev) prev.hidden = true;
    if (media) media.innerHTML = "";
  }

  function readAsDataURL(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result || "")); };
      r.onerror = function () { reject(r.error || new Error("read fail")); };
      r.readAsDataURL(file);
    });
  }

  function readPreviewText(file) {
    return new Promise(function (resolve) {
      if (!file) return resolve("");
      var ext = getExt(file.name);
      if (ext !== "csv" && ext !== "txt") return resolve("");
      var r = new FileReader();
      r.onload = function () {
        try {
          var txt = String(r.result || "");
          var lines = txt.split(/\r?\n/).slice(0, 12);
          resolve(lines.join("\n"));
        } catch (e) { resolve(""); }
      };
      r.onerror = function () { resolve(""); };
      r.readAsText(file.slice(0, 8 * 1024));
    });
  }

  function renderDropzonePreview() {
    var empty = $("fi-dropzone-empty");
    var prev = $("fi-dropzone-preview");
    var media = $("fi-dropzone-preview-media");
    var nameEl = $("fi-dropzone-preview-name");
    var sizeEl = $("fi-dropzone-preview-size");
    if (!empty || !prev || !media) return;
    empty.hidden = true;
    prev.hidden = false;
    if (nameEl) nameEl.textContent = state.fileName;
    if (sizeEl) sizeEl.textContent = formatBytes(state.fileSize);

    media.innerHTML = "";
    var ext = state.fileExt;
    if (IMG_EXT.indexOf(ext) !== -1 && state.previewDataUrl) {
      var img = document.createElement("img");
      img.className = "fi-thumb-img";
      img.src = state.previewDataUrl;
      img.alt = state.fileName;
      media.appendChild(img);
    } else if (ext === "pdf" && state.previewBlobUrl) {
      var ifr = document.createElement("iframe");
      ifr.className = "fi-thumb-pdf";
      ifr.src = state.previewBlobUrl + "#toolbar=0&navpanes=0";
      ifr.title = state.fileName;
      ifr.setAttribute("aria-label", state.fileName);
      media.appendChild(ifr);
    } else {
      var ic = document.createElement("div");
      ic.className = "fi-thumb-generic";
      ic.innerHTML =
        '<div class="fi-thumb-generic-ico"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#339dc1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>' +
        '<div class="fi-thumb-generic-ext">' + escapeHtml(ext.toUpperCase()) + "</div>";
      media.appendChild(ic);
    }
  }

  function setFile(file) {
    showError("");
    if (!file) {
      state.file = null;
      state.fileName = "";
      state.fileBaseName = "";
      state.fileSize = 0;
      state.fileExt = "";
      state.previewText = "";
      state.previewDataUrl = "";
      revokePreviewBlob();
      var nextBtn = $("fi-next-1");
      if (nextBtn) nextBtn.disabled = true;
      clearDropzonePreview();
      return;
    }

    var ext = getExt(file.name);
    if (ALLOWED_EXT.indexOf(ext) === -1) {
      showError("Type niet toegestaan. Gebruik " + ALLOWED_HUMAN + ".");
      return;
    }
    if (file.size > MAX_BYTES) {
      showError("Bestand is te groot (" + formatBytes(file.size) + "). Maximum is 20MB.");
      return;
    }

    revokePreviewBlob();
    state.file = file;
    state.fileName = file.name;
    state.fileBaseName = stripExt(file.name);
    state.fileType = file.type || "—";
    state.fileSize = file.size;
    state.fileExt = ext;
    state.previewText = "";
    state.previewDataUrl = "";

    var thumbReady;
    if (IMG_EXT.indexOf(ext) !== -1) {
      thumbReady = readAsDataURL(file).then(function (url) {
        state.previewDataUrl = url;
      }).catch(function () { /* */ });
    } else if (ext === "pdf") {
      try { state.previewBlobUrl = URL.createObjectURL(file); } catch (e) { /* */ }
      thumbReady = Promise.resolve();
    } else {
      thumbReady = Promise.resolve();
    }

    thumbReady.then(function () {
      renderDropzonePreview();
      var nextBtn = $("fi-next-1");
      if (nextBtn) nextBtn.disabled = false;
    });
  }

  function fillStep2() {
    var nameInput = $("fi-meta-name-input");
    var extEl = $("fi-meta-ext");
    var typeEl = $("fi-meta-type");
    var sizeEl = $("fi-meta-size");
    var upEl = $("fi-meta-uploaded");
    if (nameInput) nameInput.value = state.fileBaseName || "";
    if (extEl) extEl.textContent = state.fileExt ? "." + state.fileExt : "";
    if (typeEl) typeEl.textContent = state.fileExt ? state.fileExt.toUpperCase() : "—";
    if (sizeEl) sizeEl.textContent = formatBytes(state.fileSize);
    if (upEl) upEl.textContent = formatDateTime(new Date().toISOString());
    renderStep2Preview();
  }

  function renderStep2Preview() {
    var box = $("fi-preview");
    var body = $("fi-preview-body");
    if (!box || !body) return;

    var ext = state.fileExt;
    body.innerHTML = "";

    if (IMG_EXT.indexOf(ext) !== -1 && state.previewDataUrl) {
      var img = document.createElement("img");
      img.className = "fi-preview-img";
      img.src = state.previewDataUrl;
      img.alt = state.fileName;
      body.appendChild(img);
      box.hidden = false;
      return;
    }
    if (ext === "pdf" && state.previewBlobUrl) {
      var ifr = document.createElement("iframe");
      ifr.className = "fi-preview-pdf";
      ifr.src = state.previewBlobUrl;
      ifr.title = state.fileName;
      ifr.setAttribute("aria-label", state.fileName);
      body.appendChild(ifr);
      box.hidden = false;
      return;
    }
    if (state.previewText) {
      var rows = state.previewText.split(/\r?\n/).filter(function (l) { return l.length > 0; });
      if (ext === "csv") {
        var sep = rows[0] && rows[0].split(";").length > rows[0].split(",").length ? ";" : ",";
        var html = '<div class="fi-preview-table-wrap"><table class="fi-preview-table">';
        rows.forEach(function (line, idx) {
          var cells = line.split(sep);
          var tag = idx === 0 ? "th" : "td";
          html += "<tr>" + cells.map(function (c) { return "<" + tag + ">" + escapeHtml(c) + "</" + tag + ">"; }).join("") + "</tr>";
        });
        html += "</table></div>";
        body.innerHTML = html;
      } else {
        body.innerHTML = '<pre class="fi-preview-pre">' + escapeHtml(state.previewText) + "</pre>";
      }
      box.hidden = false;
      return;
    }
    box.hidden = true;
  }

  function openZoom() {
    if (!state.file) return;
    var overlay = $("fi-zoom-overlay");
    var body = $("fi-zoom-body");
    var title = $("fi-zoom-title");
    if (!overlay || !body) return;
    if (title) title.textContent = state.fileName;
    body.innerHTML = "";

    var ext = state.fileExt;
    if (IMG_EXT.indexOf(ext) !== -1 && state.previewDataUrl) {
      var img = document.createElement("img");
      img.className = "fi-zoom-img";
      img.src = state.previewDataUrl;
      img.alt = state.fileName;
      body.appendChild(img);
    } else if (ext === "pdf" && state.previewBlobUrl) {
      var ifr = document.createElement("iframe");
      ifr.className = "fi-zoom-pdf";
      ifr.src = state.previewBlobUrl;
      ifr.title = state.fileName;
      body.appendChild(ifr);
    } else if (state.previewText) {
      body.innerHTML = '<pre class="fi-zoom-pre">' + escapeHtml(state.previewText) + "</pre>";
    } else {
      body.innerHTML = '<div class="fi-zoom-fallback"><p>Voor dit bestandstype is geen voorbeeld beschikbaar.</p><p class="fi-zoom-fallback-name">' + escapeHtml(state.fileName) + " · " + escapeHtml(formatBytes(state.fileSize)) + "</p></div>";
    }

    overlay.hidden = false;
    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("fi-zoom-open");
  }

  function closeZoom() {
    var overlay = $("fi-zoom-overlay");
    if (!overlay) return;
    overlay.hidden = true;
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("fi-zoom-open");
    var body = $("fi-zoom-body");
    if (body) body.innerHTML = "";
  }

  function buildFinalFileName() {
    var raw = $("fi-meta-name-input");
    var base = raw && typeof raw.value === "string" ? raw.value.trim() : "";
    if (!base) base = state.fileBaseName || "factuur";
    return state.fileExt ? base + "." + state.fileExt : base;
  }

  function persistImportJob(finalName) {
    var jobs = readJSONList(STORAGE_KEY);
    var job = {
      id: newId(),
      name: finalName,
      ext: state.fileExt,
      size: state.fileSize,
      importedAt: new Date().toISOString(),
    };
    jobs.unshift(job);
    if (jobs.length > 100) jobs.length = 100;
    writeJSONList(STORAGE_KEY, jobs);
    return job;
  }

  function persistFactSupplement(finalName, jobId) {
    var supp = readJSONList(LS_FACT_SUPP);
    var nowIso = new Date().toISOString();
    var newRow = {
      id: "fs" + Date.now() + "x" + Math.random().toString(36).slice(2, 10),
      fromSupp: true,
      fromImport: true,
      importJobId: jobId,
      fn: finalName,
      besch: "Geïmporteerd",
      client: "—",
      nr: "—",
      per: formatDateNL(nowIso),
      beta: "-",
      st: "Open",
      bedr: "€ 0,00",
      importFile: {
        name: finalName,
        ext: state.fileExt,
        size: state.fileSize,
        importedAt: nowIso,
      },
    };
    supp.unshift(newRow);
    writeJSONList(LS_FACT_SUPP, supp);
    if (window.facturenDB && typeof window.facturenDB.add === "function") {
      try { window.facturenDB.add(newRow).catch(function () { /* */ }); } catch (e) { /* */ }
    }
    try {
      window.dispatchEvent(new CustomEvent("besa:facturen-updated", { detail: { source: "facturen-importeren" } }));
    } catch (e) { /* */ }
    return newRow;
  }

  function renderHistory() {
    var tbody = $("fi-history-tbody");
    if (!tbody) return;
    var jobs = readJSONList(STORAGE_KEY);
    if (!jobs.length) {
      tbody.innerHTML = '<tr class="fi-empty-row"><td colspan="5" class="fi-empty-cell">Nog geen bestanden ge\u00efmporteerd.</td></tr>';
      return;
    }
    var html = "";
    jobs.forEach(function (j) {
      html += '<tr data-fi-job-id="' + escapeHtml(j.id) + '">' +
        "<td>" + escapeHtml(j.name) + "</td>" +
        "<td>" + escapeHtml((j.ext || "").toUpperCase()) + "</td>" +
        "<td>" + escapeHtml(formatBytes(j.size)) + "</td>" +
        "<td>" + escapeHtml(formatDateTime(j.importedAt)) + "</td>" +
        '<td class="fi-td-acties">' +
          '<button type="button" class="employee-delete-btn fi-job-delete" aria-label="Verwijderen" title="Verwijderen">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
          "</button>" +
        "</td>" +
      "</tr>";
    });
    tbody.innerHTML = html;
  }

  function bindHistoryActions() {
    var tbody = $("fi-history-tbody");
    if (!tbody) return;
    tbody.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest && e.target.closest(".fi-job-delete");
      if (!btn) return;
      var tr = btn.closest("tr");
      if (!tr) return;
      var id = tr.getAttribute("data-fi-job-id");
      if (!id) return;
      var ask = (typeof window.showSliderConfirmModal === "function")
        ? window.showSliderConfirmModal({
            title: "Bent u zeker dat dit verwijderd wordt?",
            preview: tr.children[0] ? tr.children[0].textContent : "",
            okLabel: "Verwijderen",
            cancelLabel: "Annuleren",
          })
        : Promise.resolve(true);
      ask.then(function (ok) {
        if (!ok) return;
        var jobs = readJSONList(STORAGE_KEY).filter(function (j) { return j.id !== id; });
        writeJSONList(STORAGE_KEY, jobs);
        var supp = readJSONList(LS_FACT_SUPP).filter(function (r) { return !(r && r.importJobId === id); });
        writeJSONList(LS_FACT_SUPP, supp);
        try {
          window.dispatchEvent(new CustomEvent("besa:facturen-updated", { detail: { source: "facturen-importeren" } }));
        } catch (e2) { /* */ }
        renderHistory();
        if (typeof window.showActionFeedback === "function") {
          window.showActionFeedback("deleted", "Importjob");
        }
      });
    });
  }

  function bindDropzone() {
    var dz = $("fi-dropzone");
    var input = $("fi-file-input");
    if (!dz || !input) return;

    function pick() { input.click(); }

    dz.addEventListener("click", function (e) {
      if (e.target && e.target.closest && e.target.closest(".fi-dropzone-preview-actions")) return;
      pick();
    });
    dz.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        if (e.target && e.target.closest && e.target.closest(".fi-dropzone-preview-actions")) return;
        e.preventDefault();
        pick();
      }
    });
    dz.setAttribute("tabindex", "0");
    dz.setAttribute("role", "button");
    dz.setAttribute("aria-label", "Selecteer bestand om te importeren");

    input.addEventListener("change", function () {
      var f = input.files && input.files[0];
      if (f) setFile(f);
    });

    ["dragenter", "dragover"].forEach(function (ev) {
      dz.addEventListener(ev, function (e) {
        e.preventDefault();
        e.stopPropagation();
        dz.classList.add("is-dragover");
      });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      dz.addEventListener(ev, function (e) {
        e.preventDefault();
        e.stopPropagation();
        dz.classList.remove("is-dragover");
      });
    });
    dz.addEventListener("drop", function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) {
        try { input.files = e.dataTransfer.files; } catch (_) { /* */ }
        setFile(f);
      }
    });

    var replaceBtn = $("fi-replace-btn");
    if (replaceBtn) replaceBtn.addEventListener("click", function (e) { e.stopPropagation(); pick(); });

    var clearBtn = $("fi-clear-btn");
    if (clearBtn) clearBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      input.value = "";
      setFile(null);
    });

    var zoomBtn = $("fi-zoom-btn");
    if (zoomBtn) zoomBtn.addEventListener("click", function (e) { e.stopPropagation(); openZoom(); });
  }

  function bindZoomModal() {
    var overlay = $("fi-zoom-overlay");
    var closeBtn = $("fi-zoom-close");
    if (closeBtn) closeBtn.addEventListener("click", closeZoom);
    if (overlay) overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeZoom();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && overlay && !overlay.hidden) closeZoom();
    });
    var zoomBtn2 = $("fi-zoom-btn-2");
    if (zoomBtn2) zoomBtn2.addEventListener("click", openZoom);
  }

  function bindButtons() {
    var next1 = $("fi-next-1");
    var back2 = $("fi-back-2");
    var next2 = $("fi-next-2");

    if (next1) next1.addEventListener("click", function () {
      if (!state.file) return;
      readPreviewText(state.file).then(function (txt) {
        state.previewText = txt;
        fillStep2();
        setStep(2);
      });
    });

    if (back2) back2.addEventListener("click", function () { setStep(1); });

    if (next2) next2.addEventListener("click", function () {
      if (!state.file) return;
      next2.disabled = true;
      var finalName = buildFinalFileName();
      var job = persistImportJob(finalName);
      persistFactSupplement(finalName, job.id);

      setFile(null);
      var input = $("fi-file-input");
      if (input) input.value = "";
      setStep(1);
      renderHistory();

      next2.disabled = false;
      if (typeof window.showActionFeedback === "function") {
        window.showActionFeedback("imported", "Factuur");
      }
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    bindDropzone();
    bindZoomModal();
    bindButtons();
    bindHistoryActions();
    renderHistory();
  });
})();
