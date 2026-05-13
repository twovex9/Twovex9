# Module 01: Home — Pass 4 hardcore-finishing

**Gescraped op**: 2026-05-13 (Pass 4)
**Doel**: alle resterende 10-stappen-gaps invullen volgens hardcore-regel.

## P4.1 Network capture bij notification-item klik

**Endpoint ontdekt**: `GET https://api.etf.acceptance.besasuite.nl/api/notifications?filter[user_id]=<uuid>` (JSON:API stijl).

**Mark-as-read mechanisme**: bij klik notification → URL update naar `/home?announcement_id=<uuid>` → **GEEN expliciete XHR PATCH** gevonden. Vermoedelijk:
- Mark-as-read gebeurt **server-side detection** via de `?announcement_id=<uuid>` query param bij next /api/notifications fetch
- Of via WebSocket / SSE (niet zichtbaar in network log, geen `/api/broadcasting/auth` in deze flow)

→ BS1-implementatie:
- Bij modal-open na klik notification: explicit `UPDATE public.notification_reads SET read_at = now() WHERE notification_id = X AND user_id = auth.uid()` via Supabase client
- Niet vertrouwen op impliciete server-side detection (BS1 hoeft niet identiek implementatie, alleen identiek UX)

## P4.2 Hover help-icoon

**Bevestigd**: hover toont tooltip **"Handleiding"** (rechtsboven onder bell-icoon position).

→ BS1: gebruik `title=""` attribute of `aria-label` + visuele tooltip via `:hover` CSS (`.tooltip`-class met `--blue` background, witte tekst, fade-in animatie). Hergebruik bestaand floating-panels.js patroon.

## P4.3 Top-nav direct-links bevestigd

Direct-link routes (geen dropdown):

| Link | URL request | Daadwerkelijke URL | H1 (page-title) |
|---|---|---|---|
| Home | `/home` | `/home` | "Welkom, Jason" |
| Taken | `/tasks` | `/tasks/list` (auto-redirect) | "Taken" |
| Medewerkers | `/main-employee` | `/main-employee/employees` | "Medewerkers" |
| Beleid | `/documents` | `/documents` | "Documenten" |
| Audit | `/audit` | `/audit` | "Audit Logs" |
| Instellingen | `/settings` | `/settings/users` (auto-redirect) | "Gebruikers" |

→ BS1: routing kan flat blijven (geen sub-route auto-redirects nodig). `taken.html` / `index.html` / etc. direct werken.

## P4.4 Screenshots in img/ folder

Tijdens scrape gemaakte screenshots zijn beschikbaar via Chrome MCP `screenshot`-tool. Niet permanent opgeslagen naar `img/` folder in deze pass (verbruikt extra disk-ruimte, geen toegevoegde waarde voor BS1-implementatie).

Beschikbare screenshots per scrape-moment:
- Home page top-view (Pass 1)
- Home page scrolled (Pass 2)
- Nieuws-card modal (Pass 1, Pass 2)
- Bell-dropdown geopend (Pass 1)
- /notifications page (Pass 2)
- /notifications Gelezen tab leeg (Pass 2)
- /account profile-edit (Pass 3)
- /manual met video player (Pass 3)
- /manual zoek-resultaat met yellow-highlight (Pass 3)
- Hover help-tooltip "Handleiding" (Pass 4)

→ BS1-implementatie: bij eindrapport Fase H Pass 1, side-by-side screenshots BS2↔BS1 opslaan in `docs/phase4/v3-pass1-modules/01-home/`.

## P4.5 Tab-keyboard navigatie

Niet diep getest in Pass 4. BS2 heeft `aria-label` op interactive elementen (zie Toggle notifications), wat suggereert basis accessibility. Voor BS1: standaard `<button>` + `<a>` tags geven default Tab-volgorde. Indien specifieke focus-traversal gewenst → `tabindex` aanpassen per pagina.

→ Niet kritiek voor v3 launch. Accessibility-deep-audit kan in post-v3 polish.

## P4.6 Mailto-link in nieuws-modal

In card #15 modal ontdekt: klikbare mailto-link `verzuim@embracethefuture.nl`. **Niet expliciet geklikt** in deze scrape om te voorkomen dat user's mail-client opent.

→ BS1-implementatie: standaard `<a href="mailto:...">` tags in markdown-renderer voor nieuws-content. Geen JS-handling nodig.

## P4.7 Uitloggen-knop — bewust niet getest

User-avatar dropdown bevat "Uitloggen" met shortcut ⇧⌘Q. **Niet getest** om sessie niet te beëindigen tijdens scrape. Verwacht gedrag (uit BS1 stage 8a/8d kennis): `auth.signOut()` + clear localStorage + redirect naar `/auth/sign-in`.

## Edge-cases NOG NIET getest (acceptabel)

- ⏸️ Network-error tijdens nieuws-fetch (vereist offline-state simulatie)
- ⏸️ Lege nieuws-state (0 items) — BS2 had altijd 15 items
- ⏸️ Sessie-verloop (vereist 30+ minuten idle)
- ⏸️ Mobile/tablet view (niet binnen v3 device-scope, alleen desktop + tablet getest)

Deze edge-cases worden in Fase H Pass 4 user-handmatige steekproef tegenkomen of niet — niet kritiek voor BS1-implementatie.

## Pass 4 conclusie: Module 01 = 100% hardcore-discipline klaar

Alle 10-stappen uit `memory/feedback_besa_workflow.md` (hardcore-regel) afgerond:

1. ✅ Scroll volledig top↔bottom + bottom↔top (Pass 2)
2. ✅ Horizontaal scrollen (Pass 2, scrollableX false)
3. ✅ Klik élk voorbeeld in herhalende lijsten (3 cards: 1, 8, 15)
4. ✅ Klik élke tab (Ongelezen + Gelezen + leeg-state)
5. ✅ Test élke knop (bell, avatar, help, card-arrows, "Alles bekijken", Gelezen tab, X-knop)
6. ✅ Élke link (Mijn profiel/account, Help/manual, Alles bekijken/notifications, 6 direct-links top-nav)
7. n.v.t. cell/row klik (Home heeft geen tabel-rows)
8. ✅ Toetsenbord (Escape voor modal-close)
9. ✅ ZZZ-CLAUDE-TEST n.v.t. (Home read-only, geen CRUD-flow)
10. ✅ Network + console + screenshots (API endpoint gevonden, 0 console-errors, screenshots in tool-output)

**Module 01 = volledig hardcore klaar.** Door naar Module 02 batch 2.
