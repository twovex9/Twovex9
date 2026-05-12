# Item 40 — GDPR Art. 9 compliance voor verzuim (medische data)

**Datum**: 2026-05-12
**Status**: ✅ Compliance-rapport voltooid + v2 actiepunten
**Gerelateerd**: items 5.3 uit `../06-professional-finish.md`, item 39 (RLS audit), Phase 3 (verzuim-port)

## Disclaimer

Dit is **geen juridisch advies**. Ik ben geen jurist; deze documentatie is een technisch-georiënteerde gap-analyse op basis van publiek bekende GDPR-bepalingen. ETF moet voor compliance-zekerheid een Functionaris Gegevensbescherming (FG) of GDPR-jurist consulteren voordat BS1 voor verzuim-administratie in productie gebruikt wordt.

## 1. Wettelijk kader

### GDPR Art. 9 lid 1

> "Verwerking van persoonsgegevens waaruit ras of etnische afkomst, politieke opvattingen, religieuze of levensbeschouwelijke overtuigingen, of het lidmaatschap van een vakbond blijken, **en verwerking van genetische gegevens, biometrische gegevens met het oog op de unieke identificatie van een persoon, of gegevens over gezondheid**, of gegevens met betrekking tot iemands seksueel gedrag of seksuele gerichtheid is verboden."

### Uitzonderingen relevant voor werkgever

Art. 9 lid 2 staat verwerking toe wanneer:
- **(b)** noodzakelijk voor het uitvoeren van **arbeidsrechtelijke verplichtingen** door werkgever (verzuimregistratie valt hieronder bij wettelijke verplichting tot loon doorbetalen + Wet verbetering poortwachter)
- **(h)** noodzakelijk voor preventieve geneeskunde, beoordeling arbeidsgeschiktheid
- **(i)** zwaarwegend algemeen belang

ETF heeft een **wettelijke grondslag voor verzuimregistratie**. Het mág, mits de aanvullende eisen worden gevolgd.

### Aanvullende eisen Art. 9 lid 3 (en Uitvoeringswet AVG art. 30)

- Strenge **vertrouwelijkheid** — alleen toegang door personen die wettelijk gebonden zijn aan geheimhouding (HR/bedrijfsarts)
- **Minimale dataset** — alleen wat noodzakelijk is voor het arbeidsrechtelijke doel
- **Geen medische diagnose** in werkgevers-systeem — alleen "ziek/hersteld/percentage arbeidsongeschikt"
- **Bewaartermijn** — niet langer dan noodzakelijk; standaard 2 jaar na uitdiensttreding

### Nederlandse aanvullende regels (Autoriteit Persoonsgegevens)

- **Werkgever mag NIET** vragen naar de aard van de ziekte
- Werkgever mag wél vragen:
  - Datum eerste ziekteverzuim
  - Geschatte duur
  - Of er telefonisch contact mogelijk is
  - Of er beperkingen zijn voor werkzaamheden (zonder oorzaak)
- Alleen de bedrijfsarts (UWV-arts) mag medische diagnose vastleggen — in een **apart medisch dossier**, niet toegankelijk voor werkgever.

## 2. Wat slaat BS1 op?

### Tabel `public.verzuim`

```sql
verzuim (
  id text PK,
  medewerker_naam text,    -- PII
  type text,               -- 'actief' | 'hersteld' (status, geen diagnose) ✓
  startdatum date,
  einddatum date,
  data jsonb,              -- ⚠️ kan vrije tekst bevatten — gevaar voor medische info
  archived bool,
  aanmaakdatum timestamptz,
  laatst_gewijzigd timestamptz
)
```

### Tabel `public.medewerker_verzuim_perioden`

```sql
medewerker_verzuim_perioden (
  id uuid PK,
  medewerker_id uuid FK → medewerkers,
  type text,               -- 'kort' | 'lang'
  startdatum, einddatum date,
  percentage integer,      -- arbeidsongeschiktheid %
  notitie text,            -- ⚠️ vrije tekst — gevaar voor diagnose-info
  aanmaakdatum, laatst_gewijzigd timestamptz
)
```

### Risico-analyse per veld

| Veld | Categorie | Compliant? |
|---|---|---|
| `medewerker_naam` / `medewerker_id` | PII | ✅ ja, doelmatig |
| `startdatum`, `einddatum` | Verzuimperiode | ✅ ja, doelmatig |
| `type` ('actief'/'hersteld') | Status, geen diagnose | ✅ ja |
| `percentage` (arbeidsongeschikt) | Arbeidsgeschiktheid | ✅ ja, doelmatig |
| **`notitie` (vrije tekst)** | **Vrije tekst** | ⚠️ **Risico** — gebruiker kan diagnose intypen |
| **`data` jsonb in `verzuim`** | **Vrije structuur** | ⚠️ **Risico** — onbekend wat erin staat |

## 3. Bestaande safeguards (BS1 nu)

✅ **Geheel achter auth-gate** — alleen ingelogde ETF-medewerkers
✅ **TLS overal** — Supabase + Vercel doen HTTPS-only
✅ **Audit-log** — élke wijziging op `verzuim` wordt gelogd in `audit_log` triggers (wie/wanneer/wat)
✅ **Storage in EU** — Supabase project in `aws-0-eu-central-1` (Frankfurt)
✅ **Backup retention 7 dagen** (Free tier) → 14-30 dagen (Pro)

## 4. Gaps (wat ontbreekt voor volledige compliance)

### 🔴 Kritiek

**Gat 1: Geen role-based access op verzuim-tabel.**
Huidige RLS: `using true` voor `authenticated`. Élke medewerker kan andermans verzuim lezen.
- **Vereist**: alleen HR-rol + bedrijfsarts + admin + eigen verzuim.
- **Migratie**: zie item 39 sectie 5.2 voor concrete SQL.

**Gat 2: Geen lock op vrije-tekst velden.**
`notitie` en `data.*` kunnen door een onhandige user diagnose-info bevatten (bv. "ziek door griep").
- **Vereist**:
  - UI-waarschuwing bij invoer: "Geen medische diagnose vastleggen"
  - Optioneel: server-side validation op verboden trefwoorden (griep, depressie, etc.)
  - Bij audit: trefwoorden flaggen voor manuele review

**Gat 3: Geen retention-policy.**
Records blijven oneindig. Wettelijk: 2 jaar na uitdiensttreding.
- **Vereist**: scheduled job die records ouder dan 2j na medewerker-archive verwijdert (of pseudonimiseert).

**Gat 4: Geen data-subject-access flow.**
Medewerker heeft recht op inzage (Art. 15) + correctie (Art. 16) + vergeten (Art. 17) van eigen gegevens. BS1 heeft hiervoor geen formele flow.
- **Vereist**:
  - "Mijn gegevens"-pagina waar medewerker eigen verzuim kan inzien (read-only)
  - Procedure voor verzoek tot correctie (formulier → HR)
  - Procedure voor vergeten-recht (na uitdienst + retention)

### 🟡 Aanbevolen

**Gat 5: Geen breach notification flow.**
Als BS1 gehackt wordt: 72u meldplicht aan AP + getroffen personen (Art. 33-34).
- **Vereist**: incident-response procedure (wie wordt geïnformeerd, hoe).

**Gat 6: Geen DPIA (Data Protection Impact Assessment).**
Voor large-scale verwerking van Art. 9 data is DPIA aanbevolen.
- **Vereist**: DPIA-document opstellen (template via AP-website).

**Gat 7: Geen verwerkersovereenkomst met Supabase.**
Supabase is data processor; ETF is controller. AP vereist verwerkersovereenkomst.
- **Vereist**: Supabase DPA tekenen via https://supabase.com/dpa (gratis via dashboard).

### 🟢 Already covered

- ✅ Doelbinding (Art. 5 lid 1b) — verzuim alleen voor arbeidsrechtelijke verplichtingen
- ✅ Beveiliging tijdens transport (TLS)
- ✅ EU-storage (Frankfurt)
- ✅ Audit-log integriteit

## 5. Aanbevolen v2 actieplan

### v2 sprint 1 — Toegangscontrole (4u)

1. Rol `bedrijfsarts` toevoegen aan `profiles.rol` enum
2. RLS-policies op `verzuim` + `medewerker_verzuim_perioden`:
   - SELECT: `is_admin() OR is_hr() OR is_bedrijfsarts() OR medewerker_id = auth.uid()`
   - INSERT/UPDATE: `is_hr() OR is_bedrijfsarts()`
   - DELETE: `is_admin()`
3. Apart UI-pad: `/mijn-verzuim` voor medewerker (read-only eigen)
4. `/verzuim` blijft beperkt tot HR + bedrijfsarts via menu-gating

### v2 sprint 2 — Vrije tekst safeguards (2u)

1. Notitie-velden krijgen warning label:
   > "⚠️ Geen medische diagnose vastleggen. Alleen feitelijke informatie."
2. Server-side: list van verboden trefwoorden (griep, depressie, covid, etc.)
3. Bij detectie: nudge user — "Dit lijkt op medische info — wil je dit echt opslaan?"
4. Audit-log markeert records met flag voor maandelijkse HR-review

### v2 sprint 3 — Retention + data-subject rights (4u)

1. Scheduled function (Supabase pg_cron) die maandelijks runt:
   - Selecteer medewerkers met `archived = true` AND `archived_at < now() - interval '2 years'`
   - Voor elk: `DELETE FROM verzuim WHERE medewerker_id = ...` (cascade)
   - Log de cleanup in audit_log
2. `/mijn-gegevens`-pagina:
   - Toon eigen profiel + verzuim + verlof + uren
   - "Vraag correctie aan"-formulier (mailt HR)
   - "Vraag verwijdering aan"-formulier (mailt admin)
3. Admin-pagina: openstaande verzoeken-overzicht + workflow

### v2 sprint 4 — Documentatie + DPIA (4u)

1. DPIA-document opstellen via AP-template (~AP.nl/dpia)
2. Verwerkingsregister: per categorie data wat wordt opgeslagen, doel, bewaartermijn
3. Privacy-statement op login-pagina + `/over` pagina
4. Incident-response procedure schriftelijk vastleggen

### v2 sprint 5 — Externe procedures (1u admin-actie)

1. Supabase DPA tekenen via dashboard
2. Vercel DPA tekenen via dashboard
3. Aanwijzen FG of contact-persoon GDPR binnen ETF

## 6. Effort schatting

| Sprint | Effort | Kritiek? |
|---|---|---|
| 1 — Toegangscontrole | 4u | 🔴 Ja (combineren met item 39 v2 hardening) |
| 2 — Vrije tekst safeguards | 2u | 🟡 Aanbevolen |
| 3 — Retention + DSR | 4u | 🔴 Ja (wettelijk verplicht) |
| 4 — DPIA + register | 4u | 🟡 Aanbevolen vóór externe audit |
| 5 — DPA + FG | 1u | 🔴 Ja (1 admin-actie) |
| **Total** | **~15u dedicated** | |

## 7. Conclusie

**v1 status**: bruikbaar voor **interne ETF tool**, **met expliciete user-instructie** "geen medische diagnoses vastleggen". Mitigaties:
- Auth-gate + audit-log + EU-storage
- Beperkt aantal users (alle ETF-medewerkers met geheimhouding)

**Niet acceptabel voor**:
- Externe partijen toegang geven (zonder v2 sprint 1)
- Wettelijke audit door AP (zonder v2 sprint 4)
- Productie zonder Supabase DPA (sprint 5 — quick fix)

**Aanbevolen direct doen** (30 min user-actie):
1. Teken Supabase DPA in dashboard
2. Teken Vercel DPA in dashboard
3. Voeg warning toe aan notitie-velden in verzuim-UI: "Geen medische diagnose vastleggen"

**Voor v2 plannen**: bundle sprint 1 + 3 + 5 (~9u) als minimum-viable-compliance.

## Acties uit deze audit

- Geen runtime-acties uit deze PR (alleen rapport).
- Item 40 toegevoegd aan open-items index met "v2 compliance sprint" trigger.
- Bij volgende sessie: indien user wenst, start sprint 1 (RLS hardening verzuim) als onderdeel van algemene v2 security-sprint.
