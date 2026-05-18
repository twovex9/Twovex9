# Top-bar Beleid / Documenten — BS2 functioneel model (1-op-1) — 2026-05-18

Bron: **BS2 PRODUCTIE** `https://etf.besasuite.nl/documents` (NIET acceptance).
Read-only gescrapet (geen mutatie op productie). BS2 = autoritatief.
**Bindend contract** voor de BS1-overname.

> ⚠️ **APART systeem.** NIET de bestaande `public.beleidsdocumenten` /
> `beleid.html` (25 rijen + bucket `beleidsdocumenten`) — die blijft 100%
> onaangeroerd (user-keuze 2026-05-18: "apart nieuw systeem, 0 risico").
> Patroon "twee gelijknamige systemen scheiden, niet koppelen".

## 1. Endpoint (BS2 PRODUCTIE)

`GET https://api.etf.besasuite.nl/api/documents?filter[target][type]=policy&filter[target][id]=policy&page=N&limit=15`
— Bearer-auth, `meta.total=25`, `per_page=15`, `last_page=2`. Zoeken via
`filter[search]=`. **PDF's** = `record.file.url` (pre-signed AWS S3, ~10 min
geldig). Browser-`fetch()` op S3 = CORS-geblokkeerd → bestanden via Node
opgehaald (geen CORS server-side), uitsluitend GET.

## 2. Datamodel (BS1 `public.beleid_documenten`, uuid PK = BS2 id)

| Kolom | BS2-veld | Stats (25) |
|---|---|---|
| id | id (uuid) | uniek 25/25 |
| name | name | nooit leeg, uniek |
| type / contract_type / is_flexible / flexible_* / contract_end_date / expiration_date | idem | **altijd null** (contract-velden, niet voor policy) |
| bs2_created_at | created_at | = "Uploaddatum" |
| bs2_updated_at | updated_at | = "Laatst gewijzigd" |
| bs2_deleted_at | deleted_at | altijd null |
| file_id/_name/_extension/_path/_size | file.{id,name,extension,path,size} | 25 PDF's |
| storage_path | (BS1) | Supabase Storage `beleid-documenten/<id>/<naam>` |
| archived | (BS1-only) | default false |
| data jsonb | `{bs2_id, bs2_scrape, bs2_scrape_at}` | 100% raw behoud |

Storage: nieuwe **privé** bucket `beleid-documenten` (los van
`beleidsdocumenten`). Bekijken via `createSignedUrl` (10 min).

## 3. Geverifieerde feiten

- BS2 `meta.total = 25` → BS1 `beleid_documenten` = **25**.
- 25 PDF's, 0 mislukt (Node read-only fetch). Alle `type`/contract-velden
  null (policy-documenten).

## 4. UI — `beleid-documenten.html` (1-op-1 BS2-Documenten)

- Titel **"Documenten"** + **Kolommen**-chooser ("Kolommen weergeven":
  Naam/Uploaddatum/Laatst gewijzigd) + **"+ Document uploaden"**.
- Toolbar: **"Zoeken..."** + **Reset**.
- Kolommen: **Naam · Uploaddatum · Laatst gewijzigd · Acties** (sorteerbaar).
- Datumformaat `dd-mm-jjjj uu:mm` (Europe/Amsterdam), zoals BS2
  ("26-03-2026 19:03").
- Footer **"{n} of {total} total."** / **"Rows per page"** / **"Page N of
  M"** (15/pagina = BS2 `per_page`), pager `‹‹ ‹ › ››`.
- Hele rij klikbaar → document openen (signed URL, nieuw tabblad). Acties:
  oog = bekijken, prullenbak = archiveren; gearchiveerd = Herstel + purge
  (slider-modals, huisstijl).

## 5. Connecties / scheiding

Geen FK naar/uit andere modules. `beleid_documenten` + bucket
`beleid-documenten` staan volledig los van `beleidsdocumenten`/`beleid.html`.
Nav: losse top-link "Beleid" in 63 HTML's + `top-nav-overflow.js`
(`Beleid: "beleid-documenten.html"`) → nieuwe pagina; `beleid.html`
onaangeroerd.

## 6. Implementatie (PR's)

- #257/#258 net-observer · #259 scraper · #260/#261 Node read-only fetch ·
  #262 importer · (#volgend) UI + nav-repoint + dit spec-doc.
- Read-only op productie (alleen GET; S3 zonder auth-header; Node = geen
  CORS). `.gitignore`: echte beleids-PDF's + sessie-token nooit naar GitHub.

## 7. Verificatie

1. `write-beleid-documenten.mjs` → Supabase `beleid_documenten` = 25 ·
   bucket `beleid-documenten` 25 PDF's · `beleidsdocumenten` = 25
   (onveranderd) · `data.bs2_scrape` 100%.
2. Chrome MCP BS1: top-bar "Beleid" → `beleid-documenten.html`; 25 docs;
   kolommen/zoek/Kolommen/paginatie/footer 1-op-1; rij/oog → PDF opent;
   bestaande `beleid.html` onveranderd.
3. 2 clean runs zonder fix; 0 BS1-console-errors.
