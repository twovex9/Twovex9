#!/usr/bin/env node
/**
 * v3 Module 1 Home — Bug #84 fix: upload nieuws-thumbnails naar Supabase Storage
 *
 * Reads JPG-bestanden uit `C:\Users\sonck\OneDrive\Desktop\Nieuwe map (5)`
 * Upload naar bucket `nieuws-images` met public URL access.
 * Daarna UPDATE op nieuws.image per record (via separate SQL).
 *
 * VEREIST:
 *   $env:SUPABASE_SERVICE_ROLE_KEY = '...'
 *   node scripts/upload-nieuws-images.mjs
 */

import fs from "fs";
import path from "path";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://ukjflilnhigozfoxowmj.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "nieuws-images";
const SOURCE_DIR = "C:\\Users\\sonck\\OneDrive\\Desktop\\Nieuwe map (5)";

if (!SERVICE_KEY) {
  console.error("FOUT: SUPABASE_SERVICE_ROLE_KEY ontbreekt in env.");
  process.exit(1);
}

if (!fs.existsSync(SOURCE_DIR)) {
  console.error("FOUT: source-dir bestaat niet:", SOURCE_DIR);
  process.exit(1);
}

const files = fs.readdirSync(SOURCE_DIR).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
console.log(`Vond ${files.length} afbeeldingen in ${SOURCE_DIR}`);

const results = [];

for (const file of files) {
  const fullPath = path.join(SOURCE_DIR, file);
  const buffer = fs.readFileSync(fullPath);
  const ext = path.extname(file).toLowerCase();
  const contentType = ext === ".png" ? "image/png" : "image/jpeg";

  process.stdout.write(`Uploading ${file} (${(buffer.length / 1024).toFixed(0)} KB)... `);

  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURIComponent(file)}`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: buffer,
  });

  if (!r.ok) {
    const err = await r.text();
    console.log(`FAIL ${r.status}: ${err}`);
    results.push({ file, ok: false, error: err });
    continue;
  }

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${encodeURIComponent(file)}`;
  console.log(`OK -> ${publicUrl}`);
  results.push({ file, ok: true, publicUrl });
}

console.log("\n=== EINDREPORT ===");
console.log(`Geüpload: ${results.filter(r => r.ok).length} / ${results.length}`);

if (results.some(r => !r.ok)) {
  console.log("\nFouten:");
  results.filter(r => !r.ok).forEach(r => console.log(`  - ${r.file}: ${r.error}`));
}

console.log("\nMapping JSON (voor SQL UPDATE):");
console.log(JSON.stringify(results.filter(r => r.ok).map(r => ({ file: r.file, url: r.publicUrl })), null, 2));
