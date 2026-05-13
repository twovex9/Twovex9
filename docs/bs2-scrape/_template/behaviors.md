# [Module-naam] — gedrag per actie

**Gescraped op**: YYYY-MM-DD

Doel: bewijs van wat élke knop / dropdown / form-submit precies doet in BS2.
Voor élke gevonden actie: BS2-trigger → BS2-respons (modal/toast/network/audit-row).

## Actie 1: + Toevoegen

**BS2-trigger**: klik op `+ Item toevoegen` knop rechtsboven.

**BS2-respons**:
- Modal opent met titel `...`
- Form-velden:
  | Veld | Type | Verplicht | Default | Validatie |
  |---|---|---|---|---|
  | naam | text | ✅ | leeg | min 2 tekens |
  | ... | | | | |
- Submit-knop: label `Opslaan`, kleur primary
- Cancel-knop: label `Annuleren`
- Bij submit succes:
  - Network: `POST /api/...` met payload `{...}`
  - Response: `201 Created` met `{id, ...}`
  - Toast: `"Item toegevoegd"`
  - Modal sluit
  - Tabel ververst en toont nieuwe rij bovenaan
  - Audit-log entry: `created` action met velden
- Bij submit faal (validatie):
  - Inline error onder veld: `"Naam is verplicht"`
  - Modal blijft open
  - Geen network call

## Actie 2: Rij-klik (open detail)

**BS2-trigger**: klik op rij (of detail-icoon)

**BS2-respons**:
- Navigeert naar `/path/detail/<id>`
- Detail-pagina toont: ...
- Tabs op detail: ...

## Actie 3: Archief-knop (per row)

**BS2-trigger**: klik trash-icoon in acties-cel

**BS2-respons**:
- Confirm-modal: `"Archiveren?"` met preview van item-naam
- Slider/checkbox bevestiging
- Bij confirm:
  - Network: `PATCH /api/.../archive`
  - Toast: `"Gearchiveerd"`
  - Row verdwijnt uit actieve lijst, verschijnt in "Gearchiveerd"-view
  - Audit-log: `archived` action

## Actie 4: Restore (in gearchiveerde view)

**BS2-trigger**: klik `Herstel` knop op gearchiveerde row

**BS2-respons**:
- Direct (geen modal)
- Network: `PATCH /api/.../restore`
- Toast: `"Hersteld"`
- Row verdwijnt uit gearchiveerd-view, terug in actieve lijst

## Actie 5: Definitief verwijderen

**BS2-trigger**: klik trash-icoon op gearchiveerde row

**BS2-respons**:
- Slider-confirm modal: `"Definitief verwijderen?"` + preview + waarschuwing
- Bij confirm:
  - Network: `DELETE /api/.../<id>`
  - Toast: `"Verwijderd"`
  - Row volledig weg
  - Audit-log: `deleted` action

## Actie 6: Filters toepassen

(per filter: trigger → resultaat)

## Actie 7: Zoeken

(zoek-debounce-tijd, welke kolommen worden doorzocht)

## Actie 8: Kolom-sorteren

(klik op kolom-header → sort asc/desc/none toggle gedrag)

## Actie 9: Kolommen-kiezer

(welke kolommen toggle-baar, persistente opslag waar)

## Actie 10: Pagination

(prev/next werking, URL-state, scroll-positie)

## Specifieke edge-cases

- Permission-denied: welke melding bij niet-toegestaan
- Duplicate-key: welke melding
- Network-error: welke melding
- Lege response: welke lege-state
