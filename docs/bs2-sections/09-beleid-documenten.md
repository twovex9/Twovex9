# BS2 — Beleid / Documenten (`/documents`)

**URL**: https://etf.acceptance.besasuite.nl/documents
**Label in nav**: "Beleid" — page-titel "Documenten" (semantisch hetzelfde — beleidsdocumenten)

## Structuur
- Header: "Documenten"
- Action: **Document uploaden**, **Reset**
- Toolbar: **Kolommen**, search "Zoeken..."
- Tabel met checkboxes per rij (bulk-acties mogelijk)

## Tabel-kolommen
| Kolom | Voorbeeld |
|---|---|
| Naam | "01. Onboarding...", "23. Vier weken Onboardingsplan..." |
| Uploaddatum | "26-03-2026 19:03" |
| Laatst gewijzigd | "26-03-2026 19:03" |
| Acties | edit/download/delete knoppen |

**25 documenten totaal**, 15 per pagina, paginatie aanwezig.

## Voorbeelden van bestanden
- Beleidsprotocol Middelengebruik
- Beleid Veilig mailen
- Stagebegeleider beleidsdocument
- Gefaseerde Time-Out
- Onboarding- en begeleidingsstructuur
- HR & facturatie protocol
- Richtlijnen stage (stagiair & stagebegeleider)
- Aanvulling detacheringsbureaus bij uitval
- Ziekteverzuimbeleid ZZP
- Dossieranalyse
- Dienstuitval & Escalatieladder protocol
- Dienstoverdracht protocol
- Uitgifte en Gebruik Bankpas
- Stageprotocol jeugdzorg
- Vier weken Onboardingsplan ondersteunende afdelingen

Allemaal genummerd (01-25), wat suggereert handmatige volgorde-veld.

## Inferred datamodel — `beleidsdocumenten`

```sql
create table if not exists public.beleidsdocumenten (
  id uuid primary key default gen_random_uuid(),
  volgnummer int,  -- "01.", "02.", ... 
  naam text not null,
  storage_path text not null,  -- Supabase Storage bucket
  uploaddatum timestamptz default now(),
  laatst_gewijzigd timestamptz default now(),
  geupload_door_id uuid references public.profiles(id),
  archived boolean default false
);
```

**Storage**: bucket `beleidsdocumenten` (te creëren) per BS1 patroon (`client-documents`, `medewerker-documenten` bestaan al).

## Parity met BS1

- ❌ Geen `beleidsdocumenten`-tabel in BS1
- 🟡 BS1 `werkruimte.html` heeft "beleid"-tab — implementatie onbekend
- ❌ Geen Storage-bucket `beleidsdocumenten` (alleen `client-documents` en `medewerker-documenten`)
- **Belangrijke gap**: nieuw bouwen voor BS1 (tabel + bucket + page + data-laag)
