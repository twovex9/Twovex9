#!/usr/bin/env node
/**
 * Analyzes HAR file from BS2 tijdregistratie/urendeclaratie scrape.
 * Extracts /api/ calls, groups by endpoint+method, summarizes payloads.
 *
 * Usage: node scripts/analyze-tijdreg-har.mjs "C:/Users/.../etf.acceptance.besasuite.nl.har"
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, basename } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const harPath = process.argv[2] || "C:/Users/sonck/Downloads/etf.acceptance.besasuite.nl.har";

console.log("=== HAR Analyzer — tijdregistratie scrape ===");
console.log("Reading:", harPath);

const raw = readFileSync(harPath, "utf8");
console.log("Raw size:", (raw.length / 1024).toFixed(0), "KB");

const har = JSON.parse(raw);
const entries = har?.log?.entries || [];
console.log("Total entries:", entries.length);

// Filter only api/ calls — skip static assets, vendor, css, image, font
const apiCalls = entries.filter((e) => {
  const url = e?.request?.url || "";
  if (!url.includes("/api/")) return false;
  if (/\.(css|js|png|jpg|jpeg|gif|svg|woff2?|ttf|eot|ico|map)(\?|$)/.test(url)) return false;
  return true;
});
console.log("API calls (filtered):", apiCalls.length);

// Strip host, get pathname+query
function urlToPath(url) {
  try {
    const u = new URL(url);
    return u.pathname + (u.search || "");
  } catch (e) {
    return url;
  }
}
function urlToPathOnly(url) {
  try { return new URL(url).pathname; } catch (e) { return url.split("?")[0]; }
}

// Normalize URL: replace UUIDs/numeric IDs with {id} for grouping
function normalize(url) {
  return urlToPathOnly(url)
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "/{uuid}")
    .replace(/\/\d{4,}/g, "/{id}");
}

// Group by method + normalized URL
const groups = new Map();
for (const e of apiCalls) {
  const m = e.request.method.toUpperCase();
  const npath = normalize(e.request.url);
  const key = m + " " + npath;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(e);
}

console.log("\n=== UNIQUE ENDPOINTS (method + normalized path) ===");
console.log("Count:", groups.size);

const sortedGroups = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);

// Print summary table
const summary = [];
for (const [key, calls] of sortedGroups) {
  const first = calls[0];
  summary.push({
    endpoint: key,
    count: calls.length,
    statuses: [...new Set(calls.map((c) => c.response.status))].join(","),
    sample_full_url: first.request.url.length > 150 ? first.request.url.slice(0, 150) + "…" : first.request.url,
    has_request_body: calls.some((c) => c.request.postData?.text?.length > 0),
    has_response_body: calls.some((c) => c.response.content?.text?.length > 0),
  });
}

// Write full summary to file
const outDir = resolve(__dirname, "_bs2-tijdreg");
try { writeFileSync(resolve(outDir, "endpoints-summary.json"), JSON.stringify(summary, null, 2)); }
catch (e) {
  // Folder doesn't exist — create
  const { mkdirSync } = await import("node:fs");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "endpoints-summary.json"), JSON.stringify(summary, null, 2));
}

// Print top 30 to console
console.log("\nTop 30 endpoints by call count:");
console.log("Count  Method+Path                                                            Statuses  hasReqBody  hasRespBody");
console.log("-".repeat(140));
for (const s of summary.slice(0, 30)) {
  const ep = s.endpoint.length > 70 ? s.endpoint.slice(0, 70) + "…" : s.endpoint.padEnd(70);
  console.log(
    String(s.count).padStart(5),
    "",
    ep,
    "",
    s.statuses.padEnd(8),
    "",
    s.has_request_body ? "✓        " : "         ",
    s.has_response_body ? "✓" : "",
  );
}

// Filter for write operations (POST/PATCH/PUT/DELETE) — these are most important
const writeOps = summary.filter((s) => /^(POST|PATCH|PUT|DELETE) /.test(s.endpoint));
console.log("\n=== WRITE OPERATIONS (POST/PATCH/PUT/DELETE) — " + writeOps.length + " unique ===");
for (const s of writeOps) {
  console.log(" ", s.endpoint, "(" + s.count + "x, statuses: " + s.statuses + ")");
}

// Now dump full request+response for each write-op and the most interesting GET endpoints
const interesting = [
  ...writeOps,
  ...summary.filter((s) =>
    /\/time-registrations|\/time-registration-labels|\/labels|\/budget|\/hour-declaration|\/monthly-hour|\/dispositions|\/disposition-payments|\/time-locks|\/month-status|\/work-hours|\/employee-absence|\/payroll-statements/i.test(s.endpoint)
  ),
];
const seenKeys = new Set();
const detailedCalls = [];

for (const s of interesting) {
  if (seenKeys.has(s.endpoint)) continue;
  seenKeys.add(s.endpoint);
  const group = groups.get(s.endpoint);
  if (!group) continue;
  // Take up to 2 sample calls per endpoint
  for (const e of group.slice(0, 2)) {
    const respText = e.response?.content?.text || "";
    const reqText = e.request?.postData?.text || "";
    detailedCalls.push({
      method: e.request.method,
      url: e.request.url,
      status: e.response.status,
      reqHeaders: (e.request.headers || []).filter(h => /content-type|authorization/i.test(h.name)).map(h => ({ name: h.name, value: h.name.toLowerCase() === "authorization" ? "[REDACTED Bearer …]" : h.value })),
      reqBody: reqText.length > 4000 ? reqText.slice(0, 4000) + "…[TRUNC]" : reqText,
      respBody: respText.length > 8000 ? respText.slice(0, 8000) + "…[TRUNC]" : respText,
    });
  }
}

writeFileSync(resolve(outDir, "detailed-calls.json"), JSON.stringify(detailedCalls, null, 2));
console.log("\n=== DETAILED CALLS dumped:", detailedCalls.length, "to scripts/_bs2-tijdreg/detailed-calls.json ===");

// Page-load summary (which URLs were visited in BS2)
const pageUrls = new Set();
for (const e of entries) {
  if (e.request.url.includes("/api/")) continue;
  if (e.request.url.endsWith(".html") || (!e.request.url.includes(".") && e.request.url.startsWith("https://etf"))) {
    pageUrls.add(urlToPath(e.request.url));
  }
}
console.log("\n=== BS2 pages visited (estimated):", pageUrls.size);
for (const p of [...pageUrls].sort().slice(0, 50)) console.log("  ", p);

console.log("\n=== DONE — outputs in scripts/_bs2-tijdreg/ ===");
