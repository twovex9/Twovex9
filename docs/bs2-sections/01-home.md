# BS2 — Home (`/home`)

**URL**: https://etf.acceptance.besasuite.nl/home
**Page title**: Home | Embrace The Future

## Volledig navigatie-overzicht (top bar)

| # | Label | URL pad | Status in BS1 |
|---|---|---|---|
| 1 | Home | `/home` | ✅ `home.html` |
| 2 | Planning | `/planning` | ✅ `planning.html` |
| 3 | Urenregistratie | `/time-registration/time/summary` | ✅ `werkuren.html` |
| 4 | HR | `/hr` | ✅ `index.html` (medewerkers) |
| 5 | Cliënten | `/clients/manage-incidents` | 🟡 `clienten.html` (BS1 toont cliënten, BS2 link wijst direct naar incident-management) |
| 6 | Kilometers | `/mileage/declarations` | ✅ `kilometers.html` |
| 7 | Facturen | `/invoices-module/invoices-to-review` | ✅ `facturen.html` |

## Secundaire navigatie (overige)

| # | Label | URL pad | Status in BS1 |
|---|---|---|---|
| 8 | Taken | `/tasks` | ❓ Mogelijk in `werkruimte.html` ("tabbed: taken") |
| 9 | Medewerkers | `/main-employee` | ✅ `index.html` (HR medewerkers-lijst) — overlap met "HR" item |
| 10 | Beleid | `/documents` | ❓ Mogelijk in `werkruimte.html` ("beleid"-tab) |
| 11 | Audit | `/audit` | ❓ Mogelijk in `werkruimte.html` ("audit"-tab) |
| 12 | Organisatie | `/organization/teams` | ❓ Mogelijk in `werkruimte.html` ("org") |
| 13 | Instellingen | `/settings` | ❓ Mogelijk in `werkruimte.html` ("settings") |
| 14 | Manual | `/manual` | ❌ Niet aanwezig in BS1 |

## Topbar elementen
- Notificatie-bel ("Toggle notifications") — getal `7` zichtbaar → 7 ongelezen
- User avatar **JS** (Jason) — klikbaar voor user-menu
- "Welkom, Jason" — begroeting op home page

## Page content — Home feed

**Sectie: "Nieuws & Mededelingen"** (getal `15` = aantal items)

Per nieuwsitem:
- Avatar (initials, bv. DA, VK, LA)
- Auteur naam (bv. Donovan Austin, Valerie Koster, Lionel Austin, Tanja)
- Publicatiedatum, formaat: `mmm dd, yyyy` (NL korte maand, bv. "mei 11, 2026")
- Titel (kop)
- Body — rich text met:
  - Paragrafen
  - Bullets (in sommige items)
  - Lijnonderbrekingen
  - Emoji 📍 🕖 🍕 🗓 etc. (in feestelijke berichten)
  - Hyperlinks (bv. https://form.typeform.com/, https://www.vakbekwaaminzorg.nl/)

## Inferred datamodel — `nieuws`

```sql
create table if not exists public.nieuws (
  id uuid primary key default gen_random_uuid(),
  titel text not null,
  body text not null,  -- rich text / markdown / html (te bepalen)
  auteur_id uuid references public.profiles(id),
  auteur_naam text,    -- denormalized snapshot (toestaan dat auteur later wijzigt zonder feed te breken)
  auteur_initials text,
  gepubliceerd_op timestamptz not null default now(),
  archived boolean not null default false,
  laatst_gewijzigd timestamptz not null default now()
);
```

**Vergelijking met bestaande BS1**:
- BS1 `public.nieuws` tabel bestaat al (RLS aan, 0 rijen)
- BS1 heeft `nieuws-data.js` data-laag
- BS1 `home.js` is per Stage 9b al gekoppeld aan Supabase
- **Gap**: BS1 heeft de structuur, maar geen content. Schema details (welke kolommen, rich-text-format) nog niet geverifieerd.

## Business context uit feed

- **Organisatie**: Embrace the Future — jeugdzorg-organisatie
- **Workforce**: ZZP'ers + loondienst-medewerkers (twee categorieën)
- **Features impliciet uit content**:
  - Mobile app voor QR check-in op locatie
  - Zelf factuur aanmaken in browser (sinds 1 april 2026) — voor ZZP'ers
  - Incident-meldingen (sinds 1 april 2026, vervangt "Patient Safety")
  - Beschikbaarheid / verlof / planningsverzoeken via systeem
  - Salarisstrook met vakantiegeld + CAO
  - BHV-certificaten verplicht voor ZZP'ers
  - E-learning tracking (extern, certificaat upload naar HR)
- **Bestaande contacten**:
  - HR: 06 83183726, HR@embracethefuture.nl
  - Verzuim & Planning: +31 6 83051938, verzuim@embracethefuture.nl
  - Beleid/kwaliteit: beleid.kwaliteit@embracefuture.nl
  - Facturen (oude): facturatie@embracethefuture.nl

## Status / parity met BS1

- ✅ Functionaliteit (home + nieuws-feed) bestaat al in BS1
- 🟡 Visueel waarschijnlijk anders (BS2 = Vue 3, BS1 = vanilla HTML)
- 🟡 Schema: BS1 `nieuws` tabel bestaat, maar exacte kolom-namen / body-format moeten geverifieerd worden tegen wat BS2 stuurt
- ❌ Notificatie-bell met counter — onbekend of BS1 dit heeft (moet checken in `index.html`/`script.js`)
