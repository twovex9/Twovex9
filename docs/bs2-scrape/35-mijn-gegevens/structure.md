# Module 35 — Mijn-gegevens — STRUCTURE

**BS2 URL**: `https://etf.acceptance.besasuite.nl/account` (via user-menu "Mijn profiel")
**BS1 URL**: `https://besa-suite.vercel.app/mijn-gegevens.html`
**Scrape datum**: 2026-05-14

## BS2 page (/account)

- Title: "account | Embrace The Future"
- h1/heading: "Jason Sonck" (current user)
- Avatar: "JS"
- 2 main sections:
  1. **Persoonlijke gegevens** — form (Voornaam / Achternaam / E-mailadres / Telefoonnummer + Save)
  2. **Actieve sessies** — list of devices (Chrome / Mobiele app) + IP + last-active + "Uitloggen op alle andere apparaten"

## BS1 mirror (mijn-gegevens.html)

BS1 heeft een **ander concept** dan BS2:
- BS2 /account = profile-edit + sessions
- BS1 /mijn-gegevens.html = **GDPR Art. 15 inzage-pagina** (AVG-compliant data-portability)

### BS1 structure
- Title: "Mijn gegevens — GDPR"
- h1: "Mijn gegevens"
- Subtitle: "Inzage en download van je eigen data (AVG Art. 15 — recht op inzage)."
- **Minimalist topbar** (Home + Mijn gegevens only, geen andere modules)

### 3 secties

#### Sectie 1: Wat staat er over jou in BESA-suite?
- 12-stat grid: NAAM / E-MAIL / ROL / MEDEWERKER-ID / FUNCTIE / FASE / DIENSTVERBAND / NOTITIES (HR) / DOCUMENTEN / VERZUIM-PERIODEN / PLANNING-SHIFTS / GEËXPORTEERD OP
- 2 buttons:
  - **Download mijn data (JSON)** — complete data-export (AVG Art. 20)
  - **Vernieuwen** — refresh data

#### Sectie 2: Rechten onder de AVG
- 5 rights (li-items):
  - Recht op inzage (Art. 15)
  - Recht op rectificatie (Art. 16)
  - Recht op vergetelheid (Art. 17)
  - Recht op gegevensoverdraagbaarheid (Art. 20)
  - Recht van bezwaar (Art. 21)

#### Sectie 3: Bewaartermijnen (Retention)
- 5 retention-policies (uit `gdpr_retention_run_v1()`):
  - Planning: 24 maanden
  - Audit-logs: 5 jaar
  - Notificatie-geschiedenis: 12 maanden
  - Personeelsdossier: 7 jaar (fiscaal + arbeidsrecht)
  - Verzuim/Medisch: 20 jaar (Arbo)

## Profile-edit gebeurt elders (BS1)

Profile-edit (voornaam/achternaam/email) gebeurt in `instellingen.html` → "Mijn profiel"-tab. **Niet** in mijn-gegevens.html. Dat is opzet in BS1.

## Active sessions (BS2 only, niet in BS1)

BS2 toont actieve devices + IP + last-active + uitloggen-knop. BS1 heeft dit (nog) niet. v3 Fase G zou dit kunnen toevoegen via `supabase.auth.admin.listUserSessions()` of similar.

## Bug gefixt

### Bug #69 (UI) — Topbar self-reference

`mijn-gegevens.html` regel 24 had:
```html
<a href="instellingen.html" class="top-link is-active">Mijn gegevens</a>
```

Wat fout was: link wijst naar `instellingen.html` ipv self (`mijn-gegevens.html`). Wanneer user op de zelfde "Mijn gegevens"-link klikt op de huidige pagina, gaat hij ongewenst naar Instellingen.

**Fix**: `href="instellingen.html"` → `href="mijn-gegevens.html"` (self-reference, consistent met andere BS1 pagina's).

## Schema

- **Hoofdtabel `public.profiles`** (1 record) — basis voor profiel-data
- **Helper-tabellen**: `medewerkers` / `medewerker_notities` / `medewerker_documenten` / `medewerker_verzuim_perioden` / `planning` voor stats
- **`gdpr_retention_run_v1()`** functie voor automatische retention-policy enforcement
- Geen `active_sessions` tabel — Supabase Auth manageert sessions intern

## v3 deferred items

- **Active sessions tab** — BS2-feature niet in BS1 (Supabase Auth listSessions als bron, v3 Fase G)
- **Profile-edit form** in mijn-gegevens.html — bewust niet, gaat via Instellingen → Mijn profiel
- **Mobile session-detection** — BS2 toont "Mobiele app" als device, BS1 detecteert User-Agent generiek (v3 Fase G optioneel)
