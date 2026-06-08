#!/usr/bin/env node
/**
 * bs2-full-import.mjs (v2 — met fixes voor alle bekende errors)
 *
 * Volledige BS2 -> BS1 data port. Leest scripts/bs2-exports/bs2-export-full.json
 * en INSERTs alle records direct via Supabase REST API (PostgREST).
 *
 * Fixes vs v1:
 *  - Master-data (gemeenten, zorgsoorten, bureaus, competenties, opleidingen) standaard
 *    skipped: BS1 is superset, lower(naam) unique constraint blokkeert duplicate inserts.
 *    Gebruik --include-masterdata om toch te proberen.
 *  - organisaties: filter records met null name
 *  - salarisschalen: title fallback "Schaal {idx+1}"
 *  - clienten: clientnummer = NULL (bewaard in data.bs2_client_number)
 *  - beschikkingen: zorgsoort_key fallback "Onbekend", naam fallback van care_type/client
 *  - incidenten: impact_op_zorgverlener fallback "Niet opgegeven"
 *  - facturen: client_label string-only (geen [object Object]), beschikking_label fallback
 *  - planning: dedupe IDs per batch
 *
 * Usage:
 *   $env:SUPABASE_SERVICE_KEY = "eyJhbG..."
 *   node scripts/bs2-full-import.mjs           # alle non-master-data
 *   node scripts/bs2-full-import.mjs --include-masterdata  # ook master-data proberen
 *   node scripts/bs2-full-import.mjs --only clienten --verbose
 *   node scripts/bs2-full-import.mjs --dry-run
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const JSON_PATH = join(__dirname, "bs2-exports", "bs2-export-full.json");
const SUPABASE_URL = process.env.SUPABASE_URL || "https://ukjflilnhigozfoxowmj.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const onlyIdx = args.indexOf("--only");
const ONLY = onlyIdx >= 0 ? args[onlyIdx + 1] : null;
const VERBOSE = args.includes("--verbose");
const INCLUDE_MASTER = args.includes("--include-masterdata");
const BATCH_SIZE = 50;

// BS1 superset — skip by default (lower(naam) unique constraint blocks our BS2 UUIDs)
const MASTERDATA_SKIP = new Set([
  "gemeenten", "zorgsoorten", "bureaus", "competenties", "opleidingen",
]);

if (!SUPABASE_KEY && !DRY_RUN) {
  console.error("\nERROR: SUPABASE_SERVICE_KEY env var ontbreekt.");
  console.error("\nHaal de service_role key op:");
  console.error("  https://supabase.com/dashboard/project/ukjflilnhigozfoxowmj/settings/api");
  process.exit(1);
}

async function supabaseUpsert(table, rows) {
  if (DRY_RUN) {
    console.log(`    [DRY-RUN] zou ${rows.length} rijen upserten naar ${table}`);
    return { inserted: rows.length, skipped: 0, errors: [] };
  }
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  let inserted = 0, skipped = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(batch),
      });
      if (!r.ok) {
        const txt = await r.text();
        // Per-record fallback
        for (const row of batch) {
          try {
            const r2 = await fetch(url, {
              method: "POST",
              headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`,
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal",
              },
              body: JSON.stringify([row]),
            });
            if (r2.ok) inserted++;
            else {
              skipped++;
              if (errors.length < 5 || VERBOSE) {
                errors.push({ id: row.id, status: r2.status, body: (await r2.text()).slice(0, 300) });
              }
            }
          } catch (e) { skipped++; errors.push({ id: row?.id, err: String(e) }); }
        }
      } else {
        inserted += batch.length;
      }
    } catch (e) {
      errors.push({ batch: i, err: String(e) });
    }
  }
  return { inserted, skipped, errors };
}

// =============================================================================
// Type helpers
// =============================================================================
function dateOrNull(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = /^(\d{2})-(\d{2})-(\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}
function tsOrNull(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s;
  return null;
}
function numOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return isFinite(n) ? n : null;
}
function trimOrNull(v) {
  if (v == null) return null;
  if (typeof v === "object") return null; // voorkom [object Object]
  const s = String(v).trim();
  return s === "" ? null : s;
}
function nameOf(v) {
  // Resolve "name" uit zowel string als object
  if (v == null) return null;
  if (typeof v === "string") { const s = v.trim(); return s === "" ? null : s; }
  if (typeof v === "object") return trimOrNull(v.name) || trimOrNull(v.title) || trimOrNull(v.label);
  return null;
}

// =============================================================================
// Mappers
// =============================================================================
const mappers = {
  zorgsoorten: {
    endpoint: "/api/care-types",
    table: "zorgsoorten",
    map: r => ({
      id: r.id,
      naam: trimOrNull(r.name),
      tarieftype: ({ daily: "dag", hourly: "uur", weekly: "week" })[r.tariff_type] || null,
      archived: false,
    }),
    validate: r => !!r.naam,
  },
  locaties: {
    endpoint: "/api/locations",
    table: "locaties",
    map: r => {
      const a = r.address || {};
      return {
        id: r.id,
        naam: trimOrNull(r.name) || "Naamloze locatie",
        adres: [a.street, a.house_number, a.house_number_addition].filter(Boolean).join(" ") || null,
        kleur: trimOrNull(r.color),
        postcode: trimOrNull(a.postcode),
        huisnummer: trimOrNull(a.house_number),
        toevoeging: trimOrNull(a.house_number_addition),
        straat: trimOrNull(a.street),
        plaats: trimOrNull(a.city),
        archived: !!r.deleted_at,
      };
    },
  },
  bureaus: {
    endpoint: "/api/agency",
    table: "bureaus",
    map: r => ({
      id: r.id,
      naam: trimOrNull(r.name),
      standaard_uurtarief: numOrNull(r.default_hourly_rate),
      fee_per_uur: numOrNull(r.default_hourly_fee),
      archived: !!r.deleted_at,
    }),
    validate: r => !!r.naam,
  },
  competenties: {
    endpoint: "/api/competencies",
    table: "competenties",
    map: r => ({ id: r.id, naam: trimOrNull(r.name), archived: !!r.deleted_at }),
    validate: r => !!r.naam,
  },
  opleidingen: {
    endpoint: "/api/certifications",
    table: "opleidingen",
    map: r => ({
      id: r.id,
      naam: trimOrNull(r.name),
      skj: !!r.is_skj,
      archived: !!r.deleted_at,
    }),
    validate: r => !!r.naam,
  },
  gemeenten: {
    endpoint: "/api/municipalities",
    table: "gemeenten",
    map: r => ({ id: r.id, naam: trimOrNull(r.name), archived: !!r.deleted_at }),
    validate: r => !!r.naam,
  },
  organisaties: {
    endpoint: "/api/organizations",
    table: "organisaties",
    map: r => ({ id: String(r.id), naam: trimOrNull(r.name), archived: !!r.deleted_at }),
    // FIX: filter records met null name
    validate: r => !!r.naam,
  },
  salarisschalen: {
    endpoint: "/api/salary-scales",
    table: "salarisschalen",
    map: (r, idx) => ({
      id: String(r.id),
      // FIX: fallback voor null title
      title: trimOrNull(r.title) || trimOrNull(r.name) || `BS2-schaal ${idx + 1}`,
      rows: r.rows || r.steps || [],
      sort_order: idx,
    }),
  },
  incident_categorieen: {
    endpoint: "/api/incident-categories",
    table: "incident_categorieen",
    map: r => ({
      id: String(r.id),
      naam: trimOrNull(r.name),
      beschrijving: trimOrNull(r.description),
      archived: !!r.deleted_at,
    }),
  },

  // -- PII --
  medewerkers: {
    endpoint: "/api/employees",
    table: "medewerkers",
    map: r => ({
      id: r.id,
      voornaam: trimOrNull(r.first_name),
      achternaam: trimOrNull(r.last_name),
      email: trimOrNull(r.email),
      fase: nameOf(r.phase),
      dienstverband: trimOrNull(r.employment_type),
      functie: trimOrNull(r.function || r.role),
      archived: !!r.deleted_at,
      data: {
        bs2_id: r.id,
        bs2_employee_number: r.employee_number,
        bs2_employment_type: r.employment_type,
        bs2_worker_type: r.worker_type,
        bs2_hiring_type: r.hiring_type,
        bs2_contract_type: r.contract_type,
        bs2_date_of_birth: r.date_of_birth,
        bs2_start_date: r.start_date,
        bs2_phone: r.phone,
        bs2_nationality: r.nationality,
        bs2_language: r.language,
        bs2_phase_id: r.phase?.id,
        bs2_phase_name: r.phase?.name,
        bs2_phase_slug: r.phase?.slug,
        bs2_has_required_documents: r.has_required_documents,
        bs2_has_warnings: r.has_warnings,
        bs2_has_errors: r.has_errors,
        bs2_is_plannable: r.is_plannable,
        bs2_is_flexible: r.is_flexible,
        bs2_full_name: r.name,
        bs2_status: r.status,
      },
    }),
  },
  clienten: {
    endpoint: "/api/clients",
    table: "clienten",
    map: r => ({
      id: String(r.id),
      voornaam: trimOrNull(r.first_name),
      achternaam: trimOrNull(r.last_name),
      // FIX: clientnummer NULL i.p.v. conflict. BS2 nummer bewaard in data.bs2_client_number.
      clientnummer: null,
      locatie: nameOf(r.location),
      fase: nameOf(r.phase),
      gemeente: nameOf(r.municipality),
      organisatie: nameOf(r.organization),
      archived: !!r.deleted_at,
      data: {
        bs2_id: r.id,
        bs2_full_name: r.name,
        bs2_client_number: r.client_number,
        bs2_referrer_name: r.referrer_name,
        bs2_referrer_phone: r.referrer_phone,
        bs2_referrer_email: r.referrer_email,
        bs2_care_start_date: r.care_start_date,
        bs2_care_end_date: r.care_end_date,
        bs2_date_of_birth: r.date_of_birth,
        bs2_phone: r.phone,
        bs2_email: r.email,
        bs2_address: r.address,
        bs2_phase: r.phase,
        bs2_municipality: r.municipality,
        bs2_organization: r.organization,
        bs2_location: r.location,
        bs2_care_type: r.care_type,
        bs2_status: r.status,
        bs2_notes: r.notes,
        bs2_extra: r.extra,
      },
    }),
  },
  beschikkingen: {
    endpoint: "/api/dispositions",
    table: "beschikkingen",
    map: r => {
      // BS1 check constraints + NOT NULL fallbacks
      const tarUnitMap = { hourly: "uur", daily: "dag", weekly: "week", uur: "uur", dag: "dag", week: "week" };
      const tarUnit = tarUnitMap[String(r.tariff_unit || "").toLowerCase()] || "uur";
      const paymentRaw = String(r.payment_status || "").toLowerCase();
      const betStatus = ["paid", "betaald"].includes(paymentRaw) ? "betaald" : "outstanding";
      const declRaw = trimOrNull(r.declaration_method);
      const declMeth = declRaw ? declRaw.toUpperCase() : "ONS";
      const faseRaw = nameOf(r.phase) || trimOrNull(r.status) || "actief";
      return {
        id: String(r.id),
        client_id: r.client_id ? String(r.client_id) : (r.client?.id ? String(r.client.id) : null),
        naam: trimOrNull(r.name) || trimOrNull(r.label) || nameOf(r.care_type) || `Beschikking ${r.id}`,
        zorgsoort_key: nameOf(r.care_type) || trimOrNull(r.care_type_id) || "Onbekend",
        fase: faseRaw,
        locatie: nameOf(r.location),
        start_iso: dateOrNull(r.start_date),
        eind_iso: dateOrNull(r.end_date),
        decl_meth: declMeth,
        tarief_eur: numOrNull(r.tariff) ?? 0,
        tarief_eenheid: tarUnit,
        betalings_status: betStatus,
        te_declareren_lm: numOrNull(r.declarable_this_month) ?? 0,
        nog_niet_gedeclareerd: numOrNull(r.not_yet_declared) ?? 0,
        gedecl_gemeente_in_behandeling: numOrNull(r.declared_pending) ?? 0,
        betaald_cumulatief: numOrNull(r.paid_cumulative) ?? 0,
        gearchiveerd: !!r.deleted_at,
        data: { bs2_id: r.id, bs2_full: r },
      };
    },
  },
  incidenten: {
    endpoint: "/api/incidents",
    table: "incidenten",
    map: r => {
      // BS1 check constraints
      const statusMap = {
        pending: "in_afwachting", in_progress: "in_behandeling", resolved: "opgelost",
        in_afwachting: "in_afwachting", in_behandeling: "in_behandeling", opgelost: "opgelost",
      };
      const status = statusMap[String(r.status || "").toLowerCase()] || "in_afwachting";

      const todMap = {
        early_morning: "vroege_ochtend", morning: "ochtend", midday: "middag",
        afternoon: "middag", late_afternoon: "late_middag", evening: "avond", night: "nacht",
        vroege_ochtend: "vroege_ochtend", ochtend: "ochtend", middag: "middag",
        late_middag: "late_middag", avond: "avond", nacht: "nacht",
      };
      const todRaw = trimOrNull(r.time_of_day);
      const tijdstip = todRaw ? (todMap[todRaw.toLowerCase()] || null) : null;

      // actor_type alleen als exact in BS1 enum, anders NULL
      const validActors = new Set(["alleen_client", "client_naar_client", "client_naar_medewerker", "medewerker_naar_client", "client_naar_overige"]);
      const actorRaw = trimOrNull(Array.isArray(r.incident_actors) ? r.incident_actors[0] : r.incident_actors);
      const actor = actorRaw && validActors.has(actorRaw.toLowerCase()) ? actorRaw.toLowerCase() : null;

      return {
        id: r.id,
        client_id: r.client_id || (r.client?.id ? String(r.client.id) : null),
        categorie: nameOf(r.category) || "Overig",
        status: status,
        melder_id: null,
        beoordelaar_id: null,
        locatie_id: r.location?.id || null,
        incident_datum: tsOrNull(r.incident_date) || new Date().toISOString(),
        omschrijving: trimOrNull(r.description) || "",
        genomen_maatregelen: trimOrNull(r.safety_measures) || "",
        archived: !!r.deleted_at,
        tijdstip_van_dag: tijdstip,
        is_buiten: !!r.outside_location,
        actor_type: actor,
        betrokken_partijen: Array.isArray(r.incident_actors) ? r.incident_actors : [],
        ouders_geinformeerd: !!r.parents_informed,
        wil_gebeld_worden: !!r.wants_callback,
        impact_op_zorgverlener: trimOrNull(r.personal_impact) || "",
        notificeer_team: !!r.notify_team,
        notificeer_medewerker_ids: Array.isArray(r.notify_employee_ids) ? r.notify_employee_ids : [],
      };
    },
  },
  facturen: {
    endpoint: "/api/invoices",
    table: "facturen",
    map: r => ({
      id: String(r.id),
      // FIX: NOT NULL fallbacks voor alle string-velden
      factuurnummer: trimOrNull(r.number) || `BS2-${r.id}`,
      beschikking_label: nameOf(r.disposition) || nameOf(r.decision) || trimOrNull(r.disposition_label) || `Factuur ${r.number || r.id}`,
      client_label: nameOf(r.client) || nameOf(r.organization) || "Onbekend",
      client_id: r.client?.id ? String(r.client.id) : null,
      clientnummer: r.client?.client_number != null ? String(r.client.client_number) : null,
      periode: trimOrNull(r.period) || "",
      betaling_text: trimOrNull(r.payment_status) || "",
      status: trimOrNull(r.status) || "",
      bedrag: numOrNull(r.total) ?? 0,
      gearchiveerd: !!r.deleted_at,
      data: {
        bs2_id: r.id,
        bs2_total_excl_vat: r.total_excl_vat,
        bs2_priority: r.priority,
        bs2_organization: r.organization,
        bs2_employee: r.employee,
        bs2_vat_handling: r.vat_handling,
        bs2_full: r,
      },
    }),
  },
  planning: {
    endpoint: "/api/shifts",
    table: "planning",
    map: r => ({
      id: String(r.id),
      start_iso: tsOrNull(r.start_at || r.start_time || r.start),
      einde_iso: tsOrNull(r.end_at || r.end_time || r.end),
      diensttype: trimOrNull(r.type),
      afdeling: nameOf(r.department),
      functie: nameOf(r.function),
      teamlead: nameOf(r.team_lead),
      teamlid: nameOf(r.assigned_to) || (Array.isArray(r.employees) && r.employees[0] ? nameOf(r.employees[0]) : null),
      client: nameOf(r.client),
      vestiging: nameOf(r.organization),
      locatie: nameOf(r.location),
      conflict: false,
      archived: !!r.deleted_at,
      data: {
        bs2_id: r.id,
        bs2_description: r.description,
        bs2_repeat: r.repeat,
        bs2_repeat_end_date: r.repeat_end_date,
        bs2_is_assigned: r.is_assigned,
        bs2_is_open: r.is_open,
        bs2_replacement_required: r.replacement_required,
        bs2_required_headcount: r.required_headcount,
        bs2_filled_count: r.filled_count,
        bs2_full: r,
      },
    }),
  },
};

function dedupeById(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const id = String(row.id);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}

async function main() {
  console.log(`\n=== BS2 -> BS1 import (v2) ===`);
  console.log(`JSON     : ${JSON_PATH}`);
  console.log(`Supabase : ${SUPABASE_URL}`);
  console.log(`Mode     : ${DRY_RUN ? "DRY-RUN" : "LIVE INSERT"}`);
  if (ONLY) console.log(`Only     : ${ONLY}`);
  if (INCLUDE_MASTER) console.log(`Master   : ENABLED (force-import)`);
  else console.log(`Master   : default skip (BS1 superset). Gebruik --include-masterdata om te forceren.`);
  console.log();

  const raw = JSON.parse(readFileSync(JSON_PATH, "utf8"));
  const data = raw.data;

  const order = [
    "gemeenten", "zorgsoorten", "bureaus", "competenties", "opleidingen",
    "locaties", "organisaties", "salarisschalen", "incident_categorieen",
    "medewerkers", "clienten", "beschikkingen", "incidenten", "facturen", "planning",
  ];

  const summary = [];
  for (const name of order) {
    if (ONLY && ONLY !== name) continue;
    if (!INCLUDE_MASTER && MASTERDATA_SKIP.has(name) && !ONLY) {
      console.log(`[${name}] standaard skip (BS1 superset). --include-masterdata om te forceren.`);
      summary.push({ resource: name, table: name, inserted: 0, skipped: "BS1-superset", errors: 0 });
      continue;
    }
    const spec = mappers[name];
    if (!spec) { console.warn(`Geen mapper voor ${name}`); continue; }
    const arr = Array.isArray(data[spec.endpoint]) ? data[spec.endpoint] : (data[spec.endpoint]?.data || []);
    if (!arr.length) { console.log(`[${name}] geen data in JSON, skip`); continue; }

    // Map + filter null-name records + dedupe id
    let rows = arr.map((r, i) => spec.map(r, i)).filter(Boolean);
    if (spec.validate) {
      const before = rows.length;
      rows = rows.filter(spec.validate);
      const filtered = before - rows.length;
      if (filtered > 0) console.log(`[${name}] ${filtered} records gefilterd (null/invalid)`);
    }
    rows = dedupeById(rows);

    console.log(`[${name}] ${rows.length} records -> public.${spec.table}`);
    const result = await supabaseUpsert(spec.table, rows);
    console.log(`  inserted: ${result.inserted}, skipped: ${result.skipped}, errors: ${result.errors.length}`);
    if (result.errors.length && VERBOSE) {
      console.log("  Errors (eerste 3):", JSON.stringify(result.errors.slice(0, 3), null, 2));
    } else if (result.errors.length) {
      console.log("  (gebruik --verbose voor error-details)");
    }
    summary.push({ resource: name, table: spec.table, inserted: result.inserted, skipped: result.skipped, errors: result.errors.length });
  }

  console.log("\n=== Summary ===");
  console.table(summary);
  console.log("\nKlaar.");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
