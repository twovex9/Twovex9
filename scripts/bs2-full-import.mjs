#!/usr/bin/env node
/**
 * bs2-full-import.mjs
 *
 * Volledige BS2 -> BS1 data port. Leest scripts/bs2-exports/bs2-export-full.json
 * en INSERTs alle records direct via Supabase REST API (PostgREST).
 *
 * Idempotent: gebruikt `Prefer: resolution=merge-duplicates` -> upsert op PK.
 * Niet-destructief: BS1 records die niet in BS2 staan blijven onaangetast.
 *
 * Requirements:
 *   - Node 18+ (heeft globale fetch)
 *   - Supabase SERVICE ROLE KEY (NIET anon key)
 *     → Vind op: https://supabase.com/dashboard/project/boscwvojcggkbdxhlfys/settings/api
 *     → Onder "Project API keys" → klik "Reveal" naast "service_role"
 *     → BELANGRIJK: deze key bypasst RLS. Lekken = volle DB-toegang. Niet committen!
 *
 * Usage:
 *   # PowerShell:
 *   $env:SUPABASE_SERVICE_KEY = "eyJhbG..."
 *   node scripts/bs2-full-import.mjs
 *
 *   # Of per resource:
 *   node scripts/bs2-full-import.mjs --only clienten
 *
 *   # Of dry-run (laat samenvatting zien, geen inserts):
 *   node scripts/bs2-full-import.mjs --dry-run
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const JSON_PATH = join(__dirname, "bs2-exports", "bs2-export-full.json");
const SUPABASE_URL = process.env.SUPABASE_URL || "https://boscwvojcggkbdxhlfys.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

// CLI args
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const onlyIdx = args.indexOf("--only");
const ONLY = onlyIdx >= 0 ? args[onlyIdx + 1] : null;
const VERBOSE = args.includes("--verbose");
const BATCH_SIZE = 50;

if (!SUPABASE_KEY && !DRY_RUN) {
  console.error("\nERROR: SUPABASE_SERVICE_KEY env var ontbreekt.");
  console.error("\nHaal de service_role key op:");
  console.error("  https://supabase.com/dashboard/project/boscwvojcggkbdxhlfys/settings/api");
  console.error("\nPowerShell:");
  console.error("  $env:SUPABASE_SERVICE_KEY = \"eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9....\"");
  console.error("  node scripts/bs2-full-import.mjs");
  console.error("\nOf gebruik --dry-run om zonder inserts te zien wat zou gebeuren.\n");
  process.exit(1);
}

// =============================================================================
// Helper: Supabase REST upsert
// =============================================================================
async function supabaseUpsert(table, rows) {
  if (DRY_RUN) {
    console.log(`    [DRY-RUN] zou ${rows.length} rijen upserten naar ${table}`);
    return { inserted: rows.length, skipped: 0, errors: [] };
  }
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  let inserted = 0, skipped = 0;
  const errors = [];

  // Batch in groepen van BATCH_SIZE
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
        errors.push({ batch: i, status: r.status, body: txt.slice(0, 500) });
        // Probeer per-record fallback bij batch-fout
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
            else { skipped++; if (VERBOSE) errors.push({ id: row.id, status: r2.status, body: (await r2.text()).slice(0, 200) }); }
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
// Helpers: type conversion
// =============================================================================
function dateOrNull(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  // ISO 8601
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // DD-MM-YYYY
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
function boolOrFalse(v) { return !!v; }
function trimOrNull(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

// =============================================================================
// Per-resource mappers
// =============================================================================
const mappers = {
  // -- MASTER-DATA (uuid PK, BS1 mogelijk superset; we upserten met BS2 UUID) --
  zorgsoorten: {
    endpoint: "/api/care-types",
    table: "zorgsoorten",
    map: r => ({
      id: r.id,
      naam: trimOrNull(r.name),
      tarieftype: ({ daily: "dag", hourly: "uur", weekly: "week" })[r.tariff_type] || null,
      archived: false,
    }),
  },
  locaties: {
    endpoint: "/api/locations",
    table: "locaties",
    map: r => {
      const a = r.address || {};
      return {
        id: r.id,
        naam: trimOrNull(r.name),
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
  },
  competenties: {
    endpoint: "/api/competencies",
    table: "competenties",
    map: r => ({ id: r.id, naam: trimOrNull(r.name), archived: !!r.deleted_at }),
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
  },
  gemeenten: {
    endpoint: "/api/municipalities",
    table: "gemeenten",
    map: r => ({ id: r.id, naam: trimOrNull(r.name), archived: !!r.deleted_at }),
  },
  organisaties: {
    endpoint: "/api/organizations",
    table: "organisaties",
    map: r => ({ id: String(r.id), naam: trimOrNull(r.name), archived: !!r.deleted_at }),
  },
  salarisschalen: {
    endpoint: "/api/salary-scales",
    table: "salarisschalen",
    map: (r, idx) => ({
      id: String(r.id),
      title: trimOrNull(r.title || r.name),
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

  // -- KERN PII --
  medewerkers: {
    endpoint: "/api/employees",
    table: "medewerkers",
    map: r => ({
      id: r.id,
      voornaam: trimOrNull(r.first_name),
      achternaam: trimOrNull(r.last_name),
      email: trimOrNull(r.email),
      fase: trimOrNull(r.phase?.name || r.phase),
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
      clientnummer: r.client_number || null,
      locatie: trimOrNull(r.location?.name || r.location),
      fase: trimOrNull(r.phase?.name || r.phase),
      gemeente: trimOrNull(r.municipality?.name || r.municipality),
      organisatie: trimOrNull(r.organization?.name || r.organization),
      archived: !!r.deleted_at,
      data: {
        bs2_id: r.id,
        bs2_full_name: r.name,
        bs2_first_name: r.first_name,
        bs2_last_name: r.last_name,
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
    map: r => ({
      id: String(r.id),
      client_id: r.client_id || r.client?.id ? String(r.client_id || r.client.id) : null,
      naam: trimOrNull(r.name || r.label),
      zorgsoort_key: trimOrNull(r.care_type?.name || r.care_type),
      fase: trimOrNull(r.phase?.name || r.phase),
      locatie: trimOrNull(r.location?.name || r.location),
      start_iso: dateOrNull(r.start_date),
      eind_iso: dateOrNull(r.end_date),
      decl_meth: trimOrNull(r.declaration_method),
      tarief_eur: numOrNull(r.tariff),
      tarief_eenheid: trimOrNull(r.tariff_unit),
      betalings_status: trimOrNull(r.payment_status),
      gearchiveerd: !!r.deleted_at,
      data: {
        bs2_id: r.id,
        bs2_full: r,
      },
    }),
  },
  incidenten: {
    endpoint: "/api/incidents",
    table: "incidenten",
    map: r => ({
      id: r.id,
      client_id: r.client_id || (r.client?.id ? String(r.client.id) : null),
      categorie: trimOrNull(r.category?.name || r.category),
      status: trimOrNull(r.status),
      melder_id: null, // resolve later via medewerker_id lookup
      beoordelaar_id: null,
      locatie_id: r.location?.id || null,
      incident_datum: tsOrNull(r.incident_date),
      omschrijving: trimOrNull(r.description),
      genomen_maatregelen: trimOrNull(r.safety_measures),
      archived: !!r.deleted_at,
      tijdstip_van_dag: trimOrNull(r.time_of_day),
      is_buiten: !!r.outside_location,
      actor_type: trimOrNull(r.incident_actors?.[0] || null),
      betrokken_partijen: r.incident_actors || [],
      ouders_geinformeerd: !!r.parents_informed,
      wil_gebeld_worden: !!r.wants_callback,
      impact_op_zorgverlener: trimOrNull(r.personal_impact),
      notificeer_team: !!r.notify_team,
      notificeer_medewerker_ids: r.notify_employee_ids || [],
    }),
  },
  facturen: {
    endpoint: "/api/invoices",
    table: "facturen",
    map: r => ({
      id: String(r.id),
      factuurnummer: trimOrNull(r.number),
      beschikking_label: trimOrNull(r.disposition?.name || r.disposition),
      client_label: trimOrNull(r.client?.name || r.client),
      client_id: r.client?.id ? String(r.client.id) : null,
      clientnummer: r.client?.client_number ? String(r.client.client_number) : null,
      periode: trimOrNull(r.period),
      betaling_text: trimOrNull(r.payment_status),
      status: trimOrNull(r.status),
      bedrag: numOrNull(r.total),
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
      afdeling: trimOrNull(r.department?.name || r.department),
      functie: trimOrNull(r.function?.name || r.function),
      teamlead: trimOrNull(r.team_lead?.name || null),
      teamlid: trimOrNull(r.assigned_to?.name || r.employees?.[0]?.name || null),
      client: trimOrNull(r.client?.name || null),
      vestiging: trimOrNull(r.organization?.name || null),
      locatie: trimOrNull(r.location?.name || null),
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

// =============================================================================
// Main run
// =============================================================================
async function main() {
  console.log(`\n=== BS2 -> BS1 import ===`);
  console.log(`JSON     : ${JSON_PATH}`);
  console.log(`Supabase : ${SUPABASE_URL}`);
  console.log(`Mode     : ${DRY_RUN ? "DRY-RUN" : "LIVE INSERT"}`);
  if (ONLY) console.log(`Only     : ${ONLY}`);
  console.log();

  const raw = JSON.parse(readFileSync(JSON_PATH, "utf8"));
  const data = raw.data;

  // Volgorde van import (FK-dependency):
  const order = [
    "gemeenten", "zorgsoorten", "bureaus", "competenties", "opleidingen",
    "locaties", "organisaties", "salarisschalen", "incident_categorieen",
    "medewerkers", "clienten", "beschikkingen", "incidenten", "facturen", "planning",
  ];

  const summary = [];
  for (const name of order) {
    if (ONLY && ONLY !== name) continue;
    const spec = mappers[name];
    if (!spec) { console.warn(`Geen mapper voor ${name}`); continue; }
    const arr = Array.isArray(data[spec.endpoint]) ? data[spec.endpoint] : (data[spec.endpoint]?.data || []);
    if (!arr.length) { console.log(`[${name}] geen data in JSON, skip`); continue; }
    const rows = arr.map((r, i) => spec.map(r, i)).filter(Boolean);
    console.log(`\n[${name}] ${rows.length} records -> public.${spec.table}`);
    const result = await supabaseUpsert(spec.table, rows);
    console.log(`  inserted: ${result.inserted}, skipped: ${result.skipped}, errors: ${result.errors.length}`);
    if (result.errors.length && VERBOSE) {
      console.log("  Errors:", JSON.stringify(result.errors.slice(0, 3), null, 2));
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
