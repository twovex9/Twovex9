/**
 * Gedeeld door beschikkingen-overzicht + facturen: exporttabel naar PDF, TXT, CSV of XLSX.
 * Vereist: jspdf, jspdf.plugin.autotable, xlsx (via script-tags vóór dit bestand).
 */
(function (global) {
  "use strict";

  function safeBaseName(name) {
    return String(name || "export").replace(/[\\\/:*?"<>|]+/g, "-").trim() || "export";
  }

  function escCsvCell(v) {
    var s = String(v == null ? "" : v);
    if (s.indexOf(";") >= 0 || s.indexOf("\n") >= 0 || s.indexOf("\r") >= 0 || s.indexOf('"') >= 0) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function downloadBlob(bytes, filename, mime) {
    var blob;
    if (bytes instanceof Blob) {
      blob = bytes;
    } else {
      blob = new Blob([bytes], { type: mime || "application/octet-stream" });
    }
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportAsTxt(headers, rows, baseName) {
    var all = [headers].concat(rows);
    var line = function (arr) {
      return arr.map(function (c) {
        return String(c == null ? "" : c).replace(/\t/g, " ").replace(/\r|\n/g, " ");
      }).join("\t");
    };
    var t = all.map(line).join("\r\n");
    downloadBlob("\uFEFF" + t, baseName + ".txt", "text/plain;charset=utf-8");
  }

  function exportAsCsv(headers, rows, baseName) {
    var lines = [headers.map(escCsvCell).join(";")];
    for (var i = 0; i < rows.length; i += 1) {
      lines.push((rows[i] || []).map(escCsvCell).join(";"));
    }
    downloadBlob("\uFEFF" + lines.join("\r\n"), baseName + ".csv", "text/csv;charset=utf-8");
  }

  function exportAsXlsx(headers, rows, baseName) {
    if (typeof XLSX === "undefined" || !XLSX.utils || !XLSX.writeFile) {
      return { ok: false, error: "Excel-exportbibliotheek ontbreekt. Vernieuw de pagina." };
    }
    var aoa = [headers].concat(rows);
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Export");
    try {
      XLSX.writeFile(wb, baseName + ".xlsx");
    } catch (e) {
      return { ok: false, error: "Excel kon niet worden opgeslagen." };
    }
    return { ok: true };
  }

  function exportAsPdf(headers, rows, baseName) {
    if (typeof global.jspdf === "undefined" || !global.jspdf.jsPDF) {
      return { ok: false, error: "PDF-bibliotheek ontbreekt. Vernieuw de pagina." };
    }
    var Js = global.jspdf.jsPDF;
    var doc = new Js({ orientation: "landscape", unit: "pt", format: "a4" });
    if (typeof doc.autoTable !== "function") {
      return { ok: false, error: "PDF-tabel plug-in ontbreekt. Vernieuw de pagina." };
    }
    var head = [headers.map(function (h) { return String(h == null ? "" : h); })];
    var body = rows.map(function (r) {
      return (r || []).map(function (c) { return String(c == null ? "" : c); });
    });
    doc.setFont("helvetica", "normal");
    doc.autoTable({
      head: head,
      body: body,
      styles: { fontSize: 6, cellPadding: 2, overflow: "linebreak", valign: "top" },
      headStyles: { fillColor: [55, 125, 255], textColor: [255, 255, 255], fontStyle: "bold" },
      margin: { top: 40, left: 24, right: 24, bottom: 32 },
    });
    try {
      doc.save(baseName + ".pdf");
    } catch (e2) {
      return { ok: false, error: "PDF kon niet worden opgeslagen." };
    }
    return { ok: true };
  }

  /**
   * @param {{ baseName: string, headers: string[], rows: string[][], format: string }} opts
   * @returns {{ ok: boolean, error?: string }}
   */
  function runTableExport(opts) {
    if (!opts || !Array.isArray(opts.headers) || !Array.isArray(opts.rows)) {
      return { ok: false, error: "Ongeldige export." };
    }
    var base = safeBaseName(opts.baseName);
    var headers = opts.headers.map(function (h) { return String(h == null ? "" : h); });
    var rows = opts.rows.map(function (r) {
      return (r || []).map(function (c) { return String(c == null ? "" : c); });
    });
    if (!headers.length) {
      return { ok: false, error: "Geen kolommen" };
    }
    var f = String(opts.format || "xlsx").toLowerCase();

    if (f === "txt") {
      exportAsTxt(headers, rows, base);
      return { ok: true };
    }
    if (f === "csv" || f === "spreadsheet") {
      exportAsCsv(headers, rows, base);
      return { ok: true };
    }
    if (f === "xlsx" || f === "excel") {
      return exportAsXlsx(headers, rows, base);
    }
    if (f === "pdf") {
      return exportAsPdf(headers, rows, base);
    }
    return { ok: false, error: "Onbekend bestandsformaat" };
  }

  global.runTableExport = runTableExport;
})(typeof window !== "undefined" ? window : this);
