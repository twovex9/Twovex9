# Future-Flow — Multi-tenant migratieplan

> Status: **ONTWERP / TER BESLISSING**. Niets in dit document is uitgevoerd op productie.
> Bron-DB: `ukjflilnhigozfoxowmj` (ETF). Opgesteld op basis van live schema-inspectie + `werkpatronen.md` §6a-bis.

---

## 0. Samenvatting & aanbeveling

**Aanbeveling: optie B — één Supabase-project per tenant — met een dunne gedeelde "control plane".**
Dat is technisch een lichte vorm van C (hybrid), maar de *data* leeft volledig geïsoleerd per tenant.

Waarom B en niet A (shared project + `tenant_id`-kolom overal):

| Factor | B (project-per-tenant) | A (shared + tenant_id) |
|---|---|---|
| **AVG / bijzondere persoonsgegevens** (zorg-data) | Fysieke isolatie. RLS-bug kan nooit data tussen zorgorganisaties lekken. | Eén fout in 45×4 policies = meldplichtige datalek. |
| **PK-conflict (`id text` op 15 tabellen)** | Bestaat niet — elke tenant-DB is eigen namespace. `id=123` in tenant A en B coëxisteren nooit. | Hard probleem: composite-PK of re-key naar UUID over álle FK's. |
| **Refactor bestaande app** | `supabase-client.js` 1× aanpassen (host→project-resolutie). 50+ data-lagen blijven ongewijzigd. | Elke data-laag, elke RLS-policy, elke edge-function, alle seed-scripts aanpassen. |
| **Storage / pg_cron / Realtime** | Per project al geïsoleerd → gratis goed. | Path-prefixing + storage-RLS + cron-loops per tenant. |
| **Backup / restore / data-residency / offboarding** | Per tenant (PITR, regio, "tenant weg = project weg"). | Alles gedeeld; offboarding = risicovolle bulk-delete. |
| **Bestaande ETF-data migreren** | **Nul** — het huidige project *wordt* tenant #1. | Backfill `tenant_id` op 20k+ audit-rijen, 12k diensten, 7k planning, … |
| **Doorlooptijd** | ~8–10 weken | ~16–24+ weken, veel hoger risico op live data |
| Nadeel | Schema-migraties + edge-deploys moeten naar N projecten "fan-outen" (CI). Cross-tenant rapportage vereist control plane. Per-project baseline-kost (~$25/mnd Pro). | "Eén plek", maar dat is precies het isolatie-risico. |

De doorslag: dit is **zorg-software met bijzondere persoonsgegevens**, het schema heeft **`id text`-PK's** (waardoor A een PK-hel wordt), en je beschreef de onboarding-deliverable zelf al als *"nieuw Supabase-project/seed"* — dat ís optie B.

**Wanneer kantelen naar volledig C?** Pas wanneer het aantal tenants te groot wordt om per-project te beheren/betalen (vuistregel **> ~50–100 tenants**). Dan: kleine tenants poolen (A-stijl, mét UUID-rekey) en grote/gevoelige tenants op eigen project houden. De control plane uit dit plan is daar al op voorbereid.

> De rest van dit document beschrijft **B als hoofdpad** en geeft de **A/C-bouwstenen** (`get_tenant_id()`, tenant-RLS, JWT-claim) als bijlage, zodat een latere kanteling naar C niet from-scratch hoeft.

---

## 0.1 Gekozen aanpak (na beslissingen, 2026-06-08)

| Beslissing | Keuze | Gevolg voor dit plan |
|---|---|---|
| **Hosting per tenant** | **Fork-per-tenant**: hele repo kopiëren → eigen GitHub-repo per bedrijf → Vercel auto-deploy → hardcoded eigen Supabase-project. | v1 heeft **geen** runtime-registry / wildcard-subdomein nodig. `supabase-client.js` blijft hardcoded per fork (zoals nu). |
| **Auth** | Losse login per tenant. | Eigen `auth.users` per project. Geen SSO/IdP. Niets extra nodig. |
| **Control plane** | Apart Supabase-project — **ontwerpen + ready zetten, NU niet bouwen** (eerst website af). | Control-plane + provisioning-automatisering = upscale-fase, niet v1. |
| **Schaal (12 mnd)** | Richting **honderden**. | ⚠️ Fork-per-tenant schaalt hier níét handmatig — zie waarschuwing hieronder. Automatisering wordt nu "ready" gezet. |

### ⚠️ De fork-paradox (eerlijk)

Fork-per-tenant is **ideaal voor de eerste ~5–10 tenants**: dood-simpel, maximale isolatie, nul nieuw bewegend deel. Maar het is **onhoudbaar richting honderden**, want elke kopie is een aparte codebase:

- Elke bugfix/feature → **N× opnieuw copy-pasten** naar alle forks.
- Elke schema-wijziging → **N× handmatig** op N databases draaien → gegarandeerde **schema-drift** (tenant 3 mist de migratie die tenant 47 wél heeft).
- Elke edge-function-update → **N× redeployen**.

**Daarom de strategie:**

1. **NU (v1, tot ~5–10 tenants):** fork-per-tenant. Eén ding voorbereiden zodat een fork *schoon* is: per-tenant Supabase-config in **één bestand** i.p.v. verspreid in code (zie §6.0). Forken = 1 bestand aanpassen.
2. **READY zetten (dit kwartaal, niet bouwen):** schema-template + seed-script + onboarding-checklist (§9.5) zodat een **verse Supabase-DB in minuten** staat i.p.v. uren handwerk — dat is nu al de echte bottleneck bij forken.
3. **BIJ UPSCALE (wanneer fork-count pijn doet, ~10+):** kantel van "N forks" naar **één gedeelde codebase + control plane + CI-fan-out** (§1.1, §11). Dán pas verdwijnt het copy-paste/drift-probleem. Het ontwerp staat klaar; het is een aanzet, geen herontwerp.

> Kort: **fork om te beginnen, maar reken erop dat je vóór tenant ~10–20 overstapt op de geautomatiseerde control-plane-aanpak.** Dit document houdt beide paden expliciet uit elkaar.

---

## 1. Architectuur

### 1.1 Datavlak — project per tenant (B)

```
                ┌─────────────────────────────────────────────┐
                │  CONTROL PLANE  (apart, klein Supabase-proj.) │
                │  tenants(slug, project_ref, url, anon_key,    │
                │          hostnames[], region, status, plan)   │
                │  → genereert build-time tenant-registry.json  │
                └───────────────┬─────────────────────────────┘
                                │ host → {url, anon_key}
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐      ┌───────────────┐      ┌───────────────┐
│ TENANT: etf   │      │ TENANT: acme  │      │ TENANT: ...   │
│ ukjflilnhi... │      │ <nieuw ref>   │      │ <nieuw ref>   │
│ 45 tabellen   │      │ zelfde schema │      │ zelfde schema │
│ auth.users    │      │ eigen users   │      │ eigen users   │
│ eigen storage │      │ eigen storage │      │ eigen storage │
│ eigen pg_cron │      │ eigen cron    │      │ eigen cron    │
│ eigen edge fn │      │ eigen edge fn │      │ eigen edge fn │
└───────────────┘      └───────────────┘      └───────────────┘
   (= huidig prod)        (geseed template)       (geseed template)
```

- **Isolatie = projectgrens.** Een tenant kan per definitie geen rij van een andere tenant zien; ze delen geen database, geen `auth.users`, geen storage-bucket.
- **ETF blijft exact wat het nu is** — alleen *geregistreerd* als tenant #1. Geen dataverhuizing.
- **Control plane** is de enige gedeelde component en bevat **géén** zorg-data, alleen tenant-metadata + publishable keys (veilig in de browser).

### 1.2 Waarom geen schema-per-tenant (variant op C)

Eén Postgres met een schema per tenant lost PK-conflicten ook op en kost maar één project, maar Supabase is sterk geoptimaliseerd rond `public` + RLS: PostgREST/`supabase-js` richten standaard op `public`, JWT-routing per schema is omslachtig, en edge-functions/cron/migraties moeten alsnog per schema fan-outen. Het levert zwakkere isolatie dan B tegen vergelijkbare operationele complexiteit. **Niet aanbevolen.**

---

## 2. PK-conflict-analyse

**Kern: in optie B verdwijnt het probleem volledig.** Elke tenant heeft een eigen database, dus `clienten.id = '123'` bij tenant A en `clienten.id = '123'` bij tenant B bestaan in twee fysiek gescheiden tabellen. Er is nooit een rij waarin beide samenkomen. Dit is de grootste enkele reden dat B hier dramatisch goedkoper is dan A.

De 15 `id text`-tabellen (live geverifieerd) waar dit zou spelen onder A:

`clienten`, `beschikkingen`, `facturen`, `organisaties`, `planning`, `comp_diensttypes`, `comp_feestdagen`, `verzuim`, `salarisschalen`, `saladmin_export_history`, `saladmin_ort`, `comp_saldi`, `uren_budget`, `urendeclaraties`, `medewerker_documenten`.

### Als je ooit tóch zou poolen (A/C) — de drie opties en hun verdict

| Optie | Wat | Verdict |
|---|---|---|
| **Composite PK** `primary key (tenant_id, id)` | Houdt `id text`, voegt tenant toe. | ❌ Breekt **elke** FK die naar enkel-koloms `id` verwijst → composite-FK overal. Massieve refactor. |
| **Re-key naar UUID** | `id text` → `uuid`, oude waarde naar `legacy_id text`. | ⚠️ Schoonste eindstand, maar raakt elke FK + elke data-laag die id's construeert/leest + alle import-scripts. Alleen doen bij echte pooling. |
| **Shard-prefix** `t<slug>_123` | Tenant in de string proppen. | ❌ Botst met bestaande id-formaten en breekt imports/joins. Niet doen. |

**Conclusie:** kies B en je hoeft hier niets aan te doen. Bewaar UUID-rekey als migratiepad *binnen* een toekomstige pool-tenant (C), niet als generieke vereiste.

> Eén nuance bij B: de **onboarding-seed** mag ETF's operationele id's níét naar een nieuwe tenant kopiëren. Een nieuwe tenant start met lege operationele tabellen en alleen geseede *referentie*-data (zie §5.2). Geen id-overlap omdat er geen gedeelde tabel is.

---

## 3. RLS-strategie

### 3.1 In optie B: `using(true)` mag blijven — en dat is correct

De huidige blanket-policy `... to authenticated using (true)` is in een project-per-tenant-model **niet onveilig**: de hele database hoort bij één tenant, dus "alle authenticated users mogen alle rijen" betekent "alle medewerkers van déze zorgorganisatie". Tenant-isolatie zit in de projectgrens, niet in de rij.

**Gevolg: we hoeven 45×4 ≈ 180 policies niet te herschrijven voor tenant-filtering.** De RLS-investering verschuift naar wat jullie tóch al gepland hadden (`werkpatronen.md` §6d-ter: *"rol-based fine-grained policies"*): medewerker ziet eigen rijen, admin-tier ziet alles. Dat is functionaliteit, geen isolatie.

### 3.2 `get_tenant_id()` — wel of niet?

Voor **isolatie in B: niet nodig.** Voor **defense-in-depth + voorbereiding op C: ja, dun.** We voegen een singleton `tenant_config` toe zodat de app/edge-functions/audit weten "welke tenant ben ik" (branding, audit-stempels, control-plane-aggregatie):

```sql
-- Per tenant-DB. Idempotent. Singleton (max 1 rij).
create table if not exists public.tenant_config (
  id          boolean primary key default true check (id),  -- dwingt 1 rij af
  tenant_slug text not null,
  tenant_naam text not null,
  region      text,
  branding    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create or replace function public.current_tenant_slug()
returns text language sql stable as $$
  select tenant_slug from public.tenant_config limit 1
$$;
grant execute on function public.current_tenant_slug() to authenticated, anon;
```

De volledige `public.get_tenant_id()` via `profiles.tenant_id` + JWT-claim die je noemt, is het **A/C-patroon** en staat in **bijlage A** — niet nodig voor B-isolatie, wél nodig zodra je echt pooled.

---

## 4. Data-migratie (ETF, 20k+ records, zonder verlies)

**De grote winst van B: ETF-data verhuist niet.** Het huidige project wordt tenant #1.

### 4.1 ETF "promoveren" tot tenant #1 (geen datamigratie)
1. `tenant_config`-rij toevoegen (`tenant_slug='etf'`).
2. ETF registreren in de control plane (project_ref, url, publishable key, hostnames).
3. Schema "bevriezen" als template-bron (§5).

Dat is alles. 20.116 audit-rijen, 12.403 diensten, 7.002 planning-rijen blijven staan waar ze staan.

### 4.2 Schema-template afleiden uit ETF — **eerst scratch opruimen**

Het live schema bevat ~40 vervuilende tabellen die **niet** in een template mogen:

- Backups: `_beschikkingen_oud_bak`, `_facturen_oud_bak`, `_incidenten_oud_bak`, `_*_bak_2026_*`, `_planning_bak_*` (5 stuks!), `_zzp_*_bak_*`, `_dedup_backup_medewerkers`, `_bak_mw_*`, `_main_employees_bad_bak_*`, …
- Import/recon-scratch: `_bs2_doc_status_import`, `_bs2_docs_recon`, `_bs2_docs_todo`, `_bs2_status_verify`, `_bs2_new_emp_import`, `bs2_dashboard_snapshot`, `bs2_uuid_map`.

→ Template = `pg_dump --schema-only` van ETF, daarna alle `^_` en scratch-tabellen strippen. Resultaat ≈ 45 echte domein-tabellen + functies + triggers + RLS + cron-definities.

### 4.3 Referentie- vs operationele data (wat seed je in een nieuwe tenant?)

| Categorie | Tabellen (voorbeeld) | Nieuwe tenant start met |
|---|---|---|
| **Universele referentie → SEED** | `gemeenten` (319), `salarisschalen` (12), `comp_feestdagen` (12), `notification_types` (8), `werkuren_labels` (6) | gevulde defaults |
| **Config/RBAC-template → SEED** | `bs2_roles` (15), `bs2_permissions` (146), `bs2_role_permissions` (818), `org_role_sections` (5), `org_roles` (14), `contract_sjablonen` (7), `helpdesk_settings`, `planning_settings`, `notification_types` | gevulde defaults |
| **Standaard-catalogus → SEED (tenant mag bewerken)** | `zorgsoorten` (8), `comp_diensttypes` (9), `opleidingen` (69), `incident_categorieen` (26), `beschikbaarheidstypes` | gevulde defaults |
| **Operationeel/tenant-eigen → LEEG** | `clienten`, `beschikkingen`, `facturen`, `planning`, `medewerkers`, `incidenten`, `verzuim`, `taken`, `werkuren`, `urenregistratie`, `dienst_activiteiten`, `audit_log`, `*_documenten`, `organisaties`, `locaties`, `bureaus` | leeg |

`bs2_role_users` (130 in ETF) = **leeg** bij nieuwe tenant; wordt gevuld bij het aanmaken van die tenant z'n eerste admin (§10.6).

---

## 5. Auth-scope

### 5.1 In optie B: JWT is automatisch tenant-scoped — géén custom claim nodig
Elke tenant-project heeft een eigen `auth.users` en geeft eigen JWT's uit. Een gebruiker hoort bij precies één tenant-project; zijn token is per definitie tenant-gebonden. **Geen `tenant_id`-claim nodig voor isolatie.**

- Gebruiker bij meerdere tenants (bijv. ETF-centraal personeel): aparte login per project (simpelst), of later één gedeelde IdP (SAML/third-party auth) die op elk project is geconfigureerd. Begin simpel: per-project auth.

### 5.2 A/C-pad (bijlage): `app_metadata` + access-token-hook
Zou je poolen, dan zet je tenant in **`app_metadata`** (server-gecontroleerd, **niet** `user_metadata` — dat is user-schrijfbaar) en injecteer je het in de JWT via een **Custom Access Token Hook**. `get_tenant_id()` leest dan `auth.jwt() -> 'app_metadata' ->> 'tenant_id'`. Volledige code in **bijlage A**. Beveiligingsregel: tenant_id **nooit** in `user_metadata`.

---

## 6. Frontend-impact (`supabase-client.js`)

### 6.0 v1 (fork-model): per-tenant config in ÉÉN bestand

In het fork-model wijst elke kopie hardcoded naar zijn eigen project — precies zoals ETF nu. De enige verbetering die forken schoon maakt: haal de twee per-tenant waarden uit `supabase-client.js` naar **één los configbestand**, zodat een fork = 1 bestand aanpassen (geen zoektocht door code, geen risico dat je de key ergens mist).

```js
// tenant-config.js  — het ENIGE bestand dat je per fork aanpast.
// Laden vóór supabase-client.js in elke HTML-pagina.
window.__BESA_TENANT__ = {
  slug:    "etf",                                   // wordt: "acme", "bedrijf-x", ...
  url:     "https://ukjflilnhigozfoxowmj.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIs...",               // publishable key van DIT project
};
```

```js
// supabase-client.js — leest de config, verder vrijwel ongewijzigd.
var T = window.__BESA_TENANT__ || {};
var SUPABASE_URL      = T.url;
var SUPABASE_ANON_KEY = T.anonKey;
// ...
var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { /* ... */ storageKey: "sb-besa-auth-" + (T.slug || "etf") },
});
window.besaTenant = { slug: T.slug || "etf" };       // voor UI-branding/audit
```

**Alle 50+ `*-data.js`-lagen blijven 1-op-1 ongewijzigd** — ze gebruiken `window.besaSupabase`, die nu naar de eigen tenant-DB wijst. Dit is de hele frontend-impact voor v1.

> De `storageKey` per slug voorkomt dat twee forks in dezelfde browser elkaars sessie overschrijven (relevant zodra jij als beheerder meerdere tenants in één browser bekijkt).

### 6.1 Upscale-pad: tenant-resolutie op hostname (gedeelde codebase, géén forks)
Vandaag is URL+anon-key hardcoded. We resolven ze per hostname uit een statische `tenant-registry.json` (gegenereerd uit de control plane). Omdat de client dan al naar de *eigen* tenant-DB wijst, hoeft **geen enkele query** een `.eq('tenant_id', …)` te krijgen. De 50+ `*-data.js`-lagen blijven 1-op-1 werken.

**Dual-mode**: onbekende host → fallback naar ETF's huidige hardcoded url/key. ETF blijft dus draaien, ook vóór de registry bestaat.

```js
// supabase-client.js — tenant-aware variant (B). Vervangt de hardcoded URL/KEY.
(function () {
  "use strict";

  // Fallback = huidige ETF-waarden → dual-mode, ETF blijft werken zonder registry.
  var ETF_FALLBACK = {
    url: "https://ukjflilnhigozfoxowmj.supabase.co",
    anonKey: "eyJhbGciOiJIUzI1NiIs...",   // bestaande publishable/anon key
    slug: "etf",
  };

  // tenant-registry.json wordt build-time gegenereerd uit de control plane.
  // Vorm: { "etf.besasuite.nl": {url, anonKey, slug}, "acme.besasuite.nl": {...} }
  function resolveTenant() {
    try {
      var reg = window.__BESA_TENANTS__ || {};       // ingeladen via <script src="tenant-registry.js">
      var host = window.location.hostname.toLowerCase();
      if (reg[host]) return reg[host];
      // wildcard-subdomein: <slug>.besasuite.nl
      var m = host.match(/^([a-z0-9-]+)\.besasuite\.nl$/);
      if (m && reg["*" ] && reg["*"][m[1]]) return reg["*"][m[1]];
    } catch (e) { /* val door naar fallback */ }
    return ETF_FALLBACK;                              // dual-mode safety net
  }

  var t = resolveTenant();
  var AUTH_ENABLED = true;

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.error("[besa-supabase] supabase-js niet geladen.");
    window.besaSupabase = null; /* ... bestaande no-op besaAuth ... */ return;
  }

  var client = window.supabase.createClient(t.url, t.anonKey, {
    auth: {
      persistSession: AUTH_ENABLED,
      autoRefreshToken: AUTH_ENABLED,
      detectSessionInUrl: AUTH_ENABLED,
      storageKey: "sb-besa-auth-" + t.slug,           // per-tenant sessie-isolatie in browser
    },
  });

  window.besaSupabase = client;
  window.besaTenant = { slug: t.slug, url: t.url };    // beschikbaar voor UI/branding/audit
  // ... bestaande rehydratie-guard + besaAuth helpers ongewijzigd ...
})();
```

> Belangrijk: `storageKey` wordt per-tenant (`sb-besa-auth-<slug>`) zodat twee tenants in dezelfde browser elkaars sessie niet overschrijven. De bestaande rehydratie-guard verwijst dan ook naar de tenant-specifieke key.

### 6.2 A/C-pad (bijlage): auto-inject zonder 50 bestanden te raken
Bij pooling raak je géén data-laag aan als je het serverseitig oplost:
- **Reads** worden automatisch gefilterd door tenant-RLS (de client stuurt niets extra).
- **Writes** krijgen `tenant_id` via een `BEFORE INSERT`-trigger `set_tenant_id()` (leest `get_tenant_id()`), dus de frontend hoeft `tenant_id` nooit mee te sturen. Code in bijlage A.

---

## 7. Edge-function-impact

### 7.1 In optie B: edge-functions worden tenant-aware *gratis*
`admin-user-mgmt`, `contract-sign`, `onboarding-*`, `*-push` lezen nu al `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` uit env. Die env is **per project**. Dus dezelfde functiecode, gedeployed naar tenant-project X, werkt automatisch op X's data. De enige verandering: **fan-out deploy** naar elk tenant-project (CI, §11).

Aandachtspunt — `admin-user-mgmt` checkt admin-tier via `profiles.rol='admin'` óf `bs2_role_users.slug ∈ {admin,eigenaar,directeur}`. Dat blijft per-tenant correct omdat `profiles`/`bs2_role_users` per project staan. Geen wijziging nodig in de autorisatielogica; alleen zorgen dat de template deze tabellen + de seed-rollen bevat.

### 7.2 Tenant-aware edge-function template (werkt in B én A/C)
Een dunne wrapper die tenant-context vaststelt (env in B, JWT in A/C), de caller authenticeert en service-acties binnen de tenant houdt:

```ts
// _shared/tenant.ts — tenant-context helper (B: env; A/C: JWT app_metadata)
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type TenantCtx = {
  admin: SupabaseClient;        // service-role client, tenant = dit project
  user: { id: string; email: string | null };
  tenantSlug: string;
};

export async function withTenant(req: Request): Promise<TenantCtx> {
  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(url, service);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new HttpError(401, "No Authorization header");
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) throw new HttpError(401, "Not authenticated");

  // B: tenant = dit project (env). A/C: lees app_metadata.tenant_id en assert ===.
  const { data: cfg } = await admin.from("tenant_config").select("tenant_slug").maybeSingle();
  const tenantSlug = cfg?.tenant_slug ?? Deno.env.get("TENANT_SLUG") ?? "unknown";

  // A/C-guard (no-op in B): caller-JWT-tenant moet matchen met dit project.
  const claimTenant = (user as any).app_metadata?.tenant_id;
  if (claimTenant && cfg?.tenant_slug && claimTenant !== cfg.tenant_slug) {
    throw new HttpError(403, "Tenant mismatch");
  }
  return { admin, user: { id: user.id, email: user.email ?? null }, tenantSlug };
}

export class HttpError extends Error { constructor(public status: number, msg: string){ super(msg); } }
```

```ts
// Gebruik in bv. admin-user-mgmt: vervang de handmatige auth-blok door withTenant().
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const { admin, user, tenantSlug } = await withTenant(req);
    // ... bestaande admin-tier check + action-switch, nu gegarandeerd binnen deze tenant ...
    // writeAudit() kan tenantSlug meestempelen voor control-plane-aggregatie.
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: (e as Error).message }, status);
  }
});
```

---

## 8. Rollout & dual-mode

**Ja — ETF blijft de hele tijd live en ongewijzigd.** Multi-tenant is *additief*, geen big-bang.

1. **Dual-mode frontend** (§6.1): host-resolutie mét ETF-fallback. ETF resolved naar het bestaande project; onboarding van nieuwe tenants raakt ETF niet.
2. **ETF = tenant #1** via `tenant_config` + control-plane-registratie. Geen datamigratie.
3. **Nieuwe tenants** komen op verse projecten (template + seed). Volledig parallel aan ETF.
4. **Dual-mode-periode** = zolang de registry nog niet voor alle hosts bestaat: onbekende host → ETF-fallback. Risico voor ETF ≈ 0.
5. **Kantelpunt naar C** (pooling) pas bij > ~50–100 tenants; control plane ondersteunt het al.

---

## 9. Deliverables

### 9.1 SQL — idempotente, veilige tenant-bootstrap (per tenant-DB)
```sql
-- ============================================================================
-- 00_tenant_bootstrap.sql  —  draait in ELKE tenant-DB (ook ETF). Idempotent.
-- Veilig: alleen CREATE IF NOT EXISTS / DROP POLICY IF EXISTS / upsert singleton.
-- ============================================================================

-- 1) Singleton tenant-config (branding/audit/aggregatie; NIET voor isolatie in B)
create table if not exists public.tenant_config (
  id          boolean primary key default true check (id),
  tenant_slug text not null,
  tenant_naam text not null,
  region      text,
  branding    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- Upsert de identiteit van DEZE tenant (parametriseer per deploy).
insert into public.tenant_config (id, tenant_slug, tenant_naam, region)
values (true, :'tenant_slug', :'tenant_naam', :'region')
on conflict (id) do update
  set tenant_slug = excluded.tenant_slug,
      tenant_naam = excluded.tenant_naam,
      region      = excluded.region;

-- 2) Helper
create or replace function public.current_tenant_slug()
returns text language sql stable as $$
  select tenant_slug from public.tenant_config limit 1
$$;
grant execute on function public.current_tenant_slug() to authenticated, anon;

-- 3) RLS op tenant_config zelf (lezen mag iedereen die ingelogd is; schrijven alleen admin-tier)
alter table public.tenant_config enable row level security;
drop policy if exists "auth kan tenant_config lezen" on public.tenant_config;
create policy "auth kan tenant_config lezen"
  on public.tenant_config for select to authenticated using (true);
drop policy if exists "admin kan tenant_config bewerken" on public.tenant_config;
create policy "admin kan tenant_config bewerken"
  on public.tenant_config for update to authenticated
  using (public.is_admin_tier()) with check (public.is_admin_tier());
```

> Bestaande `using(true)`-policies op de 45 domein-tabellen **blijven ongewijzigd** in B. (De RLS-rewrite naar tenant-filtering staat in **bijlage A**, alleen voor het A/C-pad.)

### 9.2 Control-plane registry (apart project)
```sql
-- ============================================================================
-- control_plane.sql  —  draait in het APARTE control-plane-project.
-- Bevat GEEN zorg-data. anon_key hier = publishable (veilig in browser).
-- ============================================================================
create table if not exists public.tenants (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  naam          text not null,
  project_ref   text unique not null,         -- bv 'ukjflilnhigozfoxowmj'
  supabase_url  text not null,
  anon_key      text not null,                -- publishable key
  hostnames     text[] not null default '{}', -- ['etf.besasuite.nl','besa-suite.vercel.app']
  region        text,
  status        text not null default 'provisioning'
                  check (status in ('provisioning','active','suspended','offboarding')),
  plan          text not null default 'pro',
  dpa_signed_at timestamptz,
  created_at    timestamptz not null default now()
);
alter table public.tenants enable row level security;  -- alleen service-role/operator leest dit
```

### 9.3 Data-laag JS-pattern
Zie §6.1 — `supabase-client.js` met `resolveTenant()` + per-tenant `storageKey`. **Alle bestaande `*-data.js`-modules blijven ongewijzigd** in optie B. (A/C-pattern met `set_tenant_id()`-trigger in bijlage A.)

### 9.4 Edge-function template
Zie §7.2 — `_shared/tenant.ts` (`withTenant`) + voorbeeldgebruik. Werkt in B én A/C.

### 9.5 Tenant-onboarding-flow (nieuw project + seed)
```
provision-tenant.mjs <slug> <naam> <region> <admin-email>
  1.  Management API  POST /v1/projects            → project_ref, db-pw, anon_key
      (vereist Supabase Personal Access Token + org_id; operator-script, geen in-app self-service in v1)
  2.  Wacht tot project ACTIVE (poll /v1/projects/{ref})
  3.  Apply template:   psql/supabase db push  ← template_schema.sql (zonder _bak_*-scratch)
  4.  Bootstrap:        00_tenant_bootstrap.sql  (-v tenant_slug=<slug> tenant_naam=<naam> region=<region>)
  5.  Seed referentie:  seed_reference.sql        (gemeenten, salarisschalen, bs2_roles/permissions,
                                                   org_roles, zorgsoorten, notification_types, ...)
  6.  Storage:          buckets client-documents + medewerker-documenten + authenticated-policies
  7.  Edge functions:   deploy alle functies + zet secrets (env) per project
  8.  pg_cron:          enable retention/notify/deadline/verloop-jobs
  9.  Eerste admin:     auth.admin.createUser(admin-email, 'Welkom123', email_confirm)
                        → profiles.rol='admin' + bs2_role_users(eigenaar)  + must_change_password
 10.  Registreer:       INSERT control_plane.tenants(...) status='active'
 11.  Frontend:         hergenereer tenant-registry.json + redeploy (of runtime-fetch)
 12.  Compliance:       DPA tekenen, PITR/daily backup aan, data-region bevestigen
```
Stappen 3–8 zijn idempotent → bij falen veilig opnieuw te draaien.

---

## 10. Stappenplan met week-schatting (fork-v1 + staged scale)

### Spoor NU — fork-ready maken (klein, niet-invasief, naast websitebouw)

| Stap | Werk | Schatting |
|---|---|---|
| **N1. Config-extractie** | Per-tenant Supabase-waarden naar `tenant-config.js` (§6.0); `supabase-client.js` leest die; `tenant-config.js` vóór de client laden in alle HTML. ETF live verifiëren (2 clean runs). | **0,5 wk** |
| **N2. Schema-template** | `pg_dump --schema-only` van ETF; **scratch/`_bak_*` strippen** (~40 tabellen) → `template_schema.sql`. Eén keer draaien op verse DB = volledig schema. | **0,5–1 wk** |
| **N3. Seed-script** | Referentie vs operationeel classificeren (§4.3); `seed_reference.sql` genereren uit ETF (gemeenten, salarisschalen, bs2_roles/permissions, org_roles, zorgsoorten, …). | **0,5–1 wk** |
| **N4. Onboarding-checklist** | Handmatige `provision-tenant`-checklist (§9.5) als runbook: nieuw project → schema → seed → buckets → edge-deploy → cron → eerste admin. | **0,5 wk** |
| | **Subtotaal (ready voor eerste echte fork)** | **≈ 2–3 wk** |

> Met N1–N4 staat een **tweede tenant in minuten/uren** i.p.v. dagen handwerk — dat is wat "snel upscalen" nu concreet mogelijk maakt, zónder de website-bouw te onderbreken.

### Spoor UPSCALE — automatiseren (pas starten wanneer fork-count pijn doet, ~10+)

| Stap | Werk | Schatting |
|---|---|---|
| **U1. Control plane** | Apart Supabase-project; `tenants`-tabel (§9.2); registry-generator. | **1 wk** |
| **U2. Gedeelde codebase i.p.v. forks** | `supabase-client.js` host-resolutie (§6.1); van N forks → één Vercel-deploy met registry. | **1–1,5 wk** |
| **U3. Provisioning-automatisering** | `provision-tenant.mjs` (Management API → schema → seed → admin → registratie). | **1,5–2 wk** |
| **U4. CI-fan-out** | Eén `migrations/`-bron → loop over alle tenant-refs (schema + edge-functions). **Lost schema-drift op.** | **1 wk** |
| **U5. Edge-functions tenant-aware** | `_shared/tenant.ts` (`withTenant`) (§7.2); deploy-fan-out. | **1 wk** |
| **U6. Hardening** | Rol-based RLS per template; per-tenant monitoring; backup/restore-drill; **offboarding** (project-delete + registry-removal). | **1–2 wk** |
| | **Subtotaal (volledige automatisering)** | **≈ 6–8 wk** |

> Ter vergelijking: optie A (shared + `tenant_id`) ≈ **16–24+ weken** met substantieel hoger risico op 20k+ live productie-rijen (backfill, RLS-rewrite van 180 policies, UUID-rekey of composite-FK's, 50+ data-lagen, storage-path-migratie). Het fork-spoor vermijdt dat volledig.

---

## 11. Operationele kanttekeningen (B's prijs)

1. **Migratie-fan-out is de hoofdkost.** Elke toekomstige schema-wijziging moet naar álle tenant-projecten. Houd één `supabase/migrations/`-bron en draai een CI-loop over `control_plane.tenants` met `supabase db push` per ref. Zonder dit krijg je schema-drift.
2. **Edge-deploy-fan-out** idem (zelfde CI-loop, `supabase functions deploy`).
3. **Cross-tenant rapportage** (ETF-overkoepelend dashboard) kan niet met één query → control-plane aggregeert (read-replica per tenant of nachtelijke export naar een analytics-project). Out-of-scope v1.
4. **Kosten**: ~$25/mnd Pro per project. Bij ~20 tenants ≈ $500/mnd baseline (doorbelastbaar). Bij groei → kantel naar C.
5. **Publishable keys** roteren onafhankelijk per project; zet ze in de registry, niet hardcoded. Overweeg de moderne `sb_publishable_...`-keys i.p.v. legacy anon-JWT.
6. **Self-service onboarding** vereist een server-side bewaarde Management-API PAT → bewust een operator-script in v1 (geen in-app knop) om die PAT niet bloot te stellen.

---

## 12. Beslissingen (vastgelegd 2026-06-08)

1. **Tenant-aantal (12 mnd):** richting **honderden** → fork-v1 om te starten, control-plane-automatisering "ready" en in te schakelen bij ~10–20 tenants (zie §0.1 fork-paradox).
2. **Auth:** **per-tenant losse login** (eigen `auth.users` per project). Geen SSO/IdP in scope.
3. **Hosting:** **fork-per-tenant** — repo kopiëren → eigen GitHub-repo → Vercel auto-deploy → hardcoded eigen Supabase-project. Geen runtime-registry/wildcard in v1; dat is het upscale-pad (§6.1).
4. **Control plane:** **apart Supabase-project**, **ontwerp ready maar nu niet bouwen** — eerst website af. Bouwen in spoor UPSCALE (§10, U1).

### Volgende concrete stap
Wanneer je zover bent (website klaar / eerste echte tweede tenant in zicht): ik genereer `template_schema.sql` (schema zonder `_bak_*`) en `seed_reference.sql` (referentiedata via live read-queries) en lever de onboarding-checklist als runbook op. Dat is spoor NU (§10, N2–N4) — niet-invasief, raakt de live website niet.

---

## Bijlage A — A/C-bouwstenen (alleen nodig bij pooling, niet voor B)

```sql
-- A.1 Tenant-registry + profiles.tenant_id (binnen het GEDEELDE project)
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null, naam text not null, created_at timestamptz default now()
);
alter table public.profiles add column if not exists tenant_id uuid references public.tenants(id);
create index if not exists profiles_tenant_idx on public.profiles(tenant_id);

-- A.2 get_tenant_id(): JWT app_metadata (door access-token-hook), fallback profiles
create or replace function public.get_tenant_id()
returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true)::jsonb
             -> 'app_metadata' ->> 'tenant_id', ''),
    (select tenant_id::text from public.profiles where id = auth.uid())
  )::uuid
$$;
grant execute on function public.get_tenant_id() to authenticated;

-- A.3 tenant_id op alle domein-tabellen + backfill naar ETF + auto-set trigger
create or replace function public.set_tenant_id() returns trigger
language plpgsql as $$
begin
  if new.tenant_id is null then new.tenant_id := public.get_tenant_id(); end if;
  return new;
end $$;

do $$
declare t text;
  tbls text[] := array[
    'clienten','beschikkingen','facturen','organisaties','planning','medewerkers',
    'incidenten','verzuim','taken','werkuren','urenregistratie','dienst_activiteiten',
    'comp_saldi','comp_berekeningen','uren_budget','urendeclaraties','kilometer_records'
    /* ... vul aan met alle 45 domein-tabellen ... */ ];
  etf uuid;
begin
  insert into public.tenants(slug,naam) values('etf','ETF')
    on conflict (slug) do nothing;
  select id into etf from public.tenants where slug='etf';
  foreach t in array tbls loop
    execute format('alter table public.%I add column if not exists tenant_id uuid references public.tenants(id)', t);
    execute format('update public.%I set tenant_id=%L where tenant_id is null', t, etf);
    execute format('create index if not exists %I on public.%I(tenant_id)', t||'_tenant_idx', t);
    execute format('drop trigger if exists trg_set_tenant on public.%I', t);
    execute format('create trigger trg_set_tenant before insert on public.%I for each row execute function public.set_tenant_id()', t);
    -- RLS: vervang using(true) door tenant-filter
    execute format('drop policy if exists "auth kan %1$s lezen" on public.%1$I', t);
    execute format('create policy "tenant kan %1$s lezen" on public.%1$I for select to authenticated using (tenant_id = public.get_tenant_id())', t);
    execute format('drop policy if exists "auth kan %1$s toevoegen" on public.%1$I', t);
    execute format('create policy "tenant kan %1$s toevoegen" on public.%1$I for insert to authenticated with check (tenant_id = public.get_tenant_id())', t);
    execute format('drop policy if exists "auth kan %1$s bewerken" on public.%1$I', t);
    execute format('create policy "tenant kan %1$s bewerken" on public.%1$I for update to authenticated using (tenant_id = public.get_tenant_id()) with check (tenant_id = public.get_tenant_id())', t);
    execute format('drop policy if exists "auth kan %1$s verwijderen" on public.%1$I', t);
    execute format('create policy "tenant kan %1$s verwijderen" on public.%1$I for delete to authenticated using (tenant_id = public.get_tenant_id())', t);
  end loop;
end $$;
```

```sql
-- A.4 Custom Access Token Hook — injecteert tenant_id in de JWT (registreren in
--      Dashboard → Authentication → Hooks → Customize Access Token).
create or replace function public.custom_access_token(event jsonb)
returns jsonb language plpgsql stable as $$
declare claims jsonb; tid uuid;
begin
  select tenant_id into tid from public.profiles where id = (event->>'user_id')::uuid;
  claims := coalesce(event->'claims','{}'::jsonb);
  if tid is not null then
    claims := jsonb_set(claims, '{app_metadata,tenant_id}', to_jsonb(tid::text), true);
  end if;
  return jsonb_set(event, '{claims}', claims);
end $$;
```

> ⚠️ Bij A: `tenant_id` hoort in **`app_metadata`** (server/admin), nooit in `user_metadata`. De `set_tenant_id()`-trigger zorgt dat de frontend `tenant_id` nooit hoeft mee te sturen (geen wijziging in 50+ data-lagen). Service-role (edge-functions) **omzeilt RLS** → in A moet elke service-query expliciet `eq('tenant_id', …)` toevoegen; de `withTenant()`-guard uit §7.2 dekt dit af.
