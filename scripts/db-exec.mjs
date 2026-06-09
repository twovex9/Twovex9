#!/usr/bin/env node
/**
 * db-exec.mjs — voer willekeurige SQL (incl. DDL: policies/RLS/tabellen) uit op het
 * PRODUCTIE-project ukjflilnhigozfoxowmj, ZONDER de Supabase-dashboard SQL-editor.
 *
 * Waarom: de service-key (REST/PostgREST) kan GEEN DDL. De Supabase-MCP wijst naar het
 * OUDE project. Daarom liep elke schema-/RLS-wijziging vast op "user moet handmatig SQL
 * plakken". Dit script lost dat permanent op via de Supabase Management API.
 *
 * Vereist EENMALIG in scripts/.env (gitignored):
 *   SUPABASE_ACCESS_TOKEN=sbp_xxxxxxxx   (Personal Access Token,
 *     https://supabase.com/dashboard/account/tokens → "Generate new token")
 *   SUPABASE_PROJECT_REF=ukjflilnhigozfoxowmj   (optioneel; default hieronder)
 *
 * Alternatief (als je liever een directe DB-connectie geeft):
 *   SUPABASE_DB_URL=postgresql://postgres.<ref>:<wachtwoord>@aws-0-<regio>.pooler.supabase.com:6543/postgres
 *   → dan gebruikt dit script de `pg`-driver (npm i pg) i.p.v. de Management API.
 *
 * Gebruik:
 *   node scripts/db-exec.mjs "select count(*) from public.clienten;"
 *   node scripts/db-exec.mjs --file path/naar/migratie.sql
 *   node scripts/db-exec.mjs --check        # test alleen of de toegang werkt (select 1)
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = {};
try {
  readFileSync(resolve(__dirname, ".env"), "utf8").split(/\r?\n/).forEach((line) => {
    const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2];
  });
} catch (e) { /* .env optioneel */ }

const REF = env.SUPABASE_PROJECT_REF || "ukjflilnhigozfoxowmj";
const PAT = env.SUPABASE_ACCESS_TOKEN;
const DB_URL = env.SUPABASE_DB_URL;

const args = process.argv.slice(2);
let sql = "";
if (args[0] === "--check") sql = "select 1 as ok;";
else if (args[0] === "--file") sql = readFileSync(resolve(process.cwd(), args[1]), "utf8");
else sql = args.join(" ");
if (!sql.trim()) { console.error("Geen SQL meegegeven. Gebruik: node scripts/db-exec.mjs \"<sql>\"  |  --file <pad>  |  --check"); process.exit(1); }

async function viaManagementApi() {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await r.text();
  if (!r.ok) { console.error(`Management API ${r.status}: ${text}`); process.exit(1); }
  let out; try { out = JSON.parse(text); } catch { out = text; }
  console.log(typeof out === "string" ? out : JSON.stringify(out, null, 2));
}

async function viaPg() {
  let pg;
  try { pg = (await import("pg")).default; }
  catch { console.error("SUPABASE_DB_URL gezet maar 'pg' ontbreekt → run: npm i pg"); process.exit(1); }
  const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try { const res = await client.query(sql); console.log(JSON.stringify(res.rows ?? res, null, 2)); }
  finally { await client.end(); }
}

if (PAT) {
  await viaManagementApi();
} else if (DB_URL) {
  await viaPg();
} else {
  console.error(
    "Geen DDL-credential gevonden in scripts/.env.\n" +
    "Voeg EEN van beide toe:\n" +
    "  SUPABASE_ACCESS_TOKEN=sbp_...   (https://supabase.com/dashboard/account/tokens)\n" +
    "  SUPABASE_DB_URL=postgresql://postgres.<ref>:<wachtwoord>@...pooler.supabase.com:6543/postgres\n" +
    "Daarna: node scripts/db-exec.mjs --check"
  );
  process.exit(2);
}
