/* eslint-disable no-console */
/**
 * v3 Fase G.2 — BS2 user emails scrape snippet
 *
 * Gebruik:
 *   1. Open https://etf.acceptance.besasuite.nl/settings/users in Chrome (ingelogd)
 *   2. Open DevTools → Console (F12)
 *   3. Plak DEZE HELE FILE in console + Enter
 *   4. Wacht ~10s — alle pages worden gefetched
 *   5. Browser downloadt automatisch `bs2-user-emails.json`
 *   6. Plaats bestand in: besa-suite-etf/scripts/bs2-exports/bs2-user-emails.json
 *   7. Run: node scripts/enrich-medewerker-emails.mjs
 *   8. Daarna: node scripts/onboard-bs2-employees.mjs --dry-run
 */
(async () => {
  "use strict";
  const API_BASE = "https://api.etf.acceptance.besasuite.nl/api";
  const PER_PAGE = 100;
  const all = [];
  let page = 1;
  let totalPages = 1;

  // Token uit localStorage
  function getToken() {
    const raw = localStorage.getItem("app.acceptance-etf-access");
    if (!raw) return null;
    try { const p = JSON.parse(raw); return p.token || p.access_token || raw; } catch (e) { return raw; }
  }
  const token = getToken();
  if (!token) {
    console.error("❌ Geen auth-token gevonden. Ben je ingelogd op BS2?");
    return;
  }

  async function fetchPage(p) {
    const r = await fetch(`${API_BASE}/users?page=${p}&limit=${PER_PAGE}`, {
      credentials: "include",
      headers: { Authorization: "Bearer " + token, Accept: "application/json" },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
    return await r.json();
  }

  try {
    const first = await fetchPage(1);
    const items = first.data || first.items || first.users || first;
    if (Array.isArray(items)) all.push(...items);
    totalPages = first.meta?.last_page || first.last_page || Math.ceil((first.total || items.length) / PER_PAGE) || 1;
    console.log(`📥 Page 1/${totalPages} → ${items.length} users`);

    for (let p = 2; p <= totalPages; p++) {
      const pageData = await fetchPage(p);
      const pageItems = pageData.data || pageData.items || pageData.users || pageData;
      if (Array.isArray(pageItems)) all.push(...pageItems);
      console.log(`📥 Page ${p}/${totalPages} → ${pageItems.length} users`);
    }

    // Probeer key-extraction
    const out = all.map((u) => ({
      id: u.id || u.uuid,
      email: u.email || u.email_address || u.username,
      first_name: u.first_name || u.voornaam || u.firstName,
      last_name: u.last_name || u.achternaam || u.lastName,
      full_name: u.full_name || u.name,
      employee_id: u.employee_id || u.employee?.id || u.medewerker_id,
      employee_uuid: u.employee?.uuid || u.medewerker_uuid,
      bs2_status: u.status || u.account_status,
      roles: (u.roles || []).map((r) => r.name || r.naam || r),
    }));

    console.log(`✅ ${out.length} users gefetched`);
    console.log("Sample:", out[0]);

    // Auto-download
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bs2-user-emails.json";
    a.click();
    URL.revokeObjectURL(url);
    console.log("💾 Download getriggerd → bs2-user-emails.json");
    console.log("➡️  Plaats in: besa-suite-etf/scripts/bs2-exports/bs2-user-emails.json");
  } catch (err) {
    console.error("❌ Fout:", err.message || err);
    console.log("ℹ️  Probeer endpoint variants: /users-basic, /admin/users");
  }
})();
