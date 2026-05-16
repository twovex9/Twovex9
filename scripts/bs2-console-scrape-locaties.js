/* ============================================================================
 * BS2 LOCATIES + KERNTEAM SCRAPER (re-run — vorige scrape ving deze niet)
 * Plak VOLLEDIG in BS2-console (F12) op https://etf.acceptance.besasuite.nl/hr/employees
 *
 * Alleen Professioneel-tab. Lange wacht + 3 scroll-passes zodat de lazy-
 * gerenderde Locaties/Kernteam-secties volledig laden. Downloadt
 * `bs2-locaties.json`. Duurt ~7-9 min. Voortgang in console. Niet wegklikken.
 * ==========================================================================*/
(async () => {
  const token = (() => { for (const k of Object.keys(localStorage)) { if (k.includes('access')) { const v = localStorage.getItem(k); if (v && v.length > 100) return v; } } return null; })();
  const h = { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } };
  const BASE = 'https://api.etf.acceptance.besasuite.nl';
  const r = await fetch(`${BASE}/api/employees?limit=200`, h);
  const list = ((await r.json()).data || []).map(e => ({ id: e.id, email: (e.email || '').toLowerCase(), name: e.name }));
  console.log(`%cLocaties-scraper: ${list.length} medewerkers`, 'color:#2563eb;font-weight:bold');

  const app = document.querySelector('#app').__vue_app__;
  const router = app.config.globalProperties.$router;
  const sleep = ms => new Promise(res => setTimeout(res, ms));

  async function scrollPasses() {
    for (let i = 0; i < 3; i++) {
      window.scrollTo(0, document.body.scrollHeight);
      await sleep(900);
      window.scrollTo(0, document.body.scrollHeight / 2);
      await sleep(500);
    }
    window.scrollTo(0, 0);
    await sleep(400);
  }

  // Verzamel per sectie-heading de aangevinkte checkbox-teksten
  function collectChecked() {
    const bySection = {};
    let section = '';
    for (const el of document.querySelectorAll('*')) {
      if (/^H[1-6]$/.test(el.tagName)) {
        const t = el.textContent.trim();
        if (t && t.length < 40) { section = t; if (!bySection[section]) bySection[section] = []; }
      }
      if (el.tagName === 'BUTTON' && el.getAttribute('role') === 'checkbox' && el.getAttribute('data-state') === 'checked') {
        // tekst van de rij (locatie-naam) — neem dichtstbijzijnde label/li/tr-tekst
        let txt = '';
        const row = el.closest('label, li, tr, [class*="row"], [class*="item"]');
        if (row) txt = row.textContent.trim();
        if (!txt) { const sib = el.nextElementSibling || el.parentElement?.nextElementSibling; if (sib) txt = sib.textContent.trim(); }
        txt = txt.replace(/\s+/g, ' ').substring(0, 50).trim();
        if (txt && bySection[section]) bySection[section].push(txt);
      }
    }
    return bySection;
  }

  const results = [];
  let idx = 0;
  for (const emp of list) {
    idx++;
    const rec = { id: emp.id, email: emp.email, name: emp.name, locaties: [], kernteam: '' };
    try {
      await router.push(`/hr/employees/${emp.id}/professional`);
      await sleep(4000);            // ruime tijd voor API + Vue lazy render
      await scrollPasses();         // 3 scroll-passes
      await sleep(800);
      const sec = collectChecked();
      // Zoek secties op naam (case-insensitive substring)
      for (const [name, vals] of Object.entries(sec)) {
        const low = name.toLowerCase();
        if (low.includes('locatie') && !low.includes('kernteam')) {
          rec.locaties = [...new Set(vals)];
        }
        if (low.includes('kernteam')) {
          if (vals.length) rec.kernteam = vals[0];
        }
      }
      // Fallback: als 'Locaties' leeg maar er is een sectie met locatie-achtige namen
    } catch (e) { rec.error = e.message; }
    results.push(rec);
    if (idx % 5 === 0) console.log(`%c  ... ${idx}/${list.length} (${emp.name}) loc=${rec.locaties.length} kern="${rec.kernteam}"`, 'color:#16a34a');
  }

  const blob = new Blob([JSON.stringify(results)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'bs2-locaties.json'; a.style.display = 'none';
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  const withLoc = results.filter(x => x.locaties.length > 0).length;
  const withKern = results.filter(x => x.kernteam).length;
  console.log(`%cKLAAR — ${results.length} gescraped. Met locaties: ${withLoc}, met kernteam: ${withKern}. bs2-locaties.json gedownload.`, 'color:#2563eb;font-weight:bold;font-size:14px');
})();
