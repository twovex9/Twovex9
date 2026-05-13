# [Module-naam] — uitgaande e-mails

**Gescraped op**: YYYY-MM-DD

Doel: vaststellen of BS2 in deze module e-mails verstuurt (en zo ja: welke triggers + ontvangers + content).

**Belangrijk per user-keuze 18 (2026-05-13)**: BS1 verstuurt **geen** e-mails. Indien BS2 e-mails verstuurt, in BS1 vervangen door:
- in-app notification-bell (al bestaat)
- pop-up modal bij relevant event
- audit-log entry

## Vastgesteld via netwerk-tab + UI-flow

Per gevonden e-mail-trigger:

### E-mail 1: [Trigger-naam]

- **Trigger**: bv. "factuur ingediend door cliëntbeheerder"
- **Ontvanger(s)**: bv. "admin + financiën-rol"
- **Subject**: `...`
- **Body (samenvatting)**: `...`
- **BS1-vervanging**:
  - Notification-bell update voor admin + financiën-rol
  - Eventueel: pop-up modal bij volgende login
  - Audit-log entry

### E-mail 2: ...

## Indien GEEN e-mails gevonden

Bevestig: in deze module verstuurt BS2 **geen** e-mails. In-app notification-bell is voldoende voor BS1.

## Hoe vastgesteld

- Klik elk submit-knop / status-wijziging
- Open DevTools → Network tab → filter `mail` of `notif` of `email`
- Probeer status-overgangen die normaal e-mail triggeren (factuur ingediend, verlof aangevraagd, incident gemeld, taak deadline, etc.)
- Check ook outgoing mail-API endpoints in URL-patroon
