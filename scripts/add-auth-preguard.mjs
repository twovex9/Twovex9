/* add-auth-preguard.mjs — voorkomt de ~3s "flits" van beschermde inhoud
 * vóór auth-guard async de sessie heeft gecheckt.
 *
 * Voegt als ALLEREERSTE in <head> een synchrone snippet toe die, ALLEEN
 * wanneer er aantoonbaar GEEN sessie-token is (localStorage['sb-ff-auth']
 * ontbreekt), direct (vóór de paint) naar /login redirect. Token aanwezig
 * -> niets doen (auth-guard's voorzichtige async flow + Supabase
 * autoRefresh blijven volledig intact -> geen valse logout/loop).
 *
 * NIET op login.html (zou een loop geven). Idempotent; alleen *.html.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MARKER = "ff-auth-preguard";

const SNIPPET =
  `<script>/*${MARKER}*/(function(){try{` +
  `var p=location.pathname,seg=(p.split('/').filter(Boolean).pop()||'');` +
  `if(seg==='login'||seg==='login.html')return;` +
  `if(!localStorage.getItem('sb-ff-auth')){` +
  `location.replace('login?next='+encodeURIComponent(p+location.search+location.hash));}` +
  `}catch(e){}})();</script>`;

let patched = 0;
const skipped = [];

for (const name of readdirSync(ROOT).filter((f) => f.toLowerCase().endsWith(".html"))) {
  if (name.toLowerCase() === "login.html") { skipped.push(name + " (loginpagina)"); continue; }
  const path = join(ROOT, name);
  const src = readFileSync(path, "utf8");
  if (src.includes(MARKER)) { skipped.push(name + " (al gepatcht)"); continue; }
  const m = /<head\b[^>]*>/i.exec(src);
  if (!m) { skipped.push(name + " (geen <head>)"); continue; }
  const at = m.index + m[0].length;
  const out = src.slice(0, at) + "\n  " + SNIPPET + src.slice(at);
  writeFileSync(path, out, "utf8");
  patched++;
}

console.log(`Auth-preguard toegevoegd: ${patched} pagina's. Overgeslagen: ${skipped.join(", ") || "geen"}`);
