# [Module-naam] — BS1 PARITY-CHECK

**Gescraped op**: YYYY-MM-DD
**BS1-URL getest**: `https://besa-suite.vercel.app/<page>.html`
**Test-account**: `<email>` (admin-tier)
**BS2-equivalent**: `https://etf.acceptance.besasuite.nl/<route>`

## BS1 codebase-componenten

| Type | Bestand(en) | Doel |
|---|---|---|
| Page | `<page>.html` | ... |
| Page-script | `<page>.js` | ... |
| Data-laag | `<naam>-data.js` | `window.<naam>DB` |
| Auth | `auth-guard.js` | Session-check |

## Supabase-tabellen relevant voor deze module

| Tabel | Status | Cols | Doel |
|---|---|---|---|
| `public.<tabel>` | ✅ Bestaat / ❌ MISSING | N | ... |

## Live BS1 Chrome MCP test resultaten (YYYY-MM-DD)

| Test | Resultaat |
|---|---|
| Navigate `<page>.html` | ✅/🟡/❌ |
| ... | ... |
| Console errors | ✅ 0 errors / ❌ N errors |

## Per BS2-actie systematische parity-vergelijking

| BS2-actie (uit `behaviors.md`) | BS1-status | BS1-locatie | Gap | Categorie |
|---|---|---|---|---|
| **Actie 1: ...** | ✅ Match / 🟡 Partial / ❌ Missing / ❓ Niet getest | `<bestand>:line` | ... | Schema/UI/Behavior/Audit/Real-time/Validation-gap |

## Schema-gaps in detail

```sql
-- VEREIST voor BS2-parity (Fase E.1 migrations):
create table if not exists public.<naam> (
  id uuid primary key default gen_random_uuid(),
  ...
);
```

## Gap-categorieën samengevat

| Categorie | Count |
|---|---|
| ✅ Match | N |
| 🟡 Partial | N |
| ❌ Missing | N |
| ❓ Niet getest | N |
| **Total** | N |

## Fase E-prioritering (gap-fix-PR plan)

**P1 (kritiek voor productie-launch)**:
1. ...

**P2 (belangrijk)**:
1. ...

**P3 (kan na go-live)**:
1. ...

## Eindconclusie

**Module XX parity-status**: **~N% bereikt**.

**Werkende kernfunctionaliteit**: ...

**Gaps**: ...

**Volgende stappen**: ...
