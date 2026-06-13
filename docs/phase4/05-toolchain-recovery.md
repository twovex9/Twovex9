# Phase 4 — 05: Toolchain & operations — recovery instructies

**Doel**: één doc dat een nieuwe Claude-sessie (of een mens die het project overneemt) **van nul** kan helpen om alle BS2 → BS1 operaties uit te voeren. Bewaart alle "hoe doe je dat?" instructies die anders verloren gaan bij chat-compactie.

## Project-overzicht

- **BS1 (target)**: vanilla HTML/JS app in `future-flow/`, hosted op Vercel: `https://futureflow-app.vercel.app`
- **BS1 Supabase**: project `ukjflilnhigozfoxowmj`, dashboard `https://supabase.com/dashboard/project/ukjflilnhigozfoxowmj`
- **BS2 (source)**: productie-demo, alleen UI: `https://etf.acceptance.besasuite.nl/home`, API: `https://api.etf.acceptance.besasuite.nl`
- **GitHub repo**: `https://github.com/twovex9/twovex9`
- **Local working dir**: `C:\Users\sonck\OneDrive\Desktop\ETF\Future Flow git clone\future-flow`

## Bij sessie-start — leesvolgorde

1. `future-flow/CLAUDE.md` (auto-geladen)
2. `future-flow/.claude/huisstijl.md` + `werkpatronen.md` (auto-geladen)
3. `future-flow/docs/phase4/00-plan.md` (canonical plan)
4. `future-flow/docs/phase4/03-eindstatus.md` (laatste eindstand)
5. `future-flow/docs/phase4/04-open-items.md` (toekomstig werk)
6. Memory `~/.claude/projects/.../memory/MEMORY.md` (index)
7. Memory `project_ff_phase4.md` + `feedback_ff_workflow.md`

## Permissions setup (eenmalig per machine)

Bestand: `future-flow/.claude/settings.local.json` (gitignored, per-user).

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": {
    "allow": [
      "Bash(git push:*)",
      "Bash(git push origin main:*)",
      "Bash(git add:*)",
      "Bash(git commit:*)",
      "Bash(git status)",
      "Bash(git diff:*)",
      "Bash(git log:*)",
      "Bash(mkdir:*)",
      "Bash(rm:*)",
      "mcp__Claude_in_Chrome__javascript_tool",
      "mcp__Claude_in_Chrome__read_console_messages",
      "mcp__Claude_in_Chrome__read_network_requests",
      "mcp__Claude_in_Chrome__read_page",
      "mcp__Claude_in_Chrome__get_page_text",
      "mcp__Claude_in_Chrome__navigate",
      "mcp__Claude_in_Chrome__find",
      "mcp__Claude_in_Chrome__browser_batch",
      "mcp__Claude_in_Chrome__tabs_context_mcp",
      "mcp__Claude_in_Chrome__list_connected_browsers",
      "mcp__supabase__apply_migration",
      "mcp__supabase__execute_sql",
      "mcp__supabase__list_tables",
      "mcp__supabase__list_migrations",
      "mcp__supabase__get_logs",
      "mcp__supabase__get_advisors"
    ]
  }
}
```

Eenmalig via PowerShell aanmaken:

```powershell
$path = "C:\Users\sonck\OneDrive\Desktop\ETF\Future Flow git clone\future-flow\.claude\settings.local.json"
$json = @'
... (bovenstaande JSON) ...
'@
$json | Out-File -FilePath $path -Encoding utf8
```

Daarna Claude Code herstarten.

## BS2 → BS1 data refresh workflow

Wanneer nieuwe BS2 data moet worden geïmporteerd (toekomstige sync):

### Stap 1: Bearer-token uit BS2 DevTools (user-actie)

1. Open in Chrome: `https://etf.acceptance.besasuite.nl/home` (ingelogd)
2. F12 → tab **Network** → vink **Fetch/XHR** filter aan
3. Klik in BS2 op **HR → Medewerkers** (triggert API calls)
4. In Network-lijst: klik op een request naar `api.etf.acceptance.besasuite.nl/api/employees` of `/api/clients` etc. (NIET `.css`/`.js`!)
5. Rechts paneel: tab **Headers** → scroll naar **Request Headers**
6. Vind regel `authorization: Bearer eyJ...` (heel lange tekst)
7. Rechtsklik op de waarde → **Copy value** (kopieert hele "Bearer eyJ...")

### Stap 2: Run Bearer-token JS-snippet in BS2 Console

Plak in DevTools **Console**, vervang `PLAK_HIER` met gekopieerde Bearer-waarde:

```javascript
const RAW = `

PLAK_HIER

`;
(async () => {
  let token = RAW.replace(/\s+/g, '');
  if (token.toLowerCase().startsWith('bearer')) token = 'Bearer ' + token.substring(6);
  else token = 'Bearer ' + token;
  if (token.length < 100) { console.error('Token te kort'); return; }
  const AUTH = token;
  const BASE = 'https://api.etf.acceptance.besasuite.nl';
  const paths = [
    '/api/employees', '/api/clients', '/api/invoices', '/api/shifts',
    '/api/incidents', '/api/locations', '/api/competencies', '/api/certifications',
    '/api/municipalities', '/api/care-types', '/api/organizations', '/api/incident-categories',
    '/api/dispositions', '/api/agency', '/api/salary-scales',
  ];
  async function fetchAllPages(path) {
    const all = [];
    let page = 1;
    while (true) {
      const r = await fetch(`${BASE}${path}?page=${page}&per_page=200`, {
        headers: { 'Authorization': AUTH, 'Accept': 'application/json' },
      });
      if (!r.ok) {
        if (page === 1) return { _error: 'HTTP ' + r.status };
        break;
      }
      const json = await r.json();
      const items = Array.isArray(json) ? json : (json.data || []);
      all.push(...items);
      const lastPage = json.meta?.last_page;
      if (!lastPage || page >= lastPage) break;
      page++;
      if (page > 500) break;
    }
    return all;
  }
  const out = { exported_at: new Date().toISOString(), data: {} };
  for (const path of paths) {
    console.log('Fetching', path);
    const r = await fetchAllPages(path);
    out.data[path] = r;
    console.log('  ->', r._error ? r._error : `${r.length} records`);
  }
  const blob = new Blob([JSON.stringify(out, null, 2)], {type: 'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'bs2-export-full-' + Date.now() + '.json';
  a.click();
  console.log('Klaar!');
})();
```

Enter → bestand downloadt automatisch.

### Stap 3: Bestand plaatsen

Verplaats het bestand uit Downloads naar:
`C:\Users\sonck\OneDrive\Desktop\ETF\Future Flow git clone\future-flow\scripts\bs2-exports\bs2-export-full.json`

(overschrijft de oude — `.gitignore` blokkeert commit).

### Stap 4: Service_role key uit Supabase

1. Open `https://supabase.com/dashboard/project/ukjflilnhigozfoxowmj/settings/api`
2. Tab **"Legacy anon, service_role API keys"** OF onder "Project API keys"
3. Naast **`service_role secret`** → klik **"Reveal"**
4. Kopieer hele JWT

### Stap 5: Run import-scripts

PowerShell:

```powershell
cd "C:\Users\sonck\OneDrive\Desktop\ETF\Future Flow git clone\future-flow"
$env:SUPABASE_SERVICE_KEY = "PLAK_HIER_DE_SERVICE_ROLE_KEY"
node scripts/bs2-full-import.mjs
node scripts/bs2-fk-resolve.mjs
```

Beide scripts zijn **idempotent** — meerdere runs zonder data-verlies.

### Stap 6: Cleanup na refresh

Mogelijk needed (verifieer via Supabase MCP eerst):

```sql
-- Check op nieuwe dupes na refresh
SELECT 'medewerkers' AS t, LOWER(email), COUNT(*) FROM medewerkers WHERE archived=false GROUP BY LOWER(email) HAVING COUNT(*)>1
UNION ALL
SELECT 'clienten', LOWER(voornaam||'|'||achternaam), COUNT(*) FROM clienten WHERE archived=false
  GROUP BY LOWER(voornaam||'|'||achternaam) HAVING COUNT(*)>1;
```

Indien dupes: zie SQL-patroon in `docs/phase4/03-eindstatus.md` (medewerker/cliënt merge + archive).

### Stap 7: Live verificatie via Chrome MCP

Per persistente regel: Claude opent zelf BS1-pagina's via `mcp__Claude_in_Chrome__navigate`. Geen user-vraag.

```
futureflow-app.vercel.app/index.html       (medewerkers)
futureflow-app.vercel.app/clienten.html
futureflow-app.vercel.app/beschikkingen.html
futureflow-app.vercel.app/facturen.html
futureflow-app.vercel.app/planning.html
futureflow-app.vercel.app/incidenten.html
futureflow-app.vercel.app/verzuim.html
```

Hard refresh (`Ctrl+Shift+R`) na deploy om browser-cache te wissen.

## Belangrijke schema-feiten

| Tabel | PK type | Notes |
|---|---|---|
| `clienten`, `beschikkingen`, `facturen`, `planning`, `verzuim`, `organisaties`, `salarisschalen` | `text` | Legacy text-IDs |
| `medewerkers`, `competenties`, `opleidingen`, `locaties`, `bureaus`, `gemeenten`, `zorgsoorten`, `incidenten`, `nieuws` | `uuid` | `gen_random_uuid()` default |
| `profiles` | `uuid` | FK naar `auth.users` |

## Belangrijke check constraints

- `zorgsoorten.tarieftype` ∈ ('dag', 'uur', 'week')
- `beschikkingen.betalings_status` ∈ ('betaald', 'outstanding')
- `beschikkingen.tarief_eenheid` ∈ ('uur', 'dag', 'week')
- `incidenten.status` ∈ ('in_afwachting', 'in_behandeling', 'opgelost')
- `incidenten.tijdstip_van_dag` ∈ ('vroege_ochtend', 'ochtend', 'middag', 'late_middag', 'avond', 'nacht') OR NULL
- `incidenten.actor_type` ∈ ('alleen_client', 'client_naar_client', 'client_naar_medewerker', 'medewerker_naar_client', 'client_naar_overige') OR NULL

## Hard rules (gelden ALTIJD)

1. **Destructieve acties** (DELETE/DROP/TRUNCATE) → ALTIJD user-confirm
2. **Service_role key** alleen in env var, NOOIT in code/repo/chat
3. **Geen `--force` push** naar main
4. **Verzuim/medische data** is GDPR Art. 9 special category — alleen via expliciete user-flow (handmatige SQL in Supabase Studio óf via permissie-grant in scripts)
5. **ZELF verifiëren via Chrome MCP** — niet user vragen
6. **Voor toekomst items** → direct in `04-open-items.md` (zie meta-regel)

## Bekende mysteries

### Verzuim-records verdwenen tussen Phase 3 en Phase 4

**Symptoom**: na initiële succesvolle insert (user toonde Supabase Studio: total=14, bs2_count=9), waren bij Phase 4 verificatie 9 BS2-records weg (total=5).

**Oorzaak**: onbekend. Geen FK-cascade mogelijk (verzuim heeft alleen `medewerker text`, geen FK). Geen DROP/DELETE in commit-history. Mogelijk:
- Een trigger op `medewerkers` die archive-status checkt en `verzuim`-rijen verwijdert bij medewerker-archive
- Een rollback in Supabase Studio (auto-rollback bij sessie-disconnect?)
- User-actie tijdens niet-Claude moment

**Recovery**: opnieuw INSERT via `scripts/bs2-exports/verzuim-manual-insert.sql` of via Supabase MCP. Idempotent `ON CONFLICT (id) DO NOTHING`.

**Monitor**: bij toekomstige operaties, check `SELECT COUNT(*) FILTER (WHERE id LIKE 'bs2-verzuim-%') FROM verzuim;` — als < 9, opnieuw inserten.

## Eindcontact

Bij problemen of beslissing-punten:
- User instructie via Persona Memory (`feedback_ff_workflow.md`)
- Plan-doc (`docs/phase4/00-plan.md`) bevat 6-fase structuur
- Open-items (`docs/phase4/04-open-items.md`) bevat alle toekomstig werk
