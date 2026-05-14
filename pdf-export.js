/* global window, document */
/**
 * pdf-export.js — Fase E.9 — Generieke PDF/print helper
 *
 * 2 entry-points:
 *   - besaPdfExport.printPage() → standaard browser-print (Ctrl+P equivalent)
 *     Gebruikt de @media print CSS in styles.css voor layout-optimalisatie.
 *
 *   - besaPdfExport.downloadTableAsPdf(tableId, filename, title)
 *     → genereert echte PDF via jsPDF (vereist jsPDF CDN loaded)
 *     Voor facturen/beschikkingen/rapportages die als PDF moeten downloaden.
 *
 * jsPDF wordt lazy-loaded vanaf CDN bij eerste call → geen overhead op pages
 * die geen PDF-export nodig hebben.
 */
(function (global) {
  "use strict";

  var jsPdfLoading = null;

  function loadJsPdf() {
    if (global.jspdf || global.jsPDF) return Promise.resolve();
    if (jsPdfLoading) return jsPdfLoading;
    jsPdfLoading = new Promise(function (resolve, reject) {
      var script1 = document.createElement("script");
      script1.src = "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js";
      script1.onload = function () {
        var script2 = document.createElement("script");
        script2.src = "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.1/dist/jspdf.plugin.autotable.min.js";
        script2.onload = resolve;
        script2.onerror = reject;
        document.head.appendChild(script2);
      };
      script1.onerror = reject;
      document.head.appendChild(script1);
    });
    return jsPdfLoading;
  }

  function printPage() {
    try {
      window.print();
    } catch (e) {
      console.error("[pdf-export] window.print() failed:", e);
    }
  }

  /**
   * Export een HTML-tabel als PDF.
   * @param {string} tableId - ID van de <table> element
   * @param {string} filename - bv. "factuur-2026-05.pdf"
   * @param {string} title - bv. "Factuur overzicht mei 2026"
   */
  async function downloadTableAsPdf(tableId, filename, title) {
    await loadJsPdf();
    var jsPDF = (global.jspdf && global.jspdf.jsPDF) || global.jsPDF;
    if (!jsPDF) {
      throw new Error("jsPDF niet geladen");
    }
    var doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

    if (title) {
      doc.setFontSize(14);
      doc.text(title, 40, 30);
      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text("Geëxporteerd op " + new Date().toLocaleString("nl-NL"), 40, 46);
      doc.setTextColor(0);
    }

    var table = document.getElementById(tableId);
    if (!table) throw new Error("Tabel niet gevonden: " + tableId);

    // Gebruik jspdf-autotable plugin om de tabel netjes te renderen
    doc.autoTable({
      html: "#" + tableId,
      startY: title ? 60 : 30,
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [240, 240, 240], textColor: 20 },
      didParseCell: function (data) {
        // Skip rijen met col-hidden (Kolommen-kiezer)
        if (data.cell.raw && data.cell.raw.classList && data.cell.raw.classList.contains("col-hidden")) {
          data.cell.styles.cellWidth = 0;
        }
      },
    });

    doc.save(filename || "export-" + Date.now() + ".pdf");
  }

  global.besaPdfExport = {
    printPage: printPage,
    downloadTableAsPdf: downloadTableAsPdf,
  };
})(typeof window !== "undefined" ? window : this);
