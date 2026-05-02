/**
 * Standaardcatalogus opleidingen (HR). Geladen vóór opleidingen.js, script.js en medewerker.js.
 */
(function () {
  var raw = [
    "HAVO",
    "HBO Bachelor media en Entertainment (Media en Entertainment management)",
    "MBO4 Commercieel medewerker bank- en verzekeringswezen",
    "Faculteit der Maatschappij- en gedragswetenschappen",
    "MBO4 Apothekersassistent",
    "Certificaat - Dossier opbouw en ontslag",
    "Certificaat - Omgaan met verzuim voor leidinggevenden",
    "Certificaat - Timemanagement en zelfmanagement",
    "HBO Bachelor bedrijfskunde",
    "Beroepscoach",
    "MBO Sociaal- Maatschappelijk Dienstverlener",
    "Verdiepende training Beroepscode, Tuchtrecht & Beroepsethiek",
    "Sociaal pedagogisch werker 3 - kinderopvang",
    "Certificaat Basistraining Beroepscode Tuchtrecht beroepsethiek",
    "Certificaat training feitelijk en Zorgvuldig rapporteren",
    "MBO4 Sociaal Pedagogisch werker",
    "HBO Bachelor Sociaal Pedagogische Hulpverlening Propedeuse",
    "Bachelor Social Work",
    "HBO Bachelor Sociaal Pedagogische Hulpverlening",
    "MBO4 Doktersassistent",
    "HBO Bachelor Toegepaste Psychologie Propedeuse Bachelor",
    "HBO Bachelor Toegepaste Psychologie",
    "MBO4 Pedagogisch medewerker jeugdzorg",
    "HBO Social work",
    "MBO2 Diploma Gastvrouw",
    "MBO3 Zelfstandig werkende gastvrouw",
    "Certificaat EMV",
    "Certificaat Logistieke dienst",
    "VWO Diploma",
    "MBO4 Manager handel (Filiaalmanager)",
    "MBO4 Personeelsplanner",
    "Human Resource Management A",
    "MBO4 Legal, insurance & HR Services Specialist",
    "MBO4 Sociaal-Cultureel Werker",
    "HBO Sociaal Pedagogisch Hulpverlening",
    "HR Core Business Basis",
    "HBO Bachelor Pedagogiek Propedeuse bachelor (Educational Theory)",
    "Diploma HAVO",
    "Sociaal maatschappelijk dienstverlener",
    "HBO Bachelor Social Work Propedeuse bachelor",
    "Gespecialiseerd pedagogisch medewerker",
    "Verbindend Gezag en Geweldloos Verzet",
    "Preventiemedewerker",
    "Manualmaster Documenteren",
    "Meldcode, huiselijk geweld en kindermishandeling",
    "Vaardigheidsdiploma Machineschrijven",
    "Notuleren",
    "Wordperfect 4.2->5.1",
    "Vertrouwenspersoon",
    "Excel 2013 Gevorderd",
    "Dienstverlening- en gezondheidszorg",
    "Werken met de verwijsindex",
    "Diploma MBO3 Verzorgende IG",
    "MBO4 Pedagogisch medewerker 4 jeugdzorg",
    "WO Bachelor Psychologie",
    "WO Master Psychologie",
    "HBO Bachelor Sociaal pedagogisch Hulpverlening",
    "Diploma",
    "Certificaat Meldcode, huiselijk geweld en kindermishandeling",
    "Certificaat Girlstalk",
    "Diploma MBO4 Maatschappelijke zorg",
    "Omgaan met Agressie",
    "MBO4 Gespecialiseerd Pedagogisch medewerker",
    "VMBO diploma",
    "MBO4 Pedagogisch medewerker",
    "MBO4 Sociaal maatschappelijk dienstverlener",
    "MBO3 Verkoopspecialist detailhandel",
    "VMBO",
    "Agogisch medewerker GGZ",
  ];
  window.OPLEIDINGEN_DEFAULT_NAMEN = [...new Set(raw)].sort(function (a, b) {
    return a.localeCompare(b, "nl", { sensitivity: "base" });
  });
})();

(function mergeOpleidingenCatalogIntoLocalStorage() {
  try {
    var KEY = "opleidingen";
    var catalog = window.OPLEIDINGEN_DEFAULT_NAMEN;
    if (!catalog || !catalog.length) return;
    var raw = localStorage.getItem(KEY);
    var existing = [];
    if (raw) {
      try {
        existing = JSON.parse(raw);
      } catch (e) {
        existing = [];
      }
    }
    if (!Array.isArray(existing)) existing = [];
    var seen = Object.create(null);
    existing.forEach(function (o) {
      var n = (o && o.naam ? String(o.naam) : "").trim().toLowerCase();
      if (n) seen[n] = true;
    });
    var merged = existing.slice();
    var idx = merged.length;
    function genId() {
      return "opl_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
    }
    catalog.forEach(function (naam) {
      var key = String(naam).trim().toLowerCase();
      if (!key || seen[key]) return;
      seen[key] = true;
      var created = new Date(2025, Math.floor(idx / 3), 1 + (idx % 28) * 2, 10 + (idx % 14), (idx * 7) % 60);
      merged.push({
        id: genId(),
        naam: naam,
        skj: false,
        aanmaakdatum: created.toISOString(),
        laatstGewijzigd: created.toISOString(),
        archived: false,
      });
      idx++;
    });
    if (merged.length !== existing.length) {
      localStorage.setItem(KEY, JSON.stringify(merged));
    }
  } catch (e) {
    console.error("mergeOpleidingenCatalogIntoLocalStorage:", e);
  }
})();
