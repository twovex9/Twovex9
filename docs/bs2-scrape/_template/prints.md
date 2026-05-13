# [Module-naam] — print / PDF / export

**Gescraped op**: YYYY-MM-DD

Doel: alle print/PDF/Excel/CSV-exports vaststellen die deze module heeft.

## Print/PDF-knoppen

### Print 1: [naam]

- **Locatie**: bv. "Detail-pagina factuur → 'Print factuur' knop"
- **Output-type**: PDF / Excel / CSV / Print-friendly browser
- **Layout**: bv. "Vasthoudend papier-formaat A4, ETF-logo bovenaan, factuur-velden met BTW-overzicht onderaan"
- **Velden in output**: lijst van alle data-velden die in print verschijnen
- **Trigger-flow**: klik knop → modal verschijnt / direct download / nieuwe tab opent
- **BS1-implementatie**: jsPDF voor PDF, print-CSS media-query voor browser-print, SheetJS voor Excel/CSV

### Print 2: ...

## Indien GEEN print/PDF gevonden

Bevestig: in deze module heeft BS2 **geen** print/PDF-functies. Geen BS1-implementatie nodig.

## Hoe vastgesteld

- Doorzoek de pagina op printer-iconen, PDF-iconen, "Exporteren"-knoppen, "Download" links
- Check toolbar-knoppen + acties-cel per row
- Check sub-pagina's en modals
