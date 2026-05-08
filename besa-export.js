/* global window, document, Blob, URL */
/**
 * besa-export.js — Generieke export-helper.
 *
 * Toont een keuze-modal met 4 formats: CSV, Tekstbestand (.txt), Excel (.xls)
 * en PDF. Op keuze wordt het bestand gegenereerd en via download getriggerd.
 *
 * Excel: gebruikt .xls met Excel-XML (SpreadsheetML 2003) zodat geen externe
 * library nodig is en Excel het opent. Voor échte .xlsx zou SheetJS via CDN
 * geladen moeten worden — overkill voor onze datasets.
 *
 * PDF: gebruikt window.print() met een hidden printable HTML-tabel + window
 * print-stylesheet. Browser dialog laat user kiezen "Save as PDF". Geen lib.
 *
 * Public API:
 *   window.besaExport({
 *     filename: "clienten",                 // zonder extensie
 *     title: "Cliënten",                    // gebruikt in PDF-header
 *     data: [{Voornaam: "Raymond", ...}],   // array van objecten
 *     columns: ["Voornaam", "Achternaam"],  // kolomvolgorde (keys uit data)
 *   })
 */
(function (w) {
  "use strict";

  function escHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function downloadBlob(blob, filename) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      try { URL.revokeObjectURL(a.href); } catch (e) { /* */ }
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 100);
  }

  function csvField(v) {
    var s = v == null ? "" : String(v);
    return '"' + s.replace(/"/g, '""') + '"';
  }

  function exportCsv(opts) {
    var rows = (opts.data || []).map(function (r) {
      return opts.columns.map(function (k) { return csvField(r[k]); }).join(";");
    });
    var content = "﻿" + opts.columns.map(csvField).join(";") + "\n" + rows.join("\n");
    var blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, opts.filename + ".csv");
  }

  function exportTxt(opts) {
    var pad = function (s, w) { s = String(s == null ? "" : s); return s + Array(Math.max(0, w - s.length + 1)).join(" "); };
    // Bereken kolom-breedtes
    var widths = opts.columns.map(function (k) {
      var maxData = 0;
      (opts.data || []).forEach(function (r) {
        var v = String(r[k] == null ? "" : r[k]);
        if (v.length > maxData) maxData = v.length;
      });
      return Math.max(k.length, maxData);
    });
    var sep = widths.map(function (w0) { return Array(w0 + 1).join("-"); }).join("  ");
    var header = opts.columns.map(function (k, i) { return pad(k, widths[i]); }).join("  ");
    var lines = (opts.data || []).map(function (r) {
      return opts.columns.map(function (k, i) { return pad(r[k], widths[i]); }).join("  ");
    });
    var content = (opts.title ? opts.title + "\n\n" : "") + header + "\n" + sep + "\n" + lines.join("\n");
    var blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    downloadBlob(blob, opts.filename + ".txt");
  }

  /**
   * Excel via SpreadsheetML 2003 — opens in Excel/LibreOffice/Numbers without
   * needing a library. Saved as .xls (mime application/vnd.ms-excel).
   */
  function exportXls(opts) {
    function xmlCell(v) {
      var s = v == null ? "" : v;
      var n = (typeof s === "number") || (/^-?\d+([\.,]\d+)?$/.test(String(s)));
      var type = n ? "Number" : "String";
      var val = n ? String(s).replace(",", ".") : escHtml(s);
      return '<Cell><Data ss:Type="' + type + '">' + val + '</Data></Cell>';
    }
    var headerCells = opts.columns.map(function (k) {
      return '<Cell ss:StyleID="hdr"><Data ss:Type="String">' + escHtml(k) + '</Data></Cell>';
    }).join("");
    var bodyRows = (opts.data || []).map(function (r) {
      return "<Row>" + opts.columns.map(function (k) { return xmlCell(r[k]); }).join("") + "</Row>";
    }).join("\n");
    var xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<?mso-application progid="Excel.Sheet"?>\n' +
      '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n' +
      ' xmlns:o="urn:schemas-microsoft-com:office:office"\n' +
      ' xmlns:x="urn:schemas-microsoft-com:office:excel"\n' +
      ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"\n' +
      ' xmlns:html="http://www.w3.org/TR/REC-html40">\n' +
      ' <Styles>\n' +
      '  <Style ss:ID="hdr"><Font ss:Bold="1"/><Interior ss:Color="#E5E7EB" ss:Pattern="Solid"/></Style>\n' +
      ' </Styles>\n' +
      ' <Worksheet ss:Name="' + escHtml(opts.title || "Export") + '">\n' +
      '  <Table>\n' +
      '   <Row>' + headerCells + '</Row>\n' +
      bodyRows + "\n" +
      '  </Table>\n' +
      ' </Worksheet>\n' +
      "</Workbook>";
    var blob = new Blob([xml], { type: "application/vnd.ms-excel" });
    downloadBlob(blob, opts.filename + ".xls");
  }

  /**
   * PDF via print-window — eenvoudig en zonder lib. Opent een nieuwe tab
   * met een print-vriendelijke HTML-tabel + print-CSS, triggert window.print().
   * User kiest in browser-dialog "Save as PDF".
   */
  function exportPdf(opts) {
    var headerHtml = opts.columns.map(function (k) { return "<th>" + escHtml(k) + "</th>"; }).join("");
    var bodyHtml = (opts.data || []).map(function (r) {
      return "<tr>" + opts.columns.map(function (k) { return "<td>" + escHtml(r[k]) + "</td>"; }).join("") + "</tr>";
    }).join("");
    var title = escHtml(opts.title || opts.filename || "Export");
    var dateStr = new Date().toLocaleString("nl-NL");
    var html =
      "<!doctype html><html lang='nl'><head><meta charset='UTF-8'/>" +
      "<title>" + title + "</title>" +
      "<style>" +
      "@page { size: A4; margin: 18mm; }" +
      "body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; color: #111827; font-size: 11pt; }" +
      "h1 { font-size: 18pt; margin: 0 0 4px; }" +
      ".meta { color: #6b7280; font-size: 9pt; margin-bottom: 14pt; }" +
      "table { width: 100%; border-collapse: collapse; }" +
      "th, td { padding: 6pt 8pt; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: top; word-break: break-word; }" +
      "th { background: #f3f4f6; font-weight: 700; font-size: 9.5pt; text-transform: uppercase; }" +
      "tr:nth-child(even) td { background: #fafafa; }" +
      "@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }" +
      "</style></head><body>" +
      "<h1>" + title + "</h1>" +
      "<div class='meta'>Geëxporteerd op " + escHtml(dateStr) + " — " + (opts.data || []).length + " regels</div>" +
      "<table><thead><tr>" + headerHtml + "</tr></thead><tbody>" + bodyHtml + "</tbody></table>" +
      "<script>window.addEventListener('load', function(){ setTimeout(function(){ window.print(); }, 300); });<\/script>" +
      "</body></html>";
    var win = w.open("", "_blank");
    if (!win) {
      // Pop-up geblokkeerd — fallback: download als HTML
      var blob = new Blob([html], { type: "text/html;charset=utf-8" });
      downloadBlob(blob, opts.filename + ".html");
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  // ---------------------------------------------------------------------------
  // Modal
  // ---------------------------------------------------------------------------
  function openExportChoice(opts) {
    if (!opts || !Array.isArray(opts.data) || !Array.isArray(opts.columns)) {
      console.error("[besaExport] Geldige data + columns vereist");
      return;
    }
    // Note: modal opent ALTIJD — ook bij lege data. De 'Niets te exporteren'
    // melding komt pas zodra een format gekozen wordt en blijkt dat er geen
    // rijen zijn om te exporteren. Zie pick() onderaan.
    var filename = (opts.filename || "export") + "-" + new Date().toISOString().slice(0, 10);
    var title = opts.title || opts.filename || "Export";

    var overlay = w.document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.setAttribute("aria-hidden", "false");
    overlay.innerHTML =
      "<div class='modal-card besa-export-modal' role='dialog' aria-modal='true' tabindex='-1'>" +
        "<div class='modal-header'>" +
          "<h2 class='modal-title'>Exporteren</h2>" +
          "<button type='button' class='modal-close' aria-label='Sluiten'><span aria-hidden='true'>&times;</span></button>" +
        "</div>" +
        "<div class='modal-body'>" +
          "<p style='margin:0 0 4px;color:var(--text-secondary)'>Kies het exportformaat voor <strong>" + escHtml(title) + "</strong> (" + (opts.data || []).length + " regels)</p>" +
          "<div class='besa-export-options'>" +
            "<button type='button' class='besa-export-option' data-fmt='csv'>" +
              "<span class='besa-export-icon'><svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/><polyline points='14 2 14 8 20 8'/></svg></span>" +
              "<span class='besa-export-label'>CSV</span>" +
              "<span class='besa-export-ext'>.csv — Excel/LibreOffice</span>" +
            "</button>" +
            "<button type='button' class='besa-export-option' data-fmt='txt'>" +
              "<span class='besa-export-icon'><svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/><polyline points='14 2 14 8 20 8'/><line x1='16' y1='13' x2='8' y2='13'/><line x1='16' y1='17' x2='8' y2='17'/></svg></span>" +
              "<span class='besa-export-label'>Tekstbestand</span>" +
              "<span class='besa-export-ext'>.txt — leesbaar als tekst</span>" +
            "</button>" +
            "<button type='button' class='besa-export-option' data-fmt='xls'>" +
              "<span class='besa-export-icon'><svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><rect x='3' y='3' width='18' height='18' rx='2'/><line x1='3' y1='9' x2='21' y2='9'/><line x1='3' y1='15' x2='21' y2='15'/><line x1='9' y1='3' x2='9' y2='21'/><line x1='15' y1='3' x2='15' y2='21'/></svg></span>" +
              "<span class='besa-export-label'>Excel</span>" +
              "<span class='besa-export-ext'>.xls — opent direct in Excel</span>" +
            "</button>" +
            "<button type='button' class='besa-export-option' data-fmt='pdf'>" +
              "<span class='besa-export-icon'><svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/><polyline points='14 2 14 8 20 8'/><path d='M9 13h6'/><path d='M9 17h6'/></svg></span>" +
              "<span class='besa-export-label'>PDF</span>" +
              "<span class='besa-export-ext'>.pdf — via print-dialog</span>" +
            "</button>" +
          "</div>" +
        "</div>" +
        "<div class='modal-footer'>" +
          "<button type='button' class='btn-outline besa-export-cancel'>Annuleren</button>" +
        "</div>" +
      "</div>";

    function close() {
      w.document.removeEventListener("keydown", onKey);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (!w.document.querySelector(".modal-overlay:not([hidden])")) {
        w.document.body.classList.remove("modal-open");
      }
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    function pick(fmt) {
      // Lege data → toon 'Niets te exporteren' melding zodra een format is gekozen
      // (volgt user-wens: modal eerst tonen, foutmelding pas na klik op format).
      if (!opts.data.length) {
        if (typeof w.showActionFeedback === "function") {
          w.showActionFeedback("info", "Niets te exporteren");
        } else if (typeof w.showSaveModal === "function") {
          w.showSaveModal("Er zijn geen rijen om te exporteren.", "Niets te exporteren");
        }
        close();
        return;
      }
      try {
        if (fmt === "csv") exportCsv({ filename: filename, data: opts.data, columns: opts.columns, title: title });
        else if (fmt === "txt") exportTxt({ filename: filename, data: opts.data, columns: opts.columns, title: title });
        else if (fmt === "xls") exportXls({ filename: filename, data: opts.data, columns: opts.columns, title: title });
        else if (fmt === "pdf") exportPdf({ filename: filename, data: opts.data, columns: opts.columns, title: title });
        if (typeof w.showActionFeedback === "function") {
          w.showActionFeedback("exported", filename + "." + (fmt === "xls" ? "xls" : fmt));
        }
      } catch (err) {
        console.error("[besaExport] Mislukt:", err);
        if (typeof w.showActionFeedback === "function") {
          w.showActionFeedback("error", "Export mislukt");
        }
      }
      close();
    }

    overlay.querySelector(".modal-close").addEventListener("click", close);
    overlay.querySelector(".besa-export-cancel").addEventListener("click", close);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
    overlay.querySelectorAll(".besa-export-option").forEach(function (btn) {
      btn.addEventListener("click", function () { pick(btn.getAttribute("data-fmt")); });
    });
    w.document.addEventListener("keydown", onKey);
    w.document.body.appendChild(overlay);
    w.document.body.classList.add("modal-open");
    try { overlay.querySelector(".besa-export-option").focus(); } catch (e) { /* */ }
  }

  w.besaExport = openExportChoice;
})(window);
