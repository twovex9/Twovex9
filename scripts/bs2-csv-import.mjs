#!/usr/bin/env node
/**
 * bs2-csv-import.mjs
 *
 * Generieke CSV → SQL importer voor BS2-exports.
 *
 * Doel: read CSV uit `scripts/bs2-exports/<resource>.csv`, output INSERT-statements
 * naar stdout of een .sql-bestand. Geen direct Supabase-call vanuit dit script
 * (productie-veiligheid: SQL moet via Supabase MCP execute_sql ge-reviewed worden).
 *
 * Usage:
 *   node scripts/bs2-csv-import.mjs <resource> [--dry-run] [--out <pad>]
 *
 *   resource   : naam van de CSV zonder extensie (e.g. "clienten", "facturen")
 *   --dry-run  : toon alleen schema-detectie + sample, geen SQL
 *   --out      : schrijf SQL naar bestand (default: stdout)
 *   --schema   : pad naar een schema-map JSON (default: scripts/bs2-csv-schemas/<resource>.json)
 *   --limit N  : verwerk maar N rijen (handig voor test)
 *
 * Schema-map JSON format (een file per resource in scripts/bs2-csv-schemas/):
 * {
 *   "table": "public.clienten",
 *   "id_strategy": "bs2_id",  // "bs2_id" of "uuid_v5" of "gen_random"
 *   "columns": {
 *     "BS2 kolom naam": { "bs1": "bs1_kolom_naam", "type": "text|int|bool|date|timestamp" },
 *     "Voornaam":       { "bs1": "voornaam",       "type": "text" },
 *     "...":            { "data_jsonb": "bs2_iets" }  // alles met data_jsonb gaat in data jsonb
 *   }
 * }
 *
 * Werkt zonder schema-file: dan alleen detect + dry-run output.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const EXPORTS_DIR = join(__dirname, "bs2-exports");
const SCHEMAS_DIR = join(__dirname, "bs2-csv-schemas");

function parseArgs(argv) {
  const args = { resource: null, dryRun: false, out: null, schema: null, limit: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--schema") args.schema = argv[++i];
    else if (a === "--limit") args.limit = parseInt(argv[++i], 10);
    else if (!args.resource) args.resource = a;
  }
  return args;
}

/**
 * Minimale CSV-parser. Ondersteunt:
 *  - quoted strings met "" als escape
 *  - kommas binnen quotes
 *  - newlines binnen quotes
 *  - CRLF en LF
 * Niet ondersteund: tab-separated. Voor Excel-CSV werkt dit goed.
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;
  const len = text.length;
  while (i < len) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 2;
        continue;
      }
      if (c === '"') {
        inQuotes = false;
        i++;
        continue;
      }
      cell += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(cell);
      cell = "";
      i++;
      continue;
    }
    if (c === "\r" && text[i + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i += 2;
      continue;
    }
    if (c === "\n" || c === "\r") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
      continue;
    }
    cell += c;
    i++;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  // Filter lege trailing rows
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0].trim() !== ""));
}

function detectTypes(headers, rows, sampleSize = 50) {
  const types = {};
  for (let c = 0; c < headers.length; c++) {
    const h = headers[c];
    const sample = rows.slice(0, sampleSize).map((r) => r[c] || "").filter((v) => v !== "");
    types[h] = guessType(sample);
  }
  return types;
}

function guessType(values) {
  if (!values.length) return "text";
  let allBool = true, allInt = true, allNum = true, allDate = true, allTs = true;
  for (const v of values) {
    const s = String(v).trim();
    if (s === "") continue;
    if (!/^(true|false|ja|nee|yes|no|0|1)$/i.test(s)) allBool = false;
    if (!/^-?\d+$/.test(s)) allInt = false;
    if (!/^-?\d+([.,]\d+)?$/.test(s)) allNum = false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) && !/^\d{2}-\d{2}-\d{4}$/.test(s)) allDate = false;
    if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s)) allTs = false;
  }
  if (allTs) return "timestamp";
  if (allDate) return "date";
  if (allBool) return "boolean";
  if (allInt) return "int";
  if (allNum) return "numeric";
  return "text";
}

function sqlLiteral(value, type) {
  if (value == null) return "NULL";
  const s = String(value).trim();
  if (s === "" || s.toLowerCase() === "null") return "NULL";
  if (type === "boolean") {
    if (/^(true|ja|yes|1)$/i.test(s)) return "TRUE";
    if (/^(false|nee|no|0)$/i.test(s)) return "FALSE";
    return "NULL";
  }
  if (type === "int" || type === "numeric") {
    const n = s.replace(",", ".");
    return n;
  }
  if (type === "date") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return "'" + s + "'::date";
    if (/^(\d{2})-(\d{2})-(\d{4})$/.test(s)) {
      const m = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
      return "'" + m[3] + "-" + m[2] + "-" + m[1] + "'::date";
    }
    return "NULL";
  }
  // text + timestamp: single-quote escape
  const esc = s.replace(/'/g, "''");
  return "'" + esc + "'";
}

function loadSchema(schemaPath) {
  if (!schemaPath || !existsSync(schemaPath)) return null;
  try {
    return JSON.parse(readFileSync(schemaPath, "utf8"));
  } catch (e) {
    console.error("[schema] kon niet parsen:", e.message);
    return null;
  }
}

function generateInserts(headers, rows, schema, detectedTypes) {
  if (!schema) {
    throw new Error("Geen schema-map gevonden. Maak scripts/bs2-csv-schemas/<resource>.json.");
  }
  const table = schema.table || "public.UNKNOWN";
  const colMap = schema.columns || {};
  const idStrategy = schema.id_strategy || "uuid_v5";

  // Splits BS1-kolommen van data_jsonb-velden
  const bs1Cols = []; // [{ bs2Header, bs1Col, type }]
  const dataCols = []; // [{ bs2Header, dataKey }]
  let bs2IdHeader = null;

  for (const [bs2Header, def] of Object.entries(colMap)) {
    if (def.bs1) {
      bs1Cols.push({ bs2Header, bs1Col: def.bs1, type: def.type || detectedTypes[bs2Header] || "text" });
      if (def.is_bs2_id) bs2IdHeader = bs2Header;
    } else if (def.data_jsonb) {
      dataCols.push({ bs2Header, dataKey: def.data_jsonb, type: def.type || detectedTypes[bs2Header] || "text" });
    }
  }

  const inserts = [];

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const cells = headers.map((h, i) => row[i] || "");

    // Bouw kolom-lijst
    const colNames = bs1Cols.map((c) => c.bs1Col);
    const values = bs1Cols.map((c) => {
      const idx = headers.indexOf(c.bs2Header);
      return sqlLiteral(cells[idx], c.type);
    });

    // Data jsonb
    if (dataCols.length) {
      const pairs = dataCols.map((d) => {
        const idx = headers.indexOf(d.bs2Header);
        const raw = cells[idx];
        if (raw == null || String(raw).trim() === "") return null;
        const k = "'" + d.dataKey.replace(/'/g, "''") + "'";
        let v;
        if (d.type === "boolean") {
          v = /^(true|ja|yes|1)$/i.test(raw) ? "TRUE" : (/^(false|nee|no|0)$/i.test(raw) ? "FALSE" : "NULL");
          if (v === "NULL") return null;
        } else if (d.type === "int" || d.type === "numeric") {
          const n = String(raw).trim().replace(",", ".");
          if (!/^-?\d+(\.\d+)?$/.test(n)) return null;
          v = n;
        } else {
          v = "'" + String(raw).replace(/'/g, "''") + "'";
        }
        return k + ", " + v;
      }).filter(Boolean);
      if (pairs.length) {
        colNames.push("data");
        values.push("jsonb_build_object(" + pairs.join(", ") + ")");
      }
    }

    const sql = "INSERT INTO " + table
      + " (" + colNames.join(", ") + ") VALUES ("
      + values.join(", ") + ") ON CONFLICT (id) DO NOTHING;";
    inserts.push(sql);
  }

  return inserts;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.resource) {
    console.error("Usage: node scripts/bs2-csv-import.mjs <resource> [--dry-run] [--out <pad>] [--schema <pad>] [--limit N]");
    process.exit(1);
  }
  const csvPath = join(EXPORTS_DIR, args.resource + ".csv");
  if (!existsSync(csvPath)) {
    console.error("CSV niet gevonden:", csvPath);
    console.error("Plaats eerst de export in deze map.");
    process.exit(2);
  }
  const text = readFileSync(csvPath, "utf8");
  const rows = parseCsv(text);
  if (!rows.length) {
    console.error("CSV is leeg.");
    process.exit(3);
  }
  const headers = rows[0];
  let dataRows = rows.slice(1);
  if (args.limit) dataRows = dataRows.slice(0, args.limit);
  const detectedTypes = detectTypes(headers, dataRows);

  console.error("== BS2 CSV importer ==");
  console.error("Resource    :", args.resource);
  console.error("CSV-bestand :", csvPath);
  console.error("Kolommen    :", headers.length);
  console.error("Rijen       :", dataRows.length + " (excl. header)");
  console.error("Type-detect :");
  for (const h of headers) {
    console.error("  - " + h + ": " + detectedTypes[h]);
  }

  if (args.dryRun) {
    console.error("\n-- DRY-RUN: geen SQL gegenereerd. Maak een schema-map in scripts/bs2-csv-schemas/" + args.resource + ".json --");
    return;
  }

  const schemaPath = args.schema || join(SCHEMAS_DIR, args.resource + ".json");
  const schema = loadSchema(schemaPath);
  if (!schema) {
    console.error("\nGEEN schema-map gevonden op:", schemaPath);
    console.error("Maak deze JSON aan (zie scripts/bs2-csv-import.mjs header voor format).");
    console.error("Skeleton wordt nu hieronder uitgeprint:\n");
    const skeleton = {
      table: "public." + args.resource,
      id_strategy: "bs2_id",
      columns: Object.fromEntries(headers.map((h) => [h, { bs1: h.toLowerCase().replace(/\s+/g, "_"), type: detectedTypes[h] }])),
    };
    console.log(JSON.stringify(skeleton, null, 2));
    process.exit(4);
  }

  const inserts = generateInserts(headers, dataRows, schema, detectedTypes);
  const output = inserts.join("\n") + "\n";
  if (args.out) {
    writeFileSync(args.out, output, "utf8");
    console.error("\nSQL geschreven naar:", args.out, "(" + inserts.length + " statements)");
  } else {
    process.stdout.write(output);
    console.error("\n(" + inserts.length + " INSERT-statements naar stdout)");
  }
}

main();
