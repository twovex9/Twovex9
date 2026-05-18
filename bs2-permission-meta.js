/* global window */
/**
 * bs2-permission-meta.js — Nederlandse labels + beschrijvingen voor de 146
 * BS2-machtigingen + de 17 groepen in exacte BS2-volgorde.
 *
 * Bron: user-screenshot van BS2 /organization/roles → rol → rechten-scherm
 * (2026-05-18), 1-op-1 gemapt op de slug-catalogus uit public.bs2_permissions.
 * Wordt gebruikt door rollen.js om het rechten-scherm 1-op-1 BS2 te tonen.
 *
 * window.BS2_PERM_GROUPS : [{key, label}]  (perm_group → NL, BS2-volgorde)
 * window.BS2_PERM_META   : { slug: { label, desc } }
 */
(function (g) {
  "use strict";

  g.BS2_PERM_GROUPS = [
    { key: "settings", label: "Instellingen" },
    { key: "organization", label: "Organisatie" },
    { key: "hr", label: "HR" },
    { key: "planning", label: "Planning" },
    { key: "clients", label: "Cliënten" },
    { key: "tasks", label: "Taken" },
    { key: "policy", label: "Beleid" },
    { key: "audit-logs", label: "Audit Logs" },
    { key: "time-registrations", label: "Tijdregistratie" },
    { key: "invoices", label: "Facturen" },
    { key: "leave-management", label: "Verlofbeheer" },
    { key: "incidents", label: "Incidenten" },
    { key: "mileage-declarations", label: "Kilometerdeclaraties" },
    { key: "employees", label: "Medewerkers" },
    { key: "reports", label: "Rapportages" },
    { key: "announcements", label: "Nieuws" },
    { key: "contact-persons", label: "Contactpersonen" },
  ];

  function m(label, desc) { return { label: label, desc: desc }; }

  g.BS2_PERM_META = {
    // Instellingen
    "browse-users": m("Gebruikers browsen", "Gebruikers browsen in bijvoorbeeld dropdown lijsten"),
    "view-users": m("Gebruikers bekijken", "Toegang tot gebruikersbeheer via Instellingen > Gebruikers"),
    "manage-users": m("Gebruikers beheren", "Gebruikers aanmaken, bijwerken en verwijderen"),
    "manage-user-security": m("Gebruikersbeveiliging beheren", "Wachtwoorden resetten en 2FA instellingen beheren"),
    "edit-settings": m("Instellingen bewerken", "De instellingen van de organisatie bewerken"),
    "browse-entities": m("Entiteiten browsen", "Entiteiten browsen in bijvoorbeeld dropdown lijsten"),
    "view-entities": m("Entiteiten bekijken", "Toegang tot entiteitenbeheer via Instellingen > Entiteiten"),
    "manage-entities": m("Entiteiten beheren", "Entiteiten beheren"),
    "impersonate-users": m("Gebruikers impersoneren", "Gebruikers impersoneren"),
    // Organisatie
    "browse-roles": m("Rollen browsen", "Rollen browsen in bijvoorbeeld dropdown lijsten"),
    "view-roles": m("Rollen bekijken", "Toegang tot rollenbeheer via Organisatie > Rollen"),
    "manage-roles": m("Rollen beheren", "Rollen aanmaken, bijwerken en verwijderen"),
    "browse-teams": m("Teams browsen", "Teams browsen in bijvoorbeeld dropdown lijsten"),
    "view-teams": m("Teams bekijken", "Teams bekijken"),
    "manage-teams": m("Teams beheren", "Teams beheren"),
    "manage-team-members": m("Team medewerkers beheren", "Team medewerkers beheren"),
    // HR
    "browse-employees": m("Medewerkers browsen", "Medewerkers browsen in bijvoorbeeld dropdown lijsten"),
    "view-employees": m("Medewerkers bekijken", "Toegang tot medewerkersbeheer via HR > Medewerkers"),
    "manage-employees": m("Medewerkers beheren", "Medewerkers aanmaken, bijwerken en verwijderen"),
    "view-employee-financial-info": m("Financiële informatie medewerkers bekijken", "De financiële informatie van een medewerker (Salaris, uurtarieven etc.) bekijken"),
    "manage-employee-financial-info": m("Financiële informatie medewerkers beheren", "De financiële informatie van een medewerker (Salaris, uurtarieven etc.) bijwerken"),
    "view-employee-documents": m("Documenten bekijken", "De documenten van een medewerker bekijken"),
    "manage-employee-documents": m("Documenten beheren", "Documenten van een medewerker uploaden, bijwerken en verwijderen"),
    "browse-locations": m("Locaties browsen", "Locaties browsen in bijvoorbeeld dropdown lijsten"),
    "view-locations": m("Locaties bekijken", "Toegang tot locatiebeheer via HR > Locaties"),
    "manage-locations": m("Locaties beheren", "Locaties aanmaken, bijwerken en verwijderen"),
    "manage-employee-competencies": m("Medewerker competenties beheren", "Medewerker competenties beheren"),
    "browse-competencies": m("Competenties browsen", "Competenties browsen in bijvoorbeeld dropdown lijsten"),
    "view-competencies": m("Competenties bekijken", "Toegang tot competentiebeheer via HR > Competenties"),
    "manage-competencies": m("Competenties beheren", "Competenties aanmaken, bijwerken en verwijderen"),
    "view-salary-structure": m("Salarisstructuur bekijken", "De salarisstructuur van de organisatie bekijken"),
    "manage-salary-structure": m("Salarisstructuur beheren", "Salarisschalen aanmaken, bijwerken en verwijderen"),
    "adjust-salary-structure": m("Salaris correctie", "Salarisstructuur corrigeren"),
    "browse-certifications": m("Opleidingen browsen", "Opleidingen browsen in bijvoorbeeld dropdown lijsten"),
    "view-certifications": m("Opleidingen bekijken", "Toegang tot opleidingsbeheer via HR > Opleidingen"),
    "manage-certifications": m("Opleidingen beheren", "Opleidingen aanmaken, bijwerken en verwijderen"),
    "view-employee-professionals": m("Professionele informatie bekijken", "Professionele informatie bekijken"),
    "manage-employee-professionals": m("Medewerker professionals beheren", "Medewerker professionals beheren"),
    "browse-statutory-milestones": m("Wet poortwachter mijlpalen browsen", "Wet poortwachter mijlpalen browsen in bijvoorbeeld dropdown lijsten"),
    "view-statutory-milestones": m("Wet poortwachter mijlpalen bekijken", "Toegang tot wet poortwachter mijlpalen bekijken"),
    "manage-statutory-milestones": m("Wet poortwachter mijlpalen beheren", "Wet poortwachter mijlpalen aanmaken, bijwerken en verwijderen"),
    "browse-employee-absences-sickness": m("Verzuim browsen", "Verzuim browsen in bijvoorbeeld dropdown lijsten"),
    "view-employee-absences-sickness": m("Verzuim bekijken", "Toegang tot verzuim van medewerkers bekijken"),
    "manage-employee-absences-sickness": m("Verzuim beheren", "Verzuim van medewerkers aanmaken, bijwerken en verwijderen"),
    // Planning
    "browse-shifts": m("Diensten browsen", "Diensten browsen in bijvoorbeeld dropdown lijsten"),
    "create-shifts": m("Diensten aanmaken", "Diensten aanmaken voor medewerkers"),
    "update-shifts": m("Diensten bijwerken", "De diensten van medewerkers bijwerken"),
    "filter-shifts": m("Diensten filteren", "De diensten van medewerkers filteren"),
    "assign-employees-to-shift": m("Medewerkers toewijzen aan diensten", "Medewerkers toewijzen aan diensten"),
    "approve-absence": m("Afwezigheid goedkeuren", "De afwezigheid van medewerkers goedkeuren"),
    "browse-availability": m("Beschikbaarheid browsen", "Beschikbaarheid browsen in bijvoorbeeld dropdown lijsten"),
    "view-availability": m("Beschikbaarheid bekijken", "Toegang tot beschikbaarheid bekijken"),
    "manage-availability": m("Beschikbaarheid beheren", "De beschikbaarheid van medewerkers beheren"),
    "browse-availability-types": m("Beschikbaarheidstypes browsen", "Beschikbaarheidstypes browsen in bijvoorbeeld dropdown lijsten"),
    "view-planning-availability-types": m("Beschikbaarheidstypes bekijken", "Toegang tot het beschikbaarheidstypebeheer via Planning > Beheer > Beschikbaarheidstypes"),
    "manage-availability-types": m("Beschikbaarheidstypes beheren", "Beschikbaarheidstypes aanmaken, bijwerken en verwijderen"),
    "browse-shift-types": m("Diensttypes browsen", "Diensttypes browsen in bijvoorbeeld dropdown lijsten"),
    "view-planning-shift-types": m("Diensttypes bekijken", "Toegang tot het diensttypebeheer via Planning > Beheer > Diensttypes"),
    "view-planning-switch-shifts": m("Dienstwisselingen bekijken", "Toegang tot dienstwisselingen via Planning > Beheer > Dienstwisselingen"),
    "view-planning-absences": m("Afwezigheden bekijken", "Afwezigheden bekijken"),
    "view-planning": m("Planning bekijken", "Planning overzicht bekijken"),
    "manage-employee-hourly-rates": m("Medewerker uurtarieven beheren", "Medewerker uurtarieven beheren"),
    "browse-deviations": m("Afwijkingen browsen", "Afwijkingen browsen in bijvoorbeeld dropdown lijsten"),
    "view-deviations": m("Afwijkingen bekijken", "Afwijkingen bekijken"),
    "approve-employee-overtime": m("Overuren goedkeuren", "Overuren goedkeuren"),
    "view-planning-employees": m("Medewerkers planning bekijken", "Toegang tot medewerkers onder Planning > Beheer > Medewerkers"),
    "manage-planning-employees": m("Medewerkers planning beheren", "Bewerk toegang tot medewerkers onder Planning > Beheer > Medewerkers"),
    "planning-settings-view": m("Planning instellingen bekijken", "Toegang tot planning instellingen bekijken"),
    "manage-settings-view": m("Planning instellingen beheren", "Toegang tot planning instellingen beheren"),
    "manage-shifts": m("Diensten beheren", "Diensten aanmaken, bijwerken en verwijderen"),
    // Cliënten
    "browse-clients": m("Cliënten browsen", "Cliënten browsen in bijvoorbeeld dropdown lijsten"),
    "view-clients": m("Cliënten bekijken", "Alle cliënten bekijken"),
    "manage-clients": m("Cliënten beheren", "Cliënten aanmaken, bijwerken en verwijderen"),
    "browse-care-types": m("Zorgsoorten browsen", "Zorgsoorten browsen in bijvoorbeeld dropdown lijsten"),
    "view-care-types": m("Zorgsoorten bekijken", "Toegang tot zorgsoortenbeheer via Cliënten > Zorgsoorten"),
    "manage-care-types": m("Zorgsoorten beheren", "Zorgsoorten aanmaken, bijwerken en verwijderen"),
    "browse-dispositions": m("Beschikkingen browsen", "Beschikkingen browsen in bijvoorbeeld dropdown lijsten"),
    "view-dispositions": m("Beschikkingen bekijken", "Toegang tot beschikkingbeheer via Cliënten > Beschikkingen"),
    "manage-dispositions": m("Beschikkingen beheren", "Beschikkingen aanmaken, bijwerken en verwijderen"),
    "view-dispositions-dashboard": m("Beschikkingen dashboard bekijken", "Toegang tot het beschikkingen dashboard via Cliënten > Beschikkingen > Dashboard"),
    "browse-disposition-payments": m("Beschikking facturen browsen", "Beschikking facturen browsen in bijvoorbeeld dropdown lijsten"),
    "view-disposition-payments": m("Beschikking facturen bekijken", "Alle beschikking facturen bekijken"),
    "manage-disposition-payments": m("Beschikking facturen beheren", "Beschikking facturen bijwerken"),
    "browse-care-allocators": m("Organisaties browsen", "Organisaties browsen in bijvoorbeeld dropdown lijsten"),
    "view-care-allocators": m("Organisaties bekijken", "Toegang tot organisatiebeheer via Cliënten > Organisaties"),
    "manage-care-allocators": m("Organisaties beheren", "Organisaties aanmaken, bijwerken en verwijderen"),
    "browse-municipalities": m("Gemeenten browsen", "Gemeenten browsen in bijvoorbeeld dropdown lijsten"),
    "view-municipalities": m("Gemeenten bekijken", "Gemeenten bekijken"),
    "manage-municipalities": m("Gemeenten beheren", "Alle gemeenten beheren"),
    "manage-client-documents": m("Cliëntdocumenten beheren", "Cliëntdocumenten aanmaken, bijwerken en verwijderen"),
    "browse-weekly-budgets": m("Wekelijkse budgetten browsen", "Wekelijkse budgetten browsen in bijvoorbeeld dropdown lijsten"),
    "view-weekly-budgets": m("Wekelijkse budgets bekijken", "Wekelijkse budgets bekijken"),
    "manage-weekly-budgets": m("Wekelijkse budgets beheren", "Wekelijkse budgets beheren"),
    "browse-monthly-hour-declarations": m("Urendeclaraties browsen", "Urendeclaraties browsen in bijvoorbeeld dropdown lijsten"),
    "view-monthly-hour-declarations": m("Urendeclaraties bekijken", "Toegang tot urendeclaraties via Cliënten > Urendeclaraties"),
    "manage-monthly-hour-declarations": m("Urendeclaraties beheren", "Urendeclaraties beheren"),
    "view-finance-dashboard": m("Financieel dashboard bekijken", "Toegang tot het financieel dashboard"),
    "browse-client-form-templates": m("Vragenlijst sjablonen browsen", "Vragenlijst sjablonen browsen in bijvoorbeeld dropdown lijsten"),
    "view-client-form-templates": m("Vragenlijst sjablonen bekijken", "Toegang tot vragenlijst sjablonen via Cliënten > Vragenlijst sjablonen"),
    "manage-client-form-templates": m("Vragenlijst sjablonen beheren", "Vragenlijst sjablonen beheren"),
    // Taken
    "mark-task-as-completed": m("Taak als voltooid markeren", "Taak als voltooid markeren"),
    "assign-tasks": m("Taken toewijzen", "Taken toewijzen"),
    "browse-tasks": m("Taken browsen", "Taken browsen in bijvoorbeeld dropdown lijsten"),
    "view-tasks": m("Taken bekijken", "Taken bekijken"),
    "manage-tasks": m("Taken beheren", "Taken beheren"),
    // Beleid
    "manage-admins-documents": m("Beleid aanpassen", "Beleidsdocumenten aanmaken, bijwerken en verwijderen"),
    // Audit Logs
    "view-audit-logs": m("Auditlogboeken bekijken", "Alle auditlogboeken bekijken"),
    // Tijdregistratie
    "view-employee-hour-registrations": m("Medewerker uurregistraties bekijken", "Geregistreerde uren van medewerkers bekijken"),
    "browse-labels": m("Labels browsen", "Labels browsen in bijvoorbeeld dropdown lijsten"),
    "view-labels": m("Labels bekijken", "Toegang tot labelbeheer via Urenregistratie > Labels"),
    "manage-labels": m("Labels beheren", "Labels beheren"),
    "browse-locked-months": m("Vergrendelde maanden browsen", "Vergrendelde maanden browsen in bijvoorbeeld dropdown lijsten"),
    "view-locked-months": m("Vergrendelde maanden bekijken", "Vergrendelde maanden bekijken"),
    "manage-locked-months": m("Vergrendelde maanden beheren", "Vergrendelde maanden beheren"),
    "manage-employee-registered-hours": m("Medewerker uurregistraties bewerken", "Geregistreerde uren van medewerkers bewerken"),
    // Facturen
    "import-invoices": m("Facturen importeren", "Facturen importeren in bijvoorbeeld dropdown lijsten"),
    "browse-invoices": m("Facturen browsen", "Facturen browsen in bijvoorbeeld dropdown lijsten"),
    "view-invoices": m("Facturen bekijken", "Toegang tot facturen bekijken"),
    "manage-invoices": m("Facturen beheren", "Toegang tot facturen beheren"),
    // Verlofbeheer
    "manage-leave-types": m("Vakantietypes beheren", "Vakantietypes aanmaken, bijwerken en verwijderen"),
    "view-employee-leave-balances": m("Verlofsaldo's bekijken", "Toegang tot de verlofsaldo's van medewerkers bekijken"),
    "view-leave-balances": m("Verlofsaldi bekijken", "Toegang tot verlofsaldi bekijken"),
    "create-employee-leave-requests": m("Verlofaanvragen aanmaken", "Verlofaanvragen aanmaken namens medewerkers"),
    "approve-leave-requests": m("Goedkeuren van verlofaanvragen", "Beschrijving van het goedkeuren van verlofaanvragen"),
    // Incidenten
    "view-incidents": m("Bekijk incidenten", "Beschrijving van het bekijken van incidenten"),
    "handle-incidents": m("Incidenten afhandelen", "Incidenten afhandelen"),
    "view-incident-dashboard": m("Incident dashboard bekijken", "Toegang tot het incident dashboard"),
    "browse-incident-categories": m("Incidentcategorieën doorbladeren", "Toegang tot incidentcategorieën doorbladeren"),
    "view-incident-categories": m("Incidentcategorieën bekijken", "Toegang tot incidentcategorieën bekijken"),
    "manage-incident-categories": m("Incidentcategorieën beheren", "Toegang tot incidentcategorieën beheren"),
    "browse-improvement-measures": m("Verbetermaatregelen browsen", "Verbetermaatregelen browsen"),
    "view-improvement-measures": m("Verbetermaatregelen bekijken", "Verbetermaatregelen bekijken"),
    "manage-improvement-measures": m("Verbetermaatregelen beheren", "Verbetermaatregelen beheren"),
    // Kilometerdeclaraties
    "browse-mileage-declarations": m("Kilometerdeclaraties doorbladeren", "Toegang tot kilometerdeclaraties doorbladeren"),
    "view-mileage-declarations": m("Kilometerdeclaraties bekijken", "Toegang tot kilometerdeclaraties bekijken"),
    "view-all-mileage-declarations": m("Alle kilometerdeclaraties bekijken", "Toegang tot alle kilometerdeclaraties bekijken"),
    "manage-mileage-declarations": m("Kilometerdeclaraties beheren", "Toegang tot kilometerdeclaraties beheren"),
    // Medewerkers
    "view-basic-employees": m("Basisinformatie medewerkers bekijken", "Toegang tot basisinformatie van medewerkers bekijken"),
    "manage-basic-employees": m("Basisinformatie medewerkers beheren", "Basisinformatie van medewerkers aanmaken, bijwerken en verwijderen"),
    // Rapportages
    "browse-reports": m("Rapportages browsen", "Alle Rapportages bekijken"),
    "view-reports": m("Rapportages bekijken", "Alle Rapportages bekijken"),
    "manage-reports": m("Rapportages beheren", "Alle Rapportages beheren"),
    // Nieuws
    "browse-announcements": m("Nieuws browsen", "Nieuws browsen in bijvoorbeeld dropdown lijsten"),
    "view-announcements": m("Nieuws bekijken", "Nieuws bekijken"),
    "manage-announcements": m("Nieuws beheren", "Nieuws aanmaken, bijwerken en verwijderen"),
    // Contactpersonen
    "manage-contacts": m("Contactpersonen beheren", "Contactpersonen beheren"),
  };

  g.bs2PermLabel = function (slug) {
    var x = g.BS2_PERM_META[slug];
    return x ? x.label : slug;
  };
})(typeof window !== "undefined" ? window : this);
