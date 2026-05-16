/* ============================================================================
 * BS2 DOM-EXTRAS SCRAPER — plak dit volledig in de BS2-browserconsole (F12)
 * terwijl je op https://etf.acceptance.besasuite.nl/hr/employees bent.
 *
 * Loopt automatisch door ALLE medewerkers, scrapet de Details/Professioneel/
 * Opleiding-tabs (velden zonder API), en downloadt `bs2-99-extras.json`.
 * Voortgang verschijnt in de console. Duurt ~5-8 min. Niet wegklikken.
 * ==========================================================================*/
(async () => {
  const token = (() => { for (const k of Object.keys(localStorage)) { if (k.includes('access')) { const v = localStorage.getItem(k); if (v && v.length > 100) return v; } } return null; })();
  const h = { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } };
  const BASE = 'https://api.etf.acceptance.besasuite.nl';

  // 1. Alle medewerker-IDs ophalen
  const r = await fetch(`${BASE}/api/employees?limit=200`, h);
  const list = ((await r.json()).data || []).map(e => ({ id: e.id, email: (e.email || '').toLowerCase(), name: e.name }));
  console.log(`%cBS2-scraper: ${list.length} medewerkers gevonden`, 'color:#2563eb;font-weight:bold');

  const app = document.querySelector('#app').__vue_app__;
  const router = app.config.globalProperties.$router;
  const sleep = ms => new Promise(res => setTimeout(res, ms));

  function scrapeInputsBySection() {
    const out = {};
    let section = '';
    for (const el of document.querySelectorAll('*')) {
      if (/^H[1-6]$/.test(el.tagName)) { const t = el.textContent.trim(); if (t && t.length < 50) section = t; }
      if (el.tagName === 'INPUT' && !['hidden', 'search', 'checkbox', 'radio'].includes(el.type)) {
        const id = el.id;
        let lbl = id ? (document.querySelector(`label[for="${id}"]`)?.textContent.trim() || '') : '';
        if (!lbl) { const p = el.closest('label'); if (p) lbl = p.textContent.trim(); }
        if (lbl) out[`${section}|${lbl}`] = el.value || '';
      }
      if (el.tagName === 'BUTTON' && el.getAttribute('role') === 'checkbox') {
        const al = el.getAttribute('aria-label') || el.closest('label,li,div,tr')?.textContent?.trim().substring(0, 40);
        out[`CB|${section}|${al}`] = el.getAttribute('data-state');
      }
    }
    return out;
  }

  const results = [];
  let idx = 0;
  for (const emp of list) {
    idx++;
    const rec = { id: emp.id, email: emp.email, name: emp.name, details: {}, professional: {}, education: {} };
    try {
      await router.push(`/hr/employees/${emp.id}/details`); await sleep(2600);
      window.scrollTo(0, document.body.scrollHeight); await sleep(500); window.scrollTo(0, 0); await sleep(300);
      rec.details = scrapeInputsBySection();

      await router.push(`/hr/employees/${emp.id}/professional`); await sleep(2600);
      window.scrollTo(0, document.body.scrollHeight); await sleep(700); window.scrollTo(0, 0); await sleep(300);
      rec.professional = scrapeInputsBySection();
      // Locaties + Kernteam: checked checkboxes met tekst
      const locs = [], kern = [];
      let sec = '';
      for (const el of document.querySelectorAll('*')) {
        if (/^H[1-6]$/.test(el.tagName)) { const t = el.textContent.trim(); if (t && t.length < 40) sec = t; }
        if (el.tagName === 'BUTTON' && el.getAttribute('role') === 'checkbox' && el.getAttribute('data-state') === 'checked') {
          const txt = el.closest('label,li,div,tr')?.textContent?.trim().substring(0, 40) || '';
          if (/locatie/i.test(sec)) locs.push(txt);
          if (/kernteam/i.test(sec)) kern.push(txt);
        }
      }
      rec.professional._locaties = locs;
      rec.professional._kernteam = kern;

      await router.push(`/hr/employees/${emp.id}/education`); await sleep(2400);
      window.scrollTo(0, document.body.scrollHeight); await sleep(600); window.scrollTo(0, 0); await sleep(300);
      rec.education = scrapeInputsBySection();
    } catch (e) { rec.error = e.message; }
    results.push(rec);
    if (idx % 5 === 0) console.log(`%c  ... ${idx}/${list.length} gescraped (${emp.name})`, 'color:#16a34a');
  }

  // Download JSON
  const blob = new Blob([JSON.stringify(results)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'bs2-99-extras.json'; a.style.display = 'none';
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  console.log(`%cKLAAR — ${results.length} medewerkers gescraped. bs2-99-extras.json gedownload.`, 'color:#2563eb;font-weight:bold;font-size:14px');
})();
