# v3 Fase I — Pre-cut-over cleanup — STATUS

**Status**: ✅ deliverables klaar, runtime-actie wacht op cut-over-datum (user kiest dag).

---

## Deliverables

### 1. Cleanup-script — `scripts/pre-launch-cleanup.mjs` ✅

Idempotent script dat alle test-residuals verwijdert uit productie-DB:

- **Auth users** met email `%claude-test%` / `%zzz-claude%` / `%@example.com`
- **Public records** met id-prefix `ZZZ-CLAUDE-TEST` in tabellen: medewerkers / clienten / beschikkingen / facturen / planning
- **Audit-log** entries van test-acties (`gebruiker_label='Test Medewerker'` of details bevat `ZZZ-Claude`)
- **Sanity-counts** voor actieve profiles + medewerkers

**Modus**:
- Default `--dry-run`: alleen tellen, geen wijzigingen
- `--live`: daadwerkelijk verwijderen (irreversibel)

**Vereist**: `SUPABASE_SERVICE_ROLE_KEY` env-var.

**Pre-flight check** (al uitgevoerd 2026-05-15): productie DB is **al schoon** (0 ZZZ-CLAUDE-TEST records). Cleanup-script bestaat als safety-net voor cut-over-dag.

### 2. Go-live mass-mail template — `docs/handleidingen/go-live-mail-template.md` ✅

Tekst-document met:
- Onderwerp-regel
- Body voor introductie-mail (login-URL, tijdelijk wachtwoord, 2FA-setup-uitleg, helpdesk-contact)
- Optionele 1-dag-voor reminder-mail

**Belangrijk**: gebruiker kopieert deze tekst in zijn EIGEN mail-client (Outlook/Gmail) en verstuurt. BS1 verstuurt zelf geen mails (user-keuzes #18, #25, #32).

### 3. Finale BS2 → BS1 sync — bestaande tooling

Geen nieuwe script nodig. Op cut-over-dag, ~0-2u vóór go-live, run:

```powershell
$env:SUPABASE_SERVICE_ROLE_KEY = '<service-role-key>'
node scripts/bs2-full-import.mjs   # bestaand v2-data-port script
```

Hierdoor blijft BS1 data ≥ BS2 data tot het moment dat we overschakelen.

---

## Pre-cut-over checklist (door admin op cut-over-dag)

1. **0-2u voor go-live**:
   - [ ] `node scripts/bs2-full-import.mjs` — finale BS2-data sync
   - [ ] `node scripts/pre-launch-cleanup.mjs --dry-run` — verifieer 0 test-residuals
   - [ ] Indien wel test-residuals: `node scripts/pre-launch-cleanup.mjs --live`

2. **Smoke-test (15min vóór go-live)**:
   - [ ] Login `https://futureflow-app.vercel.app` als Eigenaar/Admin/Directeur
   - [ ] 2FA-challenge ✓
   - [ ] Visit `/gebruikers.html` → zie alle 100 medewerkers
   - [ ] Visit `/home.html` → "Welkom, [Naam]" + 15 nieuws cards
   - [ ] Visit `/clienten.html` → cliënten zichtbaar
   - [ ] Visit `/facturen.html` → recente facturen
   - [ ] Console errors check → 0
   - [ ] Logout

3. **Go-live moment**:
   - [ ] Verstuur mass-mail uit `docs/handleidingen/go-live-mail-template.md` via je eigen mail-client
   - [ ] Monitor `/audit.html` (User-management filter) — login-activity volgt
   - [ ] Eerste 24u: stand-by voor reset-password / reset-2fa support

4. **Dag-1 post-launch**:
   - [ ] Aantal succesvolle logins via Supabase Studio (`auth.users` `last_sign_in_at` count)
   - [ ] Aantal 2FA-enrolled (`SELECT COUNT(*) FROM auth.mfa_factors WHERE status='verified'`)
   - [ ] Aantal nog-niet-onboarded (`SELECT COUNT(*) FROM profiles WHERE must_setup_2fa = true`)

---

## Status per user-keuze

| # | User-keuze | Status |
|---|---|---|
| 31 | Cleanup-script vlak vóór cut-over | ✅ script klaar |
| 32 | Go-live mass-mail template (user verstuurt zelf) | ✅ template klaar |
| 18 | Geen e-mails ooit | ✅ |
| 28a | Supabase Pro backups | ✅ Fase 0 |

---

## Volgende stap

→ **Fase H — 4-pass eindverificatie** (laatste fase voor 99-v3-eindrapport).
