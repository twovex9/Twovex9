# Item 34 — Cliënt-detail Contacten-tab geïmplementeerd

**Datum**: 2026-05-12
**Status**: ✅ Voltooid (2e van 4 placeholder-tabs uit item 14)
**Gerelateerd**: items 14, 33 (Betalingen), 1.1 uit `06-professional-finish.md`

## Wat is gedaan

De `Contacten`-tab op `client-detail.html` is geen placeholder meer. Volledige CRUD voor contactpersonen per cliënt.

### Database

Nieuwe tabel `public.client_contacten` via Supabase MCP `apply_migration`:

```sql
client_contacten (
  id uuid PK,
  client_id text FK → clienten(id) ON DELETE CASCADE,
  naam text NOT NULL,
  relatie text,             -- "Ouder", "Voogd", "Verwijzer", "Werkgever", etc.
  telefoon text,
  email text,
  is_primair bool DEFAULT false,
  notitie text,
  archived bool DEFAULT false,
  aanmaakdatum timestamptz,
  laatst_gewijzigd timestamptz
)
```

Plus index op `(client_id, archived)`, trigger voor `laatst_gewijzigd`, RLS `to authenticated` policies.

### Data-laag: `client-contacten-data.js`

Volgt het canonical patroon (zie werkpatronen sectie 6b):
- localStorage cache `client_contacten_v1`
- Async write naar Supabase + cache-update + event-fire
- `add`, `update`, `archive`, `restore`, `remove`
- `getForClientSync(clientId)` voor render
- Event: `ff:client-contacten-updated`

### UI

- **Toolbar**: "+ Contact toevoegen" knop rechts boven tabel
- **Tabel** met kolommen: Naam / Relatie / Telefoon / E-mail / Primair-badge / Acties (Bewerken / Archiveren)
- **Modal** voor toevoegen + bewerken: Naam (verplicht), Relatie, Telefoon, E-mail, Notitie, "Primair contact" checkbox
- **Empty state** bij geen contacten
- **Telefoon → `tel:` link**, **E-mail → `mailto:` link**
- **Sortering**: primair eerst, dan alfabetisch op naam (nl)
- **Archiveren** via slider-confirm (huisstijl sectie 3)

### Files gewijzigd

- `client-contacten-data.js` (nieuw): data-laag
- `client-detail.html`: placeholder vervangen, modal toegevoegd, script-load order
- `client-detail.js`: `renderContacten()` + modal + CRUD handlers (~150 regels)
- `styles.css`: `.cd-cont-*` classes (header, table, modal, primair-badge, responsive)

## Status item 14

✅ 2 van 4 placeholders gesloten (Betalingen + Contacten). Open:
- **Rapportages** — vereist nieuwe tabel + storage voor attachments
- **Vragenlijsten** — vereist nieuwe tabel met JSON-schema

## Test plan

- [ ] CI workflow groen (script-order: client-contacten-data.js vóór client-detail.js)
- [ ] Vercel deploy slaagt
- [ ] Visueel: open client-detail van een cliënt → klik Contacten-tab → empty state zichtbaar
- [ ] Visueel: klik "+ Contact toevoegen" → modal opent → vul naam in → opslaan → contact verschijnt in tabel
- [ ] Visueel: edit-knop → modal met preview → wijzig veld → opslaan → tabel update
- [ ] Visueel: archive-knop → slider-confirm → archiveer → contact verdwijnt uit tabel
- [ ] Visueel: "Primair contact" checkbox → primair-badge in tabel
- [ ] Visueel: tel/email links zijn klikbaar (tel: en mailto:)
- [ ] Supabase verify: `SELECT * FROM client_contacten` toont nieuwe records
