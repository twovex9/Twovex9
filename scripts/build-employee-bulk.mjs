/**
 * Plak uit agent-transcript JSONL → employees-bulk.js
 * Uitvoeren: node scripts/build-employee-bulk.mjs [pad/naar.jsonl]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const D = /^\d{1,2}-\d{1,2}-\d{4}$/;
const MONTHS = new Set("januari februari maart april mei juni juli augustus september oktober november december".split(" "));

const defaultJsonl = path.join(
  process.env.USERPROFILE || "C:/Users/sonck",
  ".cursor/projects/c-Users-sonck-Desktop-besa-suite/agent-transcripts/4ddc0ce3-acc4-4469-a195-5fc47a8761df/4ddc0ce3-acc4-4469-a195-5fc47a8761df.jsonl"
);

function isEmail(s) {
  s = (s || "").trim();
  if (!s || !s.includes("@")) return false;
  if (/^https?:\/\//i.test(s)) return false;
  const p = s.split("@");
  if (p.length !== 2) return false;
  return p[1].includes(".");
}

function norm(s) {
  s = (s + "").replace(/\s+/g, " ").trim();
  if (s === "-" || s === "–" || s === "—") return "—";
  return s || "—";
}

function titleMonth(s) {
  const t = (s + "").trim().toLowerCase();
  if (!MONTHS.has(t)) return s;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function isDate(s) {
  return D.test((s + "").trim());
}

function splitPastedText(raw) {
  const L = raw.split(/\r?\n/).map((l) => l.replace(/\t/g, "").trim());
  const out = [];
  for (const l of L) {
    if (!l) continue;
    const m = l.match(/^(\d{1,2}-\d{1,2}-\d{4})\s+([A-Za-zÀ-ÿ].+)$/);
    if (m) out.push(m[1], m[2]);
    else out.push(l);
  }
  return out;
}

function extractPlak(t) {
  const raw = /erkers toevoegen met alle gegeven erbij\s*([\s\S]+?)<\/user_query>/i.exec(t);
  return (raw && raw[1] ? raw[1] : t).replace(/\\n/g, "\n").trim();
}

function findAnchorIndex(r) {
  for (let i = 0; i < r.length - 1; i++) {
    const a = (r[i] + "").trim();
    const b = (r[i + 1] + "").trim();
    if (!/^\d{1,3}$/.test(a)) continue;
    const n = parseInt(a, 10);
    if (n < 1 || n > 20) continue;
    if (b === "Bepaalde tijd" || b === "Onbepaalde tijd" || b === "—" || b === "-") {
      return i;
    }
  }
  return -1;
}

function parseBlock(block) {
  const tel = (block[0] || "—").replace(/[–—]/g, "-");
  const fase = (block[1] || "In dienst").replace(/\s+/g, " ").trim() || "In dienst";
  const dienst = norm(block[2] || "—");
  const r = block.slice(3);
  const j = findAnchorIndex(r);
  if (j < 0) {
    const dats = r.map((x) => (x + "").trim()).filter(isDate);
    return {
      tel, fase, dienstverband: dienst,
      functie: "—", opleiding: "—", werktype: "—",
      startdatum: dats[0] || "—",
      periodiekeMaand: "—",
      eindeContract: dats[1] || (dats.length > 1 ? dats[1] : "—"),
      contracten: "1",
      contracttype: "Onbepaalde tijd",
      uitDienst: "—",
      laatstGewijzigd: dats.length ? dats[dats.length - 1] : "—"
    };
  }
  const pre = r.slice(0, j);
  const post = r.slice(j);
  let f = norm(pre[0] || "—");
  let o = norm(pre[1] || "—");
  let w = norm(pre[2] || "—");
  const extra = pre.slice(3);
  let start = "—", per = "—", eind = "—";
  if (f === "—" && o === "—" && w === "—") {
    for (const x of extra) {
      const t0 = (x + "").trim();
      if (isDate(t0)) { if (start === "—") start = t0; else eind = t0; } else if (MONTHS.has(t0.toLowerCase()) && per === "—") per = titleMonth(t0);
    }
  } else {
    if (f === "—" && o !== "—" && isDate(o)) {
      start = o;
      o = "—";
      if (w !== "—" && MONTHS.has((w + "").toLowerCase())) { per = titleMonth(w); w = "—"; }
    }
    for (const x of extra) {
      const t0 = (x + "").trim();
      if (isDate(t0) && t0 !== start) eind = t0;
    }
  }
  const n = (post[0] + "").trim() || "1";
  const ct0 = (post[1] + "").trim();
  const contracttype = ct0 === "Bepaalde tijd" || ct0 === "Onbepaalde tijd" ? ct0 : ct0 === "—" || ct0 === "-" ? "—" : ct0;
  const rem = post.slice(2);
  const pd = rem.map((x) => (x + "").trim()).filter(isDate);
  let laatst = "—";
  if (pd.length === 1) laatst = pd[0];
  else if (pd.length >= 2) { if (eind === "—") eind = pd[0]; laatst = pd[pd.length - 1]; }
  return { tel, fase, dienstverband: dienst, functie: f, opleiding: o, werktype: w, startdatum: start, periodiekeMaand: per, eindeContract: eind, contracten: n, contracttype, uitDienst: "—", laatstGewijzigd: laatst };
}

const mainJsonl = process.argv[2] || defaultJsonl;
if (!fs.existsSync(mainJsonl)) {
  console.error("Geen jsonl:", mainJsonl);
  process.exit(1);
}
const jline = fs.readFileSync(mainJsonl, "utf8").split("\n").find((L) => L.includes("Abdelmajid") && (L.includes("user") || L.includes("user_query")));
if (!jline) { console.error("Regel met Abdelmajid niet in bestand"); process.exit(1); }
const rec = JSON.parse(jline);
const t = rec.message && rec.message.content && rec.message.content[0] && rec.message.content[0].text;
if (!t) { console.error("Geen text"); process.exit(1); }
const body = extractPlak(t);
const lines = splitPastedText(body);
const emIdx = lines.map((l, i) => (isEmail(l) ? i : -1)).filter((i) => i >= 0);
const rows = [];
let idx = 0;
for (let e = 0; e < emIdx.length; e++) {
  const ei = emIdx[e];
  const e2i = e + 1 < emIdx.length ? emIdx[e + 1] : lines.length;
  if (ei < 2) continue;
  const voornaam = (lines[ei - 2] + "").replace(/\s+/g, " ").trim();
  const achternaam = (lines[ei - 1] + "").replace(/\s+/g, " ").trim();
  const email = (lines[ei] + "").replace(/\s+/g, " ").trim();
  const block = lines.slice(ei + 1, e2i - 2);
  if (block.length < 3) continue;
  const p = parseBlock(block);
  idx += 1;
  rows.push({
    id: `emp-bulk-${String(idx).padStart(4, "0")}`,
    voornaam, achternaam, email,
    tel: p.tel, fase: p.fase, dienstverband: p.dienstverband, functie: p.functie, opleiding: p.opleiding, werktype: p.werktype, startdatum: p.startdatum, periodiekeMaand: p.periodiekeMaand, eindeContract: p.eindeContract, contracten: p.contracten, contracttype: p.contracttype, uitDienst: p.uitDienst, laatstGewijzigd: p.laatstGewijzigd, verjaardag: "—", overigeInfo: `Medewerkernummer ${200 + idx}`, taal: "Nederland", competentie: "—", archived: false
  });
}
const outPath = path.join(__dirname, "..", "employees-bulk.js");
fs.writeFileSync(
  outPath,
  `/* Auto: node scripts/build-employee-bulk.mjs */\nwindow.BESA_EMPLOYEES_BULK = ${JSON.stringify(rows, null, 0)};\n`,
  "utf8"
);
console.log("Opgeslagen", outPath, "medewerkers:", rows.length);
process.exit(0);
