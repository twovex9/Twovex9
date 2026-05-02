/**
 * Schrijft facturen-bulk.js met 956 factuurregels (vaste, reproduceerbare seed).
 * Eerste 18 = bestaand demo; rest = generatie o.b.v. 85 cliënten uit clienten-data.
 * Run: node scripts/seed-facturen-956.cjs
 */
var fs = require("fs");
var path = require("path");

var BESCH = [
  "Gecombineerd", "Verblijf en behandeling", "ambulant en verblijf", "fasewonen", "fasehuis",
  "verblijf en behandeling", "verblijf vanaf 7 november", "WLZ", "Ambulant", "Fasewonen", "verblijf"
];
var maanden = [
  "januari", "februari", "maart", "april", "mei", "juni",
  "juli", "augustus", "september", "oktober", "november", "december"
];
var dagenInMaand = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function simpleHash(s) {
  s = String(s);
  var h = 0;
  for (var j = 0; j < s.length; j += 1) h = (Math.imul(31, h) + s.charCodeAt(j)) | 0;
  return Math.abs(h);
}

function fmtEurNl(cents) {
  var n = Math.max(0, Math.round(cents)) / 100;
  var fixed = n.toFixed(2);
  var parts = fixed.split(".");
  var intp = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return "€ " + intp + "," + parts[1];
}

/** [voornaam, achternaam, nummer] — zelfde volgorde als clienten-data.js RAW */
var RAW = [
  ["Jalaysa", "Jansen", 342], ["Lisanne", "de Zeeuw", 341], ["Arsalan", "Koula", 337],
  ["Ronique", "Thakoer", 221], ["Haifaa", "Alnakshbandi", 339], ["Jordy", "Lont", 326],
  ["Romano", "Leone", 335], ["Bella", "van Meurs", 333], ["Dylaila", "Birney", 327],
  ["Maik", "Meijerink", 328], ["Dana", "Ligthart", 330], ["Dano", "de Wagt", 331],
  ["Kim", "Duinhoven", 323], ["Nadia", "Trela", 322], ["Oskar", "Delendowski", 321],
  ["Gianluca", "Frangiamore de Sola", 324], ["Divano", "Vrij", 320], ["Elona", "van Milligen", 319],
  ["Destiny", "Boot", 318], ["Shardely", "Eybrecht", 317], ["Sara", "Kapli", 313],
  ["Tshayren", "Landveld", 315], ["Nikki", "Boekel", 216], ["Dylan", "Kauffman", 308],
  ["Iris", "Brouwer", 311], ["Annabel", "Dikmans", 90], ["Sara", "Ali", 209],
  ["Lucas", "Kortenhoeven", 261], ["Neshanti", "di Perna", 108], ["Storm", "Kueter", 297],
  ["Roma", "Baltus", 152], ["Nouska", "Westerbeek", 198], ["Ricardo", "Rens", 267],
  ["Donique", "de Nijs", 204], ["Grace", "de Moor", 301], ["Lotte", "Schuiling", 292],
  ["Danique", "Rietveld", 309], ["Nora", "Halbesma", 176], ["Mitch", "Kloosterman", 283],
  ["Joeliza", "van den Dool", 181], ["Jason", "Beltzer", 21], ["Albina", "Zeneli", 246],
  ["Elize", "Jongebloed", 279], ["Noëlla", "Duijvestijn", 172], ["Jay", "Stevens", 171],
  ["Danielle", "Lamping", 275], ["Eliza", "Zwart", 293], ["Roël", "Spiering", 259],
  ["Cloe", "Brown", 165], ["Jay Arnold", "Buter", 268], ["Jorgia", "Schoenmaker", 291],
  ["Colin", "Wijngaard", 281], ["Silas", "Breederveld", 228], ["Deborah", "van den Eijnden", 290],
  ["Dion", "Martis Abukar", 276], ["Jamey", "Hofman", 85], ["Manaf", "Ghallab", 300],
  ["Elin", "Verburg", 284], ["Danischa", "de Vilder", 177], ["Dries", "Dekker", 12],
  ["Kiyaro", "Lambert", 269], ["Phobek", "Mityaniq", 199], ["Linda", "Otto", 196],
  ["Nino", "Joosten", 197], ["Raymond", "Ader", 184], ["Ahmet", "Kat", 203],
  ["Tycho", "Kauffman", 250], ["Oliver", "Schoenmakers", 234], ["Shufrandly", "Faries", 103],
  ["Sayed", "Danish", 253], ["Tamaika", "Cooks", 225], ["Mahesh", "Don", 237],
  ["Denisha", "Wortel", 178], ["Shadena", "Bauman", 206], ["Sara", "Narouz", 302],
  ["Mitchel", "Heijm", 58], ["Pelle", "van Stee", 278], ["Joyce", "Voetel", 188],
  ["Diboya", "Boerlijst", 235], ["Jira", "Tharwarmporn", 200]
];

var DEMO_18 = [
  { fn: "20260026", besch: "Gecombineerd", client: "Silas Breederveld", nr: "228", per: "1 maart 2026 - 31 maart 2026", beta: "-", st: "Gedeclareerd en in behandeling", bedr: "€ 13.373,00" },
  { fn: "20260023", besch: "Verblijf en behandeling", client: "Denisha Wortel", nr: "178", per: "1 maart 2026 - 31 maart 2026", beta: "-", st: "Gedeclareerd en in behandeling", bedr: "€ 6.732,00" },
  { fn: "20260027", besch: "ambulant en verblijf", client: "Bella van Meurs", nr: "333", per: "1 maart 2026 - 31 maart 2026", beta: "-", st: "Gedeclareerd en in behandeling", bedr: "€ 79.512,83" },
  { fn: "20260028", besch: "Gecombineerd", client: "Oskar Delendowski", nr: "321", per: "1 maart 2026 - 31 maart 2026", beta: "-", st: "Gedeclareerd en in behandeling", bedr: "€ 29.496,92" },
  { fn: "20260025", besch: "fasewonen", client: "Neshanti di Perna", nr: "108", per: "1 maart 2026 - 31 maart 2026", beta: "-", st: "Gedeclareerd en in behandeling", bedr: "€ 6.732,00" },
  { fn: "20260024", besch: "fasewonen", client: "Tycho Kauffman", nr: "250", per: "1 maart 2026 - 31 maart 2026", beta: "-", st: "Gedeclareerd en in behandeling", bedr: "€ 6.732,00" },
  { fn: "20260022", besch: "fasehuis", client: "Dries Dekker", nr: "12", per: "1 maart 2026 - 31 maart 2026", beta: "-", st: "Gedeclareerd en in behandeling", bedr: "€ 6.732,00" },
  { fn: "20260029", besch: "Gecombineerd", client: "Ricardo Rens", nr: "267", per: "1 maart 2026 - 31 maart 2026", beta: "-", st: "Gedeclareerd en in behandeling", bedr: "€ 17.550,05" },
  { fn: "1645", besch: "Gecombineerd", client: "Nadia Trela", nr: "322", per: "4 november 2025 - 30 november 2025", beta: "10 apr 2026", st: "Betaald", bedr: "€ 85,00" },
  { fn: "1645", besch: "Gecombineerd", client: "Nadia Trela", nr: "322", per: "1 december 2025 - 31 december 2025", beta: "10 apr 2026", st: "Betaald", bedr: "€ 85,00" },
  { fn: "1641", besch: "verblijf en behandeling", client: "Divano Vrij", nr: "320", per: "1 november 2025 - 30 november 2025", beta: "10 apr 2026", st: "Betaald", bedr: "€ 92,64" },
  { fn: "1641", besch: "verblijf en behandeling", client: "Divano Vrij", nr: "320", per: "23 oktober 2025 - 31 oktober 2025", beta: "10 apr 2026", st: "Betaald", bedr: "€ 92,64" },
  { fn: "1641", besch: "verblijf en behandeling", client: "Divano Vrij", nr: "320", per: "1 december 2025 - 31 december 2025", beta: "10 apr 2026", st: "Betaald", bedr: "€ 92,64" },
  { fn: "1643", besch: "verblijf vanaf 7 november", client: "Nadia Trela", nr: "322", per: "1 december 2025 - 31 december 2025", beta: "10 apr 2026", st: "Betaald", bedr: "€ 11.093,04" },
  { fn: "1643", besch: "verblijf vanaf 7 november", client: "Nadia Trela", nr: "322", per: "4 november 2025 - 30 november 2025", beta: "10 apr 2026", st: "Betaald", bedr: "€ 9.661,68" },
  { fn: "20260016", besch: "Gecombineerd", client: "Silas Breederveld", nr: "228", per: "1 februari 2026 - 28 februari 2026", beta: "10 apr 2026", st: "Betaald", bedr: "€ 10.698,40" },
  { fn: "20260018", besch: "Gecombineerd", client: "Ricardo Rens", nr: "267", per: "1 februari 2026 - 28 februari 2026", beta: "10 apr 2026", st: "Betaald", bedr: "€ 14.040,04" },
  { fn: "20250006", besch: "Verblijf en behandeling", client: "Tamaika Cooks", nr: "225", per: "1 januari 2025 - 31 januari 2025", beta: "19 sep 2025", st: "Betaald", bedr: "€ 6.103,48" }
];

var TARGET = 956;
var rows = [];
for (var d = 0; d < DEMO_18.length; d += 1) {
  rows.push(DEMO_18[d]);
}
for (var i = rows.length; i < TARGET; i += 1) {
  var tup = RAW[i % RAW.length];
  var vo = tup[0];
  var ac = tup[1];
  var nrm = String(tup[2]);
  var vns = (vo + " " + ac).replace(/\s+/g, " ").trim();
  var besch = BESCH[i % BESCH.length];
  var y = 2020 + (i * 2 + 1) % 6;
  var m0 = (i * 3) % 12;
  var dH = dagenInMaand[m0];
  if (m0 === 1) dH = y % 4 === 0 ? 29 : 28;
  var per = "1 " + maanden[m0] + " " + y + " - " + dH + " " + maanden[m0] + " " + y;
  var h = simpleHash("besc-fact" + i + nrm);
  var isB = h % 4 === 0;
  var beta = isB ? String(1 + (h % 25)) + " mrt 202" + (5 + (h % 2)) : "-";
  var st = isB ? "Betaald" : "Gedeclareerd en in behandeling";
  var fn = "20" + String(2500000 + (i * 7 + 13) % 8500000).padStart(7, "0");
  var cent = 20000 + (h * 97 + i * 131) % 9900000;
  var bedr = fmtEurNl(cent);
  rows.push({ fn: fn, besch: besch, client: vns, nr: nrm, per: per, beta: beta, st: st, bedr: bedr });
}

if (rows.length !== TARGET) throw new Error("Verwacht " + TARGET + " regels, heb " + rows.length);

var dest = path.join(__dirname, "..", "facturen-bulk.js");
var out = [];
out.push("/** Gegenereerd: node scripts/seed-facturen-956.cjs — bron opnieuw te vullen met o.a. facturen-paste indien je echte plak hebt. */");
out.push("(function (g) {");
out.push("  \"use strict\";");
out.push("  g.FACT_BULK_DATA_VER = \"1\";");
out.push("  g.FACTUREN_BULK = " + JSON.stringify(rows) + ";");
out.push("})(typeof window !== \"undefined\" ? window : this);");
fs.writeFileSync(dest, out.join("\n") + "\n", "utf8");
process.stdout.write("OK: " + dest + " — " + rows.length + " factuurregels\n");
