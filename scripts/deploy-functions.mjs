#!/usr/bin/env node
/**
 * deploy-functions.mjs — deploy Supabase Edge Functions naar PRODUCTIE
 * (ukjflilnhigozfoxowmj) via de Management API, zonder de Supabase CLI.
 *
 * Waarom: de Supabase-MCP wijst naar het OUDE project en de CLI is hier niet
 * ingelogd. De Management-API (zelfde PAT als db-exec.mjs) kan functies
 * deployen via multipart upload van de bronbestanden (G58).
 *
 * Gebruik:
 *   node scripts/deploy-functions.mjs --list                 # huidige functies
 *   node scripts/deploy-functions.mjs <slug>                 # deploy supabase/functions/<slug>/
 *   node scripts/deploy-functions.mjs <slug> --no-verify-jwt # voor cron/webhook-functies
 *   node scripts/deploy-functions.mjs --delete <slug>        # verwijder functie (confirm in CLI)
 *
 * Vereist in scripts/.env: SUPABASE_ACCESS_TOKEN=sbp_...
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
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
const API = `https://api.supabase.com/v1/projects/${REF}/functions`;
const HDR = { Authorization: `Bearer ${PAT}` };

const args = process.argv.slice(2);

async function list() {
  const r = await fetch(API, { headers: HDR });
  const j = await r.json();
  if (!r.ok) { console.error("List mislukt:", JSON.stringify(j)); process.exit(1); }
  console.log(j.map((f) => `${f.slug} | status=${f.status} | verify_jwt=${f.verify_jwt} | v${f.version}`).join("\n"));
}

async function del(slug) {
  const r = await fetch(`${API}/${slug}`, { method: "DELETE", headers: HDR });
  if (!r.ok) { console.error(`Delete ${slug} mislukt (${r.status}):`, await r.text()); process.exit(1); }
  console.log(`Functie '${slug}' verwijderd.`);
}

function collectFiles(dir, base) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...collectFiles(p, base));
    else out.push({ abs: p, rel: relative(base, p).split("\\").join("/") });
  }
  return out;
}

async function deploy(slug, verifyJwt) {
  const fnDir = resolve(__dirname, "..", "supabase", "functions", slug);
  if (!existsSync(join(fnDir, "index.ts"))) {
    console.error(`Geen index.ts in supabase/functions/${slug}/`); process.exit(1);
  }
  const files = collectFiles(fnDir, fnDir);
  const form = new FormData();
  form.append("metadata", JSON.stringify({
    name: slug,
    entrypoint_path: "index.ts",
    verify_jwt: verifyJwt,
  }));
  for (const f of files) {
    const buf = readFileSync(f.abs);
    form.append("file", new Blob([buf], { type: "application/typescript" }), f.rel);
  }
  const r = await fetch(`${API}/deploy?slug=${encodeURIComponent(slug)}`, {
    method: "POST", headers: HDR, body: form,
  });
  const text = await r.text();
  if (!r.ok) { console.error(`Deploy ${slug} mislukt (${r.status}):`, text); process.exit(1); }
  let j; try { j = JSON.parse(text); } catch { j = {}; }
  console.log(`Deploy OK: ${slug} (status=${j.status || "?"}, version=${j.version || "?"}, verify_jwt=${j.verify_jwt})`);
}

if (args[0] === "--list" || args.length === 0) {
  await list();
} else if (args[0] === "--delete") {
  if (!args[1]) { console.error("Gebruik: --delete <slug>"); process.exit(1); }
  await del(args[1]);
} else {
  const slug = args[0];
  const verifyJwt = !args.includes("--no-verify-jwt");
  await deploy(slug, verifyJwt);
}
