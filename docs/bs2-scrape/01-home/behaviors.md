# Module 01: Home — gedrag per actie

**Gescraped op**: 2026-05-13 (rol: admin)

## Actie 1: Klik op nieuws-card pijl-icoon (↗)

**BS2-trigger**: klik op pijl-icoon rechtsboven binnen een nieuws-card.

**BS2-respons**:
- **Modal opent** (semi-transparante overlay over hele pagina, gecentreerd modal)
- URL blijft `/home` (geen routing change)
- Modal-content:
  - Top-image (grijs placeholder als geen image)
  - H1: titel van nieuws-artikel
  - Auteur-block: avatar-initialen + naam + datum
  - Body-tekst (volledige content, scrollable indien lang)
- Knoppen in modal: **alleen Close X rechtsboven** (1 knop totaal)
- **Geen edit-knop**
- **Geen delete-knop**
- **Geen share-knop**
- Click op overlay (buiten modal) of Escape-key → modal sluit

→ **BS1-implicatie**: read-only modal. Edit/delete-acties zitten elders (HR > Nieuws). Home is consumer-view.

## Actie 2: Klik op nieuws-card body (niet de pijl)

**BS2-trigger**: klik op de titel of body-tekst van een nieuws-card.

**BS2-respons**: niets — card-body zelf is geen link. Alleen de pijl-icoon opent modal.

## Actie 3: Klik op notification-bell

**BS2-trigger**: klik op de bell-icoon rechtsboven (aria-label "Toggle notifications").

**BS2-respons**:
- Floating dropdown opent rechtsboven onder de bell
- Dropdown toont:
  - Header "Notificaties"
  - Tabs "Ongelezen 5" (active) / "Gelezen"
  - 5 items zichtbaar (max in dropdown)
  - Footer: "5 notificatie(s)" + knop "Alles bekijken"
- 2e klik op bell → dropdown sluit
- Klik buiten dropdown → dropdown sluit

**Counter-update gedrag**: onbekend wat badge-update triggert. Mogelijk client-side polling of WebSocket.

## Actie 4: Klik op notification-item in dropdown

**BS2-trigger**: klik op een notification-rij in de dropdown.

**BS2-respons**: vermoedelijk navigeert naar de gerelateerde resource (bv. nieuws-artikel) en mark-as-read. **Niet expliciet getest in deze scrape om geen state te muteren**. Te testen bij Fase B met test-record.

## Actie 5: Klik "Alles bekijken" in dropdown

**BS2-trigger**: klik op "Alles bekijken" knop onderin notification-dropdown.

**BS2-respons**:
- Dropdown sluit
- Navigeert naar `/notifications`
- Volledige page-view:
  - H1 "Notificaties"
  - Tabs Ongelezen (active) / Gelezen
  - Sub-header "Unread Notifications" (Engelse string)
  - Lijst van 7 items (matcht badge-count van 7)

## Actie 6: Klik tab "Gelezen" op /notifications

**BS2-trigger**: klik op tab "Gelezen" in notifications-overzicht.

**BS2-respons**: tab-content wisselt naar gelezen notificaties (niet getest qua inhoud — admin-account heeft mogelijk geen gelezen).

## Actie 7: Klik user-avatar (JS)

**BS2-trigger**: klik op user-avatar rechtsboven.

**BS2-respons**:
- Floating dropdown opent rechts van avatar
- Toont:
  - Volledige naam (Jason Sonck)
  - Email (`jason.sonck@embracethefuture.nl`)
  - Menu-item "Mijn profiel" → navigeert `/account`
  - Menu-item "Uitloggen" met shortcut indicator `⇧⌘Q`
- Klik buiten dropdown → sluit
- 2e klik avatar → sluit

## Actie 8: Klik "Mijn profiel"

**BS2-trigger**: klik op "Mijn profiel" in user-avatar dropdown.

**BS2-respons**: navigeert naar `/account` (user-profile pagina). Inhoud daarvan: Module 35 (Mijn-gegevens).

## Actie 9: Klik "Uitloggen" of toets ⇧⌘Q

**BS2-trigger**: klik "Uitloggen" of toets shortcut.

**BS2-respons**:
- Sessie wordt beëindigd (vermoedelijk DELETE op sessie-cookie / auth.signOut)
- Redirect naar login-pagina `/auth/sign-in` (te bevestigen)
- **Niet getest in deze scrape** om sessie niet te beëindigen.

## Actie 10: Klik help-icoon (?)

**BS2-trigger**: klik op `?` icoon rechtsboven.

**BS2-respons**: navigeert direct naar `/manual/authentication/sign-in` (geen modal, full-page navigation). Tooltip op hover: "Handleiding".

## Actie 11: Klik op topbar-link

Per topbar-item: zie sitemap-URLs in `structure.md`. Allemaal direct-navigation (geen tussenmodals).

## Edge cases

- **Network-error tijdens nieuws-fetch**: onbekend gedrag, niet getriggerd
- **Lege nieuws-state (0 items)**: onbekend gedrag, BS2 had 15 items
- **Notification 0 items**: zelfde
- **Sessie-verloop**: onbekend, niet getest
- **Mobile/tablet view**: niet getest
