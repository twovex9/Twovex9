# Taken — BS2 functioneel model (1-op-1 referentie) — 2026-05-17

Bron: recorder `bs2-console-taken-recorder.js` (51 calls; volledige
dataset 518 taken in één respons). BS2 = autoritatief. **Bindend
contract** voor de BS1-overname (productie-klaar: werkt vóór én achter
de schermen).

## 1. Endpoints (BS2)

- `GET /api/tasks?with[]=assignee&with[]=creator&with[]=collaborators&with[]=incident[&filters…]`
  — lijst. **Géén paginatie**: de volledige set (518) komt in één
  respons (`meta.last_page=1`). Embeds: assignee, creator,
  collaborators, incident.
- `GET /api/tasks/{id}` — detail (zelfde velden als lijstrij).
- `POST /api/tasks` — aanmaken (zie payload §4).
- `GET /api/users` — gebruikers (assignee/teamlid/collaborators-picker).
- `GET /api/employees` — medewerkers.
- `GET /api/comments` — opmerkingen per taak.
- `GET /api/files` — bijlagen per taak.

## 2. Taak — datamodel (lijstrij = detail, identiek)

`id, title, description (HTML, mag null), due_date (YYYY-MM-DD|null),
priority, status, is_private (bool), assignee{user|null},
creator{user}, collaborators[ {user} ], incident{…}|null,
created_at, updated_at, deleted_at`

`user`-object (assignee/creator/collaborators): `{id, avatar, name,
first_name, last_name, email, phone, status, is_root, has_password,
introduction_email_sent, is_2fa_verified, created_at, updated_at,
deleted_at}`.

`incident` (nullable): volledig incident-object (koppeling taak↔incident,
zoals de incidenten-module `/api/tasks?incident_id`).

## 3. Geverifieerde feiten (volledige set, 518 taken)

- **518 taken** totaal. Status: `Voltooid` 471, `--` 41,
  `In behandeling` 6. Priority: `Low` 329, `Medium` 115, `High` 74.
- incident-gekoppeld: 1 · is_private: 0 · trashed (deleted_at): 0 ·
  met description: 268.
- **Statuses (verbatim, BS2):** `--` (geen/standaard), `In behandeling`,
  `Voltooid`. (Mogelijk meer in create-form; verbatim overnemen.)
- **Priority (verbatim):** `Low`, `Medium`, `High`.

## 4. Aanmaken — `POST /api/tasks` (exact)

`{ title, status, due_date, is_private (bool), assignee (userId),
priority, collaborators ([userId,…]), incident_id (null|id),
files ([]) }`
→ 201 met het volledige taak-object (id, …, assignee/creator embed).
description kan los meegestuurd/aangevuld worden (detail had HTML
`description`).

## 5. Filters / tabs / sortering (query-params, 1-op-1)

- **Mijn taken** = `filter[my_tasks]=true` ; **Alle taken** = die filter weg.
- **Voltooide taken verbergen** = `filter[hide_done]=1` (0 = toon alle).
- **Selecteer een teamlid** = `filter[assignee]=<userId>`.
- **Gearchiveerd** = `filter[trashed]=1` (0 = niet-gearchiveerd).
- **Status** = `filter[statuses][0]=Voltooid` (array, verbatim
  status-waarde).
- **Kies een deadline** = `filter[due_date][start]=YYYY-MM-DD&filter[due_date][end]=YYYY-MM-DD`.
- **Sorteren op** = `sort=deadline` | `sort=toegewezen aan` | … (NL-labels url-encoded).
- Zoeken / Prioriteit-filter / "Kies een aanmaakdatum": analoog
  (`filter[search]`, `filter[priority]`, `filter[created_at][start|end]`)
  — patroon idem, exact te bevestigen indien nodig.

## 6. UI-structuur (1-op-1, uit screenshot)

- Titel **Taken** + `+ Taak toevoegen` + checkbox "Voltooide taken
  verbergen" + kalender- & persoon-icoon (weergaven).
- Tabs **Mijn taken** / **Alle taken**.
- Filterbalk: zoeken, "Selecteer een teamlid", Gearchiveerd-toggle,
  Status, Prioriteit, "Sorteren op", "Kies een deadline", "Kies een
  aanmaakdatum", **Reset**.
- Tabel-kolommen: **Taaknaam · Toegewezen aan · Aangemaakt door ·
  Status · Deadline · Prioriteit**.
- **Groepering op deadline-bucket**: `Vandaag`, `Te laat`, `Deze week`,
  `Later`, `Geen deadline` (elk met telling). "Geen taken"-leegstatus.

## 7. Gap BS1 (huidige staat)

- `public.taken` bestaat maar is **leeg (0 rijen)** → schema-uitbreiding
  is niet-destructief (geen backup/akkoord nodig).
- Huidig BS1-model is vereenvoudigd/afwijkend: `naam, beschrijving,
  toegewezen_aan_id(uuid FK), status(open/in_progress/voltooid/
  geannuleerd), prioriteit(laag/midden/hoog), deadline`. **Niet** 1-op-1
  BS2 (geen title/HTML-description, andere status/priority-waarden, geen
  creator/collaborators/incident/is_private, geen tabs/filters/groepering).
- `incident_taken` (incidenten-module) = aparte tabel, blijft ongemoeid.

## 8. Plan (atomic PR's, methodiek STAP 0-6)

1. **Schema**: `taken` uitbreiden met BS2-velden (bs2_id, title,
   description, due_date, priority, status verbatim, is_private,
   assignee/creator/collaborators/incident jsonb, data jsonb bs2_scrape,
   bs2_created_at/updated_at). Niet-destructief (0 rijen). Backups n.v.t.
2. **Importer** `write-taken.mjs` (service-role REST): 518 taken
   1-op-1, `data.bs2_scrape` 100% behoud.
3. **Data-laag** `taken-data.js` herschrijven op BS2-model (DATA-SLIM:
   geen zware blob in localStorage; CRUD: add/update/setStatus/
   complete/archive/restore/delete → Supabase).
4. **UI** `taken.html`/`taken.js` 1-op-1 BS2: Mijn/Alle tabs, alle
   filters + Reset, deadline-groepering (Vandaag/Te laat/Deze week/
   Later/Geen deadline), kolommen, `+ Taak toevoegen`-modal, detail,
   bewerken, status/voltooien, archiveren/herstellen, verwijderen.
   BS1-huisstijl. Top-nav: `taken.html` → "Taken" actief.
5. **Verificatie**: 518 = BS2, statussen/priority-telling exact,
   filters/tabs/groepering, CRUD productie-klaar, 2 clean runs,
   0 console-errors.
