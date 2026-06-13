# Item 55 — Sprint 13: CI integratie op release-tag (E2E auto-run)

**Datum**: 2026-05-13
**Status**: 🟡 In review (PR open)
**Master-plan**: S13 in `../v2-master-plan.md`
**Gerelateerd**: items 41 (E2E skelet), S11 (auth-setup), S12 (regression specs)

## Wat is gedaan

Bestaande `.github/workflows/ci.yml` valideert JS-syntax + script-order + secrets-scan op elke PR/push. Maar E2E tests draaien (nog) **niet** automatisch — om Chromium install + lange runtime te vermijden.

**S13** voegt nieuwe `.github/workflows/e2e.yml` toe die E2E **alleen draait op release-tag**.

### Trigger-pattern

```yaml
on:
  push:
    tags:
      - "v*"
      - "bs1-v*"
      - "release-*"
  workflow_dispatch: # ook handmatig vanuit Actions tab
```

Bij elke release-tag push (`git tag v2.0.0 && git push --tags`) draait de volledige E2E-suite tegen production.

### Job

- `actions/checkout@v4`
- `actions/setup-node@v4` met node 20 + npm cache
- `npm ci`
- `npx playwright install --with-deps chromium` (~120MB, eenmalig per run)
- `npm run test:e2e` met `FF_BASE_URL=https://futureflow-app.vercel.app` (default)
- Upload `playwright-report/` artifact (30 dagen retention)
- Upload `test-results/` artifact bij failure (screenshots + videos voor debug)

### Secrets (optioneel)

Authenticated tests (S11/S12) skippen graceful zonder secrets. Voor volledige coverage:

1. Open <https://github.com/twovex9/twovex9/settings/secrets/actions>
2. Add 2 secrets:
   - `FF_E2E_EMAIL` = test-user email
   - `FF_E2E_PASSWORD` = test-user wachtwoord
3. Bij volgende release-tag draait full suite incl. 8+ authenticated tests

### Manual trigger

Vanuit GitHub Actions tab > E2E workflow > "Run workflow" met optionele `base_url` override (Vercel preview URL bv).

## Test plan (PR-merge)

- [ ] CI bestaande workflow blijft groen
- [ ] Nieuwe `e2e.yml` syntax-valid (GH Actions yaml linter)
- [ ] Eerste echte trigger: bij eerstvolgende `release-*` tag push

## Acceptance (master-plan S13)

- ✅ GitHub Actions workflow op tag-push
- ✅ Playwright install + run met cache
- ✅ Test-report artifacts geüpload
- ✅ Secrets-vriendelijk (skip graceful zonder credentials)

## Status update bij merge

Bij merge: master-plan S13 → ✅ DONE + PR-nummer. Direct start Sprint 14 (GDPR retention-policy + DSR flow, 4u).
