#!/usr/bin/env node
/**
 * apply-migrations.mjs — pas alle (of één) migratie(s) uit supabase/migrations/
 * toe op PRODUCTIE via de Management API (zelfde route als db-exec.mjs). G58.
 *
 * Migraties in deze repo zijn idempotent (create or replace / if not exists /
 * drop policy if exists), dus herhaald draaien is veilig.
 *
 * Gebruik:
 *   node scripts/apply-migrations.mjs --list            # toon volgorde
 *   node scripts/apply-migrations.mjs --all             # alles, alfabetisch
 *   node scripts/apply-migrations.mjs <bestand.sql>     # één migratie
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = {};
try {
  readFileSync(resolve(__dirname, ".env"), "utf8").split(/\r?\n/).forEach((line) => {
    const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2];
  });
} catch { /* */ }

const REF = env.SUPABASE_PROJECT_REF || "ukjflilnhigozfoxowmj";
const PAT = env.SUPABASE_ACCESS_TOKEN;
if (!PAT) { console.error("SUPABASE_ACCESS_TOKEN ontbreekt in scripts/.env"); process.exit(2); }

const MIG_DIR = resolve(__dirname, "..", "supabase", "migrations");
const files = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).sort();

async function runSql(sql, label) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await r.text();
  if (!r.ok) { console.error(`✗ ${label}: ${r.status} ${text.slice(0, 400)}`); return false; }
  console.log(`✓ ${label}`);
  return true;
}

const args = process.argv.slice(2);
if (args[0] === "--list" || args.length === 0) {
  console.log(files.join("\n"));
} else if (args[0] === "--all") {
  let ok = 0, fail = 0;
  for (const f of files) {
    const sql = readFileSync(join(MIG_DIR, f), "utf8");
    (await runSql(sql, f)) ? ok++ : fail++;
  }
  console.log(`\nKlaar: ${ok} OK, ${fail} mislukt.`);
  if (fail) process.exit(1);
} else {
  const f = args[0].replace(/^.*[\\/]/, "");
  const sql = readFileSync(join(MIG_DIR, f), "utf8");
  if (!(await runSql(sql, f))) process.exit(1);
}
