/* Salarisadministratie — export + ORT (localStorage; zelfde keys als vorige versie) */
(function () {
  "use strict";

  var HISTORY_KEY = "saladmin_export_history";
  var ORT_KEY = "saladmin_ort_rules";

  function showToast(message) {
    var backdrop = document.getElementById("app-toast-backdrop");
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.id = "app-toast-backdrop";
      backdrop.className = "app-toast-backdrop";
      document.body.appendChild(backdrop);
    }
    var toast = document.getElementById("app-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "app-toast";
      toast.className = "app-toast app-toast--centered";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    backdrop.classList.remove("is-visible");
    toast.classList.remove("is-visible");
    void backdrop.offsetWidth;
    void toast.offsetWidth;
    backdrop.classList.add("is-visible");
    toast.classList.add("is-visible");
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(function () {
      if (toast) toast.classList.remove("is-visible");
      if (backdrop) backdrop.classList.remove("is-visible");
    }, 2200);
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function fmtDateTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso || "");
    return pad2(d.getDate()) + "-" + pad2(d.getMonth() + 1) + "-" + d.getFullYear();
  }

  function fmtPeriod(month, year) {
    var m = parseInt(month, 10) || 1;
    var y = parseInt(year, 10) || new Date().getFullYear();
    var names = ["Januari","Februari","Maart","April","Mei","Juni","Juli","Augustus","September","Oktober","November","December"];
    return (names[m - 1] || "Maand") + " " + y;
  }

  function safeJsonParse(raw, fallback) {
    try {
      var v = JSON.parse(raw);
      return v === undefined ? fallback : v;
    } catch {
      return fallback;
    }
  }

  function getEmployees() {
    try {
      var raw = localStorage.getItem("employees");
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function employeeDisplayName(e) {
    var v = (e && (e.voornaam || e.firstName) ? String(e.voornaam || e.firstName) : "").trim();
    var a = (e && (e.achternaam || e.lastName) ? String(e.achternaam || e.lastName) : "").trim();
    var full = (v + " " + a).trim();
    return full || (e && e.naam ? String(e.naam) : "") || "Medewerker";
  }

  function getValidationIssuesForEmployee(e) {
    var issues = [];
    if (!e) return issues;
    var iban = String(e.iban || e.IBAN || e.profIban || e.bankrekening || "").trim();
    var email = String(e.email || e.profEmail || "").trim();
    var start = String(e.startdatum || "").trim();
    if (!email) issues.push("E-mailadres ontbreekt");
    if (!iban) issues.push("IBAN ontbreekt");
    if (!start) issues.push("Startdatum ontbreekt");
    return issues;
  }

  /**
   * BS2-parity validatie voor de gekozen maand/jaar.
   * Per Loondienst-medewerker (employment_type=permanent) wordt gecheckt:
   *   - Kilometerdeclaratie niet ingediend (geen of status=draft voor die maand)
   *   - Unapproved time registrations (werkuren in die maand met vergrendeld=false)
   * Toont label "<naam> (<persnr>)" net als in BS2.
   */
  function computeValidationList() {
    var month = monthSel ? parseInt(monthSel.value, 10) : null;
    var year = yearSel ? parseInt(yearSel.value, 10) : null;
    if (!month || !year) return [];
    var mws = (typeof getMedewerkers === "function" ? getMedewerkers() : getEmployees())
      .filter(function (m) {
        return m && !m.archived && (typeof isLoondienst === "function" ? isLoondienst(m) : true);
      });
    var out = [];
    mws.forEach(function (mw) {
      var issues = [];
      // 1) Kilometerdeclaratie ingediend?
      if (window.kilometerDeclaratiesDB && window.kilometerDeclaratiesDB.getForMedewerkerSync) {
        var decls = window.kilometerDeclaratiesDB.getForMedewerkerSync(mw.id) || [];
        var decl = decls.filter(function (d) {
          return d && Number(d.jaar) === Number(year) && Number(d.maand) === Number(month);
        })[0];
        if (!decl) {
          issues.push("Kilometerdeclaratie niet ingediend");
        } else {
          var st = (decl.submissionStatus && decl.submissionStatus.status) || decl.status || "draft";
          if (st === "draft") issues.push("Kilometerdeclaratie niet ingediend");
        }
      }
      // 2) Unapproved time registrations?
      if (window.werkurenDB && window.werkurenDB.getForMedewerkerMonthSync) {
        var werkuren = window.werkurenDB.getForMedewerkerMonthSync(mw.id, year, month) || [];
        var unapproved = werkuren.filter(function (w) { return w && !w.vergrendeld; });
        if (unapproved.length > 0) issues.push("Unapproved time registrations");
      }
      if (issues.length > 0) {
        var persnr = mw.personeelsnummer != null ? " (" + mw.personeelsnummer + ")" : "";
        out.push({
          name: ((mw.voornaam || "") + " " + (mw.achternaam || "")).trim() + persnr,
          issues: issues,
        });
      }
    });
    return out;
  }

  function readHistory() {
    var raw = localStorage.getItem(HISTORY_KEY);
    var list = raw ? safeJsonParse(raw, []) : [];
    if (!Array.isArray(list) || !list.length) {
      var seed = [
        { id: "seed_1", createdAt: "2026-03-11T10:10:00", period: "Maart 2026", employees: 31, by: "Vennie Küster", csv: null },
        { id: "seed_2", createdAt: "2026-03-18T10:10:00", period: "Februari 2026", employees: 31, by: "Vennie Küster", csv: null },
        { id: "seed_3", createdAt: "2026-02-15T10:10:00", period: "Januari 2026", employees: 33, by: "Artem Fetchoj", csv: null },
      ];
      // Seeds zijn ALLEEN demo-weergave: NIET naar localStorage schrijven (gedeelde sleutel
      // met saladminDB) en NIET synct naar Supabase. Anders kan een export vóór de
      // DB-bootstrap de echte export-historie overschrijven/wissen (DIEHARD).
      return seed;
    }
    return list;
  }

  function writeHistory(list) {
    // Filter demo-seeds eruit zodat ze nooit naar de gedeelde cache of naar Supabase lekken.
    var clean = (Array.isArray(list) ? list : []).filter(function (r) {
      return r && !(typeof r.id === "string" && r.id.indexOf("seed_") === 0);
    });
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(clean));
    } catch {}
    if (window.saladminDB && typeof window.saladminDB.pushHistory === "function") {
      try { window.saladminDB.pushHistory(clean); } catch (e) { /* */ }
    }
  }

  function downloadText(filename, text, mime) {
    var blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 500);
  }

  function toCsvRow(cells) {
    return cells
      .map(function (c) {
        var s = c === null || c === undefined ? "" : String(c);
        if (/[\",\n;]/.test(s)) s = "\"" + s.replace(/\"/g, "\"\"") + "\"";
        return s;
      })
      .join(";");
  }

  function buildCsvForPeriod(period) {
    var emps = getEmployees();
    var rows = [];
    rows.push(toCsvRow(["Periode", period]));
    rows.push(toCsvRow(["Aangemaakt op", new Date().toISOString()]));
    rows.push("");
    rows.push(toCsvRow(["Medewerker", "E-mail", "IBAN", "Startdatum"]));
    if (!emps.length) {
      rows.push(toCsvRow(["Demo medewerker", "", "", ""]));
      return rows.join("\n");
    }
    emps.forEach(function (e) {
      rows.push(
        toCsvRow([
          employeeDisplayName(e),
          e.email || e.profEmail || "",
          e.iban || e.IBAN || e.profIban || e.bankrekening || "",
          e.startdatum || "",
        ])
      );
    });
    return rows.join("\n");
  }

  // -----------------------------------------------------------------------
  // Loket-XLSX-export (BS2-parity)
  //
  // Bouwt het exacte BS2-bestand "Payroll_Statement_<YYYY-MM>_<ts>.xlsx":
  //   - 4 header-rijen ("Productie opgave …", periode, datum, auteur)
  //   - 1 kolom-header-rij (A..P): Medewerker, Medewerkersnummer, ORT
  //     100/125/130/145% (uren), Werk km, Woon km, Totaal KM vergoeding €,
  //     Vakantieverlof, Totaal verlofuren, Vroege/Late/Geen ploegen/Waakdienst,
  //     Totaal gewerkte uren.
  //   - 1 rij per Loondienst-medewerker met aggregaties uit:
  //       - besaOrtEngine.computeOrtForEmployee → ORT %/dienst/totaal
  //       - kilometerDeclaratiesDB → Werk/Woon km + vergoeding
  //       - verlofDB → vakantieverlof + totaal verlofuren
  //   - 4 toelichting-rijen onderaan (rij 32-35 in BS2-mei-export)
  //
  // ORT-kolommen zijn dynamisch: alleen percentages die >0 voorkomen in deze
  // maand krijgen een kolom. BS2 doet hetzelfde (mei 2026 had geen 200%).
  // -----------------------------------------------------------------------

  var LOET_HEADERS_FIXED = {
    medewerker: "Medewerker",
    medewerkersnummer: "Medewerkersnummer",
    werkKm: "Werk kilometers - totaal",
    woonKm: "Woon kilometers - totaal",
    kmVergoeding: "Totaal KM vergoeding (€)",
    vakantieverlof: "Vakantieverlof (uren) - 100% werkgever",
    totaalVerlof: "Totaal verlofuren",
    vroege: "Vroege dienst (uren)",
    late: "Late dienst (uren)",
    geen: "Geen ploegendiensttype (uren)",
    waak: "Waakdienst (uren)",
    totaalGewerkt: "Totaal gewerkte uren",
    // G7 — extra kolommen voor de salarisadministratie (achteraan toegevoegd zodat
    // het bestaande BS2-kolomblok ongewijzigd blijft).
    overuren: "Overuren (uren) - indicatief",
    ziekteUren: "Ziekteverzuim (uren)",
    contractvorm: "Contractvorm",
    brutoMaand: "Bruto maandsalaris (€)",
  };

  function isLoondienst(emp) {
    if (!emp) return false;
    var dv = String(emp.dienstverband || emp.employment_type || "").toLowerCase();
    return dv === "loondienst" || dv === "permanent" || dv === "vast";
  }

  function getMedewerkers() {
    if (window.medewerkersDB && typeof window.medewerkersDB.getAllSync === "function") {
      return window.medewerkersDB.getAllSync() || [];
    }
    return getEmployees();
  }

  function nlNum2(v) {
    var n = Number(v || 0);
    if (!isFinite(n)) n = 0;
    return n.toFixed(2).replace(".", ",");
  }

  // Aggregeer kilometers per medewerker × maand uit kilometer_declaraties +
  // kilometer_records. type "office" = woon-werk (kolom H), type "manual" =
  // werk-werk (kolom G). Totaal-vergoeding pakt total_reimbursement van de
  // declaratie (verbatim BS2, met €0,39/km × cap 100 km/rit).
  function aggregateKilometers(medewerkerId, year, month) {
    var out = { werkKm: 0, woonKm: 0, vergoedingEur: 0 };
    if (!window.kilometerDeclaratiesDB) return out;
    var decls = window.kilometerDeclaratiesDB.getForMedewerkerSync
      ? window.kilometerDeclaratiesDB.getForMedewerkerSync(medewerkerId)
      : [];
    var decl = (decls || []).filter(function (d) {
      return d && Number(d.jaar) === Number(year) && Number(d.maand) === Number(month);
    })[0];
    if (!decl) return out;
    out.vergoedingEur = Number(decl.totalReimbursement || 0);
    var recs = window.kilometerDeclaratiesDB.getRecordsForDeclaratieSync
      ? window.kilometerDeclaratiesDB.getRecordsForDeclaratieSync(decl.id)
      : [];
    (recs || []).forEach(function (r) {
      // Werk-werk dat op goedkeuring wacht (pending) of is afgewezen telt NIET
      // mee; woon-werk en goedgekeurd/legacy (approval_status NULL) wél —
      // spiegelt exact recCountsTowardTotal() in kilometer-declaraties-data.js.
      // Voorheen toetste de gate op type "werkwerk" (bestaat niet; de types zijn
      // office/manual/automatic), waardoor de goedkeurings-gate dood was en ook
      // pending/afgewezen werk-werk-km in de Loket-export terechtkwam.
      var st = r.approvalStatus != null ? r.approvalStatus : (r.approval_status || null);
      if (st === "pending" || st === "rejected") return;
      var km = Number(r.kilometers || 0);
      if (r.type === "office") out.woonKm += km;
      else out.werkKm += km;
    });
    return out;
  }

  // Verlof-aggregatie per medewerker × maand. Telt alleen goedgekeurde
  // aanvragen waarvan periode overlapt met de maand. Conversie dagen → uren
  // gebeurt via contracturen/5 (default 8u bij ontbrekend contract).
  function aggregateVerlof(medewerker, year, month) {
    var out = { vakantieverlofUren: 0, totaalVerlofUren: 0 };
    if (!window.verlofDB || !medewerker) return out;
    var list = window.verlofDB.getForMedewerkerSync
      ? (window.verlofDB.getForMedewerkerSync(medewerker.id) || [])
      : [];
    var contracturen = Number(medewerker.contracturen || 36);
    if (!isFinite(contracturen) || contracturen <= 0) contracturen = 36;
    var urenPerDag = contracturen / 5;
    var monthStart = new Date(year, month - 1, 1);
    var monthEnd = new Date(year, month, 0, 23, 59, 59);
    list.forEach(function (v) {
      if (!v || v.status !== "goedgekeurd") return;
      var s = v.startDatum ? new Date(v.startDatum) : null;
      var e = v.eindDatum ? new Date(v.eindDatum) : null;
      if (!s || !e || isNaN(s.getTime()) || isNaN(e.getTime())) return;
      // overlap-check
      if (e < monthStart || s > monthEnd) return;
      // dagen die binnen deze maand vallen (proxy: aantalDagen × overlap-fraction)
      var overlapStart = s < monthStart ? monthStart : s;
      var overlapEnd = e > monthEnd ? monthEnd : e;
      var overlapDagen = Math.max(1, Math.round((overlapEnd - overlapStart) / (24 * 3600 * 1000)) + 1);
      var dagenTotaal = Number(v.aantalDagen || overlapDagen);
      // pro-rata als verlof langer is dan de overlap met deze maand
      var span = Math.max(1, Math.round((e - s) / (24 * 3600 * 1000)) + 1);
      var dagenInMaand = dagenTotaal * (overlapDagen / span);
      var uren = dagenInMaand * urenPerDag;
      out.totaalVerlofUren += uren;
      if (v.type === "wettelijk" || v.type === "bovenwettelijk") {
        out.vakantieverlofUren += uren;
      }
    });
    out.vakantieverlofUren = Math.round(out.vakantieverlofUren * 100) / 100;
    out.totaalVerlofUren = Math.round(out.totaalVerlofUren * 100) / 100;
    return out;
  }

  // G7 — Ziekteverzuim-uren per medewerker × maand. Telt overlap van verzuim-
  // perioden (kort/lang) met de maand × contracturen/5. Einde = werkelijke terug,
  // anders verwachte terug, anders einde maand (nog ziek).
  function aggregateZiekte(medewerker, year, month) {
    var out = { ziekteUren: 0 };
    if (!window.medewerkerVerzuimDB || !medewerker || !window.medewerkerVerzuimDB.getForMedewerkerSync) return out;
    var list = window.medewerkerVerzuimDB.getForMedewerkerSync(medewerker.id) || [];
    var contracturen = Number(medewerker.contracturen || 36);
    if (!isFinite(contracturen) || contracturen <= 0) contracturen = 36;
    var urenPerDag = contracturen / 5;
    var monthStart = new Date(year, month - 1, 1);
    var monthEnd = new Date(year, month, 0, 23, 59, 59);
    list.forEach(function (p) {
      if (!p || !p.eerstZiektedag) return;
      var s = new Date(p.eerstZiektedag);
      if (isNaN(s.getTime())) return;
      var endStr = p.werkelijkeTerug || p.verwachteTerug || "";
      var e = endStr ? new Date(endStr) : monthEnd; // nog ziek → loopt door
      if (isNaN(e.getTime())) e = monthEnd;
      if (e < monthStart || s > monthEnd) return;
      var overlapStart = s < monthStart ? monthStart : s;
      var overlapEnd = e > monthEnd ? monthEnd : e;
      // werkdagen (ma-vr) in de overlap tellen
      var werkdagen = 0;
      var d = new Date(overlapStart.getFullYear(), overlapStart.getMonth(), overlapStart.getDate());
      while (d <= overlapEnd) {
        var wd = d.getDay();
        if (wd !== 0 && wd !== 6) werkdagen++;
        d.setDate(d.getDate() + 1);
      }
      out.ziekteUren += werkdagen * urenPerDag;
    });
    out.ziekteUren = Math.round(out.ziekteUren * 100) / 100;
    return out;
  }

  // G7 — Bruto maandsalaris uit het dossier (loondienst). Sparse data: leeg laten
  // als niet ingevuld. Accepteert "3132.66" en "€ 0,00"-achtige strings.
  function brutoMaandSalaris(mw) {
    var raw = (mw && (mw.salaris != null ? mw.salaris : (mw.data && mw.data.salaris))) || "";
    var s = String(raw).replace(/[^0-9.,]/g, "").replace(/\.(?=\d{3}\b)/g, "");
    if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
    var n = parseFloat(s);
    return isFinite(n) && n > 0 ? n : null;
  }

  function getCurrentUserDisplayName() {
    try {
      if (window.besaCurrentProfile && (window.besaCurrentProfile.voornaam || window.besaCurrentProfile.achternaam)) {
        return ((window.besaCurrentProfile.voornaam || "") + " " + (window.besaCurrentProfile.achternaam || "")).trim();
      }
    } catch (e) { /* */ }
    return "Onbekend";
  }

  /**
   * Genereer Loket-XLSX als SheetJS workbook + slim summary-object.
   * Return: { workbook, summary, medewerkers: [naam, persnr, ...] }
   */
  function buildLoketWorkbookForPeriod(month, year) {
    var monthInt = parseInt(month, 10) || (new Date().getMonth() + 1);
    var yearInt = parseInt(year, 10) || new Date().getFullYear();
    var periodLabel = fmtPeriod(monthInt, yearInt);
    var monthStr = pad2(monthInt) + "-" + yearInt;
    var firstDay = "01-" + monthStr.replace("-", "-");
    var lastDay = pad2(new Date(yearInt, monthInt, 0).getDate()) + "-" + monthStr;
    var now = new Date();
    var nowLabel = pad2(now.getDate()) + "-" + pad2(now.getMonth() + 1) + "-" + now.getFullYear()
      + " " + pad2(now.getHours()) + ":" + pad2(now.getMinutes());

    var allMw = getMedewerkers();
    var loondienstMw = allMw.filter(function (m) {
      return m && !m.archived && isLoondienst(m);
    });

    // Per medewerker aggregeren
    var aggregates = loondienstMw.map(function (mw) {
      var ort = window.besaOrtEngine
        ? window.besaOrtEngine.computeOrtForEmployee(mw.id, yearInt, monthInt)
        : { ortUren: {}, diensttypeUren: {}, totaalGewerkteUren: 0 };
      var km = aggregateKilometers(mw.id, yearInt, monthInt);
      var verlof = aggregateVerlof(mw, yearInt, monthInt);
      var ziekte = aggregateZiekte(mw, yearInt, monthInt);
      // Overuren (indicatief): gewerkt boven de maandnorm (contracturen × 52/12).
      var cu = Number(mw.contracturen || 36);
      if (!isFinite(cu) || cu <= 0) cu = 36;
      var maandnorm = cu * 52 / 12;
      var overuren = Math.max(0, Math.round(((ort.totaalGewerkteUren || 0) - maandnorm) * 100) / 100);
      return { mw: mw, ort: ort, km: km, verlof: verlof, ziekte: ziekte, overuren: overuren };
    });

    // Bepaal dynamische ORT-percentage-kolommen (alleen >0 in deze maand).
    var pctSet = {};
    aggregates.forEach(function (a) {
      Object.keys(a.ort.ortUren || {}).forEach(function (p) {
        if (Number(a.ort.ortUren[p]) > 0) pctSet[p] = true;
      });
    });
    var pctList = Object.keys(pctSet).map(function (p) { return parseInt(p, 10); })
      .filter(function (n) { return isFinite(n); })
      .sort(function (a, b) { return a - b; });
    // BS2 mei 2026 had 100/125/130/145 — als alle >0 nul opleveren, default
    // alsnog de standaardset zodat de export consistent blijft.
    if (pctList.length === 0) pctList = [100, 125, 130, 145];

    // Bouw rijen
    var rows = [];
    rows.push(["Productie opgave van alle medewerkers"]);
    rows.push(["Periode: van " + firstDay + " t/m " + lastDay]);
    rows.push(["Gegenereerd op: " + nowLabel]);
    rows.push(["Gemaakt door: " + getCurrentUserDisplayName()]);

    // Kolom-header-rij (rij 5 in BS2). Volgorde:
    //   Medewerker, Medewerkersnummer, ORT %..., Werk km, Woon km, KM €,
    //   Vakantieverlof, Totaal verlof, Vroege, Late, Geen, Waak, Totaal gewerkt
    var headerRow = [LOET_HEADERS_FIXED.medewerker, LOET_HEADERS_FIXED.medewerkersnummer];
    pctList.forEach(function (p) { headerRow.push("ORT " + p + "% (uren)"); });
    headerRow.push(LOET_HEADERS_FIXED.werkKm, LOET_HEADERS_FIXED.woonKm, LOET_HEADERS_FIXED.kmVergoeding);
    headerRow.push(LOET_HEADERS_FIXED.vakantieverlof, LOET_HEADERS_FIXED.totaalVerlof);
    headerRow.push(LOET_HEADERS_FIXED.vroege, LOET_HEADERS_FIXED.late, LOET_HEADERS_FIXED.geen, LOET_HEADERS_FIXED.waak);
    headerRow.push(LOET_HEADERS_FIXED.totaalGewerkt);
    headerRow.push(LOET_HEADERS_FIXED.overuren, LOET_HEADERS_FIXED.ziekteUren, LOET_HEADERS_FIXED.contractvorm, LOET_HEADERS_FIXED.brutoMaand);
    rows.push(headerRow);

    // Sort medewerkers op medewerkersnummer (asc), null laatst
    aggregates.sort(function (a, b) {
      var an = a.mw.personeelsnummer == null ? Infinity : Number(a.mw.personeelsnummer);
      var bn = b.mw.personeelsnummer == null ? Infinity : Number(b.mw.personeelsnummer);
      return an - bn;
    });

    aggregates.forEach(function (a) {
      var mw = a.mw, ort = a.ort, km = a.km, vl = a.verlof;
      var naam = ((mw.voornaam || "") + " " + (mw.achternaam || "")).trim();
      var persnr = mw.personeelsnummer != null ? Number(mw.personeelsnummer) : "";
      var row = [naam, persnr];
      pctList.forEach(function (p) {
        var v = ort.ortUren ? Number(ort.ortUren[p] || 0) : 0;
        row.push(v > 0 ? nlNum2(v) : "0,00");
      });
      row.push(km.werkKm > 0 ? nlNum2(km.werkKm) : "0,00");
      row.push(km.woonKm > 0 ? nlNum2(km.woonKm) : "0,00");
      row.push(km.vergoedingEur > 0 ? nlNum2(km.vergoedingEur) : "0,00");
      row.push(vl.vakantieverlofUren > 0 ? nlNum2(vl.vakantieverlofUren) : "0,00");
      row.push(vl.totaalVerlofUren > 0 ? nlNum2(vl.totaalVerlofUren) : "0,00");
      var dt = ort.diensttypeUren || {};
      row.push(dt["Vroege dienst"] ? nlNum2(dt["Vroege dienst"]) : "0,00");
      row.push(dt["Late dienst"] ? nlNum2(dt["Late dienst"]) : "0,00");
      row.push(dt["Geen ploegendiensttype"] ? nlNum2(dt["Geen ploegendiensttype"]) : "0,00");
      row.push(dt["Waakdienst"] ? nlNum2(dt["Waakdienst"]) : "0,00");
      row.push(ort.totaalGewerkteUren > 0 ? nlNum2(ort.totaalGewerkteUren) : "0,00");
      // G7 — extra kolommen: overuren, ziekte-uren, contractvorm, bruto maandsalaris.
      row.push(a.overuren > 0 ? nlNum2(a.overuren) : "0,00");
      row.push(a.ziekte && a.ziekte.ziekteUren > 0 ? nlNum2(a.ziekte.ziekteUren) : "0,00");
      row.push(mw.dienstverband || "Loondienst");
      var bruto = brutoMaandSalaris(mw);
      row.push(bruto != null ? nlNum2(bruto) : "");
      rows.push(row);
    });

    // Lege rijen 30-31 (volgens BS2-pattern), daarna toelichting
    rows.push([]);
    rows.push([]);
    rows.push(["TOELICHTING VERLOFTYPES EN SALARISVERWERKING"]);
    rows.push([]);
    rows.push(["100% Betaald door werkgever:"]);
    rows.push(["  • Vakantieverlof"]);

    // Build workbook via SheetJS
    if (typeof window.XLSX === "undefined") {
      throw new Error("SheetJS (XLSX) niet geladen — kan workbook niet bouwen.");
    }
    var ws = window.XLSX.utils.aoa_to_sheet(rows);
    // Kolombreedtes (overgenomen uit BS2: A=57.7, B=21.1, C-F=18.7, G-I=29.4, J=45.8, ...)
    ws["!cols"] = [
      { wch: 32 }, // A: Medewerker
      { wch: 18 }, // B: Medewerkersnummer
    ];
    pctList.forEach(function () { ws["!cols"].push({ wch: 18 }); });
    ws["!cols"].push({ wch: 26 }, { wch: 26 }, { wch: 26 }); // werk km, woon km, vergoeding
    ws["!cols"].push({ wch: 38 }, { wch: 18 }); // vakantie, totaal verlof
    ws["!cols"].push({ wch: 20 }, { wch: 20 }, { wch: 30 }, { wch: 20 }, { wch: 20 }); // dienst-typen + totaal
    ws["!cols"].push({ wch: 22 }, { wch: 20 }, { wch: 16 }, { wch: 22 }); // overuren, ziekte, contractvorm, bruto

    var wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, "Payroll " + monthStr);

    return {
      workbook: wb,
      summary: {
        period: periodLabel,
        monthInt: monthInt, yearInt: yearInt,
        employeeCount: aggregates.length,
        pctList: pctList,
      },
      filename: "Payroll_Statement_" + yearInt + "-" + pad2(monthInt) + "_"
        + yearInt + pad2(monthInt) + pad2(now.getDate())
        + "_" + pad2(now.getHours()) + pad2(now.getMinutes()) + pad2(now.getSeconds())
        + ".xlsx",
    };
  }

  function downloadXlsxWorkbook(filename, workbook) {
    if (typeof window.XLSX === "undefined") {
      throw new Error("SheetJS (XLSX) niet geladen.");
    }
    window.XLSX.writeFile(workbook, filename);
  }

  /**
   * Sprint 7 / S7 — Dienst-gebaseerde export (BS2 parity).
   * Maakt een CSV met één regel per dienst (planning-item) in plaats van per
   * medewerker. Pakt huidige `planning` cache, filtert op maand/jaar van de
   * gekozen periode. Output: Datum, Start, Einde, Medewerker, Diensttype,
   * Locatie, Uren, Pauze, Netto uren, Tarief, Bruto.
   */
  function buildShiftCsvForPeriod(period, month, year) {
    var rows = [];
    rows.push(toCsvRow(["Periode", period]));
    rows.push(toCsvRow(["Type", "Dienst-gebaseerd"]));
    rows.push(toCsvRow(["Aangemaakt op", new Date().toISOString()]));
    rows.push("");
    rows.push(toCsvRow([
      "Datum", "Start", "Einde", "Medewerker", "Diensttype",
      "Locatie", "Uren", "Pauze (u)", "Netto uren", "Tarief", "Bruto",
    ]));

    var planning = [];
    try {
      if (window.planningDB && typeof window.planningDB.getAllSync === "function") {
        planning = window.planningDB.getAllSync() || [];
      } else {
        // Fallback wanneer planning-data.js (nog) niet geladen is. De canonieke
        // localStorage-cache-key van planning-data.js is "planningItems" (NIET
        // "planning_items_v1" — die bestaat niet en gaf een leeg document).
        var raw = localStorage.getItem("planningItems");
        if (raw) {
          var parsed = JSON.parse(raw);
          planning = Array.isArray(parsed) ? parsed : [];
        }
      }
    } catch (e) {
      planning = [];
    }

    var TARIEF = 45;
    var monthInt = parseInt(month, 10) || 0;
    var yearInt = parseInt(year, 10) || 0;
    var filtered = planning.filter(function (p) {
      if (!p || !p.start) return false;
      // Wandklok-maand (fake-UTC): vergelijk op de ISO-string i.p.v. new Date().getMonth(),
      // anders rolt een dienst op de maandgrens (bv. de 31e om 23:00) naar de verkeerde maand.
      var ym = String(p.start).slice(0, 7); // "YYYY-MM"
      if (ym.length < 7) return false;
      var yy = parseInt(ym.slice(0, 4), 10);
      var mm = parseInt(ym.slice(5, 7), 10);
      return (monthInt === 0 || mm === monthInt) && (yearInt === 0 || yy === yearInt);
    });

    if (!filtered.length) {
      rows.push(toCsvRow([
        "(geen diensten in deze periode)", "", "", "", "", "", "", "", "", "", "",
      ]));
      return { csv: rows.join("\n"), count: 0 };
    }

    var fmtNumber = function (n) {
      var v = Number(n) || 0;
      return v.toFixed(2).replace(".", ",");
    };

    filtered.forEach(function (p) {
      try {
        var ds = new Date(p.start);
        var de = p.einde ? new Date(p.einde) : null;
        var hours = 0;
        if (de && !isNaN(de.getTime())) {
          hours = Math.max(0, (de - ds) / 3.6e6);
        }
        var pauze = Math.max(0, Number(p.pauze_uren != null ? p.pauze_uren : p.pauzeUren) || 0);
        var net = Math.max(0, hours - pauze);
        var bruto = net * TARIEF;
        // Datum + tijden uit de wandklok (fake-UTC): slice de ISO-string i.p.v.
        // toLocale* op new Date() (dat schoof +1/+2u en kon de datum een dag verleggen).
        var sStr = String(p.start);
        var eStr = de ? String(p.einde) : "";
        var dParts = sStr.slice(0, 10).split("-");
        var datumNl = dParts.length === 3 ? dParts[2] + "-" + dParts[1] + "-" + dParts[0] : sStr.slice(0, 10);
        rows.push(toCsvRow([
          datumNl,
          sStr.length >= 16 ? sStr.slice(11, 16) : "",
          eStr.length >= 16 ? eStr.slice(11, 16) : "",
          p.teamlid || "(open)",
          p.diensttype || "",
          p.vestiging || p.locatie || "",
          fmtNumber(hours),
          fmtNumber(pauze),
          fmtNumber(net),
          fmtNumber(TARIEF),
          fmtNumber(bruto),
        ]));
      } catch (e) { /* skip */ }
    });
    return { csv: rows.join("\n"), count: filtered.length };
  }

  /* ── Hoofdtabs ───────────────────────────────────────── */
  var mainTabs = document.querySelectorAll("#sa-main-tabs [data-sa-tab]");
  var panelExport = document.getElementById("sa-panel-export");
  var panelOrt = document.getElementById("sa-panel-ort");

  function setMainTab(key) {
    var isOrt = key === "ort";
    mainTabs.forEach(function (t) {
      var on = t.getAttribute("data-sa-tab") === key;
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    if (panelExport) panelExport.classList.toggle("is-active", !isOrt);
    if (panelOrt) panelOrt.classList.toggle("is-active", isOrt);
    try {
      if (isOrt && window.history && window.history.replaceState) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search + "#ort");
      } else if (!isOrt && window.history && window.history.replaceState) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    } catch (e) {}
    if (isOrt && typeof window.__saOrtRender === "function") window.__saOrtRender();
  }

  mainTabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      setMainTab(tab.getAttribute("data-sa-tab") || "export");
    });
  });

  /* ── Export-tab ──────────────────────────────────────── */
  var monthSel = document.getElementById("sa-month");
  var yearSel = document.getElementById("sa-year");
  var listEl = document.getElementById("sa-validation-list");
  var sumEl = document.getElementById("sa-validation-summary");
  var chipEl = document.getElementById("sa-alert-chip");
  var genBtn = document.getElementById("sa-generate-btn");
  var nowDl = document.getElementById("sa-download-now");
  var historyBody = document.getElementById("sa-history-tbody");

  function renderValidation() {
    if (!listEl) return;
    var rows = computeValidationList();
    listEl.innerHTML = "";
    if (!rows.length) {
      var empty = document.createElement("div");
      empty.className = "sa-val-empty";
      empty.textContent = "Geen onvolledige gegevens gevonden.";
      listEl.appendChild(empty);
    } else {
      rows.forEach(function (r) {
        var item = document.createElement("div");
        item.className = "sa-val-item";
        var top = document.createElement("div");
        top.className = "sa-val-top";
        var dot = document.createElement("span");
        dot.className = "sa-val-dot";
        dot.setAttribute("aria-hidden", "true");
        top.appendChild(dot);
        var name = document.createElement("div");
        name.className = "sa-val-name";
        name.textContent = r.name;
        top.appendChild(name);
        item.appendChild(top);
        r.issues.forEach(function (iss) {
          var sub = document.createElement("div");
          sub.className = "sa-val-issue";
          sub.textContent = iss;
          item.appendChild(sub);
        });
        listEl.appendChild(item);
      });
    }
    var count = rows.length;
    if (sumEl) sumEl.textContent = count + " medewerkers met onvolledige gegevens";
    if (chipEl) chipEl.hidden = count === 0;
  }

  function renderHistory() {
    if (!historyBody) return;
    var list = readHistory();
    historyBody.innerHTML = "";
    var dlSvg =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M12 3v12"/><path d="M8 11l4 4 4-4"/><path d="M4 19h16"/></svg>';

    list.forEach(function (x) {
      var tr = document.createElement("tr");

      function td(text, col) {
        var t = document.createElement("td");
        t.textContent = text;
        if (col) t.setAttribute("data-col", col);
        return t;
      }

      tr.appendChild(td(fmtDateTime(x.createdAt), "datum"));
      tr.appendChild(td(x.period || "", "periode"));
      tr.appendChild(td(String(x.employees || 0), "medewerkers"));
      tr.appendChild(td(x.by || "—", "exporteur"));

      var tdDl = document.createElement("td");
      tdDl.className = "sa-td-dl";
      tdDl.setAttribute("data-col", "download");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sa-dl-btn";
      btn.setAttribute("aria-label", "Download export");
      btn.innerHTML = dlSvg;
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        // Loket-XLSX historische entries: opnieuw genereren uit live data
        // (we slaan de blob niet op om quota-druk te voorkomen).
        if (x.type === "loket-xlsx" && x.month && x.year && typeof window.XLSX !== "undefined") {
          try {
            var built = buildLoketWorkbookForPeriod(x.month, x.year);
            downloadXlsxWorkbook(x.filename || built.filename, built.workbook);
            if (typeof window.showActionFeedback === "function") {
              window.showActionFeedback("downloaded", x.filename || built.filename);
            }
            return;
          } catch (err) {
            showToast("Re-download mislukt: " + (err && err.message ? err.message : err));
            return;
          }
        }
        // Legacy: CSV-fallback voor oudere history-entries
        var csv = x.csv || buildCsvForPeriod(x.period || "");
        var fname = "salarisadministratie_export_" + (x.period || "periode").replace(/\s+/g, "_") + ".csv";
        downloadText(fname, csv, "text/csv;charset=utf-8");
        if (typeof window.showActionFeedback === "function") {
          window.showActionFeedback("downloaded", fname);
        }
      });
      tdDl.appendChild(btn);
      tr.appendChild(tdDl);
      historyBody.appendChild(tr);
    });
    applySaColumnVisibility();
  }

  // ----- Kolommen-knop (Exportgeschiedenis tabel) -----
  var SA_COLUMN_CONFIG = [
    { id: "datum", label: "Datum", defaultOn: true },
    { id: "periode", label: "Periode", defaultOn: true },
    { id: "medewerkers", label: "Medewerkers", defaultOn: true },
    { id: "exporteur", label: "Geëxporteerd door", defaultOn: true },
    { id: "download", label: "Downloaden", defaultOn: true, skipToggle: true },
  ];
  function setSaColumnVisible(colId, visible) {
    document.querySelectorAll('#sa-history-table [data-col="' + colId + '"]').forEach(function (cell) {
      cell.classList.toggle("col-hidden", !visible);
    });
  }
  function applySaColumnVisibility() {
    document.querySelectorAll("#sa-columns-list .column-toggle").forEach(function (btn) {
      var colId = btn.getAttribute("data-col");
      var isOn = btn.getAttribute("aria-checked") === "true";
      setSaColumnVisible(colId, isOn);
    });
  }
  function buildSaColumnsPanel() {
    var list = document.getElementById("sa-columns-list");
    if (!list) return;
    list.innerHTML = "";
    SA_COLUMN_CONFIG.forEach(function (c) {
      if (c.skipToggle) return;
      var li = document.createElement("li");
      li.setAttribute("role", "none");
      var b = document.createElement("button");
      b.type = "button";
      b.className = "column-toggle" + (c.defaultOn ? " is-checked" : "");
      b.setAttribute("data-col", c.id);
      b.setAttribute("role", "menuitemcheckbox");
      b.setAttribute("aria-checked", c.defaultOn ? "true" : "false");
      b.innerHTML = '<span class="column-check" aria-hidden="true">✓</span> ' + c.label;
      li.appendChild(b);
      list.appendChild(li);
    });
  }
  function wireSaColumnsPanel() {
    var colBtn = document.getElementById("sa-columns-menu-btn");
    var colPanel = document.getElementById("sa-columns-panel");
    var colList = document.getElementById("sa-columns-list");
    if (colBtn && colPanel) {
      colBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        var hidden = colPanel.hasAttribute("hidden");
        if (hidden) {
          colPanel.removeAttribute("hidden");
          colBtn.setAttribute("aria-expanded", "true");
        } else {
          colPanel.setAttribute("hidden", "");
          colBtn.setAttribute("aria-expanded", "false");
        }
      });
      colPanel.addEventListener("click", function (e) { e.stopPropagation(); });
    }
    if (colList) {
      colList.addEventListener("click", function (e) {
        var t = e.target && e.target.closest && e.target.closest(".column-toggle");
        if (!t) return;
        t.classList.toggle("is-checked");
        var on = t.classList.contains("is-checked");
        t.setAttribute("aria-checked", on ? "true" : "false");
        applySaColumnVisibility();
      });
    }
    document.addEventListener("click", function () {
      if (colPanel) {
        colPanel.setAttribute("hidden", "");
        if (colBtn) colBtn.setAttribute("aria-expanded", "false");
      }
    });
  }
  buildSaColumnsPanel();
  wireSaColumnsPanel();

  function generateExport() {
    var month = monthSel ? monthSel.value : (new Date().getMonth() + 1);
    var year = yearSel ? yearSel.value : new Date().getFullYear();
    var period = fmtPeriod(month, year);

    // Loket-XLSX (BS2-parity) — vereist medewerkersDB + ort-engine + km-decls.
    var built;
    try {
      if (typeof window.XLSX === "undefined") {
        throw new Error("SheetJS (XLSX) niet geladen. Vernieuw de pagina.");
      }
      built = buildLoketWorkbookForPeriod(month, year);
    } catch (err) {
      console.error("[salarisadministratie] export bouwen mislukt:", err);
      if (typeof window.showActionFeedback === "function") {
        window.showActionFeedback("error", "Export mislukt", err && err.message ? err.message : String(err));
      } else {
        showToast("Export mislukt: " + (err && err.message ? err.message : err));
      }
      return;
    }

    var hist = readHistory();
    var entry = {
      id: "exp_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7),
      createdAt: new Date().toISOString(),
      period: period,
      employees: built.summary.employeeCount,
      by: getCurrentUserDisplayName(),
      type: "loket-xlsx",
      filename: built.filename,
      month: built.summary.monthInt,
      year: built.summary.yearInt,
      // Geen blob in history; re-download bouwt opnieuw uit live data.
      csv: null,
    };
    hist.unshift(entry);
    writeHistory(hist.slice(0, 50));
    renderHistory();

    var willDownloadNow = !nowDl || nowDl.checked; // respecteert de checkbox (default aan)
    if (willDownloadNow) {
      try { downloadXlsxWorkbook(built.filename, built.workbook); }
      catch (err) {
        console.error("[salarisadministratie] download mislukt:", err);
        showToast("Download mislukt: " + (err && err.message ? err.message : err));
        return;
      }
      if (typeof window.showActionFeedback === "function") {
        window.showActionFeedback("info", "Loket-export klaar",
          "“" + period + "” (" + built.summary.employeeCount + " medewerkers) is opgeslagen en " + built.filename + " is gedownload.");
      } else if (typeof showSaveModal === "function") {
        showSaveModal("Loket-export gedownload.");
      }
    } else if (typeof window.showActionFeedback === "function") {
      window.showActionFeedback("saved", "Loket-export “" + period + "”");
    }
  }

  /**
   * Sprint 7 / S7 — Dienst-gebaseerde export wire-up.
   * Genereert een tweede CSV met één regel per dienst i.p.v. per medewerker.
   * Wordt naast de bestaande "Export genereren" knop getoond.
   */
  function generateShiftExport() {
    var month = monthSel ? monthSel.value : "";
    var year = yearSel ? yearSel.value : "";
    var period = fmtPeriod(month, year);
    var built = buildShiftCsvForPeriod(period, month, year);
    var csv = built.csv;
    var shiftCount = built.count;
    var hist = readHistory();
    var entry = {
      id: "exp_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7),
      createdAt: new Date().toISOString(),
      period: period + " (dienst-gebaseerd)",
      employees: shiftCount,
      by: getCurrentUserDisplayName(),
      csv: csv,
      type: "shift",
    };
    hist.unshift(entry);
    writeHistory(hist.slice(0, 50));
    renderHistory();
    var willDownloadNow = !nowDl || nowDl.checked;
    if (willDownloadNow) {
      var fname = "salarisadministratie_dienst_" + period.replace(/\s+/g, "_") + ".csv";
      downloadText(fname, csv, "text/csv;charset=utf-8");
      if (typeof window.showActionFeedback === "function") {
        window.showActionFeedback("info", "Dienst-gebaseerde export klaar", "“" + period + "” is opgeslagen en " + fname + " is gedownload.");
      }
    } else if (typeof window.showActionFeedback === "function") {
      window.showActionFeedback("saved", "Dienst-export “" + period + "”");
    }
  }

  if (monthSel) monthSel.addEventListener("change", renderValidation);
  if (yearSel) yearSel.addEventListener("change", renderValidation);
  if (genBtn) genBtn.addEventListener("click", generateExport);
  var shiftBtn = document.getElementById("sa-generate-shift-btn");
  if (shiftBtn) shiftBtn.addEventListener("click", generateShiftExport);

  /* ── Verzenden naar salarisadministratie (SMTP via edge function) ─────── */
  (function mailModule() {
    var sendBtn = document.getElementById("sa-send-btn");
    var settingsBtn = document.getElementById("sa-mail-settings-btn");
    var modal = document.getElementById("sa-mail-modal");
    var form = document.getElementById("sa-mail-form");
    var closeBtn = document.getElementById("sa-mail-close");
    var cancelBtn = document.getElementById("sa-mail-cancel");
    var passStatus = document.getElementById("sa-mail-pass-status");
    if (!modal || !form) return;
    var F = {
      ontvanger: document.getElementById("sa-mail-ontvanger"),
      cc: document.getElementById("sa-mail-cc"),
      afzNaam: document.getElementById("sa-mail-afzender-naam"),
      afzEmail: document.getElementById("sa-mail-afzender-email"),
      onderwerp: document.getElementById("sa-mail-onderwerp"),
      bericht: document.getElementById("sa-mail-bericht"),
      host: document.getElementById("sa-mail-smtp-host"),
      port: document.getElementById("sa-mail-smtp-port"),
      secure: document.getElementById("sa-mail-smtp-secure"),
      user: document.getElementById("sa-mail-smtp-user"),
      pass: document.getElementById("sa-mail-smtp-pass"),
    };

    function fb(type, title, msg) {
      if (typeof window.showActionFeedback === "function") window.showActionFeedback(type, title, msg);
      else showToast(title + (msg ? " — " + msg : ""));
    }

    function openModal() {
      modal.style.display = "";
      modal.setAttribute("aria-hidden", "false");
      loadConfig();
    }
    function closeModal() {
      modal.style.display = "none";
      modal.setAttribute("aria-hidden", "true");
    }

    async function loadConfig() {
      if (!window.besaSupabase) return;
      try {
        var res = await window.besaSupabase.rpc("saladmin_mail_config_get");
        if (res.error) throw res.error;
        var c = res.data || {};
        F.ontvanger.value = c.ontvanger || "";
        F.cc.value = c.cc || "";
        F.afzNaam.value = c.afzender_naam || "";
        F.afzEmail.value = c.afzender_email || "";
        F.onderwerp.value = c.onderwerp || "";
        F.bericht.value = c.bericht || "";
        F.host.value = c.smtp_host || "";
        F.port.value = c.smtp_port || 587;
        F.secure.value = c.smtp_secure || "starttls";
        F.user.value = c.smtp_user || "";
        F.pass.value = "";
        if (passStatus) {
          passStatus.textContent = c.wachtwoord_ingesteld ? "✓ ingesteld" : "— nog niet ingesteld";
          passStatus.style.color = c.wachtwoord_ingesteld ? "#16a34a" : "var(--text-muted)";
        }
      } catch (err) {
        fb("error", "Instellingen laden mislukt", err && err.message ? err.message : String(err));
      }
    }

    async function saveConfig(e) {
      e.preventDefault();
      if (!window.besaSupabase) return;
      var saveBtn = document.getElementById("sa-mail-save");
      if (saveBtn) saveBtn.disabled = true;
      try {
        var payload = {
          p_ontvanger: F.ontvanger.value.trim(),
          p_cc: F.cc.value.trim(),
          p_onderwerp: F.onderwerp.value,
          p_bericht: F.bericht.value,
          p_afzender_naam: F.afzNaam.value.trim(),
          p_afzender_email: F.afzEmail.value.trim(),
          p_smtp_host: F.host.value.trim(),
          p_smtp_port: parseInt(F.port.value, 10) || 587,
          p_smtp_secure: F.secure.value || "starttls",
          p_smtp_user: F.user.value.trim(),
          p_smtp_pass: F.pass.value, // leeg = behoud bestaand wachtwoord
        };
        var res = await window.besaSupabase.rpc("saladmin_mail_config_zet", payload);
        if (res.error) throw res.error;
        fb("saved", "E-mailinstellingen opgeslagen");
        closeModal();
      } catch (err) {
        fb("error", "Opslaan mislukt", err && err.message ? err.message : String(err));
      } finally {
        if (saveBtn) saveBtn.disabled = false;
      }
    }

    async function readInvokeError(res) {
      var detail = "";
      try {
        var ctx = res.error && res.error.context;
        if (ctx && typeof ctx.json === "function") {
          var j = await ctx.json();
          if (j && j.error) detail = j.error;
        }
      } catch (e) { /* */ }
      return detail || (res.error && res.error.message) || "Onbekende fout";
    }

    async function sendExport() {
      if (typeof window.XLSX === "undefined") { fb("error", "Versturen mislukt", "SheetJS niet geladen — vernieuw de pagina."); return; }
      if (!window.besaSupabase) { fb("error", "Versturen mislukt", "Supabase niet geladen."); return; }
      var month = monthSel ? monthSel.value : (new Date().getMonth() + 1);
      var year = yearSel ? yearSel.value : new Date().getFullYear();
      var period = fmtPeriod(month, year);
      var built;
      try { built = buildLoketWorkbookForPeriod(month, year); }
      catch (err) { fb("error", "Export bouwen mislukt", err && err.message ? err.message : String(err)); return; }
      // DIEHARD e-mail: bevestigingsstap vóór een echte verzending naar de salarisadministratie,
      // zodat een verkeerde maand of misklik niet ongezien een loonbestand mailt.
      var aantalMw = (built && built.summary && built.summary.employeeCount) || 0;
      if (!window.confirm(
        "Salarisexport definitief versturen naar de salarisadministratie?\n\n" +
        "Periode: " + period + "\n" +
        "Aantal medewerkers: " + aantalMw + "\n\n" +
        "Er wordt nu een e-mail met het loonbestand verzonden. Controleer de periode."
      )) { return; }
      var b64;
      try { b64 = window.XLSX.write(built.workbook, { bookType: "xlsx", type: "base64" }); }
      catch (err) { fb("error", "Export coderen mislukt", String(err)); return; }

      var origTxt = sendBtn ? sendBtn.innerHTML : "";
      if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = "Bezig met versturen…"; }
      try {
        var res = await window.besaSupabase.functions.invoke("salarisexport-mail", {
          body: {
            xlsx_base64: b64,
            filename: built.filename,
            periode: period,
            aantal: built.summary.employeeCount,
          },
        });
        if (res.error) throw new Error(await readInvokeError(res));
        var data = res.data || {};
        if (data && data.error) throw new Error(data.error);

        var hist = readHistory();
        hist.unshift({
          id: "exp_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7),
          createdAt: new Date().toISOString(),
          period: period + " (verstuurd → " + (data.verstuurd_naar || "salarisadministratie") + ")",
          employees: built.summary.employeeCount,
          by: getCurrentUserDisplayName(),
          type: "mail-sent",
          filename: built.filename,
          month: built.summary.monthInt, year: built.summary.yearInt,
          csv: null,
        });
        writeHistory(hist.slice(0, 50));
        renderHistory();
        fb("info", "Verstuurd naar salarisadministratie",
          "“" + period + "” (" + built.summary.employeeCount + " medewerkers) is gemaild naar " +
          (data.verstuurd_naar || "") + (data.cc ? " (cc " + data.cc + ")" : "") + ".");
      } catch (err) {
        var m = err && err.message ? err.message : String(err);
        if (/onvolledig|ontbreek|instellingen|stel ze eerst/i.test(m)) {
          fb("error", "E-mailinstellingen nodig", m);
          openModal();
        } else {
          fb("error", "Versturen mislukt", m);
        }
      } finally {
        if (sendBtn) { sendBtn.disabled = false; sendBtn.innerHTML = origTxt; }
      }
    }

    if (settingsBtn) settingsBtn.addEventListener("click", openModal);
    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeModal);
    modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && getComputedStyle(modal).display !== "none" && modal.getAttribute("aria-hidden") !== "true") {
        closeModal();
      }
    });
    form.addEventListener("submit", saveConfig);
    if (sendBtn) sendBtn.addEventListener("click", sendExport);
  })();

  /* ── ORT ─────────────────────────────────────────────── */
  (function ortModule() {
    var ortTbody = document.getElementById("sa-ort-tbody");
    var ortCaoTabs = document.querySelectorAll("#sa-ort-cao-tabs [data-sa-cao]");
    var ortAddBtn = document.getElementById("sa-ort-add-btn");
    var ortModal = document.getElementById("sa-ort-modal");
    var ortForm = document.getElementById("sa-ort-form");
    var ortModalTitle = document.getElementById("sa-ort-modal-title");
    var ortClose = document.getElementById("sa-ort-modal-close");
    var ortCancel = document.getElementById("sa-ort-cancel");
    var ortDag = document.getElementById("sa-ort-dag");
    var ortStart = document.getElementById("sa-ort-start");
    var ortEnd = document.getElementById("sa-ort-end");
    var ortPct = document.getElementById("sa-ort-pct");

    if (!ortTbody || !ortModal || !ortForm) return;

    var currentCao = "vvt";
    var editingId = null;

    function ortClearCustomDagOption() {
      if (!ortDag) return;
      var ex = document.getElementById("sa-ort-dag-opt-custom");
      if (ex) ex.remove();
    }

    /** Zet preset-teksten (ascii/en-dash) om naar de waarde in het select-element. */
    function ortCanonicalDagForSelect(saved) {
      var s = String(saved || "").trim();
      if (!s) return "";
      if (/^maandag\s*[-\u2013]\s*vrijdag$/i.test(s)) return "Maandag – Vrijdag";
      return s;
    }

    function ortSetDagSelect(saved) {
      if (!ortDag) return;
      ortClearCustomDagOption();
      var want = ortCanonicalDagForSelect(saved);
      ortDag.value = want;
      if (want && ortDag.value !== want) {
        var raw = String(saved).trim();
        var opt = document.createElement("option");
        opt.id = "sa-ort-dag-opt-custom";
        opt.value = raw;
        opt.textContent = raw;
        ortDag.appendChild(opt);
        ortDag.value = raw;
      }
      if (!want) ortDag.value = "";
    }

    var ICO_EDIT =
      '<svg class="sa-ort-act-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    var ICO_DEL =
      '<svg class="sa-ort-act-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

    function ortGenId() {
      return "ort_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    }

    function ortDefaultVvtRules() {
      return [
        { id: "ort_vvt_feestdag", dag: "Feestdag", start: "00:00", end: "23:59", percentage: 200, priority: 10 },
        { id: "ort_vvt_zat_avond", dag: "Zaterdag", start: "18:00", end: "23:59", percentage: 140, priority: 3 },
        { id: "ort_vvt_zat_dag", dag: "Zaterdag", start: "06:00", end: "18:00", percentage: 120, priority: 2 },
        { id: "ort_vvt_zat_nacht", dag: "Zaterdag", start: "00:00", end: "06:00", percentage: 140, priority: 1 },
        { id: "ort_vvt_zon", dag: "Zondag", start: "00:00", end: "23:59", percentage: 160, priority: 1 },
        { id: "ort_vvt_mdv_nacht", dag: "Maandag - Vrijdag", start: "22:00", end: "06:00", percentage: 140, priority: 2 },
        { id: "ort_vvt_mdv_avond", dag: "Maandag - Vrijdag", start: "20:00", end: "22:00", percentage: 122, priority: 1 },
      ];
    }

    var MDV = "Maandag \u2013 Vrijdag";

    function ortDefaultJeugdzorgRules() {
      return [
        { id: "ort_jz_zat_nacht", dag: "Zaterdag", start: "22:00", end: "06:00", percentage: 145, priority: 0 },
        { id: "ort_jz_mdv_nacht", dag: MDV, start: "22:00", end: "06:00", percentage: 145, priority: 0 },
        { id: "ort_jz_zon_nacht", dag: "Zondag", start: "22:00", end: "06:00", percentage: 145, priority: 0 },
        { id: "ort_jz_zat_lang", dag: "Zaterdag", start: "20:00", end: "06:00", percentage: 145, priority: 0 },
        { id: "ort_jz_feestdag", dag: "Feestdag", start: "00:00", end: "23:59", percentage: 145, priority: 10 },
        { id: "ort_jz_zat_dag", dag: "Zaterdag", start: "06:00", end: "22:00", percentage: 130, priority: 1 },
        { id: "ort_jz_zon_vol", dag: "Zondag", start: "00:00", end: "23:59", percentage: 145, priority: 1 },
        { id: "ort_jz_mdv_vroeg", dag: MDV, start: "06:00", end: "07:00", percentage: 125, priority: 3 },
        { id: "ort_jz_mdv_dag", dag: MDV, start: "07:00", end: "19:00", percentage: 100, priority: 0 },
        { id: "ort_jz_mdv_avond", dag: MDV, start: "19:00", end: "22:00", percentage: 125, priority: 0 },
      ];
    }

    function ortDefaultRules() {
      return {
        _vvtPresetVersion: 3,
        _jeugdzorgPresetVersion: 3,
        vvt: ortDefaultVvtRules(),
        jeugdzorg: ortDefaultJeugdzorgRules(),
      };
    }

    function ortRead() {
      try {
        var raw = localStorage.getItem(ORT_KEY);
        var data = raw ? safeJsonParse(raw, null) : null;
        if (!data || typeof data !== "object") {
          data = ortDefaultRules();
          localStorage.setItem(ORT_KEY, JSON.stringify(data));
          return data;
        }
        var def = ortDefaultRules();
        var changed = false;
        if (!Array.isArray(data.vvt)) {
          data.vvt = def.vvt.slice();
          changed = true;
        }
        if (!Array.isArray(data.jeugdzorg)) {
          data.jeugdzorg = def.jeugdzorg.slice();
          changed = true;
        }
        if (!data._vvtPresetVersion || data._vvtPresetVersion < 3) {
          data.vvt = ortDefaultVvtRules();
          data._vvtPresetVersion = 3;
          changed = true;
        }
        if (!data._jeugdzorgPresetVersion || data._jeugdzorgPresetVersion < 3) {
          data.jeugdzorg = ortDefaultJeugdzorgRules();
          data._jeugdzorgPresetVersion = 3;
          changed = true;
        }
        if (changed) localStorage.setItem(ORT_KEY, JSON.stringify(data));
        return data;
      } catch (e) {
        var d = ortDefaultRules();
        try {
          localStorage.setItem(ORT_KEY, JSON.stringify(d));
        } catch (e3) {}
        return d;
      }
    }

    function ortWrite(data) {
      try {
        localStorage.setItem(ORT_KEY, JSON.stringify(data));
      } catch (e) {}
      if (window.saladminDB && typeof window.saladminDB.pushOrt === "function") {
        try { window.saladminDB.pushOrt(data); } catch (e) { /* */ }
      }
    }

    function ortTijdLabel(start, end) {
      var enDash = "\u2013";
      return (start || "00:00") + " " + enDash + " " + (end || "00:00");
    }

    function ortRender() {
      var data = ortRead();
      var rules = data[currentCao] || [];
      ortTbody.innerHTML = "";
      rules.forEach(function (r) {
        var tr = document.createElement("tr");
        tr.dataset.ortId = r.id;

        var tdDag = document.createElement("td");
        tdDag.textContent = r.dag || "";
        tr.appendChild(tdDag);

        var tdTijd = document.createElement("td");
        tdTijd.textContent = ortTijdLabel(r.start, r.end);
        tr.appendChild(tdTijd);

        var tdPct = document.createElement("td");
        var spanPct = document.createElement("span");
        spanPct.className = "sa-ort-pct";
        spanPct.textContent = String(r.percentage != null ? r.percentage : "") + "%";
        tdPct.appendChild(spanPct);
        tr.appendChild(tdPct);

        var tdAct = document.createElement("td");
        tdAct.className = "sa-ort-td-act";
        var wrap = document.createElement("div");
        wrap.className = "sa-ort-act-wrap";

        var btnEd = document.createElement("button");
        btnEd.type = "button";
        btnEd.className = "sa-ort-icon-btn";
        btnEd.setAttribute("aria-label", "Regel bewerken");
        btnEd.innerHTML = ICO_EDIT;
        btnEd.addEventListener("click", function (e) {
          e.preventDefault();
          ortOpenEdit(r.id);
        });

        var btnDel = document.createElement("button");
        btnDel.type = "button";
        btnDel.className = "sa-ort-icon-btn";
        btnDel.setAttribute("aria-label", "Regel verwijderen");
        btnDel.innerHTML = ICO_DEL;
        btnDel.addEventListener("click", function (e) {
          e.preventDefault();
          var ortPreview = "";
          try {
            ortPreview = [r.diensttype, r.dag, r.vanaf || r.tot ? (r.vanaf || "") + (r.tot ? "–" + r.tot : "") : ""]
              .filter(Boolean).join(" — ");
          } catch (_e) { /* noop */ }
          var ortConfirm;
          if (typeof window.showSliderConfirmModal === "function") {
            ortConfirm = window.showSliderConfirmModal({
              title: "ORT-regel verwijderen",
              message: "Weet je zeker dat je deze ORT-regel wilt verwijderen?",
              preview: ortPreview,
              okLabel: "Verwijderen",
            });
          } else {
            console.warn("[salaris-export] showSliderConfirmModal niet beschikbaar — actie geannuleerd.");
            ortConfirm = Promise.resolve(false);
          }
          ortConfirm.then(function (ok) {
            if (!ok) return;
            ortDeleteRule(r.id);
            if (typeof window.showActionFeedback === "function") {
              window.showActionFeedback("deleted", "ORT-regel");
            }
          });
        });

        wrap.appendChild(btnEd);
        wrap.appendChild(btnDel);
        tdAct.appendChild(wrap);
        tr.appendChild(tdAct);
        ortTbody.appendChild(tr);
      });
    }

    window.__saOrtRender = ortRender;

    function ortSetCao(cao) {
      currentCao = cao === "jeugdzorg" ? "jeugdzorg" : "vvt";
      ortCaoTabs.forEach(function (btn) {
        var on = btn.getAttribute("data-sa-cao") === currentCao;
        btn.classList.toggle("is-active", on);
        btn.setAttribute("aria-selected", on ? "true" : "false");
      });
      ortRender();
    }

    ortCaoTabs.forEach(function (btn) {
      btn.addEventListener("click", function () {
        ortSetCao(btn.getAttribute("data-sa-cao") || "vvt");
      });
    });

    function ortOpenModal(isEdit) {
      ortModal.style.display = "";
      ortModal.setAttribute("aria-hidden", "false");
      if (ortModalTitle) ortModalTitle.textContent = isEdit ? "Regel bewerken" : "Regel toevoegen";
    }

    function ortCloseModal() {
      ortModal.style.display = "none";
      ortModal.setAttribute("aria-hidden", "true");
      editingId = null;
      ortClearCustomDagOption();
      ortForm.reset();
    }

    function ortOpenAdd() {
      editingId = null;
      ortClearCustomDagOption();
      ortForm.reset();
      ortOpenModal(false);
    }

    function ortOpenEdit(id) {
      var data = ortRead();
      var rules = data[currentCao] || [];
      var r = rules.filter(function (x) {
        return x.id === id;
      })[0];
      if (!r) return;
      editingId = id;
      ortSetDagSelect(r.dag || "");
      if (ortStart) ortStart.value = r.start || "00:00";
      if (ortEnd) ortEnd.value = r.end || "00:00";
      if (ortPct) ortPct.value = String(r.percentage != null ? r.percentage : "");
      ortOpenModal(true);
    }

    function ortDeleteRule(id) {
      var data = ortRead();
      var rules = data[currentCao] || [];
      data[currentCao] = rules.filter(function (x) {
        return x.id !== id;
      });
      ortWrite(data);
      ortRender();
      if (typeof showSaveModal === "function") showSaveModal("Regel is verwijderd.", "Verwijderd");
      else showToast("Regel verwijderd");
    }

    if (ortAddBtn) ortAddBtn.addEventListener("click", ortOpenAdd);
    if (ortClose) ortClose.addEventListener("click", ortCloseModal);
    if (ortCancel) ortCancel.addEventListener("click", ortCloseModal);
    ortModal.addEventListener("click", function (e) {
      if (e.target === ortModal) ortCloseModal();
    });
    // Module 10 Bug #30 fix: Escape sluit ORT modal (style.display-pattern)
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (ortModal && getComputedStyle(ortModal).display !== "none" && ortModal.getAttribute("aria-hidden") !== "true") {
        ortCloseModal();
        e.preventDefault();
      }
    });

    ortForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var dag = ortDag ? String(ortDag.value).trim() : "";
      var start = ortStart ? ortStart.value : "";
      var end = ortEnd ? ortEnd.value : "";
      var pctRaw = ortPct ? ortPct.value : "";
      var pct = parseInt(pctRaw, 10);
      if (!dag) {
        if (ortDag) ortDag.focus();
        return;
      }
      if (!start || !end) return;
      if (!isFinite(pct) || pct < 0) {
        if (ortPct) ortPct.focus();
        return;
      }

      var data = ortRead();
      var rules = (data[currentCao] || []).slice();
      var neu = {
        id: editingId || ortGenId(),
        dag: dag,
        start: start,
        end: end,
        percentage: pct,
      };
      if (editingId) {
        var idx = rules.findIndex(function (x) {
          return x.id === editingId;
        });
        if (idx >= 0) rules[idx] = neu;
      } else {
        rules.push(neu);
      }
      data[currentCao] = rules;
      ortWrite(data);
      ortCloseModal();
      ortRender();
      if (typeof showSaveModal === "function") showSaveModal("ORT-regel is opgeslagen.");
      else showToast("ORT-regel opgeslagen");
    });

    ortSetCao("vvt");
  })();

  setMainTab(window.location.hash === "#ort" ? "ort" : "export");
  renderValidation();
  renderHistory();

  // Re-render zodra de Supabase-bootstrap de cache heeft gevuld (eerste page-
  // load op een nieuwe browser).
  window.addEventListener("besa:saladmin-updated", function () {
    try { renderHistory(); } catch (e) { /* */ }
  });
})();
