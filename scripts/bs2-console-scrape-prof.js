/* ============================================================================
 * BS2 TOTAAL-CAPTURE SCRAPER  (v3 — garandeert dat NIETS ontsnapt)
 *
 * Aanleiding: veld-voor-veld audit op Samra Akaazoun toonde 5 gaten in v2:
 *   1) Diensttype-specifieke tarieven (tabel, geen <label>)
 *   2) Locaties/Kernteam (alleen Radix gevangen; native checkbox + tekst-mash)
 *   3) Professionele gegevens e-mail/telefoon/IBAN (writer schreef ze niet)
 *   4) Training-datums (BHV 05-07-2024 stond náást de checkbox)
 *   5) Status / "Datum uit dienst" uit het rechter detail-paneel
 *
 * v3 vangt ALLES generiek per tab:
 *   - elk <input>/<textarea>/<select>/[contenteditable]/Radix-combobox  (label->waarde)
 *   - elke checkbox/switch  (NATIVE input[type=checkbox] EN button[role=checkbox/switch])
 *     met sectie + schone rij-label + checked-state
 *   - elke <table>  (headers + rij-cellen, inclusief input-waarden in cellen)
 *   - per sectie een ruwe tekstdump (vangnet zodat niets verloren gaat)
 *   - de volledige main-tekst per tab (regex-vangnet voor zijpaneel-velden)
 *   4500ms wacht + 3 scroll-passes per tab (Vue lazy-render fix).
 *
 * GEBRUIK (BS2 F12-console, op https://etf.acceptance.besasuite.nl/hr/employees):
 *   1) Pas evt. FROM/TO aan om te batchen (token verloopt na enkele uren).
 *   2) Plak dit VOLLEDIG, Enter. Voortgang in console. Niet wegklikken.
 *   3) Downloadt bs2-prof-<FROM>-<TO>.json.  Daarna:
 *        node --env-file=scripts/.env scripts/write-prof.mjs
 *      (leest ALLE bs2-prof-*.json en merge't ze; batchen is veilig)
 * ==========================================================================*/
(async () => {
  const FROM = 0;     // <-- per batch aanpassen (0,25,50,75…)
  const TO   = 200;   // <-- per batch aanpassen (25,50,75,200)

  const token = (() => {
    for (const k of Object.keys(localStorage)) {
      if (k.includes('access')) { const v = localStorage.getItem(k); if (v && v.length > 100) return v; }
    }
    return null;
  })();
  if (!token) { console.error('%cGEEN BS2-token — opnieuw inloggen op BS2.', 'color:#dc2626;font-weight:bold'); return; }
  const h = { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } };
  const BASE = 'https://api.etf.acceptance.besasuite.nl';

  const r = await fetch(`${BASE}/api/employees?limit=200`, h);
  const all = ((await r.json()).data || []).map(e => ({
    id: e.id, email: (e.email || '').toLowerCase(), name: e.name,
    employment_type: e.employment_type || e.type || '',
  }));
  const list = all.slice(FROM, TO);
  console.log(`%c━━━ BS2 SCRAPER GESTART ━━━  ${all.length} medewerkers totaal, deze run ${list.length} (index ${FROM}..${TO}). Niet wegklikken — voortgang per medewerker hieronder.`, 'color:#2563eb;font-weight:bold;font-size:14px');

  const appEl = document.querySelector('#app');
  const app = appEl && appEl.__vue_app__;
  const router = app && app.config && app.config.globalProperties && app.config.globalProperties.$router;
  if (!router) { console.error('%cFOUT: Vue $router niet bereikbaar — herlaad de BS2-pagina en plak opnieuw.', 'color:#dc2626;font-weight:bold;font-size:14px'); return; }
  const sleep = ms => new Promise(res => setTimeout(res, ms));
  const clean = s => (s || '').replace(/\s+/g, ' ').trim();

  async function go(path) { try { await router.push(path); } catch (_) {} }
  async function scrollPasses(n) {
    for (let i = 0; i < n; i++) {
      window.scrollTo(0, document.body.scrollHeight); await sleep(900);
      window.scrollTo(0, Math.floor(document.body.scrollHeight / 2)); await sleep(450);
      window.scrollTo(0, document.body.scrollHeight); await sleep(650);
    }
    window.scrollTo(0, 0); await sleep(400);
  }
  function labelFor(el) {
    let t = '';
    if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) t = l.textContent; }
    if (!t) t = el.getAttribute('aria-label') || el.getAttribute('placeholder') || '';
    if (!t) { const p = el.closest('label'); if (p) t = p.textContent; }
    if (!t) { const ps = el.previousElementSibling; if (ps && ps.textContent) t = ps.textContent; }
    return clean(t).substring(0, 70);
  }

  // Vang ALLES op de huidige (al gerenderde) pagina
  function capture() {
    const fields = {};        // "Sectie › Label" -> waarde
    const checks = [];        // { section, label, checked }
    const tables = [];        // { section, headers:[], rows:[[...]] }
    const sectionText = {};   // sectie -> ruwe tekst (vangnet)
    let section = '';

    for (const el of document.querySelectorAll('h1,h2,h3,h4,h5,h6,input,textarea,select,button,[contenteditable="true"]')) {
      const tag = el.tagName;
      if (/^H[1-6]$/.test(tag)) {
        const t = clean(el.textContent);
        if (t && t.length < 60) { section = t; if (!(section in sectionText)) sectionText[section] = ''; }
        continue;
      }
      if (tag === 'INPUT') {
        const ty = el.type;
        if (ty === 'checkbox' || ty === 'radio') {
          checks.push({ section, label: labelFor(el), checked: !!el.checked, kind: ty });
        } else if (!['hidden', 'search', 'file', 'submit', 'button', 'image', 'reset'].includes(ty)) {
          const lbl = labelFor(el); if (lbl) fields[`${section} › ${lbl}`] = clean(el.value);
        }
      } else if (tag === 'TEXTAREA' || el.getAttribute('contenteditable') === 'true') {
        const lbl = labelFor(el); if (lbl) fields[`${section} › ${lbl}`] = clean(el.value || el.textContent);
      } else if (tag === 'SELECT') {
        const lbl = labelFor(el);
        const txt = el.options[el.selectedIndex] ? el.options[el.selectedIndex].text : el.value;
        if (lbl) fields[`${section} › ${lbl}`] = clean(txt);
      } else if (tag === 'BUTTON') {
        const role = el.getAttribute('role');
        if (role === 'checkbox' || role === 'switch') {
          const st = el.getAttribute('data-state') || el.getAttribute('aria-checked');
          checks.push({ section, label: labelFor(el), checked: st === 'checked' || st === 'true', kind: 'radix' });
        } else if (role === 'combobox' || el.hasAttribute('data-radix-select-trigger') || el.getAttribute('aria-haspopup') === 'listbox') {
          const lbl = labelFor(el); const txt = clean(el.textContent).substring(0, 100);
          if (lbl) fields[`${section} › ${lbl}`] = txt;
        }
      }
    }

    // Tabellen (diensttype-tarieven, opleidingen, etc.) — incl. input-waarden in cellen
    let secT = '';
    for (const el of document.querySelectorAll('h1,h2,h3,h4,h5,h6,table')) {
      if (/^H[1-6]$/.test(el.tagName)) { const t = clean(el.textContent); if (t && t.length < 60) secT = t; continue; }
      const headers = [...el.querySelectorAll('thead th, thead td')].map(c => clean(c.textContent)).filter(Boolean);
      const rows = [];
      for (const tr of el.querySelectorAll('tbody tr, tr')) {
        const cells = [...tr.querySelectorAll('th,td')].map(td => {
          const inp = td.querySelector('input,select,textarea');
          if (inp) return clean(inp.value || (inp.options && inp.options[inp.selectedIndex] ? inp.options[inp.selectedIndex].text : ''));
          return clean(td.textContent);
        });
        if (cells.some(Boolean)) rows.push(cells);
      }
      if (rows.length || headers.length) tables.push({ section: secT, headers, rows });
    }

    // Ruwe per-sectie tekst (vangnet) + volledige main-tekst (zijpaneel-regex)
    let secX = '';
    for (const el of document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,span,div,td,dd,dt')) {
      if (/^H[1-6]$/.test(el.tagName)) { const t = clean(el.textContent); if (t && t.length < 60) secX = t; continue; }
      if (el.children.length === 0) {
        const t = clean(el.textContent);
        if (t) sectionText[secX] = ((sectionText[secX] || '') + ' ' + t).slice(-1500);
      }
    }
    // Datums apart — datumprikkers zijn vaak buttons/divs i.p.v. <input>.
    // Per datum: sectie + beste label, zodat de writer startdatum/beoordeling
    // ondubbelzinnig kan koppelen ook als ze niet onder een <h*> staan.
    const dates = []; let secD = '';
    const nearLabel = el => {
      let t = '';
      if (el.tagName === 'INPUT') t = labelFor(el);
      if (!t) { let p = el.previousElementSibling; let n = 0; while (p && !t && n++ < 4) { const x = clean(p.textContent); if (x && x.length < 50) t = x; p = p.previousElementSibling; } }
      if (!t) { const c = el.closest('[class*="field"],[class*="Field"],[class*="form-item"],[class*="grid"],div'); if (c) { const lb = c.querySelector('label'); if (lb) t = lb.textContent; } }
      return clean(t).substring(0, 50);
    };
    for (const el of document.querySelectorAll('h1,h2,h3,h4,h5,h6,input,button,span,div,td,time,[data-slot]')) {
      if (/^H[1-6]$/.test(el.tagName)) { const t = clean(el.textContent); if (t && t.length < 60) secD = t; continue; }
      let v = el.tagName === 'INPUT' ? el.value : (el.children.length === 0 ? el.textContent : '');
      v = clean(v);
      const m = v.match(/^(\d{1,2}-\d{1,2}-\d{4})$/) || v.match(/^(\d{4}-\d{2}-\d{2})$/);
      if (m) dates.push({ section: secD, label: nearLabel(el), date: m[1] });
    }

    const main = document.querySelector('main') || document.body;
    const pageText = clean(main.innerText || main.textContent).substring(0, 6000);

    return { fields, checks, tables, dates, sectionText, pageText };
  }

  const results = [];
  let idx = 0;
  for (const emp of list) {
    idx++;
    const rec = { id: emp.id, email: emp.email, name: emp.name, employment_type: emp.employment_type, tabs: {}, api: null };
    console.log(`%c→ ${FROM + idx}/${list.length} bezig: ${emp.name} …`, 'color:#64748b');
    try { rec.api = (await (await fetch(`${BASE}/api/employees/${emp.id}`, h)).json()); rec.api = rec.api && (rec.api.data || rec.api); } catch (_) {}
    try {
      await go(`/hr/employees/${emp.id}/details`);
      await sleep(4500); await scrollPasses(3); await sleep(900);
      rec.tabs.details = capture();

      await go(`/hr/employees/${emp.id}/professional`);
      await sleep(4500); await scrollPasses(3); await sleep(900);
      rec.tabs.professional = capture();

      await go(`/hr/employees/${emp.id}/education`);
      await sleep(4000); await scrollPasses(3); await sleep(800);
      rec.tabs.education = capture();
    } catch (e) { rec.error = (e && e.message) || String(e); }
    results.push(rec);
    {
      const p = rec.tabs.professional || {};
      const loc = (p.checks || []).filter(c => /locatie/i.test(c.section) && c.checked).length;
      const kern = (p.checks || []).find(c => /kernteam/i.test(c.section) && c.checked);
      const opl = (rec.tabs.education?.tables || []).reduce((n, t) => n + t.rows.length, 0);
      const bad = rec.error ? `  ⚠️ ${rec.error}` : '';
      console.log(`%c  ${FROM + idx}/${list.length}  ${emp.name}  | velden:${Object.keys(p.fields || {}).length} loc:${loc} kern:"${kern ? kern.label : ''}" opl-rijen:${opl}${bad}`, `color:${rec.error ? '#dc2626' : '#16a34a'};font-weight:${rec.error ? 'bold' : 'normal'}`);
    }
  }

  const fname = `bs2-prof-${FROM}-${TO}.json`;
  const blob = new Blob([JSON.stringify(results)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fname; a.style.display = 'none';
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);

  const errs = results.filter(x => x.error).length;
  console.log(`%cKLAAR — ${results.length} gescraped, ${errs} fout. ${fname} gedownload.\nDraai:  node --env-file=scripts/.env scripts/write-prof.mjs`, 'color:#2563eb;font-weight:bold;font-size:14px');
})();
