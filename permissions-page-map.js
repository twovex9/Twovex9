/* global window */
/**
 * permissions-page-map.js — welke permissie heb je nodig om welke pagina te zien?
 *
 * Twee modes per pagina:
 *   1. `null` — altijd open voor ingelogde users (home, eigen profiel, etc.)
 *   2. `{ action, entity }` — vertaalt naar BS2-permissie-slug `<action>-<entity>`
 *      en wordt gechecked via `besaCan(action, entity)`.
 *   3. `{ allowedRoles: [...] }` — strikte rol-lijst (BS2-naam, bv. "HR", "Eigenaar").
 *      Voor uitzonderingen op BS2's eigen permissie-model (bv. salarishuis).
 *
 * Admin-tier rollen (Eigenaar/Admin/Directeur) krijgen altijd toegang (besaCan bypass).
 *
 * Slug-conventie volgt `bs2_permissions.slug` 1-op-1 (146 slugs over 17 groepen).
 *
 * Niet-gemapte pagina = open voor alle ingelogde users (default). Voeg een entry
 * toe als je een pagina expliciet wilt beschermen.
 */
(function (global) {
  "use strict";

  var PAGE_PERMISSIONS = {
    // ─── Altijd open voor ingelogde users ─────────────────────────────────────
    "home.html": null,
    "login.html": null,
    "mijn-gegevens.html": null,
    // Persoonlijke werkvloer self-service: open voor iedereen BEHALVE Eigenaar/Directeur.
    // Het bestuur wordt niet ingeroosterd en voert zelf geen facturen/beschikbaarheid in;
    // zij gebruiken de kantooroverzichten (Facturen / Beschikbaarheid ZZP'ers). deniedRoles
    // weert ook de admin-tier-bypass (zie permissions-nav-hide.js / permissions-gate.js).
    // Beleid mee in deniedRoles: een beleidsmedewerker is kantoor/overhead, wordt niet
    // op een locatie ingeroosterd en registreert dus geen eigen dienst-uren (video-feedback
    // eigenaar 2026-06-07, beleidsmedewerker-rondleiding). Multi-rol blijft veilig.
    // HR + Facilitair toegevoegd aan deniedRoles (video-feedback eigenaar 2026-06-07,
    // HR-medewerker- en hoofdfacilitair-rondleiding): beide zijn kantoor/overhead en
    // worden niet op een locatie ingeroosterd → registreren geen eigen dienst-uren. Zij
    // krijgen Urenregistratie wél als KIJK-overzicht (view-employee-hour-registrations),
    // maar niet de persoonlijke "Mijn uren"-self-service.
    "mijn-uren.html": { deniedRoles: ["Eigenaar", "Directeur", "Beleid", "HR", "Facilitair"] },        // self-service: eigen werkuren registreren (RLS-gescoped)

    "mijn-proforma-facturen.html": { deniedRoles: ["Eigenaar", "Directeur"] },   // ZZP self-service: eigen proforma's (RLS-gescoped)
    "mijn-uitnodigingen.html": { deniedRoles: ["Eigenaar", "Directeur"] },       // ZZP self-service: eigen dienst-uitnodigingen (RLS-gescoped)
    // Planner + Beleid mee in deniedRoles: beide zijn kantoor/overhead en worden zelf niet
    // op een locatie ingeroosterd, dus hebben geen eigen-beschikbaarheid-tab nodig
    // (video-feedback eigenaar 2026-06-07; Beleid toegevoegd via de beleidsmedewerker-
    // rondleiding). Multi-rol blijft veilig: huidige Planner/Beleid-users zijn kantoor/bestuur.
    // HR + Facilitair toegevoegd (video-feedback eigenaar 2026-06-07): kantoor/overhead,
    // staan niet op de groepen → geen eigen-beschikbaarheid-tab nodig.
    "mijn-beschikbaarheid.html": { deniedRoles: ["Eigenaar", "Directeur", "Planner", "Beleid", "HR", "Facilitair"] }, // ZZP self-service: eigen beschikbaarheid + tijden (RLS-gescoped)
    "notifications.html": null,
    "nieuws.html": { action: "view", entity: "announcements" },

    // ─── ETF Management Dashboard — STRIKT bestuur (Eigenaar + Directeur) ──────
    // `strict:true` schakelt de admin-tier-bypass UIT: alleen de bestuurder ziet
    // het. De RPC management_dashboard_v1 gate't server-side via can_view_management().
    "management-dashboard.html": { allowedRoles: ["Eigenaar", "Directeur"], strict: true },

    // ─── HR Compliance-dashboard (G48) — HR + admin-tier ──────────────────────
    // Compliance-overzicht (verloopbewaking docs, onboarding, VOG%) + drill-down naar
    // het dossier. Server-side gate't hr_compliance_overzicht()/-kpis() via is_office_staff().
    "compliance-dashboard.html": { allowedRoles: ["Eigenaar", "Admin", "Directeur", "HR", "Salarisadministratie"], strict: true },

    // ─── HR-domein (employees-groep) ──────────────────────────────────────────
    "hr.html": { action: "browse", entity: "employees" },
    "medewerker.html": { action: "view", entity: "employees" },
    "medewerker-detail.html": { action: "view", entity: "basic-employees" },
    "medewerkers-overzicht.html": { action: "browse", entity: "basic-employees" },
    "competenties.html": { action: "browse", entity: "competencies" },
    "competentie-detail.html": { action: "view", entity: "competencies" },
    "opleidingen.html": { action: "browse", entity: "certifications" },
    "opleiding-detail.html": { action: "view", entity: "certifications" },
    "locaties.html": { action: "browse", entity: "locations" },
    "locatie-detail.html": { action: "view", entity: "locations" },
    // Bureau's (detacheringsbureau-beheer) hoort in het HR-dropdown → zelfde HR/admin-tier-
    // scope als de andere HR-beheerpagina's. Voorheen op browse-locations (proxy), maar die
    // permissie hebben ook Planner/Medewerker (nodig voor Planning → Locaties), waardoor "Bureau's"
    // in hún HR-kopje lekte. allowedRoles scheidt dit netjes van locaties.html zonder Planning te raken.
    "bureaus.html": { allowedRoles: ["Eigenaar", "Admin", "Directeur", "HR"] },          // BS1-only; HR/admin-tier (was browse-locations-proxy)
    "bureau-detail.html": { allowedRoles: ["Eigenaar", "Admin", "Directeur", "HR"] },
    "verzuim.html": { action: "browse", entity: "employee-absences-sickness" },
    // HR-beheer-pagina's zonder eigen BS2-permissie: strikt HR/admin-tier, zodat
    // gewone medewerkers/ZZP'ers ze niet in hun menu zien. (Diensttypes ook
    // Planner — die speelt mee in de planning.) Pas de rollen aan naar wens.
    "hr-diensttypes.html": { allowedRoles: ["Eigenaar", "Admin", "Directeur", "HR", "Planner"] },
    "contract-sjablonen.html": { allowedRoles: ["Eigenaar", "Admin", "Directeur", "HR"] },
    "inwerk-items.html": { allowedRoles: ["Eigenaar", "Admin", "Directeur", "HR"] },

    // ─── Salarishuis — UITZONDERING op BS2-model (strikt 4 rollen) ────────────
    // G56: strict — de admin-tier-bypass geldt hier NIET; alleen de expliciete
    // rollen komen binnen (zelfde fail-closed model als Financiën).
    "salarishuis.html": { allowedRoles: ["Eigenaar", "Admin", "Directeur", "HR"], strict: true },
    "salarishuis-wijzigingsgeschiedenis.html": { allowedRoles: ["Eigenaar", "Admin", "Directeur", "HR"], strict: true },

    // ─── Salaris-uitvoer + compensatie (Salarisadministratie + admin-tier) ────
    "salarisadministratie-exporter.html": { allowedRoles: ["Eigenaar", "Admin", "Directeur", "HR", "Salarisadministratie"], strict: true },
    "loonstroken.html": { allowedRoles: ["Eigenaar", "Admin", "Directeur", "HR", "Salarisadministratie"], strict: true },
    "compensatie-saldi.html": { allowedRoles: ["Eigenaar", "Admin", "Directeur", "HR", "Salarisadministratie"] },
    "compensatie-berekeningen.html": { allowedRoles: ["Eigenaar", "Admin", "Directeur", "HR", "Salarisadministratie"] },
    "compensatie-feestdagen.html": { allowedRoles: ["Eigenaar", "Admin", "Directeur", "HR", "Salarisadministratie"] },
    "compensatie-diensttypes.html": { allowedRoles: ["Eigenaar", "Admin", "Directeur", "HR", "Salarisadministratie"] },

    // ─── Verlof (leave-management) ────────────────────────────────────────────
    "verlof.html": { action: "view", entity: "leave-balances" },
    "verlofstanden.html": { action: "view", entity: "leave-balances" },
    "verlof-uitdienst.html": { action: "view", entity: "leave-balances" },
    "verloftypes.html": { action: "manage", entity: "leave-types" },

    // ─── Cliënten + beschikkingen (clients-groep) ─────────────────────────────
    "clienten.html": { action: "browse", entity: "clients" },
    "client-detail.html": { action: "view", entity: "clients" },
    "beschikkingen.html": { action: "browse", entity: "dispositions" },
    "beschikking-detail.html": { action: "view", entity: "dispositions" },
    "beschikkingen-dashboard.html": { action: "view", entity: "dispositions-dashboard" },
    "facturen.html": { action: "browse", entity: "disposition-payments" },        // disposition-facturen
    "factuur-detail.html": { action: "view", entity: "disposition-payments" },
    "zorgsoorten.html": { action: "browse", entity: "care-types" },
    "zorgsoort-detail.html": { action: "view", entity: "care-types" },
    "gemeenten.html": { action: "browse", entity: "municipalities" },
    "gemeente-detail.html": { action: "view", entity: "municipalities" },
    "organisatie.html": { action: "browse", entity: "care-allocators" },
    "organisatie-detail.html": { action: "view", entity: "care-allocators" },

    // ─── Planning + teams ─────────────────────────────────────────────────────
    "planning.html": { action: "view", entity: "planning" },
    "planning-beheer.html": { action: "manage", entity: "shifts" },
    // ZZP-beschikbaarheid-overzicht: privacygevoelig (toont per medewerker of/wanneer
    // ze beschikbaarheid doorgeven) → strikt kantoor/planning-rollen. Admin-tier wint sowieso.
    "beschikbaarheid-overzicht.html": { allowedRoles: ["Eigenaar", "Admin", "Directeur", "HR", "Planner", "Zorgcoördinator"] },
    // Open-diensten-overzicht: aanmeldingen op open diensten behandelen → zelfde
    // planning/HR-rollen die ook de melding ontvangen. Admin-tier wint sowieso.
    "open-diensten.html": { allowedRoles: ["Eigenaar", "Admin", "Directeur", "HR", "Planner", "Zorgcoördinator"] },
    "teams.html": { action: "browse", entity: "teams" },

    // ─── Taken ────────────────────────────────────────────────────────────────
    // Spraakmemo eigenaar 2026-06-07: "De taken moeten voor iedereen zichtbaar zijn."
    // → open voor elke ingelogde gebruiker (was view-tasks). Detacheringsbureau-accounts
    // blijven via permissions-gate.js naar hun eigen portaal geleid.
    "taken.html": null,

    // ─── Werkuren / time-registrations ───────────────────────────────────────
    "werkuren.html": { action: "view", entity: "employee-hour-registrations" },
    // Module 2 — Productie & Urenregistratie (management-overzicht). De pagina zelf
    // is voor office/management-rollen; binnen de pagina gate't productie_mijn_context
    // (niveau) de views (Directie-KPI's = niveau<=2) en zijn de RPC's SECURITY DEFINER
    // met een harde niveau<=3-check. Medewerkers gebruiken Mijn uren (self-service).
    "productie-urenregistratie.html": { allowedRoles: ["Eigenaar", "Admin", "Directeur", "Finance", "Salarisadministratie", "Planner", "Zorgcoördinator", "HR"] },
    // Module 3 — Workforce Planning + AI (management-overzicht). Zelfde tier als
    // Productie: de pagina gate't intern via workforce_mijn_context (niveau) — Forecast
    // & directie = niveau<=2 — en de RPC's zijn SECURITY DEFINER met harde niveau<=3-check.
    "workforce-planning.html": { allowedRoles: ["Eigenaar", "Admin", "Directeur", "Finance", "Salarisadministratie", "Planner", "Zorgcoördinator", "HR"] },
    "werkuren-labels.html": { action: "browse", entity: "labels" },
    "urendeclaraties.html": { action: "view", entity: "employee-hour-registrations" },
    // plus-minuren staat in het HR-mega-menu (HR-domein), maar keyde op de generieke
    // view-employee-hour-registrations. Sinds HR + Facilitair die slug kregen voor de
    // Urenregistratie-KIJKFUNCTIE (video 2026-06-07) lekte de HR-kop naar Facilitair
    // (enige bereikbare HR-item = Plus-/minuren). Daarom expliciete allowedRoles =
    // de bestaande slug-houders + HR, ZONDER Facilitair (die hoort geen HR-kop te zien).
    "plus-minuren.html": { allowedRoles: ["Eigenaar", "Admin", "Directeur", "HR", "Finance", "Planner", "Zorgcoördinator"] },
    "uren-budgettering.html": { action: "manage", entity: "employee-registered-hours" },

    // ─── Incidenten ───────────────────────────────────────────────────────────
    "incidenten.html": { action: "view", entity: "incidents" },
    "incidenten-dashboard.html": { action: "view", entity: "incident-dashboard" },
    // Incidentanalyse, risico & kwaliteit — management + kwaliteit/beleid +
    // gedragswetenschapper. De pagina gate't intern via incident_analyse_context
    // (niveau): Directie-view = niveau<=1, Eigenaar-view = eigenaar/admin. De
    // RPC's zijn SECURITY DEFINER; de beoordeel-actie heeft een harde niveau<=3-check.
    "incidenten-analyse.html": { allowedRoles: ["Eigenaar", "Admin", "Directeur", "Beleid", "Gedragswetenschapper", "Zorgcoördinator", "HR", "Planner"] },
    "incident-melden.html": { action: "view", entity: "incidents" },
    "incidenten-categorieen.html": { action: "view", entity: "incident-categories" },
    "verbeteringsmaatregelen.html": { action: "view", entity: "improvement-measures" },

    // ─── Klachtenregister — kantoor/kwaliteit-rollen (admin-tier wint sowieso) ─
    "klachten.html": { allowedRoles: ["Eigenaar", "Admin", "Directeur", "HR", "Zorgcoördinator", "Beleid", "Gedragswetenschapper", "Cliëntbeheer"] },

    // ─── Facturen (top-bar = employee-invoices) ──────────────────────────────
    // FF-native ZZP-proforma-facturatie (zzp_facturen) — zelfde invoices-permissie.
    "zzp-facturen.html": { action: "view", entity: "invoices" },
    "zzp-factuur-detail.html": { action: "view", entity: "invoices" },
    // Overuren-goedkeuring → teamleider (Zorgcoördinator) + admin-tier/Finance. RPC gate't ook server-side.
    // HR verwijderd (video-feedback eigenaar 2026-06-07): het hele Facturen-kopje hoeft niet
    // zichtbaar te zijn voor HR.
    "zzp-overuren.html": { allowedRoles: ["Eigenaar", "Admin", "Directeur", "Zorgcoördinator", "Finance"] },
    "zzp-reconciliatie.html": { action: "view", entity: "invoices" },
    // Detacheringsbureau-portaal: het bureau-account (rol Detacheringsbureau) ziet hier
    // ALLEEN z'n eigen mensen/facturen (server-side via RPC + RLS-lockout). Reviewers
    // mogen previewen. permissions-gate.js stuurt een bureau-only account hier altijd heen.
    // HR verwijderd (video-feedback eigenaar 2026-06-07): Facturen-kopje niet voor HR.
    "zzp-bureau-facturen.html": { allowedRoles: ["Detacheringsbureau", "Eigenaar", "Admin", "Directeur", "Finance", "Salarisadministratie", "Zorgcoördinator"] },
    "facturen-alle.html": { action: "browse", entity: "invoices" },
    "facturen-te-beoordelen.html": { action: "view", entity: "invoices" },
    "facturen-indiening.html": { action: "view", entity: "invoices" },
    "invoice-detail.html": { action: "view", entity: "invoices" },
    "facturen-importeren.html": { action: "import", entity: "invoices" },

    // ─── Kilometers ───────────────────────────────────────────────────────────
    // kilometers.html (Kilometer declaraties): spraakmemo eigenaar 2026-06-07 — "De
    // kilometers moeten voor iedereen zichtbaar zijn. Ook met de mogelijkheid om die in
    // te voeren." → open voor elke ingelogde gebruiker. Scoping gebeurt in kilometers.js:
    // wie GEEN view-all-mileage-declarations heeft ziet (en bewerkt) alléén z'n EIGEN
    // declaraties (RLS scopet de Medewerker server-side óók al naar eigen); HR/Planner/
    // admin (view-all) zien álle declaraties als overzicht/dashboard. Detacheringsbureau
    // blijft via permissions-gate.js naar het bureau-portaal geleid.
    "kilometers.html": null,
    // De twee subpagina's zijn kantoor/beheer-tools, GEEN werkvloer:
    //   • km-afstanden  = woon-werk-afstanden-matrix (loondienst × locatie) die de
    //     km-vergoeding/salaris-export voedt (zelfde isLoondienst-regel als
    //     salarisadministratie-exporter.js).
    //   • km-afwijkingen = HR/kantoor-review van rit-afwijkingen.
    // Zonder mapping waren ze "default open" → lekten naar ELKE ingelogde user (incl. pure
    // Medewerker) in de Kilometers-dropdown. allowedRoles = exact de mileage-declaration-
    // permissiehouders in BS2 (browse/manage) MINUS de pure Medewerker (werkvloer): zo blijft
    // de dropdown coherent — al deze 7 office-rollen hebben ook browse-mileage-declarations,
    // dus zien naast de subpagina's ook "Kilometer declaraties". Finance bewust NIET: heeft in
    // BS2 geen enkele mileage-permissie, zou anders een halve dropdown (subpagina's zonder
    // declaraties) krijgen. Admin-tier (Eigenaar/Admin/Directeur) wint sowieso via bypass.
    "km-afstanden.html": { allowedRoles: ["Eigenaar", "Admin", "Directeur", "HR", "Planner", "Zorgcoördinator", "Salarisadministratie"] },
    "km-afwijkingen.html": { allowedRoles: ["Eigenaar", "Admin", "Directeur", "HR", "Planner", "Zorgcoördinator", "Salarisadministratie"] },

    // ─── Beleid ───────────────────────────────────────────────────────────────
    // beleid-documenten.html = de read-/downloadbare documentenlijst (topnav "Beleid").
    // Iedere medewerker moet het organisatiebeleid kunnen ZIEN (video-feedback eigenaar
    // 2026-06-07). Daarom een allowedRoles-lijst i.p.v. de manage-eis: de bestaande
    // viewers (admin-tier + Beleid + Zorgcoördinator, die manage-admins-documents hadden)
    // behouden toegang, en Medewerker(/Test) komt erbij — read-only. De beheer-knoppen
    // (uploaden/bewerken/verwijderen) worden in beleid-documenten.js verborgen voor wie
    // geen manage-admins-documents heeft. beleid.html blijft de beheer-only pagina.
    // Spraakmemo eigenaar 2026-06-07: "Net als het beleid, dat voor iedereen zichtbaar
    // moet zijn." → open voor elke ingelogde gebruiker (read-only). De beheer-knoppen
    // (uploaden/bewerken/verwijderen) blijven in beleid-documenten.js verborgen voor wie
    // geen manage-admins-documents heeft. beleid.html blijft de beheer-only pagina.
    "beleid-documenten.html": null,
    "beleid.html": { action: "manage", entity: "admins-documents" },

    // ─── SharePoint (interne documentbibliotheek) — alleen kantoor ────────────
    // Werkvloer (rol Medewerker/ZZP) en detacheringsbureaus zien 'm niet. De
    // toegang per map wordt daarbovenop server-side beperkt via RLS
    // (is_office_staff + sp_folder_visible). Admin-tier wint sowieso.
    "sharepoint.html": { allowedRoles: ["Eigenaar", "Admin", "Directeur", "HR", "Planner", "Zorgcoördinator", "Finance", "Salarisadministratie", "Beleid", "Facilitair", "Gedragswetenschapper", "Cliëntbeheer"] },

    // ─── Financiën — STRIKT Eigenaar + Directeur + Finance ────────────────────
    // `strict:true` schakelt de admin-tier-bypass UIT (zie permissions-gate.js /
    // permissions-nav-hide.js): Admin krijgt hier GEEN toegang. Finance (degene die
    // de financiën/declaraties regelt) mag de onkosten invoeren/aanpassen.
    "financien-locaties.html": { allowedRoles: ["Eigenaar", "Directeur", "Finance"], strict: true },
    "financien-overhead.html": { allowedRoles: ["Eigenaar", "Directeur", "Finance"], strict: true },
    "financien-zorgsoorten.html": { allowedRoles: ["Eigenaar", "Directeur", "Finance"], strict: true },

    // ─── Audit (admin-tier) ───────────────────────────────────────────────────
    "audit.html": { action: "view", entity: "audit-logs" },

    // ─── Organisatie + beheer (admin-tier) ───────────────────────────────────
    "rollen.html": { action: "view", entity: "roles" },
    "rol-detail.html": { action: "view", entity: "roles" },
    "gebruikers.html": { action: "manage", entity: "users" },
    // Instellingen: open voor elke ingelogde gebruiker zodat iedereen z'n eigen profiel +
    // notificatie-voorkeuren kan beheren (ook de avatar-link "Mijn profiel" wijst hierheen).
    // Video-feedback eigenaar 2026-06-07 (HR-rondleiding): "instellingen, ja dat kan wel".
    // De BEHEER-tabs (Gebruikers, Notificatietypes, Entiteiten) worden in instellingen.js
    // verborgen voor wie geen edit-settings heeft → admin-tier + bestaande edit-settings-
    // rollen behouden ze; HR e.a. zien alleen Mijn profiel + Mijn notificaties.
    "instellingen.html": null,
  };

  global.BESA_PAGE_PERMISSIONS = PAGE_PERMISSIONS;
})(typeof window !== "undefined" ? window : this);
