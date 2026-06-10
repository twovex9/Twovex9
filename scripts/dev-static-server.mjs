#!/usr/bin/env node
/**
 * dev-static-server.mjs — lokale statische server met Vercel-achtige cleanUrls
 * (een pad zonder extensie probeert <pad>.html). Alleen voor lokale verificatie;
 * NIET voor productie (Vercel host de echte site).
 *
 *   node scripts/dev-static-server.mjs            # poort 8099
 *   PORT=9000 node scripts/dev-static-server.mjs
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = process.cwd();
const PORT = Number(process.env.PORT || 8099);
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml",
  ".webp": "image/webp", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json",
  ".woff": "font/woff", ".woff2": "font/woff2",
};

async function tryFile(p) {
  try { const s = await stat(p); if (s.isFile()) return p; } catch { /* */ }
  return null;
}

createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url || "/").split("?")[0].split("#")[0]);
    if (urlPath === "/") urlPath = "/home.html";
    const safe = normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
    let file = join(ROOT, safe);
    let found = await tryFile(file);
    if (!found && !extname(safe)) found = await tryFile(file + ".html"); // cleanUrls
    if (!found) { res.writeHead(404, { "Content-Type": "text/plain" }); res.end("404: " + safe); return; }
    const body = await readFile(found);
    res.writeHead(200, { "Content-Type": MIME[extname(found)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(body);
  } catch (e) {
    res.writeHead(500, { "Content-Type": "text/plain" }); res.end("500: " + (e && e.message || e));
  }
}).listen(PORT, () => console.log(`[dev-static] http://localhost:${PORT}  (root: ${ROOT})`));
