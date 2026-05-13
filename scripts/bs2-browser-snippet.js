/* eslint-disable no-console */
/**
 * BS2 → BS1 data resync — browser-side snippet (Sprint 10 / v2 master-plan S10).
 *
 * GEBRUIK (door user):
 *   1. Open https://etf.acceptance.besasuite.nl/home in Chrome (logged in)
 *   2. Open DevTools → Console (F12 → Console tab)
 *   3. Plak HEEL DEZE FILE in de console + Enter
 *   4. Wacht ~30-60 seconden (progress in console)
 *   5. Browser triggert auto-download: bs2-export-full.json
 *   6. Verplaats bestand naar: besa-suite-etf/scripts/bs2-exports/bs2-export-full.json
 *   7. Run vanuit besa-suite-etf/:
 *        node scripts/bs2-full-import.mjs           (her-importeert alles)
 *        node scripts/bs2-fk-resolve.mjs            (lost FK's op)
 *        node scripts/bs2-fix-client-id.mjs         (gebruikt bewaarde data.bs2_id)
 *
 * Waarom dit via browser console?
 *   BS2 is een Laravel SPA met session-cookie auth. Een Node fetch met alleen
 *   Bearer-token kreeg HTML i.p.v. JSON (zie items 36/38). Vanuit browser
 *   console heeft fetch automatisch session-cookies + CSRF — dus werkt.
 *
 * Output format matcht scripts/bs2-full-import.mjs:
 *   {
 *     fetchedAt: ISO-string,
 *     source: "https://etf.acceptance.besasuite.nl",
 *     data: {
 *       "/api/care-types": [...],
 *       "/api/locations": [...],
 *       ...
 *     }
 *   }
 */
(async () => {
  "use strict";

  const BASE = window.location.origin;
  const EXPECTED_ORIGIN = "https://etf.acceptance.besasuite.nl";
  if (BASE !== EXPECTED_ORIGIN) {
    console.error("[BS2 snippet] Open eerst", EXPECTED_ORIGIN, "in deze tab. Huidige origin =", BASE);
    return;
  }

  // 15 endpoints — gelijk aan mappers[] in bs2-full-import.mjs
  const ENDPOINTS = [
    "/api/care-types",
    "/api/locations",
    "/api/agency",
    "/api/competencies",
    "/api/certifications",
    "/api/municipalities",
    "/api/organizations",
    "/api/salary-scales",
    "/api/incident-categories",
    "/api/employees",
    "/api/clients",
    "/api/dispositions",
    "/api/incidents",
    "/api/invoices",
    "/api/shifts",
  ];

  // Sommige endpoints zijn paginated; we proberen ?per_page=10000 als hint.
  const HEAVY_PAGINATED = new Set([
    "/api/employees", "/api/clients", "/api/dispositions",
    "/api/incidents", "/api/invoices", "/api/shifts",
  ]);

  const CONCURRENCY = 3;
  const results = {};
  const errors = [];

  async function fetchOne(path) {
    const url = HEAVY_PAGINATED.has(path) ? `${path}?per_page=10000` : path;
    const t0 = performance.now();
    try {
      const res = await fetch(BASE + url, {
        method: "GET",
        credentials: "include",
        headers: { "Accept": "application/json" },
      });
      if (!res.ok) {
        errors.push({ path, status: res.status, statusText: res.statusText });
        console.warn(`[BS2 snippet] ❌ ${path} → HTTP ${res.status}`);
        return;
      }
      const ct = res.headers.get("content-type") || "";
      if (!/application\/json/i.test(ct)) {
        const sample = (await res.text()).slice(0, 80);
        errors.push({ path, contentType: ct, sample });
        console.warn(`[BS2 snippet] ❌ ${path} → niet-JSON respons (${ct}): "${sample}"`);
        return;
      }
      const json = await res.json();
      results[path] = json;
      const arr = Array.isArray(json) ? json : (Array.isArray(json?.data) ? json.data : []);
      const ms = Math.round(performance.now() - t0);
      console.log(`[BS2 snippet] ✅ ${path} → ${arr.length} records (${ms}ms)`);
    } catch (err) {
      errors.push({ path, message: String(err && err.message || err) });
      console.warn(`[BS2 snippet] ❌ ${path} → ${err}`);
    }
  }

  // Simple concurrency-limit
  const queue = [...ENDPOINTS];
  async function worker() {
    while (queue.length) {
      const p = queue.shift();
      if (p) await fetchOne(p);
    }
  }
  console.log(`[BS2 snippet] Start — ${ENDPOINTS.length} endpoints, concurrency=${CONCURRENCY}`);
  const t0 = performance.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  const totalMs = Math.round(performance.now() - t0);

  // Build output
  const out = {
    fetchedAt: new Date().toISOString(),
    source: BASE,
    snippetVersion: "v2.0-2026-05-13",
    durationMs: totalMs,
    endpointCount: ENDPOINTS.length,
    successCount: Object.keys(results).length,
    errorCount: errors.length,
    errors: errors,
    data: results,
  };

  console.log(`[BS2 snippet] Klaar in ${totalMs}ms. ✅ ${out.successCount}/${ENDPOINTS.length} succes, ❌ ${out.errorCount} errors.`);
  if (errors.length) {
    console.warn("[BS2 snippet] Errors:", errors);
  }

  // Auto-download
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "bs2-export-full.json";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    if (a.parentNode) a.parentNode.removeChild(a);
  }, 1000);

  console.log("[BS2 snippet] Download getriggerd: bs2-export-full.json");
  console.log("[BS2 snippet] Volgende stap:");
  console.log("  1. Verplaats bestand naar besa-suite-etf/scripts/bs2-exports/bs2-export-full.json");
  console.log("  2. cd besa-suite-etf && node scripts/bs2-full-import.mjs");

  // Ook naar window voor inspectie
  window.__bs2Export = out;
  console.log("[BS2 snippet] Ook beschikbaar als: window.__bs2Export");
})();
