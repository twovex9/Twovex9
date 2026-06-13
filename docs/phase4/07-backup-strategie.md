# Phase 4 — 07: Backup-strategie

**Datum**: 2026-05-12
**Doel**: gestructureerde aanpak voor disaster recovery van BS1 — wat te backuppen, hoe, en hoe je herstelt. Voltooit item 4.4 uit `06-professional-finish.md`.

## Onderdelen die backup nodig hebben

| Onderdeel | Locatie | Inhoud | Reden voor backup |
|---|---|---|---|
| **Supabase Postgres** | project `ukjflilnhigozfoxowmj` | 38+ tabellen, 5092+ records incl. medewerkers/cliënten/beschikkingen/facturen/planning | bedrijfskritisch — verlies = onherstelbaar werkverlies |
| **Supabase Storage** | buckets `client-documents`, `medewerker-documenten` | PDF's, scans, bestanden gekoppeld aan parent-records via `storage_path` | bedrijfskritisch — bestanden zijn niet reproduceerbaar |
| **Supabase auth.users** | (deel van project) | gebruikersaccounts + sessies | bedrijfskritisch — login-toegang verlies |
| **Supabase migrations** | `supabase/schema.sql` + applied migrations log | DB-structuur, RLS-policies, triggers | herbouwbaar uit code, maar tijd-intensief |
| **GitHub repo** | `twovex9/twovex9` | source code | gerepliceerd door git zelf — laag risico |
| **Vercel config** | `vercel.json` + env vars in dashboard | deploy-config, env-vars | herbouwbaar — laag risico |

## Backup-strategieën per onderdeel

### 1. Supabase Postgres — Automatische daily backups

Supabase doet automatisch dagelijkse PITR-backups (Point-In-Time Recovery) op Pro+ plans. Free tier heeft 7-daagse retention voor logical backups.

**Verifieer**:
1. Open `https://supabase.com/dashboard/project/ukjflilnhigozfoxowmj/database/backups`
2. Bevestig retention-window (7 dagen voor Free, 14-30 dagen voor Pro+)
3. Check de meest recente backup-datum

**Manuele restore**:
- Via Supabase Dashboard → Database → Backups → kies datum → "Restore"
- ⚠️ Restore overschrijft de hele DB — gebruik alleen bij echte ramp

**Aanbeveling**: upgrade naar Supabase Pro ($25/mnd) voor:
- 14-daagse PITR
- Custom backup-schedules
- Faster restore times

### 2. Supabase Postgres — Manuele export (off-site backup)

Voor extra zekerheid: maandelijkse manuele export naar lokale schijf of S3/Google Drive.

**Methode A: `pg_dump` via Supabase Connection String**

```powershell
# Haal Connection String uit dashboard:
# https://supabase.com/dashboard/project/ukjflilnhigozfoxowmj/settings/database
# Sectie "Connection string" — gebruik "URI" met password

$env:PGPASSWORD = "<DB_PASSWORD>"
pg_dump "postgresql://postgres.ukjflilnhigozfoxowmj:[password]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres" `
  --schema=public --no-owner --no-acl `
  > "C:\backups\Future Flow-$(Get-Date -Format 'yyyyMMdd').sql"
$env:PGPASSWORD = $null  # opruimen
```

**Methode B: Node script via service_role (read-only export)**

`scripts/export-supabase.mjs` (to create, geen prioriteit):
- Loop door alle tabellen via `SELECT *`
- Schrijf naar JSON per tabel
- Compress to ZIP
- Upload to external location

**Aanbeveling**: methode A is robuuster (incl. schema, indexes, triggers). Run maandelijks via een geplande PowerShell-taak.

### 3. Supabase Storage — Buckets

Supabase backupt Storage-bestanden **niet** automatisch (alleen DB). Manuele backup vereist.

**Methode: Node script met Supabase JS-client**

```javascript
// scripts/backup-storage.mjs (te bouwen indien nodig)
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(URL, SERVICE_KEY);
const buckets = ['client-documents', 'medewerker-documenten'];

for (const bucket of buckets) {
  const { data: files } = await supabase.storage.from(bucket).list('', { limit: 10000 });
  for (const f of files) {
    const { data } = await supabase.storage.from(bucket).download(f.name);
    // schrijf naar disk: C:\backups\storage\<bucket>\<filename>
  }
}
```

**Volume-schatting**: bij 92 cliënten × ~5 docs gem. = 460 files, bij ~500KB/file = ~230MB. Klein. Wekelijks of maandelijks runnen volstaat.

### 4. Auth.users (Supabase Auth)

Auth-tabellen zijn meegenomen in Supabase's automatische backup. Voor extra veiligheid:
- Exporteer user-emails periodiek via Dashboard → Authentication → Users → CSV export
- Bewaar lokaal voor recovery scenario waarin alleen emails nodig zijn (passwords worden niet geëxporteerd — users moeten opnieuw password-reset doen na restore)

### 5. Schema + migrations

- `supabase/schema.sql` is in git → automatisch geback-upt via GitHub
- Migrations via `mcp__supabase__apply_migration` worden gelogd in `public.supabase_migrations` of equivalent
- Run periodiek: `SELECT version, name, statements FROM supabase_migrations.schema_migrations ORDER BY version;` om de history vast te leggen

## Restore-scenarios

### Scenario A: Eén tabel corrupt / verkeerd UPDATE'd

**Recovery**:
1. Identificeer welke records weg/fout zijn
2. Via Supabase Dashboard → Database → Backups → PITR naar tijdstip vóór corruptie
3. Selectief restore via SQL: `INSERT INTO target SELECT * FROM backup_table WHERE id IN (...) ON CONFLICT DO UPDATE`
4. NOOIT volledige restore voor 1 tabel-issue — risico op andere data-verlies

### Scenario B: Hele database verloren / gerooten

**Recovery**:
1. Nieuw Supabase project aanmaken (of bestaand resetten)
2. `supabase/schema.sql` toepassen via SQL Editor
3. Latest PITR-backup restoren via Dashboard
4. Storage handmatig terugzetten via Node script (omgekeerde van backup)
5. App update: hardcoded `SUPABASE_URL` in `supabase-client.js` aanpassen naar nieuw project
6. Vercel env vars updaten + redeploy

**Verwachte downtime**: 2-4 uur bij goed-voorbereid herstel; 1-2 dagen bij ad-hoc paniekherstel.

### Scenario C: Vercel deployment kapot

**Recovery**: laag-risico — code staat op GitHub.
1. Roll back via Vercel Dashboard → Deployments → klik op vorige stabiele deploy → "Promote to production"
2. Of: git revert + push → nieuwe deploy

## Hoe vaak doen we wat?

| Actie | Frequentie | Wie |
|---|---|---|
| PITR backup (auto) | Dagelijks | Supabase (automatisch) |
| Manuele pg_dump | Maandelijks | Admin via PowerShell-taak |
| Storage-export | Maandelijks | Admin via Node script |
| Verifieer restore-procedure | Halfjaarlijks | Admin — test op staging Supabase project |
| Update dit document | Bij elke infra-wijziging | Engineer die de wijziging maakt |

## Test-restore (dry-run protocol)

Eens per 6 maanden:
1. Maak nieuw Supabase staging-project
2. Restore latest PITR backup naar staging
3. Verifieer counts: medewerkers, clienten, beschikkingen, facturen — moeten overeenkomen met productie
4. Verifieer 1 storage-file kan worden opgehaald uit staging-bucket
5. Documenteer eventuele issues in `04-open-items.md`
6. Cleanup: delete staging-project

## Aanbevelingen

**Direct te doen** (eenmalig, 30 min):
1. Verifieer Supabase backup-retention via dashboard
2. Maak een first manuele `pg_dump` om de procedure te valideren
3. Bewaar Connection String + DB password in passwordmanager (1Password/Bitwarden/etc.) — NIET in repo

**Voor v2** (medium effort):
1. Schrijf `scripts/backup-storage.mjs` — automatiseert Storage backup
2. Schrijf `scripts/export-supabase.mjs` — JSON-export per tabel als secondary backup
3. Geplande Windows-taak die maandelijks runt en backup naar OneDrive zet

**Niet doen**:
- ❌ Backups naar dezelfde Supabase project (single point of failure)
- ❌ Backups committen naar repo (database dumps zijn groot + bevatten PII)
- ❌ Verlaten op uitsluitend Supabase auto-backup — Pro-tier features kunnen wijzigen, off-site copy is essentieel
