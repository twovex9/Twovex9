# [Module-naam] — bulk-acties

**Gescraped op**: YYYY-MM-DD

Doel: vaststellen welke bulk-acties BS2 heeft op tabellen in deze module (checkbox-headers + bulk-dropdown).

## Bulk-actie 1: [naam]

- **Activering**: bv. "Selecteer 1+ rows via checkboxes → 'Bulk acties' dropdown verschijnt boven tabel"
- **Beschikbare opties in bulk-dropdown**:
  - Archiveren
  - Definitief verwijderen
  - Status wijzigen → ...
  - Export-selectie naar CSV
- **Per optie**:
  - Confirm-modal: ja/nee
  - Network: `POST /api/.../bulk-archive` met `{ids: [...]}` of 1×PATCH per row
  - Resultaat: toast met `"X items gearchiveerd"` + tabel verversen

## Indien GEEN bulk-acties gevonden

Bevestig: in deze module heeft BS2 **geen** bulk-acties — elke actie 1-voor-1 per row.

## Selectie-gedrag

- "Select all" in header-checkbox: selecteert alle records op huidige pagina of ook andere pagina's?
- "Deselect all"
- Selectie-counter onderaan/bovenaan: "X items geselecteerd"
- Selectie behouden bij filter-wijziging? Bij pagineren?
