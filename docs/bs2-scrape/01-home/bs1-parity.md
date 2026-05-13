# Module 01: Home — BS1 PARITY-CHECK

**Gescraped op**: 2026-05-13 (retroactief, na BS2 batches voltooid)
**BS1-URL getest**: `https://besa-suite.vercel.app/home.html`
**Test-account**: `sonck802@gmail.com` (admin-tier)
**BS2-equivalent**: `https://etf.acceptance.besasuite.nl/home`

## BS1 codebase-componenten

| Type | Bestand(en) | Doel |
|---|---|---|
| Page | [home.html](../../../home.html) | Home pagina HTML |
| Page-script | [home.js](../../../home.js) | Home page-script (greeting + news-render + modal-handlers) |
| Data-laag | [nieuws-data.js](../../../nieuws-data.js) | `window.nieuwsDB` (Supabase nieuws CRUD) |
| Data-laag | [profiles-data.js](../../../profiles-data.js) | `window.profilesDB` (voor voornaam in greeting) |
| Auth | [auth-guard.js](../../../auth-guard.js) | Session-check + redirect + topbar-user-info |
| Notification | [notification-bell.js](../../../notification-bell.js) | Bell-icoon in topbar + dropdown |
| Error-monitoring | [error-reporter.js](../../../error-reporter.js) | Client-error logging naar `client_errors` |

## Supabase-tabellen relevant voor Module 01

| Tabel | Status | Doel |
|---|---|---|
| `public.nieuws` (10 cols, id uuid) | ✅ Bestaat | Nieuws-artikelen (titel/body/auteur/published_at/...) |
| `public.profiles` (uuid) | ✅ Bestaat | voornaam voor greeting |
| `public.client_errors` | ✅ Bestaat (Fase 0.5) | JS-error logs |
| **`public.notifications`** | ❌ **MISSING** | Notification-bell items (BS2 heeft 7+ items voor admin) |
| **`public.notification_reads`** | ❌ **MISSING** | Read-status per user-per-notification |

## Live BS1 Chrome MCP test resultaten (2026-05-13)

| Test | Resultaat |
|---|---|
| Navigate `home.html` | ✅ Laadt zonder errors |
| H1 "Welkom" | ✅ Aanwezig (BS2: "Welkom, Jason" — BS1 mist voornaam-suffix) |
| News-grid container `#home-news-grid` | ✅ Aanwezig |
| News-cards rendered | ✅ 3 cards (BS2 had 15+ cards — count-verschil) |
| Card-klik opent `#home-news-modal` | ✅ Werkt — modal toont author/datum/titel/body |
| Modal close-X | ✅ Werkt |
| Notification-bell aanwezig | ✅ Bell-icoon zichtbaar in topbar |
| Bell-klik opent dropdown | 🟡 Click registreert, geen visueel panel — mogelijk leeg-state of bug |
| User-avatar JS | ✅ Aanwezig, toont email + Uitloggen-link |
| Help-icoon (?) | ✅ Aanwezig (geen action verbonden) |
| Top-nav links | ✅ 14 items (BS2 had 13 — BS1 heeft Verlof EXTRA in top-nav) |
| Globals geladen | ✅ besaSupabase, nieuwsDB, profilesDB allemaal `object` |
| Console errors | ✅ 0 errors |

## Per BS2-actie systematische parity-vergelijking

| BS2-actie (uit `behaviors.md`) | BS1-status | BS1-locatie | Gap | Categorie |
|---|---|---|---|---|
| **Welkom-block met voornaam** | 🟡 Partial | `home.html` line 108 + `home.js` greeting-logic | BS1 toont "Welkom" zonder voornaam-suffix als profile leeg is. BS2 toont altijd "Welkom, Jason". Tonen "Vul je voornaam in via Instellingen" link bij leeg profiel — UX-different | Behavior-gap |
| **Nieuws & Mededelingen H2 + count-badge** | 🟡 Partial | `home.html` line 109 | BS1 toont "Nieuws & Mededelingen" als plain `<p class="home-subtitle">`, geen H2 + geen count-badge. BS2 heeft H2 + badge "(15)" | UI-gap |
| **Nieuws-card render** | ✅ Match | `home.js` + `nieuws-data.js` | BS1 = 3 cards getest (data-set kleiner dan BS2 production); structurele match: card + author-avatar + datum + excerpt | — |
| **Nieuws-card image-placeholder + arrow-icon top-right** | 🟡 Partial | `home.html` modal heeft image-slot maar card-versie onbekend | BS1 card toont "Nieuws"-label bovenaan ipv image-placeholder. BS2 had grijs vierkant + arrow-icoon. **Te verifiëren in BS1-card-DOM** | UI-gap |
| **Card-klik → detail-modal** | ✅ Match | `home.html` line 116-133 (`#home-news-modal`) + `home.js` | Bevestigd via Chrome MCP — modal opent met author/datum/titel/body | — |
| **Modal Close X** | ✅ Match | `#home-news-modal-close` button | Werkt | — |
| **Modal close via Escape-key** | ❓ Niet getest | n/a | Verifieer of Escape close de modal in BS1 | Behavior-gap (potentieel) |
| **Modal close via overlay-click** | ❓ Niet getest | n/a | Verifieer of klik buiten modal sluit in BS1 | Behavior-gap (potentieel) |
| **Notification-bell icon + badge** | ✅ Match | `notification-bell.js` | BS1 heeft bell-icoon. BS2 toonde badge "7" (ongelezen-count) | — |
| **Bell-click opent dropdown** | 🟡 Partial | `notification-bell.js` | Click registreert via JS maar geen visible panel in test. **Te debuggen** — mogelijk leeg `notifications`-data set | Behavior-gap |
| **Dropdown Ongelezen / Gelezen tabs** | ❌ Niet aanwezig | n/a | BS2 had dropdown met 2 tabs. BS1 `notification-bell.js` script-inhoud te checken voor tab-implementatie | UI-gap |
| **Per notification: titel + time-ago** | ❌ Onbekend | n/a | Tabel `notifications` ontbreekt in Supabase — fundamenteel ontbreekt notification-feature backend | Schema-gap |
| **"Alles bekijken" → /notifications** | ❌ Niet aanwezig | n/a | BS1 heeft geen `notifications.html` route | UI-gap |
| **User-avatar dropdown** | 🟡 Partial | `auth-guard.js` toont email + Uitloggen rechtsboven inline (geen dropdown) | BS2 had dropdown met "Mijn profiel" link + Uitloggen + shortcut ⇧⌘Q | UI-gap |
| **Avatar dropdown "Mijn profiel"** | ❌ Niet aanwezig | n/a | Geen "Mijn profiel" link in BS1 (instellingen.html bestaat wel, maar geen direct-link uit avatar) | UI-gap |
| **Avatar dropdown shortcut ⇧⌘Q** | ❌ Niet aanwezig | n/a | BS1 heeft geen keyboard-shortcut voor logout | Behavior-gap (low-priority) |
| **Help-icoon → /manual page** | ❌ Niet aanwezig | n/a | BS1 help-icoon aanwezig maar geen action; geen `manual.html` pagina. BS2-manual = Module 36 | UI-gap (groot — heel module) |
| **Top-nav 13 items (BS2)** | 🟡 14 items | `home.html` line 22+ | BS1 heeft EXTRA "Verlof" als direct-link in top-nav (BS2 heeft Verlof onder HR-dropdown). Niet inherent fout — UX-keuze | Behavior-gap (BS1 minor "extra") |
| **Top-nav dropdowns met sub-items** | ✅ Match | `home.html` `top-nav-item--dropdown` | BS1 heeft dropdown-structuur (Planning/Urenregistratie/HR/Cliënten/Kilometers/Facturen/Organisatie/Verlof) | — |
| **Read-audit (BS2 logt wie wanneer Home bekeek)** | ❌ Niet aanwezig | n/a | Geen `audit_log` entry voor SELECT op nieuws.html via Home | Audit-gap |

## Schema-gaps in detail

```sql
-- VEREIST voor BS2-parity:
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  related_entity_type text,
  related_entity_id text,
  created_at timestamptz default now()
);

create table if not exists public.notification_reads (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid references public.notifications(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  read_at timestamptz default now(),
  unique (notification_id, user_id)
);
```

## Gap-categorieën samengevat

| Categorie | Count |
|---|---|
| ✅ Match | 6 |
| 🟡 Partial | 6 |
| ❌ Missing | 7 |
| ❓ Niet getest | 2 |
| **Total** | **21** |

## Fase E-prioritering (gap-fix-PR plan)

**P1 (kritiek voor productie-launch)**:
1. Greeting met voornaam — admin-tier user-feedback verbetert UX (small, snelle PR)
2. Nieuws-card image-placeholder + arrow-icoon — visual parity (HTML+CSS, snelle PR)
3. Notification-feature compleet (tabel + bell-dropdown + tabs + /notifications page) — gebruikersinformatie kritiek

**P2 (belangrijk)**:
4. User-avatar dropdown met "Mijn profiel" + shortcut — UX-feature
5. Modal Escape/overlay-close — accessibility

**P3 (kan na go-live)**:
6. Help-icoon → /manual (= Module 36 hele scrape vereist eerst)
7. Read-audit voor Home-views

## Eindconclusie

**Module 01 parity-status**: **~60% bereikt**.

**Werkende kernfunctionaliteit**: Welkom-block + nieuws-cards + click-to-modal + topbar/nav.
**Gaps**: notification-feature backend ontbreekt volledig (tabel + UI), user-avatar dropdown ontbreekt, manual-feature ontbreekt, voornaam-greeting placeholder-state.

**Bevestigd in Chrome MCP**: 0 console-errors op `home.html`, alle data-laag-globals geladen, modal-flow werkt. Solide basis maar productie-launch vereist Fase E gap-fixes.

**Volgende stappen**: Fase E.1 (schema-migrations voor notifications), Fase E.2 (UI-gap-fixes: greeting + image + avatar-dropdown), Fase E.3 (notification-bell tabs + /notifications page).
