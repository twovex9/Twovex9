// Test: nachttoeslag-engine rond middernacht — correct toepassen én niet over-toepassen.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
globalThis.window = {};
require("../ort-engine.js");
const eng = globalThis.window.ffOrtEngine;

const rules = [{ dag: "Maandag - Vrijdag", start: "22:00", end: "06:00", percentage: 140, priority: 5 }];
function dateOnWeekday(targetDay) { // 0=zo..6=za
  let d = new Date(2026, 5, 1);
  while (d.getDay() !== targetDay) d.setDate(d.getDate() + 1);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function run(label, datum, start, eind, expect140, expect100) {
  const split = eng.splitRecordByOrtRules({ datum, starttijd: start, eindtijd: eind }, rules, []);
  const m140 = split["140"] || 0, m100 = split["100"] || 0;
  const ok = m140 === expect140 && m100 === expect100;
  console.log((ok ? "✅" : "❌") + " " + label + " — 140%:" + m140 + " (verw " + expect140 + "), 100%:" + m100 + " (verw " + expect100 + ")");
  return ok;
}

let all = true;
// Ma 22:00 → di 06:00: alles nachttoeslag (di 00-06 = wrap van maandag, ma in ma-vr)
all &= run("ma-nacht→di-ochtend", dateOnWeekday(1), "22:00", "06:00", 480, 0);
// Di dagdienst 09:00–17:00: geen toeslag
all &= run("di-dagdienst", dateOnWeekday(2), "09:00", "17:00", 0, 480);
// Vr 22:00 → za 06:00: vrijdag in ma-vr → za-ochtend (wrap) telt mee
all &= run("vr-nacht→za-ochtend", dateOnWeekday(5), "22:00", "06:00", 480, 0);
// Za 22:00 → zo 06:00: zaterdag NIET in ma-vr → 22-24 geen toeslag; zo-ochtend
// is wrap van zaterdag (niet in ma-vr) → ook geen toeslag.
all &= run("za-nacht→zo-ochtend (geen regel)", dateOnWeekday(6), "22:00", "06:00", 0, 480);
console.log(all ? "\nALLE CASES OK ✅" : "\nFAALT ❌");
process.exit(all ? 0 : 1);
