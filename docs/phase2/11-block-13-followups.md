# Phase 2 — Block 13: Block-12 follow-ups (4 features)

**Datum**: 2026-05-12
**Commits**: `84e5b79`, `ea10da7`, `0a15cbc`, `2e158ed`
**Status**: ✅ 4 optionele follow-ups uit Block 12 zijn nu in productie

## Achtergrond

Block 12 noemde 4 optionele follow-up items. Block 13 levert ze alle vier.

## 1. Notification bell counter — `84e5b79`

**Doel**: BS2-stijl belicon in topbar met counter voor "nieuwe audit-events sinds laatst gezien".

- `notification-bell.js`: nieuwe self-init module die topbar mutaties observeert en zelf inserts vóór de auth-badge
- Counter telt rijen uit `public.audit_log` + `public.beschikking_audit_log` waar tijdstip > `lastSeen` (localStorage-key per browser)
- Klik op bel = markeer als gezien (nu) + naar `audit.html`
- Refresh: bij init, elke 60s polling, op `besa:audit-updated` event, en bij `visibilitychange` terug naar visible
- Default-window van 7 dagen als geen lastSeen
- `99+` overflow-label bij >99
- 52 HTML-pages bijgewerkt via `scripts/add-notification-bell-script.mjs` (idempotent)

## 2. Audit detail modal — `ea10da7`

**Doel**: klik op een audit-rij → modal met volledige info, inclusief gepretty-printe JSON-payload.

- `audit.html`: nieuwe `<div class="modal-overlay" id="audit-detail-overlay">` met `.modal-card`
- `audit.js`: `openDetailModal()` / `closeDetailModal()` / `wireDetailModal()`
  - Click én Enter/Space op rij openen modal (a11y)
  - Esc / overlay-click / X-knop sluiten
  - `details` als JSON.parse + pretty-print indien valid JSON (anders raw)
  - Toont: tijdstip + ISO, gebruiker, resource, resource ID, actie-badge, status-badge, bron-label, details (pre), IP, user-agent
- `styles.css`: `.audit-row` hover/focus + `.audit-detail-dl` grid (180px label + 1fr value) + `.audit-detail-pre` voor JSON-blok (max-height 360px, scroll)
- Responsive: stacked op viewport <640px

## 3. Home voornaam welkom-polish — `0a15cbc`

**Doel**: voorkomen dat home "Welkom, sonck802@gmail.com" toont als de gebruiker zijn voornaam nog niet heeft ingevuld.

- `home.js`: strikt `profile.voornaam` (geen `displayName()` fallback meer)
- Legacy fallback: `sessionStorage.selectedEmployee.voornaam` als die er nog is
- Geen voornaam → "Welkom" zonder naam + subtle CTA-link onder de subtitle:
  > [Vul je voornaam in via Instellingen](instellingen.html) voor een persoonlijke begroeting.
- Re-render via bestaande `besa:profile-updated` listener — zodra de gebruiker zijn voornaam in Instellingen opslaat verschijnt direct de naam, nudge verdwijnt
- `styles.css`: `.home-nudge` / `.home-nudge-link` met `var(--blue)` + `--text-muted`

## 4. Profile notification preferences M2M — `2e158ed`

**Doel**: per-user opt-in/opt-out per `notification_type`. Voorheen was er alleen een globale `default_aan`-vlag per type.

### Database (apply_migration)

```sql
create table public.profile_notification_preferences (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  notification_type_id text not null references public.notification_types(id) on delete cascade,
  enabled boolean not null default true,
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now(),
  primary key (profile_id, notification_type_id)
);
```

- 2 indexen op `profile_id` en `notification_type_id`
- RLS `to authenticated` (lezen/insert/update/delete) — fine-grained per-user policies komen later via `current_user_rol()`-helpers
- `set_laatst_gewijzigd` trigger
- FK-types matchen exact (uuid → uuid, text → text) per werkpatronen 6a-bis

### Data-laag

`profile-notification-prefs-data.js`:
- API: `getForProfile(id)`, `getEffective(profileId, typeId, defaultAan)`, `setEnabled(profileId, typeId, enabled)`, `remove(profileId, typeId)`
- `setEnabled` doet upsert met `onConflict: "profile_id,notification_type_id"`
- Local cache + `besa:notification-prefs-updated` event
- `reportSilent` helper voor centraal fout-feedback (sectie 6c-bis)

### UI

- `instellingen.html`: nieuwe 3e tab **"Mijn notificaties"** tussen *Mijn profiel* en *Notificatietypes*
- `instellingen.js`: `renderMijnNotificaties()` + `toggleNotifPref(typeId, enabled)`
  - Lijst van actieve types met `<label class="switch">` toggle
  - Effective state via `getEffective(profileId, typeId, defaultAan)` (default-fallback wanneer geen pref-row)
  - Auto-save bij toggle wijziging
  - Re-render op `besa:notification-prefs-updated` of `besa:notification-types-updated`
- `styles.css`: `.inst-mn-list` / `.inst-mn-row` flex-row layout
- Toont kanaal-label (In-app / E-mail / SMS / Push) + beschrijving onder de naam

## Cumulatief Phase 2 totaal

- **27 commits** in Phase 2 (Block 1 t/m 13)
- **8 nieuwe Supabase tabellen**: beleidsdocumenten, taken, teams, medewerker_teams, verlof_aanvragen, notification_types, audit_log, profile_notification_preferences
- **11 audit-trigger-coverage** + nieuwe 1 M2M
- **52 HTML-pages** synchroon (canonical topbar + notification-bell)
- **3 nieuwe UI-modules**: notification-bell, audit detail modal, home polish

## Wat ontbreekt nog uit Block 12

### User-action (geen code-werk meer)

- ~~**Voornaam invullen**~~ → tab `Mijn profiel` → opslaan. Nudge op home wijst nu actief naar Instellingen.
- **10 ontbrekende beleidsdocument volgnummers** via beleid.html UI
- **PDF-uploads** voor de 15 bestaande beleidsdocumenten

### Volgende sessie / Phase 3

- BS2 → BS1 data-port van transactie-data (clienten, beschikkingen, facturen, planning, verzuim) — geblokkeerd op safety-policy zonder additionele user-permission grants.
- Zie `docs/phase3/03-blokkades.md` voor status en alternatieve workflow.
