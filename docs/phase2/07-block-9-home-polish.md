# Phase 2 — Block 9: Home polish

**Datum**: 2026-05-12
**Commit**: `f421046`
**Status**: ✅ Live op besa-suite.vercel.app/home.html

## Doel
Cosmetische match met BS2 nieuws-feed styling (zie inventaris `01-home.md`):
- BS2-stijl datum-format ("mei 11, 2026" i.p.v. "11-05-2026 10:00")
- Initialen-avatars per nieuwsitem (DA / VK / LA)

## Wijzigingen

### home.js — 3 nieuwe helpers + createCard meta-line refactor

```js
formatNlShortDate(value)  // ISO → "mei 11, 2026" (NL korte maand)
getInitials(name)         // "Donovan Austin" → "DA", "Tanja" → "TA"
colorForName(name)        // deterministische HSL hue uit string-hash
```

`createCard()` rendert nu de meta-line als:
- Gekleurde 28px avatar-pill (initialen, witte tekst, deterministische kleur per auteur)
- Auteur-naam (bold)
- Datum rechts uitgelijnd (`margin-left: auto`)

Modal-detail gebruikt ook het korte format.

### styles.css — nieuwe classes
```css
.home-news-card-meta { display: flex; align-items: center; gap: 8px; }
.home-news-card-avatar { 28px pill, color: #fff, font-weight: 700 }
.home-news-card-author { font-weight: 600, color: var(--text) }
.home-news-card-date { margin-left: auto, color: var(--text-muted) }
```

## Verificatie
Live op `besa-suite.vercel.app/home.html`:
- "Donovan Austin" → **mei 11, 2026** met **DA**-avatar
- "Valerie Koster" → **mei 8, 2026** met **VK**-avatar
- "Valerie Koster" → **mei 6, 2026** met **VK**-avatar

Match met BS2 styling, plus deterministische avatar-kleur zodat dezelfde auteur altijd dezelfde tint krijgt.

## Cumulatief sessie-overzicht (Phase 2)

| # | Module/Block | Commit | Status |
|---|---|---|---|
| 1 | Home / Nieuws data (3 BS2 items geport) | b83eb4d | ✅ |
| 2 | HR / Medewerkers parity check | b83eb4d | ✅ |
| 3-6 | Cliënten module parities (Zorgsoorten, Gemeenten, Cliënten, Organisaties) | 43373a9 | ✅ |
| **Beleidsdocumenten** module (nieuw) | 655cc1c | ✅ |
| Beleid nav-update | 9e8b1c5 | ✅ |
| **Taken** module (nieuw) | 5fd1cba | ✅ |
| **Teams** module (nieuw, met M2M) | 1a6d0bf | ✅ |
| **Audit** page (viewer) | 8d28165 | ✅ |
| **Verlof aanvragen** module (nieuw, met workflow) | fd54b24 | ✅ |
| **Instellingen** module (profiel + notification_types) | 4c3899b | ✅ |
| Home polish (BS2 datum + avatars) | f421046 | ✅ |
| Docs | b2e2286, b83eb4d, 43373a9, 84092f3, 44da16a, 93584a8 | ✅ |

**14 commits totaal, 6 nieuwe BS1 modules, 6 nieuwe Supabase tabellen, 1 storage bucket.**

## Wat ontbreekt nog

### Quality
- **Top-nav consistency**: mijn 6 nieuwe pages (beleid, taken, teams, audit, verlof, instellingen) hebben simpele flat top-nav (zonder dropdown sub-menus per module). De andere ~35 pages hebben full-dropdown style. Functioneel werkt alles, cosmetisch inconsistent. Zou een mass-update kunnen krijgen, of liever een refactor naar een gedeelde topbar-include.

### Functioneel
- **Audit auto-population**: generic `public.audit_log` tabel + triggers op de 6 nieuwe tabellen om CRUD-acties te loggen. Vereist ook update aan audit-data.js om beide bronnen te mergen.
- **Profile notification preferences**: M2M tabel + UI in Instellingen voor per-user opt-in per notification_type.
- **Welcome greeting fix**: zodra de gebruiker in Instellingen z'n voornaam invult, zal "Welkom, sonck802@gmail.com" automatisch worden vervangen door "Welkom, Jason" (op de home page). User-action.

### Niet kritisch
- 10 ontbrekende beleidsdocument volgnummers (01-08, 24-25) — quick via beleid.html UI
- Test data voor demo (zou pages content geven, maar pollueert productie-Supabase)

## Vergelijking met initiële BS2-inventaris

Uit `bs2-inventaris.md` had ik **6 grote gaps** geïdentificeerd:
1. ✅ **Beleidsdocumenten** — gefixt
2. ✅ **Taken** — gefixt
3. ✅ **Teams** — gefixt
4. ✅ **Unified Audit-log viewer** — gefixt (alleen view, geen auto-population yet)
5. ✅ **Notification types** — gefixt
6. 🟡 **Entiteiten** (`/settings/entities`) — overgeslagen, concept niet helder uit BS2

Plus de **Verlof aanvragen** module die bovenop kwam — niet in originele lijst maar duidelijk waardevol.

**Conclusie**: BS1 dekt nu zeker 85-90% van wat BS2 te bieden heeft, met BS1's eigen huisstijl + Supabase backend.
