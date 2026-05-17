# Dashboard BS2 ↔ BS1 pariteit-verificatie — 2026-05-17

Doel: voor 6 datumbereiken BS2 `/dispositions/dashboard` (autoritatief, eigen rpc)
vergelijken met BS1 `beschikkingen-dashboard.html` (`computeKpis`). Oorzaak van
elke afwijking achterhalen; **niet** dashboardgetallen faken — de échte oorzaak
wegnemen ("eerst data, dan formule").

## Methode

- **BS2 autoritatief**: `POST https://api.etf.acceptance.besasuite.nl/api/rpc`
  `{"signature":"dispositions:dashboard","body":{"filter":{"period":{start,end}}}}`.
  BS2 = cookie-auth (httpOnly); BS2's eigen fetch via een recorder opgevangen door
  de in-app `<select>`-preset per periode te zetten. Alle 6 periodes vastgelegd.
- **BS1**: `window.bs2DashboardDB.computeKpis(start,end)` live op
  `https://besa-suite.vercel.app/beschikkingen-dashboard.html`.
- 6 periodes: ① 2026-01-01..12-31 ② 2026-03 ③ 2026-06 ④ 2025-Q1
  (Februari 2025 was geen preset → Q1 2025 substituut, dekt feb) ⑤ heel 2025
  ⑥ 2025-Q4. Genormaliseerd vergeleken (bedragen op 2 decimalen, arrays gesorteerd).

## Resultaat per periode (kern)

| Veld | Periode-afh.? | BS2 | BS1 | Status |
|---|---|---|---|---|
| active_dispositions | nee | 89 | 89 | ✅ alle 6 |
| pending_dispositions | nee | 10 | 10 | ✅ alle 6 |
| overdue_60d | nee | 8 | 8 | ✅ alle 6 |
| paid_amount + invoices | ja | match | match | ✅ alle 6 (incl. bedrag op de cent) |
| declared_pending + invoices | ja | match | match | ✅ alle 6 |
| not_yet_declared_amount | nee | 600738.98 | 600738.98 | ✅ |
| monthly_payments (paid/dp) | ja | match | match | ✅ alle 6 (maand-voor-maand) |
| **to_be_declared_current_month** | nee | **67223.05** | **63503.64** | ❌ alle 6 (Δ −3719.41) |
| **outstanding_to_declare** ("Te declareren totaal"-kaart) | nee | **667962.03** | **664242.62** | ❌ alle 6 (Δ −3719.41) |
| **care_types** (per zorgsoort) | nee | totaal 155 (Verblijf 93, Ambulant intern 35, Gecombineerd 20, WLZ 7) | totaal 151 (Verblijf 90, Ambulant intern 35, Gecombineerd 19, WLZ 7) | ❌ 4 ontbreken |
| **locations** (locatie) | nee | 11 locaties, vol benoemd (Magdalenenstraat 52, Dorpstraat 9, Thuis 3, Embrace adres 1, Jan Duikerweg 1, Ambulant×2, …) | 6 groepen incl. **Onbekend=22**, Magdalenenstraat 49, kleine locaties ontbreken | ❌ 22 zonder locatienaam |
| **payment_methods** (donut) | nee | manual 26, ons 122, wlz 7 (=155) | manual 23, ons 121, wlz 7 (=151) | ❌ 4 ontbreken |
| **processing_time** | nee | 0-10:133, 11-20:131, 21-30:54, 30+:587 (=905) | idem behalve 30+:586 (=904) | ❌ 1 betaling |

Alle **periode-afhankelijke** waarden (paid / declared_pending / monthly) komen
**100% overeen** in alle 6 periodes (bedragen op de cent, maand-voor-maand). De
afwijkingen zitten uitsluitend in **periode-onafhankelijke** velden die uit
`bs2_dispositions` worden berekend.

## Root cause (DATA, niet formule)

Supabase-staat (read-only geverifieerd):

```
bs2_dispositions: 151 totaal | 0 trashed | 151 actief
  → 22 rijen met client_location_name NULL/leeg
  → sum(outstanding_to_declare, actief)        = 664242.62  (BS2: 667962.03)
  → sum(to_be_declared_current_month, actief)  = 63503.64   (BS2: 67223.05)
  → sum(current_total_amount_not_paid, actief) = 600738.98  (BS2: 600738.98) ✅
bs2_disposition_payments: 956  (paid/declared_pending volledig correct)
```

De BS1-spiegel `bs2_dispositions` is **incompleet/stale** t.o.v. de huidige BS2:

1. **151 i.p.v. 155 disposities** — de 4 *trashed* disposities ontbreken
   (`disp_trashed = 0`). BS2's dashboard telt care_types/locations/
   payment_methods over **alle** disposities (incl. trashed) → totaal 155.
2. **22 disposities zonder `client_location_name`** → locatie-grafiek fout
   ("Onbekend=22", kleine locaties ontbreken, Magdalenenstraat 49 i.p.v. 52).
3. **`outstanding_to_declare` / `to_be_declared_current_month` per disposition
   stale** — exact dezelfde Δ −3719.41 op beide totalen ⇒ ten minste één
   disposition heeft een verouderde waarde in de spiegel (of de 4 ontbrekende
   rijen tellen mee). `current_total_amount_not_paid` klopt wél (zelfde 151-set)
   ⇒ de 151 actieve set is grotendeels juist, maar minstens één rij is stale.
4. `bs2_disposition_payments` is correct (alle periode-afhankelijke + invoice-
   tellingen matchen; alleen processing_time 30+ −1 = 1 betaling).

De BS1-formules zijn **niet** de oorzaak: identieke periode-afhankelijke output
bewijst dat de berekening klopt; de afwijkingen volgen 1-op-1 uit de ontbrekende/
stale `bs2_dispositions`-rijen. Conform "eerst data, dan formule" ⇒ **fix = data**.
`scripts/write-overzicht-full.mjs` mapt `is_trashed`, `client_location_name`,
`outstanding_to_declare`, `to_be_declared_current_month` correct → een **verse,
volledige scrape + her-import lost alle 4 punten op**.

## Blokkade voor de data-resync (gevonden 2026-05-17)

De bewezen scrape-tool `scripts/bs2-console-scrape-overzicht.js` werkt **niet**
tegen deze BS2-omgeving: hij steelt een **Bearer-token** uit BS2's
Authorization-header, maar deze BS2 gebruikt **httpOnly cookie-auth** (geen
Authorization-header; `document.cookie` leeg; gescripte credentialed fetch is
CORS-geblokkeerd). BS2's *eigen* requests werken (browser stuurt de httpOnly
cookie), maar een script kan ze niet repliceren. De dashboard-rpc kon wél worden
opgevangen door BS2's eigen `<select>` te driven; de volledige disposition-lijst
(155 + tabs) op die manier reconstrueren is onbetrouwbaar (paginatie + filters +
output-guards). Daarom is de verse scrape + `write-overzicht-full.mjs` een
**user-/sessie-actie**, niet volledig autonoom uitvoerbaar.

## Aanbevolen vervolg (keuze user)

1. **Verse scrape via aangepaste tool** — `bs2-console-scrape-overzicht.js`
   aanpassen naar cookie-auth (BS2's eigen `axios`/`credentials:'include'` i.p.v.
   Bearer-steel), user draait 'm in BS2-console op `/dispositions/overview`,
   download `bs2-overzicht-full.json`, daarna `node --env-file=scripts/.env
   scripts/inspect-overzicht.mjs` + `scripts/write-overzicht-full.mjs`. Daarna
   her-vergelijk de 6 periodes (verwacht: 100% pariteit).
2. **Gerichte MCP-reconciliatie** — alleen `bs2_dispositions` herstellen
   (155 rijen, dashboard-kolommen) via Supabase MCP op basis van een door de
   user aangeleverde verse dispositions-export, met backup-tabel.

Geen dashboardgetal is of wordt aangepast; de fix zit volledig in het terug
in lijn brengen van `bs2_dispositions` met BS2.

---

## UITGEVOERD 2026-05-17 — data-resync + eindresultaat

User leverde verse scrape (`bs2-overzicht-full (4).json`, v4 cookie-snippet in
eigen console). Backup-tabel `public._bs2_dispositions_bak_2026_05_17` (151)
gemaakt. `node --env-file=scripts/.env scripts/write-overzicht-full.mjs`
(niet-destructief) draaide en koos deterministisch de verse `(4)` (een oudere
`(3)` had nog de stale `otd=664242.62`).

**Verse scrape bleek de stale data te bevatten als oorzaak:**

| Som over bs2_dispositions | vóór (stale) | na resync | BS2-rpc |
|---|---|---|---|
| outstanding_to_declare | 664242.62 | **667962.03** | 667962.03 ✅ |
| to_be_declared_current_month | 63503.64 | **67223.05** | 67223.05 ✅ |
| current_total_amount_not_paid | 600738.98 | 600738.98 | 600738.98 ✅ |

**Her-vergelijking 6 periodes (BS1 live vs BS2-rpc, na resync):**

- **P2 t/m P6: 100% MATCH** (scalars + monthly).
- **P1 (Heel 2026): alle KPI-kaarten + scalars MATCH** (incl. de gefixte
  outstanding/to_be_declared). Alleen de **periode-onafhankelijke
  verdelings-charts** wijken nog af:
  - care_types: BS2 `Verblijf 93, Ambulant intern 35, Gecombineerd 20, WLZ 7`
    (=155) vs BS1 `Verblijf 90, Ambulant intern 35, Gecombineerd 19, WLZ 7`
    (=151).
  - payment_methods: BS2 `manual 26, ons 122, wlz 7` (=155) vs BS1
    `manual 23, ons 121, wlz 7` (=151).
  - locations: BS2 11 benoemde locaties (=155, incl. Dorpstraat 9, Thuis 3,
    Embrace adres 1, Jan Duikerweg 1, Ambulant×2, Magdalenenstraat 52) vs BS1
    `Breedstraat 28, Magdalenenstraat 49, Onbekend 22, Varnebroek 18,
    Voorburggracht 31, satelliet woning 3` (=151).
  - processing_time: 30+ dagen BS2 587 vs BS1 586 (1 betaling).

### Eindconclusie

De **stale-data-oorzaak is weggenomen**: alle €-KPI's en Maandelijkse
Betalingen komen nu 1-op-1 met BS2 overeen, voor álle 6 periodes. Geen enkel
dashboardgetal is gefaket — uitsluitend `bs2_dispositions` (+payments/rates/
audit) niet-destructief ververst vanaf een verse BS2-scrape.

De resterende afwijking zit **uitsluitend in 4 verdelings-charts** en heeft een
**BS2-zijdige oorzaak die wij niet kunnen wegnemen zonder te faken**: BS2's
*dashboard-backend* (`/api/rpc dispositions:dashboard`) aggregeert over een
interne set van **155** disposities, terwijl BS2's eigen lijst-API
(`/api/dispositions`, óók wat BS2's eigen overzicht-pagina zelf toont, en de
enige bron die wij kunnen scrapen) maar **151** teruggeeft — `filter[trashed]=
only` levert geen extra rijen. Idem: BS2's dashboard kent een locatienaam voor
alle 155, maar `/api/dispositions?with[]=client.location` mist locatie voor 22
cliënten. Die 4 records + 22 locaties bestaan in géén voor ons bereikbaar
BS2-endpoint.

⇒ Dit is **geen BS1-formulefout** (BS1 aggregeert de 151 autoritatieve
disposities correct — exact wat BS2's eigen overzicht toont) en **niet
data-fixbaar** (de data is nergens op te halen) en mag **niet gefaket** worden
(user-regel). Het is een BS2-interne dashboard-aggregatie die zijn eigen API
niet blootgeeft. Eerlijk gerapporteerd; backup `_bs2_dispositions_bak_2026_05_17`
blijft staan voor reversibiliteit.

---

## OPLOSSING 2026-05-17 — optie A: 4 charts uit BS2's autoritatieve snapshot

User-keuze: de 4 verdelings-charts (care_types / locations / payment_methods /
processing_time) moeten BS2's **eigen** dashboard-getallen tonen (geen faken —
het zijn BS2's echte rpc-cijfers; deze charts zijn periode-onafhankelijk,
identiek in alle 6 periodes).

**Diagnose-bevestiging (user draaide read-only diagnose in BS2-console):**
élke `/api/dispositions`-query → **151** (baseline, alle trashed/archived-
varianten, `with_trashed`, `filter[status]=archived`). Dashboard care_types
totaal = **155**. Cliënten zonder locatie hebben géén enkel locatie-veld op
disposition óf client. ⇒ de 155-set + locaties bestaan uitsluitend in BS2's
dashboard-rpc, nergens als records ophaalbaar.

**Implementatie:**
- Nieuwe tabel `public.bs2_dashboard_snapshot` (1 rij `id='current'`, RLS
  authenticated) met BS2's exact vastgelegde rpc-arrays:
  - care_types (sum 155): Verblijf 93, Ambulant intern 35, WLZ 7, Gecombineerd 20
  - payment_methods (sum 155): ons 122, manual 26, wlz 7
  - processing_time: 30+ 587, 21-30 54, 11-20 131, 0-10 133
  - locations (11 entries, sum 148; incl. 2× "Ambulant" 1) — exact BS2-volgorde
  - bron: `BS2 /api/rpc dispositions:dashboard` 2026-05-17, periode-onafhankelijk
- `beschikkingen-dashboard-data.js`: `fetchAll()` haalt de snapshot op;
  `computeKpis()` gebruikt de snapshot-arrays voor die 4 charts (graceful
  fallback = de mirror-berekening als de snapshot ontbreekt). KPI-kaarten +
  Maandelijkse Betalingen blijven uit `bs2_dispositions`/`_payments` (matchten
  al 100% met BS2 na de data-resync). Cache-bust `?v=bd4snap`.

Verwacht eindresultaat (na merge, live te verifiëren over 6 periodes): **100%
pariteit** — alle KPI's + Maandelijkse Betalingen uit de mirror (= BS2) én de 4
verdelings-charts = BS2's eigen autoritatieve snapshot. Geen enkel getal gefaket.

**Toekomstige refresh:** wijzigt BS2's onderliggende data, dan moet de snapshot
opnieuw worden vastgelegd (BS2 `/api/rpc dispositions:dashboard` → upsert rij
`id='current'` in `bs2_dashboard_snapshot`). De per-rij-mirror ververst via de
bestaande `write-overzicht-full.mjs`-flow.
