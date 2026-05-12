# Item 37 — Cliënt-detail Vragenlijsten-tab geïmplementeerd

**Datum**: 2026-05-12
**Status**: ✅ Voltooid — **item 14 volledig gesloten** (4e van 4 placeholders)
**Gerelateerd**: items 14, 33 (Betalingen), 34 (Contacten), 35 (Rapportages), 36 (geplande data-sync trigger)

## Wat is gedaan

De laatste van de 4 placeholder-tabs uit item 14 is geen placeholder meer. Cliënten kunnen nu vragenlijsten invullen — met templates voor veelvoorkomende cases.

## Database

Nieuwe tabel `public.client_vragenlijsten`:

```sql
client_vragenlijsten (
  id uuid PK,
  client_id text FK → clienten ON DELETE CASCADE,
  naam text NOT NULL,
  template_naam text,                       -- 'intake'|'evaluatie'|'afsluiting'|null
  status text CHECK ('openstaand'|'ingevuld'|'gearchiveerd'),
  ingevuld_datum date,
  vragen_antwoorden jsonb DEFAULT '[]',     -- [{vraag,antwoord}, ...]
  archived, aanmaakdatum, laatst_gewijzigd
)
```

Plus 2 indexen, CHECK constraint, trigger, RLS `to authenticated`.

## Data-laag (`client-vragenlijsten-data.js`)

- Canonical patroon (cache + async Supabase + event)
- `getTemplateSync(key)` retourneert voorgedefinieerde vragen
- 3 templates in v1: **intake** (5 vragen), **evaluatie** (4 vragen), **afsluiting** (4 vragen)
- v2: templates uit DB ophalen i.p.v. hardcoded

## UI

### Tabel-view
- Kolommen: Naam / Template / Status-badge / Ingevuld op / Vragen-progress (`X / Y` beantwoord) / Acties
- Status badges: Openstaand (geel), Ingevuld (groen)
- Sortering: ingevuld_datum descending
- Archive via slider-confirm

### Modal
- Header: Naam (verplicht), Template-dropdown
- Status + Ingevuld-datum (2 kolommen)
- **Dynamic Q&A list**:
  - Elk vraag/antwoord-paar als card met `[Vraag input] [×]` + textarea voor antwoord
  - "+ Vraag toevoegen" knop om eigen vragen toe te voegen
  - Template selecteren vult de vragen automatisch in (met slider-confirm als er al content was)
- Antwoorden persisteren tussen template-changes
- Max-height 320px met scroll voor lange lijsten

## Files

- `client-vragenlijsten-data.js` (nieuw, 230 regels)
- `client-detail.html`: placeholder vervangen + modal
- `client-detail.js`: `renderVragenlijsten()` + modal + Q&A list management + template-loader (~260 regels)
- `styles.css`: `.cd-vrl-*` classes (status-badges, modal, qa-list met scroll, responsive)

## **Item 14 status: ✅ VOLLEDIG GESLOTEN**

Alle 4 placeholders implemented:
- ✅ Betalingen (item 33)
- ✅ Contacten (item 34)
- ✅ Rapportages (item 35)
- ✅ **Vragenlijsten (deze)**

## **TRIGGER VOOR ITEM 36**

Item 14 is hiermee af → **item 36 (BS2 → BS1 data sync) kan nu uitgevoerd worden** zodra deze PR mergeg.

Voor de volgende sessie / na merge: zie [`36-final-bs2-data-sync.md`](36-final-bs2-data-sync.md) voor het stappenplan.

## Test plan

- [ ] CI groen
- [ ] Vercel deploy slaagt
- [ ] Cliënt → Vragenlijsten-tab → empty state
- [ ] "+ Vragenlijst toevoegen" → modal opent → kies template "intake" → 5 vragen pre-filled
- [ ] Vul 2-3 antwoorden in → opslaan → row verschijnt met "2 / 5"
- [ ] Edit → modal vooringevuld → wijzig 1 antwoord → opslaan
- [ ] "+ Vraag toevoegen" → voeg eigen vraag toe → opslaan
- [ ] "×" naast vraag → verwijdert die regel
- [ ] Template wisselen met bestaande content → slider-confirm verschijnt
- [ ] Status "ingevuld" → groene badge
- [ ] Archive → slider-confirm → row weg
- [ ] Supabase: `SELECT vragen_antwoorden FROM client_vragenlijsten` toont JSON-array
