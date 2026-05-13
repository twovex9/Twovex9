# Module 01: Home + nieuws-feed — DOM structure

**BS2-URL**: `https://etf.acceptance.besasuite.nl/home`
**BS1-equivalent**: `home.html`
**Rol-context bij scrape**: admin (Jason Sonck, `jason.sonck@embracethefuture.nl`)
**Gescraped op**: 2026-05-13

## Sitemap

Single page. Geen sub-pages.

Gerelateerde routes (vanaf Home bereikbaar via topbar):
- `/notifications` — full notifications-overzicht
- `/account` — user-profile (via avatar-dropdown "Mijn profiel")
- `/manual/...` — handleiding (via help-icoon)

## Topbar (globaal, op élke pagina aanwezig)

Linksboven:
- ETF logo (klik → home)

Top-nav center (13 items):
| Item | Type | URL |
|---|---|---|
| Home | direct-link | `/home` |
| Planning | dropdown-button | `/planning` (+ sub: Overzicht, Beheer) |
| Urenregistratie | dropdown-button | `/time-registration/time/summary` |
| HR | dropdown-button | `/hr` |
| Cliënten | dropdown-button | `/clients/manage-incidents` |
| Kilometers | dropdown-button | `/mileage/declarations` |
| Facturen | dropdown-button | `/invoices-module/invoices-to-review` |
| Taken | direct-link | `/tasks` |
| Medewerkers | direct-link | `/main-employee` |
| Beleid | direct-link | `/documents` |
| Audit | direct-link | `/audit` |
| Organisatie | dropdown-button | `/organization/teams` |
| Instellingen | direct-link | `/settings` |

Rechtsboven (3 widgets):
1. **Help-icoon (?)** — opent `/manual/authentication/sign-in` (in-app handleiding met video-tutorials, sidebar met categorieën Authenticatie/Gebruikersbeheer/Cliënt/HR/Organisatie/Beleid/Taken/Audit Logs/Planning/Tijdregistratie). Module 36 in v3-plan.
2. **Notification-bell** met badge (toont count ongelezen, hier `7`)
   - aria-label = `Toggle notifications`
   - Klik opent floating dropdown (zie behaviors.md)
3. **User-avatar** (initialen-cirkel, hier `JS`)
   - Klik opent floating dropdown met user-info + Mijn profiel + Uitloggen

## Home page content

```
<h1>Welkom, <voornaam></h1>

<h2>Nieuws & Mededelingen <count-badge></h2>

<grid-3-columns>
  <NieuwsCard /> × N
</grid-3-columns>
```

### Welkom-block

- H1 met dynamische voornaam uit user-profile (`auth.users.user_metadata` of `profiles.voornaam`)
- Voorbeeld: "Welkom, Jason"

### Nieuws & Mededelingen sectie

- H2 met sectietitel + count-badge (hier `15`)
- 3-kolom grid van nieuws-cards
- Lazy-loaded/scroll, **geen pagination**, **geen filters**, **geen zoek-input**

### Nieuws-card structuur

```
<card>
  <image-placeholder /> (grijs vierkant bovenaan, soms thumbnail)
  <arrow-icon-top-right /> (klik → opent detail-modal)
  <h3>{titel}</h3>
  <p class="excerpt">{korte intro, max ~3 regels, truncated met "…"}</p>
  <author-block>
    <avatar-initialen />
    <author-naam />
    <publish-date /> (bv. "mei 11, 2026")
  </author-block>
</card>
```

## Dropdowns + filter-opties

Op Home: **geen**. Geen filters, geen zoek, geen view-toggle.

## Knoppen-inventaris (op Home zelf)

- Help-icoon (rechtsboven) → navigate `/manual/...`
- Notification-bell (rechtsboven) → toggle dropdown
- User-avatar JS (rechtsboven) → toggle dropdown
- Per nieuws-card: pijl-icoon `↗` rechtsboven van card → opent nieuws-detail-modal

**Geen** "+ Nieuws toevoegen" knop op Home. Admin-create-flow zit in HR > Nieuws (Module 13).

## Acties-cel per nieuws-card

Geen archief/delete-knoppen zichtbaar op Home-cards (read-only view). Edit/delete-rechten zitten in Module 13 (HR > Nieuws).

## Pagination / loading

- **Lazy-rendering** (geen "Volgende pagina" knop)
- Alle 15 items renderen in DOM (geen virtualisatie)
- Scroll-down toont resterende items

## Lege-state

Onbekend — Home heeft 15 nieuws-items. Indien `count = 0`: vermoedelijk lege grid met sectietitel + count-badge `0`.

## Notification-bell dropdown structuur

Floating panel (rechtsboven, opent bij klik bell):

```
<dropdown>
  <header>Notificaties</header>
  <tabs>
    <tab active>Ongelezen <badge>5</badge></tab>
    <tab>Gelezen</tab>
  </tabs>
  <list>
    <notification-item> × max 5
      <title>{kort: "Nieuw nieuws artikel: {nieuws-titel}"}</title>
      <time-ago>{2 dagen geleden / Vorige week / 28 apr}</time-ago>
    </notification-item>
  </list>
  <footer>
    <count-text>{N} notificatie(s)</count-text>
    <button>Alles bekijken</button>
  </footer>
</dropdown>
```

Klik `Alles bekijken` → navigeert naar `/notifications` (zie hieronder).

## /notifications full-page overzicht

- H1: "Notificaties"
- Tabs: `Ongelezen` (active) / `Gelezen`
- Sub-header: "Unread Notifications" (Engelse string, mogelijk i18n-incomplete)
- Lijst van alle notificaties met titel + time-ago
- Klik op notification → opent gerelateerde nieuws-artikel modal of pagina

## User-avatar dropdown structuur

```
<dropdown>
  <header>
    <full-name>{voornaam achternaam}</full-name>
    <email>{email}</email>
  </header>
  <menu-item href="/account">Mijn profiel</menu-item>
  <menu-item action="logout">Uitloggen <shortcut>⇧⌘Q</shortcut></menu-item>
</dropdown>
```

Shortcut: Shift+Cmd+Q (Mac) / Shift+Ctrl+Q (Win/Linux) voor direct uitloggen.

## Help-icoon → Manual page

Navigatie: `/manual/authentication/sign-in` (default)

- Sidebar: 11 categorieën (Authenticatie [Inloggen/Wachtwoord Reset Aanvragen/Wachtwoord Resetten], Gebruikersbeheer, Cliënt, HR, Organisatie, Beleid, Taken, Audit Logs, Planning, Tijdregistratie)
- Zoek-input bovenaan ("Zoek in handleiding...")
- Hoofd-content: tekst-uitleg + ingebedde HTML5 video-tutorial per onderwerp
- Voorbeeld 1e pagina: "Inloggen" met 0:18 video-demo van login-flow

→ Volledig gedocumenteerd in Module 36 (Manual).

## BS1 huidige status

`home.html` heeft al:
- Welkom-block
- Nieuws-cards (in Phase 2 followup gebouwd)
- Notification-bell (Phase 2 followup, met badge-counter)
- Topbar/sidebar conform huisstijl

**Bekende BS1-gaps t.o.v. BS2 (te fixen in Fase E)**:
- ❓ Nieuws-detail modal — check of BS1's flow gelijk is (close-X only, geen routing change)
- ❓ Notification-bell dropdown tabs Ongelezen/Gelezen — check of beide tabs werken in BS1
- ❓ "Alles bekijken" → BS1 `/notifications` page bestaat?
- ❓ User-avatar dropdown shortcut ⇧⌘Q voor uitloggen
- ❓ Help-icoon → BS1 heeft geen manual-pagina (Module 36 = nieuwe feature voor BS1)
