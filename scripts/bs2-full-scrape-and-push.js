/* eslint-disable no-console */
/**
 * bs2-full-scrape-and-push.js
 * ===========================
 * EÉN DevTools-script dat data uit BesaSuite2 (productie) ophaalt en DIRECT
 * naar onze Supabase pusht. Geconsolideerd uit bs2-browser-snippet.js +
 * bs2-full-import.mjs, aangepast op de ECHTE productie-API.
 *
 * Ontdekt op 2026-06-04 (reverse-engineered op etf.besasuite.nl):
 *   - De SPA draait op https://etf.besasuite.nl  (Vue)
 *   - De ECHTE API draait op een APART subdomein: https://api.etf.besasuite.nl
 *   - Auth = Bearer-token uit localStorage['app.prod-etf-access'] (NIET cookies)
 *   - Paginering: ?limit=2000&page=N  (per_page wordt genegeerd; max ~2000/req)
 *   - Datumfilters werken NIET -> altijd alles ophalen
 *
 * VEILIGHEID (hoofdregel: nooit data verwijderen, geen schaduw-kopie):
 *   - Alleen UPSERT (merge-duplicates). Nooit DELETE/TRUNCATE.
 *   - Planning-id = 'bs2-<shift_uuid>' (deterministisch) -> bestaande rijen
 *     worden BIJGEWERKT, nieuwe toegevoegd, app-eigen diensten (niet-bs2)
 *     blijven onaangeraakt.
 *   - We sturen alleen de kolommen die BS2 levert; overige kolommen
 *     (conflict, archived, open_voor_aanmelding, ...) blijven behouden.
 *
 * ----------------------------------------------------------------------------
 * GEBRUIK
 * ----------------------------------------------------------------------------
 *   1. Open https://etf.besasuite.nl  (ingelogd) in Chrome
 *   2. F12 -> Console
 *   3. (alleen voor pushen) zet je service_role key:
 *        window.__SVC = "eyJhbG...service_role..."
 *      Ophalen: https://supabase.com/dashboard/project/boscwvojcggkbdxhlfys/settings/api
 *      -> "service_role" -> Reveal -> kopieer.  (Bypasst RLS; niet delen/committen.)
 *   4. (optioneel) kies modus:  window.__BS2_MODE = "dry"   // 'diag' | 'dry' | 'push'
 *      - 'diag' : alleen 1 pagina ophalen + structuur tonen (geen schrijven)
 *      - 'dry'  : alles ophalen + mappen + tonen wat er zou gebeuren (geen schrijven)
 *      - 'push' : alles ophalen + DIRECT naar Supabase upserten   <-- standaard
 *   5. Plak dit HELE bestand + Enter. Volg de voortgang in de console.
 *
 * Standaard staat alleen 'planning' AAN (volledig geverifieerd). De overige
 * resources staan onderaan als gevalideerde scaffold (endpoint + aantal + id-
 * strategie) en worden pas geactiveerd nadat hun mapper tegen het DB-schema is
 * gecontroleerd -> zo pushen we nooit kapotte data naar productie.
 */
(async () => {
  "use strict";

  // ===================== CONFIG =====================
  const BS2_API = "https://api.etf.besasuite.nl";
  const SB_URL  = "https://boscwvojcggkbdxhlfys.supabase.co";
  const MODE    = window.__BS2_MODE || "push";          // 'diag' | 'dry' | 'push'
  const SVC     = window.__SVC || null;                 // service_role key (alleen push)
  const ENABLED = window.__BS2_ONLY ? [].concat(window.__BS2_ONLY) : ["planning"];

  // BS2-token (Bearer) uit localStorage; soms JSON-wrapped
  let TOKEN = localStorage.getItem("app.prod-etf-access")
           || localStorage.getItem("app.acceptance-etf-access");
  try { const p = JSON.parse(TOKEN); if (typeof p === "string") TOKEN = p;
        else if (p && p.token) TOKEN = p.token;
        else if (p && p.access_token) TOKEN = p.access_token; } catch {}

  if (!TOKEN) { console.error("❌ Geen BS2-token gevonden in localStorage (app.prod-etf-access). Ben je ingelogd op etf.besasuite.nl?"); return; }
  if (MODE === "push" && !SVC) { console.error("❌ PUSH-modus vereist window.__SVC (service_role key). Zet die eerst, of gebruik window.__BS2_MODE='dry'."); return; }

  const BS2H = { Authorization: "Bearer " + TOKEN, Accept: "application/json" };
  const SBH  = SVC ? { apikey: SVC, Authorization: "Bearer " + SVC, "Content-Type": "application/json" } : null;
  const RUNTAG = "bs2-resync-" + new Date().toISOString().slice(0, 10);

  // ===================== HELPERS =====================
  const trimOrNull = v => { if (v == null) return null; if (typeof v === "object") return null; const s = String(v).trim(); return s === "" ? null : s; };
  const nameOf = v => { if (v == null) return null; if (typeof v === "string") { const s = v.trim(); return s === "" ? null : s; } if (typeof v === "object") return trimOrNull(v.name) || trimOrNull(v.title) || trimOrNull(v.label); return null; };
  const num = v => { if (v == null || v === "") return null; const n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : null; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function fetchAll(endpoint) {
    let page = 1, last = 1; const all = [];
    do {
      const sep = endpoint.includes("?") ? "&" : "?";
      const r = await fetch(`${BS2_API}${endpoint}${sep}limit=2000&page=${page}`, { headers: BS2H });
      if (!r.ok) { console.warn(`  [${endpoint}] HTTP ${r.status} op pagina ${page} — gestopt`); break; }
      const j = await r.json();
      const arr = Array.isArray(j) ? j : (j.data || []);
      all.push(...arr);
      last = (j.meta && j.meta.last_page) || 1;
      console.log(`  [${endpoint}] pagina ${page}/${last}  (+${arr.length}, totaal ${all.length})`);
      page++;
      if (page <= last) await sleep(150);
    } while (page <= last);
    return all;
  }

  // Upsert in batches via PostgREST (service_role -> bypasst RLS)
  async function upsert(table, rows, conflictCol = "id") {
    if (!rows.length) return { ok: 0, fail: 0, errs: [] };
    let ok = 0, fail = 0; const errs = [];
    for (let i = 0; i < rows.length; i += 200) {
      const batch = rows.slice(i, i + 200);
      try {
        const r = await fetch(`${SB_URL}/rest/v1/${table}?on_conflict=${conflictCol}`, {
          method: "POST",
          headers: { ...SBH, Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(batch),
        });
        if (r.ok) { ok += batch.length; }
        else { fail += batch.length; if (errs.length < 5) errs.push(`HTTP ${r.status}: ${(await r.text()).slice(0, 220)}`); }
      } catch (e) { fail += batch.length; if (errs.length < 5) errs.push(String(e)); }
      if (i % 1000 === 0) console.log(`    ${table}: ${ok + fail}/${rows.length} verwerkt`);
    }
    return { ok, fail, errs };
  }

  async function sbCount(table) {
    if (!SBH) return null;
    const r = await fetch(`${SB_URL}/rest/v1/${table}?select=id`, { headers: { ...SBH, Prefer: "count=exact", Range: "0-0" } });
    const cr = r.headers.get("content-range"); // "0-0/12345"
    return cr ? Number(cr.split("/")[1]) : null;
  }

  function monthHistogram(rows, field) {
    const h = {};
    for (const r of rows) { const d = r[field]; const m = d ? String(d).slice(0, 7) : "null"; h[m] = (h[m] || 0) + 1; }
    const o = {}; Object.keys(h).sort().forEach(k => o[k] = h[k]); return o;
  }

  // ===================== RESOURCES =====================
  // Alleen 'planning' is AAN per default (geverifieerd). Zie scaffold onderaan.
  const RESOURCES = {
    planning: {
      endpoint: "/api/shifts",
      table: "planning",
      dateField: "start_iso",
      // id = 'bs2-<uuid>' (deterministisch); bs2_id staat NIET in data (zit in id)
      map: s => ({
        id: "bs2-" + s.id,
        start_iso: s.start_time || null,     // BS2 geeft naïeve NL-tijd -> opgeslagen als UTC (zelfde conventie als bestaande rijen)
        einde_iso: s.end_time || null,
        diensttype: nameOf(s.type) || nameOf(s.shift_type),
        locatie: nameOf(s.location),
        teamlid: (Array.isArray(s.assigned_employees) && s.assigned_employees[0]) ? nameOf(s.assigned_employees[0]) : null,
        data: {
          bron: RUNTAG,
          bs2_shift_id: s.id,
          freelancer_cost: s.freelancer_cost ?? null,
          freelancer_cost_breakdown: s.freelancer_cost_breakdown ?? null,
          billable_hours: s.billable_hours ?? null,
          effective_work_hours: s.effective_work_hours ?? null,
          break_hours: s.break_hours ?? null,
          type_slug: (s.type && s.type.slug) || (s.shift_type && s.shift_type.slug) || null,
          is_open: s.is_open ?? null,
          is_assigned: s.is_assigned ?? null,
          required_headcount: s.required_headcount ?? null,
          filled_count: s.filled_count ?? null,
        },
      }),
    },
  };

  // ===================== RUN =====================
  console.log(`\n=== BS2 -> Supabase sync ===`);
  console.log(`Modus    : ${MODE.toUpperCase()}`);
  console.log(`Resources: ${ENABLED.join(", ")}`);
  console.log(`API      : ${BS2_API}`);
  console.log(`Supabase : ${SB_URL}\n`);

  const summary = [];
  for (const name of ENABLED) {
    const spec = RESOURCES[name];
    if (!spec) { console.warn(`⚠️  Onbekende/uitgeschakelde resource: ${name} (zie scaffold onderaan)`); continue; }

    console.log(`\n▶ ${name}  (${spec.endpoint} -> public.${spec.table})`);
    const before = MODE === "push" ? await sbCount(spec.table) : null;

    if (MODE === "diag") {
      const r = await fetch(`${BS2_API}${spec.endpoint}?limit=2000&page=1`, { headers: BS2H });
      const j = await r.json(); const arr = Array.isArray(j) ? j : (j.data || []);
      console.log(`  totaal in BS2: ${(j.meta && j.meta.total) ?? arr.length}`);
      console.log(`  velden:`, arr[0] ? Object.keys(arr[0]) : "(leeg)");
      console.log(`  voorbeeld gemapt:`, arr[0] ? spec.map(arr[0]) : null);
      summary.push({ resource: name, bs2_total: (j.meta && j.meta.total) ?? arr.length, db_voor: before, actie: "diag" });
      continue;
    }

    const raw = await fetchAll(spec.endpoint);
    const rows = raw.map(spec.map);
    console.log(`  opgehaald: ${raw.length}, gemapt: ${rows.length}`);
    if (spec.dateField) console.log(`  per maand:`, monthHistogram(rows, spec.dateField));

    if (MODE === "dry") {
      console.log(`  [DRY] eerste 2 gemapte rijen:`, rows.slice(0, 2));
      summary.push({ resource: name, bs2: raw.length, db_voor: before, actie: "dry (niets geschreven)" });
      continue;
    }

    // PUSH
    const res = await upsert(spec.table, rows);
    const after = await sbCount(spec.table);
    if (res.errs.length) console.warn(`  ⚠️ errors:`, res.errs);
    console.log(`  ✅ upsert ok=${res.ok} fail=${res.fail}  |  DB: ${before} -> ${after}`);
    summary.push({ resource: name, bs2: raw.length, ok: res.ok, fail: res.fail, db_voor: before, db_na: after });
  }

  console.log(`\n=== Samenvatting ===`);
  console.table(summary);
  console.log(`Klaar (${MODE}).`);
  window.__bs2SyncSummary = summary;
  return summary;
})();

/* ============================================================================
 * SCAFFOLD — overige BS2-resources (geverifieerd 2026-06-04: endpoint + aantal).
 * Nog NIET geactiveerd: elke mapper moet eerst tegen het live DB-schema worden
 * gecontroleerd (id-strategie + welke kolommen veilig te overschrijven zijn),
 * anders riskeren we het overschrijven van verrijkte velden met null.
 *
 *  resource            BS2-endpoint                 BS2#   DB-tabel        DB#    id-strategie
 *  ------------------  ---------------------------  -----  --------------  -----  ----------------------------------
 *  clienten            /api/clients                  89    clienten         86    uuidToId[data.bs2_id]  || 'bs2-'+id  (enrich, client_id behouden)
 *  medewerkers         /api/employees                85    medewerkers     102    uuidToId[data.bs2_id]  || 'bs2-'+id  (alleen data jsonb verrijken)
 *  beschikkingen       /api/dispositions            134    beschikkingen   151    id == bs2-uuid (deterministisch)    (enrich: eind_iso + echte financien; client_id/naam behouden)
 *  invoices/facturen   /api/invoices                 44    invoices         50    id == bs2-uuid  (LET OP: DB 'facturen'(956) komt van disposition_payments, NIET hiervan)
 *  incidenten          /api/incidents               263    incidenten      144    id == bs2-uuid
 *  locaties            /api/locations                11    locaties         11    naam-uniek -> master, standaard skip
 *  zorgsoorten         /api/care-types                6    zorgsoorten       7    master, skip
 *  organisaties        /api/organizations            98    organisaties     93    master
 *  gemeenten           /api/municipalities          316    gemeenten       319    master, skip
 *  bureaus             /api/agency                    4    bureaus           4    master
 *  opleidingen         /api/certifications           69    opleidingen      69    master, skip
 *  competenties        /api/competencies              1    competenties      1    master, skip
 *  incident_categorieen/api/incident-categories      15    incident_categorieen 26 master
 *  salarisschalen      /api/salary-scales            -     salarisschalen   12    master
 *
 * Activeren (na validatie):  window.__BS2_ONLY = ["planning","beschikkingen"]
 * ========================================================================== */
