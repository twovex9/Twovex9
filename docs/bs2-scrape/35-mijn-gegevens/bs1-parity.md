# Module 35 — Mijn-gegevens — BS1 PARITY

## Concept-verschil

BS2 en BS1 hebben **andere concepts** voor "Mijn gegevens":
- BS2 `/account` = profile-edit (voornaam/achternaam/email/telefoon + Save) + Active sessions
- BS1 `/mijn-gegevens.html` = **GDPR Art. 15 inzage** + retention-policies + JSON-export

Profile-edit in BS1 zit elders (`instellingen.html` → Mijn profiel-tab, Module 32 scope).

## Feature pariteit-matrix

| Feature | BS2 | BS1 | Status |
|---|---|---|---|
| Profile-edit (voornaam/achternaam/email/telefoon) | ✅ | ❌ (zit in Instellingen) | functioneel ✅ via andere route |
| Avatar + naam-heading | ✅ | h1 "Mijn gegevens" | functioneel ✅ |
| Save-button profile | ✅ | ❌ (in Instellingen) | functioneel ✅ |
| Actieve sessies lijst | ✅ | ❌ | v3-deferred Fase G |
| Uitloggen op alle andere apparaten | ✅ | ❌ | v3-deferred Fase G |
| GDPR inzage (Art. 15) | ❌ | ✅ 12-stat overview | BS1+ |
| Download JSON (Art. 20) | ❌ | ✅ | BS1+ |
| AVG-rechten uitleg (5 artikelen) | ❌ | ✅ | BS1+ |
| Retention-policies | ❌ | ✅ 5 policies | BS1+ |
| Vernieuwen-button | ❌ | ✅ | BS1+ |
| Minimalist topbar (GDPR focus) | n.v.t. | ✅ Home + Mijn gegevens only | BS1 design |
| Console errors | 0 | 0 | ✅ |

## BS1 superset features (compleet andere richting)

BS1 mijn-gegevens.html is **niet** een BS2-mirror maar een **GDPR-compliance pagina** met:
1. **AVG Art. 15 inzage** — wat staat er over je in BS2. **AVG Art. 20 portability** — JSON-download van eigen data
3. **AVG-rechten uitleg** — 5 rights (Art. 15/16/17/20/21)
4. **Retention-policies** — 5 bewaartermijnen + `gdpr_retention_run_v1()`
5. **Vernieuwen** — refresh data + GEËXPORTEERD OP timestamp

## Bug gefixt

### Bug #69 (UI) — Topbar self-reference

**Probleem**: `mijn-gegevens.html` regel 24:
```html
<a href="instellingen.html" class="top-link is-active">Mijn gegevens</a>
```
Link "Mijn gegevens" wees naar `instellingen.html` — wanneer user clickte op de "Mijn gegevens"-link terwijl al op mijn-gegevens.html, ging hij ongewenst naar Instellingen. Inconsistent met andere BS1 topbars die self-reference gebruiken voor `is-active`-pagina.

**Fix**: `href="instellingen.html"` → `href="mijn-gegevens.html"` (self-reference).

## v3 deferred items (Fase G)

- **Active sessions tab** — BS2 toont devices+IP+last-active; vereist `supabase.auth.admin.listUserSessions()` of similar
- **"Uitloggen op alle andere apparaten"** — vereist Supabase Auth `signOut(scope='others')`
- **Profile-edit consolidatie** — overweeg of mijn-gegevens.html ook profile-edit moet bevatten (consistency met BS2 /account), of Mijn profiel-tab volstaat

## Conclusie

Module 35 is **geen 1-op-1 mirror** maar een doelbewust verschillende pagina (GDPR-focus ipv profile-edit). BS1 ENRICHT met AVG-compliance features die BS2 niet heeft. Bug #69 fix maakt topbar-navigation consistent.
