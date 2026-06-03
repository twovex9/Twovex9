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
    "notifications.html": null,
    "nieuws.html": { action: "view", entity: "announcements" },

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
    "bureaus.html": { action: "browse", entity: "locations" },          // BS1-only, gebruikt locations als proxy
    "bureau-detail.html": { action: "view", entity: "locations" },
    "verzuim.html": { action: "browse", entity: "employee-absences-sickness" },

    // ─── Salarishuis — UITZONDERING op BS2-model (strikt 4 rollen) ────────────
    "salarishuis.html": { allowedRoles: ["Eigenaar", "Admin", "Directeur", "HR"] },
    "salarishuis-wijzigingsgeschiedenis.html": { allowedRoles: ["Eigenaar", "Admin", "Directeur", "HR"] },

    // ─── Salaris-uitvoer + compensatie (Salarisadministratie + admin-tier) ────
    "salarisadministratie-exporter.html": { allowedRoles: ["Eigenaar", "Admin", "Directeur", "HR", "Salarisadministratie"] },
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
    "taken.html": { action: "view", entity: "tasks" },

    // ─── Werkuren / time-registrations ───────────────────────────────────────
    "werkuren.html": { action: "view", entity: "employee-hour-registrations" },
    "werkuren-labels.html": { action: "browse", entity: "labels" },
    "urendeclaraties.html": { action: "view", entity: "employee-hour-registrations" },
    "plus-minuren.html": { action: "view", entity: "employee-hour-registrations" },
    "uren-budgettering.html": { action: "manage", entity: "employee-registered-hours" },

    // ─── Incidenten ───────────────────────────────────────────────────────────
    "incidenten.html": { action: "view", entity: "incidents" },
    "incidenten-dashboard.html": { action: "view", entity: "incident-dashboard" },
    "incident-melden.html": { action: "view", entity: "incidents" },
    "incidenten-categorieen.html": { action: "view", entity: "incident-categories" },
    "verbeteringsmaatregelen.html": { action: "view", entity: "improvement-measures" },

    // ─── Facturen (top-bar = employee-invoices) ──────────────────────────────
    // FF-native ZZP-proforma-facturatie (zzp_facturen) — zelfde invoices-permissie.
    "zzp-facturen.html": { action: "view", entity: "invoices" },
    "zzp-factuur-detail.html": { action: "view", entity: "invoices" },
    "facturen-alle.html": { action: "browse", entity: "invoices" },
    "facturen-te-beoordelen.html": { action: "view", entity: "invoices" },
    "facturen-indiening.html": { action: "view", entity: "invoices" },
    "invoice-detail.html": { action: "view", entity: "invoices" },
    "facturen-importeren.html": { action: "import", entity: "invoices" },

    // ─── Kilometers ───────────────────────────────────────────────────────────
    "kilometers.html": { action: "browse", entity: "mileage-declarations" },

    // ─── Beleid ───────────────────────────────────────────────────────────────
    "beleid-documenten.html": { action: "manage", entity: "admins-documents" },
    "beleid.html": { action: "manage", entity: "admins-documents" },

    // ─── Financiën — STRIKT Eigenaar + Directeur + Finance ────────────────────
    // `strict:true` schakelt de admin-tier-bypass UIT (zie permissions-gate.js /
    // permissions-nav-hide.js): Admin krijgt hier GEEN toegang. Finance (degene die
    // de financiën/declaraties regelt) mag de onkosten invoeren/aanpassen.
    "financien-locaties.html": { allowedRoles: ["Eigenaar", "Directeur", "Finance"], strict: true },

    // ─── Audit (admin-tier) ───────────────────────────────────────────────────
    "audit.html": { action: "view", entity: "audit-logs" },

    // ─── Organisatie + beheer (admin-tier) ───────────────────────────────────
    "rollen.html": { action: "view", entity: "roles" },
    "rol-detail.html": { action: "view", entity: "roles" },
    "gebruikers.html": { action: "manage", entity: "users" },
    "instellingen.html": { action: "edit", entity: "settings" },
  };

  global.BESA_PAGE_PERMISSIONS = PAGE_PERMISSIONS;
})(typeof window !== "undefined" ? window : this);
