/**
 * Eénmalig: leest scripts/besc-bulk-pipe.txt, schrijft ../beschikkingen-besc-bulk.js
 * Run: node scripts/emit-besc-bulk.cjs
 */
var fs = require("fs");
var path = require("path");
var p = path.join(__dirname, "besc-bulk-pipe.txt");
var raw = fs.readFileSync(p, "utf8");
var lines = raw.split(/\r?\n/).filter(function (L) { return L.trim() !== ""; });
if (lines.length === 0) {
  process.stderr.write("no lines\n");
  process.exit(1);
}
var rows = lines.map(function (L, i) {
  var parts = L.split("|");
  if (parts.length < 12) {
    throw new Error("line " + (i + 1) + " bad field count: " + parts.length);
  }
  function parseDutchNum(s) {
    s = String(s == null ? "" : s).trim();
    if (s === "" || s === "-") return 0;
    if (s.indexOf(",") >= 0) {
      return parseFloat(s.replace(/\./g, "").replace(/,/g, "."), 10) || 0;
    }
    return parseFloat(s, 10) || 0;
  }
  var t = {
    n: parseInt(parts[0], 10) || 0,
    nm: parts[1],
    zk: parts[2],
    f: parts[3],
    s: (parts[4] || "").trim(),
    e: (parts[5] || "").trim(),
    t: parts[6],
    u: parts[7],
    tlm: parseDutchNum(parts[8]),
    nng: parseDutchNum(parts[9]),
    dm: parts[10],
    p: parts[11]
  };
  t.t = parseDutchNum(t.t);
  if (parts[12] != null && String(parts[12]).trim() !== "") {
    t.lbl = String(parts[12]).trim();
  }
  return t;
});
var out = [];
out.push("/** Geïmporteerd uit scripts/besc-bulk-pipe.txt; niet handmatig bewerken — bron aanpassen en `node scripts/emit-besc-bulk.cjs` draaien. */");
out.push("(function (g) {");
out.push("  \"use strict\";");
out.push("  g.BESC_BULK_DATA_VER = \"2\";");
out.push("  g.BESA_BESC = " + JSON.stringify(rows) + ";");
out.push("})(typeof window !== \"undefined\" ? window : this);");
var dest = path.join(__dirname, "..", "beschikkingen-besc-bulk.js");
fs.writeFileSync(dest, out.join("\n") + "\n", "utf8");
process.stdout.write("Wrote " + dest + " (" + rows.length + " rijen)\n");
