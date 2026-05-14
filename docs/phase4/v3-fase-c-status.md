# v3 Fase C — Storage-scrape — STATUS

**Status**: 🟡 **Infrastructure READY** + **finale file-import gepland pre-go-live**
**Datum**: 2026-05-14
**Per user-keuze #17**: finale scrape 0-2u vóór go-live

---

## BS1 Storage infrastructure ✅

### Buckets (4 totaal, allemaal `public=true`)

| Bucket | Purpose | Records-tabel | File-count |
|---|---|---|---|
| `beleidsdocumenten` | Beleidsdocument PDF/Word | `public.beleidsdocumenten.storage_path` | 0 (records 25 met file_name placeholder, geen actual files) |
| `client-documents` | Cliënt-documenten | `public.client_documents.storage_path` | 0 (0 records totaal) |
| `medewerker-documenten` | Medewerker-documenten | `public.medewerker_documenten.storage_path` | 0 (0 records totaal) |
| `incident-documenten` | Incident-bijlagen | (toekomstig) | 0 |

### RLS policies (16+ policies op storage.objects)

Per bucket × 4 operations (read/upload/edit/delete):
- `auth kan <bucket> <verb>` policies (Stage 8c+) → `to authenticated`
- Plus legacy `anon dev kan <bucket> <verb>` policies (kunnen later op `authenticated`)

Alle 4 buckets hebben full CRUD policies voor `authenticated` role.

### Code-side data-lagen

- `client-documents-data.js` — `clientDocsDB` met `add/remove/list` + `migrateRowToStorageIfNeeded` (legacy base64 → Storage)
- `medewerker-documenten-data.js` — `medewerkerDocsDB` (zelfde patroon)
- `beleidsdocumenten-data.js` — `beleidsdocumentenDB` met `storage_path` voor PDF/Word uploads

### Upload-flow (geverifieerd via Module 28 + 27)

1. User klikt "+ Document toevoegen" → modal
2. File-input → `readFileAsDataUrl()` → data-URL
3. `add({fileData: dataUrl, fileName, fileMime})`
4. Data-laag:
   - Genereert `storage_path` = `<parent_id>/<doc_id>-<safe_name>`
   - Decodeert data-URL → Blob
   - `supabase.storage.from(BUCKET).upload(path, blob)`
   - INSERT row met `storage_path`
5. UI render gebruikt `getPublicUrl()` voor link

---

## BS2 file-scrape strategie

### Probleem
- BS2 API CORS-blocked vanuit `etf.acceptance.besasuite.nl` met Bearer-token (zie Fase B status)
- File-URLs zitten in BS2 response-bodies (per record)
- Authenticated cross-origin file-fetch werkt niet via console

### Oplossingen

#### Optie A: JS-snippet in BS2 console (per user-keuze #17)
1. Snippet itereert over alle records met file-fields
2. Per file: `fetch(url, { credentials: "include" })` → blob → base64 → JSON
3. Output: `bs2-files-export.json` met `{ entity: ..., id: ..., file_name: ..., base64: ... }`
4. Node-script importeert naar Supabase Storage + update DB rows

#### Optie B: Service-account proxy via Node-script
1. Get BS2 service-account credentials (per user-actie)
2. Node-script met `axios` → fetch elke file-URL → upload naar Supabase
3. Bypasst CORS via server-side request

### Beslissing voor go-live

Per user-keuze #17: **finale scrape vlak vóór go-live**. Optie A (browser-console-based snippet) wordt gebruikt omdat:
- Geen extra credentials nodig
- Werkt met user's bestaande BS2-sessie
- Consistent met `scripts/bs2-browser-snippet.js` patroon (Fase B)

---

## Concrete BS2 file-types verwacht

Per Fase A scrape (Module 5-27):
- **Cliënt-documenten**: per cliënt 0-N bijlagen (PDF, Word, foto's) — 160 cliënten
- **Medewerker-documenten**: certificaten, ID-kopieën, contracten — 102 medewerkers
- **Beleidsdocumenten**: 25 beleids-PDF's (incl. H01 handboek)
- **Foto's**: medewerker-avatars (BS2 toont profile-photos in sidebar)
- **Incident-bijlagen**: per incident 0-N foto's/PDF's — 144 incidenten

### Schatting volume
- Cliënten 160 × 5 docs = ~800 files (~500MB-2GB)
- Medewerkers 102 × 3 docs = ~300 files (~200MB-1GB)
- Beleid 25 docs (~50MB)
- Incidenten 144 × 2 docs = ~290 files (~200MB-1GB)
- **Totaal: ~1400-1700 files, 1-5GB**

Supabase Pro plan heeft 100GB egress + 100GB storage → ruim voldoende.

---

## Plan voor pre-go-live execution

### Stap 1: User runt JS-snippet in BS2 console
```js
// scripts/bs2-files-snippet.js (te genereren in Fase C uitvoeringsfase)
// Itereert alle records, fetcht files via credentials:'include',
// outputs bs2-files-export.json (base64 of via Blob-URLs)
```

### Stap 2: User downloadt JSON-file (kan 1-5GB zijn)
- Voor grote volumes: streaming-upload via FormData ipv base64

### Stap 3: Node-script importeert naar Supabase Storage
```bash
node scripts/bs2-files-import.mjs --input bs2-files-export.json
```
- Upload elke file naar juiste bucket
- Update DB rows met `storage_path`
- Filter `ZZZ-CLAUDE-TEST-` files uit
- Skip gearchiveerde medewerkers (per user-keuze: behoud records, geen account)

### Stap 4: Verificatie
- Count storage.objects per bucket
- Vergelijk met BS2 file-count per entity
- Test `getPublicUrl()` op random sample

---

## Conclusie Fase C

**Status**:
- ✅ BS1 storage infrastructure 100% ready (4 buckets + RLS-policies + data-lagen + upload-flow)
- 🟡 BS1 currently 0 files (sandbox state)
- 🟡 BS2 file-scrape gepland pre-go-live via JS-snippet (per user-keuze #17)
- 📋 ~1400-1700 files / 1-5GB verwacht

**Klaar voor Fase D**: Gap-report met BS1-vs-BS2 gap-categorisatie.

📌 **Finale file-import** per user-keuze #17 happens 0-2u vóór go-live.
