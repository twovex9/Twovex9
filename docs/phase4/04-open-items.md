# Phase 4 — 04: Open items / toekomstig werk

**Datum**: 2026-05-12
**Doel**: ALLES wat in Phase 1-4 als "niet-kritiek / voor toekomst / later" werd genoemd, hier gebundeld. Persistent in repo + memory zodat het na context-compactie of nieuwe sessie nog vindbaar is.

**Belangrijke regel**: zodra een nieuw "voor-toekomst" item opkomt, **direct toevoegen aan dit document EN aan memory `project_besa_phase4.md`**. Niet alleen in chat-tekst noemen — die verdwijnt.

## Data — niet-kritieke gaps

### 1. BS2 beschikkingen + facturen → cliënt FK-resolve

**Status**: BS2 `/api/dispositions` en `/api/invoices` endpoints sturen GEEN `client_id` in hun response. Mijn FK-resolve script kan dus geen `beschikkingen.client_id` of `facturen.client_id` koppelen aan BS1 cliënten. UI toont voor BS2-records "—" als cliëntnaam.

**Oplossing v2**: aparte BS2 endpoints fetchen die cliënt-disposition + cliënt-invoice relaties bevatten:
- `/api/clients/{id}/dispositions`
- `/api/clients/{id}/invoices`

**Vereiste**: nieuwe Bearer-token sessie via JS-snippet in BS2 console (user-actie).

**Concrete stappen wanneer dit opgepakt wordt**:
1. User opent BS2 in browser + DevTools → Network tab → kopieer Bearer-token
2. Run nieuwe JS-snippet die voor elke BS1 cliënt (87 BS2 records) zijn dispositions + invoices fetcht
3. JSON op disk in `scripts/bs2-exports/bs2-client-relations.json`
4. Aangepast `bs2-fk-resolve.mjs` leest deze + UPDATE beschikkingen.client_id + facturen.client_id

### 2. Twee medewerkers met dubbele naam, 2 verschillende emails

**Status**: niet auto-gemerged door dedup-script (verschillende emails = niet zeker dezelfde persoon).

**Records**:
- **Leonie Bakx** — emails `Leonie.Bakx@embracethefuture.nl` + `Leonieforyou@gmail.com`
- **Fouad Faiz** — emails `fouadfz@icloud.com` + `fouad.faiz@embracethefuture.nl`

**Actie**: handmatige review. Mogelijk:
- Echt dezelfde persoon (privé + werk-email) → merge handmatig
- Echt 2 personen met zelfde naam → laten staan

### 3. Master-data UUID-mapping niet bewaard

**Status**: BS2 stuurt UUIDs voor gemeenten/zorgsoorten/locaties/bureaus/opleidingen/competenties. BS1 heeft eigen UUIDs voor zelfde namen. Tijdens import was er geen mapping-tabel waar BS2 UUID → BS1 UUID bewaard wordt.

**Impact**: bij toekomstige BS2 → BS1 sync waar BS2 een ENTITY-id stuurt voor één van deze master-data, kan niet automatisch geresolved worden naar BS1-UUID. Moet via naam-match.

**Oplossing**: aparte tabel `public.bs2_uuid_map (resource text, bs2_uuid text, bs1_uuid text, PRIMARY KEY (resource, bs2_uuid))`. Bij elke BS2-import gevuld; bij FK-resolves geconsulteerd. Voor v2.

### 4. 6 ge-dedupe planning/cliënten records onderzoek

**Status**: tijdens BS2 → BS1 import had de planning 4454 records (4448 binnen, 6 ge-dedupe op zelfde ID). Clienten 87 → 81. De 6+6 dedupes waren BS2 records met dubbele ID's in pagination.

**Actie**: onderzoek of die 12 records écht duplicaten waren of dat informatie verloren ging. Vergelijk JSON `scripts/bs2-exports/bs2-export-full.json` met huidige Supabase counts.

### 5. Verzuim casing onderhoud

**Status**: bij Phase 4 was casing onhomogeen (`Actief`/`Hersteld` BS1, `actief` BS2). Genormaliseerd naar lowercase. **Bewaak**: bij toekomstige inserts via UI, controleer dat status lowercase blijft.

## UI — minor UX tweaks

### 6. Planning default-view = huidige week

**Status**: Standaard toont planning-pagina "huidige week" (mei 2026), maar BS2-imported shifts zijn oudere data (2020-2025). Voor 0 records zichtbaar bij open. User moet handmatig naar vorige weken navigeren.

**Optie A**: voeg "Alle weken" toggle toe in planning.html toolbar
**Optie B**: auto-detect: als huidige week 0 records heeft, spring automatisch naar laatste week met records
**Optie C**: laten staan, accepteren dat data oud is

### 7. Beschikkingen default-filters

**Status**: filters "Verloopt binnen 60d", "Heeft te declareren lopende maand", "Heeft nog niet gedeclareerd" werken op `nog_niet_gedeclareerd > 0` etc. Voor BS2-records is dit veld 0 (default). Bij actieve filter: 0 records zichtbaar.

**Mitigatie**: filters zijn standaard UIT. Geen verdere fix nodig.

### 8. Audit-data MAX_PER_SOURCE = 500

**Status**: `audit-data.js` haalt max 500 recente events op per bron (beschikking_audit_log + audit_log). Notification-bell counter telt via SQL COUNT (geen limit). Bij heel grote DB > 1000 events kan UI niet alles tonen.

**Mitigatie**: pragmatic. Bij grote audit-volumes overweeg `LIMIT 500 OFFSET ...` pagination.

## Tooling/deploy — operations

### 9. Browser localStorage cache na deploy

**Status**: na elke Vercel deploy moet user-browser de oude JS-cache wissen om nieuwe versie van data-laag op te halen. `Ctrl+Shift+R` (hard refresh).

**Verbetering**: voeg `?v=<timestamp>` query-param toe aan JS-script-tags bij elke deploy. Of: gebruik service worker cache-invalidatie.

### 10. Test-records die nog overgebleven kunnen zijn

**Status**: na cleanup zijn Test Client / Test Medewerker (×2) / locatie 'test' / bureau 'test' gearchiveerd. Mogelijk zijn er meer test-records in andere tabellen.

**Actie**: scan `clienten/medewerkers/beschikkingen/facturen/planning/incidenten` waar naam/title `LIKE '%test%'` is.

### 11. Mysterie: verzuim BS2-records verdwenen tussen Phase 3 en Phase 4

**Symptoom**: na succesvolle user-handmatige SQL run in Supabase Studio (total=14, bs2_count=9) waren bij Phase 4 verificatie 9 BS2-records weg.

**Oorzaak**: onbekend. Niet onderzocht. Mogelijk een trigger op medewerkers.archive die cascade naar verzuim doet (maar verzuim heeft geen FK naar medewerkers, alleen string).

**Recovery**: opnieuw INSERT via `scripts/bs2-exports/verzuim-manual-insert.sql` óf via Supabase MCP (idempotent).

**Monitor in toekomst**: vóór elke major sessie:
```sql
SELECT COUNT(*) FILTER (WHERE id LIKE 'bs2-verzuim-%') AS bs2_count FROM verzuim;
-- Verwacht: 9
```
Als < 9, opnieuw inserten met onze klaarliggende SQL.

### 12. Bearer-token workflow voor BS2-data refresh

**Status**: instructies vorderden door chat-geschiedenis. Nu gebundeld in `docs/phase4/05-toolchain-recovery.md`.

**Actie**: bij elke toekomstige BS2-data refresh, volg sectie "BS2 → BS1 data refresh workflow" in 05-toolchain-recovery.md (8 stappen).

### 13. Service_role key handling

**Regel**: NOOIT in code, repo, of chat. Alleen via `$env:SUPABASE_SERVICE_KEY` env-var in PowerShell sessie. Wis na gebruik met `$env:SUPABASE_SERVICE_KEY = $null`.

**Locatie**: te halen via `https://supabase.com/dashboard/project/boscwvojcggkbdxhlfys/settings/api`.

### 14. Cliënt-detail 4 placeholder-tabs (feature gap)

**Status**: tijdens Phase 4 verificatie (2026-05-12) ontdekt dat 4 van 9 cliënt-detail tabs alleen placeholders zijn (geen functionele content):
- **Betalingen**: "Hier kunnen straks betalingen of factuurstromen zichtbaar gemaakt worden. Import en koppeling volgen."
- **Contacten**: "Contactpersonen, netwerk en verwijzers komen hier. Vul later aan of koppel met een agenda."
- **Rapportages**: "Lopende en afgeronde rapporten per cliënt worden hier gegroepeerd. Export/print volgt zodra aangesloten."
- **Vragenlijsten**: "Ingevulde of openstaande vragenlijsten per cliënt. Koppeling met toets- of e-forms volgt."

**Status BS2**: BS2 heeft mogelijk wél functionele versies — verificatie nodig.

**Actie voor v2**:
- Betalingen: koppelen aan `public.facturen` filtered op `client_id`, plus payment-history
- Contacten: nieuwe tabel `public.client_contacten` (M2M parent client + naam/relatie/tel/email)
- Rapportages: nieuwe tabel `public.client_rapportages` met text/document-attachments
- Vragenlijsten: nieuwe tabel `public.client_vragenlijsten` met JSON-schema

**Effort**: 4-8 uur (4 tabellen + 4 data-lagen + 4 UI-implementaties)

### 15. Verzuim-mystery onderzoek voltooid (2026-05-12)

**Resultaat**: SELECT op `information_schema.triggers` voor medewerkers+verzuim toont alleen `audit_log` triggers (INSERT/UPDATE/DELETE → audit_log entry). Geen DELETE-cascade triggers gevonden.

**Conclusie**: de 9 BS2-verzuim records die tussen Phase 3 en Phase 4 verdwenen zijn niet via een trigger verwijderd. Mogelijke oorzaken: transaction rollback in Supabase Studio, handmatige delete buiten Claude-sessie, of de oorspronkelijke insert was niet permanent (auto-rollback).

**Monitor**: query in item 11 blijft staan voor toekomstige sessies.

## Toekomstige BS2 → BS1 refresh

Wanneer nieuwe BS2 data komt (bv. nieuwe medewerkers, beschikkingen):

1. **User-actie**: Bearer-token snippet in BS2 console → nieuwe JSON in `scripts/bs2-exports/bs2-export-full.json`
2. **Claude-actie**: `node scripts/bs2-full-import.mjs` (idempotent — upsert met ON CONFLICT)
3. **Claude-actie**: `node scripts/bs2-fk-resolve.mjs` (incidenten cliënten + medewerkers + locaties)
4. **Optioneel**: Supabase MCP query voor master-data dedup zoals in Phase 4B4

Stappen zijn herhaalbaar zonder data-verlies (alles idempotent + archive ipv delete).

## Definitie van klaar — wanneer Phase 5 nodig?

Een Phase 5 is nodig als:
- User vraagt om feature die BS2 wel heeft maar BS1 niet (nieuwe inventaris-ronde)
- Wettelijke compliance-eisen veranderen (bv. GDPR-flow)
- BS2 voegt nieuwe entities toe (huidige dekking = compleet)
- Performance-issues bij grotere volumes (kilometers/werkuren als ze gevuld worden)

Niet nodig voor:
- Cosmetic UI-tweaks (cliëntenpagina dropdown sortering, etc.)
- Bug-fixes (gewoon committen + pushen)
- Test-data toevoegen (BS1 UI ondersteunt al + Cliënt toevoegen)
