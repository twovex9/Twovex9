/* eslint-disable no-console */
/**
 * bs2-mcp-import.mjs — TIJDELIJK helper voor Claude.
 *
 * Splitst JSON in batches en print compacte UPSERT SQL per batch zodat Claude
 * deze via Supabase MCP execute_sql kan inserten zonder service-role key.
 *
 * Usage:
 *   node scripts/bs2-mcp-import.mjs <entity> <batch_size> <batch_index>
 *
 * Example: node scripts/bs2-mcp-import.mjs medewerkers 25 0  # first 25
 *
 * Output is SQL UPSERT statement ready to paste in execute_sql.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const JSON_PATH = join(__dirname, "bs2-exports", "bs2-export-full.json");

const trimOrNull = (s) => { if (s == null) return null; s = String(s).trim(); return s === "" ? null : s; };
const numOrNull = (v) => { if (v == null || v === "") return null; const n = Number(v); return isNaN(n) ? null : n; };
const dateOrNull = (v) => { if (!v) return null; const d = new Date(v); if (isNaN(d.getTime())) return null; return d.toISOString().slice(0, 10); };
const tsOrNull = (v) => { if (!v) return null; const d = new Date(v); return isNaN(d.getTime()) ? null : d.toISOString(); };
const nameOf = (v) => { if (v == null) return null; if (typeof v === "string") { const s = v.trim(); return s === "" ? null : s; } if (typeof v === "object") return trimOrNull(v.name) || trimOrNull(v.title) || trimOrNull(v.label); return null; };

const mappers = {
  medewerkers: {
    endpoint: "/api/employees",
    idType: "uuid",
    sqlTable: "medewerkers",
    columns: ["id", "voornaam", "achternaam", "email", "fase", "dienstverband", "functie", "archived", "data"],
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
        bs2_id: r.id, bs2_employee_number: r.employee_number, bs2_full_name: r.name,
        bs2_employment_type: r.employment_type, bs2_phone: r.phone, bs2_email: r.email,
      },
    }),
  },
  clienten: {
    endpoint: "/api/clients",
    idType: "text",
    sqlTable: "clienten",
    columns: ["id", "voornaam", "achternaam", "clientnummer", "locatie", "fase", "gemeente", "organisatie", "archived", "data"],
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
      data: { bs2_id: r.id, bs2_full_name: r.name, bs2_client_number: r.client_number, bs2_status: r.status },
    }),
  },
  beschikkingen: {
    endpoint: "/api/dispositions",
    idType: "text",
    sqlTable: "beschikkingen",
    columns: ["id", "client_id", "naam", "zorgsoort_key", "fase", "locatie", "start_iso", "eind_iso", "decl_meth", "tarief_eur", "tarief_eenheid", "betalings_status", "te_declareren_lm", "nog_niet_gedeclareerd", "gedecl_gemeente_in_behandeling", "betaald_cumulatief", "gearchiveerd", "data"],
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
        data: { bs2_id: r.id },
      };
    },
  },
  facturen: {
    endpoint: "/api/invoices",
    idType: "text",
    sqlTable: "facturen",
    columns: ["id", "factuurnummer", "beschikking_label", "client_label", "client_id", "clientnummer", "periode", "betaling_text", "status", "bedrag", "gearchiveerd", "data"],
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
      data: { bs2_id: r.id },
    }),
  },
  planning: {
    endpoint: "/api/shifts",
    idType: "text",
    sqlTable: "planning",
    columns: ["id", "start_iso", "einde_iso", "diensttype", "afdeling", "functie", "teamlead", "teamlid", "client", "vestiging", "locatie", "conflict", "archived", "data"],
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
      data: { bs2_id: r.id },
    }),
  },
  incidenten: {
    endpoint: "/api/incidents",
    idType: "uuid",
    sqlTable: "incidenten",
    columns: ["id", "client_id", "categorie", "status", "melder_id", "beoordelaar_id", "locatie_id", "incident_datum", "omschrijving", "genomen_maatregelen", "archived", "tijdstip_van_dag", "is_buiten", "actor_type", "betrokken_partijen", "ouders_geinformeerd", "wil_gebeld_worden", "impact_op_zorgverlener", "notificeer_team", "notificeer_medewerker_ids"],
    map: (r) => {
      const statusMap = { pending: "in_afwachting", in_progress: "in_behandeling", resolved: "opgelost", in_afwachting: "in_afwachting", in_behandeling: "in_behandeling", opgelost: "opgelost" };
      const status = statusMap[String(r.status || "").toLowerCase()] || "in_afwachting";
      const todMap = { early_morning: "vroege_ochtend", morning: "ochtend", midday: "middag", afternoon: "middag", late_afternoon: "late_middag", evening: "avond", night: "nacht" };
      const todRaw = trimOrNull(r.time_of_day);
      const tijdstip = todRaw ? (todMap[todRaw.toLowerCase()] || null) : null;
      const validActors = new Set(["alleen_client", "client_naar_client", "client_naar_medewerker", "medewerker_naar_client", "client_naar_overige"]);
      const actorRaw = trimOrNull(Array.isArray(r.incident_actors) ? r.incident_actors[0] : r.incident_actors);
      const actor = actorRaw && validActors.has(actorRaw.toLowerCase()) ? actorRaw.toLowerCase() : null;
      return {
        id: r.id,
        client_id: r.client_id || (r.client?.id ? String(r.client.id) : null),
        categorie: nameOf(r.category) || "Overig",
        status, melder_id: null, beoordelaar_id: null,
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
const batchSize = parseInt(process.argv[3] || "25", 10);
const batchIdx = parseInt(process.argv[4] || "0", 10);

if (!entity || !mappers[entity]) {
  console.error("Usage: node scripts/bs2-mcp-import.mjs <entity> [batchSize] [batchIdx]");
  console.error("Entities:", Object.keys(mappers).join(", "));
  process.exit(1);
}

const raw = JSON.parse(readFileSync(JSON_PATH, "utf8"));
const spec = mappers[entity];
const arr = Array.isArray(raw.data[spec.endpoint]) ? raw.data[spec.endpoint] : (raw.data[spec.endpoint]?.data || []);
let rows = arr.map((r, i) => spec.map(r, i)).filter(Boolean);
rows = dedupeById(rows);

const start = batchIdx * batchSize;
const end = Math.min(start + batchSize, rows.length);
const batchRows = rows.slice(start, end);
const totalBatches = Math.ceil(rows.length / batchSize);

// Output SQL with proper escaping (Postgres E'' literal for backslash-aware)
function pgEscape(s) {
  return s.replace(/'/g, "''");
}

const cols = spec.columns;
const idCast = spec.idType === "uuid" ? "::uuid" : "";

// Genereer SET-clause voor ON CONFLICT (alle kolommen behalve id)
const setClause = cols
  .filter((c) => c !== "id")
  .map((c) => `${c} = excluded.${c}`)
  .join(", ");

// Build SELECT-list met juiste type-casts
const selectExpr = cols.map((c) => {
  if (c === "id") return `(j->>'id')${idCast} as id`;
  if (c === "data") return `(j->'data') as data`;
  if (c === "archived" || c === "gearchiveerd" || c === "is_buiten" || c === "conflict" || c === "ouders_geinformeerd" || c === "wil_gebeld_worden" || c === "notificeer_team") {
    return `(j->>'${c}')::boolean as ${c}`;
  }
  if (c === "tarief_eur" || c === "te_declareren_lm" || c === "nog_niet_gedeclareerd" || c === "gedecl_gemeente_in_behandeling" || c === "betaald_cumulatief" || c === "bedrag") {
    return `coalesce((j->>'${c}')::numeric, 0) as ${c}`;
  }
  if (c === "start_iso" || c === "eind_iso") {
    // beschikkingen: date, planning: timestamptz. Check entity.
    if (entity === "beschikkingen") return `(j->>'${c}')::date as ${c}`;
    return `(j->>'${c}')::timestamptz as ${c}`;
  }
  if (c === "incident_datum") return `(j->>'${c}')::timestamptz as ${c}`;
  if (c === "locatie_id") return `(j->>'${c}')::uuid as ${c}`;
  if (c === "betrokken_partijen" || c === "notificeer_medewerker_ids") return `(j->'${c}') as ${c}`;
  return `(j->>'${c}') as ${c}`;
}).join(",\n  ");

const sql = `insert into ${spec.sqlTable} (${cols.join(", ")})
select
  ${selectExpr}
from jsonb_array_elements('${pgEscape(JSON.stringify(batchRows))}'::jsonb) j
on conflict (id) do update set ${setClause};`;

console.log(`-- ${entity} batch ${batchIdx + 1}/${totalBatches} (rows ${start + 1}-${end} of ${rows.length})`);
console.log(sql);
console.error(`SQL size: ${sql.length} chars`);
console.error(`Batches needed: ${totalBatches}`);
