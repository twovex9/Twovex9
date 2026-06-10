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
    // pen (digitale ondertekening, fase 2)
    ondertekening: SVG_OPEN + '<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>',
    // klembord (intake, fase 2)
    intake: SVG_OPEN + '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"/><path d="m9 13 2 2 4-4"/></svg>',
    // document met regels (zorgplan, fase 3)
    zorgplan: SVG_OPEN + '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6"/><path d="M9 17h6"/></svg>',
    // driehoek met uitroepteken (signaleringsplan, fase 3)
    signaleringsplan: SVG_OPEN + '<path d="m10.3 3.9-8.5 14.2A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-2.9L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
    // potlood (rapportage, fase 3)
    rapportage: SVG_OPEN + '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>',
    // tekstballon (contactmoment, fase 3)
    contact: SVG_OPEN + '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    // cirkel met uitroepteken (klacht, fase 3)
    klacht: SVG_OPEN + '<circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>',
    // bliksem (incident, fase 3)
    incident: SVG_OPEN + '<path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z"/></svg>',
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
