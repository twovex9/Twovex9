# Module 01: Home — uitgaande e-mails

**Gescraped op**: 2026-05-13

## Conclusie: GEEN e-mails

Op de Home-pagina zelf zijn **geen acties** die e-mails versturen:
- Read-only nieuws-feed (alleen lezen)
- Notification-bell = in-app notification mechanism (geen e-mail)
- User-avatar dropdown = navigatie / logout (geen e-mail)
- Help-icoon = navigatie naar manual (geen e-mail)

Notificaties zijn 100% **in-app** via de bell-counter + dropdown + `/notifications` page. Geen e-mail-fallback gevonden tijdens scrape.

## Per user-keuze 18 (2026-05-13)

> "GEEN e-mails ooit. Indien BS2 e-mails verstuurt: in BS1 vervangen door in-app notification-bell (al bestaat sinds Phase 2)."

BS1-implementatie voor Home: **niets te doen voor e-mails**. Notification-bell + in-app meldingen al aanwezig.

## Hoe vastgesteld

- Bekeken: nieuws-card click flow (alleen modal, geen submit-action)
- Bekeken: notification-bell click flow (alleen client-side toggle)
- Bekeken: user-avatar dropdown (alleen navigatie)
- DevTools netwerk-tab tijdens flows: geen `mail|email|notify`-XHR met POST-body
- Geen visible "stuur per e-mail" of "share via mail" knoppen op Home

Indien in latere modules WEL e-mails worden gestuurd door BS2 (bv. taak-deadline reminders in Module 26), wordt dat per module aldaar gedocumenteerd.
