# BESA Suite — BS1 (vanilla HTML/JS + Supabase)

In-house herbouw van BESA-suite 2 in eigen vanilla web-stack, gehost op Vercel met Supabase als backend.

**Live**: <https://besa-suite.vercel.app>

## Wat zit hier in

Dit is **BS1** — eigen ontwikkeling die feature-parity heeft met BS2 (`https://etf.acceptance.besasuite.nl`) qua data en functionaliteit, maar met:
- Eigen vanilla HTML/CSS/JS frontend (geen framework)
- Eigen Supabase Postgres + Storage backend
- Eigen huisstijl + UX-keuzes
- Auto-deploy via Vercel bij push naar `main`

## Tech stack

- **Frontend**: vanilla HTML/CSS/JS — `index.html` is stijl-bron, design tokens in `:root` in `styles.css`
- **Backend**: Supabase (project `boscwvojcggkbdxhlfys`)
- **Auth**: Supabase Auth (`auth-guard.js` op elke pagina)
- **Storage**: Supabase Storage buckets (`client-documents`, `medewerker-documenten`)
- **Deploy**: Vercel (GitHub `main` → auto-deploy)

## Project structuur

```
besa-suite-etf/
├── *.html                  35 pagina's (medewerkers, cliënten, beschikkingen, etc.)
├── *.js                    page-scripts + data-lagen (*-data.js)
├── styles.css              alle styling met design-tokens
├── supabase/
│   └── schema.sql          DB-schema (uitbreiden via apply_migration, niet overschrijven)
├── docs/
│   ├── bs2-inventaris.md   Phase 1: BS2 globale inventaris
│   ├── bs2-sections/       Phase 1: per-sectie screenshots/DOM
│   ├── phase2/             Phase 2: BS2 → BS1 feature-port (6 modules + 4 follow-ups)
│   ├── phase3/             Phase 3: data-port (5092 records via service_role script)
│   └── phase4/             Phase 4: parity finalization (FK-resolves, dedup, normalisatie)
├── scripts/
│   ├── bs2-full-import.mjs       Idempotente BS2 → BS1 data port
│   ├── bs2-fk-resolve.mjs        FK's via naam-match (incidenten cliënt/locatie/melder)
│   ├── bs2-csv-import.mjs        Generic CSV → SQL helper
│   ├── bs2-import-master.mjs     Master-data SQL helper
│   └── bs2-exports/              Bearer-token JSON exports (gitignored)
├── CLAUDE.md               Project-instructies + werkwijze-regels voor Claude
└── .claude/
    ├── huisstijl.md        Stijl-regels (component-classes, tokens)
    └── werkpatronen.md     Data-laag patronen + schema-conventies
```

## Quickstart voor ontwikkelaar (of nieuwe Claude-sessie)

### 1. Eerste keer setup

```powershell
git clone https://github.com/ETFalkmaar/besa-suite-.git
cd besa-suite-/besa-suite-etf

# Verifieer alle tools aanwezig (~10 sec)
pwsh -ExecutionPolicy Bypass -File scripts\setup-machine.ps1
```

Het setup-script checkt git/node/npm/gh, git config, GitHub auth en remote URL. Geen install nodig voor app zelf (vanilla — `npm install` is alleen relevant voor build-script tijdens Vercel deploy). Open `index.html` lokaal of via Vercel-preview.

### 2. Lokaal draaien

```powershell
# Optie A: simpel statische server
python -m http.server 8000
# Browse naar localhost:8000

# Optie B: gewoon openen in browser
start index.html
```

Supabase config is hardcoded in `supabase-client.js` (anon key — public, RLS beschermt).

### 3. Wijzigingen maken

1. Volg `CLAUDE.md` + `.claude/huisstijl.md` + `.claude/werkpatronen.md`
2. `git add` + `git commit` + `git push origin main` (Vercel deploy automatisch)
3. Verifie via Chrome op `https://besa-suite.vercel.app/<page>.html`

### 4. Database wijzigingen

```sql
-- Via Supabase Studio: https://supabase.com/dashboard/project/boscwvojcggkbdxhlfys/sql/new
-- OF via Supabase MCP (Claude): mcp__supabase__apply_migration / execute_sql
-- NOOIT supabase/schema.sql overschrijven — alleen uitbreiden via migrations
```

## Documentatie & roadmap

| Doc | Waarvoor |
|---|---|
| `CLAUDE.md` | Auto-geladen project-regels (huisstijl + werkpatronen imports) |
| `docs/bs2-inventaris.md` | Phase 1 — BS2 sitemap |
| `docs/phase2/*.md` | Phase 2 — BS2 features in BS1 nagebouwd (Block 1-13) |
| `docs/phase3/*.md` | Phase 3 — 5092 records geport via service_role script |
| `docs/phase4/00-plan.md` | Phase 4 — canonical 6-fase plan |
| `docs/phase4/03-eindstatus.md` | Phase 4 — eindcijfers per tabel |
| `docs/phase4/04-open-items.md` | **Open items / toekomstig werk** (lees bij elke sessie) |
| `docs/phase4/05-toolchain-recovery.md` | **Recovery doc** voor nieuwe sessie van nul |
| `docs/phase4/06-professional-finish.md` | Roadmap voor v2 (22 items, 6 prioriteiten) |
| `docs/phase4/07-backup-strategie.md` | Disaster recovery — wat backuppen, hoe restoren |
| `docs/phase4/08-performance-benchmarks.md` | Baseline page-load timings (her-meten elke 6 mnd) |

## BS2 → BS1 data sync (toekomstig)

Wanneer nieuwe BS2-data nodig is, zie `docs/phase4/05-toolchain-recovery.md` sectie "BS2 → BS1 data refresh workflow" (8 stappen, ~10 min inclusief Bearer-token).

## Eindstand (na Phase 4)

| Tabel | Actief records |
|---|---:|
| medewerkers | 102 |
| clienten | 92 |
| beschikkingen | 251 |
| facturen | 990 |
| planning | 4461 |
| incidenten | 144 |
| verzuim | 14 |
| locaties | 9 |
| gemeenten | 238 |
| organisaties | 90 |
| opleidingen | 70 |
| incident_categorieen | 13 |

Plus ~96+69+13 archived records (BS2 duplicaten + test-data, reverseerbaar via "Herstel"-knop).

## Werkwijze voor Claude-sessies

Auto-geladen via `CLAUDE.md`:
- Lange autonome werkblokken (min 2-3 uur)
- Zelf verifiëren via Chrome MCP (niet user vragen)
- Destructieve acties altijd user-confirm
- "Voor toekomst" items → automatisch in `docs/phase4/04-open-items.md`
- Bij elke sessie eerst: `CLAUDE.md` + `04-open-items.md` lezen

## Licentie & gebruik

Intern ETF project. Niet voor externe distributie. Service_role key NOOIT in repo.

## Vragen

Zie `docs/phase4/05-toolchain-recovery.md` voor "hoe werkt dit" + "bekende mysteries" + "ops procedures".
