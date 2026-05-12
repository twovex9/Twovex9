# Item 35 — Cliënt-detail Rapportages-tab geïmplementeerd

**Datum**: 2026-05-12
**Status**: ✅ Voltooid (3e van 4 placeholder-tabs uit item 14)
**Gerelateerd**: items 14, 33 (Betalingen), 34 (Contacten)

## Wat is gedaan

De `Rapportages`-tab op `client-detail.html` is geen placeholder meer. Volledige CRUD voor rapportages per cliënt, met optionele bijlage in storage.

## Database

Nieuwe tabel `public.client_rapportages`:

```sql
client_rapportages (
  id uuid PK,
  client_id text FK → clienten(id) ON DELETE CASCADE,
  titel text NOT NULL,
  inhoud text,
  status text DEFAULT 'concept' CHECK (status in ('concept','lopend','afgerond')),
  type text,                    -- 'voortgang' | 'evaluatie' | 'overdracht' | 'overig'
  rapport_datum date,
  auteur_id uuid FK → auth.users,
  storage_path text,             -- optioneel bestand
  archived bool DEFAULT false,
  aanmaakdatum, laatst_gewijzigd timestamptz
)
```

Plus 2 indexen, trigger voor `laatst_gewijzigd`, CHECK constraint op status, RLS `to authenticated`.

## Data-laag (`client-rapportages-data.js`)

- Canonical patroon (cache + async write + event)
- Bestanden naar bestaande bucket `client-documents` (geen aparte bucket nodig, sectie 6c)
- Pad: `<clientId>/rapport-<rapportId>-<safeFileName>`
- `add()` → INSERT row → upload file → UPDATE row met `storage_path`
- `update()` met `fileData` → vervangt bijlage (upsert)
- `remove()` → delete file uit storage + delete row

## UI

- **Toolbar**: status-filter dropdown + "+ Rapportage toevoegen"
- **Tabel**: Datum / Titel / Type / Status-badge / Bijlage-icoon / Acties
- **Modal**:
  - Titel (verplicht)
  - Datum + Type + Status (3 kolommen op desktop, stacked < 640px)
  - Inhoud (textarea, 6 rows)
  - Bijlage (file input, accept PDF/DOC/DOCX/TXT)
  - Bij bewerken: huidige bijlage zichtbaar met "openen" link
- **Status badges**: Concept (grijs), Lopend (geel), Afgerond (groen)
- **Bijlage**: 📎 icoon klikbaar → opent file in nieuwe tab
- **Sortering**: rapport-datum descending
- **Filter**: status (alle / concept / lopend / afgerond)
- **Archive** via slider-confirm

## Files

- `client-rapportages-data.js` (nieuw, 280 regels) — incl. file-upload helper
- `client-detail.html`: placeholder vervangen + modal + script-load
- `client-detail.js`: `renderRapportages()` + modal + CRUD + file-reader (~190 regels)
- `styles.css`: `.cd-rap-*` classes (header, table, modal, status-badges, responsive)

## Status item 14

✅ **3 van 4** placeholders gesloten. ⏳ Open: **Vragenlijsten** (JSON-schema).

## Test plan

- [ ] CI workflow groen
- [ ] Vercel deploy slaagt
- [ ] Cliënt → Rapportages-tab → empty state
- [ ] Add: titel "Test 1", status "lopend", upload PDF → row verschijnt met 📎 icoon
- [ ] Klik 📎 → opent PDF in nieuwe tab
- [ ] Edit: wijzig status → afgerond → status-badge groen
- [ ] Filter: status "concept" → toont alleen concept-rapportages
- [ ] Archive → slider-confirm → row weg
- [ ] Supabase: `SELECT * FROM client_rapportages` toont rij met `storage_path` ingevuld
- [ ] Supabase Storage: bestand in bucket `client-documents/<clientId>/rapport-<id>-...`
