# Module 02: Planning — print / PDF / export

**Gescraped op**: 2026-05-13 (batch 1)

## Batch 1 bevindingen

**"Exporteren" knop in sidebar** ontdekt — niet geklikt in batch 1. Te testen in batch 2.

Verwachting: CSV/Excel-export van geplande/openstaande diensten (matcht v2 Sprint 5 "Planning Exporteren CSV" in BS1).

Geen print-knop ontdekt op toolbar.

## Te testen in batch 2

1. Klik "Exporteren" knop in sidebar:
   - Wat is output-format (CSV/Excel/PDF)?
   - Welke kolommen?
   - Inclusief huidige filters?
   - Welke datum-range (huidige week of alle)?
2. Check of dienst-detail-modal een print-knop heeft (te zien bij Actie 6 in behaviors.md)
3. Check of Genereren-wizard een "Export concept-rooster" optie heeft

## BS1-implicatie

Per user-keuze 19 (PDF/print 1-op-1 BS2):
- BS1 heeft al CSV-export via v2 Sprint 5 — kan hergebruikt worden
- Indien BS2 ook PDF heeft → implementeren via jsPDF in BS1
