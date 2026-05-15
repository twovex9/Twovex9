# 🚨 USER HARDCORE-INSTRUCTIE (BINDEND, ALTIJD VAN KRACHT)

**Datum vastgelegd**: 2026-05-15
**Bron**: meerdere herhalingen door user in v3-cyclus, laatst 2026-05-15 ("alles is alles, man").

---

## DE REGEL

> **Controleer echt alles!**
>
> Elke submenu zo diep zoeken als je maar wilt.
>
> Dat is een hardcore opdracht. Heel belangrijk dat je altijd twee clean runs doet.
>
> Altijd, tijdens elke module.
>
> Zo diep zoeken als je maar wilt bij elke module via de extensie tool van Claude op Google Chrome.
>
> Als je 100% zeker bent dat alles 100% in orde is bij de huidige module — niet 99,9% maar 100%:
>
> alles getest, alles nagekeken, overal elke drop-down menu, op alles geklikt, zo diep gegaan als je maar kan.
>
> Dan mag je van mij naar de volgende stap module.

---

## WAT ALLES BETEKENT

- **Niet alleen visueel** — ook functioneel werkend in productie
- **Elke knop** — klikken, verifiëren wat gebeurt
- **Elke dropdown** — openen, elke optie checken
- **Elke modal** — openen, 3 close-ways (× / Escape / Overlay), submit-flow
- **Elke form-validatie** — verkeerd input + correct input testen
- **Elk audit-log entry** — gebeurt het écht?
- **Elke pagina** — laadt zonder errors, console = 0 BS1-errors
- **Elke data-row** — komt het uit Supabase, persisteert het, refresht het via realtime?
- **Elke permission** — admin vs non-admin scheiding daadwerkelijk afgedwongen?
- **Elke edge case** — empty state, error state, slow network, concurrent edits

---

## WERKWIJZE PER MODULE

1. **Open BS2 + BS1 side-by-side** via Chrome MCP
2. **Doorloop alle 30 items** uit universele checklist (`v3-hardcore-module-checklist.md`)
3. **Per gap → fix direct** (lokaal → commit → push → PR)
4. **Run alles 2× CLEAN RUN ZONDER fix tussendoor**
5. **User-bevestiging** vóór door naar volgende module
6. **Document in `docs/bs2-scrape/<module>/lockdown-checklist.md`** — bewijs per item

---

## WAT IK NIET MEER MAG DOEN

- ❌ "100% productie-klaar" claimen op basis van docs alleen
- ❌ "Trust the docs" zonder live verificatie
- ❌ Spot-checks i.p.v. volledige module-deep-test
- ❌ Skipped modules op basis van eerdere LOCKDOWN-status
- ❌ Aannemen dat Fase A-werk uit eerdere sessies nog correct is
- ❌ Eindrapport schrijven vóór 36/36 modules in deze cyclus ✅

---

## SUCCES-CRITERIUM PER MODULE

| Aspect | Bewijs vereist |
|---|---|
| Visueel | Screenshot BS2 + BS1 + diff |
| Functioneel | Elke knop/dropdown/modal getest live |
| Data | Records geverifieerd via Supabase MCP |
| Auth/permissions | Admin + non-admin scenario getest |
| Console | 0 BS1-errors (Chrome-extension noise OK) |
| Audit-log | Entry verschijnt bij elke mutatie |
| CLEAN RUNS | 2× zonder fix tussendoor — beide groen |

Bij 1 ❌ → fix-PR → herhaal CLEAN RUNS → pas dan ✅.

---

## STATUS PER MODULE

Zie `docs/phase4/v3-hardcore-module-checklist.md` voor de actuele voortgang per module.

| Module | Status |
|---|---|
| 1. Home | 🔄 in uitvoering (Bug #83 gevonden + gefixt) |
| 2-36 | ⬜ wachten |
