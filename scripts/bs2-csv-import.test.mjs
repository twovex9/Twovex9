#!/usr/bin/env node
/**
 * bs2-csv-import.test.mjs — smoke-test voor de CSV-importer.
 *
 * Genereert een tijdelijke test-CSV met dummy data, draait de importer
 * in dry-run mode, en checkt of de type-detectie en SQL-generatie werken.
 *
 * Usage: node scripts/bs2-csv-import.test.mjs
 */
import { writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXPORTS_DIR = join(__dirname, "bs2-exports");
const SCHEMAS_DIR = join(__dirname, "bs2-csv-schemas");
const TEST_CSV = join(EXPORTS_DIR, "_test_smoke.csv");
const TEST_SCHEMA = join(SCHEMAS_DIR, "_test_smoke.json");

const fakeCsv = [
  "ID,Naam,Geboortedatum,Aantal,Actief,Notitie",
  '"bs2-001","Jan, Pieterszn","1990-05-12",3,true,"Met komma in naam"',
  '"bs2-002","Anna ""Sanne"" de Vries","12-08-1985",0,nee,""',
  '"bs2-003","Multi\nline\ntest","2000-01-01",-5,false,"Special: 50%"',
].join("\n");

const fakeSchema = {
  table: "public._test_smoke",
  id_strategy: "bs2_id",
  columns: {
    "ID": { "bs1": "id", "type": "text", "is_bs2_id": true },
    "Naam": { "bs1": "naam", "type": "text" },
    "Geboortedatum": { "bs1": "geboortedatum", "type": "date" },
    "Aantal": { "data_jsonb": "bs2_aantal", "type": "int" },
    "Actief": { "data_jsonb": "bs2_actief", "type": "boolean" },
    "Notitie": { "data_jsonb": "bs2_notitie", "type": "text" },
  },
};

function cleanup() {
  if (existsSync(TEST_CSV)) unlinkSync(TEST_CSV);
  if (existsSync(TEST_SCHEMA)) unlinkSync(TEST_SCHEMA);
}

function run() {
  cleanup();
  writeFileSync(TEST_CSV, fakeCsv, "utf8");
  writeFileSync(TEST_SCHEMA, JSON.stringify(fakeSchema, null, 2), "utf8");

  try {
    const importer = join(__dirname, "bs2-csv-import.mjs");

    // Dry-run test
    console.log("=== Test 1: dry-run ===");
    const dryRun = execSync(
      `node "${importer}" _test_smoke --dry-run`,
      { encoding: "utf8" }
    );
    console.log(dryRun);

    // SQL generation test
    console.log("\n=== Test 2: SQL output ===");
    const sql = execSync(
      `node "${importer}" _test_smoke`,
      { encoding: "utf8" }
    );
    console.log(sql);

    // Assertions
    const assertions = [
      { name: "3 INSERT statements", check: (sql.match(/INSERT INTO/g) || []).length === 3 },
      { name: "table = public._test_smoke", check: sql.includes("public._test_smoke") },
      { name: "id bs2-001 in eerste insert", check: sql.includes("'bs2-001'") },
      { name: "datum geconverteerd 12-08-1985 → 1985-08-12", check: sql.includes("'1985-08-12'::date") },
      { name: "boolean true → TRUE", check: sql.includes("'bs2_actief', TRUE") },
      { name: "boolean nee → FALSE", check: sql.includes("'bs2_actief', FALSE") },
      { name: "ON CONFLICT (id) DO NOTHING", check: sql.includes("ON CONFLICT (id) DO NOTHING") },
      { name: "Komma in naam ge-escaped", check: sql.includes("'Jan, Pieterszn'") },
      { name: "Quoted quotes correct", check: sql.includes("'Anna \"Sanne\" de Vries'") },
    ];

    console.log("=== Assertions ===");
    let passed = 0;
    for (const a of assertions) {
      const symbol = a.check ? "✅" : "❌";
      console.log(symbol + " " + a.name);
      if (a.check) passed++;
    }
    console.log(`\n${passed}/${assertions.length} passed`);
    if (passed !== assertions.length) {
      process.exit(1);
    }
  } finally {
    cleanup();
  }
}

run();
