/* eslint-disable no-console */
/**
 * bs2-to-sql.mjs — TIJDELIJK helper script voor Claude's auto-import via
 * Supabase MCP.
 *
 * Leest bs2-export-full.json, mapt records via dezelfde logica als
 * bs2-full-import.mjs, en output JSON-rows naar stdout zodat Claude die
 * via execute_sql UPSERTs kan inserten (bypasst de service-role key
 * eis van bs2-full-import.mjs).
 *
 * Usage:
 *   node scripts/bs2-to-sql.mjs <entity>
 *
 * Waar <entity> = medewerkers | clienten | beschikkingen | facturen |
 *                 planning | incidenten | locaties | organisaties
 *
 * Output (stdout): JSON array van rows klaar voor PostgREST upsert.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const JSON_PATH = join(__dirname, "bs2-exports", "bs2-export-full.json");

// Mini-utils (gespiegeld uit bs2-full-import.mjs)
const trimOrNull = (s) => { if (s == null) return null; s = String(s).trim(); return s === "" ? null : s; };
const numOrNull = (v) => { if (v == null || v === "") return null; const n = Number(v); return isNaN(n) ? null : n; };
const dateOrNull = (v) => { if (!v) return null; const d = new Date(v); if (isNaN(d.getTime())) return null; return d.toISOString().slice(0, 10); };
const tsOrNull = (v) => { if (!v) return null; const d = new Date(v); return isNaN(d.getTime()) ? null : d.toISOString(); };
const nameOf = (v) => { if (v == null) return null; if (typeof v === "string") { const s = v.trim(); return s === "" ? null : s; } if (typeof v === "object") return trimOrNull(v.name) || trimOrNull(v.title) || trimOrNull(v.label); return null; };

const mappers = {
  locaties: {
    endpoint: "/api/locations",
    map: (r) => {
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
  organisaties: {
    endpoint: "/api/organizations",
    map: (r) => ({ id: String(r.id), naam: trimOrNull(r.name), archived: !!r.deleted_at }),
    validate: (r) => !!r.naam,
  },
  medewerkers: {
    endpoint: "/api/employees",
    map: (r) => ({
      id: r.id,
      voornaam: trimOrNull(r.first_name),
      achternaam: trimOrNull(r.last_name),
      email: trimOrNull(r.email),
      fase: nameOf(r.phase),
      dienstverband: trimOrNull(r.employment_type),
      functie: trimOrNull(r.function || r.role),
      archived: !!r.deleted_at,
      data: {
        bs2_id: r.id, bs2_employee_number: r.employee_number,
        bs2_employment_type: r.employment_type, bs2_worker_type: r.worker_type,
        bs2_hiring_type: r.hiring_type, bs2_contract_type: r.contract_type,
        bs2_date_of_birth: r.date_of_birth, bs2_start_date: r.start_date,
        bs2_phone: r.phone, bs2_nationality: r.nationality, bs2_language: r.language,
        bs2_phase_id: r.phase?.id, bs2_phase_name: r.phase?.name, bs2_phase_slug: r.phase?.slug,
        bs2_has_required_documents: r.has_required_documents, bs2_has_warnings: r.has_warnings,
        bs2_has_errors: r.has_errors, bs2_is_plannable: r.is_plannable, bs2_is_flexible: r.is_flexible,
        bs2_full_name: r.name, bs2_status: r.status,
      },
    }),
  },
  clienten: {
    endpoint: "/api/clients",
    map: (r) => ({
      id: String(r.id),
      voornaam: trimOrNull(r.first_name),
      achternaam: trimOrNull(r.last_name),
      clientnummer: null,
      locatie: nameOf(r.location),
      fase: nameOf(r.phase),
      gemeente: nameOf(r.municipality),
      organisatie: nameOf(r.organization),
      archived: !!r.deleted_at,
      data: {
        bs2_id: r.id, bs2_full_name: r.name, bs2_client_number: r.client_number,
        bs2_referrer_name: r.referrer_name, bs2_referrer_phone: r.referrer_phone,
        bs2_referrer_email: r.referrer_email, bs2_care_start_date: r.care_start_date,
        bs2_care_end_date: r.care_end_date, bs2_date_of_birth: r.date_of_birth,
        bs2_phone: r.phone, bs2_email: r.email, bs2_address: r.address,
        bs2_phase: r.phase, bs2_municipality: r.municipality, bs2_organization: r.organization,
        bs2_location: r.location, bs2_care_type: r.care_type, bs2_status: r.status,
        bs2_notes: r.notes, bs2_extra: r.extra,
      },
    }),
  },
  beschikkingen: {
    endpoint: "/api/dispositions",
    map: (r) => {
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
  facturen: {
    endpoint: "/api/invoices",
    map: (r) => ({
      id: String(r.id),
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
      data: { bs2_id: r.id, bs2_total_excl_vat: r.total_excl_vat, bs2_priority: r.priority, bs2_organization: r.organization, bs2_employee: r.employee, bs2_vat_handling: r.vat_handling, bs2_full: r },
    }),
  },
  planning: {
    endpoint: "/api/shifts",
    map: (r) => ({
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
      data: { bs2_id: r.id, bs2_description: r.description, bs2_repeat: r.repeat, bs2_repeat_end_date: r.repeat_end_date, bs2_is_assigned: r.is_assigned, bs2_is_open: r.is_open, bs2_replacement_required: r.replacement_required, bs2_required_headcount: r.required_headcount, bs2_filled_count: r.filled_count, bs2_full: r },
    }),
  },
  incidenten: {
    endpoint: "/api/incidents",
    map: (r) => {
      const statusMap = { pending: "in_afwachting", in_progress: "in_behandeling", resolved: "opgelost", in_afwachting: "in_afwachting", in_behandeling: "in_behandeling", opgelost: "opgelost" };
      const status = statusMap[String(r.status || "").toLowerCase()] || "in_afwachting";
      const todMap = { early_morning: "vroege_ochtend", morning: "ochtend", midday: "middag", afternoon: "middag", late_afternoon: "late_middag", evening: "avond", night: "nacht", vroege_ochtend: "vroege_ochtend", ochtend: "ochtend", middag: "middag", late_middag: "late_middag", avond: "avond", nacht: "nacht" };
      const todRaw = trimOrNull(r.time_of_day);
      const tijdstip = todRaw ? (todMap[todRaw.toLowerCase()] || null) : null;
      const validActors = new Set(["alleen_client", "client_naar_client", "client_naar_medewerker", "medewerker_naar_client", "client_naar_overige"]);
      const actorRaw = trimOrNull(Array.isArray(r.incident_actors) ? r.incident_actors[0] : r.incident_actors);
      const actor = actorRaw && validActors.has(actorRaw.toLowerCase()) ? actorRaw.toLowerCase() : null;
      return {
        id: r.id,
        client_id: r.client_id || (r.client?.id ? String(r.client.id) : null),
        categorie: nameOf(r.category) || "Overig",
        status,
        melder_id: null, beoordelaar_id: null,
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
};

const dedupeById = (rows) => {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    if (!r || !r.id || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
};

const entity = process.argv[2];
if (!entity || !mappers[entity]) {
  console.error("Usage: node scripts/bs2-to-sql.mjs <entity>");
  console.error("Available:", Object.keys(mappers).join(", "));
  process.exit(1);
}

const raw = JSON.parse(readFileSync(JSON_PATH, "utf8"));
const spec = mappers[entity];
const arr = Array.isArray(raw.data[spec.endpoint]) ? raw.data[spec.endpoint] : (raw.data[spec.endpoint]?.data || []);
let rows = arr.map((r, i) => spec.map(r, i)).filter(Boolean);
if (spec.validate) rows = rows.filter(spec.validate);
rows = dedupeById(rows);
process.stdout.write(JSON.stringify(rows));
