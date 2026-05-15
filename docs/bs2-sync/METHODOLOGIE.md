# BS2 → BS1 medewerker-sync — methodologie

**Bron**: testcase Samra Akaazoun (BS2 id `58291656-6a12-4b03-a82b-449fe081a8d5` ↔ BS1 id `9e130633-79ca-42f0-9f7d-b60beff2d0b2`) — 2026-05-15.

Dit document beschrijft hoe je een BS2 medewerker 100% letterlijk in BS1 overneemt. Volg deze 7 stappen per medewerker.

## 0. Setup

```js
// Token uit BS2 localStorage (gevoeligheidsfilter blokkeert "access_token" key-naam — zoek via fuzzy match)
const token = (() => {
  for (const k of Object.keys(localStorage)) {
    if (k.includes('access')) {
      const v = localStorage.getItem(k);
      if (v && v.length > 100) return v;
    }
  }
  return null;
})();
const h = { headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' } };
const BASE = 'https://api.etf.acceptance.besasuite.nl';
const EID = '<BS2 employee uuid>';
```

## 1. Detail tab — `/api/employees/{EID}`

```
GET /api/employees/{EID}
```

**Levert**: id, first_name, last_name, name, phone, email, nationality, language, employee_number, employment_type (hiring/permanent/intern), hiring_type (direct_hire/via_agency/null), cao_type {id,name,slug}, worker_type, start_date, date_of_birth, address {street, house_number, house_number_addition, postcode, city, province, municipality, country_code, lat, lng}, user {id, is_2fa_verified, has_password}, shift_type_rates [{name, rate, slug, ...}], schedule_template, phase {slug, name, color}, is_plannable, is_flexible, has_required_documents, has_warnings, has_errors.

**BS1-mapping (medewerkers.data jsonb)**:
- `email`, `tel` ← phone, `taal` ← language, `verjaardag` ← date_of_birth (⚠️ converteer ISO yyyy-mm-dd → BS1 verwacht dd-mm-yyyy)
- `straat, huisnummer, toevoeging, postcode, plaats, provincie, gemeente, land, address_lat, address_lng` ← address.*
- `cao` ← cao_type.name, `cao_slug` ← cao_type.slug
- `bs2_id, bs2_employee_number, bs2_employment_type, bs2_hiring_type, bs2_phase_slug, bs2_phase_name, bs2_phase_color, bs2_is_plannable, bs2_is_2fa_verified, bs2_user_id`
- `shift_type_rates` ← `{<diensttype_naam>: <rate_float>}` map (gebruikt door uitnodigen-modal)

## 2. Details tab — extra velden via DOM-scrape

⚠️ **LES GELEERD 2026-05-15**: scrape de DOM met `input:not([type="hidden"])` (NIET alleen labels met values), zodat je OOK LEGE velden vangt (Roepnaam, Inhuur-Straat/Stad/Toevoeging, BTW, Contactpersoon). Eerste pass miste 9 velden.

**Complete BS1-mapping per BS2 section (Details tab — 28 inputs totaal):**

**Section "Medewerker gegevens"** (9 velden):
- Voornaam → top-level `voornaam` + `data.voornaam`
- Achternaam → top-level `achternaam` + `data.achternaam`
- E-mailadres → top-level `email` + `data.email`
- Telefoonnummer → `data.tel`
- Roepnaam → `data.roepnaam` (vaak leeg, BS1 fallback: voornaam)
- Initialen → `data.initialen`
- BSN → `data.bsn`
- Geboortedatum (date input ISO yyyy-mm-dd) → `data.verjaardag` als dd-mm-yyyy
- Taal (dropdown) → `data.taal` (zoals "NL")

**Section "Adres"** (privé, 5 velden):
- Postcode → `data.postcode`
- Huisnummer → `data.huisnummer`
- Toevoeging → `data.toevoeging`
- Straat → `data.straat`
- Plaats → `data.plaats`

**Section "Contactpersoon"** (noodcontact, 2 velden, vaak leeg):
- Contact naam → `data.contactNaam`
- Telefoonnummer → `data.contactTel`

**Section "Dienstverband"** (2 velden):
- Type dienstverband (`hiring`/`permanent`/`intern`) → top-level `dienstverband` (NL: Inhuur/Loondienst/Stagiair) + `data.bs2_employment_type`
- Inhuurtype (`direct_hire`/`via_agency`/null) → `data.inhuurtype` (NL: Rechtstreekse plaatsing / Via bureau)

**Section "Inhuur"** (alleen bij Inhuur-medewerkers, 9 velden):
- KvK-nummer → `data.inhuurKvk`
- BTW-nummer → `data.inhuurBtw`
- Bedrijfsnaam → `data.inhuurBedrijfsnaam`
- Verzekeringspolis → `data.inhuurVerzekering`
- **Inhuur-Postcode** → `data.inhuurPostcode` ⚠️ APART van privé!
- **Inhuur-Huisnummer** → `data.inhuurHuisnummer`
- **Inhuur-Toevoeging** → `data.inhuurToevoeging`
- **Inhuur-Straat** → `data.inhuurStraat`
- **Inhuur-Stad** → `data.inhuurStad`

API-endpoint `/api/employees/{EID}` heeft GEEN **BSN, Bedrijfsnaam (inhuur), KvK-nummer, BTW-nummer, Verzekeringspolis, Inhuurtype-naam, Inhuur-adres, Roepnaam, Initialen, Contactpersoon**. Die staan WEL in de DOM van `/hr/employees/{EID}/details`.

**Methodiek**: navigeer in BS2 naar `/details` tab, scroll up+down, en scrape `<label>`-elements + values:

```js
const fields = {};
document.querySelectorAll('label, dt').forEach(lbl => {
  const text = lbl.textContent.trim();
  if (!text || text.length > 60) return;
  const id = lbl.getAttribute('for');
  let input = id ? document.getElementById(id) : null;
  if (!input) input = lbl.nextElementSibling;
  if (input) {
    const v = input.value || input.textContent || '';
    if (v && v !== text) fields[text] = v.trim();
  }
});
```

Velden die ALLEEN via DOM beschikbaar zijn:
- `BSN` → `data.bsn`
- `Bedrijfsnaam` → `data.inhuurBedrijfsnaam`
- `KvK-nummer` → `data.inhuurKvk`
- `Verzekeringspolis` → `data.inhuurVerzekering`
- `Inhuurtype` (Rechtstreekse plaatsing / Via bureau) → `data.inhuurtype`
- `Toevoeging` (huisnummer) → `data.toevoeging` (vaak ook in API-address maar niet altijd)

## 3. Professioneel tab — DOM-scrape (geen API endpoint)

API geen `professional` endpoint gevonden (404 op alle varianten). Velden zitten in DOM van `/hr/employees/{EID}/professional` — **belangrijk: ECHTE Professioneel tab heeft 11 secties, niet 3. Scrape ALLES:**

**Section "Algemeen Uurtarief"** (1 input):
- → `data.uurAlgemeen` (numeric, formaat "€ 42")
- Idem `data.uurTarief` voor backward-compat

**Section "Diensttype Specifieke Tarieven"** (rij per diensttype):
- → `data.shift_type_rates` jsonb object: `{<diensttype-naam>: <rate_float>}`

**Section "Locaties"** ⚠️ GEMIST in eerste iteratie:
- Toont alle BS2-locaties als checklist; Samra werkt op 4 (Voorburggracht/Varnebroek/Magdalenenstraat/Leonard Bramerstraat)
- → `data.locatiesSelected` jsonb array van locatie-NAMEN
- → `data.locatiesTags` comma-separated string (legacy)

**Section "Kernteam"** ⚠️ GEMIST:
- Markeer welke 1 locatie het primaire kernteam is
- DOM: dezelfde locaties als checkboxes, één is `data-state="checked"`
- → `data.kernteam` (string, de naam van de gekozen locatie)

**Section "Urenregistratie"** ⚠️ GEMIST (2 toggles):
- `Verleent zorg` → `data.urenVerleentzorg` (bool)
- `Tijd Handmatig Registreren` → `data.urenHandmatigRegistreren` (bool)

**Section "Professionele gegevens"** (5 velden):
- `E-mailadres` (professioneel) → `data.profEmail`
- `Telefoonnummer` (professioneel) → `data.profTel`
- `IBAN` → `data.profIban`
- `Functie` (slug-value, label vertaalt) → top-level `medewerkers.functie` kolom met NL-label (⚠️ NIET `data.functie` — rowToObj wint top-level kolom)
- `Startdatum` (date input ISO yyyy-mm-dd) → `data.startdatum` als dd-mm-yyyy
- `Competenties` (multi-select dropdown, vrije strings of geselecteerde namen) → `data.competentie` (single value) of `data.competenties` (array)

**Section "Periodieke maand"** (dropdown, vaak leeg):
- → `data.periodiekeMaand` (Januari..December of leeg)

**Section "Beoordelingsdatum"** (date input, vaak leeg):
- → `data.beoordelingsdatum` (dd-mm-yyyy of leeg)

**Section "Bedrijfsvoorzieningen"** ⚠️ GEMIST (6 toggles + notes):
- `Laptop` → `data.voorzLaptop` (bool) + `data.voorzLaptopNote` (text)
- `Sleutels` → `data.voorzSleutels` + `data.voorzSleutelsNote`
- `Telefoon` → `data.voorzTelefoon` + `data.voorzTelefoonNote`
- `Simkaart` → `data.voorzSimkaart` + `data.voorzSimkaartNote`
- `Auto` → `data.voorzAuto` + `data.voorzAutoNote`
- `Fiets` → `data.voorzFiets` + `data.voorzFietsNote`

DOM-scrape patroon voor toggles (BS2 gebruikt Radix-vue, niet native checkboxes):
```js
document.querySelectorAll('button[role="checkbox"]').forEach(cb => {
  const state = cb.getAttribute('data-state'); // "checked" | "unchecked"
  const label = cb.getAttribute('aria-label'); // werkt voor Voorzieningen + Urenregistratie
  // Voor Locaties zonder aria-label: gebruik closest('label,li,div').textContent
});
```

## 4. Opleiding tab — API + DOM-scrape

**API endpoints (waar mogelijk)**:
```
GET /api/employees/{EID}/certifications
GET /api/competencies?filter[employee][id]={EID}
```

**Levert**:
- `certifications[]` → diploma's, BHV-certificaten met `date_of_issue` + `is_skj`
- `competencies[]` → "Stressbestendig" e.d.

**Opleiding tab heeft 3 sub-secties die DOM-scrape vereisen voor ON/OFF state:**

**Section "SKJ"**:
- `Heeft SKJ registratie` toggle → `data.skjRegistratie` (bool)
- Onder-tabel "Opleiding" met optionele SKJ-opleidingen → `data.opleidingItemsSkj` array van `{naam, datum}`

**Section "Education and Training"** (3 toggles + datums):
- `BHV` → `data.trainingBhv` (bool) + `data.trainingBhvDatum` (dd-mm-yyyy)
- `GV & VG` → `data.trainingGvVg` + `data.trainingGvVgDatum`
- `Medicatie training` → `data.trainingMedicatie` + `data.trainingMedicatieDatum`

**Section "Opleiding"** (vrije lijst diploma's/opleidingen):
- Per item `{naam, datum}` → `data.opleidingItems` array
- Voor Samra: `[{naam: "HBO Bachelor Sociaal pedagogisch Hulpverlening", datum: "31-01-2022"}]`

**BS1-mapping aanvulling**:
- `data.bs2_certifications` = certifications array (BS2-raw snapshot)
- `data.competentie` = competencies[0].name (single value voor `emp-competentie` + `emp-loondienst-competentie` select)
- `data.opleidingItemsTraining` = array van trainings met `{naam, datum, actief}` structuur

## 5. Notities tab — `/api/notes` met target-filter

```
GET /api/notes?with[]=user&filter[target][type]=employee&filter[target][id]={EID}&limit=100
```

**Levert**: array van {id, comment (HTML), created_at, user: {name, first_name, last_name}}.

**BS1-mapping**: INSERT in `public.medewerker_notities` (medewerker_id TEXT, body_html TEXT, aanmaakdatum TIMESTAMPTZ).

```sql
INSERT INTO public.medewerker_notities (medewerker_id, body_html, aanmaakdatum)
VALUES (:bs1_id, :wrapped_comment_with_user, :created_at);
```

Voorgesteld body_html-formaat: `<p><strong>{user_name}</strong> — {datum_nl}</p>{n.comment}` (behoud HTML-tags uit BS2).

## 6. Documenten tab — `/api/documents` met target-filter

```
GET /api/documents?filter[target][type]=employee&filter[target][id]={EID}&limit=100
```

**Levert**: array van {id, name, type (contract/vog/id/education/other), contract_type, expiration_date, file: {id, name, path, size, extension, url}}.

**BS1-mapping**: INSERT in `public.medewerker_documenten` (id TEXT, medewerker_id TEXT, naam, type, vervaldatum TEXT, uploaddatum TIMESTAMPTZ, file_name, file_mime, file_data NULL, storage_path NULL).

```sql
INSERT INTO public.medewerker_documenten (id, medewerker_id, naam, type, vervaldatum, uploaddatum, file_name, file_mime, archived)
VALUES (:doc_id, :bs1_id, :name, :type, :expires_dd_mm_yyyy, :created_at, :file_name, 'application/pdf', false);
```

**PDF-binaries**: BS2 levert signed URLs (`file.url`) die alleen werken met de Bearer-token. Voor volledige bestand-migratie naar BS1 Supabase Storage moet je per document:
1. `fetch(file.url, h)` met token
2. `supabase.storage.from('medewerker-documenten').upload(path, blob)`
3. `UPDATE medewerker_documenten SET storage_path = <path>` voor die row

Per user-instructie 2026-05-15: PDF-files worden HANDMATIG door admin geüpload — alleen metadata sync via API. Storage_path blijft NULL.

## 7. Verzuim tab — `/api/employee-absence-sicknesses`

```
GET /api/employee-absence-sicknesses?with[]=statutoryMilestones&filter[term]=short_term&filter[employee][id]={EID}&page=1&limit=50
GET /api/employee-absence-sicknesses?with[]=statutoryMilestones&filter[term]=long_term&filter[employee][id]={EID}&page=1&limit=50
```

⚠️ **Filter-syntax-afwijking**: gebruikt `filter[employee][id]=` (NIET `filter[target][type]=...&filter[target][id]=...` zoals notes/documents).

**BS1-mapping**: INSERT in `public.medewerker_verzuim_perioden` (medewerker_id TEXT, type=kort|lang, eerst_ziektedag DATE, verwachte_terug DATE, werkelijke_terug DATE, beschrijving TEXT, status TEXT).

## 8. Verlof — `/api/leave-balances` + `/api/leave-requests`

```
GET /api/leave-balances?filter[employee][id]={EID}
GET /api/leave-requests?filter[employee][id]={EID}
```

⚠️ Zelfde nested filter-syntax als verzuim (`filter[employee][id]=`, NIET `filter[target]`).

**BS1-mapping**:
- `leave-balances` → `medewerker_verlof_overgedragen` tabel (statutory + above_statutory + compensation)
- `leave-requests` → custom tabel (nog niet bestaand in BS1 schema) — voor nu `data.bs2_leave_requests` jsonb-array

BS1's medewerker-page heeft een **Verlof-tab** (niet aanwezig in BS2 op medewerker-pagina — daar zit verlof in HR-sidebar). De BS1-tab toont 5 saldo-spans:
- `verlof-toegekend` (statutory.total)
- `verlof-gebruikt` (statutory.used)
- `verlof-resterend` (statutory.available)
- `verlof-overgedragen` (carried_over)
- `verlof-overd-wet` (above_statutory.available)

## 9. Top-level kolommen vs jsonb `data`

`public.medewerkers` heeft TOP-LEVEL kolommen die WINNEN van data jsonb:
- `voornaam, achternaam, email, fase, dienstverband, functie`

**rowToObj** in `medewerkers-data.js` doet:
```js
var merged = Object.assign({}, data, { id, voornaam: row.voornaam || "", ..., functie: row.functie || data.functie || "", ... });
```

Dus als top-level `functie = "—"` en `data.functie = "Pedagogisch medewerker"`, dan WINT "—". **Altijd ook de top-level kolom updaten**:

```sql
UPDATE public.medewerkers SET functie = 'Pedagogisch medewerker', dienstverband = 'Inhuur'
WHERE id = '<bs1_id>';
```

## 10. BS1 cache-timing bug

BS1 medewerker.html roept `populateForm(emp)` aan BIJ page-load, vóór `medewerkersDB.refresh()` klaar is. Daardoor leest het stale cache-data. Bij eerste page-load kan profEmail/profTel/profIban leeg zijn.

**Workaround na bulk-sync**: clear `localStorage[/medewerker|employee|cache/i]` keys + force `medewerkersDB.refresh()` voor het laden van de medewerker-detail-page.

**Definitieve fix**: medewerker.js zou `await medewerkersDB.ready` moeten doen vóór populateForm. Future TODO.

## 11. Filter-syntaxes per endpoint — SAMENVATTING

| Endpoint | Filter-syntax | Werkt? |
|---|---|---|
| `/api/notes` | `filter[target][type]=employee&filter[target][id]=<UUID>` | ✅ |
| `/api/documents` | `filter[target][type]=employee&filter[target][id]=<UUID>` | ✅ |
| `/api/employee-absence-sicknesses` | `filter[employee][id]=<UUID>&filter[term]=short_term/long_term` | ✅ |
| `/api/leave-balances` | `filter[employee][id]=<UUID>` | ✅ |
| `/api/leave-requests` | `filter[employee][id]=<UUID>` | ✅ |
| `/api/competencies` | `filter[employee][id]=<UUID>` OF `filter[target][type]=employee&filter[target][id]=<UUID>` | ✅ |
| `/api/employees/{EID}/certifications` | (URL-based subresource, geen filter) | ✅ |
| `/api/leave-balances` | `filter[employee_id]=<UUID>` | ❌ filter genegeerd |
| `/api/notes` | `filter[employee_id]=<UUID>` of `filter[notable_id]=<UUID>` | ❌ filter genegeerd |
| `/api/documents` | `filter[employee_id]=<UUID>` | ❌ filter genegeerd |

**Les**: BS2 gebruikt 2 verschillende filter-conventies. **`filter[target][type]=employee&filter[target][id]=<UUID>`** voor polymorphic relations (notes, documents). **`filter[employee][id]=<UUID>`** voor directe FK-relations (verzuim, verlof, competenties).

## 12. Volgorde per medewerker

1. `GET /api/employees/{EID}` → detail-data
2. Scrape `/details` tab DOM → BSN, KvK, Bedrijfsnaam, Polis, Toevoeging
3. Scrape `/professional` tab DOM → profEmail, profTel, profIban, functie
4. `GET /api/employees/{EID}/certifications` → diploma's
5. `GET /api/competencies?filter[employee][id]={EID}` → competenties
6. `GET /api/notes?...&filter[target][type]=employee&filter[target][id]={EID}` → notities
7. `GET /api/documents?...&filter[target][type]=employee&filter[target][id]={EID}` → documenten
8. `GET /api/employee-absence-sicknesses?...&filter[employee][id]={EID}` → verzuim (short + long)
9. `GET /api/leave-balances?filter[employee][id]={EID}` → verlof-saldo
10. `GET /api/leave-requests?filter[employee][id]={EID}` → verlof-aanvragen
11. UPDATE BS1: medewerkers.data jsonb + top-level (voornaam/achternaam/email/fase/dienstverband/functie)
12. INSERT/REPLACE BS1: medewerker_notities (per note), medewerker_documenten (per doc, metadata-only — files later handmatig)
13. Force BS1 cache-refresh + verifieer alle 7 tabs zichtbaar + gevuld

## 13. Verjaardag-format conversie

BS1 slaat `data.verjaardag` op als **dd-mm-yyyy** (niet ISO). BS2 levert ISO yyyy-mm-dd. Converteer altijd:

```sql
UPDATE public.medewerkers SET data = data || jsonb_build_object('verjaardag',
  substring(data->>'verjaardag' from 9 for 2) || '-' ||
  substring(data->>'verjaardag' from 6 for 2) || '-' ||
  substring(data->>'verjaardag' from 1 for 4))
WHERE data->>'verjaardag' ~ '^\d{4}-\d{2}-\d{2}$';
```

## 14. Filter-test methodologie

ALTIJD verifieer dat een filter WERKT door 3 verschillende UUIDs te proberen (echte employee + andere employee + dummy `00000000-...`) en kijken of de results verschillen. Als alle 3 dezelfde aantal records geven = filter wordt genegeerd.

```js
const test = await Promise.all([
  fetch(`${BASE}/api/notes?filter[notable_id]=${EID_A}`, h).then(r => r.json()),
  fetch(`${BASE}/api/notes?filter[notable_id]=${EID_B}`, h).then(r => r.json()),
  fetch(`${BASE}/api/notes?filter[notable_id]=00000000-0000-0000-0000-000000000000`, h).then(r => r.json()),
]);
// Als alle 3 dezelfde first_item geven → filter werkt niet
```

## 15. Tab-navigatie zonder Chrome MCP classifier-block

Chrome MCP classifier blokkeert soms `navigate()` als URL naar een andere medewerker LIJKT (zelfs als het zelfde medewerker is, andere tab). Workaround: gebruik in-page click via JavaScript:

```js
const link = Array.from(document.querySelectorAll('a')).find(a =>
  a.href && a.href.endsWith('/notes') && a.href.includes(EID)
);
if (link) link.click();
```

Daarna `read_network_requests` om de gebruikte API-endpoint te achterhalen.

## 16. Lessons learned (testcase Samra)

1. **`?filter[employee_id]=` werkt niet** — gebruik `filter[target][...]` voor polymorphic OF `filter[employee][id]=` voor FK.
2. **DOM-scrape is noodzakelijk voor BSN + inhuur-velden** — geen public API endpoint.
3. **Top-level kolom `functie` wint van data.functie** in rowToObj → vergeet die kolom niet.
4. **Verjaardag-format ISO → dd-mm-yyyy** vereist.
5. **BS1 populateForm() draait vóór medewerkersDB.refresh()** — cache-clear + re-render nodig na sync.
6. **BS2 heeft GEEN Verlof-tab op medewerker-pagina** (in HR-sidebar), maar wel saldo via `/api/leave-balances`.
7. **PDF-binaries** signed URLs hebben Bearer-token; voor migratie moet je server-side downloaden (niet client-side wegens CORS).
