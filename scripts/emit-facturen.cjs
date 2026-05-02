/**
 * Leest scripts/facturen-paste.txt (1 regel per veld, 8 regels = 1 factuurregel).
 * Slaat herhaalde kopteksten (Factuurnummer … Bedrag) over.
 * Uit: ../facturen-bulk.js
 * Run: node scripts/emit-facturen.cjs
 */
var fs = require("fs");
var path = require("path");
var p = path.join(__dirname, "facturen-paste.txt");
if (!fs.existsSync(p)) {
  process.stderr.write("Ontbreekt: " + p + "\n");
  process.exit(1);
}
var raw = fs.readFileSync(p, "utf8");
var lines = raw.split(/\r?\n/);
var HEADER0 = "Factuurnummer";
var rows = [];
var i = 0;
while (i < lines.length) {
  var s = (lines[i] == null ? "" : String(lines[i])).trim();
  if (s === "" || s === "\u00a0") {
    i += 1;
    continue;
  }
  if (s === HEADER0) {
    var t1 = (lines[i + 1] && String(lines[i + 1]).trim()) || "";
    if (t1 === "Beschikking") {
      i += 8;
      continue;
    }
  }
  if (i + 7 >= lines.length) break;
  var fn = s;
  var besch = (lines[i + 1] || "").trim();
  var cl = (lines[i + 2] || "").trim();
  var nr = (lines[i + 3] || "").trim();
  var per = (lines[i + 4] || "").trim();
  var beta = (lines[i + 5] || "").trim();
  var st = (lines[i + 6] || "").trim();
  var bedr = (lines[i + 7] || "").trim();
  var bedTrim = bedr.replace(/^\s+/, "");
  if (!/^€\s*-?[\d.,]+/.test(bedTrim) && !/^-\s*€/.test(bedTrim)) {
    i += 1;
    continue;
  }
  rows.push({
    fn: fn,
    besch: besch,
    client: cl,
    nr: nr,
    per: per,
    beta: beta,
    st: st,
    bedr: bedr
  });
  i += 8;
}
var out = [];
out.push("/** Gegenereerd: node scripts/emit-facturen.cjs; bron: scripts/facturen-paste.txt */");
out.push("(function (g) {");
out.push("  \"use strict\";");
out.push("  g.FACT_BULK_DATA_VER = \"1\";");
out.push("  g.FACTUREN_BULK = " + JSON.stringify(rows) + ";");
out.push("})(typeof window !== \"undefined\" ? window : this);");
var dest = path.join(__dirname, "..", "facturen-bulk.js");
fs.writeFileSync(dest, out.join("\n") + "\n", "utf8");
process.stdout.write("Wrote " + dest + " (" + rows.length + " factuurregels)\n");
