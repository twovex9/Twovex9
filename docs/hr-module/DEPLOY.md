# HR-module — deploy & DDL-route (G59)

Beknopte operationele referentie voor deze codebase. Vult `CLAUDE.md` aan.

## Canonieke productie-URL's
- **Web (desktop):** `https://futureflow-etf.vercel.app` — deployt vanaf **`ETFalkmaar/besa-suite-`** branch `main` (remote `etf`). NIET `twovex9/Twovex9` (dood).
- **Mobiel (PWA):** `https://future-flow-mobile.vercel.app` — deployt vanaf **`twovex9/future-flow-mobile`** branch `main` (Vercel-project `besa-suite-mobile`). Let op: `besa-suite-mobile.vercel.app` deployt NIET van main.
- **Supabase (prod):** project `ukjflilnhigozfoxowmj`. ⚠️ De Supabase-MCP wijst naar een OUD project — niet gebruiken voor data/DDL.

## DDL / SQL op productie (zonder dashboard)
PostgREST/service-key kan geen DDL. Gebruik de Management-API via:

```bash
node scripts/db-exec.mjs "select count(*) from public.medewerkers;"     # losse query
node scripts/db-exec.mjs --file supabase/migrations/<bestand>.sql        # migratie
node scripts/db-exec.mjs --check                                         # toegangstest
```

Credential: `SUPABASE_ACCESS_TOKEN` (Management-API PAT) in `scripts/.env` (gitignored).
Migraties horen idempotent te zijn (`create or replace`, `drop policy if exists`, `if not exists`)
en in `supabase/migrations/` te staan.

### RLS testen per rol (impersonatie)
```bash
node scripts/db-exec.mjs "begin; set local role authenticated; \
  select set_config('request.jwt.claims','{\"sub\":\"<auth-uid>\",\"role\":\"authenticated\"}', true); \
  select count(*) from public.<tabel>; rollback;"
```
qa-uids: medewerker `9a04354d-…`, hr `9930455d-…`, eigenaar `4fd38491-…`, directeur `515d2a1a-…`.

## Web-deploy (ETFalkmaar)
`gh` = ETFalkmaar (heeft rechten op besa-suite-):
```bash
git fetch etf && git switch -C feature/<naam> etf/main
# … wijzigen + committen …
git push -u etf feature/<naam>
gh pr create -R ETFalkmaar/besa-suite- --base main --head feature/<naam> --title "…" --body "…"
gh pr merge <N> -R ETFalkmaar/besa-suite- --merge --delete-branch
```
De build **auto-verviest alle `?v=`-assetquery's naar de commit-short-hash** — handmatige cache-bust-bumps zijn overbodig.

## Mobiel-deploy (twovex9, ETFalkmaar heeft GEEN rechten)
`gh`/`git push` defaulten naar de ETFalkmaar-token (403). Forceer de GCM-manager-helper
die het twovex9-token bevat:
```bash
git -c credential.https://github.com.helper= -c credential.https://github.com.helper=manager push -u origin feature/<naam>
TOKEN=$(printf 'protocol=https\nhost=github.com\nusername=twovex9\n\n' | \
  git -c credential.https://github.com.helper= -c credential.https://github.com.helper=manager credential fill | sed -n 's/^password=//p')
GH_TOKEN="$TOKEN" gh pr create -R twovex9/future-flow-mobile --base main --head feature/<naam> --title "…" --body "…"
GH_TOKEN="$TOKEN" gh pr merge <N> -R twovex9/future-flow-mobile --merge --delete-branch
```

## Edge functions (nog niet geautomatiseerd — G58)
Er is nog geen `scripts/deploy-functions.mjs`. Edge-functies (bv. `salarisexport-mail`,
`onboarding-upload`) deployen vergt de Supabase CLI of de Management-API + functiebundel
+ SMTP-secrets. Tot dat script er is, blijven edge-afhankelijke features (auto-mail bij
Loket-export, onboarding-upload doc-types) open. Zie `PLAN.md` G7/G13/G30/G58.
