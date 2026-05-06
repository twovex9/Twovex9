(function () {
  "use strict";

  var STORAGE_KEY = "besa.facturenImportJobs";
  var MAX_BYTES = 20 * 1024 * 1024;
  var ALLOWED_EXT = ["svg", "png", "xlsx", "xls", "csv", "jpg", "jpeg", "pdf", "docx", "doc"];
  var ALLOWED_HUMAN = "SVG, PNG, Excel, CSV, JPG, PDF of .docx";

  var state = {
    file: null,
    fileName: "",
    fileType: "",
    fileSize: 0,
    fileExt: "",
    previewText: "",
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

  function getExt(name) {
    if (!name) return "";
    var i = name.lastIndexOf(".");
    return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
  }

  function readJobs() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function writeJobs(jobs) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs)); } catch (e) { /* quota */ }
  }

  function newId() {
    return "fi_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function setStep(step) {
    [1, 2, 3].forEach(function (n) {
      var li = document.querySelector('.fi-step[data-fi-step="' + n + '"]');
      var panel = document.querySelector('[data-fi-panel="' + n + '"]');
      if (li) {
        li.classList.toggle("is-active", n === step);
        li.classList.toggle("is-done", n < step);
      }
      if (panel) {
        panel.hidden = n !== step;
      }
    });
    if (step === 3) renderHistory();
    var content = document.querySelector(".content--fi");
    if (content) content.scrollTop = 0;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showError(msg) {
    var err = $("fi-error");
    if (!err) return;
    if (!msg) {
      err.hidden = true;
      err.textContent = "";
    } else {
      err.hidden = false;
      err.textContent = msg;
    }
  }

  function setFile(file) {
    showError("");
    if (!file) {
      state.file = null;
      state.fileName = "";
      state.fileSize = 0;
      state.fileExt = "";
      state.previewText = "";
      var fn = $("fi-dropzone-filename");
      if (fn) fn.textContent = "";
      var nextBtn = $("fi-next-1");
      if (nextBtn) nextBtn.disabled = true;
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

    state.file = file;
    state.fileName = file.name;
    state.fileType = file.type || "—";
    state.fileSize = file.size;
    state.fileExt = ext;
    state.previewText = "";

    var fnEl = $("fi-dropzone-filename");
    if (fnEl) fnEl.textContent = file.name + " (" + formatBytes(file.size) + ")";
    var nextBtn = $("fi-next-1");
    if (nextBtn) nextBtn.disabled = false;
  }

  function readPreview(file) {
    return new Promise(function (resolve) {
      if (!file) return resolve("");
      var ext = getExt(file.name);
      if (ext !== "csv" && ext !== "txt") return resolve("");
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var txt = String(reader.result || "");
          var lines = txt.split(/\r?\n/).slice(0, 12);
          resolve(lines.join("\n"));
        } catch (e) { resolve(""); }
      };
      reader.onerror = function () { resolve(""); };
      reader.readAsText(file.slice(0, 8 * 1024));
    });
  }

  function renderPreview() {
    var box = $("fi-preview");
    var body = $("fi-preview-body");
    if (!box || !body) return;
    if (!state.previewText) {
      box.hidden = true;
      body.innerHTML = "";
      return;
    }
    var rows = state.previewText.split(/\r?\n/).filter(function (l) { return l.length > 0; });
    if (state.fileExt === "csv") {
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
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function fillStep2() {
    var nameEl = $("fi-meta-name");
    var typeEl = $("fi-meta-type");
    var sizeEl = $("fi-meta-size");
    var upEl = $("fi-meta-uploaded");
    if (nameEl) nameEl.textContent = state.fileName || "—";
    if (typeEl) typeEl.textContent = state.fileExt ? state.fileExt.toUpperCase() : "—";
    if (sizeEl) sizeEl.textContent = formatBytes(state.fileSize);
    if (upEl) upEl.textContent = formatDateTime(new Date().toISOString());
    renderPreview();
  }

  function persistJob() {
    var jobs = readJobs();
    var job = {
      id: newId(),
      name: state.fileName,
      ext: state.fileExt,
      size: state.fileSize,
      importedAt: new Date().toISOString(),
    };
    jobs.unshift(job);
    if (jobs.length > 100) jobs.length = 100;
    writeJobs(jobs);
    return job;
  }

  function renderHistory() {
    var tbody = $("fi-history-tbody");
    if (!tbody) return;
    var jobs = readJobs();
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
            confirmLabel: "Verwijderen",
            tone: "danger",
          })
        : Promise.resolve(true);
      ask.then(function (ok) {
        if (!ok) return;
        var jobs = readJobs().filter(function (j) { return j.id !== id; });
        writeJobs(jobs);
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

    dz.addEventListener("click", function () { input.click(); });
    dz.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); }
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
        try { input.files = e.dataTransfer.files; } catch (_) { /* not assignable in some browsers */ }
        setFile(f);
      }
    });
  }

  function bindButtons() {
    var next1 = $("fi-next-1");
    var back2 = $("fi-back-2");
    var next2 = $("fi-next-2");
    var restart = $("fi-restart");

    if (next1) next1.addEventListener("click", function () {
      if (!state.file) return;
      readPreview(state.file).then(function (txt) {
        state.previewText = txt;
        fillStep2();
        setStep(2);
      });
    });

    if (back2) back2.addEventListener("click", function () { setStep(1); });

    if (next2) next2.addEventListener("click", function () {
      if (!state.file) return;
      next2.disabled = true;
      var job = persistJob();
      var sub = $("fi-success-sub");
      if (sub) sub.textContent = "Het bestand \u201c" + state.fileName + "\u201d (" + formatBytes(state.fileSize) + ") is toegevoegd aan de importjobs.";
      setStep(3);
      next2.disabled = false;
      if (typeof window.showActionFeedback === "function") {
        window.showActionFeedback("imported", "Factuurbestand");
      }
    });

    if (restart) restart.addEventListener("click", function () {
      setFile(null);
      var input = $("fi-file-input");
      if (input) input.value = "";
      setStep(1);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    bindDropzone();
    bindButtons();
    bindHistoryActions();
    var jobs = readJobs();
    if (jobs.length > 0) {
      renderHistory();
    }
  });
})();
