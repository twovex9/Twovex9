# Module [NN] — LOCKDOWN CHECKLIST (30 items, fysiek bewijs vereist)

**Module**: [Module-naam]
**Lockdown-status**: 🔒 LOCKED — door tot 30/30 ✅ MET BEWIJS + user-override
**Gestart**: YYYY-MM-DD
**Override gegeven**: [niet gegeven / GIVEN op YYYY-MM-DD door user]

> User-eis 2026-05-14 (bindend): *"hoe zorgen we ervoor dat dit in de toekomst nooit meer gebeurt en dat je gewoon aan het plannen gaat? Echt hard hardcore, echt gewoon dat je verbiedt tot als ik het zelf heb aangepast ergens manueel om door te gaan tot als het 100% gedaan is."*

Lockdown override-teksten (ALLEEN user):
- `LOCKDOWN OVERRIDE GO`
- `Ja, ga door zonder volledige hardcore-test`
- `User-override: doorgaan naar volgende module`

Zonder user-override-tekst mag ik NIET zeggen "100% klaar / done / af / gereed". Sitemap-status blijft 🟡 in-progress.

---

## A. BS2-scrape hardcore (10 items, fysiek op `etf.acceptance.besasuite.nl`)

- [ ] **A1**. Scroll top→bottom (lazy-load detectie) — Bewijs: screenshot-IDs `ss_*_top` + `ss_*_bottom`
- [ ] **A2**. Scroll bottom→top — Bewijs: screenshot-ID `ss_*_bottom-to-top`
- [ ] **A3**. Klik élke knop in BS2 — Bewijs: knoppen-tabel met N geklikt
- [ ] **A4**. Open élk dropdown + capture alle opties — Bewijs: dropdown-opties in `structure.md`
- [ ] **A5**. Open élke modal + test 3 close-manieren (X / Escape / overlay-click) — Bewijs: 3 screenshot-IDs per modal
- [ ] **A6**. Klik élke tab op élk panel (actief + niet-actief) — Bewijs: tab-coverage tabel
- [ ] **A7**. Klik élke link + capture URL+title — Bewijs: links-tabel in `behaviors.md`
- [ ] **A8**. Test cell/row-klik (open detail) — Bewijs: detail-modal screenshot-ID
- [ ] **A9**. Test keyboard shortcuts (Escape/Enter/Tab) — Bewijs: gedrag-doc in `behaviors.md`
- [ ] **A10**. Network-log + console-errors-check per actie — Bewijs: log-extract

## B. BS1-test hardcore (10 items, fysiek op `futureflow-app.vercel.app`)

- [ ] **B1**. Live `futureflow-app.vercel.app/<module>.html` openen via Chrome MCP — Bewijs: screenshot-ID `ss_bs1_*_open`
- [ ] **B2**. Scroll BS1 top→bottom — Bewijs: screenshot-IDs `ss_bs1_*_top` + `_bottom`
- [ ] **B3**. Scroll BS1 bottom→top — Bewijs: screenshot-ID `ss_bs1_*_bottom-to-top`
- [ ] **B4**. Klik élke knop in BS1 (NIET alleen DOM, fysiek!) — Bewijs: knoppen-tabel met N geklikt
- [ ] **B5**. Open élke modal + 3 close-manieren — Bewijs: 3 screenshot-IDs per modal
- [ ] **B6**. Klik élke filter/dropdown/toggle/radio — Bewijs: state-changes log
- [ ] **B7**. Test élke flow end-to-end (maken → opslaan → lijst → bewerken → verwijderen) — Bewijs: 5+ screenshot-IDs per flow
- [ ] **B8**. Klik élke link + sub-page — Bewijs: navigation-log
- [ ] **B9**. Console-errors check via `read_console_messages onlyErrors:true` = 0 — Bewijs: empty-result fragment
- [ ] **B10**. Visuele match BS2↔BS1 (side-by-side) — Bewijs: image-IDs naast elkaar

## C. Schema + Data + Audit (10 items, Supabase MCP)

- [ ] **C1**. `mcp__supabase__list_tables` bevestigt alle vereiste tabellen — Bewijs: SQL-result-fragment
- [ ] **C2**. `mcp__supabase__execute_sql` bevestigt alle kolommen + types — Bewijs: information_schema query-result
- [ ] **C3**. RLS-policies geverifieerd (insert/select/update/delete `to authenticated`) — Bewijs: pg_policies query-result
- [ ] **C4**. Indices geverifieerd (FK + frequent-query cols) — Bewijs: pg_indexes query-result
- [ ] **C5**. Triggers geverifieerd (audit-log + touch_updated_at) — Bewijs: pg_trigger query-result
- [ ] **C6**. Test-record aanmaken via BS1-UI → SELECT in DB toont row — Bewijs: SQL select-result
- [ ] **C7**. Test-record bewerken → audit-entry in `*_activiteiten` tabel — Bewijs: activiteiten select-result
- [ ] **C8**. Test-record verwijderen/archiveren → `archived=true` OF row weg — Bewijs: SQL count-result
- [ ] **C9**. Realtime/event-bus check (ff:* events firen bij mutatie) — Bewijs: console-log fragment
- [ ] **C10**. Parity-eindscore: ❌=0, ❓=0, 🟡≤4 (niet-blokkerend) — Bewijs: tabel-counts uit `bs1-parity.md`

---

## Lockdown-status-blok (verplicht in élke status-update)

```
🔒 LOCKDOWN STATUS Module [NN]
- A. BS2 hardcore: N/10 ✅
- B. BS1 hardcore: N/10 ✅
- C. Schema+Data+Audit: N/10 ✅
- TOTAAL: N/30
- Override status: [pending / GIVEN by user op DATUM]
```

---

## Wat NIET mag voor 30/30 + override

- ❌ "Module XX 100% klaar"
- ❌ "Parity bereikt 100%"
- ❌ "Door naar Module YY"
- ❌ Sitemap-status update naar `✅ DONE`
- ❌ Commit-message met "100%" of "klaar"
- ❌ PR-titel met "→ 100%"
- ❌ "Live verify is optioneel"

## Wat WEL mag pré-override

- ✅ "Module XX in-progress (N/30 ✅)"
- ✅ Tussenrapporten met percentages per A/B/C
- ✅ Vraag aan user: "Override geven of eerst items afwerken?"
- ✅ Doorwerken aan ❌/❓ items totdat ze ✅ zijn
