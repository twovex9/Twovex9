/**
 * Cliëntreis — status → NL-label + pill-class, en tijdlijn-event → icoon.
 * Zelfde patroon als fase-ui.js: pure mapping, geen DOM, geen data-calls.
 * Bron-van-waarheid voor de 13 reis-statussen (kolom clienten.reis_status);
 * CSS-varianten (.cr-pill--*) staan in styles.css (Cliëntmodule 2.0 fase 1).
 */
(function (g) {
  "use strict";

  // 13 slugs in reisvolgorde (DB check-constraint clienten.reis_status).
  var STATUSSEN = [
    "nieuwe_aanmelding",
    "in_beoordeling",
    "meer_info_nodig",
    "intake_gepland",
    "intake_afgerond",
    "wachtlijst",
    "plaatsing_gepland",
    "actief",
    "tijdelijk_gepauzeerd",
    "uitstroom_gepland",
    "uitgestroomd",
    "nazorg",
    "dossier_gesloten",
  ];

  var LABELS = {
    nieuwe_aanmelding: "Nieuwe aanmelding",
    in_beoordeling: "In beoordeling",
    meer_info_nodig: "Meer informatie nodig",
    intake_gepland: "Intake gepland",
    intake_afgerond: "Intake afgerond",
    wachtlijst: "Wachtlijst",
    plaatsing_gepland: "Plaatsing gepland",
    actief: "Actief",
    tijdelijk_gepauzeerd: "Tijdelijk gepauzeerd",
    uitstroom_gepland: "Uitstroom gepland",
    uitgestroomd: "Uitgestroomd",
    nazorg: "Nazorg",
    dossier_gesloten: "Dossier gesloten",
  };

  function norm(slug) {
    return String(slug == null ? "" : slug).trim().toLowerCase();
  }

  function label(slug) {
    var s = norm(slug);
    if (!s) return "—";
    if (LABELS[s]) return LABELS[s];
    // Onbekende slug: toon leesbaar i.p.v. raw (vangrail voor toekomstige statussen).
    var t = s.replace(/_/g, " ");
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  function pillClass(slug) {
    var s = norm(slug);
    if (STATUSSEN.indexOf(s) === -1) return "cr-pill cr-pill--onbekend";
    return "cr-pill cr-pill--" + s.replace(/_/g, "-");
  }

  // Kleine 14×14 SVG-iconen per tijdlijn-event_type (stroke = currentColor,
  // kleurt mee via CSS). Strings zijn statisch/vertrouwd — geen user-data.
  var SVG_OPEN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var ICONEN = {
    // brief (envelop)
    aanmelding: SVG_OPEN + '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
    // pijl (status-overgang)
    status_wijziging: SVG_OPEN + '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>',
    // vinkje (beslissing/beoordeling)
    beoordeling: SVG_OPEN + '<path d="m5 13 4 4L19 7"/></svg>',
    // stip (overig/onbekend)
    overig: SVG_OPEN + '<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/></svg>',
  };

  function icoon(eventType) {
    var t = norm(eventType);
    return ICONEN[t] || ICONEN.overig;
  }

  g.besaClientreis = {
    STATUSSEN: STATUSSEN.slice(),
    label: label,
    pillClass: pillClass,
    icoon: icoon,
  };
})(typeof window !== "undefined" ? window : this);
