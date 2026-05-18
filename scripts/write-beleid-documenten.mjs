#!/usr/bin/env node
/**
 * Importeer de read-only-gescrapete BS2-PRODUCTIE Beleid-documenten naar BS1.
 *
 * Bron (lokaal, door scripts/fetch-bs2-documents.mjs gemaakt):
 *   scripts/_bs2-documents/bs2-documents.json  + de <naam>.pdf bestanden.
 * Doel: tabel public.beleid_documenten + Storage-bucket 'beleid-documenten'.
 * APART van het bestaande public.beleidsdocumenten / beleid.html — die
 * worden NIET aangeraakt.
 *
 *   node --env-file=scripts/.env scripts/write-beleid-documenten.mjs
 *
 * Niet-destructief & idempotent: Storage-upload met x-upsert, rij-upsert op
 * id. Praat ALLEEN met Supabase (service_role) + leest lokale bestanden —
 * geen enkele call naar BS2.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

console.log("=== BS1 import: beleid_documenten ===");
console.log("Node:", process.version, "| cwd:", process.cwd());

if (typeof fetch !== "function") { console.error("FOUT: Node 18+ nodig (geen global fetch). Versie: " + process.version); process.exit(1); }

const SUPABASE_URL = "https://boscwvojcggkbdxhlfys.supabase.co";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
console.log("SUPABASE_SERVICE_ROLE_KEY:", KEY ? "aanwezig (len " + KEY.length + ")" : "ONTBREEKT");
if (!KEY) { console.error("FOUT: SUPABASE_SERVICE_ROLE_KEY ontbreekt. Draai met:  node --env-file=scripts/.env scripts/write-beleid-documenten.mjs"); process.exit(1); }

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "_bs2-documents");
const SRC = path.join(DIR, "bs2-documents.json");
console.log("Bron-map:", DIR);
console.log("bs2-documents.json bestaat:", fs.existsSync(SRC));
if (!fs.existsSync(SRC)) { console.error("FOUT: " + SRC + " niet gevonden. Draai eerst:  node scripts/fetch-bs2-documents.mjs"); process.exit(1); }
try {
  const pdfs = fs.readdirSync(DIR).filter((f) => /\.(pdf|docx?|xlsx?)$/i.test(f));
  console.log("Lokale bestanden in map:", pdfs.length);
} catch (e) { /* */ }

const BUCKET = "beleid-documenten";
const TABLE = "beleid_documenten";

async function must(resOrP, what) {
  const res = await resOrP;
  if (!res.ok) { const t = await res.text().catch(() => ""); throw new Error(what + " → HTTP " + res.status + " " + t.slice(0, 500)); }
  return res;
}
function isoDate(v) { const m = (v || "").toString().match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; }
function num(v) { return v == null || v === "" || isNaN(+v) ? null : +v; }
function encPath(p) { return p.split("/").map(encodeURIComponent).join("/"); }

async function main() {
  const root = JSON.parse(fs.readFileSync(SRC, "utf8"));
  const E = (root && root.documents) || [];
  console.log(`\nGeladen: ${E.length} BS2-beleid-documenten`);
  if (!E.length) { console.error("FOUT: 0 documenten in bs2-documents.json."); process.exit(1); }

  let up = 0, err = 0;
  for (let i = 0; i < E.length; i++) {
    const r = E[i];
    const f = r.file || {};
    const local = r.__file && r.__file.local;
    try {
      let storagePath = null;
      if (local) {
        const fp = path.join(DIR, local);
        if (fs.existsSync(fp)) {
          const bytes = fs.readFileSync(fp);
          storagePath = `${r.id}/${local}`;
          await must(
            fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encPath(storagePath)}`, {
              method: "POST",
              headers: {
                apikey: KEY, Authorization: "Bearer " + KEY,
                "Content-Type": (f.extension || "").toLowerCase() === "pdf" ? "application/pdf" : "application/octet-stream",
                "x-upsert": "true",
              },
              body: bytes,
            }),
            "storage upload " + storagePath
          );
        } else { console.log(`  ⚠ lokaal bestand ontbreekt: ${local}`); }
      }
      const rowObj = {
        id: r.id,
        name: r.name || "",
        type: r.type || null,
        expiration_date: isoDate(r.expiration_date),
        contract_type: r.contract_type || null,
        is_flexible: typeof r.is_flexible === "boolean" ? r.is_flexible : null,
        flexible_type: r.flexible_type || null,
        flexible_min: num(r.flexible_min),
        flexible_max: num(r.flexible_max),
        contract_end_date: isoDate(r.contract_end_date),
        bs2_created_at: r.created_at || null,
        bs2_updated_at: r.updated_at || null,
        bs2_deleted_at: r.deleted_at || null,
        file_id: f.id || null,
        file_name: f.name || null,
        file_extension: f.extension || null,
        file_path: f.path || null,
        file_size: num(f.size),
        storage_path: storagePath,
        archived: false,
        laatst_gewijzigd: new Date().toISOString(),
        data: { bs2_id: r.id, bs2_scrape: r, bs2_scrape_at: root.scraped_at || new Date().toISOString() },
      };
      await must(
        fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?on_conflict=id`, {
          method: "POST",
          headers: { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify([rowObj]),
        }),
        "upsert rij " + r.id
      );
      up++;
      console.log(`  [${i + 1}/${E.length}] ✔ ${r.name}${storagePath ? "  → " + BUCKET + "/" + storagePath : "  (zonder bestand)"}`);
    } catch (e) {
      err++; console.log(`  [${i + 1}/${E.length}] ✖ ${r.name}: ${e.message}`);
    }
  }

  const cnt = await must(
    fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?select=id`, { headers: { apikey: KEY, Authorization: "Bearer " + KEY, Prefer: "count=exact", Range: "0-0" } }),
    "count " + TABLE
  );
  console.log(`\n=== EINDREPORT ===`);
  console.log(`Bron-docs: ${E.length} | geüpsert: ${up} | errors: ${err}`);
  console.log(`Supabase ${TABLE} count: ${cnt.headers.get("content-range")}`);
  console.log(`PDF's in Storage-bucket '${BUCKET}'. data.bs2_scrape = 100% ruw.`);
  console.log(`public.beleidsdocumenten / beleid.html NIET aangeraakt.`);
}

main().catch((e) => { console.error("ONVERWACHTE FOUT:", e && e.stack || e); process.exit(1); });
